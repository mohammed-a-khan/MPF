// src/data/handlers/JSONHandler.ts

import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation } from '../types/data.types';
import { JSONParser } from '../parsers/JSONParser';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream, statSync } from 'fs';
// import { pipeline } from 'stream/promises'; // Not used
import * as readline from 'readline';

/**
 * Handler for JSON files
 * Supports JSONPath queries, streaming for large files, and JSONL format
 */
export class JSONHandler implements DataHandler {
    private parser: JSONParser;
    private validator: DataValidator;
    private transformer: DataTransformer;
    private streamingThreshold: number;
    
    constructor() {
        this.parser = new JSONParser();
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
        this.streamingThreshold = parseInt(process.env['JSON_STREAMING_THRESHOLD'] || '10485760'); // 10MB
    }

    /**
     * Load data from JSON file
     */
    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: json_load', { operation: 'json_load', options });
        
        try {
            // Validate file exists
            const filePath = await this.resolveFilePath(options.source!);
            await this.validateFile(filePath);
            
            // Determine format
            const format = await this.detectFormat(filePath, options);
            
            let data: TestData[];
            let metadata: Record<string, any>;
            
            // Load based on format
            if (format === 'jsonl' || format === 'ndjson') {
                const result = await this.loadJSONL(filePath, options);
                data = result.data;
                metadata = result.metadata || {};
            } else {
                // Regular JSON
                const fileSize = this.getFileSize(filePath);
                const useStreaming = options.streaming || (fileSize > this.streamingThreshold && options.jsonPath);
                
                if (useStreaming) {
                    logger.debug(`Using streaming for large JSON file: ${fileSize} bytes`);
                    const result = await this.loadStreaming(filePath, options);
                    data = result.data;
                    metadata = result.metadata || {};
                } else {
                    // Load entire file
                    const content = await fs.readFile(filePath, 'utf-8');
                    const jsonOptions = options as any;
                    const parseResult = await this.parser.parse(content, {
                        jsonPath: jsonOptions.jsonPath,
                        // Note: These options are passed as any to the parser
                        ...jsonOptions
                    } as any);
                    
                    data = this.normalizeData(parseResult.data);
                    metadata = parseResult.metadata || {};
                }
            }
            
            // Apply filter if specified
            if (options.filter) {
                data = data.filter(row => this.matchesFilter(row, options.filter!));
            }
            
            // Apply transformations if specified
            if (options.transformations && options.transformations.length > 0) {
                data = await this.transformer.transform(data, options.transformations);
            }
            
            const loadTime = Date.now() - startTime;
            
            return {
                data,
                metadata: {
                    ...metadata,
                    totalRecords: data.length,
                    loadTime,
                    source: filePath,
                    format,
                    fileSize: this.getFileSize(filePath)
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: json_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Load JSON file using streaming with JSONPath
     */
    private async loadStreaming(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const data: TestData[] = [];
        const jsonPath = options.jsonPath || '$.*';
        
        return new Promise((resolve, reject) => {
            const readStream = createReadStream(filePath, { encoding: 'utf-8' });
            let buffer = '';
            let depth = 0;
            let inString = false;
            let escapeNext = false;
            let currentObject = '';
            let pathStack: string[] = [];
            let currentPath = '$';
            let recordCount = 0;
            
            const processObject = (obj: string) => {
                try {
                    const parsed = JSON.parse(obj);
                    const normalized = this.normalizeItem(parsed);
                    
                    // Check if matches JSONPath
                    if (this.matchesJSONPath(currentPath, jsonPath)) {
                        // Apply filter inline for efficiency
                        if (!options.filter || this.matchesFilter(normalized, options.filter)) {
                            data.push(normalized);
                            recordCount++;
                            
                            // Check max records
                            if (options.maxRecords && recordCount >= options.maxRecords) {
                                readStream.destroy();
                            }
                        }
                    }
                } catch (error) {
                    logger.warn(`Failed to parse JSON object: ${error}`);
                }
            };
            
            readStream.on('data', (chunk: string | Buffer) => {
                const chunkStr = chunk instanceof Buffer ? chunk.toString() : chunk;
                buffer += chunkStr;
                
                for (let i = 0; i < buffer.length; i++) {
                    const char = buffer[i];
                    const prevChar = i > 0 ? buffer[i - 1] : '';
                    
                    // Handle string state
                    if (!escapeNext && char === '"' && prevChar !== '\\') {
                        inString = !inString;
                    }
                    
                    if (escapeNext) {
                        escapeNext = false;
                    } else if (char === '\\') {
                        escapeNext = true;
                    }
                    
                    if (!inString) {
                        if (char === '{' || char === '[') {
                            if (depth === 0) {
                                currentObject = '';
                            }
                            depth++;
                            
                            // Update path
                            if (char === '[') {
                                pathStack.push('[0]');
                            } else {
                                pathStack.push('');
                            }
                            currentPath = this.buildPath(pathStack);
                        } else if (char === '}' || char === ']') {
                            depth--;
                            
                            if (depth === 0 && currentObject) {
                                processObject(currentObject + char);
                                currentObject = '';
                            }
                            
                            // Update path
                            pathStack.pop();
                            currentPath = this.buildPath(pathStack);
                        }
                    }
                    
                    if (depth > 0) {
                        currentObject += char;
                    }
                }
                
                // Keep unparsed data for next chunk
                if (depth === 0) {
                    buffer = '';
                }
            });
            
            readStream.on('end', () => {
                resolve({
                    data: options.maxRecords ? data.slice(0, options.maxRecords) : data,
                    metadata: {
                        totalRecords: data.length,
                        streaming: true,
                        jsonPath,
                        recordsFound: recordCount
                    }
                });
            });
            
            readStream.on('error', reject);
        });
    }

    /**
     * Load JSONL (JSON Lines) format
     */
    private async loadJSONL(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const data: TestData[] = [];
        const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        let errorCount = 0;
        let skippedLines = 0;
        const jsonOptions = options as any;
        
        for await (const line of rl) {
            lineNumber++;
            
            // Skip empty lines
            if (!line.trim()) {
                skippedLines++;
                continue;
            }
            
            // Skip comment lines if allowed
            if (jsonOptions.allowComments && line.trim().startsWith('//')) {
                skippedLines++;
                continue;
            }
            
            try {
                const parsed = JSON.parse(line);
                const normalized = this.normalizeItem(parsed);
                
                // Apply JSONPath if specified
                if (options.jsonPath) {
                    const extracted = this.extractByJSONPath(normalized, options.jsonPath);
                    if (extracted !== undefined) {
                        data.push(this.normalizeItem(extracted));
                    }
                } else {
                    data.push(normalized);
                }
                
                // Check max records
                if (options.maxRecords && data.length >= options.maxRecords) {
                    break;
                }
            } catch (error) {
                errorCount++;
                if (jsonOptions.skipInvalidLines) {
                    logger.warn(`Invalid JSON on line ${lineNumber}: ${error}`);
                    skippedLines++;
                } else {
                    throw new Error(`Invalid JSON on line ${lineNumber}: ${error}`);
                }
            }
        }
        
        return {
            data,
            metadata: {
                format: 'jsonl',
                totalRecords: data.length,
                totalLines: lineNumber,
                skippedLines,
                errorCount,
                validRecords: data.length
            }
        };
    }

    /**
     * Stream data from JSON file
     */
    async *stream(options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const filePath = await this.resolveFilePath(options.source!);
        const format = await this.detectFormat(filePath, options);
        
        if (format === 'jsonl' || format === 'ndjson') {
            yield* this.streamJSONL(filePath, options);
        } else {
            // For regular JSON, we need to parse structure
            yield* this.streamJSON(filePath, options);
        }
    }

    /**
     * Stream JSONL format
     */
    private async *streamJSONL(filePath: string, options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        let recordCount = 0;
        const jsonOptions = options as any;
        
        for await (const line of rl) {
            lineNumber++;
            
            // Skip empty lines
            if (!line.trim()) continue;
            
            // Skip comments if allowed
            if (jsonOptions.allowComments && line.trim().startsWith('//')) continue;
            
            try {
                const parsed = JSON.parse(line);
                const normalized = this.normalizeItem(parsed);
                
                // Apply filter
                if (options.filter && !this.matchesFilter(normalized, options.filter)) {
                    continue;
                }
                
                yield normalized;
                recordCount++;
                
                // Check max records
                if (options.maxRecords && recordCount >= options.maxRecords) {
                    break;
                }
            } catch (error) {
                if (!jsonOptions.skipInvalidLines) {
                    throw new Error(`Invalid JSON on line ${lineNumber}: ${error}`);
                }
            }
        }
    }

    /**
     * Stream regular JSON format
     */
    private async *streamJSON(filePath: string, options: DataProviderOptions): AsyncIterableIterator<TestData> {
        // For regular JSON, we need to load and parse the structure
        // Use the streaming parser for large files
        const fileSize = this.getFileSize(filePath);
        
        if (fileSize > this.streamingThreshold) {
            // Use streaming approach
            const result = await this.loadStreaming(filePath, options);
            for (const record of result.data) {
                yield record;
            }
        } else {
            // Load entire file for small files
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(content);
            const data = this.normalizeData(parsed);
            
            for (const record of data) {
                if (!options.filter || this.matchesFilter(record, options.filter)) {
                    yield record;
                }
            }
        }
    }

    /**
     * Load partial data
     */
    async loadPartial(
        options: DataProviderOptions, 
        offset: number, 
        limit: number
    ): Promise<DataProviderResult> {
        const data: TestData[] = [];
        let currentIndex = 0;
        
        for await (const record of this.stream(options)) {
            if (currentIndex >= offset && data.length < limit) {
                data.push(record);
            }
            
            currentIndex++;
            
            if (data.length >= limit) {
                break;
            }
        }
        
        return {
            data,
            metadata: {
                totalRecords: data.length,
                offset,
                limit,
                hasMore: currentIndex > offset + limit
            }
        };
    }

    /**
     * Load schema from JSON file
     */
    async loadSchema(options: DataProviderOptions): Promise<any> {
        const filePath = await this.resolveFilePath(options.source!);
        const format = await this.detectFormat(filePath, options);
        
        if (format === 'jsonl') {
            // Sample first N records for schema
            const sampleOptions = { ...options, maxRecords: 100 };
            const sampleData = await this.load(sampleOptions);
            return this.inferSchema(sampleData.data);
        } else {
            // Try to load JSON Schema if present
            const schemaPath = filePath.replace(/\.json$/, '.schema.json');
            if (await this.fileExists(schemaPath)) {
                const schemaContent = await fs.readFile(schemaPath, 'utf-8');
                return JSON.parse(schemaContent);
            }
            
            // Otherwise infer from data
            const sampleOptions = { ...options, maxRecords: 100 };
            const sampleData = await this.load(sampleOptions);
            return this.inferSchema(sampleData.data);
        }
    }

    /**
     * Get metadata about JSON file
     */
    async getMetadata(options: DataProviderOptions): Promise<Record<string, any>> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const stats = await fs.stat(filePath);
            const format = await this.detectFormat(filePath, options);
            
            const metadata: Record<string, any> = {
                filePath,
                fileSize: stats.size,
                modifiedDate: stats.mtime,
                createdDate: stats.birthtime,
                format
            };
            
            if (format === 'jsonl') {
                // Count lines for JSONL
                let lineCount = 0;
                const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
                const rl = readline.createInterface({ input: fileStream });
                
                for await (const _line of rl) {
                    lineCount++;
                }
                
                metadata['lineCount'] = lineCount;
            } else {
                // For regular JSON, try to get structure info
                if (stats.size < 1048576) { // 1MB
                    const content = await fs.readFile(filePath, 'utf-8');
                    const parsed = JSON.parse(content);
                    
                    metadata['rootType'] = Array.isArray(parsed) ? 'array' : 'object';
                    metadata['rootKeys'] = Array.isArray(parsed) ? null : Object.keys(parsed);
                    metadata['arrayLength'] = Array.isArray(parsed) ? parsed.length : null;
                }
            }
            
            return metadata;
            
        } catch (error) {
            ActionLogger.logError('Data handler error: json_metadata_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    /**
     * Validate data
     */
    async validate(data: TestData[], options?: any): Promise<ValidationResult> {
        // If schema is provided, validate against it
        if (options?.schema) {
            try {
                // Import SchemaValidator dynamically
                const { SchemaValidator } = await import('../validators/SchemaValidator');
                const schemaValidator = new SchemaValidator();
                
                // Validate data against schema
                const schemaResult = await schemaValidator.validate(data, options.schema, {
                    strict: options.strict !== false,
                    allErrors: true,
                    verbose: true
                });
                
                // Convert schema validation result to ValidationResult
                const result: ValidationResult = {
                    isValid: schemaResult.valid,
                    errors: schemaResult.errors.map(e => e.message),
                    details: schemaResult.errors.map(e => ({
                        field: e.path,
                        value: e.data,
                        error: e.message
                    }))
                };
                
                if (schemaResult.warnings && schemaResult.warnings.length > 0) {
                    result.warnings = schemaResult.warnings.map(w => w.message);
                }
                
                return result;
            } catch (error) {
                logger.error('Schema validation error', error as Error);
                return {
                    isValid: false,
                    errors: [`Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
                };
            }
        }
        
        // Otherwise use data validator
        const validationRules: Record<string, any> = {};
        
        const result = await this.validator.validate(data, validationRules, {
            validateRequired: true,
            validateTypes: true,
            stopOnFirstError: false
        });
        
        return {
            isValid: result.valid,
            errors: result.errors.map(e => typeof e === 'string' ? e : 'Validation error'),
            warnings: result.warnings?.map(w => typeof w === 'string' ? w : 'Validation warning'),
            details: result.errors.map((e, index) => ({
                row: index,
                error: typeof e === 'string' ? e : 'Validation error'
            }))
        };
    }

    /**
     * Transform data
     */
    async transform(data: TestData[], transformations: DataTransformation[]): Promise<TestData[]> {
        return await this.transformer.transform(data, transformations);
    }

    /**
     * Save data to JSON file
     */
    async save(data: TestData[], filePath: string, options?: any): Promise<void> {
        const format = options?.format || this.detectFormatFromPath(filePath);
        
        if (format === 'jsonl') {
            await this.saveAsJSONL(data, filePath, options);
        } else {
            await this.saveAsJSON(data, filePath, options);
        }
    }

    /**
     * Save as regular JSON
     */
    private async saveAsJSON(data: TestData[], filePath: string, _options?: any): Promise<void> {
        const indent = _options?.pretty !== false ? 2 : 0;
        const content = JSON.stringify(data, null, indent);
        
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
    }

    /**
     * Save as JSONL
     */
    private async saveAsJSONL(data: TestData[], filePath: string, _options?: any): Promise<void> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        const writeStream = createWriteStream(filePath, { encoding: 'utf-8' });
        
        for (const record of data) {
            const line = JSON.stringify(record) + '\n';
            writeStream.write(line);
        }
        
        return new Promise((resolve, reject) => {
            writeStream.end(() => resolve());
            writeStream.on('error', reject);
        });
    }

    /**
     * Normalize data to array of objects
     */
    private normalizeData(data: any): TestData[] {
        if (Array.isArray(data)) {
            return data.map(item => this.normalizeItem(item));
        }
        
        if (typeof data === 'object' && data !== null) {
            // If object has array properties, try to find the main data array
            const arrayProps = Object.entries(data).filter(([_, value]) => Array.isArray(value));
            
            if (arrayProps.length === 1) {
                // Single array property - use it
                const arrayValue = arrayProps[0]?.[1];
                return Array.isArray(arrayValue) ? arrayValue.map((item: any) => this.normalizeItem(item)) : [];
            } else if (arrayProps.length > 1) {
                // Multiple arrays - look for common data property names
                const dataProps = ['data', 'records', 'items', 'results', 'rows'];
                const dataProp = arrayProps.find(([key]) => dataProps.includes(key.toLowerCase()));
                
                if (dataProp) {
                    const arrayValue = dataProp[1];
                    return Array.isArray(arrayValue) ? arrayValue.map((item: any) => this.normalizeItem(item)) : [];
                }
            }
            
            // Return object wrapped in array
            return [this.normalizeItem(data)];
        }
        
        // Primitive value - wrap in object
        return [{ value: data }];
    }

    /**
     * Normalize single item
     */
    private normalizeItem(item: any): TestData {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return item;
        }
        
        // Wrap non-objects
        return { value: item };
    }

    /**
     * Detect JSON format
     */
    private async detectFormat(filePath: string, options: DataProviderOptions): Promise<string> {
        // Explicit format
        const jsonOptions = options as any;
        if (jsonOptions.fileFormat) {
            return jsonOptions.fileFormat;
        }
        
        // Check file extension
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.jsonl' || ext === '.ndjson') {
            return 'jsonl';
        }
        
        // Sample file content
        const stream = createReadStream(filePath, { encoding: 'utf-8', end: 1024 });
        const chunks: string[] = [];
        
        for await (const chunk of stream) {
            chunks.push(chunk as string);
        }
        
        const sample = chunks.join('').trim();
        
        // Check if it looks like JSONL
        const lines = sample.split('\n').filter(line => line.trim());
        if (lines.length > 1) {
            try {
                // Try to parse first two lines as separate JSON
                JSON.parse(lines[0] || '');
                JSON.parse(lines[1] || '');
                return 'jsonl';
            } catch {
                // Not JSONL
            }
        }
        
        return 'json';
    }

    /**
     * Detect format from file path
     */
    private detectFormatFromPath(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.jsonl' || ext === '.ndjson') {
            return 'jsonl';
        }
        return 'json';
    }

    /**
     * Resolve file path
     */
    private async resolveFilePath(source: string): Promise<string> {
        // If absolute path, return as is
        if (path.isAbsolute(source)) {
            return source;
        }
        
        // Try relative to data directory
        const dataPath = path.join(process.cwd(), 'data', source);
        if (await this.fileExists(dataPath)) {
            return dataPath;
        }
        
        // Try relative to project root
        const rootPath = path.join(process.cwd(), source);
        if (await this.fileExists(rootPath)) {
            return rootPath;
        }
        
        // Try relative to test data directory
        const testDataPath = path.join(process.cwd(), 'test-data', source);
        if (await this.fileExists(testDataPath)) {
            return testDataPath;
        }
        
        throw new Error(`File not found: ${source}`);
    }

    /**
     * Validate file exists and is readable
     */
    private async validateFile(filePath: string): Promise<void> {
        try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                throw new Error(`Not a file: ${filePath}`);
            }
            
            // Check read permission
            await fs.access(filePath, fs.constants.R_OK);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            } else if (error.code === 'EACCES') {
                throw new Error(`Permission denied: ${filePath}`);
            }
            throw error;
        }
    }

    /**
     * Check if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file size
     */
    private getFileSize(filePath: string): number {
        try {
            const stats = statSync(filePath);
            return stats.size;
        } catch {
            return 0;
        }
    }

    /**
     * Build JSONPath from path stack
     */
    private buildPath(pathStack: string[]): string {
        if (pathStack.length === 0) return '$';
        return '$' + pathStack.join('');
    }

    /**
     * Check if current path matches JSONPath pattern
     */
    private matchesJSONPath(currentPath: string, pattern: string): boolean {
        // Simple matching for common patterns
        if (pattern === '$' || pattern === '$.*') return true;
        if (pattern === currentPath) return true;
        
        // Handle wildcards
        const regexPattern = pattern
            .replace(/\$/g, '\\$')
            .replace(/\*/g, '.*')
            .replace(/\[(\d+)\]/g, '\\[$1\\]');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(currentPath);
    }

    /**
     * Extract value by JSONPath
     */
    private extractByJSONPath(data: any, jsonPath: string): any {
        // Simple JSONPath implementation for basic paths
        if (!jsonPath || jsonPath === '$' || jsonPath === '$.*') {
            return data;
        }
        
        // Remove the $ prefix
        let path = jsonPath.startsWith('$') ? jsonPath.substring(1) : jsonPath;
        if (path.startsWith('.')) path = path.substring(1);
        
        // Split path and traverse
        const keys = path.split('.');
        let result = data;
        
        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return undefined;
            }
        }
        
        return result;
    }

    /**
     * Check if record matches filter
     */
    private matchesFilter(record: TestData, filter: any): boolean {
        // If filter is a function, use it
        if (typeof filter === 'function') {
            return filter(record);
        }
        
        // If filter is an object, check all properties
        if (typeof filter === 'object' && filter !== null) {
            return Object.entries(filter).every(([key, value]) => {
                if (typeof value === 'function') {
                    return value(record[key]);
                }
                
                // Handle nested properties
                const recordValue = this.getNestedValue(record, key);
                
                // Handle different comparison types
                if (value && typeof value === 'object' && value.constructor === Object) {
                    // Complex filter object
                    if ('$eq' in value) return recordValue === value.$eq;
                    if ('$ne' in value) return recordValue !== value.$ne;
                    if ('$gt' in value) return recordValue > (value as any).$gt;
                    if ('$gte' in value) return recordValue >= (value as any).$gte;
                    if ('$lt' in value) return recordValue < (value as any).$lt;
                    if ('$lte' in value) return recordValue <= (value as any).$lte;
                    if ('$in' in value) return Array.isArray((value as any).$in) && (value as any).$in.includes(recordValue);
                    if ('$nin' in value) return Array.isArray((value as any).$nin) && !(value as any).$nin.includes(recordValue);
                    if ('$regex' in value) {
                        const regexValue = (value as any).$regex;
                        const options = (value as any).$options || '';
                        if (typeof regexValue === 'string') {
                            return new RegExp(regexValue, options).test(String(recordValue));
                        }
                        return false;
                    }
                    if ('$exists' in value) return (recordValue !== undefined) === value.$exists;
                }
                
                // Simple equality
                return recordValue === value;
            });
        }
        
        return true;
    }

    /**
     * Get nested property value
     */
    private getNestedValue(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        
        return current;
    }

    /**
     * Infer schema from data
     */
    private inferSchema(data: TestData[]): any {
        if (data.length === 0) {
            return { type: 'array', items: { type: 'object' } };
        }
        
        // Analyze first N records
        const sampleSize = Math.min(data.length, 100);
        const sample = data.slice(0, sampleSize);
        
        // Build schema
        const schema: any = {
            type: 'array',
            items: {
                type: 'object',
                properties: {},
                required: []
            }
        };
        
        // Collect all properties
        const propertyTypes = new Map<string, Set<string>>();
        const propertyCount = new Map<string, number>();
        
        for (const record of sample) {
            for (const [key, value] of Object.entries(record)) {
                const type = this.getValueType(value);
                
                if (!propertyTypes.has(key)) {
                    propertyTypes.set(key, new Set());
                }
                propertyTypes.get(key)!.add(type);
                
                propertyCount.set(key, (propertyCount.get(key) || 0) + 1);
            }
        }
        
        // Build property schemas
        for (const [key, types] of propertyTypes) {
            const typeArray = Array.from(types);
            
            if (typeArray.length === 1) {
                schema.items.properties[key] = { type: typeArray[0] };
            } else {
                schema.items.properties[key] = { type: typeArray };
            }
            
            // Mark as required if present in all records
            if (propertyCount.get(key) === sampleSize) {
                schema.items.required.push(key);
            }
        }
        
        return schema;
    }

    /**
     * Get JSON Schema type for value
     */
    private getValueType(value: any): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        
        const type = typeof value;
        if (type === 'number') {
            return Number.isInteger(value) ? 'integer' : 'number';
        }
        
        return type;
    }

    /**
     * Enhance error with context
     */
    private enhanceError(error: any, options: DataProviderOptions): Error {
        const message = error.message || 'Unknown error';
        const enhancedMessage = `JSON Handler Error: ${message}\nSource: ${options.source}`;
        
        const enhancedError = new Error(enhancedMessage);
        enhancedError.stack = error.stack;
        
        // Add additional context
        (enhancedError as any).originalError = error;
        (enhancedError as any).handlerOptions = options;
        
        return enhancedError;
    }
}