import { Router } from 'express';
import { listMovies, featuredMovies, getMovie, addView } from '../controllers/movie.controller.js';
import { validate } from '../middleware/validate.js';
import { publicCache } from '../middleware/cache.js';
import { viewLimiter } from '../middleware/rateLimit.js';
import { listQuery, slugParam, idParam } from '../validators/schemas.js';

const router = Router();

// Public routes: cached by the CDN so viewers rarely reach the database.
router.get('/', publicCache(300), validate(listQuery, 'query'), listMovies);
router.get('/featured', publicCache(300), featuredMovies); // must stay above /:slug
router.get('/:slug', publicCache(300), validate(slugParam, 'params'), getMovie);
router.post('/:id/view', viewLimiter, validate(idParam, 'params'), addView);

export default router;
