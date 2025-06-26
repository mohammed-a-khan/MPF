// src/bdd/runner/ScenarioExecutor.ts

import { StepExecutor } from './StepExecutor';
import { HookExecutor } from '../hooks/HookExecutor';
import { ExecutionContext } from '../context/ExecutionContext';
import { ScenarioContext } from '../context/ScenarioContext';
import { BDDContext } from '../context/BDDContext';
import { CSDataProvider } from '../../data/provider/CSDataProvider';
import { ActionLogger } from '../../core/logging/ActionLogger';
// import { ScreenshotManager } from '../../core/debugging/ScreenshotManager';
import { VideoRecorder } from '../../core/debugging/VideoRecorder';
import { TraceRecorder } from '../../core/debugging/TraceRecorder';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import {
    Scenario,
    ScenarioResult,
    Step,
    StepResult,
    TestData,
    ScenarioOutline,
    ExecutionError,
    DataTable,
    DocString,
    StepStatus,
    ScenarioStatus
} from '../types/bdd.types';
import { ExecutionMonitor } from './ExecutionMonitor';
import { StepRegistry } from '../decorators/StepRegistry';
import { CSBDDBaseStepDefinition } from '../base/CSBDDBaseStepDefinition';
import { StepDefinitionLoader } from '../base/StepDefinitionLoader';

/**
 * Executes individual scenarios with full lifecycle management
 */
export class ScenarioExecutor {
    private stepExecutor: StepExecutor;
    private hookExecutor: HookExecutor;
    private dataProvider: CSDataProvider;
    // private screenshotManager: ScreenshotManager; // Not used - screenshots handled by StepExecutor
    private videoRecorder: VideoRecorder;
    private traceRecorder: TraceRecorder;
    private currentContext: ExecutionContext | null = null;
    private sharedExecutionContext: ExecutionContext | null = null;
    private executionMonitor: ExecutionMonitor;
    private stepRegistry: StepRegistry;
    private stepLoader: StepDefinitionLoader;
    private browserManagementStrategy: string;

    constructor() {
        this.stepExecutor = new StepExecutor();
        this.hookExecutor = HookExecutor.getInstance();
        this.dataProvider = CSDataProvider.getInstance();
        // this.screenshotManager = ScreenshotManager.getInstance();
        this.videoRecorder = VideoRecorder.getInstance();
        this.traceRecorder = TraceRecorder.getInstance();
        this.executionMonitor = ExecutionMonitor.getInstance();
        this.stepRegistry = StepRegistry.getInstance();
        this.stepLoader = StepDefinitionLoader.getInstance();
        
        // Get browser management strategy from configuration
        this.browserManagementStrategy = ConfigurationManager.get('BROWSER_MANAGEMENT_STRATEGY', 'reuse-browser');
        ActionLogger.logInfo(`Browser management strategy: ${this.browserManagementStrategy}`);
    }

    async initialize(): Promise<void> {
        console.log('🔍 DEBUG: Initializing ScenarioExecutor');
        
        // Initialize step loader if not already initialized
        if (!this.stepLoader.isLoaded()) {
            await this.stepLoader.initialize();
        }
        
        // Only create shared execution context if using reuse-browser strategy
        if (this.browserManagementStrategy === 'reuse-browser') {
            if (!this.sharedExecutionContext) {
                this.sharedExecutionContext = await this.createExecutionContext();
            }
            this.currentContext = this.sharedExecutionContext;
        }
        // For new-per-scenario strategy, context will be created for each scenario
    }

    private async createExecutionContext(): Promise<ExecutionContext> {
        console.log('🔍 DEBUG: Creating execution context');
        
        // Mark execution context based on browser management strategy
        const prefix = this.browserManagementStrategy === 'reuse-browser' ? 'shared_execution' : 'scenario';
        const executionId = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const executionContext = new ExecutionContext(executionId);
        await executionContext.initialize();
        
        return executionContext;
    }

