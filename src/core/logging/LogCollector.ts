
import {
  LogEntry,
  LogLevel,
  LogQuery,
  LogAggregation,
  AggregationResult,
  TimeRange,
  SortOrder,
  GroupByField,
  StatisticalSummary,
  CorrelationSummary,
  TimeSeriesData,
  LogSnapshot,
  QueryResult,
  IndexStats,
  CollectorConfig,
  MemoryStats,
  QueryFilter
} from './LogTypes';

export class LogCollector {
  private entries: Map<string, LogEntry> = new Map();
  private indexes: {
    byTime: Map<number, Set<string>>;
    byLevel: Map<LogLevel, Set<string>>;
    byType: Map<string, Set<string>>;
    byCorrelation: Map<string, Set<string>>;
    bySession: Map<string, Set<string>>;
    byContext: Map<string, Set<string>>;
    byError: Set<string>;
  };
  private config: CollectorConfig;
  private stats: {
    totalEntries: number;
    totalSize: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    indexSize: number;
    queryCount: number;
    avgQueryTime: number;
  };
  private readonly maxEntriesInMemory: number;
  private queryCache: Map<string, QueryResult> = new Map();
  private readonly maxQueryCacheSize: number = 100;

  constructor(config?: CollectorConfig) {
    this.config = {
      maxMemoryMB: 500,
      compressionEnabled: true,
      indexingEnabled: true,
      retentionHours: 24,
      ...config
    };

    this.maxEntriesInMemory = this.calculateMaxEntries();

    this.indexes = {
      byTime: new Map(),
      byLevel: new Map(),
      byType: new Map(),
      byCorrelation: new Map(),
      bySession: new Map(),
      byContext: new Map(),
      byError: new Set()
    };

    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      indexSize: 0,
      queryCount: 0,
      avgQueryTime: 0
    };

