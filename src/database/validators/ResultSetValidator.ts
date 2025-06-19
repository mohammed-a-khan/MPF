// src/database/validators/ResultSetValidator.ts

import { QueryResult, ValidationResult, ValidationRule } from '../types/database.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { DataTypeValidator } from './DataTypeValidator';

export class ResultSetValidator {
    private dataTypeValidator: DataTypeValidator;

    constructor() {
        this.dataTypeValidator = new DataTypeValidator();
    }

    /**
     * Validate row count
     */
    validateRowCount(result: QueryResult, expected: number): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('rowCount', expected, result.rowCount, true, { expected, actual: result.rowCount });

        const passed = result.rowCount === expected;
        const details = {
            expected,
            actual: result.rowCount,
            difference: result.rowCount - expected
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Row Count Validation',
            message: passed ? 
                `Row count matches expected: ${expected}` : 
                `Row count mismatch. Expected: ${expected}, Actual: ${result.rowCount}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('rowCount', expected, result.rowCount, false, details);
        }

        return validationResult;
    }

    /**
     * Validate row count range
     */
    validateRowCountRange(result: QueryResult, min: number, max: number): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('rowCountRange', `${min}-${max}`, result.rowCount, true, { min, max, actual: result.rowCount });

        const passed = result.rowCount >= min && result.rowCount <= max;
        const details = {
            min,
            max,
            actual: result.rowCount,
            inRange: passed
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Row Count Range Validation',
            message: passed ? 
                `Row count ${result.rowCount} is within range [${min}, ${max}]` : 
                `Row count ${result.rowCount} is outside range [${min}, ${max}]`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('rowCountRange', `${min}-${max}`, result.rowCount, false, details);
        }

        return validationResult;
    }

    /**
     * Validate specific cell value
     */
    validateCellValue(
        result: QueryResult, 
        row: number, 
        column: string, 
        expected: any
    ): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('cellValue', expected, null, true, { row, column, expected });

        // Validate row exists
        if (row < 0 || row >= result.rowCount) {
            return {
                passed: false,
                ruleName: 'Cell Value Validation',
                message: `Row ${row} does not exist (total rows: ${result.rowCount})`,
                details: { row, column, expected, error: 'ROW_NOT_FOUND' },
                duration: Date.now() - startTime
            };
        }

        // Get actual value
        const rowData = result.rows[row];
        const actual = rowData[column];

        // Validate column exists
        if (actual === undefined && !rowData.hasOwnProperty(column)) {
            return {
                passed: false,
                ruleName: 'Cell Value Validation',
                message: `Column '${column}' does not exist in row ${row}`,
                details: { 
                    row, 
                    column, 
                    expected, 
                    availableColumns: Object.keys(rowData),
                    error: 'COLUMN_NOT_FOUND' 
                },
                duration: Date.now() - startTime
            };
        }

        // Compare values
        const passed = this.compareValues(actual, expected);
        const details = {
            row,
            column,
            expected,
            actual,
            dataType: typeof actual
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Cell Value Validation',
            message: passed ? 
                `Cell [${row}, ${column}] matches expected value` : 
                `Cell [${row}, ${column}] value mismatch. Expected: ${expected}, Actual: ${actual}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('cellValue', expected, actual, false, details);
        }

