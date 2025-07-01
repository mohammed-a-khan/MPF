import { ValidationResult, SchemaValidationError, Schema, SchemaValidatorOptions } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';

/**
 * JSON Schema validator supporting draft-07
 * Provides comprehensive schema validation for API responses
 */
export class SchemaValidator {
    private static instance: SchemaValidator;
    private schemaCache: Map<string, Schema> = new Map();
    private customFormats: Map<string, (value: any) => boolean> = new Map();
    private validationErrors: SchemaValidationError[] = [];

    private constructor() {
        this.registerDefaultFormats();
    }

    public static getInstance(): SchemaValidator {
        if (!SchemaValidator.instance) {
            SchemaValidator.instance = new SchemaValidator();
        }
        return SchemaValidator.instance;
    }

    /**
     * Validate data against JSON schema
     */
    public async validateSchema(
        data: any,
        schema: Schema | string,
        options: SchemaValidatorOptions = {}
    ): Promise<ValidationResult> {
        const startTime = Date.now();
        this.validationErrors = [];

        try {
            // Load schema if string path provided
            const schemaObj = typeof schema === 'string' 
                ? await this.loadSchema(schema)
                : schema;

            ActionLogger.getInstance().debug('Schema validation started', {
                schemaId: (schemaObj as any)['$id'] || 'inline',
                dataType: typeof data
            });

            // Validate against schema
            const isValid = this.validateAgainstSchema(data, schemaObj, options);

            const result: ValidationResult = {
                valid: isValid,
                message: isValid 
                    ? 'Schema validation passed'
                    : `Schema validation failed: ${this.validationErrors.length} errors found`,
                errors: this.validationErrors.map(err => ({
                    path: err.path,
                    message: err.message,
                    expected: err.expected,
                    actual: err.actual,
                    type: 'schema' as const
                })),
                duration: Date.now() - startTime
            };

            ActionLogger.getInstance().debug('Schema validation completed', result);
            return result;

        } catch (error) {
            const result: ValidationResult = {
                valid: false,
                message: `Schema validation error: ${(error as Error).message}`,
                errors: [{ message: (error as Error).message, path: '', expected: '', actual: '', type: 'schema' as const }],
                duration: Date.now() - startTime
            };

            ActionLogger.getInstance().logError(error as Error, 'Schema validation failed');
            return result;
        }
    }

    /**
     * Load schema from file or cache
     */
    private async loadSchema(schemaPath: string): Promise<Schema> {
        // Check cache first
        if (this.schemaCache.has(schemaPath)) {
            ActionLogger.getInstance().debug(`Loading schema from cache: ${schemaPath}`);
            return this.schemaCache.get(schemaPath)!;
        }

        try {
            const schemaContent = await FileUtils.readFile(schemaPath);
            const schemaContentStr = typeof schemaContent === 'string' ? schemaContent : schemaContent.toString();
            const schema = JSON.parse(schemaContentStr) as Schema;

            // Validate schema structure
            if (!this.isValidSchemaStructure(schema)) {
                throw new Error('Invalid schema structure');
            }

            // Cache the schema
            this.schemaCache.set(schemaPath, schema);
            ActionLogger.getInstance().info(`Schema loaded and cached: ${schemaPath}`);

            return schema;
        } catch (error) {
            throw new Error(`Failed to load schema from ${schemaPath}: ${(error as Error).message}`);
        }
    }

    /**
     * Core validation logic
     */
    private validateAgainstSchema(
        data: any,
        schema: Schema,
        options: SchemaValidatorOptions,
        path: string = '$'
    ): boolean {
        // Handle references
        if (schema['$ref']) {
            const resolvedSchema = this.resolveReference(schema['$ref']);
            return this.validateAgainstSchema(data, resolvedSchema, options, path);
        }

        // Type validation
        if (schema.type && !this.validateType(data, schema.type, path)) {
            return false;
        }

        // Null validation
        if (data === null) {
            if (schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'))) {
                return true;
            }
            this.addError(path, 'Value cannot be null', 'non-null', null);
            return false;
        }

        // Enum validation
        if (schema['enum'] && !this.validateEnum(data, schema['enum'], path)) {
            return false;
        }

        // Const validation
        if (schema['const'] !== undefined && !this.validateConst(data, schema['const'], path)) {
            return false;
        }

        // Format validation
        if (schema['format'] && !this.validateFormat(data, schema['format'], path)) {
            return false;
        }

        // Type-specific validation
        switch (schema.type) {
            case 'object':
                return this.validateObject(data, schema, options, path);
            case 'array':
                return this.validateArray(data, schema, options, path);
            case 'string':
                return this.validateString(data, schema, path);
            case 'number':
            case 'integer':
                return this.validateNumber(data, schema, path);
            case 'boolean':
                return this.validateBoolean(data, schema, path);
        }

        // Combined schemas
        if (schema['allOf']) {
            return this.validateAllOf(data, schema['allOf'], options, path);
        }
        if (schema['anyOf']) {
            return this.validateAnyOf(data, schema['anyOf'], options, path);
        }
        if (schema['oneOf']) {
            return this.validateOneOf(data, schema['oneOf'], options, path);
        }
        if (schema['not']) {
            return this.validateNot(data, schema['not'], options, path);
        }

        return true;
    }

