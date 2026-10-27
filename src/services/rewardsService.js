import Reward from '../models/Reward.js';
import Level from '../models/Level.js';
import PointsTransaction from '../models/PointsTransaction.js';
import Progress from '../models/Progress.js';
import { env } from '../config/env.js';
import { DEFAULT_LEVELS, LEVEL_KEYS } from '../config/levels.js';

/*
 * Watch-time rewards.
 *
 * Browsers send a heartbeat (about every 5 minutes and when the viewer pauses or leaves) saying how many
 * seconds were watched. The server limits what it believes, keeps the credits in memory, and saves them
 * to MongoDB in bulk once a minute, so thousands of watchers do not create thousands of database writes.
 *
 * Rules: at most as many seconds as real time passed since the last heartbeat, a daily cap, and only one
 * active session per account. Points: 1 per full minute credited, plus a bonus when a level is reached.
 */

const FIRST_CLAIM_SECONDS = 120; // allowed on a first heartbeat (server just started, or a new viewer)
const GRACE_SECONDS = 10;
const ACTIVE_WINDOW_MS = 6 * 60 * 1000; // another session counts as active for this long
const IDLE_STATE_MS = 30 * 60 * 1000;

const userStates = new Map(); // userId -> state kept in memory
const progressBuffer = new Map(); // "userId:movieId" -> { user, movie, positionSeconds }
let levelsCache = null;
let timer = null;

export const todayKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

// ---------- levels ----------
export async function getLevels() {
  if (!levelsCache) {
    const rows = await Level.find().sort({ hours: 1 }).lean();
    levelsCache = rows.length ? rows : DEFAULT_LEVELS;
  }
  return levelsCache;
}

export const resetLevelsCache = () => {
  levelsCache = null;
};

export async function ensureLevelsSeeded() {
  if ((await Level.countDocuments()) === 0) await Level.insertMany(DEFAULT_LEVELS);
}

// True when the viewer has reached `minKey` (for example 'gold') or higher.
export async function hasLevel(userId, minKey) {
  const reward = await Reward.findOne({ user: userId }).select('level').lean();
  const rank = (key) => LEVEL_KEYS.indexOf(key) + 1; // 'none' = 0
  return rank(reward?.level || 'none') >= rank(minKey);
}

// ---------- heartbeat ----------
async function loadState(userId) {
  const key = String(userId);
  let state = userStates.get(key);
  if (state) return state;
  const reward = await Reward.findOne({ user: userId }).lean();
  state = {
    userId,
    totalSeconds: reward?.totalSeconds || 0,
    todayDate: reward?.todayDate || '',
    todaySeconds: reward?.todaySeconds || 0,
    pending: 0,
    lastBeat: 0,
    sessionId: null,
    lastSeen: Date.now(),
  };
  userStates.set(key, state);
  return state;
}

export async function creditHeartbeat({ userId, sessionId, claimedSeconds, now = Date.now() }) {
  const state = await loadState(userId);
  const cap = env.rewards.dailyCapSeconds;

  const today = todayKey(now);
  if (state.todayDate !== today) {
    state.todayDate = today;
    state.todaySeconds = 0;
  }

  // Only one active session per account earns time.
  if (state.sessionId && state.sessionId !== sessionId && now - state.lastBeat < ACTIVE_WINDOW_MS) {
    return { credited: 0, reason: 'other_session', todaySeconds: state.todaySeconds, dailyCapSeconds: cap };
  }

  const remaining = Math.max(0, cap - state.todaySeconds);
  const byTime = state.lastBeat ? (now - state.lastBeat) / 1000 + GRACE_SECONDS : FIRST_CLAIM_SECONDS;
  const credited = Math.floor(Math.max(0, Math.min(claimedSeconds, byTime, 330, remaining)));

  state.sessionId = sessionId;
  state.lastBeat = now;
  state.lastSeen = now;
  if (credited > 0) {
    state.pending += credited;
    state.todaySeconds += credited;
  }

  return {
    credited,
    reason: remaining === 0 ? 'daily_cap' : credited < claimedSeconds ? 'limited' : 'ok',
    todaySeconds: state.todaySeconds,
    dailyCapSeconds: cap,
  };
}

export function bufferProgress(userId, movieId, positionSeconds) {
  progressBuffer.set(`${userId}:${movieId}`, { user: userId, movie: movieId, positionSeconds });
}

