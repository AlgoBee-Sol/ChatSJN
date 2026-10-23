// Uses the existing administrator API. Secrets and checkpoints remain under ignored .local/.
import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const directory = resolve('.local/sources/syedjawadnaqvi/indexing');
const credentials = JSON.parse(await readFile('.local/cloudflare/admin-credentials.json', 'utf8'));
const origin = new URL(credentials.url).origin;
if (origin !== 'https://sjn-ai-beta.algobee-solutions.workers.dev')
  throw new Error('Review target origin before importing into another deployment.');
const manifest = (await readFile(`${directory}/manifest.jsonl`, 'utf8'))
  .trim()
  .split('\n')
  .map(JSON.parse);
let cookie = '';
async function request(path, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    signal: AbortSignal.timeout(180_000),
    headers: {
      Origin: origin,
      'X-SJN-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${data.error?.code ?? 'request failed'}`);
  return { response, data };
}
const login = await request('/api/auth/sign-in/email', 'POST', {
  email: credentials.email,
  password: credentials.password,
});
cookie = login.response.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
if (!cookie) throw new Error('No administrator session');
const existing = new Map();
for (let page = 1; ; page++) {
  const { data } = await request(`/api/admin/sources?page=${page}&limit=50`);
  for (const source of data.items)
    if (source.review)
      existing.set(`${source.review.archiveId}:${source.review.textSha256}`, source);
  if (page * 50 >= data.total) break;
}
await mkdir(directory, { recursive: true });
let next = 0,
  completed = 0;
const failures = [];
async function importOne(entry) {
  const bytes = await readFile(entry.textPath);
  if (
    createHash('sha256').update(bytes.toString('utf8').replace(/\n$/, '')).digest('hex') !==
    entry.review.textSha256
  )
    throw new Error('Archive hash mismatch');
  let source = existing.get(`${entry.archiveId}:${entry.review.textSha256}`);
  if (!source) {
    const form = new FormData();
    form.set('file', new File([bytes], `${entry.archiveId}.txt`, { type: 'text/plain' }));
    form.set('metadata', JSON.stringify(entry.metadata));
    form.set('review', JSON.stringify(entry.review));
    source = (await request('/api/admin/sources', 'POST', form)).data.source;
  }
  // Never override an operator's explicit rejection. PROCESSING may be a prior in-flight request.
  if (source.approvalStatus === 'PROCESSING') {
    await delay(3000);
    source = (await request(`/api/admin/sources/${source._id}`)).data.source;
  }
  if (source.approvalStatus === 'FAILED')
    source = (
      await request(`/api/admin/sources/${source._id}/action`, 'POST', { action: 'reprocess' })
    ).data.source;
  if (source.approvalStatus === 'READY_FOR_REVIEW' && source.everPublished)
    throw new Error('Source was explicitly unpublished; manual review is required.');
  if (source.approvalStatus === 'READY_FOR_REVIEW')
    source = (
      await request(`/api/admin/sources/${source._id}/action`, 'POST', { action: 'approve' })
    ).data.source;
  if (source.approvalStatus !== 'APPROVED')
    throw new Error(`Source status ${source.approvalStatus}: ${source.error ?? ''}`);
  await appendFile(
    `${directory}/checkpoint.jsonl`,
    JSON.stringify({
      archiveId: entry.archiveId,
      sourceId: source._id,
      status: source.approvalStatus,
      at: new Date().toISOString(),
    }) + '\n',
  );
}
async function worker() {
  while (next < manifest.length) {
    const entry = manifest[next++];
    let error;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await importOne(entry);
        error = undefined;
        break;
      } catch (caught) {
        error = caught;
        await delay(1500 * 2 ** attempt);
      }
    }
    if (error) {
      failures.push({ archiveId: entry.archiveId, error: error.message });
      console.error(JSON.stringify(failures.at(-1)));
      // Stop repeated writes on quota/service failures; rerunning resumes from live state.
      if (failures.length >= 5) next = manifest.length;
    } else completed++;
    if ((completed + failures.length) % 25 === 0)
      console.log(JSON.stringify({ completed, failed: failures.length, total: manifest.length }));
  }
}
try {
  await Promise.all([worker(), worker(), worker(), worker()]);
  const report = {
    origin,
    completed,
    total: manifest.length,
    failures,
    finishedAt: new Date().toISOString(),
  };
  await writeFile(`${directory}/index-result.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (completed !== manifest.length) process.exitCode = 1;
} finally {
  await request('/api/auth/sign-out', 'POST', {}).catch(() => {});
}
