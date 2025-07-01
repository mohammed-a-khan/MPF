import { APIContext } from './APIContext';
import { APIContextManager } from './APIContextManager';
import { RequestOptions, ChainStep, ChainResult } from '../types/api.types';
import { CSHttpClient } from '../client/CSHttpClient';
import { JSONPathValidator } from '../validators/JSONPathValidator';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Context for chaining API requests
 * Enables using data from one request in subsequent requests
 */
export class APIChainContext {
    private chainSteps: ChainStep[] = [];
    private chainResults: ChainResult[] = [];
    private variables: Map<string, any> = new Map();
    private httpClient: CSHttpClient;
    private jsonPathValidator: JSONPathValidator;
    private abortOnFailure: boolean = true;
    private currentStepIndex: number = 0;

    constructor(
        private context: APIContext,
        private chainName: string = 'default-chain'
    ) {
        this.httpClient = CSHttpClient.getInstance();
        this.jsonPathValidator = JSONPathValidator.getInstance();
        ActionLogger.getInstance().info(`API chain created: ${chainName}`);
    }

    /**
     * Add step to chain
     */
    public addStep(step: ChainStep): APIChainContext {
        this.chainSteps.push({
            ...step,
            id: step.id || `step_${this.chainSteps.length + 1}`,
            index: this.chainSteps.length
        });
        
        ActionLogger.getInstance().debug(`Added step to chain: ${step.name || step.id}`);
        return this;
    }

    /**
     * Add request step
     */
    public request(
        name: string,
        requestOptions: Partial<RequestOptions>,
        extractors?: Array<{ variable: string; path: string }>
    ): APIChainContext {
        const step: ChainStep = {
            name,
            type: 'request',
            request: requestOptions
        };
        
        if (extractors !== undefined) {
            step.extractors = extractors;
        }
        
        return this.addStep(step);
    }

    /**
     * Add validation step
     */
    public validate(
        name: string,
        validations: Array<{ path: string; expected: any; message?: string }>
    ): APIChainContext {
        const step: ChainStep = {
            name,
            type: 'validation'
        };
        
        if (validations !== undefined) {
            step.validations = validations;
        }
        
        return this.addStep(step);
    }

    /**
     * Add transformation step
     */
    public transform(
        name: string,
        transformer: (data: any, variables: Map<string, any>) => any
    ): APIChainContext {
        const step: ChainStep = {
            name,
            type: 'transformation'
        };
        
        if (transformer !== undefined) {
            step.transformer = transformer;
        }
        
        return this.addStep(step);
    }

    /**
     * Add delay step
     */
    public delay(milliseconds: number, name?: string): APIChainContext {
        const step: ChainStep = {
            name: name || `Delay ${milliseconds}ms`,
            type: 'delay'
        };
        
        if (milliseconds !== undefined) {
            step.delay = milliseconds;
        }
        
        return this.addStep(step);
    }

    /**
     * Add conditional step
     */
    public conditional(
        name: string,
        condition: (variables: Map<string, any>) => boolean,
        thenSteps: ChainStep[],
        elseSteps?: ChainStep[]
    ): APIChainContext {
        const step: ChainStep = {
            name,
            type: 'conditional',
            condition,
            thenSteps
        };
        
        if (elseSteps !== undefined) {
            step.elseSteps = elseSteps;
        }
        
        return this.addStep(step);
    }

    /**
     * Add loop step
     */
    public loop(
        name: string,
        items: any[] | ((variables: Map<string, any>) => any[]),
        loopSteps: ChainStep[],
        itemVariable: string = 'item'
    ): APIChainContext {
        const step: ChainStep = {
            name,
            type: 'loop'
        };
        
        if (items !== undefined) {
            step.items = items;
        }
        
        if (loopSteps !== undefined) {
            step.loopSteps = loopSteps;
        }
        
        if (itemVariable !== undefined) {
            step.itemVariable = itemVariable;
        }
        
        return this.addStep(step);
    }

    /**
     * Execute the chain
     */
    public async execute(): Promise<ChainResult[]> {
        ActionLogger.getInstance().info(`Executing API chain: ${this.chainName}`);
        this.chainResults = [];
        this.currentStepIndex = 0;

        try {
            for (const step of this.chainSteps) {
                this.currentStepIndex = step.index!;
                const result = await this.executeStep(step);
                
                this.chainResults.push(result);

                if (!result.success && this.abortOnFailure) {
                    ActionLogger.getInstance().logError(result.error as Error, `Chain aborted at step: ${step.name}`);
                    break;
                }
            }

            ActionLogger.getInstance().info(`Chain execution completed: ${this.chainResults.length} steps executed`);
            return this.chainResults;

        } catch (error) {
            ActionLogger.getInstance().logError(error as Error, `Chain execution failed at step ${this.currentStepIndex}`);
            throw error;
        }
    }