    /**
     * Execute a scenario
     */
    public async execute(scenario: Scenario, featureContext?: any): Promise<ScenarioResult> {
        // Handle scenario outlines
        if (this.isScenarioOutline(scenario)) {
            return this.executeScenarioOutline(scenario as ScenarioOutline, featureContext);
        }

        // Handle data-driven scenarios
        if (this.hasDataProvider(scenario)) {
            return this.executeDataDrivenScenario(scenario, featureContext);
        }

        // Execute regular scenario
        return this.executeSingleScenario(scenario, featureContext);
    }

    /**
     * Execute a single scenario instance
     */
    private async executeSingleScenario(
        scenario: Scenario, 
        featureContext?: any,
        testData?: TestData,
        exampleData?: any
    ): Promise<ScenarioResult> {
        const startTime = new Date();
        const scenarioId = `${scenario.name}_${Date.now()}`;

        ActionLogger.logInfo('Scenario Execution', `Starting scenario: ${scenario.name}`);
        if (testData) {
            ActionLogger.logDebug('Test Data', JSON.stringify(testData));
        }

        // 🔥 FIX: Emit scenario start event for ExecutionMonitor
        this.executionMonitor.emit('scenarioStart', scenario);

        console.log(`[ScenarioExecutor] Creating result for scenario "${scenario.name}" with tags:`, scenario.tags);
        console.log(`[ScenarioExecutor] Raw scenario object:`, JSON.stringify(scenario, null, 2));
        
        const result: ScenarioResult = {
            id: scenarioId,
            scenario: scenario.name,
            scenarioRef: scenario,
            tags: scenario.tags || [],
            startTime,
            endTime: new Date(),
            duration: 0,
            status: ScenarioStatus.PASSED,
            steps: [],
            error: null,
            retries: 0,
            timestamp: new Date()
        };
        
        console.log(`[ScenarioExecutor] ScenarioResult created with tags:`, result.tags);
        console.log(`[ScenarioExecutor] Raw result object:`, JSON.stringify(result, null, 2));

        try {
            // Reset step executor state for new scenario
            this.stepExecutor.resetInitializedClasses();
            
            // Handle browser management strategy
            if (this.browserManagementStrategy === 'new-per-scenario') {
                // Create new execution context for each scenario
                this.currentContext = await this.createExecutionContext();
            } else {
                // Use shared execution context for reuse-browser strategy
                if (!this.sharedExecutionContext) {
                    this.sharedExecutionContext = await this.createExecutionContext();
                }
                this.currentContext = this.sharedExecutionContext;
            }
            
            // Initialize BDDContext with the execution context
            BDDContext.getInstance().initialize(this.currentContext);
            
            // Set the scenario in BDDContext
            BDDContext.getInstance().setScenario(scenario);

            // Start recording if enabled
            await this.startRecording(scenarioId);

            // Execute before scenario hooks
            await this.executeBeforeScenarioHooks(scenario, this.currentContext);

            // Replace placeholders in steps if test data is provided
            let stepsToExecute = scenario.steps;
            if (testData) {
                stepsToExecute = this.replacePlaceholdersInSteps(scenario.steps, testData);
                // Store test data in BDD context for step access
                const bddContext = BDDContext.getInstance();
                bddContext.setTestData(testData);
            }

            // Execute steps
            result.steps = await this.executeSteps(stepsToExecute, this.currentContext);

            // Determine scenario status
            result.status = this.determineScenarioStatus(result.steps);

            // Handle retries if failed
            const retryCount = ConfigurationManager.getNumber('RETRY_COUNT', 0) || 0;
            if (result.status === ScenarioStatus.FAILED && retryCount > 0) {
                result.retries = await this.handleRetries(scenario, result);
            }

        } catch (error) {
            ActionLogger.logError('Scenario execution error', new Error(`Scenario: ${scenario.name}`));
            result.status = ScenarioStatus.FAILED;
            const err = error as Error;
            result.error = {
                type: 'execution',
                message: err.message,
                stack: err.stack,
                context: {
                    scenario: scenario.name
                },
                timestamp: new Date()
            } as ExecutionError;
        } finally {
            try {
                // Call after() methods for step definition classes
                await this.stepExecutor.callAfterMethods();
                
                // Execute after scenario hooks
                await this.executeAfterScenarioHooks(scenario, this.currentContext, result);

                // Stop recording and collect artifacts
                const artifacts = await this.stopRecording(scenarioId, result.status);
                // Store artifacts in attachments if needed
                if (artifacts.length > 0) {
                    result.attachments = artifacts.map(a => ({
                        data: a.path,
                        mimeType: a.type === 'video' ? 'video/webm' : 'application/zip',
                        name: a.type
                    }));
                }

                // Take failure screenshot if needed
                // DISABLED: StepExecutor already captures screenshots for failed steps
                // This prevents duplicate screenshots
                // if (result.status === ScenarioStatus.FAILED) {
                //     await this.captureFailureEvidence(scenarioId, result);
                // }

                // Cleanup resources
                await this.cleanup();

            } catch (cleanupError) {
                ActionLogger.logError('Scenario cleanup error', cleanupError as Error);
            }

            // Finalize result
            result.endTime = new Date();
            result.duration = result.endTime.getTime() - result.startTime.getTime();

            // 🔥 FIX: Emit scenario end event for ExecutionMonitor
            this.executionMonitor.emit('scenarioEnd', {
                scenario,
                duration: result.duration,
                status: result.status
            });

            // Log scenario completion
            this.logScenarioCompletion(result);
        }

        return result;
    }

