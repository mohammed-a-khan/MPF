// src/reporting/collectors/ScreenshotCollector.ts

import { Page } from 'playwright';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import {
  Evidence,
  EvidenceType,
  CollectorOptions
} from '../types/reporting.types';

export interface ScreenshotEvidence extends Evidence {
  type: EvidenceType.SCREENSHOT;
  screenshotId?: string;
  name: string;
  fullPath?: string;
  relativePath?: string;
  size: number;
  dimensions?: { width: number; height: number };
  format: string;
  metadata: ScreenshotMetadata;
  description?: string;
  thumbnail?: string | null;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  quality?: number;
  type?: 'png' | 'jpeg';
  omitBackground?: boolean;
  encoding?: 'base64' | 'binary';
  timeout?: number;
  animations?: 'disabled' | 'allow';
  caret?: 'hide' | 'initial';
  scale?: 'css' | 'device';
  maskSelectors?: string[];
  description?: string;
  tags?: string[];
  format?: string;
}

export interface ScreenshotMetadata {
  scenarioId: string;
  stepId?: string;
  url?: string;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  isLandscape?: boolean;
  userAgent?: string;
  errorMessage?: string;
  duration?: number;
  attempt?: number;
  [key: string]: any;
}

export class ScreenshotCollector {
  private static instance: ScreenshotCollector;
  private readonly logger = Logger.getInstance();
  
  private readonly screenshots: Map<string, ScreenshotEvidence[]> = new Map();
  private readonly pageReferences: Map<string, Page> = new Map();
  
  private readonly captureOnFailure: boolean;
  private readonly captureOnSuccess: boolean;
  private readonly fullPageScreenshots: boolean;
  private readonly maskSensitiveData: boolean;
  private readonly imageQuality: number;
  private readonly maxScreenshotSize: number;
  private readonly thumbnailSize: { width: number; height: number };
  private readonly comparisonEnabled: boolean;
  
  private executionId: string = '';
  private screenshotCount: number = 0;

  private constructor() {
    this.captureOnFailure = ConfigurationManager.getBoolean('SCREENSHOT_ON_FAILURE', true);
    this.captureOnSuccess = ConfigurationManager.getBoolean('SCREENSHOT_ON_SUCCESS', false);
    this.fullPageScreenshots = ConfigurationManager.getBoolean('FULL_PAGE_SCREENSHOTS', false);
    this.maskSensitiveData = ConfigurationManager.getBoolean('MASK_SENSITIVE_DATA', true);
    this.imageQuality = ConfigurationManager.getInt('SCREENSHOT_QUALITY', 90);
    this.maxScreenshotSize = ConfigurationManager.getInt('MAX_SCREENSHOT_SIZE_MB', 5) * 1024 * 1024;
    this.thumbnailSize = {
      width: ConfigurationManager.getInt('THUMBNAIL_WIDTH', 320),
      height: ConfigurationManager.getInt('THUMBNAIL_HEIGHT', 240)
    };
    this.comparisonEnabled = ConfigurationManager.getBoolean('SCREENSHOT_COMPARISON', true);
  }

  static getInstance(): ScreenshotCollector {
    if (!ScreenshotCollector.instance) {
      ScreenshotCollector.instance = new ScreenshotCollector();
    }
    return ScreenshotCollector.instance;
  }

  async initialize(executionId: string, _options?: CollectorOptions): Promise<void> {
    this.executionId = executionId;
    this.screenshotCount = 0;
    this.screenshots.clear();
    this.pageReferences.clear();
    
    ActionLogger.logCollectorInitialization('screenshot', executionId);
  }

  registerPage(scenarioId: string, page: Page): void {
    this.pageReferences.set(scenarioId, page);
  }

  unregisterPage(scenarioId: string): void {
    this.pageReferences.delete(scenarioId);
  }

