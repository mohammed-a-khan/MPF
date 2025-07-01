// src/data/provider/DataCache.ts

import { TestData, CacheEntry, CacheStatistics } from '../types/data.types';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as crypto from 'crypto';

export class DataCache {
    private static instance: DataCache;
    private cache: Map<string, CacheEntry<TestData[]>>;
    private accessOrder: string[] = [];
    private maxSize: number;
    private hits: number = 0;
    private misses: number = 0;
    private evictions: number = 0;

    private constructor() {
        this.cache = new Map();
        this.maxSize = parseInt(process.env['DATA_CACHE_MAX_SIZE'] || '100');
        this.startCleanupTimer();
        
        logger.debug(`DataCache initialized with max size: ${this.maxSize}`);
    }

    static getInstance(): DataCache {
        if (!DataCache.instance) {
            DataCache.instance = new DataCache();
        }
        return DataCache.instance;
    }

    get(key: string): TestData[] | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.misses++;
            ActionLogger.logInfo('Cache operation: miss', { operation: 'cache_miss', key });
            return null;
        }
        
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            this.removeFromAccessOrder(key);
            this.misses++;
            ActionLogger.logInfo('Cache operation: expired', { operation: 'cache_expired', key });
            return null;
        }
        
        this.updateAccessOrder(key);
        this.hits++;
        entry.lastAccessed = Date.now();
        entry.accessCount++;
        
        ActionLogger.logInfo('Cache operation: hit', { 
            operation: 'cache_hit',
            key, 
            size: entry.data.length,
            accessCount: entry.accessCount 
        });
        
        return entry.data;
    }

    set(key: string, data: TestData[], ttl?: number): void {
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }
        
        const entry: CacheEntry<TestData[]> = {
            data,
            timestamp: Date.now(),
            ttl: ttl || 3600000,
            lastAccessed: Date.now(),
            accessCount: 0,
            size: this.calculateSize(data)
        };
        
        this.cache.set(key, entry);
        this.updateAccessOrder(key);
        
        ActionLogger.logInfo('Cache operation: set', { 
            operation: 'cache_set',
            key, 
            size: data.length,
            ttl: entry.ttl,
            cacheSize: this.cache.size
        });
    }

    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            this.removeFromAccessOrder(key);
            return false;
        }
        
        return true;
    }

    delete(key: string): boolean {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.removeFromAccessOrder(key);
            ActionLogger.logInfo('Cache operation: delete', { operation: 'cache_delete', key });
        }
        return deleted;
    }

    clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.accessOrder = [];
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        
        ActionLogger.logInfo('Cache operation: clear', { operation: 'cache_clear', clearedEntries: size });
    }

    clearPattern(pattern: string): void {
        const regex = new RegExp(pattern);
        const keysToDelete: string[] = [];
        
        const keys = Array.from(this.cache.keys());
        for (const key of keys) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.delete(key);
        }
        
        ActionLogger.logInfo('Cache operation: clear_pattern', { 
            operation: 'cache_clear_pattern',
            pattern, 
            deletedCount: keysToDelete.length 
        });
    }

    getStatistics(): CacheStatistics {
        const validEntries = this.getValidEntries();
        
        return {
            size: validEntries.length,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: this.hits + this.misses > 0 
                ? this.hits / (this.hits + this.misses) 
                : 0,
            evictions: this.evictions,
            totalSize: this.calculateTotalSize(),
            oldestEntry: this.getOldestEntry(),
            newestEntry: this.getNewestEntry(),
            mostAccessed: this.getMostAccessedEntry()
        };
    }

    getKeys(): string[] {
        return this.getValidEntries().map(([key]) => key);
    }

    warmUp(entries: Array<{ key: string; data: TestData[]; ttl?: number }>): void {
        for (const { key, data, ttl } of entries) {
            this.set(key, data, ttl);
        }
        
        ActionLogger.logInfo('Cache operation: warm_up', { 
            operation: 'cache_warm_up',
            entriesLoaded: entries.length 
        });
    }

    static generateKey(options: Record<string, any>): string {
        const normalized = JSON.stringify(options, Object.keys(options).sort());
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    private isExpired(entry: CacheEntry<TestData[]>): boolean {
        return Date.now() - entry.timestamp > entry.ttl;
    }

    private updateAccessOrder(key: string): void {
        this.removeFromAccessOrder(key);
        this.accessOrder.push(key);
    }

    private removeFromAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }

    private evictLRU(): void {
        if (this.accessOrder.length === 0) return;
        
        const keyToEvict = this.accessOrder[0];
        if (keyToEvict) {
            this.cache.delete(keyToEvict);
        }
        this.accessOrder.shift();
        this.evictions++;
        
        ActionLogger.logInfo('Cache operation: evict', { operation: 'cache_evict', key: keyToEvict || 'unknown' });
    }

    private calculateSize(data: TestData[]): number {
        return JSON.stringify(data).length;
    }

    private calculateTotalSize(): number {
        let total = 0;
        const values = Array.from(this.cache.values());
        for (const entry of values) {
            total += entry.size || 0;
        }
        return total;
    }

    private getValidEntries(): Array<[string, CacheEntry<TestData[]>]> {
        const valid: Array<[string, CacheEntry<TestData[]>]> = [];
        
        const entries = Array.from(this.cache.entries());
        for (const [key, entry] of entries) {
            if (!this.isExpired(entry)) {
                valid.push([key, entry]);
            }
        }
        
        return valid;
    }

    private getOldestEntry(): { key: string; age: number } | null {
        let oldest: { key: string; timestamp: number } | null = null;
        
        for (const [key, entry] of this.getValidEntries()) {
            if (!oldest || entry.timestamp < oldest.timestamp) {
                oldest = { key, timestamp: entry.timestamp };
            }
        }
        
        return oldest ? {
            key: oldest.key,
            age: Date.now() - oldest.timestamp
        } : null;
    }

    private getNewestEntry(): { key: string; age: number } | null {
        let newest: { key: string; timestamp: number } | null = null;
        
        for (const [key, entry] of this.getValidEntries()) {
            if (!newest || entry.timestamp > newest.timestamp) {
                newest = { key, timestamp: entry.timestamp };
            }
        }
        
        return newest ? {
            key: newest.key,
            age: Date.now() - newest.timestamp
        } : null;
    }

    private getMostAccessedEntry(): { key: string; count: number } | null {
        let mostAccessed: { key: string; count: number } | null = null;
        
        for (const [key, entry] of this.getValidEntries()) {
            if (!mostAccessed || entry.accessCount > mostAccessed.count) {
                mostAccessed = { key, count: entry.accessCount };
            }
        }
        
        return mostAccessed;
    }

    private startCleanupTimer(): void {
        setInterval(() => {
            this.cleanupExpired();
        }, 60000);
    }

    private cleanupExpired(): void {
        const keysToDelete: string[] = [];
        
        const entries = Array.from(this.cache.entries());
        for (const [key, entry] of entries) {
            if (this.isExpired(entry)) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.cache.delete(key);
            this.removeFromAccessOrder(key);
        }
        
        if (keysToDelete.length > 0) {
            logger.debug(`Cleaned up ${keysToDelete.length} expired cache entries`);
        }
    }

    exportCache(): Array<{ key: string; entry: CacheEntry<TestData[]> }> {
        const exported: Array<{ key: string; entry: CacheEntry<TestData[]> }> = [];
        
        for (const [key, entry] of this.getValidEntries()) {
            exported.push({ key, entry });
        }
        
        return exported;
    }

    importCache(data: Array<{ key: string; entry: CacheEntry<TestData[]> }>): void {
        this.clear();
        
        for (const { key, entry } of data) {
            const age = Date.now() - entry.timestamp;
            const remainingTTL = Math.max(0, entry.ttl - age);
            
            if (remainingTTL > 0) {
                this.cache.set(key, entry);
                this.updateAccessOrder(key);
            }
        }
        
        ActionLogger.logInfo('Cache operation: import', { 
            operation: 'cache_import',
            importedCount: data.length 
        });
    }
}
