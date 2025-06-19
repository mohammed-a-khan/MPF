// src/api/validators/BodyValidator.ts
import { ValidationResult, ValidationError } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as crypto from 'crypto';

export class BodyValidator {
  
  public validateContains(body: string, substring: string): ValidationResult {
    const valid = body.includes(substring);
    
    if (!valid) {
      ActionLogger.logDebug('Body contains validation failed', {
        searchString: substring,
        bodyLength: body.length
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'body',
        expected: `contain '${substring}'`,
        actual: body.length > 100 ? body.substring(0, 100) + '...' : body,
        message: `Expected body to contain '${substring}'`,
        type: 'body'
      }]
    };
  }

  public validateNotContains(body: string, substring: string): ValidationResult {
    const valid = !body.includes(substring);
    
    if (!valid) {
      ActionLogger.logDebug('Body not contains validation failed', {
        searchString: substring
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'body',
        expected: `not contain '${substring}'`,
        actual: 'found in body',
        message: `Expected body not to contain '${substring}'`,
        type: 'body'
      }]
    };
  }

  public validateEquals(body: any, expected: any): ValidationResult {
    const bodyStr = this.normalizeBody(body);
    const expectedStr = this.normalizeBody(expected);
    const valid = bodyStr === expectedStr;
    
    if (!valid) {
      ActionLogger.logDebug('Body equals validation failed', {
        expectedLength: expectedStr.length,
        actualLength: bodyStr.length
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'body',
        expected: expectedStr.length > 100 ? expectedStr.substring(0, 100) + '...' : expectedStr,
        actual: bodyStr.length > 100 ? bodyStr.substring(0, 100) + '...' : bodyStr,
        message: 'Body does not match expected value',
        type: 'body'
      }]
    };
  }

  public validatePattern(body: string, pattern: RegExp): ValidationResult {
    const valid = pattern.test(body);
    
    if (!valid) {
      ActionLogger.logDebug('Body pattern validation failed', {
        pattern: pattern.toString()
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'body',
        expected: `match pattern ${pattern}`,
        actual: body.length > 100 ? body.substring(0, 100) + '...' : body,
        message: `Expected body to match pattern ${pattern}`,
        type: 'body'
      }]
    };
  }

  public validateLength(body: string, expectedLength: number, operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' = 'eq'): ValidationResult {
    const actualLength = body.length;
    let valid: boolean;
    let expectedDescription: string;
    
    switch (operator) {
      case 'eq':
        valid = actualLength === expectedLength;
        expectedDescription = `equal to ${expectedLength}`;
        break;
      case 'gt':
        valid = actualLength > expectedLength;
        expectedDescription = `greater than ${expectedLength}`;
        break;
      case 'gte':
        valid = actualLength >= expectedLength;
        expectedDescription = `greater than or equal to ${expectedLength}`;
        break;
      case 'lt':
        valid = actualLength < expectedLength;
        expectedDescription = `less than ${expectedLength}`;
        break;
      case 'lte':
        valid = actualLength <= expectedLength;
        expectedDescription = `less than or equal to ${expectedLength}`;
        break;
    }
    
    if (!valid) {
      ActionLogger.logDebug('Body length validation failed', {
        expected: expectedLength,
        actual: actualLength,
        operator
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'body.length',
        expected: expectedDescription,
        actual: actualLength,
        message: `Expected body length to be ${expectedDescription}, but got ${actualLength}`,
        type: 'body'
      }]
    };
  }

