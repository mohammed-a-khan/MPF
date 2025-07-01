// src/data/validators/SchemaValidator.ts
import { TestData } from '../types/data.types';
import { Schema, SchemaValidationResult, SchemaOptions, SchemaValidationError } from './schema.types';
import { logger } from '../../core/utils/Logger';

export class SchemaValidator {
    private readonly defaultOptions: SchemaOptions = {
        strict: true,
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: true,
        validateFormats: true,
        allErrors: true,
        verbose: true,
        allowUnknownFormats: false
    };

    private customFormats: Map<string, (value: any) => boolean> = new Map();
    private customKeywords: Map<string, (value: any, schema: any, parentSchema: any) => boolean> = new Map();

    constructor() {
        this.initializeFormats();
        this.initializeKeywords();
    }

    async validate(
        data: TestData | TestData[],
        schema: Schema,
        options?: Partial<SchemaOptions>
    ): Promise<SchemaValidationResult> {
        const opts = { ...this.defaultOptions, ...options };
        const errors: Array<{
            path: string;
            message: string;
            schemaPath: string;
            keyword: string;
            params: any;
            data: any;
        }> = [];

        try {
            const dataArray = Array.isArray(data) ? data : [data];
            const isValid = await this.validateData(dataArray, schema, '', '', errors, opts);

            const result: SchemaValidationResult = {
                valid: isValid,
                errors: errors as SchemaValidationError[],
                warnings: [],
                ...(opts.useDefaults || opts.removeAdditional || opts.coerceTypes ? { processedData: data } : {}),
                metadata: {
                    ...(schema.$schema && { schemaVersion: schema.$schema }),
                    validationTime: Date.now(),
                    recordsValidated: dataArray.length,
                    recordsPassed: isValid ? dataArray.length : 0,
                    recordsFailed: isValid ? 0 : dataArray.length
                }
            };

            if (opts.verbose) {
                logger.debug('Schema validation completed:', {
                    valid: isValid,
                    errorCount: errors.length
                });
            }

            return result;
        } catch (error) {
            logger.error('Schema validation failed:', error as Error);
            throw error;
        }
    }

    private async validateData(
        data: any,
        schema: Schema,
        dataPath: string,
        schemaPath: string,
        errors: any[],
        options: SchemaOptions
    ): Promise<boolean> {
        if (schema.$ref) {
            const resolvedSchema = await this.resolveReference(schema.$ref);
            return this.validateData(data, resolvedSchema, dataPath, schemaPath, errors, options);
        }

        if (schema.type) {
            if (!this.validateType(data, schema.type, dataPath, schemaPath, errors, options)) {
                return false;
            }
        }

        const validators: Array<() => Promise<boolean>> = [];

        if (schema.enum !== undefined) {
            validators.push(() => this.validateEnum(data, schema.enum!, dataPath, schemaPath, errors));
        }

        if (schema.const !== undefined) {
            validators.push(() => this.validateConst(data, schema.const!, dataPath, schemaPath, errors));
        }

        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            validators.push(() => this.validateObject(data, schema, dataPath, schemaPath, errors, options));
        } else if (Array.isArray(data)) {
            validators.push(() => this.validateArray(data, schema, dataPath, schemaPath, errors, options));
        } else if (typeof data === 'string') {
            validators.push(() => this.validateString(data, schema, dataPath, schemaPath, errors, options));
        } else if (typeof data === 'number') {
            validators.push(() => this.validateNumber(data, schema, dataPath, schemaPath, errors, options));
        }

        if (schema.if) {
            validators.push(() => this.validateConditional(data, schema, dataPath, schemaPath, errors, options));
        }

        for (const [keyword, validator] of this.customKeywords) {
            if (keyword in schema) {
                validators.push(async () => {
                    const isValid = validator(data, (schema as any)[keyword], schema);
                    if (!isValid) {
                        errors.push({
                            path: dataPath,
                            message: `Custom validation failed for keyword: ${keyword}`,
                            schemaPath: `${schemaPath}/${keyword}`,
                            keyword,
                            params: { keyword },
                            data
                        });
                    }
                    return isValid;
                });
            }
        }

