import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import mongoose from 'mongoose';
import { getAuth, initializeAuth } from '../apps/api/src/auth-engine.js';
import { UserModel } from '../apps/api/src/models.js';
import { registerSchema } from '../packages/shared/src/index.js';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = await rl.question('Administrator email: ');
const age = Number(await rl.question('Age (18+): '));
// Prefer environment/stdin injection from a secret manager; passwords never enter shell arguments.
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  rl.close();
  throw new Error(
    'Set ADMIN_PASSWORD in the process environment before running this controlled command. See README.',
  );
}
rl.close();
const input = registerSchema.parse({ email, age, password });
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/sjn_ai');
await initializeAuth();
if (await UserModel.exists({ email: input.email })) {
  await UserModel.updateOne({ email: input.email }, { $set: { role: 'ADMIN' } });
  console.log('Existing account promoted to administrator.');
} else {
  const result = await getAuth().api.signUpEmail({ body: { ...input, name: 'Learner' } });
  await UserModel.updateOne({ _id: result.user.id }, { $set: { role: 'ADMIN' } });
  console.log('Administrator created. Sign in and complete onboarding.');
}
await mongoose.disconnect();
