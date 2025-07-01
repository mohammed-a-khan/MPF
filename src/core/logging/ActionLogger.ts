
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { performance } from 'perf_hooks';
import { LogFormatter } from './LogFormatter';
import { LogCollector } from './LogCollector';
import { consoleCapture, ConsoleMessage } from './ConsoleCapture';
import {
  LogEntry,
  LogLevel,
  LogContext,
  ActionLogEntry,
  NavigationLogEntry,
  ElementLogEntry,
  APILogEntry,
  DatabaseLogEntry,
  ValidationLogEntry,
  ErrorLogEntry,
  PerformanceLogEntry,
  ScreenshotLogEntry,
  NetworkLogEntry,
  ConsoleLogEntry,
  LoggerConfig,
  LogBuffer,
  LogStats,
  CorrelationContext,
  LogFilter,
  LogTransport,
  LogMetadata,
  SanitizationRule,
  LogRotationConfig,
  LogAggregation,
  LogQuery,
  LogIndex as ILogIndex
} from './LogTypes';

const PERFORMANCE_MODE = process.env.PERFORMANCE_MODE !== 'false';

export class ActionLogger extends EventEmitter {
  private static instance: ActionLogger;
  private static processHandlersRegistered: boolean = false;
  private config!: LoggerConfig;
  private formatter: LogFormatter | null = null;
  private collector: LogCollector | null = null;
  private transports: Map<string, LogTransport> = new Map();
  private buffer: LogBuffer;
  private stats: LogStats;
  private correlationStack: CorrelationContext[] = [];
  private currentContext!: LogContext;
  private logIndex!: LogIndex;
  private rotationTimer?: NodeJS.Timeout;
  private flushTimer?: NodeJS.Timeout;
  private sanitizationRules: SanitizationRule[] = [];
  private performanceMarks: Map<string, number> = new Map();
  private sessionId: string;
  private isInitialized: boolean = false;
  private archiveManager: LogArchiveManager | null = null;
  private metricsCollector: MetricsCollector | null = null;

  private constructor() {
    super();
    this.sessionId = this.generateSessionId();
    this.stats = this.initializeStats();
    this.buffer = this.initializeBuffer();
    
    this.config = {
      level: PERFORMANCE_MODE ? LogLevel.WARN : LogLevel.INFO,
      logDirectory: './logs',
      bufferSize: PERFORMANCE_MODE ? 50 : 100,
      flushInterval: PERFORMANCE_MODE ? 10000 : 5000,
      maxBufferSize: PERFORMANCE_MODE ? 1024 * 1024 : 5 * 1024 * 1024,
      indexDirectory: './logs/indexes'
    };
  }

  static getInstance(): ActionLogger {
    if (!ActionLogger.instance) {
      ActionLogger.instance = new ActionLogger();
    }
    return ActionLogger.instance;
  }
  
  private ensureComponentsInitialized(): void {
    if (!this.formatter) {
      this.formatter = new LogFormatter();
      this.collector = new LogCollector();
      this.archiveManager = new LogArchiveManager();
      this.metricsCollector = new MetricsCollector();
      this.setupDefaultSanitizationRules();
    }
  }

  async initialize(config: LoggerConfig): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    if (PERFORMANCE_MODE) {
      this.config = { ...this.config, ...config };
      this.currentContext = this.createDefaultContext();
      this.isInitialized = true;
      return;
    }

    this.ensureComponentsInitialized();

    this.config = this.validateConfig(config);
    this.currentContext = this.createDefaultContext();

    await this.initializeTransports();

    if (this.config.rotation?.enabled) {
      this.setupLogRotation();
    }

    this.setupBufferFlushing();

    await this.initializeLogIndex();

    this.registerProcessHandlers();

