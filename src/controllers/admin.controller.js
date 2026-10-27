import Movie from '../models/Movie.js';
import User from '../models/User.js';
import Genre from '../models/Genre.js';
import Watchlist from '../models/Watchlist.js';
import ActivityLog from '../models/ActivityLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { pageResult } from '../utils/pagination.js';
import { uniqueSlug } from '../utils/slugify.js';
import { validateVideoSource } from '../services/videoValidator.js';
import { assertGenresExist, assertPlayable, escapeRegex, removeUploadedFiles } from '../services/movieService.js';
import { logActivity } from '../services/activityLogger.js';
import { afterCatalogChange } from '../services/catalogSnapshot.js';

const log = (req, action, targetType, targetId, details) =>
  logActivity({ actor: req.user._id, action, targetType, targetId, details });

async function findMovie(id) {
  const movie = await Movie.findById(id);
  if (!movie) throw new ApiError(404, 'Movie not found');
  return movie;
}

// ============ Movies ============

// GET /api/admin/movies?status=pending&q=...
export const listMovies = asyncHandler(async (req, res) => {
  const { page, limit, status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  const [movies, total] = await Promise.all([
    Movie.find(filter)
      .populate('genres', 'name slug')
      .populate('addedBy', 'name email')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Movie.countDocuments(filter),
  ]);
  res.json(pageResult(movies, total, page, limit));
});

// GET /api/admin/movies/:id
export const getMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findById(req.params.id)
    .populate('genres', 'name slug')
    .populate('addedBy', 'name email')
    .populate('approvedBy', 'name email');
  if (!movie) throw new ApiError(404, 'Movie not found');
  res.json({ data: movie });
});

// POST /api/admin/movies  (admin can publish straight away)
export const createMovie = asyncHandler(async (req, res) => {
  const { publish, ...data } = req.body;
  validateVideoSource(data);
  await assertGenresExist(data.genres);
  if (publish) assertPlayable(data); // uploaded movies: save a draft, upload the file, then publish

  const movie = await Movie.create({
    ...data,
    slug: await uniqueSlug(Movie, data.title),
    status: publish ? 'published' : 'draft',
    addedBy: req.user._id,
    ...(publish ? { approvedBy: req.user._id, publishedAt: new Date() } : {}),
  });
  await log(req, 'movie.create', 'movie', movie._id, { title: movie.title, status: movie.status });
  if (publish) await afterCatalogChange();
  res.status(201).json({ data: movie });
});

// PUT /api/admin/movies/:id
export const updateMovie = asyncHandler(async (req, res) => {
  const movie = await findMovie(req.params.id);
  validateVideoSource({
    videoSource: movie.videoSource,
    videoUrl: movie.videoUrl,
    videoKey: movie.videoKey,
    ...req.body,
  });
  if (req.body.genres) await assertGenresExist(req.body.genres);

  if (movie.videoSource === 'r2' && req.body.videoSource && req.body.videoSource !== 'r2') {
    await removeUploadedFiles(movie);
  }
  Object.assign(movie, req.body);
  if (movie.status === 'published') assertPlayable(movie);
  await movie.save();
  await log(req, 'movie.update', 'movie', movie._id, { title: movie.title });
  if (movie.status === 'published') await afterCatalogChange();
  res.json({ data: movie });
});

// PATCH /api/admin/movies/:id/approve
export const approveMovie = asyncHandler(async (req, res) => {
  const movie = await findMovie(req.params.id);
  if (!['pending', 'unpublished'].includes(movie.status)) {
    throw new ApiError(409, 'Only pending or unpublished movies can be approved');
  }
  assertPlayable(movie);
  const earlyDays = req.body.earlyAccessDays || 0; // Platinum viewers get this many days of early access
  movie.status = 'published';
  movie.approvedBy = req.user._id;
  movie.publishedAt = movie.publishedAt || new Date();
  movie.publicAt = earlyDays > 0 ? new Date(Date.now() + earlyDays * 86400000) : undefined;
  movie.rejectionReason = undefined;
  await movie.save();
  await log(req, 'movie.approve', 'movie', movie._id, { title: movie.title, earlyAccessDays: earlyDays });
  await afterCatalogChange();
  res.json({ data: movie });
});

