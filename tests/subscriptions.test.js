import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, createUser, loginAs, bearer } from './helpers.js';
import { env } from '../src/config/env.js';
import Reward from '../src/models/Reward.js';
import RedemptionItem from '../src/models/RedemptionItem.js';
import Subscription from '../src/models/Subscription.js';

let app;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(clearDb);

const DAY = 86400000;

describe('subscriptions', () => {
  test('redeeming points activates a subscription, and a second redemption extends it', async () => {
    env.redemptionEnabled = true;
    try {
      const user = await createUser({ email: 'v@test.com' });
      const token = await loginAs(app, 'v@test.com');
      await Reward.create({ user: user._id, pointsBalance: 500, lifetimePoints: 500 });
      const item = await RedemptionItem.create({ name: '1 month', costPoints: 100, durationDays: 30 });

      expect((await request(app).get('/api/subscription').set(bearer(token))).body.data.active).toBe(false);

      const first = await request(app).post('/api/rewards/redeem').set(bearer(token)).send({ itemId: String(item._id) });
      expect(first.status).toBe(201);
      expect(first.body.data.subscription.source).toBe('points');
      expect(first.body.data.pointsBalance).toBe(400);

      const status = await request(app).get('/api/subscription').set(bearer(token));
      expect(status.body.data.active).toBe(true);
      expect(status.body.data.daysRemaining).toBe(30);

      await request(app).post('/api/rewards/redeem').set(bearer(token)).send({ itemId: String(item._id) });
      const sub = await Subscription.findOne({ user: user._id });
      const days = (sub.endsAt.getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(59.9);
      expect(days).toBeLessThan(60.1);
    } finally {
      env.redemptionEnabled = false;
    }
  });

  test('an expired subscription restarts from today', async () => {
    env.redemptionEnabled = true;
    try {
      const user = await createUser({ email: 'v@test.com' });
      const token = await loginAs(app, 'v@test.com');
      await Reward.create({ user: user._id, pointsBalance: 500 });
      await Subscription.create({ user: user._id, plan: 'old', source: 'points', startsAt: new Date(Date.now() - 90 * DAY), endsAt: new Date(Date.now() - 10 * DAY) });
      const item = await RedemptionItem.create({ name: '1 month', costPoints: 100, durationDays: 30 });

      await request(app).post('/api/rewards/redeem').set(bearer(token)).send({ itemId: String(item._id) });
      const status = await request(app).get('/api/subscription').set(bearer(token));
      expect(status.body.data.daysRemaining).toBe(30);
    } finally {
      env.redemptionEnabled = false;
    }
  });

  test('the admin can grant a subscription; others cannot', async () => {
    const user = await createUser({ email: 'v@test.com' });
    await createUser({ role: 'admin', email: 'admin@test.com' });
    await createUser({ role: 'manager', email: 'm@test.com' });
    const admin = await loginAs(app, 'admin@test.com');
    const manager = await loginAs(app, 'm@test.com');
    const body = { userId: String(user._id), days: 10, reason: 'Contest prize' };

    expect((await request(app).post('/api/admin/subscriptions').set(bearer(manager)).send(body)).status).toBe(403);
    const res = await request(app).post('/api/admin/subscriptions').set(bearer(admin)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.active).toBe(true);
    expect(res.body.data.source).toBe('admin');
  });
});
