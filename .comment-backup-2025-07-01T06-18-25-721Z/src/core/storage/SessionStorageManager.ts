import { Page } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { StorageQuota, StorageItemInfo } from './types/storage.types';

/**
 * SessionStorageManager - Complete sessionStorage management
 * Handles all sessionStorage operations (same interface as LocalStorage)
 */
export class SessionStorageManager {
    private readonly STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB typical limit

    /**
     * Set sessionStorage item
     */
    async setItem(page: Page, key: string, value: string): Promise<void> {
        try {
            // Check quota before setting
            await this.checkQuotaBeforeSet(page, key, value);
            
            await page.evaluate(([k, v]) => {
                if (k !== undefined && v !== undefined) {
                    sessionStorage.setItem(k, v);
                }
            }, [key, value] as const);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_set', {
                operation: 'sessionStorage_set',
                key,
                valueLength: value.length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to set item', error as Error);
            throw error;
        }
    }

    /**
     * Set JSON value in sessionStorage
     */
    async setJSON(page: Page, key: string, value: any): Promise<void> {
        try {
            const jsonString = JSON.stringify(value);
            await this.setItem(page, key, jsonString);
        } catch (error) {
            logger.error('SessionStorageManager: Failed to set JSON', error as Error);
            throw error;
        }
    }

    /**
     * Get sessionStorage item
     */
    async getItem(page: Page, key: string): Promise<string | null> {
        try {
            const value = await page.evaluate((k) => {
                return sessionStorage.getItem(k);
            }, key);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_get', {
                operation: 'sessionStorage_get',
                key,
                found: value !== null,
                origin: page.url()
            });
            
