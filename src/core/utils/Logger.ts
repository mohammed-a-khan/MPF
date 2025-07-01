
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as zlib from 'zlib';

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 6
}

export interface LoggerConfig {
  level?: LogLevel;
  name?: string;
  transports?: LogTransport[];
  format?: LogFormat;
  errorStackTraceLimit?: number;
  exitOnError?: boolean;
  handleExceptions?: boolean;
  handleRejections?: boolean;
  silent?: boolean;
  metadata?: Record<string, any>;
}

export interface LogTransport {
  name: string;
  level?: LogLevel;
  format?: LogFormat;
  handleExceptions?: boolean;
  handleRejections?: boolean;
  write(info: LogInfo): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface LogFormat {
  (info: LogInfo): string;
}

export interface LogInfo {
  level: LogLevel;
  levelName: string;
  message: string;
  timestamp: Date;
  logger: string;
  metadata?: Record<string, any>;
  error?: Error;
  stack?: string;
  pid: number;
  hostname: string;
  correlationId?: string;
  duration?: number;
}

export interface LogRotationOptions {
  maxSize?: number;
  maxFiles?: number;
  maxAge?: number;
  compress?: boolean;
  datePattern?: string;
  zippedArchive?: boolean;
}

export class Logger extends EventEmitter {
  private static instances = new Map<string, Logger>();
  private static processListenersAdded = false;
  private static defaultConfig: LoggerConfig = {
    level: LogLevel.INFO,
    errorStackTraceLimit: 10,
    exitOnError: false,
    handleExceptions: true,
    handleRejections: true
  };

  private config: Required<LoggerConfig>;
  private transports: LogTransport[] = [];
  private isSilent: boolean = false;
  private metadata: Record<string, any> = {};
  private timers = new Map<string, number>();

  private constructor(config: LoggerConfig = {}) {
    super();
    this.config = {
      ...Logger.defaultConfig,
      ...config,
      name: config.name || 'default',
      transports: config.transports || [new ConsoleTransport()],
      format: config.format || defaultFormat,
      silent: config.silent || false,
      metadata: config.metadata || {}
    } as Required<LoggerConfig>;

    this.isSilent = this.config.silent;
    this.metadata = { ...this.config.metadata };
    this.transports = [...this.config.transports];

    setImmediate(() => {
      if (this.config.handleExceptions) {
        this.handleExceptions();
      }

      if (this.config.handleRejections) {
        this.handleRejections();
      }
    });
  }

  public static getInstance(name: string = 'default', config?: LoggerConfig): Logger {
    if (!Logger.instances.has(name)) {
      Logger.instances.set(name, new Logger({ ...config, name }));
    }
    return Logger.instances.get(name)!;
  }

  public static setDefaultConfig(config: Partial<LoggerConfig>): void {
    Logger.defaultConfig = { ...Logger.defaultConfig, ...config };
  }

  public trace(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.TRACE, message, metadata);
  }

