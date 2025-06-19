// src/bdd/runner/FeatureExecutor.ts

import { ScenarioExecutor } from './ScenarioExecutor';
import { HookExecutor } from '../hooks/HookExecutor';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ExecutionContext } from '../context/ExecutionContext';
import { FeatureContext } from '../context/FeatureContext';
import { ExecutionMonitor } from './ExecutionMonitor';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { BrowserManager } from '../../core/browser/BrowserManager';
import { ResourceManager } from '../../core/browser/ResourceManager';
import { Logger } from '../../core/utils/Logger';
import { DateUtils } from '../../core/utils/DateUtils';
import { 
    Feature, 
    FeatureResult, 
    Scenario, 
    ScenarioResult,
    Step,
    StepResult,
    Hook,
    FeatureMetrics,
    ExecutionError,
    StepStatus,
    ScenarioStatus,
    FeatureStatus
} from '../types/bdd.types';

/**
 * Executes feature files by managing scenario execution
 * Handles background, hooks, parallel execution, and error recovery
 */
export class FeatureExecutor {
    private scenarioExecutor: ScenarioExecutor;
    private hookExecutor: HookExecutor;
    private featureContext: FeatureContext | null = null;
    private executionMonitor: ExecutionMonitor;
    private currentFeature: Feature | null = null;
    private backgroundSteps: StepResult[] = [];
    private backgroundContext: ExecutionContext | null = null;
    private isBackgroundFailed: boolean = false;
    private executionConfig: any = {};
    private featureStartTime: Date | null = null;
    private scenarioTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private featureHooks: {
        before: Hook[];
        after: Hook[];
    } = { before: [], after: [] };

    constructor() {
        this.scenarioExecutor = new ScenarioExecutor();
        this.hookExecutor = HookExecutor.getInstance();
        this.executionMonitor = ExecutionMonitor.getInstance();
        this.executionConfig = this.getDefaultConfig();
        this.loadExecutionConfig();
    }