    /**
     * Execute scenario outline with examples
     */
    private async executeScenarioOutline(
        outline: ScenarioOutline,
        featureContext?: any
    ): Promise<ScenarioResult> {
        ActionLogger.logInfo('Scenario Outline', `Executing outline: ${outline.name}`);

        const results: ScenarioResult[] = [];

        for (const example of outline.examples) {
            for (const row of example.rows) {
                // Create scenario from outline with example data
                const scenario = this.createScenarioFromOutline(outline, example.header, row);
                
                // Execute scenario
                const result = await this.executeSingleScenario(
                    scenario,
                    featureContext,
                    undefined,
                    this.createExampleData(example.header, row)
                );

                results.push(result);

                // Stop on first failure if configured
                if (result.status === ScenarioStatus.FAILED && process.env['STOP_ON_FAILURE'] === 'true') {
                    break;
                }
            }
        }

        // Merge results
        return this.mergeOutlineResults(outline, results);
    }

    /**
     * Execute data-driven scenario
     */
    private async executeDataDrivenScenario(
        scenario: Scenario,
        featureContext?: any
    ): Promise<ScenarioResult> {
        ActionLogger.logInfo('Data-Driven Scenario', `Executing: ${scenario.name}`);
        console.log(`🔍 DEBUG: executeDataDrivenScenario called for: ${scenario.name}`);

        // Load test data
        const testDataSet = await this.loadTestData(scenario);
        console.log(`🔍 DEBUG: Loaded ${testDataSet.length} test data rows`);
        
        const results: ScenarioResult[] = [];

        if (testDataSet.length === 0) {
            console.log(`⚠️ WARNING: No test data found for scenario: ${scenario.name}`);
            ActionLogger.logWarn('No test data found', scenario.name);
        }

        for (const testData of testDataSet) {
            console.log(`🔍 DEBUG: Processing test data row:`, JSON.stringify(testData));
            
            // Skip if execution flag is false
            if (testData._execute === false) {
                ActionLogger.logDebug('Skipping test data', JSON.stringify(testData));
                console.log(`🔍 DEBUG: Skipping row due to _execute=false`);
                continue;
            }

            console.log(`🔍 DEBUG: Executing scenario with test data`);
            // Execute scenario with test data
            const result = await this.executeSingleScenario(
                scenario,
                featureContext,
                testData
            );

            results.push(result);

            // Stop on first failure if configured
            if (result.status === ScenarioStatus.FAILED && process.env['STOP_ON_FAILURE'] === 'true') {
                break;
            }
        }

        console.log(`🔍 DEBUG: Executed ${results.length} scenario iterations`);
        // Merge results
        return this.mergeDataDrivenResults(scenario, results);
    }

