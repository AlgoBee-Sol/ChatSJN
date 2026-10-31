export const accountId = '70f8868a0c41eedd3481da031af7d6cd';

// These are resource identifiers, never credentials. Live retains its existing beta name.
export const environments = {
  production: {
    worker: 'sjn-ai-beta',
    database: 'b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1',
    bucket: 'sjn-ai-beta-sources',
    origin: 'https://sjn-ai-beta.algobee-solutions.workers.dev',
    googleClientId: '990231783495-f0c5lve2cs0m2jk30iliarjpcvs29t9t.apps.googleusercontent.com',
  },
  staging: {
    worker: 'sjn-ai-staging',
    database: 'c9524266-53fc-40ea-8f6f-a65d093695ef',
    bucket: 'sjn-ai-staging-sources',
    origin: 'https://sjn-ai-staging.algobee-solutions.workers.dev',
    // Enable only after a separate staging OAuth client/callback is configured.
    googleClientId: '',
  },
} as const;

export function deploymentEnvironment(mode: unknown) {
  if (mode !== 'staging' && mode !== 'production')
    throw new Error('Choose an explicit deployment mode: staging or production.');
  return environments[mode];
}
