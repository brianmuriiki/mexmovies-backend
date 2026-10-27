import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['admin', 'manager', 'viewer'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: Date, // sessions created before this are rejected
    role: { type: String, enum: ROLES, default: 'viewer', index: true },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: Date,
    // Hashed one-time tokens for email verification and password reset
    verifyTokenHash: { type: String, select: false },
    verifyExpiresAt: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 10);

// Requires the document to have been loaded with .select('+passwordHash')
userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.verifyTokenHash;
    delete ret.verifyExpiresAt;
    delete ret.resetTokenHash;
    delete ret.resetExpiresAt;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