    /**
     * Execute scenario steps
     */
    public async executeSteps(steps: Step[], context: any): Promise<StepResult[]> {
        console.log(`🔍 DEBUG: executeSteps called with ${steps.length} steps`);
        const results: StepResult[] = [];

        for (const step of steps) {
            console.log(`🔍 DEBUG: About to execute step: ${step.keyword} ${step.text}`);
            
            // Execute before step hooks
            await this.executeBeforeStepHooks(step, context);

            // Execute step
            console.log(`🔍 DEBUG: Calling stepExecutor.execute for: ${step.keyword} ${step.text}`);
            const stepResult = await this.stepExecutor.execute(step, context);
            console.log(`🔍 DEBUG: Step execution completed with status: ${stepResult.status}`);
            results.push(stepResult);

            // Execute after step hooks
            await this.executeAfterStepHooks(step, context, stepResult);

            // Stop execution if step failed
            if (stepResult.status === StepStatus.FAILED) {
                console.log(`🔍 DEBUG: Step failed, marking remaining steps as skipped`);
                // Mark remaining steps as skipped
                const remainingSteps = steps.slice(steps.indexOf(step) + 1);
                for (const remaining of remainingSteps) {
                    results.push({
                        id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        keyword: remaining.keyword,
                        text: remaining.text,
                        status: StepStatus.SKIPPED,
                        duration: 0,
                        startTime: new Date(),
                        endTime: new Date(),
                        skippedReason: 'Previous step failed'
                    });
                }
                break;
            }
        }

        console.log(`🔍 DEBUG: executeSteps completed with ${results.length} results`);
        return results;
    }

    /**
     * Execute before scenario hooks
     */
    private async executeBeforeScenarioHooks(_scenario: Scenario, context: any): Promise<void> {
        try {
            await this.hookExecutor.executeBeforeHooks(context);
        } catch (error) {
            ActionLogger.logError('Before scenario hooks failed', error as Error);
            throw error;
        }
    }

    /**
     * Execute after scenario hooks
     */
    private async executeAfterScenarioHooks(
        _scenario: Scenario,
        context: any,
        _result: ScenarioResult
    ): Promise<void> {
        try {
            await this.hookExecutor.executeAfterHooks(context);
        } catch (error) {
            ActionLogger.logError('After scenario hooks failed', error as Error);
            // Don't throw - after hooks should not fail the scenario
        }
    }

    /**
     * Execute before step hooks
     */
    private async executeBeforeStepHooks(_step: Step, context: any): Promise<void> {
        try {
            await this.hookExecutor.executeBeforeStepHooks(context);
        } catch (error) {
            ActionLogger.logError('Before step hooks failed', error as Error);
            throw error;
        }
    }

    /**
     * Execute after step hooks
     */
    private async executeAfterStepHooks(
        _step: Step,
        context: any,
        _result: StepResult
    ): Promise<void> {
        try {
            await this.hookExecutor.executeAfterStepHooks(context);
        } catch (error) {
            ActionLogger.logError('After step hooks failed', error as Error);
            // Don't throw
        }
    }

    /**
     * Start recording (video/trace)
     */
    private async startRecording(scenarioId: string): Promise<void> {
        try {
            // Ensure context exists before recording
            if (!this.currentContext) {
                return;
            }
            
            const page = this.currentContext.getPage();
            if (!page) {
                ActionLogger.logWarn('No page available for recording');
                return;
            }
            
            // Start video recording if enabled
            if (process.env['RECORD_VIDEO'] === 'true') {
                await this.videoRecorder.startRecording(page);
            }

            // Start trace recording if enabled
            if (process.env['RECORD_TRACE'] === 'true') {
                await this.traceRecorder.startTracing(page, {
                    screenshots: true,
                    snapshots: true,
                    sources: true,
                    title: scenarioId
                });
            }
        } catch (error) {
            ActionLogger.logError('Failed to start recording', error as Error);
        }
    }

