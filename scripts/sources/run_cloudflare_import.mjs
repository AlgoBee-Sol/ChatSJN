// Local bulk runner for the same importer used by the Cloudflare connector.
// Supply an existing cf OAuth profile explicitly; credentials are never logged.
import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import importReviewedBatch from './cloudflare-import.mjs';

const { values } = parseArgs({
  options: {
    directory: { type: 'string' },
    credentials: { type: 'string' },
    offset: { type: 'string', default: '0' },
    limit: { type: 'string', default: '10000' },
    apply: { type: 'boolean', default: false },
  },
});
if (!values.directory || !values.credentials) throw new Error('Pass --directory and --credentials');
const offset = Number(values.offset),
  limit = Number(values.limit);
if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1)
  throw new Error('Invalid offset or limit');
const directory = values.directory;
const manifest = (await readFile(`${directory}/manifest.jsonl`, 'utf8'))
  .trim()
  .split('\n')
  .map(JSON.parse);
const selected = manifest.slice(offset, offset + limit);
if (!selected.length) throw new Error('No manifest entries selected');
const entries = [];
for (const entry of selected) {
  const text = await readFile(entry.textPath, 'utf8');
  if (
    createHash('sha256').update(text.replace(/\n$/, '')).digest('hex') !== entry.review.textSha256
  )
    throw new Error('Source integrity mismatch');
  entries.push({ text, metadata: entry.metadata, review: entry.review });
}
if (!values.apply) {
  console.log(JSON.stringify({ dryRun: true, documents: entries.length, offset }));
} else {
  const credentials = JSON.parse(await readFile(values.credentials, 'utf8'));
  if (typeof credentials.oauth_token !== 'string') throw new Error('Missing cf OAuth token');
  const account = '70f8868a0c41eedd3481da031af7d6cd';
  const db = `/accounts/${account}/d1/database/b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1/query`;
  const r2 = `/accounts/${account}/r2/buckets/sjn-ai-beta-sources/objects/sources/`;
  const cloudflare = {
    async request(options) {
      if (!(
        (options.path === db && options.method === 'POST') ||
        (options.path.startsWith(r2) && ['PUT', 'GET'].includes(options.method))
      ))
        throw new Error('Unexpected target outside source-import scope');
      const contentType = options.contentType || 'application/json';
      const response = await fetch('https://api.cloudflare.com/client/v4' + options.path, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${credentials.oauth_token}`,
          'Content-Type': contentType,
        },
        ...(options.body === undefined
          ? {}
          : {
              body: contentType.startsWith('application/json')
                ? JSON.stringify(options.body)
                : options.body,
            }),
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok)
        throw new Error(`Cloudflare ${options.method} failed: HTTP ${response.status}`);
      const data = await response.json();
      if (!data.success)
        throw new Error(
          `Cloudflare request failed: ${(data.errors || []).map((e) => e.code).join(',')}`,
        );
      if (options.method === 'PUT') {
        const expected = createHash('md5').update(options.body).digest('hex');
        if (String(data.result.etag).replaceAll('"', '') !== expected)
          throw new Error('Uploaded original checksum mismatch');
      }
      return data;
    },
  };
  // Read-only authentication and target check precedes every import run.
  await cloudflare.request({
    method: 'POST',
    path: db,
    body: { sql: 'SELECT count(*) AS count FROM sources' },
  });
  const results = [];
  for (let i = 0; i < entries.length; i += 5) {
    const encoded = gzipSync(JSON.stringify(entries.slice(i, i + 5))).toString('base64');
    const result = await importReviewedBatch(cloudflare, account, encoded);
    const checkpoint = { offset: offset + i, at: new Date().toISOString(), ...result };
    await appendFile(`${directory}/checkpoint.jsonl`, JSON.stringify(checkpoint) + '\n');
    results.push(checkpoint);
    console.log(
      JSON.stringify({
        offset: offset + i,
        imported: result.imported,
        skipped: result.skipped,
        passages: result.passages,
      }),
    );
  }
  await writeFile(
    `${directory}/import-${offset}-${entries.length}.json`,
    JSON.stringify(results, null, 2) + '\n',
  );
}
