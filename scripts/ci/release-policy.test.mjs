import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from './release-policy.mjs';
import { environments, deploymentEnvironment } from '../../config/environments.ts';
import { loadAndParseConfig } from '@cloudflare/config';
import { resolve } from 'node:path';

const sha = 'a'.repeat(40);
const valid = () => ({
  sha,
  comparison: { status: 'identical' },
  deployment: { sha, environment: 'staging' },
  status: { state: 'success' },
});
test('a staged main commit can be released', () =>
  assert.doesNotThrow(() => validateRelease(valid())));
test('branch names and malformed commit inputs cannot be released', () => {
  for (const value of ['main', '', 'a'.repeat(7), 'a'.repeat(40) + '; echo bad'])
    assert.throws(() => validateRelease({ ...valid(), sha: value }));
});
test('an unmerged or divergent commit cannot be released', () => {
  for (const status of ['ahead', 'diverged'])
    assert.throws(() => validateRelease({ ...valid(), comparison: { status } }));
});
test('an older reviewed main commit can be released when it is currently staged', () =>
  assert.doesNotThrow(() => validateRelease({ ...valid(), comparison: { status: 'behind' } })));
test('failed, pending, missing or replaced staging deployment cannot be promoted', () => {
  for (const state of ['failure', 'error', 'pending', 'in_progress', 'inactive'])
    assert.throws(() => validateRelease({ ...valid(), status: { state } }));
  assert.throws(() => validateRelease({ ...valid(), status: undefined }));
  assert.throws(() => validateRelease({ ...valid(), deployment: undefined }));
  assert.throws(() =>
    validateRelease({ ...valid(), deployment: { sha: 'b'.repeat(40), environment: 'staging' } }),
  );
  assert.throws(() =>
    validateRelease({ ...valid(), deployment: { sha, environment: 'production' } }),
  );
});
test('staging does not share live resources or Google credentials', async () => {
  for (const key of ['worker', 'database', 'bucket', 'origin'])
    assert.notEqual(environments.staging[key], environments.production[key]);
  assert.equal(environments.staging.googleClientId, '');
  for (const mode of ['production', 'staging']) {
    const { result } = await loadAndParseConfig(resolve('cloudflare.config.ts'), {
      mode,
      isPreview: false,
    });
    assert.equal(result.success, true);
    assert.equal(result.data.worker.name, environments[mode].worker);
  }
});
test('unknown deployment modes fail instead of selecting live', () => {
  for (const mode of ['prod', 'stage', '', undefined])
    assert.throws(() => deploymentEnvironment(mode));
});