  async captureScreenshot(
    scenarioId: string,
    name: string,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotEvidence | null> {
    const startTime = Date.now();
    
    try {
      const page = this.pageReferences.get(scenarioId);
      if (!page) {
        this.logger.warn(`No page registered for scenario ${scenarioId}`);
        return null;
      }
      
      if (this.maskSensitiveData && options.maskSelectors) {
        await this.maskElements(page, options.maskSelectors);
      }
      
      const screenshotOptions: any = {
        fullPage: options.fullPage ?? this.fullPageScreenshots,
        quality: options.quality ?? this.imageQuality,
        type: 'png' as const,
        animations: 'disabled' as const
      };
      
      if (options.clip) {
        screenshotOptions.clip = options.clip;
      }
      
      const screenshotBuffer = await page.screenshot(screenshotOptions);
      
      if (screenshotBuffer.length > this.maxScreenshotSize) {
        this.logger.warn(
          `Screenshot exceeds size limit: ${screenshotBuffer.length} > ${this.maxScreenshotSize}`
        );
        
        const reducedOptions = {
          ...screenshotOptions,
          quality: Math.max(30, this.imageQuality - 30),
          type: 'jpeg' as const
        };
        const reducedQualityBuffer = await page.screenshot(reducedOptions);
        
        if (reducedQualityBuffer.length < screenshotBuffer.length) {
          return await this.createScreenshotEvidence(
            scenarioId,
            name,
            reducedQualityBuffer,
            { ...options, format: 'jpeg' },
            Date.now() - startTime
          );
        }
      }
      
      const evidence = await this.createScreenshotEvidence(
        scenarioId,
        name,
        screenshotBuffer,
        options,
        Date.now() - startTime
      );
      
      if (!this.screenshots.has(scenarioId)) {
        this.screenshots.set(scenarioId, []);
      }
      this.screenshots.get(scenarioId)!.push(evidence);
      
      this.screenshotCount++;
      
      ActionLogger.logInfo('Screenshot captured', {
        scenarioId,
        name,
        size: screenshotBuffer.length,
        duration: Date.now() - startTime
      });
      
      return evidence;
      
    } catch (error) {
      this.logger.error(`Failed to capture screenshot for ${scenarioId}`, error as Error);
      return null;
    }
  }

  async collectForScenario(
    scenarioId: string,
    scenarioName: string
  ): Promise<ScreenshotEvidence[]> {
    const screenshots = this.screenshots.get(scenarioId) || [];
    
    if (this.captureOnSuccess && this.pageReferences.has(scenarioId)) {
      const finalScreenshot = await this.captureScreenshot(
        scenarioId,
        `${scenarioName}_final`,
        { fullPage: true }
      );
      
      if (finalScreenshot) {
        screenshots.push(finalScreenshot);
      }
    }
    
    return screenshots;
  }

  async collectForStep(
    scenarioId: string,
    stepId: string,
    stepText: string,
    status: 'passed' | 'failed' | 'skipped'
  ): Promise<ScreenshotEvidence[]> {
    const screenshots: ScreenshotEvidence[] = [];
    
    if (status === 'failed' && this.captureOnFailure) {
      const errorScreenshot = await this.captureScreenshot(
        scenarioId,
        `error_${stepId}`,
        {
          fullPage: false,
          description: `Failed at step: ${stepText}`,
          tags: ['error', 'failure']
        }
      );
      
      if (errorScreenshot) {
        screenshots.push(errorScreenshot);
        
        const contextScreenshot = await this.captureScreenshot(
          scenarioId,
          `error_context_${stepId}`,
          {
            fullPage: true,
            description: `Full page context for failed step: ${stepText}`,
            tags: ['error', 'context']
          }
        );
        
        if (contextScreenshot) {
          screenshots.push(contextScreenshot);
        }
      }
    }
    
    return screenshots;
  }

  async compareScreenshots(
    baseline: Buffer,
    current: Buffer,
    threshold: number = 0.1
  ): Promise<{
    match: boolean;
    difference: number;
    diffImage?: Buffer;
  }> {
    if (!this.comparisonEnabled) {
      return { match: true, difference: 0 };
    }
    
    try {
      const Jimp = require('jimp');
      
      const [baselineImg, currentImg] = await Promise.all([
        Jimp.read(baseline),
        Jimp.read(current)
      ]);
      
      if (
        baselineImg.bitmap.width !== currentImg.bitmap.width ||
        baselineImg.bitmap.height !== currentImg.bitmap.height
      ) {
        return {
          match: false,
          difference: 1
        };
      }
      
      const diffImg = new Jimp(baselineImg.bitmap.width, baselineImg.bitmap.height);
      
      let diffPixelCount = 0;
      const totalPixels = baselineImg.bitmap.width * baselineImg.bitmap.height;
      
      for (let y = 0; y < baselineImg.bitmap.height; y++) {
        for (let x = 0; x < baselineImg.bitmap.width; x++) {
          const baselinePixel = Jimp.intToRGBA(baselineImg.getPixelColor(x, y));
          const currentPixel = Jimp.intToRGBA(currentImg.getPixelColor(x, y));
          
          const rDiff = Math.abs(baselinePixel.r - currentPixel.r);
          const gDiff = Math.abs(baselinePixel.g - currentPixel.g);
          const bDiff = Math.abs(baselinePixel.b - currentPixel.b);
          
          if (rDiff > 10 || gDiff > 10 || bDiff > 10) {
            diffPixelCount++;
            diffImg.setPixelColor(Jimp.rgbaToInt(255, 0, 0, 255), x, y);
          } else {
            diffImg.setPixelColor(currentImg.getPixelColor(x, y), x, y);
          }
        }
      }
      
      const difference = diffPixelCount / totalPixels;
      
      const diffBuffer = await diffImg.getBufferAsync(Jimp.MIME_PNG);
      
      return {
        match: difference <= threshold,
        difference,
        diffImage: diffBuffer
      };
      
    } catch (error) {
      this.logger.error('Screenshot comparison failed', error as Error);
      
      const sizeDiff = Math.abs(baseline.length - current.length) / baseline.length;
      return { 
        match: sizeDiff < 0.1, 
        difference: sizeDiff 
      };
    }
  }

  private async createScreenshotEvidence(
    scenarioId: string,
    name: string,
    data: Buffer,
    options: ScreenshotOptions,
    captureTime: number
  ): Promise<ScreenshotEvidence> {
    const thumbnail = await this.generateThumbnail(data);
    
    const metadata = await this.extractMetadata(data);
    
    const evidence: ScreenshotEvidence = {
      id: `screenshot_${this.executionId}_${this.screenshotCount}`,
      type: EvidenceType.SCREENSHOT,
      timestamp: new Date(),
      scenarioId,
      name,
      description: options.description || `Screenshot: ${name}`,
      data,
      size: data.length,
      metadata: {
        scenarioId,
        ...metadata,
        captureTime,
        fullPage: options.fullPage ?? false,
        quality: options.quality ?? this.imageQuality,
        masked: this.maskSensitiveData && !!options.maskSelectors
      } as ScreenshotMetadata,
      thumbnail: thumbnail ? thumbnail.toString('base64') : null,
      tags: options.tags || [],
      format: options.format || 'png',
      dimensions: metadata['dimensions']
    };
    
    return evidence;
  }

  private async generateThumbnail(imageBuffer: Buffer): Promise<Buffer | null> {
    try {
      const Jimp = require('jimp');
      
      const image = await Jimp.read(imageBuffer);
      
      const aspectRatio = image.bitmap.width / image.bitmap.height;
      let width = this.thumbnailSize.width;
      let height = this.thumbnailSize.height;
      
      if (aspectRatio > width / height) {
        height = width / aspectRatio;
      } else {
        width = height * aspectRatio;
      }
      
      const thumbnail = await image
        .resize(width, height)
        .quality(70)
        .getBufferAsync(Jimp.MIME_PNG);
      
      return thumbnail;
      
    } catch (error) {
      this.logger.debug('Failed to generate thumbnail', error as Record<string, any>);
      return null;
    }
  }

  private async extractMetadata(imageBuffer: Buffer): Promise<Partial<ScreenshotMetadata>> {
    try {
      const Jimp = require('jimp');
      const image = await Jimp.read(imageBuffer);
      
      return {
        dimensions: {
          width: image.bitmap.width,
          height: image.bitmap.height
        },
        format: image.getMIME(),
        size: imageBuffer.length,
        hasAlpha: image.hasAlpha(),
        isAnimated: false,
        colorDepth: image.bitmap.bpp || 24
      };
      
    } catch (error) {
      this.logger.debug('Failed to extract metadata', error as Error);
      return {
        dimensions: { width: 0, height: 0 },
        format: 'unknown',
        size: imageBuffer.length
      };
    }
  }

  private async maskElements(page: Page, selectors: string[]): Promise<void> {
    try {
      await page.evaluate((sels) => {
        sels.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const el = element as HTMLElement;
            el.style.filter = 'blur(10px)';
            el.style.userSelect = 'none';
          });
        });
      }, selectors);
      
      await page.waitForTimeout(100);
      
    } catch (error) {
      this.logger.debug('Failed to mask elements', error as Record<string, any>);
    }
  }

  async captureElementScreenshot(
    scenarioId: string,
    selector: string,
    name: string,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotEvidence | null> {
    try {
      const page = this.pageReferences.get(scenarioId);
      if (!page) {
        return null;
      }
      
      const element = await page.$(selector);
      if (!element) {
        this.logger.warn(`Element not found: ${selector}`);
        return null;
      }
      
      const screenshotBuffer = await element.screenshot({
        quality: options.quality ?? this.imageQuality,
        type: 'png'
      });
      
      return await this.createScreenshotEvidence(
        scenarioId,
        name,
        screenshotBuffer,
        { ...options, description: `Element screenshot: ${selector}` },
        0
      );
      
    } catch (error) {
      this.logger.error(`Failed to capture element screenshot`, error as Error);
      return null;
    }
  }

  async batchCapture(
    scenarioId: string,
    captures: Array<{ name: string; options?: ScreenshotOptions }>
  ): Promise<ScreenshotEvidence[]> {
    const results: ScreenshotEvidence[] = [];
    
    for (const capture of captures) {
      const screenshot = await this.captureScreenshot(
        scenarioId,
        capture.name,
        capture.options
      );
      
      if (screenshot) {
        results.push(screenshot);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  getStatistics(): {
    totalCaptured: number;
    totalSize: number;
    averageSize: number;
    byScenario: Record<string, number>;
  } {
    let totalSize = 0;
    const byScenario: Record<string, number> = {};
    
    this.screenshots.forEach((screenshots, scenarioId) => {
      byScenario[scenarioId] = screenshots.length;
      screenshots.forEach(screenshot => {
        totalSize += screenshot.size;
      });
    });
    
    return {
      totalCaptured: this.screenshotCount,
      totalSize,
      averageSize: this.screenshotCount > 0 ? totalSize / this.screenshotCount : 0,
      byScenario
    };
  }

  clearScenarioScreenshots(scenarioId: string): void {
    this.screenshots.delete(scenarioId);
    this.pageReferences.delete(scenarioId);
  }

  async finalize(executionId: string): Promise<void> {
    this.screenshots.clear();
    this.pageReferences.clear();
    
    const stats = this.getStatistics();
    ActionLogger.logInfo('Screenshot collector finalized', {
      collectorType: 'screenshot',
      executionId,
      stats
    });
  }
}
