// src/database/client/ConnectionPool.ts

import { DatabaseConnection, DatabaseConfig, ConnectionPoolConfig, ConnectionStats } from '../types/database.types';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class ConnectionPool {
  private adapter: DatabaseAdapter;
  private config: DatabaseConfig;
  private poolConfig: ConnectionPoolConfig;
  private connections: DatabaseConnection[] = [];
  private availableConnections: DatabaseConnection[] = [];
  private waitingQueue: Array<{
    resolve: (conn: DatabaseConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private activeCount: number = 0;
  private initialized: boolean = false;
  private draining: boolean = false;

  constructor(adapter: DatabaseAdapter, config: DatabaseConfig) {
    this.adapter = adapter;
    this.config = config;
    this.poolConfig = {
      min: config.poolMin || 2,
      max: config.poolSize || 10,
      acquireTimeout: config.poolAcquireTimeout || 30000,
      idleTimeout: config.poolIdleTimeout || 10000,
      connectionTimeout: config.connectionTimeout || 30000,
      validateOnBorrow: config.poolValidateOnBorrow !== false,
      testOnBorrow: config.poolTestOnBorrow !== false
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logDatabase('poolInitialize', 'pool', 0, undefined, {
      min: this.poolConfig.min,
      max: this.poolConfig.max
    });

    try {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < this.poolConfig.min!; i++) {
        promises.push(this.createConnection());
      }

      await Promise.all(promises);
      this.initialized = true;

      await actionLogger.logDatabase('poolInitialized', 'pool', 0, this.connections.length, {
        connections: this.connections.length
      });

      this.startIdleConnectionCleanup();
      
    } catch (error) {
      await this.cleanup();
      throw new Error(`Failed to initialize connection pool: ${(error as Error).message}`);
    }
  }

  async acquire(): Promise<DatabaseConnection> {
    if (this.draining) {
      throw new Error('Connection pool is draining');
    }

    let connection = await this.getAvailableConnection();
    
    if (connection) {
      return connection;
    }

    if (this.connections.length < this.poolConfig.max!) {
      try {
        await this.createConnection();
        connection = await this.getAvailableConnection();
        if (connection) {
          return connection;
        }
      } catch (error) {
        const logger = Logger.getInstance();
        logger.warn('Failed to create new connection:', error as Error);
      }
    }

    return this.waitForConnection();
  }

  async release(connection: DatabaseConnection): Promise<void> {
    if (this.draining) {
      await this.closeConnection(connection);
      return;
    }

    try {
      if (this.poolConfig.validateOnBorrow) {
        const isValid = await this.validateConnection(connection);
        if (!isValid) {
          await this.replaceConnection(connection);
          return;
        }
      }

      const index = this.connections.indexOf(connection);
      if (index !== -1) {
        this.availableConnections.push(connection);
        this.activeCount--;
        
        this.processWaitingQueue();
      }
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error releasing connection:', error as Error);
      await this.replaceConnection(connection);
    }
  }

  async drain(): Promise<void> {
    this.draining = true;

    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logDatabase('poolDrain', 'pool', 0);

    while (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Connection pool is draining'));
    }

    const promises = this.connections.map(conn => this.closeConnection(conn));
    await Promise.all(promises);

    this.connections = [];
    this.availableConnections = [];
    this.activeCount = 0;
    this.initialized = false;
    this.draining = false;
  }

  getStats(): ConnectionStats {
    return {
      total: this.connections.length,
      active: this.activeCount,
      idle: this.availableConnections.length,
      waiting: this.waitingQueue.length,
      min: this.poolConfig.min!,
      max: this.poolConfig.max!
    };
  }

  async reconnect(): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logDatabase('poolReconnect', 'pool', 0);

    await this.drain();
    
    this.draining = false;
    await this.initialize();
  }

  private async createConnection(): Promise<void> {
    try {
      const connection = await this.adapter.connect(this.config);
      
      (connection as any)._poolCreatedAt = Date.now();
      (connection as any)._poolLastUsed = Date.now();
      
      this.connections.push(connection);
      this.availableConnections.push(connection);
      
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('poolConnectionCreated', 'pool', 0, 1, {
        total: this.connections.length
      });
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Failed to create connection:', error as Error);
      throw error;
    }
  }

  private async closeConnection(connection: DatabaseConnection): Promise<void> {
    try {
      await this.adapter.disconnect(connection);
      
      const index = this.connections.indexOf(connection);
      if (index !== -1) {
        this.connections.splice(index, 1);
      }
      
      const availableIndex = this.availableConnections.indexOf(connection);
      if (availableIndex !== -1) {
        this.availableConnections.splice(availableIndex, 1);
      }
      
      const actionLogger = ActionLogger.getInstance();
      await actionLogger.logDatabase('poolConnectionClosed', 'pool', 0, undefined, {
        remaining: this.connections.length
      });
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error closing connection:', error as Error);
    }
  }

  private async getAvailableConnection(): Promise<DatabaseConnection | null> {
    while (this.availableConnections.length > 0) {
      const connection = this.availableConnections.shift()!;
      
      if (this.poolConfig.testOnBorrow) {
        const isValid = await this.validateConnection(connection);
        if (!isValid) {
          await this.replaceConnection(connection);
          continue;
        }
      }
      
      (connection as any)._poolLastUsed = Date.now();
      this.activeCount++;
      
      return connection;
    }
    
    return null;
  }

  private waitForConnection(): Promise<DatabaseConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.timeout === timeout);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        
        reject(new Error(`Timeout acquiring connection after ${this.poolConfig.acquireTimeout}ms`));
      }, this.poolConfig.acquireTimeout!);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  private async processWaitingQueue(): Promise<void> {
    while (this.waitingQueue.length > 0 && this.availableConnections.length > 0) {
      const waiter = this.waitingQueue.shift()!;
      clearTimeout(waiter.timeout);
      
      try {
        const connection = await this.getAvailableConnection();
        if (connection) {
          waiter.resolve(connection);
        } else {
          this.waitingQueue.unshift(waiter);
          break;
        }
      } catch (error) {
        waiter.reject(error as Error);
      }
    }
  }

  private async validateConnection(connection: DatabaseConnection): Promise<boolean> {
    try {
      await this.adapter.ping(connection);
      return true;
    } catch (error) {
      const logger = Logger.getInstance();
      logger.warn('Connection validation failed:', error as Error);
      return false;
    }
  }

  private async replaceConnection(connection: DatabaseConnection): Promise<void> {
    await this.closeConnection(connection);
    
    if (this.connections.length < this.poolConfig.min!) {
      try {
        await this.createConnection();
      } catch (error) {
        const logger = Logger.getInstance();
        logger.error('Failed to create replacement connection:', error as Error);
      }
    }
  }

  private startIdleConnectionCleanup(): void {
    setInterval(() => {
      if (this.draining) return;
      
      const now = Date.now();
      const idleTimeout = this.poolConfig.idleTimeout!;
      
      const idleConnections = this.availableConnections.filter(conn => {
        const lastUsed = (conn as any)._poolLastUsed || 0;
        return (now - lastUsed) > idleTimeout && this.connections.length > this.poolConfig.min!;
      });
      
      idleConnections.forEach(conn => {
        this.closeConnection(conn).catch(error => {
          const logger = Logger.getInstance();
          logger.error('Error closing idle connection:', error as Error);
        });
      });
      
    }, 30000);
  }

  private async cleanup(): Promise<void> {
    const promises = this.connections.map(conn => 
      this.adapter.disconnect(conn).catch(() => {})
    );
    await Promise.all(promises);
    
    this.connections = [];
    this.availableConnections = [];
    this.activeCount = 0;
  }
}
