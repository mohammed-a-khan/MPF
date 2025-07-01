
import * as util from 'util';
import {
  LogEntry,
  LogLevel,
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
  LogFormat,
  FormatOptions,
  ColorScheme,
  TemplateEngine as ITemplateEngine,
  FormatCache as IFormatCache,
  FormatterRule,
  DataFormatter,
  StructuredFormatter
} from './LogTypes';

export class LogFormatter {
  private formatters: Map<LogFormat, (entry: LogEntry, options?: FormatOptions) => string>;
  private colorScheme: ColorScheme;
  private templateEngine: TemplateEngine;
  private formatCache: FormatCache;
  private customFormatters: Map<string, FormatterRule[]> = new Map();
  private dataFormatters: Map<string, DataFormatter> = new Map();
  private structuredFormatters: Map<string, StructuredFormatter> = new Map();
  private readonly maxCacheSize: number = 10000;
  private readonly ansiColors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',
    
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
    bgGray: '\x1b[100m',
    
    bgBrightRed: '\x1b[101m',
    bgBrightGreen: '\x1b[102m',
    bgBrightYellow: '\x1b[103m',
    bgBrightBlue: '\x1b[104m',
    bgBrightMagenta: '\x1b[105m',
    bgBrightCyan: '\x1b[106m',
    bgBrightWhite: '\x1b[107m'
  };

  constructor() {
    this.formatters = new Map();
    this.colorScheme = this.createDefaultColorScheme();
    this.templateEngine = new TemplateEngine();
    this.formatCache = new FormatCache(this.maxCacheSize);
    
    this.registerDefaultFormatters();
    this.registerDefaultDataFormatters();
    this.registerDefaultStructuredFormatters();
    this.registerDefaultTemplates();
  }

  format(entry: LogEntry, format: LogFormat = 'json', options?: FormatOptions): string {
    const cacheKey = this.generateCacheKey(entry, format, options);
    const cached = this.formatCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new Error(`Unknown log format: ${format}`);
    }

    let formatted: string;
    try {
      formatted = formatter(entry, options);
      
      if (this.customFormatters.has(format)) {
        formatted = this.applyCustomFormatters(format, formatted, entry);
      }
    } catch (error) {
      formatted = this.formatError(entry, error);
    }

    this.formatCache.set(cacheKey, formatted);

    return formatted;
  }

  registerFormat(name: LogFormat, formatter: (entry: LogEntry, options?: FormatOptions) => string): void {
    this.formatters.set(name, formatter);
  }

  registerCustomFormatter(format: string, rule: FormatterRule): void {
    if (!this.customFormatters.has(format)) {
      this.customFormatters.set(format, []);
    }
    this.customFormatters.get(format)!.push(rule);
  }

  registerDataFormatter(type: string, formatter: DataFormatter): void {
    this.dataFormatters.set(type, formatter);
  }

  registerTemplate(name: string, template: string): void {
    this.templateEngine.register(name, template);
  }

  setColorScheme(scheme: ColorScheme): void {
    this.colorScheme = { ...this.colorScheme, ...scheme };
  }

  private registerDefaultFormatters(): void {
    this.formatters.set('json', (entry, options) => this.formatJSON(entry, options));
    
    this.formatters.set('pretty', (entry, options) => this.formatPretty(entry, options));
    
    this.formatters.set('compact', (entry, options) => this.formatCompact(entry, options));
    
    this.formatters.set('xml', (entry, options) => this.formatXML(entry, options));
    
    this.formatters.set('csv', (entry, options) => this.formatCSV(entry, options));
    
    this.formatters.set('syslog', (entry, options) => this.formatSyslog(entry, options));
    
    this.formatters.set('template', (entry, options) => this.formatTemplate(entry, options));
    
    this.formatters.set('logstash', (entry, options) => this.formatLogstash(entry, options));
    
    this.formatters.set('cloudwatch', (entry, options) => this.formatCloudWatch(entry, options));
  }

  private formatJSON(entry: LogEntry, options?: FormatOptions): string {
    const formatted = this.prepareJSONObject(entry, options);
    
    if (options?.pretty) {
      return JSON.stringify(formatted, null, options.indent || 2);
    }
    
    return JSON.stringify(formatted);
  }

  private prepareJSONObject(entry: LogEntry, options?: FormatOptions): any {
    const obj: any = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      type: entry.type,
      correlationId: entry.correlationId,
      sessionId: entry.sessionId
    };

    switch (entry.type) {
      case 'action':
        const actionEntry = entry as ActionLogEntry;
        obj.action = actionEntry.action;
        obj.details = actionEntry.details;
        if (actionEntry.duration) obj.duration = actionEntry.duration;
        break;
        
      case 'navigation':
        const navEntry = entry as NavigationLogEntry;
        obj.url = navEntry.url;
        obj.method = navEntry.method;
        if (navEntry.statusCode) obj.statusCode = navEntry.statusCode;
        if (navEntry.loadTime) obj.loadTime = navEntry.loadTime;
        break;
        
      case 'element':
        const elemEntry = entry as ElementLogEntry;
        obj.element = elemEntry.elementDescription;
        obj.action = elemEntry.action;
        obj.locator = elemEntry.locator;
        obj.success = elemEntry.success;
        if (elemEntry.duration) obj.duration = elemEntry.duration;
        if (elemEntry.error) obj.error = elemEntry.error;
        break;
        
      case 'api':
        const apiEntry = entry as APILogEntry;
        obj.method = apiEntry.method;
        obj.url = apiEntry.url;
        obj.statusCode = apiEntry.statusCode;
        obj.duration = apiEntry.duration;
        if (options?.includeHeaders !== false && apiEntry.requestHeaders) {
          obj.requestHeaders = apiEntry.requestHeaders;
        }
        if (options?.includeBody !== false && apiEntry.requestBody) {
          obj.requestBody = apiEntry.requestBody;
        }
        if (apiEntry.error) obj.error = apiEntry.error;
        break;
        
      case 'database':
        const dbEntry = entry as DatabaseLogEntry;
        obj.operation = dbEntry.operation;
        obj.query = dbEntry.query;
        obj.duration = dbEntry.duration;
        if (dbEntry.rowCount !== undefined) obj.rowCount = dbEntry.rowCount;
        if (dbEntry.error) obj.error = dbEntry.error;
        break;
        
      case 'validation':
        const valEntry = entry as ValidationLogEntry;
        obj.validationType = valEntry.validationType;
        obj.expected = valEntry.expected;
        obj.actual = valEntry.actual;
        obj.passed = valEntry.passed;
        if (valEntry.message) obj.message = valEntry.message;
        break;
        
      case 'error':
        const errEntry = entry as ErrorLogEntry;
        obj.error = errEntry.error;
        if (errEntry.stackTrace) obj.stackTrace = errEntry.stackTrace;
        if (errEntry.errorContext) obj.context = errEntry.errorContext;
        break;
        
      case 'performance':
        const perfEntry = entry as PerformanceLogEntry;
        obj.metric = perfEntry.metric;
        obj.value = perfEntry.value;
        obj.unit = perfEntry.unit;
        if (perfEntry.threshold) obj.threshold = perfEntry.threshold;
        obj.exceeded = perfEntry.exceeded;
        break;
        
      case 'screenshot':
        const ssEntry = entry as ScreenshotLogEntry;
        obj.filename = ssEntry.filename;
        obj.purpose = ssEntry.purpose;
        if (ssEntry.size) obj.size = ssEntry.size;
        obj.format = ssEntry.format;
        break;
        
      case 'network':
        const netEntry = entry as NetworkLogEntry;
        obj.request = netEntry.request;
        obj.response = netEntry.response;
        obj.duration = netEntry.duration;
        obj.cached = netEntry.cached;
        if (netEntry.size) obj.size = netEntry.size;
        break;
        
      case 'console':
        const consEntry = entry as ConsoleLogEntry;
        obj.consoleType = consEntry.consoleType;
        obj.message = consEntry.message;
        if (consEntry.url) obj.url = consEntry.url;
        if (consEntry.lineNumber) obj.line = consEntry.lineNumber;
        break;
    }

    if (entry.context && Object.keys(entry.context).length > 0) {
      obj.context = entry.context;
    }

    if (entry.metadata) {
      obj.metadata = entry.metadata;
    }

    if (options?.includeSystemInfo) {
      obj.threadId = entry.threadId;
      obj.processId = entry.processId;
      obj.hostname = entry.hostname;
    }

    return obj;
  }

  private formatPretty(entry: LogEntry, options?: FormatOptions): string {
    const useColors = options?.colors !== false && this.supportsColors();
    const timestamp = this.formatTimestamp(entry.timestamp, options?.timestampFormat);
    const level = this.formatLevel(entry.level!, useColors);
    const type = this.formatType(entry.type, useColors);
    
    let message = `${timestamp} ${level} ${type}`;
    
    if (entry.correlationId && entry.correlationId !== 'root') {
      const correlationId = useColors 
        ? `${this.ansiColors.dim}[${entry.correlationId}]${this.ansiColors.reset}`
        : `[${entry.correlationId}]`;
      message += ` ${correlationId}`;
    }

    const content = this.formatPrettyContent(entry, useColors, options);
    message += ` ${content}`;

    if (entry.context && Object.keys(entry.context).length > 0 && options?.includeContext !== false) {
      const contextStr = this.formatContext(entry.context, useColors);
      message += `\n  ${contextStr}`;
    }

    if (entry.metadata && options?.includeMetadata) {
      const metadataStr = this.formatMetadata(entry.metadata, useColors);
      message += `\n  ${metadataStr}`;
    }

    return message;
  }

  private formatPrettyContent(entry: LogEntry, useColors: boolean, options?: FormatOptions): string {
    switch (entry.type) {
      case 'action':
        return this.formatActionContent(entry as ActionLogEntry, useColors);
        
      case 'navigation':
        return this.formatNavigationContent(entry as NavigationLogEntry, useColors);
        
      case 'element':
        return this.formatElementContent(entry as ElementLogEntry, useColors);
        
      case 'api':
        return this.formatAPIContent(entry as APILogEntry, useColors);
        
      case 'database':
        return this.formatDatabaseContent(entry as DatabaseLogEntry, useColors);
        
      case 'validation':
        return this.formatValidationContent(entry as ValidationLogEntry, useColors);
        
      case 'error':
        return this.formatErrorContent(entry as ErrorLogEntry, useColors, options);
        
      case 'performance':
        return this.formatPerformanceContent(entry as PerformanceLogEntry, useColors);
        
      case 'screenshot':
        return this.formatScreenshotContent(entry as ScreenshotLogEntry, useColors);
        
      case 'network':
        return this.formatNetworkContent(entry as NetworkLogEntry, useColors);
        
      case 'console':
        return this.formatConsoleContent(entry as ConsoleLogEntry, useColors);
        
      default:
        return this.formatGeneralContent(entry, useColors);
    }
  }

  private formatActionContent(entry: ActionLogEntry, useColors: boolean): string {
    let content = useColors 
      ? `${this.ansiColors.brightCyan}${entry.action}${this.ansiColors.reset}`
      : entry.action;
    
    if (entry.details && Object.keys(entry.details).length > 0) {
      const details = this.formatObject(entry.details, useColors, 1);
      content += ` ${details}`;
    }
    
    if (entry.duration) {
      const duration = useColors
        ? `${this.ansiColors.dim}(${entry.duration}ms)${this.ansiColors.reset}`
        : `(${entry.duration}ms)`;
      content += ` ${duration}`;
    }
    
    return content;
  }

  private formatNavigationContent(entry: NavigationLogEntry, useColors: boolean): string {
    const method = useColors
      ? `${this.ansiColors.brightBlue}${entry.method}${this.ansiColors.reset}`
      : entry.method;
    
    const url = useColors
      ? `${this.ansiColors.cyan}${entry.url}${this.ansiColors.reset}`
      : entry.url;
    
    let content = `${method} ${url}`;
    
    if (entry.statusCode) {
      const statusColor = this.getStatusCodeColor(entry.statusCode);
      const status = useColors
        ? `${statusColor}${entry.statusCode}${this.ansiColors.reset}`
        : `${entry.statusCode}`;
      content += ` → ${status}`;
    }
    
    if (entry.loadTime) {
      const loadTime = useColors
        ? `${this.ansiColors.dim}(${entry.loadTime}ms)${this.ansiColors.reset}`
        : `(${entry.loadTime}ms)`;
      content += ` ${loadTime}`;
    }
    
    return content;
  }

  private formatElementContent(entry: ElementLogEntry, useColors: boolean): string {
    const element = useColors
      ? `${this.ansiColors.brightMagenta}${entry.elementDescription}${this.ansiColors.reset}`
      : entry.elementDescription;
    
    const action = useColors
      ? `${this.ansiColors.brightCyan}${entry.action}${this.ansiColors.reset}`
      : entry.action;
    
    let content = `${element} → ${action}`;
    
    if (!entry.success) {
      const failed = useColors
        ? `${this.ansiColors.red}✗ FAILED${this.ansiColors.reset}`
        : '✗ FAILED';
      content += ` ${failed}`;
      
      if (entry.error) {
        const error = useColors
          ? `${this.ansiColors.red}${entry.error.message || entry.error}${this.ansiColors.reset}`
          : `${entry.error.message || entry.error}`;
        content += `: ${error}`;
      }
    } else {
      const success = useColors
        ? `${this.ansiColors.green}✓${this.ansiColors.reset}`
        : '✓';
      content += ` ${success}`;
    }
    
    if (entry.duration) {
      const duration = useColors
        ? `${this.ansiColors.dim}(${entry.duration}ms)${this.ansiColors.reset}`
        : `(${entry.duration}ms)`;
      content += ` ${duration}`;
    }
    
    if (entry.retryCount && entry.retryCount > 0) {
      const retries = useColors
        ? `${this.ansiColors.yellow}[retries: ${entry.retryCount}]${this.ansiColors.reset}`
        : `[retries: ${entry.retryCount}]`;
      content += ` ${retries}`;
    }
    
    return content;
  }

  private formatAPIContent(entry: APILogEntry, useColors: boolean): string {
    const method = useColors
      ? `${this.ansiColors.brightBlue}${entry.method}${this.ansiColors.reset}`
      : entry.method;
    
    const url = useColors
      ? `${this.ansiColors.cyan}${this.truncateUrl(entry.url)}${this.ansiColors.reset}`
      : this.truncateUrl(entry.url);
    
    const statusColor = this.getStatusCodeColor(entry.statusCode);
    const status = useColors
      ? `${statusColor}${entry.statusCode}${this.ansiColors.reset}`
      : `${entry.statusCode}`;
    
    const duration = useColors
      ? `${this.ansiColors.dim}${entry.duration}ms${this.ansiColors.reset}`
      : `${entry.duration}ms`;
    
    let content = `${method} ${url} → ${status} (${duration})`;
    
    if (entry.error) {
      const error = useColors
        ? `${this.ansiColors.red}${entry.error.message || entry.error}${this.ansiColors.reset}`
        : `${entry.error.message || entry.error}`;
      content += `\n  Error: ${error}`;
    }
    
    return content;
  }

  private formatDatabaseContent(entry: DatabaseLogEntry, useColors: boolean): string {
    const operation = useColors
      ? `${this.ansiColors.brightYellow}${entry.operation}${this.ansiColors.reset}`
      : entry.operation;
    
    const query = useColors
      ? `${this.ansiColors.gray}${this.truncateQuery(entry.query)}${this.ansiColors.reset}`
      : this.truncateQuery(entry.query);
    
    const duration = useColors
      ? `${this.ansiColors.dim}${entry.duration}ms${this.ansiColors.reset}`
      : `${entry.duration}ms`;
    
    let content = `${operation}: ${query} (${duration})`;
    
    if (entry.rowCount !== undefined) {
      const rows = useColors
        ? `${this.ansiColors.brightWhite}${entry.rowCount} rows${this.ansiColors.reset}`
        : `${entry.rowCount} rows`;
      content += ` → ${rows}`;
    }
    
    if (entry.error) {
      const error = useColors
        ? `${this.ansiColors.red}${entry.error.message || entry.error}${this.ansiColors.reset}`
        : `${entry.error.message || entry.error}`;
      content += `\n  Error: ${error}`;
    }
    
    return content;
  }

  private formatValidationContent(entry: ValidationLogEntry, useColors: boolean): string {
    const type = useColors
      ? `${this.ansiColors.brightMagenta}${entry.validationType}${this.ansiColors.reset}`
      : entry.validationType;
    
    const result = entry.passed
      ? (useColors ? `${this.ansiColors.green}✓ PASSED${this.ansiColors.reset}` : '✓ PASSED')
      : (useColors ? `${this.ansiColors.red}✗ FAILED${this.ansiColors.reset}` : '✗ FAILED');
    
    let content = `${type} ${result}`;
    
    if (!entry.passed) {
      const expected = this.formatValue(entry.expected, useColors);
      const actual = this.formatValue(entry.actual, useColors);
      
      content += `\n  Expected: ${expected}`;
      content += `\n  Actual:   ${actual}`;
      
      if (entry.message) {
        content += `\n  Message:  ${entry.message}`;
      }
    }
    
    return content;
  }

  private formatErrorContent(entry: ErrorLogEntry, useColors: boolean, options?: FormatOptions): string {
    const error = entry.error;
    const message = useColors
      ? `${this.ansiColors.red}${error.message || error}${this.ansiColors.reset}`
      : `${error.message || error}`;
    
    let content = message;
    
    if (error.code) {
      const code = useColors
        ? `${this.ansiColors.yellow}[${error.code}]${this.ansiColors.reset}`
        : `[${error.code}]`;
      content = `${code} ${content}`;
    }
    
    if (entry.errorContext) {
      const context = this.formatObject(entry.errorContext, useColors, 1);
      content += `\n  Context: ${context}`;
    }
    
    if (entry.stackTrace && options?.includeStackTrace !== false) {
      const stack = useColors
        ? `${this.ansiColors.dim}${this.formatStackTrace(entry.stackTrace)}${this.ansiColors.reset}`
        : this.formatStackTrace(entry.stackTrace);
      content += `\n${stack}`;
    }
    
    return content;
  }

  private formatPerformanceContent(entry: PerformanceLogEntry, useColors: boolean): string {
    const metric = useColors
      ? `${this.ansiColors.brightCyan}${entry.metric}${this.ansiColors.reset}`
      : entry.metric;
    
    const value = entry.exceeded
      ? (useColors ? `${this.ansiColors.red}${entry.value}${this.ansiColors.reset}` : `${entry.value}`)
      : (useColors ? `${this.ansiColors.green}${entry.value}${this.ansiColors.reset}` : `${entry.value}`);
    
    let content = `${metric}: ${value}${entry.unit}`;
    
    if (entry.threshold) {
      const threshold = useColors
        ? `${this.ansiColors.dim}(threshold: ${entry.threshold}${entry.unit})${this.ansiColors.reset}`
        : `(threshold: ${entry.threshold}${entry.unit})`;
      content += ` ${threshold}`;
    }
    
    if (entry.exceeded) {
      const exceeded = useColors
        ? `${this.ansiColors.red}⚠ EXCEEDED${this.ansiColors.reset}`
        : '⚠ EXCEEDED';
      content += ` ${exceeded}`;
    }
    
    return content;
  }

  private formatScreenshotContent(entry: ScreenshotLogEntry, useColors: boolean): string {
    const filename = useColors
      ? `${this.ansiColors.brightBlue}${entry.filename}${this.ansiColors.reset}`
      : entry.filename;
    
    const purpose = useColors
      ? `${this.ansiColors.dim}(${entry.purpose})${this.ansiColors.reset}`
      : `(${entry.purpose})`;
    
    let content = `📸 ${filename} ${purpose}`;
    
    if (entry.size) {
      const size = this.formatFileSize(entry.size);
      const sizeStr = useColors
        ? `${this.ansiColors.dim}[${size}]${this.ansiColors.reset}`
        : `[${size}]`;
      content += ` ${sizeStr}`;
    }
    
    return content;
  }

  private formatNetworkContent(entry: NetworkLogEntry, useColors: boolean): string {
    const method = entry.request.method || 'GET';
    const url = this.truncateUrl(entry.request.url);
    const status = entry.response.status || 0;
    
    const methodStr = useColors
      ? `${this.ansiColors.brightBlue}${method}${this.ansiColors.reset}`
      : method;
    
    const urlStr = useColors
      ? `${this.ansiColors.cyan}${url}${this.ansiColors.reset}`
      : url;
    
    const statusColor = this.getStatusCodeColor(status);
    const statusStr = useColors
      ? `${statusColor}${status}${this.ansiColors.reset}`
      : `${status}`;
    
    const duration = useColors
      ? `${this.ansiColors.dim}${entry.duration}ms${this.ansiColors.reset}`
      : `${entry.duration}ms`;
    
    let content = `${methodStr} ${urlStr} → ${statusStr} (${duration})`;
    
    if (entry.cached) {
      const cached = useColors
        ? `${this.ansiColors.brightGreen}[CACHED]${this.ansiColors.reset}`
        : '[CACHED]';
      content += ` ${cached}`;
    }
    
    if (entry.size) {
      const size = this.formatFileSize(entry.size);
      const sizeStr = useColors
        ? `${this.ansiColors.dim}[${size}]${this.ansiColors.reset}`
        : `[${size}]`;
      content += ` ${sizeStr}`;
    }
    
    return content;
  }

  private formatConsoleContent(entry: ConsoleLogEntry, useColors: boolean): string {
    const typeColors = {
      error: this.ansiColors.red,
      warn: this.ansiColors.yellow,
      info: this.ansiColors.blue,
      log: this.ansiColors.white,
      debug: this.ansiColors.gray
    };
    
    const typeColor = typeColors[entry.consoleType as keyof typeof typeColors] || this.ansiColors.white;
    const type = useColors
      ? `${typeColor}[${entry.consoleType.toUpperCase()}]${this.ansiColors.reset}`
      : `[${entry.consoleType.toUpperCase()}]`;
    
    let content = `${type} ${entry.message}`;
    
    if (entry.url) {
      const location = `${entry.url}:${entry.lineNumber || 0}:${entry.columnNumber || 0}`;
      const locationStr = useColors
        ? `${this.ansiColors.dim}at ${location}${this.ansiColors.reset}`
        : `at ${location}`;
      content += `\n  ${locationStr}`;
    }
    
    return content;
  }

  private formatGeneralContent(entry: LogEntry, useColors: boolean): string {
    if ('message' in entry && entry.message) {
      return entry.message;
    }
    
    if ('data' in entry && entry.data) {
      return this.formatObject(entry.data, useColors, 0);
    }
    
    return '';
  }

  private formatCompact(entry: LogEntry, _options?: FormatOptions): string {
    const timestamp = this.formatTimestamp(entry.timestamp, 'HH:mm:ss.SSS');
    const level = (entry.level || 'INFO').substr(0, 3).toUpperCase();
    const type = entry.type.substr(0, 3).toUpperCase();
    
    let message = `${timestamp} ${level} ${type}`;
    
    switch (entry.type) {
      case 'action':
        const actionEntry = entry as ActionLogEntry;
        message += ` ${actionEntry.action}`;
        break;
        
      case 'navigation':
        const navEntry = entry as NavigationLogEntry;
        message += ` ${navEntry.method} ${this.truncateUrl(navEntry.url, 50)}`;
        if (navEntry.statusCode) message += ` ${navEntry.statusCode}`;
        break;
        
      case 'element':
        const elemEntry = entry as ElementLogEntry;
        message += ` ${this.truncate(elemEntry.elementDescription, 30)} ${elemEntry.action}`;
        message += elemEntry.success ? ' ✓' : ' ✗';
        break;
        
      case 'api':
        const apiEntry = entry as APILogEntry;
        message += ` ${apiEntry.method} ${this.truncateUrl(apiEntry.url, 40)} ${apiEntry.statusCode}`;
        break;
        
      case 'error':
        const errEntry = entry as ErrorLogEntry;
        message += ` ${this.truncate(errEntry.error.message || String(errEntry.error), 80)}`;
        break;
        
      default:
        if ('message' in entry && entry.message) {
          message += ` ${this.truncate(entry.message, 80)}`;
        }
    }
    
    return message;
  }

  private formatXML(entry: LogEntry, options?: FormatOptions): string {
    const indent = options?.indent || 2;
    const spaces = ' '.repeat(indent);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<logEntry>\n';
    xml += `${spaces}<timestamp>${this.escapeXML(entry.timestamp.toISOString())}</timestamp>\n`;
    xml += `${spaces}<level>${this.escapeXML(entry.level || '')}</level>\n`;
    xml += `${spaces}<type>${this.escapeXML(entry.type)}</type>\n`;
    xml += `${spaces}<correlationId>${this.escapeXML(entry.correlationId)}</correlationId>\n`;
    xml += `${spaces}<sessionId>${this.escapeXML(entry.sessionId)}</sessionId>\n`;
    
    const typeData = this.getTypeSpecificData(entry);
    xml += this.objectToXML(typeData, indent, 1);
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      xml += `${spaces}<context>\n`;
      xml += this.objectToXML(entry.context, indent, 2);
      xml += `${spaces}</context>\n`;
    }
    
    if (entry.metadata) {
      xml += `${spaces}<metadata>\n`;
      xml += this.objectToXML(entry.metadata, indent, 2);
      xml += `${spaces}</metadata>\n`;
    }
    
    xml += '</logEntry>';
    
    return xml;
  }

  private formatCSV(entry: LogEntry, options?: FormatOptions): string {
    const delimiter = options?.delimiter || ',';
    const quote = options?.quote || '"';
    
    const fields = [
      entry.timestamp.toISOString(),
      entry.level || '',
      entry.type,
      entry.correlationId,
      entry.sessionId
    ];
    
    switch (entry.type) {
      case 'action':
        const actionEntry = entry as ActionLogEntry;
        fields.push(actionEntry.action);
        fields.push(JSON.stringify(actionEntry.details || {}));
        fields.push(String(actionEntry.duration || ''));
        break;
        
      case 'navigation':
        const navEntry = entry as NavigationLogEntry;
        fields.push(navEntry.method);
        fields.push(navEntry.url);
        fields.push(String(navEntry.statusCode || ''));
        fields.push(String(navEntry.loadTime || ''));
        break;
        
      case 'element':
        const elemEntry = entry as ElementLogEntry;
        fields.push(elemEntry.elementDescription);
        fields.push(elemEntry.action);
        fields.push(String(elemEntry.success));
        fields.push(String(elemEntry.duration || ''));
        break;
        
      case 'api':
        const apiEntry = entry as APILogEntry;
        fields.push(apiEntry.method);
        fields.push(apiEntry.url);
        fields.push(String(apiEntry.statusCode));
        fields.push(String(apiEntry.duration));
        break;
        
      case 'error':
        const errEntry = entry as ErrorLogEntry;
        fields.push(errEntry.error.message || String(errEntry.error));
        fields.push(errEntry.error.code || '');
        fields.push(this.escapeCSV(errEntry.stackTrace || '', quote));
        break;
        
      default:
        if ('message' in entry && entry.message) {
          fields.push(entry.message);
        }
    }
    
    const escapedFields = fields.map(field => {
      if (typeof field === 'string' && (field.includes(delimiter) || field.includes(quote) || field.includes('\n'))) {
        return `${quote}${this.escapeCSV(field, quote)}${quote}`;
      }
      return field;
    });
    
    return escapedFields.join(delimiter);
  }

  private formatSyslog(entry: LogEntry, options?: FormatOptions): string {
    const facility = options?.facility || 16;
    const severity = this.mapLogLevelToSyslogSeverity(entry.level);
    const priority = facility * 8 + severity;
    
    const timestamp = this.formatSyslogTimestamp(entry.timestamp);
    const hostname = entry.hostname || 'localhost';
    const app = 'cs-test-automation';
    const pid = entry.processId || process.pid;
    
    let message = this.formatSyslogMessage(entry);
    
    if (entry.metadata || entry.context) {
      const structuredData = this.formatSyslogStructuredData({
        ...entry.metadata,
        context: entry.context
      });
      message = `${structuredData} ${message}`;
    }
    
    return `<${priority}>${timestamp} ${hostname} ${app}[${pid}]: ${message}`;
  }

  private formatTemplate(entry: LogEntry, options?: FormatOptions): string {
    const templateName = options?.template || 'default';
    const template = this.templateEngine.get(templateName);
    
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }
    
    const context = this.createTemplateContext(entry);
    return this.templateEngine.render(template, context);
  }

  private formatLogstash(entry: LogEntry, options?: FormatOptions): string {
    const logstashEntry = {
      '@timestamp': entry.timestamp.toISOString(),
      '@version': '1',
      level: entry.level,
      logger_name: 'cs-test-automation',
      thread_name: entry.threadId,
      message: this.getLogMessage(entry),
      ...this.prepareJSONObject(entry, options)
    };
    
    return JSON.stringify(logstashEntry);
  }

  private formatCloudWatch(entry: LogEntry, options?: FormatOptions): string {
    const cloudWatchEntry = {
      timestamp: entry.timestamp.getTime(),
      message: JSON.stringify(this.prepareJSONObject(entry, options))
    };
    
    return JSON.stringify(cloudWatchEntry);
  }


  private formatTimestamp(timestamp: Date, format?: string): string {
    if (!format) {
      format = 'YYYY-MM-DD HH:mm:ss.SSS';
    }
    
    const pad = (n: number, width: number = 2): string => {
      return String(n).padStart(width, '0');
    };
    
    const year = timestamp.getFullYear();
    const month = pad(timestamp.getMonth() + 1);
    const day = pad(timestamp.getDate());
    const hours = pad(timestamp.getHours());
    const minutes = pad(timestamp.getMinutes());
    const seconds = pad(timestamp.getSeconds());
    const milliseconds = pad(timestamp.getMilliseconds(), 3);
    
    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
      .replace('SSS', milliseconds);
  }

  private formatLevel(level: LogLevel, useColors: boolean): string {
    const levelStr = level.padEnd(5);
    
    if (!useColors) {
      return `[${levelStr}]`;
    }
    
    const colors = {
      [LogLevel.TRACE]: this.ansiColors.gray,
      [LogLevel.DEBUG]: this.ansiColors.blue,
      [LogLevel.INFO]: this.ansiColors.green,
      [LogLevel.WARN]: this.ansiColors.yellow,
      [LogLevel.ERROR]: this.ansiColors.red,
      [LogLevel.FATAL]: this.ansiColors.bgRed + this.ansiColors.brightWhite
    };
    
    const color = colors[level] || this.ansiColors.white;
    return `${color}[${levelStr}]${this.ansiColors.reset}`;
  }

  private formatType(type: string, useColors: boolean): string {
    const typeStr = type.toUpperCase().padEnd(10);
    
    if (!useColors) {
      return `[${typeStr}]`;
    }
    
    const colors = {
      action: this.ansiColors.cyan,
      navigation: this.ansiColors.blue,
      element: this.ansiColors.magenta,
      api: this.ansiColors.brightBlue,
      database: this.ansiColors.yellow,
      validation: this.ansiColors.brightMagenta,
      error: this.ansiColors.red,
      performance: this.ansiColors.brightCyan,
      screenshot: this.ansiColors.brightGreen,
      network: this.ansiColors.brightBlue,
      console: this.ansiColors.gray,
      general: this.ansiColors.white
    };
    
    const color = colors[type as keyof typeof colors] || this.ansiColors.white;
    return `${color}[${typeStr}]${this.ansiColors.reset}`;
  }

  private formatObject(obj: any, useColors: boolean, depth: number = 0): string {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (typeof obj !== 'object') return String(obj);
    
    const indent = '  '.repeat(depth);
    const nextIndent = '  '.repeat(depth + 1);
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      
      const items = obj.map(item => 
        `${nextIndent}${this.formatValue(item, useColors)}`
      ).join(',\n');
      
      return `[\n${items}\n${indent}]`;
    }
    
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    
    const pairs = entries.map(([key, value]) => {
      const keyStr = useColors
        ? `${this.ansiColors.brightWhite}${key}${this.ansiColors.reset}`
        : key;
      const valueStr = this.formatValue(value, useColors);
      return `${nextIndent}${keyStr}: ${valueStr}`;
    }).join(',\n');
    
    return `{\n${pairs}\n${indent}}`;
  }

  private formatValue(value: any, useColors: boolean): string {
    if (value === null) {
      return useColors ? `${this.ansiColors.gray}null${this.ansiColors.reset}` : 'null';
    }
    
    if (value === undefined) {
      return useColors ? `${this.ansiColors.gray}undefined${this.ansiColors.reset}` : 'undefined';
    }
    
    if (typeof value === 'string') {
      return useColors 
        ? `${this.ansiColors.green}"${value}"${this.ansiColors.reset}`
        : `"${value}"`;
    }
    
    if (typeof value === 'number') {
      return useColors
        ? `${this.ansiColors.yellow}${value}${this.ansiColors.reset}`
        : String(value);
    }
    
    if (typeof value === 'boolean') {
      return useColors
        ? `${this.ansiColors.brightCyan}${value}${this.ansiColors.reset}`
        : String(value);
    }
    
    if (value instanceof Date) {
      return useColors
        ? `${this.ansiColors.brightBlue}${value.toISOString()}${this.ansiColors.reset}`
        : value.toISOString();
    }
    
    if (typeof value === 'object') {
      return util.inspect(value, { depth: 2, colors: useColors });
    }
    
    return String(value);
  }

  private formatContext(context: any, useColors: boolean): string {
    const contextStr = this.formatObject(context, useColors, 1);
    return useColors
      ? `${this.ansiColors.dim}Context: ${contextStr}${this.ansiColors.reset}`
      : `Context: ${contextStr}`;
  }

  private formatMetadata(metadata: any, useColors: boolean): string {
    const metadataStr = this.formatObject(metadata, useColors, 1);
    return useColors
      ? `${this.ansiColors.dim}Metadata: ${metadataStr}${this.ansiColors.reset}`
      : `Metadata: ${metadataStr}`;
  }

  private formatStackTrace(stack: string): string {
    const lines = stack.split('\n');
    return lines.map((line, index) => {
      if (index === 0) return line;
      return `  ${line.trim()}`;
    }).join('\n');
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  private formatError(entry: LogEntry, error: any): string {
    return JSON.stringify({
      error: 'Formatting failed',
      originalError: String(error),
      entry: {
        type: entry.type,
        timestamp: entry.timestamp.toISOString(),
        level: entry.level
      }
    });
  }

  private getStatusCodeColor(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) {
      return this.ansiColors.green;
    } else if (statusCode >= 300 && statusCode < 400) {
      return this.ansiColors.yellow;
    } else if (statusCode >= 400 && statusCode < 500) {
      return this.ansiColors.brightYellow;
    } else if (statusCode >= 500) {
      return this.ansiColors.red;
    }
    return this.ansiColors.white;
  }

  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substr(0, maxLength - 3) + '...';
  }

  private truncateUrl(url: string, maxLength: number = 80): string {
    if (url.length <= maxLength) return url;
    
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      
      if (path.length > 50) {
        return `${urlObj.origin}${path.substr(0, 47)}...`;
      }
      
      return url.substr(0, maxLength - 3) + '...';
    } catch {
      return this.truncate(url, maxLength);
    }
  }

  private truncateQuery(query: string, maxLength: number = 100): string {
    const normalized = query.replace(/\s+/g, ' ').trim();
    return this.truncate(normalized, maxLength);
  }

  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeCSV(str: string, quote: string): string {
    return str.replace(new RegExp(quote, 'g'), quote + quote);
  }

  private objectToXML(obj: any, indentSize: number, level: number): string {
    const indent = ' '.repeat(indentSize * level);
    let xml = '';
    
    if (obj === null || obj === undefined) {
      return xml;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      
      if (value === null || value === undefined) {
        xml += `${indent}<${safeKey}/>\n`;
      } else if (typeof value === 'object' && value !== null) {
        xml += `${indent}<${safeKey}>\n`;
        xml += this.objectToXML(value, indentSize, level + 1);
        xml += `${indent}</${safeKey}>\n`;
      } else {
        xml += `${indent}<${safeKey}>${this.escapeXML(String(value))}</${safeKey}>\n`;
      }
    }
    
    return xml;
  }

  private getTypeSpecificData(entry: LogEntry): any {
    const data: any = {};
    
    switch (entry.type) {
      case 'action':
        const actionEntry = entry as ActionLogEntry;
        data.action = actionEntry.action;
        data.details = actionEntry.details;
        data.duration = actionEntry.duration;
        break;
        
      case 'navigation':
        const navEntry = entry as NavigationLogEntry;
        data.url = navEntry.url;
        data.method = navEntry.method;
        data.statusCode = navEntry.statusCode;
        data.loadTime = navEntry.loadTime;
        break;
        
    }
    
    return data;
  }

  private mapLogLevelToSyslogSeverity(level?: LogLevel): number {
    const mapping = {
      [LogLevel.TRACE]: 7,
      [LogLevel.DEBUG]: 7,
      [LogLevel.INFO]: 6,
      [LogLevel.WARN]: 4,  // Warning
      [LogLevel.ERROR]: 3,
      [LogLevel.FATAL]: 2  // Critical
    };
    
    return mapping[level || LogLevel.INFO] || 6;
  }

  private formatSyslogTimestamp(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = String(date.getDate()).padStart(2, ' ');
    const time = date.toTimeString().substr(0, 8);
    
    return `${month} ${day} ${time}`;
  }

  private formatSyslogMessage(entry: LogEntry): string {
    return this.getLogMessage(entry).replace(/\n/g, ' ');
  }

  private formatSyslogStructuredData(data: any): string {
    const sdElements: string[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        const params = Object.entries(value)
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
          .join(' ');
        sdElements.push(`[${key} ${params}]`);
      }
    }
    
    return sdElements.length > 0 ? sdElements.join('') : '-';
  }

  private getLogMessage(entry: LogEntry): string {
    switch (entry.type) {
      case 'action':
        return (entry as ActionLogEntry).action;
      case 'navigation':
        const nav = entry as NavigationLogEntry;
        return `${nav.method} ${nav.url}`;
      case 'element':
        const elem = entry as ElementLogEntry;
        return `${elem.elementDescription} - ${elem.action}`;
      case 'api':
        const api = entry as APILogEntry;
        return `${api.method} ${api.url} - ${api.statusCode}`;
      case 'error':
        const err = entry as ErrorLogEntry;
        return err.error.message || String(err.error);
      default:
        return 'message' in entry && entry.message ? entry.message : entry.type;
    }
  }

  private createTemplateContext(entry: LogEntry): any {
    return {
      timestamp: entry.timestamp,
      level: entry.level,
      type: entry.type,
      correlationId: entry.correlationId,
      sessionId: entry.sessionId,
      context: entry.context,
      metadata: entry.metadata,
      ...this.getTypeSpecificData(entry),
      
      formatDate: (date: Date, format: string) => this.formatTimestamp(date, format),
      truncate: (str: string, len: number) => this.truncate(str, len),
      json: (obj: any) => JSON.stringify(obj),
      upper: (str: string) => str.toUpperCase(),
      lower: (str: string) => str.toLowerCase()
    };
  }

  private supportsColors(): boolean {
    if (process.env['NO_COLOR']) return false;
    if (process.env['FORCE_COLOR']) return true;
    
    if (!process.stdout.isTTY) return false;
    
    if (process.platform === 'win32') {
      return true;
    }
    
    if (process.env['TERM']) {
      return /color|ansi|cygwin|linux/i.test(process.env['TERM']);
    }
    
    return true;
  }

  private generateCacheKey(entry: LogEntry, format: LogFormat, options?: FormatOptions): string {
    return `${entry.id}_${format}_${JSON.stringify(options || {})}`;
  }

  private applyCustomFormatters(format: string, formatted: string, entry: LogEntry): string {
    const rules = this.customFormatters.get(format) || [];
    
    return rules.reduce((result, rule) => {
      if (rule.condition(entry)) {
        return rule.formatter(result, entry);
      }
      return result;
    }, formatted);
  }

  private registerDefaultDataFormatters(): void {
    this.dataFormatters.set('url', {
      format: (url: string) => {
        try {
          const urlObj = new URL(url);
          return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        } catch {
          return url;
        }
      }
    });
    
    this.dataFormatters.set('duration', {
      format: (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
      }
    });
    
    this.dataFormatters.set('size', {
      format: (bytes: number) => this.formatFileSize(bytes)
    });
    
    this.dataFormatters.set('error', {
      format: (error: any) => {
        if (error.message) return error.message;
        if (typeof error === 'string') return error;
        return JSON.stringify(error);
      }
    });
  }

  private registerDefaultStructuredFormatters(): void {
    this.structuredFormatters.set('jsonl', {
      format: (entries: LogEntry[]) => {
        return entries.map(e => JSON.stringify(e)).join('\n');
      }
    });
    
    this.structuredFormatters.set('csv-full', {
      format: (entries: LogEntry[]) => {
        if (entries.length === 0) return '';
        
        const allFields = new Set<string>();
        entries.forEach(entry => {
          Object.keys(this.prepareJSONObject(entry)).forEach(field => {
            allFields.add(field);
          });
        });
        
        const fields = Array.from(allFields);
        const headers = fields.join(',');
        
        const rows = entries.map(entry => {
          const obj = this.prepareJSONObject(entry);
          return fields.map(field => {
            const value = obj[field];
            return this.formatCSVValue(value);
          }).join(',');
        });
        
        return [headers, ...rows].join('\n');
      }
    });
  }

  private formatCSVValue(value: any): string {
    if (value === null || value === undefined) return '';
    
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
  }

  private registerDefaultTemplates(): void {
    this.templateEngine.register('default', 
      '{{formatDate timestamp "HH:mm:ss.SSS"}} [{{upper level}}] [{{upper type}}] {{message}}'
    );
    
    this.templateEngine.register('detailed',
      `{{formatDate timestamp "YYYY-MM-DD HH:mm:ss.SSS"}} [{{level}}] [{{type}}] {{correlationId}}
  Message: {{message}}
  Context: {{json context}}
  Metadata: {{json metadata}}`
    );
    
    this.templateEngine.register('minimal',
      '{{formatDate timestamp "HH:mm:ss"}} {{level}} {{message}}'
    );
  }

  private createDefaultColorScheme(): ColorScheme {
    return {
      timestamp: this.ansiColors.gray,
      level: {
        [LogLevel.TRACE]: this.ansiColors.gray,
        [LogLevel.DEBUG]: this.ansiColors.blue,
        [LogLevel.INFO]: this.ansiColors.green,
        [LogLevel.WARN]: this.ansiColors.yellow,
        [LogLevel.ERROR]: this.ansiColors.red,
        [LogLevel.FATAL]: this.ansiColors.bgRed + this.ansiColors.brightWhite
      },
      type: {
        action: this.ansiColors.cyan,
        navigation: this.ansiColors.blue,
        element: this.ansiColors.magenta,
        api: this.ansiColors.brightBlue,
        database: this.ansiColors.yellow,
        validation: this.ansiColors.brightMagenta,
        error: this.ansiColors.red,
        performance: this.ansiColors.brightCyan,
        screenshot: this.ansiColors.brightGreen,
        network: this.ansiColors.brightBlue,
        console: this.ansiColors.gray
      },
      success: this.ansiColors.green,
      failure: this.ansiColors.red,
      warning: this.ansiColors.yellow,
      info: this.ansiColors.blue,
      muted: this.ansiColors.gray
    };
  }
}


