import Reward from '../models/Reward.js';
import PointsTransaction from '../models/PointsTransaction.js';
import RedemptionItem from '../models/RedemptionItem.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { creditHeartbeat, bufferProgress, getLevels, getRewardSummary } from '../services/rewardsService.js';
import { grantSubscription } from '../services/subscriptionService.js';

// POST /api/watch/heartbeat  { movieId, sessionId, seconds, position? }
export const heartbeat = asyncHandler(async (req, res) => {
  const { movieId, sessionId, seconds, position } = req.body;
  const result = await creditHeartbeat({ userId: req.user._id, sessionId, claimedSeconds: seconds });
  if (position !== undefined) bufferProgress(req.user._id, movieId, position);
  res.json({ data: result });
});

// GET /api/rewards/levels  (public, cached)
export const listLevels = asyncHandler(async (_req, res) => {
  const levels = await getLevels();
  res.json({
    data: levels.map((l) => ({ key: l.key, name: l.name, hours: l.hours, perk: l.perk, bonusPoints: l.bonusPoints })),
  });
});

// GET /api/rewards/me
export const myRewards = asyncHandler(async (req, res) => {
  res.json({ data: await getRewardSummary(req.user._id) });
});

// GET /api/rewards/points
export const myPoints = asyncHandler(async (req, res) => {
  const [reward, transactions] = await Promise.all([
    Reward.findOne({ user: req.user._id }).lean(),
    PointsTransaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  res.json({
    data: {
      pointsBalance: reward?.pointsBalance || 0,
      lifetimePoints: reward?.lifetimePoints || 0,
      redemptionAvailable: env.redemptionEnabled,
      transactions,
    },
  });
});

// GET /api/rewards/catalog  (empty until subscriptions launch)
export const redemptionCatalog = asyncHandler(async (_req, res) => {
  const items = env.redemptionEnabled ? await RedemptionItem.find({ active: true }).sort({ costPoints: 1 }).lean() : [];
  res.json({ data: items, redemptionAvailable: env.redemptionEnabled });
});

// POST /api/rewards/redeem  { itemId }  (switched off until REDEMPTION_ENABLED=true)
export const redeem = asyncHandler(async (req, res) => {
  if (!env.redemptionEnabled) throw new ApiError(403, 'Redeeming points is not available yet');
  if (!req.user.emailVerified) throw new ApiError(403, 'Please confirm your email before redeeming points');

  const item = await RedemptionItem.findOne({ _id: req.body.itemId, active: true });
  if (!item) throw new ApiError(404, 'This item is not available');

  // One conditional update: it only succeeds if the balance is large enough,
  // so a double click or two open tabs can never spend the same points twice.
  const reward = await Reward.findOneAndUpdate(
    { user: req.user._id, pointsBalance: { $gte: item.costPoints } },
    { $inc: { pointsBalance: -item.costPoints } },
    { new: true }
  );
  if (!reward) throw new ApiError(409, 'You do not have enough points for this item');

  await PointsTransaction.create({
    user: req.user._id,
    type: 'redeem',
    amount: -item.costPoints,
    balanceAfter: reward.pointsBalance,
    reference: String(item._id),
    createdAt: new Date(),
  });
  // Activate the subscription. If that fails, the points are given back.
  let subscription;
  try {
    subscription = await grantSubscription({ userId: req.user._id, days: item.durationDays, plan: item.name, source: 'points' });
  } catch (err) {
    console.error('Subscription activation failed, refunding points:', err.message);
    const refunded = await Reward.findOneAndUpdate({ user: req.user._id }, { $inc: { pointsBalance: item.costPoints } }, { new: true });
    await PointsTransaction.create({ user: req.user._id, type: 'adjust', amount: item.costPoints, balanceAfter: refunded.pointsBalance, reference: `refund: ${item.name}`, createdAt: new Date() });
    throw new ApiError(502, 'Could not activate the subscription. Your points were returned');
  }
  res.status(201).json({ data: { item, pointsBalance: reward.pointsBalance, subscription } });
});
