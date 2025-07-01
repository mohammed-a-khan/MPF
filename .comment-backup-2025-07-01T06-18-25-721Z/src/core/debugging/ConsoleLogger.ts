// src/core/debugging/ConsoleLogger.ts

import { Page, ConsoleMessage } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import { DateUtils } from '../utils/DateUtils';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import * as path from 'path';

/**
 * Captures and manages browser console logs for debugging
 * Provides filtering, analysis, and reporting capabilities
 */
export class ConsoleLogger {
    private static instance: ConsoleLogger;
    private activeSessions: Map<string, ConsoleSession> = new Map();
    private consoleLogPath: string;
    private captureOptions: CaptureOptions = {
        enabled: true,
        captureTypes: 'all',
        includeStackTrace: true,
        includeTimestamp: true,
        filterPatterns: [],
        excludePatterns: [],
        preserveLogs: true
    };
    private logBuffer: Map<string, ConsoleLog[]> = new Map();
    private maxBufferSize: number = 1000;
    private logger: Logger;
    
    private constructor() {
        this.consoleLogPath = path.join(process.cwd(), 'console-logs');
        this.logger = Logger.getInstance('ConsoleLogger');
        this.loadConfiguration();
        this.initialize();
    }
    
    static getInstance(): ConsoleLogger {
        if (!ConsoleLogger.instance) {
            ConsoleLogger.instance = new ConsoleLogger();
        }
        return ConsoleLogger.instance;
    }
    
    private loadConfiguration(): void {
        this.captureOptions = {
            enabled: ConfigurationManager.getBoolean('CONSOLE_CAPTURE_ENABLED', true),
            captureTypes: this.parseLogTypes(ConfigurationManager.get('CONSOLE_CAPTURE_TYPES', 'all')),
            includeStackTrace: ConfigurationManager.getBoolean('CONSOLE_INCLUDE_STACK_TRACE', true),
            includeTimestamp: ConfigurationManager.getBoolean('CONSOLE_INCLUDE_TIMESTAMP', true),
            filterPatterns: this.parseFilterPatterns(ConfigurationManager.get('CONSOLE_FILTER_PATTERNS', '')),
            excludePatterns: this.parseFilterPatterns(ConfigurationManager.get('CONSOLE_EXCLUDE_PATTERNS', '')),
            preserveLogs: ConfigurationManager.getBoolean('CONSOLE_PRESERVE_LOGS', true)
        };
        
        this.maxBufferSize = ConfigurationManager.getInt('CONSOLE_MAX_BUFFER_SIZE', 1000);
    }
    
    private async initialize(): Promise<void> {
        try {
            // Ensure console log directory exists
            await FileUtils.ensureDir(this.consoleLogPath);
            
            // Clean old logs if needed
            if (!this.captureOptions.preserveLogs) {
                await this.cleanOldLogs();
            }
            
            this.logger.info('ConsoleLogger initialized');
            
        } catch (error) {
            this.logger.error(`Failed to initialize ConsoleLogger: ${(error as Error).message}`);
        }
    }
    
    /**
     * Start capturing console logs for a page
     */
    startCapture(page: Page, sessionId?: string): string {
        if (!this.captureOptions.enabled) {
            this.logger.debug('Console capture is disabled');
            return '';
        }
        
        const id = sessionId || this.generateSessionId();
        
        // Check if already capturing
        if (this.activeSessions.has(id)) {
            this.logger.warn(`Console capture already active for session: ${id}`);
            return id;
        }
        
        const session: ConsoleSession = {
            id,
            page,
            startTime: new Date(),
            logs: [],
            stats: {
                total: 0,
                errors: 0,
                warnings: 0,
                info: 0,
                debug: 0,
                verbose: 0
            }
        };
        
        // Set up console message handler
        const messageHandler = (msg: ConsoleMessage) => this.handleConsoleMessage(session, msg);
        page.on('console', messageHandler);
        
        // Store handler reference for cleanup
        session.messageHandler = messageHandler;
        
        this.activeSessions.set(id, session);
        this.logBuffer.set(id, []);
        
        this.logger.info(`📝 Console capture started: ${id}`);
        ActionLogger.logInfo('Console capture started', { sessionId: id });
        
        return id;
    }
    