  public validateJSON(body: any, expected: any): ValidationResult {
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return {
          valid: false,
          errors: [{
            path: 'body',
            expected: 'valid JSON',
            actual: 'invalid JSON',
            message: `Failed to parse body as JSON: ${(error as Error).message}`,
            type: 'body'
          }]
        };
      }
    }
    
    const differences = this.findJSONDifferences(expected, body);
    
    if (differences.length > 0) {
      ActionLogger.logDebug('JSON validation failed', {
        differenceCount: differences.length
      });
    }
    
    return {
      valid: differences.length === 0,
      errors: differences
    };
  }

  public validateJSONStructure(body: any, structure: any): ValidationResult {
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return {
          valid: false,
          errors: [{
            path: 'body',
            expected: 'valid JSON',
            actual: 'invalid JSON',
            message: `Failed to parse body as JSON: ${(error as Error).message}`,
            type: 'body'
          }]
        };
      }
    }
    
    const errors = this.validateStructure(body, structure, 'body');
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  public validateNotEmpty(body: any): ValidationResult {
    let isEmpty = false;
    
    if (body === null || body === undefined) {
      isEmpty = true;
    } else if (typeof body === 'string' && body.trim() === '') {
      isEmpty = true;
    } else if (Array.isArray(body) && body.length === 0) {
      isEmpty = true;
    } else if (typeof body === 'object' && Object.keys(body).length === 0) {
      isEmpty = true;
    }
    
    return {
      valid: !isEmpty,
      errors: isEmpty ? [{
        path: 'body',
        expected: 'not empty',
        actual: 'empty',
        message: 'Expected body not to be empty',
        type: 'body'
      }] : []
    };
  }

  public validateChecksum(body: string | Buffer, expectedChecksum: string, algorithm: string = 'sha256'): ValidationResult {
    const actualChecksum = crypto
      .createHash(algorithm)
      .update(body)
      .digest('hex');
    
    const valid = actualChecksum === expectedChecksum;
    
    if (!valid) {
      ActionLogger.logDebug('Checksum validation failed', {
        algorithm,
        expected: expectedChecksum,
        actual: actualChecksum
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'body.checksum',
        expected: expectedChecksum,
        actual: actualChecksum,
        message: `Expected ${algorithm} checksum to be '${expectedChecksum}', but got '${actualChecksum}'`,
        type: 'body'
      }]
    };
  }

  public validateBase64(body: string): ValidationResult {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    
    if (!base64Regex.test(body)) {
      return {
        valid: false,
        errors: [{
          path: 'body',
          expected: 'valid base64',
          actual: 'invalid base64',
          message: 'Body is not valid base64',
          type: 'body'
        }]
      };
    }
    
    try {
      Buffer.from(body, 'base64');
      return { valid: true, errors: [] };
    } catch {
      return {
        valid: false,
        errors: [{
          path: 'body',
          expected: 'valid base64',
          actual: 'invalid base64',
          message: 'Body is not valid base64',
          type: 'body'
        }]
      };
    }
  }

  public validateJWT(body: string): ValidationResult {
    const parts = body.split('.');
    
    if (parts.length !== 3) {
      return {
        valid: false,
        errors: [{
          path: 'body',
          expected: 'valid JWT (3 parts)',
          actual: `${parts.length} parts`,
          message: `Expected JWT to have 3 parts, but got ${parts.length}`,
          type: 'body'
        }]
      };
    }
    
    try {
      const headerPart = parts[0];
      const payloadPart = parts[1];
      
      if (!headerPart || !payloadPart) {
        return {
          valid: false,
          errors: [{
            path: 'body.jwt',
            expected: 'valid JWT with header and payload',
            actual: body,
            message: 'JWT missing header or payload parts',
            type: 'body'
          }]
        };
      }
      
      const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
      // Payload parsing is handled in validateJWTClaims method when needed
      
      if (!header.alg || !header.typ) {
        return {
          valid: false,
          errors: [{
            path: 'body.jwt.header',
            expected: 'alg and typ fields',
            actual: JSON.stringify(header),
            message: 'JWT header missing required fields',
            type: 'body'
          }]
        };
      }
      
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          path: 'body',
          expected: 'valid JWT',
          actual: 'invalid JWT',
          message: `Invalid JWT format: ${(error as Error).message}`,
          type: 'body'
        }]
      };
    }
  }

  public validateJWTClaims(body: string, expectedClaims: Record<string, any>): ValidationResult {
    const jwtResult = this.validateJWT(body);
    if (!jwtResult.valid) {
      return jwtResult;
    }
    
    try {
      const jwtParts = body.split('.');
      const payloadPart = jwtParts[1];
      
      if (!payloadPart) {
        return {
          valid: false,
          errors: [{
            path: 'body.jwt.payload',
            expected: 'valid JWT payload',
            actual: body,
            message: 'JWT missing payload part',
            type: 'body'
          }]
        };
      }
      
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
      const errors: ValidationError[] = [];
      
      for (const [claim, expectedValue] of Object.entries(expectedClaims)) {
        if (claim === 'exp' || claim === 'iat' || claim === 'nbf') {
          // Time-based claims
          const actualValue = payload[claim];
          if (actualValue === undefined) {
            errors.push({
              path: `body.jwt.${claim}`,
              expected: expectedValue,
              actual: 'undefined',
              message: `JWT missing required claim '${claim}'`,
              type: 'body'
            });
          } else if (typeof expectedValue === 'string' && expectedValue.startsWith('>')) {
            const threshold = parseInt(expectedValue.substring(1));
            if (actualValue <= threshold) {
              errors.push({
                path: `body.jwt.${claim}`,
                expected: `> ${threshold}`,
                actual: actualValue,
                message: `JWT claim '${claim}' should be greater than ${threshold}`,
                type: 'body'
              });
            }
          } else if (actualValue !== expectedValue) {
            errors.push({
              path: `body.jwt.${claim}`,
              expected: expectedValue,
              actual: actualValue,
              message: `JWT claim '${claim}' mismatch`,
              type: 'body'
            });
          }
        } else {
          // Regular claims
          const actualValue = payload[claim];
          if (this.deepEqual(actualValue, expectedValue) === false) {
            errors.push({
              path: `body.jwt.${claim}`,
              expected: expectedValue,
              actual: actualValue,
              message: `JWT claim '${claim}' mismatch`,
              type: 'body'
            });
          }
        }
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{
          path: 'body.jwt',
          expected: 'valid JWT claims',
          actual: 'error',
          message: `Failed to validate JWT claims: ${(error as Error).message}`,
          type: 'body'
        }]
      };
    }
  }

  private normalizeBody(body: any): string {
    if (typeof body === 'string') {
      return body;
    }
    if (Buffer.isBuffer(body)) {
      return body.toString();
    }
    if (typeof body === 'object') {
      return JSON.stringify(body);
    }
    return String(body);
  }

  private findJSONDifferences(expected: any, actual: any, path: string = 'body'): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (typeof expected !== typeof actual) {
      errors.push({
        path,
        expected: typeof expected,
        actual: typeof actual,
        message: `Type mismatch at ${path}`,
        type: 'body'
      });
      return errors;
    }
    
    if (expected === null || expected === undefined) {
      if (expected !== actual) {
        errors.push({
          path,
          expected,
          actual,
          message: `Value mismatch at ${path}`,
          type: 'body'
        });
      }
      return errors;
    }
    
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) {
        errors.push({
          path,
          expected: 'array',
          actual: typeof actual,
          message: `Expected array at ${path}`,
          type: 'body'
        });
        return errors;
      }
      
      if (expected.length !== actual.length) {
        errors.push({
          path: `${path}.length`,
          expected: expected.length,
          actual: actual.length,
          message: `Array length mismatch at ${path}`,
          type: 'body'
        });
      }
      
      const minLength = Math.min(expected.length, actual.length);
      for (let i = 0; i < minLength; i++) {
        errors.push(...this.findJSONDifferences(expected[i], actual[i], `${path}[${i}]`));
      }
    } else if (typeof expected === 'object') {
      if (typeof actual !== 'object' || actual === null) {
        errors.push({
          path,
          expected: 'object',
          actual: actual === null ? 'null' : typeof actual,
          message: `Expected object at ${path}`,
          type: 'body'
        });
        return errors;
      }
      
      // Check for missing keys in actual
      for (const key of Object.keys(expected)) {
        if (!(key in actual)) {
          errors.push({
            path: `${path}.${key}`,
            expected: expected[key],
            actual: 'undefined',
            message: `Missing key '${key}' at ${path}`,
            type: 'body'
          });
        } else {
          errors.push(...this.findJSONDifferences(expected[key], actual[key], `${path}.${key}`));
        }
      }
      
      // Check for extra keys in actual
      for (const key of Object.keys(actual)) {
        if (!(key in expected)) {
          errors.push({
            path: `${path}.${key}`,
            expected: 'undefined',
            actual: actual[key],
            message: `Unexpected key '${key}' at ${path}`,
            type: 'body'
          });
        }
      }
    } else {
      // Primitive values
      if (expected !== actual) {
        errors.push({
          path,
          expected,
          actual,
          message: `Value mismatch at ${path}`,
          type: 'body'
        });
      }
    }
    
    return errors;
  }

  private validateStructure(data: any, structure: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (structure === '?') {
      // Any value is allowed
      return errors;
    }
    
    if (typeof structure === 'string') {
      if (structure.startsWith('type:')) {
        const expectedType = structure.substring(5);
        const actualType = Array.isArray(data) ? 'array' : typeof data;
        
        if (actualType !== expectedType) {
          errors.push({
            path,
            expected: expectedType,
            actual: actualType,
            message: `Expected type '${expectedType}' at ${path}`,
            type: 'body'
          });
        }
      }
      return errors;
    }
    
    if (Array.isArray(structure)) {
      if (!Array.isArray(data)) {
        errors.push({
          path,
          expected: 'array',
          actual: typeof data,
          message: `Expected array at ${path}`,
          type: 'body'
        });
        return errors;
      }
      
      if (structure.length > 0) {
        // Validate each item against the first structure element
        const itemStructure = structure[0];
        data.forEach((item, index) => {
          errors.push(...this.validateStructure(item, itemStructure, `${path}[${index}]`));
        });
      }
    } else if (typeof structure === 'object' && structure !== null) {
      if (typeof data !== 'object' || data === null) {
        errors.push({
          path,
          expected: 'object',
          actual: data === null ? 'null' : typeof data,
          message: `Expected object at ${path}`,
          type: 'body'
        });
        return errors;
      }
      
      for (const [key, value] of Object.entries(structure)) {
        if (key.endsWith('?')) {
          // Optional field
          const actualKey = key.slice(0, -1);
          if (actualKey in data) {
            errors.push(...this.validateStructure(data[actualKey], value, `${path}.${actualKey}`));
          }
        } else {
          // Required field
          if (!(key in data)) {
            errors.push({
              path: `${path}.${key}`,
              expected: 'field to exist',
              actual: 'undefined',
              message: `Missing required field '${key}' at ${path}`,
              type: 'body'
            });
          } else {
            errors.push(...this.validateStructure(data[key], value, `${path}.${key}`));
          }
        }
      }
    }
    
    return errors;
  }

  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((item, index) => this.deepEqual(item, b[index]));
      } else {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        
        if (keysA.length !== keysB.length) return false;
        
        return keysA.every(key => keysB.includes(key) && this.deepEqual(a[key], b[key]));
      }
    }
    
    return false;
  }

  public createBodyExpectation(config: {
    contains?: string | string[];
    notContains?: string | string[];
    equals?: any;
    pattern?: RegExp;
    length?: { value: number; operator?: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' };
    json?: any;
    structure?: any;
    notEmpty?: boolean;
    checksum?: { value: string; algorithm?: string };
    base64?: boolean;
    jwt?: boolean | Record<string, any>;
  }): (body: any) => ValidationResult {
    return (body: any) => {
      const errors: ValidationError[] = [];
      const bodyStr = this.normalizeBody(body);
      
      // Check contains
      if (config.contains) {
        const searchStrings = Array.isArray(config.contains) ? config.contains : [config.contains];
        for (const str of searchStrings) {
          const result = this.validateContains(bodyStr, str);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      // Check not contains
      if (config.notContains) {
        const searchStrings = Array.isArray(config.notContains) ? config.notContains : [config.notContains];
        for (const str of searchStrings) {
          const result = this.validateNotContains(bodyStr, str);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      // Check equals
      if (config.equals !== undefined) {
        const result = this.validateEquals(body, config.equals);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check pattern
      if (config.pattern) {
        const result = this.validatePattern(bodyStr, config.pattern);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check length
      if (config.length) {
        const result = this.validateLength(bodyStr, config.length.value, config.length.operator);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check JSON
      if (config.json !== undefined) {
        const result = this.validateJSON(body, config.json);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check structure
      if (config.structure) {
        const result = this.validateJSONStructure(body, config.structure);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check not empty
      if (config.notEmpty) {
        const result = this.validateNotEmpty(body);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check checksum
      if (config.checksum) {
        const result = this.validateChecksum(bodyStr, config.checksum.value, config.checksum.algorithm);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check base64
      if (config.base64) {
        const result = this.validateBase64(bodyStr);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      // Check JWT
      if (config.jwt) {
        if (config.jwt === true) {
          const result = this.validateJWT(bodyStr);
          if (!result.valid && result.errors) errors.push(...result.errors);
        } else {
          const result = this.validateJWTClaims(bodyStr, config.jwt);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    };
  }
}