import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import User from '../models/User.js';

if (!env.admin.email || !env.admin.password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
  process.exit(1);
}
if (env.admin.password.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

await connectDB();
const email = env.admin.email.toLowerCase();
const existing = await User.findOne({ email });
if (existing) {
  console.log(`Admin already exists: ${email}`);
} else {
  await User.create({
    name: env.admin.name,
    email,
    passwordHash: await User.hashPassword(env.admin.password),
    role: 'admin',
    emailVerified: true,
  });
  console.log(`Admin created: ${email}  (change the password after first login)`);
}
await disconnectDB();