    /**
     * Stop capturing console logs
     */
    stopCapture(sessionId?: string): ConsoleLog[] {
        const session = sessionId 
            ? this.activeSessions.get(sessionId)
            : this.getLatestSession();
        
        if (!session) {
            this.logger.warn('No active console capture session found');
            return [];
        }
        
        // Remove event listener
        if (session.messageHandler) {
            session.page.off('console', session.messageHandler);
        }
        
        session.endTime = new Date();
        
        // Get logs from buffer
        const logs = this.logBuffer.get(session.id) || [];
        
        // Save logs if needed
        if (this.captureOptions.preserveLogs && logs.length > 0) {
            this.saveLogsAsync(session, logs);
        }
        
        // Clean up
        this.activeSessions.delete(session.id);
        this.logBuffer.delete(session.id);
        
        this.logger.info(`📝 Console capture stopped: ${session.id}`);
        this.logger.info(`   Total logs: ${session.stats.total}`);
        this.logger.info(`   Errors: ${session.stats.errors}, Warnings: ${session.stats.warnings}`);
        ActionLogger.logInfo('Console capture stopped', { sessionId: session.id, stats: session.stats });
        
        return logs;
    }
    
    /**
     * Get console logs for a session
     */
    getConsoleLogs(sessionId?: string): ConsoleLog[] {
        const id = sessionId || this.getLatestSessionId();
        
        if (!id) {
            return [];
        }
        
        return this.logBuffer.get(id) || [];
    }
    
    /**
     * Filter logs by level
     */
    filterLogs(logs: ConsoleLog[], level: LogLevel | LogLevel[]): ConsoleLog[] {
        const levels = Array.isArray(level) ? level : [level];
        return logs.filter(log => levels.includes(log.level));
    }
    
    /**
     * Search logs by text
     */
    searchLogs(logs: ConsoleLog[], searchText: string, caseSensitive: boolean = false): ConsoleLog[] {
        const search = caseSensitive ? searchText : searchText.toLowerCase();
        
        return logs.filter(log => {
            const text = caseSensitive ? log.text : log.text.toLowerCase();
            const argsText = JSON.stringify(log.args).toLowerCase();
            
            return text.includes(search) || argsText.includes(search);
        });
    }
    
