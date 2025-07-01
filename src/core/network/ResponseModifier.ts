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

    async disable(): Promise<void> {
        if (!this.isEnabled) {
            return;
        }

        try {
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

        if (!this.modifierRules.has(patternKey)) {
            this.modifierRules.set(patternKey, []);
        }
        this.modifierRules.get(patternKey)!.push(rule);

        if (this.isEnabled) {
            await this.setupGlobalInterceptor();
        }

        ActionLogger.logInfo('response_modifier_added', {
            pattern: patternKey,
            ruleId: rule.id
        });
    }

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

    async transformBody(
        pattern: URLPattern, 
        transformer: BodyTransformer
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
            try {
                let body = await response.text();
                const contentType = response.headers()['content-type'] || '';
                
                let data = body;
                if (contentType.includes('application/json')) {
                    try {
                        data = JSON.parse(body);
                    } catch {
                    }
                }

                const transformed = await transformer(data);
                
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
                await route.fulfill({
                    status: response.status(),
                    headers: response.headers(),
                    body: await response.body()
                });
            }
        });
    }

    async injectField(
        pattern: URLPattern, 
        path: string, 
        value: any
    ): Promise<void> {
        await this.transformBody(pattern, (body) => {
            if (typeof body === 'object' && body !== null) {
                const paths = path.split('.');
                let current = body;
                
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
                
                const lastPath = paths[paths.length - 1];
                if (lastPath) {
                    current[lastPath] = value;
                }
            }
            
            return body;
        });
    }

    async removeField(
        pattern: URLPattern, 
        path: string
    ): Promise<void> {
        await this.transformBody(pattern, (body) => {
            if (typeof body === 'object' && body !== null) {
                const paths = path.split('.');
                let current = body;
                
                for (let i = 0; i < paths.length - 1; i++) {
                    const pathSegment = paths[i];
                    if (!pathSegment || !(pathSegment in current)) {
                        return body;
                    }
                    current = current[pathSegment];
                }
                
                const lastPath = paths[paths.length - 1];
                if (lastPath) {
                    delete current[lastPath];
                }
            }
            
            return body;
        });
    }

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

    async simulateTimeout(
        pattern: URLPattern,
        delay: number = 30000
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route) => {
            await new Promise(resolve => setTimeout(resolve, delay));
            
            await route.abort('timedout');

            this.recordModification({
                url: route.request().url(),
                type: 'timeout_simulation',
                modifications: { delay },
                timestamp: new Date()
            });
        });
    }

    async simulateSlowResponse(
        pattern: URLPattern,
        delay: number
    ): Promise<void> {
        await this.modifyResponse(pattern, async (route, response) => {
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

    async clearModifier(pattern: URLPattern): Promise<void> {
        const patternKey = this.createPatternKey(pattern);
        this.modifierRules.delete(patternKey);
        
        if (this.isEnabled) {
            await this.setupGlobalInterceptor();
        }
    }

    getModificationHistory(): ResponseModification[] {
        return [...this.modificationHistory];
    }

    getActiveModifications(): Map<string, ResponseModification> {
        return new Map(this.activeModifications);
    }

    clearHistory(): void {
        this.modificationHistory = [];
        this.activeModifications.clear();
    }


    private async setupGlobalInterceptor(): Promise<void> {
        await this.page.unroute('**/*');
        
        await this.page.route('**/*', async (route) => {
            const request = route.request();
            const url = request.url();
            
            const matchingRules = this.findMatchingRules(url, request);
            
            if (matchingRules.length === 0) {
                await route.continue();
                return;
            }

            try {
                const response = await route.fetch();
                
                for (const rule of matchingRules) {
                    if (rule.enabled) {
                        await rule.handler(route, response);
                        break;
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
        
        return matchingRules.sort((a, b) => b.priority - a.priority);
    }

    private matchesPattern(url: string, request: any, pattern: URLPattern): boolean {
        if (pattern.url) {
            if (pattern.url instanceof RegExp) {
                if (!pattern.url.test(url)) return false;
            } else {
                if (!url.includes(pattern.url)) return false;
            }
        }
        
        if (pattern.method) {
            const methods = Array.isArray(pattern.method) ? pattern.method : [pattern.method];
            if (!methods.includes(request.method())) return false;
        }
        
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
        
        if (this.modificationHistory.length > this.options.maxHistorySize!) {
            this.modificationHistory.shift();
        }
        
        ActionLogger.logInfo('response_modified', modification);
    }

}