// ---------- saving ----------
async function flushUser(state, levels) {
  const secs = state.pending;
  state.pending = 0;

  const oldTotal = state.totalSeconds;
  const newTotal = oldTotal + secs;
  const watchPoints = Math.floor(newTotal / 60) - Math.floor(oldTotal / 60);
  const crossed = levels.filter((l) => l.hours * 3600 > oldTotal && l.hours * 3600 <= newTotal);
  const bonus = crossed.reduce((sum, l) => sum + (l.bonusPoints || 0), 0);
  const reached = levels.filter((l) => l.hours * 3600 <= newTotal).pop();
  const points = watchPoints + bonus;

  let reward;
  try {
    reward = await Reward.findOneAndUpdate(
      { user: state.userId },
      {
        $inc: { totalSeconds: secs, lifetimePoints: points, pointsBalance: points },
        $set: { level: reached ? reached.key : 'none', todaySeconds: state.todaySeconds, todayDate: state.todayDate },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    state.totalSeconds = newTotal;
  } catch (err) {
    state.pending += secs; // try again next time
    console.error('Rewards save failed:', err.message);
    return;
  }

  const now = new Date();
  const ops = [];
  if (watchPoints > 0) {
    ops.push({
      updateOne: {
        filter: { user: state.userId, type: 'earn_watch', day: state.todayDate },
        update: {
          $inc: { amount: watchPoints },
          $set: { balanceAfter: reward.pointsBalance - bonus, reference: 'watch' },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    });
  }
  let running = reward.pointsBalance - bonus;
  for (const level of crossed) {
    if (!level.bonusPoints) continue;
    running += level.bonusPoints;
    ops.push({
      insertOne: {
        document: { user: state.userId, type: 'bonus_level', amount: level.bonusPoints, balanceAfter: running, reference: level.key, createdAt: now },
      },
    });
  }
  if (ops.length) {
    try {
      await PointsTransaction.bulkWrite(ops, { ordered: false });
    } catch (err) {
      console.error('Points history save failed:', err.message);
    }
  }
}

async function flushProgress() {
  if (!progressBuffer.size) return;
  const items = [...progressBuffer.values()];
  progressBuffer.clear();
  const now = new Date();
  try {
    await Progress.bulkWrite(
      items.map((p) => ({
        updateOne: {
          filter: { user: p.user, movie: p.movie },
          update: { $set: { positionSeconds: p.positionSeconds, updatedAt: now } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (err) {
    console.error('Progress save failed:', err.message);
    for (const p of items) {
      const key = `${p.user}:${p.movie}`;
      if (!progressBuffer.has(key)) progressBuffer.set(key, p);
    }
  }
}

export async function flushRewards() {
  const levels = await getLevels();
  const waiting = [...userStates.values()].filter((s) => s.pending > 0);
  for (let i = 0; i < waiting.length; i += 25) {
    await Promise.all(waiting.slice(i, i + 25).map((s) => flushUser(s, levels)));
  }
  await flushProgress();

  // Forget viewers who have been idle for a while, so memory stays small.
  const cutoff = Date.now() - IDLE_STATE_MS;
  for (const [key, s] of userStates) {
    if (s.pending === 0 && s.lastSeen < cutoff) userStates.delete(key);
  }
}

export function startRewardsJobs() {
  if (timer) return;
  timer = setInterval(() => {
    flushRewards().catch((err) => console.error('Rewards flush failed:', err.message));
  }, env.rewards.flushIntervalMs);
  timer.unref?.();
}

export async function stopRewardsJobs() {
  clearInterval(timer);
  timer = null;
  await flushRewards(); // save everything that is waiting
}

// For tests
export function _resetRewardsState() {
  userStates.clear();
  progressBuffer.clear();
  levelsCache = null;
}

// ---------- reading ----------
export async function getRewardSummary(userId) {
  const [reward, levels] = await Promise.all([Reward.findOne({ user: userId }).lean(), getLevels()]);
  const state = userStates.get(String(userId));
  const total = (reward?.totalSeconds || 0) + (state?.pending || 0);

  const unlocked = levels.filter((l) => l.hours * 3600 <= total);
  const current = unlocked[unlocked.length - 1] || null;
  const next = levels.find((l) => l.hours * 3600 > total) || null;
  const fromHours = current ? current.hours : 0;

  const today = todayKey();
  const todaySeconds = state?.todayDate === today ? state.todaySeconds : reward?.todayDate === today ? reward.todaySeconds : 0;

  return {
    totalSeconds: total,
    totalHours: Number((total / 3600).toFixed(2)),
    level: current ? { key: current.key, name: current.name, perk: current.perk } : null,
    nextLevel: next
      ? {
          key: next.key,
          name: next.name,
          hours: next.hours,
          hoursRemaining: Number(((next.hours * 3600 - total) / 3600).toFixed(2)),
          progressPercent: Math.min(100, Math.max(0, Math.round(((total - fromHours * 3600) / ((next.hours - fromHours) * 3600)) * 100))),
        }
      : null,
    perksUnlocked: unlocked.map((l) => ({ key: l.key, name: l.name, perk: l.perk })),
    pointsBalance: reward?.pointsBalance || 0,
    lifetimePoints: reward?.lifetimePoints || 0,
    todaySeconds,
    dailyCapSeconds: env.rewards.dailyCapSeconds,
  };
}
