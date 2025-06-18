// services/s3Service.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN; // Optional: for CDN URLs

export interface UploadOptions {
  folder?: string;
  fileName?: string;
  contentType?: string;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  overwrite?: boolean;
  generateThumbnail?: boolean;
}

export interface UploadResult {
  key: string;
  url: string;
  fileName: string;
  size: number;
  contentType: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  imageKey: string;
  publicUrl: string;
}

export class S3Service {
  /**
   * Generate a unique file name based on user ID and original filename
   */

  private static generateImageKey(userId: string, originalFileName: string): string {
    const ext = path.extname(originalFileName).toLowerCase();
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    
    // Consistent naming for profile images with overwrite capability
    return `healthcare/profiles/images/${userId}/profile_${timestamp}_${randomSuffix}${ext}`;
  }

  private static generateFileName(userId: string, originalName: string, folder?: string): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    
    const fileName = `${sanitizedBaseName}_${timestamp}_${randomSuffix}${ext}`;
    
    if (folder) {
      return `${folder}/${userId}/${fileName}`;
    }
    
    return `${userId}/${fileName}`;
  }

  /**
   * Generate a consistent file key for overwrite scenarios
   */
  private static generateConsistentKey(userId: string, fileType: string, folder?: string): string {
    if (folder) {
      return `${folder}/${userId}/${fileType}`;
    }
    return `${userId}/${fileType}`;
  }

  /**
   * Validate file type and size
   */
  private static validateFile(file: Buffer | Uint8Array, options: UploadOptions): void {
    if (options.maxSize && file.length > options.maxSize) {
      throw new Error(`File size exceeds maximum limit of ${options.maxSize} bytes`);
    }

    if (options.allowedTypes && options.contentType) {
      const isAllowed = options.allowedTypes.some(type => 
        options.contentType!.startsWith(type)
      );
      if (!isAllowed) {
        throw new Error(`File type ${options.contentType} is not allowed`);
      }
    }
  }

  /**
   * Get public URL for S3 object
   */
  static getPublicUrl(key: string): string {
    if (CLOUDFRONT_DOMAIN) {
      return `https://${CLOUDFRONT_DOMAIN}/${key}`;
    }
    return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'eu-west-2'}.amazonaws.com/${key}`;
  }
  

  /**
   * Upload file to S3
   */
  static async uploadFile(
    file: Buffer | Uint8Array,
    userId: string,
    originalFileName: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      // Set default options
      const {
        folder = 'uploads',
        contentType = 'application/octet-stream',
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = ['image/', 'application/pdf', 'text/'],
        overwrite = false,
        fileName
      } = options;

      // Validate file
      this.validateFile(file, { ...options, contentType, maxSize, allowedTypes });

      // Generate file key
      let key: string;
      if (overwrite && fileName) {
        // For overwrite scenarios, use consistent naming
        const ext = path.extname(originalFileName);
        key = this.generateConsistentKey(userId, `${fileName}${ext}`, folder);
      } else {
        // Generate unique filename
        key = this.generateFileName(userId, originalFileName, folder);
      }

      // Prepare upload parameters
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        CacheControl: 'public, max-age=31536000', // 1 year cache
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
          originalFileName: originalFileName,
        },
      };

      // Upload to S3
      const command = new PutObjectCommand(uploadParams as any);
      await s3Client.send(command);

      // Return upload result
      return {
        key,
        url: this.getPublicUrl(key),
        fileName: path.basename(key),
        size: file.length,
        contentType,
      };
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete file from S3
   */
  static async deleteFile(key: string): Promise<void> {
    try {
      const deleteParams = {
        Bucket: BUCKET_NAME,
        Key: key,
      };

      const command = new DeleteObjectCommand(deleteParams);
      await s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate presigned URL for direct upload from client
   */
  static async generatePresignedUploadUrl(
    userId: string,
    fileName: string,
    contentType: string,
    folder?: string,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<{ url: string; key: string; fields: Record<string, string> }> {
    try {
      const key = this.generateFileName(userId, fileName, folder);
      
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });

      return {
        url,
        key,
        fields: {
          'Content-Type': contentType,
          'x-amz-server-side-encryption': 'AES256',
        },
      };
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw new Error('Failed to generate upload URL');
    }
  }

  /**
   * Generate presigned URL for file download
   */
  static async generatePresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating presigned download URL:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Upload healthcare profile image with overwrite capability
   */
  static async uploadHealthcareProfileImage(
    file: Buffer | Uint8Array,
    userId: string,
    originalFileName: string,
    existingImageUrl?: string
  ): Promise<UploadResult> {
    try {
      // If there's an existing image, extract the key and delete it
      if (existingImageUrl) {
        const existingKey = this.extractKeyFromUrl(existingImageUrl);
        if (existingKey) {
          try {
            await this.deleteFile(existingKey);
          } catch (error) {
            console.warn('Failed to delete existing image:', error);
            // Continue with upload even if deletion fails
          }
        }
      }

      // Upload new image with consistent naming for healthcare profiles
      return await this.uploadFile(file, userId, originalFileName, {
        folder: 'healthcare/profiles/images',
        fileName: 'profile_image',
        contentType: this.getImageContentType(originalFileName),
        maxSize: 5 * 1024 * 1024, // 5MB for images
        allowedTypes: ['image/'],
        overwrite: true,
      });
    } catch (error) {
      console.error('Error uploading healthcare profile image:', error);
      throw new Error('Failed to upload profile image');
    }
  }

  static validateImageFile(file: File): { isValid: boolean; error?: string } {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (file.size > maxSize) {
      return { isValid: false, error: 'Image size must be less than 5MB' };
    }

    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'Only JPG, PNG, and WebP images are allowed' };
    }

    return { isValid: true };
  }


  /**
   * Extract S3 key from URL
   */
  private static extractKeyFromUrl(url: string): string | null {
    try {
      // Handle CloudFront URLs
      if (CLOUDFRONT_DOMAIN && url.includes(CLOUDFRONT_DOMAIN)) {
        return url.split(`https://${CLOUDFRONT_DOMAIN}/`)[1] || null;
      }

      // Handle direct S3 URLs
      const s3Pattern = new RegExp(`https://${BUCKET_NAME}\\.s3\\.[^/]+\\.amazonaws\\.com/(.+)`);
      const match = url.match(s3Pattern);
      return match ? match[1] : null;
    } catch (error) {
      console.warn('Failed to extract key from URL:', url);
      return null;
    }
  }

  /**
   * Get content type based on file extension
   */
  private static getImageContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Batch delete files
   */
  static async deleteMultipleFiles(keys: string[]): Promise<void> {
    try {
      const deletePromises = keys.map(key => this.deleteFile(key));
      await Promise.allSettled(deletePromises);
    } catch (error) {
      console.error('Error in batch delete:', error);
      throw new Error('Failed to delete multiple files');
    }
  }

  /**
   * Check if file exists in S3
   */
  static async fileExists(key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      await s3Client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  static async deleteImageByUrl(imageUrl: string): Promise<void> {
    try {
      const key = this.extractKeyFromUrl(imageUrl);
      if (!key) {
        console.warn('Could not extract key from URL:', imageUrl);
        return;
      }

      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      console.log('Successfully deleted image:', key);
    } catch (error) {
      console.error('Error deleting image:', error);
      // Don't throw error - deletion failure shouldn't break the update
    }
  }

  /**
   * Get file metadata
   */
  static async getFileMetadata(key: string): Promise<any> {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      const response = await s3Client.send(command);
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        etag: response.ETag,
      };
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }
}