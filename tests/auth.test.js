import request from 'supertest';
import { startDb, stopDb, clearDb, getApp, createUser, loginAs, bearer } from './helpers.js';
import User from '../src/models/User.js';
import { createToken } from '../src/services/tokens.js';

let app;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(clearDb);

describe('sign-up and login', () => {
  test('register always creates a viewer, even if a role is sent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sam', email: 'sam@example.com', password: 'Passw0rdX', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('viewer');
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  test('duplicate email is rejected', async () => {
    const body = { name: 'Sam', email: 'sam@example.com', password: 'Passw0rdX' };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  test('weak passwords are rejected', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Sam', email: 's@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  test('wrong password and unknown email give the same answer', async () => {
    await createUser({ email: 'a@test.com' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'a@test.com', password: 'WrongPass1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'WrongPass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  test('login sets a cookie that works for /me, and logout clears it', async () => {
    await createUser({ email: 'a@test.com' });
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: 'a@test.com', password: 'Passw0rdX' })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.data.email).toBe('a@test.com');
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  test('a disabled account cannot log in', async () => {
    const user = await createUser({ email: 'a@test.com' });
    user.isActive = false;
    await user.save();
    const res = await request(app).post('/api/auth/login').send({ email: 'a@test.com', password: 'Passw0rdX' });
    expect(res.status).toBe(401);
  });
});

describe('email verification and password reset', () => {
  test('verify-email confirms the address and the link works only once', async () => {
    const user = await createUser({ email: 'a@test.com' });
    user.emailVerified = false;
    const { token, hash } = createToken();
    user.verifyTokenHash = hash;
    user.verifyExpiresAt = new Date(Date.now() + 3600_000);
    await user.save();

    const ok = await request(app).post('/api/auth/verify-email').send({ token });
    expect(ok.status).toBe(200);
    expect((await User.findById(user._id)).emailVerified).toBe(true);

    const again = await request(app).post('/api/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
  });

  test('expired verification links are rejected', async () => {
    const user = await createUser({ email: 'a@test.com' });
    const { token, hash } = createToken();
    user.verifyTokenHash = hash;
    user.verifyExpiresAt = new Date(Date.now() - 1000);
    await user.save();
    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(400);
  });

  test('forgot-password answers the same for unknown emails', async () => {
    await createUser({ email: 'a@test.com' });
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'a@test.com' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@test.com' });
    expect(known.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
  });

  test('reset-password sets a new password', async () => {
    const user = await createUser({ email: 'a@test.com' });
    const { token, hash } = createToken();
    user.resetTokenHash = hash;
    user.resetExpiresAt = new Date(Date.now() + 3600_000);
    await user.save();

    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNew123' });
    expect(res.status).toBe(200);
    expect(await loginAs(app, 'a@test.com', 'BrandNew123')).toBeTruthy();
    expect(await loginAs(app, 'a@test.com', 'Passw0rdX')).toBeUndefined();
  });
});

describe('account', () => {
  test('change password needs the current password', async () => {
    await createUser({ email: 'a@test.com' });
    const token = await loginAs(app, 'a@test.com');
    const bad = await request(app).patch('/api/account/password').set(bearer(token)).send({ currentPassword: 'nope', newPassword: 'BrandNew123' });
    expect(bad.status).toBe(403);
    const good = await request(app).patch('/api/account/password').set(bearer(token)).send({ currentPassword: 'Passw0rdX', newPassword: 'BrandNew123' });
    expect(good.status).toBe(200);
  });

  test('a viewer can delete their account; staff cannot', async () => {
    await createUser({ email: 'v@test.com' });
    await createUser({ role: 'manager', email: 'm@test.com' });
    const viewer = await loginAs(app, 'v@test.com');
    const manager = await loginAs(app, 'm@test.com');

    expect((await request(app).delete('/api/account').set(bearer(manager)).send({ password: 'Passw0rdX' })).status).toBe(403);
    expect((await request(app).delete('/api/account').set(bearer(viewer)).send({ password: 'Passw0rdX' })).status).toBe(204);
    expect(await User.findOne({ email: 'v@test.com' })).toBeNull();
  });
});
