// src/integrations/ado/EvidenceUploader.ts
import * as fs from 'fs';
import * as path from 'path';
import { ADOClient } from './ADOClient';
import { ADOConfig } from './ADOConfig';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';

export interface EvidenceAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  createdDate: string;
  comment?: string;
}

export interface EvidenceUploadOptions {
  compress?: boolean;
  maxSizeBytes?: number;
  chunkSize?: number;
  retryAttempts?: number;
}

export interface UploadProgress {
  totalBytes: number;
  uploadedBytes: number;
  percentage: number;
  currentFile?: string;
  totalFiles?: number;
  completedFiles?: number;
}

type ProgressCallback = (progress: UploadProgress) => void;

export class EvidenceUploader {
  private readonly logger = Logger.getInstance(EvidenceUploader.name);
  private readonly defaultChunkSize = 1024 * 1024 * 4;
  private readonly maxFileSize = 1024 * 1024 * 100;
  private uploadedAttachments = new Map<string, EvidenceAttachment>();
  private activeUploads = new Map<string, AbortController>();

  constructor(private readonly client: ADOClient) {
    this.logger.info('EvidenceUploader initialized');
  }
  
  private get endpoints() {
    return ADOConfig.getEndpoints();
  }

  async uploadScreenshot(
    runId: number,
    resultId: number,
    screenshotPath: string,
    options?: EvidenceUploadOptions
  ): Promise<EvidenceAttachment> {
    try {
      this.logger.info(`Uploading screenshot: ${path.basename(screenshotPath)}`);
      
      if (!await FileUtils.exists(screenshotPath)) {
        throw new Error(`Screenshot file not found: ${screenshotPath}`);
      }

      const stats = await fs.promises.stat(screenshotPath);
      const fileSize = stats.size;
      
      let finalPath = screenshotPath;
      if (options?.compress || fileSize > (options?.maxSizeBytes || this.maxFileSize)) {
        finalPath = await this.compressImage(screenshotPath);
      }

      const fileBuffer = await fs.promises.readFile(finalPath);
      const fileName = `Screenshot_${Date.now()}_${path.basename(finalPath)}`;
      
      const attachment = await this.uploadFile(
        runId,
        resultId,
        fileName,
        fileBuffer,
        'image/png',
        'Screenshot',
        options
      );

      if (finalPath !== screenshotPath) {
        await FileUtils.remove(finalPath);
      }

      this.logger.info(`Screenshot uploaded successfully: ${attachment.id}`);
      return attachment;
    } catch (error) {
      this.logger.error('Failed to upload screenshot:', error as Error);
      throw error;
    }
  }

