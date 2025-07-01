import { ReportConfig } from './ReportConfig';
import { ImprovedProductionHTMLReportGenerator } from '../generators/ImprovedProductionHTMLReportGenerator';
import { PDFExporter } from '../exporters/PDFExporter';
import { ProfessionalPDFExporter } from '../exporters/ProfessionalPDFExporter';
import { ExcelExporter } from '../exporters/ExcelExporter';
import { JSONExporter } from '../exporters/JSONExporter';
import { XMLExporter } from '../exporters/XMLExporter';
import { 
    ReportResult, 
    ReportData, 
    ReportPath,
    ExportFormat
} from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import { DateUtils } from '../../core/utils/DateUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ReportDataConverter } from '../utils/ReportDataConverter';
import * as path from 'path';

export class ReportOrchestrator {
    private logger: Logger;
    private config!: ReportConfig;
    private htmlGenerator!: ImprovedProductionHTMLReportGenerator;
    private pdfExporter!: PDFExporter;
    private professionalPdfExporter!: ProfessionalPDFExporter;
    private excelExporter!: ExcelExporter;
    private jsonExporter!: JSONExporter;
    private xmlExporter!: XMLExporter;
    private reportCache: Map<string, any> = new Map();

    constructor() {
        this.logger = Logger.getInstance('ReportOrchestrator');
        this.initializeGenerators();
    }

    public async initialize(config: ReportConfig): Promise<void> {
        this.config = config;
        
        const reportConfig = {
            path: this.config.get('reportPath') || './reports',
            themePrimaryColor: this.config.get('themePrimaryColor') || '#93186C',
            generatePDF: this.config.get('generatePDF') !== false,
            generateExcel: this.config.get('generateExcel') !== false,
            includeScreenshots: this.config.get('includeScreenshots') !== false,
            includeVideos: this.config.get('includeVideos') !== false,
            includeLogs: this.config.get('includeLogs') !== false,
            includeNetworkLogs: this.config.get('includeHAR') !== false,
            includeConsoleLogs: this.config.get('includeLogs') !== false,
            reportTitle: this.config.get('reportTitle') || ConfigurationManager.get('REPORT_TITLE', 'Test Execution Report'),
            teamName: this.config.get('teamName') || ConfigurationManager.get('TEAM_NAME', 'CS Test Automation Team')
        };
        await this.htmlGenerator.initialize(reportConfig);

        this.logger.info('Report orchestrator initialized');
    }

    public async generateReports(reportData: ReportData): Promise<ReportResult> {
        try {
            const startTime = Date.now();
            this.logger.info('Starting report generation');

            const reportId = this.generateReportId();
            
            let executionStartTime: Date;
            if (reportData.metadata?.startTime) {
                executionStartTime = new Date(reportData.metadata.startTime);
            } else if (reportData.metadata?.executionDate) {
                executionStartTime = new Date(reportData.metadata.executionDate);
            } else {
                executionStartTime = new Date(Date.now() - 3600000);
            }
            
            const reportDir = await this.createReportStructure(reportId, executionStartTime);

            const reportDataPath = path.join(reportDir, 'report-data.json');
            await FileUtils.writeJSON(reportDataPath, reportData);
            this.logger.debug(`Saved report data to ${reportDataPath}`);

            const htmlPath = await this.generateHTMLReport(reportData, reportDir);

            const reportPaths: ReportPath[] = [{
                format: ExportFormat.HTML,
                path: htmlPath,
                size: await this.getFileSize(htmlPath)
            }];

            if (this.config.get('generatePDF')) {
                const pdfPath = await this.generatePDFReport(reportData, reportDir);
                reportPaths.push({
                    format: ExportFormat.PDF,
                    path: pdfPath,
                    size: await this.getFileSize(pdfPath)
                });
            }

            if (this.config.get('generateExcel')) {
                const excelPath = await this.generateExcelReport(reportData, reportDir);
                reportPaths.push({
                    format: ExportFormat.EXCEL,
                    path: excelPath,
                    size: await this.getFileSize(excelPath)
                });
            }

            if (this.config.get('generateJSON')) {
                const jsonPath = await this.generateJSONReport(reportData, reportDir);
                reportPaths.push({
                    format: ExportFormat.JSON,
                    path: jsonPath,
                    size: await this.getFileSize(jsonPath)
                });
            }

            if (this.config.get('generateXML')) {
                const xmlPath = await this.generateXMLReport(reportData, reportDir);
                reportPaths.push({
                    format: ExportFormat.XML,
                    path: xmlPath,
                    size: await this.getFileSize(xmlPath)
                });
            }

            const reportResult: ReportResult = {
                reportId,
                reportPath: reportDir,
                reportPaths,
                generatedAt: new Date(),
                duration: Date.now() - startTime,
                success: true
            };

            this.reportCache.set(reportId, reportResult);

            this.logger.info(`Report generation completed in ${reportResult.duration}ms`);
            return reportResult;

        } catch (error: any) {
            this.logger.error('Report generation failed', error);
            throw error;
        }
    }

