// src/data/provider/DataCleanupManager.ts
import { TestData, CleanupStrategy, CleanupTask, CleanupStatistics } from '../types/data.types';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { CSDatabase } from '../../database/client/CSDatabase';
import { CSHttpClient } from '../../api/client/CSHttpClient';
import * as fs from 'fs/promises';

export class DataCleanupManager {
    private static instance: DataCleanupManager;
    private cleanupTasks: Map<string, CleanupTask[]> = new Map();
    private executedTasks: CleanupTask[] = [];
    private failedTasks: CleanupTask[] = [];
    private config: {
        autoCleanup: boolean;
        cleanupDelay: number;
        maxRetries: number;
        rollbackOnFailure: boolean;
        cleanupOrder: CleanupStrategy[];
    };

    private constructor() {
        this.config = {
            autoCleanup: ConfigurationManager.getBoolean('DATA_CLEANUP_AUTO', true),
            cleanupDelay: ConfigurationManager.getInt('DATA_CLEANUP_DELAY', 0),
            maxRetries: ConfigurationManager.getInt('DATA_CLEANUP_MAX_RETRIES', 3),
            rollbackOnFailure: ConfigurationManager.getBoolean('DATA_CLEANUP_ROLLBACK_ON_FAILURE', true),
            cleanupOrder: this.parseCleanupOrder()
        };
        
        if (this.config.autoCleanup) {
            this.registerExitHandlers();
        }
        
        logger.debug('DataCleanupManager initialized with config:', this.config);
    }

    static getInstance(): DataCleanupManager {
        if (!DataCleanupManager.instance) {
            DataCleanupManager.instance = new DataCleanupManager();
        }
        return DataCleanupManager.instance;
    }

    registerData(dataId: string, data: TestData[], strategy?: CleanupStrategy): void {
        const tasks = this.createCleanupTasks(data, strategy);
        
        if (!this.cleanupTasks.has(dataId)) {
            this.cleanupTasks.set(dataId, []);
        }
        
        this.cleanupTasks.get(dataId)!.push(...tasks);
        
        ActionLogger.logInfo('Cleanup operation: register', {
            operation: 'cleanup_register',
            dataId,
            taskCount: tasks.length,
            strategy
        });
    }

    registerTask(dataId: string, task: CleanupTask): void {
        if (!this.cleanupTasks.has(dataId)) {
            this.cleanupTasks.set(dataId, []);
        }
        
        this.cleanupTasks.get(dataId)!.push(task);
        
        ActionLogger.logInfo('Cleanup operation: register_task', {
            operation: 'cleanup_register_task',
            dataId,
            taskType: task.type,
            taskId: task.id
        });
    }

    async cleanup(dataId: string): Promise<void> {
        const tasks = this.cleanupTasks.get(dataId);
        if (!tasks || tasks.length === 0) {
            logger.debug(`No cleanup tasks found for data ID: ${dataId}`);
            return;
        }
        
        ActionLogger.logInfo('Cleanup operation: start', { operation: 'cleanup_start', dataId, taskCount: tasks.length });
        
        if (this.config.cleanupDelay > 0) {
            await this.delay(this.config.cleanupDelay);
        }
        
        const executedInSession: CleanupTask[] = [];
        
        try {
            for (const strategy of this.config.cleanupOrder) {
                const strategyTasks = tasks.filter(t => t.type === strategy);
                
                for (const task of strategyTasks) {
                    await this.executeTask(task);
                    executedInSession.push(task);
                }
            }
            
            const remainingTasks = tasks.filter(
                t => !this.config.cleanupOrder.includes(t.type)
            );
            
            for (const task of remainingTasks) {
                await this.executeTask(task);
                executedInSession.push(task);
            }
            
            this.cleanupTasks.delete(dataId);
            
            ActionLogger.logInfo('Cleanup operation: complete', { 
                operation: 'cleanup_complete',
                dataId, 
                executedCount: executedInSession.length 
            });
            
        } catch (error) {
            ActionLogger.logError('Cleanup operation failed', error as Error);
            
            if (this.config.rollbackOnFailure) {
                await this.rollbackTasks(executedInSession);
            }
            
            throw error;
        }
    }

