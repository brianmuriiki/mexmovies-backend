import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { grantSubscription, getSubscriptionStatus } from '../services/subscriptionService.js';
import { logActivity } from '../services/activityLogger.js';

// GET /api/subscription  (logged in)
export const mySubscription = asyncHandler(async (req, res) => {
  res.json({ data: await getSubscriptionStatus(req.user._id) });
});

// POST /api/admin/subscriptions  { userId, days, reason }
export const adminGrant = asyncHandler(async (req, res) => {
  const { userId, days, reason } = req.body;
  if (!(await User.exists({ _id: userId }))) throw new ApiError(404, 'User not found');
  await grantSubscription({ userId, days, plan: 'Granted by admin', source: 'admin' });
  await logActivity({ actor: req.user._id, action: 'subscription.grant', targetType: 'user', targetId: userId, details: { days, reason } });
  res.status(201).json({ data: await getSubscriptionStatus(userId) });
});
