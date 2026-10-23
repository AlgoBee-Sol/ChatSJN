import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
process.env.APP_ORIGIN = 'http://localhost:5174';
process.env.WEB_PORT = '5174';
process.env.API_PORT = '3002';
process.env.MONGOMS_DOWNLOAD_DIR = resolve('node_modules/.cache/mongodb-memory-server');
process.env.UPLOAD_DIR = resolve('.local/e2e-uploads');
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri('e2e_synthetic_only'));
const { createApp } = await import('../../apps/api/src/app.js');
const { initModels, UserModel } = await import('../../apps/api/src/models.js');
const { seedFixture, testProviders } = await import('../../apps/api/tests/fixtures.js');
await initModels();
await seedFixture('SISTANI');
await seedFixture('ALI_KHAMENEI');
const argon2 = await import('argon2');
await UserModel.create({
  email: 'synthetic-admin@example.org',
  passwordHash: await argon2.hash('Synthetic-admin-password-123'),
  age: 30,
  fullName: 'Test Reviewer',
  role: 'ADMIN',
  language: 'en',
  onboardingComplete: true,
  onboardingStep: 4,
});
const { initializeAuth } = await import('../../apps/api/src/auth-engine.js');
await initializeAuth();
const server = createApp(testProviders).listen(3002, '127.0.0.1');
const vite = spawn(
  process.execPath,
  [resolve('apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
  { cwd: resolve('apps/web'), stdio: 'inherit', env: process.env },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  vite.kill('SIGTERM');
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
