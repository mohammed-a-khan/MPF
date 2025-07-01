// src/data/handlers/XMLHandler.ts
import { DataHandler, DataProviderOptions, DataProviderResult, TestData, ValidationResult, DataTransformation } from '../types/data.types';
import { XMLParser } from '../parsers/XMLParser';
import { DataValidator } from '../validators/DataValidator';
import { DataTransformer } from '../transformers/DataTransformer';
import { DataEncryptionManager } from '../provider/DataEncryptionManager';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, statSync } from 'fs';
import * as xml2js from 'xml2js';
import * as sax from 'sax';

export class XMLHandler implements DataHandler {
    private parser: XMLParser;
    private validator: DataValidator;
    private transformer: DataTransformer;
    private streamingThreshold: number;
    
    constructor() {
        this.parser = new XMLParser();
        this.validator = new DataValidator();
        this.transformer = new DataTransformer();
        this.streamingThreshold = parseInt(process.env['XML_STREAMING_THRESHOLD'] || '10485760');
    }

    async load(options: DataProviderOptions): Promise<DataProviderResult> {
        const startTime = Date.now();
        ActionLogger.logInfo('Data handler operation: xml_load', { operation: 'xml_load', options });
        
        try {
            const filePath = await this.resolveFilePath(options.source!);
            await this.validateFile(filePath);
            
            const fileSize = this.getFileSize(filePath);
            const useStreaming = options.streaming || fileSize > this.streamingThreshold;
            
            let data: TestData[];
            let metadata: Record<string, any>;
            
            if (useStreaming && options.xmlPath) {
                logger.debug(`Using streaming for large XML file: ${fileSize} bytes`);
                const result = await this.loadStreaming(filePath, options);
                data = result.data;
                metadata = result.metadata || {};
            } else {
                const content = await fs.readFile(filePath, 'utf-8');
                const parseResult = await this.parser.parse(content, {
                    xmlPath: options.xmlPath,
                    namespaces: options.namespace,
                    attributePrefix: '@',
                    textNodeName: '#text',
                    ignoreAttributes: false
                } as any);
                
                data = this.normalizeData(parseResult.data);
                metadata = parseResult.metadata || {};
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
                    fileSize,
                    streaming: useStreaming
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: xml_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    private async loadStreaming(filePath: string, options: DataProviderOptions): Promise<DataProviderResult> {
        const data: TestData[] = [];
        const xmlPath = options.xmlPath || '';
        const pathParts = xmlPath.split('/').filter(p => p);
        
        return new Promise((resolve, reject) => {
            const stream = createReadStream(filePath, { encoding: 'utf-8' });
            const parser = sax.createStream(true, {
                trim: true,
                normalize: true,
                xmlns: true
            });
            
            let currentPath: string[] = [];
            let currentElement: any = null;
            let currentText = '';
            let isTargetElement = false;
            
            parser.on('opentag', (node: any) => {
                currentPath.push(node.name);
                currentText = '';
                
                if (this.matchesPath(currentPath, pathParts)) {
                    isTargetElement = true;
                    currentElement = {};
                    
                    if (node.attributes) {
                        for (const [key, value] of Object.entries(node.attributes)) {
                            currentElement[`@${key}`] = value;
                        }
                    }
                }
            });
            
            parser.on('text', (text: string) => {
                if (isTargetElement) {
                    currentText += text;
                }
            });
            
            parser.on('closetag', (_tagName: string) => {
                if (isTargetElement && currentPath.join('/') === xmlPath) {
                    if (currentText.trim()) {
                        currentElement['#text'] = currentText.trim();
                    }
                    
                    const normalized = this.normalizeItem(currentElement);
                    
                    if (!options.filter || this.matchesFilter(normalized, options.filter)) {
                        data.push(normalized);
                        
                        if (options.maxRecords && data.length >= options.maxRecords) {
                            stream.destroy();
                        }
                    }
                    
                    isTargetElement = false;
                    currentElement = null;
                }
                
                currentPath.pop();
                currentText = '';
            });
            
            parser.on('end', () => {
                resolve({
                    data: options.maxRecords ? data.slice(0, options.maxRecords) : data,
                    metadata: {
                        totalRecords: data.length,
                        streaming: true,
                        xmlPath
                    }
                });
            });
            
            parser.on('error', reject);
            stream.on('error', reject);
            
            stream.pipe(parser);
        });
    }

    async *stream(options: DataProviderOptions): AsyncIterableIterator<TestData> {
        const filePath = await this.resolveFilePath(options.source!);
        const xmlPath = options.xmlPath || '';
        const pathParts = xmlPath.split('/').filter(p => p);
        
        const stream = createReadStream(filePath, { encoding: 'utf-8' });
        const parser = sax.createStream(true, {
            trim: true,
            normalize: true,
            xmlns: true
        });
        
        let currentPath: string[] = [];
        let currentElement: any = null;
        let recordCount = 0;
        
        const elements: TestData[] = [];
        let resolveNext: ((value: IteratorResult<TestData>) => void) | null = null;
        
        parser.on('opentag', (node: any) => {
            currentPath.push(node.name);
            
            if (this.matchesPath(currentPath, pathParts)) {
                currentElement = {};
                
                if (node.attributes) {
                    for (const [key, value] of Object.entries(node.attributes)) {
                        currentElement[`@${key}`] = value;
                    }
                }
            }
        });
        
        parser.on('closetag', (_tagName: string) => {
            if (currentElement && currentPath.join('/') === xmlPath) {
                const normalized = this.normalizeItem(currentElement);
                
                if (!options.filter || this.matchesFilter(normalized, options.filter)) {
                    elements.push(normalized);
                    
                    if (resolveNext) {
                        resolveNext({ value: elements.shift()!, done: false });
                        resolveNext = null;
                    }
                    
                    recordCount++;
                    
                    if (options.maxRecords && recordCount >= options.maxRecords) {
                        stream.destroy();
                    }
                }
                
                currentElement = null;
            }
            
            currentPath.pop();
        });
        
        stream.pipe(parser);
        
        while (true) {
            if (elements.length > 0) {
                yield elements.shift()!;
            } else {
                const result = await new Promise<IteratorResult<TestData>>((resolve) => {
                    resolveNext = resolve;
                    
                    parser.on('end', () => {
                        resolve({ value: undefined as any, done: true });
                    });
                });
                
                if (result.done) break;
                yield result.value;
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
            
            const content = await fs.readFile(filePath, 'utf-8');
            const parseOptions: any = {};
            if (options.xmlPath) {
                parseOptions.xmlPath = options.xmlPath;
            }
            if (options.namespace) {
                parseOptions.namespaces = options.namespace;
            }
            const parseResult = await this.parser.parse(content, parseOptions);
            
            const allData = this.normalizeData(parseResult.data);
            const data = allData.slice(offset, offset + limit);
            
            const loadTime = Date.now() - startTime;
            
            return {
                data,
                metadata: {
                    totalRecords: data.length,
                    totalAvailable: allData.length,
                    offset,
                    limit,
                    loadTime,
                    source: filePath
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Data handler error: xml_partial_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async loadSchema(options: DataProviderOptions): Promise<any> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            
            const xsdPath = filePath.replace(/\.xml$/i, '.xsd');
            if (await this.fileExists(xsdPath)) {
                const xsdContent = await fs.readFile(xsdPath, 'utf-8');
                return await this.parser.parseXSD(xsdContent);
            }
            
            const content = await fs.readFile(filePath, 'utf-8');
            const parseOptions: any = {};
            if (options.xmlPath) {
                parseOptions.xmlPath = options.xmlPath;
            }
            const parseResult = await this.parser.parse(content, parseOptions);
            
            const data = this.normalizeData(parseResult.data);
            
            return await this.parser.inferSchema(data, {
                sampleSize: Math.min(100, data.length),
                detectTypes: true,
                detectRequired: true
            });
            
        } catch (error) {
            ActionLogger.logError('Data handler error: xml_schema_load_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async getMetadata(options: DataProviderOptions): Promise<Record<string, any>> {
        try {
            const filePath = await this.resolveFilePath(options.source!);
            const stats = await fs.stat(filePath);
            
            const content = await fs.readFile(filePath, 'utf-8');
            const parseOptions: xml2js.ParserOptions = {
                ignoreAttrs: false,
                attrkey: '@'
            };
            
            const parser = new xml2js.Parser(parseOptions);
            const result = await parser.parseStringPromise(content);
            
            const metadata: Record<string, any> = {
                filePath,
                fileSize: stats.size,
                modifiedDate: stats.mtime,
                createdDate: stats.birthtime,
                encoding: this.detectEncoding(content),
                rootElement: Object.keys(result)[0],
                namespaces: this.extractNamespaces(content)
            };
            
            const root = result[metadata['rootElement']];
            if (root) {
                metadata['childElements'] = Object.keys(root).filter(k => !k.startsWith('@'));
                metadata['attributes'] = Object.keys(root).filter(k => k.startsWith('@'));
            }
            
            return metadata;
            
        } catch (error) {
            ActionLogger.logError('Data handler error: xml_metadata_failed', error as Error);
            throw this.enhanceError(error, options);
        }
    }

    async validate(data: TestData[]): Promise<ValidationResult> {
        const validationRules: Record<string, any> = {};
        
        const commonFields = ['id', 'name'];
        for (const field of commonFields) {
            validationRules[field] = { type: 'required', field };
        }
        
        const result = await this.validator.validate(data, validationRules, {
            validateRequired: true,
            validateTypes: true,
            stopOnFirstError: false
        });
        
        return {
            isValid: result.valid,
            errors: result.errors.map(e => e.errors?.join(', ') || 'Validation error'),
            warnings: result.warnings?.map(w => w.errors?.join(', ') || 'Validation warning'),
            details: result.errors.map((e, index) => ({
                row: index,
                field: '',
                value: undefined,
                error: e.errors?.join(', ') || 'Validation error'
            }))
        };
    }

    async transform(data: TestData[], transformations: DataTransformation[]): Promise<TestData[]> {
        return await this.transformer.transform(data, transformations);
    }

    private matchesPath(currentPath: string[], targetPath: string[]): boolean {
        if (targetPath.length === 0) return true;
        if (currentPath.length < targetPath.length) return false;
        
        for (let i = 0; i < targetPath.length; i++) {
            if (targetPath[i] !== '*' && targetPath[i] !== currentPath[i]) {
                return false;
            }
        }
        
        return true;
    }

    private normalizeData(data: any): TestData[] {
        if (Array.isArray(data)) {
            return data.map(item => this.normalizeItem(item));
        } else if (typeof data === 'object' && data !== null) {
            return [this.normalizeItem(data)];
        } else {
            throw new Error('XML data must be an object or array');
        }
    }

    private normalizeItem(item: any): TestData {
        const normalized: TestData = {};
        
        for (const [key, value] of Object.entries(item)) {
            if (Array.isArray(value) && value.length === 1) {
                normalized[key] = this.normalizeValue(value[0]);
            } else {
                normalized[key] = this.normalizeValue(value);
            }
        }
        
        return normalized;
    }

    private normalizeValue(value: any): any {
        if (typeof value === 'object' && value !== null) {
            if (value['#text'] !== undefined && Object.keys(value).length === 1) {
                return value['#text'];
            } else if (value.$ && value._ !== undefined) {
                return {
                    ...value.$,
                    value: value._
                };
            }
        }
        
        return value;
    }

    private detectEncoding(content: string): string {
        const match = content.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
        return match ? match[1] || 'utf-8' : 'utf-8';
    }

    private extractNamespaces(content: string): Record<string, string> {
        const namespaces: Record<string, string> = {};
        const regex = /xmlns:?([^=]*)="([^"]+)"/g;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            const prefix = match[1] || 'default';
            namespaces[prefix] = match[2] || '';
        }
        
        return namespaces;
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
        
        throw new Error(`XML file not found: ${source}`);
    }

    private async validateFile(filePath: string): Promise<void> {
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${filePath}`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        if (!['.xml', '.xsl', '.xslt'].includes(ext)) {
            throw new Error(`Invalid XML file extension: ${ext}`);
        }
        
        const maxSize = parseInt(process.env['MAX_XML_FILE_SIZE'] || '104857600');
        if (stats.size > maxSize) {
            throw new Error(
                `XML file too large: ${stats.size} bytes (max: ${maxSize} bytes). ` +
                `Consider using streaming with XPath or increasing MAX_XML_FILE_SIZE`
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
        const message = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(
            `XML Handler Error: ${message}\n` +
            `File: ${options.source}\n` +
            `XPath: ${options.xmlPath || 'root'}\n` +
            `Options: ${JSON.stringify(options, null, 2)}`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}
