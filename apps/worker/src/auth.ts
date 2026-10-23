import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { registerSchema, type User } from '@sjn/shared';
import type { Env } from './env.js';

export const googleEnabled = (env: Env) =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export async function ensureProfile(
  env: Env,
  identity: { id: string; email: string; name: string; age?: number | null },
): Promise<User> {
  const profile: User = {
    id: identity.id,
    email: identity.email.toLowerCase(),
    fullName: identity.name === 'Learner' ? '' : identity.name.slice(0, 80),
    gender: 'Prefer not to say',
    age: identity.age ?? null,
    marja: 'SISTANI',
    language: 'ur',
    role: 'USER',
    onboardingStep: 1,
    onboardingComplete: false,
  };
  await env.DB.prepare('INSERT OR IGNORE INTO profiles (id, data) VALUES (?, ?)')
    .bind(identity.id, JSON.stringify(profile))
    .run();
  const row = await env.DB.prepare('SELECT data FROM profiles WHERE id = ?')
    .bind(identity.id)
    .first<{ data: string }>();
  if (!row) throw new Error('Profile could not be initialized');
  return JSON.parse(row.data);
}
export function createAuth(env: Env) {
  return betterAuth({
    appName: 'SJN AI',
    baseURL: env.APP_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    database: env.DB,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    socialProviders: googleEnabled(env)
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account',
          },
        }
      : {},
    user: {
      additionalFields: {
        age: { type: 'number', required: false, validator: { input: registerSchema.shape.age } },
      },
    },
    session: { expiresIn: 7 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false },
    },
    advanced: {
      database: { generateId: 'uuid' },
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      cookiePrefix: 'sjn',
      useSecureCookies: env.APP_ORIGIN.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    logger: {
      log: (level) => {
        if (level === 'error' || level === 'warn')
          console.error(JSON.stringify({ component: 'auth', level }));
      },
    },
    onAPIError: { errorURL: `${env.APP_ORIGIN}/login` },
    rateLimit: { enabled: true, storage: 'database' },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
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
              const url = new URL(value, env.APP_ORIGIN);
              allowed =
                typeof value === 'string' &&
                url.origin === env.APP_ORIGIN &&
                !url.username &&
                !url.password;
            } catch {
              /* reject malformed URL */
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
            await ensureProfile(env, user);
          },
        },
      },
    },
  });
}