            return value;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get item', error as Error);
            throw error;
        }
    }

    /**
     * Get JSON value from sessionStorage
     */
    async getJSON(page: Page, key: string): Promise<any> {
        try {
            const value = await this.getItem(page, key);
            
            if (value === null) {
                return null;
            }
            
            try {
                return JSON.parse(value);
            } catch (parseError) {
                logger.warn(`SessionStorageManager: Failed to parse JSON for key '${key}'`);
                return value; // Return as string if not valid JSON
            }
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get JSON', error as Error);
            throw error;
        }
    }

    /**
     * Remove sessionStorage item
     */
    async removeItem(page: Page, key: string): Promise<void> {
        try {
            await page.evaluate((k) => {
                sessionStorage.removeItem(k);
            }, key);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_remove', {
                operation: 'sessionStorage_remove',
                key,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to remove item', error as Error);
            throw error;
        }
    }

    /**
     * Clear all sessionStorage
     */
    async clear(page: Page): Promise<void> {
        try {
            const itemCount = await this.getItemCount(page);
            
            await page.evaluate(() => {
                sessionStorage.clear();
            });
            
            ActionLogger.logInfo('Storage operation: sessionStorage_clear', {
                operation: 'sessionStorage_clear',
                itemsCleared: itemCount,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to clear', error as Error);
            throw error;
        }
    }

    /**
     * Get all sessionStorage items
     */
    async getAllItems(page: Page): Promise<Record<string, string>> {
        try {
            const items = await page.evaluate(() => {
                const result: Record<string, string> = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key) {
                        result[key] = sessionStorage.getItem(key) || '';
                    }
                }
                return result;
            });
            
            ActionLogger.logInfo('Storage operation: sessionStorage_get_all', {
                operation: 'sessionStorage_get_all',
                itemCount: Object.keys(items).length,
                origin: page.url()
            });
            
            return items;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get all items', error as Error);
            throw error;
        }
    }

    /**
     * Get all sessionStorage keys
     */
    async getKeys(page: Page): Promise<string[]> {
        try {
            const keys = await page.evaluate(() => {
                const keys: string[] = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key) keys.push(key);
                }
                return keys;
            });
            
            return keys;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get keys', error as Error);
            throw error;
        }
    }

    /**
     * Get sessionStorage size in bytes
     */
    async getSize(page: Page): Promise<number> {
        try {
            const size = await page.evaluate(() => {
                let totalSize = 0;
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key) {
                        const value = sessionStorage.getItem(key) || '';
                        totalSize += key.length + value.length;
                    }
                }
                return totalSize;
            });
            
            return size;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get size', error as Error);
            throw error;
        }
    }

    /**
     * Check if sessionStorage has item
     */
    async hasItem(page: Page, key: string): Promise<boolean> {
        try {
            const value = await this.getItem(page, key);
            return value !== null;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to check item', error as Error);
            throw error;
        }
    }

    /**
     * Export sessionStorage data
     */
    async exportData(page: Page): Promise<Record<string, string>> {
        try {
            const data = await this.getAllItems(page);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_export', {
                operation: 'sessionStorage_export',
                itemCount: Object.keys(data).length,
                size: JSON.stringify(data).length,
                origin: page.url()
            });
            
            return data;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to export data', error as Error);
            throw error;
        }
    }

    /**
     * Import sessionStorage data
     */
    async importData(page: Page, data: Record<string, string>): Promise<void> {
        try {
            // Clear existing data
            await this.clear(page);
            
            // Import new data
            await page.evaluate((items) => {
                Object.entries(items).forEach(([key, value]) => {
                    sessionStorage.setItem(key, value);
                });
            }, data);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_import', {
                operation: 'sessionStorage_import',
                itemCount: Object.keys(data).length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to import data', error as Error);
            throw error;
        }
    }

    /**
     * Get storage quota information
     */
    async getQuota(page: Page): Promise<StorageQuota> {
        try {
            const currentSize = await this.getSize(page);
            const percentUsed = (currentSize / this.STORAGE_LIMIT) * 100;
            
            const quota: StorageQuota = {
                usage: currentSize,
                quota: this.STORAGE_LIMIT,
                usageDetails: {
                    sessionStorage: currentSize
                }
            };
            
            if (percentUsed > 80) {
                logger.warn(`SessionStorageManager: High usage - ${percentUsed.toFixed(1)}% of quota used`);
            }
            
            return quota;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get quota', error as Error);
            throw error;
        }
    }

    /**
     * Set multiple items
     */
    async setItems(page: Page, items: Record<string, string>): Promise<void> {
        try {
            // Check total size first
            const totalSize = Object.entries(items).reduce(
                (sum, [key, value]) => sum + key.length + value.length, 
                0
            );
            
            const currentSize = await this.getSize(page);
            if (currentSize + totalSize > this.STORAGE_LIMIT) {
                throw new Error(`Storage quota would be exceeded. Current: ${currentSize}, Adding: ${totalSize}, Limit: ${this.STORAGE_LIMIT}`);
            }
            
            await page.evaluate((items) => {
                Object.entries(items).forEach(([key, value]) => {
                    sessionStorage.setItem(key, value);
                });
            }, items);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_set_multiple', {
                operation: 'sessionStorage_set_multiple',
                itemCount: Object.keys(items).length,
                totalSize,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to set multiple items', error as Error);
            throw error;
        }
    }

    /**
     * Remove multiple items
     */
    async removeItems(page: Page, keys: string[]): Promise<void> {
        try {
            await page.evaluate((keys) => {
                keys.forEach(key => sessionStorage.removeItem(key));
            }, keys);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_remove_multiple', {
                operation: 'sessionStorage_remove_multiple',
                itemCount: keys.length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to remove multiple items', error as Error);
            throw error;
        }
    }

    /**
     * Get item info (size, type, etc.)
     */
    async getItemInfo(page: Page, key: string): Promise<StorageItemInfo | null> {
        try {
            const value = await this.getItem(page, key);
            
            if (value === null) {
                return null;
            }
            
            let type: 'string' | 'json' | 'number' | 'boolean' = 'string';
            let parsed: any = value;
            
            // Try to determine type
            try {
                parsed = JSON.parse(value);
                if (typeof parsed === 'object') {
                    type = 'json';
                } else if (typeof parsed === 'number') {
                    type = 'number';
                } else if (typeof parsed === 'boolean') {
                    type = 'boolean';
                }
            } catch {
                // Not JSON, keep as string
            }
            
            const info: StorageItemInfo = {
                key,
                value,
                size: key.length + value.length,
                type,
                lastModified: new Date() // sessionStorage doesn't track this
            };
            
            return info;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to get item info', error as Error);
            throw error;
        }
    }

    /**
     * Search items by key pattern
     */
    async searchItems(page: Page, pattern: string | RegExp): Promise<Record<string, string>> {
        try {
            const allItems = await this.getAllItems(page);
            const results: Record<string, string> = {};
            
            const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
            
            Object.entries(allItems).forEach(([key, value]) => {
                if (regex.test(key)) {
                    results[key] = value;
                }
            });
            
            return results;
        } catch (error) {
            logger.error('SessionStorageManager: Failed to search items', error as Error);
            throw error;
        }
    }

    /**
     * Transfer sessionStorage to localStorage
     */
    async transferToLocalStorage(page: Page): Promise<void> {
        try {
            const items = await this.getAllItems(page);
            
            await page.evaluate((items) => {
                Object.entries(items).forEach(([key, value]) => {
                    localStorage.setItem(key, value);
                });
            }, items);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_transfer_to_local', {
                operation: 'sessionStorage_transfer_to_local',
                itemCount: Object.keys(items).length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to transfer to localStorage', error as Error);
            throw error;
        }
    }

    /**
     * Copy sessionStorage from one tab to another
     */
    async copyToPage(sourcePage: Page, targetPage: Page): Promise<void> {
        try {
            const items = await this.getAllItems(sourcePage);
            await this.importData(targetPage, items);
            
            ActionLogger.logInfo('Storage operation: sessionStorage_copy_to_page', {
                operation: 'sessionStorage_copy_to_page',
                itemCount: Object.keys(items).length,
                sourceUrl: sourcePage.url(),
                targetUrl: targetPage.url()
            });
        } catch (error) {
            logger.error('SessionStorageManager: Failed to copy to page', error as Error);
            throw error;
        }
    }

    /**
     * Monitor sessionStorage changes
     */
    async monitorChanges(
        page: Page, 
        callback: (event: any) => void
    ): Promise<() => void> {
        // Inject monitoring script
        await page.addInitScript(() => {
            const originalSetItem = sessionStorage.setItem.bind(sessionStorage);
            const originalRemoveItem = sessionStorage.removeItem.bind(sessionStorage);
            const originalClear = sessionStorage.clear.bind(sessionStorage);
            
            sessionStorage.setItem = function(key: string, value: string) {
                const oldValue = sessionStorage.getItem(key);
                originalSetItem(key, value);
                window.dispatchEvent(new CustomEvent('sessionStorageChange', {
                    detail: { action: 'set', key, oldValue, newValue: value }
                }));
            };
            
            sessionStorage.removeItem = function(key: string) {
                const oldValue = sessionStorage.getItem(key);
                originalRemoveItem(key);
                window.dispatchEvent(new CustomEvent('sessionStorageChange', {
                    detail: { action: 'remove', key, oldValue }
                }));
            };
            
            sessionStorage.clear = function() {
                const items: Record<string, string> = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key) {
                        items[key] = sessionStorage.getItem(key) || '';
                    }
                }
                originalClear();
                window.dispatchEvent(new CustomEvent('sessionStorageChange', {
                    detail: { action: 'clear', items }
                }));
            };
        });
        
        // Listen for changes
        await page.exposeFunction('onSessionStorageChange', callback);
        await page.evaluate(() => {
            window.addEventListener('sessionStorageChange', (event: any) => {
                (window as any).onSessionStorageChange(event.detail);
            });
        });
        
        // Return cleanup function
        return async () => {
            await page.evaluate(() => {
                window.removeEventListener('sessionStorageChange', () => {});
            });
        };
    }

    // Private helper methods

    private async checkQuotaBeforeSet(page: Page, key: string, value: string): Promise<void> {
        const currentSize = await this.getSize(page);
        const newItemSize = key.length + value.length;
        
        // Check if key exists (for replacement)
        const existingValue = await this.getItem(page, key);
        const existingSize = existingValue ? key.length + existingValue.length : 0;
        
        const projectedSize = currentSize - existingSize + newItemSize;
        
        if (projectedSize > this.STORAGE_LIMIT) {
            throw new Error(
                `sessionStorage quota would be exceeded. ` +
                `Current: ${currentSize} bytes, ` +
                `Adding: ${newItemSize} bytes, ` +
                `Limit: ${this.STORAGE_LIMIT} bytes`
            );
        }
    }

    private async getItemCount(page: Page): Promise<number> {
        return page.evaluate(() => sessionStorage.length);
    }
}