// src/steps/api/APIGenericSteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
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
@StepDefinitions
export class APIGenericSteps extends CSBDDBaseStepDefinition {
    private apiContextManager: APIContextManager;
    private currentContext: APIContext | null = null;
    private responseStorage: ResponseStorage;

    constructor() {
        super();
        this.apiContextManager = APIContextManager.getInstance();
        this.responseStorage = ResponseStorage.getInstance();
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
            if (this.apiContextManager.hasContext(apiName)) {
                // Context already exists, get it
                this.currentContext = this.apiContextManager.getContext(apiName);
                await actionLogger.logAction('contextReused', { apiName });
            } else {
                // Context doesn't exist, create it
                this.currentContext = this.apiContextManager.createContext(apiName);
                await actionLogger.logAction('contextCreated', { apiName });
            }
            
            // Switch to the newly created context so it becomes the current context
            this.apiContextManager.switchContext(apiName);
            
            // Load API-specific configuration
            const apiConfig = await this.loadAPIConfig(apiName);
            if (apiConfig) {
                this.currentContext.setBaseUrl(apiConfig.baseUrl);
                if (apiConfig.defaultHeaders) {
                    this.currentContext.setHeaders(apiConfig.defaultHeaders);
                }
                this.currentContext.setTimeout(apiConfig.timeout || 30000);
            }
            
            // Store in BDD context for other steps (only if scenario context is available)
            try {
                this.store('currentAPIContext', this.currentContext);
                this.store('currentAPIName', apiName);
            } catch (error) {
                // Scenario context not available - this is fine for standalone API tests
                // The context is still stored in the instance variables
            }
            
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
                if (this.apiContextManager.hasContext('default')) {
                    this.currentContext = this.apiContextManager.getContext('default');
                } else {
                    this.currentContext = this.apiContextManager.createContext('default');
                }
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

    /**
     * Sets base URL (alias for user sets API base URL to)
     * Example: Given user sets base URL to "https://api.example.com"
     */
    @CSBDDStepDef("user sets base URL to {string}")
    async setBaseURL(baseUrl: string): Promise<void> {
        return await this.setAPIBaseURL(baseUrl);
    }

    /**
     * Loads test data from a file
     * Example: Given user loads test data from "api/test-data.json" as "testData"
     */
    @CSBDDStepDef("user loads test data from {string} as {string}")
    async loadTestData(filePath: string, dataName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('loadTestData', { filePath, dataName });
        
        try {
            const resolvedPath = await this.resolveDataFilePath(filePath);
            
            // Check if file exists
            if (!require('fs').existsSync(resolvedPath)) {
                throw new Error(`Test data file not found: ${resolvedPath}`);
            }
            
            // Read file content
            const content = require('fs').readFileSync(resolvedPath);
            const contentString = content.toString('utf8');
            let data: any;
            
            // Parse based on file extension
            if (filePath.endsWith('.json')) {
                try {
                    if (contentString.trim()) {
                        data = JSON.parse(contentString);
                    } else {
                        throw new Error('File is empty');
                    }
                } catch (parseError) {
                    throw new Error(`Invalid JSON format in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                }
            } else if (filePath.endsWith('.csv')) {
                try {
                    if (contentString.trim()) {
                        data = this.parseCSV(contentString);
                    } else {
                        throw new Error('File is empty');
                    }
                } catch (parseError) {
                    throw new Error(`Invalid CSV format in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                }
            } else {
                throw new Error(`Unsupported file format: ${filePath}. Supported formats: .json, .csv`);
            }
            
            // Store the data in context with the given name
            this.store(dataName, data);
            
            await actionLogger.logAction('testDataLoaded', { 
                filePath: resolvedPath,
                dataName,
                recordCount: Array.isArray(data) ? data.length : (data ? Object.keys(data).length : 0)
            });
            
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to load test data' });
            throw new Error(`Failed to load test data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets ADO test case ID for tracking
     * Example: Given user sets ADO test case ID "TC-001"
     */
    @CSBDDStepDef("user sets ADO test case ID {string}")
    async setADOTestCaseID(testCaseId: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setADOTestCaseID', { testCaseId });
        
        try {
            const interpolatedId = await this.interpolateValue(testCaseId);
            this.store('adoTestCaseId', interpolatedId);
            
            await actionLogger.logAction('adoTestCaseIdSet', { 
                originalId: testCaseId,
                interpolatedId
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set ADO test case ID' });
            throw new Error(`Failed to set ADO test case ID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Stores response JSON value as a variable
     * Example: Given user stores response JSON "token" as "auth_token"
     */
    @CSBDDStepDef("user stores response JSON {string} as {string}")
    async storeResponseJSONValue(jsonPath: string, variableName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('storeResponseJSONValue', { jsonPath, variableName });
        
        try {
            const response = this.responseStorage.retrieve('last');
            if (!response) {
                throw new Error('No response available to extract value from');
            }
            
            // Parse response body as JSON
            let responseBody: any;
            try {
                responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
            } catch (parseError) {
                throw new Error(`Response body is not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
            
            // Extract value using simple path (e.g., "token", "user.id")
            let value = responseBody;
            const pathParts = jsonPath.split('.');
            
            for (const part of pathParts) {
                if (value && typeof value === 'object' && part in value) {
                    value = value[part];
                } else {
                    throw new Error(`JSON path '${jsonPath}' not found in response`);
                }
            }
            
            // Store the value
            this.store(variableName, value);
            
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            this.currentContext.setVariable(variableName, value);
            
            await actionLogger.logAction('responseJSONValueStored', { 
                jsonPath,
                variableName,
                valueType: typeof value,
                valuePreview: String(value).substring(0, 100)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to store response JSON value' });
            throw new Error(`Failed to store response JSON value: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Captures response as ADO evidence
     * Example: Given user captures response as ADO evidence
     */
    @CSBDDStepDef("user captures response as ADO evidence")
    async captureResponseAsADOEvidence(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('captureResponseAsADOEvidence', {});
        
        try {
            const response = this.responseStorage.retrieve('last');
            if (!response) {
                throw new Error('No response available to capture as evidence');
            }
            
            // Store response data for ADO evidence collection
            const evidenceData = {
                timestamp: new Date().toISOString(),
                statusCode: response.status,
                headers: response.headers,
                body: response.body,
                responseTime: response.responseTime || 0
            };
            
            this.store('adoResponseEvidence', evidenceData);
            
            await actionLogger.logAction('responseEvidenceCaptured', { 
                statusCode: response.status,
                responseTime: response.responseTime,
                bodySize: typeof response.body === 'string' ? response.body.length : 0
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to capture response as ADO evidence' });
            throw new Error(`Failed to capture response as ADO evidence: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Helper method to resolve data file paths
     */
    private async resolveDataFilePath(filePath: string): Promise<string> {
        const path = await import('path');
        
        // Check if absolute path
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        // Try relative to test data directory
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test/data');
        const resolvedPath = path.join(testDataPath, filePath);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        // Try relative to project root
        return filePath;
    }

    /**
     * Helper method to parse CSV content
     */
    private parseCSV(content: string): any {
        const lines = content.split('\n');
        if (lines.length > 0 && lines[0]) {
            const headers = lines[0].split(',');
            return lines.slice(1).map(line => {
                const values = line.split(',');
                const row: any = {};
                headers.forEach((header, index) => {
                    row[header.trim()] = values[index]?.trim() || '';
                });
                return row;
            });
        } else {
            return [];
        }
    }
}