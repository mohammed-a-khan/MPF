import { ReportOrchestrator } from './ReportOrchestrator';
import { ReportConfig } from './ReportConfig';
import { ReportCollector } from './ReportCollector';
import { ReportAggregator } from './ReportAggregator';
import { ExecutionResult, ReportOptions, ReportResult } from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import { DateUtils } from '../../core/utils/DateUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import * as path from 'path';

export class CSReporter {
    private static instance: CSReporter;
    private reportOrchestrator: ReportOrchestrator;
    private reportConfig: ReportConfig;
    private reportCollector: ReportCollector;
    private reportAggregator: ReportAggregator;
    private logger: Logger;
    private isInitialized: boolean = false;
    private reportStartTime: Date = new Date();
    private reportEndTime: Date = new Date();
    private currentReportId: string = '';
    private reportHistory: Map<string, ReportResult> = new Map();

    private constructor() {
        this.logger = Logger.getInstance('CSReporter');
        this.reportOrchestrator = new ReportOrchestrator();
        this.reportConfig = new ReportConfig();
        this.reportCollector = new ReportCollector();
        this.reportAggregator = new ReportAggregator();
    }

    public static getInstance(): CSReporter {
        if (!CSReporter.instance) {
            CSReporter.instance = new CSReporter();
        }
        return CSReporter.instance;
    }

    public async initialize(options?: Partial<ReportOptions>): Promise<void> {
        try {
            this.logger.info('Initializing CS Reporting System');
            this.reportStartTime = new Date();
            
            await this.loadConfiguration(options);
            
            await this.createReportDirectories();
            
            await this.reportOrchestrator.initialize(this.reportConfig);
            await this.reportCollector.initialize();
            await this.reportAggregator.initialize();
            
            this.currentReportId = this.generateReportId();
            
            this.reportCollector.startCollection(this.currentReportId);
            
            this.isInitialized = true;
            this.logger.info('CS Reporting System initialized successfully');
            
        } catch (error: any) {
            this.logger.error('Failed to initialize reporting system', error);
            throw new Error(`Reporting initialization failed: ${error?.message || 'Unknown error'}`);
        }
    }

