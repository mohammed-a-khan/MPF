// src/reporting/collectors/EvidenceCollector.ts

import { Logger } from '../../core/utils/Logger';
import { ScreenshotCollector } from './ScreenshotCollector';
import { VideoCollector } from './VideoCollector';
import { LogCollector } from './LogCollector';
import { MetricsCollector } from './MetricsCollector';
import { PerformanceCollector } from './PerformanceCollector';
import { NetworkCollector } from './NetworkCollector';
import { TraceCollector } from './TraceCollector';
// import { FileUtils } from '../../core/utils/FileUtils'; - Not used
// import { DateUtils } from '../../core/utils/DateUtils'; - Not used
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import {
  EvidenceCollection as EvidenceCollectionType,
  Screenshot,
  Video,
  Trace,
  NetworkLog,
  ConsoleLog,
  PerformanceLog,
  ScreenshotType,
  ConsoleLogLevel
} from '../types/reporting.types';

// Define missing types
type CollectorType = 'screenshot' | 'video' | 'log' | 'metrics' | 'performance' | 'network' | 'trace';

interface EvidenceItem {
  id: string;
  type: CollectorType;
  timestamp: Date;
  scenarioId: string;
  stepId?: string;
  name: string;
  description: string;
  path: string | null;
  size: number;
  metadata: Record<string, any>;
  thumbnail: string | null;
  tags: string[];
}

interface EvidenceCollection extends EvidenceCollectionType {
  executionId: string;
  startTime: Date;
  endTime: Date | null;
  items: EvidenceItem[];
  metadata: {
    environment: string;
    browser: string;
    viewport: { width: number; height: number };
    tags: string[];
    parallel: boolean;
  };
  summary: {
    totalItems: number;
    byType: Record<CollectorType, number>;
    totalSize: number;
    duration: number;
  };
}

interface CollectionOptions {
  browser?: string;
  viewport?: { width: number; height: number };
  tags?: string[];
  parallel?: boolean;
}

interface EvidenceFilter {
  types?: CollectorType[];
  scenarioIds?: string[];
  tags?: string[];
  startTime?: Date;
  endTime?: Date;
}

interface EvidenceStorage {
  executionId: string;
  collections: EvidenceCollection[];
  totalSize: number;
  itemCount: number;
  startTime: Date;
  endTime: Date;
  metadata: {
    environment: string;
    retentionDays: number;
    compressionEnabled: boolean;
    maxSize: number;
  };
}
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
// import { pipeline } from 'stream/promises'; // Not used in current implementation

/**
 * Central evidence collection orchestrator
 * Coordinates all collectors and manages evidence lifecycle
 */
export class EvidenceCollector {
  private static instance: EvidenceCollector;
  private readonly logger = Logger.getInstance(EvidenceCollector.name);
  
  private readonly collectors: Map<string, any> = new Map();
  private readonly evidenceStorage: Map<string, EvidenceCollection> = new Map();
  private readonly evidencePath: string;
  private readonly maxEvidenceSize: number;
  private readonly compressionEnabled: boolean;
  private collectionInProgress: boolean = false;
  
  /**
   * Check if evidence collection is in progress
   */
  isCollectionInProgress(): boolean {
    return this.collectionInProgress;
  }
  
  private readonly screenshotCollector: ScreenshotCollector;
  private readonly videoCollector: VideoCollector;
  private readonly logCollector: LogCollector;
  private readonly metricsCollector: MetricsCollector;
  private readonly performanceCollector: PerformanceCollector;
  private readonly networkCollector: NetworkCollector;
  private readonly traceCollector: TraceCollector;

  private constructor() {
    this.evidencePath = ConfigurationManager.get('EVIDENCE_PATH', './evidence');
    this.maxEvidenceSize = ConfigurationManager.getInt('MAX_EVIDENCE_SIZE_MB', 100) * 1024 * 1024;
    this.compressionEnabled = ConfigurationManager.getBoolean('COMPRESS_EVIDENCE', true);
    
    // Initialize all collectors
    this.screenshotCollector = ScreenshotCollector.getInstance();
    this.videoCollector = VideoCollector.getInstance();
    this.logCollector = LogCollector.getInstance();
    this.metricsCollector = MetricsCollector.getInstance();
    this.performanceCollector = PerformanceCollector.getInstance();
    this.networkCollector = NetworkCollector.getInstance();
    this.traceCollector = TraceCollector.getInstance();
    
    // Register collectors
    this.collectors.set('screenshot', this.screenshotCollector);
    this.collectors.set('video', this.videoCollector);
    this.collectors.set('log', this.logCollector);
    this.collectors.set('metrics', this.metricsCollector);
    this.collectors.set('performance', this.performanceCollector);
    this.collectors.set('network', this.networkCollector);
    this.collectors.set('trace', this.traceCollector);
    
    this.initializeStorage();
  }

