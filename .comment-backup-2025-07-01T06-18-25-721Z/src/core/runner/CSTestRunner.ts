// src/core/runner/CSTestRunner.ts

import { performance } from 'perf_hooks';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { ProxyManager } from '../proxy/ProxyManager';
import { BrowserManager } from '../browser/BrowserManager';
import { BrowserPool } from '../browser/BrowserPool';
import { DebugManager } from '../debugging/DebugManager';
import { ReportOrchestrator } from '../../reporting/core/ReportOrchestrator';
import { ADOIntegrationService } from '../../integrations/ado/ADOIntegrationService';

export interface TestRunnerConfig {
    environment?: string;
    parallel?: boolean;
    workers?: number;
    timeout?: number;
    retries?: number;
    debug?: boolean;
    headless?: boolean;
    proxy?: boolean;
    reporting?: boolean;
    adoIntegration?: boolean;
    logLevel?: string;
    reportPath?: string;
    uploadToADO?: boolean;
}

export interface ExecutionPlan {
    totalTests: number;
    testFiles: string[];
    estimatedDuration: number;
    parallelGroups?: TestGroup[];
    metadata: Record<string, any>;
}

export interface TestGroup {
    id: string;
    tests: TestItem[];
    estimatedDuration: number;
    dependencies?: string[];
}

export interface TestItem {
    id: string;
    name: string;
    type: 'unit' | 'integration' | 'e2e' | 'bdd' | 'api' | 'database';
    filePath: string;
    metadata: Record<string, any>;
}

export interface ExecutionResult {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    startTime: Date;
    endTime: Date;
    testResults: TestItemResult[];
    summary: ExecutionSummary;
    metadata: Record<string, any>;
}

export interface TestItemResult {
    testItem: TestItem;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    duration: number;
    startTime: Date;
    endTime: Date;
    error?: Error;
    evidence?: any[];
    metadata: Record<string, any>;
}

export interface ExecutionSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    duration: number;
    environment: string;
}

export interface RetryConfig {
    maxRetries: number;
    retryDelay: number;
    retryOnFailure: boolean;
    retryOnError: boolean;
}

export interface FailureHandlingConfig {
    continueOnFailure: boolean;
    emergencyStop: boolean;
    failFast: boolean;
    maxFailures?: number;
}

export type RunnerState = 'idle' | 'initializing' | 'discovering' | 'planning' | 'running' | 'reporting' | 'cleanup' | 'stopped' | 'error';

/**
 * CSTestRunner - Generic Test Execution Engine
 * Manages test execution flow, retry logic, and failure handling
 * Supports multiple test types beyond just BDD
 */
export class CSTestRunner {
    private static instance: CSTestRunner;
    
    private state: RunnerState = 'idle';
    private config: TestRunnerConfig = {};
    private retryConfig: RetryConfig = {
        maxRetries: 0,
        retryDelay: 1000,
        retryOnFailure: true,
        retryOnError: true
    };
    private failureConfig: FailureHandlingConfig = {
        continueOnFailure: true,
        emergencyStop: false,
        failFast: false
    };
    
    // Component instances
    private configManager?: ConfigurationManager;
    private browserManager?: BrowserManager;
    private browserPool?: BrowserPool;
    private proxyManager?: ProxyManager;
    private debugManager?: DebugManager;
    private reportOrchestrator?: ReportOrchestrator;
    private adoService?: ADOIntegrationService;
    
