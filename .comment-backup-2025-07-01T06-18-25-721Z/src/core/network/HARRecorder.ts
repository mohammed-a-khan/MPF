import { Page, BrowserContext } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import { 
    HAROptions, 
    HAR, 
    HAREntry,
    HARAnalysis,
    PerformanceMetrics,
    HARFilter,
    WaterfallData,
    TimelineEntry
} from './types/network.types';

/**
 * HARRecorder - Complete HTTP Archive recording and analysis
 * Records all network traffic and provides comprehensive analysis
 */
export class HARRecorder {
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private isRecording: boolean = false;
    private recordingStartTime: number = 0;
    private harPath: string | null = null;
    private options: HAROptions;
    private harData: HAR | null = null;

    constructor(options: HAROptions = {}) {
        this.options = {
            content: 'embed',
            maxSize: 50 * 1024 * 1024, // 50MB default
            ...options
        };
    }

    /**
     * Start HAR recording
     */
    async startRecording(page: Page, options?: HAROptions): Promise<void> {
        if (this.isRecording) {
            const logger = Logger.getInstance();
            logger.warn('HARRecorder: Recording already in progress');
            return;
        }

        try {
            this.page = page;
            this.context = page.context();
            this.options = { ...this.options, ...options };
            
            // Generate HAR path
            this.harPath = `./har/recording_${Date.now()}.har`;
            await FileUtils.ensureDir('./har');

            // Start recording with proper options
            const routeOptions: any = {
                update: true,
                updateMode: 'full'
            };
            
            if (this.options.content !== undefined) {
                routeOptions.updateContent = this.options.content;
            }
            
            await this.context.routeFromHAR(this.harPath, routeOptions);

            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Set up performance monitoring
            await this.setupPerformanceMonitoring();
            
            ActionLogger.logInfo('HAR recording started', {
                path: this.harPath,
                options: this.options
            });
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('HARRecorder: Failed to start recording', error as Error);
            throw error;
        }
    }

    /**
     * Stop HAR recording
     */
    async stopRecording(): Promise<HAR> {
        if (!this.isRecording) {
            throw new Error('HARRecorder: No recording in progress');
        }

        try {
            this.isRecording = false;
            const recordingDuration = Date.now() - this.recordingStartTime;
            
            // Stop routing to allow HAR file to be finalized
            await this.context!.unrouteAll();
            
            // Wait a bit for file to be written
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Load and parse HAR file
            this.harData = await this.loadHAR(this.harPath!);
            
            // Enhance HAR with performance metrics
            await this.enhanceHARWithMetrics();
            
            ActionLogger.logInfo('HAR recording stopped', {
                path: this.harPath,
                duration: recordingDuration,
                entriesCount: this.harData.log.entries.length
            });
            
            return this.harData;
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('HARRecorder: Failed to stop recording', error as Error);
            throw error;
        }
    }

    /**
     * Pause recording
     */
    async pauseRecording(): Promise<void> {
        if (!this.isRecording) {
            throw new Error('HARRecorder: No recording in progress');
        }

        // Temporarily unroute to pause recording
        await this.context!.unrouteAll();
        this.isRecording = false;
        
        ActionLogger.logInfo('HAR recording paused', {
            path: this.harPath
        });
    }

    /**
     * Resume recording
     */
    async resumeRecording(): Promise<void> {
        if (this.isRecording || !this.harPath) {
            throw new Error('HARRecorder: Cannot resume - no paused recording');
        }

        const routeOptions: any = {
            update: true,
            updateMode: 'full'
        };
        
        if (this.options.content !== undefined) {
            routeOptions.updateContent = this.options.content;
        }
        
        await this.context!.routeFromHAR(this.harPath, routeOptions);
        
        this.isRecording = true;
        
        ActionLogger.logInfo('HAR recording resumed', {
            path: this.harPath
        });
    }

    /**
     * Save HAR to file
     */
    async saveHAR(path: string): Promise<void> {
        if (!this.harData) {
            throw new Error('HARRecorder: No HAR data available');
        }

        await FileUtils.writeFile(path, JSON.stringify(this.harData, null, 2));
        
        ActionLogger.logInfo('HAR saved', {
            path,
            size: JSON.stringify(this.harData).length
        });
    }

