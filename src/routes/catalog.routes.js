import { Router } from 'express';
import { catalog } from '../controllers/catalog.controller.js';
import { publicCache } from '../middleware/cache.js';

const router = Router();
router.get('/', publicCache(300), catalog);

export default router;