    this.isInitialized = true;
  }


  async logAction(action: string, details: any = {}, metadata?: LogMetadata): Promise<void> {
    if (PERFORMANCE_MODE && !this.isCriticalAction(action)) {
      return;
    }

    const verboseDetails = this.createVerboseDescription(action, details);

    const entry: ActionLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.INFO,
      type: 'action',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      action,
      details: this.sanitizeData(verboseDetails),
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.duration !== undefined) {
      entry.duration = metadata.duration;
    }

    await this.writeLog(entry);
    this.updateStats('action');
  }

  async logNavigation(url: string, method: string = 'GET', metadata?: LogMetadata): Promise<void> {
    const startMark = `navigation_${Date.now()}`;
    performance.mark(startMark);

    const entry: NavigationLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.INFO,
      type: 'navigation',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      url: this.sanitizeUrl(url),
      method,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.referrer !== undefined) {
      entry.referrer = metadata.referrer;
    }
    if (metadata?.statusCode !== undefined) {
      entry.statusCode = metadata.statusCode;
    }
    if (metadata?.loadTime !== undefined) {
      entry.loadTime = metadata.loadTime;
    }

    await this.writeLog(entry);
    this.updateStats('navigation');
    
    performance.mark(`${startMark}_end`);
    performance.measure(`Navigation to ${url}`, startMark, `${startMark}_end`);
  }

  async logElementAction(
    elementDescription: string,
    action: string,
    locator: string,
    success: boolean,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: ElementLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: success ? LogLevel.INFO : LogLevel.WARN,
      type: 'element',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      elementDescription,
      action,
      locator: this.sanitizeData(locator),
      success,
      retryCount: metadata?.retryCount || 0,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.duration !== undefined) {
      entry.duration = metadata.duration;
    }
    if (metadata?.screenshot !== undefined) {
      entry.screenshot = metadata.screenshot;
    }
    if (metadata?.error !== undefined) {
      entry.error = this.sanitizeError(metadata.error);
    }

    await this.writeLog(entry);
    this.updateStats('element');

    if (!success) {
      if (this.metricsCollector) {
        this.metricsCollector.recordElementFailure(elementDescription, action);
      }
    }
  }

  async logAPI(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: APILogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO,
      type: 'api',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      method,
      url: this.sanitizeUrl(url),
      statusCode,
      duration,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.requestHeaders !== undefined) {
      entry.requestHeaders = this.sanitizeHeaders(metadata.requestHeaders);
    }
    if (metadata?.responseHeaders !== undefined) {
      entry.responseHeaders = this.sanitizeHeaders(metadata.responseHeaders);
    }
    if (metadata?.requestBody !== undefined) {
      entry.requestBody = this.sanitizeData(metadata.requestBody);
    }
    if (metadata?.responseBody !== undefined) {
      entry.responseBody = this.sanitizeData(metadata.responseBody);
    }
    if (metadata?.error !== undefined) {
      entry.error = this.sanitizeError(metadata.error);
    }

    await this.writeLog(entry);
    this.updateStats('api');
    
    if (this.metricsCollector) {
      this.metricsCollector.recordAPICall(method, url, statusCode, duration);
    }
  }

  async logVerification(
    description: string,
    expected: any,
    actual: any,
    passed: boolean,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: ActionLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: passed ? LogLevel.INFO : LogLevel.WARN,
      type: 'action',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      action: passed ? 'Verification Passed' : 'Verification Failed',
      details: {
        description,
        expected,
        actual,
        passed,
        comparison: `Expected: ${expected}, Actual: ${actual}`
      },
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    await this.writeLog(entry);
    this.updateStats('verification');
  }

  async logAPIRequest(
    requestId: string,
    requestOptions: any,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: APILogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.INFO,
      type: 'api',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      method: requestOptions.method || 'GET',
      url: this.sanitizeUrl(requestOptions.url || requestOptions.uri || 'unknown'),
      statusCode: 0,
      duration: 0,
      metadata: this.enrichMetadata({ 
        ...metadata, 
        requestId,
        phase: 'request',
        requestHeaders: this.sanitizeHeaders(requestOptions.headers || {}),
        requestBody: this.sanitizeData(requestOptions.body)
      }),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    await this.writeLog(entry);
    this.updateStats('api');
  }

  async logAPIResponse(
    requestId: string,
    response: any,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: APILogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: response.statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO,
      type: 'api',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      method: response.method || 'GET',
      url: this.sanitizeUrl(response.url || 'unknown'),
      statusCode: response.statusCode || 0,
      duration: metadata?.duration || 0,
      metadata: this.enrichMetadata({ 
        ...metadata, 
        requestId,
        phase: 'response',
        responseHeaders: this.sanitizeHeaders(response.headers || {}),
        responseBody: this.sanitizeData(response.body),
        success: response.statusCode < 400
      }),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    await this.writeLog(entry);
    this.updateStats('api');
    
    if (this.metricsCollector) {
      this.metricsCollector.recordAPICall(
        response.method || 'GET', 
        response.url || 'unknown', 
        response.statusCode || 0, 
        metadata?.duration || 0
      );
    }
  }

  async logAPIError(
    requestId: string,
    error: Error,
    duration?: number,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: ErrorLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.ERROR,
      type: 'error',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      error: this.sanitizeError(error),
      metadata: this.enrichMetadata({ 
        ...metadata, 
        requestId,
        phase: 'error',
        duration: duration || 0,
        errorType: 'api_error'
      }),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (error.stack) {
      entry.stackTrace = this.sanitizeStackTrace(error.stack);
    }

    await this.writeLog(entry);
    this.updateStats('error');
    
    if (this.metricsCollector) {
      this.metricsCollector.recordError(error.name || 'APIError');
    }
    
    this.emit('error', entry);
  }

  async logDatabase(
    operation: string,
    query: string,
    duration: number,
    rowCount?: number,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: DatabaseLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.INFO,
      type: 'database',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      operation,
      query: this.sanitizeQuery(query),
      duration,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (rowCount !== undefined) {
      entry.rowCount = rowCount;
    }
    if (metadata?.database !== undefined) {
      entry.database = metadata.database;
    }
    if (metadata?.error !== undefined) {
      entry.error = this.sanitizeError(metadata.error);
    }

    await this.writeLog(entry);
    this.updateStats('database');
    
    if (this.metricsCollector) {
      this.metricsCollector.recordDatabaseQuery(operation, duration, rowCount || 0);
    }
  }

  async logValidation(
    type: string,
    expected: any,
    actual: any,
    passed: boolean,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: ValidationLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: passed ? LogLevel.INFO : LogLevel.WARN,
      type: 'validation',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      validationType: type,
      expected: this.sanitizeData(expected),
      actual: this.sanitizeData(actual),
      passed,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.message !== undefined) {
      entry.message = metadata.message;
    }
    if (metadata?.screenshot !== undefined) {
      entry.screenshot = metadata.screenshot;
    }

    await this.writeLog(entry);
    this.updateStats('validation');
    
    if (!passed) {
      if (this.metricsCollector) {
        this.metricsCollector.recordValidationFailure(type);
      }
    }
  }

    async logError(error: Error | string, context?: any, metadata?: LogMetadata): Promise<void> {
    try {
      const entry: ErrorLogEntry = {
        id: this.generateLogId(),
        timestamp: new Date(),
        level: LogLevel.ERROR,
        type: 'error',
        correlationId: this.getCurrentCorrelationId(),
        sessionId: this.sessionId,
        context: { ...this.currentContext },
        error: typeof error === 'string' ? { message: error } : this.sanitizeError(error),
        metadata: this.enrichMetadata(metadata),
        threadId: this.getThreadId(),
        processId: process.pid,
        hostname: os.hostname()
      };

      if (context !== undefined) {
        entry.errorContext = this.sanitizeData(context);
      }
      if (error instanceof Error && error.stack !== undefined) {
        entry.stackTrace = this.sanitizeStackTrace(error.stack);
      }
      if (metadata?.screenshot !== undefined) {
        entry.screenshot = metadata.screenshot;
      }

      await this.writeLog(entry);
      this.updateStats('error');
      
      if (this.metricsCollector) {
        this.metricsCollector.recordError(error instanceof Error ? error.name : 'UnknownError');
      }
      
      try {
        this.emit('error', entry);
      } catch (emitError) {
        console.error('Failed to emit error event:', emitError);
      }
    } catch (logError) {
      console.error('ActionLogger.logError failed:', logError);
      console.error('Original error:', error);
    }
  }

  async logPerformance(
    metric: string,
    value: number,
    unit: string = 'ms',
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: PerformanceLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      type: 'performance',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      metric,
      value,
      unit,
      exceeded: metadata?.threshold ? value > metadata.threshold : false,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.threshold !== undefined) {
      entry.threshold = metadata.threshold;
    }

    await this.writeLog(entry);
    this.updateStats('performance');
    
    if (this.metricsCollector) {
      this.metricsCollector.recordPerformanceMetric(metric, value);
    }
  }

  async logScreenshot(
    filename: string,
    purpose: string,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: ScreenshotLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      type: 'screenshot',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      filename,
      purpose,
      format: metadata?.format || 'png',
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.size !== undefined) {
      entry.size = metadata.size;
    }

    await this.writeLog(entry);
    this.updateStats('screenshot');
  }

  async logNetwork(
    request: any,
    response: any,
    duration: number,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: NetworkLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      type: 'network',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      request: this.sanitizeNetworkData(request),
      response: this.sanitizeNetworkData(response),
      duration,
      cached: metadata?.cached || false,
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.size !== undefined) {
      entry.size = metadata.size;
    }

    await this.writeLog(entry);
    this.updateStats('network');
  }

  async logBrowserConsole(
    consoleType: string,
    message: string,
    metadata?: LogMetadata
  ): Promise<void> {
    const entry: ConsoleLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level: this.mapConsoleTypeToLogLevel(consoleType),
      type: 'console',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      consoleType,
      message: this.sanitizeData(message),
      metadata: this.enrichMetadata(metadata),
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    if (metadata?.url !== undefined) {
      entry.url = metadata.url;
    }
    if (metadata?.lineNumber !== undefined) {
      entry.lineNumber = metadata.lineNumber;
    }
    if (metadata?.columnNumber !== undefined) {
      entry.columnNumber = metadata.columnNumber;
    }

    await this.writeLog(entry);
    this.updateStats('console');
  }


  pushCorrelationContext(correlationId: string, metadata?: any): void {
    const context: CorrelationContext = {
      correlationId,
      startTime: Date.now(),
      metadata: metadata || {},
      parentId: this.getCurrentCorrelationId()
    };
    
    this.correlationStack.push(context);
    this.debug(`Pushed correlation context: ${correlationId}`, { stack: this.correlationStack.length });
  }

  popCorrelationContext(): CorrelationContext | undefined {
    const context = this.correlationStack.pop();
    if (context) {
      const duration = Date.now() - context.startTime;
      this.debug(`Popped correlation context: ${context.correlationId}`, { duration });
      
      this.logCorrelationSummary(context, duration);
    }
    return context;
  }

  setContext(key: string, value: any): void {
    this.currentContext[key] = value;
    this.debug(`Context updated: ${key}`, { value: this.sanitizeData(value) });
  }

  clearContext(): void {
    const keys = Object.keys(this.currentContext);
    this.currentContext = this.createDefaultContext();
    this.debug('Context cleared', { clearedKeys: keys });
  }


  startPerformanceMark(name: string): void {
    const markName = `${name}_${Date.now()}`;
    performance.mark(markName);
    this.performanceMarks.set(name, performance.now());
    this.debug(`Performance mark started: ${name}`);
  }

  endPerformanceMark(name: string, metadata?: LogMetadata): number {
    const startTime = this.performanceMarks.get(name);
    if (!startTime) {
      this.warn(`No start mark found for: ${name}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.performanceMarks.delete(name);
    
    this.logPerformance(name, duration, 'ms', metadata);
    
    return duration;
  }


  async query(query: LogQuery): Promise<LogEntry[]> {
    return this.collector ? this.collector.query(query) : [];
  }

  async aggregate(aggregation: LogAggregation): Promise<any> {
    return this.collector ? this.collector.aggregate(aggregation) : null;
  }

  async getStats(): Promise<LogStats> {
    let indexSize = 0;
    if (this.logIndex) {
      try {
        indexSize = await this.logIndex.getSize();
      } catch (error) {
      }
    }
    
    return {
      ...this.stats,
      bufferUtilization: this.buffer.entries.length / (this.config?.bufferSize || 100),
      indexSize,
      transportStats: await this.getTransportStats()
    };
  }

  getCurrentLogIndex(): number {
    return this.buffer.entries.length;
  }

  getLogsInRange(startIndex: number, endIndex: number): LogEntry[] {
    const start = Math.max(0, startIndex);
    const end = Math.min(this.buffer.entries.length, endIndex);
    
    if (start >= end) {
      return [];
    }
    
    return this.buffer.entries.slice(start, end);
  }

  async generateReport(startTime?: Date, endTime?: Date): Promise<LogReport> {
    const timeRange = {
      start: startTime || new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: endTime || new Date()
    };

    const entries = await this.query({
      timeRange,
      sessionId: this.sessionId
    });

    return {
      sessionId: this.sessionId,
      timeRange,
      totalEntries: entries.length,
      byLevel: this.groupByLevel(entries),
      byType: this.groupByType(entries),
      errors: entries.filter(e => e.level === LogLevel.ERROR),
      performance: await this.analyzePerformance(entries),
      apiCalls: await this.analyzeAPICalls(entries),
      elementActions: await this.analyzeElementActions(entries),
      validations: await this.analyzeValidations(entries)
    };
  }


  trace(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.writeBasicLog(LogLevel.TRACE, message, context);
    }
  }

  debug(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.writeBasicLog(LogLevel.DEBUG, message, context);
    }
  }

  info(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.writeBasicLog(LogLevel.INFO, message, context);
    }
  }

  warn(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.writeBasicLog(LogLevel.WARN, message, context);
    }
  }

  error(message: string, error?: Error | any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.logError(error || message, typeof error === 'object' ? undefined : error);
    }
  }

  fatal(message: string, error?: Error): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      this.writeBasicLog(LogLevel.FATAL, message, { error: this.sanitizeError(error) });
      this.flush();
    }
  }


  private async writeLog(entry: LogEntry): Promise<void> {
    this.buffer.entries.push(entry);
    this.buffer.size += this.estimateEntrySize(entry);
    if ('lastUpdated' in this.buffer) {
      (this.buffer as any).lastUpdated = new Date();
    }

    if (PERFORMANCE_MODE) {
      if (this.buffer.entries.length >= this.config.bufferSize) {
        await this.flush();
      }
    } else {
      if (this.shouldFlushBuffer()) {
        await this.flush();
      }
    }

    if (this.logIndex) {
      await this.logIndex.index(entry);
    }

    if (!PERFORMANCE_MODE) {
      this.emit('log', entry);
    }
  }

  private async writeBasicLog(level: LogLevel, message: string, context?: any): Promise<void> {
    const entry: LogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level,
      type: 'general',
      correlationId: this.getCurrentCorrelationId(),
      sessionId: this.sessionId,
      context: { ...this.currentContext },
      message,
      data: context ? this.sanitizeData(context) : undefined,
      threadId: this.getThreadId(),
      processId: process.pid,
      hostname: os.hostname()
    };

    await this.writeLog(entry);
  }

  private async flush(): Promise<void> {
    if (this.buffer.entries.length === 0) {
      return;
    }

    const entriesToFlush = [...this.buffer.entries];
    this.buffer.entries = [];
    this.buffer.size = 0;

    const promises = Array.from(this.transports.values()).map(transport =>
      this.writeToTransport(transport, entriesToFlush)
    );

    try {
      await Promise.all(promises);
      this.stats.flushedCount += entriesToFlush.length;
    } catch (error) {
      this.handleFlushError(error, entriesToFlush);
    }
  }

  private async writeToTransport(transport: LogTransport, entries: LogEntry[]): Promise<void> {
    try {
      const formattedEntries = entries.map(entry => 
        this.formatter ? this.formatter.format(entry, transport.format) : JSON.stringify(entry)
      );

      await transport.write(formattedEntries);
      transport.stats.written += entries.length;
    } catch (error) {
      transport.stats.errors++;
      transport.stats.lastError = error;
      
      if (transport.config.retryOnError) {
        await this.retryTransportWrite(transport, entries, error);
      }
    }
  }

  private async retryTransportWrite(
    transport: LogTransport,
    entries: LogEntry[],
    originalError: any
  ): Promise<void> {
    const maxRetries = transport.config.maxRetries || 3;
    let lastError = originalError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.delay(Math.pow(2, attempt) * 1000);
        await this.writeToTransport(transport, entries);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    this.handleTransportFailure(transport, entries, lastError);
  }

  private handleTransportFailure(transport: LogTransport, entries: LogEntry[], error: any): void {
    const fallbackPath = path.join(this.config.fallbackDirectory || './logs/fallback', `failed_${Date.now()}.log`);
    
    try {
      const data = entries.map(e => JSON.stringify(e)).join('\n');
      fs.writeFileSync(fallbackPath, data);
      
      this.emit('transportFailure', {
        transport: transport.name,
        entriesCount: entries.length,
        fallbackPath,
        error
      });
    } catch (fallbackError) {
      this.emit('criticalError', {
        message: 'Failed to write logs to fallback',
        transport: transport.name,
        originalError: error,
        fallbackError
      });
    }
  }

  private setupBufferFlushing(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.entries.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval || 5000);
  }

  private setupLogRotation(): void {
    const rotationConfig = this.config.rotation!;
    
    const checkRotation = () => {
      this.transports.forEach((transport, name) => {
        if (transport.type === 'file' && this.shouldRotate(transport)) {
          this.rotateTransport(transport, name);
        }
      });
    };

    checkRotation();

    this.rotationTimer = setInterval(checkRotation, rotationConfig.checkInterval || 60000);
  }

  private shouldRotate(transport: LogTransport): boolean {
    const config = this.config.rotation!;
    
    if (config.maxSize && transport.stats.size > config.maxSize) {
      return true;
    }

    if (config.maxAge && transport.stats.created) {
      const age = Date.now() - transport.stats.created.getTime();
      if (age > config.maxAge) {
        return true;
      }
    }

    return false;
  }

  private async rotateTransport(transport: LogTransport, name: string): Promise<void> {
    try {
      await this.flush();

      await transport.close();

      const archivePath = this.archiveManager ? await this.archiveManager.archive(transport.config.path!) : null;

      const newTransport = await this.createTransport(name, transport.config);
      this.transports.set(name, newTransport);

      this.info('Log rotation completed', {
        transport: name,
        archivePath,
        oldSize: transport.stats.size
      });

      if (this.archiveManager) {
        await this.archiveManager.cleanup(this.config.rotation!);
      }
    } catch (error) {
      this.error('Log rotation failed', error);
    }
  }

  private createVerboseDescription(action: string, details: any): any {
    const enhancedDetails = { ...details };
    
    switch (action.toLowerCase()) {
      case 'click':
      case 'element_action':
        if (details.element || details.description) {
          enhancedDetails.verboseDescription = `User clicked on "${details.element || details.description}"`;
          if (details.options?.position) {
            enhancedDetails.verboseDescription += ` at position (${details.options.position.x}, ${details.options.position.y})`;
          }
        }
        break;
      
      case 'fill':
      case 'type':
        if (details.element || details.description) {
          enhancedDetails.verboseDescription = `User entered text into "${details.element || details.description}" field`;
          if (details.value && typeof details.value === 'string') {
            const maskedValue = this.maskSensitiveValue(details.value, details.element || details.description || '');
            enhancedDetails.verboseDescription += ` with value "${maskedValue}"`;
          }
        }
        break;
      
      case 'navigation':
      case 'navigate':
        enhancedDetails.verboseDescription = `Navigating to ${details.url || details.description || 'page'}`;
        break;
      
      case 'wait':
        enhancedDetails.verboseDescription = `Waiting for ${details.description || 'element'} to be ${details.state || 'ready'}`;
        break;
      
      case 'validation':
      case 'assert':
        enhancedDetails.verboseDescription = `Validating that ${details.description || 'condition'} ${details.passed ? 'passed' : 'failed'}`;
        break;
      
      default:
        if (details.description) {
          enhancedDetails.verboseDescription = details.description;
        }
    }
    
    return enhancedDetails;
  }

  private maskSensitiveValue(value: string, fieldName: string): string {
    const sensitiveFields = [
      /password/i,
      /pwd/i,
      /pass/i,
      /secret/i,
      /token/i,
      /api[_-]?key/i,
      /auth/i,
      /pin/i,
      /ssn/i,
      /social/i,
      /credit[_-]?card/i,
      /cvv/i,
      /account/i
    ];
    
    const isSensitive = sensitiveFields.some(pattern => pattern.test(fieldName));
    
    if (isSensitive) {
      return '*'.repeat(value.length || 8);
    }
    
    return value;
  }

  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    const seen = new WeakSet();

    const sensitivePatterns = [
      /password/i,
      /pwd/i,
      /pass/i,
      /token/i,
      /secret/i,
      /api[_-]?key/i,
      /auth/i,
      /credential/i,
      /pin/i,
      /ssn/i,
      /social/i,
      /credit[_-]?card/i,
      /cvv/i,
      /account[_-]?number/i
    ];

    const sanitize = (obj: any, path: string = ''): any => {
      if (obj === null || obj === undefined) {
        return obj;
      }

      if (typeof obj !== 'object') {
        return obj;
      }

      if (seen.has(obj)) {
        return '[Circular Reference]';
      }
      seen.add(obj);

      if (Array.isArray(obj)) {
        return obj.map((item, index) => sanitize(item, `${path}[${index}]`));
      }

      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
        
        if (isSensitive) {
          if (typeof value === 'string') {
            sanitized[key] = '*'.repeat(value.length || 8);
          } else if (typeof value === 'number') {
            sanitized[key] = '*'.repeat(value.toString().length);
          } else {
            sanitized[key] = '********';
          }
        } else if (this.shouldApplyCustomSanitization(currentPath)) {
          sanitized[key] = this.applyCustomSanitization(currentPath, value);
        } else if (typeof value === 'object') {
          sanitized[key] = sanitize(value, currentPath);
        } else {
          sanitized[key] = value;
        }
      }

      return sanitized;
    };

    return sanitize(data);
  }

  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      const params = new URLSearchParams(urlObj.search);
      const sensitiveParams = ['token', 'apikey', 'api_key', 'access_token', 'auth'];
      
      sensitiveParams.forEach(param => {
        if (params.has(param)) {
          params.set(param, '[REDACTED]');
        }
      });
      
      urlObj.search = params.toString();
      
      if (urlObj.username || urlObj.password) {
        urlObj.username = '[REDACTED]';
        urlObj.password = '[REDACTED]';
      }
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = [
      'authorization',
      'x-api-key',
      'x-auth-token',
      'cookie',
      'set-cookie'
    ];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private sanitizeQuery(query: string): string {
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password='[REDACTED]'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='[REDACTED]'")
      .replace(/api_key\s*=\s*'[^']*'/gi, "api_key='[REDACTED]'");
  }

  private sanitizeError(error: any): any {
    if (!error) return error;

    const sanitized: any = {
      name: error.name || 'UnknownError',
      message: this.sanitizeData(error.message) || 'Unknown error occurred'
    };

    if (error.code) sanitized.code = error.code;
    if (error.statusCode) sanitized.statusCode = error.statusCode;
    
    if (error.stack) {
      sanitized.stack = this.sanitizeStackTrace(error.stack);
    }

    const ignoredProps = ['name', 'message', 'stack', 'code', 'statusCode'];
    for (const [key, value] of Object.entries(error)) {
      if (!ignoredProps.includes(key)) {
        sanitized[key] = this.sanitizeData(value);
      }
    }

    return sanitized;
  }

  private sanitizeStackTrace(stack?: string): string {
    if (!stack) return '';

    return stack
      .replace(/\/home\/[^/]+/g, '/home/[USER]')
      .replace(/\/Users\/[^/]+/g, '/Users/[USER]')
      .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[USER]');
  }

  private sanitizeNetworkData(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };
    
    if (sanitized.headers) {
      sanitized.headers = this.sanitizeHeaders(sanitized.headers);
    }
    
    if (sanitized.body) {
      sanitized.body = this.sanitizeData(sanitized.body);
    }
    
    if (sanitized.url) {
      sanitized.url = this.sanitizeUrl(sanitized.url);
    }

    return sanitized;
  }

  private generateLogId(): string {
    return `${this.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentCorrelationId(): string {
    if (this.correlationStack.length > 0) {
      const lastContext = this.correlationStack[this.correlationStack.length - 1];
      return lastContext ? lastContext.correlationId : 'root';
    }
    return 'root';
  }

  private getThreadId(): string {
    try {
      const { threadId } = require('worker_threads');
      return threadId.toString();
    } catch {
      return '0';
    }
  }

  private createDefaultContext(): LogContext {
    return {
      environment: process.env['NODE_ENV'] || 'development',
      version: process.env['APP_VERSION'] || '1.0.0',
      service: 'cs-test-automation'
    };
  }

  private enrichMetadata(metadata?: LogMetadata): LogMetadata {
    return {
      ...metadata,
      timestamp: Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.DateTimeFormat().resolvedOptions().locale
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config) {
      return true;
    }
    return this.getLogLevelValue(level) >= this.getLogLevelValue(this.config.level);
  }

  private getLogLevelValue(level: LogLevel): number {
    const levels = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 1,
      [LogLevel.INFO]: 2,
      [LogLevel.WARN]: 3,
      [LogLevel.ERROR]: 4,
      [LogLevel.FATAL]: 5
    };
    return levels[level] || 0;
  }

  private mapConsoleTypeToLogLevel(consoleType: string): LogLevel {
    const mapping: Record<string, LogLevel> = {
      'error': LogLevel.ERROR,
      'warn': LogLevel.WARN,
      'info': LogLevel.INFO,
      'log': LogLevel.DEBUG,
      'debug': LogLevel.DEBUG,
      'trace': LogLevel.TRACE
    };
    return mapping[consoleType.toLowerCase()] || LogLevel.DEBUG;
  }

  private shouldWriteLog(entry: LogEntry): boolean {
    if (this.config?.filters) {
      return this.config.filters.every(filter => this.applyFilter(filter, entry));
    }
    return true;
  }

  private applyFilter(filter: LogFilter, entry: LogEntry): boolean {
    if (filter.type === 'level' && entry.level) {
      return this.getLogLevelValue(entry.level) >= this.getLogLevelValue(filter.value as LogLevel);
    }
    
    if (filter.type === 'type' && entry.type) {
      return entry.type === filter.value;
    }
    
    if (filter.type === 'pattern' && filter.pattern) {
      const regex = new RegExp(filter.pattern);
      return regex.test(JSON.stringify(entry));
    }
    
    if (filter.type === 'custom' && filter.predicate) {
      return filter.predicate(entry);
    }

    return true;
  }

  private shouldFlushBuffer(): boolean {
    return (
      this.buffer.entries.length >= (this.config?.bufferSize || 100) ||
      this.buffer.size >= (this.config?.maxBufferSize || 10 * 1024 * 1024)
    );
  }

  private estimateEntrySize(entry: LogEntry): number {
    return JSON.stringify(entry).length;
  }

  private async initializeTransports(): Promise<void> {
    const transportConfigs = this.config?.transports || [
      { name: 'console', type: 'console', level: this.config?.level || LogLevel.INFO },
      { 
        name: 'file', 
        type: 'file', 
        level: this.config?.level || LogLevel.INFO,
        path: path.join(this.config?.logDirectory || './logs', `${this.sessionId}.log`)
      }
    ];

    for (const config of transportConfigs) {
      try {
        const transport = await this.createTransport(config.name, config);
        this.transports.set(config.name, transport);
      } catch (error) {
        console.error(`Failed to initialize transport ${config.name}:`, error);
      }
    }
  }

  private async createTransport(name: string, config: any): Promise<LogTransport> {
    switch (config.type) {
      case 'console':
        return this.createConsoleTransport(name, config);
      
      case 'file':
        return this.createFileTransport(name, config);
      
      case 'http':
        return this.createHttpTransport(name, config);
      
      case 'syslog':
        return this.createSyslogTransport(name, config);
      
      default:
        throw new Error(`Unknown transport type: ${config.type}`);
    }
  }

  private createConsoleTransport(name: string, config: any): LogTransport {
    return {
      name,
      type: 'console',
      config,
      format: config.format || 'pretty',
      stats: {
        written: 0,
        errors: 0,
        size: 0
      },
      write: async (entries: string[]) => {
        entries.forEach(entry => console.log(entry));
      },
      close: async () => {}
    };
  }

  private createFileTransport(name: string, config: any): LogTransport {
    const dir = path.dirname(config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(config.path, { flags: 'a' });
    
    return {
      name,
      type: 'file',
      config,
      format: config.format || 'json',
      stats: {
        written: 0,
        errors: 0,
        size: 0,
        created: new Date()
      },
      write: async (entries: string[]) => {
        return new Promise((resolve, reject) => {
          const data = entries.join('\n') + '\n';
          stream.write(data, (error: any) => {
            if (error) reject(error);
            else resolve();
          });
        });
      },
      close: async () => {
        return new Promise((resolve) => {
          stream.end(resolve);
        });
      }
    };
  }

  private createHttpTransport(name: string, config: any): LogTransport {
    const http = config.url.startsWith('https') ? require('https') : require('http');
    
    return {
      name,
      type: 'http',
      config,
      format: 'json',
      stats: {
        written: 0,
        errors: 0,
        size: 0
      },
      write: async (entries: string[]) => {
        const data = JSON.stringify({ entries: entries.map(e => JSON.parse(e)) });
        const options = {
          ...config.options,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...config.headers
          }
        };

        return new Promise((resolve, reject) => {
          const req = http.request(config.url, options, (res: any) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });

          req.on('error', reject);
          req.write(data);
          req.end();
        });
      },
      close: async () => {}
    };
  }

  private createSyslogTransport(name: string, config: any): LogTransport {
    const dgram = require('dgram');
    const client = dgram.createSocket('udp4');
    
    return {
      name,
      type: 'syslog',
      config,
      format: 'syslog',
      stats: {
        written: 0,
        errors: 0,
        size: 0
      },
      write: async (entries: string[]) => {
        const promises = entries.map(entry => {
          return new Promise((resolve, reject) => {
            const message = Buffer.from(entry);
            client.send(message, config.port || 514, config.host || 'localhost', (err: any) => {
              if (err) reject(err);
              else resolve(undefined);
            });
          });
        });
        await Promise.all(promises);
      },
      close: async () => {
        return new Promise((resolve) => {
          client.close(resolve);
        });
      }
    };
  }

  private async initializeLogIndex(): Promise<void> {
    this.logIndex = new LogIndex(this.config.indexDirectory || './logs/index');
    await this.logIndex.initialize();
  }

  private registerProcessHandlers(): void {
    if (ActionLogger.processHandlersRegistered) {
      return;
    }
    
    ActionLogger.processHandlersRegistered = true;
    
    process.on('exit', () => {
      const instance = ActionLogger.instance;
      if (instance) {
        instance.flush();
        instance.close();
      }
    });

    process.on('SIGINT', () => {
      const instance = ActionLogger.instance;
      if (instance) {
        instance.info('Received SIGINT, shutting down...');
        instance.flush();
        instance.close();
      }
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      const instance = ActionLogger.instance;
      if (instance) {
        instance.fatal('Uncaught exception', error);
        instance.flush();
      }
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const instance = ActionLogger.instance;
      if (instance) {
        try {
          instance.error('Unhandled promise rejection', { reason, promise });
        } catch (logError) {
          console.error('Failed to log unhandled rejection:', logError);
        }
      }
    });
  }

  private validateConfig(config: LoggerConfig): LoggerConfig {
    return {
      ...config,
      level: config.level || LogLevel.INFO,
      bufferSize: config.bufferSize || 1000,
      flushInterval: config.flushInterval || 5000,
      logDirectory: config.logDirectory || './logs',
      fallbackDirectory: config.fallbackDirectory || './logs/fallback'
    };
  }

  private initializeStats(): LogStats {
    return {
      totalLogged: 0,
      byLevel: {
        [LogLevel.TRACE]: 0,
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0,
        [LogLevel.FATAL]: 0
      },
      byType: {},
      errors: 0,
      dropped: 0,
      flushedCount: 0,
      startTime: new Date()
    };
  }

  private initializeBuffer(): LogBuffer {
    return {
      entries: [],
      size: 0,
      created: new Date()
    };
  }

  private updateStats(type: string): void {
    this.stats.totalLogged++;
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
  }

  private async getTransportStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    
    Array.from(this.transports.entries()).forEach(([name, transport]) => {
      stats[name] = { ...transport.stats };
    });
    
    return stats;
  }

  private setupDefaultSanitizationRules(): void {
    this.sanitizationRules = [
      {
        pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        replacement: '[CREDIT_CARD]'
      },
      {
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        replacement: '[SSN]'
      },
      {
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[EMAIL]'
      }
    ];
  }

  private shouldApplyCustomSanitization(path: string): boolean {
    return this.sanitizationRules.some(rule => rule.path === path);
  }

  private applyCustomSanitization(path: string, value: any): any {
    const rule = this.sanitizationRules.find(r => r.path === path);
    if (!rule || typeof value !== 'string') return value;
    
    return value.replace(rule.pattern, rule.replacement);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isCriticalAction(action: string): boolean {
    const criticalActions = [
      'login', 'error', 'failure', 'crash', 'timeout', 'authentication', 'authorization',
      'navigate', 'navigation', 'page', 'goto', 'visit',
      'click', 'fill', 'type', 'enter', 'select', 'press', 'tap',
      'verify', 'validate', 'check', 'assert', 'expect',
      'wait', 'delay', 'pause',
      'submit', 'upload', 'download',
      'element', 'locator', 'find',
      'performance', 'metrics', 'measure',
      'initialize', 'setup', 'start', 'begin',
      'complete', 'finish', 'end', 'done',
      'api', 'http', 'request', 'response', 'certificate', 'status', 'json', 'body',
      'context', 'base url', 'timeout', 'logging', 'path', 'validation', 'ready'
    ];
    return criticalActions.some(critical => action.toLowerCase().includes(critical));
  }

  private handleFlushError(error: any, entries: LogEntry[]): void {
    this.stats.errors++;
    
    try {
      const fallbackPath = path.join(
        this.config.fallbackDirectory || './logs/fallback',
        `flush_error_${Date.now()}.log`
      );
      
      fs.writeFileSync(
        fallbackPath,
        entries.map(e => JSON.stringify(e)).join('\n')
      );
      
      this.emit('flushError', { error, entriesCount: entries.length, fallbackPath });
    } catch (fallbackError) {
      this.emit('dataLoss', {
        error,
        fallbackError,
        entriesCount: entries.length
      });
    }
  }

  private async logCorrelationSummary(context: CorrelationContext, duration: number): Promise<void> {
    const summary = this.collector ? await this.collector.getCorrelationSummary(context.correlationId) : null;
    
    this.debug('Correlation completed', {
      correlationId: context.correlationId,
      duration,
      summary
    });
  }

  private groupByLevel(entries: LogEntry[]): Record<LogLevel, number> {
    const grouped: Record<LogLevel, number> = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.FATAL]: 0
    };

    entries.forEach(entry => {
      if (entry.level) {
        grouped[entry.level]++;
      }
    });

    return grouped;
  }

  private groupByType(entries: LogEntry[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    entries.forEach(entry => {
      grouped[entry.type] = (grouped[entry.type] || 0) + 1;
    });
    
    return grouped;
  }

  private async analyzePerformance(entries: LogEntry[]): Promise<any> {
    const perfEntries = entries.filter(e => e.type === 'performance') as PerformanceLogEntry[];
    
    const metrics: Record<string, any> = {};
    
    perfEntries.forEach(entry => {
      if (!metrics[entry.metric]) {
        metrics[entry.metric] = {
          count: 0,
          total: 0,
          min: Infinity,
          max: -Infinity,
          values: []
        };
      }
      
      const metric = metrics[entry.metric];
      metric.count++;
      metric.total += entry.value;
      metric.min = Math.min(metric.min, entry.value);
      metric.max = Math.max(metric.max, entry.value);
      metric.values.push(entry.value);
    });
    
    Object.keys(metrics).forEach(key => {
      const metric = metrics[key];
      metric.average = metric.total / metric.count;
      metric.median = this.calculateMedian(metric.values);
      const values = metric.values;
      if (values && values.length > 0) {
        metric.p95 = this.calculatePercentile(values, 95);
        metric.p99 = this.calculatePercentile(values, 99);
      }
      delete metric.values;
    });
    
    return metrics;
  }

  private async analyzeAPICalls(entries: LogEntry[]): Promise<any> {
    const apiEntries = entries.filter(e => e.type === 'api') as APILogEntry[];
    
    return {
      total: apiEntries.length,
      byMethod: this.groupBy(apiEntries, 'method'),
      byStatusCode: this.groupBy(apiEntries, 'statusCode'),
      averageDuration: this.calculateAverage(apiEntries.map(e => e.duration)),
      slowest: apiEntries
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
        .map(e => ({
          url: e.url,
          method: e.method,
          duration: e.duration,
          timestamp: e.timestamp
        }))
    };
  }

  private async analyzeElementActions(entries: LogEntry[]): Promise<any> {
    const elementEntries = entries.filter(e => e.type === 'element') as ElementLogEntry[];
    
    return {
      total: elementEntries.length,
      byAction: this.groupBy(elementEntries, 'action'),
      successRate: this.calculateSuccessRate(elementEntries),
      failures: elementEntries
        .filter(e => !e.success)
        .map(e => ({
          element: e.elementDescription,
          action: e.action,
          error: e.error,
          timestamp: e.timestamp
        })),
      slowest: elementEntries
        .filter(e => e.duration)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 10)
    };
  }

  private async analyzeValidations(entries: LogEntry[]): Promise<any> {
    const validationEntries = entries.filter(e => e.type === 'validation') as ValidationLogEntry[];
    
    return {
      total: validationEntries.length,
      passed: validationEntries.filter(e => e.passed).length,
      failed: validationEntries.filter(e => !e.passed).length,
      byType: this.groupBy(validationEntries, 'validationType'),
      failures: validationEntries
        .filter(e => !e.passed)
        .map(e => ({
          type: e.validationType,
          expected: e.expected,
          actual: e.actual,
          message: e.message,
          timestamp: e.timestamp
        }))
    };
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2
      : (sorted[mid] || 0);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)] || 0;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateSuccessRate(entries: ElementLogEntry[]): number {
    if (entries.length === 0) return 100;
    const successful = entries.filter(e => e.success).length;
    return (successful / entries.length) * 100;
  }

  private groupBy<T>(items: T[], key: keyof T): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    items.forEach(item => {
      const value = String(item[key]);
      grouped[value] = (grouped[value] || 0) + 1;
    });
    
    return grouped;
  }

  async close(): Promise<void> {
    await this.flush();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    const closePromises = Array.from(this.transports.values()).map(transport =>
      transport.close()
    );
    
    await Promise.all(closePromises);

    if (this.logIndex) {
      await this.logIndex.close();
    }

    this.info('ActionLogger closing', await this.getStats());
    
    this.isInitialized = false;
  }

  static logDebug(message: string, context?: any): void {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      instance.debug(message, context);
    } else {
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  static logInfo(message: string, context?: any): void {
    const instance = ActionLogger.getInstance();
    instance.ensureComponentsInitialized();
    if (instance.isInitialized) {
      instance.info(message, context);
    } else {
      console.info(`[INFO] ${message}`, context);
    }
  }

  static logWarn(message: string, context?: any): void {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      instance.warn(message, context);
    } else {
      console.warn(`[WARN] ${message}`, context);
    }
  }

  static logError(message: string, error?: Error | any): void {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      instance.error(message, error);
    } else {
      console.error(`[ERROR] ${message}`, error);
    }
  }

  static logAIOperation(operation: string, context?: any): void {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      instance.info(`[AI OPERATION] ${operation}`, {
        ...context,
        type: 'ai_operation',
        timestamp: new Date().toISOString()
      });
    } else {
      console.info(`[AI OPERATION] ${operation}`, context);
    }
  }

  static logPageOperation(operation: string, pageName: string, context?: any): void {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      instance.info(`[PAGE OPERATION] ${operation} - ${pageName}`, {
        ...context,
        type: 'page_operation',
        operation,
        pageName,
        timestamp: new Date().toISOString()
      });
    } else {
      console.info(`[PAGE OPERATION] ${operation} - ${pageName}`, context);
    }
  }

  static async logElementAction(description: string, context?: any): Promise<void> {
    const instance = ActionLogger.getInstance();
    instance.ensureComponentsInitialized();
    
    const { action, element, duration, error, ...otherContext } = context || {};
    
    let verboseDescription = description;
    
    if (error) {
      verboseDescription = `${description} - Failed with error: ${error.message || error}`;
      await instance.logError(`Action failed: ${action}`, error, {
        element,
        action,
        ...otherContext
      });
      return;
    }
    
    if (action && element) {
      switch (action.toLowerCase()) {
        case 'click':
          verboseDescription = `Element clicked: ${element}`;
          break;
        case 'fill':
        case 'type':
          if (otherContext.value !== undefined) {
            const maskedValue = instance.maskSensitiveValue(String(otherContext.value), element);
            verboseDescription = `Element filled: '${maskedValue}' filled in ${element}`;
            otherContext.displayValue = maskedValue;
          } else if (otherContext.characters !== undefined) {
            verboseDescription = `Element filled: ${element} (${otherContext.characters} characters)`;
          }
          break;
        case 'select':
        case 'selectoption':
          if (otherContext.value !== undefined) {
            const valueStr = Array.isArray(otherContext.value) ? otherContext.value.join(', ') : otherContext.value;
            verboseDescription = `Element selected: '${valueStr}' selected in ${element}`;
          }
          break;
        case 'check':
          verboseDescription = `Element checked: ${element} checkbox checked`;
          break;
        case 'uncheck':
          verboseDescription = `Element unchecked: ${element} checkbox unchecked`;
          break;
        case 'hover':
          verboseDescription = `Element hovered: Mouse hovered over ${element}`;
          break;
        case 'focus':
          verboseDescription = `Element focused: ${element} received focus`;
          break;
        case 'scroll':
          verboseDescription = `Element scrolled: Scrolled to ${element}`;
          break;
        case 'wait':
          verboseDescription = `Waiting for element: ${element} to be ${otherContext.state || 'ready'}`;
          break;
        case 'press':
          if (otherContext.key) {
            verboseDescription = `Key pressed: '${otherContext.key}' pressed on ${element}`;
          }
          break;
        default:
          verboseDescription = description;
      }
    }
    
    await instance.logAction(action || 'element_action', {
      description: verboseDescription,
      element,
      duration,
      ...otherContext
    });
  }

  static logStepStart(stepText: string, location: string): void {
    ActionLogger.logInfo(`[STEP START] ${stepText}`, { location, type: 'step_start' });
  }

  static logStepPass(stepText: string, duration: number): void {
    ActionLogger.logInfo(`[STEP PASS] ${stepText}`, { duration, type: 'step_pass' });
  }

  static logStepFail(stepText: string, error: Error, duration: number): void {
    ActionLogger.logError(`[STEP FAIL] ${stepText}`, error);
    ActionLogger.logInfo(`Step failed after ${duration}ms`, { duration, type: 'step_fail' });
  }

  static logStepSkip(stepText: string): void {
    ActionLogger.logInfo(`[STEP SKIP] ${stepText}`, { type: 'step_skip' });
  }

  static logStepPending(stepText: string): void {
    ActionLogger.logWarn(`[STEP PENDING] ${stepText}`, { type: 'step_pending' });
  }

  static logAttachment(name: string, mediaType: string): void {
    ActionLogger.logInfo(`[ATTACHMENT] ${name}`, { mediaType, type: 'attachment' });
  }

  static logContextStorage(key: string, valueType: string): void {
    ActionLogger.logInfo(`Stored context value: ${key}`, { key, valueType, type: 'context_storage' });
  }

  static logCollectorInitialization(collectorType: string, executionId: string): void {
    ActionLogger.logInfo(`${collectorType} collector initialized`, { collectorType, executionId, type: 'collector_init' });
  }

  static logCollectorFinalization(collectorType: string, executionId: string, stats?: any): void {
    ActionLogger.logInfo(`${collectorType} collector finalized`, { 
      collectorType, 
      executionId, 
      stats,
      type: 'collector_finalization' 
    });
  }

  static logVideoRecording(action: 'start' | 'stop', scenarioId: string, duration?: number, size?: number): void {
    const message = action === 'start' 
      ? `Video recording started for scenario: ${scenarioId}`
      : `Video recording stopped for scenario: ${scenarioId}`;
    
    ActionLogger.logInfo(message, { 
      action,
      scenarioId,
      duration,
      size,
      type: 'video_recording' 
    });
  }

  static logScreenshot(fileName: string): void {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      instance.logScreenshot(fileName, 'Test screenshot').catch(() => {
        ActionLogger.logInfo(`Screenshot captured: ${fileName}`, { type: 'screenshot' });
      });
    } else {
      ActionLogger.logInfo(`Screenshot captured: ${fileName}`, { type: 'screenshot' });
    }
  }

  static async logPerformance(label: string, duration: number): Promise<void> {
    const instance = ActionLogger.getInstance();
    if (instance.isInitialized) {
      await instance.logPerformance(label, duration, 'ms');
    } else {
      ActionLogger.logInfo(`Performance: ${label}`, { duration, type: 'performance' });
    }
  }

  static logStepDefinitionLoading(status: string, data?: any): void {
    ActionLogger.logInfo(`[STEP DEFINITION] Loading ${status}`, { 
      ...data, 
      type: 'step_definition_loading',
      status 
    });
  }

  static logFileLoaded(filePath: string): void {
    ActionLogger.logInfo(`[FILE LOADED] ${filePath}`, { 
      filePath, 
      type: 'file_loaded' 
    });
  }

  static logContextInitialization(contextType: string, data?: any): void {
    ActionLogger.logInfo(`[CONTEXT INIT] ${contextType} context initialized`, {
      contextType,
      ...data,
      type: 'context_initialization'
    });
  }

  static logFeatureStart(featureName: string, data?: any): void {
    ActionLogger.logInfo(`[FEATURE START] ${featureName}`, {
      featureName,
      ...data,
      type: 'feature_start'
    });
  }

  static logScenarioStart(scenarioName: string, data?: any): void {
    ActionLogger.logInfo(`[SCENARIO START] ${scenarioName}`, {
      scenarioName,
      ...data,
      type: 'scenario_start'
    });
  }

  static logTestDataSet(dataDescription: string, data?: any): void {
    ActionLogger.logInfo(`[TEST DATA] ${dataDescription}`, {
      ...data,
      type: 'test_data_set'
    });
  }

  static logSoftAssertionFailure(message: string, data?: any): void {
    ActionLogger.logWarn(`[SOFT ASSERTION FAILED] ${message}`, {
      message,
      ...data,
      type: 'soft_assertion_failure'
    });
  }

  static logExecutionStart(executionId: string, data?: any): void {
    ActionLogger.logInfo(`[EXECUTION START] Execution ${executionId} started`, {
      executionId,
      ...data,
      type: 'execution_start'
    });
  }

  static logExecutionEnd(executionId: string, data?: any): void {
    ActionLogger.logInfo(`[EXECUTION END] Execution ${executionId} completed`, {
      executionId,
      ...data,
      type: 'execution_end'
    });
  }

  static logContextCreation(contextId: string, data?: any): void {
    ActionLogger.logInfo(`[CONTEXT CREATED] Context ${contextId} created`, {
      contextId,
      ...data,
      type: 'context_creation'
    });
  }

  static logPageCreation(pageUrl: string, data?: any): void {
    ActionLogger.logInfo(`[PAGE CREATED] Page created for ${pageUrl}`, {
      pageUrl,
      ...data,
      type: 'page_creation'
    });
  }

  static logPageError(error: string, data?: any): void {
    ActionLogger.logError(`[PAGE ERROR] ${error}`, data);
  }

  static logDialog(dialogType: string, message: string, data?: any): void {
    ActionLogger.logInfo(`[DIALOG] ${dialogType}: ${message}`, {
      dialogType,
      message,
      ...data,
      type: 'dialog'
    });
  }

  static logRequestFailure(url: string, error: string, data?: any): void {
    ActionLogger.logError(`[REQUEST FAILED] ${url}: ${error}`, {
      url,
      error,
      ...data,
      type: 'request_failure'
    });
  }

  static logResponseStorage(key: string, data?: any): void {
    ActionLogger.logInfo(`[RESPONSE STORED] Response stored with key: ${key}`, {
      key,
      ...data,
      type: 'response_storage'
    });
  }

  static logResponseRetrieval(key: string, found: boolean, data?: any): void {
    ActionLogger.logInfo(`[RESPONSE RETRIEVED] Key: ${key}, Found: ${found}`, {
      key,
      found,
      ...data,
      type: 'response_retrieval'
    });
  }

  static logEmulation(type: string, value: string, details?: any): void {
    ActionLogger.logInfo(`[EMULATION] ${type}: ${value}`, {
      emulationType: type,
      value,
      ...details,
      type: 'emulation'
    });
  }

  static async logVerification(description: string, expected: any, actual: any, passed: boolean): Promise<void> {
    const instance = ActionLogger.getInstance();
    await instance.logVerification(description, expected, actual, passed);
  }

  public getRecentLogs(limit: number = PERFORMANCE_MODE ? 50 : 100): LogEntry[] {
    const recentEntries = this.buffer.entries.slice(-limit);
    return recentEntries;
  }

  public getAllBufferedLogs(): LogEntry[] {
    return [...this.buffer.entries];
  }

  static getRecentLogs(limit: number = PERFORMANCE_MODE ? 50 : 100): LogEntry[] {
    return ActionLogger.getInstance().getRecentLogs(limit);
  }
  
  public getAllLogs(): LogEntry[] {
    return this.getAllBufferedLogs();
  }

  static getAllBufferedLogs(): LogEntry[] {
    return ActionLogger.getInstance().getAllBufferedLogs();
  }

  public getConsoleMessages(): ConsoleMessage[] {
    return consoleCapture.getMessages();
  }

  public getInitializationMessages(): ConsoleMessage[] {
    return consoleCapture.getInitializationLogs();
  }

  public exportConsoleLogsAsText(): string {
    const messages = this.getConsoleMessages();
    return messages.map(msg => `[${(msg as any).timestamp?.toISOString() || 'Unknown'}] [${(msg as any).type?.toUpperCase() || 'LOG'}] ${(msg as any).text || msg.toString()}`).join('\n');
  }

  public exportConsoleLogsAsHtml(): string {
    const messages = this.getConsoleMessages();
    const htmlLines = messages.map(msg => 
      `<div class="log-entry log-${(msg as any).type || 'log'}">
         <span class="timestamp">[${(msg as any).timestamp?.toISOString() || 'Unknown'}]</span>
         <span class="level">[${(msg as any).type?.toUpperCase() || 'LOG'}]</span>
         <span class="message">${this.escapeHtml((msg as any).text || msg.toString())}</span>
       </div>`
    );
    return htmlLines.join('\n');
  }

  private escapeHtml(text: string): string {
    const div = { textContent: text } as any;
    return div.innerHTML || text.replace(/[&<>"']/g, (m: string) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m] || m));
  }

  public getCombinedLogs(): Array<LogEntry | ConsoleMessage> {
    const logEntries = this.getAllBufferedLogs();
    const consoleMessages = this.getConsoleMessages();
    
    const combined: Array<LogEntry | ConsoleMessage> = [
      ...logEntries,
      ...consoleMessages
    ];
    
    return combined.sort((a, b) => {
      const timeA = (a as any).timestamp?.getTime() || 0;
      const timeB = (b as any).timestamp?.getTime() || 0;
      return timeA - timeB;
    });
  }

  public async saveConsoleLogs(filePath: string, format: 'text' | 'json' | 'html' = 'text'): Promise<void> {
    let content: string;
    
    switch (format) {
      case 'json':
        content = consoleCapture.exportAsJson();
        break;
      case 'html':
        content = consoleCapture.exportAsHtml();
        break;
      default:
        content = consoleCapture.exportAsText();
    }
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    this.info(`Console logs saved to: ${filePath}`);
  }

  static getConsoleMessages(): ConsoleMessage[] {
    return ActionLogger.getInstance().getConsoleMessages();
  }

  static async saveConsoleLogs(filePath: string, format: 'text' | 'json' | 'html' = 'text'): Promise<void> {
    return ActionLogger.getInstance().saveConsoleLogs(filePath, format);
  }
}


class LogIndex implements ILogIndex {
  private indexPath: string;
  private indexes: Map<string, Set<string>> = new Map();

  constructor(indexPath: string) {
    this.indexPath = indexPath;
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }
    
    await this.loadIndex();
  }

  async index(entry: LogEntry): Promise<void> {
    if (entry.correlationId) {
      this.addToIndex('correlation', entry.correlationId, entry.id);
    }
    
    this.addToIndex('type', entry.type, entry.id);
    
    if (entry.level) {
      this.addToIndex('level', entry.level, entry.id);
    }
    
    const hourBucket = new Date(entry.timestamp);
    hourBucket.setMinutes(0, 0, 0);
    this.addToIndex('time', hourBucket.toISOString(), entry.id);
  }

  async getSize(): Promise<number> {
    let size = 0;
    Array.from(this.indexes.values()).forEach((entries) => {
      size += entries.size;
    });
    return size;
  }

  async close(): Promise<void> {
    await this.saveIndex();
  }

  private addToIndex(indexType: string, key: string, entryId: string): void {
    const indexKey = `${indexType}:${key}`;
    if (!this.indexes.has(indexKey)) {
      this.indexes.set(indexKey, new Set());
    }
    this.indexes.get(indexKey)!.add(entryId);
  }

  private async loadIndex(): Promise<void> {
    const indexFile = path.join(this.indexPath, 'index.json');
    if (fs.existsSync(indexFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        for (const [key, entries] of Object.entries(data)) {
          this.indexes.set(key, new Set(entries as string[]));
        }
      } catch (error) {
        console.error('Failed to load log index:', error);
      }
    }
  }

  private async saveIndex(): Promise<void> {
    const indexFile = path.join(this.indexPath, 'index.json');
    const data: Record<string, string[]> = {};
    
    Array.from(this.indexes.entries()).forEach(([key, entries]) => {
      data[key] = Array.from(entries);
    });
    
    fs.writeFileSync(indexFile, JSON.stringify(data));
  }
}

