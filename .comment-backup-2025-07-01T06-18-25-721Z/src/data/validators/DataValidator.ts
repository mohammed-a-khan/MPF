// src/data/validators/DataValidator.ts
import { ValidationResult, TestData } from '../types/data.types';
import { ValidationRule, DataValidationOptions, ExtendedValidationResult, BuiltInValidationRule, ValidationRuleType } from './validation.types';
import { logger } from '../../core/utils/Logger';

/**
 * Validate test data against rules
 * Comprehensive validation for data quality
 */
export class DataValidator {
    private readonly defaultOptions: DataValidationOptions = {
        stopOnFirstError: false,
        throwOnError: false,
        validateRequired: true,
        validateTypes: true,
        validateFormats: true,
        validateRanges: true,
        validateUniqueness: true,
        validateRelationships: true,
        validateCustomRules: true,
        trimStrings: true,
        coerceTypes: false,
        maxErrors: 100
    };

    private readonly builtInValidators: Map<ValidationRuleType, BuiltInValidationRule> = new Map();
    private customRules: Map<string, ValidationRule> = new Map();
    private errors: ExtendedValidationResult[] = [];

    constructor() {
        this.initializeBuiltInRules();
    }

    /**
     * Validate test data
     */
    async validate(
        data: TestData | TestData[],
        rules: Record<string, ValidationRule | ValidationRule[]>,
        options?: Partial<DataValidationOptions>
    ): Promise<{
        valid: boolean;
        errors: ValidationResult[];
        warnings: ValidationResult[];
        summary: {
            totalRecords: number;
            validRecords: number;
            invalidRecords: number;
            totalErrors: number;
            totalWarnings: number;
            errorsByField: Record<string, number>;
            errorsByType: Record<string, number>;
        };
    }> {
        const opts = { ...this.defaultOptions, ...options };
        this.errors = [];
        const warnings: ExtendedValidationResult[] = [];
        const dataArray = Array.isArray(data) ? data : [data];
        let validRecords = 0;

        const errorsByField: Record<string, number> = {};
        const errorsByType: Record<string, number> = {};

        try {
            // Validate each record
            for (let index = 0; index < dataArray.length; index++) {
                const record = dataArray[index];
                const recordErrors: ExtendedValidationResult[] = [];

                // Validate each field
                for (const [field, fieldRules] of Object.entries(rules)) {
                    const rulesArray = Array.isArray(fieldRules) ? fieldRules : [fieldRules];
                    const value = record ? this.getFieldValue(record, field) : undefined;

                    for (const rule of rulesArray) {
                        if (opts.maxErrors && this.errors.length >= opts.maxErrors) {
                            const errorResult: ExtendedValidationResult = {
                                isValid: false,
                                errors: [`Maximum error limit reached (${opts.maxErrors!})`],
                                field,
                                value: null,
                                rule: 'maxErrors',
                                message: `Maximum error limit reached (${opts.maxErrors!})`,
                                severity: 'error',
                                recordIndex: index
                            };
                            this.errors.push(errorResult);
                            break;
                        }

                        if (!record) {
                            continue;
                        }
                        
                        const result = await this.validateField(
                            value,
                            field,
                            rule,
                            record,
                            index,
                            dataArray,
                            opts
                        );

                        if (!result.isValid) {
                            const extResult = result as ExtendedValidationResult;
                            if (extResult.severity === 'warning') {
                                warnings.push(result);
                            } else {
                                recordErrors.push(result);
                                this.errors.push(result);

                                // Track errors by field and type
                                errorsByField[field] = (errorsByField[field] || 0) + 1;
                                errorsByType[rule.type] = (errorsByType[rule.type] || 0) + 1;

                                if (opts.stopOnFirstError) {
                                    break;
                                }
                            }
                        }
                    }

                    if (opts.stopOnFirstError && recordErrors.length > 0) {
                        break;
                    }
                }

                if (recordErrors.length === 0) {
                    validRecords++;
                }

                if (opts.stopOnFirstError && this.errors.length > 0) {
                    break;
                }
            }

            const summary = {
                totalRecords: dataArray.length,
                validRecords,
                invalidRecords: dataArray.length - validRecords,
                totalErrors: this.errors.length,
                totalWarnings: warnings.length,
                errorsByField,
                errorsByType
            };

            logger.debug('Data validation completed:', summary);

            if (opts.throwOnError && this.errors.length > 0) {
                throw new Error(`Data validation failed with ${this.errors.length} errors`);
            }

            return {
                valid: this.errors.length === 0,
                errors: this.errors,
                warnings,
                summary
            } as any;
        } catch (error) {
            logger.error('Data validation failed:', error as Error);
            throw error;
        }
    }