    /**
     * Stop recording and collect artifacts
     */
    private async stopRecording(_scenarioId: string, _status: ScenarioStatus): Promise<any[]> {
        const artifacts = [];

        try {
            // Stop video recording
            if (process.env['RECORD_VIDEO'] === 'true') {
                const videoPath = await this.videoRecorder.stopRecording();
                if (videoPath) {
                    artifacts.push({
                        type: 'video',
                        path: videoPath,
                        timestamp: new Date()
                    });
                }
            }

            // Stop trace recording
            if (process.env['RECORD_TRACE'] === 'true') {
                const tracePath = await this.traceRecorder.stopTracing();
                if (tracePath) {
                    artifacts.push({
                        type: 'trace',
                        path: tracePath,
                        timestamp: new Date()
                    });
                }
            }
        } catch (error) {
            ActionLogger.logError('Failed to stop recording', error as Error);
        }

        return artifacts;
    }

    // /**
    //  * Capture failure evidence
    //  * @deprecated - Now handled by StepExecutor to prevent duplicate screenshots
    //  */
    // private async _captureFailureEvidence(scenarioId: string, result: ScenarioResult): Promise<void> {
    //     try {
    //         // Ensure context and page exist
    //         if (!this.currentContext) {
    //             return;
    //         }
    //         
    //         const page = this.currentContext.getPage();
    //         if (!page) {
    //             ActionLogger.logWarn('No page available for failure evidence capture');
    //             return;
    //         }
    //         
    //         // Take screenshot as buffer
    //         const screenshotBuffer = await this.screenshotManager.takeScreenshot(
    //             page,
    //             {
    //                 type: 'png',
    //                 fullPage: true
    //             }
    //         );

    //         // Generate filename with timestamp and scenario info
    //         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    //         const sanitizedScenarioId = scenarioId.replace(/[^a-zA-Z0-9]/g, '_');
    //         const fileName = `failure-${sanitizedScenarioId}-${timestamp}.png`;
    //         
    //         // Save screenshot to evidence directory
    //         const screenshotPath = await this.screenshotManager.saveScreenshot(
    //             screenshotBuffer,
    //             fileName,
    //             'screenshots'
    //         );

    //         if (!result.attachments) {
    //             result.attachments = [];
    //         }
    //         result.attachments.push({
    //             data: screenshotPath,
    //             mimeType: 'image/png',
    //             name: 'Failure screenshot'
    //         });

    //         ActionLogger.logInfo(`Failure evidence captured: ${fileName}`, { 
    //             scenarioId, 
    //             path: screenshotPath,
    //             size: screenshotBuffer.length 
    //         });

    //         // Capture page state
    //         const pageState = await this.capturePageState();
    //         const pageStateFileName = `page-state-${sanitizedScenarioId}-${timestamp}.json`;
    //         const pageStatePath = await this.screenshotManager.saveScreenshot(
    //             Buffer.from(JSON.stringify(pageState, null, 2)),
    //             pageStateFileName,
    //             'page-states'
    //         );
    //         
    //         result.attachments.push({
    //             data: pageStatePath,
    //             mimeType: 'application/json',
    //             name: 'Page state'
    //         });

    //     } catch (error) {
    //         ActionLogger.logError('Failed to capture failure evidence', error as Error);
    //     }
    // }

    // /**
    //  * Capture current page state
    //  */
    // private async capturePageState(): Promise<any> {
    //     const page = this.currentContext?.getPage();
    //     if (!page) {
    //         return {};
    //     }

    //     return {
    //         url: page.url(),
    //         title: await page.title(),
    //         cookies: await page.context().cookies(),
    //         localStorage: await page.evaluate(() => ({ ...localStorage })),
    //         sessionStorage: await page.evaluate(() => ({ ...sessionStorage })),
    //         consoleErrors: await page.evaluate(() => 
    //             (window as any)._consoleErrors || []
    //         )
    //     };
    // }

