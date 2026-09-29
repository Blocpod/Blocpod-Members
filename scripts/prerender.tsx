import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import Public from '../src/pages/Public';
import { Policy } from '../src/pages/Utility';
const template = await readFile('dist/index.html', 'utf8');
if (
  (process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true') &&
  !process.env.APP_URL
)
  throw new Error(
    'APP_URL must be configured for production canonical URLs and sitemap.',
  );
const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:5173').origin;
for (const path of ['/', '/pricing', '/privacy', '/terms']) {
  const content = renderToString(
    <StaticRouter location={path}>
      {path === '/privacy' || path === '/terms' ? (
        <Policy kind={path.slice(1) as 'privacy' | 'terms'} />
      ) : (
        <Public />
      )}
    </StaticRouter>,
  );
  const seo = `<link rel="canonical" href="${new URL(path, origin).href}"/><meta property="og:title" content="Blocpod — Build the system. Own the leverage."/><meta property="og:description" content="Intelligence, agents, systems, and people to turn your next ambition into action."/><meta property="og:type" content="website"/><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Blocpod Operating Network', url: origin, description: 'Intelligence, agents, systems, and an operating network for founders, builders, and operators.' }).replaceAll('<', '\\u003c')}</script>`;
  const html = template
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`)
    .replace('</head>', `${seo}</head>`);
  if (path !== '/') await mkdir(`dist${path}`, { recursive: true });
  await writeFile(
    path === '/' ? 'dist/index.html' : `dist${path}/index.html`,
    html,
  );
}
await writeFile(
  'dist/robots.txt',
  `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api\nDisallow: /reset-password\nSitemap: ${origin}/sitemap.xml\n`,
);
await writeFile(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/pricing'].map((p) => `<url><loc>${new URL(p, origin).href}</loc></url>`).join('')}</urlset>`,
);
console.log('Prerendered public pages, sitemap, robots and structured data.');
