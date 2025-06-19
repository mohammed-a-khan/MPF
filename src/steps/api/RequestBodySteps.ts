// src/steps/api/RequestBodySteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { RequestTemplateEngine } from '../../api/templates/RequestTemplateEngine';
import { FileUtils } from '../../core/utils/FileUtils';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

/**
 * Step definitions for configuring API request body
 * Handles various body formats: JSON, XML, form data, multipart, raw text
 */
@StepDefinitions
export class RequestBodySteps extends CSBDDBaseStepDefinition {
    private templateEngine: RequestTemplateEngine;

    constructor() {
        super();
        this.templateEngine = RequestTemplateEngine.getInstance();
    }

    /**
     * Sets request body from a doc string
     * Example: Given user sets request body to:
     *   """json
     *   {
     *     "name": "{{userName}}",
     *     "email": "{{userEmail}}"
     *   }
     *   """
     */
    @CSBDDStepDef("user sets request body to:")
    async setRequestBody(bodyContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestBody', { 
            contentLength: bodyContent.length,
            preview: bodyContent.substring(0, 100)
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Process template variables
            const variables: Record<string, any> = {};
            const processedBody = await this.templateEngine.processTemplate(bodyContent, variables);
            
            // Detect content type if not set
            const contentType = this.detectContentType(processedBody, currentContext);
            
            // Parse and validate based on content type
            const validatedBody = this.validateAndParseBody(processedBody, contentType);
            
            currentContext.setVariable('body',  validatedBody);
            
            // Set content type header if not already set
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

    /**
     * Sets request body from a file
     * Example: Given user sets request body from "data/user-create.json" file
     */
    @CSBDDStepDef("user sets request body from {string} file")
    async setRequestBodyFromFile(filePath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRequestBodyFromFile', { filePath });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Resolve file path
            const resolvedPath = await this.resolveFilePath(filePath);
            
            // Check if file exists
            if (!await FileUtils.exists(resolvedPath)) {
                throw new Error(`Request body file not found: ${resolvedPath}`);
            }
            
            // Read file content
            const fileContent = await FileUtils.readFile(resolvedPath);
            
            // Process template variables
            const variables: Record<string, any> = {};
            const processedBody = await this.templateEngine.processTemplate(fileContent.toString(), variables);
            
            // Detect content type from file extension or content
            const contentType = this.detectContentTypeFromFile(resolvedPath, processedBody, currentContext);
            
            // Validate and parse
            const validatedBody = this.validateAndParseBody(processedBody, contentType);
            
            currentContext.setVariable('body',  validatedBody);
            
            // Set content type header if not already set
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

    /**
     * Sets a form field value
     * Example: Given user sets form field "username" to "testuser"
     */
    @CSBDDStepDef("user sets form field {string} to {string}")
    async setFormField(fieldName: string, fieldValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setFormField', { fieldName, fieldValue });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Get existing form data or create new
            let formData = currentContext.getVariable('body') as Record<string, any>;
            if (!formData || typeof formData !== 'object') {
                formData = {};
            }
            
            // Interpolate value
            const interpolatedValue = await this.interpolateValue(fieldValue);
            
            // Set field
            formData[fieldName] = interpolatedValue;
            
            currentContext.setVariable('body',  formData);
            
            // Set content type for form data if not set
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

    /**
     * Sets multiple form fields from a data table
     * Example: Given user sets form fields:
     *   | username | testuser |
     *   | password | {{password}} |
     */
    @CSBDDStepDef("user sets form fields:")
    async setFormFields(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setFormFields', { fields: dataTable });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Get existing form data or create new
            let formData = currentContext.getVariable('body') as Record<string, any>;
            if (!formData || typeof formData !== 'object') {
                formData = {};
            }
            
            // Parse data table
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const fieldName = row[0] || row.field || row.name;
                const fieldValue = row[1] || row.value;
                
                if (!fieldName) {
                    throw new Error('Form field name cannot be empty');
                }
                
                // Interpolate value
                const interpolatedValue = await this.interpolateValue(String(fieldValue || ''));
                formData[fieldName] = interpolatedValue;
            }
            
            currentContext.setVariable('body',  formData);
            
            // Set content type for form data if not set
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

    /**
     * Sets JSON body from object notation
     * Example: Given user sets JSON body:
     *   | name  | John Doe |
     *   | age   | 30       |
     *   | email | {{email}} |
     */
    @CSBDDStepDef("user sets JSON body:")
    async setJSONBody(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setJSONBody', { data: dataTable });
        
        try {
            const currentContext = this.getAPIContext();
            const jsonObject: Record<string, any> = {};
            
            // Parse data table
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const key = row[0] || row.key || row.property;
                const value = row[1] || row.value;
                
                if (!key) {
                    throw new Error('JSON property name cannot be empty');
                }
                
                // Interpolate and parse value
                const interpolatedValue = await this.interpolateValue(String(value || ''));
                jsonObject[key] = this.parseJSONValue(interpolatedValue);
            }
            
            currentContext.setVariable('body', jsonObject);
            currentContext.setHeader('Content-Type', 'application/json');
            
            await actionLogger.logAction('jsonBodySet', { 
                properties: Object.keys(jsonObject).length,
                body: jsonObject
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Failed to set JSON body' });
            throw new Error(`Failed to set JSON body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets XML body from a template
     * Example: Given user sets XML body:
     *   """xml
     *   <user>
     *     <name>{{userName}}</name>
     *     <email>{{userEmail}}</email>
     *   </user>
     *   """
     */
    @CSBDDStepDef("user sets XML body:")
    async setXMLBody(xmlContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setXMLBody', { 
            contentLength: xmlContent.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Process template variables
            const variables: Record<string, any> = {};
            const processedXML = await this.templateEngine.processTemplate(xmlContent, variables);
            
            // Basic XML validation
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

    /**
     * Sets raw text body
     * Example: Given user sets raw body to "Plain text content"
     */
    @CSBDDStepDef("user sets raw body to {string}")
    async setRawBody(bodyContent: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setRawBody', { 
            contentLength: bodyContent.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Interpolate variables
            const interpolatedBody = await this.interpolateValue(bodyContent);
            
            currentContext.setVariable('body', interpolatedBody);
            
            // Set content type to plain text if not set
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

    /**
     * Clears the request body
     * Example: Given user clears request body
     */
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

    /**
     * Sets multipart form data field
     * Example: Given user sets multipart field "description" to "Test file upload"
     */
    @CSBDDStepDef("user sets multipart field {string} to {string}")
    async setMultipartField(fieldName: string, fieldValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setMultipartField', { fieldName, fieldValue });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Get or create multipart data
            let multipartData = currentContext.getVariable('body') as any;
            if (!multipartData || !multipartData._isMultipart) {
                multipartData = {
                    _isMultipart: true,
                    fields: {},
                    files: {}
                };
            }
            
            // Interpolate value
            const interpolatedValue = await this.interpolateValue(fieldValue);
            
            if (multipartData && multipartData.fields) {
                multipartData.fields[fieldName] = interpolatedValue;
            }
            
            currentContext.setVariable('body', multipartData);
            
            // Set content type for multipart
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

    /**
     * Adds a file to multipart form data
     * Example: Given user adds file "documents/test.pdf" as "document" to multipart
     */
    @CSBDDStepDef("user adds file {string} as {string} to multipart")
    async addFileToMultipart(filePath: string, fieldName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('addFileToMultipart', { filePath, fieldName });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Resolve file path
            const resolvedPath = await this.resolveFilePath(filePath);
            
            // Check if file exists
            if (!await FileUtils.exists(resolvedPath)) {
                throw new Error(`File not found: ${resolvedPath}`);
            }
            
            // Get file info
            const fileStats = await FileUtils.getStats(resolvedPath);
            const path = await import('path');
            const fileName = path.basename(resolvedPath);
            const mimeType = this.getMimeType(resolvedPath);
            
            // Get or create multipart data
            let multipartData = currentContext.getVariable('body') as any;
            if (!multipartData || !multipartData._isMultipart) {
                multipartData = {
                    _isMultipart: true,
                    fields: {},
                    files: {}
                };
            }
            
            // Add file reference
            if (multipartData && multipartData.files) {
                multipartData.files[fieldName] = {
                    path: resolvedPath,
                    filename: fileName,
                    contentType: mimeType,
                    size: fileStats.size
                };
            }
            
            currentContext.setVariable('body', multipartData);
            
            // Set content type for multipart
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

    /**
     * Sets GraphQL query
     * Example: Given user sets GraphQL query:
     *   """
     *   query GetUser($id: ID!) {
     *     user(id: $id) {
     *       name
     *       email
     *     }
     *   }
     *   """
     */
    @CSBDDStepDef("user sets GraphQL query:")
    async setGraphQLQuery(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setGraphQLQuery', { 
            queryLength: query.length 
        });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Get existing GraphQL body or create new
            let graphqlBody = currentContext.getVariable('body') as any;
            if (!graphqlBody || typeof graphqlBody !== 'object') {
                graphqlBody = {};
            }
            
            // Process template in query
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

    /**
     * Sets GraphQL variables
     * Example: Given user sets GraphQL variables:
     *   """json
     *   {
     *     "id": "{{userId}}"
     *   }
     *   """
     */
    @CSBDDStepDef("user sets GraphQL variables:")
    async setGraphQLVariables(variablesJson: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('setGraphQLVariables', {});
        
        try {
            const currentContext = this.getAPIContext();
            
            // Get existing GraphQL body or create new
            let graphqlBody = currentContext.getVariable('body') as any;
            if (!graphqlBody || typeof graphqlBody !== 'object') {
                graphqlBody = {};
            }
            
            // Process template in variables
            const contextVariables: Record<string, any> = {};
            const processedVariables = await this.templateEngine.processTemplate(variablesJson, contextVariables);
            
            // Parse variables
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
     * Helper method to detect content type from body content
     */
    private detectContentType(body: string, context: APIContext): string {
        // Check if content type already set
        const existingContentType = context.getHeader('Content-Type');
        if (existingContentType) {
            return existingContentType;
        }
        
        // Try to detect from content
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

    /**
     * Helper method to detect content type from file
     */
    private detectContentTypeFromFile(filePath: string, content: string, context: APIContext): string {
        // Check if content type already set
        const existingContentType = context.getHeader('Content-Type');
        if (existingContentType) {
            return existingContentType;
        }
        
        // Check by file extension
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
        
        // Fall back to content detection
        return this.detectContentType(content, context);
    }

    /**
     * Helper method to validate and parse body based on content type
     */
    private validateAndParseBody(body: string, contentType: string): any {
        if (contentType.includes('application/json')) {
            try {
                return JSON.parse(body);
            } catch (error) {
                throw new Error(`Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else if (contentType.includes('application/xml')) {
            // Basic XML validation
            this.validateXML(body);
            return body;
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            // Parse URL encoded form
            const params = new URLSearchParams(body);
            const formData: Record<string, string> = {};
            params.forEach((value, key) => {
                formData[key] = value;
            });
            return formData;
        } else {
            // Return as-is for other content types
            return body;
        }
    }

    /**
     * Helper method to validate XML
     */
    private validateXML(xml: string): void {
        // Basic XML validation
        const tagRegex = /<([^>]+)>/g;
        const openTags: string[] = [];
        let match;
        
        while ((match = tagRegex.exec(xml)) !== null) {
            const tag = match[1];
            
            if (tag && tag.startsWith('/')) {
                // Closing tag
                const tagName = tag.substring(1);
                const lastOpen = openTags.pop();
                if (lastOpen !== tagName) {
                    throw new Error(`XML validation failed: Expected closing tag for '${lastOpen || 'unknown'}' but found '${tagName}'`);
                }
            } else if (tag && !tag.endsWith('/')) {
                // Opening tag (not self-closing)
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

    /**
     * Helper method to parse JSON values
     */
    private parseJSONValue(value: string): any {
        // Try to parse as JSON first
        try {
            return JSON.parse(value);
        } catch {
            // Not JSON, check for special values
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (value === 'null') return null;
            
            // Check if number
            const num = Number(value);
            if (!isNaN(num) && value.trim() !== '') {
                return num;
            }
            
            // Return as string
            return value;
        }
    }

    /**
     * Helper method to get MIME type
     */
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

    /**
     * Helper method to resolve file paths
     */
    private async resolveFilePath(filePath: string): Promise<string> {
        // Check if absolute path
        const path = await import('path');
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        // Try relative to test data directory
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data');
        const resolvedPath = path.join(testDataPath, filePath);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        // Try relative to project root
        return filePath;
    }

    /**
     * Helper method to interpolate variables
     */
    private async interpolateValue(value: string): Promise<string> {
        if (!value.includes('{{')) {
            return value;
        }
        
        // Simple placeholder replacement
        let interpolated = value;
        interpolated = interpolated.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            const varValue = this.retrieve(varName);
            return varValue !== undefined ? String(varValue) : match;
        });
        
        return interpolated;
    }
}
