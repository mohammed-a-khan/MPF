// src/data/handlers/JSONHandler.ts

import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation } from '../types/data.types';
import { JSONParser } from '../parsers/JSONParser';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { DataEncryptionManager } from '../provider/DataEncryptionManager';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream, statSync } from 'fs';
import * as readline from 'readline';

export class JSONHandler implements DataHandler {
    private parser: JSONParser;
    private validator: DataValidator;
    private transformer: DataTransformer;
    private streamingThreshold: number;
    
    constructor() {
        this.parser = new JSONParser();
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
        this.streamingThreshold = parseInt(process.env['JSON_STREAMING_THRESHOLD'] || '10485760');
    }

    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: json_load', { operation: 'json_load', options });
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            await this.validateFile(filePath);
            
            const format = await this.detectFormat(filePath, options);
            
            let data: TestData[];
            let metadata: Record<string, any>;
            
            if (format === 'jsonl' || format === 'ndjson') {
                const result = await this.loadJSONL(filePath, options);
                data = result.data;
                metadata = result.metadata || {};
            } else {
                const fileSize = this.getFileSize(filePath);
                const useStreaming = options.streaming || (fileSize > this.streamingThreshold && options.jsonPath);
                
                if (useStreaming) {
                    logger.debug(`Using streaming for large JSON file: ${fileSize} bytes`);
                    const result = await this.loadStreaming(filePath, options);
                    data = result.data;
                    metadata = result.metadata || {};
                } else {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const jsonOptions = options as any;
                    const parseResult = await this.parser.parse(content, {
                        jsonPath: jsonOptions.jsonPath,
                        // Note: These options are passed as any to the parser
                        ...jsonOptions
                    } as any);
                    
                    if (jsonOptions.jsonPath) {
                        console.log(`🔍 DEBUG JSONHandler: JSONPath = "${jsonOptions.jsonPath}"`);
                        console.log(`🔍 DEBUG JSONHandler: parseResult.data type = ${Array.isArray(parseResult.data) ? 'array' : typeof parseResult.data}`);
                        console.log(`🔍 DEBUG JSONHandler: parseResult.data length = ${Array.isArray(parseResult.data) ? parseResult.data.length : 'N/A'}`);
                        if (Array.isArray(parseResult.data) && parseResult.data.length > 0) {
                            console.log(`🔍 DEBUG JSONHandler: First item = ${JSON.stringify(parseResult.data[0])}`);
                        }
                    }
                    
                    data = this.normalizeData(parseResult.data);
                    metadata = parseResult.metadata || {};
                }
            }
            
            if (options.filter) {
                data = data.filter(row => this.matchesFilter(row, options.filter!));
            }
            
            if (options.transformations && options.transformations.length > 0) {
                data = await this.transformer.transform(data, options.transformations);
            }
            
            data = await DataEncryptionManager.processTestData(data);
            
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
                    
                    if (this.matchesJSONPath(currentPath, jsonPath)) {
                        if (!options.filter || this.matchesFilter(normalized, options.filter)) {
                            data.push(normalized);
                            recordCount++;
                            
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
                            
                            pathStack.pop();
                            currentPath = this.buildPath(pathStack);
                        }
                    }
                    
