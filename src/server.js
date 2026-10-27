import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { buildCatalog, scheduleNextRelease } from './services/catalogSnapshot.js';
import { startRewardsJobs, stopRewardsJobs } from './services/rewardsService.js';

async function start() {
  await connectDB();
  buildCatalog()
    .then(scheduleNextRelease)
    .catch((err) => console.error('Catalog warm-up failed:', err.message));
  startRewardsJobs();

  const server = app.listen(env.port, () => {
    console.log(`mexMovies API running on port ${env.port} (${env.nodeEnv})`);
  });

  // Hosts stop the app with SIGTERM (for example on every deploy): save waiting watch time first.
  const shutdown = async (signal) => {
    console.log(`${signal} received, saving and shutting down`);
    server.close();
    try {
      await stopRewardsJobs();
      await mongoose.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
