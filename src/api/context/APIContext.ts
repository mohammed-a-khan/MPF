import { 
    APIContextData, 
    RequestOptions, 
    Response, 
    AuthConfig,
    APIVariable,
    APIResponse
} from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * API test execution context
 * Maintains state for API tests including variables, responses, and configuration
 */
export class APIContext {
    private data: APIContextData;
    private variables: Map<string, APIVariable> = new Map();
    private responses: Map<string, APIResponse> = new Map();
    private requestHistory: RequestOptions[] = [];
    private readonly maxHistorySize: number = 100;

    constructor(
        public readonly name: string,
        initialData: Partial<APIContextData> = {}
    ) {
        this.data = {
            baseUrl: initialData.baseUrl ?? '',
            headers: initialData.headers ?? {},
            timeout: initialData.timeout ?? 30000,
            auth: initialData.auth ?? null,
            proxy: initialData.proxy ?? null,
            followRedirects: initialData.followRedirects ?? true,
            validateSSL: initialData.validateSSL ?? true,
            retryConfig: initialData.retryConfig ?? {
                enabled: true,
                maxAttempts: 3,
                delay: 1000,
                backoff: 'exponential'
            }
        };

        ActionLogger.getInstance().debug(`API context created: ${name}`);
    }

    /**
     * Get base URL
     */
    public getBaseUrl(): string {
        return this.data.baseUrl;
    }

    /**
     * Set base URL
     */
    public setBaseUrl(url: string): void {
        this.data.baseUrl = url;
        ActionLogger.getInstance().debug(`Base URL set to: ${url}`);
    }

    /**
     * Get all headers
     */
    public getHeaders(): Record<string, string> {
        return { ...this.data.headers };
    }

    /**
     * Get specific header
     */
    public getHeader(name: string): string | undefined {
        return this.data.headers[name];
    }

    /**
     * Set header
     */
    public setHeader(name: string, value: string): void {
        this.data.headers[name] = value;
        ActionLogger.getInstance().debug(`Header set: ${name} = ${value}`);
    }

    /**
     * Set multiple headers
     */
    public setHeaders(headers: Record<string, string>): void {
        Object.assign(this.data.headers, headers);
        ActionLogger.getInstance().debug(`Headers set:`, headers);
    }

    /**
     * Remove header
     */
    public removeHeader(name: string): void {
        delete this.data.headers[name];
        ActionLogger.getInstance().debug(`Header removed: ${name}`);
    }

    /**
     * Clear all headers
     */
    public clearHeaders(): void {
        this.data.headers = {};
        ActionLogger.getInstance().debug('All headers cleared');
    }

    /**
     * Get timeout
     */
    public getTimeout(): number {
        return this.data.timeout;
    }

    /**
     * Set timeout
     */
    public setTimeout(timeout: number): void {
        this.data.timeout = timeout;
        ActionLogger.getInstance().debug(`Timeout set to: ${timeout}ms`);
    }

    /**
     * Get authentication config
     */
    public getAuth(): AuthConfig | null {
        return this.data.auth;
    }

    /**
     * Set authentication
     */
    public setAuth(auth: AuthConfig | null): void {
        this.data.auth = auth;
        ActionLogger.getInstance().debug(`Authentication configured: ${auth?.type || 'none'}`);
    }

    /**
     * Get proxy config
     */
    public getProxy(): any {
        return this.data.proxy;
    }

    /**
     * Set proxy
     */
    public setProxy(proxy: any): void {
        this.data.proxy = proxy;
        ActionLogger.getInstance().debug('Proxy configured');
    }

    /**
     * Get variable value
     */
    public getVariable(name: string): any {
        const variable = this.variables.get(name);
        return variable?.value;
    }

    /**
     * Set variable
     */
    public setVariable(name: string, value: any, metadata?: any): void {
        this.variables.set(name, {
            name,
            value,
            type: typeof value,
            created: new Date(),
            metadata
        });
        ActionLogger.getInstance().debug(`Variable set: ${name} = ${JSON.stringify(value)}`);
    }

    /**
     * Get all variables
     */
    public getVariables(): Record<string, any> {
        const vars: Record<string, any> = {};
        for (const [name, variable] of this.variables) {
            vars[name] = variable.value;
        }
        return vars;
    }

    /**
     * Clear variables
     */
    public clearVariables(): void {
        this.variables.clear();
        ActionLogger.getInstance().debug('All variables cleared');
    }

    /**
     * Store response
     */
    public storeResponse(alias: string, response: Response, request?: RequestOptions): void {
        const apiResponse: APIResponse = {
            ...response,
            alias,
            data: (response as any).data
        };
        
        // Only assign request if it's provided
        if (request !== undefined) {
            (apiResponse as any).request = request;
        }

        this.responses.set(alias, apiResponse);
        ActionLogger.getInstance().debug(`Response stored with alias: ${alias}`);
    }

    /**
     * Get stored response
     */
    public getResponse(alias: string): APIResponse | undefined {
        return this.responses.get(alias);
    }

    /**
     * Get response data
     */
    public getResponseData(alias: string): any {
        const response = this.responses.get(alias);
        return response?.data || response?.body;
    }

