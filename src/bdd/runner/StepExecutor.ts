// src/bdd/runner/StepExecutor.ts

import { StepRegistry } from '../decorators/StepRegistry';

import { ActionLogger } from '../../core/logging/ActionLogger';
import { DebugManager } from '../../core/debugging/DebugManager';
import { ScreenshotManager } from '../../core/debugging/ScreenshotManager';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { 
    Step, 
    StepResult, 
    StepDefinition,
    DataTable,
    DocString,
    StepStatus,
    ExecutionError,
    Attachment
} from '../types/bdd.types';
import { ExecutionContext } from '../context/ExecutionContext';
import { ExecutionMonitor } from './ExecutionMonitor';
import { BDDContext } from '../context/BDDContext';

/**
 * Executes individual test steps by matching them to step definitions
 */
export class StepExecutor {
    private stepRegistry: StepRegistry;
    private debugManager: DebugManager;
    private screenshotManager: ScreenshotManager;
    private currentContext!: ExecutionContext;
    private executionMonitor: ExecutionMonitor;

    constructor() {
        this.stepRegistry = StepRegistry.getInstance();
        this.debugManager = DebugManager.getInstance();
        this.screenshotManager = ScreenshotManager.getInstance();
        this.executionMonitor = ExecutionMonitor.getInstance();
    }

    /**
     * Execute a single step
     */
    public async execute(step: Step, context: ExecutionContext): Promise<StepResult> {
        const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        let screenshotPath: string | undefined;
        
        try {
            this.currentContext = context;
            this.executionMonitor.emit('stepStart', step);
            
            // Take screenshot before step execution if configured
            if (this.shouldTakeScreenshot('before')) {
                try {
                    const attachment = await this.takeScreenshot('before', step);
                    screenshotPath = attachment.path;
                } catch (screenshotError) {
                    ActionLogger.logWarn('Failed to take before screenshot', screenshotError as Error);
                }
            }
            
            // Record current action log position to capture step actions
            const logStartIndex = ActionLogger.getInstance().getCurrentLogIndex();
            
            // Execute the step
            await this.executeStepDefinitionWithoutResult(step, context);
            
            // Capture action details from logs generated during step execution
            const actionDetails = this.extractActionDetails(logStartIndex);
            
            // Create successful result
            const result: StepResult = {
                id: stepId,
                keyword: step.keyword,
                text: step.text,
                line: step.line,
                status: StepStatus.PASSED,
                duration: 0, // Will be set below
                startTime: new Date(startTime),
                endTime: new Date(Date.now()),
                actionDetails // Add captured action details
            };
            
            // Take screenshot after successful step execution
            if (this.shouldTakeScreenshot('passed')) {
                try {
                    const attachment = await this.takeScreenshot('passed', step);
                    if (result.attachments) {
                        result.attachments.push(attachment);
                    } else {
                        result.attachments = [attachment];
                    }
                } catch (screenshotError) {
                    ActionLogger.logWarn('Failed to take success screenshot', screenshotError as Error);
                }
            }
            
            const duration = Date.now() - startTime;
            this.executionMonitor.emit('stepEnd', {
                step,
                duration,
                status: result.status,
                error: result.error
            });
            
            ActionLogger.logInfo(`Step completed: ${step.keyword} ${step.text}`);
            
            return {
                ...result,
                id: stepId,
                duration,
                startTime: new Date(startTime),
                endTime: new Date(Date.now())
            };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.executionMonitor.emit('stepEnd', {
                step,
                duration,
                status: this.determineErrorStatus(error),
                error: this.formatError(error)
            });
            
            ActionLogger.logError(`Step failed: ${step.keyword} ${step.text}`, error as Error);
            
            // CRITICAL: Capture failure screenshot even when step crashes
            try {
                if (this.shouldTakeScreenshot('failed')) {
                    const attachment = await this.takeScreenshot('failed', step);
                    screenshotPath = attachment.path;
                }
            } catch (screenshotError) {
                ActionLogger.logWarn('Failed to take failure screenshot', screenshotError as Error);
            }
            
            // Create comprehensive failure result
            const failureResult: StepResult = {
                id: stepId,
                keyword: step.keyword,
                text: step.text,
                line: step.line,
                status: this.determineErrorStatus(error),
                duration,
                startTime: new Date(startTime),
                endTime: new Date(Date.now()),
                error: this.formatError(error),
                errorMessage: (error as Error).message,
                stackTrace: (error as Error).stack || '',
                attachments: screenshotPath ? [{
                    data: screenshotPath,
                    mimeType: 'image/png',
                    name: 'failure-screenshot',
                    path: screenshotPath
                }] : []
            };
            
            return failureResult;
        }
    }

