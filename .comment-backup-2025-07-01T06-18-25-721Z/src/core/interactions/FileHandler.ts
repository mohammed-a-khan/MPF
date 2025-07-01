// src/core/interactions/FileHandler.ts
import { Page, Download } from 'playwright';
import { CSWebElement } from '../elements/CSWebElement';
import { FileUploadOptions, DownloadOptions } from './types/interaction.types';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

export class FileHandler {
  private static instance: FileHandler;
  private readonly downloadPath: string;
  private readonly uploadPath: string;
  private activeDownloads: Map<string, Download> = new Map();

  private constructor() {
    this.downloadPath = path.join(process.cwd(), 'downloads');
    this.uploadPath = path.join(process.cwd(), 'test-data', 'uploads');
    this.ensureDirectories();
  }

  static getInstance(): FileHandler {
    if (!FileHandler.instance) {
      FileHandler.instance = new FileHandler();
    }
    return FileHandler.instance;
  }

  private async ensureDirectories(): Promise<void> {
    await FileUtils.ensureDir(this.downloadPath);
    await FileUtils.ensureDir(this.uploadPath);
  }

  async uploadFile(
    element: CSWebElement,
    filePath: string,
    options?: FileUploadOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting file upload: ${element.description}`, { filePath });
      
      // Resolve absolute path
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.uploadPath, filePath);
      
      // Validate file exists
      if (!await FileUtils.exists(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }
      
      // Validate file type if specified
      if (options?.acceptTypes) {
        const ext = path.extname(absolutePath).toLowerCase();
        const mimeType = this.getMimeType(ext);
        
        const isAccepted = options.acceptTypes.some(type => {
          if (type.includes('*')) {
            const [category] = type.split('/');
            return category ? mimeType.startsWith(category) : false;
          }
          return type === mimeType || type === ext;
        });
        
        if (!isAccepted) {
          throw new Error(`File type not accepted. Expected: ${options.acceptTypes.join(', ')}`);
        }
      }
      
      // Validate file size if specified
      if (options?.maxSize) {
        const stats = await fs.stat(absolutePath);
        if (stats.size > options.maxSize) {
          throw new Error(`File size ${stats.size} exceeds maximum ${options.maxSize}`);
        }
      }
      
      // Validate content if requested
      if (options?.validateContent) {
        await this.validateFileContent(absolutePath);
      }
      
      // Perform upload
      if (options?.simulateDragDrop) {
        await this.simulateDragDropUpload(element, absolutePath);
      } else {
        await element.upload(absolutePath);
      }
      
      ActionLogger.logInfo(`File upload completed: ${element.description}`, {
        duration: Date.now() - startTime,
        filePath: absolutePath,
        success: true
      });
    } catch (error) {
      ActionLogger.logError('File upload failed', error as Error);
      throw error;
    }
  }

  async uploadMultipleFiles(
    element: CSWebElement,
    filePaths: string[],
    options?: FileUploadOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting multiple file upload: ${element.description}`, { 
        fileCount: filePaths.length 
      });
      
      // Resolve and validate all paths
      const absolutePaths: string[] = [];
      
      for (const filePath of filePaths) {
        const absolutePath = path.isAbsolute(filePath) 
          ? filePath 
          : path.join(this.uploadPath, filePath);
        
        if (!await FileUtils.exists(absolutePath)) {
          throw new Error(`File not found: ${absolutePath}`);
        }
        
        absolutePaths.push(absolutePath);
      }
      
      // Validate all files if options specified
      if (options) {
        for (const absolutePath of absolutePaths) {
          await this.validateUploadFile(absolutePath, options);
        }
      }
      
      // Upload all files
      await element.upload(absolutePaths);
      