    /**
     * Execute single step
     */
    private async executeStep(step: ChainStep): Promise<ChainResult> {
        const startTime = Date.now();
        ActionLogger.getInstance().debug(`Executing step: ${step.name} (${step.type})`);

        try {
            let result: any;

            switch (step.type) {
                case 'request':
                    result = await this.executeRequestStep(step);
                    break;
                case 'validation':
                    result = await this.executeValidationStep(step);
                    break;
                case 'transformation':
                    result = await this.executeTransformationStep(step);
                    break;
                case 'delay':
                    result = await this.executeDelayStep(step);
                    break;
                case 'conditional':
                    result = await this.executeConditionalStep(step);
                    break;
                case 'loop':
                    result = await this.executeLoopStep(step);
                    break;
                default:
                    throw new Error(`Unknown step type: ${step.type}`);
            }

            const chainResult: ChainResult = {
                stepId: step.id!,
                stepName: step.name,
                success: true,
                duration: Date.now() - startTime,
                data: result
            };

            ActionLogger.getInstance().debug(`Step completed: ${step.name}`, {
                duration: chainResult.duration,
                success: true
            });

            return chainResult;

        } catch (error) {
            const chainResult: ChainResult = {
                stepId: step.id!,
                stepName: step.name,
                success: false,
                duration: Date.now() - startTime,
                error: (error as Error),
                data: null
            };

            ActionLogger.getInstance().logError(error as Error, `Step failed: ${step.name}`);
            return chainResult;
        }
    }

    /**
     * Execute request step
     */
    private async executeRequestStep(step: ChainStep): Promise<any> {
        if (!step.request) {
            throw new Error('Request step missing request configuration');
        }

        // Process request options with variable substitution
        const processedRequest = this.processRequestWithVariables(step.request);
        
        // Merge with context
        const finalRequest = this.context.mergeWithRequest(processedRequest);

        // Execute request
        const response = await this.httpClient.request(finalRequest);

        // Store response in context
        const responseAlias = step.responseAlias || step.id!;
        this.context.storeResponse(responseAlias, response, finalRequest);

        // Extract variables if defined
        if (step.extractors) {
            for (const extractor of step.extractors) {
                try {
                    const value = this.jsonPathValidator.extractValue(
                        (response as any).data || response.body,
                        extractor.path
                    );
                    this.variables.set(extractor.variable, value);
                    ActionLogger.getInstance().debug(`Extracted variable: ${extractor.variable} = ${JSON.stringify(value)}`);
                } catch (error) {
                    ActionLogger.getInstance().warn(`Failed to extract variable: ${extractor.variable}`, { error: (error as Error).message });
                }
            }
        }

        return response;
    }

    /**
     * Execute validation step
     */
    private async executeValidationStep(step: ChainStep): Promise<any> {
        if (!step.validations) {
            throw new Error('Validation step missing validations');
        }

        const results = [];
        let allPassed = true;

        // Get last response data
        const lastResponse = this.getLastResponseData();

        for (const validation of step.validations) {
            const result = await this.jsonPathValidator.validatePath(
                lastResponse,
                validation.path,
                this.resolveVariableValue(validation.expected)
            );

            results.push({
                path: validation.path,
                passed: result.valid,
                message: validation.message || result.message || 'Validation failed'
            });

            if (!result.valid) {
                allPassed = false;
                ActionLogger.getInstance().warn(`Validation failed: ${validation.path}`, { message: result.message || 'Unknown validation error' });
            }
        }

        if (!allPassed) {
            throw new Error(`Validation failed: ${results.filter(r => !r.passed).length} checks failed`);
        }

        return results;
    }

    /**
     * Execute transformation step
     */
    private async executeTransformationStep(step: ChainStep): Promise<any> {
        if (!step.transformer) {
            throw new Error('Transformation step missing transformer function');
        }

        const lastResponse = this.getLastResponseData();
        const transformed = await step.transformer(lastResponse, this.variables);

        // Store transformation result
        if (step.resultVariable) {
            this.variables.set(step.resultVariable, transformed);
        }

        return transformed;
    }

