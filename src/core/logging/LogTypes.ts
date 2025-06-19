/**
 * CS Test Automation Framework - LogTypes
 * 
 * Comprehensive type definitions for the logging system.
 * 
 * @author CS Test Automation Team
 * @version 4.0.0
 */

export enum LogLevel {
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

export type LogFormat = 
  | 'json' 
  | 'pretty' 
  | 'compact' 
  | 'xml' 
  | 'csv' 
  | 'syslog' 
  | 'template'
  | 'logstash'
  | 'cloudwatch';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level?: LogLevel;
  type: string;
  correlationId: string;
  sessionId: string;
  context: LogContext;
  message?: string;
  data?: any;
  metadata?: LogMetadata;
  threadId?: string;
  processId?: number;
  hostname?: string;
}

export interface LogContext {
  [key: string]: any;
  environment?: string;
  version?: string;
  service?: string;
  user?: string;
  feature?: string;
  scenario?: string;
}

export interface LogMetadata {
  [key: string]: any;
  timestamp?: number;
  timezone?: string;
  locale?: string;
  duration?: number;
  retryCount?: number;
  screenshot?: string;
  video?: string;
  trace?: string;
  referrer?: string;
  statusCode?: number;
  loadTime?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  error?: any;
  database?: string;
  message?: string;
  threshold?: number;
  size?: number;
  format?: string;
  cached?: boolean;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface ActionLogEntry extends LogEntry {
  type: 'action';
  action: string;
  details: any;
  duration?: number;
}

export interface NavigationLogEntry extends LogEntry {
  type: 'navigation';
  url: string;
  method: string;
  referrer?: string;
  statusCode?: number;
  loadTime?: number;
}

export interface ElementLogEntry extends LogEntry {
  type: 'element';
  elementDescription: string;
  action: string;
  locator: string;
  success: boolean;
  duration?: number;
  retryCount?: number;
  screenshot?: string;
  error?: any;
}

export interface APILogEntry extends LogEntry {
  type: 'api';
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  error?: any;
}

export interface DatabaseLogEntry extends LogEntry {
  type: 'database';
  operation: string;
  query: string;
  duration: number;
  rowCount?: number;
  database?: string;
  error?: any;
}

export interface ValidationLogEntry extends LogEntry {
  type: 'validation';
  validationType: string;
  expected: any;
  actual: any;
  passed: boolean;
  message?: string;
  screenshot?: string;
}

export interface ErrorLogEntry extends LogEntry {
  type: 'error';
  error: any;
  errorContext?: any;
  stackTrace?: string;
  screenshot?: string;
}

export interface PerformanceLogEntry extends LogEntry {
  type: 'performance';
  metric: string;
  value: number;
  unit: string;
  threshold?: number;
  exceeded: boolean;
}

export interface ScreenshotLogEntry extends LogEntry {
  type: 'screenshot';
  filename: string;
  purpose: string;
  size?: number;
  format: string;
}

export interface NetworkLogEntry extends LogEntry {
  type: 'network';
  request: any;
  response: any;
  duration: number;
  cached: boolean;
  size?: number;
}

export interface ConsoleLogEntry extends LogEntry {
  type: 'console';
  consoleType: string;
  message: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  bufferSize: number;
  flushInterval: number;
  logDirectory?: string;
  fallbackDirectory?: string;
  maxBufferSize?: number;
  transports?: TransportConfig[];
  filters?: LogFilter[];
  rotation?: LogRotationConfig;
  indexDirectory?: string;
}

export interface TransportConfig {
  name: string;
  type: string;
  level?: LogLevel;
  format?: LogFormat;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  options?: any;
  retryOnError?: boolean;
  maxRetries?: number;
}

export interface LogTransport {
  name: string;
  type: string;
  config: TransportConfig;
  format: LogFormat;
  stats: TransportStats;
  write: (entries: string[]) => Promise<void>;
  close: () => Promise<void>;
}

export interface TransportStats {
  written: number;
  errors: number;
  size: number;
  created?: Date;
  lastError?: any;
}

export interface LogRotationConfig {
  enabled: boolean;
  maxSize?: number;
  maxAge?: number;
  maxFiles?: number;
  checkInterval?: number;
  compress?: boolean;
}

export interface LogBuffer {
  entries: LogEntry[];
  size: number;
  created: Date;
}

export interface LogStats {
  totalLogged: number;
  byLevel: Record<LogLevel, number>;
  byType: Record<string, number>;
  errors: number;
  dropped: number;
  flushedCount: number;
  startTime: Date;
  bufferUtilization?: number;
  indexSize?: number;
  transportStats?: Record<string, any>;
}

export interface CorrelationContext {
  correlationId: string;
  startTime: number;
  metadata: any;
  parentId?: string;
}

export interface LogFilter {
  type: 'level' | 'type' | 'pattern' | 'custom';
  value?: any;
  pattern?: string;
  predicate?: (entry: LogEntry) => boolean;
}

export interface LogDestination {
  type: 'console' | 'file' | 'http' | 'syslog' | 'custom';
  config: any;
}

export interface FormatOptions {
  pretty?: boolean;
  indent?: number;
  colors?: boolean;
  timestampFormat?: string;
  includeSystemInfo?: boolean;
  includeContext?: boolean;
  includeMetadata?: boolean;
  includeStackTrace?: boolean;
  includeHeaders?: boolean;
  includeBody?: boolean;
  delimiter?: string;
  quote?: string;
  template?: string;
  facility?: number;
}

export interface ColorScheme {
  timestamp: string;
  level: Record<LogLevel, string>;
  type: Record<string, string>;
  success: string;
  failure: string;
  warning: string;
  info: string;
  muted: string;
}

export interface TemplateEngine {
  register(name: string, template: string): void;
  get(name: string): string | undefined;
  render(template: string, context: any): string;
}

export interface FormatCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export interface FormatterRule {
  condition: (entry: LogEntry) => boolean;
  formatter: (value: string, entry: LogEntry) => string;
}

export interface DataFormatter {
  format: (value: any) => string;
}

export interface StructuredFormatter {
  format: (entries: LogEntry[]) => string;
}

export interface LogQuery {
  level?: LogLevel;
  type?: string;
  correlationId?: string;
  sessionId?: string;
  timeRange?: TimeRange;
  filters?: QueryFilter[];
  search?: string;
  sort?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface SortOrder {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: any;
}

export type FilterOperator = 
  | 'equals' 
  | 'notEquals' 
  | 'contains' 
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'in'
  | 'notIn'
  | 'regex'
  | 'exists'
  | 'notExists';

export interface LogAggregation {
  type: AggregationType;
  field?: string;
  groupBy?: GroupByField;
  interval?: number;
  percentile?: number;
  buckets?: number;
  metrics?: Array<{
    name: string;
    type: AggregationType;
    field: string;
  }>;
  query?: LogQuery;
}

export type AggregationType = 
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'percentile'
  | 'histogram'
  | 'timeseries'
  | 'groupBy'
  | 'stats';

export interface GroupByField {
  field: string;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface AggregationResult {
  type: AggregationType;
  result: any;
  queryTime?: number;
  percentile?: number;
}

export interface StatisticalSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  median: number;
  stdDev: number;
  variance: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface CorrelationSummary {
  correlationId: string;
  entryCount: number;
  startTime?: Date;
  endTime?: Date;
  duration: number;
  success: boolean;
  errors: Array<{
    timestamp: Date;
    message: string;
    type: string;
  }>;
  performance: Record<string, any>;
  breakdown?: Record<string, number>;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  count: number;
  min: number;
  max: number;
  avg: number;
}

export interface LogSnapshot {
  timestamp: Date;
  totalEntries: number;
  memoryUsage: MemoryStats;
  indexes: IndexStats;
  oldestEntry?: Date;
  newestEntry?: Date;
  byLevel: Record<LogLevel, number>;
  byType: Record<string, number>;
  errorRate: number;
  avgResponseTime: number;
  topErrors: Array<{ message: string; count: number }>;
  slowestOperations: Array<{ operation: string; duration: number }>;
}

export interface MemoryStats {
  totalEntries: number;
  estimatedSize: number;
  indexSize: number;
  cacheSize: number;
  utilization: number;
}

export interface IndexStats {
  timeIndex: number;
  levelIndex: number;
  typeIndex: number;
  correlationIndex: number;
  sessionIndex: number;
  contextIndex: number;
  errorIndex: number;
  totalIndexEntries: number;
}

export interface QueryResult {
  entries: LogEntry[];
  timestamp: Date;
  queryTime: number;
}

export interface CollectorConfig {
  maxMemoryMB: number;
  compressionEnabled: boolean;
  indexingEnabled: boolean;
  retentionHours: number;
}

export interface SanitizationRule {
  pattern: RegExp;
  replacement: string;
  path?: string;
}

export interface LogReport {
  sessionId: string;
  timeRange: TimeRange;
  totalEntries: number;
  byLevel: Record<LogLevel, number>;
  byType: Record<string, number>;
  errors: LogEntry[];
  performance: any;
  apiCalls: any;
  elementActions: any;
  validations: any;
}

export interface LogArchive {
  path: string;
  originalPath: string;
  timestamp: Date;
  size: number;
  compressed: boolean;
}

export interface LogIndex {
  initialize(): Promise<void>;
  index(entry: LogEntry): Promise<void>;
  getSize(): Promise<number>;
  close(): Promise<void>;
}

export interface MetricsCollector {
  recordElementFailure(element: string, action: string): void;
  recordValidationFailure(type: string): void;
  recordError(errorType: string): void;
  recordAPICall(method: string, url: string, statusCode: number, duration: number): void;
  recordDatabaseQuery(operation: string, duration: number, rowCount: number): void;
  recordPerformanceMetric(metric: string, value: number): void;
}

export interface LogExporter {
  export(entries: LogEntry[], format: ExportFormat): Promise<string | Buffer>;
  exportToFile(entries: LogEntry[], filePath: string, format: ExportFormat): Promise<void>;
}

export type ExportFormat = 'json' | 'csv' | 'xml' | 'html' | 'pdf';

export interface LogAnalyzer {
  analyzePerformance(entries: LogEntry[]): PerformanceAnalysis;
  analyzeErrors(entries: LogEntry[]): ErrorAnalysis;
  analyzePatterns(entries: LogEntry[]): PatternAnalysis;
  analyzeTrends(entries: LogEntry[]): TrendAnalysis;
}

export interface PerformanceAnalysis {
  totalDuration: number;
  avgResponseTime: number;
  slowestOperations: Array<{
    operation: string;
    duration: number;
    timestamp: Date;
  }>;
  bottlenecks: Array<{
    type: string;
    count: number;
    avgDuration: number;
  }>;
  timeline: Array<{
    timestamp: Date;
    activeOperations: number;
    throughput: number;
  }>;
}

export interface ErrorAnalysis {
  totalErrors: number;
  errorRate: number;
  errorsByType: Record<string, number>;
  errorsByLevel: Record<LogLevel, number>;
  errorTimeline: Array<{
    timestamp: Date;
    count: number;
    types: string[];
  }>;
  commonErrors: Array<{
    message: string;
    count: number;
    firstOccurrence: Date;
    lastOccurrence: Date;
  }>;
  errorClusters: Array<{
    timeRange: TimeRange;
    errors: LogEntry[];
    commonality: string;
  }>;
}

export interface PatternAnalysis {
  sequences: Array<{
    pattern: string[];
    count: number;
    avgDuration: number;
  }>;
  anomalies: Array<{
    entry: LogEntry;
    reason: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  correlations: Array<{
    field1: string;
    field2: string;
    correlation: number;
  }>;
}

export interface TrendAnalysis {
  volumeTrend: {
    direction: 'increasing' | 'decreasing' | 'stable';
    rate: number;
    forecast: number[];
  };
  performanceTrend: {
    direction: 'improving' | 'degrading' | 'stable';
    rate: number;
    forecast: number[];
  };
  errorTrend: {
    direction: 'increasing' | 'decreasing' | 'stable';
    rate: number;
    forecast: number[];
  };
}

export interface LogStreamOptions {
  filter?: LogFilter;
  format?: LogFormat;
  bufferSize?: number;
  highWaterMark?: number;
}

export interface LogStream {
  on(event: 'data', listener: (entry: LogEntry) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'end', listener: () => void): this;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface LogSearchOptions {
  fields?: string[];
  fuzzy?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  boost?: Record<string, number>;
}

export interface SearchResult {
  entry: LogEntry;
  score: number;
  highlights: Array<{
    field: string;
    fragments: string[];
  }>;
}

export interface LogAlertConfig {
  name: string;
  condition: AlertCondition;
  threshold: number;
  window: number;
  cooldown: number;
  actions: AlertAction[];
  enabled: boolean;
}

export interface AlertCondition {
  type: 'count' | 'rate' | 'pattern' | 'threshold' | 'custom';
  field?: string;
  operator?: FilterOperator;
  value?: any;
  pattern?: string;
  predicate?: (entries: LogEntry[]) => boolean;
}

export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'custom';
  config: any;
}

export interface LogRetentionPolicy {
  maxAge?: number;
  maxSize?: number;
  maxEntries?: number;
  archiveEnabled?: boolean;
  archivePath?: string;
  compressionEnabled?: boolean;
  cleanupInterval?: number;
}

export interface LogSecurityConfig {
  encryption?: {
    enabled: boolean;
    algorithm: string;
    key: string;
  };
  sanitization?: {
    enabled: boolean;
    rules: SanitizationRule[];
  };
  access?: {
    enabled: boolean;
    roles: Record<string, string[]>;
  };
}

export interface LogPlugin {
  name: string;
  version: string;
  initialize(logger: any): void;
  process?(entry: LogEntry): LogEntry | null;
  format?(entry: LogEntry, format: LogFormat): string;
  transport?(entries: LogEntry[]): Promise<void>;
  analyze?(entries: LogEntry[]): any;
}

export interface LogMiddleware {
  (entry: LogEntry, next: () => void): void;
}

export interface LogEnricher {
  enrich(entry: LogEntry): LogEntry;
}

export interface LogSampler {
  shouldSample(entry: LogEntry): boolean;
  getSampleRate(): number;
  updateSampleRate(rate: number): void;
}

export interface LogBatch {
  id: string;
  entries: LogEntry[];
  createdAt: Date;
  size: number;
  compressed: boolean;
}

export interface LogCompressor {
  compress(entries: LogEntry[]): Promise<Buffer>;
  decompress(data: Buffer): Promise<LogEntry[]>;
}

export interface LogSerializer {
  serialize(entry: LogEntry): string | Buffer;
  deserialize(data: string | Buffer): LogEntry;
}

export interface LogValidator {
  validate(entry: LogEntry): ValidationResult;
  validateBatch(entries: LogEntry[]): BatchValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BatchValidationResult {
  totalEntries: number;
  validEntries: number;
  invalidEntries: number;
  errors: Array<{
    index: number;
    entry: LogEntry;
    errors: string[];
  }>;
}

export interface LogMerger {
  merge(sources: LogEntry[][]): LogEntry[];
  mergeByTime(sources: LogEntry[][]): LogEntry[];
  mergeByCorrelation(sources: LogEntry[][]): Map<string, LogEntry[]>;
}

export interface LogDiffer {
  diff(before: LogEntry[], after: LogEntry[]): LogDiff;
  findChanges(oldEntry: LogEntry, newEntry: LogEntry): FieldChange[];
}

export interface LogDiff {
  added: LogEntry[];
  removed: LogEntry[];
  modified: Array<{
    before: LogEntry;
    after: LogEntry;
    changes: FieldChange[];
  }>;
}

export interface FieldChange {
  field: string;
  before: any;
  after: any;
  type: 'added' | 'removed' | 'modified';
}

export interface LogReplay {
  replay(entries: LogEntry[], speed: number): LogStream;
  pause(): void;
  resume(): void;
  stop(): void;
  seek(timestamp: Date): void;
}

export interface LogSimulator {
  simulate(template: SimulationTemplate): LogEntry[];
  generateScenario(type: string, duration: number): LogEntry[];
}

export interface SimulationTemplate {
  duration: number;
  rate: number;
  distribution: 'uniform' | 'normal' | 'exponential';
  scenarios: Array<{
    type: string;
    weight: number;
    template: Partial<LogEntry>;
  }>;
}

export interface LogBenchmark {
  benchmark(operation: string, iterations: number): BenchmarkResult;
  compare(results: BenchmarkResult[]): ComparisonResult;
}

export interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  throughput: number;
}

export interface ComparisonResult {
  fastest: string;
  slowest: string;
  differences: Record<string, number>;
}

export interface LogOptimizer {
  optimize(entries: LogEntry[]): OptimizationResult;
  suggestIndexes(queries: LogQuery[]): IndexSuggestion[];
}

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  savings: number;
  optimizations: string[];
}

export interface IndexSuggestion {
  field: string;
  type: 'hash' | 'btree' | 'fulltext';
  estimatedImprovement: number;
  reason: string;
}

export interface LogMonitor {
  monitor(config: MonitorConfig): MonitorHandle;
  getMetrics(): MonitorMetrics;
}

export interface MonitorConfig {
  interval: number;
  metrics: string[];
  alerts: LogAlertConfig[];
}

export interface MonitorHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  updateConfig(config: Partial<MonitorConfig>): void;
}

export interface MonitorMetrics {
  throughput: number;
  errorRate: number;
  avgResponseTime: number;
  activeOperations: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface LogVisualization {
  createChart(type: ChartType, data: LogEntry[], options: ChartOptions): ChartData;
  createDashboard(entries: LogEntry[]): DashboardData;
}

export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap' | 'timeline';

export interface ChartOptions {
  title?: string;
  xAxis?: string;
  yAxis?: string;
  groupBy?: string;
  aggregation?: AggregationType;
}

export interface ChartData {
  type: ChartType;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }>;
}

export interface DashboardData {
  summary: {
    totalEntries: number;
    timeRange: TimeRange;
    errorRate: number;
    avgResponseTime: number;
  };
  charts: ChartData[];
  tables: Array<{
    title: string;
    headers: string[];
    rows: any[][];
  }>;
}

export interface LogIntegration {
  name: string;
  connect(config: any): Promise<void>;
  disconnect(): Promise<void>;
  push(entries: LogEntry[]): Promise<void>;
  pull(query: LogQuery): Promise<LogEntry[]>;
}

export interface LogWebhook {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authentication?: {
    type: 'basic' | 'bearer' | 'apikey';
    credentials: any;
  };
  retries?: number;
  timeout?: number;
}

export interface LogNotification {
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  data?: any;
  actions?: Array<{
    label: string;
    action: string;
  }>;
}

export interface LogScheduler {
  schedule(task: ScheduledTask): string;
  cancel(taskId: string): void;
  pause(taskId: string): void;
  resume(taskId: string): void;
  list(): ScheduledTask[];
}

export interface ScheduledTask {
  id?: string;
  name: string;
  schedule: string; // Cron expression
  task: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface LogBackup {
  backup(entries: LogEntry[], destination: string): Promise<BackupResult>;
  restore(source: string): Promise<LogEntry[]>;
  list(): Promise<BackupInfo[]>;
}

export interface BackupResult {
  path: string;
  entries: number;
  size: number;
  timestamp: Date;
  checksum: string;
}

export interface BackupInfo {
  path: string;
  size: number;
  created: Date;
  entries?: number;
  compressed: boolean;
}

export interface LogSynchronizer {
  sync(source: LogSource, destination: LogSource): Promise<SyncResult>;
  compare(source: LogSource, destination: LogSource): Promise<SyncComparison>;
}

export interface LogSource {
  type: 'file' | 'database' | 'api' | 'stream';
  config: any;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
  duration: number;
  errors: Error[];
}

export interface SyncComparison {
  sourceOnly: number;
  destinationOnly: number;
  different: number;
  identical: number;
}

export interface LogTransformer {
  transform(entry: LogEntry, rules: TransformRule[]): LogEntry;
  transformBatch(entries: LogEntry[], rules: TransformRule[]): LogEntry[];
}

export interface TransformRule {
  field: string;
  operation: 'set' | 'remove' | 'rename' | 'map' | 'filter';
  value?: any;
  mapping?: (value: any) => any;
  condition?: (entry: LogEntry) => boolean;
}

export interface LogRouter {
  route(entry: LogEntry): string[];
  addRoute(name: string, condition: (entry: LogEntry) => boolean, destination: LogDestination): void;
  removeRoute(name: string): void;
  listRoutes(): Array<{ name: string; condition: string; destination: string }>;
}

export interface LogCache {
  get(key: string): LogEntry | undefined;
  set(key: string, entry: LogEntry, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  stats(): CacheStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  evictions: number;
}

export interface LogRateLimiter {
  shouldAllow(key: string): boolean;
  consume(key: string, tokens?: number): boolean;
  reset(key: string): void;
  getRemaining(key: string): number;
}

export interface LogDeduplicator {
  isDuplicate(entry: LogEntry): boolean;
  addEntry(entry: LogEntry): void;
  clear(): void;
  getStats(): DeduplicationStats;
}

export interface DeduplicationStats {
  totalChecked: number;
  duplicatesFound: number;
  uniqueEntries: number;
  deduplicationRate: number;
}

export interface LogAnomalyDetector {
  detect(entries: LogEntry[]): Anomaly[];
  train(entries: LogEntry[]): void;
  getThresholds(): AnomalyThresholds;
  updateThresholds(thresholds: Partial<AnomalyThresholds>): void;
}

export interface Anomaly {
  entry: LogEntry;
  type: 'outlier' | 'pattern' | 'frequency' | 'sequence';
  score: number;
  reason: string;
  context: any;
}

export interface AnomalyThresholds {
  outlierScore: number;
  patternDeviation: number;
  frequencyMultiple: number;
  sequenceDistance: number;
}

export interface LogCorrelator {
  correlate(entries: LogEntry[]): CorrelationGraph;
  findRelated(entry: LogEntry, entries: LogEntry[]): LogEntry[];
  calculateSimilarity(entry1: LogEntry, entry2: LogEntry): number;
}

export interface CorrelationGraph {
  nodes: Array<{
    id: string;
    entry: LogEntry;
    connections: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    strength: number;
    type: string;
  }>;
}

export interface LogExtractor {
  extract(pattern: ExtractionPattern, entries: LogEntry[]): ExtractionResult;
  createPattern(sample: string): ExtractionPattern;
}

export interface ExtractionPattern {
  name: string;
  pattern: string | RegExp;
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    optional?: boolean;
  }>;
}

export interface ExtractionResult {
  matches: number;
  extracted: Array<{
    entry: LogEntry;
    fields: Record<string, any>;
  }>;
  failed: Array<{
    entry: LogEntry;
    reason: string;
  }>;
}