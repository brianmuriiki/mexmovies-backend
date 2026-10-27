import { connectDB, disconnectDB } from '../config/db.js';
import Genre from '../models/Genre.js';
import { slugify } from '../utils/slugify.js';

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama',
  'Family', 'Fantasy', 'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-fi',
  'Thriller', 'War', 'Western',
];

await connectDB();
for (const name of GENRES) {
  await Genre.updateOne({ slug: slugify(name) }, { $setOnInsert: { name, slug: slugify(name) } }, { upsert: true });
}
console.log(`Genres ready (${GENRES.length}).`);
await disconnectDB();
