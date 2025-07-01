// src/core/utils/ValidationUtils.ts
import { Logger } from './Logger';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

interface Schema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
  format?: string;
}

interface BusinessRule {
  name: string;
  description: string;
  validate: (data: any) => boolean | Promise<boolean>;
  errorMessage: string;
}

interface CountryFormats {
  phone: RegExp;
  postalCode: RegExp;
  taxId?: RegExp;
}

export class ValidationUtils {
  private static readonly logger = Logger.getInstance();

  private static readonly EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  private static readonly EMAIL_TLD_PATTERN = /\.[a-zA-Z]{2,}$/;
  private static readonly EMAIL_MAX_LENGTH = 254;

  private static readonly URL_PATTERN = /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i;
  private static readonly PROTOCOL_PATTERN = /^https?:\/\//i;
  private static readonly IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  private static readonly IPV6_PATTERN = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  private static readonly CREDIT_CARD_PATTERNS = {
    visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    mastercard: /^5[1-5][0-9]{14}$/,
    amex: /^3[47][0-9]{13}$/,
    discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    dinersClub: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
    jcb: /^(?:2131|1800|35\d{3})\d{11}$/,
    unionPay: /^(62[0-9]{14,17})$/
  };

  private static readonly COUNTRY_FORMATS: Record<string, CountryFormats> = {
    US: {
      phone: /^(\+?1)?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
      postalCode: /^\d{5}(-\d{4})?$/,
      taxId: /^\d{3}-?\d{2}-?\d{4}$/
    },
    UK: {
      phone: /^(\+?44|0)[\s.-]?(\d{2,5})[\s.-]?\d{3,4}[\s.-]?\d{3,4}$/,
      postalCode: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
      taxId: /^[A-Z]{2}\d{6}[A-Z]$/
    },
    IN: {
      phone: /^(\+?91|0)?[-.\s]?[6-9]\d{9}$/,
      postalCode: /^\d{6}$/,
      taxId: /^[A-Z]{5}\d{4}[A-Z]$/
    },
    CA: {
      phone: /^(\+?1)?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
      postalCode: /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i
    },
    AU: {
      phone: /^(\+?61|0)?[\s.-]?[2-478][\s.-]?\d{4}[\s.-]?\d{4}$/,
      postalCode: /^\d{4}$/,
      taxId: /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/
    },
    DE: {
      phone: /^(\+?49|0)?[\s.-]?\d{2,5}[\s.-]?\d{3,12}$/,
      postalCode: /^\d{5}$/,
      taxId: /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/
    },
    FR: {
      phone: /^(\+?33|0)?[\s.-]?[1-9][\s.-]?(\d{2}[\s.-]?){4}$/,
      postalCode: /^\d{5}$/
    },
    JP: {
      phone: /^(\+?81|0)?[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{4}$/,
      postalCode: /^\d{3}-?\d{4}$/
    },
    CN: {
      phone: /^(\+?86|0)?[\s.-]?1[3-9]\d{9}$/,
      postalCode: /^\d{6}$/
    },
    BR: {
      phone: /^(\+?55|0)?[\s.-]?\d{2}[\s.-]?9?\d{4}[\s.-]?\d{4}$/,
      postalCode: /^\d{5}-?\d{3}$/,
      taxId: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/
    }
  };

  private static readonly COMMON_PATTERNS = {
    alphanumeric: /^[a-zA-Z0-9]+$/,
    alphabetic: /^[a-zA-Z]+$/,
    numeric: /^\d+$/,
    decimal: /^\d+(\.\d+)?$/,
    hexadecimal: /^[0-9A-Fa-f]+$/,
    base64: /^[A-Za-z0-9+/]*={0,2}$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    username: /^[a-zA-Z0-9_-]{3,16}$/,
    password: {
      weak: /.{6,}/,
      medium: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      strong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    }
  };

  static isEmail(email: string): boolean {
    try {
      if (!email || typeof email !== 'string') {
        return false;
      }

      const trimmed = email.trim().toLowerCase();

      if (trimmed.length > this.EMAIL_MAX_LENGTH || trimmed.length < 3) {
        return false;
      }

      if (!this.EMAIL_PATTERN.test(trimmed)) {
        return false;
      }

      if (!this.EMAIL_TLD_PATTERN.test(trimmed)) {
        return false;
      }

      const atIndex = trimmed.lastIndexOf('@');
      if (atIndex === -1) {
        return false;
      }
      
      const local = trimmed.substring(0, atIndex);
      const domain = trimmed.substring(atIndex + 1);

      if (local.length > 64) {
        return false;
      }

      if (trimmed.includes('..')) {
        return false;
      }

      if (local.startsWith('.') || local.endsWith('.') || 
          domain.startsWith('.') || domain.endsWith('.') ||
          domain.startsWith('-') || domain.endsWith('-')) {
        return false;
      }

      this.logger.debug(`Email validation passed for: ${email}`);
      return true;
    } catch (error) {
      this.logger.error('Email validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isURL(url: string, options?: { requireProtocol?: boolean; protocols?: string[] }): boolean {
    try {
      if (!url || typeof url !== 'string') {
        return false;
      }

      const trimmed = url.trim();
      const requireProtocol = options?.requireProtocol ?? true;
      const allowedProtocols = options?.protocols || ['http', 'https', 'ftp'];

      let urlToValidate = trimmed;
      if (!this.PROTOCOL_PATTERN.test(trimmed) && !requireProtocol) {
        urlToValidate = `https://${trimmed}`;
      }

      try {
        const urlObj = new URL(urlToValidate);
        
        const protocol = urlObj.protocol.slice(0, -1);
        if (!allowedProtocols.includes(protocol)) {
          return false;
        }

        if (!urlObj.hostname || urlObj.hostname.length < 3) {
          return false;
        }

        if (urlObj.hostname.includes('..') || 
            urlObj.hostname.startsWith('.') || 
            urlObj.hostname.endsWith('.')) {
          return false;
        }
      } catch {
        if (!this.URL_PATTERN.test(urlToValidate)) {
          return false;
        }
      }

      this.logger.debug(`URL validation passed for: ${url}`);
      return true;
    } catch (error) {
      this.logger.error('URL validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isPhoneNumber(phone: string, country?: string): boolean {
    try {
      if (!phone || typeof phone !== 'string') {
        return false;
      }

      const cleaned = phone.replace(/[\s.-]/g, '');
      
      if (cleaned.length < 7 || cleaned.length > 20) {
        return false;
      }

      if (country) {
        const countryUpper = country.toUpperCase();
        const format = this.COUNTRY_FORMATS[countryUpper];
        
        if (format?.phone) {
          return format.phone.test(phone);
        }
      }

      const internationalPattern = /^\+?[1-9]\d{1,14}$/;
      if (internationalPattern.test(cleaned)) {
        this.logger.debug(`Phone validation passed for: ${phone}`);
        return true;
      }

      for (const [countryCode, format] of Object.entries(this.COUNTRY_FORMATS)) {
        if (format.phone.test(phone)) {
          this.logger.debug(`Phone validation passed for: ${phone} (detected country: ${countryCode})`);
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Phone validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isCreditCard(card: string): boolean {
    try {
      if (!card || typeof card !== 'string') {
        return false;
      }

      const cleaned = card.replace(/[\s-]/g, '');

      if (!/^\d+$/.test(cleaned)) {
        return false;
      }

      if (cleaned.length < 13 || cleaned.length > 19) {
        return false;
      }

      let cardType = null;
      for (const [type, pattern] of Object.entries(this.CREDIT_CARD_PATTERNS)) {
        if (pattern.test(cleaned)) {
          cardType = type;
          break;
        }
      }

      if (!cardType) {
        return false;
      }

      let sum = 0;
      let isEven = false;

      for (let i = cleaned.length - 1; i >= 0; i--) {
        let digit = parseInt(cleaned.charAt(i), 10);

        if (isEven) {
          digit *= 2;
          if (digit > 9) {
            digit -= 9;
          }
        }

        sum += digit;
        isEven = !isEven;
      }

      const isValid = sum % 10 === 0;
      if (isValid) {
        this.logger.debug(`Credit card validation passed for type: ${cardType}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error('Credit card validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isIPAddress(ip: string, version?: 4 | 6): boolean {
    try {
      if (!ip || typeof ip !== 'string') {
        return false;
      }

      const trimmed = ip.trim();

      if (version === 4) {
        return this.IP_PATTERN.test(trimmed);
      } else if (version === 6) {
        return this.IPV6_PATTERN.test(trimmed);
      } else {
        return this.IP_PATTERN.test(trimmed) || this.IPV6_PATTERN.test(trimmed);
      }
    } catch (error) {
      this.logger.error('IP address validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isPostalCode(code: string, country: string): boolean {
    try {
      if (!code || !country || typeof code !== 'string') {
        return false;
      }

      const countryUpper = country.toUpperCase();
      const format = this.COUNTRY_FORMATS[countryUpper];

      if (!format?.postalCode) {
        this.logger.warn(`No postal code format defined for country: ${country}`);
        return false;
      }

      return format.postalCode.test(code.trim());
    } catch (error) {
      this.logger.error('Postal code validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static matchesPattern(value: string, pattern: RegExp | string): boolean {
    try {
      if (!value || typeof value !== 'string') {
        return false;
      }

      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      return regex.test(value);
    } catch (error) {
      this.logger.error('Pattern matching error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static async validateSchema(data: any, schema: Schema): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      await this.validateValue(data, schema, '', errors, warnings);

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors
      };
      
      if (warnings.length > 0) {
        result.warnings = warnings;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Schema validation error:', error instanceof Error ? error : new Error(String(error)));
      errors.push(`Schema validation failed: ${(error as Error).message}`);
      const result: ValidationResult = {
        valid: false,
        errors
      };
      
      if (warnings.length > 0) {
        result.warnings = warnings;
      }
      
      return result;
    }
  }

  static async validateBusinessRule(data: any, rule: BusinessRule): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
      this.logger.debug(`Validating business rule: ${rule.name}`);
      
      const isValid = await rule.validate(data);
      
      if (!isValid) {
        errors.push(rule.errorMessage);
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      this.logger.error(`Business rule validation error for ${rule.name}:`, error instanceof Error ? error : new Error(String(error)));
      errors.push(`Business rule validation failed: ${(error as Error).message}`);
      return {
        valid: false,
        errors
      };
    }
  }

  static async validateBusinessRules(data: any, rules: BusinessRule[]): Promise<ValidationResult> {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const rule of rules) {
      const result = await this.validateBusinessRule(data, rule);
      allErrors.push(...result.errors);
      if (result.warnings) {
        allWarnings.push(...result.warnings);
      }
    }

    const result: ValidationResult = {
      valid: allErrors.length === 0,
      errors: allErrors
    };
    
    if (allWarnings.length > 0) {
      result.warnings = allWarnings;
    }
    
    return result;
  }

  private static async validateValue(
    value: any,
    schema: Schema,
    path: string,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    const currentPath = path || 'root';

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schema.type && value !== null && value !== undefined) {
      errors.push(`${currentPath}: Expected type ${schema.type}, got ${actualType}`);
      return;
    }

    if (value === null || value === undefined) {
      if (schema.required && schema.required.length > 0) {
        errors.push(`${currentPath}: Value is required`);
      }
      return;
    }

    switch (schema.type) {
      case 'string':
        await this.validateString(value, schema, currentPath, errors, warnings);
        break;
      case 'number':
        this.validateNumber(value, schema, currentPath, errors);
        break;
      case 'boolean':
        break;
      case 'object':
        await this.validateObject(value, schema, currentPath, errors, warnings);
        break;
      case 'array':
        await this.validateArray(value, schema, currentPath, errors, warnings);
        break;
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${currentPath}: Value must be one of: ${schema.enum.join(', ')}`);
    }
  }

  private static async validateString(
    value: string,
    schema: Schema,
    path: string,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: String length ${value.length} is less than minimum ${schema.minLength}`);
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: String length ${value.length} exceeds maximum ${schema.maxLength}`);
    }

    if (schema.pattern && !this.matchesPattern(value, schema.pattern)) {
      errors.push(`${path}: String does not match pattern ${schema.pattern}`);
    }

    if (schema.format) {
      switch (schema.format) {
        case 'email':
          if (!this.isEmail(value)) {
            errors.push(`${path}: Invalid email format`);
          }
          break;
        case 'url':
          if (!this.isURL(value)) {
            errors.push(`${path}: Invalid URL format`);
          }
          break;
        case 'ipv4':
          if (!this.isIPAddress(value, 4)) {
            errors.push(`${path}: Invalid IPv4 address`);
          }
          break;
        case 'ipv6':
          if (!this.isIPAddress(value, 6)) {
            errors.push(`${path}: Invalid IPv6 address`);
          }
          break;
        case 'uuid':
          if (!this.matchesPattern(value, this.COMMON_PATTERNS.uuid)) {
            errors.push(`${path}: Invalid UUID format`);
          }
          break;
        case 'date':
          if (isNaN(Date.parse(value))) {
            errors.push(`${path}: Invalid date format`);
          }
          break;
        case 'time':
          if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
            errors.push(`${path}: Invalid time format`);
          }
          break;
        case 'date-time':
          if (isNaN(Date.parse(value))) {
            errors.push(`${path}: Invalid date-time format`);
          }
          break;
        default:
          warnings.push(`${path}: Unknown format '${schema.format}'`);
      }
    }
  }

  private static validateNumber(
    value: number,
    schema: Schema,
    path: string,
    errors: string[]
  ): void {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${path}: Value ${value} is less than minimum ${schema.min}`);
    }

    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${path}: Value ${value} exceeds maximum ${schema.max}`);
    }
  }

  private static async validateObject(
    value: Record<string, any>,
    schema: Schema,
    path: string,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in value)) {
          errors.push(`${path}: Missing required property '${requiredProp}'`);
        }
      }
    }

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in value) {
          await this.validateValue(
            value[propName],
            propSchema,
            `${path}.${propName}`,
            errors,
            warnings
          );
        }
      }
    }
  }

  private static async validateArray(
    value: any[],
    schema: Schema,
    path: string,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: Array length ${value.length} is less than minimum ${schema.minLength}`);
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: Array length ${value.length} exceeds maximum ${schema.maxLength}`);
    }

    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        await this.validateValue(
          value[i],
          schema.items,
          `${path}[${i}]`,
          errors,
          warnings
        );
      }
    }
  }


  static isTaxId(taxId: string, country: string): boolean {
    try {
      if (!taxId || !country) {
        return false;
      }

      const countryUpper = country.toUpperCase();
      const format = this.COUNTRY_FORMATS[countryUpper];

      if (!format?.taxId) {
        this.logger.warn(`No tax ID format defined for country: ${country}`);
        return false;
      }

      return format.taxId.test(taxId.trim());
    } catch (error) {
      this.logger.error('Tax ID validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isUUID(uuid: string, version?: 1 | 3 | 4 | 5): boolean {
    try {
      if (!uuid || typeof uuid !== 'string') {
        return false;
      }

      const baseValid = this.COMMON_PATTERNS.uuid.test(uuid.toLowerCase());
      
      if (!baseValid) {
        return false;
      }

      if (version) {
        const versionChar = uuid.charAt(14);
        return versionChar === version.toString();
      }

      return true;
    } catch (error) {
      this.logger.error('UUID validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isBase64(value: string): boolean {
    try {
      if (!value || typeof value !== 'string') {
        return false;
      }

      if (!this.COMMON_PATTERNS.base64.test(value)) {
        return false;
      }

      const remainder = value.length % 4;
      if (remainder === 1) {
        return false;
      }

      try {
        const decoded = Buffer.from(value, 'base64').toString('base64');
        return decoded === value;
      } catch {
        return false;
      }
    } catch (error) {
      this.logger.error('Base64 validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isJSON(value: string): boolean {
    try {
      if (!value || typeof value !== 'string') {
        return false;
      }

      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  static isHexColor(color: string): boolean {
    try {
      if (!color || typeof color !== 'string') {
        return false;
      }

      return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    } catch (error) {
      this.logger.error('Hex color validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' | 'invalid' {
    try {
      if (!password || typeof password !== 'string') {
        return 'invalid';
      }

      if (this.COMMON_PATTERNS.password.strong.test(password)) {
        return 'strong';
      } else if (this.COMMON_PATTERNS.password.medium.test(password)) {
        return 'medium';
      } else if (this.COMMON_PATTERNS.password.weak.test(password)) {
        return 'weak';
      }

      return 'invalid';
    } catch (error) {
      this.logger.error('Password strength validation error:', error instanceof Error ? error : new Error(String(error)));
      return 'invalid';
    }
  }

  static isUsername(username: string): boolean {
    try {
      if (!username || typeof username !== 'string') {
        return false;
      }

      return this.COMMON_PATTERNS.username.test(username);
    } catch (error) {
      this.logger.error('Username validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isSlug(slug: string): boolean {
    try {
      if (!slug || typeof slug !== 'string') {
        return false;
      }

      return this.COMMON_PATTERNS.slug.test(slug);
    } catch (error) {
      this.logger.error('Slug validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isDateInRange(date: string | Date, min?: Date, max?: Date): boolean {
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      
      if (isNaN(dateObj.getTime())) {
        return false;
      }

      if (min && dateObj < min) {
        return false;
      }

      if (max && dateObj > max) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Date range validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static isMimeType(mimeType: string): boolean {
    try {
      if (!mimeType || typeof mimeType !== 'string') {
        return false;
      }

      return /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]{0,126}\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_+-]{0,126}$/.test(mimeType);
    } catch (error) {
      this.logger.error('MIME type validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static hasValidExtension(filename: string, allowedExtensions: string[]): boolean {
    try {
      if (!filename || !allowedExtensions || allowedExtensions.length === 0) {
        return false;
      }

      const ext = filename.split('.').pop()?.toLowerCase();
      if (!ext) {
        return false;
      }

      const normalizedExtensions = allowedExtensions.map(e => 
        e.toLowerCase().replace(/^\./, '')
      );

      return normalizedExtensions.includes(ext);
    } catch (error) {
      this.logger.error('File extension validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  static isAlphanumeric(value: string, allowSpaces: boolean = false): boolean {
    try {
      if (!value || typeof value !== 'string') {
        return false;
      }

      const pattern = allowSpaces ? /^[a-zA-Z0-9\s]+$/ : this.COMMON_PATTERNS.alphanumeric;
      return pattern.test(value);
    } catch (error) {
      this.logger.error('Alphanumeric validation error:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  static getCreditCardType(card: string): string | null {
    const cleaned = card.replace(/[\s-]/g, '');

    for (const [type, pattern] of Object.entries(this.CREDIT_CARD_PATTERNS)) {
      if (pattern.test(cleaned)) {
        return type;
      }
    }

    return null;
  }

  static maskSensitiveData(value: string, type: 'email' | 'phone' | 'card' | 'custom', visibleChars: number = 4): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    switch (type) {
      case 'email': {
        const atIndex = value.lastIndexOf('@');
        if (atIndex === -1) return value;
        
        const local = value.substring(0, atIndex);
        const domain = value.substring(atIndex + 1);
        const maskedLocal = local.substring(0, 2) + '*'.repeat(Math.max(0, local.length - 2));
        return `${maskedLocal}@${domain}`;
      }
      case 'phone': {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length < 10) return value;
        return value.replace(/\d(?=\d{4})/g, '*');
      }
      case 'card': {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length < 12) return value;
        return value.replace(/\d/g, (match, offset) => {
          const cleanOffset = value.substring(0, offset).replace(/\D/g, '').length;
          return cleanOffset < cleaned.length - 4 ? '*' : match;
        });
      }
      case 'custom':
      default: {
        if (value.length <= visibleChars * 2) return value;
        const start = value.substring(0, visibleChars);
        const end = value.substring(value.length - visibleChars);
        const middle = '*'.repeat(Math.max(3, value.length - visibleChars * 2));
        return `${start}${middle}${end}`;
      }
    }
  }

  static isValidEmail(email: string): boolean {
    return this.isEmail(email);
  }

  static isValidUrl(url: string): boolean {
    return this.isURL(url);
  }

  static isValidPhone(phone: string, country?: string): boolean {
    return this.isPhoneNumber(phone, country);
  }
}
