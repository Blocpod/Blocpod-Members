import { randomUUID } from 'node:crypto';
import { execute, one, query } from './db';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireStaff, rateLimit } from './auth';
import type { AppEnv } from './types';

export async function queueEmail(input: {
  user_id?: string;
  recipient: string;
  subject: string;
  html: string;
  purpose?: string;
}) {
  const id = randomUUID();
  await execute(
    'INSERT INTO email_outbox(id,user_id,recipient,subject,html,purpose) VALUES($1,$2,$3,$4,$5,$6)',
    [
      id,
      input.user_id ?? null,
      input.recipient,
      input.subject,
      input.html,
      input.purpose ?? 'transactional',
    ],
  );
  await deliverEmail(id);
  return id;
}
export async function deliverEmail(id: string) {
  const mail = await one<{
    id: string;
    recipient: string;
    subject: string;
    html: string;
  }>(
    "UPDATE email_outbox SET status='sending',claimed_at=now(), attempts=attempts+1 WHERE id=$1 AND status IN ('pending','failed','blocked') RETURNING *",
    [id],
  );
  if (!mail) return;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    await execute(
      "UPDATE email_outbox SET status='blocked',last_error='Email transport is not configured' WHERE id=$1",
      [id],
    );
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': id,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: mail.recipient,
        subject: mail.subject,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Email provider returned ${response.status}`);
    await execute(
      "UPDATE email_outbox SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1",
      [id],
    );
  } catch (error) {
    await execute(
      "UPDATE email_outbox SET status='failed',last_error=$2 WHERE id=$1",
      [id, error instanceof Error ? error.message : 'Email delivery failed'],
    );
  }
}

const outboxFields =
  'id,recipient,subject,purpose,status,attempts,last_error,created_at,sent_at';
function emailStaff(c: Context<AppEnv>) {
  const user = requireStaff(c);
  if (!['staff', 'admin'].includes(user.role))
    throw new HTTPException(403, { message: 'Staff access required.' });
  return user;
}
export const emailAdminRoutes = new Hono<AppEnv>();
emailAdminRoutes.get('/', async (c) => {
  emailStaff(c);
  return c.json({
    emails: await query(
      `SELECT ${outboxFields} FROM email_outbox ORDER BY created_at DESC LIMIT 200`,
    ),
  });
});
emailAdminRoutes.post('/:id/retry', async (c) => {
  const user = emailStaff(c);
  await rateLimit('email-retry:' + user.id, 20, 3600);
  const mail = await one<{ status: string }>(
    'SELECT status FROM email_outbox WHERE id=$1',
    [c.req.param('id')],
  );
  if (!mail) throw new HTTPException(404, { message: 'Email not found.' });
  if (!['pending', 'blocked', 'failed'].includes(mail.status))
    throw new HTTPException(409, {
      message: 'Only pending, blocked, or failed email can be retried.',
    });
  await deliverEmail(c.req.param('id'));
  await execute(
    'INSERT INTO admin_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',
    [randomUUID(), user.id, 'email_retried', c.req.param('id')],
  );
  return c.json({
    email: await one(`SELECT ${outboxFields} FROM email_outbox WHERE id=$1`, [
      c.req.param('id'),
    ]),
  });
});
