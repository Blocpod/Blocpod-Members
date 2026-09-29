import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import Stripe from 'stripe';
import {
  authRoutes,
  csrfMiddleware,
  sessionMiddleware,
  hashPassword,
  verifyPassword,
  resolveEntitlements,
  rateLimit,
  getUser,
  requireVerified,
  appUrl,
  demoEnabled,
} from '../server/auth';
import {
  billingRoutes,
  subscriptionAccess,
  syncCustomer,
} from '../server/billing';
import { migrate, execute, one, closeDb, transaction } from '../server/db';
import type { AppEnv } from '../server/types';
import { emailAdminRoutes } from '../server/email';

process.env.NODE_ENV = 'test';
process.env.PGLITE_PATH = 'memory://';
process.env.APP_URL = 'http://localhost:5173';
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.DEMO_MODE;
const app = new Hono<AppEnv>()
  .use('*', sessionMiddleware)
  .use('*', csrfMiddleware)
  .route('/api/auth', authRoutes)
  .route('/api/billing', billingRoutes)
  .route('/api/admin/email', emailAdminRoutes);
app.onError((error, c) =>
  c.json(
    { error: error.message },
    error instanceof HTTPException ? error.status : 500,
  ),
);
const request = (
  path: string,
  body: unknown,
  cookie?: string,
  origin = 'http://localhost:5173',
) =>
  app.request('/api' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
let cookie = '';
let userId = '';
before(async () => {
  await migrate();
  await execute(
    "INSERT INTO plans(id,name,monthly_price,entitlements) VALUES('operator','Operator',49,$1),('builder','Builder',179,$2)",
    [
      JSON.stringify({ resource_level: 1, voting: true }),
      JSON.stringify({ resource_level: 2, voting: true }),
    ],
  );
});
after(async () => {
  await closeDb();
});
test('password hashing is salted and does not accept wrong passwords', async () => {
  const hash = await hashPassword('A sufficiently long password');
  assert.equal(
    await verifyPassword('A sufficiently long password', hash),
    true,
  );
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.notEqual(hash, await hashPassword('A sufficiently long password'));
});
test('registration creates an inactive member and stores only hashed session secrets', async () => {
  const response = await request('/auth/register', {
    name: 'Test Member',
    email: 'test@example.com',
    password: 'A sufficiently long password',
    role: 'admin',
    membership_status: 'active',
  });
  assert.equal(response.status, 201);
  const { user } = await response.json();
  userId = user.id;
  assert.equal(user.role, 'member');
  assert.equal(user.membership_status, 'inactive');
  assert.equal(user.entitlements.resource_level, 0);
  const setCookie = response.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  cookie = setCookie.split(';')[0];
  const session = await one<{ token_hash: string }>(
    'SELECT token_hash FROM sessions WHERE user_id=$1',
    [userId],
  );
  assert.equal(session!.token_hash.length, 64);
  assert.notEqual(session!.token_hash, cookie.split('=')[1]);
  assert.equal(
    (
      await one<{ status: string }>(
        'SELECT status FROM email_outbox WHERE user_id=$1',
        [userId],
      )
    )?.status,
    'blocked',
  );
});
test('cross-origin mutations and unauthenticated billing are rejected', async () => {
  assert.equal(
    (await request('/auth/logout', {}, cookie, 'https://attacker.example'))
      .status,
    403,
  );
  assert.equal(
    (await request('/billing/checkout', { plan_id: 'founder' })).status,
    401,
  );
  assert.equal((await request('/auth/demo', { role: 'admin' })).status, 404);
});
test('profile edits cannot change membership or role', async () => {
  const response = await app.request('/api/auth/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:5173',
      cookie,
    },
    body: JSON.stringify({
      name: 'Updated Member',
      role: 'admin',
      plan_id: 'builder',
      onboarded: true,
    }),
  });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.name, 'Updated Member');
  assert.equal(user.role, 'member');
  assert.equal(user.plan_id, 'operator');
  assert.equal(user.onboarded, true);
});
test('verification tokens are single use, and suspension blocks existing sessions', async () => {
  const token = 'verification-token-that-is-long-enough';
  await execute(
    "INSERT INTO email_verifications(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash('sha256').update(token).digest('hex'), userId],
  );
  assert.equal((await request('/auth/verify-email', { token })).status, 200);
  assert.equal((await getUser(userId))?.email_verified, true);
  assert.equal((await request('/auth/verify-email', { token })).status, 400);
  await execute("UPDATE users SET membership_status='suspended' WHERE id=$1", [
    userId,
  ]);
  assert.equal(await getUser(userId), null);
  assert.equal(
    (await (await app.request('/api/auth/me', { headers: { cookie } })).json())
      .user,
    null,
  );
  await execute("UPDATE users SET membership_status='inactive' WHERE id=$1", [
    userId,
  ]);
});
test('reset tokens are single use and invalidate existing sessions', async () => {
  const token = 'reset-token-that-is-long-enough';
  await execute(
    "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [createHash('sha256').update(token).digest('hex'), userId],
  );
  assert.equal(
    (
      await request('/auth/reset-password', {
        token,
        password: 'A new sufficiently long password',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/auth/reset-password', {
        token,
        password: 'A new sufficiently long password',
      })
    ).status,
    400,
  );
  const me = await app.request('/api/auth/me', { headers: { cookie } });
  assert.equal((await me.json()).user, null);
  assert.equal(
    (
      await request('/auth/login', {
        email: 'test@example.com',
        password: 'A sufficiently long password',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/auth/login', {
        email: 'test@example.com',
        password: 'A new sufficiently long password',
      })
    ).status,
    200,
  );
});
test('database rate limits reject repeated attempts', async () => {
  await rateLimit('test-bucket', 1);
  await assert.rejects(() => rateLimit('test-bucket', 1), /Too many attempts/);
});
test('resend verification is authenticated and outbox content remains staff-only', async () => {
  assert.equal((await request('/auth/resend-verification', {})).status, 401);
  const login = await request('/auth/login', {
    email: 'test@example.com',
    password: 'A new sufficiently long password',
  });
  const currentCookie = login.headers.get('set-cookie')!.split(';')[0];
  await execute('UPDATE users SET email_verified=false WHERE id=$1', [userId]);
  assert.equal(
    (await request('/auth/resend-verification', {}, currentCookie)).status,
    200,
  );
  assert.equal(
    (
      await app.request('/api/admin/email', {
        headers: { cookie: currentCookie },
      })
    ).status,
    403,
  );
  await execute("UPDATE users SET role='admin' WHERE id=$1", [userId]);
  const outbox = await app.request('/api/admin/email', {
    headers: { cookie: currentCookie },
  });
  assert.equal(outbox.status, 200);
  const { emails } = await outbox.json();
  assert.ok(emails.length > 0);
  assert.equal('html' in emails[0], false);
  assert.equal('token_hash' in emails[0], false);
  const retry = await request(
    `/admin/email/${emails[0].id}/retry`,
    {},
    currentCookie,
  );
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).email.status, 'blocked');
  await execute(
    "UPDATE users SET role='member',email_verified=true WHERE id=$1",
    [userId],
  );
});
test('inactive subscriptions remove tier grants and explicit admin overrides remain supported', () => {
  assert.deepEqual(
    resolveEntitlements(
      { resource_level: 3, voting: true },
      {},
      'past_due',
      'member',
    ),
    { resource_level: 0, voting: false },
  );
  assert.equal(
    resolveEntitlements(
      { resource_level: 1 },
      { resource_level: 2 },
      'inactive',
      'member',
    ).resource_level,
    2,
  );
  process.env.STRIPE_PRICE_BUILDER_MONTHLY = 'price_builder';
  const subscription = {
    status: 'active',
    items: { data: [{ price: { id: 'price_builder' } }] },
  } as Stripe.Subscription;
  assert.deepEqual(subscriptionAccess(subscription), {
    plan_id: 'builder',
    membership_status: 'active',
  });
  assert.equal(
    subscriptionAccess({ ...subscription, status: 'canceled' })
      .membership_status,
    'canceled',
  );
  assert.equal(
    subscriptionAccess({
      ...subscription,
      items: { data: [{ price: { id: 'price_unrecognized' } }] },
    } as Stripe.Subscription).membership_status,
    'inactive',
  );
});
test('billing sync uses authoritative current subscriptions rather than stale webhook event data', async () => {
  await execute('UPDATE users SET stripe_customer_id=$2 WHERE id=$1', [
    userId,
    'cus_test',
  ]);
  let status = 'active';
  const client = {
    subscriptions: {
      list: async () => ({
        data: [
          {
            id: 'sub_current',
            status,
            created: 100,
            items: { data: [{ price: { id: 'price_builder' } }] },
          },
        ],
      }),
    },
  } as unknown as Stripe;
  await transaction((db) => syncCustomer(db, 'cus_test', client));
  assert.equal(
    (
      await one<{ membership_status: string }>(
        'SELECT membership_status FROM users WHERE id=$1',
        [userId],
      )
    )?.membership_status,
    'active',
  );
  status = 'past_due';
  await transaction((db) => syncCustomer(db, 'cus_test', client));
  assert.equal(
    (
      await one<{ membership_status: string }>(
        'SELECT membership_status FROM users WHERE id=$1',
        [userId],
      )
    )?.membership_status,
    'past_due',
  );
  await execute("UPDATE users SET membership_status='suspended' WHERE id=$1", [
    userId,
  ]);
  status = 'active';
  await transaction((db) => syncCustomer(db, 'cus_test', client));
  assert.equal(await getUser(userId), null);
  await execute("UPDATE users SET membership_status='inactive' WHERE id=$1", [
    userId,
  ]);
});
test('webhooks require signatures and persist duplicate event IDs only once', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_not_real';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  assert.equal((await request('/billing/webhook', {})).status, 400);
  const payload = JSON.stringify({
    id: 'evt_test',
    object: 'event',
    type: 'product.updated',
    data: { object: { id: 'prod_test' } },
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  for (let n = 0; n < 2; n++)
    assert.equal(
      (
        await app.request('/api/billing/webhook', {
          method: 'POST',
          headers: { 'stripe-signature': signature },
          body: payload,
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await one<{ count: number }>(
        "SELECT count(*)::int AS count FROM stripe_events WHERE id='evt_test'",
      )
    )?.count,
    1,
  );
});
test('production fails closed without PostgreSQL, a trusted origin, and email verification', async () => {
  const user = (await getUser(userId))!;
  process.env.NODE_ENV = 'production';
  delete process.env.APP_URL;
  process.env.DEMO_MODE = 'true';
  try {
    assert.equal(demoEnabled(), false);
    assert.throws(() => appUrl(), /APP_URL is required/);
    assert.throws(
      () => requireVerified({ ...user, email_verified: false }),
      /verify your email/,
    );
    await assert.rejects(() => one('SELECT 1'), /DATABASE_URL is required/);
  } finally {
    process.env.NODE_ENV = 'test';
    process.env.APP_URL = 'http://localhost:5173';
    delete process.env.DEMO_MODE;
  }
  process.env.NETLIFY = 'true';
  process.env.DEMO_MODE = 'true';
  try {
    assert.equal(demoEnabled(), false);
    assert.throws(() => appUrl(), /HTTPS origin/);
    await assert.rejects(() => one('SELECT 1'), /DATABASE_URL is required/);
  } finally {
    delete process.env.NETLIFY;
    delete process.env.DEMO_MODE;
  }
});
