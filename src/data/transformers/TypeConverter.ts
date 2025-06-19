// src/data/transformers/TypeConverter.ts
import { TypeConversionOptions } from '../types/data.types';
import { DataType, ConversionResult, ExtendedTypeConversionOptions } from './type-converter.types';
import { logger } from '../../core/utils/Logger';

/**
 * Convert values between different data types
 * Handles automatic type detection and conversion
 */
export class TypeConverter {
    private readonly defaultOptions: ExtendedTypeConversionOptions = {
        dateFormat: 'YYYY-MM-DD',
        numberFormat: 'decimal',
        booleanTrueValues: ['true', 'yes', 'y', '1', 'on', 'enabled', 'active'],
        booleanFalseValues: ['false', 'no', 'n', '0', 'off', 'disabled', 'inactive'],
        nullValues: ['null', 'nil', 'none', 'n/a', '#n/a', '-', ''],
        trimStrings: true,
        emptyStringAsNull: true,
        parseNumbers: true,
        parseDates: true,
        parseBooleans: true,
        parseJSON: true,
        throwOnError: false,
        locale: 'en-US',
        timezone: 'UTC'
    };

    private readonly datePatterns = [
        // ISO formats
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
        /^\d{4}-\d{2}-\d{2}$/,
        // US formats
        /^\d{1,2}\/\d{1,2}\/\d{4}$/,
        /^\d{1,2}-\d{1,2}-\d{4}$/,
        // European formats
        /^\d{1,2}\.\d{1,2}\.\d{4}$/,
        // Timestamp
        /^\d{10,13}$/
    ];

    private readonly numberPatterns = [
        /^-?\d+$/,                              // Integer
        /^-?\d+\.\d+$/,                         // Decimal
        /^-?\d+\.?\d*[eE][+-]?\d+$/,           // Scientific
        /^-?\$?\d{1,3}(,\d{3})*(\.\d+)?$/,    // Currency
        /^-?\d+\.?\d*%$/                        // Percentage
    ];

