// src/steps/api/ResponseValidationSteps.ts

import { CSBDDStepDef, StepDefinitions } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { StatusCodeValidator } from '../../api/validators/StatusCodeValidator';
import { HeaderValidator } from '../../api/validators/HeaderValidator';
import { BodyValidator } from '../../api/validators/BodyValidator';
import { SchemaValidator } from '../../api/validators/SchemaValidator';
import { JSONPathValidator } from '../../api/validators/JSONPathValidator';
import { XMLValidator } from '../../api/validators/XMLValidator';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ResponseStorage } from '../../bdd/context/ResponseStorage';
import { APIContextManager } from '../../api/context/APIContextManager';

@StepDefinitions
export class ResponseValidationSteps extends CSBDDBaseStepDefinition {
    private statusCodeValidator: StatusCodeValidator;
    private headerValidator: HeaderValidator;
    private bodyValidator: BodyValidator;
    private schemaValidator: SchemaValidator;
    private jsonPathValidator: JSONPathValidator;
    private xmlValidator: XMLValidator;
    private responseStorage: ResponseStorage;
    private apiContextManager: APIContextManager;

    constructor() {
        super();
        this.statusCodeValidator = new StatusCodeValidator();
        this.headerValidator = new HeaderValidator();
        this.bodyValidator = new BodyValidator();
        this.schemaValidator = SchemaValidator.getInstance();
        this.jsonPathValidator = JSONPathValidator.getInstance();
        this.xmlValidator = XMLValidator.getInstance();
        this.responseStorage = ResponseStorage.getInstance();
        this.apiContextManager = APIContextManager.getInstance();
    }

