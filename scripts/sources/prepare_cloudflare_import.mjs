// Emit a compressed, hash-verified batch for the authenticated Cloudflare connector.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const [offset, count] = process.argv.slice(2).map(Number);
if (!Number.isInteger(offset) || !Number.isInteger(count) || count < 1 || count > 10)
  throw new Error('Expected offset and batch size (1–10).');
const manifest = (await readFile('.local/sources/syedjawadnaqvi/indexing/manifest.jsonl', 'utf8'))
  .trim()
  .split('\n')
  .map(JSON.parse);
const batch = [];
for (const entry of manifest.slice(offset, offset + count)) {
  const text = await readFile(entry.textPath, 'utf8');
  if (
    createHash('sha256').update(text.replace(/\n$/, '')).digest('hex') !== entry.review.textSha256
  )
    throw new Error('Source integrity mismatch');
  batch.push({ metadata: entry.metadata, review: entry.review, text });
}
process.stdout.write(gzipSync(JSON.stringify(batch)).toString('base64'));