class TemplateEngine implements ITemplateEngine {
  private templates: Map<string, string> = new Map();
  private compiled: Map<string, CompiledTemplate> = new Map();

  register(name: string, template: string): void {
    this.templates.set(name, template);
    this.compiled.set(name, this.compile(template));
  }

  get(name: string): string | undefined {
    return this.templates.get(name);
  }

  render(template: string, context: any): string {
    const compiled = this.compile(template);
    return compiled(context);
  }

  private compile(template: string): CompiledTemplate {
    return (context: any) => {
      return template.replace(/\{\{([^}]+)\}\}/g, (_match, expression) => {
        const trimmed = expression.trim();
        
        if (trimmed.includes('(')) {
          const [funcName, ...args] = trimmed.split(/[(),]/).map((s: string) => s.trim());
          if (context[funcName] && typeof context[funcName] === 'function') {
            const processedArgs = args.map((arg: string) => {
              if (arg.startsWith('"') && arg.endsWith('"')) {
                return arg.slice(1, -1);
              }
              return this.getValue(context, arg);
            });
            return context[funcName](...processedArgs);
          }
        }
        
        return String(this.getValue(context, trimmed) || '');
      });
    };
  }

  private getValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
}

class FormatCache implements IFormatCache {
  private cache: Map<string, string> = new Map();
  private accessOrder: string[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.updateAccessOrder(key);
    }
    return value;
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }
    
    this.cache.set(key, value);
    this.updateAccessOrder(key);
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }
}

type CompiledTemplate = (context: any) => string;
