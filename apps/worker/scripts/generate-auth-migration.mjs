// Run once for a new auth schema; review generated SQL before applying to existing data.
import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from '../src/auth.ts';
const database = new DatabaseSync(':memory:');
const auth = createAuth({
  DB: database,
  APP_ORIGIN: 'http://localhost:8787',
  BETTER_AUTH_SECRET: 'migration-only-secret-never-used-for-authentication',
});
const migration = await getMigrations(auth.options);
const output = process.argv[2] || '.local/cloudflare/auth-schema-candidate.sql';
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  '-- Better Auth schema candidate: review before creating a migration.\n' +
    (await migration.compileMigrations()) +
    '\n',
  { flag: 'wx', mode: 0o600 },
);
database.close();
