// src/data/validators/schema.types.ts

import { TestData } from '../types/data.types';

/**
 * JSON Schema definition following JSON Schema Draft-07
 */
export interface Schema {
    $id?: string;
    $schema?: string;
    $ref?: string;
    title?: string;
    description?: string;
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | string[];
    properties?: Record<string, Schema>;
    patternProperties?: Record<string, Schema>;
    additionalProperties?: boolean | Schema;
    required?: string[];
    items?: Schema | Schema[];
    additionalItems?: boolean | Schema;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    contains?: Schema;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number | boolean;
    exclusiveMaximum?: number | boolean;
    multipleOf?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    enum?: any[];
    const?: any;
    default?: any;
    examples?: any[];
    if?: Schema;
    then?: Schema;
    else?: Schema;
    allOf?: Schema[];
    anyOf?: Schema[];
    oneOf?: Schema[];
    not?: Schema;
    definitions?: Record<string, Schema>;
    dependencies?: Record<string, string[] | Schema>;
    propertyNames?: Schema;
    minProperties?: number;
    maxProperties?: number;
    // Custom keywords
    [key: string]: any;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
    valid: boolean;
    errors: SchemaValidationError[];
    warnings?: SchemaValidationWarning[];
    processedData?: TestData | TestData[];
    metadata?: {
        schemaVersion?: string;
        validationTime?: number;
        recordsValidated?: number;
        recordsPassed?: number;
        recordsFailed?: number;
        appliedDefaults?: number;
        typeCoercions?: number;
        removedProperties?: number;
    };
}

/**
 * Schema validation error
 */
export interface SchemaValidationError {
    path: string;
    message: string;
    schemaPath: string;
    keyword: string;
    params: any;
    data: any;
    severity?: 'error' | 'warning';
    dataPath?: string;
    instancePath?: string;
}

/**
 * Schema validation warning
 */
export interface SchemaValidationWarning {
    path: string;
    message: string;
    type: 'deprecation' | 'performance' | 'compatibility' | 'best-practice';
    suggestion?: string;
}

/**
 * Schema validation options
 */
export interface SchemaOptions {
    strict?: boolean;
    coerceTypes?: boolean;
    removeAdditional?: boolean | 'all' | 'failing';
    useDefaults?: boolean;
    validateFormats?: boolean;
    allErrors?: boolean;
    verbose?: boolean;
    allowUnknownFormats?: boolean;
    discriminator?: boolean;
    multipleOfPrecision?: number;
    nullable?: boolean;
    schemaId?: '$id' | 'id' | 'auto';
    strictTypes?: boolean;
    strictTuples?: boolean;
    allowMatchingProperties?: boolean;
    validateSchema?: boolean;
    addUsedSchema?: boolean;
    inlineRefs?: boolean;
    loopRequired?: number;
    ownProperties?: boolean;
    code?: {
        optimize?: boolean | number;
        formats?: Record<string, string>;
        es5?: boolean;
        lines?: boolean;
    };
    messages?: boolean;
    loadSchema?: (uri: string) => Promise<Schema>;
    // Custom validation
    customFormats?: Record<string, (value: any) => boolean>;
    customKeywords?: Record<string, (value: any, schema: any, parentSchema: any) => boolean>;
    beforeValidate?: (data: any, schema: Schema) => void;
    afterValidate?: (data: any, schema: Schema, result: boolean) => void;
}

/**
 * Schema format validators
 */
export interface FormatValidator {
    name: string;
    validate: (value: any) => boolean;
    message?: string;
}

/**
 * Schema keyword definition
 */
export interface KeywordDefinition {
    name: string;
    type?: string | string[];
    schemaType?: string | string[];
    compile?: (schema: any, parentSchema: Schema) => (data: any) => boolean;
    validate?: (schema: any, data: any, parentSchema: Schema) => boolean;
    macro?: (schema: any, parentSchema: Schema) => Schema;
    inline?: (it: any, keyword: string, schema: any) => string;
    modifying?: boolean;
    valid?: boolean;
    errors?: boolean | 'full';
    metaSchema?: Schema;
}

/**
 * Schema reference
 */
export interface SchemaReference {
    $ref: string;
    resolved?: Schema;
    circular?: boolean;
}

/**
 * Schema compilation context
 */
export interface SchemaCompilationContext {
    schemas: Map<string, Schema>;
    refs: Map<string, SchemaReference>;
    currentPath: string[];
    errors: SchemaValidationError[];
    options: SchemaOptions;
}