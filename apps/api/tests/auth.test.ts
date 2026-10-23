import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import argon2 from 'argon2';
vi.hoisted(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic-client.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic-secret-for-tests-only');
});
import { createApp } from '../src/app.js';
import { authCollections, initializeAuth } from '../src/auth-engine.js';
import { UserModel, ConversationModel, initModels } from '../src/models.js';

const origin = 'http://localhost:5173';
const app = createApp();
const credentials = {
  name: 'Learner',
  email: 'auth-fixture@example.org',
  password: 'Synthetic-password-123',
  age: 28,
};
let mongo: MongoMemoryServer;
const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...keyPair.publicKey.export({ format: 'jwk' }),
  kid: 'synthetic-test-key',
  alg: 'RS256',
  use: 'sig',
};
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('auth_tests_only'));
  await initModels();
  await initializeAuth();
});
beforeEach(async () => {
  await Promise.all([
    ...Object.values(mongoose.models).map((model) => model.deleteMany({})),
    ...authCollections.map((name) => mongoose.connection.db!.collection(name).deleteMany({})),
  ]);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  vi.unstubAllEnvs();
  await mongoose.disconnect();
  await mongo.stop();
});
const agent = () => request.agent(app);
type Agent = ReturnType<typeof agent>;
async function signup(a: Agent, extra = {}) {
  const response = await a
    .post('/api/auth/sign-up/email')
    .set('Origin', origin)
    .set('X-SJN-Client-IP', '203.0.113.25')
    .send({ ...credentials, ...extra });
  expect(response.status, response.text).toBe(200);
  return response;
}
async function startGoogle(a: Agent, link = false) {
  const response = await a
    .post(`/api/auth/${link ? 'link-social' : 'sign-in/social'}`)
    .set('Origin', origin)
    .send({
      provider: 'google',
      callbackURL: link ? '/app/settings' : '/app/chat',
      newUserCallbackURL: '/onboarding',
      errorCallbackURL: '/login',
    });
  expect(response.status, response.text).toBe(200);
  return new URL(response.body.url);
}
// Only Google's token and JWKS responses are simulated. Better Auth's real state,
// PKCE, token exchange, callback, account linking, MongoDB and cookies all run.
async function finishGoogle(a: Agent, url: URL, email = 'google-fixture@example.org') {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      sub: `google-sub-${email}`,
      aud: 'synthetic-client.apps.googleusercontent.com',
      email,
      email_verified: true,
      name: 'Google Learner',
      iat: now,
      exp: now + 3600,
      nonce: url.searchParams.get('nonce'),
    }),
  ).toString('base64url');
  const token = `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), keyPair.privateKey).toString('base64url')}`;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('redirect_uri')).toBe(`${origin}/api/auth/callback/google`);
      expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(
        url.searchParams.get('code_challenge'),
      );
      return Response.json({
        access_token: 'synthetic-access-token',
        refresh_token: 'synthetic-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: token,
        scope: 'openid email profile',
      });
    }
    if (target === 'https://www.googleapis.com/oauth2/v3/certs')
      return Response.json({ keys: [publicJwk] });
    throw new Error(`Unexpected external request in isolated auth test: ${target}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const result = await a
    .get('/api/auth/callback/google')
    .query({ code: 'synthetic-authorization-code', state: url.searchParams.get('state') });
  expect(result.status, result.text).toBe(302);
  expect(fetchMock).toHaveBeenCalled();
  return result;
}

describe('Better Auth credentials and migration', () => {
  it('keeps roles server-owned and immediately revokes all sessions', async () => {
    const a = agent(),
      b = agent();
    const response = await signup(a, {
      role: 'ADMIN',
      onboardingComplete: true,
      emailVerified: true,
    });
    const me = await a.get('/api/auth/me');
    expect(me.body.user.role).toBe('USER');
    expect(me.body.user.onboardingComplete).toBe(false);
    const identity = await mongoose.connection
      .db!.collection('authUsers')
      .findOne({ email: credentials.email });
    expect(identity?.emailVerified).toBe(false);
    const session = await mongoose.connection.db!.collection('authSessions').findOne({});
    expect(session?.ipAddress).toContain('127.0.0.1');
    expect(session?.ipAddress).not.toBe('203.0.113.25');
    expect(
      await UserModel.findById(response.body.user.id).select('+passwordHash'),
    ).not.toHaveProperty('passwordHash', expect.any(String));
    expect(
      (await b.post('/api/auth/sign-in/email').set('Origin', origin).send(credentials)).status,
    ).toBe(200);
    const sessions = await a.get('/api/sessions');
    expect(sessions.body.sessions).toHaveLength(2);
    expect(sessions.body.sessions[0].token).toBeUndefined();
    expect((await a.post('/api/auth/revoke-sessions').set('Origin', origin)).status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(401);
    expect((await b.get('/api/auth/me')).status).toBe(401);
  });
  it('rejects incorrect passwords and untrusted origins', async () => {
    const a = agent();
    await signup(a);
    expect(
      (
        await request(app)
          .post('/api/auth/sign-in/email')
          .set('Origin', origin)
          .send({ ...credentials, password: 'incorrect-password-123' })
      ).status,
    ).toBe(401);
    expect(
      (await a.post('/api/auth/sign-out').set('Origin', 'https://attacker.example')).status,
    ).toBe(403);
    expect((await a.get('/api/auth/me')).status).toBe(200);
  });
  it('migrates a legacy account without changing its password, role, identity or history', async () => {
    const hash = await argon2.hash(credentials.password);
    const legacy = await UserModel.create({
      email: credentials.email,
      passwordHash: hash,
      age: 28,
      fullName: 'Existing Admin',
      role: 'ADMIN',
      onboardingComplete: true,
    });
    await ConversationModel.create({ userId: legacy._id, title: 'Preserved conversation' });
    await initializeAuth();
    await initializeAuth();
    expect(
      (await UserModel.findById(legacy.id).select('+passwordHash'))?.passwordHash,
    ).toBeUndefined();
    expect(await mongoose.connection.db!.collection('authAccounts').countDocuments()).toBe(1);
    const a = agent();
    expect(
      (await a.post('/api/auth/sign-in/email').set('Origin', origin).send(credentials)).status,
    ).toBe(200);
    expect((await a.get('/api/auth/me')).body.user).toMatchObject({
      id: legacy.id,
      role: 'ADMIN',
      fullName: 'Existing Admin',
    });
    expect((await a.get('/api/conversations')).body.items[0].title).toBe('Preserved conversation');
    expect(
      (await request(app).get('/api/auth/me').set('Cookie', 'sjn_session=old-custom-cookie'))
        .status,
    ).toBe(401);
  });
  it('stops migration on identity conflicts without removing legacy credentials', async () => {
    const legacy = await UserModel.create({
      email: credentials.email,
      passwordHash: await argon2.hash(credentials.password),
      age: 28,
    });
    await mongoose.connection.db!.collection('authUsers').insertOne({ email: credentials.email });
    await expect(initializeAuth()).rejects.toThrow('conflicting identity');
    expect(
      (await UserModel.findById(legacy.id).select('+passwordHash'))?.passwordHash,
    ).toBeTruthy();
  });
});

describe('Google OAuth with isolated provider responses', () => {
  it('starts with PKCE, creates a learner, requires adult onboarding, and reuses the identity', async () => {
    const a = agent();
    const url = await startGoogle(a);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'email', 'profile']),
    );
    const callback = await finishGoogle(a, url);
    expect(callback.headers.location).toBe('/onboarding');
    const me = await a.get('/api/auth/me');
    expect(me.body.user).toMatchObject({
      role: 'USER',
      age: null,
      onboardingComplete: false,
      fullName: 'Google Learner',
    });
    expect((await a.get('/api/conversations')).status).toBe(403);
    const profile = (body: object) =>
      a.patch('/api/profile').set('Origin', origin).set('X-SJN-Request', '1').send(body);
    expect((await profile({ complete: true })).status).toBe(400);
    expect((await profile({ age: 17, complete: true })).status).toBe(400);
    expect((await profile({ age: 28, complete: true })).status).toBe(200);
    expect((await a.get('/api/conversations')).status).toBe(200);
    const account = await mongoose.connection
      .db!.collection('authAccounts')
      .findOne({ providerId: 'google' });
    expect(typeof account?.accessToken).toBe('string');
    expect(typeof account?.refreshToken).toBe('string');
    expect(account?.accessToken).not.toBe('synthetic-access-token');
    expect(account?.refreshToken).not.toBe('synthetic-refresh-token');
    expect(account?.password).toBeUndefined();
    const b = agent();
    expect((await finishGoogle(b, await startGoogle(b))).headers.location).toBe('/app/chat');
    expect((await b.get('/api/auth/me')).body.user.id).toBe(me.body.user.id);
  });
  it('blocks silent email linking but lets the signed-in owner connect Google', async () => {
    const owner = agent(),
      outsider = agent();
    const signupResult = await signup(owner);
    const rejected = await finishGoogle(outsider, await startGoogle(outsider), credentials.email);
    expect(rejected.headers.location).toContain('error=account_not_linked');
    expect((await outsider.get('/api/auth/me')).status).toBe(401);
    const linked = await finishGoogle(owner, await startGoogle(owner, true), credentials.email);
    expect(linked.headers.location).toBe('/app/settings');
    expect(
      (await owner.get('/api/auth/list-accounts')).body.map(
        (a: { providerId: string }) => a.providerId,
      ),
    ).toEqual(expect.arrayContaining(['google', 'credential']));
    expect(
      (await finishGoogle(outsider, await startGoogle(outsider), credentials.email)).headers
        .location,
    ).toBe('/app/chat');
    expect((await outsider.get('/api/auth/me')).body.user.id).toBe(signupResult.body.user.id);
  });
  it('rejects callback state from another browser and external redirects', async () => {
    const a = agent(),
      b = agent();
    const url = await startGoogle(a);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const callback = await b
      .get('/api/auth/callback/google')
      .query({ code: 'stolen-code', state: url.searchParams.get('state') });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain('error=');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await b.get('/api/auth/me')).status).toBe(401);
    expect(
      (
        await a
          .post('/api/auth/sign-in/social')
          .set('Origin', origin)
          .send({ provider: 'google', callbackURL: 'https://attacker.example' })
      ).status,
    ).toBe(403);
  });
  it('handles cancelled consent without creating an account', async () => {
    const a = agent();
    const url = await startGoogle(a);
    const callback = await a
      .get('/api/auth/callback/google')
      .query({ error: 'access_denied', state: url.searchParams.get('state') });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain('/login?error=access_denied');
    expect(await UserModel.countDocuments()).toBe(0);
  });
});