  public debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  public info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  public warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  public error(message: string, error?: Error | Record<string, any>, metadata?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, { ...metadata, error: this.serializeError(error) });
    } else {
      this.log(LogLevel.ERROR, message, { ...error, ...metadata });
    }
  }

  public fatal(message: string, error?: Error | Record<string, any>, metadata?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.FATAL, message, { ...metadata, error: this.serializeError(error) });
    } else {
      this.log(LogLevel.FATAL, message, { ...error, ...metadata });
    }

    if (this.config.exitOnError) {
      process.exit(1);
    }
  }

  public time(label: string): void {
    this.timers.set(label, performance.now());
  }

  public timeEnd(label: string, metadata?: Record<string, any>): void {
    const start = this.timers.get(label);
    if (start) {
      const duration = performance.now() - start;
      this.timers.delete(label);
      this.info(`${label} completed`, { ...metadata, duration, durationMs: duration });
    }
  }

  public child(metadata: Record<string, any>): Logger {
    const childConfig = {
      ...this.config,
      metadata: { ...this.metadata, ...metadata }
    };
    return new Logger(childConfig);
  }

  public profile(id: string, metadata?: Record<string, any>): void {
    const time = this.timers.get(id);
    if (time) {
      this.timeEnd(id, metadata);
    } else {
      this.time(id);
    }
  }

  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  public getLevel(): LogLevel {
    return this.config.level;
  }

  public addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  public removeTransport(name: string): void {
    this.transports = this.transports.filter(t => t.name !== name);
  }

  public setMetadata(metadata: Record<string, any>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  public clearMetadata(): void {
    this.metadata = {};
  }

  public setSilent(silent: boolean): void {
    this.isSilent = silent;
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (this.isSilent || level < this.config.level) {
      return;
    }

    const info: LogInfo = {
      level,
      levelName: LogLevel[level],
      message,
      timestamp: new Date(),
      logger: this.config.name!,
      metadata: { ...this.metadata, ...metadata },
      pid: process.pid,
      hostname: os.hostname(),
      correlationId: metadata?.['correlationId'] || this.metadata['correlationId']
    };

    if (metadata?.['error'] instanceof Error) {
      info.error = metadata['error'];
      info.stack = this.formatStack(metadata['error']);
    }

    this.transports.forEach(transport => {
      if (!transport.level || level >= transport.level) {
        try {
          const result = transport.write(info);
          if (result instanceof Promise) {
            result.catch(err => {
              console.error(`Transport ${transport.name} write error:`, err);
            });
          }
        } catch (err) {
          console.error(`Transport ${transport.name} write error:`, err);
        }
      }
    });

    this.emit('logged', info);
  }

  private serializeError(error: Error): Record<string, any> {
    const serialized: Record<string, any> = {
      name: error.name,
      message: error.message,
      stack: this.formatStack(error)
    };

    Object.getOwnPropertyNames(error).forEach(key => {
      if (!['name', 'message', 'stack'].includes(key)) {
        serialized[key] = (error as any)[key];
      }
    });

    return serialized;
  }

  private formatStack(error: Error): string {
    if (!error.stack) return '';

    const lines = error.stack.split('\n');
    const limit = this.config.errorStackTraceLimit;

    if (lines.length > limit) {
      return lines.slice(0, limit).join('\n') + `\n... ${lines.length - limit} more lines`;
    }

    return error.stack;
  }

  private handleExceptions(): void {
    if (!Logger.processListenersAdded) {
      process.on('uncaughtException', (error: Error) => {
        const defaultLogger = Logger.instances.get('default');
        if (defaultLogger) {
          defaultLogger.error('Uncaught Exception', error);
          if (defaultLogger.config.exitOnError && !this.isNetworkError(error)) {
            process.exit(1);
          } else {
            defaultLogger.warn('Continuing execution despite uncaught exception');
          }
        }
      });
    }
  }

  private isNetworkError(error: Error): boolean {
    const networkErrorPatterns = [
      'net::ERR_ABORTED',
      'net::ERR_NETWORK_CHANGED',
      'net::ERR_CONNECTION_REFUSED',
      'Failed to load resource',
      'Unauthorized',
      'request_failure'
    ];
    
    return networkErrorPatterns.some(pattern => 
      error.message.includes(pattern) || error.stack?.includes(pattern)
    );
  }

  private handleRejections(): void {
    if (!Logger.processListenersAdded) {
      process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        const defaultLogger = Logger.instances.get('default');
        if (defaultLogger) {
          defaultLogger.error('Unhandled Rejection', new Error(String(reason)), { promise });
          defaultLogger.warn('Continuing execution despite unhandled rejection');
        }
      });
      Logger.processListenersAdded = true;
    }
  }

  public async close(): Promise<void> {
    await Promise.all(
      this.transports.map(transport => 
        transport.close ? transport.close() : Promise.resolve()
      )
    );
    this.removeAllListeners();
  }
}

