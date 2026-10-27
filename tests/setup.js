// Runs before every test file. Values are fake: tests use an in-memory database and never call the internet.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/placeholder';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SNAPSHOT_DELAY_MS = '600000';
process.env.EMAIL_PROVIDER = 'console';
process.env.R2_ACCOUNT_ID = 'testaccount';
process.env.R2_ACCESS_KEY_ID = 'testkey';
process.env.R2_SECRET_ACCESS_KEY = 'testsecret';
process.env.R2_BUCKET = 'test-bucket';
process.env.R2_PUBLIC_BASE_URL = 'https://videos.test';
process.env.MAX_UPLOAD_BYTES = '1000000';
process.env.STORAGE_QUOTA_BYTES = '1500000';
