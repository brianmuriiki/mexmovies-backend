import Subscription from '../models/Subscription.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Adds `days` to the subscription. An active subscription is extended; an expired one restarts today.
export async function grantSubscription({ userId, days, plan, source }) {
  const now = new Date();
  const existing = await Subscription.findOne({ user: userId }).lean();
  const from = existing && existing.endsAt > now ? existing.endsAt : now;
  const endsAt = new Date(from.getTime() + days * DAY_MS);
  return Subscription.findOneAndUpdate(
    { user: userId },
    { $set: { plan, source, endsAt, updatedAt: now }, $setOnInsert: { startsAt: now } },
    { upsert: true, new: true }
  );
}

export async function getSubscriptionStatus(userId) {
  const sub = await Subscription.findOne({ user: userId }).lean();
  const now = Date.now();
  const active = Boolean(sub && sub.endsAt.getTime() > now);
  return {
    active,
    plan: sub?.plan || null,
    source: sub?.source || null,
    startsAt: sub?.startsAt || null,
    endsAt: sub?.endsAt || null,
    daysRemaining: active ? Math.ceil((sub.endsAt.getTime() - now) / DAY_MS) : 0,
  };
}
