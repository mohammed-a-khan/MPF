// src/database/client/TransactionManager.ts

import { DatabaseConnection, TransactionOptions, TransactionState } from '../types/database.types';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Manages database transactions with savepoint support
 */
export class TransactionManager {
  private adapter: DatabaseAdapter;
  private transactionStack: Map<DatabaseConnection, TransactionState[]> = new Map();
  private savepointCounter: number = 0;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /**
   * Begin transaction
   */
  async begin(connection: DatabaseConnection, options?: TransactionOptions): Promise<void> {
    try {
      // Get current transaction stack
      let stack = this.transactionStack.get(connection);
      if (!stack) {
        stack = [];
        this.transactionStack.set(connection, stack);
      }

      // Check if already in transaction
      if (stack.length > 0) {
        // Create savepoint for nested transaction
        const savepointName = this.generateSavepointName();
        await this.savepoint(connection, savepointName);
        
        stack.push({
          level: stack.length + 1,
          savepoint: savepointName,
          startTime: Date.now()
        });
      } else {
        // Start new transaction
        await this.adapter.beginTransaction(connection, options);
        
        const transactionState: TransactionState = {
          level: 1,
          startTime: Date.now()
        };
        if (options?.isolationLevel) {
          transactionState.isolationLevel = options.isolationLevel;
        }
        stack.push(transactionState);
      }

      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('transactionBegin', 'transaction', 0, undefined, {
        level: stack.length,
        isolationLevel: options?.isolationLevel
      });
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Failed to begin transaction:', error as Error);
      throw error;
    }
  }

  /**
   * Commit transaction
   */
  async commit(connection: DatabaseConnection): Promise<void> {
    try {
      const stack = this.transactionStack.get(connection);
      if (!stack || stack.length === 0) {
        throw new Error('No active transaction to commit');
      }

      const current = stack.pop()!;
      const duration = Date.now() - current.startTime;

      if (stack.length === 0) {
        // Commit main transaction
        await this.adapter.commitTransaction(connection);
        this.transactionStack.delete(connection);
        
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('transactionCommit', 'transaction', duration, undefined, {
          level: current.level
        });
      } else {
        // Release savepoint for nested transaction
        if (current.savepoint) {
          await this.releaseSavepoint(connection, current.savepoint);
        }
        
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('savepointRelease', 'transaction', duration, undefined, {
          savepoint: current.savepoint,
          level: current.level
        });
      }
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Failed to commit transaction:', error as Error);
      throw error;
    }
  }

  /**
   * Rollback transaction
   */
  async rollback(connection: DatabaseConnection, savepoint?: string): Promise<void> {
    try {
      const stack = this.transactionStack.get(connection);
      
      if (!stack || stack.length === 0) {
        throw new Error('No active transaction to rollback');
      }

      if (savepoint) {
        // Rollback to specific savepoint
        await this.rollbackToSavepoint(connection, savepoint);
        
        // Remove all states after this savepoint
        const index = stack.findIndex(state => state.savepoint === savepoint);
        if (index !== -1) {
          stack.splice(index);
        }
        
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logDatabase('savepointRollback', 'transaction', 0, undefined, {
          savepoint,
          remainingLevels: stack.length
        });
      } else {
        // Rollback entire transaction
        const current = stack[stack.length - 1];
        if (!current) {
          throw new Error('Invalid transaction state');
        }
        
        if (stack.length === 1) {
          // Rollback main transaction
          await this.adapter.rollbackTransaction(connection);
          this.transactionStack.delete(connection);
          
          const actionLogger = ActionLogger.getInstance();
          await actionLogger.logDatabase('transactionRollback', 'transaction', Date.now() - current.startTime, undefined, {
            level: current.level
          });
        } else {
          // Rollback to previous savepoint
          stack.pop();
          const previous = stack[stack.length - 1];
          
          if (previous && previous.savepoint) {
            await this.rollbackToSavepoint(connection, previous.savepoint);
          }
          
          const actionLogger = ActionLogger.getInstance();
          if (previous) {
            await actionLogger.logDatabase('nestedRollback', 'transaction', 0, undefined, {
              fromLevel: current.level,
              toLevel: previous.level,
              savepoint: previous.savepoint
            });
          }
        }
      }
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Failed to rollback transaction:', error as Error);
      throw error;
    }
  }

  /**
   * Create savepoint
   */
  async savepoint(connection: DatabaseConnection, name: string): Promise<void> {
    try {
      await this.adapter.createSavepoint(connection, name);
      
      // Track savepoint in current transaction
      const stack = this.transactionStack.get(connection);
      if (stack && stack.length > 0) {
        const current = stack[stack.length - 1];
        if (current) {
          if (!current.savepoints) {
            current.savepoints = [];
          }
          current.savepoints.push({
            name,
            createdAt: Date.now()
          });
        }
      }
      
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('savepointCreate', 'transaction', 0, undefined, { name });
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Failed to create savepoint:', error as Error);
      throw error;
    }
  }

  /**
   * Release savepoint
   */
  private async releaseSavepoint(connection: DatabaseConnection, name: string): Promise<void> {
    try {
      await this.adapter.releaseSavepoint(connection, name);
    } catch (error) {
      // Some databases don't support explicit savepoint release
      const logger = Logger.getInstance();
      logger.debug('Savepoint release not supported or failed:', error as Error);
    }
  }

  /**
   * Rollback to savepoint
   */
  private async rollbackToSavepoint(connection: DatabaseConnection, name: string): Promise<void> {
    await this.adapter.rollbackToSavepoint(connection, name);
  }

  /**
   * Check if in transaction
   */
  isInTransaction(connection: DatabaseConnection): boolean {
    const stack = this.transactionStack.get(connection);
    return stack !== undefined && stack.length > 0;
  }

  /**
   * Get transaction level
   */
  getTransactionLevel(connection: DatabaseConnection): number {
    const stack = this.transactionStack.get(connection);
    return stack ? stack.length : 0;
  }

  /**
   * Get active transactions info
   */
  getActiveTransactions(): Map<DatabaseConnection, TransactionState[]> {
    return new Map(this.transactionStack);
  }

  /**
   * Execute in transaction
   */
  async executeInTransaction<T>(
    connection: DatabaseConnection,
    operation: () => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const wasInTransaction = this.isInTransaction(connection);
    
    if (!wasInTransaction) {
      await this.begin(connection, options);
    }
    
    try {
      const result = await operation();
      
      if (!wasInTransaction) {
        await this.commit(connection);
      }
      
      return result;
    } catch (error) {
      if (!wasInTransaction) {
        await this.rollback(connection);
      }
      throw error;
    }
  }

  /**
   * Clear transaction state (for cleanup)
   */
  clearTransactionState(connection: DatabaseConnection): void {
    this.transactionStack.delete(connection);
  }

  /**
   * Generate unique savepoint name
   */
  private generateSavepointName(): string {
    return `sp_${Date.now()}_${++this.savepointCounter}`;
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): {
    activeTransactions: number;
    totalSavepoints: number;
    longestTransaction: number | null;
  } {
    let totalSavepoints = 0;
    let longestTransaction: number | null = null;
    const now = Date.now();

    this.transactionStack.forEach(stack => {
      stack.forEach(state => {
        const duration = now - state.startTime;
        if (longestTransaction === null || duration > longestTransaction) {
          longestTransaction = duration;
        }
        
        if (state.savepoints) {
          totalSavepoints += state.savepoints.length;
        }
      });
    });

    return {
      activeTransactions: this.transactionStack.size,
      totalSavepoints,
      longestTransaction
    };
  }
}