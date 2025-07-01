// src/reporting/collectors/LogCollector.ts

import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import {
  LogLevel,
  LogContext
} from '../types/reporting.types';
import * as fs from 'fs';
import * as path from 'path';

type LogSource = 'framework' | 'browser' | 'console' | 'network' | 'test';

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: LogSource;
  message: string;
  context?: LogContext;
  stackTrace?: string;
  metadata?: any;
  scenarioId?: string;
}

interface LogEvidence {
  scenarioId: string;
  logs: LogEntry[];
  source: LogSource;
  startTime: Date;
  endTime: Date;
}

interface CollectionOptions {
  sources?: LogSource[];
  level?: LogLevel;
  includeStackTraces?: boolean;
}

export class LogCollector {
  private static instance: LogCollector;
  private readonly logger = Logger.getInstance(LogCollector.name);
  
  private readonly logs: Map<string, LogEvidence[]> = new Map();
  private readonly logBuffers: Map<string, LogEntry[]> = new Map();
  private readonly logStreams: Map<string, fs.WriteStream> = new Map();
  
  private readonly logLevel: LogLevel;
  private readonly includeStackTraces: boolean;
  private readonly logPath: string;
  private readonly rotateLogSize: number;
  private readonly logSources: Set<LogSource>;
  
  private executionId: string = '';

  private constructor() {
    this.logLevel = ConfigurationManager.get('LOG_LEVEL', 'info') as LogLevel;
    this.includeStackTraces = ConfigurationManager.getBoolean('INCLUDE_STACK_TRACES', true);
    this.logPath = ConfigurationManager.get('LOG_PATH', './evidence/logs');
    this.rotateLogSize = ConfigurationManager.getInt('ROTATE_LOG_SIZE_MB', 5) * 1024 * 1024;
    
    this.logSources = new Set<LogSource>([
      'framework',
      'browser',
      'console',
      'network',
      'test'
    ]);
  }

  static getInstance(): LogCollector {
    if (!LogCollector.instance) {
      LogCollector.instance = new LogCollector();
    }
    return LogCollector.instance;
  }

  async initialize(executionId: string, options: CollectionOptions = {}): Promise<void> {
    this.executionId = executionId;
    this.logs.clear();
    this.logBuffers.clear();
    
    this.logStreams.forEach((stream) => {
      stream.end();
    });
    this.logStreams.clear();
    
    const execLogPath = path.join(this.logPath, executionId);
    if (!fs.existsSync(execLogPath)) {
      fs.mkdirSync(execLogPath, { recursive: true });
    }
    
    const sources = options.sources || Array.from(this.logSources);
    
    sources.forEach(source => {
      const logFile = path.join(execLogPath, `${source}.log`);
      const stream = fs.createWriteStream(logFile, { flags: 'a' });
      this.logStreams.set(source, stream);
    });
    
    ActionLogger.logCollectorInitialization('log', executionId);
  }

  async log(
    source: LogSource,
    level: LogLevel,
    message: string,
    metadata?: any,
    scenarioId?: string
  ): Promise<void> {
    if (!this.shouldLog(level)) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source,
      message,
      metadata
    };
    
    if (scenarioId !== undefined) {
      entry.scenarioId = scenarioId;
    }
    
    const bufferId = scenarioId || 'global';
    if (!this.logBuffers.has(bufferId)) {
      this.logBuffers.set(bufferId, []);
    }
    this.logBuffers.get(bufferId)!.push(entry);
    