  async uploadVideo(
    runId: number,
    resultId: number,
    videoPath: string,
    options?: EvidenceUploadOptions,
    progressCallback?: ProgressCallback
  ): Promise<EvidenceAttachment> {
    try {
      this.logger.info(`Uploading video: ${path.basename(videoPath)}`);
      
      if (!await FileUtils.exists(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      const stats = await fs.promises.stat(videoPath);
      const fileSize = stats.size;
      
      if (fileSize > this.maxFileSize) {
        throw new Error(`Video file too large: ${fileSize} bytes (max: ${this.maxFileSize} bytes)`);
      }

      const fileName = `Video_${Date.now()}_${path.basename(videoPath)}`;
      
      if (fileSize > this.defaultChunkSize) {
        return await this.uploadLargeFile(
          runId,
          resultId,
          videoPath,
          fileName,
          'video/mp4',
          'Video',
          options,
          progressCallback
        );
      }

      const fileBuffer = await fs.promises.readFile(videoPath);
      
      const attachment = await this.uploadFile(
        runId,
        resultId,
        fileName,
        fileBuffer,
        'video/mp4',
        'Video',
        options
      );

      this.logger.info(`Video uploaded successfully: ${attachment.id}`);
      return attachment;
    } catch (error) {
      this.logger.error('Failed to upload video:', error as Error);
      throw error;
    }
  }

  async uploadLog(
    runId: number,
    resultId: number,
    logContent: string | string[],
    logName?: string,
    options?: EvidenceUploadOptions
  ): Promise<EvidenceAttachment> {
    try {
      const fileName = logName || `TestLog_${Date.now()}.txt`;
      this.logger.info(`Uploading log: ${fileName}`);
      
      const content = Array.isArray(logContent) ? logContent.join('\n') : logContent;
      const fileBuffer = Buffer.from(content, 'utf-8');
      
      const attachment = await this.uploadFile(
        runId,
        resultId,
        fileName,
        fileBuffer,
        'text/plain',
        'Log',
        options
      );

      this.logger.info(`Log uploaded successfully: ${attachment.id}`);
      return attachment;
    } catch (error) {
      this.logger.error('Failed to upload log:', error as Error);
      throw error;
    }
  }

  async uploadHAR(
    runId: number,
    resultId: number,
    harPath: string,
    options?: EvidenceUploadOptions
  ): Promise<EvidenceAttachment> {
    try {
      this.logger.info(`Uploading HAR file: ${path.basename(harPath)}`);
      
      if (!await FileUtils.exists(harPath)) {
        throw new Error(`HAR file not found: ${harPath}`);
      }

      const fileBuffer = await fs.promises.readFile(harPath);
      const fileName = `NetworkTrace_${Date.now()}_${path.basename(harPath)}`;
      
      const attachment = await this.uploadFile(
        runId,
        resultId,
        fileName,
        fileBuffer,
        'application/json',
        'NetworkTrace',
        options
      );

      this.logger.info(`HAR file uploaded successfully: ${attachment.id}`);
      return attachment;
    } catch (error) {
      this.logger.error('Failed to upload HAR file:', error as Error);
      throw error;
    }
  }

  async uploadTrace(
    runId: number,
    resultId: number,
    tracePath: string,
    options?: EvidenceUploadOptions
  ): Promise<EvidenceAttachment> {
    try {
      this.logger.info(`Uploading trace file: ${path.basename(tracePath)}`);
      
      if (!await FileUtils.exists(tracePath)) {
        throw new Error(`Trace file not found: ${tracePath}`);
      }

      const fileName = `Trace_${Date.now()}_${path.basename(tracePath)}`;
      
      const stats = await fs.promises.stat(tracePath);
      if (stats.size > this.defaultChunkSize) {
        return await this.uploadLargeFile(
          runId,
          resultId,
          tracePath,
          fileName,
          'application/zip',
          'Trace',
          options
        );
      }

      const fileBuffer = await fs.promises.readFile(tracePath);
      
      const attachment = await this.uploadFile(
        runId,
        resultId,
        fileName,
        fileBuffer,
        'application/zip',
        'Trace',
        options
      );

      this.logger.info(`Trace file uploaded successfully: ${attachment.id}`);
      return attachment;
    } catch (error) {
      this.logger.error('Failed to upload trace file:', error as Error);
      throw error;
    }
  }

  async uploadFile(
    runId: number,
    resultId: number,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
    attachmentType: string,
    options?: EvidenceUploadOptions
  ): Promise<EvidenceAttachment> {
    try {
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const controller = new AbortController();
      this.activeUploads.set(uploadId, controller);

      const cacheKey = `${fileName}_${fileBuffer.length}`;
      if (this.uploadedAttachments.has(cacheKey)) {
        this.logger.debug(`File already uploaded: ${fileName}`);
        return this.uploadedAttachments.get(cacheKey)!;
      }

      const uploadUrl = ADOConfig.buildUrl(this.endpoints.attachments);
      const uploadResponse = await this.client.post<{ id: string; url: string }>(
        uploadUrl,
        fileBuffer,
        {
          headers: {
            'Content-Type': contentType,
            'Content-Length': fileBuffer.length.toString()
          },
          timeout: options?.maxSizeBytes ? 300000 : 60000
        }
      );

      const attachment: EvidenceAttachment = {
        id: uploadResponse.data.id,
        name: fileName,
        url: uploadResponse.data.url,
        size: fileBuffer.length,
        createdDate: new Date().toISOString(),
        comment: `${attachmentType} evidence for test result ${resultId}`
      };

      await this.linkAttachmentToResult(runId, resultId, attachment, attachmentType);

      this.uploadedAttachments.set(cacheKey, attachment);
      
      this.activeUploads.delete(uploadId);
      
      return attachment;
    } catch (error) {
      this.logger.error(`Failed to upload file ${fileName}:`, error as Error);
      throw error;
    }
  }

  private async uploadLargeFile(
    runId: number,
    resultId: number,
    filePath: string,
    fileName: string,
    contentType: string,
    attachmentType: string,
    options?: EvidenceUploadOptions,
    progressCallback?: ProgressCallback
  ): Promise<EvidenceAttachment> {
    const stats = await fs.promises.stat(filePath);
    const totalSize = stats.size;
    const chunkSize = options?.chunkSize || this.defaultChunkSize;
    const totalChunks = Math.ceil(totalSize / chunkSize);
    
    this.logger.info(`Uploading large file in ${totalChunks} chunks: ${fileName}`);
    
    let uploadedBytes = 0;
    const chunks: Buffer[] = [];
    
    const stream = fs.createReadStream(filePath, {
      highWaterMark: chunkSize
    });

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        uploadedBytes += buffer.length;
        
        if (progressCallback) {
          progressCallback({
            totalBytes: totalSize,
            uploadedBytes,
            percentage: Math.round((uploadedBytes / totalSize) * 100),
            currentFile: fileName
          });
        }
      });

      stream.on('end', async () => {
        try {
          const fileBuffer = Buffer.concat(chunks);
          
          const attachment = await this.uploadFile(
            runId,
            resultId,
            fileName,
            fileBuffer,
            contentType,
            attachmentType,
            options
          );
          
          resolve(attachment);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', reject);
    });
  }

  private async linkAttachmentToResult(
    runId: number,
    resultId: number,
    attachment: EvidenceAttachment,
    attachmentType: string
  ): Promise<void> {
    const linkBody = {
      stream: {
        id: attachment.id,
        url: attachment.url
      },
      fileName: attachment.name,
      comment: attachment.comment,
      attachmentType
    };

    const linkUrl = ADOConfig.buildUrl(
      `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}/attachments`
    );
    
    await this.client.post(linkUrl, linkBody);
  }

  private async compressImage(imagePath: string): Promise<string> {
    try {
      this.logger.warn('Image compression not implemented, using original file');
      return imagePath;
    } catch (error) {
      this.logger.error('Failed to compress image:', error as Error);
      return imagePath;
    }
  }

  async uploadMultipleFiles(
    runId: number,
    resultId: number,
    files: Array<{
      path: string;
      type: 'screenshot' | 'video' | 'log' | 'har' | 'trace' | 'other';
      name?: string;
    }>,
    options?: EvidenceUploadOptions,
    progressCallback?: ProgressCallback
  ): Promise<EvidenceAttachment[]> {
    const attachments: EvidenceAttachment[] = [];
    const totalFiles = files.length;
    let completedFiles = 0;

    for (const file of files) {
      try {
        let attachment: EvidenceAttachment;
        
        switch (file.type) {
          case 'screenshot':
            attachment = await this.uploadScreenshot(runId, resultId, file.path, options);
            break;
          case 'video':
            attachment = await this.uploadVideo(runId, resultId, file.path, options, (progress) => {
              if (progressCallback) {
                progressCallback({
                  ...progress,
                  totalFiles,
                  completedFiles
                });
              }
            });
            break;
          case 'log':
            const logContent = await fs.promises.readFile(file.path, 'utf-8');
            attachment = await this.uploadLog(runId, resultId, logContent, file.name, options);
            break;
          case 'har':
            attachment = await this.uploadHAR(runId, resultId, file.path, options);
            break;
          case 'trace':
            attachment = await this.uploadTrace(runId, resultId, file.path, options);
            break;
          default:
            const buffer = await fs.promises.readFile(file.path);
            attachment = await this.uploadFile(
              runId,
              resultId,
              file.name || path.basename(file.path),
              buffer,
              'application/octet-stream',
              'Other',
              options
            );
        }
        
        attachments.push(attachment);
        completedFiles++;
        
        if (progressCallback) {
          progressCallback({
            totalBytes: 0,
            uploadedBytes: 0,
            percentage: Math.round((completedFiles / totalFiles) * 100),
            totalFiles,
            completedFiles
          });
        }
      } catch (error) {
        this.logger.error(`Failed to upload file ${file.path}:`, error as Error);
      }
    }

    return attachments;
  }

  cancelUpload(uploadId: string): void {
    const controller = this.activeUploads.get(uploadId);
    if (controller) {
      controller.abort();
      this.activeUploads.delete(uploadId);
      this.logger.info(`Upload cancelled: ${uploadId}`);
    }
  }

  cancelAllUploads(): void {
    for (const [, controller] of this.activeUploads) {
      controller.abort();
    }
    this.activeUploads.clear();
    this.logger.info('All uploads cancelled');
  }

  getUploadStats(): {
    cachedAttachments: number;
    activeUploads: number;
    totalUploadedSize: number;
  } {
    let totalSize = 0;
    for (const attachment of this.uploadedAttachments.values()) {
      totalSize += attachment.size;
    }

    return {
      cachedAttachments: this.uploadedAttachments.size,
      activeUploads: this.activeUploads.size,
      totalUploadedSize: totalSize
    };
  }

  clearCache(): void {
    this.uploadedAttachments.clear();
    this.logger.debug('Evidence cache cleared');
  }
}
