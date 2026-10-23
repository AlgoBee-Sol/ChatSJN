// Reuse the app's pinned PDF extractor. Never execute embedded PDF JavaScript.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/worker/package.json', import.meta.url));
const { extractText, getDocumentProxy } = await import(
  pathToFileURL(require.resolve('unpdf')).href
);
const file = process.argv[2];
if (!file?.endsWith('.pdf')) throw new Error('Pass a local .pdf archive path');
const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
try {
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = text.map((value, index) => ({ page: index + 1, text: value }));
  const pagesNeedingReview = pages
    .filter(({ text }) => text.trim().length < 20 || text.includes('\uFFFD'))
    .map(({ page }) => page);
  await writeFile(
    file.replace(/\.pdf$/, '.pages.json'),
    JSON.stringify(
      {
        status: pagesNeedingReview.length ? 'NEEDS_OCR_OR_LAYOUT_REVIEW' : 'TEXT_EXTRACTED',
        reviewStatus: 'UNREVIEWED',
        totalPages,
        pagesNeedingReview,
        pages,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await pdf.loadingTask.destroy();
}