    /**
     * Execute delay step
     */
    private async executeDelayStep(step: ChainStep): Promise<any> {
        if (!step.delay) {
            throw new Error('Delay step missing delay duration');
        }

        const delay = this.resolveVariableValue(step.delay);
        ActionLogger.getInstance().debug(`Delaying for ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return { delayed: delay };
    }

    /**
     * Execute conditional step
     */
    private async executeConditionalStep(step: ChainStep): Promise<any> {
        if (!step.condition) {
            throw new Error('Conditional step missing condition');
        }

        const conditionResult = step.condition(this.variables);
        const stepsToExecute = conditionResult ? step.thenSteps : step.elseSteps;

        if (!stepsToExecute || stepsToExecute.length === 0) {
            return { condition: conditionResult, executed: [] };
        }

        const results = [];
        for (const subStep of stepsToExecute) {
            const result = await this.executeStep(subStep);
            results.push(result);
            
            if (!result.success && this.abortOnFailure) {
                break;
            }
        }

        return { condition: conditionResult, executed: results };
    }

    /**
     * Execute loop step
     */
    private async executeLoopStep(step: ChainStep): Promise<any> {
        if (!step.loopSteps) {
            throw new Error('Loop step missing loop steps');
        }

        const items = typeof step.items === 'function' 
            ? step.items(this.variables)
            : step.items;

        if (!Array.isArray(items)) {
            throw new Error('Loop items must be an array');
        }

        const results = [];
        const itemVariable = step.itemVariable || 'item';

        for (let i = 0; i < items.length; i++) {
            // Set loop variables
            this.variables.set(itemVariable, items[i]);
            this.variables.set(`${itemVariable}Index`, i);
            this.variables.set(`${itemVariable}Count`, items.length);

            const iterationResults = [];
            for (const loopStep of step.loopSteps) {
                const result = await this.executeStep(loopStep);
                iterationResults.push(result);
                
                if (!result.success && this.abortOnFailure) {
                    break;
                }
            }

            results.push({
                iteration: i,
                item: items[i],
                results: iterationResults
            });

            // Check if we should break the loop
            if (iterationResults.some(r => !r.success) && this.abortOnFailure) {
                break;
            }
        }

        // Clean up loop variables
        this.variables.delete(itemVariable);
        this.variables.delete(`${itemVariable}Index`);
        this.variables.delete(`${itemVariable}Count`);

        return results;
    }

    /**
     * Process request with variable substitution
     */
    private processRequestWithVariables(request: Partial<RequestOptions>): Partial<RequestOptions> {
        const processed: Partial<RequestOptions> = {};

        // Process URL
        if (request.url) {
            processed.url = this.replaceVariables(request.url);
        }

        // Process headers
        if (request.headers) {
            processed.headers = {};
            for (const [key, value] of Object.entries(request.headers)) {
                processed.headers[key] = this.replaceVariables(value);
            }
        }

        // Process body
        if (request.body) {
            if (typeof request.body === 'string') {
                processed.body = this.replaceVariables(request.body);
            } else {
                processed.body = this.processObjectWithVariables(request.body);
            }
        }

        // Process query parameters
        if (request.query) {
            if (!processed.query) {
                processed.query = {};
            }
            for (const [key, value] of Object.entries(request.query)) {
                processed.query[key] = this.replaceVariables(String(value));
            }
        }

        // Copy other properties with conditional assignment
        if (request.method !== undefined) {
            processed.method = request.method;
        }
        if (request.timeout !== undefined) {
            processed.timeout = request.timeout;
        }
        if (request.auth !== undefined) {
            processed.auth = request.auth;
        }

        return processed;
    }

    /**
     * Replace variables in string
     */
    private replaceVariables(text: string): string {
        return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            const value = this.variables.get(varName) || this.context.getVariable(varName);
            return value !== undefined ? String(value) : match;
        });
    }

    /**
     * Process object with variables
     */
    private processObjectWithVariables(obj: any): any {
        if (typeof obj === 'string') {
            return this.replaceVariables(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.processObjectWithVariables(item));
        }

        if (obj && typeof obj === 'object') {
            const processed: any = {};
            for (const [key, value] of Object.entries(obj)) {
                processed[key] = this.processObjectWithVariables(value);
            }
            return processed;
        }

        return obj;
    }

    /**
     * Resolve variable value
     */
    private resolveVariableValue(value: any): any {
        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
            const varName = value.slice(2, -2);
            return this.variables.get(varName) || this.context.getVariable(varName) || value;
        }
        return value;
    }

    /**
     * Get last response data
     */
    private getLastResponseData(): any {
        if (this.chainResults.length === 0) {
            return {};
        }

        // Find last request step result
        for (let i = this.chainResults.length - 1; i >= 0; i--) {
            const result = this.chainResults[i];
            if (result?.data && result.data.data !== undefined) {
                return result.data.data;
            }
        }

        return {};
    }

    /**
     * Set abort on failure
     */
    public setAbortOnFailure(abort: boolean): APIChainContext {
        this.abortOnFailure = abort;
        return this;
    }

    /**
     * Get chain results
     */
    public getResults(): ChainResult[] {
        return [...this.chainResults];
    }

    /**
     * Get variables
     */
    public getVariables(): Map<string, any> {
        return new Map(this.variables);
    }

    /**
     * Set variable
     */
    public setVariable(name: string, value: any): APIChainContext {
        this.variables.set(name, value);
        return this;
    }

    /**
     * Clear chain
     */
    public clear(): void {
        this.chainSteps = [];
        this.chainResults = [];
        this.variables.clear();
        this.currentStepIndex = 0;
        ActionLogger.getInstance().debug(`Chain cleared: ${this.chainName}`);
    }

    /**
     * Export chain definition
     */
    public export(): any {
        return {
            name: this.chainName,
            steps: this.chainSteps.map(step => ({
                id: step.id,
                name: step.name,
                type: step.type,
                request: step.request,
                validations: step.validations,
                delay: step.delay,
                extractors: step.extractors,
                responseAlias: step.responseAlias,
                resultVariable: step.resultVariable
            })),
            abortOnFailure: this.abortOnFailure
        };
    }

    /**
     * Create chain context
     */
    public static create(contextName?: string): APIChainContext {
        const manager = APIContextManager.getInstance();
        const context = manager.getContext(contextName);
        return new APIChainContext(context, `chain_${Date.now()}`);
    }
}