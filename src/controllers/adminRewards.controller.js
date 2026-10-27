import Reward from '../models/Reward.js';
import Level from '../models/Level.js';
import User from '../models/User.js';
import PointsTransaction from '../models/PointsTransaction.js';
import RedemptionItem from '../models/RedemptionItem.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { pageResult } from '../utils/pagination.js';
import { logActivity } from '../services/activityLogger.js';
import { ensureLevelsSeeded, getLevels, resetLevelsCache } from '../services/rewardsService.js';

const log = (req, action, targetType, targetId, details) =>
  logActivity({ actor: req.user._id, action, targetType, targetId, details });

// GET /api/admin/rewards/stats
export const rewardStats = asyncHandler(async (_req, res) => {
  const [byLevel, totals] = await Promise.all([
    Reward.aggregate([{ $group: { _id: '$level', viewers: { $sum: 1 } } }]),
    Reward.aggregate([
      { $group: { _id: null, viewers: { $sum: 1 }, seconds: { $sum: '$totalSeconds' }, points: { $sum: '$pointsBalance' } } },
    ]),
  ]);
  const t = totals[0] || { viewers: 0, seconds: 0, points: 0 };
  res.json({
    data: {
      viewersByLevel: Object.fromEntries(byLevel.map((r) => [r._id, r.viewers])),
      viewersWithRewards: t.viewers,
      totalHoursWatched: Number((t.seconds / 3600).toFixed(1)),
      pointsInCirculation: t.points,
    },
  });
});

// PATCH /api/admin/rewards/levels  { levels: [{ key, hours?, perk?, bonusPoints?, name? }] }
export const updateLevels = asyncHandler(async (req, res) => {
  await ensureLevelsSeeded();
  for (const { key, ...changes } of req.body.levels) {
    await Level.updateOne({ key }, { $set: changes });
  }
  resetLevelsCache();
  await log(req, 'rewards.levels.update', undefined, undefined, { keys: req.body.levels.map((l) => l.key) });
  res.json({ data: await getLevels() });
});

// POST /api/admin/rewards/catalog  /  PATCH /api/admin/rewards/catalog/:id
export const createRedemptionItem = asyncHandler(async (req, res) => {
  const item = await RedemptionItem.create(req.body);
  await log(req, 'rewards.catalog.create', undefined, item._id, { name: item.name, costPoints: item.costPoints });
  res.status(201).json({ data: item });
});

export const updateRedemptionItem = asyncHandler(async (req, res) => {
  const item = await RedemptionItem.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!item) throw new ApiError(404, 'Item not found');
  await log(req, 'rewards.catalog.update', undefined, item._id, { name: item.name });
  res.json({ data: item });
});

// POST /api/admin/points/adjust  { userId, amount, reason }
export const adjustPoints = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  if (!(await User.exists({ _id: userId }))) throw new ApiError(404, 'User not found');

  const filter = { user: userId };
  if (amount < 0) filter.pointsBalance = { $gte: -amount };
  const reward = await Reward.findOneAndUpdate(
    filter,
    { $inc: { pointsBalance: amount, ...(amount > 0 ? { lifetimePoints: amount } : {}) } },
    { new: true, upsert: amount > 0, setDefaultsOnInsert: true }
  );
  if (!reward) throw new ApiError(409, 'This viewer does not have enough points to remove that amount');

  await PointsTransaction.create({
    user: userId,
    type: 'adjust',
    amount,
    balanceAfter: reward.pointsBalance,
    reference: reason,
    createdAt: new Date(),
  });
  await log(req, 'points.adjust', 'user', userId, { amount, reason });
  res.json({ data: { pointsBalance: reward.pointsBalance } });
});

// GET /api/admin/points/transactions?userId=
export const listTransactions = asyncHandler(async (req, res) => {
  const { page, limit, userId } = req.query;
  const filter = userId ? { user: userId } : {};
  const [rows, total] = await Promise.all([
    PointsTransaction.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PointsTransaction.countDocuments(filter),
  ]);
  res.json(pageResult(rows, total, page, limit));
});