      ActionLogger.logInfo(`Multiple file upload completed: ${element.description}`, {
        duration: Date.now() - startTime,
        fileCount: absolutePaths.length,
        totalSize: await this.getTotalFileSize(absolutePaths),
        success: true
      });
    } catch (error) {
      ActionLogger.logError('Multiple file upload failed', error as Error);
      throw error;
    }
  }

  async dragAndDropFile(
    filePath: string,
    dropZone: CSWebElement,
    _options?: FileUploadOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting drag and drop file: ${dropZone.description}`, { filePath });
      
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.uploadPath, filePath);
      
      if (!await FileUtils.exists(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
      }
      
      await this.simulateDragDropUpload(dropZone, absolutePath);
      
      ActionLogger.logInfo(`Drag and drop file completed: ${dropZone.description}`, {
        duration: Date.now() - startTime,
        filePath: absolutePath,
        success: true
      });
    } catch (error) {
      ActionLogger.logError('Drag and drop file failed', error as Error);
      throw error;
    }
  }

  async waitForDownload(
    action: () => Promise<void>,
    options?: DownloadOptions
  ): Promise<Download> {
    const startTime = Date.now();
    const downloadId = crypto.randomBytes(16).toString('hex');
    
    try {
      ActionLogger.logInfo('Waiting for download', { starting: true });
      
      // Set up download promise before triggering action
      const page = (global as any).currentPage as Page;
      if (!page) {
        throw new Error('No active page context for download');
      }
      
      const downloadPromise = page.waitForEvent('download', {
        timeout: options?.timeout || 30000
      });
      
      // Trigger the download action
      await action();
      
      // Wait for download to start
      const download = await downloadPromise;
      this.activeDownloads.set(downloadId, download);
      
      // Wait for download to complete if requested
      if (options?.waitForComplete !== false) {
        await this.waitForDownloadComplete(download, options?.timeout);
      }
      
      // Save to specified path if provided
      if (options?.savePath) {
        await this.saveDownload(download, options.savePath);
      }
      
      // Validate size if specified
      if (options?.validateSize) {
        const size = await this.getDownloadedFileSize(download);
        if (size !== options.validateSize) {
          throw new Error(`Download size ${size} does not match expected ${options.validateSize}`);
        }
      }
      
      ActionLogger.logInfo('Download completed', {
        duration: Date.now() - startTime,
        url: download.url(),
        suggestedFilename: download.suggestedFilename()
      });
      
      return download;
    } catch (error) {
      ActionLogger.logError('Wait for download failed', error as Error);
      throw error;
    } finally {
      this.activeDownloads.delete(downloadId);
    }
  }

  async saveDownload(download: Download, savePath: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const absolutePath = path.isAbsolute(savePath)
        ? savePath
        : path.join(this.downloadPath, savePath);
      
      // Ensure directory exists
      await FileUtils.ensureDir(path.dirname(absolutePath));
      
      // Save the download
      await download.saveAs(absolutePath);
      
      ActionLogger.logInfo('Download saved', {
        duration: Date.now() - startTime,
        path: absolutePath,
        size: await this.getFileSizeAtPath(absolutePath)
      });
    } catch (error) {
      ActionLogger.logError('Save download failed', error as Error);
      throw error;
    }
  }

  async getDownloadedFileName(download: Download): Promise<string> {
    return download.suggestedFilename();
  }

  async getDownloadedFileSize(download: Download): Promise<number> {
    const path = await download.path();
    if (!path) {
      throw new Error('Download path not available');
    }
    
    return await this.getFileSizeAtPath(path);
  }

  async verifyDownloadContent(
    download: Download,
    expectedContent: string | RegExp | ((content: string) => boolean)
  ): Promise<boolean> {
    try {
      const downloadPath = await download.path();
      if (!downloadPath) {
        throw new Error('Download path not available');
      }
      
      const content = await fs.readFile(downloadPath, 'utf-8');
      
      if (typeof expectedContent === 'string') {
        return content.includes(expectedContent);
      } else if (expectedContent instanceof RegExp) {
        return expectedContent.test(content);
      } else {
        return expectedContent(content);
      }
    } catch (error) {
      ActionLogger.logError('Verify download content failed', error as Error);
      return false;
    }
  }

  async deleteDownload(download: Download): Promise<void> {
    try {
      const downloadPath = await download.path();
      if (downloadPath && await FileUtils.exists(downloadPath)) {
        await fs.unlink(downloadPath);
        ActionLogger.logDebug(`Download deleted: ${downloadPath}`);
      }
    } catch (error) {
      ActionLogger.logError('Delete download failed', error as Error);
    }
  }

  async getActiveDownloads(): Promise<Map<string, Download>> {
    return new Map(this.activeDownloads);
  }

  async cleanupDownloads(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(this.downloadPath);
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.downloadPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > olderThanMs) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        ActionLogger.logInfo(`Cleaned up ${deletedCount} old downloads`);
      }
    } catch (error) {
      ActionLogger.logError('Cleanup downloads failed', error as Error);
    }
  }

  private async simulateDragDropUpload(
    dropZone: CSWebElement,
    filePath: string
  ): Promise<void> {
    await dropZone.page.evaluate(
      async ({ dropZoneSelector, file }) => {
        const dataTransfer = new DataTransfer();
        const fileContent = await fetch(file.content).then(r => r.blob());
        const fileObj = new File([fileContent], file.name, { type: file.type });
        dataTransfer.items.add(fileObj);
        
        const dropZoneEl = document.querySelector(dropZoneSelector);
        if (!dropZoneEl) {
          throw new Error('Drop zone element not found');
        }
        
        // Simulate drag enter
        const dragEnterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer
        });
        dropZoneEl.dispatchEvent(dragEnterEvent);
        
        // Simulate drag over
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer
        });
        dropZoneEl.dispatchEvent(dragOverEvent);
        
        // Simulate drop
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer
        });
        dropZoneEl.dispatchEvent(dropEvent);
      },
      {
        dropZoneSelector: await this.getElementSelector(dropZone),
        file: {
          name: path.basename(filePath),
          type: this.getMimeType(path.extname(filePath)),
          content: `data:application/octet-stream;base64,${await this.fileToBase64(filePath)}`
        }
      }
    );
  }

  private async getElementSelector(element: CSWebElement): Promise<string> {
    // Get a selector for the element
    const { locatorType, locatorValue } = element.options;
    
    switch (locatorType) {
      case 'css':
        return locatorValue;
      case 'testid':
        return `[data-testid="${locatorValue}"]`;
      default:
        // For other types, we need to get a unique selector
        // Create a locator to get the element
        const locator = await this.createLocatorForElement(element);
        return await locator.evaluate((el: Element) => {
          // Try to generate a unique selector
          if (el.id) return `#${el.id}`;
          if (el.className) return `.${el.className.split(' ').join('.')}`;
          return el.tagName.toLowerCase();
        });
    }
  }

  private async validateUploadFile(
    filePath: string,
    options: FileUploadOptions
  ): Promise<void> {
    const stats = await fs.stat(filePath);
    
    if (options.maxSize && stats.size > options.maxSize) {
      throw new Error(`File size ${stats.size} exceeds maximum ${options.maxSize}`);
    }
    
    if (options.acceptTypes) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = this.getMimeType(ext);
      
      const isAccepted = options.acceptTypes.some(type => {
        if (type.includes('*')) {
          const [category] = type.split('/');
          return category ? mimeType.startsWith(category) : false;
        }
        return type === mimeType || type === ext;
      });
      
      if (!isAccepted) {
        throw new Error(`File type not accepted: ${mimeType}`);
      }
    }
  }

  private async validateFileContent(filePath: string): Promise<void> {
    // Basic content validation - can be extended
    const stats = await fs.stat(filePath);
    
    if (stats.size === 0) {
      throw new Error('File is empty');
    }
    
    // Check if file is readable
    await fs.access(filePath, fs.constants.R_OK);
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip',
      '.csv': 'text/csv'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  private async fileToBase64(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return content.toString('base64');
  }

  private async getFileSizeAtPath(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  private async getTotalFileSize(filePaths: string[]): Promise<number> {
    let total = 0;
    for (const filePath of filePaths) {
      total += await this.getFileSizeAtPath(filePath);
    }
    return total;
  }

  private async waitForDownloadComplete(
    download: Download,
    timeout: number = 30000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const failure = await download.failure();
      if (failure) {
        throw new Error(`Download failed: ${failure}`);
      }
      
      const path = await download.path();
      if (path) {
        // Download is complete
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error('Download timeout');
  }

  private async createLocatorForElement(element: CSWebElement): Promise<any> {
    const { locatorType, locatorValue } = element.options;
    const page = element.page;
    
    switch (locatorType) {
      case 'css':
        return page.locator(locatorValue);
      case 'xpath':
        return page.locator(`xpath=${locatorValue}`);
      case 'text':
        return page.getByText(locatorValue);
      case 'testid':
        return page.getByTestId(locatorValue);
      case 'label':
        return page.getByLabel(locatorValue);
      case 'placeholder':
        return page.getByPlaceholder(locatorValue);
      case 'alt':
        return page.getByAltText(locatorValue);
      case 'title':
        return page.getByTitle(locatorValue);
      case 'role':
        return page.getByRole(locatorValue as any);
      default:
        return page.locator(locatorValue);
    }
  }
}