    /**
     * Convert value to specified type
     */
    async convert(
        value: any,
        targetType: DataType,
        options?: Partial<TypeConversionOptions>
    ): Promise<ConversionResult> {
        const opts = { ...this.defaultOptions, ...options };

        try {
            // Handle null/undefined
            if (this.isNull(value, opts)) {
                return {
                    success: true,
                    value: null,
                    originalType: this.detectType(value),
                    targetType,
                    sourceType: this.detectType(value)
                };
            }

            // Detect source type if auto
            const sourceType = this.detectType(value);

            // Perform conversion
            let convertedValue: any;
            switch (targetType) {
                case 'string':
                    convertedValue = await this.toString(value, opts);
                    break;
                case 'number':
                    convertedValue = await this.toNumber(value);
                    break;
                case 'boolean':
                    convertedValue = await this.toBoolean(value, opts);
                    break;
                case 'date':
                    convertedValue = await this.toDate(value, opts);
                    break;
                case 'array':
                    convertedValue = await this.toArray(value);
                    break;
                case 'object':
                    convertedValue = await this.toObject(value);
                    break;
                case 'json':
                    convertedValue = await this.toJSON(value);
                    break;
                case 'auto':
                    convertedValue = await this.autoConvert(value, opts);
                    break;
                default:
                    throw new Error(`Unsupported target type: ${targetType}`);
            }

            logger.debug(`Converted ${sourceType} to ${targetType}:`, { value, convertedValue });

            return {
                success: true,
                value: convertedValue,
                originalType: sourceType,
                targetType,
                sourceType
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
            logger.error(`Type conversion failed:`, error as Error);

            if ((opts as ExtendedTypeConversionOptions).throwOnError) {
                throw new Error(`Failed to convert to ${targetType}: ${errorMessage}`);
            }

            return {
                success: false,
                value: value,
                originalType: this.detectType(value),
                targetType,
                sourceType: this.detectType(value),
                error: errorMessage
            };
        }
    }

    /**
     * Convert multiple values
     */
    async convertBatch(
        values: any[],
        targetType: DataType,
        options?: Partial<TypeConversionOptions>
    ): Promise<ConversionResult[]> {
        return Promise.all(
            values.map(value => this.convert(value, targetType, options))
        );
    }

    /**
     * Convert object properties based on schema
     */
    async convertObject(
        obj: Record<string, any>,
        schema: Record<string, DataType>,
        options?: Partial<TypeConversionOptions>
    ): Promise<Record<string, any>> {
        const result: Record<string, any> = {};

        for (const [key, targetType] of Object.entries(schema)) {
            if (key in obj) {
                const conversion = await this.convert(obj[key], targetType, options);
                result[key] = conversion.value;
            }
        }

        return result;
    }

    /**
     * Detect data type from value
     */
    detectType(value: any): DataType {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (typeof value === 'string') {
            // Check if string represents other types
            if (this.isDateString(value)) return 'date';
            if (this.isNumberString(value)) return 'number';
            if (this.isBooleanString(value)) return 'boolean';
            if (this.isJSONString(value)) return 'json';
            return 'string';
        }

        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (value instanceof Date) return 'date';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object') return 'object';

        return 'unknown';
    }

    /**
     * Auto convert value based on detection
     */
    private async autoConvert(value: any, options: TypeConversionOptions): Promise<any> {
        const type = this.detectType(value);

        // If already a complex type, return as is
        if (['array', 'object', 'date'].includes(type)) {
            return value;
        }

        // Try conversions in order
        if (options.parseBooleans && this.isBooleanString(value)) {
            return this.toBoolean(value, options);
        }

        if (options.parseNumbers && this.isNumberString(value)) {
            return this.toNumber(value);
        }

        if (options.parseDates && this.isDateString(value)) {
            return this.toDate(value, options);
        }

        if ((options as ExtendedTypeConversionOptions).parseJSON && this.isJSONString(value)) {
            return this.toObject(value);
        }

        return value;
    }

    /**
     * Convert to string
     */
    private async toString(value: any, options: TypeConversionOptions): Promise<string> {
        if (value === null || value === undefined) {
            return '';
        }

        if (typeof value === 'string') {
            return options.trimStrings ? value.trim() : value;
        }

        if (value instanceof Date) {
            return this.formatDate(value, (options as ExtendedTypeConversionOptions).dateFormat || this.defaultOptions.dateFormat || 'YYYY-MM-DD');
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }

    /**
     * Convert to number
     */
    private async toNumber(value: any): Promise<number> {
        if (typeof value === 'number') {
            return value;
        }

        if (typeof value === 'string') {
            const cleaned = value.trim();

            // Handle percentage
            if (cleaned.endsWith('%')) {
                return parseFloat(cleaned.slice(0, -1)) / 100;
            }

            // Handle currency
            const currencyMatch = cleaned.match(/^\$?([\d,]+\.?\d*)$/);
            if (currencyMatch && currencyMatch[1]) {
                return parseFloat(currencyMatch[1].replace(/,/g, ''));
            }

            // Handle scientific notation
            if (/[eE]/.test(cleaned)) {
                return parseFloat(cleaned);
            }

            // Handle regular numbers
            const num = parseFloat(cleaned);
            if (!isNaN(num)) {
                return num;
            }
        }

        if (value instanceof Date) {
            return value.getTime();
        }

        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }

        throw new Error(`Cannot convert ${typeof value} to number`);
    }

    /**
     * Convert to boolean
     */
    private async toBoolean(value: any, options: TypeConversionOptions): Promise<boolean> {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            
            const trueValues = (options as ExtendedTypeConversionOptions).booleanTrueValues || this.defaultOptions.booleanTrueValues || [];
            if (trueValues.includes(normalized)) {
                return true;
            }
            
            const falseValues = (options as ExtendedTypeConversionOptions).booleanFalseValues || this.defaultOptions.booleanFalseValues || [];
            if (falseValues.includes(normalized)) {
                return false;
            }
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        throw new Error(`Cannot convert ${typeof value} "${value}" to boolean`);
    }

    /**
     * Convert to date
     */
    private async toDate(value: any, options: TypeConversionOptions): Promise<Date> {
        if (value instanceof Date) {
            return value;
        }

        if (typeof value === 'string') {
            const cleaned = value.trim();

            // Try timestamp
            if (/^\d{10,13}$/.test(cleaned)) {
                const timestamp = parseInt(cleaned);
                return new Date(cleaned.length === 10 ? timestamp * 1000 : timestamp);
            }

            // Try various date formats
            const date = new Date(cleaned);
            if (!isNaN(date.getTime())) {
                return date;
            }

            // Try custom parsing for common formats
            return this.parseCustomDateFormat(cleaned, (options as ExtendedTypeConversionOptions).dateFormat || this.defaultOptions.dateFormat || 'YYYY-MM-DD');
        }

        if (typeof value === 'number') {
            // Assume timestamp
            return new Date(value > 9999999999 ? value : value * 1000);
        }

        throw new Error(`Cannot convert ${typeof value} to date`);
    }

    /**
     * Convert to array
     */
    private async toArray(value: any): Promise<any[]> {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const cleaned = value.trim();

            // Try JSON parse
            if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
                try {
                    return JSON.parse(cleaned);
                } catch (error) {
                    // JSON parsing failed, try other methods
                    // Continue with delimiter-based parsing
                }
            }

            // Split by common delimiters
            if (cleaned.includes(',')) {
                return cleaned.split(',').map(v => v.trim());
            }

            if (cleaned.includes(';')) {
                return cleaned.split(';').map(v => v.trim());
            }

            if (cleaned.includes('|')) {
                return cleaned.split('|').map(v => v.trim());
            }

            // Single value array
            return [cleaned];
        }

