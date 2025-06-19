// src/steps/ui/StorageSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { StorageManager } from '../../core/storage/StorageManager';
import { CookieManager } from '../../core/storage/CookieManager';
import { LocalStorageManager } from '../../core/storage/LocalStorageManager';
import { SessionStorageManager } from '../../core/storage/SessionStorageManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { Cookie } from '../../core/storage/types/storage.types';
import { DataTable } from '../../bdd/types/bdd.types';

export class StorageSteps extends CSBDDBaseStepDefinition {
    private storageManager: StorageManager;
    private cookieManager: CookieManager;
    private localStorageManager: LocalStorageManager;
    private sessionStorageManager: SessionStorageManager;

    constructor() {
        super();
        this.storageManager = new StorageManager();
        this.cookieManager = new CookieManager();
        this.localStorageManager = new LocalStorageManager();
        this.sessionStorageManager = new SessionStorageManager();
    }

    @CSBDDStepDef('user sets cookie {string} with value {string}')
    @CSBDDStepDef('I set cookie {string} to {string}')
    async setCookie(name: string, value: string): Promise<void> {
        ActionLogger.logInfo('Set cookie', { name, value: this.maskSensitiveValue(name, value), type: 'storage_step' });
        
        try {
            const cookie: Cookie = {
                name,
                value,
                domain: new URL(this.page.url()).hostname,
                path: '/'
            };
            
            await this.cookieManager.setCookie(this.context.getCurrentBrowserContext(), cookie);
            
            ActionLogger.logInfo('Cookie set', { name, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Set cookie failed', error as Error);
            throw new Error(`Failed to set cookie "${name}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets cookies:')
    @CSBDDStepDef('I set the following cookies:')
    async setCookies(dataTable: DataTable): Promise<void> {
        ActionLogger.logInfo('Set multiple cookies', { count: dataTable.hashes().length, type: 'storage_step' });
        
        try {
            const cookies: Cookie[] = dataTable.hashes().map(row => {
                // Ensure required fields are present
                if (!row['name'] || !row['value']) {
                    throw new Error('Cookie must have name and value fields');
                }
                
                const cookie: Cookie = {
                    name: row['name'],
                    value: row['value'],
                    domain: row['domain'] || new URL(this.page.url()).hostname,
                    path: row['path'] || '/'
                };
                
                if (row['expires']) {
                    cookie.expires = new Date(row['expires']).getTime();
                }
                if (row['httpOnly'] !== undefined) {
                    cookie.httpOnly = row['httpOnly'] === 'true';
                }
                if (row['secure'] !== undefined) {
                    cookie.secure = row['secure'] === 'true';
                }
                if (row['sameSite']) {
                    cookie.sameSite = row['sameSite'] as 'Strict' | 'Lax' | 'None';
                }
                
                return cookie;
            });
            
            await this.cookieManager.setCookies(this.context.getCurrentBrowserContext(), cookies);
            
            ActionLogger.logInfo('Cookies set', { count: cookies.length, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Set cookies failed', error as Error);
            throw new Error(`Failed to set cookies: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user deletes cookie {string}')
    @CSBDDStepDef('I delete cookie {string}')
    async deleteCookie(name: string): Promise<void> {
        ActionLogger.logInfo('Delete cookie', { name, type: 'storage_step' });
        
        try {
            await this.cookieManager.deleteCookie(this.context.getCurrentBrowserContext(), name, { url: this.page.url() });
            
            ActionLogger.logInfo('Cookie deleted', { name, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Delete cookie failed', error as Error);
            throw new Error(`Failed to delete cookie "${name}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clears all cookies')
    @CSBDDStepDef('I clear all cookies')
    async clearAllCookies(): Promise<void> {
        ActionLogger.logInfo('Clear all cookies', { type: 'storage_step' });
        
        try {
            await this.cookieManager.deleteAllCookies(this.context.getCurrentBrowserContext());
            
            ActionLogger.logInfo('All cookies cleared', { type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Clear cookies failed', error as Error);
            throw new Error(`Failed to clear all cookies: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets local storage {string} to {string}')
    @CSBDDStepDef('I set local storage item {string} to {string}')
    async setLocalStorageItem(key: string, value: string): Promise<void> {
        ActionLogger.logInfo('Set local storage', { key, value: this.maskSensitiveValue(key, value), type: 'storage_step' });
        
        try {
            await this.localStorageManager.setItem(this.page, key, value);
            
            ActionLogger.logInfo('Local storage set', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Set local storage failed', error as Error);
            throw new Error(`Failed to set local storage "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets local storage {string} to JSON:')
    @CSBDDStepDef('I set local storage {string} to the following JSON:')
    async setLocalStorageJSON(key: string, docString: string): Promise<void> {
        ActionLogger.logInfo('Set local storage JSON', { key, type: 'storage_step' });
        
        try {
            const jsonData = JSON.parse(docString);
            await this.localStorageManager.setJSON(this.page, key, jsonData);
            
            ActionLogger.logInfo('Local storage JSON set', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Set local storage JSON failed', error as Error);
            throw new Error(`Failed to set local storage JSON "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user removes local storage {string}')
    @CSBDDStepDef('I remove local storage item {string}')
    async removeLocalStorageItem(key: string): Promise<void> {
        ActionLogger.logInfo('Remove local storage', { key, type: 'storage_step' });
        
        try {
            await this.localStorageManager.removeItem(this.page, key);
            
            ActionLogger.logInfo('Local storage removed', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Remove local storage failed', error as Error);
            throw new Error(`Failed to remove local storage "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clears local storage')
    @CSBDDStepDef('I clear local storage')
    async clearLocalStorage(): Promise<void> {
        ActionLogger.logInfo('Clear local storage', { type: 'storage_step' });
        
        try {
            await this.localStorageManager.clear(this.page);
            
            ActionLogger.logInfo('Local storage cleared', { type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Clear local storage failed', error as Error);
            throw new Error(`Failed to clear local storage: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets session storage {string} to {string}')
    @CSBDDStepDef('I set session storage item {string} to {string}')
    async setSessionStorageItem(key: string, value: string): Promise<void> {
        ActionLogger.logInfo('Set session storage', { key, value: this.maskSensitiveValue(key, value), type: 'storage_step' });
        
        try {
            await this.sessionStorageManager.setItem(this.page, key, value);
            
            ActionLogger.logInfo('Session storage set', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Set session storage failed', error as Error);
            throw new Error(`Failed to set session storage "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user sets session storage {string} to JSON:')
    @CSBDDStepDef('I set session storage {string} to the following JSON:')
    async setSessionStorageJSON(key: string, docString: string): Promise<void> {
        ActionLogger.logInfo('Set session storage JSON', { key, type: 'storage_step' });
        
        try {
            const jsonData = JSON.parse(docString);
            await this.sessionStorageManager.setJSON(this.page, key, jsonData);
            
            ActionLogger.logInfo('Session storage JSON set', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Set session storage JSON failed', error as Error);
            throw new Error(`Failed to set session storage JSON "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user removes session storage {string}')
    @CSBDDStepDef('I remove session storage item {string}')
    async removeSessionStorageItem(key: string): Promise<void> {
        ActionLogger.logInfo('Remove session storage', { key, type: 'storage_step' });
        
        try {
            await this.sessionStorageManager.removeItem(this.page, key);
            
            ActionLogger.logInfo('Session storage removed', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Remove session storage failed', error as Error);
            throw new Error(`Failed to remove session storage "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clears session storage')
    @CSBDDStepDef('I clear session storage')
    async clearSessionStorage(): Promise<void> {
        ActionLogger.logInfo('Clear session storage', { type: 'storage_step' });
        
        try {
            await this.sessionStorageManager.clear(this.page);
            
            ActionLogger.logInfo('Session storage cleared', { type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Clear session storage failed', error as Error);
            throw new Error(`Failed to clear session storage: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clears all storage')
    @CSBDDStepDef('I clear all browser storage')
    async clearAllStorage(): Promise<void> {
        ActionLogger.logInfo('Clear all storage', { type: 'storage_step' });
        
        try {
            await this.storageManager.clearAllStorage(this.context.getCurrentBrowserContext());
            
            ActionLogger.logInfo('All storage cleared', { type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Clear all storage failed', error as Error);
            throw new Error(`Failed to clear all storage: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user saves storage state to {string}')
    @CSBDDStepDef('I save browser storage to {string}')
    async saveStorageState(fileName: string): Promise<void> {
        ActionLogger.logInfo('Save storage state', { fileName, type: 'storage_step' });
        
        try {
            const filePath = this.resolveStoragePath(fileName);
            await this.storageManager.saveStorageState(this.context.getCurrentBrowserContext(), filePath);
            
            ActionLogger.logInfo('Storage state saved', { path: filePath, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Save storage state failed', error as Error);
            throw new Error(`Failed to save storage state: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user loads storage state from {string}')
    @CSBDDStepDef('I load browser storage from {string}')
    async loadStorageState(fileName: string): Promise<void> {
        ActionLogger.logInfo('Load storage state', { fileName, type: 'storage_step' });
        
        try {
            const filePath = this.resolveStoragePath(fileName);
            await this.storageManager.loadStorageState(this.context.getCurrentBrowserContext(), filePath);
            
            ActionLogger.logInfo('Storage state loaded', { path: filePath, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Load storage state failed', error as Error);
            throw new Error(`Failed to load storage state: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('cookie {string} should exist')
    @CSBDDStepDef('the cookie {string} should be present')
    async assertCookieExists(name: string): Promise<void> {
        ActionLogger.logInfo('Assert cookie exists', { name, type: 'storage_step' });
        
        try {
            const exists = await this.cookieManager.hasCookie(this.context.getCurrentBrowserContext(), name);
            
            if (!exists) {
                throw new Error(`Cookie "${name}" does not exist`);
            }
            
            ActionLogger.logInfo('Cookie exists', { name, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Cookie assertion failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('cookie {string} should have value {string}')
    @CSBDDStepDef('the value of cookie {string} should be {string}')
    async assertCookieValue(name: string, expectedValue: string): Promise<void> {
        ActionLogger.logInfo('Assert cookie value', { name, expectedValue, type: 'storage_step' });
        
        try {
            const cookie = await this.cookieManager.getCookie(this.context.getCurrentBrowserContext(), name, this.page.url());
            
            if (!cookie) {
                throw new Error(`Cookie "${name}" not found`);
            }
            
            if (cookie.value !== expectedValue) {
                throw new Error(`Cookie value mismatch. Expected: "${expectedValue}", Actual: "${cookie.value}"`);
            }
            
            ActionLogger.logInfo('Cookie value assertion passed', { name, expectedValue, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Cookie value assertion failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('local storage {string} should exist')
    @CSBDDStepDef('local storage item {string} should be present')
    async assertLocalStorageExists(key: string): Promise<void> {
        ActionLogger.logInfo('Assert local storage exists', { key, type: 'storage_step' });
        
        try {
            const exists = await this.localStorageManager.hasItem(this.page, key);
            
            if (!exists) {
                throw new Error(`Local storage item "${key}" does not exist`);
            }
            
            ActionLogger.logInfo('Local storage exists', { key, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Local storage assertion failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('local storage {string} should have value {string}')
    @CSBDDStepDef('the value of local storage {string} should be {string}')
    async assertLocalStorageValue(key: string, expectedValue: string): Promise<void> {
        ActionLogger.logInfo('Assert local storage value', { key, expectedValue, type: 'storage_step' });
        
        try {
            const actualValue = await this.localStorageManager.getItem(this.page, key);
            
            if (actualValue === null) {
                throw new Error(`Local storage item "${key}" not found`);
            }
            
            if (actualValue !== expectedValue) {
                throw new Error(`Local storage value mismatch. Expected: "${expectedValue}", Actual: "${actualValue}"`);
            }
            
            ActionLogger.logInfo('Local storage value assertion passed', { key, expectedValue, type: 'storage_success' });
        } catch (error) {
            ActionLogger.logError('Local storage value assertion failed', error as Error);
            throw error;
        }
    }

    @CSBDDStepDef('the storage size should be less than {int} KB')
    async assertStorageSize(maxSizeKB: number): Promise<void> {
        ActionLogger.logInfo('Assert storage size', { maxSizeKB, type: 'storage_step' });
        
        try {
            const storageSize = await this.storageManager.getStorageSize(this.page);
            const totalSizeKB = storageSize.total / 1024;
            
            if (totalSizeKB > maxSizeKB) {
                throw new Error(`Storage size ${totalSizeKB.toFixed(2)} KB exceeds limit of ${maxSizeKB} KB`);
            }
            
            ActionLogger.logInfo('Storage size assertion passed', { 
                actualSize: `${totalSizeKB.toFixed(2)} KB`,
                maxSize: `${maxSizeKB} KB`,
                type: 'storage_success'
            });
        } catch (error) {
            ActionLogger.logError('Storage size assertion failed', error as Error);
            throw error;
        }
    }

    private maskSensitiveValue(key: string, value: string): string {
        const sensitiveKeys = ConfigurationManager.getArray('SENSITIVE_STORAGE_KEYS', [
            'token', 'session', 'auth', 'password', 'secret'
        ].join(','));
        
        const isSensitive = sensitiveKeys.some(sensitive => 
            key.toLowerCase().includes(sensitive.toString().toLowerCase())
        );
        
        return isSensitive ? '***' : value;
    }

    private resolveStoragePath(fileName: string): string {
        const path = require('path');
        const storageDir = ConfigurationManager.get('STORAGE_STATE_DIR', './test-data/storage');
        
        if (!fileName.endsWith('.json')) {
            fileName += '.json';
        }
        
        return path.resolve(storageDir, fileName);
    }
}