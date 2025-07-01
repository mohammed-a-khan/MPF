// src/api/validators/StatusCodeValidator.ts
import { ValidationResult } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class StatusCodeValidator {
  
  public validate(actual: number, expected: number): ValidationResult {
    const valid = actual === expected;
    
    if (!valid) {
      ActionLogger.logDebug(`Status code validation failed: expected ${expected}, got ${actual}`);
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'status',
        expected,
        actual,
        message: `Expected status code ${expected}, but got ${actual}`,
        type: 'status'
      }]
    };
  }

  public validateRange(actual: number, min: number, max: number): ValidationResult {
    const valid = actual >= min && actual <= max;
    
    if (!valid) {
      ActionLogger.logDebug(`Status code range validation failed: expected ${min}-${max}, got ${actual}`);
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'status',
        expected: `${min}-${max}`,
        actual,
        message: `Expected status code between ${min} and ${max}, but got ${actual}`,
        type: 'status'
      }]
    };
  }

  public validateOneOf(actual: number, expectedValues: number[]): ValidationResult {
    const valid = expectedValues.includes(actual);
    
    if (!valid) {
      ActionLogger.logDebug(`Status code oneOf validation failed: expected one of [${expectedValues.join(', ')}], got ${actual}`);
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'status',
        expected: expectedValues,
        actual,
        message: `Expected status code to be one of [${expectedValues.join(', ')}], but got ${actual}`,
        type: 'status'
      }]
    };
  }

  public validateNotOneOf(actual: number, excludedValues: number[]): ValidationResult {
    const valid = !excludedValues.includes(actual);
    
    if (!valid) {
      ActionLogger.logDebug(`Status code notOneOf validation failed: expected not to be one of [${excludedValues.join(', ')}], got ${actual}`);
    }
    
    return {
      valid,
      errors: valid ? [] : [{
        path: 'status',
        expected: `not one of [${excludedValues.join(', ')}]`,
        actual,
        message: `Expected status code not to be one of [${excludedValues.join(', ')}], but got ${actual}`,
        type: 'status'
      }]
    };
  }

  public validateSuccess(actual: number): ValidationResult {
    return this.validateRange(actual, 200, 299);
  }

  public validateClientError(actual: number): ValidationResult {
    return this.validateRange(actual, 400, 499);
  }

  public validateServerError(actual: number): ValidationResult {
    return this.validateRange(actual, 500, 599);
  }

  public validateRedirect(actual: number): ValidationResult {
    return this.validateRange(actual, 300, 399);
  }

  public validateInformational(actual: number): ValidationResult {
    return this.validateRange(actual, 100, 199);
  }

  public getStatusCategory(statusCode: number): string {
    if (statusCode >= 100 && statusCode < 200) return 'Informational';
    if (statusCode >= 200 && statusCode < 300) return 'Success';
    if (statusCode >= 300 && statusCode < 400) return 'Redirection';
    if (statusCode >= 400 && statusCode < 500) return 'Client Error';
    if (statusCode >= 500 && statusCode < 600) return 'Server Error';
    return 'Unknown';
  }

  public getStatusMessage(statusCode: number): string {
    const statusMessages: Record<number, string> = {
      // 1xx Informational
      100: 'Continue',
      101: 'Switching Protocols',
      102: 'Processing',
      103: 'Early Hints',
      
      // 2xx Success
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      203: 'Non-Authoritative Information',
      204: 'No Content',
      205: 'Reset Content',
      206: 'Partial Content',
      207: 'Multi-Status',
      208: 'Already Reported',
      226: 'IM Used',
      
      // 3xx Redirection
      300: 'Multiple Choices',
      301: 'Moved Permanently',
      302: 'Found',
      303: 'See Other',
      304: 'Not Modified',
      305: 'Use Proxy',
      307: 'Temporary Redirect',
      308: 'Permanent Redirect',
      
      // 4xx Client Error
      400: 'Bad Request',
      401: 'Unauthorized',
      402: 'Payment Required',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      406: 'Not Acceptable',
      407: 'Proxy Authentication Required',
      408: 'Request Timeout',
      409: 'Conflict',
      410: 'Gone',
      411: 'Length Required',
      412: 'Precondition Failed',
      413: 'Payload Too Large',
      414: 'URI Too Long',
      415: 'Unsupported Media Type',
      416: 'Range Not Satisfiable',
      417: 'Expectation Failed',
      418: "I'm a teapot",
      421: 'Misdirected Request',
      422: 'Unprocessable Entity',
      423: 'Locked',
      424: 'Failed Dependency',
      425: 'Too Early',
      426: 'Upgrade Required',
      428: 'Precondition Required',
      429: 'Too Many Requests',
      431: 'Request Header Fields Too Large',
      451: 'Unavailable For Legal Reasons',
      
      // 5xx Server Error
      500: 'Internal Server Error',
      501: 'Not Implemented',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
      505: 'HTTP Version Not Supported',
      506: 'Variant Also Negotiates',
      507: 'Insufficient Storage',
      508: 'Loop Detected',
      510: 'Not Extended',
      511: 'Network Authentication Required'
    };
    
    return statusMessages[statusCode] || 'Unknown Status';
  }

  public validateWithCustomMessage(
    actual: number,
    expected: number | number[] | { min: number; max: number },
    customMessage?: string
  ): ValidationResult {
    let result: ValidationResult;
    
    if (typeof expected === 'number') {
      result = this.validate(actual, expected);
    } else if (Array.isArray(expected)) {
      result = this.validateOneOf(actual, expected);
    } else {
      result = this.validateRange(actual, expected.min, expected.max);
    }
    
    if (!result.valid && customMessage && result.errors && result.errors.length > 0 && result.errors[0]) {
      result.errors[0].message = customMessage;
    }
    
    return result;
  }

  public createExpectation(config: {
    success?: boolean;
    clientError?: boolean;
    serverError?: boolean;
    redirect?: boolean;
    informational?: boolean;
    specific?: number | number[];
    range?: { min: number; max: number };
    not?: number | number[];
  }): (actual: number) => ValidationResult {
    return (actual: number) => {
      if (config.specific !== undefined) {
        if (Array.isArray(config.specific)) {
          return this.validateOneOf(actual, config.specific);
        }
        return this.validate(actual, config.specific);
      }
      
      if (config.range) {
        return this.validateRange(actual, config.range.min, config.range.max);
      }
      
      if (config.not !== undefined) {
        if (Array.isArray(config.not)) {
          return this.validateNotOneOf(actual, config.not);
        }
        return this.validateNotOneOf(actual, [config.not]);
      }
      
      if (config.success) return this.validateSuccess(actual);
      if (config.clientError) return this.validateClientError(actual);
      if (config.serverError) return this.validateServerError(actual);
      if (config.redirect) return this.validateRedirect(actual);
      if (config.informational) return this.validateInformational(actual);
      
      return { valid: true, errors: [] };
    };
  }
}