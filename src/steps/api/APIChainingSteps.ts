// src/steps/api/APIChainingSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { APIContext } from '../../api/context/APIContext';
import { APIChainContext } from '../../api/context/APIChainContext';
import { ResponseStorage } from '../../bdd/context/ResponseStorage';
import { JSONPathValidator } from '../../api/validators/JSONPathValidator';
import { XMLValidator } from '../../api/validators/XMLValidator';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Step definitions for chaining API responses
 * Enables using data from previous responses in subsequent requests
 */
export class APIChainingSteps extends CSBDDBaseStepDefinition {
    private responseStorage: ResponseStorage;
    private chainContext: APIChainContext | null = null;
    private jsonPathValidator: JSONPathValidator;
    private xmlValidator: XMLValidator;

    constructor() {
        super();
        this.responseStorage = ResponseStorage.getInstance();
        this.jsonPathValidator = JSONPathValidator.getInstance();
        this.xmlValidator = XMLValidator.getInstance();
    }

    private getChainContext(): APIChainContext {
        if (!this.chainContext) {
            const apiContext = this.getAPIContext();
            this.chainContext = new APIChainContext(apiContext);
        }
        return this.chainContext;
    }

    /**
     * Uses JSON path value from stored response as request body field
     * Example: When user uses response JSON path "$.id" from "createUserResponse" as request body field "userId"
     */
    @CSBDDStepDef("user uses response JSON path {string} from {string} as request body field {string}")
    async useJSONPathAsBodyField(jsonPath: string, responseAlias: string, fieldName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('useJSONPathAsBodyField', { jsonPath, responseAlias, fieldName });
        
        try {
            // Get stored response
            const storedResponse = this.getStoredResponse(responseAlias);
            
            // Extract value from JSON path
            const jsonBody = this.parseResponseAsJSON(storedResponse);
            const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
            
            if (value === undefined) {
                throw new Error(`JSON path '${jsonPath}' not found in response '${responseAlias}'`);
            }
            
            // Get current API context
            const currentContext = this.getAPIContext();
            
            // Get or create request body
            let body = currentContext.getVariable('requestBody') || {};
            if (!body || typeof body !== 'object') {
                body = {};
            }
            
            // Set field value
            this.setNestedProperty(body, fieldName, value);
            currentContext.setVariable('requestBody', body);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Use ${jsonPath} from ${responseAlias} as ${fieldName}`,
                type: 'extraction',
                config: {
                    source: responseAlias,
                    sourcePath: jsonPath,
                    targetType: 'body',
                    targetField: fieldName,
                    value: value
                }
            });
            
            await actionLogger.logAction('jsonPathUsedAsBodyField', { 
                jsonPath,
                responseAlias,
                fieldName,
                valueType: typeof value,
                value: this.truncateValue(value)
            });
        } catch (error) {
            await actionLogger.logError('Failed to use JSON path as body field', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to use JSON path from '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uses response header value from stored response as request header
     * Example: When user uses response header "X-Auth-Token" from "loginResponse" as request header "Authorization"
     */
    @CSBDDStepDef("user uses response header {string} from {string} as request header {string}")
    async useResponseHeaderAsRequestHeader(sourceHeader: string, responseAlias: string, targetHeader: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('useResponseHeaderAsRequestHeader', { sourceHeader, responseAlias, targetHeader });
        
        try {
            // Get stored response
            const storedResponse = this.getStoredResponse(responseAlias);
            
            // Find header value
            const headerValue = this.findHeader(storedResponse.headers, sourceHeader);
            if (!headerValue) {
                throw new Error(`Header '${sourceHeader}' not found in response '${responseAlias}'`);
            }
            
            // Get current API context
            const currentContext = this.getAPIContext();
            
            // Set header
            currentContext.setHeader(targetHeader, headerValue);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Use header ${sourceHeader} from ${responseAlias} as ${targetHeader}`,
                type: 'extraction',
                config: {
                    source: responseAlias,
                    sourceType: 'header',
                    sourceHeader: sourceHeader,
                    targetType: 'header',
                    targetHeader: targetHeader,
                    value: headerValue
                }
            });
            
