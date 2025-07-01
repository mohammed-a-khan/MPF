// src/database/validators/DataTypeValidator.ts

import { ValidationResult } from '../types/database.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class DataTypeValidator {
    /**
     * Validate value against expected data type
     */
    validateType(value: any, expectedType: string): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('dataType', expectedType, value, true, { operation: 'validateType' });

        let passed = false;
        let actualType = this.getActualType(value);
        let details: any = {
            value,
            expectedType,
            actualType
        };

        switch (expectedType.toLowerCase()) {
            // String types
            case 'string':
            case 'varchar':
            case 'char':
            case 'text':
            case 'nvarchar':
            case 'nchar':
            case 'ntext':
                passed = typeof value === 'string';
                break;

            // Integer types
            case 'int':
            case 'integer':
            case 'bigint':
            case 'smallint':
            case 'tinyint':
                passed = Number.isInteger(Number(value));
                details.isInteger = Number.isInteger(Number(value));
                details.parsedValue = Number(value);
                break;

            // Decimal types
            case 'decimal':
            case 'numeric':
            case 'float':
            case 'real':
            case 'double':
            case 'money':
            case 'smallmoney':
                passed = !isNaN(Number(value));
                details.isNumeric = !isNaN(Number(value));
                details.parsedValue = Number(value);
                break;

            // Boolean types
            case 'boolean':
            case 'bool':
            case 'bit':
                passed = typeof value === 'boolean' || 
                        value === 0 || value === 1 ||
                        value === '0' || value === '1' ||
                        value === 'true' || value === 'false' ||
                        value === 'TRUE' || value === 'FALSE';
                details.booleanValue = this.parseBoolean(value);
                break;

            // Date/Time types
            case 'date':
                passed = this.isValidDate(value);
                details.parsedDate = this.parseDate(value);
                details.dateOnly = true;
                break;

            case 'time':
                passed = this.isValidTime(value);
                details.parsedTime = this.parseTime(value);
                details.timeOnly = true;
                break;

            case 'datetime':
            case 'datetime2':
            case 'timestamp':
                passed = this.isValidDateTime(value);
                details.parsedDateTime = this.parseDateTime(value);
                break;

            case 'datetimeoffset':
                passed = this.isValidDateTimeOffset(value);
                details.parsedDateTime = this.parseDateTimeOffset(value);
                details.hasTimezone = true;
                break;

            // Binary types
            case 'binary':
            case 'varbinary':
            case 'image':
            case 'blob':
            case 'bytea':
                passed = Buffer.isBuffer(value) || 
                        (typeof value === 'string' && this.isBase64(value)) ||
                        (value instanceof Uint8Array);
                details.isBinary = true;
                details.length = this.getBinaryLength(value);
                break;

            // JSON types
            case 'json':
            case 'jsonb':
                passed = this.isValidJSON(value);
                details.isJSON = passed;
                if (passed && typeof value === 'string') {
                    try {
                        details.parsedJSON = JSON.parse(value);
                    } catch (error) {
                        // JSON parsing failed, but validation already passed
                        // This can happen if isValidJSON uses a different method
                        details.parseError = error instanceof Error ? error.message : 'JSON parse error';
                    }
                }
                break;

            // XML type
            case 'xml':
                passed = this.isValidXML(value);
                details.isXML = passed;
                break;

            // UUID/GUID types
            case 'uuid':
            case 'guid':
            case 'uniqueidentifier':
                passed = this.isValidUUID(value);
                details.isUUID = passed;
                break;

            // Array types
            case 'array':
                passed = Array.isArray(value);
                details.isArray = passed;
                details.length = passed ? value.length : 0;
                break;

            // Null type
            case 'null':
                passed = value === null || value === undefined;
                break;

            // Custom validation for specific database types
            case 'geography':
            case 'geometry':
                passed = this.isValidSpatialData(value);
                details.isSpatial = passed;
                break;

            case 'interval':
                passed = this.isValidInterval(value);
                details.isInterval = passed;
                break;

            case 'inet':
            case 'cidr':
                passed = this.isValidIPAddress(value);
                details.isIPAddress = passed;
                break;

            case 'macaddr':
                passed = this.isValidMACAddress(value);
                details.isMACAddress = passed;
                break;

            default:
                // For unknown types, check if it's a custom type with validation
                if (expectedType.includes('(')) {
                    // Handle types with precision/scale like decimal(10,2)
                    const baseType = expectedType.substring(0, expectedType.indexOf('('));
                    const params = expectedType.match(/\(([^)]+)\)/)?.[1];
                    return this.validateTypeWithParams(value, baseType, params);
                }
                
                // Default: type name match
                passed = actualType.toLowerCase() === expectedType.toLowerCase();
        }

        const message = passed ? 
            `Value is of expected type ${expectedType}` : 
            `Type mismatch. Expected: ${expectedType}, Actual: ${actualType}`;

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Data Type Validation',
            message,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('dataType', expectedType, actualType, false, { details });
        }

        return validationResult;
    }

    /**
     * Validate value can be converted to target type
     */
    validateConversion(value: any, targetType: string): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('typeConversion', targetType, value, true, { operation: 'validateConversion' });

        let passed = false;
        let convertedValue: any;
        let conversionError: string | undefined;

        try {
            convertedValue = this.convertToType(value, targetType);
            passed = true;
        } catch (error) {
            passed = false;
            conversionError = (error as Error).message;
        }

        const details = {
            originalValue: value,
            originalType: this.getActualType(value),
            targetType,
            convertedValue,
            conversionError
        };

        const message = passed ? 
            `Value can be converted to ${targetType}` : 
            `Cannot convert value to ${targetType}: ${conversionError}`;

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Type Conversion Validation',
            message,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('typeConversion', targetType, value, false, { details });
        }

        return validationResult;
    }

    /**
     * Validate type with parameters (e.g., varchar(50), decimal(10,2))
     */
    private validateTypeWithParams(value: any, baseType: string, params?: string): ValidationResult {
        const startTime = Date.now();
        
        if (!params) {
            return this.validateType(value, baseType);
        }

        const paramList = params.split(',').map(p => p.trim());
        let passed = false;
        let message = '';
        let details: any = {
            value,
            baseType,
            params: paramList
        };

        switch (baseType.toLowerCase()) {
            case 'varchar':
            case 'char':
            case 'nvarchar':
            case 'nchar':
                if (paramList.length > 0 && paramList[0]) {
                    const maxLength = parseInt(paramList[0]);
                    passed = typeof value === 'string' && value.length <= maxLength;
                    details.actualLength = typeof value === 'string' ? value.length : 0;
                    details.maxLength = maxLength;
                    message = passed ? 
                        `Value is ${baseType} within length limit ${maxLength}` : 
                        `Value exceeds ${baseType} length limit ${maxLength}`;
                } else {
                    passed = typeof value === 'string';
                    message = passed ? `Value is ${baseType}` : `Value is not ${baseType}`;
                }
                break;

            case 'decimal':
            case 'numeric':
                if (paramList.length > 0 && paramList[0]) {
                    const precision = parseInt(paramList[0]);
                    const scale = paramList.length > 1 && paramList[1] ? parseInt(paramList[1]) : 0;
                    passed = this.validateDecimalPrecisionScale(value, precision, scale);
                    details.precision = precision;
                    details.scale = scale;
                    message = passed ? 
                        `Value fits decimal(${precision},${scale})` : 
                        `Value does not fit decimal(${precision},${scale})`;
                } else {
                    passed = !isNaN(Number(value));
                    message = passed ? `Value is numeric` : `Value is not numeric`;
                }
                break;

            case 'float':
                if (paramList.length > 0 && paramList[0]) {
                    const floatPrecision = parseInt(paramList[0]);
                    passed = !isNaN(Number(value)) && this.validateFloatPrecision(value, floatPrecision);
                    details.precision = floatPrecision;
                    message = passed ? 
                        `Value is float with valid precision` : 
                        `Value is not float with valid precision`;
                } else {
                    passed = !isNaN(Number(value));
                    message = passed ? 
                        `Value is float` : 
                        `Value is not float`;
                }
                break;

            default:
                // Fallback to base type validation
                return this.validateType(value, baseType);
        }

        return {
            passed,
            ruleName: 'Parameterized Type Validation',
            message,
            details,
            duration: Date.now() - startTime
        };
    }

    /**
     * Convert value to specified type
     */
    convertToType(value: any, targetType: string): any {
        if (value === null || value === undefined) {
            return null;
        }

        switch (targetType.toLowerCase()) {
            case 'string':
            case 'varchar':
            case 'text':
                return String(value);

            case 'int':
            case 'integer':
                const intVal = Number(value);
                if (!Number.isInteger(intVal)) {
                    throw new Error(`Cannot convert ${value} to integer`);
                }
                return intVal;

            case 'float':
            case 'double':
            case 'decimal':
            case 'numeric':
                const numVal = Number(value);
                if (isNaN(numVal)) {
                    throw new Error(`Cannot convert ${value} to number`);
                }
                return numVal;

            case 'boolean':
            case 'bool':
                return this.parseBoolean(value);

            case 'date':
                const dateVal = this.parseDate(value);
                if (!dateVal) {
                    throw new Error(`Cannot convert ${value} to date`);
                }
                return dateVal;

            case 'datetime':
            case 'timestamp':
                const dateTimeVal = this.parseDateTime(value);
                if (!dateTimeVal) {
                    throw new Error(`Cannot convert ${value} to datetime`);
                }
                return dateTimeVal;

            case 'json':
                if (typeof value === 'string') {
                    try {
                        return JSON.parse(value);
                    } catch {
                        throw new Error(`Cannot parse ${value} as JSON`);
                    }
                } else if (typeof value === 'object') {
                    return value;
                } else {
                    throw new Error(`Cannot convert ${value} to JSON`);
                }

            case 'array':
                if (Array.isArray(value)) {
                    return value;
                } else if (typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed)) {
                            return parsed;
                        }
                    } catch (error) {
                        // JSON parsing failed, continue to throw error below
                        // The error message will indicate the value cannot be converted
                    }
                }
                throw new Error(`Cannot convert ${value} to array`);

            default:
                return value;
        }
    }

    // Helper methods for type detection and validation

    private getActualType(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        if (value instanceof Date) return 'date';
        if (Buffer.isBuffer(value)) return 'buffer';
        if (value instanceof RegExp) return 'regexp';
        
        const type = typeof value;
        if (type === 'object') {
            // Check for specific object types
            if (value.constructor && value.constructor.name) {
                return value.constructor.name.toLowerCase();
            }
        }
        
        return type;
    }

    private isValidDate(value: any): boolean {
        if (value instanceof Date) {
            return !isNaN(value.getTime());
        }
        
        if (typeof value === 'string') {
            // Check common date formats
            const datePatterns = [
                /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
                /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
                /^\d{2}-\d{2}-\d{4}$/     // DD-MM-YYYY
            ];
            
            if (datePatterns.some(pattern => pattern.test(value))) {
                const parsed = new Date(value);
                return !isNaN(parsed.getTime());
            }
        }
        
        return false;
    }

    private isValidTime(value: any): boolean {
        if (typeof value === 'string') {
            // Check common time formats
            const timePatterns = [
                /^\d{2}:\d{2}:\d{2}$/,        // HH:MM:SS
                /^\d{2}:\d{2}:\d{2}\.\d+$/,   // HH:MM:SS.mmm
                /^\d{2}:\d{2}$/                // HH:MM
            ];
            
            return timePatterns.some(pattern => pattern.test(value));
        }
        
        return false;
    }

    private isValidDateTime(value: any): boolean {
        if (value instanceof Date) {
            return !isNaN(value.getTime());
        }
        
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return !isNaN(parsed.getTime());
        }
        
        return false;
    }

    private isValidDateTimeOffset(value: any): boolean {
        if (typeof value === 'string') {
            // Check for timezone information
            const offsetPatterns = [
                /\+\d{2}:\d{2}$/,  // +00:00
                /-\d{2}:\d{2}$/,   // -00:00
                /Z$/,               // UTC
                /[+-]\d{4}$/        // +0000
            ];
            
            return offsetPatterns.some(pattern => pattern.test(value)) && 
                   this.isValidDateTime(value);
        }
        
        return false;
    }

    private isBase64(value: string): boolean {
        try {
            return Buffer.from(value, 'base64').toString('base64') === value;
        } catch {
            return false;
        }
    }

    private isValidJSON(value: any): boolean {
        if (typeof value === 'object' && value !== null) {
            return true;
        }
        
        if (typeof value === 'string') {
            try {
                JSON.parse(value);
                return true;
            } catch {
                return false;
            }
        }
        
        return false;
    }

    private isValidXML(value: any): boolean {
        if (typeof value !== 'string') {
            return false;
        }
        
        // Basic XML validation
        const xmlPattern = /^<([^>]+)>[\s\S]*<\/\1>$/;
        return xmlPattern.test(value.trim());
    }

    private isValidUUID(value: any): boolean {
        if (typeof value !== 'string') {
            return false;
        }
        
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidPattern.test(value);
    }

    private isValidSpatialData(value: any): boolean {
        if (typeof value === 'string') {
            // WKT (Well-Known Text) format validation
            const wktPatterns = [
                /^POINT\s*\([^)]+\)$/i,
                /^LINESTRING\s*\([^)]+\)$/i,
                /^POLYGON\s*\(\([^)]+\)\)$/i,
                /^MULTIPOINT\s*\([^)]+\)$/i,
                /^MULTILINESTRING\s*\(\([^)]+\)\)$/i,
                /^MULTIPOLYGON\s*\(\(\([^)]+\)\)\)$/i,
                /^GEOMETRYCOLLECTION\s*\([^)]+\)$/i
            ];
            
            if (wktPatterns.some(pattern => pattern.test(value))) {
                return true;
            }
            
            // GeoJSON format validation
            try {
                const parsed = JSON.parse(value);
                return parsed.type && ['Point', 'LineString', 'Polygon', 'MultiPoint', 
                    'MultiLineString', 'MultiPolygon', 'GeometryCollection'].includes(parsed.type);
            } catch {
                return false;
            }
        }
        
        if (typeof value === 'object' && value !== null) {
            // Check for GeoJSON object
            return value.type && value.coordinates;
        }
        
        return false;
    }

    private isValidInterval(value: any): boolean {
        if (typeof value !== 'string') {
            return false;
        }
        
        // PostgreSQL interval format
        const intervalPatterns = [
            /^\d+\s+(year|month|day|hour|minute|second)s?$/i,
            /^P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/,  // ISO 8601
            /^\d+:\d+:\d+$/,  // HH:MM:SS
            /^-?\d+\s+days?\s+\d+:\d+:\d+$/  // PostgreSQL format
        ];
        
        return intervalPatterns.some(pattern => pattern.test(value));
    }

    private isValidIPAddress(value: any): boolean {
        if (typeof value !== 'string') {
            return false;
        }
        
        // IPv4 validation
        const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (ipv4Pattern.test(value)) {
            return true;
        }
        
        // IPv6 validation
        const ipv6Pattern = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
        if (ipv6Pattern.test(value)) {
            return true;
        }
        
        // CIDR notation
        const cidrPattern = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;
        return cidrPattern.test(value);
    }

    private isValidMACAddress(value: any): boolean {
        if (typeof value !== 'string') {
            return false;
        }
        
        const macPatterns = [
            /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,  // XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
            /^([0-9A-Fa-f]{4}\.){2}([0-9A-Fa-f]{4})$/      // XXXX.XXXX.XXXX
        ];
        
        return macPatterns.some(pattern => pattern.test(value));
    }

    private parseBoolean(value: any): boolean {
        if (typeof value === 'boolean') {
            return value;
        }
        
        if (typeof value === 'number') {
            return value !== 0;
        }
        
        if (typeof value === 'string') {
            const lowerValue = value.toLowerCase();
            return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on';
        }
        
        return false;
    }

    private parseDate(value: any): Date | null {
        if (value instanceof Date) {
            return value;
        }
        
        if (typeof value === 'string') {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
                // Set time to 00:00:00 for date-only
                parsed.setHours(0, 0, 0, 0);
                return parsed;
            }
        }
        
        return null;
    }

    private parseTime(value: any): string | null {
        if (typeof value === 'string') {
            const timeMatch = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
            if (timeMatch && timeMatch[1] && timeMatch[2]) {
                const hours = timeMatch[1].padStart(2, '0');
                const minutes = timeMatch[2];
                const seconds = timeMatch[3] || '00';
                const milliseconds = timeMatch[4] || '000';
                return `${hours}:${minutes}:${seconds}.${milliseconds}`;
            }
        }
        
        return null;
    }

    private parseDateTime(value: any): Date | null {
        if (value instanceof Date) {
            return value;
        }
        
        if (typeof value === 'string' || typeof value === 'number') {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        
        return null;
    }

    private parseDateTimeOffset(value: any): Date | null {
        // Similar to parseDateTime but preserves timezone information
        return this.parseDateTime(value);
    }

    private getBinaryLength(value: any): number {
        if (Buffer.isBuffer(value)) {
            return value.length;
        }
        
        if (value instanceof Uint8Array) {
            return value.length;
        }
        
        if (typeof value === 'string') {
            // Assume base64
            return Buffer.from(value, 'base64').length;
        }
        
        return 0;
    }

    private validateDecimalPrecisionScale(value: any, precision: number, scale: number): boolean {
        const numValue = Number(value);
        if (isNaN(numValue)) {
            return false;
        }
        
        const strValue = numValue.toString();
        const parts = strValue.split('.');
        
        // Check integer part
        const integerDigits = parts[0] ? parts[0].replace('-', '').length : 0;
        const decimalDigits = parts.length > 1 && parts[1] ? parts[1].length : 0;
        
        // Total digits (excluding decimal point and sign)
        const totalDigits = integerDigits + decimalDigits;
        
        return totalDigits <= precision && decimalDigits <= scale;
    }

    private validateFloatPrecision(value: any, precision: number): boolean {
        const numValue = Number(value);
        if (isNaN(numValue)) {
            return false;
        }
        
        // For float precision, check significant digits
        const significantDigits = numValue.toPrecision(precision);
        return Number(significantDigits) === numValue;
    }
}