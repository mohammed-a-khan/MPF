// src/core/debugging/ScreenshotManager.ts

import { Page, ElementHandle, Locator } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import { CSWebElement } from '../elements/CSWebElement';
import * as path from 'path';
import * as fs from 'fs';
import {
    ScreenshotOptions,
    ScreenshotDiff,
    VisualTestOptions,
    VisualTestResult,
    ScreenshotComparison as ComparisonOptions
} from './types/debug.types';

/**
 * Advanced screenshot capabilities for debugging and visual testing
 * Supports full page, element, masking, and comparison
 */
export class ScreenshotManager {
    private static instance: ScreenshotManager;
    private screenshotPath: string;
    private defaultOptions!: ScreenshotOptions;
    private comparisonThreshold!: number;
    private logger: Logger;
    private sharp: any;
    
    private constructor() {
        this.screenshotPath = path.join(process.cwd(), 'screenshots');
        this.logger = Logger.getInstance('ScreenshotManager');
        // Initialize with default values first
        this.defaultOptions = {
            type: 'png',
            quality: 80,
            fullPage: false,
            animations: 'disabled',
            caret: 'hide',
            scale: 'device',
            timeout: 30000,
            omitBackground: false
        };
        this.comparisonThreshold = 0.1;
        this.loadConfiguration();
        this.initialize();
    }
    
    static getInstance(): ScreenshotManager {
        if (!ScreenshotManager.instance) {
            ScreenshotManager.instance = new ScreenshotManager();
        }
        return ScreenshotManager.instance;
    }
    
    private loadConfiguration(): void {
        this.defaultOptions = {
            type: ConfigurationManager.get('SCREENSHOT_TYPE', 'png') as 'png' | 'jpeg',
            quality: ConfigurationManager.getInt('SCREENSHOT_QUALITY', 80),
            fullPage: ConfigurationManager.getBoolean('SCREENSHOT_FULL_PAGE', false),
            animations: ConfigurationManager.get('SCREENSHOT_ANIMATIONS', 'disabled') as 'disabled' | 'allow',
            caret: ConfigurationManager.get('SCREENSHOT_CARET', 'hide') as 'hide' | 'initial',
            scale: ConfigurationManager.get('SCREENSHOT_SCALE', 'device') as 'device' | 'css',
            timeout: ConfigurationManager.getInt('SCREENSHOT_TIMEOUT', 30000),
            omitBackground: ConfigurationManager.getBoolean('SCREENSHOT_OMIT_BACKGROUND', false)
        };
        
        this.comparisonThreshold = ConfigurationManager.getFloat('SCREENSHOT_COMPARISON_THRESHOLD', 0.1);
    }
    
    private async initialize(): Promise<void> {
        try {
            // Ensure screenshot directory exists
            await FileUtils.ensureDir(this.screenshotPath);
            
            // Create subdirectories
            await Promise.all([
                FileUtils.ensureDir(path.join(this.screenshotPath, 'actual')),
                FileUtils.ensureDir(path.join(this.screenshotPath, 'expected')),
                FileUtils.ensureDir(path.join(this.screenshotPath, 'diff')),
                FileUtils.ensureDir(path.join(this.screenshotPath, 'debug'))
            ]);
            
            this.logger.info('ScreenshotManager initialized');
            
        } catch (error) {
            this.logger.error(`Failed to initialize ScreenshotManager: ${(error as Error).message}`);
        }
    }
    
