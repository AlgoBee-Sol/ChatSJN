import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z, ZodError } from 'zod';
import { profileSchema, questionSchema, type User, type Message } from '@sjn/shared';
import { AppError } from '../../api/src/errors.js';
import { createAuth, ensureProfile, googleEnabled } from './auth.js';
import { answer } from './ai.js';
import { getSource, uploadSource, sourceAction } from './sources.js';
import type { Env } from './env.js';

type Context = { Bindings: Env; Variables: { user: User; requestId: string } };
const app = new Hono<Context>();
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
const idSchema = z.uuid();
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
  c.header('X-Request-ID', c.get('requestId'));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', csp);
  if (c.env.APP_ORIGIN.startsWith('https://'))
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Keep the temporary beta out of search indexes until the permanent domain is ready.
  c.header('X-Robots-Tag', 'noindex, nofollow');
  if (c.req.path.startsWith('/api/') || !c.req.path.startsWith('/assets/'))
    c.header('Cache-Control', 'no-store');
});
app.use('/api/*', async (c, next) => {
  const maxSize =
    c.req.path === '/api/admin/sources' && c.req.method === 'POST' ? 9 * 1024 * 1024 : 32 * 1024;
  return bodyLimit({
    maxSize,
    onError: () =>
      c.json({ error: { code: 'BODY_TOO_LARGE', message: 'The request is too large.' } }, 413),
  })(c, next);
});
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (c.req.header('Origin') !== c.env.APP_ORIGIN)
      throw new AppError(403, 'INVALID_ORIGIN', 'This request must come from this site.');
    if (!c.req.path.startsWith('/api/auth/') && c.req.header('X-SJN-Request') !== '1')
      throw new AppError(403, 'CSRF', 'The request could not be verified.');
  }
  await next();
});
app.get('/api/health', (c) => c.json({ status: 'ok', version: '0.2.0', runtime: 'cloudflare' }));
app.get('/api/ready', async (c) => {
  await c.env.DB.prepare('SELECT 1 FROM profiles LIMIT 1').all();
  return c.json({
    database: true,
    aiConfigured: Boolean(c.env.AI),
    googleEnabled: googleEnabled(c.env),
  });
});
app.get('/api/auth/config', (c) =>
  c.json({ googleEnabled: googleEnabled(c.env), origin: c.env.APP_ORIGIN }),
);
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/') && c.req.path !== '/api/auth/me') return next();
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in.');
  c.set('user', await ensureProfile(c.env, session.user));
  await next();
});
app.get('/api/auth/me', (c) => c.json({ user: c.get('user') }));
app.all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));
app.patch('/api/profile', async (c) => {
  const { complete, ...fields } = profileSchema.parse(await c.req.json());
  const user = { ...c.get('user'), ...fields };
  if (complete && (!user.fullName || !user.age || user.age < 18))
    throw new AppError(400, 'INCOMPLETE_PROFILE', 'Complete your profile before continuing.');
  const patch = { ...fields, ...(complete ? { onboardingComplete: true, onboardingStep: 4 } : {}) };
  const updated = await c.env.DB.prepare(
    'UPDATE profiles SET data=json_patch(data,?) WHERE id=? RETURNING data',
  )
    .bind(JSON.stringify(patch), user.id)
    .first<{ data: string }>();
  return c.json({ user: JSON.parse(updated!.data) });
});
app.get('/api/sessions', async (c) => {
  const sessions = await createAuth(c.env).api.listSessions({ headers: c.req.raw.headers });
  return c.json({
    sessions: sessions.map((s) => ({ _id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt })),
  });
});
app.use('/api/conversations/*', async (c, next) => {
  if (!c.get('user').onboardingComplete)
    throw new AppError(403, 'ONBOARDING_REQUIRED', 'Complete your profile first.');
  const id = c.req.path.match(/^\/api\/conversations\/([^/]+)/)?.[1];
  if (id) {
    idSchema.parse(id);
    const row = await c.env.DB.prepare('SELECT id FROM conversations WHERE id=? AND userId=?')
      .bind(id, c.get('user').id)
      .first();
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Conversation not found.');
  }
  await next();
});
app.get('/api/conversations', async (c) => {
  const { page, limit } = pagination.parse(c.req.query()),
    userId = c.get('user').id;
  const [items, count] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id AS _id,title,updatedAt FROM conversations WHERE userId=? ORDER BY updatedAt DESC LIMIT ? OFFSET ?',
    )
      .bind(userId, limit, (page - 1) * limit)
      .all(),
    c.env.DB.prepare('SELECT count(*) AS n FROM conversations WHERE userId=?')
      .bind(userId)
      .first<{ n: number }>(),
  ]);
  return c.json({ items: items.results, total: count!.n, page, limit });
});
app.post('/api/conversations', async (c) => {
  if (!c.get('user').onboardingComplete)
    throw new AppError(403, 'ONBOARDING_REQUIRED', 'Complete your profile first.');
  const conversation = {
    _id: crypto.randomUUID(),
    title: 'New conversation',
    updatedAt: new Date().toISOString(),
  };
  await c.env.DB.prepare(
    'INSERT INTO conversations(id,userId,title,createdAt,updatedAt) VALUES(?,?,?,?,?)',
  )
    .bind(
      conversation._id,
      c.get('user').id,
      conversation.title,
      conversation.updatedAt,
      conversation.updatedAt,
    )
    .run();
  return c.json({ conversation }, 201);
});
app.get('/api/conversations/:id/messages', async (c) => {
  const { page, limit } = pagination.parse(c.req.query()),
    id = c.req.param('id');
  const [items, count] = await Promise.all([
    c.env.DB.prepare(
      'SELECT data FROM messages WHERE conversationId=? ORDER BY createdAt ASC, role DESC LIMIT ? OFFSET ?',
    )
      .bind(id, limit, (page - 1) * limit)
      .all<{ data: string }>(),
    c.env.DB.prepare('SELECT count(*) AS n FROM messages WHERE conversationId=?')
      .bind(id)
      .first<{ n: number }>(),
  ]);
  return c.json({
    items: items.results.map((r) => JSON.parse(r.data)),
    total: count!.n,
    page,
    limit,
  });
});
app.patch('/api/conversations/:id', async (c) => {
  const { title } = z
    .object({ title: z.string().trim().min(1).max(120) })
    .parse(await c.req.json());
  const result = await c.env.DB.prepare(
    'UPDATE conversations SET title=?,updatedAt=? WHERE id=? AND userId=? RETURNING id AS _id,title,updatedAt',
  )
    .bind(title, new Date().toISOString(), c.req.param('id'), c.get('user').id)
    .first();
  return c.json({ conversation: result });
});
app.delete('/api/conversations/:id', async (c) => {
  const result = await c.env.DB.prepare(
    'DELETE FROM conversations WHERE id=? AND userId=? AND busyUntil < ?',
  )
    .bind(c.req.param('id'), c.get('user').id, Date.now())
    .run();
  if (!result.meta.changes)
    throw new AppError(
      409,
      'CONVERSATION_BUSY',
      'Wait for the current answer before deleting this conversation.',
    );
  return c.body(null, 204);
});
async function limitUsage(env: Env, key: string, maximum: number, period: number) {
  const now = Date.now(),
    window = Math.floor(now / period),
    scoped = `${key}:${window}`;
  const row = await env.DB.prepare(
    'INSERT INTO usage_limits(key,count,expiresAt) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
  )
    .bind(scoped, (window + 1) * period)
    .first<{ count: number }>();
  if (row!.count > maximum)
    throw new AppError(429, 'RATE_LIMITED', 'Usage limit reached. Please try again later.');
}
app.post('/api/conversations/:id/messages', async (c) => {
  const { question, requestId } = questionSchema.parse(await c.req.json()),
    id = c.req.param('id'),
    user = c.get('user');
  const existing = await c.env.DB.prepare(
    "SELECT data FROM messages WHERE conversationId=? AND requestId=? AND role='assistant'",
  )
    .bind(id, requestId)
    .first<{ data: string }>();
  const sse = (message: Message) =>
    new Response(
      `data: ${JSON.stringify({ type: 'delta', text: message.content })}\n\ndata: ${JSON.stringify({ type: 'done', message })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  if (existing) return sse(JSON.parse(existing.data));
  await limitUsage(c.env, `chat:${user.id}`, 15, 60000);
  await limitUsage(c.env, 'chat:daily', 200, 86400000);
  const now = Date.now(),
    lease = crypto.randomUUID();
  const lock = await c.env.DB.prepare(
    'UPDATE conversations SET busyUntil=?,lease=? WHERE id=? AND userId=? AND busyUntil < ?',
  )
    .bind(now + 180000, lease, id, user.id, now)
    .run();
  if (!lock.meta.changes)
    throw new AppError(
      409,
      'CONVERSATION_BUSY',
      'An answer is already being prepared. Please wait.',
    );
  try {
    const result = await answer(c.env, user, question, id),
      createdAt = new Date().toISOString();
    const response: Message = { _id: crypto.randomUUID(), role: 'assistant', ...result, createdAt };
    const questionMessage: Message = {
      _id: crypto.randomUUID(),
      role: 'user',
      content: question,
      citations: [],
      category: result.category,
      language: result.language,
      marjaSnapshot: user.marja,
      createdAt: new Date(Date.parse(createdAt) - 1).toISOString(),
    };
    const citationIds = JSON.stringify([...new Set(result.citations.map((x) => x.documentId))]);
    const condition = `EXISTS(SELECT 1 FROM conversations WHERE id=? AND lease=? AND busyUntil>?) AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM sources s WHERE s.id=j.value AND s.status='APPROVED'))`;
    const saved = await c.env.DB.batch([
      ...[questionMessage, response].map((m) =>
        c.env.DB.prepare(
          `INSERT INTO messages(id,conversationId,requestId,role,data,createdAt) SELECT ?,?,?,?,?,? WHERE ${condition}`,
        ).bind(
          m._id,
          id,
          requestId,
          m.role,
          JSON.stringify(m),
          m.createdAt,
          id,
          lease,
          Date.now(),
          citationIds,
        ),
      ),
      c.env.DB.prepare(
        "UPDATE conversations SET updatedAt=?,title=CASE WHEN title='New conversation' THEN ? ELSE title END WHERE id=? AND lease=?",
      ).bind(createdAt, question.slice(0, 80), id, lease),
    ]);
    if (!saved[1].meta.changes)
      throw new AppError(
        409,
        'SOURCE_CHANGED',
        'The conversation or a source changed. Please retry.',
      );
    return sse(response);
  } finally {
    await c.env.DB.prepare('UPDATE conversations SET busyUntil=0,lease=NULL WHERE id=? AND lease=?')
      .bind(id, lease)
      .run();
  }
});
app.use('/api/admin/*', async (c, next) => {
  if (c.get('user').role !== 'ADMIN')
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
  await next();
});
app.get('/api/admin/sources', async (c) => {
  const { page, limit } = pagination.parse(c.req.query()),
    q = (c.req.query('q') || '').slice(0, 200);
  const [items, count] = await Promise.all([
    c.env.DB.prepare(
      'SELECT data FROM sources WHERE instr(lower(title),lower(?))>0 ORDER BY createdAt DESC LIMIT ? OFFSET ?',
    )
      .bind(q, limit, (page - 1) * limit)
      .all<{ data: string }>(),
    c.env.DB.prepare('SELECT count(*) AS n FROM sources WHERE instr(lower(title),lower(?))>0')
      .bind(q)
      .first<{ n: number }>(),
  ]);
  return c.json({
    items: items.results.map((r) => JSON.parse(r.data)),
    total: count!.n,
    page,
    limit,
  });
});
app.get('/api/admin/sources/:id', async (c) => {
  const id = idSchema.parse(c.req.param('id')),
    { source } = await getSource(c.env, id);
  const [chunks, jobs] = await Promise.all([
    c.env.DB.prepare('SELECT data FROM chunks WHERE documentId=? ORDER BY chunkIndex LIMIT 500')
      .bind(id)
      .all<{ data: string }>(),
    c.env.DB.prepare('SELECT data FROM jobs WHERE documentId=? ORDER BY createdAt DESC LIMIT 20')
      .bind(id)
      .all<{ data: string }>(),
  ]);
  return c.json({
    source,
    chunks: chunks.results.map((r) => JSON.parse(r.data)),
    jobs: jobs.results.map((r) => JSON.parse(r.data)),
  });
});
app.post('/api/admin/sources', async (c) =>
  c.json({ source: await uploadSource(c.env, await c.req.formData(), c.get('user').id) }, 201),
);
app.post('/api/admin/sources/:id/action', async (c) => {
  const { action } = z
    .object({ action: z.enum(['approve', 'reject', 'unpublish', 'reprocess']) })
    .parse(await c.req.json());
  return c.json({
    source: await sourceAction(c.env, idSchema.parse(c.req.param('id')), action, c.get('user').id),
  });
});
app.all('/api/*', (c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }, 404),
);
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));
app.get('*', async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname === '/') url.pathname = '/index.html';
  else if (/^\/(login|register|signup|onboarding|app|admin)(\/|$)/.test(url.pathname))
    url.pathname = '/private/index.html';
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
});
app.onError((error, c) => {
  if (
    /Your account has exceeded D1's free tier daily row (?:read|write) limit\./.test(error.message)
  ) {
    // D1 resets its daily allowance at midnight UTC. Do not expose provider details.
    c.header('Retry-After', String(86400 - (Math.floor(Date.now() / 1000) % 86400)));
    error = new AppError(
      503,
      'TEMPORARILY_UNAVAILABLE',
      'This service is temporarily unavailable. Please try again later.',
    );
  }
  const known = error instanceof AppError,
    invalid = error instanceof ZodError || error instanceof SyntaxError;
  const status = known ? error.status : invalid ? 400 : 500;
  if (status >= 500)
    console.error(
      JSON.stringify({
        component: 'api',
        requestId: c.get('requestId'),
        code: known ? error.code : 'INTERNAL',
        errorType: error.name,
      }),
    );
  return c.json(
    {
      error: {
        code: known ? error.code : invalid ? 'VALIDATION' : 'INTERNAL',
        message: known
          ? error.message
          : invalid
            ? 'Check the supplied values and try again.'
            : 'Something went wrong. Please try again.',
        requestId: c.get('requestId'),
      },
    },
    status as ContentfulStatusCode,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM usage_limits WHERE expiresAt < ?').bind(Date.now() - 86400000),
      env.DB.prepare('DELETE FROM session WHERE expiresAt < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM verification WHERE expiresAt < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM rateLimit WHERE lastRequest < ?').bind(Date.now() - 86400000),
    ]);
  },
} satisfies ExportedHandler<Env>;