        // Convert single value to array
        return [value];
    }

    /**
     * Convert to object
     */
    private async toObject(value: any): Promise<Record<string, any>> {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const cleaned = value.trim();

            // Try JSON parse
            if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
                try {
                    const parsed = JSON.parse(cleaned);
                    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch (error) {
                    // JSON parsing failed, try key=value parsing
                    // Continue with alternative parsing methods
                }
            }

            // Try key=value pairs
            if (cleaned.includes('=')) {
                const obj: Record<string, any> = {};
                const pairs = cleaned.split(/[,;&]/).map(p => p.trim());
                
                for (const pair of pairs) {
                    const [key, ...valueParts] = pair.split('=');
                    if (key) {
                        obj[key.trim()] = valueParts.join('=').trim();
                    }
                }
                
                return obj;
            }
        }

        if (Array.isArray(value)) {
            // Convert array to object with indices as keys
            return value.reduce((obj, val, index) => {
                obj[index.toString()] = val;
                return obj;
            }, {} as Record<string, any>);
        }

        throw new Error(`Cannot convert ${typeof value} to object`);
    }

    /**
     * Convert to JSON string
     */
    private async toJSON(value: any): Promise<string> {
        if (typeof value === 'string') {
            // Validate it's valid JSON
            try {
                JSON.parse(value);
                return value;
            } catch {
                // Convert to JSON
                return JSON.stringify(value);
            }
        }

        return JSON.stringify(value, null, 2);
    }

    /**
     * Check if value is null based on options
     */
    private isNull(value: any, options: TypeConversionOptions): boolean {
        if (value === null || value === undefined) {
            return true;
        }

        if (typeof value === 'string') {
            const cleaned = value.trim().toLowerCase();
            
            if (options.emptyStringAsNull && cleaned === '') {
                return true;
            }

            const nullValues = (options as ExtendedTypeConversionOptions).nullValues || this.defaultOptions.nullValues || [];
            return nullValues.includes(cleaned);
        }

        return false;
    }

    /**
     * Check if string represents a date
     */
    private isDateString(value: any): boolean {
        if (typeof value !== 'string') return false;
        
        const cleaned = value.trim();
        
        // Check common date patterns
        for (const pattern of this.datePatterns) {
            if (pattern.test(cleaned)) {
                return true;
            }
        }

        // Try parsing
        const date = new Date(cleaned);
        return !isNaN(date.getTime());
    }

    /**
     * Check if string represents a number
     */
    private isNumberString(value: any): boolean {
        if (typeof value !== 'string') return false;
        
        const cleaned = value.trim();
        
        // Check number patterns
        for (const pattern of this.numberPatterns) {
            if (pattern.test(cleaned)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if string represents a boolean
     */
    private isBooleanString(value: any): boolean {
        if (typeof value !== 'string') return false;
        
        const normalized = value.trim().toLowerCase();
        const trueValues = this.defaultOptions.booleanTrueValues || [];
        const falseValues = this.defaultOptions.booleanFalseValues || [];
        return [...trueValues, ...falseValues].includes(normalized);
    }

    /**
     * Check if string is JSON
     */
    private isJSONString(value: any): boolean {
        if (typeof value !== 'string') return false;
        
        const cleaned = value.trim();
        
        if (!(cleaned.startsWith('{') && cleaned.endsWith('}')) && 
            !(cleaned.startsWith('[') && cleaned.endsWith(']'))) {
            return false;
        }

        try {
            JSON.parse(cleaned);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Parse custom date formats
     */
    private parseCustomDateFormat(dateStr: string, format: string): Date {
        return this.parseFormattedDate(dateStr, format);
    }

    private parseFormattedDate(dateStr: string, _format: string): Date {
        const cleaned = dateStr.trim();

        // US format MM/DD/YYYY
        const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (usMatch) {
            return new Date(parseInt(usMatch[3] || '0'), parseInt(usMatch[1] || '0') - 1, parseInt(usMatch[2] || '0'));
        }

        // European format DD.MM.YYYY
        const euMatch = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (euMatch) {
            return new Date(parseInt(euMatch[3] || '0'), parseInt(euMatch[2] || '0') - 1, parseInt(euMatch[1] || '0'));
        }

        // ISO format variations
        const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
        if (isoMatch) {
            return new Date(
                parseInt(isoMatch[1] || '0'),
                parseInt(isoMatch[2] || '0') - 1,
                parseInt(isoMatch[3] || '0'),
                parseInt(isoMatch[4] || '0'),
                parseInt(isoMatch[5] || '0'),
                parseInt(isoMatch[6] || '0')
            );
        }

        throw new Error(`Cannot parse date format: ${dateStr}`);
    }

    /**
     * Format a date according to the specified format
     */
    private formatDate(date: Date, format: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        let formatted = format;
        formatted = formatted.replace(/YYYY/g, String(year));
        formatted = formatted.replace(/YY/g, String(year).slice(-2));
        formatted = formatted.replace(/MM/g, month);
        formatted = formatted.replace(/DD/g, day);
        formatted = formatted.replace(/HH/g, hours);
        formatted = formatted.replace(/mm/g, minutes);
        formatted = formatted.replace(/ss/g, seconds);

        return formatted;
    }

    /**
     * Create custom type converter
     */
    static createCustomConverter(
        customTypes: Record<string, (value: any) => any>
    ): TypeConverter {
        const converter = new TypeConverter();
        
        // Add custom type handlers
        for (const [type, handler] of Object.entries(customTypes)) {
            (converter as any)[`to${type.charAt(0).toUpperCase() + type.slice(1)}`] = handler;
        }

        return converter;
    }
}