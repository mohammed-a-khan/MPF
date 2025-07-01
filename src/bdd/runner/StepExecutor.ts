// src/bdd/runner/StepExecutor.ts

import { stepRegistry } from '../decorators/StepRegistry';

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

export class StepExecutor {
    private debugManager: DebugManager;
    private screenshotManager: ScreenshotManager;
    private currentContext!: ExecutionContext;
    private executionMonitor: ExecutionMonitor;
    private initializedClasses: Set<string> = new Set();

    constructor() {
        this.debugManager = DebugManager.getInstance();
        this.screenshotManager = ScreenshotManager.getInstance();
        this.executionMonitor = ExecutionMonitor.getInstance();
    }
    
    private getBrowserManagementStrategy(): string {
        return ConfigurationManager.get('BROWSER_MANAGEMENT_STRATEGY', 'reuse-browser');
    }

    public resetInitializedClasses(): void {
        const browserStrategy = this.getBrowserManagementStrategy();
        if (browserStrategy === 'new-per-scenario') {
            for (const className of this.initializedClasses) {
                const classInstance = stepRegistry.getClassInstance(className);
                if (classInstance && typeof (classInstance as any).clearPageInstances === 'function') {
                    try {
                        (classInstance as any).clearPageInstances();
                    } catch (error) {
                        ActionLogger.logError(`Error clearing page instances for ${className}`, error as Error);
                    }
                }
            }
        }
        this.initializedClasses.clear();
    }
    
