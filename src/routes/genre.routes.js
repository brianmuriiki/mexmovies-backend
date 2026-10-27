import { Router } from 'express';
import { listGenres } from '../controllers/genre.controller.js';
import { publicCache } from '../middleware/cache.js';

const router = Router();
router.get('/', publicCache(3600), listGenres);

export default router;
