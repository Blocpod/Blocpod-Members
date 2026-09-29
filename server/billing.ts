import Stripe from 'stripe';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import { one, query, transaction, type Database } from './db';
import { appUrl, requireUser, requireVerified, rateLimit } from './auth';
import type { AppEnv } from './types';

const PLAN_IDS = ['operator', 'builder', 'founder'] as const;
const integrationIdentifier =
  'blocpod_' +
  Array.from(randomBytes(8), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join('');
export const billingConfigured = () => !!process.env.STRIPE_SECRET_KEY;
function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new HTTPException(503, {
      message: 'Billing is not configured yet. Please contact Blocpod.',
    });
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 10000,
    maxNetworkRetries: 1,
  });
}
export function priceMap() {
  return Object.fromEntries(
    PLAN_IDS.flatMap((plan) =>
      ['monthly', 'annual'].map((interval) => [
        `${plan}:${interval}`,
        process.env[
          `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`
        ],
      ]),
    ),
  );
}
export function subscriptionAccess(
  subscription: Pick<Stripe.Subscription, 'status' | 'items'> | null,
) {
  const price = subscription?.items.data[0]?.price.id;
  const match = Object.entries(priceMap()).find(([, id]) => id && id === price);
  const plan_id = match?.[0].split(':')[0] ?? null;
  return {
    plan_id,
    membership_status: !subscription
      ? 'inactive'
      : !plan_id
        ? 'inactive'
        : subscription.status,
  };
}
export async function syncCustomer(
  db: Database,
  customer: string,
  client: Stripe,
) {
  // Serialize authoritative reads per account so older webhook deliveries cannot win a race.
  const user = await db.one<{ id: string }>(
    'SELECT id FROM users WHERE stripe_customer_id=$1 FOR UPDATE',
    [customer],
  );
  if (!user) return;
  const subscriptions = await client.subscriptions.list({
    customer,
    status: 'all',
    limit: 100,
  });
  const relevant = subscriptions.data.filter((sub) =>
    sub.items.data.some((item) =>
      Object.values(priceMap()).includes(item.price.id),
    ),
  );
  relevant.sort(
    (a, b) =>
      Number(['active', 'trialing'].includes(b.status)) -
        Number(['active', 'trialing'].includes(a.status)) ||
      b.created - a.created,
  );
  const subscription = relevant[0] ?? null;
  const state = subscriptionAccess(subscription);
  await db.execute(
    "UPDATE users SET plan_id=COALESCE($2,plan_id),membership_status=CASE WHEN membership_status='suspended' THEN membership_status ELSE $3 END,stripe_subscription_id=$4 WHERE id=$1",
    [user.id, state.plan_id, state.membership_status, subscription?.id ?? null],
  );
}
export const billingRoutes = new Hono<AppEnv>();
billingRoutes.get('/plans', async (c) =>
  c.json({
    plans: await query(
      'SELECT * FROM plans WHERE active=true ORDER BY monthly_price NULLS LAST',
    ),
  }),
);
billingRoutes.get('/status', async (c) => {
  const user = requireUser(c);
  const account = await one<{
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  }>(
    'SELECT stripe_customer_id,stripe_subscription_id FROM users WHERE id=$1',
    [user.id],
  );
  return c.json({
    plan_id: user.plan_id,
    membership_status: user.membership_status,
    entitlements: user.entitlements,
    billing_configured: billingConfigured(),
    has_customer: !!account?.stripe_customer_id,
    subscription_id: account?.stripe_subscription_id ?? null,
  });
});
billingRoutes.post('/checkout', async (c) => {
  const user = requireUser(c);
  requireVerified(user);
  await rateLimit('checkout:' + user.id, 10, 3600);
  const parsed = z
    .object({
      plan_id: z.enum(PLAN_IDS),
      interval: z.enum(['monthly', 'annual']).default('monthly'),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw new HTTPException(400, {
      message: 'Choose a valid plan and billing interval.',
    });
  const { plan_id, interval } = parsed.data;
  const plan = await one<{ monthly_price: number; annual_price: number }>(
    'SELECT monthly_price,annual_price FROM plans WHERE id=$1 AND active=true',
    [plan_id],
  );
  if (!plan)
    throw new HTTPException(400, { message: 'This plan is unavailable.' });
  const price = priceMap()[`${plan_id}:${interval}`];
  if (!price)
    throw new HTTPException(503, {
      message: 'Checkout for this plan is not configured yet.',
    });
  const client = stripeClient();
  const configuredPrice = await client.prices.retrieve(price);
  const amount =
    (interval === 'monthly' ? plan.monthly_price : plan.annual_price) * 100;
  if (
    !configuredPrice.active ||
    configuredPrice.currency !== 'usd' ||
    configuredPrice.unit_amount !== amount ||
    configuredPrice.recurring?.interval !==
      (interval === 'monthly' ? 'month' : 'year') ||
    configuredPrice.recurring.interval_count !== 1
  )
    throw new HTTPException(503, {
      message:
        'The billing price does not match this membership. Please contact Blocpod.',
    });
  const url = await transaction(async (db) => {
    const account = await db.one<{
      stripe_customer_id: string | null;
      membership_status: string;
    }>(
      'SELECT stripe_customer_id,membership_status FROM users WHERE id=$1 FOR UPDATE',
      [user.id],
    );
    if (
      ['active', 'trialing', 'past_due'].includes(account!.membership_status) &&
      account!.stripe_customer_id
    )
      throw new HTTPException(409, {
        message: 'Manage your existing membership in the billing portal.',
      });
    let customer = account!.stripe_customer_id;
    if (!customer) {
      customer = (
        await client.customers.create(
          {
            email: user.email,
            name: user.name,
            metadata: { user_id: user.id },
          },
          { idempotencyKey: `customer-${user.id}` },
        )
      ).id;
      await db.execute('UPDATE users SET stripe_customer_id=$2 WHERE id=$1', [
        user.id,
        customer,
      ]);
    }
    const current = await client.subscriptions.list({
      customer,
      status: 'all',
      limit: 100,
    });
    if (
      current.data.some((sub) =>
        ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(
          sub.status,
        ),
      )
    )
      throw new HTTPException(409, {
        message: 'Manage your existing membership in the billing portal.',
      });
    const pending = await client.checkout.sessions.list({
      customer,
      status: 'open',
      limit: 100,
    });
    for (const session of pending.data) {
      if (session.mode !== 'subscription') continue;
      if (
        session.metadata?.plan_id === plan_id &&
        session.metadata?.interval === interval
      )
        return session.url;
      await client.checkout.sessions.expire(session.id);
    }
    const session = await client.checkout.sessions.create(
      {
        mode: 'subscription',
        customer,
        line_items: [{ price, quantity: 1 }],
        client_reference_id: user.id,
        metadata: { plan_id, interval },
        subscription_data: { metadata: { user_id: user.id } },
        integration_identifier: integrationIdentifier,
        success_url: `${appUrl()}/app/account?checkout=complete`,
        cancel_url: `${appUrl()}/app/account?checkout=canceled`,
        allow_promotion_codes: true,
      },
      { idempotencyKey: `checkout-${user.id}-${randomUUID()}` },
    );
    return session.url;
  });
  return c.json({ url });
});
billingRoutes.post('/portal', async (c) => {
  const user = requireUser(c);
  await rateLimit('portal:' + user.id, 15, 3600);
  const account = await one<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id=$1',
    [user.id],
  );
  if (!account?.stripe_customer_id)
    throw new HTTPException(400, { message: 'No billing account exists yet.' });
  const session = await stripeClient().billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: `${appUrl()}/app/account`,
  });
  return c.json({ url: session.url });
});
billingRoutes.post('/webhook', async (c) => {
  const client = stripeClient();
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    throw new HTTPException(503, {
      message: 'Webhook verification is not configured.',
    });
  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(
      await c.req.text(),
      c.req.header('stripe-signature') || '',
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new HTTPException(400, { message: 'Invalid webhook signature.' });
  }
  await transaction(async (db) => {
    const inserted = await db.one(
      'INSERT INTO stripe_events(id,type) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id',
      [event.id, event.type],
    );
    if (!inserted) return;
    if (
      !event.type.startsWith('customer.subscription.') &&
      ![
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'invoice.paid',
        'invoice.payment_failed',
      ].includes(event.type)
    )
      return;
    const object = event.data.object as {
      customer?: string | { id: string } | null;
    };
    const customer =
      typeof object.customer === 'string'
        ? object.customer
        : object.customer?.id;
    if (customer) await syncCustomer(db, customer, client);
  });
  return c.json({ received: true });
});
