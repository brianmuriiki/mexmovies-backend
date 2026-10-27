import { ApiError } from '../utils/ApiError.js';

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'];
const ARCHIVE_HOSTS = ['archive.org', 'www.archive.org'];

export function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

// Checks that the video details make sense for the chosen source.
// Uploaded files (r2) need no link: the server assigns the file after the upload finishes.
export function validateVideoSource({ videoSource, videoUrl }) {
  if (videoSource === 'r2') return;
  if (!videoUrl) throw new ApiError(400, 'videoUrl is required for this video source');

  let url;
  try {
    url = new URL(videoUrl);
  } catch {
    throw new ApiError(400, 'videoUrl is not a valid link');
  }
  if (url.protocol !== 'https:') throw new ApiError(400, 'Video links must use https');

  if (videoSource === 'youtube' && (!YOUTUBE_HOSTS.includes(url.hostname) || !getYouTubeId(videoUrl))) {
    throw new ApiError(400, 'Please enter a valid YouTube video link');
  }
  if (videoSource === 'archive' && !ARCHIVE_HOSTS.includes(url.hostname)) {
    throw new ApiError(400, 'Internet Archive links must be on archive.org');
  }
}
