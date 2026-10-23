import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { createHash, randomBytes } from 'node:crypto';
import { pdfFixture } from './pdf-fixture.mjs';

let mf, db, cookie, otherCookie, conversationId, sourceId;
const origin = 'http://localhost:8787';
async function request(
  path,
  { method = 'GET', body, session = cookie, originHeader = origin, extra = {} } = {},
) {
  if (body instanceof FormData) {
    const encoded = new Request(origin + path, { method: 'POST', body });
    extra = { ...extra, 'Content-Type': encoded.headers.get('content-type') };
    body = new Uint8Array(await encoded.arrayBuffer());
  }
  return mf.dispatchFetch(origin + path, {
    method,
    headers: {
      Origin: originHeader,
      'X-SJN-Request': '1',
      'CF-Connecting-IP': '192.0.2.10',
      ...(session ? { Cookie: session } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...extra,
    },
    ...(body ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
  });
}
async function register(email) {
  const response = await request('/api/auth/sign-up/email', {
    method: 'POST',
    session: '',
    body: { email, password: 'A-test-password-87654!', name: 'Learner', age: 25 },
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return {
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
    user: result.user,
  };
}
before(async () => {
  mf = new Miniflare({
    workers: [
      {
        name: 'app',
        modules: true,
        scriptPath: 'apps/worker/dist/worker.js',
        compatibilityDate: '2026-07-30',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['UPLOADS'],
        bindings: {
          APP_ORIGIN: origin,
          BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
          GOOGLE_CLIENT_ID: '',
          GOOGLE_CLIENT_SECRET: '',
        },
        serviceBindings: {
          AI: { name: 'ai-fixture' },
          ASSETS: () =>
            new Response('<html>static fixture</html>', {
              headers: { 'Content-Type': 'text/html' },
            }),
        },
      },
      {
        name: 'ai-fixture',
        modules: true,
        scriptPath: 'apps/worker/tests/ai-fixture.js',
        compatibilityDate: '2026-07-30',
      },
    ],
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0001_auth.sql', '0002_application.sql', '0003_source_search.sql']) {
    const sql = (await readFile(`apps/worker/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '');
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
});
after(async () => {
  await mf?.dispose();
});
test('public readiness, disabled Google and beta security headers', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.equal((await (await request('/api/auth/config')).json()).googleEnabled, false);
  assert.equal((await request('/api/auth/me')).status, 401);
});
test('signup rejects minors and foreign origins', async () => {
  const body = {
    name: 'Learner',
    email: 'minor@example.test',
    password: 'A-test-password-87654!',
    age: 17,
  };
  assert.equal((await request('/api/auth/sign-up/email', { method: 'POST', body })).status, 400);
  assert.equal(
    (
      await request('/api/auth/sign-up/email', {
        method: 'POST',
        body: { ...body, age: 25 },
        originHeader: 'https://evil.example',
      })
    ).status,
    403,
  );
});
test('email signup, persistent session, onboarding and role protection', async () => {
  const registered = await register('owner@example.test');
  cookie = registered.cookie;
  assert.ok(cookie.includes('sjn.session_token='));
  assert.equal((await request('/api/conversations', { method: 'POST', body: {} })).status, 403);
  assert.equal(
    (await request('/api/profile', { method: 'PATCH', body: { role: 'ADMIN' } })).status,
    400,
  );
  const response = await request('/api/profile', {
    method: 'PATCH',
    body: { fullName: 'Test Learner', age: 25, language: 'en', complete: true },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.onboardingComplete, true);
  const created = await request('/api/conversations', { method: 'POST', body: {} });
  assert.equal(created.status, 201);
  conversationId = (await created.json()).conversation._id;
});
test('ownership prevents reading, editing, deleting or writing another user conversation', async () => {
  otherCookie = (await register('other@example.test')).cookie;
  await request('/api/profile', {
    method: 'PATCH',
    session: otherCookie,
    body: { fullName: 'Other Learner', age: 25, complete: true },
  });
  for (const [suffix, method, body] of [
    ['/messages', 'GET'],
    ['', 'PATCH', { title: 'stolen' }],
    ['', 'DELETE'],
    ['/messages', 'POST', { question: 'What is prayer?', requestId: crypto.randomUUID() }],
  ]) {
    assert.equal(
      (
        await request(`/api/conversations/${conversationId}${suffix}`, {
          method,
          body,
          session: otherCookie,
        })
      ).status,
      404,
    );
  }
});
test('no approved sources produces an honest answer without calling AI; retries are idempotent', async () => {
  const body = { question: 'Explain patience', requestId: crypto.randomUUID() };
  const response = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const events = (await response.text())
    .trim()
    .split('\n\n')
    .map((x) => JSON.parse(x.slice(6)));
  const answer = events.find((e) => e.type === 'done').message;
  assert.equal(answer.mode, 'insufficient');
  assert.deepEqual(answer.citations, []);
  assert.equal(
    (await request(`/api/conversations/${conversationId}/messages`, { method: 'POST', body }))
      .status,
    200,
  );
  const history = await (await request(`/api/conversations/${conversationId}/messages`)).json();
  assert.equal(history.total, 2);
});
test('conversation lock prevents simultaneous answers and deletion', async () => {
  await db
    .prepare('UPDATE conversations SET busyUntil=? WHERE id=?')
    .bind(Date.now() + 60000, conversationId)
    .run();
  assert.equal(
    (await request(`/api/conversations/${conversationId}`, { method: 'DELETE' })).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { question: 'Explain prayer', requestId: crypto.randomUUID() },
      })
    ).status,
    409,
  );
  await db.prepare('UPDATE conversations SET busyUntil=0 WHERE id=?').bind(conversationId).run();
});
test('admin permission, private R2 upload, extraction, review and rejection', async () => {
  assert.equal((await request('/api/admin/sources')).status, 403);
  const user = (await (await request('/api/auth/me')).json()).user;
  await db
    .prepare("UPDATE profiles SET data=json_set(data,'$.role','ADMIN') WHERE id=?")
    .bind(user.id)
    .run();
  const form = new FormData();
  form.set(
    'file',
    new File(
      ['Synthetic application test text about honesty. This is not a religious source.'],
      'test.txt',
      { type: 'text/plain' },
    ),
  );
  form.set(
    'metadata',
    JSON.stringify({
      title: 'Synthetic test fixture',
      scholar: 'Test author',
      sourceCategory: 'EDUCATIONAL',
      religiousAuthorityId: 'JAWAD_NAQVI',
      topics: ['AKHLAQ'],
      language: 'en',
      originalSourceURL: 'https://example.test/fixture',
      rightsConfirmed: true,
    }),
  );
  const uploaded = await request('/api/admin/sources', { method: 'POST', body: form });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const source = (await uploaded.json()).source;
  sourceId = source._id;
  assert.equal(source.approvalStatus, 'READY_FOR_REVIEW');
  const detail = await (await request(`/api/admin/sources/${sourceId}`)).json();
  assert.equal(detail.chunks.length, 1);
  assert.equal(
    (
      await request(`/api/admin/sources/${sourceId}/action`, {
        method: 'POST',
        body: { action: 'reject' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/admin/sources/${sourceId}/action`, {
        method: 'POST',
        body: { action: 'approve' },
      })
    ).status,
    409,
  );
  assert.equal((await request('/api/admin/sources', { session: otherCookie })).status, 403);
});
test('review approval enables grounded citations; unpublishing excludes them and preserves snapshots', async () => {
  assert.equal(
    (
      await request(`/api/admin/sources/${sourceId}/action`, {
        method: 'POST',
        body: { action: 'reprocess' },
      })
    ).status,
    200,
  );
  const approved = await request(`/api/admin/sources/${sourceId}/action`, {
    method: 'POST',
    body: { action: 'approve' },
  });
  assert.equal(approved.status, 200, await approved.clone().text());
  const response = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { question: 'Explain honesty', requestId: crypto.randomUUID() },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const events = (await response.text())
    .trim()
    .split('\n\n')
    .map((x) => JSON.parse(x.slice(6)));
  const message = events.find((e) => e.type === 'done').message;
  assert.equal(message.mode, 'grounded');
  assert.equal(message.citations[0].documentId, sourceId);
  assert.equal(
    (
      await request(`/api/admin/sources/${sourceId}/action`, {
        method: 'POST',
        body: { action: 'unpublish' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/admin/sources/${sourceId}/action`, {
        method: 'POST',
        body: { action: 'reprocess' },
      })
    ).status,
    409,
  );
  const next = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { question: 'Explain honesty', requestId: crypto.randomUUID() },
  });
  assert.match(await next.text(), /insufficient/);
  const history = await (await request(`/api/conversations/${conversationId}/messages`)).json();
  assert.equal(
    history.items.find((m) => m._id === message._id).citations[0].originalText,
    message.citations[0].originalText,
  );
});

test('PDF extraction works in workerd and retains page attribution', async () => {
  const form = new FormData();
  form.set('file', new File([pdfFixture()], 'synthetic.pdf', { type: 'application/pdf' }));
  form.set(
    'metadata',
    JSON.stringify({
      title: 'Synthetic PDF fixture',
      scholar: 'Test author',
      sourceCategory: 'EDUCATIONAL',
      religiousAuthorityId: 'JAWAD_NAQVI',
      topics: ['AKHLAQ'],
      language: 'en',
      originalSourceURL: 'https://example.test/pdf',
      rightsConfirmed: true,
    }),
  );
  const response = await request('/api/admin/sources', { method: 'POST', body: form });
  assert.equal(response.status, 201, await response.clone().text());
  const source = (await response.json()).source;
  assert.equal(source.approvalStatus, 'READY_FOR_REVIEW', source.error);
  const detail = await (await request(`/api/admin/sources/${source._id}`)).json();
  assert.equal(detail.chunks[0].pageNumber, 1);
  assert.match(detail.chunks[0].originalText, /Synthetic test document/);
});

test('large full-text corpus, bounded embedding cache, safe query syntax and archive retries', async () => {
  const text =
    'Synthetic archived passage about honesty and ethical behavior. Not a religious source.';
  const form = new FormData();
  form.set('file', new File([text + '\n'], 'archive.txt'));
  form.set(
    'metadata',
    JSON.stringify({
      title: 'Synthetic archived source',
      scholar: 'Test author',
      sourceCategory: 'EDUCATIONAL',
      religiousAuthorityId: 'JAWAD_NAQVI',
      topics: ['AKHLAQ'],
      language: 'en',
      originalSourceURL: 'https://example.test/archive',
      rightsConfirmed: true,
    }),
  );
  form.set(
    'review',
    JSON.stringify({
      method: 'automated-provenance-and-quality-review',
      archiveId: 'abcdef0123456789abcdef01',
      textSha256: createHash('sha256').update(text).digest('hex'),
      attribution: 'Synthetic fixture.',
      rightsBasis: 'Operator authorized source use; license not independently verified.',
    }),
  );
  const first = await request('/api/admin/sources', { method: 'POST', body: form });
  assert.equal(first.status, 201, await first.clone().text());
  const source = (await first.json()).source;
  const again = await (await request('/api/admin/sources', { method: 'POST', body: form })).json();
  assert.equal(again.source._id, source._id);
  assert.equal(
    (
      await db
        .prepare('SELECT count(*) AS n FROM chunks WHERE documentId=?')
        .bind(source._id)
        .first()
    ).n,
    1,
  );
  form.set('file', new File(['Altered text'], 'archive.txt'));
  assert.equal((await request('/api/admin/sources', { method: 'POST', body: form })).status, 400);
  const chunk = await db
    .prepare('SELECT data,searchText FROM chunks WHERE documentId=?')
    .bind(source._id)
    .first();
  // The old implementation stopped at 500 passages. Every candidate below is real indexed fixture text.
  for (let i = 0; i < 600; i += 20) {
    await db.batch(
      Array.from({ length: 20 }, (_, n) =>
        db
          .prepare('INSERT INTO chunks(id,documentId,chunkIndex,data,searchText) VALUES(?,?,?,?,?)')
          .bind(crypto.randomUUID(), source._id, i + n + 1, chunk.data, chunk.searchText),
      ),
    );
  }
  await db.prepare("INSERT INTO chunk_search(chunk_search) VALUES('rebuild')").run();
  const approved = await request(`/api/admin/sources/${source._id}/action`, {
    method: 'POST',
    body: { action: 'approve' },
  });
  assert.equal(approved.status, 200, await approved.clone().text());
  const response = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { question: 'Explain honesty OR * NEAR("', requestId: crypto.randomUUID() },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const event = (await response.text())
    .trim()
    .split('\n\n')
    .map((x) => JSON.parse(x.slice(6)))
    .find((x) => x.type === 'done');
  assert.equal(event.message.mode, 'grounded');
  assert.ok(event.message.citations.every((c) => c.documentId === source._id));
  assert.ok(
    (
      await db
        .prepare('SELECT count(*) AS n FROM chunks WHERE documentId=? AND embedding IS NOT NULL')
        .bind(source._id)
        .first()
    ).n <= 12,
  );
  const fiqh = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { question: 'What is the ruling for prayer?', requestId: crypto.randomUUID() },
  });
  assert.match(await fiqh.text(), /not available in this phase/);
  const general = await request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { question: 'Explain ethical behavior', requestId: crypto.randomUUID() },
  });
  const generalAnswer = (await general.text())
    .trim()
    .split('\n\n')
    .map((x) => JSON.parse(x.slice(6)))
    .find((x) => x.type === 'done').message;
  assert.equal(generalAnswer.category, 'OTHER');
  assert.equal(generalAnswer.mode, 'grounded');
  assert.ok(generalAnswer.citations.every((c) => c.authority === 'JAWAD_NAQVI'));
  await request(`/api/admin/sources/${source._id}/action`, {
    method: 'POST',
    body: { action: 'unpublish' },
  });
});

test('session listings hide tokens, signout revokes session', async () => {
  const listed = await (await request('/api/sessions')).json();
  assert.equal(listed.sessions.length, 1);
  assert.equal(listed.sessions[0].token, undefined);
  assert.equal((await request('/api/auth/sign-out', { method: 'POST', body: {} })).status, 200);
  assert.equal((await request('/api/auth/me')).status, 401);
});

test('D1 daily limits return temporary unavailability without provider details', async () => {
  await db
    .prepare(
      `CREATE TRIGGER simulate_daily_limit BEFORE INSERT ON rateLimit
    BEGIN SELECT RAISE(ABORT, 'Your account has exceeded D1''s free tier daily row write limit.'); END`,
    )
    .run();
  try {
    const response = await request('/api/auth/sign-up/email', {
      method: 'POST',
      session: '',
      extra: { 'CF-Connecting-IP': '192.0.2.77' },
      body: {
        email: 'quota-check@example.test',
        password: 'Synthetic-quota-check-123',
        name: 'Learner',
        age: 25,
      },
    });
    assert.equal(response.status, 503);
    const retryAfter = Number(response.headers.get('Retry-After'));
    assert.ok(retryAfter > 0 && retryAfter <= 86400);
    const body = await response.json();
    assert.equal(body.error.code, 'TEMPORARILY_UNAVAILABLE');
    assert.doesNotMatch(body.error.message, /D1|SQL|free tier|paid plan/i);
    const row = await db
      .prepare('SELECT COUNT(*) AS count FROM user WHERE email=?')
      .bind('quota-check@example.test')
      .first();
    assert.equal(row.count, 0);
  } finally {
    await db.prepare('DROP TRIGGER simulate_daily_limit').run();
  }
});
