import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
        result: request.body.batch.map(() => ({ success: true, results: [] })),
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