    /**
     * Validate object type
     */
    private validateObject(
        data: any,
        schema: Schema,
        options: SchemaValidatorOptions,
        path: string
    ): boolean {
        if (typeof data !== 'object' || Array.isArray(data)) {
            this.addError(path, 'Expected object', 'object', typeof data);
            return false;
        }

        let valid = true;

        // Required properties
        if (schema.required) {
            for (const prop of schema.required) {
                if (!(prop in data)) {
                    this.addError(`${path}.${prop}`, 'Required property missing', 'present', 'missing');
                    valid = false;
                }
            }
        }

        // Property validation
        if (schema.properties) {
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                if (prop in data) {
                    const propValid = this.validateAgainstSchema(
                        data[prop],
                        propSchema as Schema,
                        options,
                        `${path}.${prop}`
                    );
                    valid = valid && propValid;
                }
            }
        }

        // Pattern properties
        if (schema['patternProperties']) {
            for (const [pattern, propSchema] of Object.entries(schema['patternProperties'])) {
                const regex = new RegExp(pattern);
                for (const prop of Object.keys(data)) {
                    if (regex.test(prop)) {
                        const propValid = this.validateAgainstSchema(
                            data[prop],
                            propSchema as Schema,
                            options,
                            `${path}.${prop}`
                        );
                        valid = valid && propValid;
                    }
                }
            }
        }

        // Additional properties
        if (schema.additionalProperties !== undefined) {
            const definedProps = new Set(Object.keys(schema.properties || {}));
            const patternProps = Object.keys(schema['patternProperties'] || {})
                .map(p => new RegExp(p));

            for (const prop of Object.keys(data)) {
                if (!definedProps.has(prop) && !patternProps.some(r => r.test(prop))) {
                    if (schema.additionalProperties === false) {
                        this.addError(`${path}.${prop}`, 'Additional property not allowed', 'undefined', 'present');
                        valid = false;
                    } else if (typeof schema.additionalProperties === 'object') {
                        const propValid = this.validateAgainstSchema(
                            data[prop],
                            schema.additionalProperties as Schema,
                            options,
                            `${path}.${prop}`
                        );
                        valid = valid && propValid;
                    }
                }
            }
        }

        // Property count constraints
        if (schema['minProperties'] !== undefined && Object.keys(data).length < schema['minProperties']) {
            this.addError(path, `Object must have at least ${schema['minProperties']} properties`, `>=${schema['minProperties']}`, Object.keys(data).length);
            valid = false;
        }
        if (schema['maxProperties'] !== undefined && Object.keys(data).length > schema['maxProperties']) {
            this.addError(path, `Object must have at most ${schema['maxProperties']} properties`, `<=${schema['maxProperties']}`, Object.keys(data).length);
            valid = false;
        }

        // Dependencies
        if (schema['dependencies']) {
            for (const [prop, dependency] of Object.entries(schema['dependencies'])) {
                if (prop in data) {
                    if (Array.isArray(dependency)) {
                        // Property dependencies
                        for (const depProp of dependency) {
                            if (!(depProp in data)) {
                                this.addError(path, `Property '${prop}' requires '${depProp}'`, 'present', 'missing');
                                valid = false;
                            }
                        }
                    } else {
                        // Schema dependencies
                        const depValid = this.validateAgainstSchema(data, dependency as Schema, options, path);
                        valid = valid && depValid;
                    }
                }
            }
        }

