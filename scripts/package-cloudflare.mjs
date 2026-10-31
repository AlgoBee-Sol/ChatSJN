import { resolve, join } from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { loadAndParseConfig } from '@cloudflare/config';
import { deploymentEnvironment } from '../config/environments.ts';
import {
  cleanBuildOutputDir,
  getWorkerBundleDir,
  writeAssets,
  writeRootConfig,
  writeWorkerConfig,
  readBuildOutput,
} from '@cloudflare/build-output-utils';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--mode'))
  throw new Error('Usage: node scripts/package-cloudflare.mjs [--mode staging|production]');
const mode = args[1] || 'production';
deploymentEnvironment(mode);
const root = process.cwd(),
  context = { mode, isPreview: false };
const { result } = await loadAndParseConfig(resolve('cloudflare.config.ts'), context);
if (!result.success) throw result.error;
const { worker, accountId, complianceRegion } = result.data;
const settings = { accountId, complianceRegion };
if (!worker) throw new Error('Worker configuration is required.');
await cleanBuildOutputDir(root);
await writeRootConfig(root, settings, context);
await writeWorkerConfig({
  root,
  config: worker,
  manifest: {
    type: 'complete',
    mainModule: 'worker.js',
    modules: { 'worker.js': { type: 'esm' }, 'worker.js.map': { type: 'sourcemap' } },
  },
});
const bundle = getWorkerBundleDir(root);
await mkdir(bundle, { recursive: true });
for (const file of ['worker.js', 'worker.js.map'])
  await copyFile(join('apps/worker/dist', file), join(bundle, file));
await writeAssets({ root, sourceDirectory: resolve('apps/web/dist') });
await readBuildOutput(root);
console.log(
  `Validated ${mode} build output. Deploy with: pnpm exec cf deploy --prebuilt --mode ${mode}`,
);