    async cleanupAll(): Promise<void> {
        const dataIds = Array.from(this.cleanupTasks.keys());
        
        ActionLogger.logInfo('Cleanup operation: cleanup_all_start', { 
            operation: 'cleanup_all_start',
            dataIdCount: dataIds.length,
            totalTasks: this.getTotalPendingTasks()
        });
        
        const errors: Array<{ dataId: string; error: any }> = [];
        
        for (const dataId of dataIds) {
            try {
                await this.cleanup(dataId);
            } catch (error) {
                errors.push({ dataId, error });
            }
        }
        
        if (errors.length > 0) {
            throw new Error(
                `Cleanup failed for ${errors.length} data sets:\n` +
                errors.map(e => `${e.dataId}: ${e.error.message}`).join('\n')
            );
        }
    }

    private async executeTask(task: CleanupTask): Promise<void> {
        let attempt = 0;
        let lastError: Error | null = null;
        
        while (attempt < this.config.maxRetries) {
            try {
                ActionLogger.logInfo('Cleanup operation: execute_task', {
                    operation: 'cleanup_execute_task',
                    taskId: task.id,
                    taskType: task.type,
                    attempt: attempt + 1
                });
                
                await this.performCleanup(task);
                
                task.executed = true;
                task.executedAt = new Date();
                this.executedTasks.push(task);
                
                return;
                
            } catch (error) {
                lastError = error as Error;
                attempt++;
                
                if (attempt < this.config.maxRetries) {
                    logger.warn(`Cleanup task failed, retrying... (${attempt}/${this.config.maxRetries}`);
                    await this.delay(1000 * attempt);
                }
            }
        }
        
        task.error = lastError || new Error('Unknown error');
        this.failedTasks.push(task);
        
        throw new Error(
            `Cleanup task failed after ${this.config.maxRetries} attempts: ${lastError?.message}`
        );
    }

    private async performCleanup(task: CleanupTask): Promise<void> {
        switch (task.type) {
            case 'database':
                await this.cleanupDatabase(task);
                break;
                
            case 'api':
                await this.cleanupAPI(task);
                break;
                
            case 'file':
                await this.cleanupFile(task);
                break;
                
            case 'cache':
                await this.cleanupCache(task);
                break;
                
            case 'custom':
                await this.cleanupCustom(task);
                break;
                
            default:
                throw new Error(`Unknown cleanup type: ${task.type}`);
        }
    }

    private async cleanupDatabase(task: CleanupTask): Promise<void> {
        const db = await CSDatabase.getInstance(task.target);
        
        try {
            if (task.data.query) {
                await db.query(task.data.query, task.data.params);
            } else if (task.data.ids && task.data.table) {
                const placeholders = task.data.ids.map(() => '?').join(',');
                const query = `DELETE FROM ${task.data.table} WHERE id IN (${placeholders})`;
                await db.query(query, task.data.ids);
            }
            
            logger.debug(`Database cleanup completed for task: ${task.id}`);
            
        } finally {
            await db.disconnect();
        }
    }

    private async cleanupAPI(task: CleanupTask): Promise<void> {
        const client = CSHttpClient.getInstance();
        
        if (task.data.endpoints) {
            for (const endpoint of task.data.endpoints) {
                await client.request({
                    url: endpoint.url,
                    method: endpoint.method || 'DELETE',
                    headers: endpoint.headers,
                    body: endpoint.body
                });
            }
        }
        
        logger.debug(`API cleanup completed for task: ${task.id}`);
    }

    private async cleanupFile(task: CleanupTask): Promise<void> {
        if (task.data.files) {
            for (const file of task.data.files) {
                try {
                    await fs.unlink(file);
                    logger.debug(`Deleted file: ${file}`);
                } catch (error: any) {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                }
            }
        }
        
        if (task.data.directories) {
            for (const dir of task.data.directories) {
                try {
                    await fs.rmdir(dir, { recursive: true });
                    logger.debug(`Deleted directory: ${dir}`);
                } catch (error: any) {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                }
            }
        }
    }

