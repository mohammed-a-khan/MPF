// src/data/handlers/ExcelHandler.ts

import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation, StreamOptions } from '../types/data.types';
import { ExcelParser } from '../parsers/ExcelParser';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { DataEncryptionManager } from '../provider/DataEncryptionManager';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { statSync } from 'fs';

export class ExcelHandler implements DataHandler {
    private parser: ExcelParser;
    private validator: DataValidator;
    private transformer: DataTransformer;
    private streamingThreshold: number;
    
    constructor() {
        this.parser = new ExcelParser();
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
        this.streamingThreshold = parseInt(process.env['EXCEL_STREAMING_THRESHOLD'] || '10485760');
    }

    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: excel_load', { operation: 'excel_load', options });
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            await this.validateFile(filePath);
            
            const fileSize = this.getFileSize(filePath);
            const useStreaming = options.streaming || fileSize > this.streamingThreshold;
            
            let data: TestData[];
            let metadata: Record<string, any>;
            
            if (useStreaming) {
                logger.debug(`Using streaming for large Excel file: ${fileSize} bytes`);
                const result = await this.loadStreaming(filePath, options);
                data = result.data;
                metadata = result.metadata || {};
            } else {
                const fileBuffer = await fs.readFile(filePath);
                const parseResult = await this.parser.parse(fileBuffer, {
                    ...(options.sheet && { sheetName: options.sheet }),
                    ...(options.range && { range: options.range }),
                    headerRow: options.skipRows ? options.skipRows + 1 : 1,
                    headers: options.headers !== false,
                    formulaValues: true,
                    trimValues: true
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
                    streaming: useStreaming
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: excel_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    private async loadStreaming(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const data: TestData[] = [];
        const batchSize = options.batchSize || 1000;
        
        const streamOptions: StreamOptions = {
            ...(options.sheet && { sheetName: options.sheet }),
            ...(options.range && { range: options.range }),
            headerRow: options.skipRows ? options.skipRows + 1 : 1,
            headers: options.headers !== false,
            batchSize,
            highWaterMark: 65536,
            onBatch: async (batch: TestData[]) => {
                if (options.filter) {
                    batch = batch.filter(row => this.matchesFilter(row, options.filter!));
                }
                
                data.push(...batch);
                
                if (options.maxRecords && data.length >= options.maxRecords) {
                    throw new Error('MAX_RECORDS_REACHED');
                }
            }
        };
        
        try {
            await this.parser.stream(filePath, streamOptions);
            
            if (options.maxRecords && data.length > options.maxRecords) {
                data.splice(options.maxRecords);
            }
            
            return {
                data,
                metadata: {
                    totalRecords: data.length,
                    streaming: true,
                    batchSize
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
        
        const streamOptions: StreamOptions = {
            ...(options.sheet && { sheetName: options.sheet }),
            ...(options.range && { range: options.range }),
            headerRow: options.skipRows ? options.skipRows + 1 : 1,
            headers: options.headers !== false,
            batchSize: options.batchSize || 100
        };
        
        let recordCount = 0;
        
        for await (const batch of this.parser.streamBatches(filePath, streamOptions)) {
            for (const record of batch) {
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
    }

    async loadPartial(
        options: DataProviderOptions, 
        offset: number, 
        limit: number
    ): Promise<DataProviderResult> {
        const startTime = Date.now();
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            
            const fileBuffer = await fs.readFile(filePath);
            const parseResult = await this.parser.parsePartial(fileBuffer, {
                ...(options.sheet && { sheetName: options.sheet }),
                headerRow: options.skipRows ? options.skipRows + 1 : 1,
                headers: options.headers !== false,
                offset,
                limit
            });
            
            const loadTime = Date.now() - startTime;
            
            return {
                data: parseResult.data,
                metadata: {
                    ...parseResult.metadata,
                    totalRecords: parseResult.data.length,
                    offset,
                    limit,
                    loadTime,
                    source: filePath
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: excel_partial_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async loadSchema(options: DataProviderOptions): Promise<any> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const fileBuffer = await fs.readFile(filePath);
            
            return await this.parser.extractSchema(fileBuffer, {
                ...(options.sheet && { sheetName: options.sheet }),
                sampleSize: 100
            });
            
        } catch (error) {
            ActionLogger.logError('Data handler error: excel_schema_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async getMetadata(options: DataProviderOptions): Promise<Record<string, any>> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const fileBuffer = await fs.readFile(filePath);
            
            const metadata = await this.parser.getMetadata(fileBuffer);
            const stats = await fs.stat(filePath);
            
            return {
                ...metadata,
                filePath,
                fileSize: stats.size,
                modifiedDate: stats.mtime,
                createdDate: stats.birthtime
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: excel_metadata_failed', error as Error);
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
        
        throw new Error(`Excel file not found: ${source}`);
    }

    private async validateFile(filePath: string): Promise<void> {
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${filePath}`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        if (!['.xlsx', '.xls', '.xlsm', '.xlsb'].includes(ext)) {
            throw new Error(`Invalid Excel file extension: ${ext}`);
        }
        
        const maxSize = parseInt(process.env['MAX_EXCEL_FILE_SIZE'] || '104857600');
        if (stats.size > maxSize) {
            throw new Error(
                `Excel file too large: ${stats.size} bytes (max: ${maxSize} bytes). ` +
                `Consider using streaming or increasing MAX_EXCEL_FILE_SIZE`
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
        const enhancedError = new Error(
            `Excel Handler Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `File: ${options.source}\n` +
            `Sheet: ${options.sheet || 'default'}\n` +
            `Options: ${JSON.stringify(options, null, 2)}`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}
