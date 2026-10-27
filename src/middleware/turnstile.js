import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Cloudflare Turnstile (free) bot check for sign-up and "forgot password".
// Off when TURNSTILE_SECRET is not set, so development needs no setup.
export async function requireTurnstile(req, _res, next) {
  const secret = env.turnstileSecret;
  if (!secret) return next();

  const token = req.body?.turnstileToken;
  if (!token) return next(new ApiError(400, 'Please complete the bot check'));

  try {
    const form = new URLSearchParams({ secret, response: token });
    if (req.ip) form.set('remoteip', req.ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await res.json();
    if (data.success !== true) return next(new ApiError(400, 'The bot check failed. Please try again'));
    next();
  } catch (err) {
    console.error('Turnstile check failed:', err.message);
    next(new ApiError(503, 'The bot check is unavailable right now. Please try again shortly'));
  }
}
