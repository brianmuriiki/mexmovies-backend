import Watchlist from '../models/Watchlist.js';
import Movie from '../models/Movie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { PUBLIC_EXCLUDE, presentPublicMovie } from '../services/moviePresenter.js';
import { publicFilter } from '../services/visibility.js';

export const listWatchlist = asyncHandler(async (req, res) => {
  const items = await Watchlist.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate({
      path: 'movie',
      match: publicFilter(),
      select: PUBLIC_EXCLUDE,
      populate: { path: 'genres', select: 'name slug' },
    })
    .lean();
  const movies = items.filter((i) => i.movie).map((i) => presentPublicMovie(i.movie));
  res.json({ data: movies });
});

export const addToWatchlist = asyncHandler(async (req, res) => {
  const { movieId } = req.params;
  const exists = await Movie.exists({ _id: movieId, ...publicFilter() });
  if (!exists) throw new ApiError(404, 'Movie not found');
  await Watchlist.updateOne(
    { user: req.user._id, movie: movieId },
    { $setOnInsert: { user: req.user._id, movie: movieId } },
    { upsert: true }
  );
  res.status(201).json({ message: 'Added to watchlist' });
});

export const removeFromWatchlist = asyncHandler(async (req, res) => {
  await Watchlist.deleteOne({ user: req.user._id, movie: req.params.movieId });
  res.status(204).end();
});