    /**
     * Execute a feature file
     */
    public async execute(feature: Feature): Promise<FeatureResult> {
        this.currentFeature = feature;
        this.featureStartTime = new Date();
        const startTime = this.featureStartTime;

        // Initialize result
        const result: FeatureResult = {
            id: `feature-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            feature: feature,
            name: feature.name,
            description: feature.description || '',
            uri: feature.file || feature.uri || 'unknown',
            tags: feature.tags || [],
            startTime,
            duration: 0,
            status: FeatureStatus.PASSED,
            scenarios: [],
            errors: [],
            metrics: this.initializeMetrics(),
            metadata: {
                language: feature.language || 'en',
                line: feature.line || 0,
                retryCount: 0,
                ['parallel']: false
            }
        };

        try {
            // Log feature start
            const logger = ActionLogger.getInstance();
            logger.info(`Feature started: ${feature.name}`, {
                uri: result.uri,
                scenarios: feature.scenarios.length,
                tags: feature.tags,
                hasBackground: !!feature.background
            });

            // Notify execution monitor
            this.executionMonitor.emit('featureStart', feature);

            // Initialize feature context
            this.featureContext = new FeatureContext(feature);
            await this.featureContext.initialize();

            // Set up feature-level browser if needed
            if (this.executionConfig.browserPerFeature) {
                await this.setupFeatureBrowser();
            }

            // Load feature hooks
            // Get hooks for the feature
            const beforeHooks = await this.hookExecutor.getHooks('Before', feature.tags);
            const afterHooks = await this.hookExecutor.getHooks('After', feature.tags);
            this.featureHooks = { before: beforeHooks, after: afterHooks };

            // Execute before feature hooks
            await this.executeBeforeFeatureHooks(feature, result);

            // Process background if exists
            if (feature.background) {
                await this.processBackground(feature.background as Scenario, result);
            }

            // Execute scenarios based on configuration
            if (this.executionConfig.parallel && feature.scenarios.length > 1 && !this.isBackgroundFailed) {
                result.scenarios = await this.executeScenariosInParallel(feature.scenarios);
                if (result.metadata) {
                    result.metadata['parallel'] = true;
                }
            } else {
                result.scenarios = await this.executeScenariosSequentially(feature.scenarios);
                if (result.metadata) {
                    result.metadata['parallel'] = false;
                }
            }

            // Calculate final status
            result.status = this.calculateFeatureStatus(result.scenarios);

            // Update metrics
            this.updateFeatureMetrics(result);

        } catch (error) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error(`Feature execution error: ${feature.name}`, error as Error);
            const actionLogger = ActionLogger.getInstance();
            actionLogger.error(`Feature failed: ${feature.name}`, error as Error);
            
            result.status = FeatureStatus.FAILED;
            if (!result.errors) result.errors = [];
            result.errors.push(this.createExecutionError(error as Error));

            // Try to recover
            if (this.executionConfig.errorRecovery) {
                await this.attemptErrorRecovery(error as Error, result);
            }
        } finally {
            // Execute after feature hooks
            try {
                await this.executeAfterFeatureHooks(feature, result);
            } catch (hookError) {
                const logger = Logger.getInstance('FeatureExecutor');
                logger.error('After feature hook error', hookError as Error);
                if (!result.errors) result.errors = [];
                result.errors.push(this.createExecutionError(hookError as Error, 'teardown'));
            }

            // Cleanup
            await this.cleanupFeature();

            // Finalize result
            result.endTime = new Date();
            result.duration = result.endTime.getTime() - (result.startTime?.getTime() || this.featureStartTime?.getTime() || Date.now());

            // Log feature completion
            this.logFeatureCompletion(result);

            // Notify execution monitor
            this.executionMonitor.emit('featureEnd', {
                feature,
                duration: result.duration,
                status: result.status
            });

            // Save feature result if configured
            if (this.executionConfig.saveIntermediateResults) {
                await this.saveFeatureResult(result);
            }
        }

        return result;
    }

    /**
     * Process background steps
     */
    private async processBackground(background: Scenario, featureResult: FeatureResult): Promise<void> {
        const backgroundStartTime = new Date();
        
        try {
            const logger = ActionLogger.getInstance();
            logger.info(`Background started: ${background.name || 'Background'}`);

            // Create background context
            this.backgroundContext = await this.createBackgroundContext();

            // Create pseudo-scenario for background execution
            const backgroundScenario: Scenario = {
                id: `background-${Date.now()}`,
                name: background.name || 'Background',
                description: background.description || '',
                type: 'background' as 'scenario' | 'scenario_outline' | 'background',
                tags: [],
                steps: background.steps,
                examples: [],
                line: background.line || 0
            };

            // Execute background steps
            const backgroundStepResults = await this.scenarioExecutor.executeSteps(
                backgroundScenario.steps,
                this.backgroundContext
            );

            // Store results
            this.backgroundSteps = backgroundStepResults;
            this.isBackgroundFailed = backgroundStepResults.some(s => s.status === StepStatus.FAILED);

            // Calculate background status
            const backgroundStatus = this.isBackgroundFailed ? ScenarioStatus.FAILED : 
                                   backgroundStepResults.every(s => s.status === StepStatus.PASSED) ? ScenarioStatus.PASSED : ScenarioStatus.SKIPPED;
            
            // Calculate duration
            const backgroundDuration = backgroundStepResults.reduce((sum, s) => sum + (s.duration || 0), 0);

            // Update feature result
            featureResult.background = {
                name: background.name || 'Background',
                description: background.description || '',
                steps: this.backgroundSteps,
                status: backgroundStatus,
                duration: backgroundDuration,
                startTime: backgroundStartTime,
                endTime: new Date()
            };

            if (this.isBackgroundFailed) {
                const error = this.findFirstStepError(this.backgroundSteps);
                if (error) {
                    throw new Error(`Background failed: ${error.message}`);
                }
            }

            const actionLogger = ActionLogger.getInstance();
            actionLogger.info(`Background completed: ${background.name || 'Background'} - ${backgroundStatus}`);

        } catch (error) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error('Background execution failed', error as Error);
            this.isBackgroundFailed = true;
            
            featureResult.background = {
                name: background.name || 'Background',
                description: background.description || '',
                steps: this.backgroundSteps,
                status: ScenarioStatus.FAILED,
                duration: Date.now() - backgroundStartTime.getTime(),
                startTime: backgroundStartTime,
                endTime: new Date(),
                error: this.createExecutionError(error as Error)
            };
            
            throw error;
        }
    }

    /**
     * Execute scenarios sequentially
     */
    private async executeScenariosSequentially(scenarios: Scenario[]): Promise<ScenarioResult[]> {
        const results: ScenarioResult[] = [];
        let shouldContinue = true;

        for (let i = 0; i < scenarios.length && shouldContinue; i++) {
            const scenario = scenarios[i];
            if (!scenario) continue;
            
            try {
                // Check execution conditions
                const skipReason = this.shouldSkipScenario(scenario);
                if (skipReason) {
                    results.push(this.createSkippedResult(scenario, skipReason));
                    continue;
                }

                // Check if background failed
                if (this.isBackgroundFailed && !this.executionConfig.continueOnBackgroundFailure) {
                    results.push(this.createSkippedResult(scenario, 'Background failed'));
                    continue;
                }

                // Prepare scenario with background steps
                const scenarioWithBackground = await this.prepareScenarioWithBackground(scenario);

                // Set scenario timeout if configured
                const timeoutHandle = this.setScenarioTimeout(scenario.name || `scenario-${i}`);

                // Execute scenario
                const result = await this.scenarioExecutor.execute(
                    scenarioWithBackground, 
                    this.featureContext!
                );

                // Clear timeout
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    this.scenarioTimeouts.delete(scenario?.name || '');
                }

                results.push(result);

                // Check if we should stop on failure
                if (result.status === 'failed' && this.executionConfig.stopOnFirstFailure) {
                    const logger = Logger.getInstance('FeatureExecutor');
                    logger.warn('Stopping feature execution due to scenario failure');
                    shouldContinue = false;
                    
                    // Mark remaining scenarios as skipped
                    for (let j = i + 1; j < scenarios.length; j++) {
                        const remainingScenario = scenarios[j];
                        if (remainingScenario) {
                            results.push(this.createSkippedResult(remainingScenario, 'Previous scenario failed'));
                        }
                    }
                }

                // Progress update
                this.executionMonitor.emit('scenarioEnd', {
                    scenario,
                    duration: result.duration,
                    status: result.status
                });

            } catch (error) {
                const logger = Logger.getInstance('FeatureExecutor');
                logger.error(`Scenario execution error: ${scenario?.name}`, error as Error);
                
                const errorResult = this.createErrorResult(scenario, error as Error);
                results.push(errorResult);

                // Handle timeout cleanup
                const timeoutHandle = this.scenarioTimeouts.get(scenario?.name || '');
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    this.scenarioTimeouts.delete(scenario?.name || '');
                }

                if (this.executionConfig.stopOnFirstFailure) {
                    shouldContinue = false;
                    
                    // Mark remaining as skipped
                    for (let j = i + 1; j < scenarios.length; j++) {
                        const remainingScenario = scenarios[j];
                        if (remainingScenario) {
                            results.push(this.createSkippedResult(remainingScenario, 'Previous scenario error'));
                        }
                    }
                }
            }

            // Delay between scenarios if configured
            if (i < scenarios.length - 1 && this.executionConfig.delayBetweenScenarios > 0) {
                await this.delay(this.executionConfig.delayBetweenScenarios);
            }
        }

        return results;
    }

    /**
     * Execute scenarios in parallel
     */
    private async executeScenariosInParallel(scenarios: Scenario[]): Promise<ScenarioResult[]> {
        const maxParallel = this.executionConfig.maxParallelScenarios || 5;
        const results: ScenarioResult[] = new Array(scenarios.length);
        const executing: Promise<void>[] = [];

        // Create a queue of scenarios
        const queue = scenarios.map((scenario, index) => ({ scenario, index }));

        // Worker function
        const executeWorker = async (): Promise<void> => {
            while (queue.length > 0) {
                const item = queue.shift();
                if (!item) break;

                const { scenario, index } = item;

                try {
                    // Check skip conditions
                    const skipReason = this.shouldSkipScenario(scenario);
                    if (skipReason) {
                        results[index] = this.createSkippedResult(scenario, skipReason);
                        continue;
                    }

                    // Check background failure
                    if (this.isBackgroundFailed && !this.executionConfig.continueOnBackgroundFailure) {
                        results[index] = this.createSkippedResult(scenario, 'Background failed');
                        continue;
                    }

                    // Execute scenario
                    const scenarioWithBackground = await this.prepareScenarioWithBackground(scenario);
                    
                    // Create isolated context for parallel execution
                    const isolatedContext = await this.createIsolatedScenarioContext(scenario);
                    
                    const result = await this.scenarioExecutor.execute(
                        scenarioWithBackground,
                        isolatedContext
                    );

                    results[index] = result;

                    // Cleanup isolated context
                    await isolatedContext.cleanup();

                } catch (error) {
                    const logger = Logger.getInstance('FeatureExecutor');
                    logger.error(`Parallel scenario execution error: ${scenario.name}`, error as Error);
                    results[index] = this.createErrorResult(scenario, error as Error);
                }

                // Progress update
                this.executionMonitor.emit('scenarioEnd', {
                    scenario,
                    duration: results[index].duration,
                    status: results[index].status
                });
            }
        };

        // Start workers
        for (let i = 0; i < Math.min(maxParallel, scenarios.length); i++) {
            executing.push(executeWorker());
        }

        // Wait for all to complete
        await Promise.all(executing);

        return results;
    }

    /**
     * Execute before feature hooks
     */
    private async executeBeforeFeatureHooks(_feature: Feature, result: FeatureResult): Promise<void> {
        const hooks = this.featureHooks.before.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        for (const hook of hooks) {
            const hookStartTime = Date.now();
            
            try {
                const actionLogger = ActionLogger.getInstance();
                actionLogger.info(`Executing before-feature hook: ${hook.name || 'Anonymous'}`);
                
                // Set hook timeout
                const timeoutPromise = this.createTimeoutPromise(
                    hook.timeout || this.executionConfig.hookTimeout,
                    `Before feature hook timeout: ${hook.name}`
                );

                // Execute hook
                await Promise.race([
                    (hook.fn || hook.implementation)(this.featureContext!),
                    timeoutPromise
                ]);

                const logger = ActionLogger.getInstance();
                logger.info(`Before-feature hook completed: ${hook.name || 'Anonymous'} (${Date.now() - hookStartTime}ms)`);

            } catch (error) {
                const logger = Logger.getInstance('FeatureExecutor');
                logger.error(`Before feature hook failed: ${hook.name}`, error as Error);
                const actionLogger = ActionLogger.getInstance();
                actionLogger.error(`Before-feature hook failed: ${hook.name || 'Anonymous'}`, error as Error);
                
                // Add to errors but don't stop execution based on config
                if (!result.errors) result.errors = [];
                result.errors.push(this.createExecutionError(error as Error, 'setup'));
                
                if (!this.executionConfig.continueOnHookFailure) {
                    throw error;
                }
            }
        }
    }

    /**
     * Execute after feature hooks
     */
    private async executeAfterFeatureHooks(_feature: Feature, result: FeatureResult): Promise<void> {
        // Execute in reverse order
        const hooks = this.featureHooks.after.sort((a, b) => (b.order || 0) - (a.order || 0));
        
        for (const hook of hooks) {
            const hookStartTime = Date.now();
            
            try {
                const actionLogger = ActionLogger.getInstance();
                actionLogger.info(`Executing after-feature hook: ${hook.name || 'Anonymous'}`);
                
                // Pass result to after hooks
                const hookContext = {
                    ...this.featureContext!,
                    result: result
                };

                // Set hook timeout
                const timeoutPromise = this.createTimeoutPromise(
                    hook.timeout || this.executionConfig.hookTimeout,
                    `After feature hook timeout: ${hook.name}`
                );

                // Execute hook
                await Promise.race([
                    (hook.fn || hook.implementation)(hookContext),
                    timeoutPromise
                ]);

                actionLogger.info(`After-feature hook completed: ${hook.name || 'Anonymous'} (${Date.now() - hookStartTime}ms)`);

            } catch (error) {
                const logger = Logger.getInstance('FeatureExecutor');
                logger.error(`After feature hook failed: ${hook.name}`, error as Error);
                const actionLogger = ActionLogger.getInstance();
                actionLogger.error(`After-feature hook failed: ${hook.name || 'Anonymous'}`, error as Error);
                
                // After hooks should not fail the feature
                if (!result.errors) result.errors = [];
                result.errors.push(this.createExecutionError(error as Error, 'teardown'));
            }
        }
    }

    /**
     * Create execution context for background
     */
    private async createBackgroundContext(): Promise<ExecutionContext> {
        const context = new ExecutionContext(`background-${Date.now()}`);
        await context.initialize();
        return context;
    }

    /**
     * Create isolated context for parallel scenario execution
     */
    private async createIsolatedScenarioContext(_scenario: Scenario): Promise<FeatureContext> {
        const isolatedContext = new FeatureContext(this.currentFeature!);
        await isolatedContext.initialize();

        // Copy shared data from main feature context
        if (this.featureContext) {
            isolatedContext.copySharedData(this.featureContext);
        }

        // Set up isolated browser if needed
        if (this.executionConfig.browserPerScenario) {
            await isolatedContext.setupIsolatedBrowser();
        }

        return isolatedContext;
    }

    /**
     * Prepare scenario with background steps
     */
    private async prepareScenarioWithBackground(scenario: Scenario): Promise<Scenario> {
        if (this.backgroundSteps.length === 0 || this.isBackgroundFailed) {
            return scenario;
        }

        // Clone scenario to avoid modifying original
        const scenarioWithBackground: Scenario = {
            ...scenario,
            steps: [...this.convertStepResultsToSteps(this.backgroundSteps), ...scenario.steps]
        };

        return scenarioWithBackground;
    }

    /**
     * Convert step results back to steps for re-execution
     */
    private convertStepResultsToSteps(stepResults: StepResult[]): Step[] {
        return stepResults.map(result => ({
            keyword: result.keyword || 'Given',
            text: result.text || '',
            line: result.line || 0,
            dataTable: result.dataTable,
            docString: result.docString
        } as Step));
    }

    /**
     * Set scenario timeout
     */
    private setScenarioTimeout(scenarioName: string): NodeJS.Timeout | null {
        if (!this.executionConfig.scenarioTimeout || this.executionConfig.scenarioTimeout <= 0) {
            return null;
        }

        const timeout = setTimeout(() => {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error(`Scenario timeout: ${scenarioName}`);
            const actionLogger = ActionLogger.getInstance();
            actionLogger.error(`Scenario timeout: ${scenarioName} after ${this.executionConfig.scenarioTimeout}ms`);
            
            // Force scenario to stop
            // Scenario will be stopped by the executor
        }, this.executionConfig.scenarioTimeout);

        this.scenarioTimeouts.set(scenarioName, timeout);
        return timeout;
    }

    /**
     * Calculate overall feature status
     */
    private calculateFeatureStatus(scenarios: ScenarioResult[]): FeatureStatus {
        if (scenarios.length === 0) {
            return FeatureStatus.SKIPPED;
        }

        const hasFailures = scenarios.some(s => s.status === ScenarioStatus.FAILED || s.status === ScenarioStatus.ERROR);
        const allPassed = scenarios.every(s => s.status === ScenarioStatus.PASSED);
        const allSkipped = scenarios.every(s => s.status === ScenarioStatus.SKIPPED);

        if (hasFailures) return FeatureStatus.FAILED;
        if (allPassed) return FeatureStatus.PASSED;
        if (allSkipped) return FeatureStatus.SKIPPED;
        
        return FeatureStatus.FAILED; // Mixed results default to failed
    }

    /**
     * Check if scenario should be skipped
     */
    private shouldSkipScenario(scenario: Scenario): string | null {
        // Check for @skip tag
        if (scenario.tags?.includes('@skip')) {
            return 'Marked with @skip tag';
        }

        // Check for @ignore tag
        if (scenario.tags?.includes('@ignore')) {
            return 'Marked with @ignore tag';
        }

        // Check for @manual tag
        if (scenario.tags?.includes('@manual')) {
            return 'Manual test - marked with @manual tag';
        }

        // Check for @wip tag if not in WIP mode
        if (scenario.tags?.includes('@wip') && !this.executionConfig.executeWIP) {
            return 'Work in progress - marked with @wip tag';
        }

        // Check for browser-specific tags
        if (this.executionConfig.currentBrowser) {
            const browserTags = [`@${this.executionConfig.currentBrowser}-only`, `@not-${this.executionConfig.currentBrowser}`];
            
            for (const tag of browserTags) {
                if (scenario.tags?.includes(tag)) {
                    if (tag.includes('-only') && !tag.includes(this.executionConfig.currentBrowser)) {
                        return `Skipped for ${this.executionConfig.currentBrowser} browser`;
                    }
                    if (tag.includes('not-') && tag.includes(this.executionConfig.currentBrowser)) {
                        return `Not supported in ${this.executionConfig.currentBrowser} browser`;
                    }
                }
            }
        }

        // Check for environment-specific tags
        const currentEnv = ConfigurationManager.get('ENVIRONMENT', 'dev');
        if (scenario.tags?.includes(`@${currentEnv}-only`)) {
            // This should run
        } else if (scenario.tags?.some(tag => tag.endsWith('-only') && !tag.includes(currentEnv))) {
            return `Not for ${currentEnv} environment`;
        }

        // Check custom skip conditions
        if (this.executionConfig.skipCondition) {
            const skipResult = this.executionConfig.skipCondition(scenario);
            if (skipResult) {
                return typeof skipResult === 'string' ? skipResult : 'Custom skip condition';
            }
        }

        return null;
    }

    /**
     * Create skipped scenario result
     */
    private createSkippedResult(scenario: Scenario, reason: string): ScenarioResult {
        const now = new Date();
        
        return {
            id: `scenario-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            scenario: scenario.name,
            tags: scenario.tags || [],
            startTime: now,
            endTime: now,
            duration: 0,
            status: ScenarioStatus.SKIPPED,
            steps: scenario.steps.map(step => ({
                id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                keyword: step.keyword,
                text: step.text,
                line: step.line,
                status: StepStatus.SKIPPED,
                duration: 0,
                startTime: now,
                endTime: now,
                skippedReason: reason
            })),
            error: null,
            retries: 0,
            metadata: {
                skippedReason: reason,
                scenarioType: scenario.type || 'Scenario',
                line: scenario.line
            }
        };
    }

