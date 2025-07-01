// src/data/parsers/XMLParser.ts

import { ParserOptions, DataSchema } from '../types/data.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { TypeConverter } from '../transformers/TypeConverter';
import * as xml2js from 'xml2js';
import * as xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Parser for XML files
 * Supports XPath queries and namespace handling
 */
export class XMLParser {
    private typeConverter: TypeConverter;
    private defaultParserOptions: xml2js.ParserOptions;
    
    constructor() {
        this.typeConverter = new TypeConverter();
        this.defaultParserOptions = {
            explicitArray: false,
            explicitRoot: false,
            ignoreAttrs: false,
            mergeAttrs: false,
            normalize: true,
            normalizeTags: true,
            attrkey: '$',
            charkey: '_',
            valueProcessors: [
                (value: any) => {
                    // Try to parse numbers
                    if (/^-?\d+(\.\d+)?$/.test(value)) {
                        return parseFloat(value);
                    }
                    // Try to parse booleans
                    if (value === 'true') return true;
                    if (value === 'false') return false;
                    return value;
                }
            ]
        };
    }

    /**
     * Parse XML content
     */
    async parse(content: string, options: ParserOptions = {}): Promise<{
        data: any;
        metadata?: Record<string, any>;
    }> {
        const startTime = Date.now();
        
        try {
            // Configure parser
            const parserOptions: xml2js.ParserOptions = {
                ...this.defaultParserOptions,
                attrkey: options.attributePrefix || this.defaultParserOptions.attrkey,
                charkey: options.textNodeName || this.defaultParserOptions.charkey,
                ignoreAttrs: options.ignoreAttributes || false,
                explicitArray: false,
                xmlns: true,
                explicitChildren: true,
                preserveChildrenOrder: true
            };
            
            // Parse XML
            const parser = new xml2js.Parser(parserOptions);
            let parsed = await parser.parseStringPromise(content);
            
            // Apply XPath if specified
            let data = parsed;
            if (options.xmlPath) {
                data = this.queryXPath(content, options.xmlPath, options.namespaces);
            }
            
            // Normalize data structure
            const parseOptions = options as any;
            if (parseOptions.normalize !== false) {
                data = this.normalizeData(data, options);
            }
            
            // Convert types if requested
            if (parseOptions.parseNumbers || parseOptions.parseDates) {
                data = await this.convertTypes(data, options);
            }
            
            const parseTime = Date.now() - startTime;
            
            ActionLogger.logInfo('Parser operation: xml_parse', {
                operation: 'xml_parse',
                xmlPath: options.xmlPath,
                parseTime
            });
            
            return {
                data,
                metadata: {
                    rootElement: this.getRootElement(parsed),
                    namespaces: this.extractNamespaces(content),
                    parseTime,
                    size: content.length
                }
            };
            
        } catch (error) {
            ActionLogger.logError('Parser error: xml_parse_failed', error as Error);
            throw this.enhanceError(error, 'parse');
        }
    }

