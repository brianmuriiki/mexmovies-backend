import Movie from '../models/Movie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { PUBLIC_EXCLUDE, presentPublicMovie } from '../services/moviePresenter.js';
import { hasLevel } from '../services/rewardsService.js';

// Staff can preview; viewers need the Platinum level.
export const requireEarlyAccess = asyncHandler(async (req, _res, next) => {
  if (req.user.role !== 'viewer') return next();
  if (!(await hasLevel(req.user._id, 'platinum'))) {
    throw new ApiError(403, 'Early access is for Platinum members');
  }
  next();
});

const upcoming = () => ({ status: 'published', publicAt: { $gt: new Date() } });

// GET /api/early-access  (movies not yet public)
export const listEarlyAccess = asyncHandler(async (_req, res) => {
  const movies = await Movie.find(upcoming())
    .select(PUBLIC_EXCLUDE)
    .populate('genres', 'name slug')
    .sort({ publicAt: 1 })
    .lean();
  res.json({ data: movies.map(presentPublicMovie) });
});

// GET /api/early-access/:slug
export const getEarlyAccess = asyncHandler(async (req, res) => {
  const movie = await Movie.findOne({ slug: req.params.slug, ...upcoming() })
    .select(PUBLIC_EXCLUDE)
    .populate('genres', 'name slug')
    .lean();
  if (!movie) throw new ApiError(404, 'Movie not found');
  res.json({ data: presentPublicMovie(movie) });
});
