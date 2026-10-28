import crypto from 'crypto';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { createUploadUrl, headObject, r2Configured } from '../services/r2.js';

const CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const signImageUpload = asyncHandler(async (req, res) => {
  const { kind, contentType, sizeBytes } = req.body;
  if (!r2Configured() || !env.r2PublicBaseUrl) {
    throw new ApiError(503, 'Image uploads are not configured yet');
  }
  if (!CONTENT_TYPES.has(contentType) || sizeBytes > MAX_IMAGE_BYTES) {
    throw new ApiError(400, 'Choose a JPEG, PNG, or WebP image up to 5 MB');
  }

  const key = `images/${req.user._id}/${kind}/${crypto.randomBytes(16).toString('hex')}.${CONTENT_TYPES.get(contentType)}`;
  const uploadUrl = await createUploadUrl({ key, contentType, sizeBytes });
  res.json({
    data: {
      uploadUrl,
      key,
      publicUrl: `${env.r2PublicBaseUrl}/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresInSeconds: 900,
    },
  });
});

export const completeImageUpload = asyncHandler(async (req, res) => {
  const { key } = req.body;
  const ownPrefix = `images/${req.user._id}/`;
  if (!key.startsWith(ownPrefix)) throw new ApiError(404, 'Image upload not found');

  const file = await headObject(key);
  if (!file) throw new ApiError(400, 'The image was not found in storage. Please upload it again');
  if (!CONTENT_TYPES.has(file.contentType) || file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(400, 'The uploaded image type or size is not allowed');
  }
  res.json({ data: { key, publicUrl: `${env.r2PublicBaseUrl}/${key}` } });
});
