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

/**
 * Step definitions for validating API responses
 * Provides comprehensive validation capabilities for all response aspects
 */
@StepDefinitions
export class ResponseValidationSteps extends CSBDDBaseStepDefinition {
    private statusCodeValidator: StatusCodeValidator;
    private headerValidator: HeaderValidator;
    private bodyValidator: BodyValidator;
    private schemaValidator: SchemaValidator;
    private jsonPathValidator: JSONPathValidator;
    private xmlValidator: XMLValidator;

    constructor() {
        super();
        this.statusCodeValidator = new StatusCodeValidator();
        this.headerValidator = new HeaderValidator();
        this.bodyValidator = new BodyValidator();
        this.schemaValidator = SchemaValidator.getInstance();
        this.jsonPathValidator = JSONPathValidator.getInstance();
        this.xmlValidator = XMLValidator.getInstance();
    }

    /**
     * Validates response status code
     * Example: Then the response status code should be 200
     */
    @CSBDDStepDef("the response status code should be {int}")
    async validateStatusCode(expectedCode: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateStatusCode', { expectedCode });
        
        try {
            const response = this.getLastResponse();
            const result = this.statusCodeValidator.validate(response.statusCode, expectedCode);
            
            if (!result.valid) {
                throw new Error(`Status code validation failed: Expected ${expectedCode} but got ${response.statusCode}. ${result.message || ''}`);
            }
            
            await actionLogger.logAction('statusCodeValidated', { 
                expected: expectedCode,
                actual: response.statusCode
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Status code validation failed' });
            throw error;
        }
    }

    /**
     * Validates response status code is in range
     * Example: Then the response status code should be between 200 and 299
     */
    @CSBDDStepDef("the response status code should be between {int} and {int}")
    async validateStatusCodeRange(minCode: number, maxCode: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateStatusCodeRange', { minCode, maxCode });
        
        try {
            const response = this.getLastResponse();
            const result = this.statusCodeValidator.validateRange(response.statusCode, minCode, maxCode);
            
            if (!result.valid) {
                throw new Error(`Status code validation failed: Expected code between ${minCode} and ${maxCode} but got ${response.statusCode}`);
            }
            
            await actionLogger.logAction('statusCodeRangeValidated', { 
                range: `${minCode}-${maxCode}`,
                actual: response.statusCode
            });
        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { context: 'Status code range validation failed' });
            throw error;
        }
    }

    /**
     * Validates response body contains text
     * Example: Then the response body should contain "success"
     */
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

    /**
     * Validates response body does not contain text
     * Example: Then the response body should not contain "error"
     */
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

    /**
     * Validates response body equals expected value
     * Example: Then the response body should equal "OK"
     */
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

    /**
     * Validates JSON path exists
     * Example: Then the response JSON path "$.data.id" should exist
     */
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

    /**
     * Validates JSON path value equals expected
     * Example: Then the response JSON path "$.status" should equal "active"
     */
    @CSBDDStepDef("the response JSON path {string} should equal {string}")
    async validateJSONPathEquals(jsonPath: string, expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONPathEquals', { jsonPath, expectedValue });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            const interpolatedValue = await this.interpolateValue(expectedValue);
            
            // Parse expected value
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

    /**
     * Validates JSON path value contains expected text
     * Example: Then the response JSON path "$.message" should contain "success"
     */
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

    /**
     * Validates JSON path array length
     * Example: Then the response JSON path "$.items" should have 5 elements
     */
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

    /**
     * Validates response against JSON schema
     * Example: Then the response should match schema "user-schema.json"
     */
    @CSBDDStepDef("the response should match schema {string}")
    async validateJSONSchema(schemaFile: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateJSONSchema', { schemaFile });
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            // Load schema
            const schemaPath = await this.resolveSchemaPath(schemaFile);
            const schemaContent = await FileUtils.readFile(schemaPath);
            const schema = JSON.parse(schemaContent.toString());
            
            // Validate
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

    /**
     * Validates response header exists
     * Example: Then the response should have header "Content-Type"
     */
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

    /**
     * Validates response header value
     * Example: Then the response header "Content-Type" should equal "application/json"
     */
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

    /**
     * Validates response header contains value
     * Example: Then the response header "Content-Type" should contain "json"
     */
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

    /**
     * Validates response time
     * Example: Then the response time should be less than 2000 ms
     */
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

    /**
     * Validates XML response with XPath
     * Example: Then the XML response path "//user/name" should equal "John"
     */
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

    /**
     * Validates response is empty
     * Example: Then the response body should be empty
     */
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

    /**
     * Validates response matches regex pattern
     * Example: Then the response body should match pattern "^[A-Z0-9]+$"
     */
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

    /**
     * Validates JSON response against inline schema
     * Example: Then the response should match JSON schema:
     *   """json
     *   {
     *     "type": "object",
     *     "required": ["id", "name"]
     *   }
     *   """
     */
    @CSBDDStepDef("the response should match JSON schema:")
    async validateInlineJSONSchema(schemaJson: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('validateInlineJSONSchema', {});
        
        try {
            const response = this.getLastResponse();
            const jsonBody = this.parseResponseAsJSON(response);
            
            // Parse schema
            let schema: any;
            try {
                schema = JSON.parse(schemaJson);
            } catch (error) {
                throw new Error(`Invalid JSON schema: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // Validate
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
     * Helper method to parse response as JSON
     */
    private parseResponseAsJSON(response: any): any {
        const bodyText = this.getResponseBodyAsString(response);
        
        try {
            return JSON.parse(bodyText);
        } catch (error) {
            throw new Error(`Failed to parse response as JSON: ${error instanceof Error ? error.message : String(error)}. Body: ${bodyText.substring(0, 200)}...`);
        }
    }

    /**
     * Helper method to parse expected values
     */
    private parseExpectedValue(value: string): any {
        // Try to parse as JSON first
        try {
            return JSON.parse(value);
        } catch {
            // Check for special values
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (value === 'null') return null;
            if (value === 'undefined') return undefined;
            
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
     * Helper method to resolve schema paths
     */
    private async resolveSchemaPath(schemaFile: string): Promise<string> {
        const path = await import('path');
        if (path.isAbsolute(schemaFile)) {
            return schemaFile;
        }
        
        // Try schema directory
        const schemaPath = ConfigurationManager.get('SCHEMA_PATH', './test-data/schemas');
        const resolvedPath = path.join(schemaPath, schemaFile);
        
        if (await FileUtils.exists(resolvedPath)) {
            return resolvedPath;
        }
        
        // Try test data directory
        const testDataPath = ConfigurationManager.get('TEST_DATA_PATH', './test-data');
        const testDataResolvedPath = path.join(testDataPath, 'schemas', schemaFile);
        
        if (await FileUtils.exists(testDataResolvedPath)) {
            return testDataResolvedPath;
        }
        
        // Try relative to project root
        if (await FileUtils.exists(schemaFile)) {
            return schemaFile;
        }
        
        throw new Error(`Schema file not found: ${schemaFile}`);
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