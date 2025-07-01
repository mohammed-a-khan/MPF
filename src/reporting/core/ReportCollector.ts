import { 
    ExecutionResult, 
    EvidenceCollection, 
    CollectedData, 
    Screenshot, 
    Video, 
    ExecutionLog,
    Trace,
    NetworkLog,
    ScreenshotType,
    ImageDimensions,
    ConsoleLog,
    PerformanceLog,
    LogLevel
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import * as path from 'path';

export class ReportCollector {
    private static instance: ReportCollector;
    private logger: Logger;
    private collectionActive: boolean = false;
    private currentSessionId: string = '';
    private collectedDataCache: Map<string, CollectedData> = new Map();
    private evidenceBasePath: string;
    private outputDir: string;

    constructor() {
        this.logger = Logger.getInstance('ReportCollector');
        this.evidenceBasePath = path.join(process.cwd(), 'reports', 'evidence');
        this.outputDir = path.join(process.cwd(), 'test-results');
        this.initializeCollectors();
    }
    
    static getInstance(): ReportCollector {
        if (!ReportCollector.instance) {
            ReportCollector.instance = new ReportCollector();
        }
        return ReportCollector.instance;
    }

    public async initialize(): Promise<void> {
        // Note: These collectors should have their own initialization logic
        this.logger.info('Initializing collectors...');

        await this.ensureEvidenceDirectories();

        this.logger.info('Report collector initialized');
    }

    public startCollection(sessionId: string): void {
        this.currentSessionId = sessionId;
        this.collectionActive = true;

        // Note: VideoCollector needs to be updated with proper startRecording method
        this.logger.info('Starting video recording for session');

        this.logger.info(`Started collection for session: ${sessionId}`);
    }

    public async stopCollection(): Promise<void> {
        this.collectionActive = false;

        // Note: VideoCollector needs to be updated with proper stopRecording method
        this.logger.info('Stopping video recording for session');

        this.logger.info(`Stopped collection for session: ${this.currentSessionId}`);
    }

    public async collectAllEvidence(executionResult: ExecutionResult): Promise<EvidenceCollection> {
        try {
            this.logger.info('Collecting all evidence');
            const startTime = Date.now();

            const screenshots = await this.collectScreenshots(executionResult);
            const videos = await this.collectVideos(executionResult);
            const logs = await this.collectLogs(executionResult);
            const networkLogs = await this.collectNetworkLogs(executionResult);
            const traces = await this.collectTraces(executionResult);
            const consoleLogs = await this.collectConsoleLogs(executionResult);
            const performanceLogs = await this.collectPerformanceLogs(executionResult);

            const evidence: EvidenceCollection = {
                screenshots,
                videos,
                traces,
                networkLogs,
                consoleLogs,
                performanceLogs,
                downloads: [],
                uploads: []
            };

            const collectedData: CollectedData = {
                screenshots,
                videos,
                logs,
                metrics: performanceLogs,
                network: networkLogs,
                traces
            };
            
            this.collectedDataCache.set(executionResult.executionId, collectedData);

            this.logger.info(`Evidence collection completed in ${Date.now() - startTime}ms`);
            return evidence;

        } catch (error: any) {
            this.logger.error('Evidence collection failed', error as Error);
            throw error;
        }
    }

    public async collectLiveEvidence(): Promise<EvidenceCollection> {
        if (!this.collectionActive) {
            return this.createEmptyEvidence();
        }

        const evidence: EvidenceCollection = {
            screenshots: [],
            videos: [],
            traces: [],
            networkLogs: [],
            consoleLogs: [],
            performanceLogs: [],
            downloads: [],
            uploads: []
        };

        return evidence;
    }

    public getCollectedData(sessionId: string): CollectedData | undefined {
        return this.collectedDataCache.get(sessionId);
    }

    public clearCache(): void {
        const cacheCount = this.collectedDataCache.size;
        this.collectedDataCache.clear();
        this.logger.info(`Cleared collected data cache: ${cacheCount} entries`);
    }
    
    public compactLogs(): void {
        let totalLogsCompacted = 0;
        let totalVideosCompacted = 0;
        let totalScreenshotsCompacted = 0;
        
        for (const [, collectedData] of this.collectedDataCache.entries()) {
            if (collectedData.logs && collectedData.logs.length > 1000) {
                const removed = collectedData.logs.splice(0, collectedData.logs.length - 1000);
                totalLogsCompacted += removed.length;
            }
            
            if (collectedData.videos && collectedData.videos.length > 10) {
                const removed = collectedData.videos.splice(0, collectedData.videos.length - 10);
                totalVideosCompacted += removed.length;
            }
            
            if (collectedData.screenshots && collectedData.screenshots.length > 50) {
                const removed = collectedData.screenshots.splice(0, collectedData.screenshots.length - 50);
                totalScreenshotsCompacted += removed.length;
            }
        }
        
        this.logger.info('Report collector logs compacted', {
            operation: 'report_log_compaction',
            logsCompacted: totalLogsCompacted,
            videosCompacted: totalVideosCompacted,
            screenshotsCompacted: totalScreenshotsCompacted
        });
    }

    private initializeCollectors(): void {
        this.logger.info('Collectors initialization skipped - needs implementation');
    }

    private async ensureEvidenceDirectories(): Promise<void> {
        const directories = [
            this.evidenceBasePath,
            path.join(this.evidenceBasePath, 'screenshots'),
            path.join(this.evidenceBasePath, 'videos'),
            path.join(this.evidenceBasePath, 'logs'),
            path.join(this.evidenceBasePath, 'har'),
            path.join(this.evidenceBasePath, 'traces'),
            path.join(this.evidenceBasePath, 'attachments')
        ];

        for (const dir of directories) {
            await FileUtils.createDir(dir);
        }
    }

    private async collectScreenshots(executionResult: ExecutionResult): Promise<Screenshot[]> {
        const screenshots: Screenshot[] = [];
        const screenshotDir = path.join(this.outputDir, 'screenshots');
        
        this.logger.info('Collecting screenshots...');
        
        try {
            if (await FileUtils.pathExists(screenshotDir)) {
                const files = await FileUtils.readDir(screenshotDir);
                
                for (const file of files) {
                    if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
                        const filePath = path.join(screenshotDir, file);
                        const stats = await FileUtils.getStats(filePath);
                        
                        const parts = file.replace(/\.(png|jpg|jpeg)$/, '').split('_');
                        const scenarioId = parts[0] || 'unknown';
                        const stepId = parts[1];
                        const type = this.parseScreenshotType(parts[2]);
                        const timestamp = parts[3] ? new Date(parseInt(parts[3])) : stats['mtime'];
                        
                        const dimensions = await this.getImageDimensions(filePath);
                        
                        const screenshot: Screenshot = {
                            id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            filename: file,
                            path: filePath,
                            scenarioId,
                            ...(stepId ? { stepId } : {}),
                            type,
                            timestamp,
                            description: `Screenshot for ${scenarioId}${stepId ? ` - ${stepId}` : ''}`,
                            size: stats.size,
                            dimensions,
                            annotations: []
                        };
                        
                        screenshots.push(screenshot);
                    }
                }
            }
            
            for (const scenario of executionResult.scenarios) {
                if (scenario.evidence && scenario.evidence.screenshots) {
                    for (const screenshotPath of scenario.evidence.screenshots) {
                        if (await FileUtils.pathExists(screenshotPath)) {
                            const stats = await FileUtils.getStats(screenshotPath);
                            const dimensions = await this.getImageDimensions(screenshotPath);
                            
                            const screenshot: Screenshot = {
                                id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                filename: path.basename(screenshotPath),
                                path: screenshotPath,
                                scenarioId: scenario.scenarioId,
                                type: ScreenshotType.FAILURE,
                                timestamp: stats['mtime'],
                                description: `Screenshot for scenario: ${scenario.scenario}`,
                                size: stats.size,
                                dimensions,
                                annotations: []
                            };
                            
                            screenshots.push(screenshot);
                        }
                    }
                }
            }
            
            this.logger.info(`Collected ${screenshots.length} screenshots`);
        } catch (error) {
            this.logger.error('Error collecting screenshots', error as Error);
        }

        return screenshots;
    }
    
    private parseScreenshotType(typeStr?: string): ScreenshotType {
        if (!typeStr) return ScreenshotType.STEP;
        
        switch (typeStr.toLowerCase()) {
            case 'failure':
            case 'error':
                return ScreenshotType.FAILURE;
            case 'comparison':
                return ScreenshotType.COMPARISON;
            case 'final':
                return ScreenshotType.FULLPAGE;
            default:
                return ScreenshotType.STEP;
        }
    }
    
    private async getImageDimensions(_filePath: string): Promise<ImageDimensions> {
        return {
            width: 1920,
            height: 1080
        };
    }

    private async collectVideos(executionResult: ExecutionResult): Promise<Video[]> {
        const videos: Video[] = [];
        const videoDir = path.join(this.outputDir, 'videos');
        
        this.logger.info('Collecting videos...');
        
        try {
            if (await FileUtils.pathExists(videoDir)) {
                const files = await FileUtils.readDir(videoDir);
                
                for (const file of files) {
                    if (file.endsWith('.webm') || file.endsWith('.mp4') || file.endsWith('.avi')) {
                        const filePath = path.join(videoDir, file);
                        const stats = await FileUtils.getStats(filePath);
                        
                        const parts = file.replace(/\.(webm|mp4|avi)$/, '').split('_');
                        const scenarioId = parts[0] || 'unknown';
                        const timestamp = parts[1] ? new Date(parseInt(parts[1])) : stats['mtime'];
                        
                        const videoMetadata = await this.getVideoMetadata(filePath);
                        
                        const video: Video = {
                            id: `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            filename: file,
                            path: filePath,
                            scenarioId,
                            size: stats.size,
                            duration: videoMetadata.duration,
                            format: videoMetadata.format,
                            resolution: videoMetadata.resolution,
                            fps: videoMetadata.fps,
                            timestamp
                        };
                        
                        videos.push(video);
                    }
                }
            }
            
            for (const scenario of executionResult.scenarios) {
                if (scenario.evidence && scenario.evidence.video) {
                    const videoPath = scenario.evidence.video;
                    if (await FileUtils.pathExists(videoPath)) {
                        const stats = await FileUtils.getStats(videoPath);
                        const videoMetadata = await this.getVideoMetadata(videoPath);
                        
                        const video: Video = {
                            id: `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            filename: path.basename(videoPath),
                            path: videoPath,
                            scenarioId: scenario.scenarioId,
                            size: stats.size,
                            duration: videoMetadata.duration,
                            format: videoMetadata.format,
                            resolution: videoMetadata.resolution,
                            fps: videoMetadata.fps,
                            timestamp: stats['mtime']
                        };
                        
                        videos.push(video);
                    }
                }
                
                if (scenario.videos) {
                    for (const videoInfo of scenario.videos) {
                        const videoPath = videoInfo.path;
                        if (await FileUtils.pathExists(videoPath)) {
                            const stats = await FileUtils.getStats(videoPath);
                            const videoMetadata = await this.getVideoMetadata(videoPath);
                            
                            const video: Video = {
                                id: `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                filename: path.basename(videoPath),
                                path: videoPath,
                                scenarioId: scenario.scenarioId,
                                size: stats.size,
                                duration: videoMetadata.duration,
                                format: videoMetadata.format,
                                resolution: videoMetadata.resolution,
                                fps: videoMetadata.fps,
                                timestamp: stats['mtime']
                            };
                            
                            videos.push(video);
                        }
                    }
                }
            }
            
            this.logger.info(`Collected ${videos.length} videos`);
        } catch (error) {
            this.logger.error('Error collecting videos', error as Error);
        }

        return videos;
    }
    
    private async getVideoMetadata(filePath: string): Promise<{
        duration: number;
        format: string;
        resolution: string;
        fps: number;
    }> {
        const ext = path.extname(filePath).toLowerCase().substring(1);
        return {
            duration: 60000,
            format: ext,
            resolution: '1920x1080',
            fps: 30
        };
    }

    private async collectLogs(executionResult: ExecutionResult): Promise<ExecutionLog[]> {
        const logs: ExecutionLog[] = [];
        const logDir = path.join(this.outputDir, 'logs');
        
        this.logger.info('Collecting execution logs...');
        
        try {
            if (await FileUtils.pathExists(logDir)) {
                const files = await FileUtils.readDir(logDir);
                
                for (const file of files) {
                    if (file.endsWith('.log') || file.endsWith('.txt')) {
                        const filePath = path.join(logDir, file);
                        const content = await FileUtils.readFile(filePath);
                        const lines = (typeof content === 'string' ? content : content.toString()).split('\n');
                        
                        for (const line of lines) {
                            if (line.trim()) {
                                const logEntry = this.parseLogLine(line, file);
                                if (logEntry) {
                                    logs.push(logEntry);
                                }
                            }
                        }
                    }
                }
            }
            
            for (const scenario of executionResult.scenarios) {
                if (scenario.consoleLogs) {
                    for (const log of scenario.consoleLogs) {
                        const logEntry: ExecutionLog = {
                            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: log.timestamp,
                            level: this.mapLogLevel(log.level),
                            category: 'scenario',
                            message: log.message,
                            context: {
                                scenarioId: scenario.scenarioId,
                                feature: scenario.feature
                            }
                        };
                        logs.push(logEntry);
                    }
                }
                
                if (scenario.steps) {
                    for (const step of scenario.steps) {
                        if (step.result?.error) {
                            const logEntry: ExecutionLog = {
                                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                timestamp: step.endTime || new Date(),
                                level: LogLevel.ERROR,
                                category: 'step',
                                message: step.result.error.message || 'Step failed',
                                context: {
                                    scenarioId: scenario.scenarioId,
                                    stepId: step.stepId,
                                    feature: scenario.feature,
                                    stepText: step.text,
                                    errorStack: step.result.error.stack
                                }
                            };
                            logs.push(logEntry);
                        }
                    }
                }
            }
            
            logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            this.logger.info(`Collected ${logs.length} log entries`);
        } catch (error) {
            this.logger.error('Error collecting logs', error as Error);
        }

        return logs;
    }
    
    private parseLogLine(line: string, filename: string): ExecutionLog | null {
        try {
            const structuredMatch = line.match(/^\[([\d\-T:\.Z]+)\]\s*\[(\w+)\]\s*\[([^\]]+)\]\s*(.+)$/);
            if (structuredMatch) {
                return {
                    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date(structuredMatch[1] || Date.now()),
                    level: this.parseLogLevel(structuredMatch[2] || 'INFO'),
                    category: structuredMatch[3] || 'general',
                    message: structuredMatch[4] || '',
                    context: { source: filename }
                };
            }
            
            const simpleMatch = line.match(/^([\d\-T:\.Z]+)\s+(\w+):\s*(.+)$/);
            if (simpleMatch) {
                return {
                    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date(simpleMatch[1] || Date.now()),
                    level: this.parseLogLevel(simpleMatch[2] || 'INFO'),
                    category: 'general',
                    message: simpleMatch[3] || '',
                    context: { source: filename }
                };
            }
            
            return {
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date(),
                level: LogLevel.INFO,
                category: 'general',
                message: line,
                context: { source: filename }
            };
        } catch (error) {
            return null;
        }
    }
    
    private parseLogLevel(levelStr: string): LogLevel {
        switch (levelStr.toUpperCase()) {
            case 'ERROR':
            case 'ERR':
                return LogLevel.ERROR;
            case 'WARN':
            case 'WARNING':
                return LogLevel.WARN;
            case 'INFO':
                return LogLevel.INFO;
            case 'DEBUG':
                return LogLevel.DEBUG;
            case 'TRACE':
                return LogLevel.TRACE;
            default:
                return LogLevel.INFO;
        }
    }
    
    private mapLogLevel(level: string): LogLevel {
        return this.parseLogLevel(level);
    }

    private async collectNetworkLogs(executionResult: ExecutionResult): Promise<NetworkLog[]> {
        const networkLogs: NetworkLog[] = [];
        const harDir = path.join(this.outputDir, 'network');
        
        this.logger.info('Collecting network logs...');
        
        try {
            if (await FileUtils.pathExists(harDir)) {
                const files = await FileUtils.readDir(harDir);
                
                for (const file of files) {
                    if (file.endsWith('.har')) {
                        const filePath = path.join(harDir, file);
                        const content = await FileUtils.readFile(filePath);
                        
                        try {
                            const har = JSON.parse(typeof content === 'string' ? content : content.toString());
                            if (har.log && har.log.entries) {
                                for (const entry of har.log.entries) {
                                    const networkLog: NetworkLog = {
                                        id: `network_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                        timestamp: new Date(entry.startedDateTime),
                                        method: entry.request.method,
                                        url: entry.request.url,
                                        status: entry.response.status,
                                        duration: entry.time,
                                        requestSize: entry.request.bodySize || 0,
                                        responseSize: entry.response.bodySize || 0,
                                        headers: this.extractHeaders(entry.request.headers),
                                        timing: {
                                            dns: entry.timings?.dns || 0,
                                            connect: entry.timings?.connect || 0,
                                            ssl: entry.timings?.ssl || 0,
                                            send: entry.timings?.send || 0,
                                            wait: entry.timings?.wait || 0,
                                            receive: entry.timings?.receive || 0,
                                            total: entry.time
                                        },
                                        startTime: new Date(entry.startedDateTime),
                                        endTime: new Date(new Date(entry.startedDateTime).getTime() + entry.time),
                                        size: entry.response.content?.size || entry.response.bodySize || 0,
                                        resourceType: entry.response.content?.mimeType || 'unknown',
                                        cached: entry.cache?.beforeRequest !== null,
                                        responseHeaders: this.extractHeaders(entry.response.headers)
                                    };
                                    networkLogs.push(networkLog);
                                }
                            }
                        } catch (parseError) {
                            this.logger.error(`Error parsing HAR file ${file}`, parseError as Error);
                        }
                    }
                }
            }
            
            for (const scenario of executionResult.scenarios) {
                if (scenario.networkLogs) {
                    for (const log of scenario.networkLogs) {
                        networkLogs.push({
                            ...log,
                            id: log.id || `network_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                        });
                    }
                }
            }
            
            networkLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            this.logger.info(`Collected ${networkLogs.length} network log entries`);
        } catch (error) {
            this.logger.error('Error collecting network logs', error as Error);
        }

        return networkLogs;
    }
    
    private extractHeaders(headers: Array<{name: string; value: string}>): Record<string, string> {
        const result: Record<string, string> = {};
        if (headers) {
            for (const header of headers) {
                result[header.name] = header.value;
            }
        }
        return result;
    }

    private async collectTraces(executionResult: ExecutionResult): Promise<Trace[]> {
        const traces: Trace[] = [];
        const traceDir = path.join(this.outputDir, 'traces');
        
        this.logger.info('Collecting traces...');
        
        try {
            if (await FileUtils.pathExists(traceDir)) {
                const files = await FileUtils.readDir(traceDir);
                
                for (const file of files) {
                    if (file.endsWith('.zip') || file.endsWith('.trace')) {
                        const filePath = path.join(traceDir, file);
                        const stats = await FileUtils.getStats(filePath);
                        
                        const parts = file.replace(/\.(zip|trace)$/, '').split('_');
                        const scenarioId = parts[0] || 'unknown';
                        const timestamp = parts[1] ? new Date(parseInt(parts[1])) : stats['mtime'];
                        
                        const trace: Trace = {
                            id: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            filename: file,
                            path: filePath,
                            scenarioId,
                            size: stats.size,
                            duration: 0,
                            timestamp,
                            viewerUrl: this.generateTraceViewerUrl(filePath)
                        };
                        
                        traces.push(trace);
                    }
                }
            }
            
            for (const scenario of executionResult.scenarios) {
                if (scenario.evidence && scenario.evidence.trace) {
                    const tracePath = scenario.evidence.trace;
                    if (await FileUtils.pathExists(tracePath)) {
                        const stats = await FileUtils.getStats(tracePath);
                        
                        const trace: Trace = {
                            id: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            filename: path.basename(tracePath),
                            path: tracePath,
                            scenarioId: scenario.scenarioId,
                            size: stats.size,
                            duration: scenario.duration || 0,
                            timestamp: stats['mtime'],
                            viewerUrl: this.generateTraceViewerUrl(tracePath)
                        };
                        
                        traces.push(trace);
                    }
                }
            }
            
            this.logger.info(`Collected ${traces.length} traces`);
        } catch (error) {
            this.logger.error('Error collecting traces', error as Error);
        }

        return traces;
    }
    
    private generateTraceViewerUrl(tracePath: string): string {
        return `trace://view?file=${encodeURIComponent(tracePath)}`;
    }
    
    private async collectConsoleLogs(executionResult: ExecutionResult): Promise<ConsoleLog[]> {
        const consoleLogs: ConsoleLog[] = [];
        
        this.logger.info('Collecting console logs...');
        
        try {
            for (const scenario of executionResult.scenarios) {
                if (scenario.consoleLogs) {
                    for (const log of scenario.consoleLogs) {
                        consoleLogs.push({
                            ...log,
                            timestamp: log.timestamp || new Date()
                        });
                    }
                }
                
                if (scenario.evidence && scenario.evidence.consoleLogs) {
                    for (const log of scenario.evidence.consoleLogs) {
                        if (!consoleLogs.some(existing => 
                            existing.timestamp === log.timestamp && 
                            existing.message === log.message)) {
                            consoleLogs.push(log);
                        }
                    }
                }
            }
            
            consoleLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            this.logger.info(`Collected ${consoleLogs.length} console log entries`);
        } catch (error) {
            this.logger.error('Error collecting console logs', error as Error);
        }
        
        return consoleLogs;
    }
    
    private async collectPerformanceLogs(executionResult: ExecutionResult): Promise<PerformanceLog[]> {
        const performanceLogs: PerformanceLog[] = [];
        const perfDir = path.join(this.outputDir, 'performance');
        
        this.logger.info('Collecting performance logs...');
        
        try {
            if (await FileUtils.pathExists(perfDir)) {
                const files = await FileUtils.readDir(perfDir);
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(perfDir, file);
                        const content = await FileUtils.readFile(filePath);
                        
                        try {
                            const perfData = JSON.parse(typeof content === 'string' ? content : content.toString());
                            
                            if (Array.isArray(perfData)) {
                                for (const entry of perfData) {
                                    const perfLog: PerformanceLog = {
                                        timestamp: new Date(entry.timestamp || Date.now()),
                                        metric: entry.metric || entry.name || 'unknown',
                                        value: entry.value || entry.duration || 0,
                                        unit: entry.unit || 'ms',
                                        context: entry.context || file.replace('.json', '')
                                    };
                                    performanceLogs.push(perfLog);
                                }
                            } else if (perfData.metrics) {
                                for (const [metric, value] of Object.entries(perfData.metrics)) {
                                    const perfLog: PerformanceLog = {
                                        timestamp: new Date(perfData.timestamp || Date.now()),
                                        metric,
                                        value: typeof value === 'number' ? value : 0,
                                        unit: 'ms',
                                        context: file.replace('.json', '')
                                    };
                                    performanceLogs.push(perfLog);
                                }
                            }
                        } catch (parseError) {
                            this.logger.error(`Error parsing performance file ${file}`, parseError as Error);
                        }
                    }
                }
            }
            
            for (const scenario of executionResult.scenarios) {
                const scenarioPerfLog: PerformanceLog = {
                    timestamp: scenario.endTime,
                    metric: 'scenario_duration',
                    value: scenario.duration,
                    unit: 'ms',
                    context: `scenario:${scenario.scenarioId}`
                };
                performanceLogs.push(scenarioPerfLog);
                
                if (scenario.steps) {
                    for (const step of scenario.steps) {
                        const stepPerfLog: PerformanceLog = {
                            timestamp: step.endTime || new Date(),
                            metric: 'step_duration',
                            value: step.duration || 0,
                            unit: 'ms',
                            context: `step:${step.stepId || step.text}`
                        };
                        performanceLogs.push(stepPerfLog);
                    }
                }
            }
            
            performanceLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            this.logger.info(`Collected ${performanceLogs.length} performance log entries`);
        } catch (error) {
            this.logger.error('Error collecting performance logs', error as Error);
        }
        
        return performanceLogs;
    }

    private createEmptyEvidence(): EvidenceCollection {
        return {
            screenshots: [],
            videos: [],
            traces: [],
            networkLogs: [],
            consoleLogs: [],
            performanceLogs: [],
            downloads: [],
            uploads: []
        };
    }
    
    public limitCacheSize(): void {
        const MAX_CACHED_SESSIONS = 20;
        
        if (this.collectedDataCache.size > MAX_CACHED_SESSIONS) {
            const toDelete = this.collectedDataCache.size - MAX_CACHED_SESSIONS;
            const keys = Array.from(this.collectedDataCache.keys()).slice(0, toDelete);
            keys.forEach(key => this.collectedDataCache.delete(key));
            this.logger.info(`Trimmed ${toDelete} old sessions from report cache`);
        }
    }
}
