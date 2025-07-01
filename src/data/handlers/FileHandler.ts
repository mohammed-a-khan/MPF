// src/data/handlers/FileHandler.ts

import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation } from '../types/data.types';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, statSync } from 'fs';
import * as readline from 'readline';
import * as zlib from 'zlib';

export class FileHandler implements DataHandler {
    private validator: DataValidator;
    private transformer: DataTransformer;
    protected supportedExtensions: string[] = ['.txt', '.log', '.dat', '.data', '.text'];
    protected supportedCompressions: string[] = ['.gz', '.zip', '.bz2'];
    
    constructor() {
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
    }

    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: file_load', { operation: 'file_load', options });
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            await this.validateFile(filePath);
            
            const format = await this.detectFormat(filePath, options);
            
            let data: TestData[];
            let metadata: Record<string, any>;
            
            switch (format) {
                case 'lines':
                    const linesResult = await this.loadLines(filePath, options);
                    data = linesResult.data;
                    metadata = linesResult.metadata || {};
                    break;
                    
                case 'delimited':
                    const delimitedResult = await this.loadDelimited(filePath, options);
                    data = delimitedResult.data;
                    metadata = delimitedResult.metadata || {};
                    break;
                    
                case 'fixed-width':
                    const fixedResult = await this.loadFixedWidth(filePath, options);
                    data = fixedResult.data;
                    metadata = fixedResult.metadata || {};
                    break;
                    
                case 'key-value':
                    const kvResult = await this.loadKeyValue(filePath, options);
                    data = kvResult.data;
                    metadata = kvResult.metadata || {};
                    break;
                    
                default:
                    throw new Error(`Unsupported file format: ${format}`);
            }
            
            if (options.filter) {
                data = data.filter(row => this.matchesFilter(row, options.filter!));
            }
            
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
                    format
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: file_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    private async loadLines(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const data: TestData[] = [];
        const fileStream = await this.createInputStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        let skippedLines = 0;
        const fileOptions = options as any;
        
        for await (const line of rl) {
            lineNumber++;
            
            if (!line.trim() && fileOptions.skipEmptyLines !== false) {
                skippedLines++;
                continue;
            }
            
            if (options.skipRows && lineNumber <= options.skipRows) {
                skippedLines++;
                continue;
            }
            
            if (fileOptions.commentPrefix && line.trim().startsWith(fileOptions.commentPrefix)) {
                skippedLines++;
                continue;
            }
            
            const record: TestData = {
                lineNumber,
                content: line,
                length: line.length
            };
            
            if (fileOptions.linePattern) {
                const parsed = this.parseLinePattern(line, fileOptions.linePattern);
                Object.assign(record, parsed);
            }
            
            data.push(record);
            
            if (options.maxRecords && data.length >= options.maxRecords) {
                break;
            }
        }
        
        return {
            data,
            metadata: {
                format: 'lines',
                totalRecords: data.length,
                totalLines: lineNumber,
                skippedLines,
                processedLines: data.length
            }
        };
    }

    private async loadDelimited(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const fileOptions = options as any;
        const delimiter = fileOptions.delimiter || this.detectDelimiter(await this.readSampleLines(filePath, 10));
        const data: TestData[] = [];
        const fileStream = await this.createInputStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        let headers: string[] = [];
        let skippedLines = 0;
        
        for await (const line of rl) {
            lineNumber++;
            
            if (!line.trim() && fileOptions.skipEmptyLines !== false) {
                skippedLines++;
                continue;
            }
            
            if (options.skipRows && lineNumber <= options.skipRows) {
                skippedLines++;
                continue;
            }
            
            if (fileOptions.commentPrefix && line.trim().startsWith(fileOptions.commentPrefix)) {
                skippedLines++;
                continue;
            }
            
            const parts = this.splitDelimited(line, delimiter, options);
            
            if (options.headers !== false && headers.length === 0) {
                headers = parts.map(h => h.trim());
                continue;
            }
            
            const record: TestData = {};
            
            if (headers.length > 0) {
                headers.forEach((header, index) => {
                    record[header] = this.parseValue(parts[index] || '');
                });
            } else {
                parts.forEach((value, index) => {
                    record[`column_${index + 1}`] = this.parseValue(value);
                });
            }
            
            data.push(record);
            
            if (options.maxRecords && data.length >= options.maxRecords) {
                break;
            }
        }
        
        return {
            data,
            metadata: {
                format: 'delimited',
                totalRecords: data.length,
                delimiter,
                headers,
                columnCount: headers.length || (data[0] ? Object.keys(data[0]).length : 0),
                skippedLines,
                totalLines: lineNumber
            }
        };
    }

