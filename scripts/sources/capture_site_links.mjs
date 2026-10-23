// Capture links rendered by the public site's client-side header/footer.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.argv[2] || '.local/sources/syedjawadnaqvi/archive');
const sourceUrl = 'https://www.syedjawadnaqvi.com/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('a[href*="youtube.com"]').first().waitFor({ timeout: 20000 });
  const links = await page
    .locator('a[href]')
    .evaluateAll((anchors) =>
      anchors.map((anchor) => ({ url: anchor.href, title: anchor.textContent.trim() })),
    );
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, 'browser-links.json'),
    JSON.stringify({ sourceUrl, capturedAt: new Date().toISOString(), links }, null, 2) + '\n',
  );
  console.log(`Captured ${links.length} rendered public links.`);
} finally {
  await browser.close();
}
