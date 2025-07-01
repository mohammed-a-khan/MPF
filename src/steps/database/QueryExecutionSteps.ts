// src/steps/database/QueryExecutionSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { DatabaseContext } from '../../database/context/DatabaseContext';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { QueryResult } from '../../database/types/database.types';
import * as fs from 'fs';

export class QueryExecutionSteps extends CSBDDBaseStepDefinition {
    private databaseContext: DatabaseContext = new DatabaseContext();

    constructor() {
        super();
    }

    @CSBDDStepDef('user executes query from file {string}')
    @CSBDDStepDef('user runs query from file {string}')
    async executeQueryFromFile(filePath: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_query_from_file', '', 0, undefined, { filePath });

        try {
            const resolvedPath = this.resolveFilePath(filePath);
            const content = await fs.promises.readFile(resolvedPath, 'utf-8');
            const query = content;
            const interpolatedQuery = this.interpolateVariables(query);

            const startTime = Date.now();
            const result = await this.databaseContext.executeQuery(interpolatedQuery);
            const executionTime = Date.now() - startTime;

            this.databaseContext.storeResult('last', result);
            this.store('lastQueryResult', result);
            this.store('lastQueryExecutionTime', executionTime);

            await actionLogger.logDatabase('query_from_file_executed', interpolatedQuery, executionTime, result.rowCount, {
                filePath,
                rowCount: result.rowCount,
                executionTime
            });

        } catch (error) {
            await actionLogger.logError(error instanceof Error ? error : new Error(String(error)), { operation: 'query_file_execution_failed' });
            throw new Error(`Failed to execute query from file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user executes parameterized query {string} with parameters:')
    async executeParameterizedQuery(query: string, dataTable: any): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_parameterized_query', this.sanitizeQueryForLog(query), 0, undefined, { 
            query: this.sanitizeQueryForLog(query) 
        });

        try {
            const parameters = this.parseParametersTable(dataTable);
            const interpolatedQuery = this.interpolateVariables(query);

            const startTime = Date.now();
            const result = await this.databaseContext.executeQuery(interpolatedQuery, Array.isArray(parameters) ? parameters : Object.values(parameters));
            const executionTime = Date.now() - startTime;

            this.databaseContext.storeResult('last', result);
            this.store('lastQueryResult', result);
            this.store('lastQueryExecutionTime', executionTime);

            await actionLogger.logDatabase('parameterized_query_executed', interpolatedQuery, executionTime, result.rowCount, {
                rowCount: result.rowCount,
                executionTime,
                parameterCount: Array.isArray(parameters) ? parameters.length : Object.keys(parameters).length
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('parameterized_query_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to execute parameterized query: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user executes prepared statement {string}')
    @CSBDDStepDef('user executes predefined query {string}')
    async executePredefinedQuery(queryName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_predefined_query', '', 0, undefined, { queryName });

        try {
            const query = ConfigurationManager.get(`DB_QUERY_${queryName.toUpperCase()}`);
            if (!query) {
                throw new Error(`Predefined query '${queryName}' not found in configuration`);
            }

            const interpolatedQuery = this.interpolateVariables(query);
            
            const startTime = Date.now();
            const result = await this.databaseContext.executeQuery(interpolatedQuery);
            const executionTime = Date.now() - startTime;

            this.databaseContext.storeResult('last', result);
            this.store('lastQueryResult', result);
            this.store('lastQueryExecutionTime', executionTime);

            await actionLogger.logDatabase('predefined_query_executed', interpolatedQuery, executionTime, result.rowCount, {
                queryName,
                rowCount: result.rowCount,
                executionTime
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('predefined_query_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to execute predefined query '${queryName}': ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user executes batch queries:')
    async executeBatchQueries(docString: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_batch_queries', '', 0);

        const queries = this.parseBatchQueries(docString);
        const results: QueryResult[] = [];
        const errors: string[] = [];

        const startTime = Date.now();

        for (let i = 0; i < queries.length; i++) {
            try {
                const queryText = queries[i];
                if (!queryText) continue;
                
                const interpolatedQuery = this.interpolateVariables(queryText);
                const result = await this.databaseContext.executeQuery(interpolatedQuery);
                results.push(result);

                await actionLogger.logDatabase('batch_query_executed', interpolatedQuery, 0, result.rowCount, {
                    queryIndex: i + 1,
                    rowCount: result.rowCount
                });

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const errorText = `Query ${i + 1} failed: ${errorMsg}`;
                errors.push(errorText);
                await actionLogger.logDatabase('batch_query_failed', '', 0, undefined, { 
                    queryIndex: i + 1, 
                    error: errorMsg 
                });
            }
        }

        const totalExecutionTime = Date.now() - startTime;

        if (errors.length > 0) {
            throw new Error(`Batch execution failed:\n${errors.join('\n')}`);
        }

        const aggregatedResult: QueryResult = {
            rows: results.flatMap(r => r.rows),
            fields: results[0]?.fields || [],
            rowCount: results.reduce((sum, r) => sum + r.rowCount, 0),
            command: 'BATCH',
            duration: Date.now() - startTime,
            affectedRows: results.reduce((sum, r) => sum + (r.affectedRows || 0), 0) || 0
        };

        this.databaseContext.storeResult('last', aggregatedResult);
        this.databaseContext.storeResult('batch', aggregatedResult);
        this.store('batchResults', results);

        await actionLogger.logDatabase('batch_queries_completed', '', totalExecutionTime, aggregatedResult.rowCount, {
            queryCount: queries.length,
            totalRows: aggregatedResult.rowCount,
            totalExecutionTime
        });
    }

    @CSBDDStepDef('user executes query {string} with timeout {int} seconds')
    async executeQueryWithTimeout(query: string, timeout: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_query_with_timeout', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query),
            timeout
        });

        try {
            const interpolatedQuery = this.interpolateVariables(query);

            const startTime = Date.now();
            const originalTimeout = this.databaseContext['queryTimeout'];
            this.databaseContext['queryTimeout'] = timeout * 1000;
            const result = await this.databaseContext.executeQuery(interpolatedQuery);
            this.databaseContext['queryTimeout'] = originalTimeout;
            const executionTime = Date.now() - startTime;

            this.databaseContext.storeResult('last', result);
            this.store('lastQueryResult', result);
            this.store('lastQueryExecutionTime', executionTime);

            await actionLogger.logDatabase('query_with_timeout_executed', interpolatedQuery, executionTime, result.rowCount, {
                rowCount: result.rowCount,
                executionTime,
                timeout
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('timeout')) {
                throw new Error(`Query execution timed out after ${timeout} seconds`);
            }
            await actionLogger.logDatabase('query_timeout_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to execute query with timeout: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user executes query and expects error')
    @CSBDDStepDef('user executes invalid query {string}')
    async executeQueryExpectingError(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_query_expect_error', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query)
        });

        const interpolatedQuery = this.interpolateVariables(query);
        let errorOccurred = false;
        let errorMessage = '';

        try {
            await this.databaseContext.executeQuery(interpolatedQuery);
        } catch (error) {
            errorOccurred = true;
            errorMessage = error instanceof Error ? error.message : String(error);
            this.store('lastError', error);
            await actionLogger.logDatabase('query_error_expected', '', 0, undefined, { error: errorMessage });
        }

        if (!errorOccurred) {
            throw new Error('Expected query to fail, but it succeeded');
        }

        await actionLogger.logDatabase('query_error_validated', '', 0, undefined, { errorMessage });
    }

    @CSBDDStepDef('user executes scalar query {string}')
    @CSBDDStepDef('user gets single value from query {string}')
    async executeScalarQuery(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_scalar_query', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query)
        });

        try {
            const interpolatedQuery = this.interpolateVariables(query);

            const result = await this.databaseContext.executeQuery(interpolatedQuery);
            const scalarValue = result.rows[0] ? Object.values(result.rows[0])[0] : null;

            this.store('lastScalarResult', scalarValue);

            await actionLogger.logDatabase('scalar_query_executed', interpolatedQuery, 0, 1, {
                value: scalarValue,
                type: typeof scalarValue
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('scalar_query_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to execute scalar query: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user executes count query {string}')
    async executeCountQuery(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_count_query', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query)
        });

        try {
            const interpolatedQuery = this.interpolateVariables(query);

            if (!interpolatedQuery.toLowerCase().includes('count')) {
                throw new Error('Query must contain COUNT function');
            }

            const result = await this.databaseContext.executeQuery(interpolatedQuery);
            const count = result.rows[0] ? Object.values(result.rows[0])[0] : 0;
            const countValue = Number(count);

            if (isNaN(countValue)) {
                throw new Error(`Expected numeric count, got: ${count}`);
            }

            this.store('lastScalarResult', countValue);

            await actionLogger.logDatabase('count_query_executed', interpolatedQuery, 0, 1, { count: countValue });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('count_query_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to execute count query: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user executes query {string} and fetches first row')
    async executeQueryFetchFirst(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_query_fetch_first', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query)
        });

        try {
            const interpolatedQuery = this.interpolateVariables(query);

            const result = await this.databaseContext.executeQuery(interpolatedQuery);

            if (result.rowCount === 0) {
                throw new Error('Query returned no rows');
            }

            const firstRowResult: QueryResult = {
                rows: [result.rows[0]],
                fields: result.fields,
                rowCount: 1,
                command: result.command,
                duration: result.duration,
                affectedRows: result.affectedRows || 0
            };

            this.databaseContext.storeResult('last', firstRowResult);
            this.store('lastRow', result.rows[0]);

            await actionLogger.logDatabase('first_row_fetched', interpolatedQuery, 0, result.rowCount, {
                totalRows: result.rowCount,
                firstRow: result.rows[0]
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('fetch_first_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to fetch first row: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user executes query {string} with limit {int}')
    async executeQueryWithLimit(query: string, limit: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_query_with_limit', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query),
            limit
        });

        try {
            const interpolatedQuery = this.interpolateVariables(query);
            
            const limitedQuery = this.addLimitToQuery(interpolatedQuery, limit);
            
            const result = await this.databaseContext.executeQuery(limitedQuery);

            this.databaseContext.storeResult('last', result);

            await actionLogger.logDatabase('query_with_limit_executed', limitedQuery, 0, result.rowCount, {
                requestedLimit: limit,
                actualRows: result.rowCount
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('query_limit_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to execute query with limit: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user profiles query {string}')
    @CSBDDStepDef('user explains query {string}')
    async profileQuery(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('profile_query', this.sanitizeQueryForLog(query), 0, undefined, {
            query: this.sanitizeQueryForLog(query)
        });

        try {
            const interpolatedQuery = this.interpolateVariables(query);

            const result = await this.databaseContext.executeWithPlan(interpolatedQuery);
            const executionPlan = this.databaseContext.getLastExecutionPlan() || 'No execution plan available';

            console.log('\n=== Query Execution Plan ===');
            console.log(executionPlan);
            console.log('===========================\n');

            this.store('lastExecutionPlan', executionPlan);

            await actionLogger.logDatabase('query_profiled', interpolatedQuery, 0, result.rowCount, {
                planLength: executionPlan.length
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await actionLogger.logDatabase('query_profile_failed', '', 0, undefined, { error: errorMsg });
            throw new Error(`Failed to profile query: ${errorMsg}`);
        }
    }

    @CSBDDStepDef('user cancels running query')
    async cancelRunningQuery(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('cancel_query', '', 0, undefined, {});

        try {
            const adapter = this.databaseContext.getActiveAdapter();
            
            const connectionField = 'activeConnection';
            const connection = (this.databaseContext as any)[connectionField];
            
            if (!connection) {
                throw new Error('No active database connection');
            }
            
            if (adapter.cancelQuery) {
                await adapter.cancelQuery(connection);
            } else {
                throw new Error('Current database adapter does not support query cancellation');
            }

            await actionLogger.logDatabase('query_cancelled', '', 0, undefined, {});

        } catch (error) {
            await actionLogger.logDatabase('query_cancel_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to cancel query: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    private resolveFilePath(filePath: string): string {
        const paths = [
            filePath,
            `./test-data/queries/${filePath}`,
            `./resources/queries/${filePath}`,
            `./queries/${filePath}`
        ];

        for (const path of paths) {
            if (fs.existsSync(path)) {
                return path;
            }
        }

        throw new Error(`Query file not found: ${filePath}`);
    }

    private parseParametersTable(dataTable: any): Record<string, any> {
        const parameters: Record<string, any> = {};

        if (dataTable && dataTable.rawTable) {
            dataTable.rawTable.forEach((row: string[]) => {
                if (row.length >= 2) {
                    const paramName = row[0]?.trim() || '';
                    const paramValue = this.interpolateVariables(row[1]?.trim() || '');
                    
                    parameters[paramName] = this.convertParameterValue(paramValue);
                }
            });
        }

        return parameters;
    }

    private convertParameterValue(value: string): any {
        if (value.toLowerCase() === 'null') return null;
        
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        if (/^\d+$/.test(value)) return parseInt(value);
        if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
        
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value);
        
        return value;
    }

    private parseBatchQueries(docString: string): string[] {
        return docString
            .split(';')
            .map(q => q.trim())
            .filter(q => q.length > 0);
    }

    private addLimitToQuery(query: string, limit: number): string {
        const lowerQuery = query.toLowerCase();
        
        if (lowerQuery.includes(' limit ') || lowerQuery.includes(' top ')) {
            return query;
        }

        return `${query} LIMIT ${limit}`;
    }

    private sanitizeQueryForLog(query: string): string {
        const maxLength = 200;
        if (query.length > maxLength) {
            return query.substring(0, maxLength) + '...';
        }
        return query;
    }

    private interpolateVariables(text: string): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_match, variable) => {
            const value = this.context.retrieve(variable);
            if (value === undefined) {
                throw new Error(`Variable '${variable}' is not defined in context`);
            }
            return String(value);
        });
    }

}
