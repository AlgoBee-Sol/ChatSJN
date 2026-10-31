import { bindings, defineConfig, triggers } from 'cf/config';
import { accountId, deploymentEnvironment } from './config/environments.ts';

export default defineConfig(({ mode }) => {
  const target = deploymentEnvironment(mode ?? 'production');
  return {
    accountId,
    worker: {
      name: target.worker,
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
        DB: bindings.d1({ name: target.worker, id: target.database }),
        UPLOADS: bindings.r2({ name: target.bucket }),
        AI: bindings.ai(),
        ASSETS: bindings.assets(),
        APP_ORIGIN: bindings.text(target.origin),
        RELEASE_SHA: bindings.text(process.env.SJN_RELEASE_SHA || 'development'),
        BETTER_AUTH_SECRET: bindings.secret(),
        GOOGLE_CLIENT_ID: bindings.text(target.googleClientId),
        GOOGLE_CLIENT_SECRET: target.googleClientId ? bindings.secret() : bindings.text(''),
      },
    },
  };
});
