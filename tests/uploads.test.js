import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, setupWorld, movieBody, bearer } from './helpers.js';
import Movie from '../src/models/Movie.js';

let app;
let w;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  w = await setupWorld(app);
});

async function createR2Draft(token, title = 'My Own Film') {
  const res = await request(app)
    .post('/api/manager/movies')
    .set(bearer(token))
    .send(movieBody(w.genre._id, { title, videoSource: 'r2', videoUrl: undefined, licenseType: 'owned', licenseProof: 'I made this film' }));
  return res.body.data._id;
}

const sign = (token, body) => request(app).post('/api/manager/uploads/sign').set(bearer(token)).send(body);
const file = (movieId, sizeBytes = 500_000, extra = {}) => ({ movieId, fileName: 'film.mp4', contentType: 'video/mp4', sizeBytes, ...extra });

describe('own-movie uploads', () => {
  test('a draft with an uploaded-file source can be saved without a link', async () => {
    const id = await createR2Draft(w.manager);
    expect(id).toBeTruthy();
  });

  test('sign returns a short-lived upload address and marks the upload as started', async () => {
    const id = await createR2Draft(w.manager);
    const res = await sign(w.manager, file(id));
    expect(res.status).toBe(200);
    expect(res.body.data.uploadUrl).toContain('movies/');
    expect(res.body.data.method).toBe('PUT');
    const movie = await Movie.findById(id);
    expect(movie.uploadStatus).toBe('uploading');
    expect(movie.pendingVideoKey).toBe(res.body.data.key);
  });

  test('only MP4 files and files under the size limit are accepted', async () => {
    const id = await createR2Draft(w.manager);
    expect((await sign(w.manager, file(id, 500_000, { contentType: 'video/x-matroska' }))).status).toBe(400);
    expect((await sign(w.manager, file(id, 2_000_000))).status).toBe(413);
  });

  test('another manager cannot upload to this movie', async () => {
    const id = await createR2Draft(w.manager);
    expect((await sign(w.manager2, file(id))).status).toBe(404);
  });

  test('the free storage quota is enforced', async () => {
    const a = await createR2Draft(w.manager, 'Film A');
    const b = await createR2Draft(w.manager, 'Film B');
    expect((await sign(w.manager, file(a, 1_000_000))).status).toBe(200);
    expect((await sign(w.manager, file(b, 1_000_000))).status).toBe(413); // 2 MB > 1.5 MB quota
    expect((await sign(w.manager, file(b, 400_000))).status).toBe(200);
  });

  test('a movie without its file cannot be submitted or published', async () => {
    const id = await createR2Draft(w.manager);
    expect((await request(app).patch(`/api/manager/movies/${id}/submit`).set(bearer(w.manager))).status).toBe(409);
    const asAdmin = await request(app)
      .post('/api/admin/movies')
      .set(bearer(w.admin))
      .send(movieBody(w.genre._id, { title: 'Admin Film', videoSource: 'r2', videoUrl: undefined, publish: true }));
    expect(asAdmin.status).toBe(409);
  });

  test('complete fails clearly when the file is not in storage and the admin sees the quota', async () => {
    const id = await createR2Draft(w.manager);
    await Movie.updateOne({ _id: id }, { $set: { pendingVideoKey: undefined } });
    const none = await request(app).post('/api/manager/uploads/complete').set(bearer(w.manager)).send({ movieId: id });
    expect(none.status).toBe(409);

    const storage = await request(app).get('/api/admin/storage').set(bearer(w.admin));
    expect(storage.body.data.quotaBytes).toBe(1_500_000);
    expect(storage.body.data.configured).toBe(true);
  });
});
