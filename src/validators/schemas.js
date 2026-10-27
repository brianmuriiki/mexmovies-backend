import { z } from 'zod';
import { VIDEO_SOURCES, LICENSE_TYPES, MOVIE_STATUSES } from '../models/Movie.js';
import { LEVEL_KEYS } from '../config/levels.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().max(500).optional());

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');
const email = z.string().trim().toLowerCase().email().max(120);
const token = z.string().trim().min(20).max(200);

// ---------- params / query ----------
export const idParam = z.object({ id: objectId });
export const movieIdParam = z.object({ movieId: objectId });
export const slugParam = z.object({ slug: z.string().trim().min(1).max(120) });

const page = z.coerce.number().int().min(1).default(1);

export const listQuery = z.object({
  page,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  genre: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  year: z.coerce.number().int().optional(),
  sort: z.enum(['new', 'popular', 'title']).default('new'),
  status: z.enum(MOVIE_STATUSES).optional(),
});

export const userListQuery = z.object({
  page,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(['manager', 'viewer']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const logListQuery = z.object({
  page,
  limit: z.coerce.number().int().min(1).max(100).default(30),
  action: z.string().trim().max(60).optional(),
});

export const transactionListQuery = z.object({
  page,
  limit: z.coerce.number().int().min(1).max(100).default(30),
  userId: objectId.optional(),
});

// ---------- auth ----------
const turnstileToken = z.string().max(2048).optional(); // from the Cloudflare Turnstile widget
export const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email, password, turnstileToken });
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) });
export const verifyEmailSchema = z.object({ token });
export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email(), turnstileToken });
export const resetPasswordSchema = z.object({ token, password });

// ---------- account ----------
export const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: password,
});
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(72) });

// ---------- movies ----------
// Note: videoKey, fileSizeBytes and mimeType are NOT accepted from the browser.
// Only the upload endpoints set them, so nobody can point a movie at someone else's file.
const movieFields = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(10).max(3000),
  genres: z.array(objectId).min(1, 'Pick at least one genre').max(6),
  releaseYear: z.coerce.number().int().min(1880).max(new Date().getFullYear() + 1),
  duration: z.coerce.number().int().min(1).max(600),
  language: z.string().trim().min(2).max(40),
  cast: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  director: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  posterUrl: z.string().url().max(500),
  backdropUrl: optionalUrl,
  trailerUrl: optionalUrl,
  videoSource: z.enum(VIDEO_SOURCES),
  videoUrl: optionalUrl,
  licenseType: z.enum(LICENSE_TYPES),
  licenseProof: z.string().trim().min(5, 'Explain or link your proof of rights').max(500),
});

// Manager: `submit: true` sends it for approval, otherwise it stays a draft.
export const managerMovieCreate = movieFields.extend({ submit: z.boolean().optional() });
export const managerMovieUpdate = movieFields.partial().extend({ submit: z.boolean().optional() });

// Admin: `publish: true` publishes immediately; admins can also set `featured`.
export const adminMovieCreate = movieFields.extend({
  publish: z.boolean().optional(),
  featured: z.boolean().optional(),
});
export const adminMovieUpdate = movieFields.partial().extend({
  featured: z.boolean().optional(),
  publicAt: z.string().datetime().nullable().optional(), // null = public now
});

// Approve: optionally give Platinum viewers early access for a number of days.
export const approveSchema = z.object({ earlyAccessDays: z.number().int().min(0).max(30).optional() });

export const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'Please give a reason').max(500),
});

// ---------- uploads ----------
export const signUploadSchema = z.object({
  movieId: objectId,
  fileName: z.string().trim().min(1).max(200),
  contentType: z.literal('video/mp4', { errorMap: () => ({ message: 'Only MP4 files (video/mp4) are accepted' }) }),
  sizeBytes: z.coerce.number().int().min(1),
});
export const completeUploadSchema = z.object({ movieId: objectId });

// ---------- users / genres ----------
export const createManagerSchema = z.object({ name: z.string().trim().min(2).max(80), email, password });

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const genreSchema = z.object({ name: z.string().trim().min(2).max(40) });

// ---------- rewards, points, progress ----------
export const heartbeatSchema = z.object({
  movieId: objectId,
  sessionId: z.string().trim().min(8).max(64),
  seconds: z.coerce.number().int().min(0).max(330), // watch time since the last heartbeat
  position: z.coerce.number().int().min(0).max(86400).optional(),
});
export const progressBody = z.object({ positionSeconds: z.coerce.number().int().min(0).max(86400) });
export const redeemSchema = z.object({ itemId: objectId });

export const levelsUpdateSchema = z.object({
  levels: z
    .array(
      z.object({
        key: z.enum(LEVEL_KEYS),
        name: z.string().trim().min(1).max(40).optional(),
        hours: z.number().min(0).max(100000).optional(),
        perk: z.string().trim().max(200).optional(),
        bonusPoints: z.number().int().min(0).max(1000000).optional(),
      })
    )
    .min(1),
});

export const redemptionItemCreate = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
  costPoints: z.number().int().min(1).max(100000000),
  durationDays: z.number().int().min(1).max(3650).optional(),
  active: z.boolean().optional(),
});

export const grantSubscriptionSchema = z.object({
  userId: objectId,
  days: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(5).max(200),
});

// ---------- polls (Gold voting) ----------
export const createPollSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(500).optional(),
  closesAt: z.string().datetime().optional(),
  options: z
    .array(z.object({ title: z.string().trim().min(1).max(100), description: z.string().trim().max(200).optional() }))
    .min(2)
    .max(10),
});
export const voteSchema = z.object({ optionId: objectId });
export const redemptionItemUpdate = redemptionItemCreate.partial();

export const adjustPointsSchema = z.object({
  userId: objectId,
  amount: z
    .number()
    .int()
    .min(-100000)
    .max(100000)
    .refine((n) => n !== 0, { message: 'Amount cannot be zero' }),
  reason: z.string().trim().min(5).max(200),
});
