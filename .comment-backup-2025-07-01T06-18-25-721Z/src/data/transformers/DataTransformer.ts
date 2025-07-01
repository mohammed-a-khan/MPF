// src/data/transformers/DataTransformer.ts

import { TestData, DataTransformation } from '../types/data.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as jsonpath from 'jsonpath';

/**
 * Transform test data using various transformation rules
 * Supports map, filter, reduce, sort, group, pivot operations
 */
export class DataTransformer {
    constructor() {
    }

    /**
     * Apply transformations to data
     */
    async transform(data: TestData[], transformations: DataTransformation[]): Promise<TestData[]> {
        let result = [...data]; // Create copy to avoid mutations
        
        for (const transformation of transformations) {
            ActionLogger.logInfo('Transform operation: apply', {
                operation: 'transform_apply',
                type: transformation.type,
                field: transformation.field,
                recordCount: result.length
            });
            
            try {
                switch (transformation.type) {
                    case 'map':
                        result = await this.applyMap(result, transformation);
                        break;
                        
                    case 'filter':
                        result = await this.applyFilter(result, transformation);
                        break;
                        
                    case 'reduce':
                        result = await this.applyReduce(result, transformation);
                        break;
                        
                    case 'sort':
                        result = await this.applySort(result, transformation);
                        break;
                        
                    case 'group':
                        result = await this.applyGroup(result, transformation);
                        break;
                        
                    case 'pivot':
                        result = await this.applyPivot(result, transformation);
                        break;
                        
                    case 'custom':
                        result = await this.applyCustom(result, transformation);
                        break;
                        
                    default:
                        throw new Error(`Unknown transformation type: ${transformation.type}`);
                }
                
                ActionLogger.logInfo('Transform operation: complete', {
                    operation: 'transform_complete',
                    type: transformation.type,
                    resultCount: result.length
                });
                
            } catch (error) {
                ActionLogger.logError(`Transform operation failed: ${transformation.type}`, error as Error);
                throw this.enhanceError(error, transformation);
            }
        }
        
        return result;
    }

    /**
     * Apply map transformation
     */
    private async applyMap(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        return data.map(record => {
            const mapped = { ...record };
            
            if (transformation.field && transformation.operation) {
                // Apply operation to specific field
                const value = this.getFieldValue(record, transformation.field);
                const newValue = this.applyOperation(value, transformation.operation, transformation.value, record);
                this.setFieldValue(mapped, transformation.field, newValue);
            } else if (transformation.expression) {
                // Apply expression to entire record
                const evaluated = this.evaluateExpression(transformation.expression, record);
                if (typeof evaluated === 'object' && evaluated !== null) {
                    Object.assign(mapped, evaluated);
                }
            } else if (transformation.function) {
                // Apply custom function
                const result = transformation.function(record);
                if (typeof result === 'object' && result !== null) {
                    return result;
                }
            }
            
            return mapped;
        });
    }

    /**
     * Apply filter transformation
     */
    private async applyFilter(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        return data.filter(record => {
            if (transformation.field && transformation.operation) {
                const value = this.getFieldValue(record, transformation.field);
                return this.evaluateCondition(value, transformation.operation, transformation.value);
            } else if (transformation.expression) {
                return this.evaluateExpression(transformation.expression, record);
            } else if (transformation.function) {
                return transformation.function(record);
            }
            
            return true;
        });
    }

    /**
     * Apply reduce transformation
     */
    private async applyReduce(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        if (data.length === 0) return [];
        
        const operation = transformation.operation || 'sum';
        const field = transformation.field;
        
        if (!field) {
            throw new Error('Field is required for reduce transformation');
        }
        
        let result: any;
        
        switch (operation) {
            case 'sum':
                result = data.reduce((sum, record) => {
                    const value = Number(this.getFieldValue(record, field)) || 0;
                    return sum + value;
                }, 0);
                break;
                
            case 'avg':
            case 'average':
                const sum = data.reduce((s, record) => {
                    const value = Number(this.getFieldValue(record, field)) || 0;
                    return s + value;
                }, 0);
                result = sum / data.length;
                break;
                
            case 'min':
                result = Math.min(...data.map(record => Number(this.getFieldValue(record, field)) || 0));
                break;
                
            case 'max':
                result = Math.max(...data.map(record => Number(this.getFieldValue(record, field)) || 0));
                break;
                
            case 'count':
                result = data.length;
                break;
                
            case 'countDistinct':
                const values = new Set(data.map(record => this.getFieldValue(record, field)));
                result = values.size;
                break;
                
            case 'first':
                if (data.length > 0 && data[0]) {
                    result = this.getFieldValue(data[0], field);
                }
                break;
                
            case 'last':
                if (data.length > 0) {
                    const lastItem = data[data.length - 1];
                    if (lastItem) {
                        result = this.getFieldValue(lastItem, field);
                    }
                }
                break;
                
            case 'concat':
                result = data.map(record => this.getFieldValue(record, field)).join(transformation.value || ',');
                break;
                
            case 'custom':
                if (transformation.function) {
                    // Function signature only takes TestData, not accumulator
                    let lastResult = transformation.value || null;
                    for (const record of data) {
                        lastResult = transformation.function(record);
                    }
                    result = lastResult;
                }
                break;
                
            default:
                throw new Error(`Unknown reduce operation: ${operation}`);
        }
        
        // Return as single record
        return [{
            [field]: result,
            _operation: operation,
            _count: data.length
        }];
    }

