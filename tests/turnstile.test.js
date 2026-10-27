import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb, getApp } from './helpers.js';
import { env } from '../src/config/env.js';

let app;
beforeAll(async () => {
  await startDb();
  app = await getApp();
});
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  env.turnstileSecret = 'test-secret';
});
afterEach(() => {
  env.turnstileSecret = undefined;
  jest.restoreAllMocks();
});

const signup = (extra = {}) =>
  request(app).post('/api/auth/register').send({ name: 'Sam', email: 'sam@example.com', password: 'Passw0rdX', ...extra });

describe('bot check on sign-up', () => {
  test('sign-up needs a token when the bot check is on', async () => {
    expect((await signup()).status).toBe(400);
  });

  test('a failed check is rejected', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ success: false }) });
    expect((await signup({ turnstileToken: 'bad-token' })).status).toBe(400);
  });

  test('a passed check lets the sign-up through', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ success: true }) });
    expect((await signup({ turnstileToken: 'good-token' })).status).toBe(201);
  });

  test('if Cloudflare cannot be reached, sign-up is paused with a clear message', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    expect((await signup({ turnstileToken: 'any' })).status).toBe(503);
  });
});
