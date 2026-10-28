import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, setupWorld, bearer, movieBody } from './helpers.js';

let app;
let world;
let movieId;

beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  world = await setupWorld(app);
  const created = await request(app)
    .post('/api/admin/movies')
    .set(bearer(world.admin))
    .send(movieBody(world.genre._id, { publish: true }));
  movieId = String(created.body.data._id);
});

describe('movie reports', () => {
  test('public users can submit a report and admins can review and update it', async () => {
    const submitted = await request(app)
      .post(`/api/movies/${movieId}/report`)
      .set(bearer(world.viewer))
      .send({ reason: 'infringement', message: 'Rights holder complaint', email: 'rights@example.com' });
    expect(submitted.status).toBe(201);

    const listed = await request(app).get('/api/admin/reports?status=open').set(bearer(world.admin));
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.data[0]).toMatchObject({
      reason: 'infringement',
      user: { name: 'Test User', email: 'viewer@test.com' },
      reporterEmail: 'rights@example.com',
      status: 'open',
      movie: { _id: movieId, title: 'Nosferatu' },
    });

    const updated = await request(app)
      .patch(`/api/admin/reports/${listed.body.data[0]._id}`)
      .set(bearer(world.admin))
      .send({ status: 'resolved', note: 'Reviewed the rights claim' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('resolved');
    expect(updated.body.data.handledBy.name).toBe('Test User');

    const stats = await request(app).get('/api/admin/stats').set(bearer(world.admin));
    expect(stats.body.data.openReports).toBe(0);
  });

  test('report submission rejects invalid movies and malformed payloads', async () => {
    const missingMovie = await request(app).post(`/api/movies/${'0'.repeat(24)}/report`).send({ reason: 'other' });
    expect(missingMovie.status).toBe(404);

    const badBody = await request(app).post(`/api/movies/${movieId}/report`).send({ reason: 'invalid' });
    expect(badBody.status).toBe(400);
  });
});
