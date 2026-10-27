import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, setupWorld, createUser, loginAs, bearer } from './helpers.js';
import Reward from '../src/models/Reward.js';

let app;
let w;
let gold;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  w = await setupWorld(app);
  const g = await createUser({ email: 'gold@test.com' });
  await Reward.create({ user: g._id, level: 'gold' });
  gold = await loginAs(app, 'gold@test.com');
});

const pollBody = { title: 'Which film next?', options: [{ title: 'Metropolis' }, { title: 'Nosferatu' }] };
const createPoll = (body = pollBody) => request(app).post('/api/admin/polls').set(bearer(w.admin)).send(body);

describe('Gold voting', () => {
  test('only the admin creates polls, and a poll needs at least two options', async () => {
    expect((await request(app).post('/api/admin/polls').set(bearer(w.manager)).send(pollBody)).status).toBe(403);
    expect((await createPoll({ title: 'One option only', options: [{ title: 'A' }] })).status).toBe(400);
    const ok = await createPoll();
    expect(ok.status).toBe(201);
    expect(ok.body.data.options).toHaveLength(2);
  });

  test('viewers below Gold can see polls but cannot vote', async () => {
    const poll = (await createPoll()).body.data;
    const list = await request(app).get('/api/polls').set(bearer(w.viewer));
    expect(list.body.data[0].canVote).toBe(false);
    const res = await request(app).post(`/api/polls/${poll.id}/vote`).set(bearer(w.viewer)).send({ optionId: poll.options[0].id });
    expect(res.status).toBe(403);
  });

  test('a Gold viewer votes once, can change their vote, and results update', async () => {
    const poll = (await createPoll()).body.data;
    const [a, b] = poll.options;

    const first = await request(app).post(`/api/polls/${poll.id}/vote`).set(bearer(gold)).send({ optionId: a.id });
    expect(first.status).toBe(200);
    expect(first.body.data.totalVotes).toBe(1);
    expect(first.body.data.myVoteOptionId).toBe(a.id);

    const changed = await request(app).post(`/api/polls/${poll.id}/vote`).set(bearer(gold)).send({ optionId: b.id });
    expect(changed.body.data.totalVotes).toBe(1);
    expect(changed.body.data.options.find((o) => o.id === b.id).votes).toBe(1);
    expect(changed.body.data.options.find((o) => o.id === a.id).votes).toBe(0);
  });

  test('an option from another poll is rejected, and closed polls take no votes', async () => {
    const poll = (await createPoll()).body.data;
    const other = (await createPoll({ title: 'Another poll', options: [{ title: 'X' }, { title: 'Y' }] })).body.data;
    const wrong = await request(app).post(`/api/polls/${poll.id}/vote`).set(bearer(gold)).send({ optionId: other.options[0].id });
    expect(wrong.status).toBe(400);

    await request(app).patch(`/api/admin/polls/${poll.id}/close`).set(bearer(w.admin));
    const late = await request(app).post(`/api/polls/${poll.id}/vote`).set(bearer(gold)).send({ optionId: poll.options[0].id });
    expect(late.status).toBe(409);
    const open = await request(app).get('/api/polls').set(bearer(gold));
    expect(open.body.data.map((p) => p.id)).not.toContain(poll.id);
  });

  test('deleting a poll removes its votes', async () => {
    const poll = (await createPoll()).body.data;
    await request(app).post(`/api/polls/${poll.id}/vote`).set(bearer(gold)).send({ optionId: poll.options[0].id });
    expect((await request(app).delete(`/api/admin/polls/${poll.id}`).set(bearer(w.admin))).status).toBe(204);
    expect((await request(app).get('/api/admin/polls').set(bearer(w.admin))).body.data).toHaveLength(0);
  });
});