    /**
     * Validate single field
     */
    private async validateField(
        value: any,
        field: string,
        rule: ValidationRule,
        record: TestData,
        recordIndex: number,
        allRecords: TestData[],
        options: DataValidationOptions
    ): Promise<ExtendedValidationResult> {
        try {
            // Pre-process value
            if (options.trimStrings && typeof value === 'string') {
                value = value.trim();
            }

            // Check if rule should be applied
            if (rule.condition && !rule.condition(record, allRecords)) {
                return { 
                    isValid: true, 
                    errors: [],
                    field, 
                    value, 
                    rule: rule.type 
                } as ExtendedValidationResult;
            }

            // Get validator
            const validator = this.getValidator(rule.type);
            if (!validator) {
                return {
                    isValid: false,
                    errors: [`Unknown validation rule: ${rule.type}`],
                    field,
                    value,
                    rule: rule.type,
                    message: `Unknown validation rule: ${rule.type}`,
                    severity: 'error',
                    recordIndex
                } as ExtendedValidationResult;
            }

            // Run validation
            const isValid = await validator.validate(value, rule, record, allRecords);

            if (!isValid) {
                const message = rule.message || this.getDefaultMessage(rule.type, rule, value);
                return {
                    isValid: false,
                    errors: [message],
                    field,
                    value,
                    rule: rule.type,
                    message,
                    severity: rule.severity || 'error',
                    recordIndex
                } as ExtendedValidationResult;
            }

            return {
                isValid: true,
                errors: [],
                field,
                value,
                rule: rule.type
            } as ExtendedValidationResult;
        } catch (error) {
            const message = `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            return {
                isValid: false,
                errors: [message],
                field,
                value,
                rule: rule.type,
                message,
                severity: 'error',
                recordIndex
            };
        }
    }

    /**
     * Get field value using dot notation
     */
    private getFieldValue(record: TestData, field: string): any {
        const parts = field.split('.');
        let value: any = record;

        for (const part of parts) {
            if (value === null || value === undefined) {
                return undefined;
            }

            // Handle array notation
            const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
            if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
                value = value[arrayMatch[1]];
                if (Array.isArray(value)) {
                    value = value[parseInt(arrayMatch[2])];
                } else {
                    return undefined;
                }
            } else {
                value = value[part];
            }
        }

        return value;
    }

    /**
     * Get validator function
     */
    private getValidator(type: ValidationRuleType): BuiltInValidationRule | undefined {
        return this.builtInValidators.get(type);
    }

    /**
     * Get default error message
     */
    private getDefaultMessage(type: string, rule: ValidationRule, value: any): string {
        switch (type) {
            case 'required':
                return `Field is required`;
            case 'type':
                return `Expected type ${rule.expectedType}, got ${typeof value}`;
            case 'minLength':
                return `Minimum length is ${rule.min}, got ${value?.length || 0}`;
            case 'maxLength':
                return `Maximum length is ${rule.max}, got ${value?.length || 0}`;
            case 'min':
                return `Minimum value is ${rule.min}, got ${value}`;
            case 'max':
                return `Maximum value is ${rule.max}, got ${value}`;
            case 'pattern':
                return `Value does not match pattern ${rule.pattern}`;
            case 'email':
                return `Invalid email format`;
            case 'url':
                return `Invalid URL format`;
            case 'date':
                return `Invalid date format`;
            case 'unique':
                return `Value must be unique`;
            case 'enum':
                return `Value must be one of: ${rule.values?.join(', ')}`;
            case 'custom':
                return `Custom validation failed`;
            default:
                return `Validation failed for rule: ${type}`;
        }
    }

    /**
     * Initialize built-in validation rules
     */
    private initializeBuiltInRules(): void {
        // Required field validation
        this.builtInValidators.set('required', {
            type: 'required',
            validate: async (value: any) => {
                return value !== null && value !== undefined && value !== '' && 
                       !(Array.isArray(value) && value.length === 0);
            }
        });

        // Type validation
        this.builtInValidators.set('type', {
            type: 'type',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined) return true;
                
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                return actualType === rule.expectedType;
            }
        });

        // String length validations
        this.builtInValidators.set('minLength' as any, {
            type: 'minLength',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined) return true;
                const length = String(value).length;
                return length >= (rule.minLength || (typeof rule.min === 'number' ? rule.min : 0));
            }
        });

        this.builtInValidators.set('maxLength', {
            type: 'maxLength',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined) return true;
                const length = String(value).length;
                return length <= (rule.maxLength || (typeof rule.max === 'number' ? rule.max : Infinity));
            }
        });

        // Numeric range validations
        this.builtInValidators.set('min', {
            type: 'min' as any,
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined || rule.min === undefined) return true;
                const num = Number(value);
                const minValue = typeof rule.min === 'number' ? rule.min : -Infinity;
                return !isNaN(num) && num >= minValue;
            }
        });

        this.builtInValidators.set('max', {
            type: 'max' as any,
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined || rule.max === undefined) return true;
                const num = Number(value);
                const maxValue = typeof rule.max === 'number' ? rule.max : Infinity;
                return !isNaN(num) && num <= maxValue;
            }
        });

        // Pattern validation
        this.builtInValidators.set('pattern', {
            type: 'pattern',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined) return true;
                const pattern = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern!);
                return pattern.test(String(value));
            }
        });

        // Email validation
        this.builtInValidators.set('email', {
            type: 'email' as any,
            validate: async (value: any) => {
                if (value === null || value === undefined || value === '') return true;
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(String(value));
            }
        });

        // URL validation
        this.builtInValidators.set('url', {
            type: 'url' as any,
            validate: async (value: any) => {
                if (value === null || value === undefined || value === '') return true;
                try {
                    new URL(String(value));
                    return true;
                } catch {
                    return false;
                }
            }
        });

        // Date validation
        this.builtInValidators.set('date', {
            type: 'date',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined || value === '') return true;
                
                const date = new Date(value);
                if (isNaN(date.getTime())) return false;

                // Check date range if specified
                if (rule.minDate) {
                    const minDate = new Date(rule.minDate);
                    if (date < minDate) return false;
                }

                if (rule.maxDate) {
                    const maxDate = new Date(rule.maxDate);
                    if (date > maxDate) return false;
                }

                return true;
            }
        });

        // Enum validation
        this.builtInValidators.set('enum', {
            type: 'enum',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined) return true;
                return rule.values?.includes(value) || false;
            }
        });

        // Unique validation
        this.builtInValidators.set('unique', {
            type: 'unique',
            validate: async (value: any, rule: ValidationRule, _record: TestData, allRecords?: TestData[]) => {
                if (value === null || value === undefined) return true;
                
                const field = rule.field || 'value';
                const occurrences = (allRecords || []).filter(r => {
                    // Simple field access without using this.getFieldValue
                    const parts = field.split('.');
                    let fieldValue: any = r;
                    for (const part of parts) {
                        if (fieldValue && typeof fieldValue === 'object') {
                            fieldValue = fieldValue[part];
                        } else {
                            fieldValue = undefined;
                            break;
                        }
                    }
                    return fieldValue === value;
                });

                return occurrences.length <= 1;
            }
        });

        // Phone number validation
        this.builtInValidators.set('phone', {
            type: 'phone',
            validate: async (value: any) => {
                if (value === null || value === undefined || value === '') return true;
                const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/;
                return phoneRegex.test(String(value).replace(/\s/g, ''));
            }
        });

        // Postal code validation
        this.builtInValidators.set('postalCode', {
            type: 'postalCode',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined || value === '') return true;
                
                const country = rule.country || 'US';
                const patterns: Record<string, RegExp> = {
                    US: /^\d{5}(-\d{4})?$/,
                    UK: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
                    CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
                    AU: /^\d{4}$/,
                    DE: /^\d{5}$/,
                    FR: /^\d{5}$/,
                    JP: /^\d{3}-?\d{4}$/,
                    IN: /^\d{6}$/
                };

                const pattern = patterns[country];
                return pattern ? pattern.test(String(value)) : true;
            }
        });

        // Credit card validation
        this.builtInValidators.set('creditCard', {
            type: 'creditCard',
            validate: async (value: any) => {
                if (value === null || value === undefined || value === '') return true;
                
                const cleaned = String(value).replace(/\s/g, '');
                if (!/^\d{13,19}$/.test(cleaned)) return false;

                // Luhn algorithm
                let sum = 0;
                let isEven = false;

                for (let i = cleaned.length - 1; i >= 0; i--) {
                    let digit = parseInt(cleaned[i] || '0');

                    if (isEven) {
                        digit *= 2;
                        if (digit > 9) {
                            digit -= 9;
                        }
                    }

                    sum += digit;
                    isEven = !isEven;
                }

                return sum % 10 === 0;
            }
        });

        // Custom validation
        this.builtInValidators.set('custom', {
            type: 'custom',
            validate: async (value: any, rule: ValidationRule, record: TestData, allRecords?: TestData[]) => {
                if (rule.customValidator) {
                    return rule.customValidator(value, record, allRecords || []);
                }
                if (rule.validator) {
                    const result = await rule.validator(value, record, allRecords);
                    return typeof result === 'boolean' ? result : result.isValid;
                }
                return true;
            }
        });

        // Relationship validation
        this.builtInValidators.set('relationship', {
            type: 'relationship',
            validate: async (value: any, rule: ValidationRule, record: TestData, _allRecords?: TestData[]) => {
                // Use either the new relationship object or legacy fields
                const relatedField = rule.relationship?.field || rule.relatedField;
                const relationshipType = rule.relationship?.type || rule.relationshipType;
                
                if (!relatedField || !relationshipType) return true;

                const relatedValue = this.getFieldValue(record, relatedField);

                switch (relationshipType) {
                    case 'equals':
                        return value === relatedValue;
                    case 'notEquals':
                        return value !== relatedValue;
                    case 'greaterThan':
                        return Number(value) > Number(relatedValue);
                    case 'lessThan':
                        return Number(value) < Number(relatedValue);
                    case 'contains':
                        return String(value).includes(String(relatedValue));
                    case 'startsWith':
                        return String(value).startsWith(String(relatedValue));
                    case 'endsWith':
                        return String(value).endsWith(String(relatedValue));
                    case 'exists':
                    case 'notExists':
                    case 'matches':
                        // Handle the new relationship types
                        if (rule.relationship?.condition) {
                            return rule.relationship.condition(value, relatedValue);
                        }
                        return true;
                    default:
                        return true;
                }
            }
        });

        // Array validations
        this.builtInValidators.set('arrayLength', {
            type: 'arrayLength' as any,
            validate: async (value: any, rule: ValidationRule) => {
                if (!Array.isArray(value)) return false;
                
                if (rule.min !== undefined && typeof rule.min === 'number' && value.length < rule.min) return false;
                if (rule.max !== undefined && typeof rule.max === 'number' && value.length > rule.max) return false;
                
                return true;
            }
        });

        this.builtInValidators.set('arrayUnique', {
            type: 'arrayUnique' as any,
            validate: async (value: any) => {
                if (!Array.isArray(value)) return true;
                
                const seen = new Set();
                for (const item of value) {
                    const key = typeof item === 'object' ? JSON.stringify(item) : item;
                    if (seen.has(key)) return false;
                    seen.add(key);
                }
                
                return true;
            }
        });

        // JSON validation
        this.builtInValidators.set('json', {
            type: 'json' as any,
            validate: async (value: any) => {
                if (value === null || value === undefined || value === '') return true;
                
                try {
                    JSON.parse(String(value));
                    return true;
                } catch {
                    return false;
                }
            }
        });

        // UUID validation
        this.builtInValidators.set('uuid', {
            type: 'uuid' as any,
            validate: async (value: any) => {
                if (value === null || value === undefined || value === '') return true;
                
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                return uuidRegex.test(String(value));
            }
        });

        // IP address validation
        this.builtInValidators.set('ipAddress', {
            type: 'ipAddress',
            validate: async (value: any, rule: ValidationRule) => {
                if (value === null || value === undefined || value === '') return true;
                
                const version = rule.ipVersion || 'v4';
                
                if (version === 'v4' || version === 'both') {
                    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                    if (ipv4Regex.test(String(value))) return true;
                }
                
                if (version === 'v6' || version === 'both') {
                    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
                    if (ipv6Regex.test(String(value))) return true;
                }
                
                return false;
            }
        });
    }

    /**
     * Register custom validation rule
     */
    registerRule(name: string, rule: ValidationRule): void {
        this.customRules.set(name, rule);
        logger.debug(`Registered custom validation rule: ${name}`);
    }

    /**
     * Create validation schema from object
     */
    createSchemaFromSample(
        sampleData: Record<string, any>,
        options?: {
            requireAll?: boolean;
            inferTypes?: boolean;
            inferPatterns?: boolean;
        }
    ): Record<string, ValidationRule[]> {
        const schema: Record<string, ValidationRule[]> = {};
        const opts = {
            requireAll: true,
            inferTypes: true,
            inferPatterns: true,
            ...options
        };

        for (const [field, value] of Object.entries(sampleData)) {
            const rules: ValidationRule[] = [];

            // Required rule
            if (opts.requireAll) {
                rules.push({ type: 'required', field });
            }

            // Type rule
            if (opts.inferTypes) {
                const type = Array.isArray(value) ? 'array' : typeof value;
                rules.push({ type: 'type', field, dataType: type as any });
            }

            // Pattern rules based on value
            if (opts.inferPatterns && typeof value === 'string') {
                // Email pattern
                if (value.includes('@') && value.includes('.')) {
                    rules.push({ type: 'email' as any, field });
                }
                // URL pattern
                else if (value.startsWith('http://') || value.startsWith('https://')) {
                    rules.push({ type: 'url' as any, field });
                }
                // UUID pattern
                else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
                    rules.push({ type: 'uuid' as any, field });
                }
                // Phone pattern
                else if (/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/.test(value)) {
                    rules.push({ type: 'phone' as any, field });
                }
                // Length rules
                else {
                    rules.push({ type: 'maxLength' as any, field, maxLength: value.length * 2 });
                }
            }

            // Numeric rules
            if (typeof value === 'number') {
                rules.push({ type: 'min' as any, field, min: value * 0.5 });
                rules.push({ type: 'max' as any, field, max: value * 1.5 });
            }

            // Array rules
            if (Array.isArray(value)) {
                rules.push({ type: 'arrayLength' as any, field, min: 0, max: value.length * 2 });
            }

            schema[field] = rules;
        }

        return schema;
    }

    /**
     * Export validation report
     */
    exportValidationReport(
        errors: ExtendedValidationResult[],
        format: 'json' | 'csv' | 'html' = 'json'
    ): string {
        switch (format) {
            case 'csv':
                return this.exportAsCSV(errors);
            case 'html':
                return this.exportAsHTML(errors);
            default:
                return JSON.stringify(errors, null, 2);
        }
    }

    /**
     * Export errors as CSV
     */
    private exportAsCSV(errors: ExtendedValidationResult[]): string {
        const headers = ['Record Index', 'Field', 'Value', 'Rule', 'Message', 'Severity'];
        const rows = errors.map(error => [
            error.recordIndex ?? '',
            error.field,
            JSON.stringify(error.value),
            error.rule,
            error.message || '',
            error.severity || 'error'
        ]);

        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
    }

    /**
     * Export errors as HTML
     */
    private exportAsHTML(errors: ExtendedValidationResult[]): string {
        const errorsByRecord = errors.reduce((acc, error) => {
            const index = error.recordIndex ?? -1;
            if (!acc[index]) acc[index] = [];
            acc[index].push(error);
            return acc;
        }, {} as Record<number, ExtendedValidationResult[]>);

        let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Data Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .error { background-color: #ffebee; }
        .warning { background-color: #fff3e0; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        .summary { background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>Data Validation Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Errors: ${errors.filter(e => e.severity !== 'warning').length}</p>
        <p>Total Warnings: ${errors.filter(e => e.severity === 'warning').length}</p>
    </div>
`;

        for (const [index, recordErrors] of Object.entries(errorsByRecord)) {
            html += `
    <h3>Record ${index === '-1' ? 'General' : index}</h3>
    <table>
        <tr>
            <th>Field</th>
            <th>Value</th>
            <th>Rule</th>
            <th>Message</th>
            <th>Severity</th>
        </tr>
`;
            for (const error of recordErrors as ExtendedValidationResult[]) {
                const rowClass = error.severity === 'warning' ? 'warning' : 'error';
                html += `
        <tr class="${rowClass}">
            <td>${error.field}</td>
            <td>${JSON.stringify(error.value)}</td>
            <td>${error.rule}</td>
            <td>${error.message || ''}</td>
            <td>${error.severity || 'error'}</td>
        </tr>
`;
            }
            html += `    </table>\n`;
        }

        html += `
</body>
</html>`;

        return html;
    }
}