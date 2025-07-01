// src/api/validators/ResponseValidator.ts
import { Response, ValidationResult, ValidationError, ValidationConfig } from '../types/api.types';
import { StatusCodeValidator } from './StatusCodeValidator';
import { HeaderValidator } from './HeaderValidator';
import { BodyValidator } from './BodyValidator';
import { SchemaValidator } from './SchemaValidator';
import { JSONPathValidator } from './JSONPathValidator';
import { XMLValidator } from './XMLValidator';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class ResponseValidator {
  private statusCodeValidator: StatusCodeValidator;
  private headerValidator: HeaderValidator;
  private bodyValidator: BodyValidator;
  private schemaValidator: SchemaValidator;
  private jsonPathValidator: JSONPathValidator;
  private xmlValidator: XMLValidator;

  constructor() {
    this.statusCodeValidator = new StatusCodeValidator();
    this.headerValidator = new HeaderValidator();
    this.bodyValidator = new BodyValidator();
    this.schemaValidator = SchemaValidator.getInstance();
    this.jsonPathValidator = JSONPathValidator.getInstance();
    this.xmlValidator = XMLValidator.getInstance();
  }

  public async validate(response: Response, validations: ValidationConfig[]): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const startTime = Date.now();

    ActionLogger.logDebug(`Validating response with ${validations.length} validation rules`);

    for (const validation of validations) {
      try {
        const result = await this.executeValidation(response, validation);
        
        if (!result.valid && result.errors) {
          errors.push(...result.errors);
        }
        
        if (result.warnings) {
          warnings.push(...result.warnings);
        }
      } catch (error) {
        errors.push({
          path: validation.type,
          expected: 'validation to succeed',
          actual: 'validation error',
          message: `Validation failed: ${(error as Error).message}`,
          type: validation.type as any
        });
      }
    }

    const duration = Date.now() - startTime;
    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : []
    };

    ActionLogger.logDebug(`Response validation completed in ${duration}ms`, {
      valid: result.valid,
      errorCount: errors.length,
      warningCount: warnings.length
    });

    if (!result.valid) {
      ActionLogger.logError('Response validation failed', {
        errors: errors.map(e => ({
          path: e.path,
          message: e.message,
          type: e.type
        }))
      });
    }

    return result;
  }

  private async executeValidation(response: Response, validation: ValidationConfig): Promise<ValidationResult> {
    switch (validation.type) {
      case 'status':
        return this.validateStatus(response, validation.config);
      
      case 'header':
        return this.validateHeader(response, validation.config);
      
      case 'body':
        return this.validateBody(response, validation.config);
      
      case 'schema':
        return await this.validateSchema(response, validation.config);
      
      case 'jsonpath':
        return await this.validateJSONPath(response, validation.config);
      
      case 'xpath':
        return await this.validateXPath(response, validation.config);
      
      case 'regex':
        return this.validateRegex(response, validation.config);
      
      case 'custom':
        return this.validateCustom(response, validation.config);
      
      default:
        throw new Error(`Unknown validation type: ${validation.type}`);
    }
  }

  private validateStatus(response: Response, config: any): ValidationResult {
    if (typeof config === 'number') {
      return this.statusCodeValidator.validate(response.status, config);
    }
    
    if (config.min !== undefined && config.max !== undefined) {
      return this.statusCodeValidator.validateRange(response.status, config.min, config.max);
    }
    
    if (Array.isArray(config)) {
      return this.statusCodeValidator.validateOneOf(response.status, config);
    }
    
    throw new Error('Invalid status validation config');
  }

  private validateHeader(response: Response, config: any): ValidationResult {
    if (config.name && config.value !== undefined) {
      return this.headerValidator.validateHeader(response.headers, config.name, config.value);
    }
    
    if (config.name && config.exists !== undefined) {
      if (config.exists) {
        return this.headerValidator.validateHeaderExists(response.headers, config.name);
      } else {
        return this.headerValidator.validateHeaderNotExists(response.headers, config.name);
      }
    }
    
    if (config.name && config.pattern) {
      return this.headerValidator.validateHeaderPattern(response.headers, config.name, new RegExp(config.pattern));
    }
    
    if (config.contentType) {
      return this.headerValidator.validateContentType(response.headers, config.contentType);
    }
    
    throw new Error('Invalid header validation config');
  }

  private validateBody(response: Response, config: any): ValidationResult {
    if (config.contains) {
      return this.bodyValidator.validateContains(this.getBodyAsString(response), config.contains);
    }
    
    if (config.equals) {
      return this.bodyValidator.validateEquals(response.body, config.equals);
    }
    
    if (config.pattern) {
      return this.bodyValidator.validatePattern(this.getBodyAsString(response), new RegExp(config.pattern, config.flags));
    }
    
    if (config.length !== undefined) {
      return this.bodyValidator.validateLength(this.getBodyAsString(response), config.length, config.operator);
    }
    
    if (config.json) {
      return this.bodyValidator.validateJSON(response.body, config.json);
    }
    
    if (config.notEmpty) {
      return this.bodyValidator.validateNotEmpty(response.body);
    }
    
    throw new Error('Invalid body validation config');
  }

  private async validateSchema(response: Response, config: any): Promise<ValidationResult> {
    if (typeof config === 'string') {
      return await this.schemaValidator.validateSchema(response.body, config);
    }
    
    return await this.schemaValidator.validateSchema(response.body, config);
  }

  private async validateJSONPath(response: Response, config: any): Promise<ValidationResult> {
    if (config.path && config.value !== undefined) {
      return await this.jsonPathValidator.validatePath(response.body, config.path, config.value);
    }
    
    if (config.path && config.exists !== undefined) {
      const extracted = this.jsonPathValidator.extractValue(response.body, config.path);
      const exists = extracted !== undefined;
      const valid = exists === config.exists;
      return {
        valid,
        errors: valid ? [] : [{
          path: config.path,
          expected: config.exists ? 'value to exist' : 'value not to exist',
          actual: exists ? 'exists' : 'does not exist',
          message: `JSONPath ${config.path} existence check failed`,
          type: 'jsonpath'
        }]
      };
    }
    
    if (config.path && config.count !== undefined) {
      const result = this.jsonPathValidator.query(response.body, config.path);
      const count = result.values.length;
      const valid = count === config.count;
      return {
        valid,
        errors: valid ? [] : [{
          path: config.path,
          expected: config.count,
          actual: count,
          message: `JSONPath ${config.path} count check failed`,
          type: 'jsonpath'
        }]
      };
    }
    
    if (config.path && config.type) {
      const extracted = this.jsonPathValidator.extractValue(response.body, config.path);
      const actualType = typeof extracted;
      const valid = actualType === config.type;
      return {
        valid,
        errors: valid ? [] : [{
          path: config.path,
          expected: config.type,
          actual: actualType,
          message: `JSONPath ${config.path} type check failed`,
          type: 'jsonpath'
        }]
      };
    }
    
    if (config.paths) {
      return await this.validateMultipleJSONPaths(response.body, config.paths);
    }
    
    throw new Error('Invalid JSONPath validation config');
  }

  private async validateXPath(response: Response, config: any): Promise<ValidationResult> {
    const xmlString = this.getBodyAsString(response);
    
    if (config.xpath && config.value !== undefined) {
      return await this.xmlValidator.validateXPath(xmlString, config.xpath, config.value);
    }
    
    if (config.xpath && config.exists !== undefined) {
      try {
        const result = await this.xmlValidator.validateXPath(xmlString, config.xpath, '');
        const exists = !result.valid || result.errors?.some(error => 
          error.message?.includes('Expected') && !error.message?.includes('No matches found')
        ) || false;
        
        const valid = exists === config.exists;
        return {
          valid,
          errors: valid ? [] : [{
            path: config.xpath,
            expected: config.exists ? 'element to exist' : 'element not to exist',
            actual: exists ? 'exists' : 'does not exist',
            message: `XPath ${config.xpath} existence check failed`,
            type: 'xpath'
          }]
        };
      } catch (error) {
        return {
          valid: false,
          errors: [{
            path: config.xpath,
            expected: 'valid XPath',
            actual: 'invalid XPath',
            message: `XPath validation error: ${(error as Error).message}`,
            type: 'xpath'
          }]
        };
      }
    }
    
    if (config.xpath && config.count !== undefined) {
      return {
        valid: false,
        errors: [{
          path: config.xpath,
          expected: 'XPath count validation',
          actual: 'not implemented',
          message: 'XPath count validation not yet implemented',
          type: 'xpath'
        }]
      };
    }
    
    if (config.schema) {
      return await this.xmlValidator.validateSchema(xmlString, config.schema);
    }
    
    throw new Error('Invalid XPath validation config');
  }

  private validateRegex(response: Response, config: any): ValidationResult {
    const bodyString = this.getBodyAsString(response);
    const regex = new RegExp(config.pattern, config.flags);
    
    if (config.matches !== undefined) {
      const matches = bodyString.match(regex);
      const hasMatches = matches !== null && matches.length > 0;
      
      if (hasMatches !== config.matches) {
        return {
          valid: false,
          errors: [{
            path: 'body',
            expected: config.matches ? 'pattern to match' : 'pattern not to match',
            actual: hasMatches ? 'matched' : 'no match',
            message: `Pattern ${config.matches ? 'did not match' : 'matched'}: ${config.pattern}`,
            type: 'body'
          }]
        };
      }
    }
    
    if (config.count !== undefined) {
      const matches = bodyString.match(new RegExp(config.pattern, `g${config.flags || ''}`));
      const count = matches ? matches.length : 0;
      
      if (count !== config.count) {
        return {
          valid: false,
          errors: [{
            path: 'body',
            expected: config.count,
            actual: count,
            message: `Expected ${config.count} matches, found ${count}`,
            type: 'body'
          }]
        };
      }
    }
    
    return { valid: true, errors: [] };
  }

  private async validateCustom(response: Response, config: any): Promise<ValidationResult> {
    if (typeof config === 'function') {
      try {
        const result = await config(response);
        
        if (typeof result === 'boolean') {
          return {
            valid: result,
            errors: result ? [] : [{
              path: 'custom',
              expected: 'validation to pass',
              actual: 'validation failed',
              message: 'Custom validation failed',
              type: 'custom'
            }]
          };
        }
        
        return result;
      } catch (error) {
        return {
          valid: false,
          errors: [{
            path: 'custom',
            expected: 'validation to succeed',
            actual: 'validation error',
            message: `Custom validation error: ${(error as Error).message}`,
            type: 'custom'
          }]
        };
      }
    }
    
    throw new Error('Custom validation config must be a function');
  }

  private async validateMultipleJSONPaths(data: any, paths: Array<{path: string; value?: any; exists?: boolean}>): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    
    for (const pathConfig of paths) {
      let result: ValidationResult;
      
      if (pathConfig.value !== undefined) {
        result = await this.jsonPathValidator.validatePath(data, pathConfig.path, pathConfig.value);
      } else if (pathConfig.exists !== undefined) {
        const extracted = this.jsonPathValidator.extractValue(data, pathConfig.path);
        const exists = extracted !== undefined;
        const valid = exists === pathConfig.exists;
        result = {
          valid,
          errors: valid ? [] : [{
            path: pathConfig.path,
            expected: pathConfig.exists ? 'value to exist' : 'value not to exist',
            actual: exists ? 'exists' : 'does not exist',
            message: `JSONPath ${pathConfig.path} existence check failed`,
            type: 'jsonpath'
          }]
        };
      } else {
        continue;
      }
      
      if (!result.valid && result.errors) {
        errors.push(...result.errors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private getBodyAsString(response: Response): string {
    if (typeof response.body === 'string') {
      return response.body;
    }
    
    if (Buffer.isBuffer(response.body)) {
      return response.body.toString();
    }
    
    if (typeof response.body === 'object') {
      return JSON.stringify(response.body);
    }
    
    return String(response.body);
  }

  public createValidationChain(): ValidationChainBuilder {
    return new ValidationChainBuilder(this);
  }

  public async validateWithChain(response: Response, chain: ValidationChainBuilder): Promise<ValidationResult> {
    return chain.validate(response);
  }
}

export class ValidationChainBuilder {
  private validations: ValidationConfig[] = [];
  private validator: ResponseValidator;

  constructor(validator: ResponseValidator) {
    this.validator = validator;
  }

  public expectStatus(status: number | number[] | { min: number; max: number }): this {
    this.validations.push({
      type: 'status',
      config: status
    });
    return this;
  }

  public expectHeader(name: string, value?: string | RegExp): this {
    if (value instanceof RegExp) {
      this.validations.push({
        type: 'header',
        config: { name, pattern: value.source }
      });
    } else {
      this.validations.push({
        type: 'header',
        config: { name, value }
      });
    }
    return this;
  }

  public expectHeaderExists(name: string): this {
    this.validations.push({
      type: 'header',
      config: { name, exists: true }
    });
    return this;
  }

  public expectBodyContains(text: string): this {
    this.validations.push({
      type: 'body',
      config: { contains: text }
    });
    return this;
  }

  public expectJSONPath(path: string, value: any): this {
    this.validations.push({
      type: 'jsonpath',
      config: { path, value }
    });
    return this;
  }

  public expectSchema(schema: any): this {
    this.validations.push({
      type: 'schema',
      config: schema
    });
    return this;
  }

  public expectCustom(validator: (response: Response) => boolean | ValidationResult | Promise<boolean | ValidationResult>): this {
    this.validations.push({
      type: 'custom',
      config: validator
    });
    return this;
  }

  public async validate(response: Response): Promise<ValidationResult> {
    return this.validator.validate(response, this.validations);
  }
}