            await actionLogger.logAction('responseHeaderUsedAsRequestHeader', { 
                sourceHeader,
                responseAlias,
                targetHeader,
                value: headerValue
            });
        } catch (error) {
            await actionLogger.logError('Failed to use response header', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to use response header from '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uses stored variable in request URL
     * Example: Then user uses "userId" in request URL "/users/{{userId}}"
     */
    @CSBDDStepDef("user uses {string} in request URL {string}")
    async useVariableInURL(variableName: string, urlPath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('useVariableInURL', { variableName, urlPath });
        
        try {
            const currentContext = this.getAPIContext();
            
            // Get variable value
            const variableValue = this.retrieve(variableName);
            if (variableValue === undefined) {
                throw new Error(`Variable '${variableName}' not found`);
            }
            
            // Replace in URL
            const interpolatedPath = urlPath.replace(`{{${variableName}}}`, String(variableValue));
            
            currentContext.setVariable('requestPath', interpolatedPath);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Use variable ${variableName} in URL`,
                type: 'transformation',
                config: {
                    source: 'variable',
                    sourceVariable: variableName,
                    targetType: 'url',
                    targetPath: urlPath,
                    value: variableValue,
                    interpolatedValue: interpolatedPath
                }
            });
            
            await actionLogger.logAction('variableUsedInURL', { 
                variableName,
                originalPath: urlPath,
                interpolatedPath,
                value: String(variableValue)
            });
        } catch (error) {
            await actionLogger.logError('Failed to use variable in URL', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to use variable in URL: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uses JSON path from last response in current request
     * Example: When user uses last response JSON path "$.token" as header "Authorization" with prefix "Bearer "
     */
    @CSBDDStepDef("user uses last response JSON path {string} as header {string} with prefix {string}")
    async useLastResponseJSONPathAsHeaderWithPrefix(jsonPath: string, headerName: string, prefix: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('useLastResponseJSONPathAsHeader', { jsonPath, headerName, prefix });
        
        try {
            const lastResponse = this.getLastResponse();
            const currentContext = this.getAPIContext();
            
            // Extract value from JSON path
            const jsonBody = this.parseResponseAsJSON(lastResponse);
            const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
            
            if (value === undefined) {
                throw new Error(`JSON path '${jsonPath}' not found in last response`);
            }
            
            // Set header with prefix
            const headerValue = prefix + String(value);
            currentContext.setHeader(headerName, headerValue);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Use last response ${jsonPath} as header ${headerName}`,
                type: 'extraction',
                config: {
                    source: 'lastResponse',
                    sourcePath: jsonPath,
                    targetType: 'header',
                    targetHeader: headerName,
                    prefix: prefix,
                    value: value,
                    finalValue: headerValue
                }
            });
            
            await actionLogger.logAction('lastResponseJSONPathUsedAsHeader', { 
                jsonPath,
                headerName,
                prefix,
                value: this.truncateValue(value),
                finalValue: this.truncateValue(headerValue)
            });
        } catch (error) {
            await actionLogger.logError('Failed to use last response JSON path', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to use last response JSON path: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Chains multiple values from response to request body
     * Example: When user chains from "userResponse" to request body:
     *   | $.id       | userId     |
     *   | $.email    | userEmail  |
     *   | $.name     | userName   |
     */
    @CSBDDStepDef("user chains from {string} to request body:")
    async chainMultipleValuesToBody(responseAlias: string, dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('chainMultipleValuesToBody', { responseAlias });
        
        try {
            const storedResponse = this.getStoredResponse(responseAlias);
            const currentContext = this.getAPIContext();
            
            // Parse response as JSON
            const jsonBody = this.parseResponseAsJSON(storedResponse);
            
            // Get or create request body
            let body = currentContext.getVariable('requestBody') || {};
            if (!body || typeof body !== 'object') {
                body = {};
            }
            
            // Parse data table
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            let chainedCount = 0;
            
            for (const row of rows) {
                const sourcePath = row[0] || row.sourcePath || row.jsonPath;
                const targetField = row[1] || row.targetField || row.field;
                
                if (!sourcePath || !targetField) {
                    continue;
                }
                
                // Extract value
                const value = this.jsonPathValidator.extractValue(jsonBody, sourcePath);
                if (value !== undefined) {
                    this.setNestedProperty(body, targetField, value);
                    chainedCount++;
                    
                    // Store in chain context
                    this.getChainContext().addStep({
                        name: `Chain ${sourcePath} to ${targetField}`,
                        type: 'extraction',
                        config: {
                            source: responseAlias,
                            sourcePath: sourcePath,
                            targetType: 'body',
                            targetField: targetField,
                            value: value
                        }
                    });
                }
            }
            
            currentContext.setVariable('requestBody', body);
            
            await actionLogger.logAction('multipleValuesChainedToBody', { 
                responseAlias,
                chainedCount,
                totalFields: rows.length
            });
        } catch (error) {
            await actionLogger.logError('Failed to chain multiple values', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to chain values from '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uses XML path value from stored response
     * Example: When user uses XML path "//user/id" from "xmlResponse" as query parameter "userId"
     */
    @CSBDDStepDef("user uses XML path {string} from {string} as query parameter {string}")
    async useXMLPathAsQueryParameter(xmlPath: string, responseAlias: string, paramName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('useXMLPathAsQueryParameter', { xmlPath, responseAlias, paramName });
        
        try {
            const storedResponse = this.getStoredResponse(responseAlias);
            const currentContext = this.getAPIContext();
            
            // Get response body as string
            const xmlBody = this.getResponseBodyAsString(storedResponse);
            
            // Extract value using XPath
            const result = this.xmlValidator.extractValue(xmlBody, xmlPath);
            
            if (!result || !result.value) {
                throw new Error(`XML path '${xmlPath}' not found in response '${responseAlias}'`);
            }
            
            // Set query parameter
            const queryParams = currentContext.getVariable('queryParams') || {};
            queryParams[paramName] = String(result.value);
            currentContext.setVariable('queryParams', queryParams);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Use XML path ${xmlPath} as query param ${paramName}`,
                type: 'extraction',
                config: {
                    source: responseAlias,
                    sourcePath: xmlPath,
                    sourceType: 'xml',
                    targetType: 'query',
                    targetParameter: paramName,
                    value: result.value
                }
            });
            
            await actionLogger.logAction('xmlPathUsedAsQueryParameter', { 
                xmlPath,
                responseAlias,
                paramName,
                value: String(result.value)
            });
        } catch (error) {
            await actionLogger.logError('Failed to use XML path', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to use XML path from '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Creates request body by transforming response
     * Example: When user creates request body from "userResponse" with transformation:
     *   """
     *   {
     *     "user": {
     *       "id": "{{$.id}}",
     *       "email": "{{$.email}}",
     *       "updated": true
     *     }
     *   }
     *   """
     */
    @CSBDDStepDef("user creates request body from {string} with transformation:")
    async createBodyFromResponseWithTransformation(responseAlias: string, template: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('createBodyFromResponseTransformation', { responseAlias });
        
        try {
            const storedResponse = this.getStoredResponse(responseAlias);
            const currentContext = this.getAPIContext();
            
            // Parse response as JSON
            const jsonBody = this.parseResponseAsJSON(storedResponse);
            
            // Replace placeholders in template
            let transformedBody = template;
            const placeholderRegex = /\{\{(\$[^}]+)\}\}/g;
            const replacements: Array<{path: string, value: any}> = [];
            
            // Find all placeholders and extract values
            let match;
            while ((match = placeholderRegex.exec(template)) !== null) {
                const jsonPath = match[1] || '';
                if (!jsonPath) continue;
                const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
                
                if (value !== undefined && match[0]) {
                    replacements.push({ path: jsonPath, value });
                    transformedBody = transformedBody.replace(match[0], JSON.stringify(value));
                }
            }
            
            // Parse transformed body
            let finalBody;
            try {
                finalBody = JSON.parse(transformedBody);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`Invalid JSON after transformation: ${errorMessage}`);
            }
            
            currentContext.setVariable('requestBody', finalBody);
            
            // Store transformation in chain context
            this.getChainContext().addStep({
                name: `Transform body from ${responseAlias}`,
                type: 'transformation',
                config: {
                    source: responseAlias,
                    sourceType: 'transformation',
                    template: template,
                    replacements: replacements,
                    targetType: 'body',
                    value: finalBody
                }
            });
            
            await actionLogger.logAction('bodyCreatedFromResponseTransformation', { 
                responseAlias,
                replacementCount: replacements.length,
                bodySize: JSON.stringify(finalBody).length
            });
        } catch (error) {
            await actionLogger.logError('Failed to create body from response transformation', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to create body from response '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Appends value from response to array in request body
     * Example: When user appends JSON path "$.id" from "itemResponse" to request body array "itemIds"
     */
    @CSBDDStepDef("user appends JSON path {string} from {string} to request body array {string}")
    async appendToBodyArray(jsonPath: string, responseAlias: string, arrayField: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('appendToBodyArray', { jsonPath, responseAlias, arrayField });
        
        try {
            const storedResponse = this.getStoredResponse(responseAlias);
            const currentContext = this.getAPIContext();
            
            // Extract value from JSON path
            const jsonBody = this.parseResponseAsJSON(storedResponse);
            const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
            
            if (value === undefined) {
                throw new Error(`JSON path '${jsonPath}' not found in response '${responseAlias}'`);
            }
            
            // Get or create request body
            let body = currentContext.getVariable('requestBody') || {};
            if (!body || typeof body !== 'object') {
                body = {};
            }
            
            // Get or create array
            let array = this.getNestedProperty(body, arrayField);
            if (!Array.isArray(array)) {
                array = [];
            }
            
            // Append value
            array.push(value);
            this.setNestedProperty(body, arrayField, array);
            currentContext.setVariable('requestBody', body);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Append ${jsonPath} to ${arrayField}`,
                type: 'transformation',
                config: {
                    source: responseAlias,
                    sourcePath: jsonPath,
                    targetType: 'body',
                    targetField: arrayField,
                    operation: 'append',
                    value: value,
                    arrayLength: array.length
                }
            });
            
            await actionLogger.logAction('valueAppendedToBodyArray', { 
                jsonPath,
                responseAlias,
                arrayField,
                valueType: typeof value,
                newArrayLength: array.length
            });
        } catch (error) {
            await actionLogger.logError('Failed to append to body array', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to append to body array: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Merges response data into request body
     * Example: When user merges response from "userResponse" into request body
     */
    @CSBDDStepDef("user merges response from {string} into request body")
    async mergeResponseIntoBody(responseAlias: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('mergeResponseIntoBody', { responseAlias });
        
        try {
            const storedResponse = this.getStoredResponse(responseAlias);
            const currentContext = this.getAPIContext();
            
            // Parse response as JSON
            const responseData = this.parseResponseAsJSON(storedResponse);
            
            // Get current body
            let body = currentContext.getVariable('requestBody') || {};
            if (!body || typeof body !== 'object') {
                body = {};
            }
            
            // Merge response data into body
            const mergedBody = this.deepMerge(body, responseData);
            currentContext.setVariable('requestBody', mergedBody);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Merge ${responseAlias} into body`,
                type: 'transformation',
                config: {
                    source: responseAlias,
                    targetType: 'body',
                    operation: 'merge',
                    value: responseData,
                    mergedResult: mergedBody
                }
            });
            
            await actionLogger.logAction('responseeMergedIntoBody', { 
                responseAlias,
                originalKeys: Object.keys(body).length,
                responseKeys: Object.keys(responseData).length,
                mergedKeys: Object.keys(mergedBody).length
            });
        } catch (error) {
            await actionLogger.logError('Failed to merge response into body', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to merge response '${responseAlias}' into body: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uses response status code in request
     * Example: When user uses status code from "healthResponse" as query parameter "previousStatus"
     */
    @CSBDDStepDef("user uses status code from {string} as query parameter {string}")
    async useStatusCodeAsQueryParameter(responseAlias: string, paramName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('useStatusCodeAsQueryParameter', { responseAlias, paramName });
        
        try {
            const storedResponse = this.getStoredResponse(responseAlias);
            const currentContext = this.getAPIContext();
            
            const statusCode = storedResponse.statusCode;
            if (!statusCode) {
                throw new Error(`No status code found in response '${responseAlias}'`);
            }
            
            // Set query parameter
            const queryParams = currentContext.getVariable('queryParams') || {};
            queryParams[paramName] = String(statusCode);
            currentContext.setVariable('queryParams', queryParams);
            
            // Store in chain context
            this.getChainContext().addStep({
                name: `Use status code from ${responseAlias} as ${paramName}`,
                type: 'extraction',
                config: {
                    source: responseAlias,
                    sourceType: 'statusCode',
                    targetType: 'query',
                    targetParameter: paramName,
                    value: statusCode
                }
            });
            
            await actionLogger.logAction('statusCodeUsedAsQueryParameter', { 
                responseAlias,
                paramName,
                statusCode
            });
        } catch (error) {
            await actionLogger.logError('Failed to use status code', error instanceof Error ? error : new Error(String(error)));
            throw new Error(`Failed to use status code from '${responseAlias}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Clears all chain context
     * Example: Given user clears chain context
     */
    @CSBDDStepDef("user clears chain context")
    async clearChainContext(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clearChainContext', {});
        
        try {
            this.getChainContext().clear();
            
            await actionLogger.logAction('chainContextCleared', {});
        } catch (error) {
            await actionLogger.logError('Failed to clear chain context', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Prints chain history
     * Example: Given user prints chain history
     */
    @CSBDDStepDef("user prints chain history")
    async printChainHistory(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('printChainHistory', {});
        
        try {
            const chainExport = this.getChainContext().export();
            const history = chainExport.steps || [];
            
            console.log('\n========== API CHAIN HISTORY ==========');
            if (history.length === 0) {
                console.log('No chain operations performed');
            } else {
                history.forEach((step: any, index: number) => {
                    console.log(`\nStep ${index + 1}:`);
                    console.log(`  Source: ${step.source}`);
                    if (step.sourcePath) console.log(`  Source Path: ${step.sourcePath}`);
                    if (step.sourceType) console.log(`  Source Type: ${step.sourceType}`);
                    console.log(`  Target Type: ${step.targetType}`);
                    if (step.targetField) console.log(`  Target Field: ${step.targetField}`);
                    if (step.targetHeader) console.log(`  Target Header: ${step.targetHeader}`);
                    if (step.targetParameter) console.log(`  Target Parameter: ${step.targetParameter}`);
                    if (step.operation) console.log(`  Operation: ${step.operation}`);
                    console.log(`  Value: ${this.truncateValue(step.value)}`);
                });
            }
            console.log('=====================================\n');
            
            await actionLogger.logAction('chainHistoryPrinted', { 
                stepCount: history.length
            });
        } catch (error) {
            await actionLogger.logError('Failed to print chain history', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Helper method to get stored response
     */
    private getStoredResponse(alias: string): any {
        // Try response storage first
        const scenarioId = this.scenarioContext.getScenarioId();
        let response = this.responseStorage.retrieve(alias, scenarioId);
        
        // Try context storage
        if (!response) {
            response = this.retrieve(`response_${alias}`);
        }
        
        if (!response) {
            throw new Error(`No response found with alias '${alias}'. Make sure to store the response first using "Given user stores response as '${alias}'"'`);
        }
        
        return response;
    }

    /**
     * Helper method to get last response
     */
    private getLastResponse(): any {
        const response = this.retrieve('lastAPIResponse');
        if (!response) {
            throw new Error('No API response found. Please execute a request first');
        }
        return response;
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
     * Helper method to parse response as JSON
     */
    private parseResponseAsJSON(response: any): any {
        const bodyText = this.getResponseBodyAsString(response);
        
        try {
            return JSON.parse(bodyText);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse response as JSON: ${errorMessage}. Body: ${bodyText.substring(0, 200)}...`);
        }
    }

    /**
     * Helper method to get response body as string
     */
    private getResponseBodyAsString(response: any): string {
        if (!response.body) {
            return '';
        }
        
        if (typeof response.body === 'string') {
            return response.body;
        }
        
        if (Buffer.isBuffer(response.body)) {
            return response.body.toString('utf-8');
        }
        
        return JSON.stringify(response.body);
    }

    /**
     * Helper method to find header case-insensitively
     */
    private findHeader(headers: Record<string, string>, headerName: string): string | undefined {
        if (!headers) return undefined;
        
        const lowerHeaderName = headerName.toLowerCase();
        
        for (const [key, value] of Object.entries(headers)) {
            if (key.toLowerCase() === lowerHeaderName) {
                return value;
            }
        }
        
        return undefined;
    }

    /**
     * Helper method to set nested property
     */
    private setNestedProperty(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (key === undefined) continue;
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        const lastKey = keys[keys.length - 1];
        if (lastKey !== undefined) {
            current[lastKey] = value;
        }
    }

    /**
     * Helper method to get nested property
     */
    private getNestedProperty(obj: any, path: string): any {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }
        
        return current;
    }

    /**
     * Helper method to deep merge objects
     */
    private deepMerge(target: any, source: any): any {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
                        result[key] = this.deepMerge(result[key], source[key]);
                    } else {
                        result[key] = source[key];
                    }
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }

    /**
     * Helper method to truncate long values
     */
    private truncateValue(value: any): string {
        const str = JSON.stringify(value);
        if (str.length > 100) {
            return str.substring(0, 100) + '...';
        }
        return str;
    }
}