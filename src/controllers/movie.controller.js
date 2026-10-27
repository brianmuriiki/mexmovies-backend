import Movie from '../models/Movie.js';
import Genre from '../models/Genre.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { pageResult } from '../utils/pagination.js';
import { PUBLIC_EXCLUDE, presentPublicMovie } from '../services/moviePresenter.js';
import { publicFilter } from '../services/visibility.js';

const SORTS = {
  new: { publishedAt: -1 },
  popular: { views: -1, publishedAt: -1 },
  title: { title: 1 },
};

// GET /api/movies  (public, cached)
export const listMovies = asyncHandler(async (req, res) => {
  const { page, limit, genre, q, year, sort } = req.query;
  const filter = { ...publicFilter() };

  if (genre) {
    const g = await Genre.findOne({ slug: genre }).select('_id').lean();
    if (!g) return res.json(pageResult([], 0, page, limit));
    filter.genres = g._id;
  }
  if (year) filter.releaseYear = year;
  if (q) filter.$text = { $search: q };

  const [movies, total] = await Promise.all([
    Movie.find(filter)
      .select(PUBLIC_EXCLUDE)
      .populate('genres', 'name slug')
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Movie.countDocuments(filter),
  ]);

  res.json(pageResult(movies.map(presentPublicMovie), total, page, limit));
});

// GET /api/movies/featured
export const featuredMovies = asyncHandler(async (_req, res) => {
  const movies = await Movie.find({ ...publicFilter(), featured: true })
    .select(PUBLIC_EXCLUDE)
    .populate('genres', 'name slug')
    .sort({ publishedAt: -1 })
    .limit(10)
    .lean();
  res.json({ data: movies.map(presentPublicMovie) });
});

// GET /api/movies/:slug
export const getMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findOne({ slug: req.params.slug, ...publicFilter() })
    .select(PUBLIC_EXCLUDE)
    .populate('genres', 'name slug')
    .lean();
  if (!movie) throw new ApiError(404, 'Movie not found');
  res.json({ data: presentPublicMovie(movie) });
});

// POST /api/movies/:id/view  (rate limited; the client sends it once per session)
export const addView = asyncHandler(async (req, res) => {
  await Movie.updateOne({ _id: req.params.id, ...publicFilter() }, { $inc: { views: 1 } });
  res.status(204).end();
});