    /**
     * Get response header
     */
    public getResponseHeader(alias: string, headerName: string): string | undefined {
        const response = this.responses.get(alias);
        if (!response) return undefined;

        // Header names are case-insensitive
        const lowerHeaderName = headerName.toLowerCase();
        for (const [key, value] of Object.entries(response.headers)) {
            if (key.toLowerCase() === lowerHeaderName) {
                return typeof value === 'string' ? value : String(value);
            }
        }
        return undefined;
    }

    /**
     * Clear responses
     */
    public clearResponses(): void {
        this.responses.clear();
        ActionLogger.getInstance().debug('All responses cleared');
    }

    /**
     * Add request to history
     */
    public addRequestToHistory(request: RequestOptions): void {
        this.requestHistory.push({ ...request });
        
        // Limit history size
        if (this.requestHistory.length > this.maxHistorySize) {
            this.requestHistory.shift();
        }
    }

    /**
     * Get request history
     */
    public getRequestHistory(): RequestOptions[] {
        return [...this.requestHistory];
    }

    /**
     * Clear request history
     */
    public clearRequestHistory(): void {
        this.requestHistory = [];
        ActionLogger.getInstance().debug('Request history cleared');
    }

    /**
     * Get current state for request building
     */
    public getCurrentState(): APIContextData {
        return {
            ...this.data,
            headers: { ...this.data.headers }
        };
    }

    /**
     * Merge with request options
     */
    public mergeWithRequest(requestOptions: Partial<RequestOptions>): RequestOptions {
        const contextState = this.getCurrentState();
        
        const mergedRequest: RequestOptions = {
            url: requestOptions.url || '',
            method: requestOptions.method || 'GET',
            headers: {
                ...contextState.headers,
                ...requestOptions.headers
            },
            timeout: requestOptions.timeout || contextState.timeout,
            proxy: requestOptions.proxy || contextState.proxy,
            validateSSL: requestOptions.validateSSL ?? contextState.validateSSL,
            body: requestOptions.body
        };
        
        // Handle auth separately to avoid null vs undefined issues
        if (requestOptions.auth !== undefined) {
            mergedRequest.auth = requestOptions.auth;
        } else if (contextState.auth !== null) {
            mergedRequest.auth = contextState.auth;
        }
        
        return mergedRequest;
    }

    /**
     * Extract value from response using JSONPath
     */
    public extractFromResponse(alias: string, jsonPath: string): any {
        const response = this.getResponse(alias);
        if (!response || !response.data) {
            return undefined;
        }

        // Simple JSONPath implementation for common cases
        // In production, would use the JSONPathValidator
        const path = jsonPath.replace(/^\$\./, '').split('.');
        let value = response.data;

        for (const segment of path) {
            if (value === null || value === undefined) {
                return undefined;
            }

            // Handle array notation
            const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
            if (arrayMatch) {
                const [, prop, index] = arrayMatch;
                if (prop && value && typeof value === 'object') {
                    value = value[prop];
                    if (Array.isArray(value) && index) {
                        value = value[parseInt(index)];
                    }
                } else {
                    return undefined;
                }
            } else {
                if (value && typeof value === 'object') {
                    value = value[segment];
                } else {
                    return undefined;
                }
            }
        }

        return value;
    }

    /**
     * Clone context
     */
    public clone(newName: string): APIContext {
        const cloned = new APIContext(newName, this.data);
        
        // Clone variables
        for (const [name, variable] of this.variables) {
            cloned.variables.set(name, { ...variable });
        }
        
        // Clone responses
        for (const [alias, response] of this.responses) {
            cloned.responses.set(alias, { ...response });
        }
        
        // Clone history
        cloned.requestHistory = [...this.requestHistory];
        
        return cloned;
    }

    /**
     * Reset context to initial state
     */
    public reset(): void {
        this.clearHeaders();
        this.clearVariables();
        this.clearResponses();
        this.clearRequestHistory();
        this.data.auth = null;
        this.data.proxy = null;
        
        ActionLogger.getInstance().debug(`API context reset: ${this.name}`);
    }

    /**
     * Get context summary
     */
    public getSummary(): any {
        return {
            name: this.name,
            baseUrl: this.data.baseUrl,
            headerCount: Object.keys(this.data.headers).length,
            variableCount: this.variables.size,
            responseCount: this.responses.size,
            requestHistoryCount: this.requestHistory.length,
            auth: this.data.auth?.type || 'none',
            timeout: this.data.timeout
        };
    }

    /**
     * Export context state
     */
    public export(): any {
        return {
            name: this.name,
            data: this.data,
            variables: Array.from(this.variables.entries()).map(([name, variable]) => ({
                name,
                value: variable.value,
                type: variable.type,
                metadata: variable.metadata
            })),
            responses: Array.from(this.responses.entries()).map(([alias, response]) => ({
                alias,
                status: response.status,
                headers: response.headers,
                body: response.body
            }))
        };
    }

    /**
     * Import context state
     */
    public import(data: any): void {
        if (data.data) {
            this.data = { ...this.data, ...data.data };
        }

        if (data.variables) {
            for (const variable of data.variables) {
                this.setVariable(variable.name, variable.value, variable.metadata);
            }
        }

        if (data.responses) {
            for (const response of data.responses) {
                this.responses.set(response.alias, {
                    ...response,
                    timestamp: new Date(response.timestamp || Date.now())
                });
            }
        }

        ActionLogger.getInstance().debug(`Context imported: ${this.name}`);
    }
}