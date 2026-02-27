import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    skills: [{ type: String, trim: true }],
    trustScore: { type: Number, default: 3.5, min: 0, max: 5 },
    verified: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    role: { type: String, enum: ['patient', 'helper', 'admin', 'user'], default: 'user' },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
