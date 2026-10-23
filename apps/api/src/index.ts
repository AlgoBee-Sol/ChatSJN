import mongoose from 'mongoose';
import { initializeAuth } from './auth-engine.js';
import { config } from './config.js';
import { createApp } from './app.js';
import { initModels, SourceDocument, IngestionJob } from './models.js';
await mongoose.connect(config.MONGODB_URI);
await initModels();
await initializeAuth();
// The v0.1 process is a single API instance. Recover jobs interrupted by a previous shutdown.
await SourceDocument.updateMany(
  { approvalStatus: 'PROCESSING' },
  {
    $set: {
      approvalStatus: 'FAILED',
      error: 'Processing was interrupted. Reprocess this import or upload a new version.',
    },
  },
);
await IngestionJob.updateMany(
  { status: 'PROCESSING' },
  { $set: { status: 'FAILED', error: 'Processing interrupted', finishedAt: new Date() } },
);
const server = createApp().listen(config.PORT, '127.0.0.1', () =>
  console.log(`SJN API: http://127.0.0.1:${config.PORT}`),
);
async function stop() {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
