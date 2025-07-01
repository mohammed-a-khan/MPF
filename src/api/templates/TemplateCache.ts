import { CacheEntry, CacheStats, CacheOptions } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class TemplateCache {
    private static instance: TemplateCache;
    private cache: Map<string, CacheEntry> = new Map();
    private maxSize: number = 1000;
    private maxMemory: number = 50 * 1024 * 1024;
    private defaultTTL: number = 300000;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        evictions: 0,
        memoryUsage: 0
    };

    private constructor() {
        this.startCleanupTimer();
    }

    public static getInstance(): TemplateCache {
        if (!TemplateCache.instance) {
            TemplateCache.instance = new TemplateCache();
        }
        return TemplateCache.instance;
    }

    public get(key: string): string | null {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        if (this.isExpired(entry)) {
            this.delete(key);
            this.stats.misses++;
            return null;
        }

        entry.lastAccessed = Date.now();
        entry.hitCount++;
        this.stats.hits++;

        ActionLogger.getInstance().debug(`Cache hit: ${key} (hits: ${entry.hitCount})`);
        return entry.value;
    }

    public set(key: string, value: string, ttl?: number): void {
        try {
            const size = this.calculateSize(value);
            
            if (this.wouldExceedMemoryLimit(size)) {
                this.evictEntries(size);
            }

            if (this.cache.size >= this.maxSize) {
                this.evictLRU();
            }

            const entry: CacheEntry = {
                key,
                value,
                size,
                ttl: ttl || this.defaultTTL,
                created: Date.now(),
                lastAccessed: Date.now(),
                hitCount: 0
            };

            const existingEntry = this.cache.get(key);
            if (existingEntry) {
                this.stats.memoryUsage -= existingEntry.size;
            }

            this.cache.set(key, entry);
            this.stats.memoryUsage += size;
            this.stats.sets++;

            ActionLogger.getInstance().debug(`Cache set: ${key} (size: ${size}, ttl: ${entry.ttl}ms)`);

        } catch (error) {
            ActionLogger.getInstance().logError(error as Error, `Failed to cache value for key: ${key}`);
        }
    }

    public delete(key: string): boolean {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }

        this.cache.delete(key);
        this.stats.memoryUsage -= entry.size;
        this.stats.deletes++;

        ActionLogger.getInstance().debug(`Cache delete: ${key}`);
        return true;
    }

    public clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.stats.memoryUsage = 0;
        this.stats.deletes += size;

        ActionLogger.getInstance().info('Template cache cleared');
    }

    public has(key: string): boolean {
        const entry = this.cache.get(key);
        return entry !== undefined && !this.isExpired(entry);
    }

    public keys(): string[] {
        const validKeys: string[] = [];
        
        for (const [key, entry] of this.cache) {
            if (!this.isExpired(entry)) {
                validKeys.push(key);
            }
        }
        
        return validKeys;
    }

    public getStats(): CacheStats {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    public configure(options: CacheOptions): void {
        if (options.maxSize !== undefined) {
            this.maxSize = options.maxSize;
        }
        
        if (options.maxMemory !== undefined) {
            this.maxMemory = options.maxMemory;
        }
        
        if (options.defaultTTL !== undefined) {
            this.defaultTTL = options.defaultTTL;
        }

        if (options.cleanupInterval !== undefined) {
            this.restartCleanupTimer(options.cleanupInterval);
        }

        ActionLogger.getInstance().info('Template cache configured', options);
    }

    public getSizeInfo(): { entries: number; memory: number; maxMemory: number } {
        return {
            entries: this.cache.size,
            memory: this.stats.memoryUsage,
            maxMemory: this.maxMemory
        };
    }

    public cleanup(): number {
        let cleaned = 0;
        const now = Date.now();

        for (const [key, entry] of this.cache) {
            if (this.isExpired(entry, now)) {
                this.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            ActionLogger.getInstance().info(`Cache cleanup: removed ${cleaned} expired entries`);
        }

        return cleaned;
    }

    private isExpired(entry: CacheEntry, now?: number): boolean {
        const currentTime = now || Date.now();
        return currentTime - entry.created > entry.ttl;
    }

    private calculateSize(value: string): number {
        return value.length * 2;
    }

    private wouldExceedMemoryLimit(additionalSize: number): boolean {
        return this.stats.memoryUsage + additionalSize > this.maxMemory;
    }

    private evictEntries(requiredSize: number): void {
        const entries = Array.from(this.cache.values())
            .sort((a, b) => {
                const scoreA = this.calculateEvictionScore(a);
                const scoreB = this.calculateEvictionScore(b);
                return scoreA - scoreB;
            });

        let freedMemory = 0;
        const targetMemory = this.stats.memoryUsage + requiredSize - this.maxMemory;

        for (const entry of entries) {
            if (freedMemory >= targetMemory) {
                break;
            }

            this.delete(entry.key);
            freedMemory += entry.size;
            this.stats.evictions++;
        }

        ActionLogger.getInstance().debug(`Evicted entries to free ${freedMemory} bytes`);
    }

    private evictLRU(): void {
        let lruEntry: CacheEntry | null = null;
        let lruKey: string | null = null;

        for (const [key, entry] of this.cache) {
            if (!lruEntry || entry.lastAccessed < lruEntry.lastAccessed) {
                lruEntry = entry;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.delete(lruKey);
            this.stats.evictions++;
            ActionLogger.getInstance().debug(`Evicted LRU entry: ${lruKey}`);
        }
    }

    private calculateEvictionScore(entry: CacheEntry): number {
        const now = Date.now();
        const age = now - entry.created;
        const timeSinceAccess = now - entry.lastAccessed;
        const remainingTTL = Math.max(0, entry.ttl - age);


        const hitScore = entry.hitCount * 1000;
        const accessScore = 1000000 / (timeSinceAccess + 1);
        const ttlScore = remainingTTL / 100;
        const sizeScore = 10000 / (entry.size + 1);

        return hitScore + accessScore + ttlScore + sizeScore;
    }

    private startCleanupTimer(interval: number = 60000): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, interval);

        process.on('exit', () => {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }
        });
    }

    private restartCleanupTimer(interval: number): void {
        this.startCleanupTimer(interval);
    }

    public export(): Record<string, any> {
        const data: Record<string, any> = {};
        const now = Date.now();

        for (const [key, entry] of this.cache) {
            if (!this.isExpired(entry, now)) {
                data[key] = {
                    value: entry.value,
                    ttl: entry.ttl,
                    created: entry.created,
                    hitCount: entry.hitCount
                };
            }
        }

        return data;
    }

    public import(data: Record<string, any>): void {
        const now = Date.now();

        for (const [key, item] of Object.entries(data)) {
            if (item && typeof item === 'object' && item.value) {
                const age = now - item.created;
                const remainingTTL = item.ttl - age;

                if (remainingTTL > 0) {
                    this.set(key, item.value, remainingTTL);
                }
            }
        }

        ActionLogger.getInstance().info(`Imported ${Object.keys(data).length} cache entries`);
    }

    public getMatching(pattern: string | RegExp): Record<string, string> {
        const result: Record<string, string> = {};
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

        for (const [key, entry] of this.cache) {
            if (regex.test(key) && !this.isExpired(entry)) {
                result[key] = entry.value;
            }
        }

        return result;
    }

    public deleteMatching(pattern: string | RegExp): number {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        const keysToDelete: string[] = [];

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.delete(key);
        }

        if (keysToDelete.length > 0) {
            ActionLogger.getInstance().info(`Deleted ${keysToDelete.length} entries matching pattern: ${pattern}`);
        }

        return keysToDelete.length;
    }

    public touch(key: string): boolean {
        const entry = this.cache.get(key);

        if (!entry || this.isExpired(entry)) {
            return false;
        }

        entry.lastAccessed = Date.now();
        return true;
    }

    public getMetadata(key: string): Omit<CacheEntry, 'value'> | null {
        const entry = this.cache.get(key);

        if (!entry || this.isExpired(entry)) {
            return null;
        }

        return {
            key: entry.key,
            size: entry.size,
            ttl: entry.ttl,
            created: entry.created,
            lastAccessed: entry.lastAccessed,
            hitCount: entry.hitCount
        };
    }

    public resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: this.stats.memoryUsage
        };

        ActionLogger.getInstance().debug('Cache statistics reset');
    }

    public optimize(targetMemoryUsage?: number): number {
        const target = targetMemoryUsage || this.maxMemory * 0.8;
        
        if (this.stats.memoryUsage <= target) {
            return 0;
        }

        const entries = Array.from(this.cache.values())
            .sort((a, b) => {
                const scoreA = this.calculateEvictionScore(a);
                const scoreB = this.calculateEvictionScore(b);
                return scoreA - scoreB;
            });

        let removed = 0;

        for (const entry of entries) {
            if (this.stats.memoryUsage <= target) {
                break;
            }

            this.delete(entry.key);
            removed++;
        }

        ActionLogger.getInstance().info(`Cache optimized: removed ${removed} entries`);
        return removed;
    }

    public async warmUp(templates: Array<{ key: string; value: string; ttl?: number }>): Promise<void> {
        const startTime = Date.now();
        let loaded = 0;

        for (const template of templates) {
            try {
                this.set(template.key, template.value, template.ttl);
                loaded++;
            } catch (error) {
                ActionLogger.getInstance().warn(`Failed to warm up cache entry: ${template.key}`, { error: (error as Error).message });
            }
        }

        const duration = Date.now() - startTime;
        ActionLogger.getInstance().info(`Cache warmed up with ${loaded} entries in ${duration}ms`);
    }

    public getTopEntries(count: number = 10): Array<{ key: string; hitCount: number; size: number }> {
        return Array.from(this.cache.entries())
            .filter(([_, entry]) => !this.isExpired(entry))
            .sort(([_, a], [__, b]) => b.hitCount - a.hitCount)
            .slice(0, count)
            .map(([key, entry]) => ({
                key,
                hitCount: entry.hitCount,
                size: entry.size
            }));
    }

    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.clear();
        
        ActionLogger.getInstance().info('Template cache destroyed');
    }
}