        return valid;
    }

    /**
     * Validate array type
     */
    private validateArray(
        data: any,
        schema: Schema,
        options: SchemaValidatorOptions,
        path: string
    ): boolean {
        if (!Array.isArray(data)) {
            this.addError(path, 'Expected array', 'array', typeof data);
            return false;
        }

        let valid = true;

        // Length constraints
        if (schema['minItems'] !== undefined && data.length < schema['minItems']) {
            this.addError(path, `Array must have at least ${schema['minItems']} items`, `>=${schema['minItems']}`, data.length);
            valid = false;
        }
        if (schema['maxItems'] !== undefined && data.length > schema['maxItems']) {
            this.addError(path, `Array must have at most ${schema['maxItems']} items`, `<=${schema['maxItems']}`, data.length);
            valid = false;
        }

        // Unique items
        if (schema['uniqueItems']) {
            const seen = new Set();
            for (let i = 0; i < data.length; i++) {
                const itemStr = JSON.stringify(data[i]);
                if (seen.has(itemStr)) {
                    this.addError(`${path}[${i}]`, 'Duplicate item in array', 'unique', 'duplicate');
                    valid = false;
                }
                seen.add(itemStr);
            }
        }

        // Item validation
        if (schema.items) {
            if (Array.isArray(schema.items)) {
                // Tuple validation
                for (let i = 0; i < Math.min(data.length, schema.items.length); i++) {
                    const schemaItem = (schema.items as Schema[])[i];
                    if (schemaItem) {
                        const itemValid = this.validateAgainstSchema(
                            data[i],
                            schemaItem,
                            options,
                            `${path}[${i}]`
                        );
                        valid = valid && itemValid;
                    }
                }

                // Additional items
                if (data.length > (schema.items as Schema[]).length) {
                    if (schema['additionalItems'] === false) {
                        this.addError(path, 'Additional items not allowed', `length<=${(schema.items as Schema[]).length}`, data.length);
                        valid = false;
                    } else if (typeof schema['additionalItems'] === 'object') {
                        for (let i = (schema.items as Schema[]).length; i < data.length; i++) {
                            const itemValid = this.validateAgainstSchema(
                                data[i],
                                schema['additionalItems'] as Schema,
                                options,
                                `${path}[${i}]`
                            );
                            valid = valid && itemValid;
                        }
                    }
                }
            } else {
                // Single schema for all items
                for (let i = 0; i < data.length; i++) {
                    const itemValid = this.validateAgainstSchema(
                        data[i],
                        schema.items as Schema,
                        options,
                        `${path}[${i}]`
                    );
                    valid = valid && itemValid;
                }
            }
        }

        // Contains
        if (schema['contains']) {
            let foundValid = false;
            for (let i = 0; i < data.length; i++) {
                const errors = this.validationErrors.length;
                if (this.validateAgainstSchema(data[i], schema['contains'] as Schema, options, `${path}[${i}]`)) {
                    foundValid = true;
                    break;
                } else {
                    // Remove errors from failed contains check
                    this.validationErrors.length = errors;
                }
            }
            if (!foundValid) {
                this.addError(path, 'Array must contain at least one item matching schema', 'contains', 'none');
                valid = false;
            }
        }

        return valid;
    }

    /**
     * Validate string type
     */
    private validateString(data: any, schema: Schema, path: string): boolean {
        if (typeof data !== 'string') {
            this.addError(path, 'Expected string', 'string', typeof data);
            return false;
        }

        let valid = true;

        // Length constraints
        if (schema['minLength'] !== undefined && data.length < schema['minLength']) {
            this.addError(path, `String must be at least ${schema['minLength']} characters`, `>=${schema['minLength']}`, data.length);
            valid = false;
        }
        if (schema['maxLength'] !== undefined && data.length > schema['maxLength']) {
            this.addError(path, `String must be at most ${schema['maxLength']} characters`, `<=${schema['maxLength']}`, data.length);
            valid = false;
        }

        // Pattern
        if (schema['pattern']) {
            const regex = new RegExp(schema['pattern']);
            if (!regex.test(data)) {
                this.addError(path, `String must match pattern: ${schema['pattern']}`, schema['pattern'], data);
                valid = false;
            }
        }

        return valid;
    }

    /**
     * Validate number type
     */
    private validateNumber(data: any, schema: Schema, path: string): boolean {
        if (typeof data !== 'number') {
            this.addError(path, 'Expected number', 'number', typeof data);
            return false;
        }

        if (schema.type === 'integer' && !Number.isInteger(data)) {
            this.addError(path, 'Expected integer', 'integer', 'float');
            return false;
        }

        let valid = true;

        // Range constraints
        if (schema['minimum'] !== undefined) {
            if (schema['exclusiveMinimum'] && data <= schema['minimum']) {
                this.addError(path, `Value must be greater than ${schema['minimum']}`, `>${schema['minimum']}`, data);
                valid = false;
            } else if (!schema['exclusiveMinimum'] && data < schema['minimum']) {
                this.addError(path, `Value must be at least ${schema['minimum']}`, `>=${schema['minimum']}`, data);
                valid = false;
            }
        }

        if (schema['maximum'] !== undefined) {
            if (schema['exclusiveMaximum'] && data >= schema['maximum']) {
                this.addError(path, `Value must be less than ${schema['maximum']}`, `<${schema['maximum']}`, data);
                valid = false;
            } else if (!schema['exclusiveMaximum'] && data > schema['maximum']) {
                this.addError(path, `Value must be at most ${schema['maximum']}`, `<=${schema['maximum']}`, data);
                valid = false;
            }
        }

        // Multiple of
        if (schema['multipleOf'] !== undefined) {
            const remainder = data % schema['multipleOf'];
            if (Math.abs(remainder) > Number.EPSILON) {
                this.addError(path, `Value must be multiple of ${schema['multipleOf']}`, `multiple of ${schema['multipleOf']}`, data);
                valid = false;
            }
        }

        return valid;
    }

    /**
     * Validate boolean type
     */
    private validateBoolean(data: any, _schema: Schema, path: string): boolean {
        if (typeof data !== 'boolean') {
            this.addError(path, 'Expected boolean', 'boolean', typeof data);
            return false;
        }
        return true;
    }

    /**
     * Validate type constraint
     */
    private validateType(data: any, type: string | string[], path: string): boolean {
        const types = Array.isArray(type) ? type : [type];
        const dataType = this.getJsonType(data);

        if (!types.includes(dataType)) {
            this.addError(path, `Expected type ${types.join(' or ')}`, types.join(' or '), dataType);
            return false;
        }

        return true;
    }

    /**
     * Get JSON type of value
     */
    private getJsonType(value: any): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    /**
     * Validate enum constraint
     */
    private validateEnum(data: any, enumValues: any[], path: string): boolean {
        const found = enumValues.some(val => this.deepEqual(data, val));
        if (!found) {
            this.addError(path, `Value must be one of: ${enumValues.map(v => JSON.stringify(v)).join(', ')}`, 'enum', data);
            return false;
        }
        return true;
    }

    /**
     * Validate const constraint
     */
    private validateConst(data: any, constValue: any, path: string): boolean {
        if (!this.deepEqual(data, constValue)) {
            this.addError(path, `Value must be ${JSON.stringify(constValue)}`, constValue, data);
            return false;
        }
        return true;
    }

    /**
     * Validate format constraint
     */
    private validateFormat(data: any, format: string, path: string): boolean {
        const validator = this.customFormats.get(format) || this.getDefaultFormatValidator(format);
        
        if (!validator) {
            ActionLogger.getInstance().warn(`Unknown format: ${format}`);
            return true; // Unknown formats pass by default
        }

        if (!validator(data)) {
            this.addError(path, `Invalid ${format} format`, format, data);
            return false;
        }

        return true;
    }

    /**
     * Validate allOf constraint
     */
    private validateAllOf(
        data: any,
        schemas: Schema[],
        options: SchemaValidatorOptions,
        path: string
    ): boolean {
        let valid = true;
        for (const schema of schemas) {
            const schemaValid = this.validateAgainstSchema(data, schema, options, path);
            valid = valid && schemaValid;
        }
        return valid;
    }

    /**
     * Validate anyOf constraint
     */
    private validateAnyOf(
        data: any,
        schemas: Schema[],
        options: SchemaValidatorOptions,
        path: string
    ): boolean {
        const originalErrors = this.validationErrors.length;
        
        for (const schema of schemas) {
            const errors = this.validationErrors.length;
            if (this.validateAgainstSchema(data, schema, options, path)) {
                // Remove any errors added during successful validation
                this.validationErrors.length = errors;
                return true;
            }
            // Remove errors from this attempt
            this.validationErrors.length = errors;
        }

        // Restore original errors and add anyOf error
        this.validationErrors.length = originalErrors;
        this.addError(path, 'Value must match at least one schema in anyOf', 'anyOf', 'none');
        return false;
    }

    /**
     * Validate oneOf constraint
     */
    private validateOneOf(
        data: any,
        schemas: Schema[],
        options: SchemaValidatorOptions,
        path: string
    ): boolean {
        const originalErrors = this.validationErrors.length;
        let validCount = 0;

        for (const schema of schemas) {
            const errors = this.validationErrors.length;
            if (this.validateAgainstSchema(data, schema, options, path)) {
                validCount++;
            }
            // Remove errors from this attempt
            this.validationErrors.length = errors;
        }

        // Restore original errors
        this.validationErrors.length = originalErrors;

        if (validCount !== 1) {
            this.addError(path, `Value must match exactly one schema in oneOf (matched ${validCount})`, 'oneOf(1)', `oneOf(${validCount})`);
            return false;
        }

        return true;
    }

    /**
     * Validate not constraint
     */
    private validateNot(
        data: any,
        schema: Schema,
        options: SchemaValidatorOptions,
        path: string
    ): boolean {
        const errors = this.validationErrors.length;
        const isValid = this.validateAgainstSchema(data, schema, options, path);
        
        // Remove errors from not validation
        this.validationErrors.length = errors;

        if (isValid) {
            this.addError(path, 'Value must not match schema', 'not', 'matches');
            return false;
        }

        return true;
    }

    /**
     * Register default format validators
     */
    private registerDefaultFormats(): void {
        // Date-time formats
        this.customFormats.set('date-time', (value: string) => {
            return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/.test(value);
        });

        this.customFormats.set('date', (value: string) => {
            return /^\d{4}-\d{2}-\d{2}$/.test(value);
        });

        this.customFormats.set('time', (value: string) => {
            return /^\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/.test(value);
        });

        // Internet formats
        this.customFormats.set('email', (value: string) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        });

        this.customFormats.set('hostname', (value: string) => {
            return /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(value);
        });

        this.customFormats.set('ipv4', (value: string) => {
            return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(value);
        });

        this.customFormats.set('ipv6', (value: string) => {
            return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(value);
        });

        this.customFormats.set('uri', (value: string) => {
            try {
                new URL(value);
                return true;
            } catch {
                return false;
            }
        });

        this.customFormats.set('uri-reference', (value: string) => {
            return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || /^\//.test(value) || /^#/.test(value) || /^\./.test(value);
        });

        // JSON pointer
        this.customFormats.set('json-pointer', (value: string) => {
            return /^(\/[^/~]*(~[01][^/~]*)*)*$/.test(value);
        });

        // UUID
        this.customFormats.set('uuid', (value: string) => {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
        });

        // Regex
        this.customFormats.set('regex', (value: string) => {
            try {
                new RegExp(value);
                return true;
            } catch {
                return false;
            }
        });
    }

    /**
     * Get default format validator
     */
    private getDefaultFormatValidator(format: string): ((value: any) => boolean) | null {
        return this.customFormats.get(format) || null;
    }

    /**
     * Register custom format validator
     */
    public registerFormat(name: string, validator: (value: any) => boolean): void {
        this.customFormats.set(name, validator);
        ActionLogger.getInstance().debug(`Registered custom format: ${name}`);
    }

    /**
     * Resolve schema reference
     */
    private resolveReference(ref: string): Schema {
        // Simple implementation - in production would handle external refs
        if (ref.startsWith('#/')) {
            // Would traverse schema to find reference
            throw new Error(`Reference resolution not implemented: ${ref}`);
        }
        throw new Error(`Invalid reference: ${ref}`);
    }

    /**
     * Check if schema structure is valid
     */
    private isValidSchemaStructure(schema: any): boolean {
        return schema && typeof schema === 'object' && (
            schema.type ||
            schema.properties ||
            schema.items ||
            schema.allOf ||
            schema.anyOf ||
            schema.oneOf ||
            schema.not ||
            (schema as any)['$ref']
        );
    }

    /**
     * Deep equality check
     */
    private deepEqual(a: any, b: any): boolean {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) return false;

            for (const key of keysA) {
                if (!keysB.includes(key)) return false;
                if (!this.deepEqual(a[key], b[key])) return false;
            }

            return true;
        }

        return false;
    }

    /**
     * Add validation error
     */
    private addError(path: string, message: string, expected: any, actual: any): void {
        this.validationErrors.push({
            path,
            message,
            expected,
            actual
        });
    }

    /**
     * Clear schema cache
     */
    public clearCache(): void {
        this.schemaCache.clear();
        ActionLogger.getInstance().debug('Schema cache cleared');
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { size: number; schemas: string[] } {
        return {
            size: this.schemaCache.size,
            schemas: Array.from(this.schemaCache.keys())
        };
    }
}