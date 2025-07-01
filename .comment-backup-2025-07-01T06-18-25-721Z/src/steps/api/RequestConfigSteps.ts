// src/steps/api/RequestConfigSteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { RequestTemplateEngine } from '../../api/templates/RequestTemplateEngine';
import { FileUtils } from '../../core/utils/FileUtils';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ValidationUtils } from '../../core/utils/ValidationUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

/**
 * Step definitions for configuring API requests
 * Handles request setup, templates, and configuration options
 */
@StepDefinitions
export class RequestConfigSteps extends CSBDDBaseStepDefinition {
    private templateEngine: RequestTemplateEngine;

    constructor() {
        super();
        this.templateEngine = RequestTemplateEngine.getInstance();
    }

    /**
     * Loads a request configuration from a file
     * Example: Given user loads request from "templates/user-create.json" file
     */
    @CSBDDStepDef("user loads request from {string} file")
    async loadRequestFromFile(filePath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('loadRequestFile', { filePath });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Resolve file path
            const resolvedPath = await this.resolveFilePath(filePath);
            
            // Check if file exists
            if (!await FileUtils.exists(resolvedPath)) {
                throw new Error(`Request file not found: ${resolvedPath}`);
            }
            
            // Read file content
            const fileContent = await FileUtils.readFile(resolvedPath);
            
            // Determine file type and parse
            const requestConfig = await this.parseRequestFile(resolvedPath, fileContent.toString());
            
            // Process template if needed
            const variables: Record<string, any> = {};
            // Get stored variables from the BDD context
            const processedConfig = await this.templateEngine.processTemplate(
                JSON.stringify(requestConfig),
                variables
            );
            
            const finalConfig = JSON.parse(processedConfig);
            
            // Apply configuration to context
            this.applyRequestConfig(currentContext, finalConfig);
            
            await actionLogger.logAction('requestFileLoaded', { 
                filePath: resolvedPath,
                method: finalConfig.method,
                url: finalConfig.url
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to load request file' });
            throw new Error(`Failed to load request from file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets the request method
     * Example: Given user sets request method to "POST"
     */
    @CSBDDStepDef("user sets request method to {string}")
    async setRequestMethod(method: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestMethod', { method });
        
        try {
            const currentContext = this.getAPIContext();
            const upperMethod = method.toUpperCase();
            
            // Validate method
            const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
            if (!validMethods.includes(upperMethod)) {
                throw new Error(`Invalid HTTP method: ${method}. Valid methods are: ${validMethods.join(', ')}`);
            }
            
            // Store method in context variables
            currentContext.setVariable('method', upperMethod);
            
            await actionLogger.logAction('requestMethodSet', { method: upperMethod });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request method' });
            throw error;
        }
    }

    /**
     * Sets the request URL path
     * Example: Given user sets request path to "/api/v1/users"
     */
    @CSBDDStepDef("user sets request path to {string}")
    async setRequestPath(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestPath', { path });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Interpolate variables
            const interpolatedPath = await this.interpolateValue(path);
            
            // Store path in context variables
            currentContext.setVariable('path', interpolatedPath);
            
            await actionLogger.logAction('requestPathSet', { 
                originalPath: path,
                interpolatedPath: interpolatedPath
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request path' });
            throw new Error(`Failed to set request path: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets a custom timeout for the current request
     * Example: Given user sets request timeout to 30 seconds
     */
    @CSBDDStepDef("user sets request timeout to {int} seconds")
    async setRequestTimeout(timeoutSeconds: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestTimeout', { timeoutSeconds });
        
        try {
            if (timeoutSeconds <= 0) {
                throw new Error('Timeout must be greater than 0 seconds');
            }
            
            const currentContext = this.getAPIContext();
            const timeoutMs = timeoutSeconds * 1000;
            
            // Store timeout in context variables
            currentContext.setVariable('requestTimeout', timeoutMs);
            
            await actionLogger.logAction('requestTimeoutSet', { 
                seconds: timeoutSeconds,
                milliseconds: timeoutMs
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request timeout' });
            throw new Error(`Failed to set request timeout: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Disables redirect following for the current request
     * Example: Given user disables redirect following for request
     */
    @CSBDDStepDef("user disables redirect following for request")
    async disableRequestRedirects(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('disableRequestRedirects', {});
        
        try {
            const currentContext = this.getAPIContext();
            currentContext.setVariable('followRedirects', false);
            
            await actionLogger.logAction('requestRedirectsDisabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to disable request redirects' });
            throw error;
        }
    }

    /**
     * Sets query parameters from a data table
     * Example: Given user sets query parameters:
     *   | page | 1 |
     *   | limit | 10 |
     */
    @CSBDDStepDef("user sets query parameters:")
    async setQueryParameters(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setQueryParameters', { parameters: dataTable });
        
        try {
            const currentContext = this.getAPIContext();
            const params: Record<string, string> = {};
            
            // Parse data table
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const key = row[0] || row.key || row.parameter;
                const value = row[1] || row.value;
                
                if (!key) {
                    throw new Error('Query parameter key cannot be empty');
                }
                
                // Interpolate value
                const interpolatedValue = await this.interpolateValue(String(value));
                params[key] = interpolatedValue;
            }
            
            // Store query parameters in context variables
            const existingParams = currentContext.getVariable('queryParams') || {};
            currentContext.setVariable('queryParams', { ...existingParams, ...params });
            
            await actionLogger.logAction('queryParametersSet', { parameters: params });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set query parameters' });
            throw new Error(`Failed to set query parameters: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets a single query parameter
     * Example: Given user sets query parameter "page" to "1"
     */
    @CSBDDStepDef("user sets query parameter {string} to {string}")
    async setQueryParameter(key: string, value: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setQueryParameter', { key, value });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Interpolate value
            const interpolatedValue = await this.interpolateValue(value);
            
            // Store query parameter in context variables
            const existingParams = currentContext.getVariable('queryParams') || {};
            existingParams[key] = interpolatedValue;
            currentContext.setVariable('queryParams', existingParams);
            
            await actionLogger.logAction('queryParameterSet', { 
                key,
                originalValue: value,
                interpolatedValue: interpolatedValue
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set query parameter' });
            throw new Error(`Failed to set query parameter '${key}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Removes a query parameter
     * Example: Given user removes query parameter "debug"
     */
    @CSBDDStepDef("user removes query parameter {string}")
    async removeQueryParameter(key: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('removeQueryParameter', { key });
        
        try {
            const currentContext = this.getAPIContext();
            // Remove query parameter from context variables
            const existingParams = currentContext.getVariable('queryParams') || {};
            delete existingParams[key];
            currentContext.setVariable('queryParams', existingParams);
            
            await actionLogger.logAction('queryParameterRemoved', { key });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to remove query parameter' });
            throw new Error(`Failed to remove query parameter '${key}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clears all query parameters
     * Example: Given user clears all query parameters
     */
    @CSBDDStepDef("user clears all query parameters")
    async clearQueryParameters(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearQueryParameters', {});
        
        try {
            const currentContext = this.getAPIContext();
            // Clear all query parameters from context variables
            currentContext.setVariable('queryParams', {});
            
            await actionLogger.logAction('queryParametersCleared', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to clear query parameters' });
            throw error;
        }
    }

    /**
     * Sets request to use HTTP/2
     * Example: Given user enables HTTP/2 for request
     */
    @CSBDDStepDef("user enables HTTP/2 for request")
    async enableHTTP2(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('enableHTTP2', {});
        
        try {
            const currentContext = this.getAPIContext();
            currentContext.setVariable('http2', true);
            
            await actionLogger.logAction('http2Enabled', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to enable HTTP/2' });
            throw error;
        }
    }

    /**
     * Sets request encoding
     * Example: Given user sets request encoding to "gzip"
     */
    @CSBDDStepDef("user sets request encoding to {string}")
    async setRequestEncoding(encoding: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestEncoding', { encoding });
        
        try {
            const currentContext = this.getAPIContext();
            const validEncodings = ['gzip', 'deflate', 'br', 'identity'];
            
            if (!validEncodings.includes(encoding.toLowerCase())) {
                throw new Error(`Invalid encoding: ${encoding}. Valid encodings are: ${validEncodings.join(', ')}`);
            }
            
            currentContext.setVariable('encoding', encoding.toLowerCase());
            currentContext.setHeader('Accept-Encoding', encoding.toLowerCase());
            
            await actionLogger.logAction('requestEncodingSet', { encoding: encoding.toLowerCase() });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request encoding' });
            throw new Error(`Failed to set request encoding: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets maximum response size
     * Example: Given user sets maximum response size to 10 MB
     */
    @CSBDDStepDef("user sets maximum response size to {int} MB")
    async setMaxResponseSize(sizeMB: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setMaxResponseSize', { sizeMB });
        
        try {
            if (sizeMB <= 0) {
                throw new Error('Maximum response size must be greater than 0 MB');
            }
            
            const currentContext = this.getAPIContext();
            const sizeBytes = sizeMB * 1024 * 1024;
            
            currentContext.setVariable('maxResponseSize', sizeBytes);
            
            await actionLogger.logAction('maxResponseSizeSet', { 
                megabytes: sizeMB,
                bytes: sizeBytes
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set max response size' });
            throw new Error(`Failed to set maximum response size: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Helper method to get current API context
     */
    private getAPIContext(): APIContext {
        const context = this.retrieve('currentAPIContext') as APIContext;
        if (!context) {
            throw new Error('No API context set. Please use "Given user is working with <api> API" first');
        }
        return context;
    }

    /**
     * Helper method to resolve file paths
     */
    private async resolveFilePath(filePath: string): Promise<string> {
        const path = await import('path');
        
        // Check if absolute path
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        // Try relative to test data directory
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data');
        const resolvedPath = path.join(testDataPath, 'api', filePath);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        // Try relative to project root
        return filePath;
    }

    /**
     * Helper method to parse request files
     */
    private async parseRequestFile(filePath: string, content: string): Promise<any> {
        const path = await import('path');
        const extension = path.extname(filePath).toLowerCase();
        
        switch (extension) {
            case '.json':
                return JSON.parse(content);
                
            case '.yaml':
            case '.yml':
                // For YAML, we would need a parser, but keeping it simple
                throw new Error('YAML support not implemented. Please use JSON format');
                
            default:
                // Try to parse as JSON
                try {
                    return JSON.parse(content);
                } catch (error) {
                    throw new Error(`Unable to parse request file. Supported formats: JSON`);
                }
        }
    }

    /**
     * Helper method to apply request configuration
     */
    private applyRequestConfig(context: APIContext, config: any): void {
        // Set method
        if (config.method) {
            context.setVariable('method', config.method.toUpperCase());
        }
        
        // Set URL/path
        if (config.url) {
            if (ValidationUtils.isValidUrl(config.url)) {
                // Full URL provided
                const url = new URL(config.url);
                context.setBaseUrl(`${url.protocol}//${url.host}`);
                context.setVariable('path', url.pathname);
                
                // Extract query parameters
                const queryParams: Record<string, string> = {};
                url.searchParams.forEach((value, key) => {
                    queryParams[key] = value;
                });
                if (Object.keys(queryParams).length > 0) {
                    context.setVariable('queryParams', queryParams);
                }
            } else {
                // Just a path
                context.setVariable('path', config.url);
            }
        } else if (config.path) {
            context.setVariable('path', config.path);
        }
        
        // Set headers
        if (config.headers) {
            Object.entries(config.headers).forEach(([key, value]) => {
                context.setHeader(key, String(value));
            });
        }
        
        // Set query parameters
        if (config.queryParameters || config.params) {
            const params = config.queryParameters || config.params;
            const queryParams: Record<string, string> = {};
            Object.entries(params).forEach(([key, value]) => {
                queryParams[key] = String(value);
            });
            context.setVariable('queryParams', queryParams);
        }
        
        // Set body
        if (config.body) {
            context.setVariable('body', config.body);
        }
        
        // Set options
        if (config.options) {
            Object.entries(config.options).forEach(([key, value]) => {
                context.setVariable(key, value);
            });
        }
        
        // Set authentication
        if (config.auth || config.authentication) {
            const auth = config.auth || config.authentication;
            // Store authentication config in variables
            if (auth.type) context.setVariable('authType', auth.type);
            Object.entries(auth).forEach(([key, value]) => {
                if (key !== 'type') {
                    context.setVariable(`auth_${key}`, value);
                }
            });
        }
    }

    /**
     * Helper method to interpolate variables
     */
    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        // Simple placeholder replacement for common variables
        let interpolated = value;
        interpolated = interpolated.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            const varValue = this.retrieve(varName);
            return varValue !== undefined ? String(varValue) : match;
        });
        
        return interpolated;
    }
}
