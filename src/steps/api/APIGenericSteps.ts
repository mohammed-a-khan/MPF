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

    @CSBDDStepDef("user is working with {string} API")
    async setAPIContext(apiName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('API Context Setup', { 
            description: `Setting up API context for '${apiName}' API`,
            apiName,
            details: `Initializing API testing environment for ${apiName}`
        });
        
        try {
            if (!this.apiContextManager) {
                this.apiContextManager = APIContextManager.getInstance();
                if (!this.apiContextManager) {
                    throw new Error('APIContextManager not initialized');
                }
            }
            
            if (this.apiContextManager.hasContext(apiName)) {
                this.currentContext = this.apiContextManager.getContext(apiName);
                await actionLogger.logAction('API Context Reused', { 
                    description: `Reusing existing API context for '${apiName}'`,
                    apiName,
                    details: `Found existing context configuration for ${apiName}`
                });
            } else {
                this.currentContext = this.apiContextManager.createContext(apiName);
                await actionLogger.logAction('API Context Created', { 
                    description: `Created new API context for '${apiName}'`,
                    apiName,
                    details: `New context initialized with default settings`
                });
            }
            
            this.apiContextManager.switchContext(apiName);
            
            const apiConfig = await this.loadAPIConfig(apiName);
            if (apiConfig) {
                this.currentContext.setBaseUrl(apiConfig.baseUrl);
                if (apiConfig.defaultHeaders) {
                    this.currentContext.setHeaders(apiConfig.defaultHeaders);
                }
                this.currentContext.setTimeout(apiConfig.timeout || 30000);
            }
            
            try {
                this.store('currentAPIContext', this.currentContext);
                this.store('currentAPIName', apiName);
            } catch (error) {
            }
            
            await actionLogger.logAction('API Context Ready', { 
                description: `API context '${apiName}' is ready for testing`,
                apiName, 
                baseUrl: this.currentContext.getBaseUrl(),
                timeout: this.currentContext.getTimeout(),
                details: `Context configured with base URL: ${this.currentContext.getBaseUrl()}, timeout: ${this.currentContext.getTimeout()}ms`
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set API context' });
            throw new Error(`Failed to set API context for '${apiName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets API base URL to {string}")
    async setAPIBaseURL(baseUrl: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Base URL Configuration', { 
            description: `Setting API base URL to '${baseUrl}'`,
            baseUrl,
            details: `Configuring the base endpoint for all API requests`
        });
        
        try {
            if (!ValidationUtils.isValidUrl(baseUrl)) {
                throw new Error(`Invalid URL format: ${baseUrl}`);
            }
            
            if (!this.currentContext) {
                if (this.apiContextManager.hasContext('default')) {
                    this.currentContext = this.apiContextManager.getContext('default');
                } else {
                    this.currentContext = this.apiContextManager.createContext('default');
                }
            }
            
            const interpolatedUrl = await this.interpolateValue(baseUrl);
            
            this.currentContext.setBaseUrl(interpolatedUrl);
            
            await actionLogger.logAction('Base URL Set', { 
                description: `API base URL configured successfully`,
                originalUrl: baseUrl,
                interpolatedUrl: interpolatedUrl,
                details: `All API requests will use base URL: ${interpolatedUrl}`
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set base URL' });
            throw new Error(`Failed to set API base URL: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets API timeout to {int} seconds")
    async setAPITimeout(timeoutSeconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Timeout Configuration', { 
            description: `Setting API request timeout to ${timeoutSeconds} seconds`,
            timeoutSeconds,
            details: `Configuring maximum wait time for API responses`
        });
        
        try {
            if (timeoutSeconds <= 0) {
                throw new Error('Timeout must be greater than 0 seconds');
            }
            
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            const timeoutMs = timeoutSeconds * 1000;
            this.currentContext.setTimeout(timeoutMs);
            
            await actionLogger.logAction('Timeout Applied', { 
                description: `API timeout set to ${timeoutSeconds} seconds`,
                seconds: timeoutSeconds,
                milliseconds: timeoutMs,
                details: `Requests will timeout after ${timeoutSeconds} seconds (${timeoutMs}ms)`
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set timeout' });
            throw new Error(`Failed to set API timeout: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

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

    @CSBDDStepDef("user enables API request logging")
    async enableRequestLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Request Logging Enabled', { 
            description: `Enabling detailed API request/response logging`,
            details: `All API requests and responses will be logged for debugging`
        });
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            this.currentContext.setVariable('enableLogging', true);
            
            await actionLogger.logAction('Logging Active', { 
                description: `API request logging is now active`,
                details: `Request/response details will be captured in logs`
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to enable request logging' });
            throw new Error(`Failed to enable request logging: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user disables API request logging")
    async disableRequestLogging(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('disableRequestLogging', {});
        
        try {
            if (!this.currentContext) {
                this.currentContext = await this.apiContextManager.createContext('default');
            }
            
            this.currentContext.setVariable('requestLogging', false);
            
            await actionLogger.logAction('requestLoggingDisabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to disable request logging' });
            throw error;
        }
    }

    @CSBDDStepDef("user clears all API responses")
    async clearAllResponses(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearResponses', {});
        
        try {
            this.responseStorage.clear();
            
            if (this.currentContext) {
                this.currentContext.setVariable('lastResponse', null);
            }
            
            await actionLogger.logAction('responsesCleared', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to clear responses' });
            throw error;
        }
    }

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
            
            this.currentContext.setVariable('maxRedirects', maxRedirects);
            
            await actionLogger.logAction('maxRedirectsSet', { maxRedirects });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set max redirects' });
            throw new Error(`Failed to set maximum redirects: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async loadAPIConfig(apiName: string): Promise<any> {
        try {
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
            
            const configKey = `API_${apiName.toUpperCase()}_CONFIG`;
            const configPath2 = ConfigurationManager.get(configKey);
            
            if (configPath2) {
                const configContent = await FileUtils.readFile(configPath2);
                if (!configContent) return null;
                return JSON.parse(configContent.toString());
            }
            
            const standardPath = `config/api/${apiName}.json`;
            if (await FileUtils.exists(standardPath)) {
                const configContent = await FileUtils.readFile(standardPath);
                if (!configContent) return null;
                return JSON.parse(configContent.toString());
            }
            
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

    private getDefaultBaseUrl(apiName: string): string {
        const defaultUrls: Record<string, string> = {
            'httpbin': 'https://httpbin.org',
            'jsonplaceholder': 'https://jsonplaceholder.typicode.com',
            'demo': 'https://httpbin.org'
        };
        
        return defaultUrls[apiName] || 'https://httpbin.org';
    }

    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        const variables: Record<string, any> = {};
        
        const currentContext = this.retrieve('currentAPIContext');
        if (currentContext && typeof currentContext === 'object' && 'getVariables' in currentContext) {
            const apiVars = (currentContext as APIContext).getVariables();
            Object.assign(variables, apiVars);
        }
        
        let interpolated = value;
        for (const [key, val] of Object.entries(variables)) {
            interpolated = interpolated.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
        }
        
        return interpolated;
    }

    @CSBDDStepDef("user sets base URL to {string}")
    async setBaseURL(baseUrl: string): Promise<void> {
        return await this.setAPIBaseURL(baseUrl);
    }

    @CSBDDStepDef("user loads test data from {string} as {string}")
    async loadTestData(filePath: string, dataName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('loadTestData', { filePath, dataName });
        
        try {
            const resolvedPath = await this.resolveDataFilePath(filePath);
            
            if (!require('fs').existsSync(resolvedPath)) {
                throw new Error(`Test data file not found: ${resolvedPath}`);
            }
            
            const content = require('fs').readFileSync(resolvedPath);
            const contentString = content.toString('utf8');
            let data: any;
            
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

    @CSBDDStepDef("user stores response JSON {string} as {string}")
    async storeResponseJSONValue(jsonPath: string, variableName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('storeResponseJSONValue', { jsonPath, variableName });
        
        try {
            const response = this.responseStorage.retrieve('last');
            if (!response) {
                throw new Error('No response available to extract value from');
            }
            
            let responseBody: any;
            try {
                responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
            } catch (parseError) {
                throw new Error(`Response body is not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            }
            
            let value = responseBody;
            const pathParts = jsonPath.split('.');
            
            for (const part of pathParts) {
                if (value && typeof value === 'object' && part in value) {
                    value = value[part];
                } else {
                    throw new Error(`JSON path '${jsonPath}' not found in response`);
                }
            }
            
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

    @CSBDDStepDef("user captures response as ADO evidence")
    async captureResponseAsADOEvidence(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('captureResponseAsADOEvidence', {});
        
        try {
            const response = this.responseStorage.retrieve('last');
            if (!response) {
                throw new Error('No response available to capture as evidence');
            }
            
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

    private async resolveDataFilePath(filePath: string): Promise<string> {
        const path = await import('path');
        
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test/data');
        const resolvedPath = path.join(testDataPath, filePath);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        return filePath;
    }

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