    @CSBDDStepDef("the response status code should be {int}")
    async validateStatusCode(expectedCode: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateStatusCode', { expectedCode });
        
        try {
            const response = this.getLastResponse();
            const result = this.statusCodeValidator.validate(response.status, expectedCode);
            
            if (!result.valid) {
                throw new Error(`Status code validation failed: Expected ${expectedCode} but got ${response.status}. ${result.message || ''}`);
            }
            
            await actionLogger.logAction('statusCodeValidated', { 
                expected: expectedCode,
                actual: response.status
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Status code validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response status code should be between {int} and {int}")
    async validateStatusCodeRange(minCode: number, maxCode: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateStatusCodeRange', { minCode, maxCode });
        
        try {
            const response = this.getLastResponse();
            const result = this.statusCodeValidator.validateRange(response.status, minCode, maxCode);
            
            if (!result.valid) {
                throw new Error(`Status code validation failed: Expected code between ${minCode} and ${maxCode} but got ${response.status}`);
            }
            
            await actionLogger.logAction('statusCodeRangeValidated', { 
                range: `${minCode}-${maxCode}`,
                actual: response.status
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Status code range validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response body should contain {string}")
    async validateBodyContains(expectedText: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateBodyContains', { expectedText });
        
        try {
            const response = this.getLastResponse();
            const interpolatedText = await this.interpolateValue(expectedText);
            
            const bodyText = this.getResponseBodyAsString(response);
            const result = this.bodyValidator.validateContains(bodyText, interpolatedText);
            
            if (!result.valid) {
                throw new Error(`Response body validation failed: Expected to contain '${interpolatedText}' but it was not found. Body preview: ${bodyText.substring(0, 200)}...`);
            }
            
            await actionLogger.logAction('bodyContainsValidated', { 
                searchText: interpolatedText,
                found: true
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Body contains validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response body should not contain {string}")
    async validateBodyNotContains(text: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateBodyNotContains', { text });
        
        try {
            const response = this.getLastResponse();
            const interpolatedText = await this.interpolateValue(text);
            
            const bodyText = this.getResponseBodyAsString(response);
            
            if (bodyText.includes(interpolatedText)) {
                throw new Error(`Response body validation failed: Expected NOT to contain '${interpolatedText}' but it was found`);
            }
            
            await actionLogger.logAction('bodyNotContainsValidated', { 
                searchText: interpolatedText,
                notFound: true
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Body not contains validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response body should equal {string}")
    async validateBodyEquals(expectedBody: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateBodyEquals', { 
            expectedLength: expectedBody.length 
        });
        
        try {
            const response = this.getLastResponse();
            const interpolatedBody = await this.interpolateValue(expectedBody);
            
            const bodyText = this.getResponseBodyAsString(response);
            
            if (bodyText !== interpolatedBody) {
                throw new Error(`Response body validation failed: Expected body to equal '${interpolatedBody}' but got '${bodyText}'`);
            }
            
            await actionLogger.logAction('bodyEqualsValidated', { 
                bodyLength: bodyText.length
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Body equals validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response JSON path {string} should exist")
    async validateJSONPathExists(jsonPath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONPathExists', { jsonPath });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
            
            if (value === undefined) {
                throw new Error(`JSON path validation failed: Path '${jsonPath}' does not exist in response`);
            }
            
            await actionLogger.logAction('jsonPathExistsValidated', { 
                jsonPath,
                valueType: typeof value
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'JSON path exists validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response JSON path {string} should equal {string}")
    async validateJSONPathEquals(jsonPath: string, expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONPathEquals', { jsonPath, expectedValue });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            const interpolatedValue = await this.interpolateValue(expectedValue);
            
            const parsedExpected = this.parseExpectedValue(interpolatedValue);
            
            const result = await this.jsonPathValidator.validatePath(jsonBody, jsonPath, parsedExpected);
            
            if (!result.valid) {
                throw new Error(`JSON path validation failed: ${result.message}`);
            }
            
            await actionLogger.logAction('jsonPathEqualsValidated', { 
                jsonPath,
                expectedValue: parsedExpected
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'JSON path equals validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response JSON path {string} should contain {string}")
    async validateJSONPathContains(jsonPath: string, expectedText: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONPathContains', { jsonPath, expectedText });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            const interpolatedText = await this.interpolateValue(expectedText);
            
            const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
            
            if (value === undefined) {
                throw new Error(`JSON path validation failed: Path '${jsonPath}' does not exist`);
            }
            
            const stringValue = String(value);
            if (!stringValue.includes(interpolatedText)) {
                throw new Error(`JSON path validation failed: Expected '${jsonPath}' to contain '${interpolatedText}' but got '${stringValue}'`);
            }
            
            await actionLogger.logAction('jsonPathContainsValidated', { 
                jsonPath,
                containsText: interpolatedText
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'JSON path contains validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response JSON path {string} should have {int} elements")
    async validateJSONPathArrayLength(jsonPath: string, expectedLength: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONPathArrayLength', { jsonPath, expectedLength });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            const value = this.jsonPathValidator.extractValue(jsonBody, jsonPath);
            
            if (!Array.isArray(value)) {
                throw new Error(`JSON path validation failed: Path '${jsonPath}' is not an array`);
            }
            
            if (value.length !== expectedLength) {
                throw new Error(`JSON path validation failed: Expected array at '${jsonPath}' to have ${expectedLength} elements but has ${value.length}`);
            }
            
            await actionLogger.logAction('jsonPathArrayLengthValidated', { 
                jsonPath,
                expectedLength,
                actualLength: value.length
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'JSON path array length validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response should match schema {string}")
    async validateJSONSchema(schemaFile: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONSchema', { schemaFile });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            const schemaPath = await this.resolveSchemaPath(schemaFile);
            const schemaContent = await FileUtils.readFile(schemaPath);
            const schema = JSON.parse(schemaContent.toString());
            
            const result = await this.schemaValidator.validateSchema(jsonBody, schema);
            
            if (!result.valid) {
                const errors = result.errors ? result.errors.map(e => `  - ${e.path}: ${e.message}`).join('\n') : 'Validation failed';
                throw new Error(`Schema validation failed:\n${errors}`);
            }
            
            await actionLogger.logAction('schemaValidated', { 
                schemaFile: schemaPath,
                valid: true
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Schema validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response should have header {string}")
    async validateHeaderExists(headerName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateHeaderExists', { headerName });
        
        try {
            const response = this.getLastResponse();
            const result = this.headerValidator.validateHeaderExists(response.headers, headerName);
            
            if (!result.valid) {
                throw new Error(`Header validation failed: Expected header '${headerName}' not found`);
            }
            
            await actionLogger.logAction('headerExistsValidated', { 
                headerName,
                value: response.headers[headerName]
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Header exists validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response header {string} should equal {string}")
    async validateHeaderEquals(headerName: string, expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateHeaderEquals', { headerName, expectedValue });
        
        try {
            const response = this.getLastResponse();
            const interpolatedValue = await this.interpolateValue(expectedValue);
            
            const result = this.headerValidator.validateHeader(response.headers, headerName, interpolatedValue);
            
            if (!result.valid) {
                const actualValue = response.headers[headerName] || 'not found';
                throw new Error(`Header validation failed: Expected header '${headerName}' to equal '${interpolatedValue}' but got '${actualValue}'`);
            }
            
            await actionLogger.logAction('headerEqualsValidated', { 
                headerName,
                expectedValue: interpolatedValue,
                actualValue: response.headers[headerName]
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Header equals validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response header {string} should contain {string}")
    async validateHeaderContains(headerName: string, expectedText: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateHeaderContains', { headerName, expectedText });
        
        try {
            const response = this.getLastResponse();
            const interpolatedText = await this.interpolateValue(expectedText);
            
            const headerValue = response.headers[headerName];
            if (!headerValue) {
                throw new Error(`Header validation failed: Header '${headerName}' not found`);
            }
            
            if (!headerValue.includes(interpolatedText)) {
                throw new Error(`Header validation failed: Expected header '${headerName}' to contain '${interpolatedText}' but got '${headerValue}'`);
            }
            
            await actionLogger.logAction('headerContainsValidated', { 
                headerName,
                containsText: interpolatedText,
                headerValue
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Header contains validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response time should be less than {int} ms")
    async validateResponseTime(maxTimeMs: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateResponseTime', { maxTimeMs });
        
        try {
            const response = this.getLastResponse();
            const responseTime = response.responseTime || 0;
            
            if (responseTime > maxTimeMs) {
                throw new Error(`Response time validation failed: Expected response time less than ${maxTimeMs}ms but was ${responseTime}ms`);
            }
            
            await actionLogger.logAction('responseTimeValidated', { 
                maxTime: maxTimeMs,
                actualTime: responseTime
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Response time validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the XML response path {string} should equal {string}")
    async validateXPathEquals(xpath: string, expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateXPathEquals', { xpath, expectedValue });
        
        try {
            const response = this.getLastResponse();
            const xmlBody = this.getResponseBodyAsString(response);
            const interpolatedValue = await this.interpolateValue(expectedValue);
            
            const result = await this.xmlValidator.validateXPath(xmlBody, xpath, interpolatedValue);
            
            if (!result.valid) {
                throw new Error(`XPath validation failed: ${result.message}`);
            }
            
            await actionLogger.logAction('xpathEqualsValidated', { 
                xpath,
                expectedValue: interpolatedValue
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'XPath equals validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response body should be empty")
    async validateBodyEmpty(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateBodyEmpty', {});
        
        try {
            const response = this.getLastResponse();
            const bodyText = this.getResponseBodyAsString(response);
            
            if (bodyText && bodyText.trim().length > 0) {
                throw new Error(`Response body validation failed: Expected empty body but got '${bodyText.substring(0, 100)}...'`);
            }
            
            await actionLogger.logAction('bodyEmptyValidated', {});
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Body empty validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response body should match pattern {string}")
    async validateBodyPattern(pattern: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateBodyPattern', { pattern });
        
        try {
            const response = this.getLastResponse();
            const bodyText = this.getResponseBodyAsString(response);
            
            const regex = new RegExp(pattern);
            if (!regex.test(bodyText)) {
                throw new Error(`Response body validation failed: Body does not match pattern '${pattern}'`);
            }
            
            await actionLogger.logAction('bodyPatternValidated', { pattern });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Body pattern validation failed' });
            throw error;
        }
    }

    @CSBDDStepDef("the response should match JSON schema:")
    async validateInlineJSONSchema(schemaJson: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateInlineJSONSchema', {});
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            let schema: any;
            try {
                schema = JSON.parse(schemaJson);
            } catch (error) {
                throw new Error(`Invalid JSON schema: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            const result = await this.schemaValidator.validateSchema(jsonBody, schema);
            
            if (!result.valid) {
                const errors = result.errors ? result.errors.map(e => `  - ${e.path}: ${e.message}`).join('\n') : 'Validation failed';
                throw new Error(`Schema validation failed:\n${errors}`);
            }
            
            await actionLogger.logAction('inlineSchemaValidated', { valid: true });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Inline schema validation failed' });
            throw error;
        }
    }

    private getLastResponse(): any {
        try {
            const response = this.retrieve('lastAPIResponse');
            if (response) {
                return response;
            }
        } catch (error) {
        }
        
        try {
            const response = this.responseStorage.retrieve('last', 'standalone');
            if (response) {
                return response;
            }
        } catch (error) {
        }
        
        try {
            const apiContextManager = APIContextManager.getInstance();
            const currentContext = apiContextManager.getCurrentContext();
            const response = currentContext.getResponse('last');
            if (response) {
                return response;
            }
        } catch (error) {
        }
        
        throw new Error('No API response found. Please execute a request first');
    }

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

    private parseResponseAsJSON(response: any): any {
        const bodyText = this.getResponseBodyAsString(response);
        
        try {
            return JSON.parse(bodyText);
        } catch (error) {
            throw new Error(`Failed to parse response as JSON: ${error instanceof Error ? error.message : String(error)}. Body: ${bodyText.substring(0, 200)}...`);
        }
    }

    private parseExpectedValue(value: string): any {
        try {
            return JSON.parse(value);
        } catch {
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (value === 'null') return null;
            if (value === 'undefined') return undefined;
            
            const num = Number(value);
            if (!isNaN(num) && value.trim() !== '') {
                return num;
            }
            
            return value;
        }
    }

    private async resolveSchemaPath(schemaFile: string): Promise<string> {
        const path = await import('path');
        if (path.isAbsolute(schemaFile)) {
            return schemaFile;
        }
        
        const schemaPath = ConfigurationManager.get('SCHEMA_PATH', './test-data/schemas');
        const resolvedPath = path.join(schemaPath, schemaFile);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data');
        const testDataResolvedPath = path.join(testDataPath, 'schemas', schemaFile);
        
        if (await FileUtils.exists(testDataResolvedPath)) {
            return testDataResolvedPath;
        }
        
        if (await FileUtils.exists(schemaFile)) {
            return schemaFile;
        }
        
        throw new Error(`Schema file not found: ${schemaFile}`);
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

    @CSBDDStepDef("response should contain JSON:")
    async validateResponseContainsJSON(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateResponseContainsJSON', {});
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            const rows = dataTable.hashes ? dataTable.hashes() : dataTable.rows();
            
            for (const row of rows) {
                const path = row.path || row[0];
                const expectedType = row.type || row[1];
                const expectedValue = row.value || row[2];
                
                if (!path) {
                    throw new Error('JSON path cannot be empty');
                }
                
                let actualValue = jsonBody;
                const pathParts = path.split('.');
                
                for (const part of pathParts) {
                    if (actualValue && typeof actualValue === 'object' && part in actualValue) {
                        actualValue = actualValue[part];
                    } else {
                        throw new Error(`JSON path '${path}' not found in response`);
                    }
                }
                
                if (expectedType) {
                    const actualType = Array.isArray(actualValue) ? 'array' : typeof actualValue;
                    if (actualType !== expectedType) {
                        throw new Error(`JSON path '${path}' type mismatch. Expected: ${expectedType}, Actual: ${actualType}`);
                    }
                }
                
                if (expectedValue !== undefined && expectedValue !== '') {
                    const interpolatedExpectedValue = await this.interpolateValue(String(expectedValue));
                    const parsedExpectedValue = this.parseExpectedValue(interpolatedExpectedValue);
                    
                    if (actualValue !== parsedExpectedValue) {
                        throw new Error(`JSON path '${path}' value mismatch. Expected: ${parsedExpectedValue}, Actual: ${actualValue}`);
                    }
                }
            }
            
            await actionLogger.logAction('responseJSONValidated', { 
                validationCount: Array.isArray(rows) ? rows.length : 0
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Response JSON validation failed' });
            throw error;
        }
    }
}
