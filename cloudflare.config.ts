import { bindings, defineConfig, triggers } from 'cf/config';

// This public OAuth client ID enables the required server-side Google secret when set.
const googleClientId = '';

// Dedicated beta resources. Change these IDs and the origin when moving accounts.
export default defineConfig({
  accountId: '70f8868a0c41eedd3481da031af7d6cd',
  worker: {
    name: 'sjn-ai-beta',
    workersDev: true,
    previewUrls: false,
    triggers: [triggers.scheduled({ schedule: '17 3 * * *' })],
    entrypoint: './apps/worker/src/index.ts',
    compatibilityDate: '2026-10-23',
    compatibilityFlags: ['nodejs_compat'],
    assets: { htmlHandling: 'none', notFoundHandling: 'none', runWorkerFirst: true },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: true },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    env: {
      DB: bindings.d1({ name: 'sjn-ai-beta', id: 'b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1' }),
      UPLOADS: bindings.r2({ name: 'sjn-ai-beta-sources' }),
      AI: bindings.ai(),
      ASSETS: bindings.assets(),
      APP_ORIGIN: bindings.text('https://sjn-ai-beta.algobee-solutions.workers.dev'),
      BETTER_AUTH_SECRET: bindings.secret(),
      GOOGLE_CLIENT_ID: bindings.text(googleClientId),
      GOOGLE_CLIENT_SECRET: googleClientId ? bindings.secret() : bindings.text(''),
    },
  },
});
