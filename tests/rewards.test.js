import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, createUser, loginAs, bearer } from './helpers.js';
import { env } from '../src/config/env.js';
import Reward from '../src/models/Reward.js';
import PointsTransaction from '../src/models/PointsTransaction.js';
import RedemptionItem from '../src/models/RedemptionItem.js';
import { creditHeartbeat, flushRewards, _resetRewardsState } from '../src/services/rewardsService.js';

let app;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);

let user;
beforeEach(async () => {
  await clearDb();
  _resetRewardsState();
  user = await createUser({ email: 'v@test.com' });
});

const beat = (over = {}) => creditHeartbeat({ userId: user._id, sessionId: 'session-1', claimedSeconds: 300, ...over });

describe('watch-time credits', () => {
  test('credit is limited by the real time that passed', async () => {
    const t0 = Date.now();
    expect((await beat({ now: t0 })).credited).toBe(120); // first heartbeat: small allowance
    expect((await beat({ now: t0 + 60_000 })).credited).toBe(70); // 60 s passed + 10 s grace
    expect((await beat({ now: t0 + 60_000 + 300_000 })).credited).toBe(300); // a full 5 minutes later
  });

  test('the daily cap stops credit', async () => {
    const original = env.rewards.dailyCapSeconds;
    env.rewards.dailyCapSeconds = 100;
    try {
      const t0 = Date.now();
      expect((await beat({ now: t0 })).credited).toBe(100);
      const second = await beat({ now: t0 + 300_000 });
      expect(second.credited).toBe(0);
      expect(second.reason).toBe('daily_cap');
    } finally {
      env.rewards.dailyCapSeconds = original;
    }
  });

  test('only one active session earns time', async () => {
    const t0 = Date.now();
    await beat({ now: t0 });
    const other = await beat({ now: t0 + 10_000, sessionId: 'session-2' });
    expect(other.credited).toBe(0);
    expect(other.reason).toBe('other_session');
  });

  test('saving adds points (1 per minute) and a bonus for reaching a level', async () => {
    await Reward.create({ user: user._id, totalSeconds: 17_990 }); // just under 5 hours (Bronze)
    await beat({ now: Date.now() }); // credits 120 s
    await flushRewards();

    const reward = await Reward.findOne({ user: user._id });
    expect(reward.totalSeconds).toBe(18_110);
    expect(reward.level).toBe('bronze');
    expect(reward.pointsBalance).toBe(2 + 100); // 2 watch points + Bronze bonus
    expect(reward.lifetimePoints).toBe(102);

    const types = (await PointsTransaction.find({ user: user._id })).map((t) => [t.type, t.amount]).sort();
    expect(types).toEqual([['bonus_level', 100], ['earn_watch', 2]]);
  });

  test('a balance always equals the sum of its history', async () => {
    const t0 = Date.now();
    await beat({ now: t0 });
    await flushRewards();
    await beat({ now: t0 + 130_000, claimedSeconds: 120 });
    await flushRewards();
    const reward = await Reward.findOne({ user: user._id });
    const sum = (await PointsTransaction.find({ user: user._id })).reduce((a, t) => a + t.amount, 0);
    expect(reward.pointsBalance).toBe(sum);
  });
});

describe('rewards API', () => {
  test('heartbeat requires login and validates input', async () => {
    const body = { movieId: '64b000000000000000000001', sessionId: 'session-abcdef', seconds: 60 };
    expect((await request(app).post('/api/watch/heartbeat').send(body)).status).toBe(401);
    const token = await loginAs(app, 'v@test.com');
    expect((await request(app).post('/api/watch/heartbeat').set(bearer(token)).send({ ...body, seconds: 9999 })).status).toBe(400);
    const ok = await request(app).post('/api/watch/heartbeat').set(bearer(token)).send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.data.credited).toBe(60);
  });

  test('levels are public; /me shows progress including unsaved time', async () => {
    const levels = await request(app).get('/api/rewards/levels');
    expect(levels.body.data.map((l) => l.key)).toEqual(['bronze', 'silver', 'gold', 'platinum']);

    const token = await loginAs(app, 'v@test.com');
    await request(app).post('/api/watch/heartbeat').set(bearer(token)).send({ movieId: '64b000000000000000000001', sessionId: 'session-abcdef', seconds: 120 });
    const me = await request(app).get('/api/rewards/me').set(bearer(token));
    expect(me.body.data.totalSeconds).toBe(120);
    expect(me.body.data.nextLevel.key).toBe('bronze');
  });

  test('redeeming is switched off by default', async () => {
    const token = await loginAs(app, 'v@test.com');
    const item = await RedemptionItem.create({ name: '1 month', costPoints: 100 });
    const res = await request(app).post('/api/rewards/redeem').set(bearer(token)).send({ itemId: String(item._id) });
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/rewards/catalog').set(bearer(token))).body.data).toEqual([]);
  });

  test('redeeming spends points once, and never below zero (when switched on)', async () => {
    env.redemptionEnabled = true;
    try {
      const token = await loginAs(app, 'v@test.com');
      await Reward.create({ user: user._id, pointsBalance: 150, lifetimePoints: 150 });
      const item = await RedemptionItem.create({ name: '1 month', costPoints: 100 });

      const first = await request(app).post('/api/rewards/redeem').set(bearer(token)).send({ itemId: String(item._id) });
      expect(first.status).toBe(201);
      expect(first.body.data.pointsBalance).toBe(50);
      const second = await request(app).post('/api/rewards/redeem').set(bearer(token)).send({ itemId: String(item._id) });
      expect(second.status).toBe(409);
      expect((await Reward.findOne({ user: user._id })).pointsBalance).toBe(50);
    } finally {
      env.redemptionEnabled = false;
    }
  });

  test('admin can adjust points with a reason, but not below zero', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin@test.com' });
    const token = await loginAs(app, 'admin@test.com');
    const give = await request(app).post('/api/admin/points/adjust').set(bearer(token)).send({ userId: String(user._id), amount: 50, reason: 'Contest winner' });
    expect(give.body.data.pointsBalance).toBe(50);
    const tooMuch = await request(app).post('/api/admin/points/adjust').set(bearer(token)).send({ userId: String(user._id), amount: -80, reason: 'Abuse correction' });
    expect(tooMuch.status).toBe(409);
    const noReason = await request(app).post('/api/admin/points/adjust').set(bearer(token)).send({ userId: String(user._id), amount: 5, reason: 'x' });
    expect(noReason.status).toBe(400);
    expect(admin).toBeTruthy();
  });
});