    private async loadFixedWidth(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const fileOptions = options as any;
        if (!fileOptions.columnWidths) {
            throw new Error('columnWidths must be specified for fixed-width format');
        }
        
        const data: TestData[] = [];
        const fileStream = await this.createInputStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        const columns = fileOptions.columnNames || fileOptions.columnWidths.map((_: any, i: number) => `column_${i + 1}`);
        let skippedLines = 0;
        
        for await (const line of rl) {
            lineNumber++;
            
            if (!line.trim() && fileOptions.skipEmptyLines !== false) {
                skippedLines++;
                continue;
            }
            
            if (options.skipRows && lineNumber <= options.skipRows) {
                skippedLines++;
                continue;
            }
            
            const record: TestData = {};
            let position = 0;
            
            fileOptions.columnWidths.forEach((width: number, index: number) => {
                const value = line.substr(position, width).trim();
                record[columns[index]] = this.parseValue(value);
                position += width;
            });
            
            data.push(record);
            
            if (options.maxRecords && data.length >= options.maxRecords) {
                break;
            }
        }
        
        return {
            data,
            metadata: {
                format: 'fixed-width',
                totalRecords: data.length,
                columnWidths: fileOptions.columnWidths,
                columns,
                skippedLines,
                totalLines: lineNumber
            }
        };
    }

    private async loadKeyValue(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const fileOptions = options as any;
        const separator = fileOptions.keyValueSeparator || '=';
        const sectionDelimiter = fileOptions.sectionDelimiter || /\n\s*\n/;
        const data: TestData[] = [];
        const content = await this.readFileContent(filePath);
        
        const sections = typeof sectionDelimiter === 'string' 
            ? content.split(sectionDelimiter)
            : content.split(sectionDelimiter);
        
        let sectionCount = 0;
        
        for (const section of sections) {
            if (!section.trim()) continue;
            
            sectionCount++;
            const record: TestData = {};
            const lines = section.split('\n');
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                
                if (!trimmedLine || 
                    (fileOptions.commentPrefix && trimmedLine.startsWith(fileOptions.commentPrefix))) {
                    continue;
                }
                
                const separatorIndex = line.indexOf(separator);
                if (separatorIndex > -1) {
                    const key = line.substring(0, separatorIndex).trim();
                    const value = line.substring(separatorIndex + separator.length).trim();
                    record[key] = this.parseValue(value);
                }
            }
            
            if (Object.keys(record).length > 0) {
                if (fileOptions.includeSectionMetadata) {
                    record['_section'] = sectionCount;
                }
                data.push(record);
            }
            
            if (options.maxRecords && data.length >= options.maxRecords) {
                break;
            }
        }
        
