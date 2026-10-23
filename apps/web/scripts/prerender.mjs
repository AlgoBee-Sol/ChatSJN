import { build } from 'vite';
import { config as loadEnv } from 'dotenv';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
loadEnv({ path: resolve('../../.env'), quiet: true });
await build({ build: { ssr: 'src/prerender.tsx', outDir: '.ssr', emptyOutDir: true } });
const { renderLanding } = await import(pathToFileURL(resolve('.ssr/prerender.js')).href);
let html = await readFile('dist/index.html', 'utf8');
const publicSite = process.env.PUBLIC_INDEXING === 'true';
let site;
if (publicSite) {
  if (!process.env.SITE_URL) throw new Error('SITE_URL is required for public indexing');
  site = new URL(process.env.SITE_URL);
  if (site.protocol !== 'https:') throw new Error('SITE_URL must use HTTPS');
}
html = html.replace('<div id="root"></div>', `<div id="root">${renderLanding()}</div>`);
const structured = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'SJN',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  inLanguage: ['en', 'ur'],
  description:
    'An Islamic educational assistant for Aqaid, Akhlaq and other non-Fiqh learning, with source attribution.',
};
if (site) {
  structured.url = site.origin;
  html = html
    .replace('noindex,nofollow', 'index,follow')
    .replace('</head>', `<link rel="canonical" href="${site.origin}/"/></head>`);
  await writeFile(
    'dist/robots.txt',
    `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /api/\nDisallow: /login\nDisallow: /register\nDisallow: /onboarding\nSitemap: ${site.origin}/sitemap.xml\n`,
  );
  await writeFile(
    'dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.origin}/</loc></url></urlset>`,
  );
}
html = html.replace(
  '</head>',
  `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script></head>`,
);
await writeFile('dist/index.html', html);
// Private routes get an empty shell; crawlers never receive a public-page duplicate there.
const privateHtml = html
  .replace(/<div id="root">[\s\S]*<\/div>\s*<\/body>/, '<div id="root"></div></body>')
  .replace(
    /<meta name="robots" content="[^"]*"\s*\/>/,
    '<meta name="robots" content="noindex,nofollow"/>',
  )
  .replace(/<link rel="canonical"[^>]*>/, '');
await mkdir('dist/private', { recursive: true });
await writeFile('dist/private/index.html', privateHtml);
await rm('.ssr', { recursive: true, force: true });
console.log(
  'Public landing page prerendered. Indexing: ' +
    (publicSite ? 'enabled' : 'private beta (disabled)'),
);