// PATCH /api/admin/movies/:id/reject
export const rejectMovie = asyncHandler(async (req, res) => {
  const movie = await findMovie(req.params.id);
  if (movie.status !== 'pending') {
    throw new ApiError(409, 'Only pending movies can be rejected');
  }
  movie.status = 'rejected';
  movie.rejectionReason = req.body.reason;
  await movie.save();
  await log(req, 'movie.reject', 'movie', movie._id, { title: movie.title, reason: req.body.reason });
  res.json({ data: movie });
});

// PATCH /api/admin/movies/:id/unpublish
export const unpublishMovie = asyncHandler(async (req, res) => {
  const movie = await findMovie(req.params.id);
  if (movie.status !== 'published') {
    throw new ApiError(409, 'Only published movies can be unpublished');
  }
  movie.status = 'unpublished';
  await movie.save();
  await log(req, 'movie.unpublish', 'movie', movie._id, { title: movie.title });
  await afterCatalogChange();
  res.json({ data: movie });
});

// DELETE /api/admin/movies/:id
export const deleteMovie = asyncHandler(async (req, res) => {
  const movie = await findMovie(req.params.id);
  const wasPublished = movie.status === 'published';
  await removeUploadedFiles(movie); // also deletes the file from storage
  await Promise.all([movie.deleteOne(), Watchlist.deleteMany({ movie: movie._id })]);
  await log(req, 'movie.delete', 'movie', movie._id, { title: movie.title });
  if (wasPublished) await afterCatalogChange();
  res.status(204).end();
});

// ============ Users (managers and viewers) ============

// GET /api/admin/users?role=manager&q=...
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, role, q } = req.query;
  const filter = { role: role || { $in: ['manager', 'viewer'] } };
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json(pageResult(users, total, page, limit));
});

// POST /api/admin/users  (creates a manager)
export const createManager = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) {
    throw new ApiError(409, 'An account with this email already exists');
  }
  const user = await User.create({
    name,
    email,
    passwordHash: await User.hashPassword(password),
    role: 'manager',
    emailVerified: true, // created by the admin, so the address is trusted
    createdBy: req.user._id,
  });
  await log(req, 'user.create', 'user', user._id, { email, role: 'manager' });
  res.status(201).json({ data: user });
});

// PATCH /api/admin/users/:id  (rename, disable/enable, reset password)
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(403, 'Admin accounts cannot be changed here');
  if (String(user._id) === String(req.user._id)) throw new ApiError(403, 'You cannot change your own account here');

  const { name, isActive, password } = req.body;
  if (name !== undefined) user.name = name;
  if (isActive !== undefined) user.isActive = isActive;
  if (password !== undefined) user.passwordHash = await User.hashPassword(password);
  await user.save();

  const action = isActive === false ? 'user.disable' : isActive === true ? 'user.enable' : 'user.update';
  await log(req, action, 'user', user._id, {
    email: user.email,
    passwordReset: password !== undefined,
  });
  res.json({ data: user });
});

// ============ Logs and stats ============

// GET /api/admin/logs
export const listLogs = asyncHandler(async (req, res) => {
  const { page, limit, action } = req.query;
  const filter = action ? { action } : {};
  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);
  res.json(pageResult(logs, total, page, limit));
});

// GET /api/admin/stats
export const stats = asyncHandler(async (_req, res) => {
  const [movieCounts, userCounts, genres] = await Promise.all([
    Movie.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Genre.countDocuments(),
  ]);
  const toObject = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
  res.json({ data: { movies: toObject(movieCounts), users: toObject(userCounts), genres } });
});
