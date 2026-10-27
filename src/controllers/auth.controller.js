import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activityLogger.js';
import { startSession, clearSession } from '../services/session.js';
import { createToken, hashToken } from '../services/tokens.js';
import { sendEmail } from '../services/email.js';
import { verifyEmailMessage, resetPasswordMessage } from '../services/emailTemplates.js';

// Used so a wrong email takes about as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const HOUR = 60 * 60 * 1000;

async function sendVerificationEmail(user) {
  const { token, hash } = createToken();
  user.verifyTokenHash = hash;
  user.verifyExpiresAt = new Date(Date.now() + 24 * HOUR);
  await user.save();
  const link = `${env.appUrl}/verify-email?token=${token}`;
  await sendEmail({ to: user.email, ...verifyEmailMessage(user.name, link) });
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) {
    throw new ApiError(409, 'An account with this email already exists');
  }
  const user = await User.create({
    name,
    email,
    passwordHash: await User.hashPassword(password),
    role: 'viewer', // always viewer: a role sent by the browser is ignored
  });
  try {
    await sendVerificationEmail(user);
  } catch (err) {
    console.error('Verification email failed:', err.message); // the account still works
  }
  startSession(res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok || !user.isActive) {
    throw new ApiError(401, 'Incorrect email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  if (user.role !== 'viewer') {
    await logActivity({ actor: user._id, action: 'login', targetType: 'user', targetId: user._id });
  }
  startSession(res, user);
});

export const logout = (_req, res) => {
  clearSession(res);
  res.json({ message: 'Logged out' });
};

export const me = (req, res) => {
  res.json({ data: req.user });
};

// POST /api/auth/verify-email  { token }
export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    verifyTokenHash: hashToken(req.body.token),
    verifyExpiresAt: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, 'This link is invalid or has expired');
  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyExpiresAt = undefined;
  await user.save();
  res.json({ message: 'Email confirmed. Thank you!' });
});

// POST /api/auth/resend-verification  (logged in)
export const resendVerification = asyncHandler(async (req, res) => {
  if (req.user.emailVerified) return res.json({ message: 'Your email is already confirmed' });
  try {
    await sendVerificationEmail(req.user);
  } catch (err) {
    console.error('Verification email failed:', err.message);
    throw new ApiError(502, 'Could not send the email right now. Please try again later');
  }
  res.json({ message: 'Confirmation email sent' });
});

// POST /api/auth/forgot-password  { email }  (always answers the same way)
export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && user.isActive && user.emailVerified) {
    const { token, hash } = createToken();
    user.resetTokenHash = hash;
    user.resetExpiresAt = new Date(Date.now() + HOUR);
    await user.save();
    try {
      await sendEmail({ to: user.email, ...resetPasswordMessage(user.name, `${env.appUrl}/reset-password?token=${token}`) });
    } catch (err) {
      console.error('Reset email failed:', err.message);
    }
  }
  res.json({ message: 'If that email has an account, a reset link is on its way' });
});

// POST /api/auth/reset-password  { token, password }
export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    resetTokenHash: hashToken(req.body.token),
    resetExpiresAt: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, 'This link is invalid or has expired');
  user.passwordHash = await User.hashPassword(req.body.password);
  user.passwordChangedAt = new Date(); // signs out older sessions
  user.resetTokenHash = undefined;
  user.resetExpiresAt = undefined;
  user.emailVerified = true; // they proved they control this email
  await user.save();
  res.json({ message: 'Password updated. You can log in now' });
});
