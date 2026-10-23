import { mkdir, copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

// Inputs are generated exclusively by tests/e2e/server.ts's disposable fixture database.
// Never capture personal accounts or the normal development database for public docs.
const names = [
  'landing-desktop',
  'chat-desktop',
  'chat-mobile',
  'admin-desktop',
  'register-desktop',
  'urdu-mobile',
];
for (const name of names) {
  try {
    await access(resolve(`.local/screenshots/${name}.png`));
  } catch {
    throw new Error(
      `Missing ${name}.png. Run pnpm test:e2e first to create synthetic product screenshots.`,
    );
  }
}
await mkdir('docs/images', { recursive: true });
for (const name of names)
  await copyFile(`.local/screenshots/${name}.png`, `docs/images/${name}.png`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(resolve('docs/mockups/showcase.html')).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  await page.screenshot({ path: 'docs/images/product-showcase.png' });
  console.log(
    'Created docs/images/product-showcase.png and six curated screenshots from synthetic test data.',
  );
} finally {
  await browser.close();
}
