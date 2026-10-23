import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const directory = '.local/sources/syedjawadnaqvi/indexing';
const manifest = (await readFile(`${directory}/manifest.jsonl`, 'utf8'))
  .trim()
  .split('\n')
  .map(JSON.parse);
const expected = [];
for (const entry of manifest) {
  const bytes = await readFile(entry.textPath),
    text = bytes.toString('utf8');
  const hash = createHash('sha256')
    .update(`sjn-archive:${entry.review.archiveId}:${entry.review.textSha256}`)
    .digest('hex');
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  let passages = 0;
  for (let offset = 0; offset < text.length; offset += 2160)
    if (text.slice(offset, offset + 2400).trim().length >= 30) passages++;
  expected.push({
    id,
    passages,
    key: `sources/${id}/archive-${entry.review.textSha256}.txt`,
    bytes: bytes.length,
    md5: createHash('md5').update(bytes).digest('hex'),
    sha256: entry.review.textSha256,
  });
}
await writeFile(`${directory}/expected-index.json`, JSON.stringify(expected));
process.stdout.write(gzipSync(JSON.stringify(expected)).toString('base64'));