    public async generateLiveReport(_partialData: any, _evidence: any): Promise<string> {
        try {
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Live Test Report</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                        .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                        .status-passed { color: #28a745; }
                        .status-failed { color: #dc3545; }
                        .status-skipped { color: #6c757d; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Live Test Execution Report</h1>
                        <div class="summary">
                            <p>Generated at: ${new Date().toISOString()}</p>
                            <p>Status: Running...</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            return html;
        } catch (error: any) {
            this.logger.error('Live report generation failed', error);
            return '<html><body><h1>Error generating live report</h1></body></html>';
        }
    }

    public async updateReport(report: ReportResult, updatedData: Partial<ReportData>): Promise<void> {
        this.logger.info(`Updating report: ${report.reportId}`);
        
        try {
            const reportDataPath = path.join(report.reportPath, 'report-data.json');
            let existingData: ReportData;
            
            if (await FileUtils.pathExists(reportDataPath)) {
                existingData = await FileUtils.readJSON(reportDataPath);
            } else {
                throw new Error(`Report data not found for report: ${report.reportId}`);
            }
            
            const mergedData: ReportData = {
                ...existingData,
                ...updatedData,
                metadata: {
                    ...existingData.metadata,
                    ...(updatedData.metadata || {}),
                    lastUpdated: new Date().toISOString()
                }
            };
            
            await FileUtils.writeJSON(reportDataPath, mergedData);
            
            const htmlPath = report.reportPaths.find(p => p.format === ExportFormat.HTML)?.path;
            if (htmlPath) {
                const htmlContent = await this.htmlGenerator.generate(mergedData);
                await FileUtils.writeFile(htmlPath, htmlContent);
            }
            
            for (const reportPath of report.reportPaths) {
                if (reportPath.format !== ExportFormat.HTML && await FileUtils.pathExists(reportPath.path)) {
                    switch (reportPath.format) {
                        case ExportFormat.PDF:
                            await this.generatePDFReport(mergedData, path.dirname(reportPath.path));
                            break;
                        case ExportFormat.EXCEL:
                            await this.generateExcelReport(mergedData, path.dirname(reportPath.path));
                            break;
                        case ExportFormat.JSON:
                            await this.generateJSONReport(mergedData, path.dirname(reportPath.path));
                            break;
                        case ExportFormat.XML:
                            await this.generateXMLReport(mergedData, path.dirname(reportPath.path));
                            break;
                    }
                }
            }
            
            this.logger.info(`Report updated successfully: ${report.reportId}`);
        } catch (error) {
            this.logger.error(`Failed to update report: ${report.reportId}`, error as Error);
            throw error;
        }
    }

    public async exportReport(report: ReportResult, format: 'pdf' | 'excel' | 'json' | 'xml'): Promise<string> {
        this.logger.info(`Exporting report ${report.reportId} to ${format} format`);
        
        try {
            const reportDataPath = path.join(report.reportPath, 'report-data.json');
            let reportData: ReportData;
            
            if (await FileUtils.pathExists(reportDataPath)) {
                reportData = await FileUtils.readJSON(reportDataPath);
            } else {
                throw new Error(`Report data not found for report: ${report.reportId}`);
            }
            
            const htmlPath = report.reportPaths.find(p => p.format === ExportFormat.HTML)?.path;
            let htmlContent = '';
            if (htmlPath && await FileUtils.pathExists(htmlPath)) {
                const content = await FileUtils.readFile(htmlPath);
                htmlContent = typeof content === 'string' ? content : content.toString();
            }
            
            let exportPath: string;
            
            switch (format) {
                case 'pdf':
                    if (!htmlContent) {
                        htmlContent = await this.htmlGenerator.generate(reportData);
                    }
                    const pdfResult = await this.pdfExporter.export(reportData, htmlContent);
                    exportPath = pdfResult.filePath || '';
                    break;
                    
                case 'excel':
                    const excelPath = path.join(report.reportPath, 'exports', `report_${Date.now()}.xlsx`);
                    const executionResult = ReportDataConverter.toExecutionResult(reportData);
                    const excelResult = await this.excelExporter.export(executionResult, excelPath, {
                        format: ExportFormat.EXCEL,
                        includeCharts: true,
                        includeMetrics: true,
                        includeScreenshots: true,
                        includeLogs: true,
                        autoFilter: true,
                        freezePanes: true,
                        conditionalFormatting: true,
                        compression: true
                    });
                    exportPath = excelResult.filePath || '';
                    break;
                    
                case 'json':
                    const jsonPath = path.join(report.reportPath, 'exports', `report_${Date.now()}.json`);
                    const executionResultForJson = ReportDataConverter.toExecutionResult(reportData);
                    const jsonResult = await this.jsonExporter.export(executionResultForJson, jsonPath);
                    exportPath = jsonResult.filePath || '';
                    break;
                    
                case 'xml':
                    const xmlPath = path.join(report.reportPath, 'exports', `report_${Date.now()}.xml`);
                    const xmlResult = await this.xmlExporter.export(reportData as any, xmlPath);
                    exportPath = xmlResult.filePath || '';
                    break;
                    
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
            
            this.logger.info(`Report exported successfully to: ${exportPath}`);
            return exportPath;
            
        } catch (error) {
            this.logger.error(`Failed to export report: ${report.reportId}`, error as Error);
            throw error;
        }
    }

    public async finalize(): Promise<void> {
        this.reportCache.clear();
        this.logger.info('Report orchestrator finalized');
    }

    private initializeGenerators(): void {
        this.htmlGenerator = new ImprovedProductionHTMLReportGenerator();
        this.pdfExporter = new PDFExporter();
        this.professionalPdfExporter = new ProfessionalPDFExporter();
        this.excelExporter = new ExcelExporter();
        this.jsonExporter = new JSONExporter();
        this.xmlExporter = new XMLExporter();
    }

    private async createReportStructure(reportId: string, executionStartTime?: Date): Promise<string> {
        const reportPath = path.join(this.config.get('reportPath'), reportId);
        
        const directories = [
            reportPath,
            path.join(reportPath, 'html'),
            path.join(reportPath, 'assets'),
            path.join(reportPath, 'evidence'),
            path.join(reportPath, 'exports')
        ];

        for (const dir of directories) {
            await FileUtils.createDir(dir);
        }

        ConfigurationManager.set('CURRENT_REPORT_DIR', reportPath);
        
        // CRITICAL FIX: Collect evidence (screenshots, logs, videos) for the report
        await this.collectEvidence(reportPath, executionStartTime);
        
        this.logger.debug(`Report directory structure created: ${reportPath}`);

        return reportPath;
    }

    private async collectEvidence(reportPath: string, executionStartTime?: Date): Promise<void> {
        try {
            const evidenceDir = path.join(reportPath, 'evidence');
            const assetsDir = path.join(reportPath, 'assets');
            
            await FileUtils.ensureDir(evidenceDir);
            await FileUtils.ensureDir(assetsDir);
            
            const screenshotsDir = path.join(process.cwd(), 'screenshots');
            await this.copyScreenshotsRecursively(screenshotsDir, evidenceDir, executionStartTime);
            
            const videosDir = path.join(process.cwd(), 'videos');
            if (await FileUtils.pathExists(videosDir)) {
                const videoFiles = await FileUtils.readDir(videosDir);
                for (const file of videoFiles) {
                    if (file.endsWith('.webm') || file.endsWith('.mp4')) {
                        const sourcePath = path.join(videosDir, file);
                        const destPath = path.join(evidenceDir, file);
                        await FileUtils.copy(sourcePath, destPath, { overwrite: true });
                        this.logger.debug(`Copied video: ${file}`);
                    }
                }
            }
            
            await this.exportComprehensiveLogs(evidenceDir);
            
            this.logger.info(`Evidence collection completed for report: ${reportPath}`);
            
        } catch (error) {
            this.logger.warn(`Evidence collection failed: ${error}`);
        }
    }

    private async exportComprehensiveLogs(evidenceDir: string): Promise<void> {
        try {
            const { ActionLogger } = await import('../../core/logging/ActionLogger');
            const actionLogger = ActionLogger.getInstance();
            
            const logReport = await actionLogger.generateReport();
            
            const logsPath = path.join(evidenceDir, 'execution-logs.json');
            await FileUtils.writeFile(logsPath, JSON.stringify(logReport, null, 2));
            
            const textLogsPath = path.join(evidenceDir, 'execution-logs.txt');
            const textLogs = this.formatLogsAsText(logReport);
            await FileUtils.writeFile(textLogsPath, textLogs);
            
            this.logger.debug('Comprehensive logs exported to evidence directory');
            
        } catch (error) {
            this.logger.warn(`Log export failed: ${error}`);
        }
    }

    private formatLogsAsText(logReport: any): string {
        let text = `CS Test Automation Framework - Execution Logs\n`;
        text += `=============================================\n\n`;
        text += `Session ID: ${logReport.sessionId}\n`;
        text += `Time Range: ${logReport.timeRange.start} - ${logReport.timeRange.end}\n`;
        text += `Total Entries: ${logReport.totalEntries}\n\n`;
        
        text += `Log Level Summary:\n`;
        Object.entries(logReport.byLevel).forEach(([level, count]) => {
            text += `  ${level}: ${count}\n`;
        });
        text += `\n`;
        
        text += `Log Type Summary:\n`;
        Object.entries(logReport.byType).forEach(([type, count]) => {
            text += `  ${type}: ${count}\n`;
        });
        text += `\n`;
        
        if (logReport.errors && logReport.errors.length > 0) {
            text += `Errors (${logReport.errors.length}):\n`;
            text += `================\n`;
            logReport.errors.forEach((error: any, index: number) => {
                text += `${index + 1}. [${error.timestamp}] ${error.message}\n`;
                if (error.context) {
                    text += `   Context: ${JSON.stringify(error.context, null, 2)}\n`;
                }
                text += `\n`;
            });
        }
        
        return text;
    }

    private async generateHTMLReport(reportData: ReportData, reportDir: string): Promise<string> {
        const htmlPath = path.join(reportDir, 'html', 'index.html');
        
        const html = await this.htmlGenerator.generate(reportData);
        await this.htmlGenerator.saveReport(html, htmlPath);
        
        return htmlPath;
    }

    private async generatePDFReport(reportData: ReportData, reportDir: string): Promise<string> {
        const pdfPath = path.join(reportDir, 'exports', 'report.pdf');
        
        try {
            await FileUtils.createDir(path.join(reportDir, 'exports'));
            
            const htmlPath = path.join(reportDir, 'html', 'index.html');
            let htmlContent: string;
            
            if (await FileUtils.pathExists(htmlPath)) {
                const content = await FileUtils.readFile(htmlPath);
                htmlContent = typeof content === 'string' ? content : content.toString();
            } else {
                htmlContent = await this.htmlGenerator.generate(reportData);
            }
            
            const result = await this.professionalPdfExporter.export(reportData, htmlContent, {
                outputPath: pdfPath,
                format: ExportFormat.PDF
            });
            
            return result.filePath || '';
        } catch (error) {
            this.logger.warn(`⚠️ PDF export failed but continuing with HTML report: ${error}`);
            
            const errorPath = path.join(reportDir, 'exports', 'pdf-error.txt');
            await FileUtils.writeFile(errorPath, 
                `PDF Export Failed\n` +
                `=================\n\n` +
                `Error: ${error}\n\n` +
                `The HTML report is available and fully functional.\n` +
                `PDF export requires additional system dependencies.\n\n` +
                `Timestamp: ${new Date().toISOString()}`
            );
            
            return errorPath;
        }
    }

    private async generateExcelReport(reportData: ReportData, reportDir: string): Promise<string> {
        const excelPath = path.join(reportDir, 'exports', 'report.xlsx');
        
        try {
            await FileUtils.createDir(path.join(reportDir, 'exports'));
            
            const executionResult = ReportDataConverter.toExecutionResult(reportData);
            
            const result = await this.excelExporter.export(executionResult, excelPath, {
                format: ExportFormat.EXCEL,
                includeCharts: true,
                includeMetrics: true,
                includeScreenshots: true,
                includeLogs: true,
                autoFilter: true,
                freezePanes: true,
                conditionalFormatting: true,
                compression: true
            });
            
            return result.filePath || '';
        } catch (error) {
            this.logger.warn(`Excel export failed but continuing with other reports: ${error}`);
            
            const errorPath = path.join(reportDir, 'exports', 'excel-error.txt');
            await FileUtils.writeFile(errorPath, 
                `Excel Export Failed\n` +
                `===================\n\n` +
                `Error: ${error}\n\n` +
                `The HTML and PDF reports are available and fully functional.\n` +
                `Excel export error may be due to data format issues.\n\n` +
                `Timestamp: ${new Date().toISOString()}`
            );
            
            return errorPath;
        }
    }

    private async generateJSONReport(reportData: ReportData, reportDir: string): Promise<string> {
        const jsonPath = path.join(reportDir, 'exports', 'report.json');
        
        await FileUtils.createDir(path.join(reportDir, 'exports'));
        
        const executionResultForJson = ReportDataConverter.toExecutionResult(reportData);
        const result = await this.jsonExporter.export(executionResultForJson, jsonPath);
        
        return result.filePath || '';
    }

    private async generateXMLReport(reportData: ReportData, reportDir: string): Promise<string> {
        const xmlPath = path.join(reportDir, 'exports', 'report.xml');
        
        await FileUtils.createDir(path.join(reportDir, 'exports'));
        
        const result = await this.xmlExporter.export(reportData as any, xmlPath, {
            format: ExportFormat.XML,
            pretty: true
        });
        
        return result.filePath || '';
    }

    private generateReportId(): string {
        const timestamp = DateUtils.format(new Date(), 'YYYYMMDD-HHmmss');
        const random = Math.random().toString(36).substring(2, 8);
        return `report-${timestamp}-${random}`;
    }

    private async getFileSize(filePath: string): Promise<number> {
        try {
            const stats = await FileUtils.getStats(filePath);
            return stats.size;
        } catch {
            return 0;
        }
    }

    private async copyScreenshotsRecursively(sourceDir: string, evidenceDir: string, executionStartTime?: Date): Promise<void> {
        try {
            if (!(await FileUtils.pathExists(sourceDir))) {
                return;
            }

            const startTime = executionStartTime ? executionStartTime.getTime() : Date.now() - 3600000;
            let copiedCount = 0;
            let skippedCount = 0;

            for await (const { path: filePath, stats } of FileUtils.walk(sourceDir)) {
                if (stats.isFile && this.isImageFile(filePath)) {
                    const fileModifiedTime = stats.modifiedAt ? stats.modifiedAt.getTime() : 0;
                    
                    if (fileModifiedTime >= startTime) {
                        const fileName = path.basename(filePath);
                        const screenshotsDir = path.join(evidenceDir, 'screenshots');
                        const destPath = path.join(screenshotsDir, fileName);
                        
                        if (await FileUtils.pathExists(destPath)) {
                            this.logger.debug(`Skipping duplicate screenshot: ${fileName}`);
                            skippedCount++;
                        } else {
                            await FileUtils.ensureDir(screenshotsDir);
                            
                            await FileUtils.copy(filePath, destPath, { overwrite: false });
                            this.logger.debug(`Copied screenshot: ${fileName}`);
                            copiedCount++;
                        }
                    } else {
                        skippedCount++;
                        this.logger.debug(`Skipped old screenshot: ${path.basename(filePath)} (created before execution)`);
                    }
                }
            }
            
            this.logger.info(`Screenshots copied: ${copiedCount}, skipped (old): ${skippedCount}`);
        } catch (error) {
            this.logger.warn(`Failed to copy screenshots recursively: ${error}`);
        }
    }

    private isImageFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext);
    }
}