    /**
     * Create error scenario result
     */
    private createErrorResult(scenario: Scenario, error: Error): ScenarioResult {
        const now = new Date();
        
        return {
            id: `scenario-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            scenario: scenario.name,
            tags: scenario.tags || [],
            startTime: now,
            endTime: now,
            duration: 0,
            status: ScenarioStatus.ERROR,
            steps: [],
            error: this.createExecutionError(error),
            retries: 0,
            metadata: {
                errorType: error.constructor.name,
                scenarioType: scenario.type || 'Scenario',
                line: scenario.line
            }
        };
    }

    /**
     * Create execution error object
     */
    private createExecutionError(error: any, errorType?: 'setup' | 'execution' | 'teardown' | 'timeout' | 'assertion' | 'system'): ExecutionError {
        return {
            type: errorType || 'execution',
            message: error.message || 'Unknown error',
            stack: error.stack,
            timestamp: new Date(),
            details: error.details || {},
            originalError: error
        };
    }

    /**
     * Find first error in steps
     */
    private findFirstStepError(steps: StepResult[]): ExecutionError | null {
        for (const step of steps) {
            if (step.error) {
                return step.error;
            }
        }
        return null;
    }

    /**
     * Initialize metrics
     */
    private initializeMetrics(): FeatureMetrics {
        return {
            totalTime: 0,
            avgScenarioTime: 0,
            avgStepTime: 0,
            fastestScenario: null,
            slowestScenario: null,
            retriesCount: 0,
            flakinessRate: 0,
            successRate: 0,
            totalScenarios: 0,
            passedScenarios: 0,
            failedScenarios: 0,
            skippedScenarios: 0,
            totalSteps: 0,
            passedSteps: 0,
            failedSteps: 0,
            skippedSteps: 0,
            averageScenarioDuration: 0,
            errorRate: 0,
            tags: {}
        };
    }

    /**
     * Update feature metrics
     */
    private updateFeatureMetrics(result: FeatureResult): void {
        const metrics = result.metrics!;
        
        // Update total time
        metrics.totalTime = result.duration || 0;
        
        // Count scenarios
        metrics.totalScenarios = result.scenarios.length;
        metrics.passedScenarios = result.scenarios.filter(s => s.status === ScenarioStatus.PASSED).length;
        metrics.failedScenarios = result.scenarios.filter(s => s.status === ScenarioStatus.FAILED || s.status === ScenarioStatus.ERROR).length;
        metrics.skippedScenarios = result.scenarios.filter(s => s.status === ScenarioStatus.SKIPPED).length;

        // Count steps
        for (const scenario of result.scenarios) {
            metrics.totalSteps += scenario.steps.length;
            metrics.passedSteps += scenario.steps.filter(s => s.status === StepStatus.PASSED).length;
            metrics.failedSteps += scenario.steps.filter(s => s.status === StepStatus.FAILED).length;
            metrics.skippedSteps += scenario.steps.filter(s => s.status === StepStatus.SKIPPED).length;
        }

        // Calculate durations
        const scenarioDurations = result.scenarios
            .filter(s => s.status !== ScenarioStatus.SKIPPED)
            .map(s => s.duration);

        if (scenarioDurations.length > 0) {
            metrics.averageScenarioDuration = scenarioDurations.reduce((a, b) => a + b, 0) / scenarioDurations.length;
            
            // Find extremes
            const sortedScenarios = result.scenarios
                .filter(s => s.status !== 'skipped')
                .sort((a, b) => a.duration - b.duration);

            if (sortedScenarios.length > 0) {
                if (sortedScenarios[0]) {
                    metrics.fastestScenario = {
                        name: sortedScenarios[0].scenario,
                        duration: sortedScenarios[0].duration
                    };
                }
                
                const slowestScenario = sortedScenarios[sortedScenarios.length - 1];
                if (slowestScenario) {
                    metrics.slowestScenario = {
                        name: slowestScenario.scenario,
                        duration: slowestScenario.duration
                    };
                }
            }
        }

        // Calculate error rate
        metrics.errorRate = metrics.totalScenarios > 0 
            ? (metrics.failedScenarios / metrics.totalScenarios) * 100 
            : 0;
            
        // Calculate other metrics
        metrics.avgScenarioTime = metrics.averageScenarioDuration;
        metrics.avgStepTime = metrics.totalSteps > 0 ? metrics.totalTime / metrics.totalSteps : 0;
        metrics.successRate = metrics.totalScenarios > 0 
            ? (metrics.passedScenarios / metrics.totalScenarios) * 100 
            : 0;

        // Tag statistics
        for (const scenario of result.scenarios) {
            for (const tag of scenario.tags || []) {
                if (!metrics.tags[tag]) {
                    metrics.tags[tag] = {
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0
                    };
                }
                
                metrics.tags[tag].total++;
                
                switch (scenario.status) {
                    case 'passed':
                        metrics.tags[tag].passed++;
                        break;
                    case 'failed':
                    case 'error':
                        metrics.tags[tag].failed++;
                        break;
                    case 'skipped':
                        metrics.tags[tag].skipped++;
                        break;
                }
            }
        }
    }

    /**
     * Attempt error recovery
     */
    private async attemptErrorRecovery(_error: Error, result: FeatureResult): Promise<void> {
        try {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.info('Attempting error recovery...');
            
            // Take screenshot of error state
            const browserManager = BrowserManager.getInstance();
            const browser = browserManager.getBrowser();
            if (browser) {
                const screenshot = await browserManager.takeScreenshot('error-recovery');
                if (screenshot !== null && screenshot !== undefined) {
                    const errors = result.errors;
                    if (errors && errors.length > 0) {
                        const lastError = errors[errors.length - 1];
                        if (lastError) {
                            lastError.details = {
                                ...lastError.details,
                                screenshot: screenshot
                            };
                        }
                    }
                }
            }

            // Clear any stuck resources
            const resourceManager = ResourceManager.getInstance();
            await resourceManager.forceCleanup();

            // Reset browser state if needed
            if (this.executionConfig.resetBrowserOnError) {
                await browserManager.restartBrowser();
            }

            logger.info('Error recovery completed');
            
        } catch (recoveryError) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error('Error recovery failed', recoveryError as Error);
        }
    }

    /**
     * Setup feature-level browser
     */
    private async setupFeatureBrowser(): Promise<void> {
        if (!this.featureContext) return;

        try {
            await this.featureContext.setupFeatureBrowser();
            const logger = Logger.getInstance('FeatureExecutor');
            logger.debug('Feature-level browser setup completed');
        } catch (error) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error('Failed to setup feature browser', error as Error);
            throw error;
        }
    }

    /**
     * Cleanup feature resources
     */
    private async cleanupFeature(): Promise<void> {
        try {
            // Clear all scenario timeouts
            for (const timeout of Array.from(this.scenarioTimeouts.values())) {
                clearTimeout(timeout);
            }
            this.scenarioTimeouts.clear();

            // CRITICAL FIX: Cleanup shared execution context from scenario executor
            // This ensures browser resources are properly released after all scenarios
            await this.scenarioExecutor.finalCleanup();

            // Cleanup feature context
            if (this.featureContext) {
                await this.featureContext.cleanup();
                this.featureContext = null;
            }

            // Cleanup background context
            if (this.backgroundContext) {
                await this.backgroundContext.cleanup();
                this.backgroundContext = null;
            }

            // Reset state
            this.backgroundSteps = [];
            this.isBackgroundFailed = false;
            this.currentFeature = null;
            this.featureHooks = { before: [], after: [] };

            const logger = Logger.getInstance('FeatureExecutor');
            logger.debug('Feature cleanup completed');
            
        } catch (error) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error('Feature cleanup error', error as Error);
        }
    }

    /**
     * Save intermediate feature result
     */
    private async saveFeatureResult(result: FeatureResult): Promise<void> {
        try {
            const fileName = `feature-result-${result.feature.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
            const filePath = `${this.executionConfig.intermediateResultsPath}/${fileName}`;
            
            const FileUtils = (await import('../../core/utils/FileUtils')).FileUtils;
            await FileUtils.writeJSON(filePath, result);
            const logger = Logger.getInstance('FeatureExecutor');
            logger.debug(`Feature result saved: ${filePath}`);
            
        } catch (error) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.error('Failed to save feature result', error as Error);
        }
    }