class LogArchiveManager {
  async archive(logPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `${path.basename(logPath, '.log')}_${timestamp}.log`;
    const archivePath = path.join(path.dirname(logPath), 'archive', archiveName);
    
    const archiveDir = path.dirname(archivePath);
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    
    fs.renameSync(logPath, archivePath);
    
    if (fs.statSync(archivePath).size > 10 * 1024 * 1024) {
      await this.compressFile(archivePath);
    }
    
    return archivePath;
  }

  async cleanup(config: LogRotationConfig): Promise<void> {
    if (config.maxFiles) {
    }
    
    if (config.maxAge) {
    }
  }

  private async compressFile(filePath: string): Promise<void> {
    const zlib = require('zlib');
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(`${filePath}.gz`);
    const gzip = zlib.createGzip();
    
    await new Promise((resolve, reject) => {
      input
        .pipe(gzip)
        .pipe(output)
        .on('finish', () => {
          fs.unlinkSync(filePath);
          resolve(undefined);
        })
        .on('error', reject);
    });
  }
}

class MetricsCollector {
  private metrics: Map<string, any> = new Map();

  recordElementFailure(element: string, action: string): void {
    const key = `element_failure:${element}:${action}`;
    this.incrementMetric(key);
  }

  recordValidationFailure(type: string): void {
    const key = `validation_failure:${type}`;
    this.incrementMetric(key);
  }

