import { build } from 'esbuild';
await build({
  entryPoints: ['apps/worker/src/index.ts'],
  outfile: 'apps/worker/dist/worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  conditions: ['workerd', 'worker', 'browser'],
  external: ['node:*'],
  minify: true,
  sourcemap: true,
});
