// Verify every original and passage in an explicit reviewed import manifest.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: { directory: { type: 'string' }, credentials: { type: 'string' } },
});
if (!values.directory || !values.credentials) throw new Error('Pass --directory and --credentials');
const directory = values.directory;
const { oauth_token: token } = JSON.parse(await readFile(values.credentials, 'utf8'));
const expected = JSON.parse(await readFile(`${directory}/expected-index.json`, 'utf8'));
const manifest = (await readFile(`${directory}/manifest.jsonl`, 'utf8'))
  .trim()
  .split('\n')
  .map(JSON.parse);
const preflight = JSON.parse(await readFile(`${directory}/preflight.json`, 'utf8'));
const review = JSON.parse(await readFile(`${directory}/review.json`, 'utf8'));
const account = '70f8868a0c41eedd3481da031af7d6cd';
const root = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const hash = (data, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const normalize = (text) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
async function query(batch) {
  const r = await fetch(`${root}/d1/database/b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`D1 verification HTTP ${r.status}`);
  const data = await r.json();
  if (!data.success || data.result.some((x) => !x.success))
    throw new Error('D1 verification failed');
  return data.result;
}
const reports = [];
let next = 0;
async function worker() {
  while (next < expected.length) {
    const i = next++,
      e = expected[i],
      entry = manifest[i];
    const local = await readFile(entry.textPath, 'utf8');
    const [sources, chunks, audit] = await query([
      { sql: 'SELECT * FROM sources WHERE id=?', params: [e.id] },
      {
        sql: 'SELECT id,chunkIndex,data,searchText FROM chunks WHERE documentId=? ORDER BY chunkIndex',
        params: [e.id],
      },
      {
        sql: "SELECT (SELECT count(*) FROM audit_logs WHERE documentId=? AND action='reviewed-archive-import-and-approve') AS audits,(SELECT count(*) FROM jobs WHERE documentId=? AND json_extract(data,'$.status')='COMPLETED') AS jobs",
        params: [e.id, e.id],
      },
    ]);
    const row = sources.results[0],
      source = row && JSON.parse(row.data);
    if (
      !row ||
      row.status !== 'APPROVED' ||
      source.approvalStatus !== 'APPROVED' ||
      !source.everPublished ||
      row.fileKey !== e.key ||
      source.review.textSha256 !== e.sha256
    )
      throw new Error(`Source metadata mismatch: ${e.id}`);
    for (const [key, value] of Object.entries(entry.metadata))
      if (JSON.stringify(source[key]) !== JSON.stringify(value))
        throw new Error(`Source field mismatch: ${e.id}/${key}`);
    const pieces = [];
    for (let offset = 0; offset < local.length; offset += 2160) {
      const text = local.slice(offset, offset + 2400).trim();
      if (text.length >= 30) pieces.push(text);
    }
    if (pieces.length !== e.passages || chunks.results.length !== e.passages)
      throw new Error(`Passage count mismatch: ${e.id}`);
    for (const [index, c] of chunks.results.entries()) {
      const data = JSON.parse(c.data);
      if (
        c.chunkIndex !== index ||
        data.chunkIndex !== index ||
        c.id !== data._id ||
        data.originalText !== pieces[index] ||
        c.searchText !== normalize(pieces[index])
      )
        throw new Error(`Passage content mismatch: ${e.id}/${index}`);
    }
    if (audit.results[0].audits !== 1 || audit.results[0].jobs !== 1)
      throw new Error(`Import audit/job mismatch: ${e.id}`);
    const original = await fetch(`${root}/r2/buckets/sjn-ai-beta-sources/objects/${e.key}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(180000),
    });
    if (!original.ok) throw new Error(`R2 verification HTTP ${original.status}`);
    const bytes = Buffer.from(await original.arrayBuffer());
    if (
      bytes.length !== e.bytes ||
      hash(bytes, 'md5') !== e.md5 ||
      hash(bytes.toString('utf8').replace(/\n$/, '')) !== e.sha256
    )
      throw new Error(`Original checksum mismatch: ${e.id}`);
    reports.push({
      id: e.id,
      passages: pieces.length,
      originalBytes: bytes.length,
      verified: true,
    });
    if (reports.length % 25 === 0)
      console.log(JSON.stringify({ verified: reports.length, total: expected.length }));
  }
}
await Promise.all([worker(), worker(), worker()]);
const baseline = preflight.results[2].results;
const current = await query([
  { sql: "SELECT id,status,json_extract(data,'$.review.textSha256') AS hash FROM sources" },
  { sql: 'SELECT count(*) AS count FROM chunks' },
  { sql: 'PRAGMA foreign_key_check' },
  { sql: "INSERT INTO chunk_search(chunk_search,rank) VALUES('integrity-check',1)" },
]);
const byId = new Map(current[0].results.map((r) => [r.id, r]));
for (const old of baseline) {
  const row = byId.get(old.id);
  if (!row || row.status !== old.status || row.hash !== old.hash)
    throw new Error(`Existing source changed: ${old.id}`);
}
if (current[2].results.length) throw new Error('Foreign-key integrity failure');
const excluded = review.decisions.filter((r) => r.decision === 'EXCLUDED').map((r) => r.id);
if (excluded.length) {
  const [check] = await query([
    {
      sql: `SELECT count(*) AS count FROM sources WHERE json_extract(data,'$.review.archiveId') IN (${excluded.map(() => '?').join(',')})`,
      params: excluded,
    },
  ]);
  if (check.results[0].count !== 0)
    throw new Error('Excluded archive records found in live sources');
}
const expectedPassages = reports.reduce((s, r) => s + r.passages, 0);
if (
  current[0].results.length !== baseline.length + expected.length ||
  current[1].results[0].count !== preflight.results[1].results[0].count + expectedPassages
)
  throw new Error('Unexpected corpus totals after import');
const report = {
  at: new Date().toISOString(),
  verifiedDocuments: reports.length,
  verifiedPassages: reports.reduce((s, r) => s + r.passages, 0),
  originalBytes: reports.reduce((s, r) => s + r.originalBytes, 0),
  priorSourcesPreserved: baseline.length,
  excludedRecordsAbsent: excluded.length,
  totalSources: current[0].results.length,
  totalPassages: current[1].results[0].count,
  foreignKeys: 'PASS',
  fullTextIntegrity: 'PASS',
  documents: reports,
};
await writeFile(`${directory}/verification.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, documents: undefined }));
