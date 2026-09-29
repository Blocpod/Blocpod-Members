import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { authRoutes, sessionMiddleware, csrfMiddleware } from './auth';
import { billingRoutes } from './billing';
import { featureRoutes } from './features';
import { emailAdminRoutes } from './email';
import type { AppEnv } from './types';
import { one } from './db';
export const app = new Hono<AppEnv>();
app.use('*', secureHeaders());
app.use(
  '*',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: 'Request exceeds the 1 MB limit.' }, 413),
  }),
);
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  await next();
});
app.use('/api/*', sessionMiddleware);
app.use('/api/*', csrfMiddleware);
app.get('/api/health', async (c) => {
  try {
    await one('SELECT name FROM schema_migrations LIMIT 1');
    return c.json({ status: 'ok', database: 'ready' });
  } catch {
    return c.json({ status: 'unavailable', database: 'not_ready' }, 503);
  }
});
app.route('/api/auth', authRoutes);
app.route('/api/billing', billingRoutes);
app.route('/api/admin/email', emailAdminRoutes);
app.route('/api', featureRoutes);
app.notFound((c) => c.json({ error: 'This endpoint does not exist.' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status);
  const id = crypto.randomUUID();
  console.error(
    JSON.stringify({
      event: 'request_failed',
      id,
      path: c.req.path,
      error: error.message,
    }),
  );
  return c.json(
    { error: `Something went wrong. Please try again. Reference: ${id}` },
    500,
  );
});
