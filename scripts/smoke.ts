import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
process.env.MONGOMS_DOWNLOAD_DIR = resolve('node_modules/.cache/mongodb-memory-server');
const mongo = await MongoMemoryServer.create();
process.env.NODE_ENV = 'production';
process.env.MONGODB_URI = mongo.getUri('production_smoke');
process.env.APP_ORIGIN = 'https://local-smoke.example';
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString('hex');
await mongoose.connect(process.env.MONGODB_URI);
const { createApp } = await import('../apps/api/src/app.js');
const { initializeAuth } = await import('../apps/api/src/auth-engine.js');
await initializeAuth();
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
try {
  const address = server.address();
  assert(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const root = await fetch(base);
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /<h1[^>]*>A clearer path/);
  assert.match(html, /application\/ld\+json/);
  assert(root.headers.get('content-security-policy')?.includes("script-src 'self'"));
  const privatePage = await fetch(`${base}/app/chat`);
  assert.equal(privatePage.status, 200);
  assert.equal(privatePage.headers.get('x-robots-tag'), 'noindex');
  const privateHtml = await privatePage.text();
  assert.match(privateHtml, /<div id="root"><\/div>/);
  assert.doesNotMatch(privateHtml, /<h1[^>]*>A clearer path/);
  const api = await fetch(`${base}/api/auth/me`);
  assert.equal(api.status, 401);
  assert.equal(api.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${base}/api/ready`)).status, 200);
  const signup = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: process.env.APP_ORIGIN!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Smoke Learner',
      email: 'synthetic-smoke@example.org',
      password: 'Synthetic-smoke-password-123',
      age: 28,
    }),
  });
  assert.equal(signup.status, 200);
  const cookie = signup.headers.get('set-cookie') || '';
  assert.match(cookie, /__Secure-sjn.session_token=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
  assert(asset);
  assert.equal((await fetch(base + asset[1])).status, 200);
  console.log(
    'PASS: production public HTML, private shell, CSP, static assets, Better Auth secure cookies, auth boundary and readiness.',
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
}
