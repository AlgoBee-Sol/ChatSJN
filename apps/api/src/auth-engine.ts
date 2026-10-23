import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { registerSchema } from '@sjn/shared';
import { config } from './config.js';
import { UserModel } from './models.js';

export const authCollections = [
  'authUsers',
  'authAccounts',
  'authSessions',
  'authVerifications',
] as const;
export const trustedOrigins = [
  config.APP_ORIGIN,
  ...(config.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
];
export const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

// Profiles and conversations retain their original ObjectId. Roles never come from OAuth claims.
export async function ensureProfile(identity: {
  id: string;
  email: string;
  name: string;
  age?: number | null;
}) {
  return UserModel.findOneAndUpdate(
    { _id: identity.id },
    {
      $setOnInsert: {
        email: identity.email.toLowerCase(),
        fullName: identity.name === 'Learner' ? '' : identity.name.slice(0, 80),
        age: identity.age ?? null,
        role: 'USER',
      },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
}

function createAuth() {
  if (!mongoose.connection.db)
    throw new Error('Connect MongoDB before initializing authentication');
  return betterAuth({
    appName: 'SJN AI',
    baseURL: config.APP_ORIGIN,
    basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins,
    // Omit MongoClient: local MongoDB is standalone and does not support transactions.
    database: mongodbAdapter(mongoose.connection.db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: (password) =>
          argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 1,
          }),
        verify: ({ hash, password }) => argon2.verify(hash, password),
      },
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account',
          },
        }
      : {},
    user: {
      modelName: 'authUsers',
      additionalFields: {
        age: { type: 'number', required: false, validator: { input: registerSchema.shape.age } },
      },
    },
    session: {
      modelName: 'authSessions',
      expiresIn: 7 * 86400,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: 'authAccounts',
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false },
    },
    verification: { modelName: 'authVerifications' },
    advanced: {
      // Exercise the same origin/CSRF checks in tests and in production.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: ['x-sjn-client-ip'] },
      cookiePrefix: 'sjn',
      useSecureCookies: config.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    logger: {
      log: (level, message) => {
        // Do not forward OAuth state, tokens or raw error objects into logs.
        if (level === 'error' || level === 'warn')
          console.error(JSON.stringify({ component: 'auth', level, message }));
      },
    },
    onAPIError: { errorURL: `${config.APP_ORIGIN}/login` },
    rateLimit: { enabled: config.NODE_ENV !== 'test', storage: 'database' },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Restrict every caller-controlled return URL, including cancellation/error paths.
        for (const field of [
          'callbackURL',
          'newUserCallbackURL',
          'errorCallbackURL',
          'redirectTo',
        ]) {
          const value = ctx.body?.[field];
          if (value !== undefined) {
            let allowed = false;
            try {
              const url = new URL(value, config.APP_ORIGIN);
              allowed =
                typeof value === 'string' &&
                trustedOrigins.includes(url.origin) &&
                !url.username &&
                !url.password;
            } catch {
              /* Reject malformed return URLs. */
            }
            if (!allowed)
              throw new APIError('FORBIDDEN', { message: 'Return URL must stay on this site.' });
          }
        }
        if (ctx.path === '/sign-up/email') {
          const parsed = registerSchema.safeParse(ctx.body);
          if (!parsed.success)
            throw new APIError('BAD_REQUEST', {
              message: parsed.error.issues[0]?.message || 'Check your account details.',
            });
          ctx.body.email = parsed.data.email;
        }
        // Profile email is immutable in this beta; keep identity and profile aligned.
        if (ctx.path === '/change-email')
          throw new APIError('FORBIDDEN', {
            message: 'Changing your sign-in email is not available.',
          });
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureProfile(user);
          },
        },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
let database: typeof mongoose.connection.db;
export function getAuth() {
  if (!instance || database !== mongoose.connection.db) {
    instance = createAuth();
    database = mongoose.connection.db;
  }
  return instance;
}

// Idempotent startup migration. Never merge different identities or overwrite newer credentials.
// A crash before removing passwordHash is safe: the next run verifies the existing account.
export async function initializeAuth() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  await db.collection('authUsers').createIndex({ email: 1 }, { unique: true });
  await db
    .collection('authAccounts')
    .createIndex({ providerId: 1, accountId: 1 }, { unique: true });
  await db.collection('authAccounts').createIndex({ userId: 1 });
  await db.collection('authSessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('authSessions').createIndex({ userId: 1 });
  await db.collection('authSessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('authVerifications').createIndex({ identifier: 1 });
  await db.collection('authVerifications').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  for await (const user of UserModel.find({ passwordHash: { $exists: true } })
    .select('+passwordHash')
    .cursor()) {
    const identity = await db
      .collection('authUsers')
      .findOne({ $or: [{ _id: user._id }, { email: user.email }] });
    if (identity && (String(identity._id) !== user.id || identity.email !== user.email))
      throw new Error(
        'Authentication migration stopped: conflicting identity. Restore/reconcile from a backup before restarting.',
      );
    await db.collection('authUsers').updateOne(
      { _id: user._id },
      {
        $setOnInsert: {
          email: user.email,
          emailVerified: false,
          name: user.fullName || 'Learner',
          age: user.age,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { upsert: true },
    );
    const key = { providerId: 'credential', accountId: user.id };
    const existing = await db.collection('authAccounts').findOne(key);
    if (
      existing &&
      (String(existing.userId) !== user.id || existing.password !== user.passwordHash)
    )
      throw new Error(
        'Authentication migration stopped: conflicting credential. No password was overwritten.',
      );
    await db.collection('authAccounts').updateOne(
      key,
      {
        $setOnInsert: {
          ...key,
          userId: user._id,
          password: user.passwordHash,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { upsert: true },
    );
    await UserModel.updateOne(
      { _id: user._id, passwordHash: user.passwordHash },
      { $unset: { passwordHash: 1 } },
    );
  }
  getAuth();
}