    /**
     * Log feature completion
     */
    private logFeatureCompletion(result: FeatureResult): void {
        const summary = {
            feature: result.feature,
            status: result.status,
            duration: DateUtils.formatDuration(result.duration),
            scenarios: {
                total: result.metrics!.totalScenarios,
                passed: result.metrics!.passedScenarios,
                failed: result.metrics!.failedScenarios,
                skipped: result.metrics!.skippedScenarios
            },
            steps: {
                total: result.metrics!.totalSteps,
                passed: result.metrics!.passedSteps,
                failed: result.metrics!.failedSteps,
                skipped: result.metrics!.skippedSteps
            },
            errorRate: `${result.metrics!.errorRate.toFixed(2)}%`
        };

        if (result.status === 'passed') {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.info(`Feature completed: ${result.feature.name}`, summary);
        } else {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.error(`Feature failed: ${result.feature.name}`, summary);
        }

        // Log detailed metrics if verbose
        if (this.executionConfig.verbose) {
            const logger = Logger.getInstance('FeatureExecutor');
            logger.info('Feature Metrics:', result.metrics);
        }
    }

    /**
     * Load execution configuration
     */
    private loadExecutionConfig(): void {
        this.executionConfig = {
            stopOnFirstFailure: ConfigurationManager.getBoolean('STOP_ON_FIRST_FAILURE', false),
            continueOnBackgroundFailure: ConfigurationManager.getBoolean('CONTINUE_ON_BACKGROUND_FAILURE', false),
            continueOnHookFailure: ConfigurationManager.getBoolean('CONTINUE_ON_HOOK_FAILURE', true),
            executeWIP: ConfigurationManager.getBoolean('EXECUTE_WIP', false),
            parallelScenarios: ConfigurationManager.getBoolean('PARALLEL_SCENARIOS', false),
            maxParallelScenarios: ConfigurationManager.getInt('MAX_PARALLEL_SCENARIOS', 5),
            scenarioTimeout: ConfigurationManager.getInt('SCENARIO_TIMEOUT', 300000), // 5 minutes
            hookTimeout: ConfigurationManager.getInt('HOOK_TIMEOUT', 30000), // 30 seconds
            delayBetweenScenarios: ConfigurationManager.getInt('DELAY_BETWEEN_SCENARIOS', 0),
            browserPerFeature: ConfigurationManager.getBoolean('BROWSER_PER_FEATURE', false),
            browserPerScenario: ConfigurationManager.getBoolean('BROWSER_PER_SCENARIO', false),
            currentBrowser: ConfigurationManager.get('BROWSER', 'chromium'),
            saveIntermediateResults: ConfigurationManager.getBoolean('SAVE_INTERMEDIATE_RESULTS', false),
            intermediateResultsPath: ConfigurationManager.get('INTERMEDIATE_RESULTS_PATH', './test-results/intermediate'),
            errorRecovery: ConfigurationManager.getBoolean('ERROR_RECOVERY', true),
            resetBrowserOnError: ConfigurationManager.getBoolean('RESET_BROWSER_ON_ERROR', false),
            verbose: ConfigurationManager.getBoolean('VERBOSE', false),
            skipCondition: null // Can be set programmatically
        };
    }

