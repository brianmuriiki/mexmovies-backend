import mongoose from 'mongoose';
import Genre from '../models/Genre.js';
import Movie from '../models/Movie.js';
import { ApiError } from '../utils/ApiError.js';
import { deleteObject } from './r2.js';

export async function assertGenresExist(ids = []) {
  const unique = [...new Set(ids.map(String))];
  const count = await Genre.countDocuments({ _id: { $in: unique } });
  if (count !== unique.length) throw new ApiError(400, 'One or more genres do not exist');
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A movie can only be submitted or published when it can actually be played.
export function assertPlayable(movie) {
  if (movie.videoSource === 'r2' && !(movie.videoKey && movie.uploadStatus === 'uploaded')) {
    throw new ApiError(409, 'Upload the movie file first, then submit or publish');
  }
}

// Deletes the uploaded file (and any half-finished upload) and clears the upload fields.
export async function removeUploadedFiles(movie) {
  await Promise.all([deleteObject(movie.videoKey), deleteObject(movie.pendingVideoKey)]);
  movie.videoKey = undefined;
  movie.fileSizeBytes = undefined;
  movie.mimeType = undefined;
  movie.pendingVideoKey = undefined;
  movie.pendingSizeBytes = undefined;
  movie.uploadStatus = 'none';
}

// Storage used by uploaded files, counting uploads still in progress.
// `excludePendingOf` lets a retry for the same movie replace its own pending upload.
export async function storageUsedBytes(excludePendingOf) {
  const exclude = excludePendingOf ? new mongoose.Types.ObjectId(String(excludePendingOf)) : null;
  const [row] = await Movie.aggregate([
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $add: [
              { $ifNull: ['$fileSizeBytes', 0] },
              { $cond: [{ $eq: ['$_id', exclude] }, 0, { $ifNull: ['$pendingSizeBytes', 0] }] },
            ],
          },
        },
      },
    },
  ]);
  return row?.total || 0;
}