    /**
     * Cleanup scenario resources
     */
    private async cleanup(): Promise<void> {
        try {
            // Clear scenario context
            const scenarioContext = this.currentContext?.getMetadata('scenarioContext') as ScenarioContext;
            scenarioContext?.clear();

            // Clear BDD context
            BDDContext.getInstance().clearScenarioState();
            
            // Handle cleanup based on browser management strategy
            if (this.browserManagementStrategy === 'new-per-scenario') {
                // For new-per-scenario strategy, fully cleanup the execution context
                if (this.currentContext) {
                    ActionLogger.logInfo('Closing browser for new-per-scenario strategy');
                    await this.currentContext.cleanup();
                    this.currentContext = null;
                }
                ActionLogger.logInfo('Scenario cleanup completed - browser closed');
            } else {
                // For reuse-browser strategy, preserve the browser context
                // Only reset the current context reference
                this.currentContext = null;
                ActionLogger.logInfo('Scenario cleanup completed - browser context preserved');
            }

        } catch (error) {
            ActionLogger.logError('Cleanup error', error as Error);
        }
    }

    /**
     * Final cleanup - call this when all scenarios are complete
     */
    public async finalCleanup(): Promise<void> {
        try {
            ActionLogger.logInfo('Performing final cleanup of shared execution context');
            
            // Now cleanup the shared execution context
            if (this.sharedExecutionContext) {
                await this.sharedExecutionContext.cleanup();
                this.sharedExecutionContext = null;
            }
            
            ActionLogger.logInfo('Final cleanup completed - all browser resources released');
        } catch (error) {
            ActionLogger.logError('Final cleanup error', error as Error);
        }
    }

    /**
     * Handle scenario retries
     */
    private async handleRetries(scenario: Scenario, result: ScenarioResult): Promise<number> {
        const maxRetries = this.getMaxRetries(scenario);
        let retryCount = 0;

        while (retryCount < maxRetries && result.status === ScenarioStatus.FAILED) {
            retryCount++;
            ActionLogger.logInfo('Retry', `Retrying scenario (${retryCount}/${maxRetries}): ${scenario.name}`);

            // Wait before retry
            await this.waitBeforeRetry(retryCount);

            try {
                // CRITICAL FIX: Execute only steps, not the entire scenario
                // This prevents infinite recursion between handleRetries and executeSingleScenario
                
                // Reset context for retry
                await this.resetContextForRetry();
                
                // Execute before scenario hooks for retry
                await this.executeBeforeScenarioHooks(scenario, this.currentContext);
                
                // Re-execute the steps
                const retrySteps = await this.executeSteps(scenario.steps, this.currentContext);
                
                // Determine the status of the retry
                const retryStatus = this.determineScenarioStatus(retrySteps);
                
                if (retryStatus === ScenarioStatus.PASSED) {
                    // Update result with successful retry
                    result.status = ScenarioStatus.PASSED;
                    result.steps = retrySteps;
                    result.error = null;
                    ActionLogger.logInfo('Retry', `Retry ${retryCount} succeeded for: ${scenario.name}`);
                    break;
                } else {
                    // Update result with failed retry but continue loop
                    result.status = retryStatus;
                    result.steps = retrySteps;
                    
                    // Extract error from failed steps
                    const failedStep = retrySteps.find(step => step.status === StepStatus.FAILED);
                    if (failedStep && failedStep.error) {
                        result.error = {
                            type: 'execution',
                            message: failedStep.error.message || 'Step execution failed',
                            stack: failedStep.error.stack,
                            context: {
                                step: failedStep.text,
                                retryCount,
                                scenario: scenario.name
                            },
                            timestamp: new Date()
                        } as ExecutionError;
                    }
                    
                    ActionLogger.logInfo('Retry', `Retry ${retryCount} failed for: ${scenario.name}`);
                }
            } catch (retryError) {
                ActionLogger.logError('Retry execution error', retryError as Error);
                result.error = {
                    type: 'execution',
                    message: (retryError as Error).message,
                    stack: (retryError as Error).stack,
                    context: { 
                        retryCount, 
                        scenario: scenario.name,
                        phase: 'retry'
                    },
                    timestamp: new Date()
                } as ExecutionError;
                
                // Continue to next retry attempt
            } finally {
                // Execute after scenario hooks for retry cleanup
                await this.executeAfterScenarioHooks(scenario, this.currentContext, result);
            }
        }

        // Log final retry outcome
        if (retryCount > 0) {
            if (result.status === ScenarioStatus.PASSED) {
                ActionLogger.logInfo('Retry', `Scenario passed after ${retryCount} retry(s): ${scenario.name}`);
            } else {
                ActionLogger.logInfo('Retry', `Scenario failed after ${retryCount} retry(s): ${scenario.name}`);
            }
        }

        return retryCount;
    }

