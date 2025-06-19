// src/core/debugging/TraceRecorder.ts

import { Page, BrowserContext } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import { DateUtils } from '../utils/DateUtils';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import * as path from 'path';
import * as fs from 'fs';
import { 
    TraceOptions, 
    TraceSession, 
    TraceEvent, 
    TraceAttachment, 
    TraceInfo, 
    TraceAnalysis,
    TraceMetadata,
    TraceSummary
} from './types/debug.types';

// Internal extended TraceSession interface
interface InternalTraceSession extends TraceSession {
    filePath: string;
    fileName: string;
    context: BrowserContext;
    page: Page;
    options: TraceOptions;
    isPaused?: boolean;
    pausedAt?: Date;
    compressedSize?: number;
    archivedPath?: string;
    endTime?: Date;
    duration?: number;
    totalPauseDuration?: number;
    performanceInterval?: NodeJS.Timeout;
    metrics?: {
        screenshotCount: number;
        snapshotCount: number;
        networkRequestCount: number;
        consoleLogCount: number;
        errorCount: number;
        eventCount: number;
    };
}

/**
 * Records detailed Playwright traces for debugging
 * Captures screenshots, DOM snapshots, network, console logs
 */
export class TraceRecorder {
    private static instance: TraceRecorder;
    private activeTraces: Map<string, InternalTraceSession> = new Map();
    private tracePath: string;
    // src/core/debugging/TraceRecorder.ts (continued)

   private isGlobalTracingEnabled: boolean = false;
   private traceOptions!: TraceOptions;
   private compressionEnabled: boolean = true;
   private maxTraceSize: number;
   private autoSaveInterval: NodeJS.Timeout | null = null;
   private logger: Logger;
   private isInitialized: boolean = false;
   
   private constructor() {
       this.tracePath = path.join(process.cwd(), 'traces');
       this.maxTraceSize = 100 * 1024 * 1024; // 100MB default
       this.logger = Logger.getInstance('TraceRecorder');
       // Initialization will happen lazily via ensureInitialized()
   }
   
   static getInstance(): TraceRecorder {
       if (!TraceRecorder.instance) {
           TraceRecorder.instance = new TraceRecorder();
       }
       return TraceRecorder.instance;
   }
   
   private loadConfiguration(): void {
       this.traceOptions = {
           screenshots: ConfigurationManager.getBoolean('TRACE_SCREENSHOTS', true),
           snapshots: ConfigurationManager.getBoolean('TRACE_SNAPSHOTS', true),
           sources: ConfigurationManager.getBoolean('TRACE_SOURCES', false),
           title: ConfigurationManager.get('TRACE_TITLE', 'CS Test Automation Trace'),
           preserveOutput: ConfigurationManager.getBoolean('TRACE_PRESERVE_OUTPUT', false),
           categories: this.parseCategories(ConfigurationManager.get('TRACE_CATEGORIES', '-default'))
       };
       
       this.compressionEnabled = ConfigurationManager.getBoolean('TRACE_COMPRESSION', true);
       this.isGlobalTracingEnabled = ConfigurationManager.getBoolean('TRACE_ENABLED', false);
       this.maxTraceSize = ConfigurationManager.getInt('TRACE_MAX_SIZE_MB', 100) * 1024 * 1024;
   }
   
   private async ensureInitialized(): Promise<void> {
       if (!this.isInitialized) {
           this.loadConfiguration();
           await this.initialize();
           this.isInitialized = true;
       }
   }
   
   private async initialize(): Promise<void> {
       try {
           // Ensure trace directory exists
           await FileUtils.ensureDir(this.tracePath);
           
           // Create subdirectories
           await FileUtils.ensureDir(path.join(this.tracePath, 'active'));
           await FileUtils.ensureDir(path.join(this.tracePath, 'archive'));
           await FileUtils.ensureDir(path.join(this.tracePath, 'checkpoints'));
           
           // Clean old traces if needed
           if (!this.traceOptions.preserveOutput) {
               await this.cleanOldTraces();
           }
           
           // Set up auto-save interval
           if (ConfigurationManager.getBoolean('TRACE_AUTO_SAVE', false)) {
               const interval = ConfigurationManager.getInt('TRACE_AUTO_SAVE_INTERVAL', 300000); // 5 minutes
               this.autoSaveInterval = setInterval(() => {
                   this.autoSaveActiveTraces();
               }, interval);
           }
           
           this.logger.info('TraceRecorder initialized');
           
       } catch (error) {
           this.logger.error(`Failed to initialize TraceRecorder: ${(error as Error).message}`);
       }
   }
   
