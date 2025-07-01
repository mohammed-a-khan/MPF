// src/database/client/ConnectionManager.ts

import { DatabaseConnection, DatabaseConfig, ConnectionStats } from '../types/database.types';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { ConnectionPool } from './ConnectionPool';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Manages database connections and connection lifecycle
 */
export class ConnectionManager {
  private adapter: DatabaseAdapter;
  private connection?: DatabaseConnection;
  private pool?: ConnectionPool;
  private config?: DatabaseConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck: Date = new Date();
  private healthy: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /**
   * Connect to database
   */
  async connect(config: DatabaseConfig): Promise<DatabaseConnection> {
    try {
      this.config = config;
      
      // Use connection pooling if configured
      if (config.poolSize && config.poolSize > 1) {
        this.pool = new ConnectionPool(this.adapter, config);
        await this.pool.initialize();
        this.connection = await this.pool.acquire();
      } else {
        // Single connection
        this.connection = await this.adapter.connect(config);
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      this.healthy = true;
      this.reconnectAttempts = 0;
      
      return this.connection;
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Connection failed:', error as Error);
      throw error;
    }
  }

  /**
   * Get active connection
   */
  async getConnection(): Promise<DatabaseConnection> {
    if (!this.connection) {
      throw new Error('No active database connection');
    }

    // Check health before returning
    if (!this.healthy) {
      await this.attemptReconnect();
    }

    // For pooled connections, get from pool
    if (this.pool) {
      return this.pool.acquire();
    }

    return this.connection;
  }

  /**
   * Release connection back to pool
   */
  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    if (this.pool) {
      await this.pool.release(connection);
    }
    // For single connections, nothing to do
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    try {
      // Stop health monitoring
      this.stopHealthMonitoring();

      // Close pool or connection
      if (this.pool) {
        await this.pool.drain();
      } else if (this.connection) {
        await this.adapter.disconnect(this.connection);
      }

      delete (this as any).connection;
      delete (this as any).pool;
      this.healthy = false;
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Disconnect failed:', error as Error);
      throw error;
    }
  }

  /**
   * Check connection health
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.connection && !this.pool) {
        return false;
      }

      // Test connection with simple query
      const testConnection = this.pool ? await this.pool.acquire() : this.connection!;
      
      try {
        await this.adapter.ping(testConnection);
        this.lastHealthCheck = new Date();
        this.healthy = true;
        return true;
      } finally {
        if (this.pool) {
          await this.pool.release(testConnection);
        }
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.warn('Health check failed:', error as Error);
      this.healthy = false;
      return false;
    }
  }

  /**
   * Get connection health status
   */
  isHealthy(): boolean {
    // Consider unhealthy if no check in last 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    return this.healthy && this.lastHealthCheck > thirtySecondsAgo;
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): ConnectionStats | null {
    if (!this.pool) {
      return null;
    }

    return this.pool.getStats();
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // Check health every 10 seconds
    this.healthCheckInterval = setInterval(async () => {
      const healthy = await this.checkHealth();
      
      if (!healthy && this.config) {
        const logger = ActionLogger.getInstance();
        await logger.logDatabase('healthCheckFailed', 'connection', 0);
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          await this.attemptReconnect();
        }
      }
    }, 10000);

    // Initial health check
    this.checkHealth();
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        delete (this as any).healthCheckInterval;
      }
    }
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnect(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration available for reconnection');
    }

    this.reconnectAttempts++;
    const logger = ActionLogger.getInstance();
    await logger.logDatabase('reconnectAttempt', 'connection', 0, undefined, { 
      attempt: this.reconnectAttempts 
    });

    try {
      // Close existing connection
      if (this.connection) {
        try {
          await this.adapter.disconnect(this.connection);
        } catch (error) {
          // Ignore disconnect errors during reconnect
        }
      }

      // Reconnect
      if (this.pool) {
        await this.pool.reconnect();
        this.connection = await this.pool.acquire();
      } else {
        this.connection = await this.adapter.connect(this.config);
      }

      this.healthy = true;
      this.reconnectAttempts = 0;
      const logger = ActionLogger.getInstance();
      await logger.logDatabase('reconnectSuccess', 'connection', 0);
      
    } catch (error) {
      ActionLogger.logError('reconnectFailed', error as Error);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.stopHealthMonitoring();
        throw new Error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      }
      
      // Wait before next attempt (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Execute with automatic connection management
   */
  async executeWithConnection<T>(
    operation: (connection: DatabaseConnection) => Promise<T>
  ): Promise<T> {
    const connection = await this.getConnection();
    
    try {
      return await operation(connection);
    } finally {
      await this.releaseConnection(connection);
    }
  }

  /**
   * Get adapter
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter;
  }
}