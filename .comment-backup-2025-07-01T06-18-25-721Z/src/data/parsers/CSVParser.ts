// src/data/parsers/CSVParser.ts

import { TestData, ParserOptions, StreamOptions, DataSchema } from '../types/data.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { TypeConverter } from '../transformers/TypeConverter';
import { Readable } from 'stream';
import { parse as csvParse } from 'csv-parse';
import { stringify } from 'csv-stringify';

/**
 * Parser for CSV files
 * Supports various delimiters and streaming for large files
 */
export class CSVParser {
    private typeConverter: TypeConverter;
    
    constructor() {
        this.typeConverter = new TypeConverter();
    }

    /**
     * Parse CSV content
     */
    async parse(content: string, options: ParserOptions = {}): Promise<{
        data: TestData[];
        metadata?: Record<string, any>;
    }> {
        const startTime = Date.now();
        
        try {
            const records: TestData[] = [];
            const parser = this.createParser(options);
            
            // Parse configuration
            const delimiter = options.delimiter || ',';
            const hasHeaders = options.headers !== false;
            let headers: string[] = [];
            let rowCount = 0;
            let skippedRows = 0;
            
            // Debug logging
            if (options.delimiter) {
                ActionLogger.logDebug(`Using specified delimiter: "${delimiter}"`);
            }
            
            // Setup parser event handlers
            parser.on('readable', async () => {
                let record;
                while ((record = parser.read()) !== null) {
                    rowCount++;
                    
                    // Skip rows
                    if (options.skipRows && rowCount <= options.skipRows) {
                        skippedRows++;
                        continue;
                    }
                    
                    // First row as headers
                    if (hasHeaders && headers.length === 0) {
                        headers = record.map((h: string) => h.trim());
                        continue;
                    }
                    
                    // Convert to object
                    const row = this.createRecord(record, headers, hasHeaders);
                    
                    // Apply type conversion
                    const converted = await this.convertTypes(row, options);
                    
                    // Skip empty rows
                    if (options.skipEmptyRows !== false && this.isEmptyRow(converted)) {
                        skippedRows++;
                        continue;
                    }
                    
                    records.push(converted);
                    
                    // Check max rows
                    if (options.maxRows && records.length >= options.maxRows) {
                        parser.end();
                        break;
                    }
                }
            });
            
            // Parse content
            await new Promise<void>((resolve, reject) => {
                parser.on('error', reject);
                parser.on('end', resolve);
                parser.write(content);
                parser.end();
            });
            
            const parseTime = Date.now() - startTime;
            
            ActionLogger.logInfo('Parser operation: csv_parse', {
                operation: 'csv_parse',
                recordCount: records.length,
                delimiter,
                parseTime
            });
            
            return {
                data: records,
                metadata: {
                    delimiter,
                    headers: hasHeaders ? headers : undefined,
                    totalRows: rowCount,
                    skippedRows,
                    processedRows: records.length,
                    parseTime
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Parser error: csv_parse_failed', error as Error);
            throw this.enhanceError(error, 'parse');
        }
    }

    /**
     * Stream parse CSV
     */
    async streamParse(stream: Readable, options: StreamOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const parser = this.createParser(options);
                let headers: string[] = [];
                let rowCount = 0;
                let batch: TestData[] = [];
                const hasHeaders = options.headers !== false;
                
                parser.on('readable', async () => {
                    let record;
                    while ((record = parser.read()) !== null) {
                        rowCount++;
                        
                        // Skip rows
                        if (options.skipRows && rowCount <= options.skipRows) {
                            continue;
                        }
                        
                        // First row as headers
                        if (hasHeaders && headers.length === 0) {
                            headers = record.map((h: string) => h.trim());
                            continue;
                        }
                        
                        // Convert to object
                        const row = this.createRecord(record, headers, hasHeaders);
                        const converted = await this.convertTypes(row, options);
                        
                        // Skip empty rows
                        if (options.skipEmptyRows !== false && this.isEmptyRow(converted)) {
                            continue;
                        }
                        
                        batch.push(converted);
                        
                        // Process batch
                        if (batch.length >= (options.batchSize || 1000)) {
                            parser.pause();
                            
                            try {
                                if (options.onBatch) {
                                    await options.onBatch(batch);
                                }
                                batch = [];
                                parser.resume();
                            } catch (err) {
                                parser.destroy();
                                reject(err);
                                return;
                            }
                        }
                        
                        // Check max rows
                        if (options.maxRows && rowCount >= options.maxRows) {
                            parser.end();
                            break;
                        }
                    }
                });
                
                parser.on('end', async () => {
                    // Process remaining batch
                    if (batch.length > 0 && options.onBatch) {
                        await options.onBatch(batch);
                    }
                    
                    if (options.onEnd) {
                        options.onEnd();
                    }
                    
                    resolve();
                });
                
                parser.on('error', (error: Error) => {
                    if (options.onError) {
                        options.onError(error);
                    }
                    reject(error);
                });
                
                // Start streaming
                stream.pipe(parser);
                
            } catch (error) {
                reject(this.enhanceError(error, 'streamParse'));
            }
        });
    }

    /**
     * Stream records one by one
     */
    async *streamRecords(stream: Readable, options: StreamOptions): AsyncIterableIterator<TestData> {
        const parser = this.createParser(options);
        let headers: string[] = [];
        let rowCount = 0;
        const hasHeaders = options.headers !== false;
        
        // Set up async iterator
        const records: TestData[] = [];
        let resolveNext: ((value: IteratorResult<TestData>) => void) | null = null;
        let rejectNext: ((error: Error) => void) | null = null;
        let ended = false;
        
        parser.on('readable', async () => {
            let record;
            while ((record = parser.read()) !== null) {
                rowCount++;
                
                // Skip rows
                if (options.skipRows && rowCount <= options.skipRows) {
                    continue;
                }
                
                // First row as headers
                if (hasHeaders && headers.length === 0) {
                    headers = record.map((h: string) => h.trim());
                    continue;
                }
                
                // Convert to object
                const row = this.createRecord(record, headers, hasHeaders);
                const converted = await this.convertTypes(row, options);
                
                // Skip empty rows
                if (options.skipEmptyRows !== false && this.isEmptyRow(converted)) {
                    continue;
                }
                
                if (resolveNext) {
                    resolveNext({ value: converted, done: false });
                    resolveNext = null;
                } else {
                    records.push(converted);
                }
            }
        });
        
        parser.on('end', () => {
            ended = true;
            if (resolveNext) {
                resolveNext({ value: undefined as any, done: true });
                resolveNext = null;
            }
        });
        
        parser.on('error', (error: Error) => {
            if (rejectNext) {
                rejectNext(error);
                rejectNext = null;
            }
        });
        
        // Start streaming
        stream.pipe(parser);
        
        // Yield records
        while (true) {
            if (records.length > 0) {
                yield records.shift()!;
            } else if (ended) {
                break;
            } else {
                // Wait for next record
                const result = await new Promise<IteratorResult<TestData>>((resolve, reject) => {
                    resolveNext = resolve;
                    rejectNext = reject;
                });
                
                if (result.done) break;
                yield result.value;
            }
        }
    }

    /**
     * Infer schema from data
     */
    async inferSchema(data: TestData[], options: {
        sampleSize?: number;
        detectTypes?: boolean;
        detectFormats?: boolean;
    } = {}): Promise<DataSchema> {
        const sample = data.slice(0, options.sampleSize || Math.min(100, data.length));
        const fieldAnalysis = new Map<string, any>();
        
        // Analyze each field
        for (const record of sample) {
            for (const [key, value] of Object.entries(record)) {
                if (!fieldAnalysis.has(key)) {
                    fieldAnalysis.set(key, {
                        name: key,
                        values: [],
                        types: new Set(),
                        formats: new Set(),
                        nullCount: 0,
                        uniqueValues: new Set()
                    });
                }
                
                const field = fieldAnalysis.get(key)!;
                
                if (value === null || value === undefined || value === '') {
                    field.nullCount++;
                } else {
                    field.values.push(value);
                    field.uniqueValues.add(value);
                    
                    if (options.detectTypes !== false) {
                        field.types.add(this.detectType(value));
                    }
                    
                    if (options.detectFormats) {
                        const format = this.detectFormat(value);
                        if (format) {
                            field.formats.add(format);
                        }
                    }
                }
            }
        }
        
        // Convert to schema
        const fields = Array.from(fieldAnalysis.entries()).map(([key, analysis]) => {
            const field: any = {
                name: key,
                type: this.consolidateTypes(Array.from(analysis.types)),
                required: analysis.nullCount === 0,
                unique: analysis.uniqueValues.size === analysis.values.length
            };
            
            // Add format if consistent
            if (analysis.formats.size === 1) {
                field.format = Array.from(analysis.formats)[0];
            }
            
            // Add constraints
            if (field.type === 'string') {
                const lengths = analysis.values.map((v: any) => String(v).length);
                if (lengths.length > 0) {
                    field.maxLength = Math.max(...lengths);
                    field.minLength = Math.min(...lengths);
                }
            } else if (field.type === 'number') {
                const numbers = analysis.values.map((v: any) => Number(v));
                if (numbers.length > 0) {
                    field.max = Math.max(...numbers);
                    field.min = Math.min(...numbers);
                }
            }
            
            // Add enum if limited unique values
            if (analysis.uniqueValues.size <= 10 && analysis.uniqueValues.size > 1) {
                field.enum = Array.from(analysis.uniqueValues);
            }
            
            return field;
        });
        
        return {
            version: '1.0',
            fields
        };
    }

    /**
     * Export data to CSV
     */
    async export(data: TestData[], options: ParserOptions = {}): Promise<string> {
        return new Promise((resolve, reject) => {
            const output: string[] = [];
            const stringifier = stringify({
                delimiter: options.delimiter || ',',
                header: options.headers !== false,
                columns: (options as any).columns,
                quoted: true,
                quoted_empty: true,
                quoted_string: true,
                escape: options.escape || '"'
            });
            
            stringifier.on('readable', () => {
                let row;
                while ((row = stringifier.read()) !== null) {
                    output.push(row);
                }
            });
            
            stringifier.on('error', reject);
            stringifier.on('finish', () => resolve(output.join('')));
            
            // Write data
            for (const record of data) {
                stringifier.write(record);
            }
            
            stringifier.end();
        });
    }

    /**
     * Create CSV parser
     */
    private createParser(options: ParserOptions | StreamOptions): any {
        const csvOptions = options as any;
        return csvParse({
            delimiter: csvOptions.delimiter || ',',
            quote: csvOptions.quote || '"',
            escape: csvOptions.escape || '"',
            relax_quotes: true,
            relax_column_count: true,
            skip_empty_lines: csvOptions.skipEmptyRows !== false,
            trim: csvOptions.trimValues !== false,
            columns: false, // We handle headers manually
            cast: false, // We handle type conversion manually
            comment: '', // Disable comment character to allow # in data
            bom: true,
            encoding: csvOptions.encoding || 'utf8'
        });
    }

    /**
     * Create record from array
     */
    private createRecord(values: any[], headers: string[], hasHeaders: boolean): TestData {
        const record: TestData = {};
        
        if (hasHeaders && headers.length > 0) {
            headers.forEach((header, index) => {
                record[header] = values[index] !== undefined ? values[index] : null;
            });
        } else {
            values.forEach((value, index) => {
                record[`column_${index + 1}`] = value;
            });
        }
        
        return record;
    }

    /**
     * Convert types in record
     */
    private async convertTypes(record: TestData, options: ParserOptions | StreamOptions): Promise<TestData> {
        const csvOptions = options as any;
        if (csvOptions.parseNumbers === false && 
            csvOptions.parseDates === false && 
            csvOptions.parseBooleans === false) {
            return record;
        }
        
        const converted: TestData = {};
        
        for (const [key, value] of Object.entries(record)) {
            const result = await this.typeConverter.convert(value, 'auto', {
                parseNumbers: csvOptions.parseNumbers !== false,
                parseDates: csvOptions.parseDates !== false,
                parseBooleans: csvOptions.parseBooleans !== false,
                trimStrings: csvOptions.trimValues !== false,
                emptyStringAsNull: true,
                nullValues: ['NULL', 'null', 'N/A', 'n/a', '#N/A']
            });
            converted[key] = result.success ? result.value : value;
        }
        
        return converted;
    }

    /**
     * Check if row is empty
     */
    private isEmptyRow(record: TestData): boolean {
        return Object.values(record).every(value => 
            value === null || 
            value === undefined || 
            value === '' ||
            (typeof value === 'string' && value.trim() === '')
        );
    }

    /**
     * Detect data type
     */
    private detectType(value: any): string {
        if (value === null || value === undefined) return 'null';
        
        const strValue = String(value).trim();
        
        // Boolean
        if (['true', 'false', 'yes', 'no', '1', '0'].includes(strValue.toLowerCase())) {
            return 'boolean';
        }
        
        // Number
        if (/^-?\d+(\.\d+)?$/.test(strValue)) {
            return 'number';
        }
        
        // Date
        if (this.isDateFormat(strValue)) {
            return 'date';
        }
        
        return 'string';
    }

    /**
     * Detect data format
     */
    private detectFormat(value: any): string | null {
        const strValue = String(value).trim();
        
        // Email
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
            return 'email';
        }
        
        // URL
        if (/^https?:\/\/[^\s]+$/.test(strValue)) {
            return 'url';
        }
        
        // Phone
        if (/^\+?\d{10,15}$/.test(strValue.replace(/[\s\-\(\)]/g, ''))) {
            return 'phone';
        }
        
        // UUID
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strValue)) {
            return 'uuid';
        }
        
        // ISO Date
        if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(strValue)) {
            return 'iso-date';
        }
        
        // Currency
        if (/^[$€£¥]\s?\d+(\.\d{2})?$/.test(strValue)) {
            return 'currency';
        }
        
        return null;
    }

    /**
     * Check if value is date format
     */
    private isDateFormat(value: string): boolean {
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/,                          // YYYY-MM-DD
            /^\d{2}\/\d{2}\/\d{4}$/,                        // MM/DD/YYYY
            /^\d{2}-\d{2}-\d{4}$/,                          // DD-MM-YYYY
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,        // ISO format
            /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}/i  // Day, Date
        ];
        
        return datePatterns.some(pattern => pattern.test(value));
    }

    /**
     * Consolidate multiple types
     */
    private consolidateTypes(types: string[]): string {
        if (types.length === 0) return 'string';
        if (types.length === 1) return types[0] || 'string';
        
        // Remove null
        const nonNullTypes = types.filter(t => t !== 'null');
        if (nonNullTypes.length === 0) return 'string';
        if (nonNullTypes.length === 1) return nonNullTypes[0] || 'string';
        
        // Priority order
        const priority = ['date', 'number', 'boolean', 'string'];
        for (const type of priority) {
            if (nonNullTypes.includes(type)) {
                return type;
            }
        }
        
        return 'string';
    }

    /**
     * Enhance error with context
     */
    private enhanceError(error: any, operation: string): Error {
        const message = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(
            `CSV Parser Error [${operation}]: ${message}\n` +
            `This may be due to invalid CSV format, encoding issues, or parsing options.`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}