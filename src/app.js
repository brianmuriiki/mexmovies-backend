import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';
import { env, isProd } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { originGuard } from './middleware/originGuard.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import accountRoutes from './routes/account.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import watchRoutes from './routes/watch.routes.js';
import rewardsRoutes from './routes/rewards.routes.js';
import progressRoutes from './routes/progress.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import earlyAccessRoutes from './routes/earlyAccess.routes.js';
import pollRoutes from './routes/poll.routes.js';
import movieRoutes from './routes/movie.routes.js';
import genreRoutes from './routes/genre.routes.js';
import watchlistRoutes from './routes/watchlist.routes.js';
import managerRoutes from './routes/manager.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();

app.set('trust proxy', 1); // needed behind Render/Railway/Cloudflare so rate limits see the real IP
app.use(helmet());
app.use(cors({ origin: env.clientOrigins, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitize());
if (!isProd) app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'mexMovies API' }));

app.use('/api', apiLimiter, originGuard);
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/watch', watchRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/early-access', earlyAccessRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/genres', genreRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
