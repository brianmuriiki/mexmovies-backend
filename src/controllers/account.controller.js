import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Watchlist from '../models/Watchlist.js';
import Progress from '../models/Progress.js';
import Reward from '../models/Reward.js';
import PointsTransaction from '../models/PointsTransaction.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { startSession, clearSession } from '../services/session.js';

// PATCH /api/account
export const updateProfile = asyncHandler(async (req, res) => {
  req.user.name = req.body.name;
  await req.user.save();
  res.json({ data: req.user });
});

// PATCH /api/account/password
export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new ApiError(403, 'Your current password is not correct');
  }
  user.passwordHash = await User.hashPassword(req.body.newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  // Older sessions are signed out; this device gets a fresh one.
  startSession(res, user);
});

// DELETE /api/account  { password }  (viewers only; staff accounts are managed by the admin)
export const deleteAccount = asyncHandler(async (req, res) => {
  if (req.user.role !== 'viewer') {
    throw new ApiError(403, 'Staff accounts are removed by an admin');
  }
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new ApiError(403, 'Your password is not correct');
  }
  await Promise.all([
    Watchlist.deleteMany({ user: user._id }),
    Progress.deleteMany({ user: user._id }),
    Reward.deleteMany({ user: user._id }),
    PointsTransaction.deleteMany({ user: user._id }),
  ]);
  await user.deleteOne();
  clearSession(res);
  res.status(204).end();
});