                    if (depth > 0) {
                        currentObject += char;
                    }
                }
                
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
            
            if (!line.trim()) {
                skippedLines++;
                continue;
            }
            
            if (jsonOptions.allowComments && line.trim().startsWith('//')) {
                skippedLines++;
                continue;
            }
            
            try {
                const parsed = JSON.parse(line);
                const normalized = this.normalizeItem(parsed);
                
                if (options.jsonPath) {
                    const extracted = this.extractByJSONPath(normalized, options.jsonPath);
                    if (extracted !== undefined) {
                        data.push(this.normalizeItem(extracted));
                    }
                } else {
                    data.push(normalized);
                }
                
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

    async *stream(options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const filePath = await this.resolveFilePath(options.source!);
        const format = await this.detectFormat(filePath, options);
        
        if (format === 'jsonl' || format === 'ndjson') {
            yield* this.streamJSONL(filePath, options);
        } else {
            yield* this.streamJSON(filePath, options);
        }
    }

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
            
            if (!line.trim()) continue;
            
            if (jsonOptions.allowComments && line.trim().startsWith('//')) continue;
            
            try {
                const parsed = JSON.parse(line);
                const normalized = this.normalizeItem(parsed);
                
                if (options.filter && !this.matchesFilter(normalized, options.filter)) {
                    continue;
                }
                
                yield normalized;
                recordCount++;
                
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

    private async *streamJSON(filePath: string, options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const fileSize = this.getFileSize(filePath);
        
        if (fileSize > this.streamingThreshold) {
            const result = await this.loadStreaming(filePath, options);
            for (const record of result.data) {
                yield record;
            }
        } else {
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

    async loadSchema(options: DataProviderOptions): Promise<any> {
        const filePath = await this.resolveFilePath(options.source!);
        const format = await this.detectFormat(filePath, options);
        
        if (format === 'jsonl') {
            const sampleOptions = { ...options, maxRecords: 100 };
            const sampleData = await this.load(sampleOptions);
            return this.inferSchema(sampleData.data);
        } else {
            const schemaPath = filePath.replace(/\.json$/, '.schema.json');
            if (await this.fileExists(schemaPath)) {
                const schemaContent = await fs.readFile(schemaPath, 'utf-8');
                return JSON.parse(schemaContent);
            }
            
            const sampleOptions = { ...options, maxRecords: 100 };
            const sampleData = await this.load(sampleOptions);
            return this.inferSchema(sampleData.data);
        }
    }

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
                let lineCount = 0;
                const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
                const rl = readline.createInterface({ input: fileStream });
                
                for await (const _line of rl) {
                    lineCount++;
                }
                
                metadata['lineCount'] = lineCount;
            } else {
                if (stats.size < 1048576) {
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

    async validate(data: TestData[], options?: any): Promise<ValidationResult> {
        if (options?.schema) {
            try {
                const { SchemaValidator } = await import('../validators/SchemaValidator');
                const schemaValidator = new SchemaValidator();
                
                const schemaResult = await schemaValidator.validate(data, options.schema, {
                    strict: options.strict !== false,
                    allErrors: true,
                    verbose: true
                });
                
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

    async transform(data: TestData[], transformations: DataTransformation[]): Promise<TestData[]> {
        return await this.transformer.transform(data, transformations);
    }

    async save(data: TestData[], filePath: string, options?: any): Promise<void> {
        const format = options?.format || this.detectFormatFromPath(filePath);
        
        if (format === 'jsonl') {
            await this.saveAsJSONL(data, filePath, options);
        } else {
            await this.saveAsJSON(data, filePath, options);
        }
    }

    private async saveAsJSON(data: TestData[], filePath: string, _options?: any): Promise<void> {
        const indent = _options?.pretty !== false ? 2 : 0;
        const content = JSON.stringify(data, null, indent);
        
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
    }

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

    private normalizeData(data: any): TestData[] {
        if (Array.isArray(data)) {
            return data.map(item => this.normalizeItem(item));
        }
        
        if (typeof data === 'object' && data !== null) {
            const arrayProps = Object.entries(data).filter(([_, value]) => Array.isArray(value));
            
            if (arrayProps.length === 1) {
                const arrayValue = arrayProps[0]?.[1];
                return Array.isArray(arrayValue) ? arrayValue.map((item: any) => this.normalizeItem(item)) : [];
            } else if (arrayProps.length > 1) {
                const dataProps = ['data', 'records', 'items', 'results', 'rows'];
                const dataProp = arrayProps.find(([key]) => dataProps.includes(key.toLowerCase()));
                
                if (dataProp) {
                    const arrayValue = dataProp[1];
                    return Array.isArray(arrayValue) ? arrayValue.map((item: any) => this.normalizeItem(item)) : [];
                }
            }
            
            return [this.normalizeItem(data)];
        }
        
        return [{ value: data }];
    }

    private normalizeItem(item: any): TestData {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return item;
        }
        
        return { value: item };
    }

    private async detectFormat(filePath: string, options: DataProviderOptions): Promise<string> {
        const jsonOptions = options as any;
        if (jsonOptions.fileFormat) {
            return jsonOptions.fileFormat;
        }
        
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.jsonl' || ext === '.ndjson') {
            return 'jsonl';
        }
        
        const stream = createReadStream(filePath, { encoding: 'utf-8', end: 1024 });
        const chunks: string[] = [];
        
        for await (const chunk of stream) {
            chunks.push(chunk as string);
        }
        
        const sample = chunks.join('').trim();
        
        const lines = sample.split('\n').filter(line => line.trim());
        if (lines.length > 1) {
            try {
                JSON.parse(lines[0] || '');
                JSON.parse(lines[1] || '');
                return 'jsonl';
            } catch {
            }
        }
        
        return 'json';
    }

    private detectFormatFromPath(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.jsonl' || ext === '.ndjson') {
            return 'jsonl';
        }
        return 'json';
    }

    private async resolveFilePath(source: string): Promise<string> {
        if (path.isAbsolute(source)) {
            return source;
        }
        
        const dataPath = path.join(process.cwd(), 'data', source);
        if (await this.fileExists(dataPath)) {
            return dataPath;
        }
        
        const rootPath = path.join(process.cwd(), source);
        if (await this.fileExists(rootPath)) {
            return rootPath;
        }
        
        const testDataPath = path.join(process.cwd(), 'test-data', source);
        if (await this.fileExists(testDataPath)) {
            return testDataPath;
        }
        
        throw new Error(`File not found: ${source}`);
    }

    private async validateFile(filePath: string): Promise<void> {
        try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                throw new Error(`Not a file: ${filePath}`);
            }
            
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

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    private getFileSize(filePath: string): number {
        try {
            const stats = statSync(filePath);
            return stats.size;
        } catch {
            return 0;
        }
    }

    private buildPath(pathStack: string[]): string {
        if (pathStack.length === 0) return '$';
        return '$' + pathStack.join('');
    }

    private matchesJSONPath(currentPath: string, pattern: string): boolean {
        if (pattern === '$' || pattern === '$.*') return true;
        if (pattern === currentPath) return true;
        
        const regexPattern = pattern
            .replace(/\$/g, '\\$')
            .replace(/\*/g, '.*')
            .replace(/\[(\d+)\]/g, '\\[$1\\]');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(currentPath);
    }

    private extractByJSONPath(data: any, jsonPath: string): any {
        if (!jsonPath || jsonPath === '$' || jsonPath === '$.*') {
            return data;
        }
        
        let path = jsonPath.startsWith('$') ? jsonPath.substring(1) : jsonPath;
        if (path.startsWith('.')) path = path.substring(1);
        
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

    private matchesFilter(record: TestData, filter: any): boolean {
        if (typeof filter === 'function') {
            return filter(record);
        }
        
        if (typeof filter === 'object' && filter !== null) {
            return Object.entries(filter).every(([key, value]) => {
                if (typeof value === 'function') {
                    return value(record[key]);
                }
                
                const recordValue = this.getNestedValue(record, key);
                
                if (value && typeof value === 'object' && value.constructor === Object) {
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
                
                return recordValue === value;
            });
        }
        
        return true;
    }

    private getNestedValue(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;
        
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        
        return current;
    }

    private inferSchema(data: TestData[]): any {
        if (data.length === 0) {
            return { type: 'array', items: { type: 'object' } };
        }
        
        const sampleSize = Math.min(data.length, 100);
        const sample = data.slice(0, sampleSize);
        
        const schema: any = {
            type: 'array',
            items: {
                type: 'object',
                properties: {},
                required: []
            }
        };
        
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
        
        for (const [key, types] of propertyTypes) {
            const typeArray = Array.from(types);
            
            if (typeArray.length === 1) {
                schema.items.properties[key] = { type: typeArray[0] };
            } else {
                schema.items.properties[key] = { type: typeArray };
            }
            
            if (propertyCount.get(key) === sampleSize) {
                schema.items.required.push(key);
            }
        }
        
        return schema;
    }

    private getValueType(value: any): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        
        const type = typeof value;
        if (type === 'number') {
            return Number.isInteger(value) ? 'integer' : 'number';
        }
        
        return type;
    }

    private enhanceError(error: any, options: DataProviderOptions): Error {
        const message = error.message || 'Unknown error';
        const enhancedMessage = `JSON Handler Error: ${message}\nSource: ${options.source}`;
        
        const enhancedError = new Error(enhancedMessage);
        enhancedError.stack = error.stack;
        
        (enhancedError as any).originalError = error;
        (enhancedError as any).handlerOptions = options;
        
        return enhancedError;
    }
}
