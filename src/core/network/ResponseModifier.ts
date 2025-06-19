import { Page } from 'playwright';
import { Logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { 
    URLPattern, 
    ResponseHandler, 
    BodyTransformer,
    ResponseModification,
    ModifierRule,
    ResponseModifierOptions
} from './types/network.types';

/**
 * ResponseModifier - Real-time response modification engine
 * Modifies API responses dynamically for testing edge cases
 */
export class ResponseModifier {
    private page: Page;
    private modifierRules: Map<string, ModifierRule[]> = new Map();
    private activeModifications: Map<string, ResponseModification> = new Map();
    private modificationHistory: ResponseModification[] = [];
    private isEnabled: boolean = false;
    private options: ResponseModifierOptions;

    constructor(page: Page, options: ResponseModifierOptions = {}) {
        this.page = page;
        this.options = {
            logModifications: true,
            preserveOriginal: true,
            maxHistorySize: 1000,
            enableValidation: true,
            ...options
        };
    }

    /**
     * Enable response modification
     */
    async enable(): Promise<void> {
        if (this.isEnabled) {
            const logger = Logger.getInstance();
            logger.warn('ResponseModifier: Already enabled');
            return;
        }

        try {
            await this.setupGlobalInterceptor();
            this.isEnabled = true;
            
            ActionLogger.logInfo('response_modifier_enabled', {
                rulesCount: this.modifierRules.size,
                options: this.options
            });
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('ResponseModifier: Failed to enable', error as Error);
            throw error;
        }
    }

    /**
     * Disable response modification
     */
    async disable(): Promise<void> {
        if (!this.isEnabled) {
            return;
        }

        try {
            // Clear all routes to remove modifications
            await this.page.unroute('**/*');
            this.isEnabled = false;
            
            ActionLogger.logInfo('response_modifier_disabled', {
                modificationsApplied: this.modificationHistory.length
            });
        } catch (error) {
            const logger = Logger.getInstance();
            logger.error('ResponseModifier: Failed to disable', error as Error);
            throw error;
        }
    }

    /**
     * Modify response for specific pattern
     */
    async modifyResponse(
        pattern: URLPattern, 
        modifier: ResponseHandler
    ): Promise<void> {
        const patternKey = this.createPatternKey(pattern);
        
        const rule: ModifierRule = {
            pattern,
            handler: modifier,
            enabled: true,
            priority: 0,
            id: `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Add to rules
        if (!this.modifierRules.has(patternKey)) {
            this.modifierRules.set(patternKey, []);
        }
        this.modifierRules.get(patternKey)!.push(rule);

        // Re-apply interceptor if enabled
        if (this.isEnabled) {
            await this.setupGlobalInterceptor();
        }

        ActionLogger.logInfo('response_modifier_added', {
            pattern: patternKey,
            ruleId: rule.id
        });
    }

    /**
     * Inject header into responses
     */
    async injectHeader(
        pattern: URLPattern, 
        name: string, 
        value: string
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
            const headers = {
                ...response.headers(),
                [name.toLowerCase()]: value
            };

            await route.fulfill({
                status: response.status(),
                headers,
                body: await response.body()
            });

            this.recordModification({
                url: route.request().url(),
                type: 'header_injection',
                modifications: { [name]: value },
                timestamp: new Date()
            });
        });
    }

    /**
     * Remove header from responses
     */
    async removeHeader(
        pattern: URLPattern, 
        name: string
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
            const headers = { ...response.headers() };
            delete headers[name.toLowerCase()];

            await route.fulfill({
                status: response.status(),
                headers,
                body: await response.body()
            });

            this.recordModification({
                url: route.request().url(),
                type: 'header_removal',
                modifications: { removed: name },
                timestamp: new Date()
            });
        });
    }

    /**
     * Transform response body with custom function
     */
    async transformBody(
        pattern: URLPattern, 
        transformer: BodyTransformer
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
            try {
                let body = await response.text();
                const contentType = response.headers()['content-type'] || '';
                
                // Parse JSON if applicable
                let data = body;
                if (contentType.includes('application/json')) {
                    try {
                        data = JSON.parse(body);
                    } catch {
                        // Not valid JSON, use as string
                    }
                }

                // Apply transformation
                const transformed = await transformer(data);
                
                // Convert back to string if needed
                if (typeof transformed !== 'string') {
                    body = JSON.stringify(transformed);
                } else {
                    body = transformed;
                }

                await route.fulfill({
                    status: response.status(),
                    headers: response.headers(),
                    body
                });

                this.recordModification({
                    url: route.request().url(),
                    type: 'body_transformation',
                    modifications: { 
                        originalSize: response.headers()['content-length'],
                        newSize: body.length.toString()
                    },
                    timestamp: new Date()
                });

            } catch (error) {
                const logger = Logger.getInstance();
                logger.error('ResponseModifier: Body transformation failed', error as Error);
                // Fallback to original response
                await route.fulfill({
                    status: response.status(),
                    headers: response.headers(),
                    body: await response.body()
                });
            }
        });
    }

    /**
     * Inject field into JSON response
     */
    async injectField(
        pattern: URLPattern, 
        path: string, 
        value: any
    ): Promise<void> {
        await this.transformBody(pattern, (body) => {
            if (typeof body === 'object' && body !== null) {
                const paths = path.split('.');
                let current = body;
                
                // Navigate to parent of target field
                for (let i = 0; i < paths.length - 1; i++) {
                    const pathSegment = paths[i];
                    if (!pathSegment || !(pathSegment in current)) {
                        if (pathSegment) {
                            current[pathSegment] = {};
                        }
                    }
                    if (pathSegment) {
                        current = current[pathSegment];
                    }
                }
                
                // Set the value
                const lastPath = paths[paths.length - 1];
                if (lastPath) {
                    current[lastPath] = value;
                }
            }
            
            return body;
        });
    }

    /**
     * Remove field from JSON response
     */
    async removeField(
        pattern: URLPattern, 
        path: string
    ): Promise<void> {
        await this.transformBody(pattern, (body) => {
            if (typeof body === 'object' && body !== null) {
                const paths = path.split('.');
                let current = body;
                
                // Navigate to parent of target field
                for (let i = 0; i < paths.length - 1; i++) {
                    const pathSegment = paths[i];
                    if (!pathSegment || !(pathSegment in current)) {
                        return body; // Path doesn't exist
                    }
                    current = current[pathSegment];
                }
                
                // Remove the field
                const lastPath = paths[paths.length - 1];
                if (lastPath) {
                    delete current[lastPath];
                }
            }
            
            return body;
        });
    }

    /**
     * Replace text in response body
     */
    async replaceText(
        pattern: URLPattern, 
        searchText: string, 
        replaceText: string
    ): Promise<void> {
        await this.transformBody(pattern, (body) => {
            if (typeof body === 'string') {
                return body.replace(new RegExp(searchText, 'g'), replaceText);
            }
            return body;
        });
    }

    /**
     * Simulate error response
     */
    async simulateError(
        pattern: URLPattern, 
        statusCode: number,
        statusText?: string,
        errorBody?: any
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route) => {
            const body = errorBody || {
                error: statusText || 'Simulated Error',
                status: statusCode,
                timestamp: new Date().toISOString()
            };

            await route.fulfill({
                status: statusCode,
                headers: {
                    'content-type': 'application/json',
                    'x-simulated-error': 'true'
                },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            });

            this.recordModification({
                url: route.request().url(),
                type: 'error_simulation',
                modifications: { statusCode, statusText },
                timestamp: new Date()
            });
        });
    }

    /**
     * Simulate timeout
     */
    async simulateTimeout(
        pattern: URLPattern,
        delay: number = 30000
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route) => {
            // Wait for delay
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Then abort the request
            await route.abort('timedout');

            this.recordModification({
                url: route.request().url(),
                type: 'timeout_simulation',
                modifications: { delay },
                timestamp: new Date()
            });
        });
    }

    /**
     * Simulate slow response
     */
    async simulateSlowResponse(
        pattern: URLPattern,
        delay: number
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
            // Add delay before responding
            await new Promise(resolve => setTimeout(resolve, delay));
            
            await route.fulfill({ response });

            this.recordModification({
                url: route.request().url(),
                type: 'slow_response_simulation',
                modifications: { delay },
                timestamp: new Date()
            });
        });
    }

    /**
     * Modify status code
     */
    async modifyStatusCode(
        pattern: URLPattern,
        newStatusCode: number
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
            await route.fulfill({
                status: newStatusCode,
                headers: response.headers(),
                body: await response.body()
            });

            this.recordModification({
                url: route.request().url(),
                type: 'status_code_modification',
                modifications: { 
                    original: response.status(),
                    new: newStatusCode 
                },
                timestamp: new Date()
            });
        });
    }

    /**
     * Clear all modifiers
     */
    async clearModifiers(): Promise<void> {
        const rulesCount = this.modifierRules.size;
        
        this.modifierRules.clear();
        this.activeModifications.clear();
        
        if (this.isEnabled) {
            await this.disable();
            await this.enable();
        }

        ActionLogger.logInfo('response_modifiers_cleared', {
            rulesCleared: rulesCount
        });
    }

    /**
     * Clear modifiers for specific pattern
     */
    async clearModifier(pattern: URLPattern): Promise<void> {
        const patternKey = this.createPatternKey(pattern);
        this.modifierRules.delete(patternKey);
        
        if (this.isEnabled) {
            await this.setupGlobalInterceptor();
        }
    }

    /**
     * Get modification history
     */
    getModificationHistory(): ResponseModification[] {
        return [...this.modificationHistory];
    }

    /**
     * Get active modifications
     */
    getActiveModifications(): Map<string, ResponseModification> {
        return new Map(this.activeModifications);
    }

    /**
     * Clear modification history
     */
    clearHistory(): void {
        this.modificationHistory = [];
        this.activeModifications.clear();
    }

    // Private helper methods

    private async setupGlobalInterceptor(): Promise<void> {
        // Remove existing routes
        await this.page.unroute('**/*');
        
        // Set up new interceptor
        await this.page.route('**/*', async (route) => {
            const request = route.request();
            const url = request.url();
            
            // Find matching rules
            const matchingRules = this.findMatchingRules(url, request);
            
            if (matchingRules.length === 0) {
                // No modifications, continue normally
                await route.continue();
                return;
            }

            try {
                // Fetch the original response
                const response = await route.fetch();
                
                // Apply modifications in order of priority
                for (const rule of matchingRules) {
                    if (rule.enabled) {
                        await rule.handler(route, response);
                        break; // Only apply first matching rule
                    }
                }
            } catch (error) {
                const logger = Logger.getInstance();
                logger.error('ResponseModifier: Interception failed', error as Error);
                await route.continue();
            }
        });
    }

    private findMatchingRules(url: string, request: any): ModifierRule[] {
        const matchingRules: ModifierRule[] = [];
        
        for (const [, rules] of this.modifierRules) {
            for (const rule of rules) {
                if (this.matchesPattern(url, request, rule.pattern)) {
                    matchingRules.push(rule);
                }
            }
        }
        
        // Sort by priority (higher first)
        return matchingRules.sort((a, b) => b.priority - a.priority);
    }

    private matchesPattern(url: string, request: any, pattern: URLPattern): boolean {
        // Check URL
        if (pattern.url) {
            if (pattern.url instanceof RegExp) {
                if (!pattern.url.test(url)) return false;
            } else {
                if (!url.includes(pattern.url)) return false;
            }
        }
        
        // Check method
        if (pattern.method) {
            const methods = Array.isArray(pattern.method) ? pattern.method : [pattern.method];
            if (!methods.includes(request.method())) return false;
        }
        
        // Check resource type
        if (pattern.resourceType) {
            if (!pattern.resourceType.includes(request.resourceType())) return false;
        }
        
        return true;
    }

    private createPatternKey(pattern: URLPattern): string {
        const url = pattern.url instanceof RegExp ? pattern.url.source : pattern.url || '*';
        const method = Array.isArray(pattern.method) ? pattern.method.join(',') : pattern.method || '*';
        return `${url}|${method}`;
    }

    private recordModification(modification: ResponseModification): void {
        if (!this.options.logModifications) {
            return;
        }

        this.modificationHistory.push(modification);
        this.activeModifications.set(modification.url, modification);
        
        // Limit history size
        if (this.modificationHistory.length > this.options.maxHistorySize!) {
            this.modificationHistory.shift();
        }
        
        ActionLogger.logInfo('response_modified', modification);
    }

}