// src/data/parsers/JSONParser.ts

import { ParserOptions, DataSchema } from '../types/data.types';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { TypeConverter } from '../transformers/TypeConverter';
const jsonpath = require('jsonpath');

export class JSONParser {
    private typeConverter: TypeConverter;
    
    constructor() {
        this.typeConverter = new TypeConverter();
    }

    async parse(content: string, options: ParserOptions = {}): Promise<{
        data: any;
        metadata?: Record<string, any>;
    }> {
        const startTime = Date.now();
        
        try {
            let parsed: any;
            try {
                parsed = JSON.parse(content);
            } catch (error: any) {
                throw new Error(`Invalid JSON: ${error.message} at position ${this.findErrorPosition(content, error)}`);
            }
            
            let data = parsed;
            if (options.jsonPath) {
                try {
                    console.log(`🔍 DEBUG JSONParser: Applying JSONPath = "${options.jsonPath}"`);
                    console.log(`🔍 DEBUG JSONParser: Input data structure:`, JSON.stringify(Object.keys(parsed), null, 2));
                    
                    data = jsonpath.query(parsed, options.jsonPath);
                    
                    console.log(`🔍 DEBUG JSONParser: JSONPath query returned ${Array.isArray(data) ? data.length : 'non-array'} results`);
                    if (Array.isArray(data) && data.length > 0) {
                        console.log(`🔍 DEBUG JSONParser: First result:`, JSON.stringify(data[0], null, 2));
                    }
                    
                    if (options.jsonPath.startsWith('$..')) {
                    } else if (data.length === 1 && !options.jsonPath.includes('[*]') && !options.jsonPath.includes('.*')) {
                        data = data[0];
                    }
                } catch (error: any) {
                    throw new Error(`Invalid JSONPath "${options.jsonPath}": ${error.message}`);
                }
            }
            
            const parseOptions = options as any;
            if (parseOptions.parseNumbers || parseOptions.parseDates) {
                data = await this.convertTypes(data, options);
            }
            
            const parseTime = Date.now() - startTime;
            
            ActionLogger.logInfo('Parser operation: json_parse', {
                operation: 'json_parse',
                jsonPath: options.jsonPath,
                resultType: Array.isArray(data) ? 'array' : typeof data,
                parseTime
            });
            
            return {
                data,
                metadata: {
                    originalType: Array.isArray(parsed) ? 'array' : typeof parsed,
                    jsonPath: options.jsonPath,
                    resultCount: Array.isArray(data) ? data.length : 1,
                    parseTime,
                    size: content.length
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Parser error: json_parse_failed', error as Error);
            throw this.enhanceError(error, 'parse');
        }
    }

    async *parseStream(lines: AsyncIterable<string>, options: ParserOptions = {}): AsyncIterableIterator<any> {
        let lineNumber = 0;
        
        for await (const line of lines) {
            lineNumber++;
            
            if (!line.trim()) continue;
            
            try {
                const parsed = JSON.parse(line);
                
                let data = parsed;
                if (options.jsonPath) {
                    const results = jsonpath.query(parsed, options.jsonPath);
                    if (results.length > 0) {
                        data = results[0];
                    } else {
                        continue;
                    }
                }
                
                const convertOptions = options as any;
                if (convertOptions.parseNumbers || convertOptions.parseDates) {
                    data = await this.convertTypes(data, options);
                }
                
                yield data;
                
            } catch (error: any) {
                logger.error(`Failed to parse JSON at line ${lineNumber}: ${error.message}`);
                const streamOptions = options as any;
                if (streamOptions.skipInvalidLines) {
                    continue;
                } else {
                    throw new Error(`Invalid JSON at line ${lineNumber}: ${error.message}`);
                }
            }
        }
    }

    async inferSchema(data: any, options: {
        sampleSize?: number;
        detectTypes?: boolean;
        detectRequired?: boolean;
        detectUnique?: boolean;
    } = {}): Promise<DataSchema> {
        let records: any[];
        if (Array.isArray(data)) {
            records = data;
        } else if (typeof data === 'object' && data !== null) {
            records = [data];
        } else {
            throw new Error('Data must be an object or array of objects');
        }
        
        const sample = records.slice(0, options.sampleSize || Math.min(100, records.length));
        
        const fieldAnalysis = this.analyzeStructure(sample, options);
        
        return this.buildSchema(fieldAnalysis);
    }

    async validateSchema(data: any, schema: any): Promise<{
        valid: boolean;
        errors: string[];
    }> {
        const errors: string[] = [];
        
        
        const validate = (obj: any, schemaObj: any, path: string = '') => {
            if (schemaObj.type) {
                const actualType = Array.isArray(obj) ? 'array' : typeof obj;
                if (actualType !== schemaObj.type) {
                    errors.push(`${path}: Expected ${schemaObj.type}, got ${actualType}`);
                }
            }
            
            if (schemaObj.properties && typeof obj === 'object' && obj !== null) {
                for (const [key, propSchema] of Object.entries(schemaObj.properties)) {
                    const propPath = path ? `${path}.${key}` : key;
                    const schemaProp = propSchema as any;
                    
                    if (schemaProp.required && !(key in obj)) {
                        errors.push(`${propPath}: Required property missing`);
                    } else if (key in obj) {
                        validate(obj[key], schemaProp, propPath);
                    }
                }
            }
            
            if (schemaObj.items && Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    validate(item, schemaObj.items, `${path}[${index}]`);
                });
            }
        };
        
        validate(data, schema);
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    toFormat(data: any, format: 'csv' | 'xml' | 'yaml'): string {
        switch (format) {
            case 'csv':
                return this.toCSV(data);
            case 'xml':
                return this.toXML(data);
            case 'yaml':
                return this.toYAML(data);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    private toCSV(data: any): string {
        const records = Array.isArray(data) ? data : [data];
        if (records.length === 0) return '';
        
        const keys = new Set<string>();
        records.forEach(record => {
            if (typeof record === 'object' && record !== null) {
                Object.keys(record).forEach(key => keys.add(key));
            }
        });
        
        const headers = Array.from(keys);
        const rows: string[] = [];
        
        rows.push(headers.map(h => this.escapeCSV(h)).join(','));
        
        for (const record of records) {
            const values = headers.map(header => {
                const value = record[header];
                return this.escapeCSV(value);
            });
            rows.push(values.join(','));
        }
        
        return rows.join('\n');
    }

    private toXML(data: any, rootName: string = 'root', indent: string = ''): string {
        const nextIndent = indent + '  ';
        
        if (Array.isArray(data)) {
            const items = data.map(item => 
                `${nextIndent}<item>\n${this.toXML(item, 'item', nextIndent)}\n${nextIndent}</item>`
            ).join('\n');
            return `${indent}<${rootName}>\n${items}\n${indent}</${rootName}>`;
        } else if (typeof data === 'object' && data !== null) {
            const elements = Object.entries(data).map(([key, value]) => {
                const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
                if (typeof value === 'object') {
                    return `${nextIndent}<${safeKey}>\n${this.toXML(value, safeKey, nextIndent)}\n${nextIndent}</${safeKey}>`;
                } else {
                    return `${nextIndent}<${safeKey}>${this.escapeXML(String(value))}</${safeKey}>`;
                }
            }).join('\n');
            return elements;
        } else {
            return `${indent}${this.escapeXML(String(data))}`;
        }
    }

    private toYAML(data: any, indent: number = 0): string {
        const spaces = '  '.repeat(indent);
        
        if (data === null || data === undefined) {
            return 'null';
        } else if (typeof data === 'boolean' || typeof data === 'number') {
            return String(data);
        } else if (typeof data === 'string') {
            if (data.includes(':') || data.includes('#') || data.includes('\n')) {
                return `"${data.replace(/"/g, '\\"')}"`;
            }
            return data;
        } else if (Array.isArray(data)) {
            if (data.length === 0) return '[]';
            return data.map(item => {
                const value = this.toYAML(item, indent + 1);
                if (typeof item === 'object' && item !== null) {
                    return `${spaces}-\n${spaces}  ${value}`;
                } else {
                    return `${spaces}- ${value}`;
                }
            }).join('\n');
        } else if (typeof data === 'object') {
            const entries = Object.entries(data);
            if (entries.length === 0) return '{}';
            return entries.map(([key, value]) => {
                const yamlValue = this.toYAML(value, indent + 1);
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    return `${spaces}${key}:\n${yamlValue}`;
                } else if (Array.isArray(value) && value.length > 0) {
                    return `${spaces}${key}:\n${yamlValue}`;
                } else {
                    return `${spaces}${key}: ${yamlValue}`;
                }
            }).join('\n');
        } else {
            return String(data);
        }
    }

    private analyzeStructure(records: any[], _options: any): Map<string, any> {
        const fieldAnalysis = new Map<string, any>();
        
        const analyzeValue = (value: any, path: string[]) => {
            const key = path.join('.');
            
            if (!fieldAnalysis.has(key)) {
                fieldAnalysis.set(key, {
                    path,
                    types: new Set(),
                    formats: new Set(),
                    values: new Set(),
                    nullCount: 0,
                    totalCount: 0,
                    nested: false,
                    array: false,
                    arrayTypes: new Set()
                });
            }
            
            const analysis = fieldAnalysis.get(key)!;
            analysis.totalCount++;
            
            if (value === null || value === undefined) {
                analysis.nullCount++;
            } else if (Array.isArray(value)) {
                analysis.array = true;
                analysis.types.add('array');
                
                value.forEach(item => {
                    if (item !== null && item !== undefined) {
                        analysis.arrayTypes.add(typeof item);
                        if (typeof item === 'object' && !Array.isArray(item)) {
                            analyzeObject(item, [...path, '[]']);
                        }
                    }
                });
            } else if (typeof value === 'object') {
                analysis.types.add('object');
                analysis.nested = true;
                
                analyzeObject(value, path);
            } else {
                analysis.types.add(typeof value);
                
                if (analysis.values.size < 100) {
                    analysis.values.add(value);
                }
                
                if (typeof value === 'string') {
                    const format = this.detectStringFormat(value);
                    if (format) {
                        analysis.formats.add(format);
                    }
                }
            }
        };
        
        const analyzeObject = (obj: any, parentPath: string[]) => {
            for (const [key, value] of Object.entries(obj)) {
                analyzeValue(value, [...parentPath, key]);
            }
        };
        
        for (const record of records) {
            if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
                analyzeObject(record, []);
            } else {
                analyzeValue(record, ['value']);
            }
        }
        
        return fieldAnalysis;
    }

    private buildSchema(fieldAnalysis: Map<string, any>): DataSchema {
        const fields: any[] = [];
        const processedPaths = new Set<string>();
        
        const sortedEntries = Array.from(fieldAnalysis.entries())
            .sort(([a], [b]) => a.split('.').length - b.split('.').length);
        
        for (const [key, analysis] of sortedEntries) {
            const pathParts = key.split('.');
            let isChild = false;
            for (let i = 1; i < pathParts.length; i++) {
                const parentPath = pathParts.slice(0, i).join('.');
                if (processedPaths.has(parentPath)) {
                    const parentAnalysis = fieldAnalysis.get(parentPath);
                    if (parentAnalysis && parentAnalysis.nested) {
                        isChild = true;
                        break;
                    }
                }
            }
            
            if (isChild) continue;
            
            const field: any = {
                name: key,
                type: this.consolidateTypes(Array.from(analysis.types)),
                required: analysis.nullCount === 0,
                nullable: analysis.nullCount > 0
            };
            
            if (analysis.array) {
                field.type = 'array';
                if (analysis.arrayTypes.size === 1) {
                    field.items = {
                        type: Array.from(analysis.arrayTypes)[0]
                    };
                } else if (analysis.arrayTypes.size > 1) {
                    field.items = {
                        type: 'any'
                    };
                }
            }
            
            if (analysis.nested) {
                field.type = 'object';
                field.properties = {};
                
                for (const [childKey, childAnalysis] of fieldAnalysis.entries()) {
                    if (childKey.startsWith(key + '.') && !childKey.includes('[]')) {
                        const childName = childKey.substring(key.length + 1);
                        if (!childName.includes('.')) {
                            field.properties[childName] = {
                                type: this.consolidateTypes(Array.from(childAnalysis.types)),
                                required: childAnalysis.nullCount === 0
                            };
                        }
                    }
                }
            }
            
            if (analysis.formats.size === 1) {
                field.format = Array.from(analysis.formats)[0];
            }
            
            if (analysis.values.size <= 10 && analysis.values.size > 1) {
                field.enum = Array.from(analysis.values);
            }
            
            fields.push(field);
            processedPaths.add(key);
        }
        
        return {
            version: '1.0',
            fields
        };
    }

    private async convertTypes(data: any, options: ParserOptions): Promise<any> {
        if (data === null || data === undefined) {
            return data;
        } else if (Array.isArray(data)) {
            return await Promise.all(data.map(item => this.convertTypes(item, options)));
        } else if (typeof data === 'object') {
            const converted: any = {};
            for (const [key, value] of Object.entries(data)) {
                converted[key] = await this.convertTypes(value, options);
            }
            return converted;
        } else {
            const conversionOptions = options as any;
            const result = await this.typeConverter.convert(data, 'auto', {
                parseNumbers: conversionOptions.parseNumbers,
                parseDates: conversionOptions.parseDates,
                parseBooleans: true
            });
            return result.success ? result.value : data;
        }
    }

    private detectStringFormat(value: string): string | null {
        if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value)) {
            return 'date-time';
        }
        
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return 'email';
        }
        
        if (/^https?:\/\/[^\s]+$/.test(value)) {
            return 'uri';
        }
        
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            return 'uuid';
        }
        
        if (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(value)) {
            return 'ipv4';
        }
        
        return null;
    }

    private consolidateTypes(types: string[]): string {
        if (types.length === 0) return 'any';
        if (types.length === 1) return types[0] || 'any';
        
        const definedTypes = types.filter(t => t !== 'null' && t !== 'undefined');
        if (definedTypes.length === 0) return 'any';
        if (definedTypes.length === 1) return definedTypes[0] || 'any';
        
        if (definedTypes.includes('object')) return 'object';
        if (definedTypes.includes('array')) return 'array';
        
        return 'any';
    }

    private escapeCSV(value: any): string {
        if (value === null || value === undefined) return '';
        
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        
        return str;
    }

    private escapeXML(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private findErrorPosition(_content: string, error: any): string {
        if (error.message && error.message.includes('position')) {
            return error.message;
        }
        
        const match = error.message.match(/line (\d+) column (\d+)/);
        if (match) {
            return `line ${match[1]}, column ${match[2]}`;
        }
        
        return 'unknown position';
    }

    private enhanceError(error: any, operation: string): Error {
        const message = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(
            `JSON Parser Error [${operation}]: ${message}\n` +
            `This may be due to invalid JSON syntax, incorrect JSONPath, or type conversion issues.`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}
