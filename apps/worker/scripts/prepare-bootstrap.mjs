// Creates files only; run once, then apply bootstrap SQL through an authenticated D1 connection.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { hashPassword } from 'better-auth/crypto';
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Provide the administrator email.');
const directory = '.local/cloudflare';
await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  await access(`${directory}/admin-credentials.json`);
  throw new Error('Bootstrap files already exist; refusing to replace credentials.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const id = randomUUID(),
  password = randomBytes(24).toString('base64url'),
  now = Date.now();
const profile = {
  id,
  email,
  fullName: '',
  gender: 'Prefer not to say',
  age: null,
  marja: 'SISTANI',
  language: 'ur',
  role: 'ADMIN',
  onboardingStep: 1,
  onboardingComplete: false,
};
const statements = [
  {
    sql: 'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
    params: [id, 'Learner', email, 0, now, now],
  },
  {
    sql: 'INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
    params: [randomUUID(), id, 'credential', id, await hashPassword(password), now, now],
  },
  { sql: 'INSERT INTO profiles(id,data) VALUES(?,?)', params: [id, JSON.stringify(profile)] },
];
await writeFile(
  `${directory}/admin-credentials.json`,
  JSON.stringify(
    {
      email,
      password,
      userId: id,
      url: 'https://sjn-ai-beta.algobee-solutions.workers.dev/login',
      note: 'Change this temporary password after signing in. Complete your own adult onboarding details.',
    },
    null,
    2,
  ),
  { mode: 0o600, flag: 'wx' },
);
await writeFile(`${directory}/bootstrap.json`, JSON.stringify({ batch: statements }), {
  mode: 0o600,
  flag: 'wx',
});
await writeFile(
  `${directory}/secrets.json`,
  JSON.stringify({ BETTER_AUTH_SECRET: randomBytes(48).toString('base64url') }),
  { mode: 0o600, flag: 'wx' },
);
console.log('Bootstrap files created in ignored .local/cloudflare (permissions 0600).');