    /**
     * Reset context for retry
     */
    private async resetContextForRetry(): Promise<void> {
        // Implementation of resetContextForRetry method
    }

    /**
     * Wait before retry
     */
    private async waitBeforeRetry(retryCount: number): Promise<void> {
        // Implementation of waitBeforeRetry method
    }

    /**
     * Determine scenario status
     */
    private determineScenarioStatus(steps: StepResult[]): ScenarioStatus {
        if (steps.length === 0) {
            return ScenarioStatus.PENDING;
        }

        // If any step failed, scenario failed
        if (steps.some(step => step.status === StepStatus.FAILED)) {
            return ScenarioStatus.FAILED;
        }

        // If any step is pending, scenario is pending
        if (steps.some(step => step.status === StepStatus.PENDING)) {
            return ScenarioStatus.PENDING;
        }

        // If all steps are skipped, scenario is skipped
        if (steps.every(step => step.status === StepStatus.SKIPPED)) {
            return ScenarioStatus.SKIPPED;
        }

        // If all steps passed or combination of passed/skipped, scenario passed
        return ScenarioStatus.PASSED;
    }

    /**
     * Check if scenario is an outline
     */
    private isScenarioOutline(scenario: Scenario): boolean {
        // Implementation of isScenarioOutline method
        return false;
    }

    /**
     * Create scenario from outline
     */
    private createScenarioFromOutline(outline: ScenarioOutline, header: string[], row: string[]): Scenario {
        // Implementation of createScenarioFromOutline method
        return {} as Scenario;
    }

    /**
     * Create example data
     */
    private createExampleData(header: string[], row: string[]): any {
        // Implementation of createExampleData method
        return {};
    }

    /**
     * Load test data
     */
    private async loadTestData(scenario: Scenario): Promise<TestData[]> {
        // Find @DataProvider tag
        const dataProviderTag = scenario.tags.find(tag => 
            tag.startsWith('@DataProvider') || tag.includes('DataProvider(')
        );
        
        console.log(`🔍 DEBUG: Looking for @DataProvider tag in: ${scenario.tags}`);
        
        if (!dataProviderTag) {
            console.log(`🔍 DEBUG: No @DataProvider tag found`);
            return [];
        }
        
        console.log(`🔍 DEBUG: Found @DataProvider tag: ${dataProviderTag}`);
        
        try {
            // Import CSDataProvider dynamically to avoid circular dependencies
            const { CSDataProvider } = await import('../../data/provider/CSDataProvider');
            
            // Load data using CSDataProvider
            const dataProvider = CSDataProvider.getInstance();
            console.log(`🔍 DEBUG: Loading data from tag: ${dataProviderTag}`);
            const testData = await dataProvider.loadFromTag(dataProviderTag);
            
            console.log(`🔍 DEBUG: Loaded ${testData.length} rows from ${dataProviderTag}`);
            ActionLogger.logDebug('Loaded test data', `Loaded ${testData.length} rows from ${dataProviderTag}`);
            return testData;
        } catch (error) {
            console.log(`❌ ERROR: Failed to load test data:`, error);
            ActionLogger.logError('Failed to load test data', error as Error);
            throw error;
        }
    }