const defaultFormat: LogFormat = (info: LogInfo): string => {
  const timestamp = info.timestamp.toISOString();
  const level = info.levelName.padEnd(5);
  const logger = info.logger.padEnd(15);
  let message = `[${timestamp}] [${level}] [${logger}] ${info.message}`;

  if (info.metadata && Object.keys(info.metadata).length > 0) {
    message += ` ${JSON.stringify(info.metadata)}`;
  }

  if (info.stack) {
    message += `\n${info.stack}`;
  }

  return message;
};

export class ConsoleTransport implements LogTransport {
  public name = 'console';
  public level?: LogLevel;
  public format: LogFormat;

  constructor(options: Partial<ConsoleTransport> = {}) {
    Object.assign(this, options);
    this.format = options.format || defaultFormat;
  }

  public write(info: LogInfo): void {
    const formatted = this.format(info);
    const method = this.getConsoleMethod(info.level);
    (console[method] as Function)(formatted);
  }

  private getConsoleMethod(level: LogLevel): 'debug' | 'info' | 'warn' | 'error' | 'log' {
    switch (level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return 'error';
      default:
        return 'log';
    }
  }
}

export class FileTransport implements LogTransport {
  public name = 'file';
  public level?: LogLevel;
  public format: LogFormat;
  
  private filename: string;
  private stream?: fs.WriteStream;
  private currentSize: number = 0;
  private rotationOptions: LogRotationOptions;
  private writeQueue: string[] = [];
  private isWriting: boolean = false;

  constructor(options: {
    filename: string;
    level?: LogLevel;
    format?: LogFormat;
    rotation?: LogRotationOptions;
  }) {
    this.filename = options.filename;
    if (options.level !== undefined) {
      this.level = options.level;
    }
    this.format = options.format || defaultFormat;
    this.rotationOptions = options.rotation || {};

    this.ensureDirectory();
    this.openStream();

    if (this.rotationOptions.maxSize || this.rotationOptions.maxAge) {
      this.startRotationWorker();
    }
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private openStream(): void {
    this.stream = fs.createWriteStream(this.filename, { flags: 'a' });
    this.stream.on('error', (error) => {
      console.error('FileTransport stream error:', error);
    });

    try {
      const stats = fs.statSync(this.filename);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }
  }

  public async write(info: LogInfo): Promise<void> {
    const formatted = this.format(info) + '\n';
    this.writeQueue.push(formatted);
    
    if (!this.isWriting) {
      await this.processWriteQueue();
    }
  }

  private async processWriteQueue(): Promise<void> {
    if (this.writeQueue.length === 0 || this.isWriting) {
      return;
    }

    this.isWriting = true;

    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.splice(0, 100).join('');
      await this.writeToStream(batch);
    }

    this.isWriting = false;
  }

  private async writeToStream(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.stream || this.stream.destroyed) {
        this.openStream();
      }

      const buffer = Buffer.from(data);
      this.currentSize += buffer.length;

