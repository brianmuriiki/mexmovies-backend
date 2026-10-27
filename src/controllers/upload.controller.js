import crypto from 'crypto';
import Movie from '../models/Movie.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { createUploadUrl, headObject, deleteObject, r2Configured } from '../services/r2.js';
import { removeUploadedFiles, storageUsedBytes } from '../services/movieService.js';
import { logActivity } from '../services/activityLogger.js';
import { afterCatalogChange } from '../services/catalogSnapshot.js';

const EDITABLE = ['draft', 'pending', 'rejected'];

// Managers can only upload to their own unpublished movies; admins to any.
async function loadMovie(req, movieId) {
  const movie = await Movie.findById(movieId);
  if (!movie) throw new ApiError(404, 'Movie not found');
  if (req.user.role !== 'admin') {
    if (String(movie.addedBy) !== String(req.user._id)) throw new ApiError(404, 'Movie not found');
    if (!EDITABLE.includes(movie.status)) throw new ApiError(403, 'Published movies can only be changed by an admin');
  }
  return movie;
}

// POST /api/manager/uploads/sign  { movieId, fileName, contentType, sizeBytes }
export const signUpload = asyncHandler(async (req, res) => {
  const { movieId, sizeBytes, contentType } = req.body;
  if (!r2Configured()) throw new ApiError(503, 'Video uploads are not set up yet');
  if (sizeBytes > env.r2.maxUploadBytes) {
    throw new ApiError(413, `File is too large. The limit is ${Math.floor(env.r2.maxUploadBytes / 1024 ** 2)} MB`);
  }

  const movie = await loadMovie(req, movieId);

  const used = await storageUsedBytes(movie._id);
  if (used + sizeBytes > env.r2.quotaBytes) {
    throw new ApiError(413, 'Not enough free storage left for this file. Ask the admin to free up space');
  }

  const key = `movies/${movie._id}/${crypto.randomBytes(8).toString('hex')}.mp4`;
  const uploadUrl = await createUploadUrl({ key, contentType, sizeBytes });

  // A half-finished earlier attempt is cleaned up.
  if (movie.pendingVideoKey && movie.pendingVideoKey !== key) await deleteObject(movie.pendingVideoKey);
  movie.pendingVideoKey = key;
  movie.pendingSizeBytes = sizeBytes;
  if (movie.uploadStatus !== 'uploaded') movie.uploadStatus = 'uploading';
  await movie.save();

  res.json({
    data: { uploadUrl, key, method: 'PUT', headers: { 'Content-Type': contentType }, expiresInSeconds: 900 },
  });
});

// POST /api/manager/uploads/complete  { movieId }
export const completeUpload = asyncHandler(async (req, res) => {
  const movie = await loadMovie(req, req.body.movieId);
  if (!movie.pendingVideoKey) throw new ApiError(409, 'No upload is in progress for this movie');

  const file = await headObject(movie.pendingVideoKey);
  if (!file) {
    if (movie.uploadStatus !== 'uploaded') movie.uploadStatus = 'failed';
    await movie.save();
    throw new ApiError(400, 'The file was not found in storage. Please upload it again');
  }
  if (file.size > env.r2.maxUploadBytes) {
    await deleteObject(movie.pendingVideoKey);
    movie.pendingVideoKey = undefined;
    movie.pendingSizeBytes = undefined;
    if (movie.uploadStatus !== 'uploaded') movie.uploadStatus = 'failed';
    await movie.save();
    throw new ApiError(413, 'The uploaded file is larger than allowed and was removed');
  }

  const oldKey = movie.videoKey;
  movie.videoSource = 'r2';
  movie.videoKey = movie.pendingVideoKey;
  movie.fileSizeBytes = file.size;
  movie.mimeType = 'video/mp4';
  movie.uploadStatus = 'uploaded';
  movie.videoUrl = undefined;
  movie.pendingVideoKey = undefined;
  movie.pendingSizeBytes = undefined;
  await movie.save();

  if (oldKey && oldKey !== movie.videoKey) await deleteObject(oldKey);
  await logActivity({
    actor: req.user._id,
    action: 'movie.upload',
    targetType: 'movie',
    targetId: movie._id,
    details: { title: movie.title, sizeBytes: file.size },
  });
  if (movie.status === 'published') await afterCatalogChange();
  res.json({ data: movie });
});

// DELETE /api/admin/uploads/:movieId  (admin)
export const deleteUpload = asyncHandler(async (req, res) => {
  const movie = await Movie.findById(req.params.movieId);
  if (!movie) throw new ApiError(404, 'Movie not found');
  await removeUploadedFiles(movie);
  const wasPublished = movie.status === 'published';
  if (movie.videoSource === 'r2' && wasPublished) movie.status = 'unpublished'; // no video left to play
  await movie.save();
  await logActivity({
    actor: req.user._id,
    action: 'movie.upload.delete',
    targetType: 'movie',
    targetId: movie._id,
    details: { title: movie.title },
  });
  if (wasPublished) await afterCatalogChange();
  res.json({ data: movie });
});

// GET /api/admin/storage
export const storage = asyncHandler(async (_req, res) => {
  const usedBytes = await storageUsedBytes();
  const quotaBytes = env.r2.quotaBytes;
  res.json({
    data: {
      configured: r2Configured(),
      usedBytes,
      quotaBytes,
      freeBytes: Math.max(0, quotaBytes - usedBytes),
      percentUsed: Math.min(100, Math.round((usedBytes / quotaBytes) * 100)),
    },
  });
});
