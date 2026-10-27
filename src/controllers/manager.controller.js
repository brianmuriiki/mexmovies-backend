import Movie from '../models/Movie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { pageResult } from '../utils/pagination.js';
import { uniqueSlug } from '../utils/slugify.js';
import { validateVideoSource } from '../services/videoValidator.js';
import { assertGenresExist, assertPlayable, removeUploadedFiles } from '../services/movieService.js';
import { logActivity } from '../services/activityLogger.js';

const EDITABLE = ['draft', 'pending', 'rejected'];

// Finds a movie and makes sure it belongs to the logged-in manager.
async function findOwnMovie(req) {
  const movie = await Movie.findById(req.params.id);
  if (!movie || String(movie.addedBy) !== String(req.user._id)) {
    throw new ApiError(404, 'Movie not found');
  }
  return movie;
}

// GET /api/manager/movies
export const listMine = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const filter = { addedBy: req.user._id };
  if (status) filter.status = status;
  const [movies, total] = await Promise.all([
    Movie.find(filter)
      .populate('genres', 'name slug')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Movie.countDocuments(filter),
  ]);
  res.json(pageResult(movies, total, page, limit));
});

// GET /api/manager/movies/:id
export const getMine = asyncHandler(async (req, res) => {
  const movie = await findOwnMovie(req);
  await movie.populate('genres', 'name slug');
  res.json({ data: movie });
});

// POST /api/manager/movies
export const createMovie = asyncHandler(async (req, res) => {
  const { submit, ...data } = req.body;
  validateVideoSource(data);
  await assertGenresExist(data.genres);
  if (submit) assertPlayable(data); // an uploaded movie must have its file before it is submitted

  const movie = await Movie.create({
    ...data,
    slug: await uniqueSlug(Movie, data.title),
    status: submit ? 'pending' : 'draft',
    addedBy: req.user._id,
  });
  await logActivity({
    actor: req.user._id,
    action: 'movie.create',
    targetType: 'movie',
    targetId: movie._id,
    details: { title: movie.title, status: movie.status },
  });
  res.status(201).json({ data: movie });
});

// PUT /api/manager/movies/:id
export const updateMovie = asyncHandler(async (req, res) => {
  const movie = await findOwnMovie(req);
  if (!EDITABLE.includes(movie.status)) {
    throw new ApiError(403, 'Published movies can only be changed by an admin');
  }
  const { submit, ...data } = req.body;

  validateVideoSource({
    videoSource: movie.videoSource,
    videoUrl: movie.videoUrl,
    videoKey: movie.videoKey,
    ...data,
  });
  if (data.genres) await assertGenresExist(data.genres);

  // Switching away from an uploaded file removes it from storage.
  if (movie.videoSource === 'r2' && data.videoSource && data.videoSource !== 'r2') {
    await removeUploadedFiles(movie);
  }
  Object.assign(movie, data);
  if (movie.status === 'rejected') {
    movie.status = submit ? 'pending' : 'draft';
    movie.rejectionReason = undefined;
  } else if (submit && movie.status === 'draft') {
    movie.status = 'pending';
  }
  if (movie.status === 'pending') assertPlayable(movie);
  await movie.save();

  await logActivity({
    actor: req.user._id,
    action: 'movie.update',
    targetType: 'movie',
    targetId: movie._id,
    details: { title: movie.title, status: movie.status },
  });
  res.json({ data: movie });
});

// PATCH /api/manager/movies/:id/submit
export const submitMovie = asyncHandler(async (req, res) => {
  const movie = await findOwnMovie(req);
  if (!['draft', 'rejected'].includes(movie.status)) {
    throw new ApiError(409, 'Only drafts or rejected movies can be submitted');
  }
  assertPlayable(movie);
  movie.status = 'pending';
  movie.rejectionReason = undefined;
  await movie.save();
  await logActivity({
    actor: req.user._id,
    action: 'movie.submit',
    targetType: 'movie',
    targetId: movie._id,
    details: { title: movie.title },
  });
  res.json({ data: movie });
});

// DELETE /api/manager/movies/:id  (drafts only)
export const deleteMovie = asyncHandler(async (req, res) => {
  const movie = await findOwnMovie(req);
  if (movie.status !== 'draft') {
    throw new ApiError(403, 'Only draft movies can be deleted. Ask an admin to remove others');
  }
  await removeUploadedFiles(movie);
  await movie.deleteOne();
  await logActivity({
    actor: req.user._id,
    action: 'movie.delete',
    targetType: 'movie',
    targetId: movie._id,
    details: { title: movie.title },
  });
  res.status(204).end();
});
