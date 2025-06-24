import { Page, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as crypto from 'crypto';
import { ReportData, PDFOptions, ExportResult, ExportFormat } from '../types/reporting.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class PDFExporter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private tempDir: string;
  private logger = ActionLogger.getInstance();

  constructor() {
    this.tempDir = path.join(process.cwd(), '.temp', 'pdf-export');
  }

  /**
   * Export report data to PDF using Playwright's built-in PDF generation
   */
  async export(
    reportData: ReportData,
    htmlContent: string,
    options: PDFOptions = { format: ExportFormat.PDF }
  ): Promise<ExportResult> {
    const exportId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      await this.logger.logAction('pdf-export-start', {
        target: 'report',
        status: 'info',
        exportId,
        options
      });

      // Prepare export environment
      await this.prepareExport();

      // Create temporary HTML file
      const tempHtmlPath = await this.createTempHtml(htmlContent, exportId);

      // Launch browser for PDF generation
      await this.launchBrowser();

      // Generate PDF using Playwright's built-in functionality
      const outputPath = await this.generatePDFWithPlaywright(tempHtmlPath, reportData, options);

      // Calculate final metrics
      const stats = await fs.stat(outputPath);

      const result: ExportResult = {
        success: true,
        filePath: outputPath,
        format: ExportFormat.PDF,
        size: stats.size,
        duration: Date.now() - startTime,
        metadata: {
          title: reportData.summary?.projectName || 'Test Report',
          author: 'CS Test Automation Framework',
          created: new Date().toISOString(),
          pages: 0, // Playwright doesn't provide page count directly
          encrypted: false,
          optimized: true,
          hasTableOfContents: false,
          hasBookmarks: false,
          hasAttachments: false
        }
      };

      await this.logger.logAction('pdf-export-complete', {
        target: 'report',
        status: 'success',
        ...result
      });

      return result;

    } catch (error) {
      this.logger.logError('PDF export failed', error as Error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Generate PDF using Playwright's built-in PDF functionality
   */
  private async generatePDFWithPlaywright(
    htmlPath: string,
    reportData: ReportData,
    options: PDFOptions
  ): Promise<string> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    const page = await this.context.newPage();

    try {
      // Navigate to the HTML file
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

      // Wait for content to be ready
      await this.waitForContentReady(page);

      // Prepare output path
      const outputPath = path.join(
        options.outputDir || this.tempDir,
        options.filename || `test-report-${Date.now()}.pdf`
      );

      // Fix PDF options to handle optional properties correctly
      const pdfOptions: any = {
        path: outputPath,
        format: options.pageFormat || 'A4',
        printBackground: true,
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        },
        displayHeaderFooter: options.displayHeaderFooter !== false,
        preferCSSPageSize: false,
        scale: options.scale || 1.0
      };

      // Only add header/footer templates if displayHeaderFooter is true
      if (options.displayHeaderFooter !== false) {
        pdfOptions.headerTemplate = options.headerTemplate || this.getDefaultHeader(reportData);
        pdfOptions.footerTemplate = options.footerTemplate || this.getDefaultFooter();
      }

      await page.pdf(pdfOptions);

      this.logger.info(`PDF generated successfully: ${outputPath}`);
      return outputPath;

    } finally {
      await page.close();
    }
  }

  /**
   * Wait for content to be ready for PDF generation
   */
  private async waitForContentReady(page: Page): Promise<void> {
    try {
      // Wait for any charts or dynamic content to load
      await page.waitForTimeout(2000);

      // Wait for any images to load
      await page.waitForFunction(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.every(img => img.complete);
      }, { timeout: 10000 });

      // Fix font loading wait
      await page.waitForFunction(() => {
        if (document.fonts) {
          return document.fonts.ready.then(() => true);
        }
        return true;
      }).catch(() => {
        // Ignore font loading timeout
      });

    } catch (error) {
      this.logger.warn('Some content may not be fully loaded for PDF generation', error as Error);
    }
  }

  /**
   * Get default header template
   */
  private getDefaultHeader(reportData: ReportData): string {
    const title = reportData.summary?.projectName || 'Test Report';
    const date = new Date().toLocaleDateString();
    
    return `
      <div style="font-size: 10px; padding: 5px 15px; width: 100%; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc;">
        <span style="font-weight: bold;">${title}</span>
        <span>${date}</span>
      </div>
    `;
  }

  /**
   * Get default footer template
   */
  private getDefaultFooter(): string {
    return `
      <div style="font-size: 10px; padding: 5px 15px; width: 100%; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ccc;">
        <span>Generated by CS Test Automation Framework</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `;
  }

  /**
   * Prepare export environment
   */
  private async prepareExport(): Promise<void> {
    try {
      if (!existsSync(this.tempDir)) {
        await fs.mkdir(this.tempDir, { recursive: true });
      }
    } catch (error) {
      this.logger.error('Failed to prepare export environment', error as Error);
      throw error;
    }
  }

  /**
   * Create temporary HTML file
   */
  private async createTempHtml(content: string, exportId: string): Promise<string> {
    const tempPath = path.join(this.tempDir, `report-${exportId}.html`);
    
    // Enhance HTML for better PDF rendering
    const enhancedHtml = await this.enhanceHtmlForPdf(content);
    
    await fs.writeFile(tempPath, enhancedHtml, 'utf8');
    return tempPath;
  }

  /**
   * Enhance HTML for better PDF rendering
   */
  private async enhanceHtmlForPdf(html: string): Promise<string> {
    // Add PDF-specific styles
    const pdfStyles = `
      <style>
        @media print {
          body { 
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .cs-section {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .cs-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .cs-scenario {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
            break-after: avoid;
          }
          
          .cs-navigation {
            display: none !important;
          }
          
          .cs-modal {
            display: none !important;
          }
          
          .cs-lightbox {
            display: none !important;
          }
        }
        
        @page {
          size: A4;
          margin: 20mm 15mm;
        }
      </style>
    `;

    // Insert PDF styles before closing head tag
    return html.replace('</head>', `${pdfStyles}</head>`);
  }

  /**
   * Use existing browser for PDF generation - NO NEW BROWSER LAUNCH
   */
  private async launchBrowser(): Promise<void> {
    try {
      // CRITICAL FIX: Use existing browser instead of launching new one
      const { BrowserManager } = await import('../../core/browser/BrowserManager');
      const browserManager = BrowserManager.getInstance();
      
      this.browser = await browserManager.getBrowser();
      if (!this.browser || !this.browser.isConnected()) {
        throw new Error('No active browser available for PDF generation');
      }

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });

      this.logger.info('Using existing browser for PDF generation - no new browser launched');
    } catch (error) {
      this.logger.error('Failed to use existing browser for PDF generation', error as Error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      // CRITICAL FIX: Don't close the shared browser instance!
      // The browser is managed by BrowserManager singleton
      if (this.browser) {
        this.browser = null; // Just clear the reference, don't close
      }

      // Clean up temporary files
      try {
        const tempFiles = await fs.readdir(this.tempDir);
        for (const file of tempFiles) {
          if (file.startsWith('report-') && file.endsWith('.html')) {
            await fs.unlink(path.join(this.tempDir, file));
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }

      this.logger.info('PDF export cleanup completed');
    } catch (error) {
      this.logger.warn('PDF export cleanup failed', error as Error);
    }
  }

  /**
   * Export multiple reports as a batch
   */
  async exportBatch(
    reports: Array<{ data: ReportData; html: string; name?: string }>,
    options: PDFOptions = { format: ExportFormat.PDF }
  ): Promise<ExportResult> {
    const startTime = Date.now();
    
    try {
      // For batch export, we'll create separate PDFs for each report
      // In a production environment, you might want to merge them
      const results: ExportResult[] = [];
      
      for (let i = 0; i < reports.length; i++) {
        const report = reports[i];
        if (!report) continue;
        
        const batchOptions = {
          ...options,
          filename: report.name ? `${report.name}.pdf` : `batch-report-${i + 1}.pdf`
        };
        
        const result = await this.export(report.data, report.html, batchOptions);
        results.push(result);
      }

      // Return summary result
      const totalSize = results.reduce((sum, r) => sum + (r?.size || 0), 0);
      
      return {
        success: true,
        filePath: options.outputDir || this.tempDir,
        format: ExportFormat.PDF,
        size: totalSize,
        duration: Date.now() - startTime,
        metadata: {
          title: 'Batch Export',
          author: 'CS Test Automation Framework',
          created: new Date().toISOString(),
          pages: 0,
          encrypted: false,
          optimized: true,
          hasTableOfContents: false,
          hasBookmarks: false,
          hasAttachments: false,
          batchCount: reports.length
        }
      };

    } catch (error) {
      this.logger.error('Batch PDF export failed', error as Error);
      throw error;
    }
  }
} 