    /**
     * Load HAR from file
     */
    async loadHAR(path: string): Promise<HAR> {
        try {
            const content = await FileUtils.readFile(path, 'utf8');
            const har = JSON.parse(content as string) as HAR;
            
            // Validate HAR structure
            if (!har.log || !har.log.entries) {
                throw new Error('Invalid HAR format');
            }
            
            return har;
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('HARRecorder: Failed to load HAR', error as Error);
            throw error;
        }
    }

    /**
     * Analyze HAR data
     */
    analyzeHAR(har: HAR = this.harData!): HARAnalysis {
        if (!har) {
            throw new Error('HARRecorder: No HAR data to analyze');
        }

        const entries = har.log.entries;
        
        // Calculate summary statistics
        const summary = {
            totalRequests: entries.length,
            totalSize: entries.reduce((sum, entry) => sum + (entry.response.bodySize || 0), 0),
            totalTime: this.calculateTotalTime(entries),
            averageResponseTime: this.calculateAverageResponseTime(entries),
            cacheHitRate: this.calculateCacheHitRate(entries)
        };

        // Break down by type
        const breakdown = {
            byType: this.breakdownByType(entries),
            byDomain: this.breakdownByDomain(entries),
            byStatus: this.breakdownByStatus(entries)
        };

        // Performance analysis
        const performance = {
            slowestRequests: this.findSlowRequests(har, 1000).slice(0, 10),
            largestRequests: this.findLargeRequests(har, 1024 * 1024).slice(0, 10),
            failedRequests: this.findFailedRequests(har),
            timeline: this.createTimeline(entries)
        };

        const analysis: HARAnalysis = {
            summary,
            breakdown,
            performance
        };

        ActionLogger.logInfo('HAR analyzed', {
            totalRequests: summary.totalRequests,
            totalSize: summary.totalSize
        });

        return analysis;
    }

    /**
     * Filter HAR entries
     */
    filterEntries(har: HAR, filter: HARFilter): HAREntry[] {
        let entries = [...har.log.entries];
        
        // Filter by URL pattern
        if (filter.urlPattern) {
            entries = entries.filter(entry => {
                if (filter.urlPattern instanceof RegExp) {
                    return filter.urlPattern.test(entry.request.url);
                }
                return entry.request.url.includes(filter.urlPattern as string);
            });
        }
        
        // Filter by method
        if (filter.method) {
            entries = entries.filter(entry => entry.request.method === filter.method);
        }
        
        // Filter by status
        if (filter.status) {
            entries = entries.filter(entry => {
                if (Array.isArray(filter.status)) {
                    return filter.status.includes(entry.response.status);
                }
                return entry.response.status === filter.status;
            });
        }
        
        // Filter by content type
        if (filter.contentType) {
            entries = entries.filter(entry => {
                const contentType = entry.response.headers.find(
                    h => h.name.toLowerCase() === 'content-type'
                )?.value || '';
                return contentType.includes(filter.contentType!);
            });
        }
        
        // Filter by minimum duration
        if (filter.minDuration !== undefined) {
            entries = entries.filter(entry => entry.time >= filter.minDuration!);
        }
        
        // Filter by minimum size
        if (filter.minSize !== undefined) {
            entries = entries.filter(entry => 
                (entry.response.bodySize || 0) >= filter.minSize!
            );
        }
        
        return entries;
    }

    /**
     * Get performance metrics from HAR
     */
    getPerformanceMetrics(har: HAR = this.harData!): PerformanceMetrics {
        if (!har) {
            throw new Error('HARRecorder: No HAR data available');
        }

        const entries = har.log.entries;
        const pages = har.log.pages || [];
        
        // Calculate metrics
        const metrics: PerformanceMetrics = {
            pageLoadTime: this.calculatePageLoadTime(entries, pages),
            domContentLoaded: this.calculateDOMContentLoaded(entries, pages),
            firstPaint: this.calculateFirstPaint(entries),
            firstContentfulPaint: this.calculateFirstContentfulPaint(entries),
            largestContentfulPaint: this.calculateLargestContentfulPaint(entries),
            timeToInteractive: this.calculateTimeToInteractive(entries),
            totalBlockingTime: this.calculateTotalBlockingTime(entries),
            cumulativeLayoutShift: 0 // Would need real browser metrics
        };

        return metrics;
    }

