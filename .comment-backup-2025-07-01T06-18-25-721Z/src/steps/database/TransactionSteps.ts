// src/steps/database/TransactionSteps.ts

import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { DatabaseContext } from '../../database/context/DatabaseContext';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { Transaction } from '../../database/types/database.types';

export class TransactionSteps extends CSBDDBaseStepDefinition {
    private databaseContext: DatabaseContext = new DatabaseContext();
    private activeTransaction: Transaction | null = null;
    private transactionStartTime: Date | null = null;
    private savepoints: string[] = [];

    constructor() {
        super();
    }

    @CSBDDStepDef('user begins database transaction')
    @CSBDDStepDef('user starts database transaction')
    async beginTransaction(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('begin_transaction', '', 0);

        try {
            // Check if transaction already active
            if (this.activeTransaction) {
                throw new Error('A transaction is already active. Commit or rollback before starting a new one');
            }

            const adapter = this.databaseContext.getActiveAdapter();
            const connection = this.getActiveConnection();
            await adapter.beginTransaction(connection);
            
            this.activeTransaction = {
                id: `txn_${Date.now()}`,
                startTime: new Date(),
                connection,
                status: 'active',
                savepoints: []
            };
            this.transactionStartTime = new Date();

            await actionLogger.logDatabase('transaction_started', '', 0, undefined, {
                transactionId: this.activeTransaction.id
            });

        } catch (error) {
            await actionLogger.logDatabase('transaction_begin_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to begin transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user begins database transaction with isolation level {string}')
    async beginTransactionWithIsolation(isolationLevel: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('begin_transaction_with_isolation', '', 0, undefined, { isolationLevel });

        try {
            if (this.activeTransaction) {
                throw new Error('A transaction is already active');
            }

            const validLevels = ['READ_UNCOMMITTED', 'READ_COMMITTED', 'REPEATABLE_READ', 'SERIALIZABLE'];
            const upperLevel = isolationLevel.toUpperCase().replace(/ /g, '_');
            
            if (!validLevels.includes(upperLevel)) {
                throw new Error(
                    `Invalid isolation level: ${isolationLevel}. ` +
                    `Valid levels: ${validLevels.join(', ')}`
                );
            }

            const adapter = this.databaseContext.getActiveAdapter();
            const connection = this.getActiveConnection();
            
            const options = {
                isolationLevel: upperLevel as any
            };
            
            await adapter.beginTransaction(connection, options);
            
            this.activeTransaction = {
                id: `txn_${Date.now()}`,
                isolationLevel: upperLevel,
                startTime: new Date(),
                connection,
                status: 'active',
                savepoints: []
            };
            this.transactionStartTime = new Date();

            await actionLogger.logDatabase('transaction_started_with_isolation', '', 0, undefined, {
                transactionId: this.activeTransaction.id,
                isolationLevel: upperLevel
            });

        } catch (error) {
            await actionLogger.logDatabase('transaction_isolation_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to begin transaction with isolation level: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user commits database transaction')
    @CSBDDStepDef('user saves database transaction')
    async commitTransaction(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('commit_transaction', '', 0);

        try {
            const transaction = this.getActiveTransaction();
            const startTime = this.transactionStartTime;
            
            const adapter = this.databaseContext.getActiveAdapter();
            await adapter.commitTransaction(transaction.connection);
            
            const duration = startTime ? Date.now() - startTime.getTime() : 0;
            
            this.activeTransaction = null;
            this.transactionStartTime = null;
            this.savepoints = [];
            
            this.store('lastTransactionHistory', {
                id: transaction.id,
                type: 'commit',
                duration,
                timestamp: new Date()
            });

            await actionLogger.logDatabase('transaction_committed', '', duration, undefined, {
                transactionId: transaction.id,
                duration
            });

        } catch (error) {
            await actionLogger.logDatabase('transaction_commit_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to commit transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user rolls back database transaction')
    @CSBDDStepDef('user cancels database transaction')
    async rollbackTransaction(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('rollback_transaction', '', 0);

        try {
            const transaction = this.getActiveTransaction();
            const startTime = this.transactionStartTime;
            
            const adapter = this.databaseContext.getActiveAdapter();
            await adapter.rollbackTransaction(transaction.connection);
            
            const duration = startTime ? Date.now() - startTime.getTime() : 0;
            
            this.activeTransaction = null;
            this.transactionStartTime = null;
            this.savepoints = [];
            
            this.store('lastTransactionHistory', {
                id: transaction.id,
                type: 'rollback',
                duration,
                timestamp: new Date()
            });

            await actionLogger.logDatabase('transaction_rolled_back', '', duration, undefined, {
                transactionId: transaction.id,
                duration
            });

        } catch (error) {
            await actionLogger.logDatabase('transaction_rollback_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to rollback transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user creates savepoint {string}')
    async createSavepoint(savepointName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('create_savepoint', '', 0, undefined, { savepointName });

        try {
            const transaction = this.getActiveTransaction();
            
            const adapter = this.databaseContext.getActiveAdapter();
            await adapter.createSavepoint(transaction.connection, savepointName);
            
            this.savepoints.push(savepointName);
            if (transaction.savepoints) {
                transaction.savepoints.push(savepointName);
            }

            await actionLogger.logDatabase('savepoint_created', '', 0, undefined, {
                transactionId: transaction.id,
                savepointName
            });

        } catch (error) {
            await actionLogger.logDatabase('savepoint_create_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to create savepoint '${savepointName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user rolls back to savepoint {string}')
    async rollbackToSavepoint(savepointName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('rollback_to_savepoint', '', 0, undefined, { savepointName });

        try {
            const transaction = this.getActiveTransaction();
            
            if (!this.savepoints.includes(savepointName)) {
                throw new Error(`Savepoint '${savepointName}' does not exist`);
            }

            const adapter = this.databaseContext.getActiveAdapter();
            await adapter.rollbackToSavepoint(transaction.connection, savepointName);
            
            // Remove savepoints created after this one
            const index = this.savepoints.indexOf(savepointName);
            this.savepoints = this.savepoints.slice(0, index + 1);

            await actionLogger.logDatabase('savepoint_rolled_back', '', 0, undefined, {
                transactionId: transaction.id,
                savepointName
            });

        } catch (error) {
            await actionLogger.logDatabase('savepoint_rollback_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to rollback to savepoint '${savepointName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user releases savepoint {string}')
    async releaseSavepoint(savepointName: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('release_savepoint', '', 0, undefined, { savepointName });

        try {
            const transaction = this.getActiveTransaction();
            
            if (!this.savepoints.includes(savepointName)) {
                throw new Error(`Savepoint '${savepointName}' does not exist`);
            }

            const adapter = this.databaseContext.getActiveAdapter();
            await adapter.releaseSavepoint(transaction.connection, savepointName);
            
            const index = this.savepoints.indexOf(savepointName);
            if (index > -1) {
                this.savepoints.splice(index, 1);
            }

            await actionLogger.logDatabase('savepoint_released', '', 0, undefined, {
                transactionId: transaction.id,
                savepointName
            });

        } catch (error) {
            await actionLogger.logDatabase('savepoint_release_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to release savepoint '${savepointName}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('database should have active transaction')
    async validateActiveTransaction(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_active_transaction', '', 0);

        if (!this.activeTransaction) {
            throw new Error('No active transaction found');
        }

        await actionLogger.logDatabase('active_transaction_validated', '', 0, undefined, {
            transactionId: this.activeTransaction.id,
            isolationLevel: this.activeTransaction.isolationLevel
        });
    }

    @CSBDDStepDef('database should not have active transaction')
    async validateNoActiveTransaction(): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('validate_no_active_transaction', '', 0);

        if (this.activeTransaction) {
            throw new Error(`Found active transaction: ${this.activeTransaction.id}`);
        }

        await actionLogger.logDatabase('no_active_transaction_validated', '', 0);
    }

    @CSBDDStepDef('user executes query {string} within transaction')
    async executeQueryInTransaction(query: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('execute_query_in_transaction', this.sanitizeQueryForLog(query), 0);

        try {
            const transaction = this.getActiveTransaction();
            const interpolatedQuery = this.interpolateVariables(query);
            
            const adapter = this.databaseContext.getActiveAdapter();
            const startTime = Date.now();
            
            // Execute query within transaction context
            const result = await adapter.query(transaction.connection, interpolatedQuery);
            const executionTime = Date.now() - startTime;

            this.databaseContext.storeResult('last', result);
            this.store('lastQueryExecution', {
                query: interpolatedQuery,
                executionTime,
                rowCount: result.rowCount,
                timestamp: new Date(),
                transactionId: transaction.id
            });

            await actionLogger.logDatabase('transaction_query_executed', interpolatedQuery, executionTime, result.rowCount, {
                transactionId: transaction.id,
                rowCount: result.rowCount,
                executionTime
            });

        } catch (error) {
            await actionLogger.logDatabase('transaction_query_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to execute query in transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    @CSBDDStepDef('user sets transaction timeout to {int} seconds')
    async setTransactionTimeout(timeout: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('set_transaction_timeout', '', 0, undefined, { timeout });

        try {
            const transaction = this.getActiveTransaction();
            
            // Set timeout on the transaction
            transaction.timeout = timeout * 1000;
            
            await actionLogger.logDatabase('transaction_timeout_set', '', 0, undefined, {
                transactionId: transaction.id,
                timeout
            });

        } catch (error) {
            await actionLogger.logDatabase('transaction_timeout_failed', '', 0, undefined, { error: error instanceof Error ? error.message : String(error) });
            throw new Error(`Failed to set transaction timeout: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Helper methods
    private getActiveConnection(): any {
        const connectionField = 'activeConnection';
        const connection = (this.databaseContext as any)[connectionField];
        if (!connection) {
            throw new Error('No database connection established. Use "Given user connects to ... database" first');
        }
        return connection;
    }

    private getActiveTransaction(): Transaction {
        if (!this.activeTransaction) {
            throw new Error('No active transaction. Use "Given user begins database transaction" first');
        }
        return this.activeTransaction;
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