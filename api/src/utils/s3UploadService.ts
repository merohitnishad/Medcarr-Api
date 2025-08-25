// services/s3Service.ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import path from "path";

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-west-2",
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

  private static generateImageKey(
    userId: string,
    originalFileName: string
  ): string {
    const ext = path.extname(originalFileName).toLowerCase();
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString("hex");

    // Consistent naming for profile images with overwrite capability
    return `healthcare/profiles/images/${userId}/profile_${timestamp}_${randomSuffix}${ext}`;
  }

  private static generateFileName(
    userId: string,
    originalName: string,
    folder?: string
  ): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, "_");
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString("hex");

    const fileName = `${sanitizedBaseName}_${timestamp}_${randomSuffix}${ext}`;

    if (folder) {
      return `${folder}/${userId}/${fileName}`;
    }

    return `${userId}/${fileName}`;
  }

  /**
   * Generate a consistent file key for overwrite scenarios
   */
  private static generateConsistentKey(
    userId: string,
    fileType: string,
    folder?: string
  ): string {
    if (folder) {
      return `${folder}/${userId}/${fileType}`;
    }
    return `${userId}/${fileType}`;
  }

  /**
   * Validate file type and size
   */
  private static validateFile(
    file: Buffer | Uint8Array,
    options: UploadOptions
  ): void {
    if (options.maxSize && file.length > options.maxSize) {
      throw new Error(
        `File size exceeds maximum limit of ${options.maxSize} bytes`
      );
    }

    if (options.allowedTypes && options.contentType) {
      const isAllowed = options.allowedTypes.some((type) =>
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
    return `https://${BUCKET_NAME}.s3.${
      process.env.AWS_REGION || "eu-west-2"
    }.amazonaws.com/${key}`;
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
        folder = "uploads",
        contentType = "application/octet-stream",
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = ["image/", "application/pdf", "text/"],
        overwrite = false,
        fileName,
      } = options;

      // Validate file
      this.validateFile(file, {
        ...options,
        contentType,
        maxSize,
        allowedTypes,
      });

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
        ServerSideEncryption: "AES256",
        CacheControl: "public, max-age=31536000", // 1 year cache
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
      console.error("Error uploading file to S3:", error);
      throw new Error(
        `Failed to upload file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
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
      console.error("Error deleting file from S3:", error);
      throw new Error(
        `Failed to delete file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate presigned URL for direct upload from client
   */
  static async generatePresignedUploadUrl(
    userId: string,
    fileName: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<PresignedUploadResult> {
    try {
      // Validate content type
      if (!contentType.startsWith("image/")) {
        throw new Error("Only image files are allowed");
      }

      const imageKey = this.generateImageKey(userId, fileName);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: imageKey,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
        CacheControl: "public, max-age=31536000", // 1 year cache
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
          originalFileName: fileName,
        },
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
      const publicUrl = this.getPublicUrl(imageKey);

      return {
        uploadUrl,
        imageKey,
        publicUrl,
      };
    } catch (error) {
      console.error("Error generating presigned URL:", error);
      throw new Error("Failed to generate upload URL");
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
      console.error("Error generating presigned download URL:", error);
      throw new Error("Failed to generate download URL");
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
            console.warn("Failed to delete existing image:", error);
            // Continue with upload even if deletion fails
          }
        }
      }

      // Upload new image with consistent naming for healthcare profiles
      return await this.uploadFile(file, userId, originalFileName, {
        folder: "healthcare/profiles/images",
        fileName: "profile_image",
        contentType: this.getImageContentType(originalFileName),
        maxSize: 5 * 1024 * 1024, // 5MB for images
        allowedTypes: ["image/"],
        overwrite: true,
      });
    } catch (error) {
      console.error("Error uploading healthcare profile image:", error);
      throw new Error("Failed to upload profile image");
    }
  }

  static validateImageFile(file: File): { isValid: boolean; error?: string } {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

    if (file.size > maxSize) {
      return { isValid: false, error: "Image size must be less than 5MB" };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: "Only JPG, PNG, and WebP images are allowed",
      };
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
      const s3Pattern = new RegExp(
        `https://${BUCKET_NAME}\\.s3\\.[^/]+\\.amazonaws\\.com/(.+)`
      );
      const match = url.match(s3Pattern);
      return match ? match[1] : null;
    } catch (error) {
      console.warn("Failed to extract key from URL:", url);
      return null;
    }
  }

  /**
   * Get content type based on file extension
   */
  private static getImageContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    return mimeTypes[ext] || "image/jpeg";
  }

  /**
   * Batch delete files
   */
  static async deleteMultipleFiles(keys: string[]): Promise<void> {
    try {
      const deletePromises = keys.map((key) => this.deleteFile(key));
      await Promise.allSettled(deletePromises);
    } catch (error) {
      console.error("Error in batch delete:", error);
      throw new Error("Failed to delete multiple files");
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
        console.warn("Could not extract key from URL:", imageUrl);
        return;
      }

      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      console.log("Successfully deleted image:", key);
    } catch (error) {
      console.error("Error deleting image:", error);
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
      console.error("Error getting file metadata:", error);
      throw new Error("Failed to get file metadata");
    }
  }

  // Add these methods to your existing S3Service class in services/s3Service.ts

  /**
   * Generate presigned URL for dispute document upload
   */
  static async generateDisputeDocumentUploadUrl(
    userId: string,
    disputeId: string,
    fileName: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<PresignedUploadResult> {
    try {
      // Validate content type for dispute documents
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(contentType)) {
        throw new Error(
          "File type not allowed. Supported: JPG, PNG, WebP, PDF, DOC, DOCX"
        );
      }

      const documentKey = this.generateDisputeDocumentKey(
        userId,
        disputeId,
        fileName
      );

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: documentKey,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
        CacheControl: "public, max-age=31536000", // 1 year cache
        Metadata: {
          userId: userId,
          disputeId: disputeId,
          uploadedAt: new Date().toISOString(),
          originalFileName: fileName,
          documentType: "dispute_document",
        },
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
      const publicUrl = this.getPublicUrl(documentKey);

      return {
        uploadUrl,
        imageKey: documentKey,
        publicUrl,
      };
    } catch (error) {
      console.error(
        "Error generating presigned URL for dispute document:",
        error
      );
      throw new Error("Failed to generate document upload URL");
    }
  }

  /**
   * Generate dispute document key with organized folder structure
   */
  private static generateDisputeDocumentKey(
    userId: string,
    disputeId: string,
    originalFileName: string
  ): string {
    const ext = path.extname(originalFileName).toLowerCase();
    const baseName = path.basename(originalFileName, ext);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9]/g, "_");
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString("hex");

    const fileName = `${sanitizedBaseName}_${timestamp}_${randomSuffix}${ext}`;

    return `disputes/${disputeId}/documents/${userId}/${fileName}`;
  }

  /**
   * Upload dispute document directly (alternative to presigned URL)
   */
  static async uploadDisputeDocument(
    file: Buffer | Uint8Array,
    userId: string,
    disputeId: string,
    originalFileName: string,
    contentType: string
  ): Promise<UploadResult> {
    try {
      // Validate file type
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(contentType)) {
        throw new Error(
          "File type not allowed. Supported: JPG, PNG, WebP, PDF, DOC, DOCX"
        );
      }

      // Validate file size (max 10MB for dispute documents)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.length > maxSize) {
        throw new Error("File size exceeds maximum limit of 10MB");
      }

      const documentKey = this.generateDisputeDocumentKey(
        userId,
        disputeId,
        originalFileName
      );

      // Prepare upload parameters
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: documentKey,
        Body: file,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
        CacheControl: "private, max-age=86400", // 1 day cache
        Metadata: {
          userId: userId,
          disputeId: disputeId,
          uploadedAt: new Date().toISOString(),
          originalFileName: originalFileName,
          documentType: "dispute_document",
        },
      };

      // Upload to S3
      const command = new PutObjectCommand(uploadParams as any);
      await s3Client.send(command);

      // Return upload result
      return {
        key: documentKey,
        url: this.getPublicUrl(documentKey),
        fileName: path.basename(documentKey),
        size: file.length,
        contentType,
      };
    } catch (error) {
      console.error("Error uploading dispute document to S3:", error);
      throw new Error(
        `Failed to upload document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete all documents for a dispute (admin function)
   */
  static async deleteDisputeDocuments(disputeId: string): Promise<void> {
    try {
      // This would require listing all objects with the dispute prefix
      // For now, individual document deletion should be used
      // You could implement this using S3's listObjectsV2 if needed
      console.warn(
        "Bulk dispute document deletion not implemented. Use individual document deletion."
      );
    } catch (error) {
      console.error("Error deleting dispute documents:", error);
      throw new Error("Failed to delete dispute documents");
    }
  }

  /**
   * Validate dispute document file from client side
   */
  static validateDisputeDocumentFile(file: File): {
    isValid: boolean;
    error?: string;
  } {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (file.size > maxSize) {
      return { isValid: false, error: "File size must be less than 10MB" };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: "Only JPG, PNG, WebP, PDF, DOC, and DOCX files are allowed",
      };
    }

    return { isValid: true };
  }

  /**
   * Get file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Generate presigned URL for DBS document upload
   */
  static async generateDbsDocumentUploadUrl(
    userId: string,
    fileName: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<PresignedUploadResult> {
    try {
      // Validate content type for DBS documents
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(contentType)) {
        throw new Error(
          "File type not allowed. Supported: PDF, DOC, DOCX"
        );
      }

      const documentKey = this.generateDbsDocumentKey(userId, fileName);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: documentKey,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
        CacheControl: "private, max-age=86400", // 1 day cache
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
          originalFileName: fileName,
          documentType: "dbs_document",
        },
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
      const publicUrl = this.getPublicUrl(documentKey);

      return {
        uploadUrl,
        imageKey: documentKey,
        publicUrl,
      };
    } catch (error) {
      console.error(
        "Error generating presigned URL for DBS document:",
        error
      );
      throw new Error("Failed to generate DBS document upload URL");
    }
  }

  /**
   * Generate DBS document key with organized folder structure
   */
  private static generateDbsDocumentKey(
    userId: string,
    originalFileName: string
  ): string {
    const ext = path.extname(originalFileName).toLowerCase();
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString("hex");

    const fileName = `dbs_document_${timestamp}_${randomSuffix}${ext}`;

    return `healthcare/dbs/${userId}/${fileName}`;
  }

  /**
   * Upload DBS document directly (alternative to presigned URL)
   */
  static async uploadDbsDocument(
    file: Buffer | Uint8Array,
    userId: string,
    originalFileName: string,
    contentType: string
  ): Promise<UploadResult> {
    try {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(contentType)) {
        throw new Error(
          "File type not allowed. Supported: PDF, DOC, DOCX"
        );
      }

      // Validate file size (max 10MB for DBS documents)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.length > maxSize) {
        throw new Error("File size exceeds maximum limit of 10MB");
      }

      const documentKey = this.generateDbsDocumentKey(userId, originalFileName);

      // Prepare upload parameters
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: documentKey,
        Body: file,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
        CacheControl: "private, max-age=86400", // 1 day cache
        Metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString(),
          originalFileName: originalFileName,
          documentType: "dbs_document",
        },
      };

      // Upload to S3
      const command = new PutObjectCommand(uploadParams as any);
      await s3Client.send(command);

      // Return upload result
      return {
        key: documentKey,
        url: this.getPublicUrl(documentKey),
        fileName: path.basename(documentKey),
        size: file.length,
        contentType,
      };
    } catch (error) {
      console.error("Error uploading DBS document to S3:", error);
      throw new Error(
        `Failed to upload DBS document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate DBS document file from client side
   */
  static validateDbsDocumentFile(file: File): {
    isValid: boolean;
    error?: string;
  } {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (file.size > maxSize) {
      return { isValid: false, error: "File size must be less than 10MB" };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: "Only PDF, DOC, and DOCX files are allowed",
      };
    }

    return { isValid: true };
  }
}