  static getInstance(): EvidenceCollector {
    if (!EvidenceCollector.instance) {
      EvidenceCollector.instance = new EvidenceCollector();
    }
    return EvidenceCollector.instance;
  }

  private initializeStorage(): void {
    try {
      // Create evidence directory structure
      const dirs = [
        this.evidencePath,
        path.join(this.evidencePath, 'screenshots'),
        path.join(this.evidencePath, 'videos'),
        path.join(this.evidencePath, 'logs'),
        path.join(this.evidencePath, 'traces'),
        path.join(this.evidencePath, 'temp'),
        path.join(this.evidencePath, 'archives')
      ];
      
      dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
      
      // Clean old evidence based on retention policy
      this.cleanOldEvidence();
      
    } catch (error) {
      this.logger.error('Failed to initialize evidence storage', error as Error);
      throw new Error(`Evidence storage initialization failed: ${(error as Error).message}`);
    }
  }

  /**
   * Start evidence collection for a test execution
   */
  async startCollection(executionId: string, options: CollectionOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting evidence collection for execution: ${executionId}`);
      this.collectionInProgress = true;
      
      // Create execution-specific collection
      const collection: EvidenceCollection = {
        executionId,
        startTime: new Date(),
        endTime: null,
        items: [],
        metadata: {
          environment: ConfigurationManager.getEnvironmentName(),
          browser: options.browser || 'chromium',
          viewport: options.viewport || { width: 1920, height: 1080 },
          tags: options.tags || [],
          parallel: options.parallel || false
        },
        summary: {
          totalItems: 0,
          byType: {
          screenshot: 0,
          video: 0,
          log: 0,
          metrics: 0,
          performance: 0,
          network: 0,
          trace: 0
        },
          totalSize: 0,
          duration: 0
        },
        // Initialize required collections
        screenshots: [],
        videos: [],
        traces: [],
        networkLogs: [],
        consoleLogs: [],
        performanceLogs: [],
        downloads: [],
        uploads: []
      };
      
      this.evidenceStorage.set(executionId, collection);
      
      // Initialize all collectors for this execution
      const initPromises = Array.from(this.collectors.values()).map(collector =>
        collector.initialize(executionId, options)
      );
      
      await Promise.all(initPromises);
      
      this.logger.info(`Evidence collection initialized for ${executionId} in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      this.logger.error(`Failed to start evidence collection for ${executionId}`, error as Error);
      this.collectionInProgress = false;
      throw error;
    }
  }

  /**
   * Collect evidence for a specific scenario
   */
  async collectForScenario(
    executionId: string,
    scenarioId: string,
    scenarioName: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const collection = this.evidenceStorage.get(executionId);
      if (!collection) {
        throw new Error(`No collection found for execution ${executionId}`);
      }
      
      // Collect from each collector
      const collectionPromises = Array.from(this.collectors.entries()).map(
        async ([type, collector]) => {
          try {
            const items = await collector.collectForScenario(scenarioId, scenarioName);
            return { type, items };
          } catch (error) {
            this.logger.warn(`${type} collector failed for scenario ${scenarioId}`, error as Error);
            return { type, items: [] };
          }
        }
      );
      
      const results = await Promise.all(collectionPromises);
      
      // Process and store collected items
      for (const { type, items } of results) {
        for (const item of items) {
          if (!this.isValidCollectorType(type)) {
            this.logger.warn(`Invalid collector type: ${type}`);
            continue;
          }
          
          const evidenceItem = await this.processEvidenceItem(item, type as CollectorType, scenarioId);
          collection.items.push(evidenceItem);
          
          // Update summary
          collection.summary.totalItems++;
          collection.summary.byType[type as CollectorType] = (collection.summary.byType[type as CollectorType] || 0) + 1;
          collection.summary.totalSize += evidenceItem.size;
          
          // Add to specific type collection
          this.addToSpecificCollection(collection, type as CollectorType, evidenceItem, item);
        }
      }
      
      // Check storage limits
      await this.enforceStorageLimits(executionId);
      
      this.logger.info(`Evidence collection for scenario ${scenarioId} completed in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      this.logger.error(`Failed to collect evidence for scenario ${scenarioId}`, error as Error);
      throw error;
    }
  }

  /**
   * Collect evidence for a specific step
   */
  async collectForStep(
    executionId: string,
    scenarioId: string,
    stepId: string,
    stepText: string,
    status: 'passed' | 'failed' | 'skipped'
  ): Promise<void> {
    try {
      const collection = this.evidenceStorage.get(executionId);
      if (!collection) {
        return; // Silent fail for step collection
      }
      
      // Prioritize collectors based on step status
      const priorityCollectors = status === 'failed' 
        ? ['screenshot', 'log', 'network', 'performance']
        : ['metrics'];
      
      for (const collectorType of priorityCollectors) {
        const collector = this.collectors.get(collectorType as CollectorType);
        if (collector && collector.collectForStep) {
          try {
            const items = await collector.collectForStep(
              scenarioId,
              stepId,
              stepText,
              status
            );
            
            for (const item of items) {
              if (!this.isValidCollectorType(collectorType)) {
                this.logger.warn(`Invalid collector type: ${collectorType}`);
                continue;
              }
              
              const evidenceItem = await this.processEvidenceItem(
                item,
                collectorType as CollectorType,
                scenarioId,
                stepId
              );
              collection.items.push(evidenceItem);
              collection.summary.totalItems++;
              collection.summary.totalSize += evidenceItem.size;
              
              // Add to specific type collection
              this.addToSpecificCollection(collection, collectorType as CollectorType, evidenceItem, item);
            }
          } catch (error) {
            this.logger.debug(`${collectorType} step collection failed`, error as Error);
          }
        }
      }
      
    } catch (error) {
      this.logger.debug('Step evidence collection error', error as Error);
    }
  }

  /**
   * Process and store an evidence item
   */
  private async processEvidenceItem(
    item: any,
    type: CollectorType,
    scenarioId: string,
    stepId?: string
  ): Promise<EvidenceItem> {
    const timestamp = new Date();
    const itemId = this.generateEvidenceId(type, scenarioId, stepId);
    
    // Determine storage path
    const filename = `${itemId}_${timestamp.getTime()}${this.getFileExtension(type, item)}`;
    const relativePath = path.join(this.getTypeDirectory(type), filename);
    const absolutePath = path.join(this.evidencePath, relativePath);
    
    // Store the evidence
    let size = 0;
    let stored = false;
    
    try {
      if (item.data) {
        // Binary data (screenshots, videos)
        const buffer = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data);
        
        if (this.compressionEnabled && this.shouldCompress(type)) {
          const compressed = await this.compressData(buffer);
          await fs.promises.writeFile(absolutePath + '.gz', compressed);
          size = compressed.length;
        } else {
          await fs.promises.writeFile(absolutePath, buffer);
          size = buffer.length;
        }
        stored = true;
      } else if (item.content) {
        // Text content (logs, metrics)
        const content = typeof item.content === 'string' 
          ? item.content 
          : JSON.stringify(item.content, null, 2);
        
        await fs.promises.writeFile(absolutePath, content);
        size = Buffer.byteLength(content);
        stored = true;
      }
    } catch (error) {
      this.logger.error(`Failed to store evidence item ${itemId}`, error as Error);
    }
    
    const evidenceItem: EvidenceItem = {
      id: itemId,
      type,
      timestamp,
      scenarioId,
      ...(stepId && { stepId }),  // Only include stepId if it's defined
      name: item.name || `${type}_${timestamp.getTime()}`,
      description: item.description || `${type} evidence`,
      path: stored ? relativePath : null,
      size,
      metadata: {
        ...(item.metadata || {}),
        compressed: this.compressionEnabled && this.shouldCompress(type),
        format: this.getFormat(type, item)
      },
      thumbnail: item.thumbnail || null,
      tags: item.tags || []
    };
    
    return evidenceItem;
  }

  /**
   * Complete evidence collection for an execution
   */
  async completeCollection(executionId: string): Promise<EvidenceCollection> {
    const startTime = Date.now();
    
    try {
      const collection = this.evidenceStorage.get(executionId);
      if (!collection) {
        throw new Error(`No collection found for execution ${executionId}`);
      }
      
      // Finalize all collectors
      const finalizePromises = Array.from(this.collectors.values()).map(collector =>
        collector.finalize ? collector.finalize(executionId) : Promise.resolve()
      );
      
      await Promise.all(finalizePromises);
      
      // Update collection summary
      collection.endTime = new Date();
      collection.summary.duration = collection.endTime.getTime() - collection.startTime.getTime();
      
      // Generate collection manifest
      await this.generateManifest(executionId, collection);
      
      // Archive if configured
      if (ConfigurationManager.getBoolean('ARCHIVE_EVIDENCE', false)) {
        await this.archiveCollection(executionId, collection);
      }
      
      this.collectionInProgress = false;
      
      this.logger.info(`Evidence collection completed for ${executionId} in ${Date.now() - startTime}ms`, collection.summary);
      
      return collection;
      
    } catch (error) {
      this.logger.error(`Failed to complete evidence collection for ${executionId}`, error as Error);
      this.collectionInProgress = false;
      throw error;
    }
  }

  /**
   * Archive evidence collection using tar.gz
   */
  private async archiveCollection(
    executionId: string,
    collection: EvidenceCollection
  ): Promise<void> {
    try {
      const archivePath = path.join(
        this.evidencePath,
        'archives',
        `${executionId}_${Date.now()}.tar.gz`
      );
      
      // Create archives directory
      const archiveDir = path.dirname(archivePath);
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
      
      // Collect all evidence files
      const filesToArchive: string[] = [];
      
      // Add manifest
      const manifestPath = path.join(this.evidencePath, `manifest_${executionId}.json`);
      if (fs.existsSync(manifestPath)) {
        filesToArchive.push(`manifest_${executionId}.json`);
      }
      
      // Add all evidence files
      for (const item of collection.items) {
        if (item.path) {
          const filePath = item.path;
          const absolutePath = path.join(this.evidencePath, filePath);
          
          if (fs.existsSync(absolutePath)) {
            filesToArchive.push(filePath);
          } else if (fs.existsSync(absolutePath + '.gz')) {
            filesToArchive.push(filePath + '.gz');
          }
        }
      }
      
      // Create tar.gz archive using Node.js built-in zlib
      // For now, we'll create a simple JSON manifest with file references
      // In production, you would use a proper archiving library like 'archiver' or 'tar'
      const archiveManifest = {
        executionId,
        createdAt: new Date(),
        files: filesToArchive,
        collection: {
          ...collection,
          items: collection.items.map(item => ({
            ...item,
            // Don't include actual file content in manifest
            path: item.path
          }))
        }
      };
      
      // Write compressed manifest
      const manifestBuffer = Buffer.from(JSON.stringify(archiveManifest, null, 2));
      const compressedManifest = await this.compressData(manifestBuffer);
      await fs.promises.writeFile(archivePath, compressedManifest);
      
      // Verify archive was created
      const archiveStats = await fs.promises.stat(archivePath);
      
      this.logger.info(
        `Archived evidence collection to ${archivePath} (${(archiveStats.size / 1024 / 1024).toFixed(2)} MB)`
      );
      
      this.logger.info(`Evidence collection archived for ${executionId}`, {
        path: archivePath,
        size: archiveStats.size,
        fileCount: filesToArchive.length
      });
      
      // Optionally delete original files after archiving
      if (ConfigurationManager.getBoolean('DELETE_AFTER_ARCHIVE', false)) {
        for (const file of filesToArchive) {
          try {
            await fs.promises.unlink(path.join(this.evidencePath, file));
          } catch (error) {
            this.logger.debug(`Failed to delete archived file ${file}`, error as Error);
          }
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to archive evidence collection', error as Error);
      throw new Error(`Archive creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Extract archived evidence collection
   */
  async extractArchive(archivePath: string, targetDir: string): Promise<void> {
    try {
      // Create target directory
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Extract archive (reading compressed manifest)
      const compressedData = await fs.promises.readFile(archivePath);
      const decompressedData = await this.decompressData(compressedData);
      const manifest = JSON.parse(decompressedData.toString());
      
      // Write manifest to target directory
      await fs.promises.writeFile(
        path.join(targetDir, `manifest_${manifest.executionId}.json`),
        JSON.stringify(manifest, null, 2)
      );
      
      this.logger.info(`Extracted archive from ${archivePath} to ${targetDir}`);
      
    } catch (error) {
      this.logger.error('Failed to extract archive', error as Error);
      throw new Error(`Archive extraction failed: ${(error as Error).message}`);
    }
  }

  /**
   * Compress data using gzip
   */
  private async compressData(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gzip(data, { level: zlib.constants.Z_BEST_COMPRESSION }, (error, compressed) => {
        if (error) {
          reject(error);
        } else {
          resolve(compressed);
        }
      });
    });
  }

  /**
   * Decompress gzipped data
   */
  private async decompressData(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (error, decompressed) => {
        if (error) {
          reject(error);
        } else {
          resolve(decompressed);
        }
      });
    });
  }

  /**
   * Stream-based compression for large files
   */
  /**
   * Type guard to check if a string is a valid CollectorType
   */
  private isValidCollectorType(type: string): type is CollectorType {
    const validTypes: CollectorType[] = ['screenshot', 'video', 'log', 'metrics', 'performance', 'network', 'trace'];
    return validTypes.includes(type as CollectorType);
  }
  
  /**
   * Add evidence item to specific type collection
   */
  private addToSpecificCollection(
    collection: EvidenceCollection,
    type: CollectorType,
    evidenceItem: EvidenceItem,
    originalItem: any
  ): void {
    switch (type) {
      case 'screenshot': {
        const screenshot: Screenshot = {
          id: evidenceItem.id,
          filename: evidenceItem.name,
          path: evidenceItem.path || '',
          base64: originalItem.base64,
          scenarioId: evidenceItem.scenarioId,
          ...(evidenceItem.stepId && { stepId: evidenceItem.stepId }),
          type: originalItem.screenshotType || ScreenshotType.STEP,
          timestamp: evidenceItem.timestamp,
          description: evidenceItem.description,
          size: evidenceItem.size,
          dimensions: originalItem.dimensions || { width: 0, height: 0 },
          annotations: originalItem.annotations
        };
        collection.screenshots.push(screenshot);
        break;
      }
      case 'video': {
        const video: Video = {
          id: evidenceItem.id,
          filename: evidenceItem.name,
          path: evidenceItem.path || '',
          scenarioId: evidenceItem.scenarioId,
          size: evidenceItem.size,
          duration: originalItem.duration || 0,
          format: originalItem.format || 'webm',
          resolution: originalItem.resolution || 'unknown',
          fps: originalItem.fps || 30,
          timestamp: evidenceItem.timestamp
        };
        collection.videos.push(video);
        break;
      }
      case 'trace': {
        const trace: Trace = {
          id: evidenceItem.id,
          filename: evidenceItem.name,
          path: evidenceItem.path || '',
          scenarioId: evidenceItem.scenarioId,
          size: evidenceItem.size,
          duration: originalItem.duration || 0,
          timestamp: evidenceItem.timestamp,
          viewerUrl: originalItem.viewerUrl
        };
        collection.traces.push(trace);
        break;
      }
      case 'network': {
        const networkLog: NetworkLog = {
          id: evidenceItem.id,
          timestamp: evidenceItem.timestamp,
          method: originalItem.method || 'GET',
          url: originalItem.url || '',
          status: originalItem.status || 0,
          duration: originalItem.duration || 0,
          requestSize: originalItem.requestSize || 0,
          responseSize: originalItem.responseSize || 0,
          headers: originalItem.headers || {},
          timing: originalItem.timing || {
            dns: 0,
            connect: 0,
            ssl: 0,
            send: 0,
            wait: 0,
            receive: 0,
            total: 0
          }
        };
        collection.networkLogs.push(networkLog);
        break;
      }
      case 'log': {
        const consoleLog: ConsoleLog = {
          timestamp: evidenceItem.timestamp,
          level: originalItem.level || ConsoleLogLevel.INFO,
          message: originalItem.message || evidenceItem.description,
          source: originalItem.source || 'test',
          location: originalItem.location,
          stackTrace: originalItem.stackTrace
        };
        collection.consoleLogs.push(consoleLog);
        break;
      }
      case 'performance': {
        const performanceLog: PerformanceLog = {
          timestamp: evidenceItem.timestamp,
          metric: originalItem.metric || 'unknown',
          value: originalItem.value || 0,
          unit: originalItem.unit || 'ms',
          context: originalItem.context || evidenceItem.scenarioId
        };
        collection.performanceLogs.push(performanceLog);
        break;
      }
      case 'metrics':
        // Metrics are typically stored as performance logs
        const metricsLog: PerformanceLog = {
          timestamp: evidenceItem.timestamp,
          metric: originalItem.metric || 'custom',
          value: originalItem.value || 0,
          unit: originalItem.unit || 'count',
          context: originalItem.context || evidenceItem.scenarioId
        };
        collection.performanceLogs.push(metricsLog);
        break;
    }
  }
  
  /**
   * Generate evidence ID
   */
  private generateEvidenceId(
    type: string,
    scenarioId: string,
    stepId?: string
  ): string {
    const parts = [type, scenarioId];
    if (stepId) {
      parts.push(stepId);
    }
    
    const hash = crypto
      .createHash('md5')
      .update(parts.join('_'))
      .digest('hex')
      .substring(0, 8);
    
    return `${type}_${hash}`;
  }

  /**
   * Get file extension for evidence type
   */
  private getFileExtension(type: string, item: any): string {
    const extensions: Record<CollectorType, string> = {
      screenshot: '.png',
      video: '.webm',
      log: '.log',
      metrics: '.json',
      performance: '.json',
      network: '.har',
      trace: '.zip'
    };
    
    // Check if type is valid CollectorType before accessing
    if (this.isValidCollectorType(type)) {
      return item.extension || extensions[type] || '.dat';
    }
    return item.extension || '.dat';
  }

  /**
   * Get directory for evidence type
   */
  private getTypeDirectory(type: string): string {
    const directories: Record<CollectorType, string> = {
      screenshot: 'screenshots',
      video: 'videos',
      log: 'logs',
      metrics: 'logs',
      performance: 'logs',
      network: 'logs',
      trace: 'traces'
    };
    
    // Check if type is valid CollectorType before accessing
    if (this.isValidCollectorType(type)) {
      return directories[type] || 'misc';
    }
    return 'misc';
  }

  /**
   * Check if type should be compressed
   */
  private shouldCompress(type: CollectorType): boolean {
    const compressible: CollectorType[] = ['log', 'metrics', 'performance', 'network'];
    return compressible.includes(type);
  }

  /**
   * Get format for evidence type
   */
  private getFormat(type: string, item: any): string {
    if (item.format) {
      return item.format;
    }
    
    const formats: Record<CollectorType, string> = {
      screenshot: 'png',
      video: 'webm',
      log: 'text',
      metrics: 'json',
      performance: 'json',
      network: 'har',
      trace: 'zip'
    };
    
    // Check if type is valid CollectorType before accessing
    if (this.isValidCollectorType(type)) {
      return formats[type] || 'unknown';
    }
    return 'unknown';
  }

  /**
   * Generate collection manifest
   */
  private async generateManifest(
    executionId: string,
    collection: EvidenceCollection
  ): Promise<void> {
    const manifestPath = path.join(
      this.evidencePath,
      `manifest_${executionId}.json`
    );
    
    const manifest = {
      ...collection,
      version: '1.0',
      generated: new Date(),
      checksums: {} as Record<string, string>
    };
    
    // Calculate checksums for integrity
    for (const item of collection.items) {
      if (item.path) {
        try {
          const absolutePath = path.join(this.evidencePath, item.path);
          let filePath = absolutePath;
          
          // Check if compressed version exists
          if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.gz')) {
            filePath = filePath + '.gz';
          }
          
          if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath);
            manifest.checksums[item.id] = crypto
              .createHash('sha256')
              .update(content)
              .digest('hex');
          }
        } catch (error) {
          this.logger.debug(`Failed to calculate checksum for ${item.id}`, error as Error);
        }
      }
    }
    
    await fs.promises.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2)
    );
  }

  /**
   * Get evidence collection for reporting
   */
  async getCollection(
    executionId: string,
    filter?: EvidenceFilter
  ): Promise<EvidenceCollection> {
    const collection = this.evidenceStorage.get(executionId);
    if (!collection) {
      // Try to load from disk
      const manifestPath = path.join(
        this.evidencePath,
        `manifest_${executionId}.json`
      );
      
      if (fs.existsSync(manifestPath)) {
        const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
        return this.applyFilter(manifest, filter);
      }
      
      throw new Error(`No evidence collection found for ${executionId}`);
    }
    
    return this.applyFilter(collection, filter);
  }

  /**
   * Get evidence item content
   */
  async getEvidenceContent(
    executionId: string,
    itemId: string
  ): Promise<Buffer | string> {
    const collection = await this.getCollection(executionId);
    const item = collection.items.find(i => i.id === itemId);
    
    if (!item || !item.path) {
      throw new Error(`Evidence item ${itemId} not found`);
    }
    
    const absolutePath = path.join(this.evidencePath, item.path);
    
    if (item.metadata && item.metadata['compressed']) {
      const compressed = await fs.promises.readFile(absolutePath + '.gz');
      return await this.decompressData(compressed);
    }
    
    return await fs.promises.readFile(absolutePath);
  }

  /**
   * Apply filter to evidence collection
   */
  private applyFilter(
    collection: EvidenceCollection,
    filter?: EvidenceFilter
  ): EvidenceCollection {
    if (!filter) {
      return collection;
    }
    
    let filteredItems = [...collection.items];
    
    if (filter.types && filter.types.length > 0) {
      filteredItems = filteredItems.filter(item =>
        filter.types!.includes(item.type)
      );
    }
    
    if (filter.scenarioIds && filter.scenarioIds.length > 0) {
      filteredItems = filteredItems.filter(item =>
        filter.scenarioIds!.includes(item.scenarioId)
      );
    }
    
    if (filter.tags && filter.tags.length > 0) {
      filteredItems = filteredItems.filter(item =>
        item.tags.some(tag => filter.tags!.includes(tag))
      );
    }
    
    if (filter.startTime) {
      filteredItems = filteredItems.filter(item =>
        item.timestamp >= filter.startTime!
      );
    }
    
    if (filter.endTime) {
      filteredItems = filteredItems.filter(item =>
        item.timestamp <= filter.endTime!
      );
    }
    
    // Recalculate summary
    const summary = {
      totalItems: filteredItems.length,
      byType: {
        screenshot: 0,
        video: 0,
        log: 0,
        metrics: 0,
        performance: 0,
        network: 0,
        trace: 0
      },
      totalSize: 0,
      duration: collection.summary.duration
    };
    
    filteredItems.forEach(item => {
      summary.byType[item.type] = (summary.byType[item.type] || 0) + 1;
      summary.totalSize += item.size;
    });
    
    return {
      ...collection,
      items: filteredItems,
      summary
    };
  }

  /**
   * Enforce storage limits
   */
  private async enforceStorageLimits(executionId: string): Promise<void> {
    const collection = this.evidenceStorage.get(executionId);
    if (!collection) {
      return;
    }
    
    // Check total size
    if (collection.summary.totalSize > this.maxEvidenceSize) {
      this.logger.warn(
        `Evidence collection ${executionId} exceeds size limit: ${collection.summary.totalSize} > ${this.maxEvidenceSize}`
      );
      
      // Remove oldest items until under limit
      const sortedItems = [...collection.items].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );
      
      while (
        collection.summary.totalSize > this.maxEvidenceSize &&
        sortedItems.length > 0
      ) {
        const item = sortedItems.shift()!;
        
        // Remove from storage
        if (item.path) {
          try {
            const absolutePath = path.join(this.evidencePath, item.path);
            if (fs.existsSync(absolutePath)) {
              await fs.promises.unlink(absolutePath);
            } else if (fs.existsSync(absolutePath + '.gz')) {
              await fs.promises.unlink(absolutePath + '.gz');
            }
          } catch (error) {
            this.logger.debug(`Failed to delete evidence item ${item.id}`, error as Error);
          }
        }
        
        // Remove from collection
        const index = collection.items.findIndex(i => i.id === item.id);
        if (index >= 0) {
          collection.items.splice(index, 1);
          collection.summary.totalItems--;
          collection.summary.totalSize -= item.size;
          collection.summary.byType[item.type] = Math.max(0, collection.summary.byType[item.type] - 1);
        }
      }
    }
  }

  /**
   * Clean old evidence based on retention policy
   */
  private async cleanOldEvidence(): Promise<void> {
    try {
      const retentionDays = ConfigurationManager.getInt('EVIDENCE_RETENTION_DAYS', 7);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      // Find and remove old manifest files
      const files = await fs.promises.readdir(this.evidencePath);
      const manifestFiles = files.filter(f => f.startsWith('manifest_') && f.endsWith('.json'));
      
      for (const manifestFile of manifestFiles) {
        const manifestPath = path.join(this.evidencePath, manifestFile);
        const stats = await fs.promises.stat(manifestPath);
        
        if (stats.mtime < cutoffDate) {
          // Load manifest to get evidence items
          try {
            const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);
            
            // Delete all evidence files
            for (const item of manifest.items || []) {
              if (item.path) {
                const itemPath = path.join(this.evidencePath, item.path);
                try {
                  if (fs.existsSync(itemPath)) {
                    await fs.promises.unlink(itemPath);
                  } else if (fs.existsSync(itemPath + '.gz')) {
                    await fs.promises.unlink(itemPath + '.gz');
                  }
                } catch (error) {
                  // Continue cleanup even if individual file fails
                }
              }
            }
            
            // Delete manifest
            await fs.promises.unlink(manifestPath);
            
            this.logger.info(`Cleaned old evidence collection from ${manifestFile}`);
          } catch (error) {
            this.logger.debug(`Failed to clean old evidence ${manifestFile}`, error as Error);
          }
        }
      }
      
      // Clean old archives
      const archiveDir = path.join(this.evidencePath, 'archives');
      if (fs.existsSync(archiveDir)) {
        const archives = await fs.promises.readdir(archiveDir);
        
        for (const archive of archives) {
          const archivePath = path.join(archiveDir, archive);
          const stats = await fs.promises.stat(archivePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.promises.unlink(archivePath);
            this.logger.info(`Deleted old archive ${archive}`);
          }
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to clean old evidence', error as Error);
    }
  }

  /**
   * Export evidence summary for reporting
   */
  async exportSummary(executionId: string): Promise<EvidenceStorage> {
    const collection = await this.getCollection(executionId);
    
    const summary: EvidenceStorage = {
      executionId,
      collections: [collection],
      totalSize: collection.summary.totalSize,
      itemCount: collection.summary.totalItems,
      startTime: collection.startTime,
      endTime: collection.endTime || new Date(),
      metadata: {
        environment: collection.metadata.environment,
        retentionDays: ConfigurationManager.getInt('EVIDENCE_RETENTION_DAYS', 7),
        compressionEnabled: this.compressionEnabled,
        maxSize: this.maxEvidenceSize
      }
    };
    
    return summary;
  }

  /**
   * Clear evidence for an execution
   */
  async clearEvidence(executionId: string): Promise<void> {
    try {
      const collection = await this.getCollection(executionId);
      
      // Delete all evidence files
      for (const item of collection.items) {
        if (item.path) {
          const absolutePath = path.join(this.evidencePath, item.path);
          try {
            if (fs.existsSync(absolutePath)) {
              await fs.promises.unlink(absolutePath);
            } else if (fs.existsSync(absolutePath + '.gz')) {
              await fs.promises.unlink(absolutePath + '.gz');
            }
          } catch (error) {
            // Continue cleanup
          }
        }
      }
      
      // Delete manifest
      const manifestPath = path.join(
        this.evidencePath,
        `manifest_${executionId}.json`
      );
      
      if (fs.existsSync(manifestPath)) {
        await fs.promises.unlink(manifestPath);
      }
      
      // Remove from memory
      this.evidenceStorage.delete(executionId);
      
      this.logger.info(`Evidence collection cleared for ${executionId}`);
      
    } catch (error) {
      this.logger.error(`Failed to clear evidence for ${executionId}`, error as Error);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalSize: number;
    fileCount: number;
    oldestFile: Date | null;
    newestFile: Date | null;
    byType: Record<string, { count: number; size: number }>;
  }> {
    const stats = {
      totalSize: 0,
      fileCount: 0,
      oldestFile: null as Date | null,
      newestFile: null as Date | null,
      byType: {} as Record<string, { count: number; size: number }>
    };
    
    try {
      const processDirectory = async (dir: string, type: string) => {
        const dirPath = path.join(this.evidencePath, dir);
        if (!fs.existsSync(dirPath)) {
          return;
        }
        
        const files = await fs.promises.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const fileStats = await fs.promises.stat(filePath);
          
          stats.totalSize += fileStats.size;
          stats.fileCount++;
          
          if (!stats.oldestFile || fileStats.mtime < stats.oldestFile) {
            stats.oldestFile = fileStats.mtime;
          }
          
          if (!stats.newestFile || fileStats.mtime > stats.newestFile) {
            stats.newestFile = fileStats.mtime;
          }
          
          if (!stats.byType[type]) {
            stats.byType[type] = { count: 0, size: 0 };
          }
          
          stats.byType[type].count++;
          stats.byType[type].size += fileStats.size;
        }
      };
      
      // Process each type directory
      await processDirectory('screenshots', 'screenshot');
      await processDirectory('videos', 'video');
      await processDirectory('logs', 'log');
      await processDirectory('traces', 'trace');
      
    } catch (error) {
      this.logger.error('Failed to get storage stats', error as Error);
    }
    
    return stats;
  }
}