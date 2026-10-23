import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/api/tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      APP_ORIGIN: 'http://localhost:5173',
      UPLOAD_DIR: '.local/test-uploads',
      MONGOMS_DOWNLOAD_DIR: 'node_modules/.cache/mongodb-memory-server',
    },
  },
});
