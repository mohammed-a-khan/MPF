// src/bdd/runner/ScenarioExecutor.ts

import { StepExecutor } from './StepExecutor';
import { HookExecutor } from '../hooks/HookExecutor';
import { ExecutionContext } from '../context/ExecutionContext';
import { ScenarioContext } from '../context/ScenarioContext';
import { BDDContext } from '../context/BDDContext';
import { CSDataProvider } from '../../data/provider/CSDataProvider';
import { ActionLogger } from '../../core/logging/ActionLogger';
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
import { OptimizedStepDefinitionLoader } from '../base/OptimizedStepDefinitionLoader';

export class ScenarioExecutor {
    private stepExecutor: StepExecutor;
    private hookExecutor: HookExecutor;
    private dataProvider: CSDataProvider;
    private videoRecorder: VideoRecorder;
    private traceRecorder: TraceRecorder;
    private currentContext: ExecutionContext | null = null;
    private sharedExecutionContext: ExecutionContext | null = null;
    private executionMonitor: ExecutionMonitor;
    private stepRegistry: StepRegistry;
    private stepLoader: StepDefinitionLoader;
    private _browserManagementStrategy?: string;

    constructor() {
        this.stepExecutor = new StepExecutor();
        this.hookExecutor = HookExecutor.getInstance();
        this.dataProvider = CSDataProvider.getInstance();
        this.videoRecorder = VideoRecorder.getInstance();
        this.traceRecorder = TraceRecorder.getInstance();
        this.executionMonitor = ExecutionMonitor.getInstance();
        this.stepRegistry = StepRegistry.getInstance();
        this.stepLoader = StepDefinitionLoader.getInstance();
        
    }

    private get browserManagementStrategy(): string {
        if (!this._browserManagementStrategy) {
            this._browserManagementStrategy = ConfigurationManager.get('BROWSER_MANAGEMENT_STRATEGY', 'reuse-browser');
            ActionLogger.logInfo(`Browser management strategy: ${this._browserManagementStrategy}`);
        }
        return this._browserManagementStrategy;
    }

    async initialize(): Promise<void> {
        if (process.env.DEBUG === 'true') console.log('🔍 DEBUG: Initializing ScenarioExecutor');
        
        if (!this.stepLoader.isLoaded()) {
            await this.stepLoader.initialize();
        }
        
        if (this.browserManagementStrategy === 'reuse-browser') {
            if (!this.sharedExecutionContext) {
                this.sharedExecutionContext = await this.createExecutionContext();
            }
            this.currentContext = this.sharedExecutionContext;
        }
    }

