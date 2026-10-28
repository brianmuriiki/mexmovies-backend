import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

// Cache database connection across serverless invocations
export default async function handler(req, res) {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }
  return app(req, res);
}