        return {
            data,
            metadata: {
                format: 'key-value',
                totalRecords: data.length,
                separator,
                sectionCount,
                totalSections: sections.length
            }
        };
    }

    async *stream(options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const filePath = await this.resolveFilePath(options.source!);
        const format = await this.detectFormat(filePath, options);
        
        if (format === 'lines') {
            yield* this.streamLines(filePath, options);
        } else if (format === 'delimited') {
            yield* this.streamDelimited(filePath, options);
        } else {
            const result = await this.load(options);
            for (const record of result.data) {
                yield record;
            }
        }
    }

    private async *streamLines(filePath: string, options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const fileStream = await this.createInputStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        let recordCount = 0;
        const fileOptions = options as any;
        
        for await (const line of rl) {
            lineNumber++;
            
            if (!line.trim() && fileOptions.skipEmptyLines !== false) continue;
            
            if (options.skipRows && lineNumber <= options.skipRows) continue;
            
            if (fileOptions.commentPrefix && line.trim().startsWith(fileOptions.commentPrefix)) continue;
            
            const record: TestData = {
                lineNumber,
                content: line,
                length: line.length
            };
            
            if (fileOptions.linePattern) {
                const parsed = this.parseLinePattern(line, fileOptions.linePattern);
                Object.assign(record, parsed);
            }
            
            if (options.filter && !this.matchesFilter(record, options.filter)) {
                continue;
            }
            
            yield record;
            recordCount++;
            
            if (options.maxRecords && recordCount >= options.maxRecords) {
                break;
            }
        }
    }

    private async *streamDelimited(filePath: string, options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const fileOptions = options as any;
        const delimiter = fileOptions.delimiter || this.detectDelimiter(await this.readSampleLines(filePath, 10));
        const fileStream = await this.createInputStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        let lineNumber = 0;
        let headers: string[] = [];
        let recordCount = 0;
        
        for await (const line of rl) {
            lineNumber++;
            
            if (!line.trim() && fileOptions.skipEmptyLines !== false) continue;
            
            if (options.skipRows && lineNumber <= options.skipRows) continue;
            
            if (fileOptions.commentPrefix && line.trim().startsWith(fileOptions.commentPrefix)) continue;
            
            const parts = this.splitDelimited(line, delimiter, options);
            
            if (options.headers !== false && headers.length === 0) {
                headers = parts.map(h => h.trim());
                continue;
            }
            
            const record: TestData = {};
            
            if (headers.length > 0) {
                headers.forEach((header, index) => {
                    record[header] = this.parseValue(parts[index] || '');
                });
            } else {
                parts.forEach((value, index) => {
                    record[`column_${index + 1}`] = this.parseValue(value);
                });
            }
            
            if (options.filter && !this.matchesFilter(record, options.filter)) {
                continue;
            }
            
            yield record;
            recordCount++;
            
            if (options.maxRecords && recordCount >= options.maxRecords) {
                break;
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
        const sampleOptions = { ...options, maxRecords: 100 };
        const sampleData = await this.load(sampleOptions);
        
        return this.inferSchema(sampleData.data);
    }

    async getMetadata(options: DataProviderOptions): Promise<Record<string, any>> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const stats = await fs.stat(filePath);
            const format = await this.detectFormat(filePath, options);
            
            let lineCount = 0;
            const fileStream = await this.createInputStream(filePath);
            const rl = readline.createInterface({ input: fileStream });
            
            for await (const _line of rl) {
                lineCount++;
            }
            
            const encoding = await this.detectEncoding(filePath);
            
            const isCompressed = this.isCompressed(filePath);
            
            return {
                filePath,
                fileSize: stats.size,
                modifiedDate: stats.mtime,
                createdDate: stats.birthtime,
                lineCount,
                format,
                encoding,
                extension: path.extname(filePath),
                isCompressed,
                compressionType: isCompressed ? this.getCompressionType(filePath) : null
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: file_metadata_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async validate(data: TestData[], _options?: any): Promise<ValidationResult> {
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

    protected async createInputStream(filePath: string): Promise<NodeJS.ReadableStream> {
        const stream = createReadStream(filePath);
        
        if (this.isCompressed(filePath)) {
            const compressionType = this.getCompressionType(filePath);
            
            switch (compressionType) {
                case 'gzip':
                    return stream.pipe(zlib.createGunzip());
                case 'deflate':
                    return stream.pipe(zlib.createInflate());
                case 'brotli':
                    return stream.pipe(zlib.createBrotliDecompress());
                default:
                    logger.warn(`Unsupported compression type: ${compressionType}`);
                    return stream;
            }
        }
        
        return stream;
    }

    protected isCompressed(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ['.gz', '.gzip', '.z', '.br'].includes(ext);
    }

    protected getCompressionType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        
        switch (ext) {
            case '.gz':
            case '.gzip':
                return 'gzip';
            case '.z':
                return 'deflate';
            case '.br':
                return 'brotli';
            default:
                return 'unknown';
        }
    }

    protected async readFileContent(filePath: string): Promise<string> {
        if (this.isCompressed(filePath)) {
            const stream = await this.createInputStream(filePath);
            const chunks: Buffer[] = [];
            
            for await (const chunk of stream) {
                chunks.push(chunk as Buffer);
            }
            
            return Buffer.concat(chunks).toString('utf-8');
        }
        
        return await fs.readFile(filePath, 'utf-8');
    }

    protected detectDelimiter(lines: string[]): string {
        const delimiters = ['\t', ',', '|', ';', ':'];
        const scores: Record<string, number> = {};
        
        for (const delimiter of delimiters) {
            scores[delimiter] = 0;
            
            const counts = lines.map(line => (line.match(new RegExp(this.escapeRegex(delimiter), 'g')) || []).length);
            
            if (counts.length > 1) {
                const firstCount = counts[0];
                if (firstCount !== undefined) {
                    const consistent = counts.slice(1).filter(c => c === firstCount).length;
                    scores[delimiter] = consistent / (counts.length - 1);
                }
            }
        }
        
        let maxScore = 0;
        let bestDelimiter = '\t';
        
        for (const [delimiter, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                bestDelimiter = delimiter;
            }
        }
        
        return bestDelimiter;
    }

    protected splitDelimited(line: string, delimiter: string, options: DataProviderOptions): string[] {
        const fileOptions = options as any;
        const quote = fileOptions.quoteChar || '"';
        const escape = fileOptions.escapeChar || '\\';
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        let escaped = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (escaped) {
                current += char;
                escaped = false;
            } else if (char === escape) {
                escaped = true;
            } else if (char === quote) {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        parts.push(current);
        
        if (fileOptions.removeQuotes !== false) {
            return parts.map(part => {
                if (part.startsWith(quote) && part.endsWith(quote)) {
                    return part.slice(1, -1);
                }
                return part;
            });
        }
        
        return parts;
    }

    protected async detectFormat(filePath: string, options: DataProviderOptions): Promise<string> {
        const fileOptions = options as any;
        if (fileOptions.fileFormat) {
            return fileOptions.fileFormat;
        }
        
        const ext = path.extname(filePath).toLowerCase();
        if (['.tsv', '.tab'].includes(ext)) {
            return 'delimited';
        }
        if (['.csv'].includes(ext)) {
            return 'delimited';
        }
        if (['.fwf', '.fixed'].includes(ext)) {
            return 'fixed-width';
        }
        if (['.properties', '.ini', '.conf', '.config'].includes(ext)) {
            return 'key-value';
        }
        
        const sample = await this.readSampleLines(filePath, 10);
        
        const delimiters = ['\t', ',', '|', ';', ':'];
        for (const delimiter of delimiters) {
            if (this.hasConsistentDelimiter(sample, delimiter)) {
                return 'delimited';
            }
        }
        
        if (this.isKeyValueFormat(sample)) {
            return 'key-value';
        }
        
        if (fileOptions.columnWidths || this.isFixedWidthFormat(sample)) {
            return 'fixed-width';
        }
        
        return 'lines';
    }

    protected parseLinePattern(line: string, pattern: string | RegExp): Record<string, any> {
        const result: Record<string, any> = {};
        
        if (typeof pattern === 'string') {
            const regex = new RegExp(pattern);
            const match = line.match(regex);
            
            if (match && match.groups) {
                Object.assign(result, match.groups);
            } else if (match) {
                match.slice(1).forEach((value, index) => {
                    result[`group_${index + 1}`] = value;
                });
            }
        } else {
            const match = line.match(pattern);
            
            if (match && match.groups) {
                Object.assign(result, match.groups);
            } else if (match) {
                match.slice(1).forEach((value, index) => {
                    result[`group_${index + 1}`] = value;
                });
            }
        }
        
        return result;
    }

    protected parseValue(value: string): any {
        if (!value || value.toLowerCase() === 'null' || value.toLowerCase() === 'nil') {
            return null;
        }
        
        if (value.toLowerCase() === 'true' || value.toLowerCase() === 'yes') return true;
        if (value.toLowerCase() === 'false' || value.toLowerCase() === 'no') return false;
        
        if (/^-?\d+$/.test(value)) {
            const num = parseInt(value, 10);
            return isNaN(num) ? value : num;
        }
        if (/^-?\d+\.\d+$/.test(value)) {
            const num = parseFloat(value);
            return isNaN(num) ? value : num;
        }
        
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        
        if (value.includes(',') && value.startsWith('[') && value.endsWith(']')) {
            return value.slice(1, -1).split(',').map(v => this.parseValue(v.trim()));
        }
        
        if (value.startsWith('{') && value.endsWith('}')) {
            try {
                return JSON.parse(value);
            } catch {
            }
        }
        
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }
        
        return value;
    }

    protected hasConsistentDelimiter(lines: string[], delimiter: string): boolean {
        if (lines.length < 2) return false;
        
        const escapedDelimiter = this.escapeRegex(delimiter);
        const counts = lines.map(line => (line.match(new RegExp(escapedDelimiter, 'g')) || []).length);
        const firstCount = counts[0];
        
        if (firstCount === undefined) return false;
        
        const consistent = counts.slice(1).filter(count => count === firstCount || count === firstCount - 1);
        return consistent.length >= (counts.length - 1) * 0.8;
    }

    protected isKeyValueFormat(lines: string[]): boolean {
        const keyValuePatterns = [
            /^[a-zA-Z0-9_\-\.]+\s*[:=]\s*.+$/,
            /^[a-zA-Z0-9_\-\.]+\s+.+$/
        ];
        
        let matchCount = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && keyValuePatterns.some(pattern => pattern.test(trimmed))) {
                matchCount++;
            }
        }
        
        return matchCount >= lines.length * 0.7;
    }

    protected isFixedWidthFormat(lines: string[]): boolean {
        if (lines.length < 3) return false;
        
        const lengths = lines.map(line => line.length);
        const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
        
        return variance < avgLength * 0.1;
    }

    protected async readSampleLines(filePath: string, count: number): Promise<string[]> {
        const lines: string[] = [];
        const fileStream = await this.createInputStream(filePath);
        const rl = readline.createInterface({ input: fileStream });
        
        for await (const line of rl) {
            lines.push(line);
            if (lines.length >= count) {
                rl.close();
                break;
            }
        }
        
        return lines;
    }

    protected async detectEncoding(filePath: string): Promise<string> {
        const buffer = Buffer.alloc(4);
        const fd = await fs.open(filePath, 'r');
        
        try {
            await fd.read(buffer, 0, 4, 0);
            
            if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
                return 'utf-8';
            }
            if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
                return 'utf-16le';
            }
            if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
                return 'utf-16be';
            }
            if (buffer[0] === 0xFF && buffer[1] === 0xFE && buffer[2] === 0x00 && buffer[3] === 0x00) {
                return 'utf-32le';
            }
            if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xFE && buffer[3] === 0xFF) {
                return 'utf-32be';
            }
            
            return 'utf-8';
        } finally {
            await fd.close();
        }
    }

    protected inferSchema(data: TestData[]): any {
        if (data.length === 0) {
            return { version: '1.0', fields: [] };
        }
        
        const fieldMap = new Map<string, any>();
        
        for (const record of data) {
            for (const [key, value] of Object.entries(record)) {
                if (!fieldMap.has(key)) {
                    fieldMap.set(key, {
                        name: key,
                        types: new Set(),
                        nullable: false,
                        samples: [],
                        minLength: Infinity,
                        maxLength: 0,
                        minValue: Infinity,
                        maxValue: -Infinity
                    });
                }
                
                const field = fieldMap.get(key)!;
                
                if (value === null || value === undefined) {
                    field.nullable = true;
                } else {
                    const type = Array.isArray(value) ? 'array' : typeof value;
                    field.types.add(type);
                    
                    if (field.samples.length < 10) {
                        field.samples.push(value);
                    }
                    
                    if (typeof value === 'string') {
                        field.minLength = Math.min(field.minLength, value.length);
                        field.maxLength = Math.max(field.maxLength, value.length);
                    }
                    
                    if (typeof value === 'number') {
                        field.minValue = Math.min(field.minValue, value);
                        field.maxValue = Math.max(field.maxValue, value);
                    }
                }
            }
        }
        
        const fields = Array.from(fieldMap.entries()).map(([key, analysis]) => {
            const types = Array.from(analysis.types);
            let type = 'string';
            
            if (types.length === 1) {
                type = types[0] as string;
            } else if (types.includes('number') && types.includes('string')) {
                const allNumeric = analysis.samples
                    .filter((s: any) => typeof s === 'string')
                    .every((s: string) => !isNaN(Number(s)));
                
                if (allNumeric) {
                    type = 'number';
                }
            }
            
            const fieldSchema: any = {
                name: key,
                type,
                required: !analysis.nullable,
                samples: analysis.samples.slice(0, 5)
            };
            
            if (type === 'string') {
                fieldSchema.minLength = analysis.minLength === Infinity ? 0 : analysis.minLength;
                fieldSchema.maxLength = analysis.maxLength;
            } else if (type === 'number') {
                fieldSchema.minimum = analysis.minValue === Infinity ? null : analysis.minValue;
                fieldSchema.maximum = analysis.maxValue === -Infinity ? null : analysis.maxValue;
            }
            
            return fieldSchema;
        });
        
        return {
            version: '1.0',
            recordCount: data.length,
            fields
        };
    }

    protected async resolveFilePath(source: string): Promise<string> {
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
        
        const projectRoot = process.env['PROJECT_ROOT'] || process.cwd();
        const projectPath = path.resolve(projectRoot, source);
        
        if (await this.fileExists(projectPath)) {
            return projectPath;
        }
        
        throw new Error(`File not found: ${source}. Searched in current directory, test-data directory, and project root.`);
    }

    protected async validateFile(filePath: string): Promise<void> {
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${filePath}`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        
        if (this.isCompressed(filePath)) {
            const baseExt = path.extname(path.basename(filePath, ext)).toLowerCase();
            if (!this.isSupported(baseExt)) {
                logger.warn(`Unsupported file extension: ${baseExt}. Attempting to process anyway.`);
            }
        } else if (!this.isSupported(ext)) {
            logger.warn(`Unsupported file extension: ${ext}. Attempting to process anyway.`);
        }
        
        const maxSize = parseInt(process.env['MAX_FILE_SIZE'] || '524288000');
        if (stats.size > maxSize) {
            throw new Error(
                `File too large: ${stats.size} bytes (max: ${maxSize} bytes). ` +
                `Consider using streaming or increasing MAX_FILE_SIZE`
            );
        }
    }

    protected isSupported(ext: string): boolean {
        return this.supportedExtensions.includes(ext) || 
               ext === '.csv' || 
               ext === '.tsv' || 
               ext === '';
    }

    protected async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    protected getFileSize(filePath: string): number {
        try {
            return statSync(filePath).size;
        } catch {
            return 0;
        }
    }

    protected matchesFilter(record: TestData, filter: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(filter)) {
            if (typeof value === 'function') {
                if (!value(record[key])) {
                    return false;
                }
            } else if (value instanceof RegExp) {
                if (!value.test(String(record[key] || ''))) {
                    return false;
                }
            } else if (Array.isArray(value)) {
                if (!value.includes(record[key])) {
                    return false;
                }
            } else if (typeof value === 'object' && value !== null) {
                if (!this.matchesComplexFilter(record[key], value)) {
                    return false;
                }
            } else {
                if (record[key] !== value) {
                    return false;
                }
            }
        }
        return true;
    }

    protected matchesComplexFilter(value: any, filter: any): boolean {
        if ('$gt' in filter && !(value > filter.$gt)) return false;
        if ('$gte' in filter && !(value >= filter.$gte)) return false;
        if ('$lt' in filter && !(value < filter.$lt)) return false;
        if ('$lte' in filter && !(value <= filter.$lte)) return false;
        if ('$ne' in filter && value === filter.$ne) return false;
        if ('$in' in filter && !filter.$in.includes(value)) return false;
        if ('$nin' in filter && filter.$nin.includes(value)) return false;
        if ('$regex' in filter && !new RegExp(filter.$regex, filter.$options).test(String(value))) return false;
        
        return true;
    }

    protected escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    protected enhanceError(error: any, options: DataProviderOptions): Error {
        const enhancedError = new Error(
            `File Handler Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `File: ${options.source}\n` +
            `Format: ${(options as any).fileFormat || 'auto-detect'}\n` +
            `Options: ${JSON.stringify(options, null, 2)}`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}
