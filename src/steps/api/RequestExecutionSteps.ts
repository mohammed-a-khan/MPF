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

    @CSBDDStepDef("user sends GET request to {string}")
    async sendGETRequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('HTTP GET Request', { 
            description: `Sending GET request to '${path}'`,
            path,
            details: `Executing HTTP GET request to retrieve data from endpoint`
        });
        
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

    @CSBDDStepDef("user sends POST request to {string}")
    async sendPOSTRequestTo(path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendPOSTRequestTo', { path });
        
        try {
            const currentContext = this.getAPIContext();
            const interpolatedPath = await this.interpolateValue(path);
            
            this.currentRequest.method = 'POST';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            
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

    @CSBDDStepDef("user uploads file {string} to {string}")
    async uploadFile(filePath: string, uploadPath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('uploadFile', { filePath, uploadPath });
        
        try {
            const currentContext = this.getAPIContext();
            
            const resolvedPath = await this.resolveFilePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Upload file not found: ${resolvedPath}`);
            }
            
            const fileStats = fs.statSync(resolvedPath);
            const fileName = path.basename(resolvedPath);
            const mimeType = this.getMimeType(resolvedPath);
            
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

    @CSBDDStepDef("user downloads file from {string} as {string}")
    async downloadFile(downloadPath: string, saveAs: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('downloadFile', { downloadPath, saveAs });
        
        try {
            const currentContext = this.getAPIContext();
            
            const interpolatedPath = await this.interpolateValue(downloadPath);
            this.currentRequest.method = 'GET';
            this.currentRequest.url = this.buildFullUrl(currentContext, interpolatedPath);
            this.currentRequest.responseType = 'buffer';
            
            const response = await this.executeRequestInternal(currentContext);
            
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

    @CSBDDStepDef("user sends {string} request to {string}")
    async sendCustomRequest(method: string, path: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('sendCustomRequest', { method, path });

        try {
            const currentContext = this.getAPIContext();
            
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

    @CSBDDStepDef("user sends {word} request to {string}")
    async sendGenericRequest(method: string, path: string): Promise<void> {
        return await this.sendCustomRequest(method, path);
    }

    private async executeRequest(context: APIContext): Promise<void> {
        const response = await this.executeRequestInternal(context);
        
        const requestOptions: RequestOptions = {
            url: this.currentRequest.url || '',
            method: this.currentRequest.method || 'GET',
            headers: this.currentRequest.headers || {},
            body: this.currentRequest.body
        };
        context.storeResponse('last', response, requestOptions);
        
        try {
            this.store('lastAPIResponse', response);
        } catch (error) {
        }
        
        try {
            const scenarioId = this.scenarioContext.getScenarioId();
            this.responseStorage.store('last', response, scenarioId);
        } catch (error) {
            this.responseStorage.store('last', response, 'standalone');
        }
        
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('responseReceived', {
            statusCode: response.status,
            statusText: response.statusText,
            responseTime: response.duration,
            bodySize: response.body ? String(response.body).length : 0
        });
    }

    private async executeRequestInternal(context: APIContext): Promise<Response> {
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
        
        const auth = context.getAuth();
        if (auth) {
            requestOptions.auth = auth;
        }
        
        const proxy = context.getProxy();
        if (proxy) {
            requestOptions.proxy = proxy;
        }
        
        const retryConfig = context.getCurrentState().retryConfig;
        if (retryConfig && retryConfig.enabled) {
            requestOptions.retryCount = retryConfig.maxAttempts;
            requestOptions.retryDelay = retryConfig.delay;
        }
        
        const response = await this.httpClient.request(requestOptions);
        
        return response;
    }

    private buildFullUrl(context: APIContext, path: string): string {
        const baseUrl = context.getBaseUrl();
        
        if (!baseUrl) {
            throw new Error('Base URL is not set in API context');
        }
        
        if (!path) {
            return baseUrl;
        }
        
        // Check if path is already a full URL (starts with http:// or https://)
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        
        let url = baseUrl;
        
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        
        return url + path;
    }

    private mergeHeaders(context: APIContext): Record<string, string> {
        const contextHeaders = context.getHeaders();
        const requestHeaders = this.currentRequest.headers || {};
        
        return {
            ...contextHeaders,
            ...requestHeaders
        };
    }

    private getAPIContext(): APIContext {
        let retrievedContext: APIContext | null = null;
        
        try {
            retrievedContext = this.retrieve<APIContext>('currentAPIContext');
            if (retrievedContext) {
                this.currentContext = retrievedContext;
                return this.currentContext;
            }
        } catch (error) {
        }
        
        try {
            const apiContextManager = APIContextManager.getInstance();
            retrievedContext = apiContextManager.getCurrentContext();
            if (retrievedContext) {
                this.currentContext = retrievedContext;
                return this.currentContext;
            }
        } catch (managerError) {
        }
        
        if (this.currentContext) {
            return this.currentContext;
        }
        
        throw new Error('No API context set. Please use "Given user is working with <api> API" first');
    }

    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        let interpolated = value;
        
        const regex = /{{([^}]+)}}/g;
        let match;
        while ((match = regex.exec(value)) !== null) {
            const varName = match[1];
            if (varName) {
                let varValue = '';
                try {
                    varValue = this.retrieve(varName) || '';
                } catch (error) {
                    varValue = '';
                }
                interpolated = interpolated.replace(match[0], String(varValue));
            }
        }
        
        return interpolated;
    }

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

    private async resolveSavePath(savePath: string): Promise<string> {
        if (path.isAbsolute(savePath)) {
            return savePath;
        }
        
        const downloadsPath = ConfigurationManager.get('DOWNLOADS_PATH', './downloads') as string;
        return path.join(downloadsPath, savePath);
    }

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

    public setAPIContext(context: APIContext): void {
        this.currentContext = context;
        try {
            this.store('currentAPIContext', context);
        } catch (error) {
        }
    }

    public clearCurrentRequest(): void {
        this.currentRequest = {};
    }
}