    if (this.config.retentionHours > 0) {
      this.startRetentionCleanup();
    }
  }

  async collect(entry: LogEntry): Promise<void> {
    if (this.entries.size >= this.maxEntriesInMemory) {
      await this.evictOldestEntries();
    }

    this.entries.set(entry.id, entry);

    if (this.config.indexingEnabled) {
      this.indexEntry(entry);
    }

    this.updateStats(entry);

    this.queryCache.clear();
  }

  async query(query: LogQuery): Promise<LogEntry[]> {
    const startTime = performance.now();

    const cacheKey = this.generateQueryCacheKey(query);
    const cached = this.queryCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached.entries;
    }

    try {
      let candidates = this.getCandidates(query);

      if (query.filters) {
        candidates = this.applyQueryFilters(candidates, query.filters);
      }

      if (query.timeRange) {
        candidates = this.filterByTimeRange(candidates, query.timeRange);
      }

      if (query.search) {
        candidates = this.searchEntries(candidates, query.search);
      }

      if (query.sort) {
        candidates = this.sortEntries(candidates, query.sort);
      }

      if (query.limit || query.offset) {
        candidates = this.paginate(candidates, query.offset || 0, query.limit || 100);
      }

      const result: QueryResult = {
        entries: candidates,
        timestamp: new Date(),
        queryTime: performance.now() - startTime
      };
      this.cacheQuery(cacheKey, result);

      this.updateQueryStats(result.queryTime);

      return candidates;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw new Error(`Failed to execute query: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async aggregate(aggregation: LogAggregation): Promise<AggregationResult> {
    const startTime = performance.now();

    const entries = aggregation.query 
      ? await this.query(aggregation.query)
      : Array.from(this.entries.values());

    let result: AggregationResult;

    switch (aggregation.type) {
      case 'count':
        result = this.aggregateCount(entries, aggregation);
        break;

      case 'sum':
        result = this.aggregateSum(entries, aggregation);
        break;

      case 'avg':
        result = this.aggregateAverage(entries, aggregation);
        break;

      case 'min':
        result = this.aggregateMin(entries, aggregation);
        break;

      case 'max':
        result = this.aggregateMax(entries, aggregation);
        break;

      case 'percentile':
        result = this.aggregatePercentile(entries, aggregation);
        break;

      case 'histogram':
        result = this.aggregateHistogram(entries, aggregation);
        break;

      case 'timeseries':
        result = this.aggregateTimeSeries(entries, aggregation);
        break;

      case 'groupBy':
        result = this.aggregateGroupBy(entries, aggregation);
        break;

      case 'stats':
        result = this.aggregateStats(entries, aggregation);
        break;

      default:
        throw new Error(`Unknown aggregation type: ${aggregation.type}`);
    }

    result.queryTime = performance.now() - startTime;
    return result;
  }

  async getCorrelationSummary(correlationId: string): Promise<CorrelationSummary> {
    const entries = this.getEntriesByCorrelation(correlationId);
    
    if (entries.length === 0) {
      return {
        correlationId,
        entryCount: 0,
        duration: 0,
        success: true,
        errors: [],
        performance: {}
      };
    }

    const sorted = entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    
    if (!first || !last) {
      return {
        correlationId,
        entryCount: entries.length,
        duration: 0,
        success: true,
        errors: [],
        performance: {}
      };
    }
    
    const duration = last.timestamp.getTime() - first.timestamp.getTime();

    const errors = entries.filter(e => e.level === LogLevel.ERROR || e.level === LogLevel.FATAL);
    const success = errors.length === 0;

    const performance = this.calculateCorrelationPerformance(entries);

    return {
      correlationId,
      entryCount: entries.length,
      startTime: first.timestamp,
      endTime: last.timestamp,
      duration,
      success,
      errors: errors.map(e => ({
        timestamp: e.timestamp,
        message: this.getErrorMessage(e),
        type: e.type
      })),
      performance,
      breakdown: this.getCorrelationBreakdown(entries)
    };
  }

  async getTimeSeriesData(
    field: string,
    interval: number,
    timeRange?: TimeRange
  ): Promise<TimeSeriesData[]> {
    const entries = timeRange 
      ? this.filterByTimeRange(Array.from(this.entries.values()), timeRange)
      : Array.from(this.entries.values());

    const buckets = new Map<number, any[]>();

    entries.forEach(entry => {
      const bucket = Math.floor(entry.timestamp.getTime() / interval) * interval;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket)!.push(this.getFieldValue(entry, field));
    });

    const result: TimeSeriesData[] = [];

    for (const [timestamp, values] of buckets) {
      result.push({
        timestamp: new Date(timestamp),
        value: this.calculateBucketValue(values),
        count: values.length,
        min: Math.min(...values.filter(v => typeof v === 'number')),
        max: Math.max(...values.filter(v => typeof v === 'number')),
        avg: values.filter(v => typeof v === 'number').reduce((a, b) => a + b, 0) / values.length
      });
    }

    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getStatistics(field?: string): Promise<StatisticalSummary> {
    const entries = Array.from(this.entries.values());
    
    if (!field) {
      return this.getGeneralStatistics(entries);
    }

    const values = entries
      .map(e => this.getFieldValue(e, field))
      .filter(v => typeof v === 'number') as number[];

    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        median: 0,
        stdDev: 0,
        variance: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0
      };
    }

    values.sort((a, b) => a - b);

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: values.length,
      sum,
      avg,
      min: values[0] as number,
      max: values[values.length - 1] as number,
      median: this.calculatePercentile(values, 50),
      stdDev,
      variance,
      p50: this.calculatePercentile(values, 50),
      p75: this.calculatePercentile(values, 75),
      p90: this.calculatePercentile(values, 90),
      p95: this.calculatePercentile(values, 95),
      p99: this.calculatePercentile(values, 99)
    };
  }

  async createSnapshot(): Promise<LogSnapshot> {
    const snapshot: LogSnapshot = {
      timestamp: new Date(),
      totalEntries: this.stats.totalEntries,
      memoryUsage: this.getMemoryUsage(),
      indexes: this.getIndexStats(),
      byLevel: this.countByLevel(),
      byType: this.countByType(),
      errorRate: this.calculateErrorRate(),
      avgResponseTime: await this.calculateAvgResponseTime(),
      topErrors: await this.getTopErrors(5),
      slowestOperations: await this.getSlowestOperations(5)
    };

    if (this.stats.oldestEntry !== undefined) {
      snapshot.oldestEntry = this.stats.oldestEntry;
    }
    if (this.stats.newestEntry !== undefined) {
      snapshot.newestEntry = this.stats.newestEntry;
    }

    return snapshot;
  }

  clear(): void {
    this.entries.clear();
    this.clearIndexes();
    this.queryCache.clear();
    this.resetStats();
  }


  private calculateMaxEntries(): number {
    const avgEntrySize = 1024;
    const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
    return Math.floor(maxBytes / avgEntrySize);
  }

  private async evictOldestEntries(): Promise<void> {
    const entriesToRemove = Math.floor(this.maxEntriesInMemory * 0.1);
    const sorted = Array.from(this.entries.entries())
      .sort(([, a], [, b]) => a.timestamp.getTime() - b.timestamp.getTime());

    for (let i = 0; i < entriesToRemove && i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry) {
        const [id, logEntry] = entry;
        this.removeEntry(id, logEntry);
      }
    }
  }

  private removeEntry(id: string, entry: LogEntry): void {
    this.entries.delete(id);
    this.removeFromIndexes(entry);
    this.stats.totalSize -= this.estimateEntrySize(entry);
  }

  private indexEntry(entry: LogEntry): void {
    const hourBucket = Math.floor(entry.timestamp.getTime() / (60 * 60 * 1000));
    if (!this.indexes.byTime.has(hourBucket)) {
      this.indexes.byTime.set(hourBucket, new Set());
    }
    this.indexes.byTime.get(hourBucket)!.add(entry.id);

    if (entry.level) {
      if (!this.indexes.byLevel.has(entry.level)) {
        this.indexes.byLevel.set(entry.level, new Set());
      }
      this.indexes.byLevel.get(entry.level)!.add(entry.id);
    }

    if (!this.indexes.byType.has(entry.type)) {
      this.indexes.byType.set(entry.type, new Set());
    }
    this.indexes.byType.get(entry.type)!.add(entry.id);

    if (!this.indexes.byCorrelation.has(entry.correlationId)) {
      this.indexes.byCorrelation.set(entry.correlationId, new Set());
    }
    this.indexes.byCorrelation.get(entry.correlationId)!.add(entry.id);

    if (!this.indexes.bySession.has(entry.sessionId)) {
      this.indexes.bySession.set(entry.sessionId, new Set());
    }
    this.indexes.bySession.get(entry.sessionId)!.add(entry.id);

    if (entry.context) {
      for (const [key, value] of Object.entries(entry.context)) {
        const contextKey = `${key}:${value}`;
        if (!this.indexes.byContext.has(contextKey)) {
          this.indexes.byContext.set(contextKey, new Set());
        }
        this.indexes.byContext.get(contextKey)!.add(entry.id);
      }
    }

    if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
      this.indexes.byError.add(entry.id);
    }
  }

  private removeFromIndexes(entry: LogEntry): void {
    const hourBucket = Math.floor(entry.timestamp.getTime() / (60 * 60 * 1000));
    this.indexes.byTime.get(hourBucket)?.delete(entry.id);
    if (this.indexes.byTime.get(hourBucket)?.size === 0) {
      this.indexes.byTime.delete(hourBucket);
    }

    if (entry.level) {
      this.indexes.byLevel.get(entry.level)?.delete(entry.id);
    }
    this.indexes.byType.get(entry.type)?.delete(entry.id);
    this.indexes.byCorrelation.get(entry.correlationId)?.delete(entry.id);
    this.indexes.bySession.get(entry.sessionId)?.delete(entry.id);

    if (entry.context) {
      for (const [key, value] of Object.entries(entry.context)) {
        const contextKey = `${key}:${value}`;
        this.indexes.byContext.get(contextKey)?.delete(entry.id);
      }
    }

    if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
      this.indexes.byError.delete(entry.id);
    }
  }

  private updateStats(entry: LogEntry): void {
    this.stats.totalEntries++;
    this.stats.totalSize += this.estimateEntrySize(entry);

    if (!this.stats.oldestEntry || entry.timestamp < this.stats.oldestEntry) {
      this.stats.oldestEntry = entry.timestamp;
    }

    if (!this.stats.newestEntry || entry.timestamp > this.stats.newestEntry) {
      this.stats.newestEntry = entry.timestamp;
    }

    this.stats.indexSize = this.calculateIndexSize();
  }

  private estimateEntrySize(entry: LogEntry): number {
    return JSON.stringify(entry).length * 2;
  }

  private calculateIndexSize(): number {
    let size = 0;
    
    size += this.indexes.byTime.size * 100;
    size += this.indexes.byLevel.size * 50;
    size += this.indexes.byType.size * 50;
    size += this.indexes.byCorrelation.size * 100;
    size += this.indexes.bySession.size * 100;
    size += this.indexes.byContext.size * 150;
    size += this.indexes.byError.size * 8;

    return size;
  }

  private getCandidates(query: LogQuery): LogEntry[] {
    let candidateIds: Set<string> | undefined;

    if (query.level) {
      const levelIds = this.indexes.byLevel.get(query.level);
      candidateIds = levelIds ? new Set(levelIds) : new Set();
    }

    if (query.type) {
      const typeIds = this.indexes.byType.get(query.type);
      if (candidateIds) {
        candidateIds = this.intersectSets(candidateIds, typeIds || new Set());
      } else {
        candidateIds = typeIds ? new Set(typeIds) : new Set();
      }
    }

    if (query.correlationId) {
      const correlationIds = this.indexes.byCorrelation.get(query.correlationId);
      if (candidateIds) {
        candidateIds = this.intersectSets(candidateIds, correlationIds || new Set());
      } else {
        candidateIds = correlationIds ? new Set(correlationIds) : new Set();
      }
    }

    if (query.sessionId) {
      const sessionIds = this.indexes.bySession.get(query.sessionId);
      if (candidateIds) {
        candidateIds = this.intersectSets(candidateIds, sessionIds || new Set());
      } else {
        candidateIds = sessionIds ? new Set(sessionIds) : new Set();
      }
    }

    if (candidateIds) {
      return Array.from(candidateIds)
        .map(id => this.entries.get(id))
        .filter(entry => entry !== undefined) as LogEntry[];
    }

    return Array.from(this.entries.values());
  }

  private intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    const result = new Set<T>();
    for (const item of set1) {
      if (set2.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  private applyQueryFilters(entries: LogEntry[], filters: QueryFilter[]): LogEntry[] {
    return entries.filter(entry => {
      return filters.every(filter => this.matchesQueryFilter(entry, filter));
    });
  }

  private matchesQueryFilter(entry: LogEntry, filter: QueryFilter): boolean {
    const fieldValue = this.getFieldValue(entry, filter.field);
    
    switch (filter.operator) {
      case 'equals':
        return fieldValue === filter.value;

      case 'notEquals':
        return fieldValue !== filter.value;

      case 'contains':
        return String(fieldValue).includes(String(filter.value));

      case 'notContains':
        return !String(fieldValue).includes(String(filter.value));

      case 'startsWith':
        return String(fieldValue).startsWith(String(filter.value));

      case 'endsWith':
        return String(fieldValue).endsWith(String(filter.value));

      case 'greaterThan':
        return Number(fieldValue) > Number(filter.value);

      case 'lessThan':
        return Number(fieldValue) < Number(filter.value);

      case 'greaterThanOrEqual':
        return Number(fieldValue) >= Number(filter.value);

      case 'lessThanOrEqual':
        return Number(fieldValue) <= Number(filter.value);

      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(fieldValue);

      case 'notIn':
        return Array.isArray(filter.value) && !filter.value.includes(fieldValue);

      case 'regex':
        const regex = new RegExp(String(filter.value));
        return regex.test(String(fieldValue));

      case 'exists':
        return fieldValue !== undefined;

      case 'notExists':
        return fieldValue === undefined;

      default:
        return true;
    }
  }

  private getFieldValue(entry: LogEntry, field: string): any {
    const parts = field.split('.');
    let value: any = entry;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  private filterByTimeRange(entries: LogEntry[], timeRange: TimeRange): LogEntry[] {
    const start = timeRange.start.getTime();
    const end = timeRange.end.getTime();

    return entries.filter(entry => {
      const time = entry.timestamp.getTime();
      return time >= start && time <= end;
    });
  }

  private searchEntries(entries: LogEntry[], search: string): LogEntry[] {
    const searchLower = search.toLowerCase();
    
    return entries.filter(entry => {
      const entryStr = JSON.stringify(entry).toLowerCase();
      return entryStr.includes(searchLower);
    });
  }

  private sortEntries(entries: LogEntry[], sort: SortOrder): LogEntry[] {
    const { field, direction } = sort;
    const multiplier = direction === 'asc' ? 1 : -1;

    return [...entries].sort((a, b) => {
      const aValue = this.getFieldValue(a, field);
      const bValue = this.getFieldValue(b, field);

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (aValue < bValue) return -1 * multiplier;
      if (aValue > bValue) return 1 * multiplier;
      
      return 0;
    });
  }

  private paginate(entries: LogEntry[], offset: number, limit: number): LogEntry[] {
    return entries.slice(offset, offset + limit);
  }

  private generateQueryCacheKey(query: LogQuery): string {
    return JSON.stringify(query);
  }

  private isCacheValid(cached: QueryResult): boolean {
    const maxAge = 5000;
    return Date.now() - cached.timestamp.getTime() < maxAge;
  }

  private cacheQuery(key: string, result: QueryResult): void {
    if (this.queryCache.size >= this.maxQueryCacheSize) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) {
        this.queryCache.delete(firstKey);
      }
    }
    this.queryCache.set(key, result);
  }

  private updateQueryStats(queryTime: number): void {
    this.stats.queryCount++;
    this.stats.avgQueryTime = 
      (this.stats.avgQueryTime * (this.stats.queryCount - 1) + queryTime) / this.stats.queryCount;
  }

  private aggregateCount(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    if (aggregation.groupBy) {
      const groups = this.groupEntries(entries, aggregation.groupBy);
      const result: Record<string, number> = {};
      
      for (const [key, groupEntries] of groups) {
        result[key] = groupEntries.length;
      }
      
      return { type: 'count', result };
    }

    return { type: 'count', result: entries.length };
  }

  private aggregateSum(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    
    if (aggregation.groupBy) {
      const groups = this.groupEntries(entries, aggregation.groupBy);
      const result: Record<string, number> = {};
      
      for (const [key, groupEntries] of groups) {
        result[key] = groupEntries
          .map(e => Number(this.getFieldValue(e, field)) || 0)
          .reduce((a, b) => a + b, 0);
      }
      
      return { type: 'sum', result };
    }

    const sum = entries
      .map(e => Number(this.getFieldValue(e, field)) || 0)
      .reduce((a, b) => a + b, 0);

    return { type: 'sum', result: sum };
  }

  private aggregateAverage(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    
    if (aggregation.groupBy) {
      const groups = this.groupEntries(entries, aggregation.groupBy);
      const result: Record<string, number> = {};
      
      for (const [key, groupEntries] of groups) {
        const values = groupEntries
          .map(e => Number(this.getFieldValue(e, field)))
          .filter(v => !isNaN(v));
        
        result[key] = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
      }
      
      return { type: 'avg', result };
    }

    const values = entries
      .map(e => Number(this.getFieldValue(e, field)))
      .filter(v => !isNaN(v));

    const avg = values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;

    return { type: 'avg', result: avg };
  }

  private aggregateMin(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    
    if (aggregation.groupBy) {
      const groups = this.groupEntries(entries, aggregation.groupBy);
      const result: Record<string, number> = {};
      
      for (const [key, groupEntries] of groups) {
        const values = groupEntries
          .map(e => Number(this.getFieldValue(e, field)))
          .filter(v => !isNaN(v));
        
        result[key] = values.length > 0 ? Math.min(...values) : 0;
      }
      
      return { type: 'min', result };
    }

    const values = entries
      .map(e => Number(this.getFieldValue(e, field)))
      .filter(v => !isNaN(v));

    const min = values.length > 0 ? Math.min(...values) : 0;

    return { type: 'min', result: min };
  }

  private aggregateMax(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    
    if (aggregation.groupBy) {
      const groups = this.groupEntries(entries, aggregation.groupBy);
      const result: Record<string, number> = {};
      
      for (const [key, groupEntries] of groups) {
        const values = groupEntries
          .map(e => Number(this.getFieldValue(e, field)))
          .filter(v => !isNaN(v));
        
        result[key] = values.length > 0 ? Math.max(...values) : 0;
      }
      
      return { type: 'max', result };
    }

    const values = entries
      .map(e => Number(this.getFieldValue(e, field)))
      .filter(v => !isNaN(v));

    const max = values.length > 0 ? Math.max(...values) : 0;

    return { type: 'max', result: max };
  }

  private aggregatePercentile(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    const percentile = aggregation.percentile || 50;
    
    if (aggregation.groupBy) {
      const groups = this.groupEntries(entries, aggregation.groupBy);
      const result: Record<string, number> = {};
      
      for (const [key, groupEntries] of groups) {
        const values = groupEntries
          .map(e => Number(this.getFieldValue(e, field)))
          .filter(v => !isNaN(v))
          .sort((a, b) => a - b);
        
        const value = values.length > 0 
          ? this.calculatePercentile(values, percentile)
          : 0;
        
        result[key] = value;
      }
      
      return { type: 'percentile', result, percentile };
    }

    const values = entries
      .map(e => Number(this.getFieldValue(e, field)))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);

    const value = values.length > 0 
      ? this.calculatePercentile(values, percentile)
      : 0;

    return { type: 'percentile', result: value, percentile };
  }

  private aggregateHistogram(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    const buckets = aggregation.buckets || 10;
    
    const values = entries
      .map(e => Number(this.getFieldValue(e, field)))
      .filter(v => !isNaN(v));

    if (values.length === 0) {
      return { type: 'histogram', result: [] };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const bucketSize = (max - min) / buckets;
    
    const histogram: Array<{ bucket: string; count: number; range: [number, number] }> = [];
    
    for (let i = 0; i < buckets; i++) {
      const rangeStart = min + (i * bucketSize);
      const rangeEnd = i === buckets - 1 ? max : rangeStart + bucketSize;
      
      const count = values.filter(v => {
        if (i === buckets - 1) {
          return v >= rangeStart && v <= rangeEnd;
        }
        return v >= rangeStart && v < rangeEnd;
      }).length;
      
      histogram.push({
        bucket: `${rangeStart.toFixed(2)}-${rangeEnd.toFixed(2)}`,
        count,
        range: [rangeStart, rangeEnd]
      });
    }
    
    return { type: 'histogram', result: histogram };
  }

  private aggregateTimeSeries(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const interval = aggregation.interval || 60000;
    const field = aggregation.field;
    
    const buckets = new Map<number, LogEntry[]>();
    
    entries.forEach(entry => {
      const bucket = Math.floor(entry.timestamp.getTime() / interval) * interval;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket)!.push(entry);
    });
    
    const timeSeries: TimeSeriesData[] = [];
    
    for (const [timestamp, bucketEntries] of buckets) {
      if (field) {
        const values = bucketEntries
          .map(e => Number(this.getFieldValue(e, field)))
          .filter(v => !isNaN(v));
        
        if (values.length > 0) {
          timeSeries.push({
            timestamp: new Date(timestamp),
            value: values.reduce((a, b) => a + b, 0) / values.length,
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length
          });
        }
      } else {
        timeSeries.push({
          timestamp: new Date(timestamp),
          value: bucketEntries.length,
          count: bucketEntries.length,
          min: bucketEntries.length,
          max: bucketEntries.length,
          avg: bucketEntries.length
        });
      }
    }
    
    return { 
      type: 'timeseries', 
      result: timeSeries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    };
  }

  private aggregateGroupBy(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const groups = this.groupEntries(entries, aggregation.groupBy!);
    const result: Record<string, any> = {};
    
    for (const [key, groupEntries] of groups) {
      if (aggregation.metrics) {
        result[key] = {};
        
        for (const metric of aggregation.metrics) {
          const metricAgg = { ...aggregation, type: metric.type, field: metric.field };
          const metricResult = this.executeAggregation(groupEntries, metricAgg);
          result[key][metric.name || metric.type] = metricResult.result;
        }
      } else {
        result[key] = groupEntries.length;
      }
    }
    
    return { type: 'groupBy', result };
  }

  private aggregateStats(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    const field = aggregation.field!;
    const values = entries
      .map(e => Number(this.getFieldValue(e, field)))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return {
        type: 'stats',
        result: {
          count: 0,
          sum: 0,
          avg: 0,
          min: 0,
          max: 0,
          median: 0,
          stdDev: 0,
          variance: 0
        }
      };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;

    return {
      type: 'stats',
      result: {
        count: values.length,
        sum,
        avg,
        min: values[0],
        max: values[values.length - 1],
        median: this.calculatePercentile(values, 50),
        stdDev: Math.sqrt(variance),
        variance
      }
    };
  }

  private executeAggregation(entries: LogEntry[], aggregation: LogAggregation): AggregationResult {
    switch (aggregation.type) {
      case 'count': return this.aggregateCount(entries, aggregation);
      case 'sum': return this.aggregateSum(entries, aggregation);
      case 'avg': return this.aggregateAverage(entries, aggregation);
      case 'min': return this.aggregateMin(entries, aggregation);
      case 'max': return this.aggregateMax(entries, aggregation);
      default: return { type: aggregation.type, result: null };
    }
  }

  private groupEntries(entries: LogEntry[], groupBy: GroupByField): Map<string, LogEntry[]> {
    const groups = new Map<string, LogEntry[]>();
    
    entries.forEach(entry => {
      const key = String(this.getFieldValue(entry, groupBy.field) || 'null');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    });
    
    return groups;
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)] as number;
  }

  private getEntriesByCorrelation(correlationId: string): LogEntry[] {
    const ids = this.indexes.byCorrelation.get(correlationId);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.entries.get(id))
      .filter(entry => entry !== undefined) as LogEntry[];
  }

  private calculateCorrelationPerformance(entries: LogEntry[]): Record<string, any> {
    const apiCalls = entries.filter(e => e.type === 'api');
    const dbCalls = entries.filter(e => e.type === 'database');
    const elementActions = entries.filter(e => e.type === 'element');
    
    return {
      apiCalls: {
        count: apiCalls.length,
        totalDuration: apiCalls.reduce((sum, e) => sum + ((e as any).duration || 0), 0),
        avgDuration: apiCalls.length > 0 
          ? apiCalls.reduce((sum, e) => sum + ((e as any).duration || 0), 0) / apiCalls.length
          : 0
      },
      databaseCalls: {
        count: dbCalls.length,
        totalDuration: dbCalls.reduce((sum, e) => sum + ((e as any).duration || 0), 0),
        avgDuration: dbCalls.length > 0
          ? dbCalls.reduce((sum, e) => sum + ((e as any).duration || 0), 0) / dbCalls.length
          : 0
      },
      elementActions: {
        count: elementActions.length,
        failures: elementActions.filter(e => !(e as any).success).length
      }
    };
  }

  private getCorrelationBreakdown(entries: LogEntry[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    entries.forEach(entry => {
      breakdown[entry.type] = (breakdown[entry.type] || 0) + 1;
    });
    
    return breakdown;
  }

  private getErrorMessage(entry: LogEntry): string {
    if (entry.type === 'error') {
      const error = (entry as any).error;
      return error?.message || error || 'Unknown error';
    }
    
    if ('error' in entry && (entry as any).error) {
      const error = (entry as any).error;
      return error.message || error;
    }
    
    return 'Unknown error';
  }

  private calculateBucketValue(values: any[]): number {
    const numbers = values.filter(v => typeof v === 'number');
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  private getGeneralStatistics(entries: LogEntry[]): StatisticalSummary {
    const durations = entries
      .map(e => (e as any).duration)
      .filter(d => typeof d === 'number') as number[];

    if (durations.length === 0) {
      return {
        count: entries.length,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        median: 0,
        stdDev: 0,
        variance: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0
      };
    }

    durations.sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const variance = durations.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / durations.length;

    return {
      count: entries.length,
      sum,
      avg,
      min: durations[0] as number,
      max: durations[durations.length - 1] as number,
      median: this.calculatePercentile(durations, 50),
      stdDev: Math.sqrt(variance),
      variance,
      p50: this.calculatePercentile(durations, 50),
      p75: this.calculatePercentile(durations, 75),
      p90: this.calculatePercentile(durations, 90),
      p95: this.calculatePercentile(durations, 95),
      p99: this.calculatePercentile(durations, 99)
    };
  }

  private getMemoryUsage(): MemoryStats {
    return {
      totalEntries: this.entries.size,
      estimatedSize: this.stats.totalSize,
      indexSize: this.stats.indexSize,
      cacheSize: this.queryCache.size,
      utilization: (this.stats.totalSize / (this.config.maxMemoryMB * 1024 * 1024)) * 100
    };
  }

  private getIndexStats(): IndexStats {
    return {
      timeIndex: this.indexes.byTime.size,
      levelIndex: this.indexes.byLevel.size,
      typeIndex: this.indexes.byType.size,
      correlationIndex: this.indexes.byCorrelation.size,
      sessionIndex: this.indexes.bySession.size,
      contextIndex: this.indexes.byContext.size,
      errorIndex: this.indexes.byError.size,
      totalIndexEntries: this.countTotalIndexEntries()
    };
  }

  private countTotalIndexEntries(): number {
    let count = 0;
    
    for (const bucket of this.indexes.byTime.values()) {
      count += bucket.size;
    }
    
    for (const entries of this.indexes.byLevel.values()) {
      count += entries.size;
    }
    
    for (const entries of this.indexes.byType.values()) {
      count += entries.size;
    }
    
    for (const entries of this.indexes.byCorrelation.values()) {
      count += entries.size;
    }
    
    for (const entries of this.indexes.bySession.values()) {
      count += entries.size;
    }
    
    for (const entries of this.indexes.byContext.values()) {
      count += entries.size;
    }
    
    count += this.indexes.byError.size;
    
    return count;
  }

  private countByLevel(): Record<LogLevel, number> {
    const counts: Record<LogLevel, number> = {
      [LogLevel.TRACE]: 0,
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.FATAL]: 0
    };

    for (const [level, ids] of this.indexes.byLevel) {
      counts[level] = ids.size;
    }

    return counts;
  }

  private countByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const [type, ids] of this.indexes.byType) {
      counts[type] = ids.size;
    }
    
    return counts;
  }

  private calculateErrorRate(): number {
    if (this.stats.totalEntries === 0) return 0;
    return (this.indexes.byError.size / this.stats.totalEntries) * 100;
  }

  private async calculateAvgResponseTime(): Promise<number> {
    const apiEntries = Array.from(this.entries.values())
      .filter(e => e.type === 'api')
      .map(e => (e as any).duration)
      .filter(d => typeof d === 'number') as number[];

    if (apiEntries.length === 0) return 0;
    return apiEntries.reduce((a, b) => a + b, 0) / apiEntries.length;
  }

  private async getTopErrors(limit: number): Promise<Array<{ message: string; count: number }>> {
    const errorMessages = new Map<string, number>();
    
    for (const id of this.indexes.byError) {
      const entry = this.entries.get(id);
      if (entry) {
        const message = this.getErrorMessage(entry);
        errorMessages.set(message, (errorMessages.get(message) || 0) + 1);
      }
    }
    
    return Array.from(errorMessages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([message, count]) => ({ message, count }));
  }

  private async getSlowestOperations(limit: number): Promise<Array<{ operation: string; duration: number }>> {
    const operations = Array.from(this.entries.values())
      .filter(e => 'duration' in e && typeof (e as any).duration === 'number')
      .map(e => ({
        operation: this.getOperationName(e),
        duration: (e as any).duration as number
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
    
    return operations;
  }

  private getOperationName(entry: LogEntry): string {
    switch (entry.type) {
      case 'api':
        const api = entry as any;
        return `${api.method} ${api.url}`;
      case 'database':
        const db = entry as any;
        return `${db.operation}: ${db.query?.substring(0, 50)}...`;
      case 'element':
        const elem = entry as any;
        return `${elem.elementDescription} - ${elem.action}`;
      default:
        return entry.type;
    }
  }

  private clearIndexes(): void {
    this.indexes.byTime.clear();
    this.indexes.byLevel.clear();
    this.indexes.byType.clear();
    this.indexes.byCorrelation.clear();
    this.indexes.bySession.clear();
    this.indexes.byContext.clear();
    this.indexes.byError.clear();
  }

  private resetStats(): void {
    this.stats = {
      totalEntries: 0,
      totalSize: 0,
      indexSize: 0,
      queryCount: 0,
      avgQueryTime: 0
    };
  }

  private startRetentionCleanup(): void {
    setInterval(() => {
      this.cleanupOldEntries();
    }, 60 * 60 * 1000);
  }

  private cleanupOldEntries(): void {
    const cutoffTime = Date.now() - (this.config.retentionHours * 60 * 60 * 1000);
    const entriesToRemove: Array<[string, LogEntry]> = [];
    
    for (const [id, entry] of this.entries) {
      if (entry.timestamp.getTime() < cutoffTime) {
        entriesToRemove.push([id, entry]);
      }
    }
    
    for (const [id, entry] of entriesToRemove) {
      this.removeEntry(id, entry);
    }
  }
}