        const results = await Promise.all(validators.map(v => v()));
        return options.allErrors ? results.every(r => r !== false) : !results.includes(false);
    }

    private validateType(
        data: any,
        expectedType: string | string[],
        dataPath: string,
        schemaPath: string,
        errors: any[],
        options: SchemaOptions
    ): boolean {
        const types = Array.isArray(expectedType) ? expectedType : [expectedType];
        const actualType = this.getType(data);

        if (!types.includes(actualType)) {
            if (options.coerceTypes) {
                for (const type of types) {
                    const coerced = this.coerceType(data, type);
                    if (coerced !== undefined && this.getType(coerced) === type) {
                        return true;
                    }
                }
            }

            errors.push({
                path: dataPath,
                message: `Expected type ${types.join(' or ')}, got ${actualType}`,
                schemaPath: `${schemaPath}/type`,
                keyword: 'type',
                params: { type: expectedType },
                data
            });
            return false;
        }

        return true;
    }

    private getType(value: any): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    private coerceType(value: any, targetType: string): any {
        switch (targetType) {
            case 'string':
                return String(value);
            case 'number':
                const num = Number(value);
                return isNaN(num) ? undefined : num;
            case 'boolean':
                if (value === 'true' || value === 1) return true;
                if (value === 'false' || value === 0) return false;
                return undefined;
            case 'null':
                return null;
            default:
                return undefined;
        }
    }

    private async validateObject(
        data: Record<string, any>,
        schema: Schema,
        dataPath: string,
        schemaPath: string,
        errors: any[],
        options: SchemaOptions
    ): Promise<boolean> {
        let valid = true;

        if (schema.properties) {
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                if (prop in data) {
                    const propValid = await this.validateData(
                        data[prop],
                        propSchema,
                        `${dataPath}/${prop}`,
                        `${schemaPath}/properties/${prop}`,
                        errors,
                        options
                    );
                    if (!propValid) valid = false;
                }
            }
        }

        if (schema.required) {
            for (const required of schema.required) {
                if (!(required in data)) {
                    errors.push({
                        path: dataPath,
                        message: `Missing required property: ${required}`,
                        schemaPath: `${schemaPath}/required`,
                        keyword: 'required',
                        params: { missingProperty: required },
                        data
                    });
                    valid = false;
                }
            }
        }

        if (schema.additionalProperties !== undefined) {
            const definedProps = new Set(Object.keys(schema.properties || {}));
            const additionalProps = Object.keys(data).filter(p => !definedProps.has(p));

            if (schema.additionalProperties === false && additionalProps.length > 0) {
                if (options.removeAdditional) {
                    for (const prop of additionalProps) {
                        delete data[prop];
                    }
                } else {
                    for (const prop of additionalProps) {
                        errors.push({
                            path: `${dataPath}/${prop}`,
                            message: `Additional property not allowed: ${prop}`,
                            schemaPath: `${schemaPath}/additionalProperties`,
                            keyword: 'additionalProperties',
                            params: { additionalProperty: prop },
                            data: data[prop]
                        });
                        valid = false;
                    }
                }
            } else if (typeof schema.additionalProperties === 'object') {
                for (const prop of additionalProps) {
                    const propValid = await this.validateData(
                        data[prop],
                        schema.additionalProperties,
                        `${dataPath}/${prop}`,
                        `${schemaPath}/additionalProperties`,
                        errors,
                        options
                    );
                    if (!propValid) valid = false;
                }
            }
        }

        if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) {
            errors.push({
                path: dataPath,
                message: `Object has too few properties (${Object.keys(data).length} < ${schema.minProperties})`,
                schemaPath: `${schemaPath}/minProperties`,
                keyword: 'minProperties',
                params: { limit: schema.minProperties },
                data
            });
            valid = false;
        }

        if (schema.maxProperties !== undefined && Object.keys(data).length > schema.maxProperties) {
            errors.push({
                path: dataPath,
                message: `Object has too many properties (${Object.keys(data).length} > ${schema.maxProperties})`,
                schemaPath: `${schemaPath}/maxProperties`,
                keyword: 'maxProperties',
                params: { limit: schema.maxProperties },
                data
            });
            valid = false;
        }

        if (schema.dependencies) {
            for (const [prop, dependency] of Object.entries(schema.dependencies)) {
                if (prop in data) {
                    if (Array.isArray(dependency)) {
                        for (const dep of dependency) {
                            if (!(dep in data)) {
                                errors.push({
                                    path: dataPath,
                                    message: `Property ${prop} requires property ${dep}`,
                                    schemaPath: `${schemaPath}/dependencies/${prop}`,
                                    keyword: 'dependencies',
                                    params: { property: prop, dependency: dep },
                                    data
                                });
                                valid = false;
                            }
                        }
                    } else {
                        const depValid = await this.validateData(
                            data,
                            dependency,
                            dataPath,
                            `${schemaPath}/dependencies/${prop}`,
                            errors,
                            options
                        );
                        if (!depValid) valid = false;
                    }
                }
            }
        }

        return valid;
    }

    private async validateArray(
        data: any[],
        schema: Schema,
        dataPath: string,
        schemaPath: string,
        errors: any[],
        options: SchemaOptions
    ): Promise<boolean> {
        let valid = true;

        if (schema.items) {
            if (Array.isArray(schema.items)) {
                for (let i = 0; i < Math.min(data.length, schema.items.length); i++) {
                    const itemValid = await this.validateData(
                        data[i],
                        schema.items[i]!,
                        `${dataPath}/${i}`,
                        `${schemaPath}/items/${i}`,
                        errors,
                        options
                    );
                    if (!itemValid) valid = false;
                }

                if (schema.additionalItems !== undefined && data.length > schema.items.length) {
                    if (schema.additionalItems === false) {
                        errors.push({
                            path: dataPath,
                            message: `Array has too many items (${data.length} > ${schema.items.length})`,
                            schemaPath: `${schemaPath}/additionalItems`,
                            keyword: 'additionalItems',
                            params: { limit: schema.items.length },
                            data
                        });
                        valid = false;
                    } else if (typeof schema.additionalItems === 'object') {
                        for (let i = schema.items.length; i < data.length; i++) {
                            const itemValid = await this.validateData(
                                data[i],
                                schema.additionalItems,
                                `${dataPath}/${i}`,
                                `${schemaPath}/additionalItems`,
                                errors,
                                options
                            );
                            if (!itemValid) valid = false;
                        }
                    }
                }
            } else {
                for (let i = 0; i < data.length; i++) {
                    const itemValid = await this.validateData(
                        data[i],
                        schema.items,
                        `${dataPath}/${i}`,
                        `${schemaPath}/items`,
                        errors,
                        options
                    );
                    if (!itemValid) valid = false;
                }
            }
        }

        if (schema.minItems !== undefined && data.length < schema.minItems) {
            errors.push({
                path: dataPath,
                message: `Array has too few items (${data.length} < ${schema.minItems})`,
                schemaPath: `${schemaPath}/minItems`,
                keyword: 'minItems',
                params: { limit: schema.minItems },
                data
            });
            valid = false;
        }

        if (schema.maxItems !== undefined && data.length > schema.maxItems) {
            errors.push({
                path: dataPath,
                message: `Array has too many items (${data.length} > ${schema.maxItems})`,
                schemaPath: `${schemaPath}/maxItems`,
                keyword: 'maxItems',
                params: { limit: schema.maxItems },
                data
            });
            valid = false;
        }

        if (schema.uniqueItems) {
            const seen = new Set<string>();
            for (let i = 0; i < data.length; i++) {
                const key = JSON.stringify(data[i]);
                if (seen.has(key)) {
                    errors.push({
                        path: `${dataPath}/${i}`,
                        message: `Duplicate array item`,
                        schemaPath: `${schemaPath}/uniqueItems`,
                        keyword: 'uniqueItems',
                        params: { i, j: Array.from(seen).indexOf(key) },
                        data: data[i]
                    });
                    valid = false;
                }
                seen.add(key);
            }
        }

        if (schema.contains) {
            let containsValid = false;
            for (let i = 0; i < data.length; i++) {
                const itemErrors: any[] = [];
                const itemValid = await this.validateData(
                    data[i],
                    schema.contains,
                    `${dataPath}/${i}`,
                    `${schemaPath}/contains`,
                    itemErrors,
                    options
                );
                if (itemValid) {
                    containsValid = true;
                    break;
                }
            }
            if (!containsValid) {
                errors.push({
                    path: dataPath,
                    message: `Array does not contain required item`,
                    schemaPath: `${schemaPath}/contains`,
                    keyword: 'contains',
                    params: {},
                    data
                });
                valid = false;
            }
        }

        return valid;
    }

    private async validateString(
        data: string,
        schema: Schema,
        dataPath: string,
        schemaPath: string,
        errors: any[],
        options: SchemaOptions
    ): Promise<boolean> {
        let valid = true;

        if (schema.minLength !== undefined && data.length < schema.minLength) {
            errors.push({
                path: dataPath,
                message: `String is too short (${data.length} < ${schema.minLength})`,
                schemaPath: `${schemaPath}/minLength`,
                keyword: 'minLength',
                params: { limit: schema.minLength },
                data
            });
            valid = false;
        }

        if (schema.maxLength !== undefined && data.length > schema.maxLength) {
            errors.push({
                path: dataPath,
                message: `String is too long (${data.length} > ${schema.maxLength})`,
                schemaPath: `${schemaPath}/maxLength`,
                keyword: 'maxLength',
                params: { limit: schema.maxLength },
                data
            });
            valid = false;
        }

        if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(data)) {
                errors.push({
                    path: dataPath,
                    message: `String does not match pattern: ${schema.pattern}`,
                    schemaPath: `${schemaPath}/pattern`,
                    keyword: 'pattern',
                    params: { pattern: schema.pattern },
                    data
                });
                valid = false;
            }
        }

        if (schema.format && options.validateFormats) {
            const formatValidator = this.customFormats.get(schema.format);
            if (formatValidator) {
                if (!formatValidator(data)) {
                    errors.push({
                        path: dataPath,
                        message: `String does not match format: ${schema.format}`,
                        schemaPath: `${schemaPath}/format`,
                        keyword: 'format',
                        params: { format: schema.format },
                        data
                    });
                    valid = false;
                }
            } else if (!options.allowUnknownFormats) {
                errors.push({
                    path: dataPath,
                    message: `Unknown format: ${schema.format}`,
                    schemaPath: `${schemaPath}/format`,
                    keyword: 'format',
                    params: { format: schema.format },
                    data
                });
                valid = false;
            }
        }

        return valid;
    }

    private async validateNumber(
        data: number,
        schema: Schema,
        dataPath: string,
        schemaPath: string,
        errors: any[],
        _options: SchemaOptions
    ): Promise<boolean> {
        let valid = true;

        if (schema.minimum !== undefined) {
            if (schema.exclusiveMinimum === true && data <= schema.minimum) {
                errors.push({
                    path: dataPath,
                    message: `Number must be > ${schema.minimum}`,
                    schemaPath: `${schemaPath}/exclusiveMinimum`,
                    keyword: 'exclusiveMinimum',
                    params: { limit: schema.minimum, exclusive: true },
                    data
                });
                valid = false;
            } else if (data < schema.minimum) {
                errors.push({
                    path: dataPath,
                    message: `Number must be >= ${schema.minimum}`,
                    schemaPath: `${schemaPath}/minimum`,
                    keyword: 'minimum',
                    params: { limit: schema.minimum },
                    data
                });
                valid = false;
            }
        }

        if (schema.maximum !== undefined) {
            if (schema.exclusiveMaximum === true && data >= schema.maximum) {
                errors.push({
                    path: dataPath,
                    message: `Number must be < ${schema.maximum}`,
                    schemaPath: `${schemaPath}/exclusiveMaximum`,
                    keyword: 'exclusiveMaximum',
                    params: { limit: schema.maximum, exclusive: true },
                    data
                });
                valid = false;
            } else if (data > schema.maximum) {
                errors.push({
                    path: dataPath,
                    message: `Number must be <= ${schema.maximum}`,
                    schemaPath: `${schemaPath}/maximum`,
                    keyword: 'maximum',
                    params: { limit: schema.maximum },
                    data
                });
                valid = false;
            }
        }

        if (schema.multipleOf !== undefined) {
            const division = data / schema.multipleOf;
            if (division !== Math.floor(division)) {
                errors.push({
                    path: dataPath,
                    message: `Number must be multiple of ${schema.multipleOf}`,
                    schemaPath: `${schemaPath}/multipleOf`,
                    keyword: 'multipleOf',
                    params: { multipleOf: schema.multipleOf },
                    data
                });
                valid = false;
            }
        }

        return valid;
    }

    private async validateEnum(
        data: any,
        enumValues: any[],
        dataPath: string,
        schemaPath: string,
        errors: any[]
    ): Promise<boolean> {
        const found = enumValues.some(value => this.deepEqual(data, value));
        
        if (!found) {
            errors.push({
                path: dataPath,
                message: `Value must be one of: ${enumValues.map(v => JSON.stringify(v)).join(', ')}`,
                schemaPath: `${schemaPath}/enum`,
                keyword: 'enum',
                params: { allowedValues: enumValues },
                data
            });
            return false;
        }

        return true;
    }

    private async validateConst(
        data: any,
        constValue: any,
        dataPath: string,
        schemaPath: string,
        errors: any[]
    ): Promise<boolean> {
        if (!this.deepEqual(data, constValue)) {
            errors.push({
                path: dataPath,
                message: `Value must be exactly: ${JSON.stringify(constValue)}`,
                schemaPath: `${schemaPath}/const`,
                keyword: 'const',
                params: { allowedValue: constValue },
                data
            });
            return false;
        }

        return true;
    }

    private async validateConditional(
        data: any,
        schema: Schema,
        dataPath: string,
        schemaPath: string,
        errors: any[],
        options: SchemaOptions
    ): Promise<boolean> {
        if (!schema.if) return true;

        const ifErrors: any[] = [];
        const ifValid = await this.validateData(
            data,
            schema.if,
            dataPath,
            `${schemaPath}/if`,
            ifErrors,
            { ...options, allErrors: false }
        );

        if (ifValid && schema.then) {
            return this.validateData(
                data,
                schema.then,
                dataPath,
                `${schemaPath}/then`,
                errors,
                options
            );
        } else if (!ifValid && schema.else) {
            return this.validateData(
                data,
                schema.else,
                dataPath,
                `${schemaPath}/else`,
                errors,
                options
            );
        }

        return true;
    }

    private deepEqual(a: any, b: any): boolean {
        if (a === b) return true;
        
        if (a === null || b === null) return false;
        if (a === undefined || b === undefined) return false;
        
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            
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

    private async resolveReference(ref: string): Promise<Schema> {
        if (ref.startsWith('#/definitions/')) {
            throw new Error(`Schema reference resolution not implemented: ${ref}`);
        }

        throw new Error(`Cannot resolve schema reference: ${ref}`);
    }

    private initializeFormats(): void {
        this.customFormats.set('date-time', (value: string) => {
            const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
            return regex.test(value) && !isNaN(Date.parse(value));
        });

        this.customFormats.set('date', (value: string) => {
            const regex = /^\d{4}-\d{2}-\d{2}$/;
            return regex.test(value) && !isNaN(Date.parse(value));
        });

        this.customFormats.set('time', (value: string) => {
            const regex = /^\d{2}:\d{2}:\d{2}(\.\d{3})?$/;
            return regex.test(value);
        });

        this.customFormats.set('email', (value: string) => {
            const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return regex.test(value);
        });

        this.customFormats.set('hostname', (value: string) => {
            const regex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
            return regex.test(value);
        });

        this.customFormats.set('ipv4', (value: string) => {
            const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            return regex.test(value);
        });

        this.customFormats.set('ipv6', (value: string) => {
            const regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
            return regex.test(value);
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
            try {
                new URL(value, 'http://example.com');
                return true;
            } catch {
                return false;
            }
        });

        this.customFormats.set('uuid', (value: string) => {
            const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            return regex.test(value);
        });

        this.customFormats.set('json-pointer', (value: string) => {
            return value === '' || (value.startsWith('/') && !value.includes('~') || /~[01]/.test(value));
        });

        this.customFormats.set('relative-json-pointer', (value: string) => {
            return /^\d+(\/|$)/.test(value);
        });

        this.customFormats.set('regex', (value: string) => {
            try {
                new RegExp(value);
                return true;
            } catch {
                return false;
            }
        });
    }

    private initializeKeywords(): void {
        this.customKeywords.set('range', (value: any, range: { min?: number; max?: number }) => {
            if (typeof value !== 'number') return false;
            if (range.min !== undefined && value < range.min) return false;
            if (range.max !== undefined && value > range.max) return false;
            return true;
        });

        this.customKeywords.set('notEmpty', (value: any, notEmpty: boolean) => {
            if (!notEmpty) return true;
            
            if (value === null || value === undefined) return false;
            if (typeof value === 'string' && value.trim() === '') return false;
            if (Array.isArray(value) && value.length === 0) return false;
            if (typeof value === 'object' && Object.keys(value).length === 0) return false;
            
            return true;
        });

        this.customKeywords.set('uniqueBy', (value: any[], property: string) => {
            if (!Array.isArray(value)) return true;
            
            const seen = new Set<any>();
            for (const item of value) {
                const key = item?.[property];
                if (key !== undefined) {
                    if (seen.has(key)) return false;
                    seen.add(key);
                }
            }
            
            return true;
        });
    }

    registerFormat(name: string, validator: (value: any) => boolean): void {
        this.customFormats.set(name, validator);
        logger.debug(`Registered custom format: ${name}`);
    }

    registerKeyword(
        name: string,
        validator: (value: any, schema: any, parentSchema: any) => boolean
    ): void {
        this.customKeywords.set(name, validator);
        logger.debug(`Registered custom keyword: ${name}`);
    }

    createSchemaFromData(
        data: any,
        options?: {
            required?: boolean;
            additionalProperties?: boolean;
            examples?: boolean;
        }
    ): Schema {
        const opts = {
            required: true,
            additionalProperties: false,
            examples: true,
            ...options
        };

        const schema = this.generateSchema(data, opts);
        
        if (opts.examples) {
            schema.examples = [data];
        }

        return schema;
    }

    private generateSchema(data: any, options: any): Schema {
        if (data === null) {
            return { type: 'null' };
        }

        const type = Array.isArray(data) ? 'array' : typeof data;

        switch (type) {
            case 'object':
                const objectSchema: Schema = {
                    type: 'object',
                    properties: {},
                    required: []
                };

                for (const [key, value] of Object.entries(data)) {
                    objectSchema.properties![key] = this.generateSchema(value, options);
                    if (options.required) {
                        objectSchema.required!.push(key);
                    }
                }

                if (options.additionalProperties === false) {
                    objectSchema.additionalProperties = false;
                }

                return objectSchema;

            case 'array':
                const arraySchema: Schema = {
                    type: 'array'
                };

                if (data.length > 0) {
                    const firstType = this.getType(data[0]);
                    const sameType = data.every((item: any) => this.getType(item) === firstType);

                    if (sameType) {
                        arraySchema.items = this.generateSchema(data[0], options);
                    } else {
                        const schemas = data.map((item: any) => this.generateSchema(item, options));
                        arraySchema.items = { oneOf: schemas };
                    }
                }

                return arraySchema;

            case 'string':
                const stringSchema: Schema = { type: 'string' };
                
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) {
                    stringSchema.format = 'email';
                } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data)) {
                    stringSchema.format = 'date-time';
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
                    stringSchema.format = 'date';
                } else if (/^https?:\/\//.test(data)) {
                    stringSchema.format = 'uri';
                } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data)) {
                    stringSchema.format = 'uuid';
                }

                stringSchema.minLength = 0;
                stringSchema.maxLength = Math.max(data.length * 2, 100);

                return stringSchema;

            case 'number':
                return {
                    type: Number.isInteger(data) ? 'integer' : 'number',
                    minimum: data - Math.abs(data * 0.5),
                    maximum: data + Math.abs(data * 0.5)
                };

            case 'boolean':
                return { type: 'boolean' };

            default:
                return { type: 'string' };
        }
    }

    mergeSchemas(schemas: Schema[]): Schema {
        if (schemas.length === 0) {
            return {};
        }

        if (schemas.length === 1) {
            return schemas[0]!;
        }

        const types = schemas.map(s => s.type).filter(Boolean);
        const uniqueTypes = [...new Set(types)];

        if (uniqueTypes.length === 1) {
            const type = uniqueTypes[0];
            
            if (type === 'object') {
                const merged: Schema = {
                    type: 'object',
                    properties: {},
                    required: []
                };

                for (const schema of schemas) {
                    if (schema.properties) {
                        for (const [key, propSchema] of Object.entries(schema.properties)) {
                            const mergedProps = merged.properties!;
                            if (!mergedProps[key]) {
                                mergedProps[key] = propSchema;
                            } else {
                                mergedProps[key] = this.mergeSchemas([
                                    mergedProps[key]!,
                                    propSchema
                                ]);
                            }
                        }
                    }

                    if (schema.required) {
                        for (const req of schema.required) {
                            if (!merged.required!.includes(req)) {
                                merged.required!.push(req);
                            }
                        }
                    }
                }

                return merged;
            }
        }

        return {
            anyOf: schemas
        };
    }
}