    // Execution tracking
    private currentExecution?: ExecutionResult;
    private executionStatistics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0
    };

    private constructor() {}

    /**
     * Get singleton instance
     */
    static getInstance(): CSTestRunner {
        if (!CSTestRunner.instance) {
            CSTestRunner.instance = new CSTestRunner();
        }
        return CSTestRunner.instance;
    }

    /**
     * Initialize the test runner
     */
    async initialize(config: TestRunnerConfig): Promise<void> {
        const startTime = performance.now();
        
        try {
            logger.info('Initializing CSTestRunner...');
            this.state = 'initializing';
            this.config = { ...this.config, ...config };

            // Load configuration
            await this.initializeConfiguration();
            
            // Initialize browser management
            await this.initializeBrowserManagement();
            
            // Initialize proxy if needed
            if (this.config.proxy || ConfigurationManager.getBoolean('PROXY_ENABLED', false)) {
                await this.initializeProxy();
            }
            
            // Initialize debug mode if requested
            if (this.config.debug) {
                await this.initializeDebugMode();
            }
            
            // Initialize logging
            await this.initializeLogging();
            
            // Initialize reporting
            if (this.config.reporting !== false) {
                await this.initializeReporting();
            }
            
            // Initialize ADO integration if enabled
            if (this.config.adoIntegration || ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false)) {
                await this.initializeADOIntegration();
            }

            this.state = 'idle';
            const initTime = ((performance.now() - startTime) / 1000).toFixed(2);
            logger.info(`CSTestRunner initialized successfully in ${initTime}s`);
            
        } catch (error) {
            this.state = 'error';
            logger.error('CSTestRunner initialization failed', error as Error);
            throw error;
        }
    }

    /**
     * Execute tests with execution plan
     */
    async executeTests(plan: ExecutionPlan): Promise<ExecutionResult> {
        this.validateInitialized();
        
        const startTime = new Date();
        this.state = 'running';
        
        try {
            logger.info(`Executing ${plan.totalTests} test(s)...`);
            
            // Initialize execution result
            this.currentExecution = {
                totalTests: plan.totalTests,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                startTime,
                endTime: new Date(),
                testResults: [],
                summary: {
                    total: plan.totalTests,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    passRate: 0,
                    duration: 0,
                    environment: this.config.environment || 'unknown'
                },
                metadata: { ...plan.metadata }
            };

            // Execute tests based on configuration
            if (this.config.parallel && plan.parallelGroups) {
                await this.executeTestsInParallel(plan.parallelGroups);
            } else {
                await this.executeTestsSequentially(plan.testFiles);
            }

            // Finalize execution result
            const endTime = new Date();
            this.currentExecution.endTime = endTime;
            this.currentExecution.duration = endTime.getTime() - startTime.getTime();
            this.currentExecution.summary.duration = this.currentExecution.duration;
            this.currentExecution.summary.passRate = 
                this.currentExecution.totalTests > 0 
                    ? (this.currentExecution.passed / this.currentExecution.totalTests) * 100 
                    : 0;

            // Update statistics
            this.updateExecutionStatistics(this.currentExecution);
            
            logger.info(`Test execution completed: ${this.currentExecution.passed}/${this.currentExecution.totalTests} passed`);
            return this.currentExecution;
            
        } catch (error) {
            this.state = 'error';
            logger.error('Test execution failed', error as Error);
            throw error;
        } finally {
            this.state = 'idle';
        }
    }

    /**
     * Execute single test item
     */
    async executeTest(testItem: TestItem): Promise<TestItemResult> {
        const startTime = new Date();
        
        try {
            logger.debug(`Executing test: ${testItem.name}`);
            
            // This is where specific test type execution would be delegated
            // For now, we'll simulate execution
            const result = await this.delegateTestExecution(testItem);
            
            const endTime = new Date();
            const duration = endTime.getTime() - startTime.getTime();
            
            const testResult: TestItemResult = {
                testItem,
                status: result.status,
                duration,
                startTime,
                endTime,
                metadata: { ...testItem.metadata, ...result.metadata }
            };
            
            // Only add error if it exists
            if (result.error) {
                testResult.error = result.error;
            }
            
            // Only add evidence if it exists
            if (result.evidence) {
                testResult.evidence = result.evidence;
            }
            
            // Update current execution if available
            if (this.currentExecution) {
                this.currentExecution.testResults.push(testResult);
                
                switch (testResult.status) {
                    case 'passed':
                        this.currentExecution.passed++;
                        break;
                    case 'failed':
                    case 'error':
                        this.currentExecution.failed++;
                        break;
                    case 'skipped':
                        this.currentExecution.skipped++;
                        break;
                }
            }
            
            return testResult;
            
        } catch (error) {
            const endTime = new Date();
            const duration = endTime.getTime() - startTime.getTime();
            
            return {
                testItem,
                status: 'error',
                duration,
                startTime,
                endTime,
                error: error as Error,
                metadata: testItem.metadata
            };
        }
    }

    /**
     * Handle test failure with retry logic
     */
    async handleTestFailure(testItem: TestItem, error: Error): Promise<TestItemResult> {
        logger.warn(`Test failed: ${testItem.name} - ${error.message}`);
        
        // Check if we should retry
        if (this.shouldRetryTest(testItem, error)) {
            logger.info(`Retrying test: ${testItem.name}`);
            
            // Wait before retry
            if (this.retryConfig.retryDelay > 0) {
                await this.sleep(this.retryConfig.retryDelay);
            }
            
            // Attempt retry
            return await this.retryTest(testItem);
        }
        
        // No retry, return failure result
        return {
            testItem,
            status: 'failed',
            duration: 0,
            startTime: new Date(),
            endTime: new Date(),
            error,
            metadata: testItem.metadata
        };
    }

    /**
     * Retry test execution
     */
    async retryTest(testItem: TestItem, maxRetries?: number): Promise<TestItemResult> {
        const retriesToAttempt = maxRetries || this.retryConfig.maxRetries;
        let lastError: Error | undefined;
        
        for (let attempt = 1; attempt <= retriesToAttempt; attempt++) {
            try {
                logger.debug(`Retry attempt ${attempt}/${retriesToAttempt} for test: ${testItem.name}`);
                
                const result = await this.executeTest(testItem);
                
                if (result.status === 'passed') {
                    logger.info(`Test passed on retry attempt ${attempt}: ${testItem.name}`);
                    return result;
                }
                
                lastError = result.error;
                
            } catch (error) {
                lastError = error as Error;
                logger.warn(`Retry attempt ${attempt} failed: ${lastError.message}`);
            }
            
            // Wait between retries (except on last attempt)
            if (attempt < retriesToAttempt && this.retryConfig.retryDelay > 0) {
                await this.sleep(this.retryConfig.retryDelay);
            }
        }
        
        // All retries failed
        return {
            testItem,
            status: 'failed',
            duration: 0,
            startTime: new Date(),
            endTime: new Date(),
            error: lastError || new Error('All retry attempts failed'),
            metadata: { ...testItem.metadata, retryAttempts: retriesToAttempt }
        };
    }

    /**
     * Generate execution plan from test files
     */
    async generateExecutionPlan(testFiles: string[], metadata?: Record<string, any>): Promise<ExecutionPlan> {
        this.state = 'planning';
        
        try {
            logger.info(`Generating execution plan for ${testFiles.length} test file(s)...`);
            
            const testItems = await this.discoverTestItems(testFiles);
            
            const plan: ExecutionPlan = {
                totalTests: testItems.length,
                testFiles,
                estimatedDuration: this.estimateExecutionDuration(testItems),
                metadata: metadata || {}
            };
            
            // Generate parallel groups if parallel execution is enabled
            if (this.config.parallel) {
                plan.parallelGroups = this.generateParallelGroups(testItems);
            }
            
            logger.info(`Execution plan generated: ${plan.totalTests} tests, estimated duration: ${plan.estimatedDuration}ms`);
            return plan;
            
        } catch (error) {
            this.state = 'error';
            logger.error('Failed to generate execution plan', error as Error);
            throw error;
        } finally {
            this.state = 'idle';
        }
    }

    /**
     * Validate execution plan
     */
    validateExecutionPlan(plan: ExecutionPlan): boolean {
        try {
            if (plan.totalTests <= 0) {
                logger.error('Execution plan must contain at least one test');
                return false;
            }
            
            if (!plan.testFiles || plan.testFiles.length === 0) {
                logger.error('Execution plan must contain test files');
                return false;
            }
            
            if (this.config.parallel && (!plan.parallelGroups || plan.parallelGroups.length === 0)) {
                logger.warn('Parallel execution requested but no parallel groups defined');
            }
            
            return true;
            
        } catch (error) {
            logger.error('Execution plan validation failed', error as Error);
            return false;
        }
    }

    /**
     * Get real-time execution statistics
     */
    getExecutionStatistics() {
        return {
            ...this.executionStatistics,
            currentExecution: this.currentExecution ? {
                status: this.state,
                progress: this.currentExecution.testResults.length / this.currentExecution.totalTests,
                passed: this.currentExecution.passed,
                failed: this.currentExecution.failed,
                skipped: this.currentExecution.skipped,
                duration: this.currentExecution.duration
            } : null
        };
    }

    /**
     * Configure retry behavior
     */
    configureRetry(config: Partial<RetryConfig>): void {
        this.retryConfig = { ...this.retryConfig, ...config };
        logger.info(`Retry configuration updated: ${JSON.stringify(this.retryConfig)}`);
    }

    /**
     * Configure failure handling
     */
    configureFailureHandling(config: Partial<FailureHandlingConfig>): void {
        this.failureConfig = { ...this.failureConfig, ...config };
        logger.info(`Failure handling configuration updated: ${JSON.stringify(this.failureConfig)}`);
    }

    /**
     * Get current runner state
     */
    getState(): RunnerState {
        return this.state;
    }

    /**
     * Stop execution
     */
    async stop(): Promise<void> {
        logger.info('Stopping test execution...');
        this.state = 'stopped';
        // Implementation would handle graceful shutdown
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        try {
            logger.info('Cleaning up test runner resources...');
            
            // Cleanup components
            if (this.browserPool) {
                await this.browserPool.cleanup();
            }
            
            if (this.browserManager) {
                await this.browserManager.cleanup();
            }
            
            if (this.proxyManager) {
                await this.proxyManager.cleanup();
            }
            
            if (this.debugManager) {
                await this.debugManager.cleanup();
            }
            
            this.state = 'idle';
            logger.info('Test runner cleanup completed');
            
        } catch (error) {
            logger.error('Test runner cleanup failed', error as Error);
            throw error;
        }
    }

    // Private methods

    private async initializeConfiguration(): Promise<void> {
        await ConfigurationManager.loadConfiguration(this.config.environment || 'default');
        this.configManager = ConfigurationManager.getInstance();
    }

    private async initializeBrowserManagement(): Promise<void> {
        // CRITICAL FIX: Initialize ONLY BrowserManager, NO BROWSER POOL
        this.browserManager = BrowserManager.getInstance();
        
        // CRITICAL FIX: Check if browser is already initialized to prevent multiple launches
        if (this.browserManager.isHealthy()) {
            logger.info('✅ Browser already initialized and healthy - reusing existing browser');
        } else {
            await this.browserManager.initialize();
            logger.info('✅ Browser management initialized successfully');
        }
        // Browser pool disabled to prevent multiple browser instances
    }

    private async initializeProxy(): Promise<void> {
        this.proxyManager = ProxyManager.getInstance();
        // Proxy configuration would be loaded here
    }

    private async initializeDebugMode(): Promise<void> {
        this.debugManager = DebugManager.getInstance();
        this.debugManager.enableDebugMode();
    }

    private async initializeLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.initialize({
            logLevel: this.config.logLevel || 'info',
            logToFile: true,
            logPath: './logs'
        } as any);
    }

    private async initializeReporting(): Promise<void> {
        this.reportOrchestrator = new ReportOrchestrator();
        
        const reportConfig = {
            path: './reports',
            themePrimaryColor: '#93186C',
            themeSecondaryColor: '#FFFFFF',
            generatePDF: false,
            generateExcel: false,
            includeScreenshots: true,
            includeVideos: false,
            includeLogs: true
        };
        
        await this.reportOrchestrator.initialize(reportConfig as any);
    }

    private async initializeADOIntegration(): Promise<void> {
        this.adoService = ADOIntegrationService.getInstance();
        await this.adoService.initialize();
    }

    private async executeTestsInParallel(groups: TestGroup[]): Promise<void> {
        // Parallel execution implementation
        logger.info(`Executing tests in parallel with ${groups.length} group(s)`);
        
        const promises = groups.map(group => this.executeTestGroup(group));
        await Promise.all(promises);
    }

    private async executeTestsSequentially(testFiles: string[]): Promise<void> {
        // Sequential execution implementation
        logger.info(`Executing tests sequentially: ${testFiles.length} file(s)`);
        
        for (const testFile of testFiles) {
            const testItems = await this.discoverTestItems([testFile]);
            
            for (const testItem of testItems) {
                const result = await this.executeTest(testItem);
                
                // Check failure handling configuration
                if (result.status === 'failed' && this.failureConfig.failFast) {
                    logger.warn('Fail-fast enabled, stopping execution');
                    break;
                }
                
                if (this.failureConfig.maxFailures && 
                    this.currentExecution && 
                    this.currentExecution.failed >= this.failureConfig.maxFailures) {
                    logger.warn(`Maximum failures (${this.failureConfig.maxFailures}) reached, stopping execution`);
                    break;
                }
            }
        }
    }

    private async executeTestGroup(group: TestGroup): Promise<void> {
        logger.debug(`Executing test group: ${group.id}`);
        
        for (const testItem of group.tests) {
            await this.executeTest(testItem);
        }
    }

    private async delegateTestExecution(testItem: TestItem): Promise<{
        status: 'passed' | 'failed' | 'skipped' | 'error';
        error?: Error;
        evidence?: any[];
        metadata?: Record<string, any>;
    }> {
        // This is where specific test type execution would be delegated
        // For now, simulate execution based on test type
        
        switch (testItem.type) {
            case 'bdd':
                // Delegate to BDD runner
                return { status: 'passed', metadata: { executedBy: 'CSBDDRunner' } };
            
            case 'api':
                // Delegate to API test runner
                return { status: 'passed', metadata: { executedBy: 'APITestRunner' } };
            
            case 'database':
                // Delegate to database test runner
                return { status: 'passed', metadata: { executedBy: 'DatabaseTestRunner' } };
            
            default:
                // Generic test execution
                return { status: 'passed', metadata: { executedBy: 'GenericTestRunner' } };
        }
    }

    private async discoverTestItems(testFiles: string[]): Promise<TestItem[]> {
        // Test discovery implementation
        return testFiles.map((filePath, index) => ({
            id: `test_${index}`,
            name: `Test ${index + 1}`,
            type: this.inferTestType(filePath),
            filePath,
            metadata: {}
        }));
    }

    private inferTestType(filePath: string): TestItem['type'] {
        if (filePath.endsWith('.feature')) return 'bdd';
        if (filePath.includes('api')) return 'api';
        if (filePath.includes('database')) return 'database';
        if (filePath.includes('e2e')) return 'e2e';
        if (filePath.includes('integration')) return 'integration';
        return 'unit';
    }

    private estimateExecutionDuration(testItems: TestItem[]): number {
        // Simple estimation: 5 seconds per test
        return testItems.length * 5000;
    }

    private generateParallelGroups(testItems: TestItem[]): TestGroup[] {
        const workers = this.config.workers || 4;
        const itemsPerGroup = Math.ceil(testItems.length / workers);
        
        const groups: TestGroup[] = [];
        
        for (let i = 0; i < workers; i++) {
            const startIndex = i * itemsPerGroup;
            const endIndex = Math.min(startIndex + itemsPerGroup, testItems.length);
            const groupTests = testItems.slice(startIndex, endIndex);
            
            if (groupTests.length > 0) {
                groups.push({
                    id: `group_${i}`,
                    tests: groupTests,
                    estimatedDuration: this.estimateExecutionDuration(groupTests)
                });
            }
        }
        
        return groups;
    }

    private shouldRetryTest(_testItem: TestItem, error: Error): boolean {
        if (this.retryConfig.maxRetries <= 0) return false;
        
        // Check retry conditions
        if (error.name === 'TimeoutError' && this.retryConfig.retryOnError) return true;
        if (error.message.includes('flaky') && this.retryConfig.retryOnFailure) return true;
        
        return false;
    }

    private updateExecutionStatistics(result: ExecutionResult): void {
        this.executionStatistics.totalExecutions++;
        
        if (result.failed === 0) {
            this.executionStatistics.successfulExecutions++;
        } else {
            this.executionStatistics.failedExecutions++;
        }
        
        // Update average duration
        this.executionStatistics.averageDuration = 
            (this.executionStatistics.averageDuration * (this.executionStatistics.totalExecutions - 1) + result.duration) 
            / this.executionStatistics.totalExecutions;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private validateInitialized(): void {
        if (this.state === 'idle' && !this.configManager) {
            throw new Error('Test runner not initialized. Call initialize() first.');
        }
    }
}

// Export singleton instance
export const testRunner = CSTestRunner.getInstance();