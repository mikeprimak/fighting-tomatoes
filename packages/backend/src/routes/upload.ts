// packages/backend/src/routes/upload.ts
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { uploadLocalFileToR2 } from '../services/imageStorage';

// Allowed image types (validated by magic bytes, not just MIME type)
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Validate file content by checking magic bytes
async function validateImageContent(buffer: Buffer): Promise<{ valid: boolean; detectedType?: string }> {
  // Dynamic import for ESM-only file-type package
  const { fileTypeFromBuffer } = await import('file-type');
  const result = await fileTypeFromBuffer(buffer);

  if (!result) {
    return { valid: false };
  }

  const isValid = ALLOWED_IMAGE_TYPES.includes(result.mime);
  return { valid: isValid, detectedType: result.mime };
}

export async function uploadRoutes(fastify: FastifyInstance) {
  // Upload profile image
  // Rate limit: 10 uploads per hour to prevent storage abuse
  fastify.post('/upload/profile-image', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: 'No file uploaded',
          code: 'NO_FILE',
        });
      }

      // Get file buffer for validation
      const fileBuffer = await data.toBuffer();

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (fileBuffer.length > maxSize) {
        return reply.status(400).send({
          error: 'File too large. Maximum size is 5MB.',
          code: 'FILE_TOO_LARGE',
        });
      }

      // Validate actual file content by magic bytes (not just MIME type which can be spoofed)
      const validation = await validateImageContent(fileBuffer);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Invalid file content. Only JPEG, PNG, GIF, and WebP images are allowed.',
          code: 'INVALID_FILE_TYPE',
        });
      }

      // Use detected type for extension (more secure than trusting client)
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      const fileExt = extMap[validation.detectedType!] || '.jpg';
      const fileName = `${randomUUID()}${fileExt}`;

      // Prefer R2: durable + returns an absolute URL. Render's local filesystem
      // is ephemeral (files vanish on redeploy), and a relative /uploads/... URL
      // resolves against the web/app host (goodfights.app), not the backend —
      // which is why profile images rendered broken. Store to R2 and return the
      // absolute public URL so every client renders it as-is.
      const r2Url = await uploadLocalFileToR2(
        fileBuffer,
        `profiles/${fileName}`,
        validation.detectedType,
      );
      if (r2Url) {
        request.log.info(`Profile image uploaded to R2: ${r2Url}`);
        return reply.status(200).send({
          imageUrl: r2Url,
          message: 'Profile image uploaded successfully',
        });
      }

      // Fallback (R2 not configured, e.g. local dev): write to disk and return
      // an absolute URL built from the request host so it still resolves.
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
      const filePath = path.join(uploadDir, fileName);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(filePath, fileBuffer);

      const fileUrl = `${request.protocol}://${request.headers.host}/uploads/profiles/${fileName}`;
      request.log.info(`Profile image uploaded (local disk fallback): ${fileUrl}`);

      return reply.status(200).send({
        imageUrl: fileUrl,
        message: 'Profile image uploaded successfully',
      });
    } catch (error: any) {
      request.log.error('Profile image upload error:', error);
      return reply.status(500).send({
        error: 'Failed to upload profile image',
        code: 'UPLOAD_ERROR',
      });
    }
  });

  // Upload crew image
  // Rate limit: 10 uploads per hour to prevent storage abuse
  fastify.post('/upload/crew-image', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
    preValidation: [fastify.authenticate],
  }, async (request: any, reply: any) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: 'No file uploaded',
          code: 'NO_FILE',
        });
      }

      // Get file buffer for validation
      const fileBuffer = await data.toBuffer();

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (fileBuffer.length > maxSize) {
        return reply.status(400).send({
          error: 'File too large. Maximum size is 5MB.',
          code: 'FILE_TOO_LARGE',
        });
      }

      // Validate actual file content by magic bytes (not just MIME type which can be spoofed)
      const validation = await validateImageContent(fileBuffer);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Invalid file content. Only JPEG, PNG, GIF, and WebP images are allowed.',
          code: 'INVALID_FILE_TYPE',
        });
      }

      // Use detected type for extension (more secure than trusting client)
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      const fileExt = extMap[validation.detectedType!] || '.jpg';
      const fileName = `${randomUUID()}${fileExt}`;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'crews');
      const filePath = path.join(uploadDir, fileName);

      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Save file
      fs.writeFileSync(filePath, fileBuffer);

      // Return the URL
      const fileUrl = `/uploads/crews/${fileName}`;

      return reply.status(200).send({
        imageUrl: fileUrl,
        message: 'Image uploaded successfully',
      });
    } catch (error: any) {
      request.log.error('Image upload error:', error);
      return reply.status(500).send({
        error: 'Failed to upload image',
        code: 'UPLOAD_ERROR',
      });
    }
  });
}
