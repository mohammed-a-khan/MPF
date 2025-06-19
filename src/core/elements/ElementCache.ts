// src/core/elements/ElementCache.ts
import { Locator } from 'playwright';
import { CacheStats } from './types/element.types';
import { ActionLogger } from '../logging/ActionLogger';
import { ExtendedCacheStats } from './ExtendedCacheStats';

interface CacheEntry {
  locator: Locator;
  timestamp: number;
  hits: number;
  lastAccessed: number;
  pageUrl: string;
  elementDescription: string;
}

export class ElementCache {
  private static instance: ElementCache;
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number = 1000;
  private readonly defaultTTL: number = 300000; // 5 minutes
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0
  };
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    this.startAutoCleanup();
  }

  static getInstance(): ElementCache {
    if (!ElementCache.instance) {
      ElementCache.instance = new ElementCache();
    }
    return ElementCache.instance;
  }

  set(key: string, locator: Locator): void {
    // Check cache size and evict if necessary
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      locator,
      timestamp: Date.now(),
      hits: 0,
      lastAccessed: Date.now(),
      pageUrl: locator.page().url(),
      elementDescription: key.split('::')[2] || key
    };

    this.cache.set(key, entry);
    ActionLogger.logDebug(`Element cached: ${key.substring(0, 50)}...`);
  }

  get(key: string): Locator | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.invalidations++;
      return null;
    }

    // Check if page URL has changed
    try {
      const currentUrl = entry.locator.page().url();
      if (currentUrl !== entry.pageUrl) {
        this.cache.delete(key);
        this.stats.invalidations++;
        return null;
      }
    } catch (error) {
      // Page might be closed
      this.cache.delete(key);
      this.stats.invalidations++;
      return null;
    }

    // Update stats
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    return entry.locator;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  invalidate(key: string): void {
    if (this.cache.delete(key)) {
      this.stats.invalidations++;
      ActionLogger.logDebug(`Cache invalidated: ${key.substring(0, 50)}...`);
    }
  }

  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.invalidations += size;
    ActionLogger.logDebug(`Cache cleared: ${size} entries invalidated`);
  }

  invalidateByPage(pageUrl: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache) {
      if (entry.pageUrl === pageUrl) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.stats.invalidations++;
    }
    
    if (keysToDelete.length > 0) {
      ActionLogger.logDebug(`Page cache invalidated: ${pageUrl}, ${keysToDelete.length} entries removed`);
    }
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }

  getExtendedStats(): ExtendedCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      evictions: this.stats.evictions,
      invalidations: this.stats.invalidations
    };
  }

  setMaxSize(size: number): void {
    this.maxSize = size;
    
    // Evict entries if current size exceeds new max
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  enableAutoCleanup(interval: number = 60000): void {
    this.disableAutoCleanup();
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, interval);
  }

  disableAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      delete this.cleanupInterval;
    }
  }

  private startAutoCleanup(): void {
    this.enableAutoCleanup();
  }

  private cleanup(): void {
    const before = this.cache.size;
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.stats.invalidations++;
    }
    
    const removed = before - this.cache.size;
    if (removed > 0) {
      ActionLogger.logDebug(`Cache cleanup: ${removed} expired entries removed`);
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.defaultTTL;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      ActionLogger.logDebug(`Cache eviction: LRU entry removed`);
    }
  }

  getDebugInfo(): any {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key: key.substring(0, 50) + '...',
      hits: entry.hits,
      age: Math.round((Date.now() - entry.timestamp) / 1000) + 's',
      lastAccessed: Math.round((Date.now() - entry.lastAccessed) / 1000) + 's ago',
      pageUrl: entry.pageUrl,
      description: entry.elementDescription
    }));
    
    return {
      stats: this.getStats(),
      config: {
        maxSize: this.maxSize,
        ttl: this.defaultTTL,
        autoCleanup: !!this.cleanupInterval
      },
      entries: entries.slice(0, 10), // Top 10 entries
      totalEntries: this.cache.size
    };
  }

  dispose(): void {
    this.disableAutoCleanup();
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0
    };
  }
}