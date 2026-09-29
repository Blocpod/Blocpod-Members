import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { execute, one, transaction, isProduction } from './db';
import { queueEmail } from './email';
import type { AppEnv, User, Entitlements } from './types';
export type { AppEnv, User } from './types';

function derive(password: string, salt: string, legacy = false) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      legacy ? {} : { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const demoEnabled = () =>
  !isProduction() && process.env.DEMO_MODE === 'true';
export function appUrl() {
  if (isProduction() && !process.env.APP_URL)
    throw new Error('APP_URL is required');
  const url = new URL(process.env.APP_URL || 'http://localhost:5173');
  if (
    isProduction() &&
    (url.protocol !== 'https:' || url.username || url.password)
  )
    throw new Error('APP_URL must be an HTTPS origin in production');
  return url.origin;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt);
  return `scrypt-v2:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [kind, salt, hash] = encoded.split(':');
  if (
    !['scrypt', 'scrypt-v2'].includes(kind) ||
    !salt ||
    !/^[0-9a-f]{128}$/.test(hash || '')
  )
    return false;
  return timingSafeEqual(
    await derive(password, salt, kind === 'scrypt'),
    Buffer.from(hash, 'hex'),
  );
}
export function resolveEntitlements(
  plan: Entitlements,
  overrides: Entitlements,
  status: string,
  role: string,
): Entitlements {
  if (role === 'admin' || role === 'staff')
    return {
      ...plan,
      resource_level: 4,
      room_level: 4,
      voting: true,
      submissions_monthly: 10000,
      ai_monthly: 10000,
      private_spaces: true,
      consultation: true,
      implementation: true,
      ...overrides,
    };
  const active = ['active', 'trialing'].includes(status);
  return {
    ...Object.fromEntries(
      Object.entries(plan).map(([key, value]) => [
        key,
        active ? value : typeof value === 'boolean' ? false : 0,
      ]),
    ),
    ...overrides,
  };
}
export async function getUser(id: string): Promise<User | null> {
  const row = await one<
    User & {
      plan_entitlements: Entitlements;
      entitlement_overrides: Entitlements;
    }
  >(
    'SELECT u.id,u.email,u.name,u.role,u.organization_id,u.plan_id,u.membership_status,u.onboarded,u.profile,u.email_verified,u.entitlement_overrides,p.entitlements AS plan_entitlements FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.id=$1',
    [id],
  );
  if (!row || row.membership_status === 'suspended') return null;
  const { plan_entitlements, entitlement_overrides, ...user } = row;
  const verified = !isProduction() || row.email_verified;
  return {
    ...user,
    entitlements: resolveEntitlements(
      plan_entitlements,
      verified ? entitlement_overrides : {},
      verified ? row.membership_status : 'inactive',
      verified ? row.role : 'member',
    ),
  };
}
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  const token = getCookie(c, 'bp_session');
  if (token && token.length < 200) {
    const session = await one<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',
      [hashToken(token)],
    );
    if (session) c.set('user', await getUser(session.user_id));
  }
  await next();
};
export const csrfMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
    c.req.path !== '/api/billing/webhook' &&
    c.req.path !== '/api/jobs/run'
  ) {
    if (c.req.header('origin') !== new URL(appUrl()).origin)
      throw new HTTPException(403, {
        message: 'This request must come from the application origin.',
      });
  }
  await next();
};
export function requireUser(c: Context<AppEnv>): User {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Please sign in.' });
  return user;
}
export function requireStaff(c: Context<AppEnv>): User {
  const user = requireUser(c);
  requireVerified(user);
  if (!['admin', 'staff', 'moderator'].includes(user.role))
    throw new HTTPException(403, { message: 'Staff access required.' });
  return user;
}
export function requireVerified(user: User) {
  if (isProduction() && !user.email_verified)
    throw new HTTPException(403, {
      message: 'Please verify your email address first.',
    });
}
export function requireFeature(c: Context<AppEnv>, key: string): User {
  const user = requireUser(c);
  requireVerified(user);
  if (!user.entitlements[key])
    throw new HTTPException(403, {
      message: 'Your membership does not include this feature.',
    });
  return user;
}
export async function rateLimit(key: string, limit: number, seconds = 900) {
  const row = await one<{ hits: number }>(
    `INSERT INTO rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<now()-($2*interval '1 second') THEN 1 ELSE rate_limits.hits+1 END,window_start=CASE WHEN rate_limits.window_start<now()-($2*interval '1 second') THEN now() ELSE rate_limits.window_start END RETURNING hits`,
    [key, seconds],
  );
  if (row!.hits > limit)
    throw new HTTPException(429, {
      message: 'Too many attempts. Please try again later.',
    });
}
async function establishSession(c: Context<AppEnv>, id: string) {
  const prior = getCookie(c, 'bp_session');
  if (prior)
    await execute('DELETE FROM sessions WHERE token_hash=$1', [
      hashToken(prior),
    ]);
  const token = randomBytes(32).toString('base64url');
  await execute(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')",
    [hashToken(token), id],
  );
  setCookie(c, 'bp_session', token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 1209600,
  });
}
async function parse<T>(c: Context<AppEnv>, schema: z.ZodType<T>) {
  const result = schema.safeParse(await c.req.json().catch(() => null));
  if (!result.success)
    throw new HTTPException(400, {
      message: result.error.issues[0]?.message || 'Invalid request.',
    });
  return result.data;
}
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters for your password.')
  .max(128);
async function sendVerification(userId: string, email: string) {
  const token = randomBytes(32).toString('base64url');
  await execute(
    "INSERT INTO email_verifications(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",
    [hashToken(token), userId],
  );
  const url = new URL('/verify-email', appUrl());
  url.searchParams.set('token', token);
  await queueEmail({
    user_id: userId,
    recipient: email,
    subject: 'Verify your Blocpod email',
    html: `<p>Welcome to Blocpod. <a href="${url.toString().replaceAll('&', '&amp;')}">Verify your email address</a> to activate your account. This link expires in 24 hours.</p>`,
    purpose: 'email_verification',
  });
}
export const authRoutes = new Hono<AppEnv>();
authRoutes.get('/me', (c) =>
  c.json({
    user: c.get('user'),
    demo: demoEnabled(),
    billing_configured: !!process.env.STRIPE_SECRET_KEY,
    ai_configured: !!process.env.OPENAI_API_KEY,
  }),
);
authRoutes.post('/register', async (c) => {
  const body = await parse(
    c,
    z.object({
      name: z.string().trim().min(2).max(100),
      email: emailSchema,
      password: passwordSchema,
    }),
  );
  await rateLimit('register:' + body.email, 5, 3600);
  // A shared ceiling also limits unique-email abuse without trusting spoofable forwarding headers.
  await rateLimit('register:global', 100, 3600);
  const password = await hashPassword(body.password);
  const id = randomUUID();
  try {
    await execute(
      'INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',
      [id, body.email, body.name, password],
    );
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw new HTTPException(409, {
        message:
          'Unable to create this account. Try signing in or resetting your password.',
      });
    throw error;
  }
  await establishSession(c, id);
  await sendVerification(id, body.email);
  return c.json({ user: await getUser(id) }, 201);
});
authRoutes.post('/login', async (c) => {
  const body = await parse(
    c,
    z.object({ email: emailSchema, password: z.string().min(1).max(128) }),
  );
  await rateLimit('login:' + body.email, 10);
  await rateLimit('login:global', 300);
  const row = await one<{ id: string; password_hash: string }>(
    'SELECT id,password_hash FROM users WHERE email=$1',
    [body.email],
  );
  const encoded =
    row?.password_hash ||
    'scrypt-v2:00000000000000000000000000000000:' + '00'.repeat(64);
  if (!(await verifyPassword(body.password, encoded)) || !row)
    throw new HTTPException(401, {
      message: 'Email or password is incorrect.',
    });
  if (!(await getUser(row.id)))
    throw new HTTPException(403, {
      message: 'This account is suspended. Contact Blocpod for assistance.',
    });
  if (encoded.startsWith('scrypt:'))
    await execute(
      'UPDATE users SET password_hash=$3 WHERE id=$1 AND password_hash=$2',
      [row.id, encoded, await hashPassword(body.password)],
    );
  await establishSession(c, row.id);
  return c.json({ user: await getUser(row.id) });
});
authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, 'bp_session');
  if (token)
    await execute('DELETE FROM sessions WHERE token_hash=$1', [
      hashToken(token),
    ]);
  deleteCookie(c, 'bp_session', { path: '/' });
  return c.json({ ok: true });
});
authRoutes.post('/verify-email', async (c) => {
  const { token } = await parse(
    c,
    z.object({ token: z.string().min(20).max(200) }),
  );
  await rateLimit('verify:' + hashToken(token), 5);
  await transaction(async (db) => {
    const row = await db.one<{ user_id: string }>(
      'DELETE FROM email_verifications WHERE token_hash=$1 AND expires_at>now() RETURNING user_id',
      [hashToken(token)],
    );
    if (!row)
      throw new HTTPException(400, {
        message: 'This verification link is invalid or expired.',
      });
    await db.execute('UPDATE users SET email_verified=true WHERE id=$1', [
      row.user_id,
    ]);
    await db.execute('DELETE FROM email_verifications WHERE user_id=$1', [
      row.user_id,
    ]);
  });
  return c.json({ ok: true });
});
authRoutes.post('/resend-verification', async (c) => {
  const user = requireUser(c);
  if (user.email_verified) return c.json({ ok: true });
  await rateLimit('verification-email:' + user.id, 3, 3600);
  await sendVerification(user.id, user.email);
  return c.json({ message: 'Verification email queued.' });
});
authRoutes.post('/forgot-password', async (c) => {
  const { email } = await parse(c, z.object({ email: emailSchema }));
  await rateLimit('reset:' + email, 3, 3600);
  await rateLimit('reset:global', 100, 3600);
  const user = await one<{ id: string }>(
    'SELECT id FROM users WHERE email=$1',
    [email],
  );
  if (user) {
    const token = randomBytes(32).toString('base64url');
    await execute(
      "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [hashToken(token), user.id],
    );
    const url = new URL('/reset-password', appUrl());
    url.searchParams.set('token', token);
    await queueEmail({
      user_id: user.id,
      recipient: email,
      subject: 'Reset your Blocpod password',
      html: `<p><a href="${url.toString().replaceAll('&', '&amp;')}">Reset your password</a>. This link expires in one hour. If you did not request it, ignore this message.</p>`,
      purpose: 'password_reset',
    });
  }
  return c.json({
    message: 'If the account exists, a password reset email has been queued.',
  });
});
authRoutes.post('/reset-password', async (c) => {
  const { token, password } = await parse(
    c,
    z.object({ token: z.string().min(20).max(200), password: passwordSchema }),
  );
  await rateLimit('reset-token:' + hashToken(token), 5);
  const encoded = await hashPassword(password);
  await transaction(async (db) => {
    const reset = await db.one<{ user_id: string }>(
      'UPDATE password_resets SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id',
      [hashToken(token)],
    );
    if (!reset)
      throw new HTTPException(400, {
        message: 'This reset link is invalid or expired.',
      });
    await db.execute('UPDATE users SET password_hash=$1 WHERE id=$2', [
      encoded,
      reset.user_id,
    ]);
    await db.execute('DELETE FROM sessions WHERE user_id=$1', [reset.user_id]);
    await db.execute('DELETE FROM password_resets WHERE user_id=$1', [
      reset.user_id,
    ]);
  });
  deleteCookie(c, 'bp_session', { path: '/' });
  return c.json({ ok: true });
});
authRoutes.patch('/profile', async (c) => {
  const user = requireUser(c);
  const body = await parse(
    c,
    z.object({
      name: z.string().trim().min(2).max(100).optional(),
      onboarded: z.boolean().optional(),
      profile: z.record(z.string(), z.unknown()).optional(),
    }),
  );
  if (body.profile && JSON.stringify(body.profile).length > 10000)
    throw new HTTPException(400, { message: 'Profile is too large.' });
  await execute(
    'UPDATE users SET name=COALESCE($2,name),profile=COALESCE($3::jsonb,profile),onboarded=COALESCE($4,onboarded) WHERE id=$1',
    [
      user.id,
      body.name ?? null,
      body.profile ? JSON.stringify(body.profile) : null,
      body.onboarded ?? null,
    ],
  );
  return c.json({ user: await getUser(user.id) });
});
authRoutes.post('/demo', async (c) => {
  if (!demoEnabled()) throw new HTTPException(404, { message: 'Not found.' });
  const { role } = await parse(
    c,
    z.object({ role: z.enum(['member', 'admin']) }),
  );
  const user = await one<{ id: string }>(
    'SELECT id FROM users WHERE email=$1',
    [`demo-${role}@blocpod.local`],
  );
  if (!user)
    throw new HTTPException(503, {
      message: 'Run the local seed command to create demo accounts.',
    });
  await establishSession(c, user.id);
  return c.json({ user: await getUser(user.id) });
});
