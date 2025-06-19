// src/steps/api/APIGenericSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { APIContextManager } from '../../api/context/APIContextManager';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ResponseStorage } from '../../bdd/context/ResponseStorage';
import { FileUtils } from '../../core/utils/FileUtils';
import { ValidationUtils } from '../../core/utils/ValidationUtils';

/**
 * Generic API testing step definitions for core operations
 * Provides fundamental API testing capabilities
 */
export class APIGenericSteps extends CSBDDBaseStepDefinition {
    private apiContextManager: APIContextManager;
    private currentContext: APIContext | null = null;
    private responseStorage: ResponseStorage;

    constructor() {
        super();
        try {
            this.apiContextManager = APIContextManager.getInstance();
            this.responseStorage = ResponseStorage.getInstance();
            
            // Verify initialization
            if (!this.apiContextManager) {
                throw new Error('Failed to initialize APIContextManager');
            }
            if (!this.responseStorage) {
                throw new Error('Failed to initialize ResponseStorage');
            }
        } catch (error) {
            console.error('APIGenericSteps initialization failed:', error);
            throw error;
        }
    }

    /**
     * Sets the current API context for subsequent operations
     * Example: Given user is working with "users" API
     */
    @CSBDDStepDef("user is working with {string} API")
    async setAPIContext(apiName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setContext', { apiName });
        
        try {
            // Verify apiContextManager is available
            if (!this.apiContextManager) {
                this.apiContextManager = APIContextManager.getInstance();
                if (!this.apiContextManager) {
                    throw new Error('APIContextManager not initialized');
                }
            }
            
            // Create or get existing context
            this.currentContext = this.apiContextManager.createContext(apiName);
            
            // Load API-specific configuration
            const apiConfig = await this.loadAPIConfig(apiName);
            if (apiConfig) {
                this.currentContext.setBaseUrl(apiConfig.baseUrl);
                if (apiConfig.defaultHeaders) {
                    this.currentContext.setHeaders(apiConfig.defaultHeaders);
                }
                this.currentContext.setTimeout(apiConfig.timeout || 30000);
            }
            
            // Store in BDD context for other steps
            this.store('currentAPIContext', this.currentContext);
            this.store('currentAPIName', apiName);
            
            await actionLogger.logAction('contextSet', { 
                apiName, 
                baseUrl: this.currentContext.getBaseUrl(),
                timeout: this.currentContext.getTimeout()
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set API context' });
            throw new Error(`Failed to set API context for '${apiName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets the base URL for API requests
     * Example: Given user sets API base URL to "https://api.example.com"
     */
    @CSBDDStepDef("user sets API base URL to {string}")
    async setAPIBaseURL(baseUrl: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setBaseURL', { baseUrl });
        
        try {
            // Validate URL format
            if (!ValidationUtils.isValidUrl(baseUrl)) {
                throw new Error(`Invalid URL format: ${baseUrl}`);
            }
            
            // Get current context or create default
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            // Interpolate variables if present
            const interpolatedUrl = await this.interpolateValue(baseUrl);
            
            this.currentContext.setBaseUrl(interpolatedUrl);
            
            await actionLogger.logAction('baseURLSet', { 
                originalUrl: baseUrl,
                interpolatedUrl: interpolatedUrl
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set base URL' });
            throw new Error(`Failed to set API base URL: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets the timeout for API requests
     * Example: Given user sets API timeout to 60 seconds
     */
    @CSBDDStepDef("user sets API timeout to {int} seconds")
    async setAPITimeout(timeoutSeconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setTimeout', { timeoutSeconds });
        
        try {
            if (timeoutSeconds <= 0) {
                throw new Error('Timeout must be greater than 0 seconds');
            }
            
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const timeoutMs = timeoutSeconds * 1000;
            this.currentContext.setTimeout(timeoutMs);
            
            await actionLogger.logAction('timeoutSet', { 
                seconds: timeoutSeconds,
                milliseconds: timeoutMs
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set timeout' });
            throw new Error(`Failed to set API timeout: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Enables or disables SSL certificate validation
     * Example: Given user disables SSL validation
     */
    @CSBDDStepDef("user disables SSL validation")
    async disableSSLValidation(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('disableSSL', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const state = this.currentContext.getCurrentState();
            state.validateSSL = false;
            
            await actionLogger.logAction('sslValidationDisabled', {});
            await actionLogger.logAction('sslWarning', { message: 'SSL validation disabled - use only for testing!' });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to disable SSL validation' });
            throw error;
        }
    }

    /**
     * Enables SSL certificate validation (default)
     * Example: Given user enables SSL validation
     */
    @CSBDDStepDef("user enables SSL validation")
    async enableSSLValidation(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('enableSSL', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const state = this.currentContext.getCurrentState();
            state.validateSSL = true;
            
            await actionLogger.logAction('sslValidationEnabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to enable SSL validation' });
            throw error;
        }
    }

    /**
     * Sets the number of retry attempts for failed requests
     * Example: Given user sets API retry count to 3
     */
    @CSBDDStepDef("user sets API retry count to {int}")
    async setRetryCount(retryCount: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRetryCount', { retryCount });
        
        try {
            if (retryCount < 0) {
                throw new Error('Retry count cannot be negative');
            }
            
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const state = this.currentContext.getCurrentState();
            state.retryConfig.maxAttempts = retryCount;
            
            await actionLogger.logAction('retryCountSet', { retryCount });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set retry count' });
            throw new Error(`Failed to set retry count: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets the delay between retry attempts
     * Example: Given user sets API retry delay to 2 seconds
     */
    @CSBDDStepDef("user sets API retry delay to {int} seconds")
    async setRetryDelay(delaySeconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRetryDelay', { delaySeconds });
        
        try {
            if (delaySeconds < 0) {
                throw new Error('Retry delay cannot be negative');
            }
            
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const delayMs = delaySeconds * 1000;
            const state = this.currentContext.getCurrentState();
            state.retryConfig.delay = delayMs;
            
            await actionLogger.logAction('retryDelaySet', { 
                seconds: delaySeconds,
                milliseconds: delayMs
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set retry delay' });
            throw new Error(`Failed to set retry delay: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Enables request/response logging
     * Example: Given user enables API request logging
     */
    @CSBDDStepDef("user enables API request logging")
    async enableRequestLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('enableRequestLogging', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            // Store request logging preference in variables
            this.currentContext.setVariable('requestLogging', true);
            
            await actionLogger.logAction('requestLoggingEnabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to enable request logging' });
            throw error;
        }
    }

    /**
     * Disables request/response logging
     * Example: Given user disables API request logging
     */
    @CSBDDStepDef("user disables API request logging")
    async disableRequestLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('disableRequestLogging', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            // Store request logging preference in variables
            this.currentContext.setVariable('requestLogging', false);
            
            await actionLogger.logAction('requestLoggingDisabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to disable request logging' });
            throw error;
        }
    }

    /**
     * Clears all stored API responses
     * Example: Given user clears all API responses
     */
    @CSBDDStepDef("user clears all API responses")
    async clearAllResponses(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearResponses', {});
        
        try {
            this.responseStorage.clear();
            
            // Clear any stored responses in context state
            if (this.currentContext) {
                // Clear any response-related data from variables
                this.currentContext.setVariable('lastResponse', null);
            }
            
            await actionLogger.logAction('responsesCleared', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to clear responses' });
            throw error;
        }
    }

    /**
     * Switches to a different API context
     * Example: Given user switches to "payments" API context
     */
    @CSBDDStepDef("user switches to {string} API context")
    async switchAPIContext(contextName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('switchContext', { contextName });
        
        try {
            const context = await this.apiContextManager.getContext(contextName);
            if (!context) {
                throw new Error(`API context '${contextName}' not found`);
            }
            
            this.currentContext = context;
            this.store('currentAPIContext', this.currentContext);
            this.store('currentAPIName', contextName);
            
            await actionLogger.logAction('contextSwitched', { 
                contextName,
                baseUrl: context.getBaseUrl()
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to switch context' });
            throw new Error(`Failed to switch to API context '${contextName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Creates a new named API context
     * Example: Given user creates "internal" API context
     */
    @CSBDDStepDef("user creates {string} API context")
    async createAPIContext(contextName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('createContext', { contextName });
        
        try {
            await this.apiContextManager.createContext(contextName);
            
            await actionLogger.logAction('contextCreated', { 
                contextName,
                contextId: contextName
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to create context' });
            throw new Error(`Failed to create API context '${contextName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets a custom user agent for API requests
     * Example: Given user sets API user agent to "MyTestAgent/1.0"
     */
    @CSBDDStepDef("user sets API user agent to {string}")
    async setUserAgent(userAgent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setUserAgent', { userAgent });
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const interpolatedAgent = await this.interpolateValue(userAgent);
            this.currentContext.setHeader('User-Agent', interpolatedAgent);
            
            await actionLogger.logAction('userAgentSet', { 
                originalAgent: userAgent,
                interpolatedAgent: interpolatedAgent
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set user agent' });
            throw new Error(`Failed to set user agent: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Enables following redirects (default behavior)
     * Example: Given user enables redirect following
     */
    @CSBDDStepDef("user enables redirect following")
    async enableRedirectFollowing(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('enableRedirects', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const state = this.currentContext.getCurrentState();
            state.followRedirects = true;
            
            await actionLogger.logAction('redirectsEnabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to enable redirects' });
            throw error;
        }
    }

    /**
     * Disables following redirects
     * Example: Given user disables redirect following
     */
    @CSBDDStepDef("user disables redirect following")
    async disableRedirectFollowing(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('disableRedirects', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const state = this.currentContext.getCurrentState();
            state.followRedirects = false;
            
            await actionLogger.logAction('redirectsDisabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to disable redirects' });
            throw error;
        }
    }

    /**
     * Sets maximum number of redirects to follow
     * Example: Given user sets maximum redirects to 5
     */
    @CSBDDStepDef("user sets maximum redirects to {int}")
    async setMaxRedirects(maxRedirects: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setMaxRedirects', { maxRedirects });
        
        try {
            if (maxRedirects < 0) {
                throw new Error('Maximum redirects cannot be negative');
            }
            
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            // Store max redirects in variables since APIContext doesn't have this property directly
            this.currentContext.setVariable('maxRedirects', maxRedirects);
            
            await actionLogger.logAction('maxRedirectsSet', { maxRedirects });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set max redirects' });
            throw new Error(`Failed to set maximum redirects: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Helper method to load API-specific configuration
     */
    private async loadAPIConfig(apiName: string): Promise<any> {
        try {
            // Try to load from our API config file
            const configPath = 'config/api.config.json';
            if (await FileUtils.exists(configPath)) {
                const configContent = await FileUtils.readFile(configPath);
                if (configContent) {
                    const config = JSON.parse(configContent.toString());
                    if (config.apis && config.apis[apiName]) {
                        return config.apis[apiName];
                    }
                }
            }
            
            // Try to load from configuration
            const configKey = `API_${apiName.toUpperCase()}_CONFIG`;
            const configPath2 = ConfigurationManager.get(configKey);
            
            if (configPath2) {
                const configContent = await FileUtils.readFile(configPath2);
                if (!configContent) return null;
                return JSON.parse(configContent.toString());
            }
            
            // Try to load from standard location
            const standardPath = `config/api/${apiName}.json`;
            if (await FileUtils.exists(standardPath)) {
                const configContent = await FileUtils.readFile(standardPath);
                if (!configContent) return null;
                return JSON.parse(configContent.toString());
            }
            
            // Return default config with basic defaults
            return {
                baseUrl: this.getDefaultBaseUrl(apiName),
                timeout: 30000,
                defaultHeaders: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'CS-Test-Automation-Framework/1.0'
                }
            };
        } catch (error) {
            const actionLogger = ActionLogger.getInstance();
            await actionLogger.logAction('configLoadWarning', { 
                apiName, 
                message: `Failed to load API config for '${apiName}': ${error instanceof Error ? error.message : String(error)}` 
            });
            return {
                baseUrl: this.getDefaultBaseUrl(apiName),
                timeout: 30000,
                defaultHeaders: {
                    'Content-Type': 'application/json'
                }
            };
        }
    }

    /**
     * Get default base URL for known API names
     */
    private getDefaultBaseUrl(apiName: string): string {
        const defaultUrls: Record<string, string> = {
            'httpbin': 'https://httpbin.org',
            'jsonplaceholder': 'https://jsonplaceholder.typicode.com',
            'demo': 'https://httpbin.org'
        };
        
        return defaultUrls[apiName] || 'https://httpbin.org';
    }

    /**
     * Helper method to interpolate variables in values
     */
    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        // Get variables from context - using retrieve for stored variables
        const variables: Record<string, any> = {};
        
        // Try to get common variables from the BDD context
        const currentContext = this.retrieve('currentAPIContext');
        if (currentContext && typeof currentContext === 'object' && 'getVariables' in currentContext) {
            const apiVars = (currentContext as APIContext).getVariables();
            Object.assign(variables, apiVars);
        }
        
        // Replace placeholders
        let interpolated = value;
        for (const [key, val] of Object.entries(variables)) {
            interpolated = interpolated.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
        }
        
        return interpolated;
    }
}