    /**
     * Create timeout promise
     */
    private createTimeoutPromise(timeout: number, message: string): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeout);
        });
    }

    /**
     * Delay utility
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get default configuration
     */
    private getDefaultConfig(): FeatureExecutionConfig {
        return {
            stopOnFirstFailure: false,
            continueOnBackgroundFailure: false,
            continueOnHookFailure: true,
            executeWIP: false,
            parallelScenarios: false,
            maxParallelScenarios: 5,
            scenarioTimeout: 300000,
            hookTimeout: 30000,
            delayBetweenScenarios: 0,
            browserPerFeature: false,
            browserPerScenario: false,
            currentBrowser: 'chromium',
            saveIntermediateResults: false,
            intermediateResultsPath: './test-results/intermediate',
            errorRecovery: true,
            resetBrowserOnError: false,
            verbose: false,
            skipCondition: null
        };
    }
}

// Feature execution configuration interface
interface FeatureExecutionConfig {
    stopOnFirstFailure: boolean;
    continueOnBackgroundFailure: boolean;
    continueOnHookFailure: boolean;
    executeWIP: boolean;
    parallelScenarios: boolean;
    maxParallelScenarios: number;
    scenarioTimeout: number;
    hookTimeout: number;
    delayBetweenScenarios: number;
    browserPerFeature: boolean;
    browserPerScenario: boolean;
    currentBrowser: string;
    saveIntermediateResults: boolean;
    intermediateResultsPath: string;
    errorRecovery: boolean;
    resetBrowserOnError: boolean;
    verbose: boolean;
    skipCondition: ((scenario: Scenario) => boolean | string) | null;
}

