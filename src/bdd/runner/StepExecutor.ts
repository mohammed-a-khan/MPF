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
        
        // Record current timestamp to capture step actions (BEFORE try block)
        const stepStartTime = new Date();
        
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
            
            // Execute the step
            await this.executeStepDefinitionWithoutResult(step, context);
            
            // Capture action details from logs generated during step execution (passed step)
            const actionDetails = this.extractActionDetailsByTime(stepStartTime, StepStatus.PASSED);
            
            // Action details captured successfully using timestamp-based approach
            
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
            
            // Capture action details from logs generated during step execution (failed step)
            // Note: stepStartTime was captured before the try block, so it includes all step execution logs
            const actionDetails = this.extractActionDetailsByTime(stepStartTime, StepStatus.FAILED, error);
            
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
                actionDetails, // Add captured action details with error information
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
        
        if (!classInstance) {
            throw new Error(`No class instance found for step definition. ClassName: ${className}`);
        }
        
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

    private extractActionDetailsByTime(stepStartTime: Date, stepStatus?: StepStatus, error?: any): any {
        try {
            // For skipped steps, return minimal action details with no actions
            if (stepStatus === StepStatus.SKIPPED) {
                return {
                    actions: [],
                    primaryAction: null,
                    description: "Step was skipped",
                    target: null,
                    value: null,
                    locator: null,
                    current_url: null,
                    final_url: null,
                    target_url: null,
                    page_title: null,
                    expected_title: null,
                    expected_state: null,
                    products_count: null,
                    wait_condition: null,
                    page_object: null,
                    elements_verified: null,
                    elements_to_check: null,
                    page_elements_verified: null,
                    metrics: null,
                    performance_grade: null,
                    validation_status: null,
                    username: null,
                    field: null,
                    button: null,
                    skipped: true
                };
            }

            const actionLogger = ActionLogger.getInstance();
            
            // Get all recent logs and filter by timestamp
            const allLogs = actionLogger.getAllBufferedLogs();
            const stepEndTime = new Date();
            
            // Filter logs that occurred during step execution
            const logs = allLogs.filter(log => {
                const logTime = new Date(log.timestamp);
                return logTime >= stepStartTime && logTime <= stepEndTime;
            });
            
            // Process the filtered logs using the same logic as the original method
            return this.processLogsForActionDetails(logs, stepStatus, error);
            
        } catch (error) {
            console.error('Error extracting action details by time:', error);
            return {
                actions: [],
                primaryAction: null,
                description: "Failed to extract action details",
                target: null,
                value: null,
                locator: null
            };
        }
    }

    private processLogsForActionDetails(logs: any[], stepStatus?: StepStatus, error?: any): any {
        // Collect all action details from different log types
        const actionDetails: any = {
            actions: [],
            primaryAction: null,
            description: null,
            target: null,
            value: null,
            locator: null,
            current_url: null,
            final_url: null,
            target_url: null,
            page_title: null,
            expected_title: null,
            expected_state: null,
            products_count: null,
            wait_condition: null,
            page_object: null,
            elements_verified: null,
            elements_to_check: null,
            page_elements_verified: null,
            metrics: null,
            performance_grade: null,
            validation_status: null,
            username: null,
            field: null,
            button: null
        };

        // For failed steps, add detailed error information
        if (stepStatus === StepStatus.FAILED && error) {
            actionDetails.error = {
                message: error.message || 'Step execution failed',
                name: error.name || 'Error',
                stack: error.stack || '',
                type: error.constructor?.name || 'Unknown',
                details: {
                    errorCode: error.code,
                    timeout: error.timeout,
                    selector: error.selector,
                    url: error.url,
                    expected: error.expected,
                    actual: error.actual,
                    diff: error.diff,
                    context: error.context,
                    cause: error.cause
                }
            };
            
            // Set description to include error information
            actionDetails.description = `Step failed: ${error.message || 'Unknown error'}`;
            
            // Add error action as primary action
            actionDetails.primaryAction = {
                action: 'Error',
                description: actionDetails.description,
                success: false,
                error: actionDetails.error
            };
            
            // Add error details to actions
            actionDetails.actions.push({
                action: 'step_execution_failed',
                details: {
                    description: actionDetails.description,
                    error_type: error.name || 'Error',
                    error_message: error.message || 'Step execution failed',
                    error_stack: error.stack || '',
                    failure_context: error.context || {}
                },
                timestamp: new Date().toISOString(),
                success: false,
                error: actionDetails.error
            });
        }
        
        // Process logs to extract detailed action information (for both passed and failed steps)
        for (const log of logs) {
            // Handle action logs created by logAction() method
            if (log.type === 'action' && 'details' in log && (log as any).details) {
                const actionLog = log as any; // Cast to access action and details properties
                const details = actionLog.details;
                
                // Extract all available details
                if (details.description) actionDetails.description = details.description;
                if (details.target) actionDetails.target = details.target;
                if (details.value) actionDetails.value = details.value;
                if (details.locator) actionDetails.locator = details.locator;
                if (details.current_url) actionDetails.current_url = details.current_url;
                if (details.final_url) actionDetails.final_url = details.final_url;
                if (details.target_url) actionDetails.target_url = details.target_url;
                if (details.page_title) actionDetails.page_title = details.page_title;
                if (details.expected_title) actionDetails.expected_title = details.expected_title;
                if (details.expected_state) actionDetails.expected_state = details.expected_state;
                if (details.products_count !== undefined) actionDetails.products_count = details.products_count;
                if (details.wait_condition) actionDetails.wait_condition = details.wait_condition;
                if (details.page_object) actionDetails.page_object = details.page_object;
                if (details.elements_verified) actionDetails.elements_verified = details.elements_verified;
                if (details.elements_to_check) actionDetails.elements_to_check = details.elements_to_check;
                if (details.page_elements_verified) actionDetails.page_elements_verified = details.page_elements_verified;
                if (details.metrics) actionDetails.metrics = details.metrics;
                if (details.performance_grade) actionDetails.performance_grade = details.performance_grade;
                if (details.validation_status) actionDetails.validation_status = details.validation_status;
                if (details.username) actionDetails.username = details.username;
                if (details.field) actionDetails.field = details.field;
                if (details.button) actionDetails.button = details.button;
                
                // Set primary action if not already set (and not an error step)
                if (!actionDetails.primaryAction && stepStatus !== StepStatus.FAILED) {
                    actionDetails.primaryAction = {
                        action: this.inferActionFromLogAction(actionLog.action, details),
                        description: details.description,
                        success: true
                    };
                    actionDetails.action = actionDetails.primaryAction.action;
                }
                
                // Store the action info
                actionDetails.actions.push({
                    action: actionLog.action,
                    details: details,
                    timestamp: log.timestamp,
                    success: stepStatus !== StepStatus.FAILED
                });
            }
            
            // Handle error logs for failed steps
            if (log.type === 'error' && stepStatus === StepStatus.FAILED) {
                const errorLog = log as any;
                actionDetails.actions.push({
                    action: 'error_logged',
                    details: {
                        description: `Error occurred: ${errorLog.message || log.message}`,
                        error_type: errorLog.name || 'Error',
                        error_message: errorLog.message || log.message,
                        timestamp: log.timestamp,
                        context: errorLog.context || {}
                    },
                    timestamp: log.timestamp,
                    success: false,
                    error: true
                });
            }
            
            // Handle other log types for backward compatibility
            if (stepStatus !== undefined) {
                if (log.type === 'element') {
                    const elementLog = log as any; // Cast to access element-specific properties
                    const elementInfo = {
                        action: elementLog.action || 'Element Action',
                        target: elementLog.elementDescription || 'Unknown Element',
                        locator: elementLog.locator || '',
                        success: elementLog.success || false,
                        duration: elementLog.duration || 0,
                        timestamp: log.timestamp
                    };
                    actionDetails.actions.push(elementInfo);
                    
                    // Set as primary action if no primary action set
                    if (!actionDetails.primaryAction) {
                        actionDetails.primaryAction = {
                            action: this.formatActionName(elementLog.action || 'Element Action'),
                            target: elementLog.elementDescription,
                            value: elementLog.locator ? `Locator: ${elementLog.locator}` : undefined,
                            success: elementLog.success
                        };
                    }
                }
            }
        }

        // If no primary action was set from logs, try to infer from step text or provide fallback
        if (!actionDetails.primaryAction && stepStatus !== StepStatus.FAILED) {
            actionDetails.primaryAction = {
                action: 'General',
                description: actionDetails.description || 'Step executed successfully',
                success: true
            };
        }

        return actionDetails;
    }

    /**
     * Infer action type from log action name
     */
    private inferActionFromLogAction(logAction: string, details: any): string {
        if (!logAction) return 'Unknown';
        
        // Map specific log action names to user-friendly action types
        const actionMappings: { [key: string]: string } = {
            'navigate_to_login_page': 'Navigate',
            'page_navigation_completed': 'Navigate',
            'page_object_initialized': 'Initialize',
            'verify_page_loaded': 'Verify',
            'verify_login_elements': 'Verify',
            'login_page_verification_completed': 'Verify',
            'login_process_started': 'Login',
            'fill_username_field': 'Fill',
            'fill_password_field': 'Fill',
            'click_login_button': 'Click',
            'wait_for_navigation': 'Wait',
            'login_completed': 'Login',
            'wait_for_page_navigation': 'Wait',
            'verify_products_page_title': 'Verify',
            'verify_products_list_visible': 'Verify',
            'products_page_verification_completed': 'Verify',
            'start_performance_metrics_collection': 'Performance',
            'validate_performance_thresholds': 'Validate',
            'performance_metrics_validation_completed': 'Performance'
        };
        
        // Check for exact match first
        if (actionMappings[logAction]) {
            return actionMappings[logAction];
        }
        
        // Check for pattern matches
        if (logAction.includes('navigate') || logAction.includes('navigation')) return 'Navigate';
        if (logAction.includes('login')) return 'Login';
        if (logAction.includes('verify') || logAction.includes('validation')) return 'Verify';
        if (logAction.includes('fill') || logAction.includes('enter')) return 'Fill';
        if (logAction.includes('click') || logAction.includes('press')) return 'Click';
        if (logAction.includes('wait')) return 'Wait';
        if (logAction.includes('performance') || logAction.includes('metrics')) return 'Performance';
        if (logAction.includes('initialize') || logAction.includes('setup')) return 'Initialize';
        
        // Default to capitalize first letter
        return logAction.charAt(0).toUpperCase() + logAction.slice(1).replace(/_/g, ' ');
    }
    
    /**
     * Format action name for display
     */
    private formatActionName(action: string): string {
        if (!action) return 'Unknown Action';
        
        // Convert snake_case and camelCase to Title Case
        return action
            .replace(/[_-]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    
    /**
     * Extract target element/object from log message
     */
    private extractTargetFromMessage(message: string): string | undefined {
        // Look for common target patterns
        const targetPatterns = [
            /(?:clicked?|pressed|tapped)\s+(?:on\s+)?(?:the\s+)?([^.]+)/i,
            /(?:filled?|typed?|entered?)\s+(?:in\s+|into\s+)?(?:the\s+)?([^.]+)/i,
            /(?:selected?|chose)\s+(?:from\s+)?(?:the\s+)?([^.]+)/i,
            /(?:navigated?\s+to|visited?|opened?)\s+(?:the\s+)?([^.]+)/i,
            /(?:verified?|checked?)\s+(?:that\s+)?(?:the\s+)?([^.]+)/i,
            /element\s+([^:]+):/i,
            /button\s+([^.]+)/i,
            /field\s+([^.]+)/i,
            /page\s+([^.]+)/i
        ];
        
        for (const pattern of targetPatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return undefined;
    }

    /**
     * Extract value/data from log message
     */
    private extractValueFromMessage(message: string): string | undefined {
        // Look for common value patterns
        const valuePatterns = [
            /(?:with\s+text|with\s+value|using)\s+"([^"]+)"/i,
            /(?:with\s+text|with\s+value|using)\s+'([^']+)'/i,
            /(?:filled?\s+with|entered?|typed?)\s+"([^"]+)"/i,
            /(?:filled?\s+with|entered?|typed?)\s+'([^']+)'/i,
            /(?:username|password|text)\s+"([^"]+)"/i,
            /(?:username|password|text)\s+'([^']+)'/i,
            /:\s*([^,\s.]+)/
        ];
        
        for (const pattern of valuePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return undefined;
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

