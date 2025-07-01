import { BrowserContext, Page } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { CookieManager } from './CookieManager';
import { LocalStorageManager } from './LocalStorageManager';
import { SessionStorageManager } from './SessionStorageManager';
import { FileUtils } from '../utils/FileUtils';
import { 
    StorageSnapshot, 
    StorageExport, 
    StorageSize,
    StorageOptions,
    IndexedDBData,
    StorageQuota
} from './types/storage.types';

export class StorageManager {
    private static instance: StorageManager;
    private cookieManager: CookieManager;
    private localStorageManager: LocalStorageManager;
    private sessionStorageManager: SessionStorageManager;
    private options: StorageOptions;
    
    private storageSnapshotCache = new Map<string, StorageSnapshot>();
    private storageExportCache = new Map<string, StorageExport>();
    private storageSizeCache = new Map<string, { data: StorageSize; timestamp: number }>();

    constructor(options: StorageOptions = {}) {
        this.options = {
            autoBackup: false,
            backupInterval: 300000,
            maxBackups: 10,
            compressBackups: true,
            includeIndexedDB: false,
            ...options
        };

        this.cookieManager = new CookieManager();
        this.localStorageManager = new LocalStorageManager();
        this.sessionStorageManager = new SessionStorageManager();
    }

    async clearAllStorage(context: BrowserContext): Promise<void> {
        const startTime = Date.now();
        
        try {
            ActionLogger.logInfo('Storage operation: clear_all', {
                operation: 'clear_all',
                phase: 'start',
                pages: context.pages().length
            });

            await this.cookieManager.deleteAllCookies(context);
            
            const pages = context.pages();
            for (const page of pages) {
                await this.clearPageStorage(page);
            }

            await this.clearAdditionalStorage(context);

            const duration = Date.now() - startTime;
            ActionLogger.logInfo('Storage operation: clear_all', {
                operation: 'clear_all',
                phase: 'complete',
                duration,
                pagesCleared: pages.length
            });
        } catch (error) {
            logger.error('StorageManager: Failed to clear all storage', error as Error);
            throw error;
        }
    }

    async clearPageStorage(page: Page): Promise<void> {
        try {
            const origin = page.url();
            
            await this.localStorageManager.clear(page);
            
            await this.sessionStorageManager.clear(page);
            
            if (this.options.includeIndexedDB) {
                await this.clearIndexedDB(page);
            }

            ActionLogger.logInfo('Storage operation: clear_page', {
                operation: 'clear_page',
                origin
            });
        } catch (error) {
            logger.error('StorageManager: Failed to clear page storage', error as Error);
            throw error;
        }
    }

    async saveStorageState(context: BrowserContext, path: string): Promise<void> {
        try {
            const storageExport = await this.exportStorage(context);
            
            await FileUtils.ensureDir(path.substring(0, path.lastIndexOf('/')));
            
            let content: string;
            if (this.options.compressBackups) {
                content = this.compressData(JSON.stringify(storageExport));
            } else {
                content = JSON.stringify(storageExport, null, 2);
            }
            
            await FileUtils.writeFile(path, content);
            
            ActionLogger.logInfo('Storage operation: save_state', {
                operation: 'save_state',
                path,
                size: content.length,
                compressed: this.options.compressBackups
            });
        } catch (error) {
            logger.error('StorageManager: Failed to save storage state', error as Error);
            throw error;
        }
    }

    async loadStorageState(context: BrowserContext, path: string): Promise<void> {
        try {
            const content = await FileUtils.readFile(path, 'utf8') as string;
            
            let storageExport: StorageExport;
            try {
                const decompressed = this.decompressData(content);
                storageExport = JSON.parse(decompressed);
            } catch {
                storageExport = JSON.parse(content);
            }
            
            await this.importStorage(context, storageExport);
            
            ActionLogger.logInfo('Storage operation: load_state', {
                operation: 'load_state',
                path,
                version: storageExport.version,
                timestamp: storageExport.timestamp
            });
        } catch (error) {
            logger.error('StorageManager: Failed to load storage state', error as Error);
            throw error;
        }
    }

    async getStorageSnapshot(page: Page): Promise<StorageSnapshot> {
        try {
            const origin = new URL(page.url()).origin;
            
            const cookies = await this.cookieManager.getCookies(page.context(), [page.url()]);
            const localStorage = await this.localStorageManager.getAllItems(page);
            const sessionStorage = await this.sessionStorageManager.getAllItems(page);
            
            let indexedDB: IndexedDBData | undefined;
            if (this.options.includeIndexedDB) {
                indexedDB = await this.getIndexedDBData(page);
            }

            const snapshot: StorageSnapshot = {
                cookies,
                localStorage,
                sessionStorage,
                ...(indexedDB && { indexedDB }),
                origin,
                timestamp: new Date()
            };

            return snapshot;
        } catch (error) {
            logger.error('StorageManager: Failed to get storage snapshot', error as Error);
            throw error;
        }
    }

