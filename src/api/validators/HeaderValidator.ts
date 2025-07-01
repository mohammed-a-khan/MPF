// src/api/validators/HeaderValidator.ts
import { ValidationResult, ValidationError } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class HeaderValidator {
  
  public validateHeader(
    headers: Record<string, string | string[]>,
    name: string,
    expectedValue: string
  ): ValidationResult {
    const actualValue = this.getHeaderValue(headers, name);
    const valid = actualValue === expectedValue;
    
    if (!valid) {
      ActionLogger.logDebug(`Header validation failed: ${name}`, {
        expected: expectedValue,
        actual: actualValue
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: `headers.${name}`,
        expected: expectedValue,
        actual: actualValue || 'undefined',
        message: `Expected header '${name}' to be '${expectedValue}', but got '${actualValue || 'undefined'}'`,
        type: 'header'
      }]
    };
  }

  public validateHeaderExists(
    headers: Record<string, string | string[]>,
    name: string
  ): ValidationResult {
    const exists = this.hasHeader(headers, name);
    
    if (!exists) {
      ActionLogger.logDebug(`Header existence validation failed: ${name} not found`);
    }
    
    return {
      valid: exists,
      errors: exists ? [] : [{
        path: `headers.${name}`,
        expected: 'header to exist',
        actual: 'header not found',
        message: `Expected header '${name}' to exist`,
        type: 'header'
      }]
    };
  }

  public validateHeaderNotExists(
    headers: Record<string, string | string[]>,
    name: string
  ): ValidationResult {
    const exists = this.hasHeader(headers, name);
    
    if (exists) {
      ActionLogger.logDebug(`Header non-existence validation failed: ${name} found`);
    }
    
    return {
      valid: !exists,
      errors: !exists ? [] : [{
        path: `headers.${name}`,
        expected: 'header not to exist',
        actual: 'header found',
        message: `Expected header '${name}' not to exist`,
        type: 'header'
      }]
    };
  }

  public validateHeaderPattern(
    headers: Record<string, string | string[]>,
    name: string,
    pattern: RegExp
  ): ValidationResult {
    const value = this.getHeaderValue(headers, name);
    
    if (!value) {
      return {
        valid: false,
        errors: [{
          path: `headers.${name}`,
          expected: `match pattern ${pattern}`,
          actual: 'header not found',
          message: `Header '${name}' not found`,
          type: 'header'
        }]
      };
    }
    
    const valid = pattern.test(value);
    
    if (!valid) {
      ActionLogger.logDebug(`Header pattern validation failed: ${name}`, {
        pattern: pattern.toString(),
        actual: value
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: `headers.${name}`,
        expected: `match pattern ${pattern}`,
        actual: value,
        message: `Expected header '${name}' to match pattern ${pattern}, but got '${value}'`,
        type: 'header'
      }]
    };
  }

  public validateContentType(
    headers: Record<string, string | string[]>,
    expectedType: string
  ): ValidationResult {
    const contentType = this.getHeaderValue(headers, 'content-type');
    
    if (!contentType) {
      return {
        valid: false,
        errors: [{
          path: 'headers.content-type',
          expected: expectedType,
          actual: 'undefined',
          message: 'Content-Type header not found',
          type: 'header'
        }]
      };
    }
    
    const contentTypeParts = contentType.split(';');
    const firstPart = contentTypeParts[0];
    if (!firstPart) {
      return {
        valid: false,
        errors: [{
          path: 'headers.content-type',
          expected: expectedType,
          actual: contentType,
          message: 'Invalid content-type format',
          type: 'header'
        }]
      };
    }
    const actualType = firstPart.trim().toLowerCase();
    const expected = expectedType.toLowerCase();
    
    const valid = actualType === expected || 
                  (expected.endsWith('/*') && actualType.startsWith(expected.slice(0, -1)));
    
    if (!valid) {
      ActionLogger.logDebug('Content-Type validation failed', {
        expected: expectedType,
        actual: contentType
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'headers.content-type',
        expected: expectedType,
        actual: contentType,
        message: `Expected Content-Type '${expectedType}', but got '${contentType}'`,
        type: 'header'
      }]
    };
  }

  public validateHeaderContains(
    headers: Record<string, string | string[]>,
    name: string,
    substring: string
  ): ValidationResult {
    const value = this.getHeaderValue(headers, name);
    
    if (!value) {
      return {
        valid: false,
        errors: [{
          path: `headers.${name}`,
          expected: `contain '${substring}'`,
          actual: 'header not found',
          message: `Header '${name}' not found`,
          type: 'header'
        }]
      };
    }
    
    const valid = value.includes(substring);
    
    if (!valid) {
      ActionLogger.logDebug(`Header contains validation failed: ${name}`, {
        expected: substring,
        actual: value
      });
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: `headers.${name}`,
        expected: `contain '${substring}'`,
        actual: value,
        message: `Expected header '${name}' to contain '${substring}', but got '${value}'`,
        type: 'header'
      }]
    };
  }

  public validateHeaderStartsWith(
    headers: Record<string, string | string[]>,
    name: string,
    prefix: string
  ): ValidationResult {
    const value = this.getHeaderValue(headers, name);
    
    if (!value) {
      return {
        valid: false,
        errors: [{
          path: `headers.${name}`,
          expected: `start with '${prefix}'`,
          actual: 'header not found',
          message: `Header '${name}' not found`,
          type: 'header'
        }]
      };
    }
    
    const valid = value.startsWith(prefix);
    
    return {
      valid,
      errors: valid ? [] : [{
        path: `headers.${name}`,
        expected: `start with '${prefix}'`,
        actual: value,
        message: `Expected header '${name}' to start with '${prefix}', but got '${value}'`,
        type: 'header'
      }]
    };
  }

  public validateHeaderEndsWith(
    headers: Record<string, string | string[]>,
    name: string,
    suffix: string
  ): ValidationResult {
    const value = this.getHeaderValue(headers, name);
    
    if (!value) {
      return {
        valid: false,
        errors: [{
          path: `headers.${name}`,
          expected: `end with '${suffix}'`,
          actual: 'header not found',
          message: `Header '${name}' not found`,
          type: 'header'
        }]
      };
    }
    
    const valid = value.endsWith(suffix);
    
    return {
      valid,
      errors: valid ? [] : [{
        path: `headers.${name}`,
        expected: `end with '${suffix}'`,
        actual: value,
        message: `Expected header '${name}' to end with '${suffix}', but got '${value}'`,
        type: 'header'
      }]
    };
  }

  public validateMultipleHeaders(
    headers: Record<string, string | string[]>,
    expectations: Array<{ name: string; value?: string; pattern?: RegExp; exists?: boolean }>
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    for (const expectation of expectations) {
      let result: ValidationResult;
      
      if (expectation.value !== undefined) {
        result = this.validateHeader(headers, expectation.name, expectation.value);
      } else if (expectation.pattern) {
        result = this.validateHeaderPattern(headers, expectation.name, expectation.pattern);
      } else if (expectation.exists !== undefined) {
        result = expectation.exists 
          ? this.validateHeaderExists(headers, expectation.name)
          : this.validateHeaderNotExists(headers, expectation.name);
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

  public validateCacheControl(
    headers: Record<string, string | string[]>,
    expectations: {
      noCache?: boolean;
      noStore?: boolean;
      maxAge?: number;
      mustRevalidate?: boolean;
      private?: boolean;
      public?: boolean;
    }
  ): ValidationResult {
    const cacheControl = this.getHeaderValue(headers, 'cache-control');
    
    if (!cacheControl) {
      return {
        valid: false,
        errors: [{
          path: 'headers.cache-control',
          expected: 'cache-control header',
          actual: 'undefined',
          message: 'Cache-Control header not found',
          type: 'header'
        }]
      };
    }
    
    const directives = this.parseCacheControl(cacheControl);
    const errors: ValidationError[] = [];
    
    if (expectations.noCache !== undefined) {
      const hasNoCache = directives.has('no-cache');
      if (hasNoCache !== expectations.noCache) {
        errors.push({
          path: 'headers.cache-control',
          expected: expectations.noCache ? 'no-cache' : 'not no-cache',
          actual: cacheControl,
          message: `Expected Cache-Control ${expectations.noCache ? 'to contain' : 'not to contain'} 'no-cache'`,
          type: 'header'
        });
      }
    }
    
    if (expectations.noStore !== undefined) {
      const hasNoStore = directives.has('no-store');
      if (hasNoStore !== expectations.noStore) {
        errors.push({
          path: 'headers.cache-control',
          expected: expectations.noStore ? 'no-store' : 'not no-store',
          actual: cacheControl,
          message: `Expected Cache-Control ${expectations.noStore ? 'to contain' : 'not to contain'} 'no-store'`,
          type: 'header'
        });
      }
    }
    
    if (expectations.maxAge !== undefined) {
      const maxAge = directives.get('max-age');
      if (maxAge === undefined || parseInt(maxAge) !== expectations.maxAge) {
        errors.push({
          path: 'headers.cache-control',
          expected: `max-age=${expectations.maxAge}`,
          actual: maxAge ? `max-age=${maxAge}` : 'no max-age',
          message: `Expected Cache-Control max-age to be ${expectations.maxAge}`,
          type: 'header'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  public validateCORS(
    headers: Record<string, string | string[]>,
    expectations: {
      allowOrigin?: string | string[] | '*';
      allowMethods?: string[];
      allowHeaders?: string[];
      allowCredentials?: boolean;
      exposeHeaders?: string[];
      maxAge?: number;
    }
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (expectations.allowOrigin !== undefined) {
      const origin = this.getHeaderValue(headers, 'access-control-allow-origin');
      
      if (!origin) {
        errors.push({
          path: 'headers.access-control-allow-origin',
          expected: expectations.allowOrigin,
          actual: 'undefined',
          message: 'Access-Control-Allow-Origin header not found',
          type: 'header'
        });
      } else if (expectations.allowOrigin === '*') {
        if (origin !== '*') {
          errors.push({
            path: 'headers.access-control-allow-origin',
            expected: '*',
            actual: origin,
            message: `Expected Access-Control-Allow-Origin to be '*', but got '${origin}'`,
            type: 'header'
          });
        }
      } else if (Array.isArray(expectations.allowOrigin)) {
        if (!expectations.allowOrigin.includes(origin)) {
          errors.push({
            path: 'headers.access-control-allow-origin',
            expected: expectations.allowOrigin,
            actual: origin,
            message: `Expected Access-Control-Allow-Origin to be one of [${expectations.allowOrigin.join(', ')}], but got '${origin}'`,
            type: 'header'
          });
        }
      } else if (origin !== expectations.allowOrigin) {
        errors.push({
          path: 'headers.access-control-allow-origin',
          expected: expectations.allowOrigin,
          actual: origin,
          message: `Expected Access-Control-Allow-Origin to be '${expectations.allowOrigin}', but got '${origin}'`,
          type: 'header'
        });
      }
    }
    
    if (expectations.allowMethods) {
      const methods = this.getHeaderValue(headers, 'access-control-allow-methods');
      
      if (!methods) {
        errors.push({
          path: 'headers.access-control-allow-methods',
          expected: expectations.allowMethods,
          actual: 'undefined',
          message: 'Access-Control-Allow-Methods header not found',
          type: 'header'
        });
      } else {
        const actualMethods = methods.split(',').map(m => m.trim().toUpperCase());
        const expectedMethods = expectations.allowMethods.map(m => m.toUpperCase());
        
        for (const method of expectedMethods) {
          if (!actualMethods.includes(method)) {
            errors.push({
              path: 'headers.access-control-allow-methods',
              expected: method,
              actual: methods,
              message: `Expected Access-Control-Allow-Methods to include '${method}'`,
              type: 'header'
            });
          }
        }
      }
    }
    
    if (expectations.allowHeaders) {
      const allowHeaders = this.getHeaderValue(headers, 'access-control-allow-headers');
      
      if (!allowHeaders) {
        errors.push({
          path: 'headers.access-control-allow-headers',
          expected: expectations.allowHeaders,
          actual: 'undefined',
          message: 'Access-Control-Allow-Headers header not found',
          type: 'header'
        });
      } else {
        const actualHeaders = allowHeaders.toLowerCase().split(',').map(h => h.trim());
        const expectedHeaders = expectations.allowHeaders.map(h => h.toLowerCase());
        
        for (const header of expectedHeaders) {
          if (!actualHeaders.includes(header)) {
            errors.push({
              path: 'headers.access-control-allow-headers',
              expected: header,
              actual: allowHeaders,
              message: `Expected Access-Control-Allow-Headers to include '${header}'`,
              type: 'header'
            });
          }
        }
      }
    }
    
    if (expectations.allowCredentials !== undefined) {
      const credentials = this.getHeaderValue(headers, 'access-control-allow-credentials');
      const expectedValue = expectations.allowCredentials ? 'true' : 'false';
      
      if (credentials !== expectedValue) {
        errors.push({
          path: 'headers.access-control-allow-credentials',
          expected: expectedValue,
          actual: credentials || 'undefined',
          message: `Expected Access-Control-Allow-Credentials to be '${expectedValue}', but got '${credentials || 'undefined'}'`,
          type: 'header'
        });
      }
    }
    
    if (expectations.exposeHeaders) {
      const exposeHeaders = this.getHeaderValue(headers, 'access-control-expose-headers');
      
      if (!exposeHeaders) {
        errors.push({
          path: 'headers.access-control-expose-headers',
          expected: expectations.exposeHeaders,
          actual: 'undefined',
          message: 'Access-Control-Expose-Headers header not found',
          type: 'header'
        });
      } else {
        const actualHeaders = exposeHeaders.toLowerCase().split(',').map(h => h.trim());
        const expectedHeaders = expectations.exposeHeaders.map(h => h.toLowerCase());
        
        for (const header of expectedHeaders) {
          if (!actualHeaders.includes(header)) {
            errors.push({
              path: 'headers.access-control-expose-headers',
              expected: header,
              actual: exposeHeaders,
              message: `Expected Access-Control-Expose-Headers to include '${header}'`,
              type: 'header'
            });
          }
        }
      }
    }
    
    if (expectations.maxAge !== undefined) {
      const maxAge = this.getHeaderValue(headers, 'access-control-max-age');
      
      if (!maxAge) {
        errors.push({
          path: 'headers.access-control-max-age',
          expected: expectations.maxAge,
          actual: 'undefined',
          message: 'Access-Control-Max-Age header not found',
          type: 'header'
        });
      } else if (parseInt(maxAge) !== expectations.maxAge) {
        errors.push({
          path: 'headers.access-control-max-age',
          expected: expectations.maxAge,
          actual: maxAge,
          message: `Expected Access-Control-Max-Age to be '${expectations.maxAge}', but got '${maxAge}'`,
          type: 'header'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  public validateSecurityHeaders(
    headers: Record<string, string | string[]>,
    expectations: {
      strictTransportSecurity?: boolean | string;
      xContentTypeOptions?: boolean | string;
      xFrameOptions?: boolean | string;
      xXssProtection?: boolean | string;
      contentSecurityPolicy?: boolean | string;
      referrerPolicy?: boolean | string;
      permissionsPolicy?: boolean | string;
    }
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (expectations.strictTransportSecurity !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'strict-transport-security',
        expectations.strictTransportSecurity,
        'max-age='
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    if (expectations.xContentTypeOptions !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'x-content-type-options',
        expectations.xContentTypeOptions,
        'nosniff'
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    if (expectations.xFrameOptions !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'x-frame-options',
        expectations.xFrameOptions,
        'DENY'
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    if (expectations.xXssProtection !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'x-xss-protection',
        expectations.xXssProtection,
        '1; mode=block'
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    if (expectations.contentSecurityPolicy !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'content-security-policy',
        expectations.contentSecurityPolicy
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    if (expectations.referrerPolicy !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'referrer-policy',
        expectations.referrerPolicy
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    if (expectations.permissionsPolicy !== undefined) {
      const result = this.validateSecurityHeader(
        headers,
        'permissions-policy',
        expectations.permissionsPolicy
      );
      if (!result.valid && result.errors) errors.push(...result.errors);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateSecurityHeader(
    headers: Record<string, string | string[]>,
    headerName: string,
    expectation: boolean | string,
    defaultValue?: string
  ): ValidationResult {
    const value = this.getHeaderValue(headers, headerName);
    
    if (expectation === false) {
      return value ? {
        valid: false,
        errors: [{
          path: `headers.${headerName}`,
          expected: 'header not to exist',
          actual: value,
          message: `Expected header '${headerName}' not to exist`,
          type: 'header'
        }]
      } : { valid: true, errors: [] };
    }
    
    if (!value) {
      return {
        valid: false,
        errors: [{
          path: `headers.${headerName}`,
          expected: expectation === true ? defaultValue || 'header to exist' : expectation,
          actual: 'undefined',
          message: `Expected header '${headerName}' to exist`,
          type: 'header'
        }]
      };
    }
    
    if (typeof expectation === 'string' && value !== expectation) {
      return {
        valid: false,
        errors: [{
          path: `headers.${headerName}`,
          expected: expectation,
          actual: value,
          message: `Expected header '${headerName}' to be '${expectation}', but got '${value}'`,
          type: 'header'
        }]
      };
    }
    
    return { valid: true, errors: [] };
  }

  private getHeaderValue(headers: Record<string, string | string[]>, name: string): string | undefined {
    const lowerName = name.toLowerCase();
    
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerName) {
        return Array.isArray(value) ? value[0] : value;
      }
    }
    
    return undefined;
  }

  private hasHeader(headers: Record<string, string | string[]>, name: string): boolean {
    return this.getHeaderValue(headers, name) !== undefined;
  }

  private parseCacheControl(value: string): Map<string, string | undefined> {
    const directives = new Map<string, string | undefined>();
    const parts = value.split(',').map(p => p.trim());
    
    for (const part of parts) {
      const [directive, ...valueParts] = part.split('=');
      if (directive) {
        const directiveValue = valueParts.length > 0 ? valueParts.join('=') : undefined;
        directives.set(directive.toLowerCase(), directiveValue);
      }
    }
    
    return directives;
  }

  public createHeaderExpectation(config: {
    required?: string[];
    forbidden?: string[];
    exact?: Record<string, string>;
    patterns?: Record<string, RegExp>;
    contains?: Record<string, string>;
    cors?: Parameters<HeaderValidator['validateCORS']>[1];
    security?: Parameters<HeaderValidator['validateSecurityHeaders']>[1];
  }): (headers: Record<string, string | string[]>) => ValidationResult {
    return (headers: Record<string, string | string[]>) => {
      const errors: ValidationError[] = [];
      
      if (config.required) {
        for (const header of config.required) {
          const result = this.validateHeaderExists(headers, header);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      if (config.forbidden) {
        for (const header of config.forbidden) {
          const result = this.validateHeaderNotExists(headers, header);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      if (config.exact) {
        for (const [name, value] of Object.entries(config.exact)) {
          const result = this.validateHeader(headers, name, value);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      if (config.patterns) {
        for (const [name, pattern] of Object.entries(config.patterns)) {
          const result = this.validateHeaderPattern(headers, name, pattern);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      if (config.contains) {
        for (const [name, substring] of Object.entries(config.contains)) {
          const result = this.validateHeaderContains(headers, name, substring);
          if (!result.valid && result.errors) errors.push(...result.errors);
        }
      }
      
      if (config.cors) {
        const result = this.validateCORS(headers, config.cors);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      if (config.security) {
        const result = this.validateSecurityHeaders(headers, config.security);
        if (!result.valid && result.errors) errors.push(...result.errors);
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
    };
  }
}