    const stream = this.logStreams.get(source);
    if (stream && !stream.destroyed) {
      const logLine = this.formatLogEntry(entry);
      stream.write(logLine + '\n');
      
      await this.checkRotation(source, stream);
    }
  }

  async logBrowserConsole(
    scenarioId: string,
    type: string,
    message: string,
    location?: string
  ): Promise<void> {
    const level = this.mapConsoleTypeToLevel(type);
    await this.log('console', level, message, { type, location }, scenarioId);
  }

  async logNetworkActivity(
    scenarioId: string,
    method: string,
    url: string,
    status: number,
    duration: number,
    size: number
  ): Promise<void> {
    const level: LogLevel = status >= 400 ? LogLevel.ERROR : LogLevel.DEBUG;
    const message = `${method} ${url} - ${status} (${duration}ms, ${size} bytes)`;
    
    await this.log('network', level, message, {
      method,
      url,
      status,
      duration,
      size
    }, scenarioId);
  }

  async logFrameworkEvent(
    event: string,
    details: any,
    scenarioId?: string
  ): Promise<void> {
    await this.log('framework', LogLevel.INFO, event, details, scenarioId);
  }

  async logApplicationMessage(
    message: string,
    level: LogLevel = LogLevel.INFO,
    metadata?: any,
    scenarioId?: string
  ): Promise<void> {
    await this.log('test', level, message, metadata, scenarioId);
  }

  async logError(
    error: Error,
    source: LogSource = 'framework',
    scenarioId?: string
  ): Promise<void> {
    const metadata: any = {
      errorName: error.name,
      errorMessage: error.message
    };
    
    if (this.includeStackTraces && error.stack) {
      metadata.stackTrace = error.stack.split('\n').map(line => line.trim());
    }
    
    await this.log(source, LogLevel.ERROR, error.message, metadata, scenarioId);
  }

  async collectForScenario(
    scenarioId: string,
    _scenarioName: string
  ): Promise<LogEvidence[]> {
    const logs: LogEvidence[] = [];
    
    const scenarioLogs = this.logBuffers.get(scenarioId) || [];
    const globalLogs = this.logBuffers.get('global') || [];
    
    const allLogs = [...scenarioLogs, ...globalLogs]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (allLogs.length > 0) {
      const evidence: LogEvidence = {
        scenarioId,
        logs: allLogs,
        source: 'framework' as LogSource,
        startTime: allLogs[0]!.timestamp,
        endTime: allLogs[allLogs.length - 1]!.timestamp
      };
      
      logs.push(evidence);
      
      const textEvidence = await this.createTextLogEvidence(scenarioId, allLogs);
      if (textEvidence) {
        logs.push(textEvidence);
      }
    }
    
    this.logs.set(scenarioId, logs);
    
    this.logBuffers.delete(scenarioId);
    
    return logs;
  }

  async collectForStep(
    scenarioId: string,
    _stepId: string,
    _stepText: string,
    status: 'passed' | 'failed' | 'skipped'
  ): Promise<LogEvidence[]> {
    if (status !== 'failed') {
      return [];
    }
    
    const buffer = this.logBuffers.get(scenarioId) || [];
    const recentLogs = buffer.slice(-50);
    
    if (recentLogs.length === 0) {
      return [];
    }
    
    const evidence: LogEvidence = {
      scenarioId,
      logs: recentLogs,
      source: 'framework' as LogSource,
      startTime: recentLogs[0]!.timestamp,
      endTime: recentLogs[recentLogs.length - 1]!.timestamp
    };
    
    return [evidence];
  }

  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.padEnd(5);
    const source = `[${entry.source}]`.padEnd(12);
    
    let line = `${timestamp} ${level} ${source} ${entry.message}`;
    
    if (entry.metadata) {
      const metadataStr = JSON.stringify(entry.metadata, null, 2);
      const indentedMetadata = metadataStr.split('\n')
        .map(line => '  ' + line)
        .join('\n');
      line += '\n' + indentedMetadata;
    }
    
    return line;
  }

  private async createTextLogEvidence(
    scenarioId: string,
    entries: LogEntry[]
  ): Promise<LogEvidence | null> {
    if (entries.length === 0) {
      return null;
    }
    
    try {
      const logFile = path.join(
        this.logPath,
        this.executionId,
        `${scenarioId}_formatted.log`
      );
      
      const content = entries.map(entry => this.formatLogEntry(entry)).join('\n');
      await fs.promises.writeFile(logFile, content);
      
      return {
        scenarioId,
        logs: entries,
        source: 'framework' as LogSource,
        startTime: entries[0]!.timestamp,
        endTime: entries[entries.length - 1]!.timestamp
      };
    } catch (error: any) {
      this.logger.error('Failed to create text log evidence', error);
      return null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const configuredIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    
    return messageIndex >= configuredIndex;
  }

  private mapConsoleTypeToLevel(type: string): LogLevel {
    switch (type.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warning':
      case 'warn':
        return LogLevel.WARN;
      case 'info':
      case 'log':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      case 'trace':
        return LogLevel.TRACE;
      default:
        return LogLevel.INFO;
    }
  }

  private calculateLogSize(entries: LogEntry[]): number {
    let size = 0;
    entries.forEach(entry => {
      size += entry.message.length;
      if (entry.metadata) {
        size += JSON.stringify(entry.metadata).length;
      }
    });
    return size;
  }


  private async checkRotation(source: LogSource, stream: fs.WriteStream): Promise<void> {
    try {
      const logFile = stream.path as string;
      const stats = await fs.promises.stat(logFile);
      
      if (stats.size > this.rotateLogSize) {
        stream.end();
        this.logStreams.delete(source);
        
        const timestamp = new Date().getTime();
        const rotatedFile = logFile.replace('.log', `.${timestamp}.log`);
        await fs.promises.rename(logFile, rotatedFile);
        
        const newStream = fs.createWriteStream(logFile, { flags: 'a' });
        this.logStreams.set(source, newStream);
        
        this.logger.info(`Rotated log file: ${source} (${stats.size} bytes)`);
      }
    } catch (error: any) {
      this.logger.debug('Log rotation check failed', error);
    }
  }

  async searchLogs(
    pattern: string | RegExp,
    options: {
      sources?: LogSource[];
      levels?: LogLevel[];
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    } = {}
  ): Promise<LogEntry[]> {
    const results: LogEntry[] = [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    
    this.logBuffers.forEach((entries) => {
      entries.forEach(entry => {
        if (options.sources && !options.sources.includes(entry.source)) return;
        if (options.levels && !options.levels.includes(entry.level)) return;
        if (options.startTime && entry.timestamp < options.startTime) return;
        if (options.endTime && entry.timestamp > options.endTime) return;
        
        if (regex.test(entry.message) || 
            (entry.metadata && regex.test(JSON.stringify(entry.metadata)))) {
          results.push(entry);
          
          if (options.limit && results.length >= options.limit) {
            return;
          }
        }
      });
    });
    
    return results;
  }

  async exportLogs(
    scenarioId: string,
    format: 'json' | 'text' | 'csv'
  ): Promise<string> {
    const entries = this.logBuffers.get(scenarioId) || [];
    const exportFile = path.join(
      this.logPath,
      this.executionId,
      `${scenarioId}_export.${format}`
    );
    
    let content: string;
    
    switch (format) {
      case 'json':
        content = JSON.stringify(entries, null, 2);
        break;
        
      case 'csv':
        content = this.convertToCSV(entries);
        break;
        
      case 'text':
      default:
        content = entries.map(e => this.formatLogEntry(e)).join('\n');
        break;
    }
    
    await fs.promises.writeFile(exportFile, content);
    return exportFile;
  }

  private convertToCSV(entries: LogEntry[]): string {
    const headers = ['Timestamp', 'Level', 'Source', 'Message', 'Metadata', 'ScenarioId'];
    const rows = entries.map(entry => [
      entry.timestamp.toISOString(),
      entry.level,
      entry.source,
      `"${entry.message.replace(/"/g, '""')}"`,
      entry.metadata ? `"${JSON.stringify(entry.metadata).replace(/"/g, '""')}"` : '',
      entry.scenarioId || ''
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  getStatistics(): {
    totalEntries: number;
    totalSize: number;
    bySource: Record<LogSource, number>;
    byLevel: Record<LogLevel, number>;
    errorCount: number;
    warningCount: number;
  } {
    let totalEntries = 0;
    let totalSize = 0;
    const bySource: Record<LogSource, number> = {} as any;
    const byLevel: Record<LogLevel, number> = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0
    };
    
    this.logBuffers.forEach((entries) => {
      totalEntries += entries.length;
      
      entries.forEach(entry => {
        totalSize += this.calculateLogSize([entry]);
        
        bySource[entry.source] = (bySource[entry.source] || 0) + 1;
        byLevel[entry.level]++;
      });
    });
    
    return {
      totalEntries,
      totalSize,
      bySource,
      byLevel,
      errorCount: byLevel[LogLevel.ERROR],
      warningCount: byLevel[LogLevel.WARN]
    };
  }

  async finalize(executionId: string): Promise<void> {
    if (this.logBuffers.has('global')) {
      const globalLogs = this.logBuffers.get('global')!;
      if (globalLogs.length > 0) {
        const evidence: LogEvidence = {
          scenarioId: 'global',
          logs: globalLogs,
          source: 'framework' as LogSource,
          startTime: globalLogs[0]!.timestamp,
          endTime: globalLogs[globalLogs.length - 1]!.timestamp
        };
        
        this.logs.set('global', [evidence]);
      }
    }
    
    this.logStreams.forEach((stream) => {
      stream.end();
    });
    
    this.logBuffers.clear();
    this.logStreams.clear();
    
    ActionLogger.logCollectorInitialization('log', executionId);
  }
}
