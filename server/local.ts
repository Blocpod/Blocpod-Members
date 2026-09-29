import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
app.use('/api/*', async (c) =>
  c.json({ error: 'This endpoint does not exist.' }, 404),
);
app.use('/*', serveStatic({ root: './dist' }));
app.get('/*', serveStatic({ path: './dist/index.html' }));
export const server = serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT || 3001),
    hostname: process.env.HOST || '127.0.0.1',
  },
  (info) => console.log(`Blocpod API ready at http://127.0.0.1:${info.port}`),
);