    public async generateReport(executionResult: ExecutionResult): Promise<ReportResult> {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            this.logger.info(`Generating report for execution: ${executionResult.executionId}`);
            this.reportEndTime = new Date();

            const evidence = await this.reportCollector.collectAllEvidence(executionResult);
            
            const aggregatedData = await this.reportAggregator.aggregate(executionResult, evidence);
            
            const reportData = this.enrichWithMetadata(aggregatedData);
            
            const reportResult = await this.reportOrchestrator.generateReports(reportData);
            
            this.reportHistory.set(this.currentReportId, reportResult);
            
            if (this.reportConfig.get('autoCleanup')) {
                await this.performCleanup();
            }
            
            this.logger.info(`Report generation completed: ${reportResult.reportPath}`);
            return reportResult;
            
        } catch (error: any) {
            this.logger.error('Report generation failed', error);
            throw new Error(`Failed to generate report: ${error?.message || 'Unknown error'}`);
        }
    }

    public async generateLiveReport(partialResult: Partial<ExecutionResult>): Promise<string> {
        try {
            const liveReportPath = path.join(
                this.reportConfig.get('reportPath'),
                'live',
                `live-report-${this.currentReportId}.html`
            );

            const currentEvidence = await this.reportCollector.collectLiveEvidence();
            
            const liveReport = await this.reportOrchestrator.generateLiveReport(
                partialResult,
                currentEvidence
            );

            await FileUtils.writeFile(liveReportPath, liveReport);
            
            return liveReportPath;
            
        } catch (error: any) {
            this.logger.error('Live report generation failed', error);
            return '';
        }
    }

    public async updateReport(reportId: string, additionalData: any): Promise<void> {
        try {
            const existingReport = this.reportHistory.get(reportId);
            if (!existingReport) {
                throw new Error(`Report not found: ${reportId}`);
            }

            const updatedData = this.mergeReportData(existingReport, additionalData);
            
            await this.reportOrchestrator.updateReport(existingReport, updatedData);
            
            this.logger.info(`Report updated: ${reportId}`);
            
        } catch (error: any) {
            this.logger.error('Report update failed', error);
            throw error;
        }
    }

    public async archiveReport(reportId: string): Promise<string> {
        try {
            const report = this.reportHistory.get(reportId);
            if (!report) {
                throw new Error(`Report not found: ${reportId}`);
            }

            const archivePath = path.join(
                this.reportConfig.get('archivePath'),
                `${reportId}-${DateUtils.format(new Date(), 'YYYYMMDD-HHmmss')}.zip`
            );

            await FileUtils.createZipArchive(report.reportPath, archivePath);
            
            if (!report.metadata) {
                report.metadata = {};
            }
            report.metadata['archived'] = true;
            report.metadata['archivePath'] = archivePath;
            
            this.logger.info(`Report archived: ${archivePath}`);
            return archivePath;
            
        } catch (error: any) {
            this.logger.error('Report archiving failed', error);
            throw error;
        }
    }

    public getReport(reportId: string): ReportResult | undefined {
        return this.reportHistory.get(reportId);
    }

    public getAllReports(): Map<string, ReportResult> {
        return new Map(this.reportHistory);
    }

    public async cleanupOldReports(daysToKeep: number = 30): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            let cleanedCount = 0;
            const reportPath = this.reportConfig.get('reportPath');
            
            const entries = await FileUtils.readDirWithStats(reportPath);
            const reportDirs = entries.filter(entry => entry.stats.isDirectory);
            
            for (const entry of reportDirs) {
                const dirPath = path.join(reportPath, entry.name);
                
                if (entry.stats.modifiedAt < cutoffDate) {
                    await FileUtils.remove(dirPath);
                    cleanedCount++;
                    this.logger.info(`Cleaned up old report: ${entry.name}`);
                }
            }
            
            return cleanedCount;
            
        } catch (error: any) {
            this.logger.error('Report cleanup failed', error);
            throw error;
        }
    }

    public async exportReport(reportId: string, format: 'pdf' | 'excel' | 'json' | 'xml'): Promise<string> {
        try {
            const report = this.reportHistory.get(reportId);
            if (!report) {
                throw new Error(`Report not found: ${reportId}`);
            }

            return await this.reportOrchestrator.exportReport(report, format);
            
        } catch (error: any) {
            this.logger.error('Report export failed', error);
            throw error;
        }
    }

    private async loadConfiguration(options?: Partial<ReportOptions>): Promise<void> {
        const defaultConfig = {
            reportPath: ConfigurationManager.get('REPORT_PATH', './reports'),
            archivePath: ConfigurationManager.get('REPORT_ARCHIVE_PATH', './reports/archive'),
            themePrimaryColor: ConfigurationManager.get('REPORT_THEME_PRIMARY_COLOR', '#93186C'),
            themeSecondaryColor: ConfigurationManager.get('REPORT_THEME_SECONDARY_COLOR', '#FFFFFF'),
            generatePDF: ConfigurationManager.getBoolean('GENERATE_PDF_REPORT', true),
            generateExcel: ConfigurationManager.getBoolean('GENERATE_EXCEL_REPORT', true),
            generateJSON: ConfigurationManager.getBoolean('GENERATE_JSON_REPORT', true),
            generateXML: ConfigurationManager.getBoolean('GENERATE_XML_REPORT', false),
            includeScreenshots: ConfigurationManager.getBoolean('INCLUDE_SCREENSHOTS', true),
            includeVideos: ConfigurationManager.getBoolean('INCLUDE_VIDEOS', true),
            includeLogs: ConfigurationManager.getBoolean('INCLUDE_LOGS', true),
            includeHAR: ConfigurationManager.getBoolean('INCLUDE_HAR', true),
            includeTraces: ConfigurationManager.getBoolean('INCLUDE_TRACES', false),
            autoCleanup: ConfigurationManager.getBoolean('AUTO_CLEANUP_REPORTS', true),
            cleanupDays: ConfigurationManager.getInt('CLEANUP_DAYS', 30),
            companyName: ConfigurationManager.get('COMPANY_NAME', 'CS Automation'),
            companyLogo: ConfigurationManager.get('COMPANY_LOGO', ''),
            reportTitle: ConfigurationManager.get('REPORT_TITLE', 'Test Automation Report'),
            enableCharts: ConfigurationManager.getBoolean('ENABLE_CHARTS', true),
            enableTimeline: ConfigurationManager.getBoolean('ENABLE_TIMELINE', true),
            enableTrends: ConfigurationManager.getBoolean('ENABLE_TRENDS', true),
            maxScreenshotsPerTest: ConfigurationManager.getInt('MAX_SCREENSHOTS_PER_TEST', 10),
            compressImages: ConfigurationManager.getBoolean('COMPRESS_IMAGES', true),
            imageQuality: ConfigurationManager.getInt('IMAGE_QUALITY', 85)
        };

        const finalConfig = { ...defaultConfig, ...options };
        
        await this.reportConfig.load(finalConfig as any);
    }

    private async createReportDirectories(): Promise<void> {
        const directories = [
            this.reportConfig.get('reportPath'),
            path.join(this.reportConfig.get('reportPath'), 'html'),
            path.join(this.reportConfig.get('reportPath'), 'pdf'),
            path.join(this.reportConfig.get('reportPath'), 'excel'),
            path.join(this.reportConfig.get('reportPath'), 'json'),
            path.join(this.reportConfig.get('reportPath'), 'xml'),
            path.join(this.reportConfig.get('reportPath'), 'live'),
            path.join(this.reportConfig.get('reportPath'), 'evidence'),
            path.join(this.reportConfig.get('reportPath'), 'evidence', 'screenshots'),
            path.join(this.reportConfig.get('reportPath'), 'evidence', 'videos'),
            path.join(this.reportConfig.get('reportPath'), 'evidence', 'logs'),
            path.join(this.reportConfig.get('reportPath'), 'evidence', 'har'),
            path.join(this.reportConfig.get('reportPath'), 'evidence', 'traces'),
            this.reportConfig.get('archivePath')
        ];

        for (const dir of directories) {
            await FileUtils.createDir(dir);
        }
    }

    private generateReportId(): string {
        const timestamp = DateUtils.format(new Date(), 'YYYYMMDD-HHmmss');
        const random = Math.random().toString(36).substring(2, 8);
        return `CSR-${timestamp}-${random}`;
    }

    private enrichWithMetadata(data: any): any {
        return {
            ...data,
            reportMetadata: {
                reportId: this.currentReportId,
                reportGeneratedAt: new Date().toISOString(),
                reportGeneratedBy: 'CS Test Automation Framework',
                frameworkVersion: '1.0.0',
                executionStartTime: this.reportStartTime.toISOString(),
                executionEndTime: this.reportEndTime.toISOString(),
                executionDuration: this.reportEndTime.getTime() - this.reportStartTime.getTime(),
                environment: ConfigurationManager.getEnvironmentName(),
                companyName: this.reportConfig.get('companyName'),
                reportTitle: this.reportConfig.get('reportTitle'),
                theme: {
                    primaryColor: this.reportConfig.get('themePrimaryColor'),
                    secondaryColor: this.reportConfig.get('themeSecondaryColor')
                }
            }
        };
    }

    private mergeReportData(existing: any, additional: any): any {
        return {
            ...existing,
            ...additional,
            scenarios: [...(existing.scenarios || []), ...(additional.scenarios || [])],
            evidence: {
                ...existing.evidence,
                ...additional.evidence
            },
            metrics: {
                ...existing.metrics,
                ...additional.metrics
            }
        };
    }

    private async performCleanup(): Promise<void> {
        try {
            const cleanupDays = this.reportConfig.get('cleanupDays');
            const cleanedCount = await this.cleanupOldReports(cleanupDays);
            if (cleanedCount > 0) {
                this.logger.info(`Cleaned up ${cleanedCount} old reports`);
            }
        } catch (error: any) {
            this.logger.warn('Cleanup failed but continuing', error as Record<string, any>);
        }
    }

    public async shutdown(): Promise<void> {
        try {
            this.logger.info('Shutting down CS Reporting System');
            
            await this.reportCollector.stopCollection();
            
            await this.reportOrchestrator.finalize();
            
            if (this.reportHistory.size > 100) {
                const oldestReports = Array.from(this.reportHistory.entries())
                    .sort((a, b) => a[1].generatedAt.getTime() - b[1].generatedAt.getTime())
                    .slice(0, 50);
                
                for (const [id] of oldestReports) {
                    this.reportHistory.delete(id);
                }
            }
            
            this.isInitialized = false;
            this.logger.info('CS Reporting System shutdown complete');
            
        } catch (error: any) {
            this.logger.error('Shutdown failed', error);
            throw error;
        }
    }
}
