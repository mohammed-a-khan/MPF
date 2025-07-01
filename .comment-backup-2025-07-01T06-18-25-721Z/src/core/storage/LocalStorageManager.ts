import { Page } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { StorageQuota, StorageItemInfo } from './types/storage.types';

/**
 * LocalStorageManager - Complete localStorage management
 * Handles all localStorage operations with quota monitoring
 */
export class LocalStorageManager {
    private readonly STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB typical limit

    /**
     * Set localStorage item
     */
    async setItem(page: Page, key: string, value: string): Promise<void> {
        try {
            // Check quota before setting
            await this.checkQuotaBeforeSet(page, key, value);
            
            await page.evaluate(([k, v]) => {
                if (k !== undefined && v !== undefined) {
                    localStorage.setItem(k, v);
                }
            }, [key, value] as const);
            
            ActionLogger.logInfo('Storage operation: localStorage_set', {
                operation: 'localStorage_set',
                key,
                valueLength: value.length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('LocalStorageManager: Failed to set item', error as Error);
            throw error;
        }
    }

    /**
     * Set JSON value in localStorage
     */
    async setJSON(page: Page, key: string, value: any): Promise<void> {
        try {
            const jsonString = JSON.stringify(value);
            await this.setItem(page, key, jsonString);
        } catch (error) {
            logger.error('LocalStorageManager: Failed to set JSON', error as Error);
            throw error;
        }
    }

    /**
     * Get localStorage item
     */
    async getItem(page: Page, key: string): Promise<string | null> {
        try {
            const value = await page.evaluate((k) => {
                return localStorage.getItem(k);
            }, key);
            
            ActionLogger.logInfo('Storage operation: localStorage_get', {
                operation: 'localStorage_get',
                key,
                found: value !== null,
                origin: page.url()
            });
            
            return value;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get item', error as Error);
            throw error;
        }
    }

    /**
     * Get JSON value from localStorage
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
                logger.warn(`LocalStorageManager: Failed to parse JSON for key '${key}'`);
                return value; // Return as string if not valid JSON
            }
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get JSON', error as Error);
            throw error;
        }
    }

    /**
     * Remove localStorage item
     */
    async removeItem(page: Page, key: string): Promise<void> {
        try {
            await page.evaluate((k) => {
                localStorage.removeItem(k);
            }, key);
            
            ActionLogger.logInfo('Storage operation: localStorage_remove', {
                operation: 'localStorage_remove',
                key,
                origin: page.url()
            });
        } catch (error) {
            logger.error('LocalStorageManager: Failed to remove item', error as Error);
            throw error;
        }
    }

    /**
     * Clear all localStorage
     */
    async clear(page: Page): Promise<void> {
        try {
            const itemCount = await this.getItemCount(page);
            
            await page.evaluate(() => {
                localStorage.clear();
            });
            
            ActionLogger.logInfo('Storage operation: localStorage_clear', {
                operation: 'localStorage_clear',
                itemsCleared: itemCount,
                origin: page.url()
            });
        } catch (error) {
            logger.error('LocalStorageManager: Failed to clear', error as Error);
            throw error;
        }
    }

    /**
     * Get all localStorage items
     */
    async getAllItems(page: Page): Promise<Record<string, string>> {
        try {
            const items = await page.evaluate(() => {
                const result: Record<string, string> = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        result[key] = localStorage.getItem(key) || '';
                    }
                }
                return result;
            });
            
            ActionLogger.logInfo('Storage operation: localStorage_get_all', {
                operation: 'localStorage_get_all',
                itemCount: Object.keys(items).length,
                origin: page.url()
            });
            
            return items;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get all items', error as Error);
            throw error;
        }
    }

    /**
     * Get all localStorage keys
     */
    async getKeys(page: Page): Promise<string[]> {
        try {
            const keys = await page.evaluate(() => {
                const keys: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) keys.push(key);
                }
                return keys;
            });
            
