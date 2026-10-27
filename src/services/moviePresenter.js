import { env } from '../config/env.js';

// Fields viewers must never see.
export const PUBLIC_EXCLUDE =
  '-licenseProof -addedBy -approvedBy -rejectionReason -fileSizeBytes -mimeType -uploadStatus -pendingVideoKey -pendingSizeBytes -__v';

// Turns a lean movie object into what the public site receives.
export function presentPublicMovie(movie) {
  const out = { ...movie };
  if (out.videoSource === 'r2' && out.videoKey && env.r2PublicBaseUrl) {
    out.videoUrl = `${env.r2PublicBaseUrl}/${out.videoKey}`;
  }
  delete out.videoKey;
  return out;
}
