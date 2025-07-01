// src/data/validators/validation.types.ts

import { TestData, ValidationResult } from '../types/data.types';

export type ValidationRuleType = 
    | 'required' 
    | 'type' 
    | 'format' 
    | 'range' 
    | 'length' 
    | 'minLength'
    | 'maxLength'
    | 'min'
    | 'max'
    | 'pattern' 
    | 'unique' 
    | 'custom' 
    | 'relationship'
    | 'email'
    | 'url'
    | 'date'
    | 'enum'
    | 'phone'
    | 'postalCode'
    | 'creditCard'
    | 'arrayLength'
    | 'arrayUnique'
    | 'json'
    | 'uuid'
    | 'ipAddress';

export interface ValidationRule {
    field: string;
    type: ValidationRuleType;
    dataType?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
    expectedType?: string;
    format?: string;
    pattern?: string | RegExp;
    min?: number | Date;
    max?: number | Date;
    minLength?: number;
    maxLength?: number;
    minDate?: string | Date;
    maxDate?: string | Date;
    values?: any[];
    unique?: boolean;
    uniqueScope?: string[];
    country?: string;
    ipVersion?: 'v4' | 'v6' | 'both';
    relatedField?: string;
    relationshipType?: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'exists' | 'notExists' | 'contains' | 'startsWith' | 'endsWith' | 'matches';
    relationship?: {
        type: 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'exists' | 'notExists' | 'contains' | 'startsWith' | 'endsWith' | 'matches';
        field: string;
        value?: any;
        condition?: (value: any, relatedValue: any) => boolean;
    };
    message?: string;
    severity?: 'error' | 'warning' | 'info';
    condition?: (value: any, record: TestData, allRecords?: TestData[]) => boolean;
    validator?: (value: any, record: TestData, allRecords?: TestData[]) => boolean | ValidationResult;
    customValidator?: (value: any, record: TestData, allRecords?: TestData[]) => boolean;
    validate?: (value: any, rule: ValidationRule, record: TestData, allRecords?: TestData[]) => boolean | Promise<boolean>;
}

export interface DataValidationOptions {
    stopOnFirstError?: boolean;
    throwOnError?: boolean;
    validateRequired?: boolean;
    validateTypes?: boolean;
    validateFormats?: boolean;
    validateRanges?: boolean;
    validateUniqueness?: boolean;
    validateRelationships?: boolean;
    validateCustomRules?: boolean;
    trimStrings?: boolean;
    coerceTypes?: boolean;
    maxErrors?: number;
    customValidators?: Record<string, (value: any, record: TestData) => boolean>;
    dateFormat?: string;
    locale?: string;
    timezone?: string;
}

export interface BuiltInValidationRule {
    type: ValidationRuleType;
    validate: (value: any, rule: ValidationRule, record: TestData, allRecords?: TestData[]) => boolean | Promise<boolean>;
}

export interface ExtendedValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
    details?: Array<{
        row?: number;
        field?: string;
        value?: any;
        error: string;
    }>;
    recordIndex?: number;
    field?: string;
    value?: any;
    rule?: string;
    message?: string;
    severity?: 'error' | 'warning' | 'info';
}
