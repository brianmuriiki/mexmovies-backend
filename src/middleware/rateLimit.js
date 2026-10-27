import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs, max, message, extra = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skip: () => env.nodeEnv === 'test', // tests log in many times from one address
    ...extra,
  });

const HOUR = 60 * 60 * 1000;

export const apiLimiter = make(15 * 60 * 1000, 600, 'Too many requests. Please slow down.');
export const loginLimiter = make(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.');
export const registerLimiter = make(HOUR, 10, 'Too many sign-ups from this network. Try again later.');
export const viewLimiter = make(60 * 1000, 30, 'Too many requests.');
export const emailLimiter = make(HOUR, 5, 'Too many email requests. Try again later.');
export const resetLimiter = make(HOUR, 10, 'Too many attempts. Try again later.');
// Per logged-in user (must run after authenticate)
export const heartbeatLimiter = make(60 * 1000, 30, 'Too many requests.', {
  keyGenerator: (req) => String(req.user?._id || 'anonymous'),
});
