/**
 * Image Storage Service - Cloudflare R2
 *
 * Handles uploading images to Cloudflare R2 (S3-compatible object storage)
 * Provides reliable, free image hosting with global CDN delivery
 *
 * Features:
 * - Automatic image downloading from source URLs
 * - Organized folder structure (fighters/, events/, news/)
 * - Fallback to UFC.com URLs if R2 is not configured
 * - Content-Type detection and proper headers
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// ============== CONFIGURATION ==============

/**
 * Check if R2 storage is properly configured via environment variables
 * Required vars: R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET
 */
function isR2Configured(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY &&
    process.env.R2_SECRET_KEY &&
    process.env.R2_BUCKET
  );
}

/**
 * Initialize S3 client for Cloudflare R2
 * R2 is S3-compatible, so we use the AWS SDK
 */
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client && isR2Configured()) {
    s3Client = new S3Client({
      region: 'auto', // R2 uses 'auto' for region
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!,
      },
    });
  }

  if (!s3Client) {
    throw new Error('R2 storage is not configured. Set R2_* environment variables.');
  }

  return s3Client;
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Generate a unique, SEO-friendly filename from a URL
 * Examples:
 *   - Fighter: "jon-jones-abc123.jpg"
 *   - Event: "ufc-320-banner-def456.jpg"
 *
 * @param sourceUrl - Original image URL
 * @param prefix - Optional prefix (fighter name, event name, etc.)
 * @returns Clean filename with hash to prevent collisions
 */
function generateFileName(sourceUrl: string, prefix?: string): string {
  // Extract file extension from URL or default to .jpg
  const urlPath = new URL(sourceUrl).pathname;
  const extension = urlPath.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] || 'jpg';

  // Generate short hash from URL for uniqueness (prevents collisions)
  const hash = crypto.createHash('md5').update(sourceUrl).digest('hex').substring(0, 8);

  // Clean up prefix if provided (remove special chars, lowercase, replace spaces with hyphens)
  const cleanPrefix = prefix
    ? prefix.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .substring(0, 50) // Limit length
    : hash;

  return `${cleanPrefix}-${hash}.${extension}`;
}

/**
 * Determine content type from file extension
 * R2 needs proper Content-Type headers for serving images correctly
 */
function getContentType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };

  return contentTypes[extension || ''] || 'image/jpeg';
}

/**
 * Build public URL for an R2 object
 * Uses custom domain if R2_PUBLIC_URL is set, otherwise uses R2 dev subdomain
 *
 * @param key - Object key in R2 bucket (e.g., "fighters/jon-jones-abc123.jpg")
 * @returns Full public URL to access the image
 */
function getPublicUrl(key: string): string {
  // Custom domain (e.g., https://images.fightcrewapp.com)
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }

  // R2 dev subdomain (e.g., https://pub-xxxxx.r2.dev)
  // This is automatically available for all R2 buckets
  const bucket = process.env.R2_BUCKET;
  return `https://${bucket}.r2.dev/${key}`;
}

// ============== MAIN UPLOAD FUNCTION ==============

/**
 * Check if an image already exists in R2
 * Prevents re-uploading the same image multiple times
 *
 * @param key - Object key to check
 * @returns True if image exists in R2
 */
async function imageExists(key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    await client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
    }));
    return true;
  } catch {
    return false; // 404 = doesn't exist
  }
}

/**
 * Upload an image to Cloudflare R2 storage
 *
 * Process:
 * 1. Check if R2 is configured (fallback to source URL if not)
 * 2. Check if image already exists (skip re-upload)
 * 3. Download image from source URL
 * 4. Upload to R2 with proper headers
 * 5. Return public URL
 *
 * @param sourceUrl - URL of image to download and upload (UFC.com, etc.)
 * @param folder - Folder in R2 bucket ("fighters", "events", "news")
 * @param prefix - Optional filename prefix (fighter name, event name)
 * @returns Public URL to access the uploaded image
 */
export async function uploadImageToR2(
  sourceUrl: string,
  folder: 'fighters' | 'events' | 'news',
  prefix?: string
): Promise<string> {
  // Fallback: If R2 not configured, return original UFC.com URL
  if (!isR2Configured()) {
    console.log('[R2] Storage not configured, using source URL:', sourceUrl);
    return sourceUrl;
  }

  try {
    const client = getS3Client();
    const fileName = generateFileName(sourceUrl, prefix);
    const key = `${folder}/${fileName}`;

    // Check if image already exists in R2 (avoid re-upload)
    if (await imageExists(key)) {
      console.log(`[R2] Image already exists: ${key}`);
      return getPublicUrl(key);
    }

    console.log(`[R2] Downloading image: ${sourceUrl}`);

    // Download image from source URL
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[R2] Uploading to: ${key} (${(buffer.length / 1024).toFixed(2)} KB)`);

    // Upload to R2 with proper content type and cache headers
    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: getContentType(fileName),
      CacheControl: 'public, max-age=31536000', // Cache for 1 year (images don't change)
    }));

    const publicUrl = getPublicUrl(key);
    console.log(`[R2] Upload successful: ${publicUrl}`);

    return publicUrl;

  } catch (error: any) {
    console.error(`[R2] Upload failed for ${sourceUrl}:`, error.message);

    // Fallback to original URL if upload fails
    console.log('[R2] Falling back to source URL');
    return sourceUrl;
  }
}

// ============== CONVENIENCE FUNCTIONS ==============

/**
 * Upload fighter profile image (headshot)
 * Example: Jon Jones headshot → fighters/jon-jones-abc123.jpg
 */
export async function uploadFighterImage(
  imageUrl: string,
  fighterName: string
): Promise<string> {
  return uploadImageToR2(imageUrl, 'fighters', fighterName);
}

/**
 * Upload event banner image
 * Example: UFC 320 banner → events/ufc-320-def456.jpg
 */
export async function uploadEventImage(
  imageUrl: string,
  eventName: string
): Promise<string> {
  return uploadImageToR2(imageUrl, 'events', eventName);
}

/**
 * Upload news article image
 * Example: News thumbnail → news/mma-news-ghi789.jpg
 */
export async function uploadNewsImage(
  imageUrl: string,
  articleTitle?: string
): Promise<string> {
  return uploadImageToR2(imageUrl, 'news', articleTitle);
}

/**
 * Upload a local file buffer to R2 with a fixed key (no hash).
 * Used for default/static images like promotion logos.
 * Returns the public R2 URL, or null if R2 is not configured.
 */
export async function uploadLocalFileToR2(
  fileBuffer: Buffer,
  key: string,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  if (!isR2Configured()) {
    return null;
  }

  try {
    const client = getS3Client();

    if (await imageExists(key)) {
      return getPublicUrl(key);
    }

    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    }));

    return getPublicUrl(key);
  } catch (error: any) {
    console.error(`[R2] Local file upload failed for ${key}:`, error.message);
    return null;
  }
}

/**
 * Get R2 configuration status (for health checks and debugging)
 */
export function getR2Status(): {
  configured: boolean;
  endpoint?: string;
  bucket?: string;
  publicUrl?: string;
} {
  return {
    configured: isR2Configured(),
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET,
    publicUrl: process.env.R2_PUBLIC_URL,
  };
}
