import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deploymentEnvironment } from '../../config/environments.ts';

const [mode, action] = process.argv.slice(2);
const target = deploymentEnvironment(mode);
if (!['check', 'apply'].includes(action))
  throw new Error('Usage: migrations.mjs staging|production check|apply');
const cf = resolve('node_modules/.bin/cf');
const args = [target.database, '--dir', 'apps/worker/migrations', '--mode', mode];
function pending() {
  const output = execFileSync(cf, ['d1', 'migrations', 'list', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const result = JSON.parse(output);
  if (!Array.isArray(result)) throw new Error('Unrecognized migration list; refusing to deploy.');
  return result;
}
if (action === 'apply') {
  execFileSync(cf, ['d1', 'migrations', 'apply', ...args], { stdio: 'inherit' });
}
const remaining = pending();
if (remaining.length)
  throw new Error(
    `${remaining.length} pending ${mode} migration(s). Review and explicitly apply before deploying.`,
  );
console.log(`PASS: ${mode} schema has no pending migrations.`);