    /**
     * Find slow requests
     */
    findSlowRequests(har: HAR, threshold: number = 1000): HAREntry[] {
        return har.log.entries
            .filter(entry => entry.time > threshold)
            .sort((a, b) => b.time - a.time);
    }

    /**
     * Find large requests
     */
    findLargeRequests(har: HAR, sizeThreshold: number = 1024 * 1024): HAREntry[] {
        return har.log.entries
            .filter(entry => (entry.response.bodySize || 0) > sizeThreshold)
            .sort((a, b) => (b.response.bodySize || 0) - (a.response.bodySize || 0));
    }

    /**
     * Find failed requests
     */
    findFailedRequests(har: HAR): HAREntry[] {
        return har.log.entries.filter(entry => 
            entry.response.status >= 400 || entry.response.status === 0
        );
    }

    /**
     * Generate waterfall visualization data
     */
    generateWaterfall(har: HAR = this.harData!): WaterfallData {
        if (!har) {
            throw new Error('HARRecorder: No HAR data available');
        }

        const entries = har.log.entries;
        const startTime = entries.length > 0 
            ? new Date(entries[0]!.startedDateTime).getTime() 
            : 0;

        const waterfallData: WaterfallData = {
            entries: entries.map(entry => {
                const entryStartTime = new Date(entry.startedDateTime).getTime();
                const relativeStart = entryStartTime - startTime;
                
                return {
                    url: entry.request.url,
                    method: entry.request.method,
                    status: entry.response.status,
                    mimeType: entry.response.content.mimeType,
                    startTime: relativeStart,
                    duration: entry.time,
                    size: entry.response.bodySize || 0,
                    timings: {
                        blocked: entry.timings.blocked || 0,
                        dns: entry.timings.dns || 0,
                        connect: entry.timings.connect || 0,
                        ssl: entry.timings.ssl || 0,
                        send: entry.timings.send || 0,
                        wait: entry.timings.wait || 0,
                        receive: entry.timings.receive || 0
                    }
                };
            }),
            totalTime: this.calculateTotalTime(entries),
            startTime
        };

        return waterfallData;
    }

    /**
     * Export HAR analysis as HTML report
     */
    async exportAnalysisHTML(analysis: HARAnalysis, outputPath: string): Promise<void> {
        const html = this.generateAnalysisHTML(analysis);
        await FileUtils.writeFile(outputPath, html);
        
        ActionLogger.logInfo('HAR analysis exported', {
            path: outputPath
        });
    }

    // Private helper methods

