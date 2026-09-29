import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { serve } from '@hono/node-server';
if (existsSync('.env')) process.loadEnvFile('.env');
const uiPort = Number(process.env.VITE_PORT || 5173);
const apiPort = Number(process.env.PORT || 3001);
process.env.APP_URL ||= `http://127.0.0.1:${uiPort}`;
process.env.DEMO_MODE ||= 'true';
const { migrate } = await import('../server/db');
const { seed } = await import('./seed');
await migrate();
await seed();
const { app } = await import('../server/app');
serve({ fetch: app.fetch, port: apiPort, hostname: '127.0.0.1' });
const vite = await createServer({
  server: {
    port: uiPort,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
await vite.listen();
vite.printUrls();
const { runDueJobs } = await import('../server/jobs');
let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await runDueJobs();
  } catch (e) {
    console.error('Local scheduled work failed:', (e as Error).message);
  } finally {
    ticking = false;
  }
}, 60000).unref();
console.log(
  'Blocpod ready. Demo access is local-only. Sign in at /login to explore member and admin views.',
);