    /**
     * Find matching step definition
     */
    private async findStepDefinition(step: Step): Promise<StepDefinition | null> {
        // Step definitions are registered without keywords, so search with just the text
        const stepText = step.text.trim();
        
        // Try to find matching step definition
        let definition = this.stepRegistry.findStepDefinition(stepText);

        // Log if no definition found
        if (!definition) {
            const fullStepText = `${step.keyword} ${step.text}`.trim();
            ActionLogger.logWarn(`No step definition found for: ${fullStepText}`);
        }

        return definition;
    }

    /**
     * Extract parameters from step text
     */
    private extractParameters(step: Step, _definition: StepDefinition): any[] {
        // Use just the step text without keyword for parameter extraction
        const stepText = step.text.trim();
        
        // Use StepRegistry to extract parameters since it has the matching logic
        const parameters = this.stepRegistry.findStepWithParameters(stepText);
        
        if (!parameters) {
            throw new Error('Step text does not match pattern');
        }

        // Transform parameters
        const transformedParams = parameters.parameters.map((param) => {
            return this.autoTransformParameter(param);
        });

        return transformedParams;
    }

    /**
     * Prepare arguments for step execution
     */
    private async prepareArguments(
        parameters: any[], 
        stepArgument: DataTable | DocString | undefined,
        context: ExecutionContext
    ): Promise<any[]> {
        const args = [...parameters];

        // Add step argument if present
        if (stepArgument) {
            if ('rows' in stepArgument) {
                args.push(this.transformDataTable(stepArgument as DataTable));
            } else if ('content' in stepArgument) {
                args.push(this.transformDocString(stepArgument as DocString));
            }
        }

        // Add context as last parameter if step expects it
        // This is determined by the step definition's expectsContext flag
        if (this.stepExpectsContext(parameters.length, stepArgument)) {
            args.push(context);
        }

        return args;
    }

    /**
     * Execute step definition without returning result (for internal use)
     */
    private async executeStepDefinitionWithoutResult(step: Step, context: ExecutionContext): Promise<void> {
        // Log step start
        ActionLogger.logStepStart(step.keyword, step.text);

        // Check for debug breakpoint
        await this.checkDebugBreakpoint(step);

        // Find matching step definition
        const stepDefinition = await this.findStepDefinition(step);
        
        if (!stepDefinition) {
            throw new Error(`No step definition found for: ${step.keyword} ${step.text}`);
        }

        // Extract parameters
        const parameters = this.extractParameters(step, stepDefinition);

        // Prepare arguments
        const stepArgument = step.dataTable || step.docString || undefined;
        const args = await this.prepareArguments(parameters, stepArgument, context);

        // Execute step definition
        await this.executeStepDefinition(stepDefinition, args, context);
    }