    /**
     * Merge outline results
     */
    private mergeOutlineResults(outline: ScenarioOutline, results: ScenarioResult[]): ScenarioResult {
        // Implementation of mergeOutlineResults method
        return {} as ScenarioResult;
    }

    /**
     * Merge data-driven results
     */
    private mergeDataDrivenResults(scenario: Scenario, results: ScenarioResult[]): ScenarioResult {
        if (results.length === 0) {
            // No results, return a pending/skipped result
            return {
                id: `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                scenario: scenario.name,  // Changed from 'name' to 'scenario'
                scenarioRef: scenario,    // Add the scenario reference
                tags: scenario.tags,
                status: ScenarioStatus.PENDING,
                steps: [],
                duration: 0,
                startTime: new Date(),
                endTime: new Date(),
                error: null,
                attachments: [],
                metadata: {
                    dataProvider: true,
                    totalIterations: 0,
                    passedIterations: 0,
                    failedIterations: 0
                }
            };
        }

        // Determine overall status
        const hasFailure = results.some(r => r.status === ScenarioStatus.FAILED);
        const allPassed = results.every(r => r.status === ScenarioStatus.PASSED);
        const overallStatus = hasFailure ? ScenarioStatus.FAILED : 
                            allPassed ? ScenarioStatus.PASSED : 
                            ScenarioStatus.PENDING;

        // Collect all steps from all iterations
        const allSteps: StepResult[] = [];
        const allAttachments: any[] = [];
        let totalDuration = 0;

        results.forEach((result, index) => {
            // Add iteration info to steps
            const iterationSteps = result.steps.map(step => ({
                ...step,
                text: `[Iteration ${index + 1}] ${step.text}`
            }));
            allSteps.push(...iterationSteps);
            
            if (result.attachments) {
                allAttachments.push(...result.attachments);
            }
            totalDuration += result.duration;
        });

        // Get the first error if any
        const firstError = results.find(r => r.error)?.error;

        const result: ScenarioResult = {
            id: `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            scenario: scenario.name,  // Changed from 'name' to 'scenario'
            scenarioRef: scenario,    // Add the scenario reference
            status: overallStatus,
            steps: allSteps,
            duration: totalDuration,
            startTime: results[0]?.startTime || new Date(),
            endTime: results[results.length - 1]?.endTime || new Date(),
            metadata: {
                dataProvider: true,
                totalIterations: results.length,
                passedIterations: results.filter(r => r.status === ScenarioStatus.PASSED).length,
                failedIterations: results.filter(r => r.status === ScenarioStatus.FAILED).length
            }
        };
        
        // Add optional properties only if they have values
        if (scenario.tags && scenario.tags.length > 0) {
            result.tags = scenario.tags;
        }
        if (firstError) {
            result.error = firstError;
        }
        if (allAttachments.length > 0) {
            result.attachments = allAttachments;
        }
        
        return result;
    }

    /**
     * Log scenario completion
     */
    private logScenarioCompletion(result: ScenarioResult): void {
        // Implementation of logScenarioCompletion method
    }

    /**
     * Check if data provider exists
     */
    private hasDataProvider(scenario: Scenario): boolean {
        // Check if scenario has @DataProvider tag
        return scenario.tags.some(tag => 
            tag.startsWith('@DataProvider') || tag.includes('DataProvider(')
        );
    }

    /**
     * Get maximum retries
     */
    private getMaxRetries(scenario: Scenario): number {
        // Implementation of getMaxRetries method
        return 0;
    }

    /**
     * Replace placeholders in steps with test data values
     */
    private replacePlaceholdersInSteps(steps: Step[], testData: TestData): Step[] {
        return steps.map(step => {
            let text = step.text;
            
            // Replace all placeholders in the step text
            // Example: "I enter username "<username>" and password "<password>""
            Object.keys(testData).forEach(key => {
                const placeholder = `<${key}>`;
                if (text.includes(placeholder)) {
                    text = text.replace(new RegExp(placeholder, 'g'), String(testData[key]));
                }
            });
            
            return {
                ...step,
                text: text
            };
        });
    }
}