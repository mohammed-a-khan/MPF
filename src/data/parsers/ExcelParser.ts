// src/data/parsers/ExcelParser.ts

import * as XLSX from 'xlsx';
import { TestData, ParserOptions, StreamOptions, DataSchema } from '../types/data.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { TypeConverter } from '../transformers/TypeConverter';
import { createReadStream } from 'fs';

export class ExcelParser {
    private typeConverter: TypeConverter;
    
    constructor() {
        this.typeConverter = new TypeConverter();
        
    }

    async parse(buffer: Buffer, options: ParserOptions = {}): Promise<{
        data: TestData[];
        metadata?: Record<string, any>;
    }> {
        const startTime = Date.now();
        
        try {
            const workbook = XLSX.read(buffer, {
                type: 'buffer',
                cellFormula: options.formulaValues !== false,
                cellHTML: false,
                cellDates: true,
                cellStyles: false,
                cellText: false,
                sheetStubs: false,
                password: (options as any).password
            });
            
            const worksheet = this.getWorksheet(workbook, options);
            
            const data = await this.parseWorksheet(worksheet, options);
            
            const metadata = this.getWorkbookMetadata(workbook, worksheet);
            metadata['parseTime'] = Date.now() - startTime;
            
            ActionLogger.logInfo('Parser operation: excel_parse', {
                operation: 'excel_parse',
                recordCount: data.length,
                sheetName: metadata['sheetName'],
                parseTime: metadata['parseTime']
            });
            
            return { data, metadata };
            
        } catch (error) {
            ActionLogger.logError('Parser error: excel_parse_failed', error as Error);
            throw this.enhanceError(error, 'parse');
        }
    }

