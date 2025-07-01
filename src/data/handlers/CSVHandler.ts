// src/data/handlers/CSVHandler.ts

import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation, StreamOptions } from '../types/data.types';
import { CSVParser } from '../parsers/CSVParser';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { DataEncryptionManager } from '../provider/DataEncryptionManager';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, statSync } from 'fs';
import { Transform } from 'stream';

export class CSVHandler implements DataHandler {
    private parser: CSVParser;
    private validator: DataValidator;
    private transformer: DataTransformer;
    private streamingThreshold: number;
    
    constructor() {
        this.parser = new CSVParser();
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
        this.streamingThreshold = parseInt(process.env['CSV_STREAMING_THRESHOLD'] || '5242880');
    }

    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: csv_load', { operation: 'csv_load', options });
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            await this.validateFile(filePath);
            
            const csvOptions = options as any;
            if (!csvOptions.delimiter) {
                csvOptions.delimiter = await this.detectDelimiter(filePath);
                logger.debug(`Auto-detected delimiter: ${csvOptions.delimiter}`);
            }
            
            const fileSize = this.getFileSize(filePath);
            const useStreaming = options.streaming || fileSize > this.streamingThreshold;
            
            let data: TestData[];
            let metadata: Record<string, any>;
            
            if (useStreaming) {
                logger.debug(`Using streaming for large CSV file: ${fileSize} bytes`);
                const result = await this.loadStreaming(filePath, options);
                data = result.data;
                metadata = result.metadata || {};
            } else {
                const content = await fs.readFile(filePath, 'utf-8');
                const parseResult = await this.parser.parse(content, {
                    delimiter: csvOptions.delimiter || ',',
                    quote: '"',
                    escape: '"',
                    headers: options.headers !== false,
                    skipRows: options.skipRows || 0,
                    ...(options.maxRecords !== undefined && { maxRows: options.maxRecords }),
                    trimValues: true,
                    skipEmptyRows: true
                });
                
                data = parseResult.data;
                metadata = parseResult.metadata || {};
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
                    fileSize,
                    streaming: useStreaming,
                    delimiter: csvOptions.delimiter
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: csv_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    private async loadStreaming(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const data: TestData[] = [];
        const batchSize = options.batchSize || 1000;
        let rowCount = 0;
        let skippedRows = 0;
        
        const csvOptions = options as any;
        const streamOptions: StreamOptions = {
            delimiter: csvOptions.delimiter || ',',
            quote: '"',
            escape: '"',
            headers: options.headers !== false,
            skipRows: options.skipRows || 0,
            ...(options.maxRecords && { maxRows: options.maxRecords }),
            batchSize,
            highWaterMark: 65536,
            onBatch: async (batch: TestData[]) => {
                if (options.filter) {
                    batch = batch.filter(row => this.matchesFilter(row, options.filter!));
                }
                
                data.push(...batch);
                rowCount += batch.length;
                
                if (options.maxRecords && data.length >= options.maxRecords) {
                    throw new Error('MAX_RECORDS_REACHED');
                }
            },
            onError: (error: Error) => {
                logger.error('CSV streaming error:', error);
            }
        };
        
        try {
            const fileStream = createReadStream(filePath, { encoding: 'utf-8', highWaterMark: streamOptions.highWaterMark });
            await this.parser.streamParse(fileStream, streamOptions);
            
            if (options.maxRecords && data.length > options.maxRecords) {
                data.splice(options.maxRecords);
            }
            
            return {
                data,
                metadata: {
                    totalRecords: data.length,
                    streaming: true,
                    batchSize,
                    totalRows: rowCount + skippedRows,
                    processedRows: rowCount,
                    skippedRows
                }
            };
            
        } catch (error: any) {
            if (error.message === 'MAX_RECORDS_REACHED') {
                return {
                    data: data.slice(0, options.maxRecords),
                    metadata: {
                        totalRecords: options.maxRecords || data.length,
                        streaming: true,
                        truncated: true,
                        maxRecords: options.maxRecords
                    }
                };
            }
            throw error;
        }
    }

    async *stream(options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const filePath = await this.resolveFilePath(options.source!);
        const csvOptions = options as any;
        const delimiter = csvOptions.delimiter || await this.detectDelimiter(filePath);
        
        const streamOptions: StreamOptions = {
            delimiter,
            quote: '"',
            escape: '"',
            headers: options.headers !== false,
            skipRows: options.skipRows || 0,
            batchSize: 1
        };
        
        const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
        let recordCount = 0;
        
        for await (const record of this.parser.streamRecords(fileStream, streamOptions)) {
            if (options.filter && !this.matchesFilter(record, options.filter)) {
                continue;
            }
            
            yield record;
            recordCount++;
            
            if (options.maxRecords && recordCount >= options.maxRecords) {
                return;
            }
        }
    }

    async loadPartial(
        options: DataProviderOptions, 
        offset: number, 
        limit: number
    ): Promise<DataProviderResult> {
        const startTime = Date.now();
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const csvOptions = options as any;
            const delimiter = csvOptions.delimiter || await this.detectDelimiter(filePath);
            
            const data: TestData[] = [];
            let currentIndex = 0;
            
            const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
            
            const transformStream = new Transform({
                objectMode: true,
                transform(chunk: any, _encoding: string, callback: Function) {
                    if (currentIndex >= offset && data.length < limit) {
                        this.push(chunk);
                    }
                    currentIndex++;
                    
                    if (data.length >= limit) {
                        this.destroy();
                    }
                    
                    callback();
                }
            });
            
            await this.parser.streamParse(fileStream.pipe(transformStream), {
                delimiter,
                headers: options.headers !== false,
                skipRows: options.skipRows || 0,
                onBatch: async (batch: TestData[]) => {
                    const remaining = limit - data.length;
                    data.push(...batch.slice(0, remaining));
                }
            });
            
            const loadTime = Date.now() - startTime;
            
            return {
                data,
                metadata: {
                    totalRecords: data.length,
                    offset,
                    limit,
                    loadTime,
                    source: filePath
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: csv_partial_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async loadSchema(options: DataProviderOptions): Promise<any> {
        try {
            const sampleSize = 100;
            const sampleData = await this.loadPartial(options, 0, sampleSize);
            
            return await this.parser.inferSchema(sampleData.data, {
                sampleSize,
                detectTypes: true,
                detectFormats: true
            });
            
        } catch (error) {
            ActionLogger.logError('Data handler error: csv_schema_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async getMetadata(options: DataProviderOptions): Promise<Record<string, any>> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const stats = await fs.stat(filePath);
            const csvOptions = options as any;
            const delimiter = csvOptions.delimiter || await this.detectDelimiter(filePath);
            
            let rowCount = 0;
            const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
            
            await new Promise((resolve, reject) => {
                fileStream
                    .on('data', (chunk) => {
                        const chunkStr = chunk instanceof Buffer ? chunk.toString() : String(chunk);
                        rowCount += (chunkStr.match(/\n/g) || []).length;
                    })
                    .on('end', () => resolve(undefined))
                    .on('error', reject);
            });
            
            const firstLine = await this.getFirstLine(filePath);
            const headers = firstLine.split(delimiter).map(h => h.trim());
            
            return {
                filePath,
                fileSize: stats.size,
                modifiedDate: stats.mtime,
                createdDate: stats.birthtime,
                rowCount,
                columnCount: headers.length,
                headers,
                delimiter,
                encoding: 'utf-8'
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: csv_metadata_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async validate(data: TestData[]): Promise<ValidationResult> {
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

    private async detectDelimiter(filePath: string): Promise<string> {
        const sample = await this.getFirstNLines(filePath, 10);
        const delimiters = [',', ';', '\t', '|'];
        const counts: Record<string, number> = {};
        
        for (const delimiter of delimiters) {
            counts[delimiter] = (sample.match(new RegExp(delimiter, 'g')) || []).length;
        }
        
        const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
        return sorted[0]?.[0] || ',';
    }

    private async getFirstLine(filePath: string): Promise<string> {
        const lines = await this.getFirstNLines(filePath, 1);
        return lines.split('\n')[0] || '';
    }

    private async getFirstNLines(filePath: string, n: number): Promise<string> {
        const stream = createReadStream(filePath, { encoding: 'utf-8' });
        let content = '';
        let lineCount = 0;
        
        return new Promise((resolve, reject) => {
            stream
                .on('data', (chunk) => {
                    const chunkStr = chunk instanceof Buffer ? chunk.toString() : String(chunk);
                    content += chunkStr;
                    lineCount += (chunkStr.match(/\n/g) || []).length;
                    
                    if (lineCount >= n) {
                        stream.destroy();
                        resolve(content.split('\n').slice(0, n).join('\n'));
                    }
                })
                .on('end', () => resolve(content))
                .on('error', reject);
        });
    }

    private async resolveFilePath(source: string): Promise<string> {
        if (path.isAbsolute(source)) {
            return source;
        }
        
        const relativePath = path.resolve(process.cwd(), source);
        if (await this.fileExists(relativePath)) {
            return relativePath;
        }
        
        const testDataPath = path.resolve(
            process.cwd(),
            process.env['DEFAULT_DATA_PATH'] || './test-data',
            source
        );
        
        if (await this.fileExists(testDataPath)) {
            return testDataPath;
        }
        
        throw new Error(`CSV file not found: ${source}`);
    }

    private async validateFile(filePath: string): Promise<void> {
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${filePath}`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        if (!['.csv', '.tsv', '.txt'].includes(ext)) {
            throw new Error(`Invalid CSV file extension: ${ext}`);
        }
        
        const maxSize = parseInt(process.env['MAX_CSV_FILE_SIZE'] || '524288000');
        if (stats.size > maxSize) {
            throw new Error(
                `CSV file too large: ${stats.size} bytes (max: ${maxSize} bytes). ` +
                `Consider using streaming or increasing MAX_CSV_FILE_SIZE`
            );
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private getFileSize(filePath: string): number {
        try {
            return statSync(filePath).size;
        } catch {
            return 0;
        }
    }

    private matchesFilter(record: TestData, filter: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(filter)) {
            if (record[key] !== value) {
                return false;
            }
        }
        return true;
    }

    private enhanceError(error: any, options: DataProviderOptions): Error {
        const csvOptions = options as any;
        const enhancedError = new Error(
            `CSV Handler Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `File: ${options.source}\n` +
            `Delimiter: ${csvOptions.delimiter || 'auto-detect'}\n` +
            `Options: ${JSON.stringify(options, null, 2)}`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}
