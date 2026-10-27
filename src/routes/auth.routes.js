import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { noStore } from '../middleware/cache.js';
import { loginLimiter, registerLimiter, emailLimiter, resetLimiter } from '../middleware/rateLimit.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(noStore);

router.post('/register', registerLimiter, validate(registerSchema), requireTurnstile, register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

router.post('/verify-email', resetLimiter, validate(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', authenticate, emailLimiter, resendVerification);
router.post('/forgot-password', emailLimiter, validate(forgotPasswordSchema), requireTurnstile, forgotPassword);
router.post('/reset-password', resetLimiter, validate(resetPasswordSchema), resetPassword);

export default router;
