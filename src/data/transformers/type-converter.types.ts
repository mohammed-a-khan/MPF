// src/data/transformers/type-converter.types.ts

/**
 * Data types supported by the converter
 */
export type DataType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'undefined' | 'json' | 'auto' | 'unknown';

/**
 * Result of a type conversion operation
 */
export interface ConversionResult<T = any> {
    success: boolean;
    value?: T;
    error?: string;
    originalType: DataType;
    targetType: DataType;
    sourceType?: DataType; // For backward compatibility
    metadata?: {
        format?: string;
        locale?: string;
        timezone?: string;
        precision?: number;
    };
}

/**
 * Date format options
 */
export type DateFormat = 
    | 'YYYY-MM-DD'
    | 'DD/MM/YYYY'
    | 'MM/DD/YYYY'
    | 'DD-MM-YYYY'
    | 'MM-DD-YYYY'
    | 'YYYY/MM/DD'
    | 'ISO'
    | 'RFC2822'
    | 'Unix'
    | string;

/**
 * Number format options
 */
export type NumberFormat = 
    | 'decimal'
    | 'integer'
    | 'float'
    | 'currency'
    | 'percent'
    | 'scientific'
    | 'compact'
    | string;

/**
 * Extended type conversion options
 */
export interface ExtendedTypeConversionOptions {
    dateFormat?: string;
    numberFormat?: string;
    booleanTrueValues?: string[];
    booleanFalseValues?: string[];
    nullValues?: string[];
    trimStrings?: boolean;
    emptyStringAsNull?: boolean;
    parseNumbers?: boolean;
    parseDates?: boolean;
    parseBooleans?: boolean;
    parseJSON?: boolean;
    throwOnError?: boolean;
    locale?: string;
    timezone?: string;
    precision?: number;
    currencyCode?: string;
    useGrouping?: boolean;
}