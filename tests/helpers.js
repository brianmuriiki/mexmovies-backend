import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

export async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await import('../src/app.js'); // registers every model
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init())); // builds indexes
}

export async function stopDb() {
  await mongoose.disconnect();
  await mongod.stop();
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export async function getApp() {
  return (await import('../src/app.js')).default;
}

export async function createUser({ role = 'viewer', email, password = 'Passw0rdX', name = 'Test User' }) {
  const User = (await import('../src/models/User.js')).default;
  return User.create({
    name,
    email,
    passwordHash: await User.hashPassword(password),
    role,
    emailVerified: true,
  });
}

export async function loginAs(app, email, password = 'Passw0rdX') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

export async function createGenre(name = 'Horror') {
  const Genre = (await import('../src/models/Genre.js')).default;
  return Genre.create({ name, slug: name.toLowerCase() });
}

export const movieBody = (genreId, overrides = {}) => ({
  title: 'Nosferatu',
  description: 'A classic silent vampire film from 1922.',
  genres: [String(genreId)],
  releaseYear: 1922,
  duration: 94,
  language: 'German',
  posterUrl: 'https://example.com/poster.jpg',
  videoSource: 'archive',
  videoUrl: 'https://archive.org/details/nosferatu',
  licenseType: 'public-domain',
  licenseProof: 'Public domain in the US (published 1922)',
  ...overrides,
});

// Creates an admin, a manager, a viewer, and a genre, and logs them in.
export async function setupWorld(app) {
  await createUser({ role: 'admin', email: 'admin@test.com' });
  await createUser({ role: 'manager', email: 'manager@test.com' });
  await createUser({ role: 'manager', email: 'manager2@test.com' });
  await createUser({ role: 'viewer', email: 'viewer@test.com' });
  const genre = await createGenre();
  return {
    genre,
    admin: await loginAs(app, 'admin@test.com'),
    manager: await loginAs(app, 'manager@test.com'),
    manager2: await loginAs(app, 'manager2@test.com'),
    viewer: await loginAs(app, 'viewer@test.com'),
  };
}