    async parsePartial(buffer: Buffer, options: ParserOptions & {
        offset: number;
        limit: number;
    }): Promise<{
        data: TestData[];
        metadata?: Record<string, any>;
    }> {
        try {
            const workbook = XLSX.read(buffer, {
                type: 'buffer',
                sheetRows: options.offset + options.limit + (options.headerRow || 1),
                cellFormula: false,
                cellStyles: false
            });
            
            const worksheet = this.getWorksheet(workbook, options);
            
            const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
            if (!range) {
                return { data: [] };
            }
            
            const headers = this.parseHeaders(worksheet, options);
            
            const data: TestData[] = [];
            const startRow = (options.headerRow || 1) + options.offset;
            const endRow = Math.min(startRow + options.limit - 1, range.e.r);
            
            for (let row = startRow; row <= endRow; row++) {
                const record = this.parseRow(worksheet, row, headers, range.e.c);
                if (record && Object.keys(record).length > 0) {
                    data.push(record);
                }
            }
            
            return {
                data,
                metadata: {
                    offset: options.offset,
                    limit: options.limit,
                    actualRows: data.length
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Parser error: excel_parse_partial_failed', error as Error);
            throw this.enhanceError(error, 'parsePartial');
        }
    }

    async stream(filePath: string, options: StreamOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const stream = createReadStream(filePath);
                const workbookStream = XLSX.stream.to_json({
                    raw: false,
                    defval: null,
                    header: options.headers !== false ? 'A' : 1,
                    range: options.range,
                    blankrows: false
                });
                
                let headers: string[] | undefined;
                let rowCount = 0;
                let batch: TestData[] = [];
                
                workbookStream.on('data', (row: any) => {
                    rowCount++;
                    
                    if (options.skipRows && rowCount <= options.skipRows) {
                        return;
                    }
                    
                    if (options.headers !== false && !headers) {
                        headers = Object.values(row);
                        return;
                    }
                    
                    const record = this.convertStreamRow(row, headers);
                    if (record) {
                        batch.push(record);
                        
                        if (batch.length >= (options.batchSize || 1000)) {
                            if (options.onBatch) {
                                options.onBatch(batch).catch(reject);
                            }
                            batch = [];
                        }
                    }
                });
                
                workbookStream.on('end', async () => {
                    if (batch.length > 0 && options.onBatch) {
                        await options.onBatch(batch);
                    }
                    
                    if (options.onEnd) {
                        options.onEnd();
                    }
                    
                    resolve();
                });
                
                workbookStream.on('error', (error: Error) => {
                    if (options.onError) {
                        options.onError(error);
                    }
                    reject(error);
                });
                
                stream.pipe(workbookStream);
                
            } catch (error) {
                reject(this.enhanceError(error, 'stream'));
            }
        });
    }

    async *streamBatches(filePath: string, options: StreamOptions): AsyncIterableIterator<TestData[]> {
        const batches: TestData[][] = [];
        let resolveBatch: ((batch: TestData[]) => void) | null = null;
        let rejectError: ((error: Error) => void) | null = null;
        let streamEnded = false;
        
        const streamPromise = this.stream(filePath, {
            ...options,
            onBatch: async (batch: TestData[]) => {
                if (resolveBatch) {
                    resolveBatch(batch);
                    resolveBatch = null;
                } else {
                    batches.push(batch);
                }
            },
            onEnd: () => {
                streamEnded = true;
                if (resolveBatch) {
                    resolveBatch([]);
                    resolveBatch = null;
                }
            },
            onError: (error: Error) => {
                if (rejectError) {
                    rejectError(error);
                    rejectError = null;
                }
            }
        });
        
        while (true) {
            if (batches.length > 0) {
                yield batches.shift()!;
            } else if (streamEnded) {
                break;
            } else {
                const batch = await new Promise<TestData[]>((resolve, reject) => {
                    resolveBatch = resolve;
                    rejectError = reject;
                });
                
                if (batch.length > 0) {
                    yield batch;
                } else {
                    break;
                }
            }
        }
        
        await streamPromise;
    }

    async extractSchema(buffer: Buffer, options: {
        sheetName?: string;
        sampleSize?: number;
    } = {}): Promise<DataSchema> {
        try {
            const workbook = XLSX.read(buffer, {
                type: 'buffer',
                sheetRows: options.sampleSize || 100
            });
            
            const worksheet = this.getWorksheet(workbook, options);
            const data = await this.parseWorksheet(worksheet, { headers: true });
            
            return this.inferSchema(data, options);
            
        } catch (error) {
            ActionLogger.logError('Parser error: excel_schema_extract_failed', error as Error);
            throw this.enhanceError(error, 'extractSchema');
        }
    }

    async parseXSD(_content: string): Promise<DataSchema> {
        throw new Error('XSD parsing not applicable for Excel files');
    }

    async getMetadata(buffer: Buffer): Promise<Record<string, any>> {
        try {
            const workbook = XLSX.read(buffer, {
                type: 'buffer',
                bookProps: true,
                bookSheets: true,
                bookVBA: false
            });
            
            const metadata: Record<string, any> = {
                sheetNames: workbook.SheetNames,
                sheetCount: workbook.SheetNames.length,
                properties: {}
            };
            
            if (workbook.Props) {
                metadata['properties'] = {
                    title: workbook.Props.Title,
                    subject: workbook.Props.Subject,
                    author: workbook.Props.Author,
                    company: workbook.Props.Company,
                    createdDate: workbook.Props.CreatedDate,
                    modifiedDate: workbook.Props.ModifiedDate,
                    lastModifiedBy: workbook.Props.LastAuthor
                };
            }
            
            metadata['sheets'] = workbook.SheetNames.map(name => {
                const sheet = workbook.Sheets[name];
                const range = sheet && sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
                
                return {
                    name,
                    rowCount: range ? range.e.r + 1 : 0,
                    columnCount: range ? range.e.c + 1 : 0,
                    hasData: !!range
                };
            });
            
            return metadata;
            
        } catch (error) {
            ActionLogger.logError('Parser error: excel_metadata_failed', error as Error);
            throw this.enhanceError(error, 'getMetadata');
        }
    }

    inferSchema(data: TestData[], options: {
        sampleSize?: number;
        detectTypes?: boolean;
        detectRequired?: boolean;
        detectUnique?: boolean;
    } = {}): DataSchema {
        const sample = data.slice(0, options.sampleSize || 100);
        const fieldMap = new Map<string, any>();
        
        for (const record of sample) {
            for (const [key, value] of Object.entries(record)) {
                if (!fieldMap.has(key)) {
                    fieldMap.set(key, {
                        name: key,
                        values: new Set(),
                        types: new Set(),
                        nullCount: 0,
                        totalCount: 0
                    });
                }
                
                const field = fieldMap.get(key)!;
                field.totalCount++;
                
                if (value === null || value === undefined || value === '') {
                    field.nullCount++;
                } else {
                    field.values.add(value);
                    field.types.add(this.detectType(value));
                }
            }
        }
        
        const fields = Array.from(fieldMap.entries()).map(([key, analysis]) => {
            const field: any = {
                name: key,
                type: this.consolidateTypes(Array.from(analysis.types)),
                required: options.detectRequired ? analysis.nullCount === 0 : false
            };
            
            if (options.detectUnique) {
                field.unique = analysis.values.size === analysis.totalCount - analysis.nullCount;
            }
            
            if (field.type === 'string') {
                const lengths = Array.from(analysis.values).map((v: any) => String(v).length);
                if (lengths.length > 0) {
                    field.maxLength = Math.max(...lengths);
                    field.minLength = Math.min(...lengths);
                }
            } else if (field.type === 'number') {
                const numbers = Array.from(analysis.values).map((v: any) => Number(v));
                if (numbers.length > 0) {
                    field.max = Math.max(...numbers);
                    field.min = Math.min(...numbers);
                }
            }
            
            return field;
        });
        
        return {
            version: '1.0',
            fields
        };
    }

    private getWorksheet(workbook: XLSX.WorkBook, options: ParserOptions): XLSX.WorkSheet {
        let sheetName: string;
        
        if (options.sheetName) {
            sheetName = options.sheetName;
        } else if (options.sheetIndex !== undefined) {
            sheetName = workbook.SheetNames[options.sheetIndex] || workbook.SheetNames[0] || '';
        } else {
            sheetName = workbook.SheetNames[0] || '';
        }
        
        if (!sheetName) {
            throw new Error('No sheets found in workbook');
        }
        
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
            throw new Error(`Sheet not found: ${sheetName}`);
        }
        
        return worksheet;
    }

    private async parseWorksheet(worksheet: XLSX.WorkSheet, options: ParserOptions): Promise<TestData[]> {
        if (options.range) {
            worksheet['!ref'] = options.range;
        }
        
        const sheetOptions: any = {
            raw: false,
            defval: null,
            range: options.skipRows || 0,
            blankrows: false,
            dateNF: 'yyyy-mm-dd'
        };
        
        if (options.headers === false) {
            sheetOptions.header = 1;
        }
        
        let data = XLSX.utils.sheet_to_json(worksheet, sheetOptions) as TestData[];
        
        const parseOptions = options as any;
        if (parseOptions.parseNumbers !== false || parseOptions.parseDates !== false) {
            data = await Promise.all(data.map(row => this.convertTypes(row as TestData, options)));
        }
        
        if ((options as any).trimValues !== false) {
            data = data.map(row => this.trimValues(row as TestData));
        }
        
        return data as TestData[];
    }

    private parseHeaders(worksheet: XLSX.WorkSheet, options: ParserOptions): string[] {
        const headerRow = options.headerRow || 1;
        const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
        
        if (!range) return [];
        
        const headers: string[] = [];
        
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: headerRow - 1, c: col });
            const cell = worksheet[cellAddress];
            
            if (cell && cell.v !== undefined) {
                headers.push(String(cell.v).trim());
            } else {
                headers.push(`Column_${col + 1}`);
            }
        }
        
        return headers;
    }

    private parseRow(worksheet: XLSX.WorkSheet, row: number, headers: string[], maxCol: number): TestData | null {
        const record: TestData = {};
        let hasData = false;
        
        for (let col = 0; col <= maxCol; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = worksheet[cellAddress];
            
            if (cell && cell.v !== undefined) {
                const header = headers[col] || `Column_${col + 1}`;
                record[header] = this.getCellValue(cell);
                hasData = true;
            }
        }
        
        return hasData ? record : null;
    }

    private getCellValue(cell: XLSX.CellObject): any {
        if (cell.t === 'n') return cell.v;
        if (cell.t === 'b') return cell.v;
        if (cell.t === 'd') return cell.v;
        if (cell.t === 'e') return null;
        
        return cell.w || cell.v;
    }

    private convertStreamRow(row: any, headers?: string[]): TestData | null {
        const record: TestData = {};
        let hasData = false;
        
        if (headers) {
            Object.values(row).forEach((value, index) => {
                if (index < headers.length && headers[index]) {
                    record[headers[index]] = value;
                    if (value !== null && value !== undefined) {
                        hasData = true;
                    }
                }
            });
        } else {
            Object.assign(record, row);
            hasData = Object.values(row).some(v => v !== null && v !== undefined);
        }
        
        return hasData ? record : null;
    }

    private async convertTypes(record: TestData, options: ParserOptions): Promise<TestData> {
        const converted: TestData = {};
        const parseOptions = options as any;
        
        for (const [key, value] of Object.entries(record)) {
            const result = await this.typeConverter.convert(value, 'auto', {
                parseNumbers: parseOptions.parseNumbers !== false,
                parseDates: parseOptions.parseDates !== false,
                parseBooleans: true,
                trimStrings: parseOptions.trimValues !== false
            });
            converted[key] = result.success ? result.value : value;
        }
        
        return converted;
    }

    private trimValues(record: TestData): TestData {
        const trimmed: TestData = {};
        
        for (const [key, value] of Object.entries(record)) {
            trimmed[key] = typeof value === 'string' ? value.trim() : value;
        }
        
        return trimmed;
    }

    private detectType(value: any): string {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (value instanceof Date) return 'date';
        if (typeof value === 'object') return 'object';
        return 'string';
    }

    private consolidateTypes(types: string[]): string {
        if (types.length === 0) return 'string';
        if (types.length === 1) return types[0] || 'string';
        
        const nonNullTypes = types.filter(t => t !== 'null');
        if (nonNullTypes.length === 0) return 'string';
        if (nonNullTypes.length === 1) return nonNullTypes[0] || 'string';
        
        return 'string';
    }

    private getWorkbookMetadata(workbook: XLSX.WorkBook, worksheet: XLSX.WorkSheet): Record<string, any> {
        const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
        
        return {
            sheetName: workbook.SheetNames.find(name => workbook.Sheets[name] === worksheet),
            rowCount: range ? range.e.r + 1 : 0,
            columnCount: range ? range.e.c + 1 : 0,
            hasFormulas: this.hasFormulas(worksheet),
            hasMergedCells: !!worksheet['!merges']?.length
        };
    }

    private hasFormulas(worksheet: XLSX.WorkSheet): boolean {
        for (const cellAddress in worksheet) {
            if (cellAddress[0] === '!') continue;
            
            const cell = worksheet[cellAddress];
            if (cell && cell.f) {
                return true;
            }
        }
        
        return false;
    }

    private enhanceError(error: any, operation: string): Error {
        const message = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(
            `Excel Parser Error [${operation}]: ${message}\n` +
            `This may be due to corrupted file, unsupported format, or invalid options.`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}