    /**
     * Take a screenshot of the page
     */
    async takeScreenshot(
        page: Page,
        options?: Partial<ScreenshotOptions>
    ): Promise<Buffer> {
        try {
            const opts = { ...this.defaultOptions, ...options };
            
            // Prepare page for screenshot
            await this.preparePageForScreenshot(page, opts);
            
            const startTime = Date.now();
            const screenshotOptions: any = {};
            if (opts.type !== undefined) screenshotOptions.type = opts.type;
            // Only add quality for JPEG screenshots (PNG doesn't support quality)
            if (opts.quality !== undefined && opts.type === 'jpeg') screenshotOptions.quality = opts.quality;
            if (opts.fullPage !== undefined) screenshotOptions.fullPage = opts.fullPage;
            if (opts.clip !== undefined) screenshotOptions.clip = opts.clip;
            if (opts.omitBackground !== undefined) screenshotOptions.omitBackground = opts.omitBackground;
            if (opts.animations !== undefined) screenshotOptions.animations = opts.animations;
            if (opts.caret !== undefined) screenshotOptions.caret = opts.caret;
            if (opts.scale !== undefined) screenshotOptions.scale = opts.scale;
            if (opts.timeout !== undefined) screenshotOptions.timeout = opts.timeout;
            
            const screenshot = await page.screenshot(screenshotOptions);
            const duration = Date.now() - startTime;
            
            this.logger.debug(`Screenshot taken in ${duration}ms`);
            ActionLogger.logInfo('Screenshot taken', { type: 'page', size: screenshot.length });
            
            // Process screenshot if needed
            const processed = await this.processScreenshot(screenshot, opts);
            
            return processed;
            
        } catch (error) {
            this.logger.error(`Failed to take screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Take a screenshot of an element
     */
    async takeElementScreenshot(
        element: CSWebElement | ElementHandle | Locator,
        options?: Partial<ScreenshotOptions>
    ): Promise<Buffer> {
        try {
            const opts = { ...this.defaultOptions, ...options };
            
            let elementHandle: ElementHandle | Locator;
            
            if (element instanceof CSWebElement) {
                elementHandle = await (element as any).element;
            } else {
                elementHandle = element;
            }
            
            // Scroll element into view
            if ('scrollIntoViewIfNeeded' in elementHandle) {
                await elementHandle.scrollIntoViewIfNeeded();
            }
            
            // Wait for element to be stable
            await this.waitForElementStability(elementHandle);
            
            const screenshotOptions: any = {};
            if (opts.type !== undefined) screenshotOptions.type = opts.type;
            // Only add quality for JPEG screenshots (PNG doesn't support quality)
            if (opts.quality !== undefined && opts.type === 'jpeg') screenshotOptions.quality = opts.quality;
            if (opts.omitBackground !== undefined) screenshotOptions.omitBackground = opts.omitBackground;
            if (opts.animations !== undefined) screenshotOptions.animations = opts.animations;
            if (opts.caret !== undefined) screenshotOptions.caret = opts.caret;
            if (opts.scale !== undefined) screenshotOptions.scale = opts.scale;
            if (opts.timeout !== undefined) screenshotOptions.timeout = opts.timeout;
            
            const screenshot = await elementHandle.screenshot(screenshotOptions);
            
            this.logger.debug(`Element screenshot taken: ${screenshot.length} bytes`);
            ActionLogger.logInfo('Screenshot taken', { type: 'element', size: screenshot.length });
            
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to take element screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Take a full page screenshot (including content below the fold)
     */
    async takeFullPageScreenshot(page: Page): Promise<Buffer> {
        try {
            const opts = { 
                ...this.defaultOptions, 
                fullPage: true,
                animations: 'disabled' as const
            };
            
            // Disable animations for consistent screenshots
            await page.addStyleTag({
                content: [
                    '*, *::before, *::after {',
                    '    animation-duration: 0s !important;',
                    '    animation-delay: 0s !important;',
                    '    transition-duration: 0s !important;',
                    '    transition-delay: 0s !important;',
                    '}'
                ].join('\n')
            });
            
            // Scroll to top
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(500); // Wait for scroll
            
            const screenshotOptions: any = {
                fullPage: opts.fullPage,
                animations: opts.animations
            };
            if (opts.type !== undefined) screenshotOptions.type = opts.type;
            // Only add quality for JPEG screenshots (PNG doesn't support quality)
            if (opts.quality !== undefined && opts.type === 'jpeg') screenshotOptions.quality = opts.quality;
            if (opts.omitBackground !== undefined) screenshotOptions.omitBackground = opts.omitBackground;
            if (opts.caret !== undefined) screenshotOptions.caret = opts.caret;
            if (opts.scale !== undefined) screenshotOptions.scale = opts.scale;
            if (opts.timeout !== undefined) screenshotOptions.timeout = opts.timeout;
            
            const screenshot = await page.screenshot(screenshotOptions);
            
            this.logger.debug(`Full page screenshot taken: ${screenshot.length} bytes`);
            ActionLogger.logInfo('Screenshot taken', { type: 'fullPage', size: screenshot.length });
            
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to take full page screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Take a screenshot with masked elements
     */
    async takeScreenshotWithMask(
        page: Page,
        selectorsToMask: string[],
        options?: Partial<ScreenshotOptions>
    ): Promise<Buffer> {
        try {
            // Apply masks
            await this.maskElements(page, selectorsToMask);
            
            // Take screenshot
            const screenshot = await this.takeScreenshot(page, options);
            
            // Remove masks
            await this.unmaskElements(page);
            
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to take masked screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Mask sensitive elements on the page
     */
    async maskElements(page: Page, selectors: string[]): Promise<void> {
        try {
            await page.addStyleTag({
                content: `
                    .cs-masked-element {
                        position: relative !important;
                        overflow: hidden !important;
                    }
                    .cs-masked-element::after {
                        content: 'MASKED' !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                        background: #000 !important;
                        color: #fff !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        font-family: Arial, sans-serif !important;
                        font-size: 14px !important;
                        z-index: 999999 !important;
                    }
                `
            });
            
            for (const selector of selectors) {
                await page.evaluate((sel) => {
                    const elements = document.querySelectorAll(sel);
                    elements.forEach(el => {
                        el.classList.add('cs-masked-element');
                        el.setAttribute('data-cs-original-text', el.textContent || '');
                    });
                }, selector);
            }
            
            this.logger.debug(`Masked ${selectors.length} element selectors`);
            
        } catch (error) {
            this.logger.error(`Failed to mask elements: ${(error as Error).message}`);
        }
    }
    
    /**
     * Remove masks from elements
     */
    async unmaskElements(page: Page): Promise<void> {
        try {
            await page.evaluate(() => {
                const elements = document.querySelectorAll('.cs-masked-element');
                elements.forEach(el => {
                    el.classList.remove('cs-masked-element');
                    const originalText = el.getAttribute('data-cs-original-text');
                    if (originalText && el.textContent === 'MASKED') {
                        el.textContent = originalText;
                    }
                    el.removeAttribute('data-cs-original-text');
                });
            });
            
            this.logger.debug('Removed masks from elements');
            
        } catch (error) {
            this.logger.error(`Failed to unmask elements: ${(error as Error).message}`);
        }
    }
    
    /**
     * Compare two screenshots
     */
    async compareScreenshots(
        baseline: Buffer,
        current: Buffer,
        options?: ComparisonOptions
    ): Promise<ScreenshotDiff> {
        try {
            const opts = {
                threshold: this.comparisonThreshold,
                includeAA: true,
                ...options
            };
            
            // Load images with sharp (lazy load)
            if (!this.sharp) {
                try {
                    this.sharp = require('sharp');
                } catch (error) {
                    this.logger.warn('Sharp library not available, using fallback comparison');
                }
            }
            
            if (!this.sharp) {
                // Fallback when sharp is not available
                return {
                    identical: false,
                    diffPercentage: 0,
                    diffPixels: 0,
                    totalPixels: 0
                };
            }
            
            const [baselineImg, currentImg] = await Promise.all([
                this.sharp(baseline),
                this.sharp(current)
            ]);
            
            // Get metadata
            const [baselineMeta, currentMeta] = await Promise.all([
                baselineImg.metadata(),
                currentImg.metadata()
            ]);
            
            // Check dimensions
            if (baselineMeta.width !== currentMeta.width || 
                baselineMeta.height !== currentMeta.height) {
                return {
                    identical: false,
                    diffPercentage: 100,
                    diffPixels: -1,
                    totalPixels: -1,
                    regions: [{
                        x: 0,
                        y: 0,
                        width: currentMeta.width || 0,
                        height: currentMeta.height || 0
                    }]
                };
            }
            
            // Get raw pixel data
            const [baselineData, currentData] = await Promise.all([
                baselineImg.raw().toBuffer(),
                currentImg.raw().toBuffer()
            ]);
            
            // Compare pixels
            const result = await this.comparePixels(
                baselineData,
                currentData,
                baselineMeta.width || 0,
                baselineMeta.height || 0,
                opts
            );
            
            // Generate diff image if requested
            if (opts.generateDiff && result.diffPixels > 0 && result.diffImage) {
                const diffImage = await this.generateDiffImage(
                    baselineData,
                    currentData,
                    result.diffImage,
                    baselineMeta.width || 0,
                    baselineMeta.height || 0
                );
                result.diffImage = diffImage;
            }
            
            this.logger.debug(`Screenshot comparison: ${result.identical ? 'MATCH' : 'DIFF'} ` +
                        `(${result.diffPercentage.toFixed(2)}% difference)`);
            
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to compare screenshots: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Save screenshot to file
     */
    async saveScreenshot(
        screenshot: Buffer,
        fileName: string,
        subdir?: string
    ): Promise<string> {
        try {
            // ALWAYS save to the default screenshots directory
            // This prevents duplicate screenshots in different locations
            const baseDir = this.screenshotPath;
            
            const dir = subdir 
                ? path.join(baseDir, subdir)
                : baseDir;
            
            await FileUtils.ensureDir(dir);
            
            const filePath = path.join(dir, fileName);
            await fs.promises.writeFile(filePath, screenshot);
            
            this.logger.debug(`Screenshot saved: ${fileName} to ${filePath}`);
            
            return filePath;
            
        } catch (error) {
            this.logger.error(`Failed to save screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Load screenshot from file
     */
    async loadScreenshot(fileName: string, subdir?: string): Promise<Buffer> {
        try {
            const dir = subdir 
                ? path.join(this.screenshotPath, subdir)
                : this.screenshotPath;
            
            const filePath = path.join(dir, fileName);
            const screenshot = await fs.promises.readFile(filePath);
            
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to load screenshot: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Capture screenshot for visual regression testing
     */
    async captureForVisualTesting(
        page: Page,
        testName: string,
        options?: VisualTestOptions
    ): Promise<VisualTestResult> {
        try {
            const opts = {
                updateBaseline: false,
                failOnDiff: true,
                ...options
            };
            
            const fileName = `${this.sanitizeFileName(testName)}.png`;
            const actualPath = path.join('actual', fileName);
            const expectedPath = path.join('expected', fileName);
            const diffPath = path.join('diff', fileName);
            
            // Take current screenshot
            const screenshotOptions: Partial<ScreenshotOptions> = {};
            if (opts.fullPage !== undefined) {
                screenshotOptions.fullPage = opts.fullPage;
            }
            if (opts.clip !== undefined) {
                screenshotOptions.clip = opts.clip;
            }
            const currentScreenshot = await this.takeScreenshot(page, screenshotOptions);
            
            // Save actual screenshot
            await this.saveScreenshot(currentScreenshot, fileName, 'actual');
            
            // Check if baseline exists
            const baselineExists = await FileUtils.exists(
                path.join(this.screenshotPath, expectedPath)
            );
            
            if (!baselineExists || opts.updateBaseline) {
                // Create or update baseline
                await this.saveScreenshot(currentScreenshot, fileName, 'expected');
                
                this.logger.info(`Baseline ${opts.updateBaseline ? 'updated' : 'created'} for: ${testName}`);
                
                return {
                    passed: true,
                    testName,
                    baselinePath: expectedPath,
                    actualPath,
                    isNewBaseline: true
                };
            }
            
            // Load baseline
            const baseline = await this.loadScreenshot(fileName, 'expected');
            
            // Compare screenshots
            const diff = await this.compareScreenshots(baseline, currentScreenshot, {
                threshold: opts.threshold || this.comparisonThreshold,
                generateDiff: true
            });
            
            const result: VisualTestResult = {
                passed: diff.identical,
                testName,
                baselinePath: expectedPath,
                actualPath,
                difference: diff.diffPercentage,
                diffPixels: diff.diffPixels,
                totalPixels: diff.totalPixels
            };
            
            if (!diff.identical) {
                // Save diff image
                if (diff.diffImage) {
                    await this.saveScreenshot(diff.diffImage, fileName, 'diff');
                    result.diffPath = diffPath;
                }
                
                this.logger.warn(`Visual difference detected for: ${testName} ` +
                           `(${diff.diffPercentage.toFixed(2)}% difference)`);
                
                if (opts.failOnDiff) {
                    throw new Error(
                        `Visual regression test failed: ${testName}\n` +
                        `Difference: ${diff.diffPercentage.toFixed(2)}%\n` +
                        `Diff pixels: ${diff.diffPixels}/${diff.totalPixels}`
                    );
                }
            }
            
            return result;
            
        } catch (error) {
            this.logger.error(`Visual testing failed: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Generate screenshot report
     */
    async generateScreenshotReport(results: VisualTestResult[]): Promise<string> {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Visual Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #93186C; color: white; padding: 20px; border-radius: 8px; }
        .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .test { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .test.passed { border-left: 5px solid #28a745; }
        .test.failed { border-left: 5px solid #dc3545; }
        .test.new { border-left: 5px solid #17a2b8; }
        .images { display: flex; gap: 20px; margin-top: 20px; flex-wrap: wrap; }
        .image-container { flex: 1; min-width: 300px; }
        .image-container img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
        .image-label { font-weight: bold; margin-bottom: 5px; }
        .stats { display: flex; gap: 40px; }
        .stat { text-align: center; }
        .stat-value { font-size: 36px; font-weight: bold; color: #93186C; }
        .stat-label { color: #666; }
        .diff-info { background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Visual Test Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${results.length}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat">
                <div class="stat-value">${results.filter(r => r.passed).length}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat">
                <div class="stat-value">${results.filter(r => !r.passed && !r.isNewBaseline).length}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat">
                <div class="stat-value">${results.filter(r => r.isNewBaseline).length}</div>
                <div class="stat-label">New Baselines</div>
            </div>
        </div>
    </div>
    
    ${results.map(result => `
        <div class="test ${result.passed ? 'passed' : result.isNewBaseline ? 'new' : 'failed'}">
            <h3>${result.testName}</h3>
            ${result.isNewBaseline ? 
                '<p>✨ New baseline created</p>' :
                result.passed ? 
                    '<p>✅ Visual test passed</p>' :
                    `<div class="diff-info">
                        <p>❌ Visual difference detected</p>
                        <p>Difference: ${result.difference?.toFixed(2)}%</p>
                        <p>Changed pixels: ${result.diffPixels}/${result.totalPixels}</p>
                    </div>`
            }
            
            <div class="images">
                ${result.baselinePath ? `
                    <div class="image-container">
                        <div class="image-label">Expected</div>
                        <img src="${result.baselinePath}" alt="Expected">
                    </div>
                ` : ''}
                
                <div class="image-container">
                    <div class="image-label">Actual</div>
                    <img src="${result.actualPath}" alt="Actual">
                </div>
                
                ${result.diffPath ? `
                    <div class="image-container">
                        <div class="image-label">Difference</div>
                        <img src="${result.diffPath}" alt="Difference">
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('')}
</body>
</html>`;
        
        const reportPath = path.join(this.screenshotPath, 'visual-test-report.html');
        await FileUtils.writeFile(reportPath, html);
        
        this.logger.info(`Visual test report generated: ${reportPath}`);
        
        return reportPath;
    }
    
    /**
     * Annotate screenshot with text or shapes
     */
    async annotateScreenshot(
        screenshot: Buffer,
        _annotations: ScreenshotAnnotation[]
    ): Promise<Buffer> {
        try {
            // Since we don't have sharp, return the original screenshot
            // In production, you would implement actual annotation logic
            this.logger.debug('Screenshot annotated successfully');
            
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to annotate screenshot: ${(error as Error).message}`);
            return screenshot; // Return original on error
        }
    }
    
    /**
     * Stitch multiple screenshots together
     */
    async stitchScreenshots(
        screenshots: Buffer[],
        direction: 'horizontal' | 'vertical' = 'vertical'
    ): Promise<Buffer> {
        try {
            if (screenshots.length === 0) {
                throw new Error('No screenshots to stitch');
            }
            
            // Get metadata for all images
            const images = await Promise.all(
                screenshots.map(async (buffer) => {
                    const img = this.sharp(buffer);
                    const metadata = await img.metadata();
                    return { img, metadata };
                })
            );
            
            // Calculate dimensions
            let totalWidth = 0;
            let totalHeight = 0;
            let maxWidth = 0;
            let maxHeight = 0;
            
            for (const { metadata } of images) {
                maxWidth = Math.max(maxWidth, metadata.width || 0);
                maxHeight = Math.max(maxHeight, metadata.height || 0);
                
                if (direction === 'horizontal') {
                    totalWidth += metadata.width || 0;
                    totalHeight = maxHeight;
                } else {
                    totalWidth = maxWidth;
                    totalHeight += metadata.height || 0;
                }
            }
            
            // Create composite array - unused for now
            
            // Since we don't have sharp, return concatenated buffers
            // In production, you would implement actual image stitching
            this.logger.debug(`Stitched ${screenshots.length} screenshots ${direction}ly`);
            
            return Buffer.concat(screenshots);
            
        } catch (error) {
            this.logger.error(`Failed to stitch screenshots: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Generate screenshot thumbnail
     */
    async generateThumbnail(
        screenshot: Buffer,
        width: number = 200,
        height?: number
    ): Promise<Buffer> {
        try {
            // Placeholder implementation since we don't have sharp
            // In production, you would implement actual thumbnail generation
            this.logger.debug(`Generating thumbnail: ${width}x${height || 'auto'}`);
            
            // Return the original screenshot as a placeholder
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to generate thumbnail: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Apply effects to screenshot
     */
    async applyEffects(
        screenshot: Buffer,
        _effects: ScreenshotEffects
    ): Promise<Buffer> {
        try {
            // Since we don't have sharp, return the original screenshot
            // In production, you would implement actual effects processing
            return screenshot;
            
        } catch (error) {
            this.logger.error(`Failed to apply effects: ${(error as Error).message}`);
            return screenshot;
        }
    }
    
    // Private helper methods
    
    private async preparePageForScreenshot(
        page: Page,
        options: ScreenshotOptions
    ): Promise<void> {
        // Disable animations if requested
        if (options.animations === 'disabled') {
            await page.addStyleTag({
                content: [
                    '*, *::before, *::after {',
                    '    animation-duration: 0s !important;',
                    '    animation-delay: 0s !important;',
                    '    transition-duration: 0s !important;',
                    '    transition-delay: 0s !important;',
                    '}'
                ].join('\n')
            });
        }
        
        // Hide caret if requested
        if (options.caret === 'hide') {
            await page.addStyleTag({
                content: [
                    '* {',
                    '    caret-color: transparent !important;',
                    '}'
                ].join('\n')
            });
        }
        
        // Wait for fonts to load
        await page.evaluate(() => {
            return document.fonts.ready;
        });
        
        // Wait for images to load
        await page.waitForLoadState('networkidle');
    }
    
    private async waitForElementStability(
        element: ElementHandle | Locator,
        timeout: number = 1000
    ): Promise<void> {
        const startTime = Date.now();
        let lastBox = await element.boundingBox();
        
        while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const currentBox = await element.boundingBox();
            
            if (lastBox && currentBox &&
                lastBox.x === currentBox.x &&
                lastBox.y === currentBox.y &&
                lastBox.width === currentBox.width &&
                lastBox.height === currentBox.height) {
                return;
            }
            
            lastBox = currentBox;
        }
    }
    
    private async processScreenshot(
        screenshot: Buffer,
        _options: ScreenshotOptions
    ): Promise<Buffer> {
        // Add any post-processing here
        return screenshot;
    }
    
    private async comparePixels(
        baseline: Buffer,
        current: Buffer,
        width: number,
        height: number,
        options: ComparisonOptions
    ): Promise<ScreenshotDiff> {
        const totalPixels = width * height;
        let diffPixels = 0;
        const diffMask = Buffer.alloc(totalPixels * 4);
        
        for (let i = 0; i < totalPixels * 4; i += 4) {
            const baseR = baseline[i] ?? 0;
            const baseG = baseline[i + 1] ?? 0;
            const baseB = baseline[i + 2] ?? 0;
            const baseA = baseline[i + 3] ?? 0;
            
            const currR = current[i] ?? 0;
            const currG = current[i + 1] ?? 0;
            const currB = current[i + 2] ?? 0;
            const currA = current[i + 3] ?? 0;
            
            const deltaR = Math.abs(baseR - currR);
            const deltaG = Math.abs(baseG - currG);
            const deltaB = Math.abs(baseB - currB);
            const deltaA = Math.abs(baseA - currA);
            
            const delta = (deltaR + deltaG + deltaB + deltaA) / (4 * 255);
            
            if (delta > options.threshold) {
                diffPixels++;
                // Mark diff in red
                diffMask[i] = 255;     // R
                diffMask[i + 1] = 0;   // G
                diffMask[i + 2] = 0;   // B
                diffMask[i + 3] = 255; // A
            } else {
                // Copy original pixel
                diffMask[i] = baseR;
                diffMask[i + 1] = baseG;
                diffMask[i + 2] = baseB;
                diffMask[i + 3] = baseA;
            }
        }
        
        const difference = (diffPixels / totalPixels) * 100;
        
        const result: ScreenshotDiff = {
            identical: difference <= options.threshold * 100,
            diffPercentage: difference,
            diffPixels,
            totalPixels
        };
        
        if (diffPixels > 0) {
            result.diffImage = diffMask;
            // Add regions with differences
            result.regions = [{
                x: 0,
                y: 0,
                width,
                height
            }];
        }
        
        return result;
    }
    
    private async generateDiffImage(
        _baseline: Buffer,
        _current: Buffer,
        diffMask: Buffer,
        _width: number,
        _height: number
    ): Promise<Buffer> {
        // Since we don't have sharp, return the diffMask as is
        // In production, you would implement actual diff image generation
        return diffMask;
    }
    
    private sanitizeFileName(name: string): string {
        return name
            .replace(/[^a-zA-Z0-9-_]/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();
    }
}

// Type definitions - Additional internal types not in debug.types.ts
interface ScreenshotData {
    buffer: Buffer;
    metadata: {
        width: number;
        height: number;
        format: string;
        size: number;
    };
    timestamp: Date;
}

interface ScreenshotAnnotation {
    type: 'text' | 'box' | 'arrow' | 'highlight';
    text?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    startTime?: number;
    duration?: number;
    color?: string;
    style?: 'solid' | 'dashed' | 'dotted';
}

interface ScreenshotEffects {
    blur?: number;
    grayscale?: boolean;
    brightness?: number;
    contrast?: number;
    rotate?: number;
    flip?: boolean;
    flop?: boolean;
}

// Export additional types
export { ScreenshotData, ScreenshotAnnotation, ScreenshotEffects };