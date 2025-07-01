// src/core/elements/ExtendedCacheStats.ts
import { CacheStats } from './types/element.types';

export interface ExtendedCacheStats extends CacheStats {
  evictions: number;
  invalidations: number;
}

export function toBaseCacheStats(extendedStats: ExtendedCacheStats): CacheStats {
  const { hits, misses, size, hitRate } = extendedStats;
  return { hits, misses, size, hitRate };
}

export class CachePerformanceAnalyzer {
  private stats: ExtendedCacheStats[] = [];
  private readonly maxHistorySize = 100;

  recordStats(stats: ExtendedCacheStats): void {
    this.stats.push({
      ...stats,
      timestamp: Date.now()
    } as ExtendedCacheStats & { timestamp: number });

    if (this.stats.length > this.maxHistorySize) {
      this.stats.shift();
    }
  }

  getAverageHitRate(): number {
    if (this.stats.length === 0) return 0;
    
    const sum = this.stats.reduce((acc, stat) => acc + stat.hitRate, 0);
    return Math.round((sum / this.stats.length) * 100) / 100;
  }

  getTotalEvictions(): number {
    return this.stats.reduce((acc, stat) => acc + stat.evictions, 0);
  }

  getTotalInvalidations(): number {
    return this.stats.reduce((acc, stat) => acc + stat.invalidations, 0);
  }

  getRecentStats(count: number = 10): ExtendedCacheStats[] {
    return this.stats.slice(-count);
  }

  reset(): void {
    this.stats = [];
  }
}
