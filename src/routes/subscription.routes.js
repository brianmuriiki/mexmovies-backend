import { Router } from 'express';
import { mySubscription } from '../controllers/subscription.controller.js';
import { authenticate } from '../middleware/auth.js';
import { noStore } from '../middleware/cache.js';

const router = Router();
router.use(noStore, authenticate);
router.get('/', mySubscription);

export default router;