   /**
    * Start tracing for a page
    */
   async startTracing(
       page: Page,
       options?: Partial<TraceOptions>
   ): Promise<string> {
       await this.ensureInitialized();
       try {
           const context = page.context();
           const sessionId = this.generateSessionId();
           const traceOpts = { ...this.traceOptions, ...options };
           
           // Check if already tracing
           if (this.isContextTracing(context)) {
               this.logger.warn('Trace already active for this context');
               return this.getActiveTraceId(context);
           }
           
           // Check trace size limits
           await this.checkTraceSizeLimits();
           
           // Create trace file path
           const timestamp = DateUtils.toTimestamp(new Date());
           const fileName = `trace-${timestamp}-${sessionId}.zip`;
           const filePath = path.join(this.tracePath, 'active', fileName);
           
           // Start Playwright tracing with enhanced options
           const tracingOptions: any = {
               screenshots: traceOpts.screenshots,
               snapshots: traceOpts.snapshots,
               sources: traceOpts.sources
           };
           if (traceOpts.title !== undefined) {
               tracingOptions.title = traceOpts.title;
           }
           await context.tracing.start(tracingOptions);
           
           // Create trace session
           const session: InternalTraceSession = {
               id: sessionId,
               startTime: new Date(),
               filePath,
               fileName,
               context,
               page,
               options: traceOpts,
               events: [],
               metadata: await this.captureInitialMetadata(page),
               metrics: {
                   screenshotCount: 0,
                   snapshotCount: 0,
                   networkRequestCount: 0,
                   consoleLogCount: 0,
                   errorCount: 0,
                   eventCount: 0
               },
               browserContext: context,
               attachments: [],
               status: 'active',
               checkpoints: new Map()
           };
           
           this.activeTraces.set(sessionId, session);
           
           // Set up event listeners
           this.setupEventListeners(session);
           
           // Set up performance monitoring
           this.setupPerformanceMonitoring(session);
           
           this.logger.info(`🎬 Trace recording started: ${sessionId}`);
           ActionLogger.logInfo('Trace recording started', { sessionId, filePath });
           
           return sessionId;
           
       } catch (error) {
           this.logger.error(`Failed to start tracing: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Stop tracing and save trace file
    */
   async stopTracing(sessionId?: string): Promise<string> {
       await this.ensureInitialized();
       try {
           const session = sessionId 
               ? this.activeTraces.get(sessionId)
               : this.getLatestSession() as InternalTraceSession | undefined;
           
           if (!session) {
               throw new Error(`No active trace session found${sessionId ? `: ${sessionId}` : ''}`);
           }
           
           // Stop performance monitoring
           this.stopPerformanceMonitoring(session);
           
           // Capture final state
           await this.captureFinalState(session);
           
           // Stop Playwright tracing
           await session.context.tracing.stop({ path: session.filePath });
           
           session.endTime = new Date();
           session.duration = session.endTime.getTime() - session.startTime.getTime();
           
           // Process and enhance trace
           await this.processTrace(session);
           
           // Compress if enabled
           if (this.compressionEnabled) {
               await this.compressTrace(session);
           }
           
           // Archive trace
           const archivedPath = await this.archiveTrace(session);
           
           // Save metadata
           await this.saveTraceMetadata(session);
           
           // Generate summary report
           await this.generateSummaryReport(session);
           
           // Clean up
           this.removeEventListeners(session);
           this.activeTraces.delete(session.id);
           
           // Log completion
           this.logger.info(`🎬 Trace recording stopped: ${session.id}`);
           this.logger.info(`   Duration: ${this.formatDuration(session.duration)}`);
           this.logger.info(`   Size: ${await this.getFileSize(archivedPath)}`);
           this.logger.info(`   Events: ${session.events.length}`);
           ActionLogger.logInfo('Trace recording stopped', { sessionId: session.id, archivedPath, duration: session.duration });
           
           return archivedPath;
           
       } catch (error) {
           this.logger.error(`Failed to stop tracing: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Pause trace recording
    */
   async pauseTracing(sessionId?: string): Promise<void> {
       await this.ensureInitialized();
       try {
           const session = sessionId 
               ? this.activeTraces.get(sessionId)
               : this.getLatestSession() as InternalTraceSession | undefined;
           
           if (!session) {
               throw new Error('No active trace session found');
           }
           
           if (session.isPaused) {
               this.logger.warn('Trace already paused');
               return;
           }
           
           // Create checkpoint before pausing
           await this.createCheckpoint(session);
           
           session.isPaused = true;
           session.pausedAt = new Date();
           
           // Record pause event
           this.recordEvent(session, 'trace-paused', {
               timestamp: session.pausedAt,
               reason: 'Manual pause'
           });
           
           this.logger.info(`⏸️  Trace recording paused: ${session.id}`);
           
       } catch (error) {
           this.logger.error(`Failed to pause tracing: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Resume trace recording
    */
   async resumeTracing(sessionId?: string): Promise<void> {
       await this.ensureInitialized();
       try {
           const session = sessionId 
               ? this.activeTraces.get(sessionId)
               : this.getLatestSession() as InternalTraceSession | undefined;
           
           if (!session || !session.isPaused) {
               throw new Error('No paused trace session found');
           }
           
           const pauseDuration = new Date().getTime() - session.pausedAt!.getTime();
           session.totalPauseDuration = (session.totalPauseDuration || 0) + pauseDuration;
           session.isPaused = false;
           
           // Record resume event
           this.recordEvent(session, 'trace-resumed', {
               timestamp: new Date(),
               pauseDuration
           });
           
           this.logger.info(`▶️  Trace recording resumed: ${session.id}`);
           
       } catch (error) {
           this.logger.error(`Failed to resume tracing: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Save current trace without stopping
    */
   async saveTrace(sessionId?: string): Promise<string> {
       await this.ensureInitialized();
       try {
           const session = sessionId 
               ? this.activeTraces.get(sessionId)
               : this.getLatestSession() as InternalTraceSession | undefined;
           
           if (!session) {
               throw new Error('No active trace session found');
           }
           
           return await this.createCheckpoint(session);
           
       } catch (error) {
           this.logger.error(`Failed to save trace: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Attach custom data to trace
    */
   async attachToTrace(sessionId: string, attachment: TraceAttachment): Promise<void> {
       const session = this.activeTraces.get(sessionId);
       
       if (!session) {
           throw new Error(`No active trace session found: ${sessionId}`);
       }
       
       // Record attachment event
       const event: TraceEvent = {
           type: 'attachment',
           timestamp: new Date(),
           data: attachment,
           duration: 0
       };
       
       session.events.push(event);
       
       // Handle different attachment types
       switch (attachment.type) {
           case 'screenshot':
               session.metrics!.screenshotCount++;
               await this.attachScreenshot(session, attachment);
               break;
               
           case 'html':
               await this.attachHTML(session, attachment);
               break;
               
           case 'json':
               await this.attachJSON(session, attachment);
               break;
               
           case 'text':
           default:
               await this.attachText(session, attachment);
               break;
       }
       
       this.logger.debug(`Attached ${attachment.type} to trace: ${attachment.name}`);
   }
   
   /**
    * Get active trace sessions
    */
   getActiveTraces(): TraceInfo[] {
       return Array.from(this.activeTraces.values()).map(session => ({
           path: session.filePath,
           size: session.compressedSize || 0,
           duration: this.calculateDuration(session),
           eventCount: session.events.length,
           attachmentCount: session.attachments.length,
           metadata: session.metadata
       }));
   }
   
   /**
    * Enable global tracing for all tests
    */
   enableGlobalTracing(options?: Partial<TraceOptions>): void {
       this.isGlobalTracingEnabled = true;
       if (options) {
           this.traceOptions = { ...this.traceOptions, ...options };
       }
       
       this.logger.info('🌍 Global tracing enabled');
   }
   
   /**
    * Disable global tracing
    */
   disableGlobalTracing(): void {
       this.isGlobalTracingEnabled = false;
       this.logger.info('Global tracing disabled');
   }
   
   /**
    * Check if global tracing is enabled
    */
   isGlobalTracingActive(): boolean {
       return this.isGlobalTracingEnabled;
   }
   
   /**
    * Analyze trace file
    */
   async analyzeTrace(tracePath: string): Promise<TraceAnalysis> {
       try {
           if (!await FileUtils.exists(tracePath)) {
               throw new Error(`Trace file not found: ${tracePath}`);
           }
           
           // Read trace metadata
           const metadataPath = tracePath.replace('.zip', '-metadata.json');
           let metadata: any = {};
           
           if (await FileUtils.exists(metadataPath)) {
               metadata = await FileUtils.readJSON(metadataPath);
           }
           
           // Get file stats
           const stats = await fs.promises.stat(tracePath);
           
           // Analyze events
           const eventAnalysis = this.analyzeEvents(metadata.events || []);
           
           // Calculate performance metrics
           const performanceMetrics = this.calculatePerformanceMetrics(metadata.events || []);
           
           // Identify issues
           const issues = this.identifyIssues(metadata.events || []);
           
           const analysis: TraceAnalysis = {
               filePath: tracePath,
               fileSize: stats.size,
               duration: metadata.duration || 0,
               startTime: metadata.startTime ? new Date(metadata.startTime) : stats.birthtime,
               endTime: metadata.endTime ? new Date(metadata.endTime) : stats.mtime,
               events: metadata.events || [],
               summary: {
                   totalEvents: metadata.events?.length || 0,
                   screenshots: metadata.metrics?.screenshotCount || 0,
                   snapshots: metadata.metrics?.snapshotCount || 0,
                   networkRequests: metadata.metrics?.networkRequestCount || 0,
                   consoleMessages: metadata.metrics?.consoleLogCount || 0,
                   errors: metadata.metrics?.errorCount || 0
               },
               metadata: metadata.metadata || {},
               eventAnalysis,
               performanceMetrics,
               issues
           };
           
           return analysis;
           
       } catch (error) {
           this.logger.error(`Failed to analyze trace: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Merge multiple trace files
    */
   async mergeTraces(tracePaths: string[], outputPath: string): Promise<string> {
       try {
           const mergedData = {
               type: 'merged',
               mergedAt: new Date(),
               traces: [] as any[],
               combinedEvents: [] as TraceEvent[],
               combinedMetrics: {
                   totalDuration: 0,
                   totalEvents: 0,
                   totalErrors: 0,
                   totalNetworkRequests: 0
               }
           };
           
           // Process each trace
           for (const tracePath of tracePaths) {
               const analysis = await this.analyzeTrace(tracePath);
               mergedData.traces.push({
                   path: tracePath,
                   analysis
               });
               
               // Combine events
               mergedData.combinedEvents.push(...analysis.events);
               
               // Update metrics
               mergedData.combinedMetrics.totalDuration += analysis.duration;
               mergedData.combinedMetrics.totalEvents += analysis.summary.totalEvents;
               mergedData.combinedMetrics.totalErrors += analysis.summary.errors || 0;
               mergedData.combinedMetrics.totalNetworkRequests += analysis.summary.networkRequests || 0;
           }
           
           // Sort combined events by timestamp
           mergedData.combinedEvents.sort((a, b) => 
               new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
           );
           
           // Save merged data
           const mergedPath = outputPath.endsWith('.json') 
               ? outputPath 
               : outputPath.replace('.zip', '-merged.json');
               
           await FileUtils.writeJSON(mergedPath, mergedData);
           
           // Generate merged report
           await this.generateMergedReport(mergedData, mergedPath);
           
           this.logger.info(`Traces merged: ${tracePaths.length} files -> ${mergedPath}`);
           
           return mergedPath;
           
       } catch (error) {
           this.logger.error(`Failed to merge traces: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Export trace to different format
    */
   async exportTrace(
       tracePath: string,
       format: 'html' | 'json' | 'har',
       outputPath: string
   ): Promise<string> {
       try {
           const analysis = await this.analyzeTrace(tracePath);
           
           switch (format) {
               case 'html':
                   return await this.exportToHTML(analysis, outputPath);
                   
               case 'json':
                   await FileUtils.writeJSON(outputPath, analysis);
                   return outputPath;
                   
               case 'har':
                   return await this.exportToHAR(analysis, outputPath);
                   
               default:
                   throw new Error(`Unsupported export format: ${format}`);
           }
           
       } catch (error) {
           this.logger.error(`Failed to export trace: ${(error as Error).message}`);
           throw error;
       }
   }
   
   /**
    * Clean up old trace files
    */
   async cleanOldTraces(daysToKeep: number = 7): Promise<number> {
       try {
           const directories = ['active', 'archive', 'checkpoints'];
           const cutoffDate = new Date();
           cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
           
           let deletedCount = 0;
           
           for (const dir of directories) {
               const dirPath = path.join(this.tracePath, dir);
               if (!await FileUtils.exists(dirPath)) continue;
               
               const files = await fs.promises.readdir(dirPath);
               
               for (const file of files) {
                   if (file.startsWith('trace-') && (file.endsWith('.zip') || file.endsWith('.json'))) {
                       const filePath = path.join(dirPath, file);
                       const stats = await fs.promises.stat(filePath);
                       
                       if (stats.mtime < cutoffDate) {
                           await fs.promises.unlink(filePath);
                           
                           // Also delete metadata file if exists
                           const metadataPath = filePath.replace('.zip', '-metadata.json');
                           if (await FileUtils.exists(metadataPath)) {
                               await fs.promises.unlink(metadataPath);
                           }
                           
                           deletedCount++;
                       }
                   }
               }
           }
           
           if (deletedCount > 0) {
               this.logger.info(`Cleaned ${deletedCount} old trace files`);
           }
           
           return deletedCount;
           
       } catch (error) {
           this.logger.error(`Failed to clean old traces: ${(error as Error).message}`);
           return 0;
       }
   }
   
   /**
    * Get trace statistics
    */
   async getTraceStatistics(): Promise<TraceStatistics> {
       try {
           const stats: TraceStatistics = {
               activeTraces: this.activeTraces.size,
               totalTraces: 0,
               totalSize: 0,
               oldestTrace: null,
               newestTrace: null,
               averageTraceSize: 0,
               averageTraceDuration: 0,
               tracesByDay: new Map()
           };
           
           // Scan all trace directories
           const directories = ['active', 'archive'];
           const allTraces: TraceFileInfo[] = [];
           
           for (const dir of directories) {
               const dirPath = path.join(this.tracePath, dir);
               if (!await FileUtils.exists(dirPath)) continue;
               
               const files = await fs.promises.readdir(dirPath);
               
               for (const file of files) {
                   if (file.startsWith('trace-') && file.endsWith('.zip')) {
                       const filePath = path.join(dirPath, file);
                       const fileStat = await fs.promises.stat(filePath);
                       
                       allTraces.push({
                           path: filePath,
                           name: file,
                           size: fileStat.size,
                           created: fileStat.birthtime,
                           modified: fileStat.mtime
                       });
                       
                       stats.totalSize += fileStat.size;
                   }
               }
           }
           
           stats.totalTraces = allTraces.length;
           
           if (allTraces.length > 0) {
               // Sort by date
               allTraces.sort((a, b) => a.created.getTime() - b.created.getTime());
               
               stats.oldestTrace = allTraces[0] || null;
               stats.newestTrace = allTraces[allTraces.length - 1] || null;
               stats.averageTraceSize = stats.totalSize / allTraces.length;
               
               // Group by day
               for (const trace of allTraces) {
                   const day = trace.created.toISOString().split('T')[0];
                   if (day) {
                       const currentCount = stats.tracesByDay.get(day);
                       stats.tracesByDay.set(day, (currentCount !== undefined ? currentCount : 0) + 1);
                   }
               }
           }
           
           return stats;
           
       } catch (error) {
           this.logger.error(`Failed to get trace statistics: ${(error as Error).message}`);
           throw error;
       }
   }
   
   // Private helper methods
   
   private async captureFinalState(session: InternalTraceSession): Promise<void> {
       try {
           // Capture final page state
           const finalState = await session.page.evaluate(() => ({
               url: window.location.href,
               title: document.title,
               cookies: document.cookie,
               localStorage: { ...localStorage },
               sessionStorage: { ...sessionStorage },
               documentState: document.readyState,
               performanceTiming: performance.timing
           }));
           
           this.recordEvent(session, 'final-state', finalState);
           
           // Capture final screenshot
           try {
               const screenshot = await session.page.screenshot({ fullPage: true });
               await this.attachScreenshot(session, {
                   name: 'final-screenshot.png',
                   contentType: 'image/png',
                   body: screenshot,
                   timestamp: new Date()
               });
           } catch (error) {
               // Ignore screenshot errors
           }
       } catch (error) {
           this.logger.debug(`Failed to capture final state: ${(error as Error).message}`);
       }
   }
   
   private async captureInitialMetadata(page: Page): Promise<TraceMetadata> {
       return {
           url: page.url(),
           title: await page.title(),
           viewport: page.viewportSize(),
           userAgent: await page.evaluate(() => navigator.userAgent),
           timestamp: new Date(),
           custom: {
               browserName: page.context().browser()?.browserType().name(),
               platform: process.platform,
               nodeVersion: process.version
           }
       };
   }
   
   private setupEventListeners(session: InternalTraceSession): void {
       const page = session.page;
       
       // Page events
       page.on('load', () => this.recordEvent(session, 'pageLoad', { 
           url: page.url(),
           timestamp: new Date()
       }));
       
       page.on('domcontentloaded', () => this.recordEvent(session, 'domReady', { 
           url: page.url(),
           timestamp: new Date()
       }));
       
       // Console events with full details
       page.on('console', (msg) => {
           const event = {
               level: msg.type(),
               text: msg.text(),
               location: msg.location(),
               args: msg.args().length,
               timestamp: new Date()
           };
           
           this.recordEvent(session, 'console', event);
           session.metrics!.consoleLogCount++;
           
           if (msg.type() === 'error') {
               session.metrics!.errorCount++;
           }
       });
       
       // Error events with stack traces
       page.on('pageerror', (error) => {
           this.recordEvent(session, 'error', {
               message: error.message,
               stack: error.stack,
               name: error.name,
               timestamp: new Date()
           });
           session.metrics!.errorCount++;
       });
       
       // Dialog events
       page.on('dialog', (dialog) => this.recordEvent(session, 'dialog', {
           type: dialog.type(),
           message: dialog.message(),
           defaultValue: dialog.defaultValue(),
           timestamp: new Date()
       }));
       
       // Network events with timing
       page.on('request', (request) => {
           this.recordEvent(session, 'network', {
               type: 'request',
               url: request.url(),
               method: request.method(),
               headers: request.headers(),
               postData: request.postData(),
               resourceType: request.resourceType(),
               timestamp: new Date()
           });
           session.metrics!.networkRequestCount++;
       });
       
       page.on('response', (response) => {
           this.recordEvent(session, 'network', {
               type: 'response',
               url: response.url(),
               status: response.status(),
               statusText: response.statusText(),
               headers: response.headers(),
               fromCache: (response as any).fromCache ? (response as any).fromCache() : false,
               timing: (response as any).timing ? (response as any).timing() : null,
               timestamp: new Date()
           });
       });
       
       page.on('requestfailed', (request) => {
           this.recordEvent(session, 'network', {
               type: 'requestfailed',
               url: request.url(),
               failure: request.failure(),
               timestamp: new Date()
           });
       });
       
       // Download events
       page.on('download', (download) => this.recordEvent(session, 'download', {
           url: download.url(),
           suggestedFilename: download.suggestedFilename(),
           timestamp: new Date()
       }));
       
       // Frame events
       page.on('frameattached', (frame) => this.recordEvent(session, 'frame', {
           type: 'attached',
           url: frame.url(),
           name: frame.name(),
           timestamp: new Date()
       }));
       
       page.on('framedetached', (frame) => this.recordEvent(session, 'frame', {
           type: 'detached',
           url: frame.url(),
           name: frame.name(),
           timestamp: new Date()
       }));
       
       // Worker events
       page.on('worker', (worker) => this.recordEvent(session, 'worker', {
           type: 'created',
           url: worker.url(),
           timestamp: new Date()
       }));
   }
   
   private setupPerformanceMonitoring(session: InternalTraceSession): void {
       // Monitor performance metrics periodically
       session.performanceInterval = setInterval(async () => {
           if (session.isPaused) return;
           
           try {
               const metrics = await session.page.evaluate(() => {
                   const navigation = performance.getEntriesByType('navigation')[0] as any;
                   const resources = performance.getEntriesByType('resource');
                   
                   return {
                       navigation: navigation ? {
                           domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                           loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                           domInteractive: navigation.domInteractive - navigation.fetchStart,
                           firstPaint: navigation.domContentLoadedEventStart - navigation.fetchStart
                       } : null,
                       resources: {
                           count: resources.length,
                           totalSize: resources.reduce((sum, r: any) => sum + (r.transferSize || 0), 0),
                           totalDuration: resources.reduce((sum, r: any) => sum + (r.duration || 0), 0)
                       },
                       memory: (performance as any).memory ? {
                           usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
                           totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
                           jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
                       } : null
                   };
               });
               
               this.recordEvent(session, 'performance', metrics);
               
           } catch (error) {
               // Ignore performance monitoring errors
           }
       }, 5000); // Every 5 seconds
   }
   
   private stopPerformanceMonitoring(session: InternalTraceSession): void {
       if (session.performanceInterval) {
           clearInterval(session.performanceInterval);
           delete session.performanceInterval;
       }
   }
   
   private removeEventListeners(session: InternalTraceSession): void {
       // Playwright automatically removes listeners when page is closed
       // Stop performance monitoring
       this.stopPerformanceMonitoring(session);
   }
   
   private recordEvent(session: InternalTraceSession, type: string, data: any): void {
       if (session.isPaused) return;
       
       const event: TraceEvent = {
           type: type as any,
           timestamp: new Date(),
           data,
           duration: 0
       };
       
       session.events.push(event);
       session.metrics!.eventCount++;
   }
   
   private async attachScreenshot(session: InternalTraceSession, attachment: TraceAttachment): Promise<void> {
       // Add screenshot attachment to trace
       session.attachments.push({
           ...attachment,
           contentType: 'image/png'
       });
       
       this.recordEvent(session, 'attachment', {
           type: 'screenshot',
           name: attachment.name,
           timestamp: attachment.timestamp
       });
   }
   
   private async attachHTML(session: InternalTraceSession, attachment: TraceAttachment): Promise<void> {
       // Add HTML attachment to trace
       session.attachments.push({
           ...attachment,
           contentType: 'text/html'
       });
       
       this.recordEvent(session, 'attachment', {
           type: 'html',
           name: attachment.name,
           timestamp: attachment.timestamp
       });
   }
   
   private async attachJSON(session: InternalTraceSession, attachment: TraceAttachment): Promise<void> {
       // Add JSON attachment to trace
       session.attachments.push({
           ...attachment,
           contentType: 'application/json'
       });
       
       this.recordEvent(session, 'attachment', {
           type: 'json',
           name: attachment.name,
           timestamp: attachment.timestamp
       });
   }
   
   private async attachText(session: InternalTraceSession, attachment: TraceAttachment): Promise<void> {
       // Add text attachment to trace
       session.attachments.push({
           ...attachment,
           contentType: 'text/plain'
       });
       
       this.recordEvent(session, 'attachment', {
           type: 'text',
           name: attachment.name,
           timestamp: attachment.timestamp
       });
   }
   
   private async processTrace(session: InternalTraceSession): Promise<void> {
       // Add session summary
       const summary = this.generateSummary(session);
       
       // Add final event
       this.recordEvent(session, 'trace-complete', {
           summary,
           duration: session.duration,
           eventCount: session.events.length
       });
       
       // Process custom categories
       if (session.options.categories?.includes('performance')) {
           await this.enhancePerformanceData(session);
       }
       
       if (session.options.categories?.includes('accessibility')) {
           await this.addAccessibilityData(session);
       }
   }
   
   private async enhancePerformanceData(session: InternalTraceSession): Promise<void> {
       try {
           // Capture final performance metrics
           const finalMetrics = await session.page.evaluate(() => {
               const entries = performance.getEntries();
               const paint = performance.getEntriesByType('paint');
               const measures = performance.getEntriesByType('measure');
               
               return {
                   entries: entries.length,
                   paints: paint.map((p: any) => ({
                       name: p.name,
                       startTime: p.startTime
                   })),
                   measures: measures.map((m: any) => ({
                       name: m.name,
                       duration: m.duration
                   })),
                   timing: performance.timing
               };
           });
           
           this.recordEvent(session, 'performance-summary', finalMetrics);
           
       } catch (error) {
           this.logger.debug(`Failed to enhance performance data: ${(error as Error).message}`);
       }
   }
   
   private async addAccessibilityData(session: InternalTraceSession): Promise<void> {
       try {
           // Run accessibility audit
           const violations = await session.page.evaluate(() => {
               // Simple accessibility checks
               const issues = [];
               
               // Check for images without alt text
               const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
               if (imagesWithoutAlt.length > 0) {
                   issues.push({
                       type: 'missing-alt-text',
                       count: imagesWithoutAlt.length,
                       elements: Array.from(imagesWithoutAlt).slice(0, 5).map(el => el.outerHTML)
                   });
               }
               
               // Check for buttons without accessible text
               const buttonsWithoutText = Array.from(document.querySelectorAll('button'))
                   .filter(btn => !btn.textContent?.trim() && !btn.getAttribute('aria-label'));
                   
               if (buttonsWithoutText.length > 0) {
                   issues.push({
                       type: 'button-without-text',
                       count: buttonsWithoutText.length,
                       elements: buttonsWithoutText.slice(0, 5).map(el => el.outerHTML)
                   });
               }
               
               return issues;
           });
           
           if (violations.length > 0) {
               this.recordEvent(session, 'accessibility-issues', violations);
           }
           
       } catch (error) {
           this.logger.debug(`Failed to add accessibility data: ${(error as Error).message}`);
       }
   }
   
   private async compressTrace(session: InternalTraceSession): Promise<void> {
       // Playwright already creates compressed traces
       // This method is for additional compression if needed
       
       try {
           const stats = await fs.promises.stat(session.filePath);
           session.compressedSize = stats.size;
           
           this.logger.debug(`Trace size: ${this.formatFileSize(stats.size)}`);
           
       } catch (error) {
           this.logger.error(`Failed to get trace size: ${(error as Error).message}`);
       }
   }
   
   private async archiveTrace(session: InternalTraceSession): Promise<string> {
       const archivePath = session.filePath.replace('/active/', '/archive/');
       
       // Ensure archive directory exists
       await FileUtils.ensureDir(path.dirname(archivePath));
       
       // Move trace file
       await fs.promises.rename(session.filePath, archivePath);
       
       session.archivedPath = archivePath;
       
       return archivePath;
   }
   
   private async saveTraceMetadata(session: InternalTraceSession): Promise<void> {
       try {
           const metadata = {
               id: session.id,
               startTime: session.startTime,
               endTime: session.endTime,
               duration: session.duration,
               totalPauseDuration: session.totalPauseDuration || 0,
               options: session.options,
               metadata: session.metadata,
               metrics: session.metrics,
               events: session.events.map(e => ({
                   ...e,
                   timestamp: e.timestamp.toISOString()
               })),
               summary: this.generateSummary(session),
               archivedPath: session.archivedPath,
               compressedSize: session.compressedSize
           };
           
           const metadataPath = session.archivedPath!.replace('.zip', '-metadata.json');
           await FileUtils.writeJSON(metadataPath, metadata);
           
       } catch (error) {
           this.logger.error(`Failed to save trace metadata: ${(error as Error).message}`);
       }
   }
   
   private generateSummary(session: InternalTraceSession): TraceSummary {
       const eventCounts = session.events.reduce((acc, event) => {
           acc[event.type] = (acc[event.type] || 0) + 1;
           return acc;
       }, {} as Record<string, number>);
       
       return {
           totalEvents: session.events.length,
           eventTypes: eventCounts,
           errors: session.metrics?.errorCount || 0,
           warnings: session.events.filter(e => 
               e.type === 'console' && e.data?.level === 'warning'
           ).length,
           networkRequests: session.metrics?.networkRequestCount || 0,
           pageLoads: eventCounts['pageLoad'] || 0,
           duration: session.duration || 0,
           pauseDuration: session.totalPauseDuration || 0
       };
   }
   
   private async generateSummaryReport(session: InternalTraceSession): Promise<void> {
       const summary = this.generateSummary(session);
       const reportPath = session.archivedPath!.replace('.zip', '-summary.html');
       
       const html = `
<!DOCTYPE html>
<html>
<head>
   <title>Trace Summary - ${session.id}</title>
   <style>
       body { 
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           margin: 40px;
           background: #f5f5f5;
           color: #333;
       }
       .header {
           background: #93186C;
           color: white;
           padding: 30px;
           border-radius: 8px;
           margin-bottom: 30px;
       }
       .header h1 {
           margin: 0;
           font-weight: 300;
           font-size: 2rem;
       }
       .header .subtitle {
           margin-top: 10px;
           opacity: 0.9;
       }
       .section {
           background: white;
           padding: 25px;
           margin-bottom: 25px;
           border-radius: 8px;
           box-shadow: 0 2px 10px rgba(0,0,0,0.05);
       }
       .section h2 {
           margin-top: 0;
           color: #93186C;
           font-weight: 400;
       }
       .metrics {
           display: grid;
           grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
           gap: 20px;
           margin-top: 20px;
       }
       .metric {
           background: #f8f9fa;
           padding: 20px;
           border-radius: 6px;
           text-align: center;
       }
       .metric-value {
           font-size: 2rem;
           font-weight: 600;
           color: #93186C;
       }
       .metric-label {
           color: #666;
           margin-top: 5px;
       }
       table {
           width: 100%;
           border-collapse: collapse;
           margin-top: 20px;
       }
       th, td {
           padding: 12px;
           text-align: left;
           border-bottom: 1px solid #e0e0e0;
       }
       th {
           background: #f8f9fa;
           font-weight: 600;
           color: #666;
       }
       .event-type {
           display: inline-block;
           padding: 4px 12px;
           background: #93186C20;
           color: #93186C;
           border-radius: 4px;
           font-size: 0.9rem;
       }
       .timeline {
           margin-top: 20px;
           position: relative;
           padding: 20px 0;
       }
       .timeline-item {
           position: relative;
           padding-left: 40px;
           margin-bottom: 20px;
       }
       .timeline-item::before {
           content: '';
           position: absolute;
           left: 15px;
           top: 5px;
           width: 10px;
           height: 10px;
           border-radius: 50%;
           background: #93186C;
       }
       .timeline-item::after {
           content: '';
           position: absolute;
           left: 19px;
           top: 15px;
           width: 2px;
           height: calc(100% + 10px);
           background: #e0e0e0;
       }
       .timeline-item:last-child::after {
           display: none;
       }
       .error { color: #dc3545; }
       .warning { color: #ffc107; }
       .info { color: #17a2b8; }
   </style>
</head>
<body>
   <div class="header">
       <h1>Trace Summary</h1>
       <div class="subtitle">
           Session: ${session.id}<br>
           ${session.metadata.url ? `URL: ${session.metadata.url}<br>` : ''}
           Duration: ${this.formatDuration(session.duration || 0)}
       </div>
   </div>
   
   <div class="section">
       <h2>Overview</h2>
       <div class="metrics">
           <div class="metric">
               <div class="metric-value">${summary.totalEvents}</div>
               <div class="metric-label">Total Events</div>
           </div>
           <div class="metric">
               <div class="metric-value">${summary.networkRequests}</div>
               <div class="metric-label">Network Requests</div>
           </div>
           <div class="metric">
               <div class="metric-value">${summary.errors}</div>
               <div class="metric-label">Errors</div>
           </div>
           <div class="metric">
               <div class="metric-value">${summary.warnings}</div>
               <div class="metric-label">Warnings</div>
           </div>
       </div>
   </div>
   
   <div class="section">
       <h2>Event Distribution</h2>
       <table>
           <thead>
               <tr>
                   <th>Event Type</th>
                   <th>Count</th>
                   <th>Percentage</th>
               </tr>
           </thead>
           <tbody>
               ${Object.entries(summary.eventTypes || {})
                   .sort((a, b) => b[1] - a[1])
                   .map(([type, count]) => `
                       <tr>
                           <td><span class="event-type">${type}</span></td>
                           <td>${count}</td>
                           <td>${((count / summary.totalEvents) * 100).toFixed(1)}%</td>
                       </tr>
                   `).join('')}
           </tbody>
       </table>
   </div>
   
   <div class="section">
       <h2>Timeline</h2>
       <div class="timeline">
           <div class="timeline-item">
               <strong>Trace Started</strong><br>
               ${session.startTime.toLocaleString()}
           </div>
           ${session.events
               .filter(e => ['pageLoad', 'error', 'trace-complete'].includes(e.type))
               .slice(0, 10)
               .map(event => `
                   <div class="timeline-item">
                       <strong class="${event.type === 'error' ? 'error' : ''}">${event.type}</strong><br>
                       ${new Date(event.timestamp).toLocaleString()}<br>
                       ${event.data?.url ? `URL: ${event.data.url}` : ''}
                       ${event.data?.message ? `<span class="error">${event.data.message}</span>` : ''}
                   </div>
               `).join('')}
           <div class="timeline-item">
               <strong>Trace Completed</strong><br>
               ${session.endTime?.toLocaleString() || 'N/A'}
           </div>
       </div>
   </div>
   
   ${session.metrics && session.metrics.errorCount > 0 ? `
   <div class="section">
       <h2>Errors</h2>
       <table>
           <thead>
               <tr>
                   <th>Time</th>
                   <th>Type</th>
                   <th>Message</th>
               </tr>
           </thead>
           <tbody>
               ${session.events
                   .filter(e => e.type === 'error' || (e.type === 'console' && e.data?.level === 'error'))
                   .map(event => `
                       <tr>
                           <td>${new Date(event.timestamp).toLocaleTimeString()}</td>
                           <td><span class="event-type">${event.type}</span></td>
                           <td class="error">${event.data?.message || event.data?.text || 'Unknown error'}</td>
                       </tr>
                   `).join('')}
           </tbody>
       </table>
   </div>
   ` : ''}
   
   <div class="section">
       <h2>Technical Details</h2>
       <table>
           <tr>
               <td><strong>Session ID</strong></td>
               <td>${session.id}</td>
           </tr>
           <tr>
               <td><strong>Start Time</strong></td>
               <td>${session.startTime.toLocaleString()}</td>
           </tr>
           <tr>
               <td><strong>End Time</strong></td>
               <td>${session.endTime?.toLocaleString() || 'N/A'}</td>
           </tr>
           <tr>
               <td><strong>Duration</strong></td>
               <td>${this.formatDuration(session.duration || 0)}</td>
           </tr>
           <tr>
               <td><strong>Pause Duration</strong></td>
               <td>${this.formatDuration(session.totalPauseDuration || 0)}</td>
           </tr>
           <tr>
               <td><strong>File Size</strong></td>
               <td>${this.formatFileSize(session.compressedSize || 0)}</td>
           </tr>
           <tr>
               <td><strong>User Agent</strong></td>
               <td>${session.metadata.userAgent || 'N/A'}</td>
           </tr>
           <tr>
               <td><strong>Viewport</strong></td>
               <td>${session.metadata.viewport ? `${session.metadata.viewport.width}x${session.metadata.viewport.height}` : 'N/A'}</td>
           </tr>
       </table>
   </div>
</body>
</html>`;
       
       await FileUtils.writeFile(reportPath, html);
   }
   
   private async exportToHTML(analysis: TraceAnalysis, outputPath: string): Promise<string> {
       const html = `
<!DOCTYPE html>
<html>
<head>
   <title>Trace Analysis - ${path.basename(analysis.filePath)}</title>
   <style>
       body { 
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           margin: 20px;
           background: #f5f5f5;
       }
       .header {
           background: #93186C;
           color: white;
           padding: 20px;
           border-radius: 8px;
       }
       .section {
           background: white;
           padding: 20px;
           margin: 20px 0;
           border-radius: 8px;
           box-shadow: 0 2px 5px rgba(0,0,0,0.1);
       }
       .metric {
           display: inline-block;
           margin: 10px 20px 10px 0;
       }
       .metric-value {
           font-size: 24px;
           font-weight: bold;
           color: #93186C;
       }
       .metric-label {
           color: #666;
           font-size: 14px;
       }
       table {
           width: 100%;
           border-collapse: collapse;
       }
       th, td {
           padding: 10px;
           text-align: left;
           border-bottom: 1px solid #ddd;
       }
       th {
           background: #f8f9fa;
       }
       .chart-container {
           margin: 20px 0;
           min-height: 300px;
           background: #f8f9fa;
           border-radius: 8px;
           padding: 20px;
       }
       .event-timeline {
           position: relative;
           padding: 20px 0;
       }
       .event-item {
           padding: 10px;
           margin: 5px 0;
           background: #f8f9fa;
           border-left: 4px solid #93186C;
           border-radius: 4px;
       }
       .error-item {
           border-left-color: #dc3545;
           background: #f8d7da;
       }
       .warning-item {
           border-left-color: #ffc107;
           background: #fff3cd;
       }
   </style>
</head>
<body>
   <div class="header">
       <h1>Trace Analysis Report</h1>
       <p>File: ${path.basename(analysis.filePath)}</p>
       <p>Generated: ${new Date().toLocaleString()}</p>
   </div>
   
   <div class="section">
       <h2>Summary</h2>
       <div class="metric">
           <div class="metric-value">${this.formatDuration(analysis.duration)}</div>
           <div class="metric-label">Duration</div>
       </div>
       <div class="metric">
           <div class="metric-value">${this.formatFileSize(analysis.fileSize)}</div>
           <div class="metric-label">File Size</div>
       </div>
       <div class="metric">
           <div class="metric-value">${analysis.summary.totalEvents}</div>
           <div class="metric-label">Total Events</div>
       </div>
       <div class="metric">
           <div class="metric-value">${analysis.summary.errors}</div>
           <div class="metric-label">Errors</div>
       </div>
   </div>
   
   <div class="section">
       <h2>Event Breakdown</h2>
       <table>
           <tr>
               <th>Event Type</th>
               <th>Count</th>
           </tr>
           <tr>
               <td>Screenshots</td>
               <td>${analysis.summary.screenshots}</td>
           </tr>
           <tr>
               <td>DOM Snapshots</td>
               <td>${analysis.summary.snapshots}</td>
           </tr>
           <tr>
               <td>Network Requests</td>
               <td>${analysis.summary.networkRequests}</td>
           </tr>
           <tr>
               <td>Console Messages</td>
               <td>${analysis.summary.consoleMessages}</td>
           </tr>
           <tr>
               <td>Errors</td>
               <td>${analysis.summary.errors}</td>
           </tr>
       </table>
   </div>
   
   <div class="section">
       <h2>Page Information</h2>
       <table>
           <tr>
               <th>Property</th>
               <th>Value</th>
           </tr>
           <tr>
               <td>URL</td>
               <td>${analysis.metadata.url || 'N/A'}</td>
           </tr>
           <tr>
               <td>Title</td>
               <td>${analysis.metadata.title || 'N/A'}</td>
           </tr>
           <tr>
               <td>User Agent</td>
               <td>${analysis.metadata.userAgent || 'N/A'}</td>
           </tr>
           <tr>
               <td>Viewport</td>
               <td>${analysis.metadata.viewport ? `${analysis.metadata.viewport.width}x${analysis.metadata.viewport.height}` : 'N/A'}</td>
           </tr>
       </table>
   </div>
   
   ${analysis.performanceMetrics ? `
   <div class="section">
       <h2>Performance Metrics</h2>
       <div class="chart-container">
           <p>Performance visualization would be rendered here</p>
       </div>
       <table>
           <tr>
               <th>Metric</th>
               <th>Value</th>
           </tr>
           <tr>
               <td>Page Load Time</td>
               <td>${analysis.performanceMetrics.pageLoadTime || 0}ms</td>
           </tr>
           <tr>
               <td>DOM Content Loaded</td>
               <td>${analysis.performanceMetrics.domContentLoaded || 0}ms</td>
           </tr>
           <tr>
               <td>First Paint</td>
               <td>${analysis.performanceMetrics.firstPaint || 0}ms</td>
           </tr>
           <tr>
               <td>Total Network Requests</td>
               <td>${analysis.performanceMetrics.totalRequests || 0}</td>
           </tr>
           <tr>
               <td>Total Data Transferred</td>
               <td>${this.formatFileSize(analysis.performanceMetrics.totalBytes || 0)}</td>
           </tr>
       </table>
   </div>
   ` : ''}
   
   ${analysis.issues && analysis.issues.length > 0 ? `
   <div class="section">
       <h2>Issues Detected</h2>
       <div class="event-timeline">
           ${analysis.issues.map(issue => `
               <div class="event-item ${issue.severity === 'error' ? 'error-item' : 'warning-item'}">
                   <strong>${issue.type}</strong> - ${issue.description}<br>
                   <small>${issue.timestamp ? new Date(issue.timestamp).toLocaleString() : ''}</small>
               </div>
           `).join('')}
       </div>
   </div>
   ` : ''}
   
   <div class="section">
       <h2>Timeline</h2>
       <p>Start: ${analysis.startTime.toLocaleString()}</p>
       <p>End: ${analysis.endTime.toLocaleString()}</p>
       <div class="event-timeline">
           ${analysis.events.slice(0, 20).map(event => `
               <div class="event-item">
                   <strong>${event.type}</strong><br>
                   <small>${new Date(event.timestamp).toLocaleString()}</small>
                   ${event.data?.url ? `<br>URL: ${event.data.url}` : ''}
                   ${event.data?.message ? `<br>Message: ${event.data.message}` : ''}
               </div>
           `).join('')}
           ${analysis.events.length > 20 ? '<p>... and more events</p>' : ''}
       </div>
   </div>
</body>
</html>`;
       
       await FileUtils.writeFile(outputPath, html);
       return outputPath;
   }
   
   private async exportToHAR(analysis: TraceAnalysis, outputPath: string): Promise<string> {
       // Extract network events
       const networkEvents = analysis.events.filter(e => e.type === 'network');
       
       // Group requests and responses
       const requests = new Map<string, any>();
       const responses = new Map<string, any>();
       
       for (const event of networkEvents) {
           const key = `${event.data.method || 'GET'}_${event.data.url}`;
           
           if (event.data.type === 'request') {
               requests.set(key, event);
           } else if (event.data.type === 'response') {
               responses.set(key, event);
           }
       }
       
       // Create HAR entries
       const entries = [];
       let entryIndex = 0;
       
       for (const [key, request] of requests) {
           const response = responses.get(key);
           
           entries.push({
               pageref: 'page_1',
               startedDateTime: request.timestamp,
               time: response ? 
                   new Date(response.timestamp).getTime() - new Date(request.timestamp).getTime() : 
                   0,
               request: {
                   method: request.data.method || 'GET',
                   url: request.data.url || '',
                   httpVersion: 'HTTP/1.1',
                   headers: Object.entries(request.data.headers || {}).map(([name, value]) => ({
                       name,
                       value: String(value)
                   })),
                   queryString: this.parseQueryString(request.data.url),
                   cookies: [],
                   headersSize: -1,
                   bodySize: request.data.postData ? request.data.postData.length : 0,
                   postData: request.data.postData ? {
                       mimeType: request.data.headers?.['content-type'] || 'application/x-www-form-urlencoded',
                       text: request.data.postData
                   } : undefined
               },
               response: response ? {
                   status: response.data.status || 200,
                   statusText: response.data.statusText || 'OK',
                   httpVersion: 'HTTP/1.1',
                   headers: Object.entries(response.data.headers || {}).map(([name, value]) => ({
                       name,
                       value: String(value)
                   })),
                   cookies: [],
                   content: {
                       size: -1,
                       mimeType: response.data.headers?.['content-type'] || 'text/html',
                       compression: -1
                   },
                   redirectURL: '',
                   headersSize: -1,
                   bodySize: -1,
                   _transferSize: response.data.transferSize
               } : {
                   status: 0,
                   statusText: '',
                   httpVersion: 'HTTP/1.1',
                   headers: [],
                   cookies: [],
                   content: {
                       size: 0,
                       mimeType: 'text/html'
                   },
                   redirectURL: '',
                   headersSize: -1,
                   bodySize: -1
               },
               cache: {},
               timings: response?.data?.timing || {
                   blocked: -1,
                   dns: -1,
                   connect: -1,
                   send: -1,
                   wait: -1,
                   receive: -1,
                   ssl: -1
               },
               serverIPAddress: '',
               connection: '',
               comment: ''
           });
           
           entryIndex++;
       }
       
       // Create HAR format
       const har = {
           log: {
               version: '1.2',
               creator: {
                   name: 'CS Test Automation Framework',
                   version: '1.0.0'
               },
               browser: {
                   name: 'Playwright',
                   version: 'Latest'
               },
               pages: [{
                   startedDateTime: analysis.startTime.toISOString(),
                   id: 'page_1',
                   title: analysis.metadata.title || 'Unknown',
                   pageTimings: {
                       onContentLoad: analysis.performanceMetrics?.domContentLoaded || -1,
                       onLoad: analysis.performanceMetrics?.pageLoadTime || -1,
                       comment: ''
                   },
                   comment: ''
               }],
               entries,
               comment: ''
           }
       };
       
       await FileUtils.writeJSON(outputPath, har);
       return outputPath;
   }
   
   private parseQueryString(url: string): any[] {
       try {
           const urlObj = new URL(url);
           const params: any[] = [];
           
           urlObj.searchParams.forEach((value, name) => {
               params.push({ name, value });
           });
           
           return params;
       } catch {
           return [];
       }
   }
   
   private analyzeEvents(events: TraceEvent[]): EventAnalysis {
       const analysis: EventAnalysis = {
           totalEvents: events.length,
           eventsByType: new Map(),
           eventFrequency: new Map(),
           errorEvents: [],
           warningEvents: [],
           criticalPaths: []
       };
       
       // Count events by type
       for (const event of events) {
           analysis.eventsByType.set(event.type, 
               (analysis.eventsByType.get(event.type) || 0) + 1
           );
           
           // Track errors and warnings
           if (event.type === 'error' || 
               (event.type === 'console' && event.data?.level === 'error')) {
               analysis.errorEvents.push(event);
           } else if (event.type === 'console' && event.data?.level === 'warning') {
               analysis.warningEvents.push(event);
           }
       }
       
       // Calculate event frequency over time
       const timeSlots = new Map<number, number>();
       for (const event of events) {
           const minute = Math.floor(new Date(event.timestamp).getTime() / 60000);
           timeSlots.set(minute, (timeSlots.get(minute) || 0) + 1);
       }
       
       analysis.eventFrequency = timeSlots;
       
       // Identify critical paths (sequences of events leading to errors)
       for (const errorEvent of analysis.errorEvents) {
           const errorTime = new Date(errorEvent.timestamp).getTime();
           const precedingEvents = events
               .filter(e => {
                   const eventTime = new Date(e.timestamp).getTime();
                   return eventTime < errorTime && eventTime > errorTime - 5000; // Within 5 seconds
               })
               .slice(-5); // Last 5 events before error
               
           if (precedingEvents.length > 0) {
               analysis.criticalPaths.push({
                   error: errorEvent,
                   path: precedingEvents
               });
           }
       }
       
       return analysis;
   }
   
   private calculatePerformanceMetrics(events: TraceEvent[]): PerformanceMetrics {
       const metrics: PerformanceMetrics = {
           pageLoadTime: 0,
           domContentLoaded: 0,
           firstPaint: 0,
           totalRequests: 0,
           failedRequests: 0,
           totalBytes: 0,
           avgResponseTime: 0,
           slowestRequest: null,
           memoryPeakUsage: 0
       };
       
       // Find page load events
       const pageLoadEvent = events.find(e => e.type === 'pageLoad');
       const domReadyEvent = events.find(e => e.type === 'domReady');
       
       if (pageLoadEvent && domReadyEvent) {
           metrics.domContentLoaded = new Date(domReadyEvent.timestamp).getTime() - 
                                     new Date(pageLoadEvent.timestamp).getTime();
       }
       
       // Analyze network requests
       const networkRequests = events.filter(e => e.type === 'network' && e.data?.type === 'request');
       const networkResponses = events.filter(e => e.type === 'network' && e.data?.type === 'response');
       
       metrics.totalRequests = networkRequests.length;
       
       // Calculate response times
       const responseTimes: number[] = [];
       let slowestTime = 0;
       
       for (const request of networkRequests) {
           const response = networkResponses.find(r => r.data?.url === request.data?.url);
           
           if (response) {
               const responseTime = new Date(response.timestamp).getTime() - 
                                  new Date(request.timestamp).getTime();
               responseTimes.push(responseTime);
               
               if (responseTime > slowestTime) {
                   slowestTime = responseTime;
                   metrics.slowestRequest = {
                       url: request.data?.url,
                       time: responseTime
                   };
               }
               
               metrics.totalBytes += response.data?.transferSize || 0;
           }
       }
       
       if (responseTimes.length > 0) {
           metrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
       }
       
       // Count failed requests
       const failedRequests = events.filter(e => e.type === 'network' && e.data?.type === 'requestfailed');
       metrics.failedRequests = failedRequests.length;
       
       // Find memory peak
       const performanceEvents = events.filter(e => e.type === 'performance');
       for (const perfEvent of performanceEvents) {
           const memoryUsage = perfEvent.data?.memory?.usedJSHeapSize || 0;
           if (memoryUsage > metrics.memoryPeakUsage) {
               metrics.memoryPeakUsage = memoryUsage;
           }
       }
       
       return metrics;
   }
   
   private identifyIssues(events: TraceEvent[]): TraceIssue[] {
       const issues: TraceIssue[] = [];
       
       // Check for JavaScript errors
       const errorEvents = events.filter(e => 
           e.type === 'error' || 
           (e.type === 'console' && e.data?.level === 'error')
       );
       
       for (const error of errorEvents) {
           issues.push({
               type: 'javascript-error',
               severity: 'error',
               description: error.data?.message || error.data?.text || 'Unknown error',
               timestamp: error.timestamp,
               details: {
                   stack: error.data?.stack,
                   location: error.data?.location
               }
           });
       }
       
       // Check for failed network requests
       const failedRequests = events.filter(e => 
           e.type === 'network' && e.data?.type === 'requestfailed'
       );
       
       for (const failed of failedRequests) {
           issues.push({
               type: 'network-failure',
               severity: 'error',
               description: `Failed to load: ${failed.data?.url}`,
               timestamp: failed.timestamp,
               details: {
                   url: failed.data?.url,
                   failure: failed.data?.failure
               }
           });
       }
       
       // Check for slow network requests (> 3 seconds)
       const networkPairs = this.findNetworkRequestPairs(events);
       
       for (const pair of networkPairs) {
           const duration = new Date(pair.response.timestamp).getTime() - 
                          new Date(pair.request.timestamp).getTime();
           
           if (duration > 3000) {
               issues.push({
                   type: 'slow-network',
                   severity: 'warning',
                   description: `Slow request: ${pair.request.data?.url} (${duration}ms)`,
                   timestamp: pair.request.timestamp,
                   details: {
                       url: pair.request.data?.url,
                       duration,
                       method: pair.request.data?.method
                   }
               });
           }
       }
       
       // Check for console warnings
       const warnings = events.filter(e => 
           e.type === 'console' && e.data?.level === 'warning'
       );
       
       for (const warning of warnings) {
           issues.push({
               type: 'console-warning',
               severity: 'warning',
               description: warning.data?.text || 'Console warning',
               timestamp: warning.timestamp,
               details: {
                   location: warning.data?.location
               }
           });
       }
       
       // Check for memory issues
       const performanceEvents = events.filter(e => e.type === 'performance');
       let previousMemory = 0;
       
       for (const perfEvent of performanceEvents) {
           const currentMemory = perfEvent.data?.memory?.usedJSHeapSize || 0;
           
           // Check for memory leak (continuous growth)
           if (previousMemory > 0 && currentMemory > previousMemory * 1.5) {
               issues.push({
                   type: 'memory-growth',
                   severity: 'warning',
                   description: `Significant memory growth detected: ${this.formatFileSize(currentMemory)}`,
                   timestamp: perfEvent.timestamp,
                   details: {
                       previousMemory,
                       currentMemory,
                       growth: currentMemory - previousMemory
                   }
               });
           }
           
           // Check for high memory usage (> 100MB)
           if (currentMemory > 100 * 1024 * 1024) {
               issues.push({
                   type: 'high-memory',
                   severity: 'warning',
                   description: `High memory usage: ${this.formatFileSize(currentMemory)}`,
                   timestamp: perfEvent.timestamp,
                   details: {
                       memory: currentMemory,
                       heapLimit: perfEvent.data?.memory?.jsHeapSizeLimit
                   }
               });
           }
           
           previousMemory = currentMemory;
       }
       
       // Check for mixed content (HTTPS page loading HTTP resources)
       const pageUrl = events.find(e => e.type === 'pageLoad')?.data?.url;
       if (pageUrl && pageUrl.startsWith('https://')) {
           const httpRequests = events.filter(e => 
               e.type === 'network' && 
               e.data?.type === 'request' &&
               e.data?.url?.startsWith('http://') &&
               !e.data?.url?.startsWith('https://')
           );
           
           for (const request of httpRequests) {
               issues.push({
                   type: 'mixed-content',
                   severity: 'warning',
                   description: `Mixed content: HTTPS page loading HTTP resource`,
                   timestamp: request.timestamp,
                   details: {
                       pageUrl,
                       resourceUrl: request.data?.url
                   }
               });
           }
       }
       
       // Check for blocked by CORS
       const corsErrors = events.filter(e => 
           e.type === 'console' && 
           e.data?.text?.includes('CORS') ||
           e.data?.text?.includes('Cross-Origin')
       );
       
       for (const corsError of corsErrors) {
           issues.push({
               type: 'cors-error',
               severity: 'error',
               description: 'CORS policy blocked resource',
               timestamp: corsError.timestamp,
               details: {
                   message: corsError.data?.text
               }
           });
       }
       
       // Sort issues by timestamp
       issues.sort((a, b) => 
           new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
       );
       
       return issues;
   }
   
   private findNetworkRequestPairs(events: TraceEvent[]): Array<{ request: TraceEvent; response: TraceEvent }> {
       const pairs: Array<{ request: TraceEvent; response: TraceEvent }> = [];
       const requests = events.filter(e => e.type === 'network' && e.data?.type === 'request');
       const responses = events.filter(e => e.type === 'network' && e.data?.type === 'response');
       
       for (const request of requests) {
           const response = responses.find(r => r.data?.url === request.data?.url);
           if (response) {
               pairs.push({ request, response });
           }
       }
       
       return pairs;
   }
   
   private async generateMergedReport(mergedData: any, outputPath: string): Promise<void> {
       const reportPath = outputPath.replace('.json', '-report.html');
       
       const html = `
<!DOCTYPE html>
<html>
<head>
   <title>Merged Trace Report</title>
   <style>
       body { 
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           margin: 40px;
           background: #f5f5f5;
       }
       .header {
           background: #93186C;
           color: white;
           padding: 30px;
           border-radius: 8px;
           margin-bottom: 30px;
       }
       .section {
           background: white;
           padding: 25px;
           margin-bottom: 25px;
           border-radius: 8px;
           box-shadow: 0 2px 10px rgba(0,0,0,0.05);
       }
       .trace-card {
           border: 1px solid #e0e0e0;
           border-radius: 6px;
           padding: 15px;
           margin: 10px 0;
       }
       .metric {
           display: inline-block;
           margin-right: 20px;
       }
       .metric-value {
           font-weight: bold;
           color: #93186C;
       }
   </style>
</head>
<body>
   <div class="header">
       <h1>Merged Trace Report</h1>
       <p>Merged ${mergedData.traces.length} trace files</p>
       <p>Generated: ${mergedData.mergedAt}</p>
   </div>
   
   <div class="section">
       <h2>Combined Metrics</h2>
       <div class="metric">
           <span class="metric-value">${this.formatDuration(mergedData.combinedMetrics.totalDuration)}</span>
           Total Duration
       </div>
       <div class="metric">
           <span class="metric-value">${mergedData.combinedMetrics.totalEvents}</span>
           Total Events
       </div>
       <div class="metric">
           <span class="metric-value">${mergedData.combinedMetrics.totalErrors}</span>
           Total Errors
       </div>
       <div class="metric">
           <span class="metric-value">${mergedData.combinedMetrics.totalNetworkRequests}</span>
           Network Requests
       </div>
   </div>
   
   <div class="section">
       <h2>Individual Traces</h2>
       ${mergedData.traces.map((trace: any, index: number) => `
           <div class="trace-card">
               <h3>Trace ${index + 1}</h3>
               <p><strong>File:</strong> ${path.basename(trace.path)}</p>
               <p><strong>Duration:</strong> ${this.formatDuration(trace.analysis.duration)}</p>
               <p><strong>Events:</strong> ${trace.analysis.summary.totalEvents}</p>
               <p><strong>Errors:</strong> ${trace.analysis.summary.errors}</p>
           </div>
       `).join('')}
   </div>
</body>
</html>`;
       
       await FileUtils.writeFile(reportPath, html);
   }
   
   private async createCheckpoint(session: InternalTraceSession): Promise<string> {
       const checkpointPath = path.join(
           this.tracePath,
           'checkpoints',
           `checkpoint-${session.id}-${Date.now()}.zip`
       );
       
       // Stop tracing temporarily
       await session.context.tracing.stop({ path: checkpointPath });
       
       // Resume tracing immediately
       const startOptions: any = {
           screenshots: session.options.screenshots,
           snapshots: session.options.snapshots,
           sources: session.options.sources
       };
       if (session.options.title !== undefined) {
           startOptions.title = session.options.title;
       }
       await session.context.tracing.start(startOptions);
       
       this.logger.info(`Created trace checkpoint: ${path.basename(checkpointPath)}`);
       
       return checkpointPath;
   }
   
   private async autoSaveActiveTraces(): Promise<void> {
       for (const session of this.activeTraces.values()) {
           if (!session.isPaused) {
               try {
                   await this.createCheckpoint(session);
               } catch (error) {
                   this.logger.error(`Failed to auto-save trace ${session.id}: ${(error as Error).message}`);
               }
           }
       }
   }
   
   private async checkTraceSizeLimits(): Promise<void> {
       const stats = await this.getTraceStatistics();
       
       if (stats.totalSize > this.maxTraceSize * 10) { // 10x max size overall
           this.logger.warn('Trace storage exceeding limits, cleaning old traces');
           await this.cleanOldTraces(3); // Keep only 3 days
       }
   }
   
   private isContextTracing(context: BrowserContext): boolean {
       for (const session of this.activeTraces.values()) {
           if (session.context === context) {
               return true;
           }
       }
       return false;
   }
   
   private getActiveTraceId(context: BrowserContext): string {
       for (const [id, session] of this.activeTraces) {
           if (session.context === context) {
               return id;
           }
       }
       return '';
   }
   
   private getLatestSession(): InternalTraceSession | undefined {
       if (this.activeTraces.size === 0) {
           return undefined;
       }
       
       // Get the most recently started session
       let latest: InternalTraceSession | undefined;
       let latestTime = 0;
       
       for (const session of this.activeTraces.values()) {
           const time = session.startTime.getTime();
           if (time > latestTime) {
               latestTime = time;
               latest = session;
           }
       }
       
       return latest;
   }
   
   private calculateDuration(session: InternalTraceSession): number {
       if (session.duration) {
           return session.duration;
       }
       
       const endTime = session.endTime || new Date();
       const duration = endTime.getTime() - session.startTime.getTime();
       
       // Subtract pause duration if any
       if (session.totalPauseDuration) {
           return duration - session.totalPauseDuration;
       }
       
       return duration;
   }
   
   private generateSessionId(): string {
       return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
   }
   
   private formatDuration(ms: number): string {
       if (ms < 1000) {
           return `${ms}ms`;
       } else if (ms < 60000) {
           return `${(ms / 1000).toFixed(1)}s`;
       } else {
           const minutes = Math.floor(ms / 60000);
           const seconds = Math.floor((ms % 60000) / 1000);
           return `${minutes}m ${seconds}s`;
       }
   }
   
   private formatFileSize(bytes: number): string {
       if (bytes === 0) return '0 Bytes';
       
       const k = 1024;
       const sizes = ['Bytes', 'KB', 'MB', 'GB'];
       const i = Math.floor(Math.log(bytes) / Math.log(k));
       
       return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
   }
   
   private async getFileSize(filePath: string): Promise<string> {
       try {
           const stats = await fs.promises.stat(filePath);
           return this.formatFileSize(stats.size);
       } catch {
           return 'Unknown';
       }
   }
   
   private parseCategories(categories: string): string[] {
       if (!categories) return [];
       
       return categories
           .split(',')
           .map(c => c.trim())
           .filter(c => c && c !== '-default');
   }
   
   /**
    * Cleanup on shutdown
    */
   async cleanup(): Promise<void> {
       try {
           // Stop auto-save interval
           if (this.autoSaveInterval) {
               clearInterval(this.autoSaveInterval);
           }
           
           // Stop all active traces
           const activeIds = Array.from(this.activeTraces.keys());
           for (const id of activeIds) {
               try {
                   await this.stopTracing(id);
               } catch (error) {
                   this.logger.error(`Failed to stop trace ${id} during cleanup: ${(error as Error).message}`);
               }
           }
           
           this.logger.info('TraceRecorder cleanup completed');
           
       } catch (error) {
           this.logger.error(`TraceRecorder cleanup failed: ${(error as Error).message}`);
       }
   }
}

// Export singleton instance
export const traceRecorder = TraceRecorder.getInstance();

// Type definitions for internal use
interface TraceStatistics {
   activeTraces: number;
   totalTraces: number;
   totalSize: number;
   oldestTrace: TraceFileInfo | null;
   newestTrace: TraceFileInfo | null;
   averageTraceSize: number;
   averageTraceDuration: number;
   tracesByDay: Map<string, number>;
}

interface TraceFileInfo {
   path: string;
   name: string;
   size: number;
   created: Date;
   modified: Date;
}

interface EventAnalysis {
   totalEvents: number;
   eventsByType: Map<string, number>;
   eventFrequency: Map<number, number>;
   errorEvents: TraceEvent[];
   warningEvents: TraceEvent[];
   criticalPaths: Array<{ error: TraceEvent; path: TraceEvent[] }>;
}

interface PerformanceMetrics {
   pageLoadTime: number;
   domContentLoaded: number;
   firstPaint: number;
   totalRequests: number;
   failedRequests: number;
   totalBytes: number;
   avgResponseTime: number;
   slowestRequest: { url: string; time: number } | null;
   memoryPeakUsage: number;
}

interface TraceIssue {
   type: string;
   severity: 'error' | 'warning' | 'info';
   description: string;
   timestamp: Date;
   details: any;
}