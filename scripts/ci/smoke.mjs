import assert from 'node:assert/strict';
import { deploymentEnvironment } from '../../config/environments.ts';

const target = deploymentEnvironment(process.argv[2]);
const expectedRelease = process.argv[3];
if (!expectedRelease)
  throw new Error('Pass the expected release SHA (or development for a local bootstrap).');
async function check() {
  const get = async (path) => {
    const response = await fetch(target.origin + path, {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    return response;
  };
  const health = await (await get('/api/health')).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.runtime, 'cloudflare');
  assert.equal(health.release, expectedRelease, 'Wrong application release is serving traffic');
  const ready = await (await get('/api/ready')).json();
  assert.equal(ready.database, true);
  assert.equal(ready.aiConfigured, true);
  const auth = await (await get('/api/auth/config')).json();
  assert.equal(auth.origin, target.origin, 'Authentication points to a different environment');
  assert.equal(auth.googleEnabled, Boolean(target.googleClientId));
  const home = await get('/');
  assert.match(home.headers.get('content-type') || '', /text\/html/);
  const privateResponse = await fetch(target.origin + '/api/auth/me', {
    signal: AbortSignal.timeout(20_000),
    redirect: 'error',
  });
  assert.equal(privateResponse.status, 401, 'Private endpoint must require a login');
}
for (let attempt = 1; ; attempt++) {
  try {
    await check();
    console.log(
      `PASS: ${target.origin} serves ${expectedRelease}; database, auth configuration and assets respond.`,
    );
    break;
  } catch (error) {
    if (attempt >= 6) throw error;
    console.log(`Smoke check ${attempt} failed; retrying after deployment propagation.`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