    /**
     * Execute step definition function
     */
    private async executeStepDefinition(
        definition: StepDefinition,
        args: any[],
        context: ExecutionContext
    ): Promise<void> {
        // Set timeout for step execution
        const timeout = definition.timeout || ConfigurationManager.getInt('STEP_TIMEOUT', 30000);
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout);
        });

        try {
            // Execute with timeout
            await Promise.race([
                this.executeWithContext(definition, args, context),
                timeoutPromise
            ]);
        } catch (error) {
            // Enhance error with step information
            const err = error as Error;
            if (err.message && err.message.includes('Step timeout')) {
                err.message = `${err.message}\nStep: ${definition.patternString}`;
            }
            throw err;
        }
    }

    /**
     * Execute step with proper context binding
     */
    private async executeWithContext(
        definition: StepDefinition,
        args: any[],
        _context: ExecutionContext
    ): Promise<void> {
        // Get the class instance for proper 'this' binding
        const className = definition.metadata['className'];
        const classInstance = className ? this.stepRegistry.getClassInstance(className) : null;
        
        // Bind the step function to the correct context (class instance)
        const boundFunction = definition.implementation.bind(classInstance);
        
        // Execute the step
        await boundFunction(...args);
    }

    /**
     * Transform DataTable argument
     */
    private transformDataTable(dataTable: DataTable): any {
        // Return different representations based on step needs
        return {
            raw: () => dataTable.rows,
            rows: () => dataTable.rows.slice(1), // Without header
            hashes: () => this.dataTableToHashes(dataTable),
            rowsHash: () => this.dataTableToRowsHash(dataTable),
            transpose: () => this.transposeDataTable(dataTable)
        };
    }

    /**
     * Transform DocString argument
     */
    private transformDocString(docString: DocString): string {
        return docString.content;
    }

    /**
     * Convert DataTable to array of objects
     */
    private dataTableToHashes(dataTable: DataTable): any[] {
        if (dataTable.rows.length < 2) return [];
        
        const headers = dataTable.rows[0];
        if (!headers) return [];
        const hashes: any[] = [];
        
        for (let i = 1; i < dataTable.rows.length; i++) {
            const hash: any = {};
            const row = dataTable.rows[i];
            
            headers.forEach((header, index) => {
                if (header !== undefined && row && row[index] !== undefined) {
                    hash[header] = row[index];
                }
            });
            
            hashes.push(hash);
        }
        
        return hashes;
    }

    /**
     * Convert DataTable to key-value pairs
     */
    private dataTableToRowsHash(dataTable: DataTable): Record<string, string> {
        const hash: Record<string, string> = {};
        
        dataTable.rows.forEach(row => {
            if (row && row.length >= 2 && row[0] !== undefined && row[1] !== undefined) {
                hash[row[0]] = row[1];
            }
        });
        
        return hash;
    }

    /**
     * Transpose DataTable
     */
    private transposeDataTable(dataTable: DataTable): string[][] {
        if (dataTable.rows.length === 0) return [];
        
        const transposed: string[][] = [];
        const rowCount = dataTable.rows.length;
        const colCount = Math.max(...dataTable.rows.map(row => row.length));
        
        for (let col = 0; col < colCount; col++) {
            const newRow: string[] = [];
            for (let row = 0; row < rowCount; row++) {
                const value = dataTable.rows[row]?.[col];
                newRow.push(value ?? '');
            }
            transposed.push(newRow);
        }
        
        return transposed;
    }

    /**
     * Auto-transform parameter based on value
     */
    private autoTransformParameter(value: string): any {
        // Try to parse as number
        if (/^\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        
        if (/^\d+\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        
        // Try to parse as boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        // Try to parse as null/undefined
        if (value.toLowerCase() === 'null') return null;
        if (value.toLowerCase() === 'undefined') return undefined;
        
        // Try to parse as JSON
        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return JSON.parse(value);
            } catch (e) {
                // Not valid JSON, return as string
            }
        }
        
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }
        
        return value;
    }

    /**
     * Determine if step expects context parameter
     */
    private stepExpectsContext(paramCount: number, stepArgument: DataTable | DocString | undefined): boolean {
        // This is a heuristic - in real implementation, step definitions
        // would declare if they expect context
        const expectedParams = paramCount + (stepArgument ? 1 : 0);
        return expectedParams < 3; // Assume steps with few params might want context
    }

    /**
     * Check for debug breakpoint
     */
    private async checkDebugBreakpoint(step: Step): Promise<void> {
        if (!this.debugManager.isDebugMode()) return;

        const stepText = `${step.keyword} ${step.text}`;
        await this.debugManager.checkStepBreakpoint(stepText, this.currentContext);
    }

    /**
     * Determine error status based on error type
     */
    private determineErrorStatus(error: any): StepStatus {
        if (error.pending || error.constructor?.name === 'PendingError') {
            return StepStatus.PENDING;
        }
        if (error.skipped || error.constructor?.name === 'SkippedError') {
            return StepStatus.SKIPPED;
        }
        return StepStatus.FAILED;
    }

    /**
     * Format error for reporting
     */
    private formatError(error: any): ExecutionError {
        const err = error as Error;
        return {
            type: 'execution',
            message: err.message || String(error),
            stack: err.stack || '',
            context: {},
            timestamp: new Date()
        };
    }

    /**
     * Extract action details from logs generated during step execution
     */
    private extractActionDetails(logStartIndex: number): any {
        try {
            const actionLogger = ActionLogger.getInstance();
            const currentLogIndex = actionLogger.getCurrentLogIndex();
            const logs = actionLogger.getLogsInRange(logStartIndex, currentLogIndex);
            
            // Find the most relevant action log
            for (const log of logs) {
                if (log.type === 'action' && log.context) {
                    return {
                        action: log.context['action'] || log.message || 'Unknown Action',
                        target: log.context['target'] || log.context['selector'] || log.context['element'],
                        value: log.context['value'] || log.context['text'] || log.context['data'],
                        description: log.context['description'] || log.message || ''
                    };
                }
            }
            
            // If no specific action log found, try to extract from general logs
            const actionLog = logs.find(log => 
                log.message && (
                    log.message.includes('Click') || 
                    log.message.includes('Type') || 
                    log.message.includes('Navigate') ||
                    log.message.includes('Wait') ||
                    log.message.includes('Select') ||
                    log.message.includes('Assert')
                )
            );
            
            if (actionLog) {
                return {
                    action: 'Step Execution',
                    description: actionLog.message
                };
            }
            
            return null;
        } catch (error) {
            ActionLogger.logDebug('Failed to extract action details', error as Error);
            return null;
        }
    }

    /**
     * Check if screenshot should be taken
     */
    private shouldTakeScreenshot(status: string): boolean {
        // Check if screenshot=always was specified
        const screenshotMode = ConfigurationManager.get('SCREENSHOT_MODE', 'failure');
        
        if (screenshotMode === 'always') {
            return true;
        }
        
        if (status === 'failed') {
            return ConfigurationManager.getBoolean('SCREENSHOT_ON_FAILURE', true);
        }
        if (status === 'passed') {
            return ConfigurationManager.getBoolean('SCREENSHOT_ON_PASS', false) || screenshotMode === 'always';
        }
        return false;
    }

    /**
     * Get current step execution context information
     */
    private getCurrentStepInfo(step: Step): { featureName: string; scenarioName: string; stepLabel: string } {
        try {
            const bddContext = BDDContext.getInstance();
            const featureContext = bddContext.getFeatureContext();
            const scenarioContext = bddContext.getScenarioContext();
            
            return {
                featureName: featureContext.getFeature().name,
                scenarioName: scenarioContext.getScenario().name,
                stepLabel: `${step.keyword} ${step.text}`
            };
        } catch (error) {
            // Fallback if contexts are not available
            return {
                featureName: 'Unknown Feature',
                scenarioName: 'Unknown Scenario',
                stepLabel: `${step.keyword} ${step.text}`
            };
        }
    }

    /**
     * Take screenshot
     */
    private async takeScreenshot(status: string, step: Step): Promise<Attachment> {
        try {
            const page = this.currentContext.getPage();
            if (!page) {
                throw new Error('No page available for screenshot');
            }
            
            // Get step context information
            const stepInfo = this.getCurrentStepInfo(step);
            
            // Take screenshot as buffer
            const screenshotBuffer = await this.screenshotManager.takeScreenshot(
                page,
                {
                    type: 'png',
                    fullPage: status === 'failed'
                }
            );

            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `${status}-screenshot-${timestamp}.png`;
            
            // Save screenshot to screenshots subdirectory
            const screenshotPath = await this.screenshotManager.saveScreenshot(
                screenshotBuffer,
                fileName,
                'screenshots'
            );

            ActionLogger.logInfo(`Screenshot captured: ${fileName}`, { 
                status, 
                path: screenshotPath,
                size: screenshotBuffer.length,
                ...stepInfo
            });

            return {
                data: screenshotPath,
                mimeType: 'image/png',
                name: `Screenshot - ${status}`,
                path: screenshotPath,
                // Include metadata for report organization
                metadata: {
                    featureName: stepInfo.featureName,
                    scenarioName: stepInfo.scenarioName,
                    stepLabel: stepInfo.stepLabel,
                    status: status
                }
            };
        } catch (error) {
            ActionLogger.logError('Screenshot failed', error as Error);
            throw error;
        }
    }
}

