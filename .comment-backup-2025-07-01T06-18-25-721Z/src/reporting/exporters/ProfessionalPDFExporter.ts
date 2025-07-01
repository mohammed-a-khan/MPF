import { Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { ReportData, ExportResult, ExportOptions } from '../types/reporting.types';
import { Logger } from '../../core/utils/Logger';

export class ProfessionalPDFExporter {
    private logger: Logger;
    private browser?: Browser;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public async export(
        reportData: ReportData,
        htmlContent: string,
        options: ExportOptions
    ): Promise<ExportResult> {
        this.logger.info('Starting professional PDF export');
        const startTime = Date.now();
        
        let needsCleanup = false;
        let localContext: any = null;
        let localPage: any = null;
        let browser: Browser | undefined;
        
        try {

            // Ensure output directory exists
            if (!options.outputPath) {
                throw new Error('Output path is required for PDF export');
            }
            
            const outputDir = path.dirname(options.outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // CRITICAL FIX: Handle browser lifecycle properly for PDF generation
            const { BrowserManager } = await import('../../core/browser/BrowserManager');
            const browserManager = BrowserManager.getInstance();
            
            // Variables already declared above
            
            try {
                // BROWSER FLASHING FIX: Always try to use existing browser first
                this.browser = await browserManager.getBrowser();
                this.logger.debug('Using existing browser for PDF generation - no new browser launch');
            } catch (error) {
                this.logger.warn('No existing browser available for PDF generation, will skip PDF export to prevent browser flashing');
                // BROWSER FLASHING FIX: Don't launch new browser, just skip PDF generation
                return {
                    success: false,
                    error: 'PDF generation skipped - no existing browser available (prevents browser flashing)',
                    filePath: options.outputPath || '',
                    size: 0,
                    format: 'PDF' as any,
                    duration: Date.now() - startTime
                };
            }

            // BROWSER FLASHING FIX: Only proceed if we have a valid existing browser
            if (!this.browser || !this.browser.isConnected()) {
                this.logger.warn('Existing browser is not connected, skipping PDF generation to prevent browser flashing');
                return {
                    success: false,
                    error: 'PDF generation skipped - browser not connected (prevents browser flashing)',
                    filePath: options.outputPath || '',
                    size: 0,
                    format: 'PDF' as any,
                    duration: Date.now() - startTime
                };
            }

            // Create a new context and page
            localContext = await this.browser.newContext({
                viewport: { width: 1200, height: 800 }
            });
            localPage = await localContext.newPage();

            // Set viewport for consistent rendering
            await localPage.setViewportSize({ width: 1200, height: 800 });

            // Add PDF-specific CSS
            const pdfOptimizedHtml = this.addPDFStyles(htmlContent);

            // Load the HTML content
            await localPage.setContent(pdfOptimizedHtml, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });

            // Wait for charts to render
            await localPage.waitForTimeout(2000);

            // Generate PDF
            await localPage.pdf({
                path: options.outputPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                },
                displayHeaderFooter: true,
                headerTemplate: this.generatePDFHeader(reportData),
                footerTemplate: this.generatePDFFooter(),
                preferCSSPageSize: false
            });

            // CRITICAL FIX: Don't close the shared browser instance!
            // Clean up resources
            try {
                if (localPage) {
                    await localPage.close();
                }
                if (localContext) {
                    await localContext.close();
                }
                if (needsCleanup && this.browser) {
                    // Only close the browser if we launched it specifically for PDF generation
                    await this.browser.close();
                    this.logger.debug('Closed PDF generation browser');
                }
            } catch (cleanupError) {
                this.logger.warn('Failed to cleanup PDF generation resources', cleanupError as Error);
            }

            const fileSize = fs.statSync(options.outputPath).size;
            const duration = Date.now() - startTime;

            this.logger.info(`Professional PDF exported successfully in ${duration}ms (${this.formatBytes(fileSize)})`);

            return {
                success: true,
                filePath: options.outputPath,
                size: fileSize,
                format: 'PDF' as any,
                duration,
                metadata: {
                    format: 'PDF',
                    pages: await this.getPDFPageCount(options.outputPath),
                    generator: 'ProfessionalPDFExporter',
                    version: '2.0.0'
                }
            };

        } catch (error) {
            this.logger.error('Professional PDF export failed', error as Error);
            
            // Clean up resources before returning error
            try {
                if (localPage) {
                    await localPage.close();
                }
                if (localContext) {
                    await localContext.close();
                }
                if (needsCleanup && this.browser) {
                    // Only close the browser if we launched it specifically for PDF generation
                    await this.browser.close();
                    this.logger.debug('Closed PDF generation browser after error');
                }
            } catch (cleanupError) {
                this.logger.warn('Failed to cleanup PDF generation resources', cleanupError as Error);
            }
            
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                filePath: options.outputPath || '',
                size: 0,
                format: 'PDF' as any,
                duration: Date.now() - startTime
            };
        }
    }

    private addPDFStyles(htmlContent: string): string {
        const pdfStyles = `
        <style media="print">
            /* PDF-specific styles */
            @page {
                size: A4;
                margin: 20mm 15mm;
            }
            
            body {
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .header {
                page-break-inside: avoid;
            }
            
            .navigation {
                display: none !important;
            }
            
            .tab-content {
                display: block !important;
                margin-bottom: 30px;
            }
            
            .tab-content:first-child {
                page-break-before: avoid;
            }
            
            .tab-content:not(:first-child) {
                page-break-before: auto;
                padding-top: 20px;
            }
            
            .card {
                page-break-inside: avoid;
                margin-bottom: 20px;
            }
            
            .dashboard-grid {
                display: block;
            }
            
            .dashboard-grid .card {
                width: 100%;
                margin-bottom: 30px;
                page-break-inside: avoid;
            }
            
            .chart-container {
                height: 300px !important;
            }
            
            .table {
                page-break-inside: avoid;
            }
            
            .table tr {
                page-break-inside: avoid;
            }
            
            .feature-card {
                page-break-inside: avoid;
                margin-bottom: 20px;
            }
            
            .log-container {
                max-height: none;
                page-break-inside: avoid;
            }
            
            .footer {
                margin-top: 30px;
                page-break-before: always;
            }
            
            /* Hide interactive elements */
            .nav-tab,
            button,
            .btn {
                display: none !important;
            }
            
            /* Ensure text is readable */
            * {
                color: #000 !important;
                background: transparent !important;
            }
            
            .header {
                background: linear-gradient(135deg, #93186C, #B91C84) !important;
                color: white !important;
            }
            
            .header * {
                color: white !important;
            }
            
            .card {
                border: 1px solid #ddd !important;
                background: white !important;
            }
            
            .metric-card {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                color: white !important;
            }
            
            .metric-card * {
                color: white !important;
            }
            
            .tag {
                background: #93186C !important;
                color: white !important;
            }
            
            .status-passed {
                background: #28A745 !important;
                color: white !important;
            }
            
            .status-failed {
                background: #DC3545 !important;
                color: white !important;
            }
        </style>`;

        // Insert PDF styles before closing head tag
        return htmlContent.replace('</head>', `${pdfStyles}\n</head>`);
    }

    private generatePDFHeader(reportData: ReportData): string {
        const metadata = reportData.metadata || {};
        return `
        <div style="font-size: 10px; color: #666; width: 100%; text-align: center; margin: 0; padding: 5px 0;">
            <span>CS Test Automation Framework - ${(metadata as any).environment || 'Test'} Environment Report</span>
        </div>`;
    }

    private generatePDFFooter(): string {
        return `
        <div style="font-size: 9px; color: #666; width: 100%; text-align: center; margin: 0; padding: 5px 0;">
            <span>Generated on ${new Date().toLocaleString()} | Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`;
    }

    private async getPDFPageCount(pdfPath: string): Promise<number> {
        try {
            // Simple estimation based on file size (not accurate but gives an idea)
            const stats = fs.statSync(pdfPath);
            const estimatedPages = Math.ceil(stats.size / 50000); // Rough estimate
            return Math.max(1, estimatedPages);
        } catch {
            return 1;
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    public async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
        }
    }
} 