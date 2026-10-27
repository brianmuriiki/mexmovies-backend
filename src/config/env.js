import 'dotenv/config';

for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const num = (value, fallback) =>
  value !== undefined && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : fallback;

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionDays = num(process.env.SESSION_DAYS, 1);
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const env = {
  nodeEnv,
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  sessionDays,
  jwtExpiresIn: `${sessionDays}d`,
  cookieMaxAgeMs: sessionDays * 24 * 60 * 60 * 1000,
  cookieSameSite: process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax'),
  clientOrigins,
  appUrl: (process.env.APP_URL || clientOrigins[0]).replace(/\/+$/, ''),

  r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 2 * 1024 ** 3),
    quotaBytes: num(process.env.STORAGE_QUOTA_BYTES, 10 * 1024 ** 3),
  },

  turnstileSecret: process.env.TURNSTILE_SECRET, // Cloudflare Turnstile bot check (off when empty)

  snapshotDelayMs: num(process.env.SNAPSHOT_DELAY_MS, 3000),

  email: {
    provider: (process.env.EMAIL_PROVIDER || 'console').toLowerCase(),
    apiKey: process.env.EMAIL_API_KEY,
    from: process.env.EMAIL_FROM || 'mexMovies <no-reply@example.com>',
  },

  rewards: {
    dailyCapSeconds: num(process.env.REWARDS_DAILY_CAP_HOURS, 6) * 3600,
    flushIntervalMs: num(process.env.REWARDS_FLUSH_SECONDS, 60) * 1000,
  },
  redemptionEnabled: process.env.REDEMPTION_ENABLED === 'true',

  admin: {
    name: process.env.ADMIN_NAME || 'mexMovies Admin',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};

export const isProd = isProduction;
