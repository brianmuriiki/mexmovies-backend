import Movie from '../models/Movie.js';
import Genre from '../models/Genre.js';
import { env } from '../config/env.js';
import { PUBLIC_EXCLUDE, presentPublicMovie } from './moviePresenter.js';
import { publicFilter } from './visibility.js';
import { putJson, r2Configured } from './r2.js';

// The catalog snapshot is one JSON file with every public movie. The public site loads it once
// and searches and filters in the browser, so viewers never touch Express or MongoDB.
//   - served by GET /api/catalog (cached by the CDN)
//   - also uploaded to R2 as catalog/catalog.json when R2 is configured
// Movies in their early-access period are left out until their release date.

const MAX_AGE_MS = 60 * 60 * 1000; // rebuilt at least hourly even if nothing signalled a change
let cached = null;
let cachedAt = 0;
let timer = null;
let releaseTimer = null;

export async function buildCatalog() {
  const [movies, genres] = await Promise.all([
    Movie.find(publicFilter())
      .select(`${PUBLIC_EXCLUDE} -views`)
      .populate('genres', 'name slug')
      .sort({ publishedAt: -1 })
      .lean(),
    Genre.find().sort({ name: 1 }).select('name slug -_id').lean(),
  ]);
  cached = {
    generatedAt: new Date().toISOString(),
    count: movies.length,
    genres,
    movies: movies.map(presentPublicMovie),
  };
  cachedAt = Date.now();
  return cached;
}

export async function getCatalog() {
  if (cached && Date.now() - cachedAt < MAX_AGE_MS) return cached;
  return buildCatalog();
}

// Rebuilds the snapshot and uploads it to R2 (when configured).
export async function publishSnapshot() {
  const data = await buildCatalog();
  if (r2Configured()) {
    await putJson({ key: 'catalog/catalog.json', body: JSON.stringify(data), cacheControl: 'public, max-age=300' });
  }
  return data;
}

// When an early-access movie becomes public, the catalog must be rebuilt at that moment.
export async function scheduleNextRelease() {
  clearTimeout(releaseTimer);
  const next = await Movie.findOne({ status: 'published', publicAt: { $gt: new Date() } })
    .sort({ publicAt: 1 })
    .select('publicAt')
    .lean();
  if (!next) return;
  const wait = Math.min(next.publicAt.getTime() - Date.now() + 1000, 12 * 60 * 60 * 1000);
  releaseTimer = setTimeout(async () => {
    try {
      await publishSnapshot();
    } catch (err) {
      console.error('Release snapshot failed:', err.message);
    }
    scheduleNextRelease().catch((err) => console.error('Release schedule failed:', err.message));
  }, Math.max(wait, 1000));
  releaseTimer.unref?.();
}

// Call after any publish, unpublish, edit of a published movie, or delete.
// The in-memory copy is dropped at once; the upload is delayed a few seconds so rapid edits are batched.
export async function afterCatalogChange() {
  cached = null;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      await publishSnapshot();
      await scheduleNextRelease();
    } catch (err) {
      console.error('Catalog snapshot failed:', err.message);
    }
  }, env.snapshotDelayMs);
  timer.unref?.();
}
