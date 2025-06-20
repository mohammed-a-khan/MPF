// src/steps/api/RequestHeaderSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Step definitions for managing API request headers
 * Provides comprehensive header manipulation capabilities
 */
export class RequestHeaderSteps extends CSBDDBaseStepDefinition {
    
    /**
     * Sets a single request header
     * Example: Given user sets request header "Content-Type" to "application/json"
     */
    @CSBDDStepDef("user sets request header {string} to {string}")
    async setRequestHeader(headerName: string, headerValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestHeader', { headerName, headerValue });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Validate header name
            if (!headerName || headerName.trim().length === 0) {
                throw new Error('Header name cannot be empty');
            }
            
            // Check for restricted headers
            this.validateHeaderName(headerName);
            
            // Interpolate value
            const interpolatedValue = await this.interpolateValue(headerValue);
            
            currentContext.setHeader(headerName, interpolatedValue);
            
            await actionLogger.logAction('requestHeaderSet', { 
                headerName,
                originalValue: headerValue,
                interpolatedValue: interpolatedValue,
                isDefault: false
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request header' });
            throw new Error(`Failed to set request header '${headerName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets multiple request headers from a data table
     * Example: Given user sets request headers:
     *   | Authorization | Bearer {{token}} |
     *   | X-API-Key    | {{apiKey}}       |
     */
    @CSBDDStepDef("user sets request headers:")
    async setRequestHeaders(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestHeaders', { headers: dataTable });
        
        try {
            const currentContext = this.getAPIContext();
            const headers: Record<string, string> = {};
            
            // Parse data table
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const headerName = row[0] || row.header || row.name;
                const headerValue = row[1] || row.value;
                
                if (!headerName) {
                    throw new Error('Header name cannot be empty');
                }
                
                // Validate header name
                this.validateHeaderName(headerName);
                
                // Interpolate value
                const interpolatedValue = await this.interpolateValue(String(headerValue || ''));
                headers[headerName] = interpolatedValue;
                
                currentContext.setHeader(headerName, interpolatedValue);
            }
            
            await actionLogger.logAction('requestHeadersSet', { 
                headers: headers,
                count: Object.keys(headers).length
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request headers' });
            throw new Error(`Failed to set request headers: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Removes a request header
     * Example: Given user removes request header "X-Debug"
     */
    @CSBDDStepDef("user removes request header {string}")
    async removeRequestHeader(headerName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('removeRequestHeader', { headerName });
        
        try {
            const currentContext = this.getAPIContext();
            
            currentContext.removeHeader(headerName);
            
            await actionLogger.logAction('requestHeaderRemoved', { headerName });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to remove request header' });
            throw new Error(`Failed to remove request header '${headerName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clears all request headers
     * Example: Given user clears all request headers
     */
    @CSBDDStepDef("user clears all request headers")
    async clearAllRequestHeaders(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearRequestHeaders', {});
        
        try {
            const currentContext = this.getAPIContext();
            
            currentContext.clearHeaders();
            
            await actionLogger.logAction('requestHeadersCleared', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to clear request headers' });
            throw error;
        }
    }

    /**
     * Sets Accept header
     * Example: Given user accepts "application/json"
     */
    @CSBDDStepDef("user accepts {string}")
    async setAcceptHeader(contentType: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setAcceptHeader', { contentType });
        
        try {
            const currentContext = this.getAPIContext();
            
            currentContext.setHeader('Accept', contentType);
            
            await actionLogger.logAction('acceptHeaderSet', { contentType });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set Accept header' });
            throw new Error(`Failed to set Accept header: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets a default header that will be used for all requests
     * Example: Given user sets default header "X-Client-ID" to "test-client"
     */
    @CSBDDStepDef("user sets default header {string} to {string}")
    async setDefaultHeader(headerName: string, headerValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setDefaultHeader', { headerName, headerValue });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Validate header name
            this.validateHeaderName(headerName);
            
            // Interpolate value
            const interpolatedValue = await this.interpolateValue(headerValue);
            
            // Store as default header in context variables
            const defaultHeaders = currentContext.getVariable('defaultHeaders') || {};
            defaultHeaders[headerName] = interpolatedValue;
            currentContext.setVariable('defaultHeaders', defaultHeaders);
            
            await actionLogger.logAction('defaultHeaderSet', { 
                headerName,
                originalValue: headerValue,
                interpolatedValue: interpolatedValue,
                isDefault: true
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set default header' });
            throw new Error(`Failed to set default header '${headerName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Removes a default header
     * Example: Given user removes default header "X-Debug"
     */
    @CSBDDStepDef("user removes default header {string}")
    async removeDefaultHeader(headerName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('removeDefaultHeader', { headerName });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Remove from default headers in context variables
            const defaultHeaders = currentContext.getVariable('defaultHeaders') || {};
            delete defaultHeaders[headerName];
            currentContext.setVariable('defaultHeaders', defaultHeaders);
            
            await actionLogger.logAction('defaultHeaderRemoved', { headerName });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to remove default header' });
            throw new Error(`Failed to remove default header '${headerName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets custom headers from JSON
     * Example: Given user sets headers from JSON:
     *   """
     *   {
     *     "X-Custom-Header": "value",
     *     "X-Request-ID": "{{requestId}}"
     *   }
     *   """
     */
    @CSBDDStepDef("user sets headers from JSON:")
    async setHeadersFromJSON(jsonString: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setHeadersFromJSON', {});
        
        try {
            const currentContext = this.getAPIContext();
            
            // Parse JSON
            let headers: Record<string, any>;
            try {
                headers = JSON.parse(jsonString);
            } catch (error) {
                throw new Error(`Invalid JSON format: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // Validate and set headers
            for (const [headerName, headerValue] of Object.entries(headers)) {
                this.validateHeaderName(headerName);
                
                const valueStr = String(headerValue);
                const interpolatedValue = await this.interpolateValue(valueStr);
                
                currentContext.setHeader(headerName, interpolatedValue);
            }
            
            await actionLogger.logAction('headersSetFromJSON', { 
                count: Object.keys(headers).length,
                headers: headers
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set headers from JSON' });
            throw new Error(`Failed to set headers from JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Copies headers from a previous response
     * Example: Given user copies response headers from "loginResponse"
     */
    @CSBDDStepDef("user copies response headers from {string}")
    async copyResponseHeaders(responseAlias: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('copyResponseHeaders', { responseAlias });
        
        try {
            const currentContext = this.getAPIContext();
            const storedResponse = this.retrieve(`response_${responseAlias}`);
            
            if (!storedResponse) {
                throw new Error(`No response found with alias '${responseAlias}'`);
            }
            
            if (!storedResponse.headers) {
                throw new Error(`Response '${responseAlias}' has no headers`);
            }
            
            // Copy headers
            let copiedCount = 0;
            for (const [headerName, headerValue] of Object.entries(storedResponse.headers)) {
                // Skip certain headers that shouldn't be copied
                if (this.shouldSkipHeader(headerName)) {
                    continue;
                }
                
                currentContext.setHeader(headerName, String(headerValue));
                copiedCount++;
            }
            
            await actionLogger.logAction('responseHeadersCopied', { 
                responseAlias,
                copiedCount,
                skippedHeaders: Object.keys(storedResponse.headers).length - copiedCount
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to copy response headers' });
            throw new Error(`Failed to copy response headers from '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets a header with base64 encoded value
     * Example: Given user sets header "X-Auth-Token" to base64 encoded "username:password"
     */
    @CSBDDStepDef("user sets header {string} to base64 encoded {string}")
    async setBase64EncodedHeader(headerName: string, value: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setBase64Header', { headerName });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Interpolate value first
            const interpolatedValue = await this.interpolateValue(value);
            
            // Base64 encode
            const encodedValue = Buffer.from(interpolatedValue).toString('base64');
            
            currentContext.setHeader(headerName, encodedValue);
            
            await actionLogger.logAction('base64HeaderSet', { 
                headerName,
                originalLength: interpolatedValue.length,
                encodedLength: encodedValue.length
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set base64 encoded header' });
            throw new Error(`Failed to set base64 encoded header '${headerName}': ${error instanceof Error ? error.message : String(error)}`);
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
     * Helper method to validate header names
     */
    private validateHeaderName(headerName: string): void {
        // Check for empty or whitespace-only names
        if (!headerName || headerName.trim().length === 0) {
            throw new Error('Header name cannot be empty');
        }
        
        // Check for invalid characters
        const validHeaderRegex = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
        if (!validHeaderRegex.test(headerName)) {
            throw new Error(`Invalid header name '${headerName}'. Header names must contain only valid HTTP header characters`);
        }
        
        // Warn about potentially problematic headers
        const restrictedHeaders = [
            'Host', 'Connection', 'Content-Length', 'Transfer-Encoding',
            'Upgrade', 'Proxy-Connection', 'TE', 'Trailer'
        ];
        
        if (restrictedHeaders.some(h => h.toLowerCase() === headerName.toLowerCase())) {
            ActionLogger.logWarn(`Setting restricted header '${headerName}' may be overridden by the HTTP client`);
        }
    }

    /**
     * Helper method to determine if a header should be skipped when copying
     */
    private shouldSkipHeader(headerName: string): boolean {
        const skipHeaders = [
            'content-length',
            'transfer-encoding',
            'connection',
            'keep-alive',
            'host',
            'date',
            'server',
            'x-powered-by'
        ];
        
        return skipHeaders.includes(headerName.toLowerCase());
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