    private async createExecutionContext(): Promise<ExecutionContext> {
        if (process.env.DEBUG === 'true') console.log('🔍 DEBUG: Creating execution context');
        
        const prefix = this.browserManagementStrategy === 'reuse-browser' ? 'shared_execution' : 'scenario';
        const executionId = `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const executionContext = new ExecutionContext(executionId);
        await executionContext.initialize();
        
        return executionContext;
    }

    public async execute(scenario: Scenario, featureContext?: any): Promise<ScenarioResult> {
        if (this.isScenarioOutline(scenario)) {
            return this.executeScenarioOutline(scenario as ScenarioOutline, featureContext);
        }

        if (this.hasDataProvider(scenario)) {
            return this.executeDataDrivenScenario(scenario, featureContext);
        }

        return this.executeSingleScenario(scenario, featureContext);
    }

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

        this.executionMonitor.emit('scenarioStart', scenario);

        
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
        

        try {
            this.stepExecutor.resetInitializedClasses();
            
            if (process.env.DEBUG === 'true') {
                console.log(`🔍 DEBUG ScenarioExecutor: Browser strategy = "${this.browserManagementStrategy}"`);
                console.log(`🔍 DEBUG ScenarioExecutor: Comparing with 'new-per-scenario': ${this.browserManagementStrategy === 'new-per-scenario'}`);
            }
            
            if (this.browserManagementStrategy === 'new-per-scenario') {
                if (process.env.DEBUG === 'true') console.log('🔍 DEBUG ScenarioExecutor: Creating NEW execution context for scenario');
                this.currentContext = await this.createExecutionContext();
            } else {
                if (process.env.DEBUG === 'true') console.log('🔍 DEBUG ScenarioExecutor: Using SHARED execution context (reuse-browser)');
                if (!this.sharedExecutionContext) {
                    this.sharedExecutionContext = await this.createExecutionContext();
                }
                this.currentContext = this.sharedExecutionContext;
            }
            
            BDDContext.getInstance().initialize(this.currentContext);
            
            BDDContext.getInstance().setScenario(scenario);

            await this.startRecording(scenarioId);

            await this.executeBeforeScenarioHooks(scenario, this.currentContext);

            let stepsToExecute = scenario.steps;
            if (testData) {
                stepsToExecute = this.replacePlaceholdersInSteps(scenario.steps, testData);
                const bddContext = BDDContext.getInstance();
                bddContext.setTestData(testData);
            }

            result.steps = await this.executeSteps(stepsToExecute, this.currentContext);

            result.status = this.determineScenarioStatus(result.steps);

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
                await this.stepExecutor.callAfterMethods();
                
                await this.executeAfterScenarioHooks(scenario, this.currentContext, result);

                const artifacts = await this.stopRecording(scenarioId, result.status);
                if (artifacts.length > 0) {
                    result.attachments = artifacts.map(a => ({
                        data: a.path,
                        mimeType: a.type === 'video' ? 'video/webm' : 'application/zip',
                        name: a.type
                    }));
                }


                await this.cleanup();

            } catch (cleanupError) {
                ActionLogger.logError('Scenario cleanup error', cleanupError as Error);
            }

            result.endTime = new Date();
            result.duration = result.endTime.getTime() - result.startTime.getTime();

            this.executionMonitor.emit('scenarioEnd', {
                scenario,
                duration: result.duration,
                status: result.status
            });

            this.logScenarioCompletion(result);
        }

        return result;
    }

    private async executeScenarioOutline(
        outline: ScenarioOutline,
        featureContext?: any
    ): Promise<ScenarioResult> {
        ActionLogger.logInfo('Scenario Outline', `Executing outline: ${outline.name}`);

        const results: ScenarioResult[] = [];

        for (const example of outline.examples) {
            for (const row of example.rows) {
                const scenario = this.createScenarioFromOutline(outline, example.header, row);
                
                const result = await this.executeSingleScenario(
                    scenario,
                    featureContext,
                    undefined,
                    this.createExampleData(example.header, row)
                );

                results.push(result);

                if (result.status === ScenarioStatus.FAILED && process.env['STOP_ON_FAILURE'] === 'true') {
                    break;
                }
            }
        }

        return this.mergeOutlineResults(outline, results);
    }

    private async executeDataDrivenScenario(
        scenario: Scenario,
        featureContext?: any
    ): Promise<ScenarioResult> {
        ActionLogger.logInfo('Data-Driven Scenario', `Executing: ${scenario.name}`);
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: executeDataDrivenScenario called for: ${scenario.name}`);
        }

        const testDataSet = await this.loadTestData(scenario);
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: Loaded ${testDataSet.length} test data rows`);
        }
        
        const results: ScenarioResult[] = [];

        if (testDataSet.length === 0) {
            console.log(`⚠️ WARNING: No test data found for scenario: ${scenario.name}`);
            ActionLogger.logWarn('No test data found', scenario.name);
        }

        for (const testData of testDataSet) {
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: Processing test data row:`, JSON.stringify(testData));
            
            if (testData._execute === false) {
                ActionLogger.logDebug('Skipping test data', JSON.stringify(testData));
                if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: Skipping row due to _execute=false`);
                continue;
            }

            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: Executing scenario with test data`);
            const result = await this.executeSingleScenario(
                scenario,
                featureContext,
                testData
            );

            results.push(result);

            if (result.status === ScenarioStatus.FAILED && process.env['STOP_ON_FAILURE'] === 'true') {
                break;
            }
        }

        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: Executed ${results.length} scenario iterations`);
        return this.mergeDataDrivenResults(scenario, results);
    }

    public async executeSteps(steps: Step[], context: any): Promise<StepResult[]> {
        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: executeSteps called with ${steps.length} steps`);
        const results: StepResult[] = [];

        for (const step of steps) {
            if (process.env.DEBUG === 'true') {
                console.log(`🔍 DEBUG: About to execute step: ${step.keyword} ${step.text}`);
            }
            
            await this.executeBeforeStepHooks(step, context);

            const stepResult = await this.stepExecutor.execute(step, context);
            if (process.env.DEBUG === 'true') {
                console.log(`🔍 DEBUG: Step execution completed with status: ${stepResult.status}`);
            }
            results.push(stepResult);

            await this.executeAfterStepHooks(step, context, stepResult);

            if (stepResult.status === StepStatus.FAILED) {
                if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: Step failed, marking remaining steps as skipped`);
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

        if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: executeSteps completed with ${results.length} results`);
        return results;
    }

    private async executeBeforeScenarioHooks(_scenario: Scenario, context: any): Promise<void> {
        try {
            await this.hookExecutor.executeBeforeHooks(context);
        } catch (error) {
            ActionLogger.logError('Before scenario hooks failed', error as Error);
            throw error;
        }
    }

    private async executeAfterScenarioHooks(
        _scenario: Scenario,
        context: any,
        _result: ScenarioResult
    ): Promise<void> {
        try {
            await this.hookExecutor.executeAfterHooks(context);
        } catch (error) {
            ActionLogger.logError('After scenario hooks failed', error as Error);
        }
    }

    private async executeBeforeStepHooks(_step: Step, context: any): Promise<void> {
        try {
            await this.hookExecutor.executeBeforeStepHooks(context);
        } catch (error) {
            ActionLogger.logError('Before step hooks failed', error as Error);
            throw error;
        }
    }

    private async executeAfterStepHooks(
        _step: Step,
        context: any,
        _result: StepResult
    ): Promise<void> {
        try {
            await this.hookExecutor.executeAfterStepHooks(context);
        } catch (error) {
            ActionLogger.logError('After step hooks failed', error as Error);
        }
    }

    private async startRecording(scenarioId: string): Promise<void> {
        try {
            if (!this.currentContext) {
                return;
            }
            
            const page = this.currentContext.getPage();
            if (!page) {
                ActionLogger.logWarn('No page available for recording');
                return;
            }
            
            if (process.env['RECORD_VIDEO'] === 'true') {
                await this.videoRecorder.startRecording(page);
            }

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

    private async stopRecording(_scenarioId: string, _status: ScenarioStatus): Promise<any[]> {
        const artifacts = [];

        try {
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

    // 






    // 


    private async cleanup(): Promise<void> {
        try {
            const scenarioContext = this.currentContext?.getMetadata('scenarioContext') as ScenarioContext;
            scenarioContext?.clear();

            BDDContext.getInstance().clearScenarioState();
            
            if (this.browserManagementStrategy === 'new-per-scenario') {
                const ElementCache = require('../../core/elements/ElementCache').ElementCache;
                ElementCache.getInstance().invalidateAll();
                ActionLogger.logInfo('Cleared element cache for new-per-scenario strategy');
            }
            
            if (this.browserManagementStrategy === 'new-per-scenario') {
                if (this.currentContext) {
                    ActionLogger.logInfo('Closing browser for new-per-scenario strategy');
                    await this.currentContext.cleanup();
                    this.currentContext = null;
                }
                ActionLogger.logInfo('Scenario cleanup completed - browser closed');
            } else {
                this.currentContext = null;
                ActionLogger.logInfo('Scenario cleanup completed - browser context preserved');
            }

        } catch (error) {
            ActionLogger.logError('Cleanup error', error as Error);
        }
    }

    public async finalCleanup(): Promise<void> {
        try {
            ActionLogger.logInfo('Performing final cleanup of shared execution context');
            
            if (this.sharedExecutionContext) {
                await this.sharedExecutionContext.cleanup();
                this.sharedExecutionContext = null;
            }
            
            ActionLogger.logInfo('Final cleanup completed - all browser resources released');
        } catch (error) {
            ActionLogger.logError('Final cleanup error', error as Error);
        }
    }

    private async handleRetries(scenario: Scenario, result: ScenarioResult): Promise<number> {
        const maxRetries = this.getMaxRetries(scenario);
        let retryCount = 0;

        while (retryCount < maxRetries && result.status === ScenarioStatus.FAILED) {
            retryCount++;
            ActionLogger.logInfo('Retry', `Retrying scenario (${retryCount}/${maxRetries}): ${scenario.name}`);

            await this.waitBeforeRetry(retryCount);

            try {
                // CRITICAL FIX: Execute only steps, not the entire scenario
                
                await this.resetContextForRetry();
                
                await this.executeBeforeScenarioHooks(scenario, this.currentContext);
                
                const retrySteps = await this.executeSteps(scenario.steps, this.currentContext);
                
                const retryStatus = this.determineScenarioStatus(retrySteps);
                
                if (retryStatus === ScenarioStatus.PASSED) {
                    result.status = ScenarioStatus.PASSED;
                    result.steps = retrySteps;
                    result.error = null;
                    ActionLogger.logInfo('Retry', `Retry ${retryCount} succeeded for: ${scenario.name}`);
                    break;
                } else {
                    result.status = retryStatus;
                    result.steps = retrySteps;
                    
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
                
            } finally {
                await this.executeAfterScenarioHooks(scenario, this.currentContext, result);
            }
        }

        if (retryCount > 0) {
            if (result.status === ScenarioStatus.PASSED) {
                ActionLogger.logInfo('Retry', `Scenario passed after ${retryCount} retry(s): ${scenario.name}`);
            } else {
                ActionLogger.logInfo('Retry', `Scenario failed after ${retryCount} retry(s): ${scenario.name}`);
            }
        }

        return retryCount;
    }

    private async resetContextForRetry(): Promise<void> {
    }

    private async waitBeforeRetry(retryCount: number): Promise<void> {
    }

    private determineScenarioStatus(steps: StepResult[]): ScenarioStatus {
        if (steps.length === 0) {
            return ScenarioStatus.PENDING;
        }

        if (steps.some(step => step.status === StepStatus.FAILED)) {
            return ScenarioStatus.FAILED;
        }

        if (steps.some(step => step.status === StepStatus.PENDING)) {
            return ScenarioStatus.PENDING;
        }

        if (steps.every(step => step.status === StepStatus.SKIPPED)) {
            return ScenarioStatus.SKIPPED;
        }

        return ScenarioStatus.PASSED;
    }

    private isScenarioOutline(scenario: Scenario): boolean {
        return false;
    }

    private createScenarioFromOutline(outline: ScenarioOutline, header: string[], row: string[]): Scenario {
        return {} as Scenario;
    }

    private createExampleData(header: string[], row: string[]): any {
        return {};
    }

    private async loadTestData(scenario: Scenario): Promise<TestData[]> {
        const dataProviderTag = scenario.tags.find(tag => 
            tag.startsWith('@DataProvider') || tag.includes('DataProvider(')
        );
        
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: Looking for @DataProvider tag in: ${scenario.tags}`);
        }
        
        if (!dataProviderTag) {
            if (process.env.DEBUG === 'true') console.log(`🔍 DEBUG: No @DataProvider tag found`);
            return [];
        }
        
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: Found @DataProvider tag: ${dataProviderTag}`);
        }
        
        try {
            const { CSDataProvider } = await import('../../data/provider/CSDataProvider');
            
            const dataProvider = CSDataProvider.getInstance();
            if (process.env.DEBUG === 'true') {
                console.log(`🔍 DEBUG: Loading data from tag: ${dataProviderTag}`);
            }
            const testData = await dataProvider.loadFromTag(dataProviderTag);
            
            if (process.env.DEBUG === 'true') {
                console.log(`🔍 DEBUG: Loaded ${testData.length} rows from ${dataProviderTag}`);
            }
            ActionLogger.logDebug('Loaded test data', `Loaded ${testData.length} rows from ${dataProviderTag}`);
            return testData;
        } catch (error) {
            if (process.env.DEBUG === 'true') console.log(`❌ ERROR: Failed to load test data:`, error);
            ActionLogger.logError('Failed to load test data', error as Error);
            throw error;
        }
    }

    private mergeOutlineResults(outline: ScenarioOutline, results: ScenarioResult[]): ScenarioResult {
        return {} as ScenarioResult;
    }

    private mergeDataDrivenResults(scenario: Scenario, results: ScenarioResult[]): ScenarioResult {
        if (results.length === 0) {
            return {
                id: `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                scenario: scenario.name,
                scenarioRef: scenario,
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

        const hasFailure = results.some(r => r.status === ScenarioStatus.FAILED);
        const allPassed = results.every(r => r.status === ScenarioStatus.PASSED);
        const overallStatus = hasFailure ? ScenarioStatus.FAILED : 
                            allPassed ? ScenarioStatus.PASSED : 
                            ScenarioStatus.PENDING;

        const allSteps: StepResult[] = [];
        const allAttachments: any[] = [];
        let totalDuration = 0;

        results.forEach((result, index) => {
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

        const firstError = results.find(r => r.error)?.error;

        const result: ScenarioResult = {
            id: `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            scenario: scenario.name,
            scenarioRef: scenario,
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

    private logScenarioCompletion(result: ScenarioResult): void {
    }

    private hasDataProvider(scenario: Scenario): boolean {
        return scenario.tags.some(tag => 
            tag.startsWith('@DataProvider') || tag.includes('DataProvider(')
        );
    }

    private getMaxRetries(scenario: Scenario): number {
        return 0;
    }

    private replacePlaceholdersInSteps(steps: Step[], testData: TestData): Step[] {
        return steps.map(step => {
            let text = step.text;
            
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
