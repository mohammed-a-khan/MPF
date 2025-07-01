// src/steps/ui/DebugSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { DebugManager } from '../../core/debugging/DebugManager';
import { ScreenshotManager } from '../../core/debugging/ScreenshotManager';
import { TraceRecorder } from '../../core/debugging/TraceRecorder';
import { VideoRecorder } from '../../core/debugging/VideoRecorder';
import { ConsoleLogger } from '../../core/debugging/ConsoleLogger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { CSWebElement } from '../../core/elements/CSWebElement';
import { CSGetElementOptions } from '../../core/elements/types/element.types';

export class DebugSteps extends CSBDDBaseStepDefinition {
    private debugManager: DebugManager;
    private screenshotManager: ScreenshotManager;
    private traceRecorder: TraceRecorder;
    private videoRecorder: VideoRecorder;
    private consoleLogger: ConsoleLogger;

    constructor() {
        super();
        this.debugManager = DebugManager.getInstance();
        this.screenshotManager = ScreenshotManager.getInstance();
        this.traceRecorder = TraceRecorder.getInstance();
        this.videoRecorder = VideoRecorder.getInstance();
        this.consoleLogger = ConsoleLogger.getInstance();
    }

    @CSBDDStepDef('user pauses execution')
    @CSBDDStepDef('I pause')
    @CSBDDStepDef('debug pause')
    async pauseExecution(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('pause_execution', {});
        
        try {
            await this.debugManager.pauseNow();
            
            await actionLogger.logAction('pause_execution_resumed', { success: true });
        } catch (error) {
            await await actionLogger.logError(error as Error, { action: 'pause_execution' });
            throw new Error(`Failed to pause execution: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user pauses for {int} seconds')
    @CSBDDStepDef('I wait for {int} seconds')
    @CSBDDStepDef('pause for {int} seconds')
    async pauseForSeconds(seconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('pause_for_seconds', { seconds });
        
        try {
            await this.page.waitForTimeout(seconds * 1000);
            
            await actionLogger.logAction('pause_completed', { seconds, success: true });
        } catch (error) {
            await await actionLogger.logError(error as Error, { action: 'pause_for_seconds', seconds });
            throw new Error(`Failed to pause for ${seconds} seconds: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user takes screenshot')
    @CSBDDStepDef('I take a screenshot')
    @CSBDDStepDef('capture screenshot')
    override async takeScreenshot(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Take screenshot');
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const name = `debug-screenshot-${timestamp}`;
            
            await this.debugManager.takeDebugScreenshot(name);
            
            await actionLogger.logAction('Screenshot taken', { name });
        } catch (error) {
            await actionLogger.logError('Take screenshot failed', error as Error);
            throw new Error(`Failed to take screenshot: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user takes screenshot named {string}')
    @CSBDDStepDef('I take a screenshot called {string}')
    async takeNamedScreenshot(name: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Take named screenshot', { name });
        
        try {
            await this.debugManager.takeDebugScreenshot(name);
            
            await actionLogger.logAction('Screenshot taken', { name });
        } catch (error) {
            await actionLogger.logError('Take named screenshot failed', error as Error);
            throw new Error(`Failed to take screenshot "${name}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user takes full page screenshot')
    @CSBDDStepDef('I capture full page screenshot')
    async takeFullPageScreenshot(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Take full page screenshot');
        
        try {
            const screenshot = await this.screenshotManager.takeFullPageScreenshot(this.page);
            
            // Save screenshot
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const path = `${ConfigurationManager.get('SCREENSHOT_PATH', './screenshots')}/full-page-${timestamp}.png`;
            
            const fs = require('fs').promises;
            await fs.writeFile(path, screenshot);
            
            await actionLogger.logAction('Full page screenshot taken', { path });
        } catch (error) {
            await actionLogger.logError('Take full page screenshot failed', error as Error);
            throw new Error(`Failed to take full page screenshot: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user takes screenshot of {string}')
    @CSBDDStepDef('I capture screenshot of {string}')
    async takeElementScreenshot(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Take element screenshot', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            const screenshot = await this.screenshotManager.takeElementScreenshot(element);
            
            // Save screenshot
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sanitizedName = elementDescription.replace(/[^a-zA-Z0-9]/g, '-');
            const path = `${ConfigurationManager.get('SCREENSHOT_PATH', './screenshots')}/element-${sanitizedName}-${timestamp}.png`;
            
            const fs = require('fs').promises;
            await fs.writeFile(path, screenshot);
            
            await actionLogger.logAction('Element screenshot taken', { 
                element: elementDescription,
                path 
            });
        } catch (error) {
            await actionLogger.logError('Take element screenshot failed', error as Error);
            throw new Error(`Failed to take screenshot of "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user enables debug mode')
    @CSBDDStepDef('I enable debugging')
    @CSBDDStepDef('debug mode on')
    async enableDebugMode(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Enable debug mode');
        
        try {
            this.debugManager.enableDebugMode();
            
            // Also enable verbose logging
            ConfigurationManager.set('LOG_LEVEL', 'debug');
            ConfigurationManager.set('VERBOSE_LOGGING', 'true');
            
            await actionLogger.logAction('Debug mode enabled');
        } catch (error) {
            await actionLogger.logError('Enable debug mode failed', error as Error);
            throw new Error(`Failed to enable debug mode: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets breakpoint on next step')
    @CSBDDStepDef('I set a breakpoint')
    @CSBDDStepDef('break on next step')
    async setBreakpointOnNextStep(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Set breakpoint on next step');
        
        try {
            this.debugManager.pauseOnNextStep();
            
            await actionLogger.logAction('Breakpoint set for next step');
        } catch (error) {
            await actionLogger.logError('Set breakpoint failed', error as Error);
            throw new Error(`Failed to set breakpoint: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets breakpoint on step matching {string}')
    @CSBDDStepDef('I set breakpoint for steps containing {string}')
    async setBreakpointOnPattern(stepPattern: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Set breakpoint on pattern', { pattern: stepPattern });
        
        try {
            this.debugManager.setBreakpoint(stepPattern);
            
            await actionLogger.logAction('Breakpoint set for pattern', { pattern: stepPattern });
        } catch (error) {
            await actionLogger.logError('Set breakpoint pattern failed', error as Error);
            throw new Error(`Failed to set breakpoint for pattern "${stepPattern}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user starts trace recording')
    @CSBDDStepDef('I start recording trace')
    async startTraceRecording(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Start trace recording');
        
        try {
            await this.traceRecorder.startTracing(this.page, {
                screenshots: true,
                snapshots: true,
                sources: true
            });
            
            await actionLogger.logAction('Trace recording started');
        } catch (error) {
            await actionLogger.logError('Start trace recording failed', error as Error);
            throw new Error(`Failed to start trace recording: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user stops trace recording')
    @CSBDDStepDef('I stop recording trace')
    async stopTraceRecording(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Stop trace recording');
        
        try {
            await this.traceRecorder.stopTracing();
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tracePath = `${ConfigurationManager.get('TRACE_PATH', './traces')}/trace-${timestamp}.zip`;
            
            await this.traceRecorder.saveTrace(tracePath);
            
            await actionLogger.logAction('Trace recording stopped and saved', { path: tracePath });
        } catch (error) {
            await actionLogger.logError('Stop trace recording failed', error as Error);
            throw new Error(`Failed to stop trace recording: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user starts video recording')
    @CSBDDStepDef('I start recording video')
    async startVideoRecording(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Start video recording');
        
        try {
            await this.videoRecorder.startRecording(this.page);
            
            await actionLogger.logAction('Video recording started');
        } catch (error) {
            await actionLogger.logError('Start video recording failed', error as Error);
            throw new Error(`Failed to start video recording: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user stops video recording')
    @CSBDDStepDef('I stop recording video')
    async stopVideoRecording(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Stop video recording');
        
        try {
            const videoPath = await this.videoRecorder.stopRecording();
            
            await actionLogger.logAction('Video recording stopped', { path: videoPath });
        } catch (error) {
            await actionLogger.logError('Stop video recording failed', error as Error);
            throw new Error(`Failed to stop video recording: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user captures console logs')
    @CSBDDStepDef('I start capturing browser console')
    async startConsoleCapture(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Start console capture');
        
        try {
            this.consoleLogger.startCapture(this.page);
            
            await actionLogger.logAction('Console capture started');
        } catch (error) {
            await actionLogger.logError('Start console capture failed', error as Error);
            throw new Error(`Failed to start console capture: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user prints console logs')
    @CSBDDStepDef('I display browser console logs')
    async printConsoleLogs(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Print console logs');
        
        try {
            const logs = this.consoleLogger.getConsoleLogs();
            
            if (logs.length === 0) {
                await actionLogger.logAction('No console logs captured');
                return;
            }
            
            const logOutput = logs.map(log => 
                `[${log.level}] ${log.timestamp}: ${log.text}`
            ).join('\n');
            
            await actionLogger.logAction('Console logs:\n' + logOutput);
            
            await actionLogger.logAction('Console logs printed', { count: logs.length });
        } catch (error) {
            await actionLogger.logError('Print console logs failed', error as Error);
            throw new Error(`Failed to print console logs: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user highlights {string}')
    @CSBDDStepDef('I highlight element {string}')
    async highlightElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Highlight element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            
            // Inject highlighting style
            await this.page.evaluate((el) => {
                const elem = el as HTMLElement;
                elem.style.border = '3px solid red';
                elem.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                elem.style.transition = 'all 0.3s';
                
                // Remove highlighting after 3 seconds
                setTimeout(() => {
                    elem.style.border = '';
                    elem.style.backgroundColor = '';
                }, 3000);
            }, await element.elementHandle());
            
            await actionLogger.logAction('Element highlighted', { element: elementDescription });
        } catch (error) {
            await actionLogger.logError('Highlight element failed', error as Error);
            throw new Error(`Failed to highlight "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user captures page state')
    @CSBDDStepDef('I capture current page state')
    async capturePageState(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Capture page state');
        
        try {
            const pageState = await this.debugManager.capturePageState(this.page);
            
            // Store for later use
            this.context.store('capturedPageState', pageState);
            
            await actionLogger.logAction('Page state captured', {
                url: pageState.url,
                title: pageState.title,
                timestamp: pageState.timestamp
            });
        } catch (error) {
            await actionLogger.logError('Capture page state failed', error as Error);
            throw new Error(`Failed to capture page state: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user prints page metrics')
    @CSBDDStepDef('I display page performance metrics')
    async printPageMetrics(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Print page metrics');
        
        try {
            const metrics = await this.page.evaluate(() => {
                const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
                
                return {
                    domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                    loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                    domInteractive: navigation.domInteractive - navigation.fetchStart,
                    responseTime: navigation.responseEnd - navigation.requestStart,
                    renderTime: navigation.domComplete - navigation.domInteractive
                };
            });
            
            await actionLogger.logAction('Page Performance Metrics:\n' + 
                `DOM Content Loaded: ${metrics.domContentLoaded}ms\n` +
                `Page Load Complete: ${metrics.loadComplete}ms\n` +
                `DOM Interactive: ${metrics.domInteractive}ms\n` +
                `Response Time: ${metrics.responseTime}ms\n` +
                `Render Time: ${metrics.renderTime}ms`
            );
            
            await actionLogger.logAction('Page metrics printed');
        } catch (error) {
            await actionLogger.logError('Print page metrics failed', error as Error);
            throw new Error(`Failed to print page metrics: ${(error as Error).message}`);
        }
    }

    private async findElement(description: string): Promise<CSWebElement> {
        const storedElement = this.context.retrieve<CSWebElement>(`element_${description}`);
        if (storedElement) {
            return storedElement;
        }

        const options: CSGetElementOptions = {
            description,
            locatorType: 'text',
            locatorValue: description,
            aiEnabled: ConfigurationManager.getBoolean('AI_ENABLED', true),
            aiDescription: description,
            waitForVisible: ConfigurationManager.getBoolean('AUTO_WAIT_VISIBLE', true)
        };

        const element = new CSWebElement();
        element.page = this.page;
        element.options = options;
        element.description = description;

        return element;
    }
}