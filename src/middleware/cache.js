// Lets the CDN (Cloudflare) and browsers cache public responses.
export const publicCache = (seconds = 300) => (_req, res, next) => {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
  next();
};

// Private or staff responses must never be cached.
export const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};