            return keys;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get keys', error as Error);
            throw error;
        }
    }

    /**
     * Get localStorage size in bytes
     */
    async getSize(page: Page): Promise<number> {
        try {
            const size = await page.evaluate(() => {
                let totalSize = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        const value = localStorage.getItem(key) || '';
                        totalSize += key.length + value.length;
                    }
                }
                return totalSize;
            });
            
            return size;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get size', error as Error);
            throw error;
        }
    }

    /**
     * Check if localStorage has item
     */
    async hasItem(page: Page, key: string): Promise<boolean> {
        try {
            const value = await this.getItem(page, key);
            return value !== null;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to check item', error as Error);
            throw error;
        }
    }

    /**
     * Export localStorage data
     */
    async exportData(page: Page): Promise<Record<string, string>> {
        try {
            const data = await this.getAllItems(page);
            
            ActionLogger.logInfo('Storage operation: localStorage_export', {
                operation: 'localStorage_export',
                itemCount: Object.keys(data).length,
                size: JSON.stringify(data).length,
                origin: page.url()
            });
            
            return data;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to export data', error as Error);
            throw error;
        }
    }

    /**
     * Import localStorage data
     */
    async importData(page: Page, data: Record<string, string>): Promise<void> {
        try {
            // Clear existing data
            await this.clear(page);
            
            // Import new data
            await page.evaluate((items) => {
                Object.entries(items).forEach(([key, value]) => {
                    localStorage.setItem(key, value);
                });
            }, data);
            
            ActionLogger.logInfo('Storage operation: localStorage_import', {
                operation: 'localStorage_import',
                itemCount: Object.keys(data).length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('LocalStorageManager: Failed to import data', error as Error);
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
                    localStorage: currentSize
                }
            };
            
            if (percentUsed > 80) {
                logger.warn(`LocalStorageManager: High usage - ${percentUsed.toFixed(1)}% of quota used`);
            }
            
            return quota;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get quota', error as Error);
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
                    localStorage.setItem(key, value);
                });
            }, items);
            
            ActionLogger.logInfo('Storage operation: localStorage_set_multiple', {
                operation: 'localStorage_set_multiple',
                itemCount: Object.keys(items).length,
                totalSize,
                origin: page.url()
            });
        } catch (error) {
            logger.error('LocalStorageManager: Failed to set multiple items', error as Error);
            throw error;
        }
    }

    /**
     * Remove multiple items
     */
    async removeItems(page: Page, keys: string[]): Promise<void> {
        try {
            await page.evaluate((keys) => {
                keys.forEach(key => localStorage.removeItem(key));
            }, keys);
            
            ActionLogger.logInfo('Storage operation: localStorage_remove_multiple', {
                operation: 'localStorage_remove_multiple',
                itemCount: keys.length,
                origin: page.url()
            });
        } catch (error) {
            logger.error('LocalStorageManager: Failed to remove multiple items', error as Error);
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
                lastModified: new Date() // localStorage doesn't track this
            };
            
            return info;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get item info', error as Error);
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
            logger.error('LocalStorageManager: Failed to search items', error as Error);
            throw error;
        }
    }

    /**
     * Monitor localStorage changes
     */
    async monitorChanges(
        page: Page, 
        callback: (event: any) => void
    ): Promise<() => void> {
        // Inject monitoring script
        await page.addInitScript(() => {
            const originalSetItem = localStorage.setItem.bind(localStorage);
            const originalRemoveItem = localStorage.removeItem.bind(localStorage);
            const originalClear = localStorage.clear.bind(localStorage);
            
            localStorage.setItem = function(key: string, value: string) {
                const oldValue = localStorage.getItem(key);
                originalSetItem(key, value);
                window.dispatchEvent(new CustomEvent('localStorageChange', {
                    detail: { action: 'set', key, oldValue, newValue: value }
                }));
            };
            
            localStorage.removeItem = function(key: string) {
                const oldValue = localStorage.getItem(key);
                originalRemoveItem(key);
                window.dispatchEvent(new CustomEvent('localStorageChange', {
                    detail: { action: 'remove', key, oldValue }
                }));
            };
            
            localStorage.clear = function() {
                const items: Record<string, string> = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        items[key] = localStorage.getItem(key) || '';
                    }
                }
                originalClear();
                window.dispatchEvent(new CustomEvent('localStorageChange', {
                    detail: { action: 'clear', items }
                }));
            };
        });
        
        // Listen for changes
        await page.exposeFunction('onLocalStorageChange', callback);
        await page.evaluate(() => {
            window.addEventListener('localStorageChange', (event: any) => {
                (window as any).onLocalStorageChange(event.detail);
            });
        });
        
        // Return cleanup function
        return async () => {
            await page.evaluate(() => {
                window.removeEventListener('localStorageChange', () => {});
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
                `localStorage quota would be exceeded. ` +
                `Current: ${currentSize} bytes, ` +
                `Adding: ${newItemSize} bytes, ` +
                `Limit: ${this.STORAGE_LIMIT} bytes`
            );
        }
    }

    private async getItemCount(page: Page): Promise<number> {
        return page.evaluate(() => localStorage.length);
    }
}