import Progress from '../models/Progress.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { bufferProgress } from '../services/rewardsService.js';
import { PUBLIC_EXCLUDE, presentPublicMovie } from '../services/moviePresenter.js';
import { publicFilter } from '../services/visibility.js';

// GET /api/progress  (continue watching, newest first)
export const listProgress = asyncHandler(async (req, res) => {
  const items = await Progress.find({ user: req.user._id })
    .sort({ updatedAt: -1 })
    .limit(20)
    .populate({
      path: 'movie',
      match: publicFilter(),
      select: PUBLIC_EXCLUDE,
      populate: { path: 'genres', select: 'name slug' },
    })
    .lean();
  const data = items
    .filter((i) => i.movie)
    .map((i) => ({ positionSeconds: i.positionSeconds, updatedAt: i.updatedAt, movie: presentPublicMovie(i.movie) }));
  res.json({ data });
});

// PUT /api/progress/:movieId  { positionSeconds }  (saved in bulk within about a minute)
export const saveProgress = asyncHandler(async (req, res) => {
  bufferProgress(req.user._id, req.params.movieId, req.body.positionSeconds);
  res.status(202).json({ message: 'Saved' });
});