    private async cleanupCache(task: CleanupTask): Promise<void> {
        const { DataCache } = await import('./DataCache');
        const { LocalStorageManager } = await import('../../core/storage/LocalStorageManager');
        const { SessionStorageManager } = await import('../../core/storage/SessionStorageManager');
        const cache = DataCache.getInstance();
        
        if (task.data.cacheKeys) {
            for (const key of task.data.cacheKeys) {
                cache.delete(key);
                logger.debug(`Cleared cache key: ${key}`);
            }
        }
        
        if (task.data.cachePattern) {
            cache.clearPattern(task.data.cachePattern);
            logger.debug(`Cleared cache pattern: ${task.data.cachePattern}`);
        }
        
        if (task.data.clearLocalStorage && task.data.page) {
            const localStorageManager = new LocalStorageManager();
            await localStorageManager.clear(task.data.page);
            logger.debug('Cleared localStorage');
        }
        
        if (task.data.clearSessionStorage && task.data.page) {
            const sessionStorageManager = new SessionStorageManager();
            await sessionStorageManager.clear(task.data.page);
            logger.debug('Cleared sessionStorage');
        }
        
        if (task.data.redisKeys && task.data.redisConnection) {
            const { RedisAdapter } = await import('../../database/adapters/RedisAdapter');
            const redis = new RedisAdapter();
            const connection = await redis.connect({
                type: 'redis',
                host: task.data.redisConnection.host,
                port: task.data.redisConnection.port,
                password: task.data.redisConnection.password,
                database: 'default'
            });
            
            try {
                for (const key of task.data.redisKeys) {
                    await redis.query(connection, `DEL ${key}`);
                }
                
                if (task.data.redisPattern) {
                    const result = await redis.query(connection, `KEYS ${task.data.redisPattern}`);
                    const keys = result.rows.map(row => row.value || row.item_0);
                    if (keys && keys.length > 0) {
                        for (const key of keys) {
                            await redis.query(connection, `DEL ${key}`);
                        }
                    }
                }
            } finally {
                await redis.disconnect(connection);
            }
        }
        
        if (task.data.applicationCache) {
            const cacheManager = task.data.applicationCache;
            if (typeof cacheManager.clear === 'function') {
                await cacheManager.clear();
            }
        }
        
        logger.debug(`Cache cleanup completed for task: ${task.id}`);
    }

    private async cleanupCustom(task: CleanupTask): Promise<void> {
        if (task.data.handler && typeof task.data.handler === 'function') {
            await task.data.handler(task);
        } else {
            throw new Error('Custom cleanup task missing handler function');
        }
    }

