// src/steps/api/RequestExecutionSteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { CSHttpClient } from '../../api/client/CSHttpClient';
import { ResponseStorage } from '../../bdd/context/ResponseStorage';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { RequestOptions, Response, HttpMethod } from '../../api/types/api.types';
import * as fs from 'fs';
import * as path from 'path';
import { APIContextManager } from '../../api/context/APIContextManager';

/**
 * Step definitions for executing API requests
 * Handles all HTTP methods and request execution scenarios
 */
interface CurrentRequestData {
    method?: HttpMethod;
    url?: string;
    headers?: Record<string, string>;
    body?: any;
    responseType?: 'json' | 'text' | 'buffer' | 'stream';
}

@StepDefinitions
export class RequestExecutionSteps extends CSBDDBaseStepDefinition {
    private httpClient: CSHttpClient;
    private responseStorage: ResponseStorage;
    private currentContext: APIContext | null = null;
    private currentRequest: CurrentRequestData = {};

    constructor() {
        super();
        this.httpClient = CSHttpClient.getInstance();
        this.responseStorage = ResponseStorage.getInstance();
    }

    /**
     * Sends a request with the configured method
     * Example: When user sends request
     */
    @CSBDDStepDef("user sends request")
    async sendRequest(): Promise<void> {
        const currentContext = this.getAPIContext();
        const method = this.currentRequest.method || 'GET';
        
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendRequest', { 
            method,
            baseUrl: currentContext.getBaseUrl(),
            path: this.currentRequest.url
        });
        
        try {
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send ${method} request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a GET request
     * Example: When user sends GET request
     */
    @CSBDDStepDef("user sends GET request")
    async sendGETRequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendGETRequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'GET';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send GET request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send GET request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a GET request to a specific path
     * Example: When user sends GET request to "/api/users"
     */
    @CSBDDStepDef("user sends GET request to {string}")
    async sendGETRequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendGETRequestTo', { path });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedPath = await this.interpolateValue(path);
            
            this.currentRequest.method = 'GET';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send GET request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send GET request to '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a POST request
     * Example: When user sends POST request
     */
    @CSBDDStepDef("user sends POST request")
    async sendPOSTRequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPOSTRequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'POST';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send POST request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send POST request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a POST request to a specific path
     * Example: When user sends POST request to "/api/users"
     */
    @CSBDDStepDef("user sends POST request to {string}")
    async sendPOSTRequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPOSTRequestTo', { path });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedPath = await this.interpolateValue(path);
            
            this.currentRequest.method = 'POST';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            
            // Retrieve and set the body from the context
            const body = currentContext.getVariable('body');
            if (body !== undefined && body !== null) {
                this.currentRequest.body = body;
            }
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send POST request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send POST request to '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a PUT request
     * Example: When user sends PUT request
     */
    @CSBDDStepDef("user sends PUT request")
    async sendPUTRequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPUTRequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'PUT';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send PUT request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send PUT request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a PUT request to a specific path
     * Example: When user sends PUT request to "/api/users/123"
     */
    @CSBDDStepDef("user sends PUT request to {string}")
    async sendPUTRequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPUTRequestTo', { path });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedPath = await this.interpolateValue(path);
            
            this.currentRequest.method = 'PUT';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send PUT request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send PUT request to '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a DELETE request
     * Example: When user sends DELETE request
     */
    @CSBDDStepDef("user sends DELETE request")
    async sendDELETERequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendDELETERequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'DELETE';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send DELETE request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send DELETE request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a DELETE request to a specific path
     * Example: When user sends DELETE request to "/api/users/123"
     */
    @CSBDDStepDef("user sends DELETE request to {string}")
    async sendDELETERequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendDELETERequestTo', { path });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedPath = await this.interpolateValue(path);
            
            this.currentRequest.method = 'DELETE';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send DELETE request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send DELETE request to '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a PATCH request
     * Example: When user sends PATCH request
     */
    @CSBDDStepDef("user sends PATCH request")
    async sendPATCHRequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPATCHRequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'PATCH';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send PATCH request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send PATCH request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a PATCH request to a specific path
     * Example: When user sends PATCH request to "/api/users/123"
     */
    @CSBDDStepDef("user sends PATCH request to {string}")
    async sendPATCHRequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPATCHRequestTo', { path });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedPath = await this.interpolateValue(path);
            
            this.currentRequest.method = 'PATCH';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send PATCH request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send PATCH request to '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends a HEAD request
     * Example: When user sends HEAD request
     */
    @CSBDDStepDef("user sends HEAD request")
    async sendHEADRequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendHEADRequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'HEAD';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send HEAD request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send HEAD request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sends an OPTIONS request
     * Example: When user sends OPTIONS request
     */
    @CSBDDStepDef("user sends OPTIONS request")
    async sendOPTIONSRequest(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendOPTIONSRequest', {});
        
        try {
            const currentContext = this.getAPIContext();
            this.currentRequest.method = 'OPTIONS';
            
            await this.executeRequest(currentContext);
        } catch (error) {
            await actionLogger.logError('Failed to send OPTIONS request', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to send OPTIONS request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uploads a file
     * Example: When user uploads file "data.csv" to "/api/upload"
     */
    @CSBDDStepDef("user uploads file {string} to {string}")
    async uploadFile(filePath: string, uploadPath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('uploadFile', { filePath, uploadPath });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Resolve file path
            const resolvedPath = await this.resolveFilePath(filePath);
            
            // Check if file exists
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Upload file not found: ${resolvedPath}`);
            }
            
            // Get file info
            const fileStats = fs.statSync(resolvedPath);
            const fileName = path.basename(resolvedPath);
            const mimeType = this.getMimeType(resolvedPath);
            
            // Set up multipart form data
            const multipartData = {
                _isMultipart: true,
                fields: {},
                files: {
                    file: {
                        path: resolvedPath,
                        filename: fileName,
                        contentType: mimeType,
                        size: fileStats.size
                    }
                }
            };
            
            // Configure request
            const interpolatedPath = await this.interpolateValue(uploadPath);
            this.currentRequest.method = 'POST';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            this.currentRequest.body = multipartData;
            this.currentRequest.headers = {
                ...this.currentRequest.headers,
                'Content-Type': 'multipart/form-data'
            };
            
            await this.executeRequest(currentContext);
            
            await actionLogger.logAction('fileUploaded', { 
                fileName,
                fileSize: fileStats.size,
                uploadPath: interpolatedPath
            });
        } catch (error) {
            await actionLogger.logError('Failed to upload file', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to upload file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Downloads a file from an endpoint
     * Example: When user downloads file from "/api/files/123" as "output.pdf"
     */
    @CSBDDStepDef("user downloads file from {string} as {string}")
    async downloadFile(downloadPath: string, saveAs: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('downloadFile', { downloadPath, saveAs });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Configure request
            const interpolatedPath = await this.interpolateValue(downloadPath);
            this.currentRequest.method = 'GET';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            this.currentRequest.responseType = 'buffer';
            
            // Execute request
            const response = await this.executeRequestInternal(currentContext);
            
            // Save file
            const savePath = await this.resolveSavePath(saveAs);
            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(savePath, response.body);
            
            await actionLogger.logAction('fileDownloaded', { 
                downloadPath: interpolatedPath,
                savedAs: savePath,
                size: response.headers['content-length'] || 'unknown'
            });
        } catch (error) {
            await actionLogger.logError('Failed to download file', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to download file from '${downloadPath}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Send custom HTTP request to a specific path
     * Example: When user sends POST request to "/api/users"
     */
    @CSBDDStepDef("user sends {string} request to {string}")
    async sendCustomRequest(method: string, path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendCustomRequest', { method, path });

        try {
            const currentContext = this.getAPIContext();
            
            // Set the method and path in current request
            this.currentRequest.method = method.toUpperCase() as HttpMethod;
            this.currentRequest.url = path;
            
            await this.executeRequest(currentContext);
            
            await actionLogger.logAction('customRequestSent', { 
                method: method.toUpperCase(),
                fullUrl: this.buildFullUrl(currentContext, path)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to send custom request' });
            throw new Error(`Failed to send ${method.toUpperCase()} request to '${path}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Send generic HTTP request with method parameter (supports scenario outlines)
     * Example: When user sends "GET" request to "/get"
     */
    @CSBDDStepDef("user sends {word} request to {string}")
    async sendGenericRequest(method: string, path: string): Promise<void> {
        return await this.sendCustomRequest(method, path);
    }

    /**
     * Core method to execute the request
     */
    private async executeRequest(context: APIContext): Promise<void> {
        const response = await this.executeRequestInternal(context);
        
        // Store response in context
        const requestOptions: RequestOptions = {
            url: this.currentRequest.url || '',
            method: this.currentRequest.method || 'GET',
            headers: this.currentRequest.headers || {},
            body: this.currentRequest.body
        };
        context.storeResponse('last', response, requestOptions);
        
        // Store in BDD context for validation steps (only if scenario context is available)
        try {
            this.store('lastAPIResponse', response);
        } catch (error) {
            // Scenario context not available - this is fine for standalone API tests
        }
        
        // Add to response storage (only if scenario context is available)
        try {
            const scenarioId = this.scenarioContext.getScenarioId();
            this.responseStorage.store('last', response, scenarioId);
        } catch (error) {
            // Scenario context not available - store with a default key
            this.responseStorage.store('last', response, 'standalone');
        }
        
        // Log response summary
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('responseReceived', {
            statusCode: response.status,
            statusText: response.statusText,
            responseTime: response.duration,
            bodySize: response.body ? String(response.body).length : 0
        });
    }

    /**
     * Internal method to execute request and return response
     */
    private async executeRequestInternal(context: APIContext): Promise<Response> {
        // Build request options
        const requestOptions: RequestOptions = {
            url: this.currentRequest.url || this.buildFullUrl(context, ''),
            method: this.currentRequest.method || 'GET',
            headers: this.mergeHeaders(context),
            body: this.currentRequest.body,
            timeout: context.getTimeout(),
            validateSSL: context.getCurrentState().validateSSL,
            followRedirects: context.getCurrentState().followRedirects,
            responseType: this.currentRequest.responseType || 'json'
        };
        
        // Add auth and proxy only if they exist
        const auth = context.getAuth();
        if (auth) {
            requestOptions.auth = auth;
        }
        
        const proxy = context.getProxy();
        if (proxy) {
            requestOptions.proxy = proxy;
        }
        
        // Apply retry config
        const retryConfig = context.getCurrentState().retryConfig;
        if (retryConfig && retryConfig.enabled) {
            requestOptions.retryCount = retryConfig.maxAttempts;
            requestOptions.retryDelay = retryConfig.delay;
        }
        
        // Execute request
        const response = await this.httpClient.request(requestOptions);
        
        return response;
    }

    /**
     * Helper method to build full URL
     */
    private buildFullUrl(context: APIContext, path: string): string {
        const baseUrl = context.getBaseUrl();
        
        // Handle empty or null baseUrl
        if (!baseUrl) {
            throw new Error('Base URL is not set in API context');
        }
        
        // If path is empty, return baseUrl as-is
        if (!path) {
            return baseUrl;
        }
        
        // Check if path is already a full URL (starts with http:// or https://)
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path; // Return the full URL as-is
        }
        
        // Ensure proper URL concatenation for relative paths
        let url = baseUrl;
        
        // Remove trailing slash from baseUrl if present
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        
        // Ensure path starts with slash
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        
        return url + path;
    }

    /**
     * Helper method to merge headers
     */
    private mergeHeaders(context: APIContext): Record<string, string> {
        const contextHeaders = context.getHeaders();
        const requestHeaders = this.currentRequest.headers || {};
        
        return {
            ...contextHeaders,
            ...requestHeaders
        };
    }

    /**
     * Helper method to get current API context
     */
    private getAPIContext(): APIContext {
        // Always try to get the latest context first, don't rely on cached instance variable
        let retrievedContext: APIContext | null = null;
        
        // Try to get from BDD context first (only if scenario context is available)
        try {
            retrievedContext = this.retrieve<APIContext>('currentAPIContext');
            if (retrievedContext) {
                this.currentContext = retrievedContext;
                return this.currentContext;
            }
        } catch (error) {
            // Scenario context not available or no context stored
        }
        
        // Try to get current context from APIContextManager
        try {
            const apiContextManager = APIContextManager.getInstance();
            retrievedContext = apiContextManager.getCurrentContext();
            if (retrievedContext) {
                this.currentContext = retrievedContext;
                return this.currentContext;
            }
        } catch (managerError) {
            // APIContextManager has no current context
        }
        
        // If we still have a cached context, return it
        if (this.currentContext) {
            return this.currentContext;
        }
        
        // If no current context found anywhere, throw a helpful error
        throw new Error('No API context set. Please use "Given user is working with <api> API" first');
    }

    /**
     * Helper method to interpolate variables
     */
    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        let interpolated = value;
        
        // Replace context variables
        const regex = /{{([^}]+)}}/g;
        let match;
        while ((match = regex.exec(value)) !== null) {
            const varName = match[1];
            if (varName) {
                let varValue = '';
                try {
                    varValue = this.retrieve(varName) || '';
                } catch (error) {
                    // Scenario context not available - use empty string
                    varValue = '';
                }
                interpolated = interpolated.replace(match[0], String(varValue));
            }
        }
        
        return interpolated;
    }

    /**
     * Helper method to resolve file paths
     */
    private async resolveFilePath(filePath: string): Promise<string> {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data') as string;
        const resolvedPath = path.join(testDataPath, filePath);
        
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }
        
        return filePath;
    }

    /**
     * Helper method to resolve save paths
     */
    private async resolveSavePath(savePath: string): Promise<string> {
        if (path.isAbsolute(savePath)) {
            return savePath;
        }
        
        const downloadsPath = ConfigurationManager.get('DOWNLOADS_PATH', './downloads') as string;
        return path.join(downloadsPath, savePath);
    }

    /**
     * Helper method to get MIME type
     */
    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.zip': 'application/zip',
            '.json': 'application/json',
            '.xml': 'application/xml'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * Set the current API context
     */
    public setAPIContext(context: APIContext): void {
        this.currentContext = context;
        try {
            this.store('currentAPIContext', context);
        } catch (error) {
            // Scenario context not available - this is fine for standalone API tests
            // The context is still stored in the instance variable
        }
    }

    /**
     * Clear current request state
     */
    public clearCurrentRequest(): void {
        this.currentRequest = {};
    }
}