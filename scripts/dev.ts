import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
const local = resolve('.local');
await mkdir(local, { recursive: true });
process.env.MONGOMS_DOWNLOAD_DIR = resolve('node_modules/.cache/mongodb-memory-server');
let mongo: MongoMemoryServer | undefined;
if (!process.env.MONGODB_URI) {
  const dbPath = resolve(local, 'mongo-data');
  await mkdir(dbPath, { recursive: true });
  mongo = await MongoMemoryServer.create({
    instance: { port: 27018, dbPath, storageEngine: 'wiredTiger' },
    binary: { downloadDir: process.env.MONGOMS_DOWNLOAD_DIR },
  });
  process.env.MONGODB_URI = mongo.getUri('sjn_ai');
  console.log('Persistent local MongoDB started on port 27018.');
}
if (!process.env.BETTER_AUTH_SECRET) {
  const secretPath = resolve(local, 'auth-secret');
  try {
    process.env.BETTER_AUTH_SECRET = await readFile(secretPath, 'utf8');
  } catch {
    process.env.BETTER_AUTH_SECRET = randomBytes(48).toString('hex');
    await writeFile(secretPath, process.env.BETTER_AUTH_SECRET, { mode: 0o600 });
  }
}
const children: ChildProcess[] = [];
children.push(
  spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], {
    stdio: 'inherit',
    env: process.env,
  }),
);
children.push(
  spawn(
    process.execPath,
    [resolve('apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
    { cwd: resolve('apps/web'), stdio: 'inherit', env: process.env },
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  await mongo?.stop({ doCleanup: false });
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    if (code && !stopping) void stop();
  });
