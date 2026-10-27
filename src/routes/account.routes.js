import { Router } from 'express';
import { updateProfile, changePassword, deleteAccount } from '../controllers/account.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { resetLimiter } from '../middleware/rateLimit.js';
import { updateProfileSchema, changePasswordSchema, deleteAccountSchema } from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate);

router.patch('/', validate(updateProfileSchema), updateProfile);
router.patch('/password', resetLimiter, validate(changePasswordSchema), changePassword);
router.delete('/', resetLimiter, validate(deleteAccountSchema), deleteAccount);

export default router;
