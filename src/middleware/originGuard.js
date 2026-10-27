import { env, isProd } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Cookies are sent cross-site in production (frontend and API on different domains),
// so browsers' state-changing requests must come from our own frontend.
export function originGuard(req, _res, next) {
  if (!isProd || SAFE.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !env.clientOrigins.includes(origin)) {
    return next(new ApiError(403, 'Request blocked: unknown origin'));
  }
  next();
}
