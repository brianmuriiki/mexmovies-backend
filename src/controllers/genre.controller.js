import Genre from '../models/Genre.js';
import Movie from '../models/Movie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { slugify } from '../utils/slugify.js';
import { logActivity } from '../services/activityLogger.js';

export const listGenres = asyncHandler(async (_req, res) => {
  const genres = await Genre.find().sort({ name: 1 }).lean();
  res.json({ data: genres });
});

export const createGenre = asyncHandler(async (req, res) => {
  const name = req.body.name;
  const genre = await Genre.create({ name, slug: slugify(name) });
  await logActivity({ actor: req.user._id, action: 'genre.create', targetType: 'genre', targetId: genre._id });
  res.status(201).json({ data: genre });
});

export const deleteGenre = asyncHandler(async (req, res) => {
  const inUse = await Movie.exists({ genres: req.params.id });
  if (inUse) throw new ApiError(409, 'This genre is used by movies and cannot be deleted');
  const genre = await Genre.findByIdAndDelete(req.params.id);
  if (!genre) throw new ApiError(404, 'Genre not found');
  await logActivity({ actor: req.user._id, action: 'genre.delete', targetType: 'genre', targetId: genre._id });
  res.status(204).end();
});
