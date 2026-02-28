import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDb() {
  await mongoose.connect(env.mongoUri);
  console.log("✅ MongoDB connected successfully");
}
