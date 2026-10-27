import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, setupWorld, movieBody, bearer } from './helpers.js';

let app;
let w; // the world: tokens and a genre
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  w = await setupWorld(app);
});

const createAsManager = (token, body) => request(app).post('/api/manager/movies').set(bearer(token)).send(body);

describe('permissions', () => {
  test('visitors get 401, viewers 403 on staff routes, managers 403 on admin routes', async () => {
    expect((await request(app).get('/api/manager/movies')).status).toBe(401);
    expect((await request(app).get('/api/manager/movies').set(bearer(w.viewer))).status).toBe(403);
    expect((await request(app).get('/api/admin/stats').set(bearer(w.manager))).status).toBe(403);
    expect((await request(app).get('/api/admin/stats').set(bearer(w.admin))).status).toBe(200);
  });

  test('only the admin can create managers, and they always get the manager role', async () => {
    const body = { name: 'New Manager', email: 'new@test.com', password: 'Manager123' };
    expect((await request(app).post('/api/admin/users').set(bearer(w.manager)).send(body)).status).toBe(403);
    const res = await request(app).post('/api/admin/users').set(bearer(w.admin)).send({ ...body, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('manager');
  });
});

describe('movie workflow', () => {
  test('draft -> submit -> approve -> public, and license details stay private', async () => {
    const created = await createAsManager(w.manager, movieBody(w.genre._id));
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('draft');
    const id = created.body.data._id;

    expect((await request(app).get('/api/movies')).body.total).toBe(0);

    const submitted = await request(app).patch(`/api/manager/movies/${id}/submit`).set(bearer(w.manager));
    expect(submitted.body.data.status).toBe('pending');
    expect((await request(app).get('/api/movies')).body.total).toBe(0);

    const approved = await request(app).patch(`/api/admin/movies/${id}/approve`).set(bearer(w.admin));
    expect(approved.body.data.status).toBe('published');

    const list = await request(app).get('/api/movies');
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].licenseProof).toBeUndefined();
    expect(list.body.data[0].addedBy).toBeUndefined();
    expect(list.headers['cache-control']).toMatch(/public/);

    const one = await request(app).get('/api/movies/nosferatu');
    expect(one.status).toBe(200);
    expect(one.body.data.genres[0].slug).toBe('horror');
  });

  test('a manager cannot edit a published movie or see another manager\'s movie', async () => {
    const created = await createAsManager(w.manager, movieBody(w.genre._id, { submit: true }));
    const id = created.body.data._id;
    await request(app).patch(`/api/admin/movies/${id}/approve`).set(bearer(w.admin));

    const edit = await request(app).put(`/api/manager/movies/${id}`).set(bearer(w.manager)).send({ title: 'Changed' });
    expect(edit.status).toBe(403);

    const other = await request(app).get(`/api/manager/movies/${id}`).set(bearer(w.manager2));
    expect(other.status).toBe(404);
  });

  test('reject with a reason, edit, resubmit', async () => {
    const created = await createAsManager(w.manager, movieBody(w.genre._id, { submit: true }));
    const id = created.body.data._id;

    const noReason = await request(app).patch(`/api/admin/movies/${id}/reject`).set(bearer(w.admin)).send({});
    expect(noReason.status).toBe(400);

    const rejected = await request(app).patch(`/api/admin/movies/${id}/reject`).set(bearer(w.admin)).send({ reason: 'Please add license proof' });
    expect(rejected.body.data.status).toBe('rejected');

    const edited = await request(app).put(`/api/manager/movies/${id}`).set(bearer(w.manager)).send({ licenseProof: 'Link to the Library of Congress record', submit: true });
    expect(edited.body.data.status).toBe('pending');
    expect(edited.body.data.rejectionReason).toBeUndefined();
  });

  test('unpublish hides the movie; delete removes it', async () => {
    const created = await createAsManager(w.manager, movieBody(w.genre._id, { submit: true }));
    const id = created.body.data._id;
    await request(app).patch(`/api/admin/movies/${id}/approve`).set(bearer(w.admin));
    await request(app).patch(`/api/admin/movies/${id}/unpublish`).set(bearer(w.admin));
    expect((await request(app).get('/api/movies/nosferatu')).status).toBe(404);
    expect((await request(app).delete(`/api/admin/movies/${id}`).set(bearer(w.admin))).status).toBe(204);
  });

  test('clients cannot set status, featured, or file fields', async () => {
    const res = await createAsManager(w.manager, movieBody(w.genre._id, { status: 'published', featured: true, videoKey: 'movies/x/steal.mp4' }));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.featured).toBe(false);
    expect(res.body.data.videoKey).toBeUndefined();
  });

  test('video links are checked', async () => {
    const badYoutube = await createAsManager(w.manager, movieBody(w.genre._id, { videoSource: 'youtube', videoUrl: 'https://example.com/watch?v=abc' }));
    expect(badYoutube.status).toBe(400);
    const http = await createAsManager(w.manager, movieBody(w.genre._id, { videoSource: 'mp4', videoUrl: 'http://example.com/a.mp4' }));
    expect(http.status).toBe(400);
    const good = await createAsManager(w.manager, movieBody(w.genre._id, { videoSource: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Another' }));
    expect(good.status).toBe(201);
  });

  test('public search, genre filter, and pagination', async () => {
    for (const title of ['Alpha Film', 'Beta Film', 'Gamma Movie']) {
      const c = await createAsManager(w.manager, movieBody(w.genre._id, { title }));
      await request(app).patch(`/api/manager/movies/${c.body.data._id}/submit`).set(bearer(w.manager));
      await request(app).patch(`/api/admin/movies/${c.body.data._id}/approve`).set(bearer(w.admin));
    }
    expect((await request(app).get('/api/movies?genre=horror')).body.total).toBe(3);
    expect((await request(app).get('/api/movies?genre=comedy')).body.total).toBe(0);
    const page = await request(app).get('/api/movies?limit=2&sort=title');
    expect(page.body.data.map((m) => m.title)).toEqual(['Alpha Film', 'Beta Film']);
    expect(page.body.pages).toBe(2);
    expect((await request(app).get('/api/movies?q=gamma')).body.total).toBe(1);
  });
});

describe('watchlist and catalog', () => {
  test('viewers can add and remove movies; the catalog lists published movies', async () => {
    const c = await createAsManager(w.manager, movieBody(w.genre._id, { submit: true }));
    const id = c.body.data._id;
    await request(app).patch(`/api/admin/movies/${id}/approve`).set(bearer(w.admin));

    expect((await request(app).post(`/api/watchlist/${id}`).set(bearer(w.viewer))).status).toBe(201);
    expect((await request(app).post(`/api/watchlist/${id}`).set(bearer(w.viewer))).status).toBe(201); // twice is fine
    expect((await request(app).get('/api/watchlist').set(bearer(w.viewer))).body.data).toHaveLength(1);
    expect((await request(app).delete(`/api/watchlist/${id}`).set(bearer(w.viewer))).status).toBe(204);
    expect((await request(app).get('/api/watchlist').set(bearer(w.viewer))).body.data).toHaveLength(0);

    const catalog = await request(app).get('/api/catalog');
    expect(catalog.status).toBe(200);
    expect(catalog.body.count).toBe(1);
    expect(catalog.body.movies[0].licenseProof).toBeUndefined();
  });
});