        return validationResult;
    }

    /**
     * Validate column values
     */
    validateColumnValues(
        result: QueryResult,
        column: string,
        rule: ValidationRule
    ): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('columnValues', rule.type, column, true, { column, rule: rule.type });

        // Check if column exists
        if (result.rows.length > 0 && !result.rows[0].hasOwnProperty(column)) {
            return {
                passed: false,
                ruleName: 'Column Values Validation',
                message: `Column '${column}' does not exist`,
                details: { 
                    column, 
                    availableColumns: Object.keys(result.rows[0]),
                    error: 'COLUMN_NOT_FOUND' 
                },
                duration: Date.now() - startTime
            };
        }

        // Extract column values
        const values = result.rows.map(row => row[column]);

        // Apply validation rule
        let passed = true;
        let failedRows: number[] = [];
        let message = '';

        switch (rule.type) {
            case 'unique':
                const uniqueValues = new Set(values);
                passed = uniqueValues.size === values.length;
                if (!passed) {
                    const duplicates = this.findDuplicates(values);
                    failedRows = duplicates.map(d => d.indices).flat();
                    message = `Column '${column}' contains duplicate values`;
                } else {
                    message = `All values in column '${column}' are unique`;
                }
                break;

            case 'notNull':
                values.forEach((value, index) => {
                    if (value === null || value === undefined) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = passed ? 
                    `All values in column '${column}' are not null` :
                    `Column '${column}' contains null values`;
                break;

            case 'inList':
                if (!rule.values) {
                    throw new Error('inList rule requires values array');
                }
                values.forEach((value, index) => {
                    if (!rule.values!.includes(value)) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = passed ? 
                    `All values in column '${column}' are in the allowed list` :
                    `Column '${column}' contains values not in the allowed list`;
                break;

            case 'pattern':
                if (!rule.pattern) {
                    throw new Error('pattern rule requires pattern property');
                }
                const regex = new RegExp(rule.pattern);
                values.forEach((value, index) => {
                    if (!regex.test(String(value))) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = passed ? 
                    `All values in column '${column}' match the pattern` :
                    `Column '${column}' contains values that don't match the pattern`;
                break;

            case 'range':
                if (rule.min === undefined || rule.max === undefined) {
                    throw new Error('range rule requires min and max properties');
                }
                values.forEach((value, index) => {
                    const numValue = Number(value);
                    if (isNaN(numValue) || numValue < rule.min! || numValue > rule.max!) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = passed ? 
                    `All values in column '${column}' are within range [${rule.min}, ${rule.max}]` :
                    `Column '${column}' contains values outside range [${rule.min}, ${rule.max}]`;
                break;

            case 'dataType':
                if (!rule.dataType) {
                    throw new Error('dataType rule requires dataType property');
                }
                values.forEach((value, index) => {
                    const typeValidation = this.dataTypeValidator.validateType(value, rule.dataType!);
                    if (!typeValidation.passed) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = passed ? 
                    `All values in column '${column}' are of type ${rule.dataType}` :
                    `Column '${column}' contains values not of type ${rule.dataType}`;
                break;

            case 'length':
                if (rule.minLength === undefined && rule.maxLength === undefined) {
                    throw new Error('length rule requires minLength or maxLength');
                }
                values.forEach((value, index) => {
                    const strValue = String(value);
                    const length = strValue.length;
                    if (rule.minLength !== undefined && length < rule.minLength) {
                        passed = false;
                        failedRows.push(index);
                    }
                    if (rule.maxLength !== undefined && length > rule.maxLength) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = passed ? 
                    `All values in column '${column}' meet length requirements` :
                    `Column '${column}' contains values with invalid length`;
                break;

            case 'custom':
                if (!rule.customValidator) {
                    throw new Error('custom rule requires customValidator function');
                }
                values.forEach((value, index) => {
                    if (!rule.customValidator!(value, index, values)) {
                        passed = false;
                        failedRows.push(index);
                    }
                });
                message = rule.customMessage || (passed ? 
                    `All values in column '${column}' pass custom validation` :
                    `Column '${column}' contains values that fail custom validation`);
                break;

            default:
                throw new Error(`Unknown validation rule type: ${rule.type}`);
        }

        const details = {
            column,
            rule: rule.type,
            totalRows: result.rowCount,
            failedRows: failedRows.length > 0 ? failedRows : undefined,
            failedCount: failedRows.length,
            sampleFailures: failedRows.slice(0, 5).map(row => ({
                row,
                value: values[row]
            }))
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: `Column ${rule.type} Validation`,
            message,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('columnValues', rule.type, column, false, details);
        }

        return validationResult;
    }

    /**
     * Validate entire result set against schema
     */
    validateResultSchema(
        result: QueryResult,
        expectedSchema: Array<{ name: string; dataType: string; nullable?: boolean }>
    ): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('resultSchema', 'schema', expectedSchema, true, { expectedSchema });

        let passed = true;
        const issues: string[] = [];

        // Check field count
        if (result.fields.length !== expectedSchema.length) {
            passed = false;
            issues.push(`Field count mismatch. Expected: ${expectedSchema.length}, Actual: ${result.fields.length}`);
        }

        // Check each field
        expectedSchema.forEach((expectedField) => {
            const actualField = result.fields.find(f => f.name === expectedField.name);
            
            if (!actualField) {
                passed = false;
                issues.push(`Missing field: ${expectedField.name}`);
            } else {
                // Check data type if specified
                if (expectedField.dataType && actualField.dataType !== expectedField.dataType) {
                    passed = false;
                    issues.push(`Field '${expectedField.name}' type mismatch. Expected: ${expectedField.dataType}, Actual: ${actualField.dataType}`);
                }
            }
        });

        // Check for unexpected fields
        result.fields.forEach(actualField => {
            if (!expectedSchema.find(f => f.name === actualField.name)) {
                passed = false;
                issues.push(`Unexpected field: ${actualField.name}`);
            }
        });

        const details = {
            expectedFields: expectedSchema.map(f => f.name),
            actualFields: result.fields.map(f => f.name),
            issues
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Result Schema Validation',
            message: passed ? 
                'Result schema matches expected schema' : 
                `Result schema validation failed: ${issues.join('; ')}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('resultSchema', 'schema', expectedSchema, false, details);
        }

        return validationResult;
    }

    /**
     * Validate aggregate functions
     */
    validateAggregate(
        result: QueryResult,
        column: string,
        aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count',
        expected: number
    ): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('aggregate', aggregateType, expected, true, { column, aggregateType, expected });

        // Extract column values
        const values = result.rows
            .map(row => row[column])
            .filter(val => val !== null && val !== undefined)
            .map(val => Number(val));

        let actual: number;
        switch (aggregateType) {
            case 'sum':
                actual = values.reduce((sum, val) => sum + val, 0);
                break;
            case 'avg':
                actual = values.length > 0 ? 
                    values.reduce((sum, val) => sum + val, 0) / values.length : 0;
                break;
            case 'min':
                actual = values.length > 0 ? Math.min(...values) : 0;
                break;
            case 'max':
                actual = values.length > 0 ? Math.max(...values) : 0;
                break;
            case 'count':
                actual = values.length;
                break;
        }

        const passed = Math.abs(actual - expected) < 0.0001; // Floating point comparison
        const details = {
            column,
            aggregateType,
            expected,
            actual,
            difference: actual - expected,
            rowsProcessed: values.length
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: `${aggregateType.toUpperCase()} Aggregate Validation`,
            message: passed ? 
                `${aggregateType.toUpperCase()} of column '${column}' matches expected: ${expected}` : 
                `${aggregateType.toUpperCase()} of column '${column}' mismatch. Expected: ${expected}, Actual: ${actual}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('aggregate', aggregateType, actual, false, details);
        }

        return validationResult;
    }

    /**
     * Validate relationships between columns
     */
    validateRelationship(
        result: QueryResult,
        column1: string,
        column2: string,
        relationship: 'equals' | 'greater' | 'less' | 'contains' | 'startsWith' | 'endsWith'
    ): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('relationship', relationship, null, true, { column1, column2, relationship });

        let passed = true;
        const failedRows: number[] = [];

        result.rows.forEach((row, index) => {
            const value1 = row[column1];
            const value2 = row[column2];

            let rowPassed = false;
            switch (relationship) {
                case 'equals':
                    rowPassed = value1 === value2;
                    break;
                case 'greater':
                    rowPassed = Number(value1) > Number(value2);
                    break;
                case 'less':
                    rowPassed = Number(value1) < Number(value2);
                    break;
                case 'contains':
                    rowPassed = String(value1).includes(String(value2));
                    break;
                case 'startsWith':
                    rowPassed = String(value1).startsWith(String(value2));
                    break;
                case 'endsWith':
                    rowPassed = String(value1).endsWith(String(value2));
                    break;
            }

            if (!rowPassed) {
                passed = false;
                failedRows.push(index);
            }
        });

        const details = {
            column1,
            column2,
            relationship,
            totalRows: result.rowCount,
            failedRows: failedRows.length > 0 ? failedRows : undefined,
            failedCount: failedRows.length,
            sampleFailures: failedRows.slice(0, 5).map(row => ({
                row,
                value1: result.rows[row][column1],
                value2: result.rows[row][column2]
            }))
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Column Relationship Validation',
            message: passed ? 
                `All rows satisfy relationship: ${column1} ${relationship} ${column2}` : 
                `${failedRows.length} rows fail relationship: ${column1} ${relationship} ${column2}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('relationship', relationship, null, false, details);
        }

        return validationResult;
    }

    /**
     * Validate result against custom function
     */
    validateCustom(
        result: QueryResult,
        validator: (result: QueryResult) => boolean,
        message?: string
    ): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('custom', 'custom', result, true, { hasValidator: true });

        let passed = false;
        let error: string | undefined;

        try {
            passed = validator(result);
        } catch (e) {
            passed = false;
            error = (e as Error).message;
        }

        const details = {
            rowCount: result.rowCount,
            fieldCount: result.fields.length,
            error
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Custom Validation',
            message: message || (passed ? 
                'Custom validation passed' : 
                'Custom validation failed' + (error ? `: ${error}` : '')),
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('custom', 'custom', result, false, details);
        }

        return validationResult;
    }

    /**
     * Validate multiple rules and return combined result
     */
    async validateMultiple(
        _result: QueryResult,
        validations: Array<() => ValidationResult | Promise<ValidationResult>>
    ): Promise<ValidationResult> {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('multiple', 'multiple', validations.length, true, { count: validations.length });

        const results: ValidationResult[] = [];
        let allPassed = true;

        for (const validation of validations) {
            const validationResult = await validation();
            results.push(validationResult);
            if (!validationResult.passed) {
                allPassed = false;
            }
        }

        const details = {
            totalValidations: validations.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
            results: results.map(r => ({
                rule: r.ruleName,
                passed: r.passed,
                message: r.message
            }))
        };

        const validationResult: ValidationResult = {
            passed: allPassed,
            ruleName: 'Multiple Validations',
            message: allPassed ? 
                `All ${validations.length} validations passed` : 
                `${details.failed} of ${validations.length} validations failed`,
            details,
            duration: Date.now() - startTime
        };

        if (!allPassed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('multiple', 'multiple', validations.length, false, details);
        }

        return validationResult;
    }

    // Private helper methods

    private compareValues(actual: any, expected: any): boolean {
        // Handle null/undefined
        if (actual === null || actual === undefined) {
            return expected === null || expected === undefined;
        }

        // Handle dates
        if (actual instanceof Date || expected instanceof Date) {
            return new Date(actual).getTime() === new Date(expected).getTime();
        }

        // Handle numbers (with precision)
        if (typeof actual === 'number' && typeof expected === 'number') {
            return Math.abs(actual - expected) < 0.0001;
        }

        // Handle arrays
        if (Array.isArray(actual) && Array.isArray(expected)) {
            if (actual.length !== expected.length) return false;
            return actual.every((val, index) => this.compareValues(val, expected[index]));
        }

        // Handle objects
        if (typeof actual === 'object' && typeof expected === 'object') {
            const actualKeys = Object.keys(actual).sort();
            const expectedKeys = Object.keys(expected).sort();
            if (actualKeys.join(',') !== expectedKeys.join(',')) return false;
            return actualKeys.every(key => this.compareValues(actual[key], expected[key]));
        }

        // Default comparison
        return actual === expected;
    }

    private findDuplicates(values: any[]): Array<{ value: any; indices: number[] }> {
        const valueMap = new Map<any, number[]>();
        
        values.forEach((value, index) => {
            const key = JSON.stringify(value);
            if (!valueMap.has(key)) {
                valueMap.set(key, []);
            }
            valueMap.get(key)!.push(index);
        });

        const duplicates: Array<{ value: any; indices: number[] }> = [];
        valueMap.forEach((indices, key) => {
            if (indices.length > 1) {
                duplicates.push({
                    value: JSON.parse(key),
                    indices
                });
            }
        });

        return duplicates;
    }
}