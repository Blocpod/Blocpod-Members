import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.PGLITE_PATH = 'memory://';
process.env.PORT = '0';
process.env.DEMO_MODE = 'false';
process.env.DATABASE_URL = '';
const { migrate, closeDb } = await import('../server/db');
const { seedCore } = await import('./seed');
await migrate();
await seedCore();
const { server } = await import('../server/local');
if (!server.listening)
  await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
try {
  const html = await (await fetch(origin)).text();
  assert.match(html, /Build the system/);
  assert.match(html, /application\/ld\+json/);
  const script = html.match(/src="(\/assets\/[^\"]+\.js)"/);
  assert(script);
  assert.equal((await fetch(origin + script[1])).status, 200);
  assert.equal((await fetch(origin + '/api/health')).status, 200);
  assert.equal((await fetch(origin + '/api/resources')).status, 401);
  const missing = await fetch(origin + '/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type') || '', /application\/json/);
  assert.equal((await fetch(origin + '/app/library')).status, 200);
  assert.match(
    await (await fetch(origin + '/robots.txt')).text(),
    /Disallow: \/app/,
  );
  console.log(
    'Built application verified: public HTML, assets, readiness, authenticated API gates, JSON 404s, SPA routes, and robots.',
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await closeDb();
}
