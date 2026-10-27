import mongoose from 'mongoose';

export const VIDEO_SOURCES = ['youtube', 'archive', 'mp4', 'hls', 'r2'];
export const LICENSE_TYPES = ['public-domain', 'creative-commons', 'owned', 'licensed'];
export const MOVIE_STATUSES = ['draft', 'pending', 'published', 'rejected', 'unpublished'];
export const UPLOAD_STATUSES = ['none', 'uploading', 'uploaded', 'failed'];

const { ObjectId } = mongoose.Schema.Types;

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    genres: [{ type: ObjectId, ref: 'Genre' }],
    releaseYear: Number,
    duration: Number, // minutes
    language: { type: String, trim: true },
    cast: [{ type: String, trim: true }],
    director: { type: String, trim: true },

    posterUrl: { type: String, required: true },
    backdropUrl: String,
    trailerUrl: String,

    videoSource: { type: String, enum: VIDEO_SOURCES, required: true },
    videoUrl: String, // youtube / archive / mp4 / hls
    // Uploaded files (R2). These are set only by the server, never by the browser.
    videoKey: String,
    fileSizeBytes: Number,
    mimeType: String,
    uploadStatus: { type: String, enum: UPLOAD_STATUSES, default: 'none' },
    pendingVideoKey: String, // upload started but not confirmed yet
    pendingSizeBytes: Number,
    isLive: { type: Boolean, default: false },

    licenseType: { type: String, enum: LICENSE_TYPES, required: true },
    licenseProof: { type: String, required: true, trim: true },

    status: { type: String, enum: MOVIE_STATUSES, default: 'draft' },
    rejectionReason: String,
    addedBy: { type: ObjectId, ref: 'User', required: true },
    approvedBy: { type: ObjectId, ref: 'User' },
    publishedAt: Date,
    publicAt: Date, // early access: Platinum viewers see it first; everyone else from this date

    views: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

movieSchema.index({ status: 1, publishedAt: -1 });
movieSchema.index({ status: 1, featured: 1 });
movieSchema.index({ status: 1, publicAt: 1 });
movieSchema.index({ genres: 1 });
movieSchema.index({ addedBy: 1, updatedAt: -1 });
movieSchema.index({ title: 'text', description: 'text' });

export default mongoose.model('Movie', movieSchema);
