import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import importReviewedBatch from './cloudflare-import.mjs';

const account = '70f8868a0c41eedd3481da031af7d6cd';
const text = 'Synthetic honesty fixture for testing the import transaction boundary.\n';
function payload(change = {}) {
  return gzipSync(
    JSON.stringify([
      {
        text,
        metadata: {
          title: 'Synthetic fixture',
          scholar: 'Fixture author',
          sourceCategory: 'EDUCATIONAL',
          religiousAuthorityId: 'JAWAD_NAQVI',
          topics: ['AKHLAQ'],
          originalSourceURL: 'https://www.syedjawadnaqvi.com/synthetic-test-only',
          section: 'Fixture',
        },
        review: {
          archiveId: 'abcdef0123456789abcdef01',
          textSha256: createHash('sha256').update(text.slice(0, -1)).digest('hex'),
        },
        ...change,
      },
    ]),
  ).toString('base64');
}
function mock(failStage = false) {
  const calls = [];
  return {
    calls,
    async request(request) {
      calls.push(request);
      if (request.method === 'PUT')
        return { success: true, result: { size: Buffer.byteLength(request.body) } };
      if (request.body.batch[0].sql.startsWith('SELECT'))
        return { success: true, result: [{ success: true, results: [] }] };
      if (
        failStage &&
        request.body.batch.some((x) => x.sql.startsWith('INSERT OR REPLACE INTO chunk_search'))
      )
        throw new Error('Injected index failure');
      return {
        success: true,
        result: request.body.batch.map(() => ({
          success: true,
          results: [],
          meta: { changes: 1 },
        })),
      };
    },
  };
}
test('connector import preserves original text and publishes only after index writes', async () => {
  const api = mock();
  const result = await importReviewedBatch(api, account, payload());
  assert.equal(result.imported, 1);
  assert.equal(result.passages, 1);
  assert.equal(api.calls.find((x) => x.method === 'PUT').body, text);
  const staged = api.calls.findIndex((x) =>
    x.body?.batch?.some((q) => q.sql.startsWith('INSERT OR REPLACE INTO chunk_search')),
  );
  const published = api.calls.findIndex((x) =>
    x.body?.batch?.some((q) => q.sql.startsWith('UPDATE sources')),
  );
  assert.ok(published > staged);
});
test('an index failure never triggers publication', async () => {
  const api = mock(true);
  await assert.rejects(importReviewedBatch(api, account, payload()), /Injected index failure/);
  assert.ok(!api.calls.some((x) => x.body?.batch?.some((q) => q.sql.startsWith('UPDATE sources'))));
});
test('modified archive content is rejected before any remote writes', async () => {
  const api = mock();
  await assert.rejects(
    importReviewedBatch(api, account, payload({ text: 'Altered source' })),
    /Hash mismatch/,
  );
  assert.equal(api.calls.length, 0);
});

test('a failed publication count is reported as an import failure', async () => {
  const api = mock();
  const originalRequest = api.request.bind(api);
  api.request = async (request) => {
    const result = await originalRequest(request);
    if (request.body?.batch?.[0]?.sql.startsWith('UPDATE sources'))
      result.result[0].meta.changes = 0;
    return result;
  };
  await assert.rejects(importReviewedBatch(api, account, payload()), /Publication failed/);
});

test('an interrupted staged import resumes without duplicate FTS entries or audit records', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    readFileSync(new URL('../../apps/worker/migrations/0001_auth.sql', import.meta.url), 'utf8'),
  );
  db.exec(
    readFileSync(
      new URL('../../apps/worker/migrations/0002_application.sql', import.meta.url),
      'utf8',
    ),
  );
  db.exec(
    readFileSync(
      new URL('../../apps/worker/migrations/0003_source_search.sql', import.meta.url),
      'utf8',
    ),
  );
  let interruptPublication = true;
  const api = {
    async request(request) {
      if (request.method === 'PUT')
        return { success: true, result: { size: Buffer.byteLength(request.body) } };
      if (interruptPublication && request.body.batch[0].sql.startsWith('UPDATE sources'))
        throw new Error('Interrupted before publication');
      db.exec('BEGIN');
      try {
        const result = request.body.batch.map(({ sql, params = [] }) => {
          const statement = db.prepare(sql);
          if (sql.startsWith('SELECT')) return { success: true, results: statement.all(...params) };
          const result = statement.run(...params);
          return { success: true, results: [], meta: { changes: result.changes } };
        });
        db.exec('COMMIT');
        return { success: true, result };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  try {
    await assert.rejects(importReviewedBatch(api, account, payload()), /Interrupted/);
    assert.equal(db.prepare('SELECT status FROM sources').get().status, 'PROCESSING');
    interruptPublication = false;
    const resumed = await importReviewedBatch(api, account, payload());
    assert.equal(resumed.imported, 1);
    db.exec("INSERT INTO chunk_search(chunk_search,rank) VALUES('integrity-check',1)");
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM chunk_search WHERE chunk_search MATCH 'honesty'").get()
        .n,
      1,
    );
    const repeated = await importReviewedBatch(api, account, payload());
    assert.equal(repeated.skipped, 1);
    assert.equal(repeated.imported, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM audit_logs').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM jobs').get().n, 1);
  } finally {
    db.close();
  }
});
