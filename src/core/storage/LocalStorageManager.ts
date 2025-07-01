import { Page } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { StorageQuota, StorageItemInfo } from './types/storage.types';

export class LocalStorageManager {
    private readonly STORAGE_LIMIT = 5 * 1024 * 1024;

    async setItem(page: Page, key: string, value: string): Promise<void> {
        try {
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

    async setJSON(page: Page, key: string, value: any): Promise<void> {
        try {
            const jsonString = JSON.stringify(value);
            await this.setItem(page, key, jsonString);
        } catch (error) {
            logger.error('LocalStorageManager: Failed to set JSON', error as Error);
            throw error;
        }
    }

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
                return value;
            }
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get JSON', error as Error);
            throw error;
        }
    }

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

    async hasItem(page: Page, key: string): Promise<boolean> {
        try {
            const value = await this.getItem(page, key);
            return value !== null;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to check item', error as Error);
            throw error;
        }
    }

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

    async importData(page: Page, data: Record<string, string>): Promise<void> {
        try {
            await this.clear(page);
            
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

    async setItems(page: Page, items: Record<string, string>): Promise<void> {
        try {
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

    async getItemInfo(page: Page, key: string): Promise<StorageItemInfo | null> {
        try {
            const value = await this.getItem(page, key);
            
            if (value === null) {
                return null;
            }
            
            let type: 'string' | 'json' | 'number' | 'boolean' = 'string';
            let parsed: any = value;
            
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
            }
            
            const info: StorageItemInfo = {
                key,
                value,
                size: key.length + value.length,
                type,
                lastModified: new Date()
            };
            
            return info;
        } catch (error) {
            logger.error('LocalStorageManager: Failed to get item info', error as Error);
            throw error;
        }
    }

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

    async monitorChanges(
        page: Page, 
        callback: (event: any) => void
    ): Promise<() => void> {
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
        
        await page.exposeFunction('onLocalStorageChange', callback);
        await page.evaluate(() => {
            window.addEventListener('localStorageChange', (event: any) => {
                (window as any).onLocalStorageChange(event.detail);
            });
        });
        
        return async () => {
            await page.evaluate(() => {
                window.removeEventListener('localStorageChange', () => {});
            });
        };
    }


    private async checkQuotaBeforeSet(page: Page, key: string, value: string): Promise<void> {
        const currentSize = await this.getSize(page);
        const newItemSize = key.length + value.length;
        
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