    private async setupPerformanceMonitoring(): Promise<void> {
        if (!this.page) return;

        // Inject performance monitoring script
        await this.page.addInitScript(() => {
            (window as any).__harRecorderMetrics = {
                firstPaint: 0,
                firstContentfulPaint: 0,
                largestContentfulPaint: 0,
                domContentLoaded: 0,
                loadComplete: 0
            };

            // Monitor performance events
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'paint') {
                        if (entry.name === 'first-paint') {
                            (window as any).__harRecorderMetrics.firstPaint = entry.startTime;
                        } else if (entry.name === 'first-contentful-paint') {
                            (window as any).__harRecorderMetrics.firstContentfulPaint = entry.startTime;
                        }
                    } else if (entry.entryType === 'largest-contentful-paint') {
                        (window as any).__harRecorderMetrics.largestContentfulPaint = entry.startTime;
                    }
                }
            });
            
            observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });

            // DOM events
            document.addEventListener('DOMContentLoaded', () => {
                (window as any).__harRecorderMetrics.domContentLoaded = performance.now();
            });

            window.addEventListener('load', () => {
                (window as any).__harRecorderMetrics.loadComplete = performance.now();
            });
        });
    }

    private async enhanceHARWithMetrics(): Promise<void> {
        if (!this.page || !this.harData) return;

        try {
            // Get performance metrics from page
            const metrics = await this.page.evaluate(() => {
                return (window as any).__harRecorderMetrics || {};
            });

            // Add custom data to HAR
            this.harData.log._performanceMetrics = metrics;
        } catch (error) {
            const logger = Logger.getInstance();
            logger.warn('HARRecorder: Could not enhance HAR with metrics', { error });
        }
    }

    private calculateTotalTime(entries: HAREntry[]): number {
        if (entries.length === 0) return 0;
        
        const firstStart = new Date(entries[0]!.startedDateTime).getTime();
        const lastEnd = Math.max(...entries.map(entry => 
            new Date(entry.startedDateTime).getTime() + entry.time
        ));
        
        return lastEnd - firstStart;
    }

    private calculateAverageResponseTime(entries: HAREntry[]): number {
        if (entries.length === 0) return 0;
        const totalTime = entries.reduce((sum, entry) => sum + entry.time, 0);
        return totalTime / entries.length;
    }

    private calculateCacheHitRate(entries: HAREntry[]): number {
        const cached = entries.filter(entry => 
            entry.response.status === 304 || 
            entry.response.headers.some(h => 
                h.name.toLowerCase() === 'x-cache' && h.value.includes('HIT')
            )
        ).length;
        
        return entries.length > 0 ? (cached / entries.length) * 100 : 0;
    }

    private breakdownByType(entries: HAREntry[]): Record<string, { count: number; size: number }> {
        const breakdown: Record<string, { count: number; size: number }> = {};
        
        entries.forEach(entry => {
            const type = this.getResourceType(entry.response.content.mimeType);
            if (!breakdown[type]) {
                breakdown[type] = { count: 0, size: 0 };
            }
            breakdown[type].count++;
            breakdown[type].size += entry.response.bodySize || 0;
        });
        
        return breakdown;
    }

    private breakdownByDomain(entries: HAREntry[]): Record<string, { count: number; size: number }> {
        const breakdown: Record<string, { count: number; size: number }> = {};
        
        entries.forEach(entry => {
            const url = new URL(entry.request.url);
            const domain = url.hostname;
            
            if (!breakdown[domain]) {
                breakdown[domain] = { count: 0, size: 0 };
            }
            breakdown[domain].count++;
            breakdown[domain].size += entry.response.bodySize || 0;
        });
        
        return breakdown;
    }

    private breakdownByStatus(entries: HAREntry[]): Record<string, number> {
        const breakdown: Record<string, number> = {};
        
        entries.forEach(entry => {
            const statusGroup = `${Math.floor(entry.response.status / 100)}xx`;
            breakdown[statusGroup] = (breakdown[statusGroup] || 0) + 1;
        });
        
        return breakdown;
    }

    private createTimeline(entries: HAREntry[]): TimelineEntry[] {
        if (entries.length === 0) return [];
        
        const startTime = new Date(entries[0]!.startedDateTime).getTime();
        
        return entries.map(entry => ({
            timestamp: new Date(entry.startedDateTime).getTime() - startTime,
            type: 'request' as const,
            url: entry.request.url,
            duration: entry.time,
            status: entry.response.status
        }));
    }

    private getResourceType(mimeType: string): string {
        if (mimeType.includes('html')) return 'document';
        if (mimeType.includes('css')) return 'stylesheet';
        if (mimeType.includes('javascript') || mimeType.includes('script')) return 'script';
        if (mimeType.includes('image')) return 'image';
        if (mimeType.includes('font')) return 'font';
        if (mimeType.includes('video') || mimeType.includes('audio')) return 'media';
        if (mimeType.includes('json') || mimeType.includes('xml')) return 'xhr';
        return 'other';
    }

    private calculatePageLoadTime(entries: HAREntry[], pages: any[]): number {
        if (pages.length > 0 && pages[0].pageTimings) {
            return pages[0].pageTimings.onLoad || 0;
        }
        return this.calculateTotalTime(entries);
    }

    private calculateDOMContentLoaded(_entries: HAREntry[], pages: any[]): number {
        if (pages.length > 0 && pages[0].pageTimings) {
            return pages[0].pageTimings.onContentLoad || 0;
        }
        return 0;
    }

    private calculateFirstPaint(entries: HAREntry[]): number {
        // Would need real browser metrics
        return entries.length > 0 ? entries[0]!.time : 0;
    }

    private calculateFirstContentfulPaint(entries: HAREntry[]): number {
        // Find first content response
        const contentEntry = entries.find(entry => 
            entry.response.content.mimeType.includes('html') ||
            entry.response.content.mimeType.includes('image')
        );
        return contentEntry ? contentEntry.time : 0;
    }

    private calculateLargestContentfulPaint(entries: HAREntry[]): number {
        // Find largest content response
        const largestEntry = entries
            .filter(entry => entry.response.content.mimeType.includes('image'))
            .sort((a, b) => (b.response.bodySize || 0) - (a.response.bodySize || 0))[0];
        
        return largestEntry ? largestEntry.time : 0;
    }

    private calculateTimeToInteractive(entries: HAREntry[]): number {
        // Simplified: when main JS files are loaded
        const jsEntries = entries.filter(entry => 
            entry.response.content.mimeType.includes('javascript')
        );
        
        if (jsEntries.length === 0) return 0;
        
        const lastJsLoad = Math.max(...jsEntries.map(entry => 
            new Date(entry.startedDateTime).getTime() + entry.time
        ));
        
        const firstStart = new Date(entries[0]!.startedDateTime).getTime();
        return lastJsLoad - firstStart;
    }

    private calculateTotalBlockingTime(entries: HAREntry[]): number {
        // Sum of long tasks (>50ms)
        return entries
            .filter(entry => entry.time > 50)
            .reduce((sum, entry) => sum + (entry.time - 50), 0);
    }

    private generateAnalysisHTML(analysis: HARAnalysis): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>HAR Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 24px; font-weight: bold; color: #93186C; }
        .metric-label { color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #93186C; color: white; }
        .failed { color: #dc3545; }
        .slow { color: #ffc107; }
        .chart { margin: 20px 0; }
    </style>
</head>
<body>
    <h1>HAR Analysis Report</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <div class="metric">
            <div class="metric-value">${analysis.summary.totalRequests}</div>
            <div class="metric-label">Total Requests</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(analysis.summary.totalSize / 1024 / 1024).toFixed(2)} MB</div>
            <div class="metric-label">Total Size</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(analysis.summary.totalTime / 1000).toFixed(2)}s</div>
            <div class="metric-label">Total Time</div>
        </div>
        <div class="metric">
            <div class="metric-value">${analysis.summary.averageResponseTime.toFixed(0)}ms</div>
            <div class="metric-label">Avg Response Time</div>
        </div>
        <div class="metric">
            <div class="metric-value">${analysis.summary.cacheHitRate.toFixed(1)}%</div>
            <div class="metric-label">Cache Hit Rate</div>
        </div>
    </div>
    
    <h2>Resource Breakdown</h2>
    <table>
        <tr>
            <th>Type</th>
            <th>Count</th>
            <th>Size</th>
        </tr>
        ${Object.entries(analysis.breakdown.byType).map(([type, data]) => `
            <tr>
                <td>${type}</td>
                <td>${data.count}</td>
                <td>${(data.size / 1024).toFixed(2)} KB</td>
            </tr>
        `).join('')}
    </table>
    
    <h2>Failed Requests</h2>
    ${analysis.performance.failedRequests.length === 0 ? 
        '<p>No failed requests</p>' :
        `<table>
            <tr>
                <th>URL</th>
                <th>Status</th>
                <th>Time</th>
            </tr>
            ${analysis.performance.failedRequests.map(entry => `
                <tr class="failed">
                    <td>${entry.request.url}</td>
                    <td>${entry.response.status}</td>
                    <td>${entry.time}ms</td>
                </tr>
            `).join('')}
        </table>`
    }
    
    <h2>Slowest Requests</h2>
    <table>
        <tr>
            <th>URL</th>
            <th>Time</th>
            <th>Size</th>
        </tr>
        ${analysis.performance.slowestRequests.map(entry => `
            <tr class="${entry.time > 3000 ? 'slow' : ''}">
                <td>${entry.request.url}</td>
                <td>${entry.time}ms</td>
                <td>${((entry.response.bodySize || 0) / 1024).toFixed(2)} KB</td>
            </tr>
        `).join('')}
    </table>
</body>
</html>
        `;
    }
}