    /**
     * Apply sort transformation
     */
    private async applySort(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        const field = transformation.field;
        if (!field) {
            throw new Error('Field is required for sort transformation');
        }
        
        const direction = transformation.value || 'asc';
        const options = transformation.options || {};
        
        return [...data].sort((a, b) => {
            let valueA = this.getFieldValue(a, field);
            let valueB = this.getFieldValue(b, field);
            
            // Handle null/undefined
            if (valueA == null && valueB == null) return 0;
            if (valueA == null) return options['nullsFirst'] ? -1 : 1;
            if (valueB == null) return options['nullsFirst'] ? 1 : -1;
            
            // Type conversion for comparison
            if (options['numeric']) {
                valueA = Number(valueA) || 0;
                valueB = Number(valueB) || 0;
            } else if (options['date']) {
                valueA = new Date(valueA).getTime();
                valueB = new Date(valueB).getTime();
            } else if (options['caseInsensitive'] && typeof valueA === 'string' && typeof valueB === 'string') {
                valueA = valueA.toLowerCase();
                valueB = valueB.toLowerCase();
            }
            
            // Compare
            if (valueA < valueB) return direction === 'asc' ? -1 : 1;
            if (valueA > valueB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    /**
     * Apply group transformation
     */
    private async applyGroup(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        const field = transformation.field;
        if (!field) {
            throw new Error('Field is required for group transformation');
        }
        
        const groups = new Map<any, TestData[]>();
        
        // Group records
        for (const record of data) {
            const key = this.getFieldValue(record, field);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(record);
        }
        
        // Transform groups
        const result: TestData[] = [];
        const aggregations = transformation.options?.['aggregations'] || {};
        
        for (const [key, groupRecords] of groups.entries()) {
            const groupResult: TestData = {
                [field]: key,
                _count: groupRecords.length,
                _records: groupRecords
            };
            
            // Apply aggregations
            for (const [aggName, aggConfig] of Object.entries(aggregations)) {
                if (typeof aggConfig === 'object' && aggConfig !== null && 'field' in aggConfig && 'operation' in aggConfig) {
                    const aggField = (aggConfig as any).field;
                    const aggOperation = (aggConfig as any).operation;
                    const values = groupRecords.map(r => Number(this.getFieldValue(r, aggField)) || 0);
                    
                    switch (aggOperation) {
                        case 'sum':
                            groupResult[aggName] = values.reduce((a, b) => a + b, 0);
                            break;
                        case 'avg':
                            groupResult[aggName] = values.reduce((a, b) => a + b, 0) / values.length;
                            break;
                        case 'min':
                            groupResult[aggName] = Math.min(...values);
                            break;
                        case 'max':
                            groupResult[aggName] = Math.max(...values);
                            break;
                        case 'count':
                            groupResult[aggName] = values.length;
                            break;
                    }
                }
            }
            
            result.push(groupResult);
        }
        
        return result;
    }

    /**
     * Apply pivot transformation
     */
    private async applyPivot(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        const options = transformation.options || {};
        const rowField = options['rowField'];
        const columnField = options['columnField'];
        const valueField = options['valueField'];
        const aggregation = options['aggregation'] || 'sum';
        
        if (!rowField || !columnField || !valueField) {
            throw new Error('rowField, columnField, and valueField are required for pivot transformation');
        }
        
        // Get unique column values
        const columnValues = new Set<any>();
        data.forEach(record => {
            const colValue = this.getFieldValue(record, columnField);
            if (colValue != null) {
                columnValues.add(colValue);
            }
        });
        
        // Create pivot map
        const pivotMap = new Map<string, Map<any, number[]>>();
        
        for (const record of data) {
            const rowValue = this.getFieldValue(record, rowField);
            const colValue = this.getFieldValue(record, columnField);
            const value = Number(this.getFieldValue(record, valueField)) || 0;
            
            if (rowValue == null || colValue == null) continue;
            
            const rowKey = String(rowValue);
            if (!pivotMap.has(rowKey)) {
                pivotMap.set(rowKey, new Map());
            }
            
            const rowData = pivotMap.get(rowKey)!;
            if (!rowData.has(colValue)) {
                rowData.set(colValue, []);
            }
            
            rowData.get(colValue)!.push(value);
        }
        
        // Build result
        const result: TestData[] = [];
        
        for (const [rowValue, rowData] of pivotMap.entries()) {
            const pivotRecord: TestData = {
                [rowField]: rowValue
            };
            
            for (const colValue of columnValues) {
                const values = rowData.get(colValue) || [];
                let aggregatedValue: any = null;
                
                if (values.length > 0) {
                    switch (aggregation) {
                        case 'sum':
                            aggregatedValue = values.reduce((a, b) => a + b, 0);
                            break;
                        case 'avg':
                            aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
                            break;
                        case 'min':
                            aggregatedValue = Math.min(...values);
                            break;
                        case 'max':
                            aggregatedValue = Math.max(...values);
                            break;
                        case 'count':
                            aggregatedValue = values.length;
                            break;
                        case 'first':
                            aggregatedValue = values[0];
                            break;
                        case 'last':
                            aggregatedValue = values[values.length - 1];
                            break;
                    }
                }
                
                pivotRecord[String(colValue)] = aggregatedValue;
            }
            
            result.push(pivotRecord);
        }
        
        return result;
    }

    /**
     * Apply custom transformation
     */
    private async applyCustom(data: TestData[], transformation: DataTransformation): Promise<TestData[]> {
        if (!transformation.function) {
            throw new Error('Function is required for custom transformation');
        }
        
        // Allow async custom functions
        const result = await transformation.function(data);
        
        if (!Array.isArray(result)) {
            throw new Error('Custom transformation must return an array');
        }
        
        return result;
    }

    /**
     * Get field value (supports nested paths)
     */
    private getFieldValue(record: TestData, field: string): any {
        // Support JSONPath
        if (field.startsWith('$')) {
            const results = jsonpath.query(record, field);
            return results.length > 0 ? results[0] : undefined;
        }
        
        // Support dot notation
        const parts = field.split('.');
        let value: any = record;
        
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    /**
     * Set field value (supports nested paths)
     */
    private setFieldValue(record: TestData, field: string, value: any): void {
        const parts = field.split('.');
        let current: any = record;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (part && (!(part in current) || typeof current[part] !== 'object')) {
                current[part] = {};
            }
            if (part) {
                current = current[part];
            }
        }
        
        const lastPart = parts[parts.length - 1];
        if (lastPart) {
            current[lastPart] = value;
        }
    }

    /**
     * Apply operation to value
     */
    private applyOperation(value: any, operation: string, operand: any, record: TestData): any {
        switch (operation) {
            // String operations
            case 'uppercase':
                return String(value).toUpperCase();
            case 'lowercase':
                return String(value).toLowerCase();
            case 'trim':
                return String(value).trim();
            case 'substring':
                const [start, end] = Array.isArray(operand) ? operand : [0, operand];
                return String(value).substring(start, end);
            case 'replace':
                const [search, replace] = Array.isArray(operand) ? operand : [operand, ''];
                return String(value).replace(new RegExp(search, 'g'), replace);
            case 'split':
                return String(value).split(operand || ',');
            case 'join':
                return Array.isArray(value) ? value.join(operand || ',') : value;
                
            // Number operations
            case 'add':
                return Number(value) + Number(operand);
            case 'subtract':
                return Number(value) - Number(operand);
            case 'multiply':
                return Number(value) * Number(operand);
            case 'divide':
                return Number(value) / Number(operand);
            case 'modulo':
                return Number(value) % Number(operand);
            case 'round':
                return Math.round(Number(value));
            case 'floor':
                return Math.floor(Number(value));
            case 'ceil':
                return Math.ceil(Number(value));
            case 'abs':
                return Math.abs(Number(value));
                
            // Date operations
            case 'dateFormat':
                return this.formatDate(new Date(value), operand);
            case 'dateAdd':
                return this.addToDate(new Date(value), operand);
            case 'dateDiff':
                return this.dateDifference(new Date(value), new Date(operand));
                
            // Type conversions
            case 'toString':
                return String(value);
            case 'toNumber':
                return Number(value);
            case 'toBoolean':
                return Boolean(value);
            case 'toDate':
                return new Date(value);
            case 'toJSON':
                return JSON.stringify(value);
            case 'parseJSON':
                try {
                    return JSON.parse(value);
                } catch {
                    return null;
                }
                
            // Conditional operations
            case 'default':
                return value != null ? value : operand;
            case 'ternary':
                const [condition, trueValue, falseValue] = operand;
                return this.evaluateExpression(condition, record) ? trueValue : falseValue;
                
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    /**
     * Evaluate condition
     */
    private evaluateCondition(value: any, operation: string, operand: any): boolean {
        switch (operation) {
            case 'equals':
            case '==':
                return value == operand;
            case 'notEquals':
            case '!=':
                return value != operand;
            case 'strictEquals':
            case '===':
                return value === operand;
            case 'strictNotEquals':
            case '!==':
                return value !== operand;
            case 'greaterThan':
            case '>':
                return value > operand;
            case 'greaterThanOrEqual':
            case '>=':
                return value >= operand;
            case 'lessThan':
            case '<':
                return value < operand;
            case 'lessThanOrEqual':
            case '<=':
                return value <= operand;
            case 'contains':
                return String(value).includes(String(operand));
            case 'notContains':
                return !String(value).includes(String(operand));
            case 'startsWith':
                return String(value).startsWith(String(operand));
            case 'endsWith':
                return String(value).endsWith(String(operand));
            case 'matches':
                return new RegExp(operand).test(String(value));
            case 'in':
                return Array.isArray(operand) ? operand.includes(value) : false;
            case 'notIn':
                return Array.isArray(operand) ? !operand.includes(value) : true;
            case 'isNull':
                return value == null;
            case 'isNotNull':
                return value != null;
            case 'isEmpty':
                return value == null || value === '' || (Array.isArray(value) && value.length === 0);
            case 'isNotEmpty':
                return value != null && value !== '' && (!Array.isArray(value) || value.length > 0);
            default:
                throw new Error(`Unknown condition operation: ${operation}`);
        }
    }

    /**
     * Evaluate expression
     */
    private evaluateExpression(expression: string, record: TestData): any {
        try {
            // Simple expression evaluation using Function constructor
            // In production, consider using a proper expression parser
            const func = new Function('record', 'Math', 'Date', 'JSON', `return ${expression}`);
            return func(record, Math, Date, JSON);
        } catch (error: any) {
            throw new Error(`Failed to evaluate expression "${expression}": ${error.message}`);
        }
    }

    /**
     * Format date
     */
    private formatDate(date: Date, format: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return format
            .replace('YYYY', String(year))
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    /**
     * Add to date
     */
    private addToDate(date: Date, offset: any): Date {
        const result = new Date(date);
        
        if (typeof offset === 'number') {
            result.setDate(result.getDate() + offset);
        } else if (typeof offset === 'object') {
            if (offset.years) result.setFullYear(result.getFullYear() + offset.years);
            if (offset.months) result.setMonth(result.getMonth() + offset.months);
            if (offset.days) result.setDate(result.getDate() + offset.days);
            if (offset.hours) result.setHours(result.getHours() + offset.hours);
            if (offset.minutes) result.setMinutes(result.getMinutes() + offset.minutes);
            if (offset.seconds) result.setSeconds(result.getSeconds() + offset.seconds);
        }
        
        return result;
    }

    /**
     * Calculate date difference
     */
    private dateDifference(date1: Date, date2: Date): number {
        return Math.floor((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
    }

    /**
     * Enhance error with context
     */
    private enhanceError(error: any, transformation: DataTransformation): Error {
        const enhancedError = new Error(
            `Data Transformation Error [${transformation.type}]: ${error.message}\n` +
            `Field: ${transformation.field || 'N/A'}\n` +
            `Operation: ${transformation.operation || 'N/A'}`
        );
        
        enhancedError.stack = error.stack;
        return enhancedError;
    }
}