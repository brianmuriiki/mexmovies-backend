import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, setupWorld, createUser, loginAs, movieBody, bearer } from './helpers.js';
import Movie from '../src/models/Movie.js';
import Reward from '../src/models/Reward.js';
import { afterCatalogChange } from '../src/services/catalogSnapshot.js';

let app;
let w;
let platinum;
let silver;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  w = await setupWorld(app);
  const p = await createUser({ email: 'plat@test.com' });
  const s = await createUser({ email: 'silver@test.com' });
  await Reward.create({ user: p._id, level: 'platinum' });
  await Reward.create({ user: s._id, level: 'silver' });
  platinum = await loginAs(app, 'plat@test.com');
  silver = await loginAs(app, 'silver@test.com');
});

async function publishWithEarlyAccess(days) {
  const c = await request(app).post('/api/manager/movies').set(bearer(w.manager)).send(movieBody(w.genre._id, { submit: true }));
  const id = c.body.data._id;
  const res = await request(app).patch(`/api/admin/movies/${id}/approve`).set(bearer(w.admin)).send({ earlyAccessDays: days });
  return { id, res };
}

describe('Platinum early access', () => {
  test('an early-access movie is hidden from the public but open to Platinum viewers and staff', async () => {
    const { res } = await publishWithEarlyAccess(7);
    expect(res.status).toBe(200);
    expect(res.body.data.publicAt).toBeTruthy();

    expect((await request(app).get('/api/movies')).body.total).toBe(0);
    expect((await request(app).get('/api/movies/nosferatu')).status).toBe(404);
    expect((await request(app).get('/api/catalog')).body.count).toBe(0);

    const early = await request(app).get('/api/early-access').set(bearer(platinum));
    expect(early.status).toBe(200);
    expect(early.body.data).toHaveLength(1);
    expect((await request(app).get('/api/early-access/nosferatu').set(bearer(platinum))).status).toBe(200);
    expect((await request(app).get('/api/early-access').set(bearer(w.manager))).status).toBe(200);
  });

  test('other viewers and visitors cannot use early access', async () => {
    await publishWithEarlyAccess(7);
    expect((await request(app).get('/api/early-access').set(bearer(silver))).status).toBe(403);
    expect((await request(app).get('/api/early-access').set(bearer(w.viewer))).status).toBe(403);
    expect((await request(app).get('/api/early-access')).status).toBe(401);
  });

  test('the movie becomes public when its date passes', async () => {
    const { id } = await publishWithEarlyAccess(7);
    await Movie.updateOne({ _id: id }, { $set: { publicAt: new Date(Date.now() - 1000) } });
    await afterCatalogChange();

    expect((await request(app).get('/api/movies')).body.total).toBe(1);
    expect((await request(app).get('/api/catalog')).body.count).toBe(1);
    expect((await request(app).get('/api/early-access').set(bearer(platinum))).body.data).toHaveLength(0);
  });

  test('approving without early access publishes at once; the length is limited', async () => {
    const { res } = await publishWithEarlyAccess(0);
    expect(res.body.data.publicAt).toBeUndefined();
    expect((await request(app).get('/api/movies')).body.total).toBe(1);

    const c = await request(app).post('/api/manager/movies').set(bearer(w.manager)).send(movieBody(w.genre._id, { title: 'Second', submit: true }));
    const bad = await request(app).patch(`/api/admin/movies/${c.body.data._id}/approve`).set(bearer(w.admin)).send({ earlyAccessDays: 99 });
    expect(bad.status).toBe(400);
  });
});