    /**
     * Query XML using XPath
     */
    private queryXPath(content: string, xpathQuery: string, namespaces?: Record<string, string>): any[] {
        try {
            const doc = new DOMParser().parseFromString(content, 'text/xml');
            
            // Check for parse errors
            const parseError = doc.getElementsByTagName('parsererror');
            if (parseError.length > 0) {
                const errorNode = parseError[0];
                throw new Error(`XML parsing error: ${errorNode?.textContent || 'Unknown error'}`);
            }
            
            // Execute XPath query with namespace support
            let nodes: xpath.SelectReturnType;
            if (namespaces) {
                const select = xpath.useNamespaces(namespaces);
                nodes = select(xpathQuery, doc as any);
            } else {
                nodes = xpath.select(xpathQuery, doc as any);
            }
            
            // Convert nodes to objects
            const results: any[] = [];
            
            if (Array.isArray(nodes)) {
                for (const node of nodes) {
                    if (xpath.isElement(node)) {
                        results.push(this.nodeToObject(node as any));
                    } else if (xpath.isAttribute(node)) {
                        results.push(node.value);
                    } else if (xpath.isTextNode(node)) {
                        results.push(node.nodeValue);
                    } else if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
                        results.push(node);
                    }
                }
            } else if (nodes !== null) {
                results.push(nodes);
            }
            
            return results;
            
        } catch (error: any) {
            throw new Error(`XPath query error: ${error.message}`);
        }
    }

    /**
     * Convert DOM node to object
     */
    private nodeToObject(node: any): any {
        const obj: any = {};
        
        // Add attributes
        if (node.attributes && node.attributes.length > 0) {
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                if (attr) {
                    obj[`@${attr.name}`] = attr.value;
                }
            }
        }
        
        // Process child nodes
        let textContent = '';
        
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            
            if (child.nodeType === 1) { // Element node
                const childObj = this.nodeToObject(child as Element);
                const tagName = (child as Element).tagName;
                
                if (obj[tagName]) {
                    // Multiple children with same tag
                    if (!Array.isArray(obj[tagName])) {
                        obj[tagName] = [obj[tagName]];
                    }
                    obj[tagName].push(childObj);
                } else {
                    obj[tagName] = childObj;
                }
            } else if (child.nodeType === 3) { // Text node
                const text = child.nodeValue?.trim();
                if (text) {
                    textContent += text;
                }
            }
        }
        
        // Add text content
        if (textContent && Object.keys(obj).filter(k => !k.startsWith('@')).length === 0) {
            return textContent; // Pure text node
        } else if (textContent) {
            obj['#text'] = textContent;
        }
        
        return obj;
    }

    /**
     * Parse XSD schema
     */
    async parseXSD(content: string): Promise<DataSchema> {
        try {
            const parser = new xml2js.Parser(this.defaultParserOptions);
            const xsd = await parser.parseStringPromise(content);
            
            // Extract schema information
            const schema = xsd['xs:schema'] || xsd['xsd:schema'] || xsd.schema;
            if (!schema) {
                throw new Error('Invalid XSD: No schema element found');
            }
            
            const fields: any[] = [];
            
            // Process elements
            const elements = schema['xs:element'] || schema['xsd:element'] || schema.element || [];
            const elementsArray = Array.isArray(elements) ? elements : [elements];
            
            for (const element of elementsArray) {
                const field = this.parseXSDElement(element);
                if (field) {
                    fields.push(field);
                }
            }
            
            // Process complex types
            const complexTypes = schema['xs:complexType'] || schema['xsd:complexType'] || schema.complexType || [];
            const typesArray = Array.isArray(complexTypes) ? complexTypes : [complexTypes];
            
            for (const complexType of typesArray) {
                const typeFields = this.parseXSDComplexType(complexType);
                fields.push(...typeFields);
            }
            
            return {
                version: '1.0',
                fields
            };
            
        } catch (error) {
            ActionLogger.logError('Parser error: xsd_parse_failed', error as Error);
            throw this.enhanceError(error, 'parseXSD');
        }
    }

    /**
     * Parse XSD element
     */
    private parseXSDElement(element: any): any {
        const field: any = {
            name: element.$.name,
            type: this.mapXSDType(element.$.type),
            required: element.$.minOccurs !== '0',
            maxOccurs: element.$.maxOccurs
        };
        
        // Handle restrictions
        if (element['xs:simpleType'] || element['xsd:simpleType']) {
            const simpleType = element['xs:simpleType'] || element['xsd:simpleType'];
            const restriction = simpleType['xs:restriction'] || simpleType['xsd:restriction'];
            
            if (restriction) {
                if (restriction['xs:minLength']) {
                    field.minLength = parseInt(restriction['xs:minLength'].$.value);
                }
                if (restriction['xs:maxLength']) {
                    field.maxLength = parseInt(restriction['xs:maxLength'].$.value);
                }
                if (restriction['xs:pattern']) {
                    field.pattern = restriction['xs:pattern'].$.value;
                }
                if (restriction['xs:enumeration']) {
                    const enums = Array.isArray(restriction['xs:enumeration']) 
                        ? restriction['xs:enumeration'] 
                        : [restriction['xs:enumeration']];
                    field.enum = enums.map((e: any) => e.$.value);
                }
            }
        }
        
        return field;
    }

    /**
     * Parse XSD complex type
     */
    private parseXSDComplexType(complexType: any): any[] {
        const fields: any[] = [];
        const typeName = complexType.$.name;
        
        // Process sequence
        const sequence = complexType['xs:sequence'] || complexType['xsd:sequence'];
        if (sequence) {
            const elements = sequence['xs:element'] || sequence['xsd:element'] || [];
            const elementsArray = Array.isArray(elements) ? elements : [elements];
            
            for (const element of elementsArray) {
                const field = this.parseXSDElement(element);
                if (field) {
                    field.parent = typeName;
                    fields.push(field);
                }
            }
        }
        
        // Process attributes
        const attributes = complexType['xs:attribute'] || complexType['xsd:attribute'] || [];
        const attributesArray = Array.isArray(attributes) ? attributes : [attributes];
        
        for (const attr of attributesArray) {
            fields.push({
                name: `@${attr.$.name}`,
                type: this.mapXSDType(attr.$.type),
                required: attr.$.use === 'required',
                parent: typeName
            });
        }
        
        return fields;
    }

    /**
     * Map XSD type to data type
     */
    private mapXSDType(xsdType: string): string {
        if (!xsdType) return 'string';
        
        const typeMap: Record<string, string> = {
            'xs:string': 'string',
            'xs:int': 'number',
            'xs:integer': 'number',
            'xs:decimal': 'number',
            'xs:float': 'number',
            'xs:double': 'number',
            'xs:boolean': 'boolean',
            'xs:date': 'date',
            'xs:dateTime': 'date',
            'xs:time': 'string',
            'xsd:string': 'string',
            'xsd:int': 'number',
            'xsd:integer': 'number',
            'xsd:decimal': 'number',
            'xsd:float': 'number',
            'xsd:double': 'number',
            'xsd:boolean': 'boolean',
            'xsd:date': 'date',
            'xsd:dateTime': 'date'
        };
        
        return typeMap[xsdType] || 'string';
    }

    /**
     * Get metadata from XML
     */
    async getMetadata(content: string): Promise<Record<string, any>> {
        try {
            const doc = new DOMParser().parseFromString(content, 'text/xml');
            
            const documentElement = doc.documentElement;
            if (!documentElement) {
                throw new Error('Invalid XML: No document element found');
            }
            
            return {
                encoding: this.getXMLEncoding(content),
                version: this.getXMLVersion(content),
                rootElement: documentElement.tagName,
                namespaces: this.extractNamespaces(content),
                elementCount: doc.getElementsByTagName('*').length,
                hasAttributes: this.hasAttributes(documentElement),
                hasCDATA: content.includes('<![CDATA['),
                hasComments: content.includes('<!--'),
                hasProcessingInstructions: content.includes('<?')
            };
            
        } catch (error) {
            ActionLogger.logError('Parser error: xml_metadata_failed', error as Error);
            throw this.enhanceError(error, 'getMetadata');
        }
    }

    /**
     * Infer schema from XML data
     */
    async inferSchema(data: any[], options: {
        sampleSize?: number;
        detectTypes?: boolean;
        detectRequired?: boolean;
    } = {}): Promise<DataSchema> {
        const sample = data.slice(0, options.sampleSize || Math.min(100, data.length));
        const fieldAnalysis = new Map<string, any>();
        
        // Analyze structure
        const analyzeObject = (obj: any, path: string[] = []) => {
            if (typeof obj !== 'object' || obj === null) return;
            
            for (const [key, value] of Object.entries(obj)) {
                const fieldPath = [...path, key].join('.');
                
                if (!fieldAnalysis.has(fieldPath)) {
                    fieldAnalysis.set(fieldPath, {
                        name: key,
                        path,
                        types: new Set(),
                        isAttribute: key.startsWith('@'),
                        isText: key === '#text' || key === '_',
                        values: new Set(),
                        nullCount: 0,
                        totalCount: 0
                    });
                }
                
                const analysis = fieldAnalysis.get(fieldPath)!;
                analysis.totalCount++;
                
                if (value === null || value === undefined) {
                    analysis.nullCount++;
                } else if (Array.isArray(value)) {
                    analysis.types.add('array');
                    value.forEach(item => analyzeObject(item, [...path, key, '[]']));
                } else if (typeof value === 'object') {
                    analysis.types.add('object');
                    analyzeObject(value, [...path, key]);
                } else {
                    analysis.types.add(typeof value);
                    if (analysis.values.size < 100) {
                        analysis.values.add(value);
                    }
                }
            }
        };
        
        // Analyze all samples
        for (const item of sample) {
            analyzeObject(item);
        }
        
        // Build schema
        const fields: any[] = [];
        
        for (const [fieldPath, analysis] of fieldAnalysis.entries()) {
            // Skip nested fields
            if (fieldPath.includes('.') && !fieldPath.endsWith('[]')) continue;
            
            const field: any = {
                name: analysis.name,
                type: this.consolidateTypes(Array.from(analysis.types)),
                required: options.detectRequired ? analysis.nullCount === 0 : false
            };
            
            if (analysis.isAttribute) {
                field.xmlAttribute = true;
            }
            
            if (analysis.isText) {
                field.xmlText = true;
            }
            
            // Add enum for limited values
            if (analysis.values.size <= 10 && analysis.values.size > 1) {
                field.enum = Array.from(analysis.values);
            }
            
            fields.push(field);
        }
        
        return {
            version: '1.0',
            fields
        };
    }

    /**
     * Normalize XML data structure
     */
    private normalizeData(data: any, options: ParserOptions): any {
        if (Array.isArray(data)) {
            return data.map(item => this.normalizeData(item, options));
        } else if (typeof data === 'object' && data !== null) {
            const normalized: any = {};
            
            for (const [key, value] of Object.entries(data)) {
                // Flatten single-child arrays
                if (Array.isArray(value) && value.length === 1) {
                    normalized[key] = this.normalizeData(value[0], options);
                } else {
                    normalized[key] = this.normalizeData(value, options);
                }
            }
            
            // Extract text content for simple elements
            const keys = Object.keys(normalized);
            const nonAttrKeys = keys.filter(k => !k.startsWith('@'));
            
            if (nonAttrKeys.length === 1 && (nonAttrKeys[0] === '_' || nonAttrKeys[0] === '#text')) {
                // Element with attributes and text
                if (keys.length > 1) {
                    normalized.value = normalized[nonAttrKeys[0]];
                    delete normalized[nonAttrKeys[0]];
                } else {
                    // Pure text element
                    return normalized[nonAttrKeys[0]];
                }
            }
            
            return normalized;
        }
        
        return data;
    }

    /**
     * Convert types in XML data
     */
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

    /**
     * Get root element name
     */
    private getRootElement(parsed: any): string {
        if (typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed);
            if (keys.length > 0) {
                return keys[0] || 'root';
            }
        }
        return 'root';
    }

    /**
     * Extract namespaces from XML
     */
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

    /**
     * Get XML encoding
     */
    private getXMLEncoding(content: string): string {
        const match = content.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
        return match ? match[1] || 'UTF-8' : 'UTF-8';
    }

    /**
     * Get XML version
     */
    private getXMLVersion(content: string): string {
        const match = content.match(/<\?xml[^>]+version=["']([^"']+)["']/i);
        return match ? match[1] || '1.0' : '1.0';
    }

    /**
     * Check if element has attributes
     */
    private hasAttributes(element: any): boolean {
        if (element.attributes && element.attributes.length > 0) {
            return true;
        }
        
        for (let i = 0; i < element.childNodes.length; i++) {
            const child = element.childNodes[i];
            if (child.nodeType === 1 && this.hasAttributes(child as Element)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Consolidate types
     */
    private consolidateTypes(types: string[]): string {
        if (types.length === 0) return 'string';
        if (types.length === 1) return types[0] || 'string';
        
        if (types.includes('array')) return 'array';
        if (types.includes('object')) return 'object';
        
        return 'string';
    }

    /**
     * Enhance error with context
     */
    private enhanceError(error: any, operation: string): Error {
        const message = error instanceof Error ? error.message : String(error);
        const enhancedError = new Error(
            `XML Parser Error [${operation}]: ${message}\n` +
            `This may be due to invalid XML syntax, namespace issues, or XPath errors.`
        );
        
        if (error instanceof Error && error.stack) {
            enhancedError.stack = error.stack;
        }
        return enhancedError;
    }
}