    async restoreStorageSnapshot(page: Page, snapshot: StorageSnapshot): Promise<void> {
        try {
            const startTime = Date.now();
            
            const currentOrigin = new URL(page.url()).origin;
            if (currentOrigin !== snapshot.origin && snapshot.origin !== '*') {
                logger.warn(`StorageManager: Origin mismatch - ${currentOrigin} vs ${snapshot.origin}`);
            }

            if (snapshot.cookies.length > 0) {
                await this.cookieManager.setCookies(page.context(), snapshot.cookies);
            }

            await this.localStorageManager.importData(page, snapshot.localStorage);

            await this.sessionStorageManager.importData(page, snapshot.sessionStorage);

            if (snapshot.indexedDB && this.options.includeIndexedDB) {
                await this.restoreIndexedDB(page, snapshot.indexedDB);
            }

            const duration = Date.now() - startTime;
            ActionLogger.logInfo('Storage operation: restore_snapshot', {
                operation: 'restore_snapshot',
                origin: snapshot.origin,
                duration,
                itemsRestored: {
                    cookies: snapshot.cookies.length,
                    localStorage: Object.keys(snapshot.localStorage).length,
                    sessionStorage: Object.keys(snapshot.sessionStorage).length
                }
            });
        } catch (error) {
            logger.error('StorageManager: Failed to restore storage snapshot', error as Error);
            throw error;
        }
    }

    async exportStorage(context: BrowserContext): Promise<StorageExport> {
        try {
            const pages = context.pages();
            const snapshots: StorageSnapshot[] = [];
            
            for (const page of pages) {
                try {
                    const snapshot = await this.getStorageSnapshot(page);
                    snapshots.push(snapshot);
                } catch (error) {
                    logger.warn(`StorageManager: Failed to get snapshot for ${page.url()}`, error as Error);
                }
            }

            const storageExport: StorageExport = {
                version: '1.0',
                timestamp: new Date(),
                snapshots,
                metadata: {
                    pagesCount: pages.length,
                    includesIndexedDB: this.options.includeIndexedDB || false
                }
            };

            return storageExport;
        } catch (error) {
            logger.error('StorageManager: Failed to export storage', error as Error);
            throw error;
        }
    }

    async importStorage(context: BrowserContext, data: StorageExport): Promise<void> {
        try {
            if (data.version !== '1.0') {
                logger.warn(`StorageManager: Unsupported export version ${data.version}`);
            }

            await this.clearAllStorage(context);

            for (const snapshot of data.snapshots) {
                let page = context.pages().find(p => {
                    try {
                        return new URL(p.url()).origin === snapshot.origin;
                    } catch {
                        return false;
                    }
                });

                if (!page && snapshot.origin !== '*') {
                    page = await context.newPage();
                    await page.goto(snapshot.origin);
                }

                if (page) {
                    await this.restoreStorageSnapshot(page, snapshot);
                }
            }

            ActionLogger.logInfo('Storage operation: import_complete', {
                operation: 'import_complete',
                snapshotsImported: data.snapshots.length,
                timestamp: data.timestamp
            });
        } catch (error) {
            logger.error('StorageManager: Failed to import storage', error as Error);
            throw error;
        }
    }

    async getStorageSize(page: Page): Promise<StorageSize> {
        try {
            const cookieSize = await this.getCookieSize(page.context(), page.url());
            const localStorageSize = await this.localStorageManager.getSize(page);
            const sessionStorageSize = await this.sessionStorageManager.getSize(page);
            let indexedDBSize = 0;

            if (this.options.includeIndexedDB) {
                indexedDBSize = await this.getIndexedDBSize(page);
            }

            const storageSize: StorageSize = {
                cookies: cookieSize,
                localStorage: localStorageSize,
                sessionStorage: sessionStorageSize,
                indexedDB: indexedDBSize,
                total: cookieSize + localStorageSize + sessionStorageSize + indexedDBSize
            };

            return storageSize;
        } catch (error) {
            logger.error('StorageManager: Failed to get storage size', error as Error);
            throw error;
        }
    }

    async getStorageQuota(page: Page): Promise<StorageQuota> {
        try {
            const quota = await page.evaluate(() => {
                return navigator.storage.estimate();
            });

            return {
                usage: quota.usage || 0,
                quota: quota.quota || 0,
                usageDetails: (quota as any).usageDetails || {}
            };
        } catch (error) {
            logger.error('StorageManager: Failed to get storage quota', error as Error);
            throw error;
        }
    }

