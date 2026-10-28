import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { getYouTubeId } from '../services/videoValidator.js';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);

export const checkVideo = asyncHandler(async (req, res) => {
  const videoUrl = req.query.url;
  let parsed;
  try {
    parsed = new URL(videoUrl);
  } catch {
    throw new ApiError(400, 'Please enter a valid YouTube video link');
  }
  if (parsed.protocol !== 'https:' || !YOUTUBE_HOSTS.has(parsed.hostname) || !getYouTubeId(videoUrl)) {
    throw new ApiError(400, 'Please enter a valid YouTube video link');
  }

  let status = 'unknown';
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) status = 'embeddable';
    else if ([401, 403, 404].includes(response.status)) status = 'blocked';
  } catch {
    // Network or provider failures should not block saving a valid YouTube URL.
  }
  res.json({ data: { status } });
});
