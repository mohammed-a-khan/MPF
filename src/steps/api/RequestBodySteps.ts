// src/steps/api/RequestBodySteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { RequestTemplateEngine } from '../../api/templates/RequestTemplateEngine';
import { FileUtils } from '../../core/utils/FileUtils';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { APIContextManager } from '../../api/context/APIContextManager';

@StepDefinitions
export class RequestBodySteps extends CSBDDBaseStepDefinition {
    private templateEngine: RequestTemplateEngine;
    private currentContext: APIContext | null = null;

    constructor() {
        super();
        this.templateEngine = RequestTemplateEngine.getInstance();
    }

    @CSBDDStepDef("user sets request body to:")
    async setRequestBody(bodyContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestBody', { 
            contentLength: bodyContent.length,
            preview: bodyContent.substring(0, 100)
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            const variables: Record<string, any> = {};
            const processedBody = await this.templateEngine.processTemplate(bodyContent, variables);
            
            const contentType = this.detectContentType(processedBody, currentContext);
            
            const validatedBody = this.validateAndParseBody(processedBody, contentType);
            
            currentContext.setVariable('body',  validatedBody);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType) {
                currentContext.setHeader('Content-Type', contentType);
            }
            
            await actionLogger.logAction('requestBodySet', { 
                contentType,
                bodySize: processedBody.length,
                isTemplated: bodyContent !== processedBody
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request body' });
            throw new Error(`Failed to set request body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets request body from {string} file")
    async setRequestBodyFromFile(filePath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestBodyFromFile', { filePath });
        
        try {
            const currentContext = this.getAPIContext();
            
            const resolvedPath = await this.resolveFilePath(filePath);
            
            if (!await FileUtils.exists(resolvedPath)) {
                throw new Error(`Request body file not found: ${resolvedPath}`);
            }
            
            const fileContent = await FileUtils.readFile(resolvedPath);
            
            const variables: Record<string, any> = {};
            const processedBody = await this.templateEngine.processTemplate(fileContent.toString(), variables);
            
            const contentType = this.detectContentTypeFromFile(resolvedPath, processedBody, currentContext);
            
            const validatedBody = this.validateAndParseBody(processedBody, contentType);
            
            currentContext.setVariable('body',  validatedBody);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType) {
                currentContext.setHeader('Content-Type', contentType);
            }
            
            await actionLogger.logAction('requestBodySetFromFile', { 
                filePath: resolvedPath,
                contentType,
                fileSize: fileContent.length,
                processedSize: processedBody.length
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set request body from file' });
            throw new Error(`Failed to set request body from file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets form field {string} to {string}")
    async setFormField(fieldName: string, fieldValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setFormField', { fieldName, fieldValue });
        
        try {
            const currentContext = this.getAPIContext();
            
            let formData = currentContext.getVariable('body') as Record<string, any>;
            if (!formData || typeof formData !== 'object') {
                formData = {};
            }
            
            const interpolatedValue = await this.interpolateValue(fieldValue);
            
            formData[fieldName] = interpolatedValue;
            
            currentContext.setVariable('body',  formData);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType) {
                currentContext.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            }
            
            await actionLogger.logAction('formFieldSet', { 
                fieldName,
                originalValue: fieldValue,
                interpolatedValue
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set form field' });
            throw new Error(`Failed to set form field '${fieldName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets form fields:")
    async setFormFields(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setFormFields', { fields: dataTable });
        
        try {
            const currentContext = this.getAPIContext();
            
            let formData = currentContext.getVariable('body') as Record<string, any>;
            if (!formData || typeof formData !== 'object') {
                formData = {};
            }
            
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const fieldName = row[0] || row.field || row.name;
                const fieldValue = row[1] || row.value;
                
                if (!fieldName) {
                    throw new Error('Form field name cannot be empty');
                }
                
                const interpolatedValue = await this.interpolateValue(String(fieldValue || ''));
                formData[fieldName] = interpolatedValue;
            }
            
            currentContext.setVariable('body',  formData);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType) {
                currentContext.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            }
            
            await actionLogger.logAction('formFieldsSet', { 
                count: Object.keys(formData).length,
                fields: Object.keys(formData)
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set form fields' });
            throw new Error(`Failed to set form fields: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets JSON body:")
    async setJSONBody(dataTableOrDocString: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setJSONBody', { data: dataTableOrDocString });
        
        try {
            const currentContext = this.getAPIContext();
            
            if (typeof dataTableOrDocString === 'string') {
                const jsonContent = dataTableOrDocString.trim();
                
                const variables: Record<string, any> = {};
                const processedJSON = await this.templateEngine.processTemplate(jsonContent, variables);
                
                let jsonObject;
                try {
                    jsonObject = JSON.parse(processedJSON);
                } catch (parseError) {
                    throw new Error(`Invalid JSON format: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                }
                
                currentContext.setVariable('body', jsonObject);
                currentContext.setHeader('Content-Type', 'application/json');
                
                await actionLogger.logAction('jsonBodySet', { 
                    source: 'docstring',
                    bodySize: processedJSON.length,
                    isTemplated: jsonContent !== processedJSON
                });
            } else {
                const jsonObject: Record<string, any> = {};
                
                const rows = dataTableOrDocString.hashes ? dataTableOrDocString.hashes() : dataTableOrDocString.rows();
                
                for (const row of rows) {
                    const key = row[0] || row.key || row.property;
                    const value = row[1] || row.value;
                    
                    if (!key) {
                        throw new Error('JSON property name cannot be empty');
                    }
                    
                    const interpolatedValue = await this.interpolateValue(String(value || ''));
                    jsonObject[key] = this.parseJSONValue(interpolatedValue);
                }
                
                currentContext.setVariable('body', jsonObject);
                currentContext.setHeader('Content-Type', 'application/json');
                
                await actionLogger.logAction('jsonBodySet', { 
                    source: 'datatable',
                    properties: Object.keys(jsonObject).length,
                    body: jsonObject
                });
            }
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set JSON body' });
            throw new Error(`Failed to set JSON body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets XML body:")
    async setXMLBody(xmlContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setXMLBody', { 
            contentLength: xmlContent.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            const variables: Record<string, any> = {};
            const processedXML = await this.templateEngine.processTemplate(xmlContent, variables);
            
            this.validateXML(processedXML);
            
            currentContext.setVariable('body', processedXML);
            currentContext.setHeader('Content-Type', 'application/xml');
            
            await actionLogger.logAction('xmlBodySet', { 
                bodySize: processedXML.length,
                isTemplated: xmlContent !== processedXML
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set XML body' });
            throw new Error(`Failed to set XML body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets raw body to {string}")
    async setRawBody(bodyContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRawBody', { 
            contentLength: bodyContent.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            const interpolatedBody = await this.interpolateValue(bodyContent);
            
            currentContext.setVariable('body', interpolatedBody);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType) {
                currentContext.setHeader('Content-Type', 'text/plain');
            }
            
            await actionLogger.logAction('rawBodySet', { 
                bodySize: interpolatedBody.length,
                isTemplated: bodyContent !== interpolatedBody
            });
        } catch (error) {
            await actionLogger.logError('Failed to set raw body', error);
            throw new Error(`Failed to set raw body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user clears request body")
    async clearRequestBody(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearRequestBody', {});
        
        try {
            const currentContext = this.getAPIContext();
            
            currentContext.setVariable('body', null);
            
            await actionLogger.logAction('requestBodyCleared', {});
        } catch (error) {
            await actionLogger.logError('Failed to clear request body', error);
            throw error;
        }
    }

    @CSBDDStepDef("user sets multipart field {string} to {string}")
    async setMultipartField(fieldName: string, fieldValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setMultipartField', { fieldName, fieldValue });
        
        try {
            const currentContext = this.getAPIContext();
            
            let multipartData = currentContext.getVariable('body') as any;
            if (!multipartData || !multipartData._isMultipart) {
                multipartData = {
                    _isMultipart: true,
                    fields: {},
                    files: {}
                };
            }
            
            const interpolatedValue = await this.interpolateValue(fieldValue);
            
            if (multipartData && multipartData.fields) {
                multipartData.fields[fieldName] = interpolatedValue;
            }
            
            currentContext.setVariable('body', multipartData);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType || !existingContentType.includes('multipart')) {
                currentContext.setHeader('Content-Type', 'multipart/form-data');
            }
            
            await actionLogger.logAction('multipartFieldSet', { 
                fieldName,
                interpolatedValue
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set multipart field' });
            throw new Error(`Failed to set multipart field '${fieldName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user adds file {string} as {string} to multipart")
    async addFileToMultipart(filePath: string, fieldName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('addFileToMultipart', { filePath, fieldName });
        
        try {
            const currentContext = this.getAPIContext();
            
            const resolvedPath = await this.resolveFilePath(filePath);
            
            if (!await FileUtils.exists(resolvedPath)) {
                throw new Error(`File not found: ${resolvedPath}`);
            }
            
            const fileStats = await FileUtils.getStats(resolvedPath);
            const path = await import('path');
            const fileName = path.basename(resolvedPath);
            const mimeType = this.getMimeType(resolvedPath);
            
            let multipartData = currentContext.getVariable('body') as any;
            if (!multipartData || !multipartData._isMultipart) {
                multipartData = {
                    _isMultipart: true,
                    fields: {},
                    files: {}
                };
            }
            
            if (multipartData && multipartData.files) {
                multipartData.files[fieldName] = {
                    path: resolvedPath,
                    filename: fileName,
                    contentType: mimeType,
                    size: fileStats.size
                };
            }
            
            currentContext.setVariable('body', multipartData);
            
            const existingContentType = currentContext.getHeader('Content-Type');
            if (!existingContentType || !existingContentType.includes('multipart')) {
                currentContext.setHeader('Content-Type', 'multipart/form-data');
            }
            
            await actionLogger.logAction('fileAddedToMultipart', { 
                fieldName,
                fileName,
                fileSize: fileStats.size,
                mimeType
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to add file to multipart' });
            throw new Error(`Failed to add file to multipart: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets GraphQL query:")
    async setGraphQLQuery(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setGraphQLQuery', { 
            queryLength: query.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            let graphqlBody = currentContext.getVariable('body') as any;
            if (!graphqlBody || typeof graphqlBody !== 'object') {
                graphqlBody = {};
            }
            
            const variables: Record<string, any> = {};
            const processedQuery = await this.templateEngine.processTemplate(query, variables);
            
            graphqlBody.query = processedQuery;
            
            currentContext.setVariable('body', graphqlBody);
            currentContext.setHeader('Content-Type', 'application/json');
            
            await actionLogger.logAction('graphqlQuerySet', { 
                queryLength: processedQuery.length,
                hasVariables: !!graphqlBody.variables
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set GraphQL query' });
            throw new Error(`Failed to set GraphQL query: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets GraphQL variables:")
    async setGraphQLVariables(variablesJson: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setGraphQLVariables', {});
        
        try {
            const currentContext = this.getAPIContext();
            
            let graphqlBody = currentContext.getVariable('body') as any;
            if (!graphqlBody || typeof graphqlBody !== 'object') {
                graphqlBody = {};
            }
            
            const contextVariables: Record<string, any> = {};
            const processedVariables = await this.templateEngine.processTemplate(variablesJson, contextVariables);
            
            let variables: any;
            try {
                variables = JSON.parse(processedVariables);
            } catch (error) {
                throw new Error(`Invalid JSON in GraphQL variables: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            graphqlBody.variables = variables;
            
            currentContext.setVariable('body', graphqlBody);
            currentContext.setHeader('Content-Type', 'application/json');
            
            await actionLogger.logAction('graphqlVariablesSet', { 
                variableCount: Object.keys(variables).length,
                variables
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set GraphQL variables' });
            throw new Error(`Failed to set GraphQL variables: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef("user sets request body to JSON:")
    async setRequestBodyToJSON(jsonContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestBodyToJSON', { 
            contentLength: jsonContent.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            console.log('🔍 DEBUG - Raw JSON content:', JSON.stringify(jsonContent));
            console.log('🔍 DEBUG - Raw JSON content length:', jsonContent.length);
            console.log('🔍 DEBUG - First 20 chars:', JSON.stringify(jsonContent.substring(0, 20)));
            
            const interpolatedJson = await this.interpolateValue(jsonContent);
            
            console.log('🔍 DEBUG - Interpolated JSON:', JSON.stringify(interpolatedJson));
            console.log('🔍 DEBUG - About to parse JSON...');
            
            const jsonBody = JSON.parse(interpolatedJson);
            
            currentContext.setVariable('body', jsonBody);
            
            currentContext.setHeader('Content-Type', 'application/json');
            
            await actionLogger.logAction('requestBodySetToJSON', { 
                bodySize: interpolatedJson.length,
                isTemplated: jsonContent !== interpolatedJson
            });
        } catch (error) {
            console.log('🔍 DEBUG - JSON Parse Error:', error);
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set JSON request body' });
            throw new Error(`Failed to set JSON request body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private getAPIContext(): APIContext {
        if (this.currentContext) {
            return this.currentContext;
        }
        
        try {
            const context = this.retrieve('currentAPIContext') as APIContext;
            if (context) {
                this.currentContext = context;
                return context;
            }
        } catch (error) {
        }
        
        try {
            const apiContextManager = APIContextManager.getInstance();
            if (apiContextManager.hasContext('default')) {
                this.currentContext = apiContextManager.getContext('default');
                return this.currentContext;
            } else {
                this.currentContext = apiContextManager.createContext('default');
                return this.currentContext;
            }
        } catch (error) {
        }
        
        throw new Error('No API context available. Please use "Given user sets API base URL" first');
    }

    private detectContentType(body: string, context: APIContext): string {
        const existingContentType = context.getHeader('Content-Type');
        if (existingContentType) {
            return existingContentType;
        }
        
        const trimmed = body.trim();
        
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return 'application/json';
        } else if (trimmed.startsWith('<')) {
            return 'application/xml';
        } else if (trimmed.includes('=') && trimmed.includes('&')) {
            return 'application/x-www-form-urlencoded';
        } else {
            return 'text/plain';
        }
    }

    private detectContentTypeFromFile(filePath: string, content: string, context: APIContext): string {
        const existingContentType = context.getHeader('Content-Type');
        if (existingContentType) {
            return existingContentType;
        }
        
        const path = (typeof window === 'undefined') ? require('path') : { extname: (p: string) => { const parts = p.split('.'); return parts.length > 1 ? '.' + parts[parts.length - 1] : ''; } };
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.txt': 'text/plain',
            '.html': 'text/html',
            '.csv': 'text/csv',
            '.yaml': 'application/x-yaml',
            '.yml': 'application/x-yaml'
        };
        
        if (mimeTypes[ext]) {
            return mimeTypes[ext];
        }
        
        return this.detectContentType(content, context);
    }

    private validateAndParseBody(body: string, contentType: string): any {
        if (contentType.includes('application/json')) {
            try {
                return JSON.parse(body);
            } catch (error) {
                throw new Error(`Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else if (contentType.includes('application/xml')) {
            this.validateXML(body);
            return body;
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(body);
            const formData: Record<string, string> = {};
            params.forEach((value, key) => {
                formData[key] = value;
            });
            return formData;
        } else {
            return body;
        }
    }

    private validateXML(xml: string): void {
        const tagRegex = /<([^>]+)>/g;
        const openTags: string[] = [];
        let match;
        
        while ((match = tagRegex.exec(xml)) !== null) {
            const tag = match[1];
            
            if (tag && tag.startsWith('/')) {
                const tagName = tag.substring(1);
                const lastOpen = openTags.pop();
                if (lastOpen !== tagName) {
                    throw new Error(`XML validation failed: Expected closing tag for '${lastOpen || 'unknown'}' but found '${tagName}'`);
                }
            } else if (tag && !tag.endsWith('/')) {
                const tagName = tag.split(' ')[0];
                if (tagName) {
                    openTags.push(tagName);
                }
            }
        }
        
        if (openTags.length > 0) {
            throw new Error(`XML validation failed: Unclosed tags: ${openTags.join(', ')}`);
        }
    }

    private parseJSONValue(value: string): any {
        try {
            return JSON.parse(value);
        } catch {
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (value === 'null') return null;
            
            const num = Number(value);
            if (!isNaN(num) && value.trim() !== '') {
                return num;
            }
            
            return value;
        }
    }

    private getMimeType(filePath: string): string {
        const path = (typeof window === 'undefined') ? require('path') : { extname: (p: string) => { const parts = p.split('.'); return parts.length > 1 ? '.' + parts[parts.length - 1] : ''; } };
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
            '.zip': 'application/zip'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }

    private async resolveFilePath(filePath: string): Promise<string> {
        const path = await import('path');
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data');
        const resolvedPath = path.join(testDataPath, filePath);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        return filePath;
    }

    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        let interpolated = value;
        interpolated = interpolated.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            const varValue = this.retrieve(varName);
            return varValue !== undefined ? String(varValue) : match;
        });
        
        return interpolated;
    }

    @CSBDDStepDef("user sets content type to {string}")
    async setContentType(contentType: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setContentType', { contentType });
        
        try {
            const currentContext = this.getAPIContext();
            
            const interpolatedContentType = await this.interpolateValue(contentType);
            
            currentContext.setHeader('Content-Type', interpolatedContentType);
            
            await actionLogger.logAction('contentTypeSet', { 
                originalContentType: contentType,
                interpolatedContentType
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set content type' });
            throw new Error(`Failed to set content type: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
