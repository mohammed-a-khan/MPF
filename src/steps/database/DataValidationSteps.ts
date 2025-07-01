// src/steps/database/DataValidationSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { DatabaseContext } from '../../database/context/DatabaseContext';
import { ResultSetValidator } from '../../database/validators/ResultSetValidator';
import { DataTypeValidator } from '../../database/validators/DataTypeValidator';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { QueryResult } from '../../database/types/database.types';

export class DataValidationSteps extends CSBDDBaseStepDefinition {
    private databaseContext: DatabaseContext = new DatabaseContext();
    private resultSetValidator: ResultSetValidator;
    private dataTypeValidator: DataTypeValidator;

    constructor() {
        super();
        this.resultSetValidator = new ResultSetValidator();
        this.dataTypeValidator = new DataTypeValidator();
    }

    @CSBDDStepDef('the value in row {int} column {string} should be {string}')
    async validateCellValue(row: number, column: string, expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_cell_value', 'validation', 0, undefined, { row, column, expectedValue });

        const result = this.getLastResult();
        const interpolatedExpected = this.interpolateVariables(expectedValue);

        try {
            const validation = this.resultSetValidator.validateCellValue(
                result, 
                row - 1,
                column, 
                this.convertExpectedValue(interpolatedExpected)
            );

            if (!validation.passed) {
                throw new Error(validation.message || 'Validation failed');
            }

            await actionLogger.logDatabase('cell_value_validated', 'validation', 0, undefined, { 
                row, 
                column, 
                actualValue: validation.details?.actual || 'N/A'
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'cell_validation_failed' 
            });
            throw new Error(
                `Cell validation failed at row ${row}, column '${column}'\n` +
                `Expected: ${interpolatedExpected}\n` +
                `Error: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    @CSBDDStepDef('the value in row {int} column {string} should contain {string}')
    async validateCellContains(row: number, column: string, expectedSubstring: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_cell_contains', 'validation', 0, undefined, { row, column, expectedSubstring });

        const result = this.getLastResult();
        const interpolatedExpected = this.interpolateVariables(expectedSubstring);

        try {
            const actualValue = this.getCellValue(result, row - 1, column);
            const actualString = String(actualValue);

            if (!actualString.includes(interpolatedExpected)) {
                throw new Error(
                    `Value '${actualString}' does not contain '${interpolatedExpected}'`
                );
            }

            await actionLogger.logDatabase('cell_contains_validated', 'validation', 0, undefined, { 
                row, 
                column, 
                actualValue: actualString 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'cell_contains_failed' 
            });
            throw new Error(`Cell contains validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the value in row {int} column {string} should match pattern {string}')
    async validateCellPattern(row: number, column: string, pattern: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_cell_pattern', 'validation', 0, undefined, { row, column, pattern });

        const result = this.getLastResult();
        const interpolatedPattern = this.interpolateVariables(pattern);

        try {
            const actualValue = this.getCellValue(result, row - 1, column);
            const actualString = String(actualValue);
            const regex = new RegExp(interpolatedPattern);

            if (!regex.test(actualString)) {
                throw new Error(
                    `Value '${actualString}' does not match pattern '${interpolatedPattern}'`
                );
            }

            await actionLogger.logDatabase('cell_pattern_validated', 'validation', 0, undefined, { 
                row, 
                column, 
                actualValue: actualString 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'cell_pattern_failed' 
            });
            throw new Error(`Cell pattern validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the value in row {int} column {string} should be null')
    async validateCellNull(row: number, column: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_cell_null', 'validation', 0, undefined, { row, column });

        const result = this.getLastResult();

        try {
            const actualValue = this.getCellValue(result, row - 1, column);

            if (actualValue !== null && actualValue !== undefined) {
                throw new Error(`Expected null, but got: ${actualValue}`);
            }

            await actionLogger.logDatabase('cell_null_validated', 'validation', 0, undefined, { row, column });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'cell_null_failed' 
            });
            throw new Error(`Cell null validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the value in row {int} column {string} should not be null')
    async validateCellNotNull(row: number, column: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_cell_not_null', 'validation', 0, undefined, { row, column });

        const result = this.getLastResult();

        try {
            const actualValue = this.getCellValue(result, row - 1, column);

            if (actualValue === null || actualValue === undefined) {
                throw new Error('Expected non-null value, but got null');
            }

            await actionLogger.logDatabase('cell_not_null_validated', 'validation', 0, undefined, { 
                row, 
                column, 
                actualValue 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'cell_not_null_failed' 
            });
            throw new Error(`Cell not-null validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('all values in column {string} should be unique')
    async validateColumnUnique(column: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_unique', 'validation', 0, undefined, { column });

        const result = this.getLastResult();

        try {
            const validation = this.resultSetValidator.validateColumnValues(
                result, 
                column, 
                { type: 'unique' }
            );

            if (!validation.passed) {
                throw new Error(validation.message || 'Uniqueness validation failed');
            }

            await actionLogger.logDatabase('column_unique_validated', 'validation', 0, undefined, { 
                column,
                uniqueValues: validation.details?.uniqueCount || validation.details?.uniqueValues || 'N/A',
                totalValues: result.rowCount
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_unique_failed' 
            });
            throw new Error(`Column uniqueness validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('all values in column {string} should be {string}')
    async validateAllColumnValues(column: string, expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_all_column_values', 'validation', 0, undefined, { column, expectedValue });

        const result = this.getLastResult();
        const interpolatedExpected = this.interpolateVariables(expectedValue);
        const expectedConverted = this.convertExpectedValue(interpolatedExpected);

        try {
            const validation = this.resultSetValidator.validateColumnValues(
                result, 
                column, 
                { type: 'equals', value: expectedConverted }
            );

            if (!validation.passed) {
                throw new Error(validation.message || 'Column values validation failed');
            }

            await actionLogger.logDatabase('all_column_values_validated', 'validation', 0, undefined, { 
                column,
                expectedValue: expectedConverted,
                rowCount: result.rowCount
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'all_column_values_failed' 
            });
            throw new Error(`Column values validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('column {string} should contain value {string}')
    async validateColumnContainsValue(column: string, value: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_contains_value', 'validation', 0, undefined, { column, value });

        const result = this.getLastResult();
        const interpolatedValue = this.interpolateVariables(value);
        const convertedValue = this.convertExpectedValue(interpolatedValue);

        try {
            const found = result.rows.some(row => {
                const cellValue = row[column];
                return this.valuesEqual(cellValue, convertedValue);
            });

            if (!found) {
                throw new Error(`Value '${interpolatedValue}' not found in column '${column}'`);
            }

            await actionLogger.logDatabase('column_contains_value_validated', 'validation', 0, undefined, { 
                column, 
                value: convertedValue 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_contains_value_failed' 
            });
            throw new Error(`Column contains value validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('column {string} should not contain value {string}')
    async validateColumnNotContainsValue(column: string, value: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_not_contains_value', 'validation', 0, undefined, { column, value });

        const result = this.getLastResult();
        const interpolatedValue = this.interpolateVariables(value);
        const convertedValue = this.convertExpectedValue(interpolatedValue);

        try {
            const found = result.rows.some(row => {
                const cellValue = row[column];
                return this.valuesEqual(cellValue, convertedValue);
            });

            if (found) {
                throw new Error(`Value '${interpolatedValue}' found in column '${column}'`);
            }

            await actionLogger.logDatabase('column_not_contains_value_validated', 'validation', 0, undefined, { 
                column, 
                value: convertedValue 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_not_contains_value_failed' 
            });
            throw new Error(`Column not contains value validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the sum of column {string} should be {float}')
    async validateColumnSum(column: string, expectedSum: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_sum', 'validation', 0, undefined, { column, expectedSum });

        const result = this.getLastResult();

        try {
            const actualSum = result.rows.reduce((sum, row) => {
                const value = row[column];
                const numValue = Number(value);
                
                if (isNaN(numValue)) {
                    throw new Error(`Non-numeric value found in column '${column}': ${value}`);
                }
                
                return sum + numValue;
            }, 0);

            const tolerance = 0.001;
            if (Math.abs(actualSum - expectedSum) > tolerance) {
                throw new Error(
                    `Expected sum: ${expectedSum}, but got: ${actualSum}`
                );
            }

            await actionLogger.logDatabase('column_sum_validated', 'validation', 0, undefined, { 
                column, 
                expectedSum, 
                actualSum 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_sum_failed' 
            });
            throw new Error(`Column sum validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the average of column {string} should be {float}')
    async validateColumnAverage(column: string, expectedAvg: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_average', 'validation', 0, undefined, { column, expectedAvg });

        const result = this.getLastResult();

        try {
            if (result.rowCount === 0) {
                throw new Error('Cannot calculate average of empty result set');
            }

            const sum = result.rows.reduce((total, row) => {
                const value = row[column];
                const numValue = Number(value);
                
                if (isNaN(numValue)) {
                    throw new Error(`Non-numeric value found in column '${column}': ${value}`);
                }
                
                return total + numValue;
            }, 0);

            const actualAvg = sum / result.rowCount;
            const tolerance = 0.001;

            if (Math.abs(actualAvg - expectedAvg) > tolerance) {
                throw new Error(
                    `Expected average: ${expectedAvg}, but got: ${actualAvg.toFixed(3)}`
                );
            }

            await actionLogger.logDatabase('column_average_validated', 'validation', 0, undefined, { 
                column, 
                expectedAvg, 
                actualAvg: actualAvg.toFixed(3) 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_average_failed' 
            });
            throw new Error(`Column average validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the minimum value in column {string} should be {string}')
    async validateColumnMin(column: string, expectedMin: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_min', 'validation', 0, undefined, { column, expectedMin });

        const result = this.getLastResult();
        const interpolatedExpected = this.interpolateVariables(expectedMin);

        try {
            if (result.rowCount === 0) {
                throw new Error('Cannot find minimum in empty result set');
            }

            const values = result.rows.map(row => row[column]);
            const minValue = values.reduce((min, val) => {
                if (val === null || val === undefined) return min;
                
                if (typeof val === 'number' && typeof min === 'number') {
                    return val < min ? val : min;
                } else if (val instanceof Date && min instanceof Date) {
                    return val < min ? val : min;
                } else {
                    return String(val) < String(min) ? val : min;
                }
            }, values[0]);

            const convertedExpected = this.convertExpectedValue(interpolatedExpected);
            
            if (!this.valuesEqual(minValue, convertedExpected)) {
                throw new Error(
                    `Expected minimum: ${interpolatedExpected}, but got: ${minValue}`
                );
            }

            await actionLogger.logDatabase('column_min_validated', 'validation', 0, undefined, { 
                column, 
                expectedMin: convertedExpected, 
                actualMin: minValue 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_min_failed' 
            });
            throw new Error(`Column minimum validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the maximum value in column {string} should be {string}')
    async validateColumnMax(column: string, expectedMax: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_max', 'validation', 0, undefined, { column, expectedMax });

        const result = this.getLastResult();
        const interpolatedExpected = this.interpolateVariables(expectedMax);

        try {
            if (result.rowCount === 0) {
                throw new Error('Cannot find maximum in empty result set');
            }

            const values = result.rows.map(row => row[column]);
            const maxValue = values.reduce((max, val) => {
                if (val === null || val === undefined) return max;
                
                if (typeof val === 'number' && typeof max === 'number') {
                    return val > max ? val : max;
                } else if (val instanceof Date && max instanceof Date) {
                    return val > max ? val : max;
                } else {
                    return String(val) > String(max) ? val : max;
                }
            }, values[0]);

            const convertedExpected = this.convertExpectedValue(interpolatedExpected);
            
            if (!this.valuesEqual(maxValue, convertedExpected)) {
                throw new Error(
                    `Expected maximum: ${interpolatedExpected}, but got: ${maxValue}`
                );
            }

            await actionLogger.logDatabase('column_max_validated', 'validation', 0, undefined, { 
                column, 
                expectedMax: convertedExpected, 
                actualMax: maxValue 
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_max_failed' 
            });
            throw new Error(`Column maximum validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('column {string} should have data type {string}')
    async validateColumnDataType(column: string, expectedType: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_data_type', 'validation', 0, undefined, { column, expectedType });

        const result = this.getLastResult();

        try {
            const columnMeta = result.fields?.find((col: any) => col.name === column);
            if (!columnMeta) {
                throw new Error(`Column '${column}' not found in result set`);
            }

            const validation = this.dataTypeValidator.validateType(
                columnMeta.dataType,
                expectedType
            );

            if (!validation.passed) {
                throw new Error(validation.message || 'Data type validation failed');
            }

            await actionLogger.logDatabase('column_data_type_validated', 'validation', 0, undefined, { 
                column, 
                expectedType,
                actualType: columnMeta.dataType
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_data_type_failed' 
            });
            throw new Error(`Column data type validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('values in column {string} should be between {string} and {string}')
    async validateColumnRange(column: string, minValue: string, maxValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_column_range', 'validation', 0, undefined, { column, minValue, maxValue });

        const result = this.getLastResult();
        const interpolatedMin = this.interpolateVariables(minValue);
        const interpolatedMax = this.interpolateVariables(maxValue);

        try {
            const minConverted = this.convertExpectedValue(interpolatedMin);
            const maxConverted = this.convertExpectedValue(interpolatedMax);

            const outOfRange = result.rows.filter(row => {
                const value = row[column];
                if (value === null || value === undefined) return false;

                if (typeof value === 'number') {
                    return value < Number(minConverted) || value > Number(maxConverted);
                } else if (value instanceof Date) {
                    const dateValue = value.getTime();
                    const minDate = new Date(minConverted as any).getTime();
                    const maxDate = new Date(maxConverted as any).getTime();
                    return dateValue < minDate || dateValue > maxDate;
                } else {
                    const strValue = String(value);
                    return strValue < String(minConverted) || strValue > String(maxConverted);
                }
            });

            if (outOfRange.length > 0) {
                throw new Error(
                    `${outOfRange.length} value(s) out of range [${interpolatedMin}, ${interpolatedMax}]\n` +
                    `First out-of-range value: ${outOfRange[0][column]}`
                );
            }

            await actionLogger.logDatabase('column_range_validated', 'validation', 0, undefined, { 
                column, 
                minValue: minConverted, 
                maxValue: maxConverted,
                checkedRows: result.rowCount
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'column_range_failed' 
            });
            throw new Error(`Column range validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the result should have columns:')
    async validateResultColumns(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_result_columns', 'validation', 0);

        const result = this.getLastResult();
        const expectedColumns = this.parseColumnsTable(dataTable);

        try {
            const actualColumns = result.fields?.map((col: any) => col.name) || Object.keys(result.rows[0] || {});
            const missingColumns = expectedColumns.filter((col: string) => !actualColumns.includes(col));
            const extraColumns = actualColumns.filter((col: string) => !expectedColumns.includes(col));

            if (missingColumns.length > 0 || extraColumns.length > 0) {
                let errorMsg = 'Column mismatch:\n';
                if (missingColumns.length > 0) {
                    errorMsg += `Missing columns: ${missingColumns.join(', ')}\n`;
                }
                if (extraColumns.length > 0) {
                    errorMsg += `Extra columns: ${extraColumns.join(', ')}\n`;
                }
                errorMsg += `Expected: ${expectedColumns.join(', ')}\n`;
                errorMsg += `Actual: ${actualColumns.join(', ')}`;
                throw new Error(errorMsg);
            }

            await actionLogger.logDatabase('result_columns_validated', 'validation', 0, undefined, { 
                columnCount: expectedColumns.length,
                columns: expectedColumns
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'result_columns_failed' 
            });
            throw new Error(`Result columns validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the result should match:')
    async validateResultData(dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_result_data', 'validation', 0);

        const result = this.getLastResult();
        const expectedData = this.parseExpectedData(dataTable);

        try {
            if (expectedData.length !== result.rowCount) {
                throw new Error(
                    `Row count mismatch. Expected: ${expectedData.length}, Actual: ${result.rowCount}`
                );
            }

            for (let i = 0; i < expectedData.length; i++) {
                const expectedRow = expectedData[i];
                const actualRow = result.rows[i];

                for (const column of Object.keys(expectedRow || {})) {
                    const expected = expectedRow![column];
                    const actual = actualRow![column];

                    if (!this.valuesEqual(actual, expected)) {
                        throw new Error(
                            `Mismatch at row ${i + 1}, column '${column}'\n` +
                            `Expected: ${expected}\n` +
                            `Actual: ${actual}`
                        );
                    }
                }
            }

            await actionLogger.logDatabase('result_data_validated', 'validation', 0, undefined, { 
                rowCount: expectedData.length,
                columnCount: Object.keys(expectedData[0] || {}).length
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'result_data_failed' 
            });
            throw new Error(`Result data validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('the scalar result should be {string}')
    @CSBDDStepDef('the single value result should be {string}')
    async validateScalarResult(expectedValue: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_scalar_result', 'validation', 0, undefined, { expectedValue });

        const result = this.getLastResult();
        if (!result || result.rowCount === 0 || !result.rows[0]) {
            throw new Error('No scalar result available. Execute a scalar query first');
        }
        
        const columns = Object.keys(result.rows[0]);
        if (columns.length === 0) {
            throw new Error('No columns in result');
        }
        const firstColumn = columns[0];
        if (!firstColumn) {
            throw new Error('No column found in result');
        }
        const scalarResult = result.rows[0][firstColumn];

        const interpolatedExpected = this.interpolateVariables(expectedValue);
        const convertedExpected = this.convertExpectedValue(interpolatedExpected);

        try {
            if (!this.valuesEqual(scalarResult, convertedExpected)) {
                throw new Error(
                    `Scalar result mismatch\n` +
                    `Expected: ${interpolatedExpected} (${typeof convertedExpected})\n` +
                    `Actual: ${scalarResult} (${typeof scalarResult})`
                );
            }

            await actionLogger.logDatabase('scalar_result_validated', 'validation', 0, undefined, { 
                expectedValue: convertedExpected,
                actualValue: scalarResult
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { 
                operation: 'scalar_result_failed' 
            });
            throw new Error(`Scalar result validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private getLastResult(): QueryResult {
        const result = this.databaseContext.getStoredResult('last');
        if (!result) {
            throw new Error('No query result available. Execute a query first');
        }
        return result;
    }

    private getCellValue(result: QueryResult, rowIndex: number, column: string): any {
        if (rowIndex < 0 || rowIndex >= result.rowCount) {
            throw new Error(`Row index ${rowIndex + 1} out of bounds (1-${result.rowCount})`);
        }

        const row = result.rows[rowIndex];
        if (!(column in row)) {
            const availableColumns = Object.keys(row).join(', ');
            throw new Error(
                `Column '${column}' not found. Available columns: ${availableColumns}`
            );
        }

        return row[column];
    }

    private convertExpectedValue(value: string): any {
        if (value.toLowerCase() === 'null') return null;
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        if (/^-?\d+$/.test(value)) return parseInt(value);
        if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
        
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value);
        
        if (value === "''") return '';
        
        return value;
    }

    private valuesEqual(actual: any, expected: any): boolean {
        if (actual === null || actual === undefined) {
            return expected === null || expected === undefined || expected === 'null';
        }

        if (actual instanceof Date && expected instanceof Date) {
            return actual.getTime() === expected.getTime();
        }

        if (typeof actual === 'number' && typeof expected === 'number') {
            return Math.abs(actual - expected) < 0.001;
        }

        return actual === expected;
    }

    private parseColumnsTable(dataTable: any): string[] {
        const columns: string[] = [];

        if (dataTable && dataTable.raw) {
            dataTable.raw().forEach((row: string[]) => {
                if (row && row.length > 0) {
                    const value = row[0];
                    if (value !== undefined && value !== null) {
                        columns.push(value.trim());
                    }
                }
            });
        } else if (dataTable && dataTable.rawTable) {
            dataTable.rawTable.forEach((row: string[]) => {
                if (row && row.length > 0) {
                    const value = row[0];
                    if (value !== undefined && value !== null) {
                        columns.push(value.trim());
                    }
                }
            });
        }

        return columns;
    }

    private parseExpectedData(dataTable: any): Record<string, any>[] {
        const data: Record<string, any>[] = [];
        let rawData: string[][] | undefined;

        if (dataTable && dataTable.raw) {
            rawData = dataTable.raw();
        } else if (dataTable && dataTable.rawTable) {
            rawData = dataTable.rawTable;
        }

        if (rawData && rawData.length > 0) {
            const firstRow = rawData[0];
            if (!firstRow) {
                return data;
            }
            const headers = firstRow.map((h: string) => h.trim());
            
            for (let i = 1; i < rawData.length; i++) {
                const row = rawData[i];
                const rowData: Record<string, any> = {};
                
                headers.forEach((header: string, index: number) => {
                    if (row && row[index] !== undefined) {
                        const value = row[index].trim();
                        const interpolated = this.interpolateVariables(value);
                        rowData[header] = this.convertExpectedValue(interpolated);
                    } else {
                        rowData[header] = null;
                    }
                });
                
                data.push(rowData);
            }
        }

        return data;
    }

    private interpolateVariables(text: string): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_match, variable) => {
            const value = this.retrieve(variable);
            if (value === undefined) {
                throw new Error(`Variable '${variable}' is not defined in context`);
            }
            return String(value);
        });
    }
}