    async monitorStorageChanges(
        page: Page, 
        callback: (changes: any) => void
    ): Promise<() => void> {
        await page.addInitScript(() => {
            (window as any).__storageMonitor = {
                originalSetItem: localStorage.setItem.bind(localStorage),
                originalRemoveItem: localStorage.removeItem.bind(localStorage),
                changes: []
            };

            localStorage.setItem = function(key: string, value: string) {
                const oldValue = localStorage.getItem(key);
                (window as any).__storageMonitor.originalSetItem(key, value);
                (window as any).__storageMonitor.changes.push({
                    type: 'localStorage',
                    action: 'set',
                    key,
                    oldValue,
                    newValue: value,
                    timestamp: new Date()
                });
            };

            localStorage.removeItem = function(key: string) {
                const oldValue = localStorage.getItem(key);
                (window as any).__storageMonitor.originalRemoveItem(key);
                (window as any).__storageMonitor.changes.push({
                    type: 'localStorage',
                    action: 'remove',
                    key,
                    oldValue,
                    timestamp: new Date()
                });
            };
        });

        const interval = setInterval(async () => {
            const changes = await page.evaluate(() => {
                const monitor = (window as any).__storageMonitor;
                const changes = monitor ? [...monitor.changes] : [];
                if (monitor) monitor.changes = [];
                return changes;
            });

            if (changes.length > 0) {
                callback(changes);
            }
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }


    private async clearAdditionalStorage(context: BrowserContext): Promise<void> {
        try {
            await context.clearPermissions();
            
        } catch (error) {
            logger.warn('StorageManager: Failed to clear additional storage', error as Error);
        }
    }

    private async clearIndexedDB(page: Page): Promise<void> {
        await page.evaluate(() => {
            return new Promise<void>((resolve) => {
                const deleteReq = indexedDB.deleteDatabase('*');
                deleteReq.onsuccess = () => resolve();
                deleteReq.onerror = () => resolve();
            });
        });
    }

    private async getIndexedDBData(page: Page): Promise<IndexedDBData> {
        return page.evaluate(() => {
            return new Promise<IndexedDBData>((resolve) => {
                const data: IndexedDBData = { databases: [] };
                
                resolve(data);
            });
        });
    }

    private async restoreIndexedDB(_page: Page, _data: IndexedDBData): Promise<void> {
        logger.info('StorageManager: IndexedDB restore not fully implemented');
    }

    private async getIndexedDBSize(page: Page): Promise<number> {
        return page.evaluate(() => {
            return navigator.storage.estimate().then(estimate => {
                return (estimate as any).usageDetails?.indexedDB || 0;
            });
        });
    }

    private async getCookieSize(context: BrowserContext, url: string): Promise<number> {
        const cookies = await this.cookieManager.getCookies(context, [url]);
        return cookies.reduce((total, cookie) => {
            return total + cookie.name.length + cookie.value.length;
        }, 0);
    }

    private compressData(data: string): string {
        return Buffer.from(data).toString('base64');
    }

    private decompressData(data: string): string {
        return Buffer.from(data, 'base64').toString('utf-8');
    }
    
    static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }
    
    clearExpiredItems(): void {
        const snapshotCount = this.storageSnapshotCache.size;
        const exportCount = this.storageExportCache.size;
        const sizeCount = this.storageSizeCache.size;
        
        this.storageSnapshotCache.clear();
        
        this.storageExportCache.clear();
        
        const now = Date.now();
        const expireThreshold = 5 * 60 * 1000;
        
        for (const [key, entry] of this.storageSizeCache.entries()) {
            if (now - entry.timestamp > expireThreshold) {
                this.storageSizeCache.delete(key);
            }
        }
        
        const remainingSizeEntries = this.storageSizeCache.size;
        const expiredSizeEntries = sizeCount - remainingSizeEntries;
        
        ActionLogger.logInfo('Storage manager caches cleared', {
            operation: 'storage_cache_cleanup',
            snapshots: snapshotCount,
            exports: exportCount,
            expiredSizeEntries,
            remainingSizeEntries
        });
    }
    
    limitCacheSizes(): void {
        const MAX_SNAPSHOTS = 100;
        const MAX_EXPORTS = 50;
        const MAX_SIZE_ENTRIES = 200;
        
        if (this.storageSnapshotCache.size > MAX_SNAPSHOTS) {
            const toDelete = this.storageSnapshotCache.size - MAX_SNAPSHOTS;
            const keys = Array.from(this.storageSnapshotCache.keys()).slice(0, toDelete);
            keys.forEach(key => this.storageSnapshotCache.delete(key));
            ActionLogger.logDebug(`Trimmed ${toDelete} old storage snapshots from cache`);
        }
        
        if (this.storageExportCache.size > MAX_EXPORTS) {
            const toDelete = this.storageExportCache.size - MAX_EXPORTS;
            const keys = Array.from(this.storageExportCache.keys()).slice(0, toDelete);
            keys.forEach(key => this.storageExportCache.delete(key));
            ActionLogger.logDebug(`Trimmed ${toDelete} old storage exports from cache`);
        }
        
        if (this.storageSizeCache.size > MAX_SIZE_ENTRIES) {
            const toDelete = this.storageSizeCache.size - MAX_SIZE_ENTRIES;
            const keys = Array.from(this.storageSizeCache.keys()).slice(0, toDelete);
            keys.forEach(key => this.storageSizeCache.delete(key));
            ActionLogger.logDebug(`Trimmed ${toDelete} old storage size entries from cache`);
        }
    }
}