      this.stream!.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          this.checkRotation();
          resolve();
        }
      });
    });
  }

  private checkRotation(): void {
    if (this.rotationOptions.maxSize && this.currentSize >= this.rotationOptions.maxSize) {
      this.rotate();
    }
  }

  private async rotate(): Promise<void> {
    if (!this.stream) return;

    this.stream.end();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(this.filename);
    const base = path.basename(this.filename, ext);
    const dir = path.dirname(this.filename);
    const rotatedFilename = path.join(dir, `${base}-${timestamp}${ext}`);

    try {
      await fs.promises.rename(this.filename, rotatedFilename);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }

    if (this.rotationOptions.compress || this.rotationOptions.zippedArchive) {
      this.compressFile(rotatedFilename);
    }

    if (this.rotationOptions.maxFiles) {
      this.cleanupOldFiles();
    }

    this.currentSize = 0;
    this.openStream();
  }

  private async compressFile(filename: string): Promise<void> {
    const input = fs.createReadStream(filename);
    const output = fs.createWriteStream(`${filename}.gz`);
    const gzip = zlib.createGzip();

    input.pipe(gzip).pipe(output);

    return new Promise((resolve, reject) => {
      output.on('finish', () => {
        fs.unlinkSync(filename);
        resolve();
      });
      output.on('error', reject);
    });
  }

  private async cleanupOldFiles(): Promise<void> {
    const dir = path.dirname(this.filename);
    const base = path.basename(this.filename, path.extname(this.filename));
    
    const files = await fs.promises.readdir(dir);
    const logFiles = files
      .filter(f => f.startsWith(base) && f !== path.basename(this.filename))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        time: fs.statSync(path.join(dir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    const maxFiles = this.rotationOptions.maxFiles!;
    if (logFiles.length > maxFiles) {
      const toDelete = logFiles.slice(maxFiles);
      await Promise.all(toDelete.map(f => fs.promises.unlink(f.path)));
    }

    if (this.rotationOptions.maxAge) {
      const maxAge = Date.now() - this.rotationOptions.maxAge;
      const oldFiles = logFiles.filter(f => f.time < maxAge);
      await Promise.all(oldFiles.map(f => fs.promises.unlink(f.path)));
    }
  }

  private startRotationWorker(): void {
    if (this.rotationOptions.maxAge) {
      setInterval(() => {
        this.checkRotation();
      }, 60000);
    }
  }

  public async close(): Promise<void> {
    await this.processWriteQueue();
    
    return new Promise((resolve) => {
      if (this.stream && !this.stream.destroyed) {
        this.stream.end(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export const jsonFormat: LogFormat = (info: LogInfo): string => {
  return JSON.stringify({
    timestamp: info.timestamp.toISOString(),
    level: info.levelName,
    logger: info.logger,
    message: info.message,
    ...info.metadata,
    ...(info.error && { error: info.error }),
    ...(info.stack && { stack: info.stack }),
    pid: info.pid,
    hostname: info.hostname,
    ...(info.correlationId && { correlationId: info.correlationId })
  });
};

export const prettyFormat: LogFormat = (info: LogInfo): string => {
  const colors = {
    TRACE: '\x1b[37m',
    DEBUG: '\x1b[36m',
    INFO: '\x1b[32m',
    WARN: '\x1b[33m',
    ERROR: '\x1b[31m',
    FATAL: '\x1b[35m',
    RESET: '\x1b[0m'
  };

  const color = colors[info.levelName as keyof typeof colors] || colors.RESET;
  const timestamp = info.timestamp.toISOString();
  const level = info.levelName.padEnd(5);
  const logger = info.logger.padEnd(15);
  
  let message = `${colors.RESET}[${timestamp}] ${color}[${level}]${colors.RESET} [${logger}] ${info.message}`;

  if (info.metadata && Object.keys(info.metadata).length > 0) {
    const metaStr = util.inspect(info.metadata, { colors: true, depth: 3 });
    message += ` ${metaStr}`;
  }

  if (info.stack) {
    message += `\n${color}${info.stack}${colors.RESET}`;
  }

  return message;
};

export const syslogLevels = {
  [LogLevel.TRACE]: 7,
  [LogLevel.DEBUG]: 7,
  [LogLevel.INFO]: 6,
  [LogLevel.WARN]: 4,   // Warning
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 2   // Critical
};

let _logger: Logger | null = null;

export const logger = {
  getInstance(): Logger {
    if (!_logger) {
      _logger = Logger.getInstance();
    }
    return _logger;
  },
  
  trace(message: string, metadata?: Record<string, any>): void {
    this.getInstance().trace(message, metadata);
  },
  
  debug(message: string, metadata?: Record<string, any>): void {
    this.getInstance().debug(message, metadata);
  },
  
  info(message: string, metadata?: Record<string, any>): void {
    this.getInstance().info(message, metadata);
  },
  
  warn(message: string, metadata?: Record<string, any>): void {
    this.getInstance().warn(message, metadata);
  },
  
  error(message: string, error?: Error | Record<string, any>, metadata?: Record<string, any>): void {
    this.getInstance().error(message, error, metadata);
  },
  
  fatal(message: string, error?: Error | Record<string, any>, metadata?: Record<string, any>): void {
    this.getInstance().fatal(message, error, metadata);
  }
};
