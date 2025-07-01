// src/data/transformers/type-converter.types.ts

export type DataType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'undefined' | 'json' | 'auto' | 'unknown';

export interface ConversionResult<T = any> {
    success: boolean;
    value?: T;
    error?: string;
    originalType: DataType;
    targetType: DataType;
    sourceType?: DataType;
    metadata?: {
        format?: string;
        locale?: string;
        timezone?: string;
        precision?: number;
    };
}

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

export type NumberFormat = 
    | 'decimal'
    | 'integer'
    | 'float'
    | 'currency'
    | 'percent'
    | 'scientific'
    | 'compact'
    | string;

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