    public async callAfterMethods(): Promise<void> {
        const browserStrategy = this.getBrowserManagementStrategy();
        
        for (const className of this.initializedClasses) {
            const classInstance = stepRegistry.getClassInstance(className);
            if (classInstance) {
                if (typeof (classInstance as any).clearPageInstances === 'function') {
                    try {
                        (classInstance as any).clearPageInstances();
                    } catch (error) {
                        ActionLogger.logError(`Error clearing page instances for ${className}`, error as Error);
                    }
                }
                
                if (browserStrategy === 'new-per-scenario') {
                    const pageProperties = Reflect.getMetadata('page:properties', classInstance) || 
                                          Reflect.getMetadata('page:properties', Object.getPrototypeOf(classInstance)) || [];
                    for (const propertyKey of pageProperties) {
                        const pageObject = (classInstance as any)[propertyKey];
                        if (pageObject) {
                            if (typeof pageObject.clearAllElementCaches === 'function') {
                                try {
                                    pageObject.clearAllElementCaches();
                                } catch (error) {
                                    ActionLogger.logWarn(`Error clearing element caches for ${propertyKey}`, error as Error);
                                }
                            }
                            if (typeof pageObject.cleanup === 'function') {
                                try {
                                    await pageObject.cleanup();
                                } catch (error) {
                                    ActionLogger.logWarn(`Error cleaning up page object ${propertyKey}`, error as Error);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    public async execute(step: Step, context: ExecutionContext): Promise<StepResult> {
        const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        let screenshotPath: string | undefined;
        
        const stepStartTime = new Date();
        
        try {
            this.currentContext = context;
            this.executionMonitor.emit('stepStart', step);
            
            if (this.shouldTakeScreenshot('before')) {
                try {
                    const attachment = await this.takeScreenshot('before', step);
                    screenshotPath = attachment.path;
                } catch (screenshotError) {
                    ActionLogger.logWarn('Failed to take before screenshot', screenshotError as Error);
                }
            }
            
            await this.executeStepDefinitionWithoutResult(step, context);
            
            const actionDetails = this.extractActionDetailsByTime(stepStartTime, StepStatus.PASSED);
            
            
            const result: StepResult = {
                id: stepId,
                keyword: step.keyword,
                text: step.text,
                line: step.line,
                status: StepStatus.PASSED,
                duration: 0,
                startTime: new Date(startTime),
                endTime: new Date(Date.now()),
                actionDetails
            };
            
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
            
            // Note: stepStartTime was captured before the try block, so it includes all step execution logs
            const actionDetails = this.extractActionDetailsByTime(stepStartTime, StepStatus.FAILED, error);
            
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
                actionDetails,
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

    private async findStepDefinition(step: Step): Promise<StepDefinition | null> {
        const stepText = step.text.trim();
        
        let definition = stepRegistry.findStepDefinition(stepText);

        if (!definition) {
            const fullStepText = `${step.keyword} ${step.text}`.trim();
            ActionLogger.logWarn(`No step definition found for: ${fullStepText}`);
        }

        return definition;
    }

    private extractParameters(step: Step, _definition: StepDefinition): any[] {
        const stepText = step.text.trim();
        
        const parameters = stepRegistry.findStepWithParameters(stepText);
        
        if (!parameters) {
            throw new Error('Step text does not match pattern');
        }

        const transformedParams = parameters.parameters.map((param) => {
            return this.autoTransformParameter(param);
        });

        return transformedParams;
    }

    private async prepareArguments(
        parameters: any[], 
        stepArgument: DataTable | DocString | undefined,
        context: ExecutionContext
    ): Promise<any[]> {
        const args = [...parameters];

        if (stepArgument) {
            if ('rows' in stepArgument) {
                args.push(this.transformDataTable(stepArgument as DataTable));
            } else if ('content' in stepArgument) {
                args.push(this.transformDocString(stepArgument as DocString));
            }
        }

        if (this.stepExpectsContext(parameters.length, stepArgument)) {
            args.push(context);
        }

        return args;
    }

    private async executeStepDefinitionWithoutResult(step: Step, context: ExecutionContext): Promise<void> {
        ActionLogger.logStepStart(step.keyword, step.text);

        await this.checkDebugBreakpoint(step);

        const stepDefinition = await this.findStepDefinition(step);
        
        if (!stepDefinition) {
            throw new Error(`No step definition found for: ${step.keyword} ${step.text}`);
        }

        const parameters = this.extractParameters(step, stepDefinition);

        const stepArgument = step.dataTable || step.docString || undefined;
        const args = await this.prepareArguments(parameters, stepArgument, context);

        await this.executeStepDefinition(stepDefinition, args, context);
    }

    private async executeStepDefinition(
        definition: StepDefinition,
        args: any[],
        context: ExecutionContext
    ): Promise<void> {
        const timeout = definition.timeout || ConfigurationManager.getInt('STEP_TIMEOUT', 30000);
        
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout);
        });

        try {
            await Promise.race([
                this.executeWithContext(definition, args, context),
                timeoutPromise
            ]);
        } catch (error) {
            const err = error as Error;
            if (err.message && err.message.includes('Step timeout')) {
                err.message = `${err.message}\nStep: ${definition.patternString}`;
            }
            throw err;
        }
    }

    private async executeWithContext(
        definition: StepDefinition,
        args: any[],
        _context: ExecutionContext
    ): Promise<void> {
        const className = definition.metadata['className'];
        
        if (!className) {
            throw new Error(
                `Step definition metadata missing className property.\n` +
                `Pattern: ${definition.patternString}\n` +
                `Available metadata: ${JSON.stringify(definition.metadata)}\n` +
                `Make sure the step is defined in a class decorated with @StepDefinitions`
            );
        }
        
        const classInstance = stepRegistry.getClassInstance(className);
        
        if (!classInstance) {
            throw new Error(
                `No class instance found for step definition.\n` +
                `ClassName: ${className}\n` +
                `Pattern: ${definition.patternString}\n` +
                `Make sure the class is decorated with @StepDefinitions`
            );
        }
        
        const browserStrategy = this.getBrowserManagementStrategy();
        if (browserStrategy === 'new-per-scenario') {
            if (typeof (classInstance as any).clearPageInstances === 'function') {
                try {
                    (classInstance as any).clearPageInstances();
                } catch (error) {
                    ActionLogger.logWarn(`Error clearing page instances for ${className}`, error as Error);
                }
            }
            
            const pageProperties = Reflect.getMetadata('page:properties', classInstance) || 
                                  Reflect.getMetadata('page:properties', Object.getPrototypeOf(classInstance)) || [];
            for (const propertyKey of pageProperties) {
                const pageObject = (classInstance as any)[propertyKey];
                if (pageObject && typeof pageObject.clearAllElementCaches === 'function') {
                    try {
                        pageObject.clearAllElementCaches();
                    } catch (error) {
                        ActionLogger.logWarn(`Error clearing element caches for ${propertyKey}`, error as Error);
                    }
                }
            }
        }
        
        if (typeof (classInstance as any).initializePageObjects === 'function') {
            try {
                ActionLogger.logDebug(`Initializing/checking page objects for ${className}`);
                await (classInstance as any).initializePageObjects();
            } catch (error) {
                throw new Error(`Error initializing page objects for ${className}: ${(error as Error).message}`);
            }
        }
        
        this.initializedClasses.add(className);
        
        const boundFunction = definition.implementation.bind(classInstance);
        
        await boundFunction(...args);
    }

    private transformDataTable(dataTable: DataTable): any {
        return {
            raw: () => dataTable.rows,
            rows: () => dataTable.rows.slice(1),
            hashes: () => this.dataTableToHashes(dataTable),
            rowsHash: () => this.dataTableToRowsHash(dataTable),
            transpose: () => this.transposeDataTable(dataTable)
        };
    }

    private transformDocString(docString: DocString): string {
        return docString.content;
    }

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

    private dataTableToRowsHash(dataTable: DataTable): Record<string, string> {
        const hash: Record<string, string> = {};
        
        dataTable.rows.forEach(row => {
            if (row && row.length >= 2 && row[0] !== undefined && row[1] !== undefined) {
                hash[row[0]] = row[1];
            }
        });
        
        return hash;
    }

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

    private autoTransformParameter(value: string): any {
        if (/^\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        
        if (/^\d+\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        if (value.toLowerCase() === 'null') return null;
        if (value.toLowerCase() === 'undefined') return undefined;
        
        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return JSON.parse(value);
            } catch (e) {
            }
        }
        
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }
        
        return value;
    }

    private stepExpectsContext(paramCount: number, stepArgument: DataTable | DocString | undefined): boolean {
        const expectedParams = paramCount + (stepArgument ? 1 : 0);
        return expectedParams < 3;
    }

    private async checkDebugBreakpoint(step: Step): Promise<void> {
        if (!this.debugManager.isDebugMode()) return;

        const stepText = `${step.keyword} ${step.text}`;
        await this.debugManager.checkStepBreakpoint(stepText, this.currentContext);
    }

    private determineErrorStatus(error: any): StepStatus {
        if (error.pending || error.constructor?.name === 'PendingError') {
            return StepStatus.PENDING;
        }
        if (error.skipped || error.constructor?.name === 'SkippedError') {
            return StepStatus.SKIPPED;
        }
        return StepStatus.FAILED;
    }

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
            
            const allLogs = actionLogger.getAllBufferedLogs();
            const stepEndTime = new Date();
            
            const logs = allLogs.filter(log => {
                const logTime = new Date(log.timestamp);
                return logTime >= stepStartTime && logTime <= stepEndTime;
            });
            
            return this.processLogsForActionDetails(logs, stepStatus, error);
            
        } catch (error) {
            console.error('Error extracting action details by time:', error);
            ActionLogger.logError(`🔥 STEP DEBUG: Error extracting action details`, error as Error);
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
            
            actionDetails.description = `Step failed: ${error.message || 'Unknown error'}`;
            
            actionDetails.primaryAction = {
                action: 'Error',
                description: actionDetails.description,
                success: false,
                error: actionDetails.error
            };
            
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
        
        for (const log of logs) {
            if (log.type === 'action' && 'details' in log && (log as any).details) {
                const actionLog = log as any;
                const details = actionLog.details;
                
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
                
                if (!actionDetails.primaryAction && stepStatus !== StepStatus.FAILED) {
                    const inferredAction = this.inferActionFromLogAction(actionLog.action, details);
                    
                    actionDetails.primaryAction = {
                        action: inferredAction,
                        description: details.description,
                        success: true
                    };
                    actionDetails.action = actionDetails.primaryAction.action;
                }
                
                actionDetails.actions.push({
                    action: actionLog.action,
                    details: details,
                    timestamp: log.timestamp,
                    success: stepStatus !== StepStatus.FAILED
                });
            }
            
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
            
            if (stepStatus !== undefined) {
                if (log.type === 'element') {
                    const elementLog = log as any;
                    const elementInfo = {
                        action: elementLog.action || 'Element Action',
                        target: elementLog.elementDescription || 'Unknown Element',
                        locator: elementLog.locator || '',
                        success: elementLog.success || false,
                        duration: elementLog.duration || 0,
                        timestamp: log.timestamp
                    };
                    actionDetails.actions.push(elementInfo);
                    
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

        if (!actionDetails.primaryAction && stepStatus !== StepStatus.FAILED) {
            actionDetails.primaryAction = {
                action: 'General',
                description: actionDetails.description || 'Step executed successfully',
                success: true
            };
        }

        return actionDetails;
    }

    private inferActionFromLogAction(logAction: string, details: any): string {
        if (!logAction) return 'Unknown';
        
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
        
        if (actionMappings[logAction]) {
            return actionMappings[logAction];
        }
        
        if (logAction.includes('navigate') || logAction.includes('navigation')) return 'Navigate';
        if (logAction.includes('login')) return 'Login';
        if (logAction.includes('verify') || logAction.includes('validation')) return 'Verify';
        if (logAction.includes('fill') || logAction.includes('enter')) return 'Fill';
        if (logAction.includes('click') || logAction.includes('press')) return 'Click';
        if (logAction.includes('wait')) return 'Wait';
        if (logAction.includes('performance') || logAction.includes('metrics')) return 'Performance';
        if (logAction.includes('initialize') || logAction.includes('setup')) return 'Initialize';
        
        return logAction.charAt(0).toUpperCase() + logAction.slice(1).replace(/_/g, ' ');
    }
    
    private formatActionName(action: string): string {
        if (!action) return 'Unknown Action';
        
        return action
            .replace(/[_-]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    
    private extractTargetFromMessage(message: string): string | undefined {
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

    private extractValueFromMessage(message: string): string | undefined {
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

    private shouldTakeScreenshot(status: string): boolean {
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

    private getCurrentStepInfo(step: Step): { featureName: string; scenarioName: string; scenarioId: string; stepLabel: string } {
        try {
            const bddContext = BDDContext.getInstance();
            const featureContext = bddContext.getFeatureContext();
            const scenarioContext = bddContext.getScenarioContext();
            
            return {
                featureName: featureContext.getFeature().name,
                scenarioName: scenarioContext.getScenario().name,
                scenarioId: scenarioContext.getScenarioId(),
                stepLabel: `${step.keyword} ${step.text}`
            };
        } catch (error) {
            return {
                featureName: 'Unknown Feature',
                scenarioName: 'Unknown Scenario',
                scenarioId: 'unknown',
                stepLabel: `${step.keyword} ${step.text}`
            };
        }
    }

    private async takeScreenshot(status: string, step: Step): Promise<Attachment> {
        try {
            const page = this.currentContext.getPage();
            if (!page) {
                throw new Error('No page available for screenshot');
            }
            
            const stepInfo = this.getCurrentStepInfo(step);
            
            const screenshotBuffer = await this.screenshotManager.takeScreenshot(
                page,
                {
                    type: 'png',
                    fullPage: status === 'failed'
                }
            );

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const fileName = `${stepInfo.scenarioId}_${stepId}_${status}_${timestamp}.png`;
            
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
                metadata: {
                    featureName: stepInfo.featureName,
                    scenarioName: stepInfo.scenarioName,
                    scenarioId: stepInfo.scenarioId,
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