    private createCleanupTasks(data: TestData[], strategy?: CleanupStrategy): CleanupTask[] {
        const tasks: CleanupTask[] = [];
        
        for (const record of data) {
            if (record.__dbId || record.__tableName) {
                tasks.push({
                    id: `db_${record.__dbId || Math.random().toString(36).substr(2, 9)}`,
                    type: 'database',
                    target: record.__connectionName || 'default',
                    data: {
                        table: record.__tableName,
                        ids: [record.__dbId || record.id],
                        query: record.__cleanupQuery,
                        params: record.__cleanupParams
                    },
                    priority: 1,
                    created: new Date()
                });
            }
            
            if (record.__apiEndpoint || record.__resourceUrl) {
                tasks.push({
                    id: `api_${record.__resourceId || Math.random().toString(36).substr(2, 9)}`,
                    type: 'api',
                    target: record.__apiEndpoint || record.__resourceUrl || '',
                    data: {
                        endpoints: [{
                            url: `${record.__apiEndpoint}/${record.__resourceId || record.id}`,
                            method: 'DELETE',
                            headers: record.__apiHeaders
                        }]
                    },
                    priority: 2,
                    created: new Date()
                });
            }
            
            if (record.__createdFiles || record.__uploadedFiles) {
                const files = [
                    ...(record.__createdFiles || []),
                    ...(record.__uploadedFiles || [])
                ];
                
                tasks.push({
                    id: `file_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'file',
                    target: 'filesystem',
                    data: {
                        files: files,
                        directories: record.__createdDirectories
                    },
                    priority: 3,
                    created: new Date()
                });
            }
            
            if (record.__cacheKeys || record.__cachePattern) {
                tasks.push({
                    id: `cache_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'cache',
                    target: 'cache',
                    data: {
                        cacheKeys: record.__cacheKeys,
                        cachePattern: record.__cachePattern,
                        redisKeys: record.__redisKeys,
                        redisPattern: record.__redisPattern,
                        redisConnection: record.__redisConnection
                    },
                    priority: 4,
                    created: new Date()
                });
            }
            
            if (record.__cleanupHandler) {
                tasks.push({
                    id: `custom_${Math.random().toString(36).substr(2, 9)}`,
                    type: 'custom',
                    target: 'custom',
                    data: {
                        handler: record.__cleanupHandler,
                        context: record
                    },
                    priority: record.__cleanupPriority || 5,
                    created: new Date()
                });
            }
        }
        
        if (strategy) {
            return tasks.filter(t => t.type === strategy);
        }
        
        return tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    private async rollbackTasks(tasks: CleanupTask[]): Promise<void> {
        logger.warn(`Rolling back ${tasks.length} cleanup tasks`);
        
        const reversedTasks = [...tasks].reverse();
        
        for (const task of reversedTasks) {
            try {
                if (task.rollback) {
                    await task.rollback();
                    logger.debug(`Rolled back task: ${task.id}`);
                } else {
                    logger.warn(`No rollback handler for task: ${task.id}`);
                }
            } catch (error) {
                logger.error(`Rollback failed for task ${task.id}:`, error as Error);
            }
        }
    }

    private getTotalPendingTasks(): number {
        let total = 0;
        const taskArrays = Array.from(this.cleanupTasks.values());
        for (const tasks of taskArrays) {
            total += tasks.length;
        }
        return total;
    }

    private parseCleanupOrder(): CleanupStrategy[] {
        const orderStr = ConfigurationManager.get('DATA_CLEANUP_ORDER', 'database,api,file,cache,custom');
        return orderStr.split(',').map(s => s.trim() as CleanupStrategy);
    }

    private registerExitHandlers(): void {
        const cleanup = async () => {
            if (this.getTotalPendingTasks() > 0) {
                logger.info('Executing pending cleanup tasks before exit...');
                try {
                    await this.cleanupAll();
                } catch (error) {
                    logger.error('Cleanup failed during exit:', error as Error);
                }
            }
        };
        
        process.on('exit', () => {
            const pendingCount = this.getTotalPendingTasks();
            if (pendingCount > 0) {
                logger.warn(`Exiting with ${pendingCount} pending cleanup tasks`);
            }
        });
        
        process.on('SIGINT', async () => {
            await cleanup();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            await cleanup();
            process.exit(0);
        });
        
        process.on('uncaughtException', async (error) => {
            logger.error('Uncaught exception:', error);
            await cleanup();
            process.exit(1);
        });
        
        process.on('unhandledRejection', async (reason) => {
            logger.error(`Unhandled rejection: ${reason}`);
            await cleanup();
            process.exit(1);
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatistics(): CleanupStatistics {
        const pendingByType: Record<CleanupStrategy, number> = {
            database: 0,
            api: 0,
            file: 0,
            cache: 0,
            custom: 0
        };
        
        const taskArrays = Array.from(this.cleanupTasks.values());
        for (const tasks of taskArrays) {
            for (const task of tasks) {
                pendingByType[task.type]++;
            }
        }
        
        return {
            pendingTasks: this.getTotalPendingTasks(),
            executedTasks: this.executedTasks.length,
            failedTasks: this.failedTasks.length,
            pendingByType,
            executedByType: this.getTaskCountByType(this.executedTasks),
            failedByType: this.getTaskCountByType(this.failedTasks),
            dataIds: Array.from(this.cleanupTasks.keys()),
            autoCleanupEnabled: this.config.autoCleanup
        };
    }

    private getTaskCountByType(tasks: CleanupTask[]): Record<CleanupStrategy, number> {
        const counts: Record<CleanupStrategy, number> = {
            database: 0,
            api: 0,
            file: 0,
            cache: 0,
            custom: 0
        };
        
        for (const task of tasks) {
            counts[task.type]++;
        }
        
        return counts;
    }

    exportCleanupPlan(): Array<{
        dataId: string;
        tasks: Array<{
            id: string;
            type: CleanupStrategy;
            target: string;
            priority: number;
            dataPreview: any;
        }>;
    }> {
        const plan: Array<any> = [];
        
        const entries = Array.from(this.cleanupTasks.entries());
        for (const [dataId, tasks] of entries) {
            plan.push({
                dataId,
                tasks: tasks.map(t => ({
                    id: t.id,
                    type: t.type,
                    target: t.target,
                    priority: t.priority || 0,
                    dataPreview: this.sanitizeDataForExport(t.data)
                }))
            });
        }
        
        return plan;
    }

    private sanitizeDataForExport(data: any): any {
        const sanitized = { ...data };
        
        delete sanitized.password;
        delete sanitized.apiKey;
        delete sanitized.token;
        delete sanitized.credentials;
        
        if (sanitized.handler && typeof sanitized.handler === 'function') {
            sanitized.handler = '[Function]';
        }
        
        return sanitized;
    }

    clear(): void {
        this.cleanupTasks.clear();
        this.executedTasks = [];
        this.failedTasks = [];
        
        logger.info('Cleared all cleanup tasks');
    }

    getFailedTasks(): Array<{
        task: CleanupTask;
        error: string;
    }> {
        return this.failedTasks.map(task => ({
            task: this.sanitizeDataForExport(task) as CleanupTask,
            error: task.error?.message || 'Unknown error'
        }));
    }
}
