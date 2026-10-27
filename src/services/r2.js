import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

let client;

export const r2Configured = () =>
  Boolean(env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket);

function getClient() {
  if (!r2Configured()) throw new ApiError(503, 'Video uploads are not set up yet');
  client ||= new S3Client({
    region: 'auto',
    endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.r2.accessKeyId, secretAccessKey: env.r2.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', // R2 does not need the extra checksum headers
  });
  return client;
}

// Short-lived address the browser uploads the file to directly (the API never carries the video).
export function createUploadUrl({ key, contentType, sizeBytes }) {
  const command = new PutObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 900 });
}

// Returns { size, contentType } or null when the file does not exist.
export async function headObject(key) {
  try {
    const out = await getClient().send(new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    return { size: out.ContentLength, contentType: out.ContentType };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function deleteObject(key) {
  if (!key || !r2Configured()) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  } catch (err) {
    console.error('R2 delete failed:', key, err.message);
  }
}

export async function putJson({ key, body, cacheControl }) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      CacheControl: cacheControl,
    })
  );
}