  recordError(errorType: string): void {
    const key = `error:${errorType}`;
    this.incrementMetric(key);
  }

  recordAPICall(method: string, url: string, statusCode: number, duration: number): void {
    const key = `api:${method}:${this.normalizeUrl(url)}`;
    this.recordMetric(key, {
      count: 1,
      totalDuration: duration,
      statusCodes: { [statusCode]: 1 }
    });
  }

  recordDatabaseQuery(operation: string, duration: number, rowCount: number): void {
    const key = `db:${operation}`;
    this.recordMetric(key, {
      count: 1,
      totalDuration: duration,
      totalRows: rowCount
    });
  }

  recordPerformanceMetric(metric: string, value: number): void {
    const key = `perf:${metric}`;
    this.recordMetric(key, {
      count: 1,
      total: value,
      min: value,
      max: value
    });
  }

  private incrementMetric(key: string): void {
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
  }

  private recordMetric(key: string, data: any): void {
    const existing = this.metrics.get(key) || {};
    this.metrics.set(key, this.mergeMetrics(existing, data));
  }

  private mergeMetrics(existing: any, newData: any): any {
    return { ...existing, ...newData };
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }
}

interface LogReport {
  sessionId: string;
  timeRange: { start: Date; end: Date };
  totalEntries: number;
  byLevel: Record<LogLevel, number>;
  byType: Record<string, number>;
  errors: LogEntry[];
  performance: any;
  apiCalls: any;
  elementActions: any;
  validations: any;
}

export const actionLogger = ActionLogger.getInstance();
