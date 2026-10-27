import { connectDB, disconnectDB } from '../config/db.js';
import Level from '../models/Level.js';
import { DEFAULT_LEVELS } from '../config/levels.js';

await connectDB();
for (const level of DEFAULT_LEVELS) {
  // Existing levels are left alone, so changes made by the admin are never overwritten.
  await Level.updateOne({ key: level.key }, { $setOnInsert: level }, { upsert: true });
}
console.log(`Reward levels ready (${DEFAULT_LEVELS.length}).`);
await disconnectDB();