    /**
     * Export logs to different formats
     */
    async exportLogs(
        logs: ConsoleLog[],
        format: 'json' | 'text' | 'html' = 'json',
        filePath?: string
    ): Promise<string> {
        try {
            let content: string;
            let extension: string;
            
            switch (format) {
                case 'json':
                    content = JSON.stringify(logs, null, 2);
                    extension = 'json';
                    break;
                    
                case 'text':
                    content = this.formatLogsAsText(logs);
                    extension = 'txt';
                    break;
                    
                case 'html':
                    content = this.formatLogsAsHTML(logs);
                    extension = 'html';
                    break;
                    
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
            
            const outputPath = filePath || 
                path.join(this.consoleLogPath, `console-logs-${DateUtils.toTimestamp(new Date())}.${extension}`);
            
            await FileUtils.writeFile(outputPath, content);
            
            this.logger.info(`Console logs exported: ${outputPath}`);
            
            return outputPath;
            
        } catch (error) {
            this.logger.error(`Failed to export logs: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Analyze console logs for issues
     */
    analyzeLogs(logs: ConsoleLog[]): LogAnalysis {
        const analysis: LogAnalysis = {
            summary: {
                total: logs.length,
                byLevel: {
                    error: 0,
                    warning: 0,
                    info: 0,
                    log: 0,
                    debug: 0,
                    trace: 0
                },
                timeRange: {
                    start: logs[0]?.timestamp || new Date(),
                    end: logs[logs.length - 1]?.timestamp || new Date()
                }
            },
            patterns: [],
            topErrors: [],
            performance: {
                slowOperations: [],
                memoryWarnings: []
            },
            security: {
                sensitiveDataExposure: [],
                mixedContent: [],
                corsIssues: []
            }
        };
        
        // Count by level
        for (const log of logs) {
            const level = log.level.toLowerCase() as keyof typeof analysis.summary.byLevel;
            if (level in analysis.summary.byLevel) {
                (analysis.summary.byLevel as any)[level]++;
            }
        }
        
        // Find patterns
        analysis.patterns = this.findPatterns(logs);
        
        // Get top errors
        analysis.topErrors = this.getTopErrors(logs);
        
        // Analyze performance issues
        analysis.performance = this.analyzePerformance(logs);
        
        // Check for security issues
        analysis.security = this.analyzeSecurityIssues(logs);
        
        return analysis;
    }
    
    /**
     * Get real-time console stats
     */
    getStats(sessionId?: string): ConsoleStats | null {
        const session = sessionId 
            ? this.activeSessions.get(sessionId)
            : this.getLatestSession();
        
        if (!session) {
            return null;
        }
        
        return {
            ...session.stats,
            sessionId: session.id,
            startTime: session.startTime,
            duration: new Date().getTime() - session.startTime.getTime()
        };
    }
    
    /**
     * Clear console logs for a session
     */
    clearLogs(sessionId?: string): void {
        const id = sessionId || this.getLatestSessionId();
        
        if (id && this.logBuffer.has(id)) {
            this.logBuffer.set(id, []);
            
            const session = this.activeSessions.get(id);
            if (session) {
                session.logs = [];
                session.stats = {
                    total: 0,
                    errors: 0,
                    warnings: 0,
                    info: 0,
                    debug: 0,
                    verbose: 0
                };
            }
            
            this.logger.debug(`Console logs cleared for session: ${id}`);
        }
    }
    
    /**
     * Set up automatic error reporting
     */
    enableErrorReporting(_callback: (error: ConsoleLog) => void): void {
        // This would integrate with error reporting services
        this.logger.info('Error reporting enabled for console errors');
    }
    
    /**
     * Generate console log report
     */
    async generateReport(logs: ConsoleLog[]): Promise<string> {
        const analysis = this.analyzeLogs(logs);
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Console Log Report</title>
    <style>
        body { font-family: 'Courier New', monospace; margin: 20px; background: #1e1e1e; color: #d4d4d4; }
        .header { background: #93186C; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { background: #2d2d30; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .stat { display: inline-block; margin: 0 20px 10px 0; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { color: #858585; font-size: 12px; }
        .logs { background: #1e1e1e; padding: 10px; border-radius: 8px; overflow-x: auto; }
        .log { margin: 5px 0; padding: 5px; border-radius: 3px; font-size: 12px; }
        .log.error { background: #5a1e1e; color: #f48771; }
        .log.warning { background: #5a4e1e; color: #dcdcaa; }
        .log.info { background: #1e3a5a; color: #4ec9b0; }
        .log.log { background: #2d2d30; }
        .log.debug { background: #1e1e1e; color: #858585; }
        .timestamp { color: #858585; margin-right: 10px; }
        .location { color: #858585; font-size: 10px; margin-left: 10px; }
        .args { color: #9cdcfe; margin-left: 20px; }
        .section { margin: 20px 0; }
        .error-group { background: #2d2d30; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .count { background: #93186C; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Console Log Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <p>Time Range: ${analysis.summary.timeRange.start.toLocaleTimeString()} - ${analysis.summary.timeRange.end.toLocaleTimeString()}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <div>
            <div class="stat">
                <div class="stat-value">${analysis.summary.total}</div>
                <div class="stat-label">Total Logs</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: #f48771;">${analysis.summary.byLevel['error']}</div>
                <div class="stat-label">Errors</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: #dcdcaa;">${analysis.summary.byLevel['warning']}</div>
                <div class="stat-label">Warnings</div>
            </div>
            <div class="stat">
                <div class="stat-value" style="color: #4ec9b0;">${analysis.summary.byLevel['info']}</div>
                <div class="stat-label">Info</div>
            </div>
        </div>
    </div>
    
    ${analysis.topErrors.length > 0 ? `
        <div class="section">
            <h2>Top Errors</h2>
            ${analysis.topErrors.map(error => `
                <div class="error-group">
                    <span class="count">${error.count}x</span>
                    <span style="color: #f48771;">${this.escapeHtml(error.message)}</span>
                    ${error.stack ? `<pre style="color: #858585; font-size: 10px; margin: 5px 0 0 20px;">${this.escapeHtml(error.stack)}</pre>` : ''}
                </div>
            `).join('')}
        </div>
    ` : ''}
    
    ${analysis.patterns.length > 0 ? `
        <div class="section">
            <h2>Detected Patterns</h2>
            ${analysis.patterns.map(pattern => `
                <div class="error-group">
                    <strong>${pattern.type}:</strong> ${pattern.description}
                    <span class="count">${pattern.occurrences}x</span>
                </div>
            `).join('')}
        </div>
    ` : ''}
    
    <div class="section">
        <h2>Console Logs</h2>
        <div class="logs">
            ${logs.slice(-100).map(log => `
                <div class="log ${log.level.toLowerCase()}">
                    <span class="timestamp">${log.timestamp.toLocaleTimeString()}</span>
                    <span class="level">[${log.level}]</span>
                    ${this.escapeHtml(log.text)}
                    ${log.location ? `<span class="location">${log.location.url}:${log.location.lineNumber}</span>` : ''}
                    ${log.args.length > 0 ? `<div class="args">${this.escapeHtml(JSON.stringify(log.args, null, 2))}</div>` : ''}
                </div>
            `).join('')}
        </div>
        <p style="color: #858585; text-align: center;">Showing last 100 logs</p>
    </div>
</body>
</html>`;
        
        const reportPath = path.join(this.consoleLogPath, `console-report-${DateUtils.toTimestamp(new Date())}.html`);
        await FileUtils.writeFile(reportPath, html);
        
        this.logger.info(`Console log report generated: ${reportPath}`);
        
        return reportPath;
    }
    
    // Private helper methods
    
    private mapConsoleTypeToLogLevel(type: string): LogLevel {
        const mapping: Record<string, LogLevel> = {
            'error': 'error' as LogLevel,
            'warning': 'warning' as LogLevel,
            'info': 'info' as LogLevel,
            'log': 'info' as LogLevel,
            'debug': 'debug' as LogLevel,
            'trace': 'debug' as LogLevel
        };
        return mapping[type] || 'info' as LogLevel;
    }
    
    private handleConsoleMessage(session: ConsoleSession, msg: ConsoleMessage): void {
        try {
            const type = msg.type();
            
            // Check if we should capture this type
            if (this.captureOptions.captureTypes !== 'all' && 
                !this.captureOptions.captureTypes.includes(type as LogLevel)) {
                return;
            }
            
            const text = msg.text();
            
            // Apply filters
            if (!this.shouldCapture(text)) {
                return;
            }
            
            // Extract additional info
            const location = msg.location();
            const args = msg.args();
            
            const log: ConsoleLog = {
                level: this.mapConsoleTypeToLogLevel(type),
                text,
                timestamp: new Date(),
                args: []
            };
            
            if (location) {
                log.location = {
                    url: location.url,
                    lineNumber: location.lineNumber,
                    columnNumber: location.columnNumber
                };
            }
            
            // Process arguments
            if (args.length > 0 && this.captureOptions.includeStackTrace) {
                for (const arg of args) {
                    try {
                        log.args.push(arg.toString());
                    } catch (e) {
                        log.args.push('[Unserializable]');
                    }
                }
            }
            
            // Add to buffer
            const buffer = this.logBuffer.get(session.id) || [];
            buffer.push(log);
            
            // Maintain buffer size
            if (buffer.length > this.maxBufferSize) {
                buffer.shift();
            }
            
            this.logBuffer.set(session.id, buffer);
            
            // Update session stats
            session.stats.total++;
            
            switch (type) {
                case 'error':
                    session.stats.errors++;
                    break;
                case 'warning':
                    session.stats.warnings++;
                    break;
                case 'info':
                    session.stats.info++;
                    break;
                case 'debug':
                    session.stats.debug++;
                    break;
                case 'trace':
                    session.stats.verbose++;
                    break;
            }
            
            // Log significant messages
            if (type === 'error') {
                this.logger.debug(`Browser error: ${text}`);
            }
            
        } catch (error) {
            this.logger.error(`Failed to handle console message: ${(error as Error).message}`);
        }
    }
    
    private shouldCapture(text: string): boolean {
        // Check exclude patterns
        if (this.captureOptions.excludePatterns.length > 0) {
            for (const pattern of this.captureOptions.excludePatterns) {
                if (pattern.test(text)) {
                    return false;
                }
            }
        }
        
        // Check include patterns
        if (this.captureOptions.filterPatterns.length > 0) {
            for (const pattern of this.captureOptions.filterPatterns) {
                if (pattern.test(text)) {
                    return true;
                }
            }
            return false;
        }
        
        return true;
    }
    
    private async saveLogsAsync(session: ConsoleSession, logs: ConsoleLog[]): Promise<void> {
        try {
            const fileName = `console-${session.id}-${DateUtils.toTimestamp(new Date())}.json`;
            const filePath = path.join(this.consoleLogPath, fileName);
            
            const data = {
                sessionId: session.id,
                startTime: session.startTime,
                endTime: session.endTime,
                stats: session.stats,
                logs
            };
            
            await FileUtils.writeJSON(filePath, data);
            
            this.logger.debug(`Console logs saved: ${fileName}`);
            
        } catch (error) {
            this.logger.error(`Failed to save console logs: ${(error as Error).message}`);
        }
    }
    
    private formatLogsAsText(logs: ConsoleLog[]): string {
        return logs.map(log => {
            const timestamp = log.timestamp.toISOString();
            const location = log.location ? ` (${log.location.url}:${log.location.lineNumber})` : '';
            const args = log.args.length > 0 ? `\n  Args: ${JSON.stringify(log.args)}` : '';
            
            return `[${timestamp}] [${log.level}]${location} ${log.text}${args}`;
        }).join('\n');
    }
    
    private formatLogsAsHTML(logs: ConsoleLog[]): string {
        const levelColors = {
            error: '#f48771',
            warning: '#dcdcaa',
            info: '#4ec9b0',
            log: '#d4d4d4',
            debug: '#858585',
            trace: '#858585'
        };
        
        const rows = logs.map(log => {
            const color = levelColors[log.level.toLowerCase() as keyof typeof levelColors] || '#d4d4d4';
            const location = log.location ? 
                `<span style="color: #858585; font-size: 0.9em;">${log.location.url}:${log.location.lineNumber}</span>` : '';
            
            return `
                <tr>
                    <td style="color: #858585;">${log.timestamp.toLocaleTimeString()}</td>
                    <td style="color: ${color}; font-weight: bold;">${log.level}</td>
                    <td>${this.escapeHtml(log.text)} ${location}</td>
                    <td style="color: #9cdcfe;">${log.args.length > 0 ? this.escapeHtml(JSON.stringify(log.args)) : ''}</td>
                </tr>
            `;
        }).join('');
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Console Logs</title>
    <style>
        body { font-family: 'Courier New', monospace; margin: 20px; background: #1e1e1e; color: #d4d4d4; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #2d2d30; padding: 10px; text-align: left; position: sticky; top: 0; }
        td { padding: 5px 10px; border-bottom: 1px solid #2d2d30; }
        tr:hover { background: #2d2d30; }
    </style>
</head>
<body>
    <h1 style="color: #93186C;">Console Logs</h1>
    <table>
        <thead>
            <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Message</th>
                <th>Arguments</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>
</body>
</html>`;
    }
    
    private findPatterns(logs: ConsoleLog[]): LogPattern[] {
        const patterns: LogPattern[] = [];
        const patternMap = new Map<string, number>();
        
        // Common patterns to look for
        const patternDetectors = [
            {
                regex: /Failed to load resource/i,
                type: 'Resource Loading',
                description: 'Resources failing to load'
            },
            {
                regex: /CORS|Cross-Origin/i,
                type: 'CORS Issues',
                description: 'Cross-origin resource sharing problems'
            },
            {
                regex: /deprecated|deprecation/i,
                type: 'Deprecation',
                description: 'Use of deprecated features'
            },
            {
                regex: /memory|heap|gc/i,
                type: 'Memory',
                description: 'Memory-related messages'
            },
            {
                regex: /performance|slow|lag/i,
                type: 'Performance',
                description: 'Performance-related messages'
            }
        ];
        
        for (const log of logs) {
            for (const detector of patternDetectors) {
                if (detector.regex.test(log.text)) {
                    const key = detector.type;
                    patternMap.set(key, (patternMap.get(key) || 0) + 1);
                }
            }
        }
        
        for (const [type, count] of patternMap) {
            const detector = patternDetectors.find(d => d.type === type);
            if (detector && count > 2) {
                patterns.push({
                    type,
                    description: detector.description,
                    occurrences: count
                });
            }
        }
        
        return patterns.sort((a, b) => b.occurrences - a.occurrences);
    }
    
    private getTopErrors(logs: ConsoleLog[]): ErrorSummary[] {
        const errorMap = new Map<string, { count: number; stack?: string }>();
        
        const errors = logs.filter(log => log.level === 'error');
        
        for (const error of errors) {
            const key = this.normalizeErrorMessage(error.text);
            const existing = errorMap.get(key) || { count: 0 };
            existing.count++;
            
            if (!existing.stack && error.args.length > 0) {
                // Try to extract stack trace
                const stackArg = error.args.find(arg => arg.includes('at '));
                if (stackArg) {
                    existing.stack = stackArg;
                }
            }
            
            errorMap.set(key, existing);
        }
        
        return Array.from(errorMap.entries())
            .map(([message, data]) => {
                const result: ErrorSummary = {
                    message,
                    count: data.count,
                    stack: data.stack || ''
                };
                return result;
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }
    
    private analyzePerformance(logs: ConsoleLog[]): PerformanceAnalysis {
        const analysis: PerformanceAnalysis = {
            slowOperations: [],
            memoryWarnings: []
        };
        
        // Look for performance timing logs
        const timingRegex = /took (\d+(?:\.\d+)?)\s*(ms|s|seconds|milliseconds)/i;
        
        for (const log of logs) {
            const match = log.text.match(timingRegex);
            if (match && match[1] && match[2]) {
                let duration = parseFloat(match[1]);
                const unit = match[2].toLowerCase();
                
                // Convert to ms
                if (unit === 's' || unit === 'seconds') {
                    duration *= 1000;
                }
                
                if (duration > 1000) { // Over 1 second
                    analysis.slowOperations.push({
                        operation: log.text,
                        duration,
                        timestamp: log.timestamp
                    });
                }
            }
            
            // Check for memory warnings
            if (/memory|heap|out of memory/i.test(log.text)) {
                analysis.memoryWarnings.push({
                    message: log.text,
                    timestamp: log.timestamp
                });
            }
        }
        
        return analysis;
    }
    
    private analyzeSecurityIssues(logs: ConsoleLog[]): SecurityAnalysis {
        const analysis: SecurityAnalysis = {
            sensitiveDataExposure: [],
            mixedContent: [],
            corsIssues: []
        };
        
        // Patterns that might indicate sensitive data
        const sensitivePatterns = [
            /password|token|api[_-]?key|secret|credential/i,
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
            /\b\d{3}-\d{2}-\d{4}\b/ // SSN pattern
        ];
        
        for (const log of logs) {
            // Check for sensitive data
            for (const pattern of sensitivePatterns) {
                if (pattern.test(log.text)) {
                    analysis.sensitiveDataExposure.push({
                        message: log.text.substring(0, 100) + '...',
                        timestamp: log.timestamp,
                        level: log.level
                    });
                    break;
                }
            }
            
            // Check for mixed content
            if (/mixed content|http:.*https:/i.test(log.text)) {
                analysis.mixedContent.push({
                    message: log.text,
                    timestamp: log.timestamp
                });
            }
            
            // Check for CORS issues
            if (/cors|cross-origin|access-control/i.test(log.text)) {
                analysis.corsIssues.push({
                    message: log.text,
                    timestamp: log.timestamp
                });
            }
        }
        
        return analysis;
    }
    
    private normalizeErrorMessage(message: string): string {
        // Remove line numbers, timestamps, and other variable parts
        return message
            .replace(/:\d+:\d+/g, '') // Line:column
            .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/g, '') // Timestamps
            .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '') // UUIDs
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    private parseLogTypes(types: string): LogLevel[] | 'all' {
        if (types === 'all') return 'all';
        
        return types.split(',')
            .map(t => t.trim())
            .filter(t => ['error', 'warning', 'info', 'log', 'debug', 'trace'].includes(t)) as LogLevel[];
    }
    
    private parseFilterPatterns(patterns: string): RegExp[] {
        if (!patterns) return [];
        
        return patterns.split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => {
                try {
                    return new RegExp(p, 'i');
                } catch (e) {
                    this.logger.warn(`Invalid filter pattern: ${p}`);
                    return null;
                }
            })
            .filter(p => p !== null) as RegExp[];
    }
    
    private async cleanOldLogs(daysToKeep: number = 7): Promise<void> {
        try {
            const files = await FileUtils.readDir(this.consoleLogPath);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            let deletedCount = 0;
            
            for (const file of files) {
                if (file.startsWith('console-') && file.endsWith('.json')) {
                    const filePath = path.join(this.consoleLogPath, file);
                    const stats = await FileUtils.getStats(filePath);
                    
                    if (stats['mtime'] < cutoffDate) {
                        await FileUtils.remove(filePath);
                        deletedCount++;
                    }
                }
            }
            
            if (deletedCount > 0) {
                this.logger.info(`Cleaned ${deletedCount} old console log files`);
            }
            
        } catch (error) {
            this.logger.error(`Failed to clean old console logs: ${(error as Error).message}`);
        }
    }
    
    private getLatestSession(): ConsoleSession | undefined {
        if (this.activeSessions.size === 0) return undefined;
        
        return Array.from(this.activeSessions.values())
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
    }
    
    private getLatestSessionId(): string | undefined {
        return this.getLatestSession()?.id;
    }
    
    private escapeHtml(text: string): string {
        const escapeMap: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        
        return text.replace(/[&<>"']/g, char => escapeMap[char] || char);
    }
    
    private generateSessionId(): string {
        return `console-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Type definitions
type LogLevel = 'error' | 'warning' | 'info' | 'log' | 'debug' | 'trace';

interface CaptureOptions {
    enabled: boolean;
    captureTypes: LogLevel[] | 'all';
    includeStackTrace: boolean;
    includeTimestamp: boolean;
    filterPatterns: RegExp[];
    excludePatterns: RegExp[];
    preserveLogs: boolean;
}

interface ConsoleSession {
    id: string;
    page: Page;
    startTime: Date;
    endTime?: Date;
    logs: ConsoleLog[];
    stats: {
        total: number;
        errors: number;
        warnings: number;
        info: number;
        debug: number;
        verbose: number;
    };
    messageHandler?: (msg: ConsoleMessage) => void;
}

interface ConsoleLog {
    level: LogLevel;
    text: string;
    timestamp: Date;
    args: any[];
    location?: {
        url: string;
        lineNumber: number;
        columnNumber: number;
    };
}

interface ConsoleStats {
    sessionId: string;
    startTime: Date;
    duration: number;
    total: number;
    errors: number;
    warnings: number;
    info: number;
    debug: number;
    verbose: number;
}

interface LogAnalysis {
    summary: {
        total: number;
        byLevel: Record<string, number>;
        timeRange: {
            start: Date;
            end: Date;
        };
    };
    patterns: LogPattern[];
    topErrors: ErrorSummary[];
    performance: PerformanceAnalysis;
    security: SecurityAnalysis;
}

interface LogPattern {
    type: string;
    description: string;
    occurrences: number;
}

interface ErrorSummary {
    message: string;
    count: number;
    stack?: string;
}

interface PerformanceAnalysis {
    slowOperations: Array<{
        operation: string;
        duration: number;
        timestamp: Date;
    }>;
    memoryWarnings: Array<{
        message: string;
        timestamp: Date;
    }>;
}

interface SecurityAnalysis {
    sensitiveDataExposure: Array<{
        message: string;
        timestamp: Date;
        level: LogLevel;
    }>;
    mixedContent: Array<{
        message: string;
        timestamp: Date;
    }>;
    corsIssues: Array<{
        message: string;
        timestamp: Date;
    }>;
}

export { ConsoleLog, LogLevel, ConsoleStats, LogAnalysis };