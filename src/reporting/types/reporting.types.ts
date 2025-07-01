// src/reporting/types/reporting.types.ts


import { ExecutionStatus } from '../../bdd/types/bdd.types';
import { HookType } from '../../bdd/types/bdd.types';


export interface SummaryStats {
  totalFeatures: number;
  totalScenarios: number;
  totalSteps: number;
  passedScenarios: number;
  failedScenarios: number;
  skippedScenarios: number;
  passedSteps: number;
  failedSteps: number;
  passRate: number;
  avgDuration: number;
  totalDuration: number;
  passRateImprovement: number;
  durationImprovement: number;
  criticalFailures: number;
  riskLevel: string;
  executionEnvironment: string;
  parallelExecution: boolean;
  parallelWorkers: number;
  retryStats: {
    totalRetries: number;
    scenariosWithRetries: number;
  };
}

export interface HighlightItem {
  type: 'success' | 'improvement' | 'warning' | 'alert' | 'info';
  title: string;
  description: string;
  icon: string;
}

export interface RecommendationItem {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
  impact: string;
  effort: string;
}


export interface CSReport {
  metadata: ReportMetadata;
  configuration: ReportConfiguration;
  summary: ExecutionSummary;
  features: FeatureReport[];
  scenarios: ScenarioReport[];
  steps: StepReport[];
  evidence: EvidenceCollection;
  metrics: ReportMetrics;
  network: NetworkAnalysis;
  logs: LogCollection;
  timeline: TimelineData;
  charts: ChartDataCollection;
  errors: ErrorAnalysis;
  aiHealing: AIHealingReport;
}

export interface ReportMetadata {
  reportId: string;
  reportName: string;
  executionId: string;
  environment: string;
  executionDate: Date;
  startTime: Date;
  endTime: Date;
  duration: number;
  reportGeneratedAt: Date;
  frameworkVersion: string;
  reportVersion: string;
  machineInfo: MachineInfo;
  userInfo: UserInfo;
  tags: string[];
  executionOptions: ExecutionOptions;
  buildNumber?: string;
  branchName?: string;
  lastUpdated?: string;
  commitHash?: string;
  browser?: string;
  browserVersion?: string;
  playwrightVersion?: string;
}

export interface MachineInfo {
  hostname: string;
  platform: string;
  arch: string;
  cpuCores: number;
  totalMemory: number;
  nodeVersion: string;
  osRelease: string;
}

export interface UserInfo {
  username: string;
  domain: string;
  executedBy: string;
}


export interface ExecutionSummary {
  totalFeatures: number;
  passedFeatures: number;
  failedFeatures: number;
  skippedFeatures: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  skippedScenarios: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  pendingSteps: number;
  executionTime: number;
  parallelWorkers: number;
  retryCount: number;
  passRate: number;
  failureRate: number;
  status: ExecutionStatus;
  trends: TrendData;
  statistics: ExecutionStatistics;
  projectName?: string;
  executionId?: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  duration?: number;
  startTime?: Date;
  endTime?: Date;
  scenarios: ScenarioSummary[];
  features: FeatureReport[];
  environment: string;
  previousRun?: {
    passRate: number;
    avgDuration: number;
    failedScenarios: string[];
  };
}


export interface ExecutionStatistics {
  avgScenarioDuration: number;
  avgStepDuration: number;
  fastestScenario: ScenarioReference;
  slowestScenario: ScenarioReference;
  mostFailedFeature: string;
  mostStableFeature: string;
  flakyTests: FlakyTest[];
}

export interface ScenarioReference {
  scenarioId: string;
  name: string;
  duration: number;
  feature: string;
}

export interface FlakyTest {
  scenarioId: string;
  name: string;
  failureRate: number;
  totalRuns: number;
  failures: number;
}

export interface TrendData {
  passRateTrend: number | { data: number[]; change: number; direction: 'up' | 'down' | 'stable' };
  executionTimeTrend: number | { data: number[]; change: number; direction: 'up' | 'down' | 'stable' };
  failureRateTrend: number | { data: number[]; change: number; direction: 'up' | 'down' | 'stable' };
  lastExecutions: ExecutionHistory[];
  stabilityTrend?: { data: number[]; change: number; direction: 'up' | 'down' | 'stable' };
  historicalComparison?: Array<{
    date?: Date;
    passRate?: number;
    executionTime?: number;
    testCount?: number;
    metric?: string;
    current?: string;
    previous?: string;
    change?: number;
  }>;
}

export interface ExecutionHistory {
  executionId: string;
  date: Date;
  passRate: number;
  failureRate: number;
  duration: number;
  totalTests: number;
  environment?: string;
}


export interface FeatureReport {
  featureId: string;
  feature: string;
  name?: string;
  description: string;
  uri: string;
  line: number;
  keyword: string;
  tags: string[];
  background?: BackgroundReport;
  scenarios: ScenarioSummary[];
  status: TestStatus;
  startTime: Date;
  endTime: Date;
  duration: number;
  statistics: FeatureStatistics;
  metadata: Record<string, any>;
}

export interface BackgroundReport {
  keyword: string;
  name: string;
  description: string;
  steps: StepReport[];
  status: TestStatus;
}

export interface FeatureStatistics {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  skippedScenarios: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  avgScenarioDuration: number;
  maxScenarioDuration: number;
  minScenarioDuration: number;
  passRate: number;
}

export interface ScenarioSummary {
  scenarioId: string;
  name: string;
  status: TestStatus;
  duration: number;
  retryCount: number;
  description?: string;
  tags?: string[];
  line?: number;
  keyword?: string;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  errorStack?: string;
  errorDetails?: string;
  steps?: Array<{
    keyword: string;
    text: string;
    status: TestStatus;
    duration: number;
    line?: number;
    error?: string;
    errorStack?: string;
    dataTable?: any[];
    docString?: string;
  }>;
  parameters?: Record<string, any>;
  examples?: any;
  screenshots?: Array<{ name?: string; path: string }>;
  videos?: Array<{ name?: string; path: string }>;
  logs?: Array<{
    timestamp: Date;
    level: string;
    message: string;
  }>;
}


export interface ScenarioReport {
  scenarioId: string;
  scenario: string;
  description: string;
  feature: string;
  featureId: string;
  uri: string;
  line: number;
  keyword: string;
  tags: string[];
  steps: StepReport[];
  status: TestStatus;
  startTime: Date;
  endTime: Date;
  duration: number;
  retryCount: number;
  dataSet?: DataSetInfo;
  hooks: HookReport[];
  evidence: ScenarioEvidence;
  error?: ErrorDetails;
  aiHealing?: AIHealingAttempt[];
  context: ScenarioContext;
  networkLogs?: NetworkLog[];
  videos?: Array<{ name?: string; path: string }>;
  consoleLogs?: ConsoleLog[];
}

export enum TestStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  PENDING = 'pending',
  UNDEFINED = 'undefined',
  AMBIGUOUS = 'ambiguous'
}

export interface DataSetInfo {
  index: number;
  name: string;
  parameters: Record<string, any>;
  source: string;
}

export interface HookReport {
  type: HookType;
  status: TestStatus;
  duration: number;
  error?: ErrorDetails;
}

export interface ScenarioContext {
  browser: string;
  viewport: ViewportSize;
  userAgent: string;
  device?: string;
  worker?: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}


export interface StepReport {
  stepId: string;
  keyword: string;
  text: string;
  line: number;
  status: TestStatus;
  startTime: Date;
  endTime: Date;
  duration: number;
  match?: StepMatch;
  result: StepResult;
  embeddings: Embedding[];
  rows?: DataTableRow[];
  docString?: DocString;
  actions: ActionLog[];
  aiIdentification?: AIElementIdentification;
  subSteps?: SubStep[];
}

export interface StepMatch {
  location: string;
  arguments: StepArgument[];
}

export interface StepArgument {
  value: string;
  offset: number;
  parameterType: string;
}

export interface StepResult {
  status: TestStatus;
  duration: number;
  error?: ErrorDetails;
  screenshot?: string;
}

export interface DataTableRow {
  cells: string[];
}

export interface DocString {
  contentType: string;
  content: string;
  line: number;
}

export interface SubStep {
  action: string;
  target?: string;
  value?: any;
  duration: number;
  status: TestStatus;
  error?: string;
}


export interface EvidenceCollection {
  screenshots: Screenshot[];
  videos: Video[];
  traces: Trace[];
  networkLogs: NetworkLog[];
  consoleLogs: ConsoleLog[];
  performanceLogs: PerformanceLog[];
  downloads: Download[];
  uploads: Upload[];
  har?: HARFile;
  custom?: CustomEvidence[];
  logs?: any[];
}

export interface ScenarioEvidence {
  screenshots: string[];
  video?: string;
  trace?: string;
  networkHAR?: string;
  consoleLogs: ConsoleLog[];
}

export interface Screenshot {
  id: string;
  filename: string;
  path: string;
  base64?: string;
  scenarioId: string;
  stepId?: string;
  type: ScreenshotType;
  timestamp: Date;
  description: string;
  size: number;
  dimensions: ImageDimensions;
  annotations?: Annotation[];
}

export enum ScreenshotType {
  STEP = 'step',
  FAILURE = 'failure',
  DEBUG = 'debug',
  COMPARISON = 'comparison',
  FULLPAGE = 'fullpage',
  ELEMENT = 'element'
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface Annotation {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

export interface Video {
  id: string;
  filename: string;
  path: string;
  scenarioId: string;
  size: number;
  duration: number;
  format: string;
  resolution: string;
  fps: number;
  timestamp: Date;
}

export interface Trace {
  id: string;
  filename: string;
  path: string;
  scenarioId: string;
  size: number;
  duration: number;
  timestamp: Date;
  viewerUrl?: string;
}

export interface NetworkLog {
  id: string;
  timestamp: Date;
  method: string;
  url: string;
  status: number;
  duration: number;
  requestSize: number;
  responseSize: number;
  headers: Record<string, string>;
  timing: NetworkTiming;
  startTime?: Date;
  endTime?: Date;
  size?: number;
  resourceType?: string;
  cached?: boolean;
  error?: string;
  requestBody?: string;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
}

export interface ConsoleLog {
  timestamp: Date;
  level: ConsoleLogLevel;
  message: string;
  source: string;
  location?: string;
  stackTrace?: string;
}

export enum ConsoleLogLevel {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose'
}

export interface PerformanceLog {
  timestamp: Date;
  metric: string;
  value: number;
  unit: string;
  context: string;
}

export interface Download {
  id: string;
  scenarioId: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  timestamp: Date;
}

export interface Upload {
  id: string;
  scenarioId: string;
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  timestamp: Date;
  destination: string;
}

export interface CustomEvidence {
  id: string;
  type: string;
  name: string;
  data: any;
  scenarioId?: string;
  stepId?: string;
  timestamp: Date;
}


export interface ActionLog {
  id: string;
  timestamp: Date;
  type: ActionType;
  target: string;
  action: string;
  parameters: any[];
  duration: number;
  success: boolean;
  error?: string;
  screenshot?: string;
  elementInfo?: ElementInfo;
}

export enum ActionType {
  NAVIGATION = 'navigation',
  CLICK = 'click',
  TYPE = 'type',
  SELECT = 'select',
  WAIT = 'wait',
  ASSERTION = 'assertion',
  API_CALL = 'apiCall',
  DB_QUERY = 'dbQuery',
  SCREENSHOT = 'screenshot',
  CUSTOM = 'custom'
}

export interface ElementInfo {
  selector: string;
  tag: string;
  text: string;
  attributes: Record<string, string>;
  visible: boolean;
  enabled: boolean;
  position: ElementPosition;
}

export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}


export interface ReportMetrics {
  execution: ExecutionMetrics;
  browser: BrowserMetrics;
  network: NetworkMetrics;
  system: SystemMetrics;
  custom?: Record<string, any>;
  performance?: any;
  resources?: any;
}

export interface QualityMetrics {
  testCoverage: number;
  codeCoverage?: number;
  bugDensity: number;
  defectEscapeRate: number;
  automationRate: number;
  flakiness: number;
  reliability: number;
  maintainabilityIndex: number;
  technicalDebt: number;
  testEffectiveness: number;
  meanTimeToDetect: number;
  meanTimeToRepair: number;
  flakyTests: Array<{ name: string; flakinessRate: number; flakyRate?: number }>;
  criticalBugs: number;
  majorBugs: number;
  minorBugs: number;
  scenarioPassRate: number;
  stepPassRate: number;
  failureRate: number;
  skipRate: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  failuresByType: Array<{ type: string; count: number }>;
  failuresByStep: Array<{ step: string; count: number }>;
  elementCoverage: number;
  apiCoverage: number;
  criticalFailures: Array<{ scenario: string; impact: string }>;
  stabilityScore?: number;
}

export interface ExecutionMetrics {
  totalDuration: number;
  setupDuration: number;
  testDuration: number;
  teardownDuration: number;
  avgScenarioDuration: number;
  avgStepDuration: number;
  parallelEfficiency: number;
  queueTime: number;
  retryRate: number;
  timeToFirstFailure?: number;
  totalFeatures?: number;
  parallelWorkers?: number;
  avgWorkerUtilization?: number;
  totalRetries?: number;
  tagDistribution?: Array<{ tag: string; count: number }> | Record<string, number>;
}

export interface BrowserMetrics {
  pageLoadTime: number;
  domContentLoaded: number;
  firstPaint: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  timeToInteractive: number;
  totalBlockingTime: number;
  cumulativeLayoutShift: number;
  memoryUsage: MemoryUsage;
  consoleErrors: number;
  consoleWarnings: number;
  navigation?: {
    domainLookupEnd: number;
    domainLookupStart: number;
    loadEventEnd: number;
    loadEventStart: number;
    redirectEnd: number;
    redirectStart: number;
    responseEnd: number;
    responseStart: number;
  };
  resources?: any[];
}

export interface MemoryUsage {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface NetworkMetrics {
  totalRequests: number;
  failedRequests: number;
  cachedRequests: number;
  avgResponseTime: number;
  totalDataTransferred: number;
  totalDataSent: number;
  totalDataReceived: number;
  slowestRequest: NetworkRequest;
  cacheHitRate: number;
  requestsByType: Record<string, number>;
  requestsByDomain: Record<string, number>;
  successfulRequests: number;
  totalBytesTransferred: number;
  totalTime: number;
  averageResponseTime: number;
  thirdPartyRequests: number;
  resourceTypes: Record<string, number>;
  protocols: Record<string, number>;
  domains: Record<string, number>;
  thirdPartyCategories: Record<string, number>;
  pageUrl: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskIO?: number;
  networkLatency?: number;
  processCount: number;
  timestamp?: Date;
  cpu?: {
    usage: number;
    cores: number;
    model?: string;
  };
  memory?: {
    used: number;
    total: number;
    free: number;
    percent: number;
  };
  disk?: {
    read: number;
    write: number;
    usage: number;
  };
}


export interface NetworkAnalysis {
  summary: NetworkSummary;
  requests: NetworkRequest[];
  timeline: NetworkTimeline;
  performance: NetworkPerformance;
  errors: NetworkError[];
  failures: NetworkFailure[];
  mocks: MockedRequest[];
  waterfall: NetworkWaterfall;
}

export interface NetworkSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDataSent: number;
  totalDataReceived: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  totalDuration: number;
}

export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  status: number;
  responseTime: number;
  size: number;
  type: string;
  startTime: Date;
  endTime: Date;
  headers: Record<string, string>;
  timing: NetworkTiming;
}

export interface NetworkTiming {
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
  total: number;
}

export interface NetworkTimeline {
  entries: TimelineEntry[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface TimelineEntry {
  id: string;
  name: string;
  type: string;
  startTime: number;
  duration: number;
  status: string;
  details: any;
}

export interface NetworkPerformance {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number;
  errorRate: number;
  byDomain: Record<string, DomainMetrics>;
  byResourceType: Record<string, ResourceMetrics>;
  slowestRequests?: any[];
  largestRequests?: any[];
  failedRequests?: any[];
  blockedRequests?: any[];
  renderBlockingResources?: any[];
  resourceTimings?: ResourceTiming[];
  criticalPath?: any;
}

export interface DomainMetrics {
  requestCount: number;
  avgResponseTime: number;
  totalDataTransferred: number;
  errorRate: number;
}

export interface ResourceMetrics {
  count: number;
  totalSize: number;
  avgSize: number;
  avgDuration: number;
}

export interface NetworkWaterfall {
  entries: WaterfallEntry[];
  totalDuration: number;
  criticalPath: string[];
  startTime: number;
  endTime: number;
  duration: number;
}

export interface WaterfallEntry {
  id: string;
  url: string;
  method: string;
  status: number;
  startTime: number;
  timing: NetworkTiming;
  size: number;
  type: string;
  duration: number;
  mimeType: string;
  resourceType: string;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    ssl: number;
    send: number;
    wait: number;
    receive: number;
  };
  compressed: number;
  priority: string;
  initiator: string;
}

export interface NetworkError {
  timestamp: Date;
  url: string;
  method: string;
  error: string;
  code: string;
  stack?: string;
}

export interface NetworkFailure {
  requestId: string;
  url: string;
  error: string;
  timestamp: Date;
  context: Record<string, any>;
}

export interface MockedRequest {
  pattern: string;
  method: string;
  response: any;
  callCount: number;
  calls: MockCall[];
}

export interface MockCall {
  timestamp: Date;
  request: any;
  matched: boolean;
}


export interface ErrorAnalysis {
  summary: ErrorSummary;
  errors: ErrorDetails[];
  commonPatterns: ErrorPattern[];
  recommendations: ErrorRecommendation[];
}

export interface ErrorSummary {
  totalErrors: number;
  uniqueErrors: number;
  errorsByType: Record<string, number>;
  errorsByFeature: Record<string, number>;
  mostCommonError: string;
  criticalErrors: number;
}

export interface ErrorDetails {
  id: string;
  timestamp: Date;
  type: ErrorType;
  message: string;
  stack: string;
  location: ErrorLocation;
  context: ErrorContext;
  screenshot?: string;
  similar: string[];
  elementInfo?: ElementErrorInfo;
  occurrences?: ErrorOccurrence[];
  severity: ErrorSeverity;
}

export enum ErrorType {
  ASSERTION = 'assertion',
  ELEMENT_NOT_FOUND = 'elementNotFound',
  TIMEOUT = 'timeout',
  NETWORK = 'network',
  SCRIPT = 'script',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

export interface ElementErrorInfo {
  selector: string;
  description: string;
  suggestedSelectors?: string[];
  healingAttempted: boolean;
  healingSuccessful?: boolean;
}

export interface ErrorLocation {
  feature: string;
  scenario: string;
  step: string;
  line: number;
  file: string;
}

export interface ErrorContext {
  browser: string;
  viewport: string;
  url: string;
  elementSelector?: string;
  apiEndpoint?: string;
  databaseQuery?: string;
  additionalInfo: Record<string, any>;
}

export interface ErrorOccurrence {
  scenarioId: string;
  stepId: string;
  timestamp: Date;
  context: Record<string, any>;
}

export interface ErrorPattern {
  pattern: string;
  count: number;
  examples: string[];
  recommendation: string;
  severity: ErrorSeverity;
}

export interface ErrorRecommendation {
  issue: string;
  severity: ErrorSeverity;
  recommendation: string;
  action: string;
  priority: Priority;
  affectedTests: string[];
}

export enum ErrorSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum Priority {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}


export interface AIHealingReport {
  summary: AIHealingSummary;
  healingAttempts: AIHealingAttempt[];
  elementAnalysis: ElementAnalysis[];
  recommendations: AIRecommendation[];
  statistics: HealingStatistics;
}

export interface AIHealingSummary {
  totalAttempts: number;
  successfulHeals: number;
  failedHeals: number;
  healingRate: number;
  avgConfidence: number;
  mostHealedElements: ElementHealingStats[];
  elementsHealed: number;
  timeSaved: number;
}

export interface AIHealingAttempt {
  attemptId: string;
  timestamp: Date;
  elementDescription: string;
  originalLocator: string;
  healedLocator: string;
  strategy: string;
  confidence: number;
  success: boolean;
  duration: number;
  scenarioId: string;
  element?: string;
  recommendation?: string;
  errorMessage?: string;
  screenshot?: string;
  alternatives?: Array<{ locator: string; confidence: number; reason?: string }>;
}

export interface AIElementIdentification {
  description: string;
  confidence: number;
  strategy: string;
  alternatives: AIAlternative[];
}

export interface AIAlternative {
  locator: string;
  confidence: number;
  reason: string;
}

export interface ElementHealingStats {
  element: string;
  healCount: number;
  successRate: number;
  avgConfidence: number;
}

export interface ElementAnalysis {
  elementId: string;
  element: string;
  description: string;
  stability: number;
  changes: number;
  healingCount: number;
  recommendations: string[];
  suggestions: LocatorSuggestion[];
  trends: ElementTrend[];
}

export interface LocatorSuggestion {
  locator: string;
  type: string;
  confidence: number;
  stability: number;
  reason: string;
}

export interface ElementTrend {
  date: Date;
  stability: number;
  healingRequired: boolean;
  locatorChanged: boolean;
}

export interface AIRecommendation {
  element: string;
  issue: string;
  recommendation: string;
  suggestedLocator: string;
  confidence: number;
  priority: Priority;
  impact: string;
  suggestedAction: string;
}

export interface HealingStatistics {
  healingByStrategy: Record<string, number>;
  healingByConfidence: ConfidenceDistribution;
  healingByElement: Record<string, number>;
  avgHealingTime: number;
  totalTimeSaved: number;
}

export interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
}


export interface LogCollection {
  executionLogs: ExecutionLog[];
  frameworkLogs: FrameworkLog[];
  testLogs: TestLog[];
  systemLogs: SystemLog[];
}

export interface ExecutionLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  context: LogContext;
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace'
}

export interface LogContext {
  scenarioId?: string;
  stepId?: string;
  feature?: string;
  [key: string]: any;
}

export interface FrameworkLog {
  timestamp: Date;
  component: string;
  action: string;
  details: any;
}

export interface TestLog {
  timestamp: Date;
  message: string;
  type: string;
  data?: any;
}

export interface SystemLog {
  timestamp: Date;
  source: string;
  message: string;
  severity: string;
}


export interface ChartDataCollection {
  executionPieChart: PieChartData;
  passRateTrend: LineChartData;
  featureBarChart: BarChartData;
  durationHistogram: HistogramData;
  errorDistribution: PieChartData;
  performanceRadar: RadarChartData;
  networkWaterfall: WaterfallChartData;
  timelineGantt: GanttChartData;
  heatmap: HeatmapData;
  customCharts: Record<string, ChartData>;
}

export interface ChartData {
  type: ChartType;
  title: string;
  data: any;
  options: ChartOptions;
}

export enum ChartType {
  PIE = 'pie',
  DOUGHNUT = 'doughnut',
  BAR = 'bar',
  LINE = 'line',
  AREA = 'area',
  RADAR = 'radar',
  SCATTER = 'scatter',
  BUBBLE = 'bubble',
  HISTOGRAM = 'histogram',
  WATERFALL = 'waterfall',
  GANTT = 'gantt',
  HEATMAP = 'heatmap',
  GAUGE = 'gauge',
  TREEMAP = 'treemap',
  SUNBURST = 'sunburst',
  SANKEY = 'sankey',
  POLAR = 'polar',
  BOX = 'box',
  VIOLIN = 'violin',
  FUNNEL = 'funnel'
}

export interface ChartOptions {
  width?: number;
  height?: number;
  colors?: string[];
  legend?: boolean | LegendOptions;
  animations?: boolean | AnimationOptions;
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  tooltip?: TooltipOptions;
  scales?: ScaleOptions;
  plugins?: Record<string, any>;
  title?: string;
  showLegend?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showValues?: boolean;
}

export interface AnimationOptions {
  duration: number;
  easing: string;
  delay?: number;
}

export interface LegendOptions {
  display: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export interface TooltipOptions {
  enabled: boolean;
  mode: 'point' | 'nearest' | 'index' | 'dataset';
  intersect: boolean;
}

export interface ScaleOptions {
  x?: AxisOptions;
  y?: AxisOptions;
}

export interface AxisOptions {
  display: boolean;
  title?: {
    display: boolean;
    text: string;
  };
  ticks?: {
    min?: number;
    max?: number;
    stepSize?: number;
  };
}

export interface PieChartData extends ChartData {
  type: ChartType.PIE | ChartType.DOUGHNUT;
  labels: string[];
  values: number[];
  colors: string[];
}

export interface BarChartData extends ChartData {
  type: ChartType.BAR;
  labels: string[];
  datasets: BarDataset[];
}

export interface BarDataset {
  label: string;
  data: number[];
  backgroundColor: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
}

export interface LineChartData extends ChartData {
  type: ChartType.LINE | ChartType.AREA;
  labels: string[];
  datasets: LineDataset[];
}

export interface LineDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor?: string;
  fill?: boolean;
  tension?: number;
  pointBackgroundColor?: string;
  pointBorderColor?: string;
  pointRadius?: number;
}

export interface RadarChartData extends ChartData {
  type: ChartType.RADAR | ChartType.POLAR;
  labels: string[];
  datasets: RadarDataset[];
}

export interface RadarDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  pointBackgroundColor?: string;
  pointBorderColor?: string;
}

export interface ScatterChartData extends ChartData {
  type: ChartType.SCATTER | ChartType.BUBBLE;
  datasets: ScatterDataset[];
}

export interface ScatterDataset {
  label: string;
  data: Array<{ x: number; y: number; r?: number }>;
  backgroundColor: string | string[];
  borderColor?: string | string[];
}

export interface HistogramData extends ChartData {
  type: ChartType.HISTOGRAM;
  bins: number[];
  frequencies: number[];
  binWidth: number;
}

export interface WaterfallChartData extends ChartData {
  type: ChartType.WATERFALL;
  categories: string[];
  values: number[];
  isTotal: boolean[];
}

export interface GanttChartData extends ChartData {
  type: ChartType.GANTT;
  tasks: GanttTask[];
  startTime: Date;
  endTime: Date;
}

export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  dependencies?: string[];
  color?: string;
}

export interface HeatmapData extends ChartData {
  type: ChartType.HEATMAP;
  xLabels: string[];
  yLabels: string[];
  data: number[][];
  minValue: number;
  maxValue: number;
  colorScale?: string;
}

export interface TreemapData extends ChartData {
  type: ChartType.TREEMAP;
  data: TreemapNode[];
}

export interface TreemapNode {
  name: string;
  label?: string;
  value: number;
  color?: string;
  children?: TreemapNode[];
}

export interface BoxPlotData extends ChartData {
  type: ChartType.BOX | ChartType.VIOLIN;
  labels: string[];
  datasets: BoxPlotDataset[];
}

export interface BoxPlotDataset {
  label: string;
  data: Array<{
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outliers?: number[];
  }>;
}

export interface ChartColors {
  dataColors: string[];
  backgroundColor?: string;
  textColor?: string;
  gridColor?: string;
  primaryColor?: string;
  primaryDark?: string;
  heatmapColors?: string[];
}

export interface Point {
  x: number;
  y: number;
  r?: number;
  label?: string;
  value?: number;
}

export interface DataSet {
  label: string;
  data: number[] | Point[];
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
}

export interface DoughnutChart extends ChartData {
  labels: string[];
  values: number[];
  centerText?: {
    value: string;
    label: string;
  };
}

export interface BarChart extends ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

export interface LineChart extends ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
    fill?: boolean;
    smooth?: boolean;
    borderWidth?: number;
    pointRadius?: number;
  }>;
}

export interface AreaChart extends ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

export interface PieChart extends ChartData {
  labels: string[];
  values: number[];
}

export interface RadarChart extends ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

export interface ScatterChart extends ChartData {
  datasets: Array<{
    label: string;
    data: Point[];
    color?: string;
    pointRadius?: number;
  }>;
}

export interface BubbleChart extends ChartData {
  datasets: Array<{
    label: string;
    data: Point[];
    color?: string;
  }>;
}

export interface HeatmapChart extends ChartData {
  xLabels: string[];
  yLabels: string[];
  data: number[][];
}

export interface TreemapChart extends ChartData {
  data: TreemapNode[];
}

export interface SankeyChart extends ChartData {
  nodes: Array<{
    id: string;
    label: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    value: number;
  }>;
}

export interface GaugeChart extends ChartData {
  value: number;
  min: number;
  max: number;
  label?: string;
  zones?: Array<{
    min: number;
    max: number;
    color: string;
    label?: string;
  }>;
}

export interface WaterfallChart extends ChartData {
  categories: string[];
  values: number[];
}

export interface FunnelChart extends ChartData {
  labels: string[];
  values: number[];
}


export interface ReportConfiguration {
  theme: ReportTheme;
  exportFormats: ExportFormat[];
  includeEvidence: EvidenceConfig;
  charts: ChartConfig;
  sections: SectionConfig[];
  customizations: CustomizationConfig;
}

export interface ReportTheme {
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  failureColor: string;
  warningColor: string;
  infoColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: string;
  logo?: string;
  customCSS?: string;
  colors?: {
    primary: string;
    secondary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    danger: string;
    background: string;
    backgroundDark: string;
    text: string;
    textLight: string;
    border: string;
    borderLight: string;
    good: string;
    fair: string;
    poor: string;
    primaryDark?: string;
    [key: string]: string | undefined;
  };
}

export enum ExportFormat {
  HTML = 'html',
  PDF = 'pdf',
  EXCEL = 'excel',
  JSON = 'json',
  XML = 'xml',
  CSV = 'csv',
  MARKDOWN = 'markdown',
  CONFLUENCE = 'confluence',
  JIRA = 'jira'
}

export interface EvidenceConfig {
  includeScreenshots: boolean;
  includeVideos: boolean;
  includeTraces: boolean;
  includeNetworkLogs: boolean;
  includeConsoleLogs: boolean;
  maxScreenshotsPerScenario: number;
  compressImages: boolean;
  embedInReport: boolean;
}

export interface ChartConfig {
  enableCharts: boolean;
  chartTypes: ChartType[];
  interactive: boolean;
  exportable: boolean;
  customCharts: CustomChartConfig[];
}

export interface CustomChartConfig {
  name: string;
  type: ChartType;
  dataSource: string;
  options: ChartOptions;
}

export interface SectionConfig {
  name: string;
  enabled: boolean;
  order: number;
  collapsed: boolean;
  customTemplate?: string;
}

export interface CustomizationConfig {
  companyName?: string;
  projectName?: string;
  customHeaders?: Record<string, string>;
  customFooters?: Record<string, string>;
  customMetrics?: CustomMetricConfig[];
  webhooks?: WebhookConfig[];
  customBranding?: CustomBranding;
}

export interface CustomBranding {
  logo?: string;
  companyName?: string;
  watermark?: boolean;
  customCSS?: string;
}

export interface CustomMetricConfig {
  name: string;
  query: string;
  unit: string;
  threshold?: number;
  display: 'value' | 'chart' | 'both';
}

export interface WebhookConfig {
  url: string;
  events: string[];
  headers?: Record<string, string>;
  payload?: any;
}


export interface ReportGenerationOptions {
  outputDir: string;
  reportName: string;
  formats: ExportFormat[];
  parallel: boolean;
  compress: boolean;
  upload: UploadConfig[];
  notifications: NotificationConfig[];
}

export interface UploadConfig {
  type: 'ado' | 's3' | 'sharepoint' | 'confluence';
  config: any;
}

export interface NotificationConfig {
  type: 'email' | 'teams' | 'slack' | 'webhook';
  config: any;
}

export interface ReportGenerationResult {
  success: boolean;
  reportPaths: ReportPath[];
  errors: string[];
  duration: number;
  uploadResults?: UploadResult[];
  notificationResults?: NotificationResult[];
}

export interface ReportPath {
  format: ExportFormat;
  path: string;
  size: number;
}

export interface UploadResult {
  type: string;
  success: boolean;
  url?: string;
  error?: string;
}

export interface NotificationResult {
  type: string;
  success: boolean;
  error?: string;
}


export interface ReportTemplate {
  name: string;
  description: string;
  sections: TemplateSection[];
  styles: TemplateStyles;
  scripts: TemplateScripts;
}

export interface TemplateSection {
  id: string;
  type: string;
  title: string;
  template: string;
  data: string;
  options: any;
}

export interface TemplateStyles {
  inline: string;
  external: string[];
}

export interface TemplateScripts {
  inline: string;
  external: string[];
}


export interface IEvidenceCollector {
  collect(context: any): Promise<Evidence>;
  clear(): void;
}

export interface Evidence {
  id?: string;
  type: string | EvidenceType;
  timestamp: Date | number;
  data?: any;
  scenarioId?: string;
  path?: string;
  size?: number;
  metadata?: any;
  tags?: string[];
}

export interface IMetricsCollector {
  startCollection(): void;
  stopCollection(): void;
  getMetrics(): any;
}

export interface ILogCollector {
  startCapture(): void;
  stopCapture(): void;
  getLogs(): any[];
}


export interface Embedding {
  mimeType: string;
  data: string;
  name?: string;
}

export enum MimeType {
  TEXT = 'text/plain',
  HTML = 'text/html',
  JSON = 'application/json',
  PNG = 'image/png',
  JPEG = 'image/jpeg',
  GIF = 'image/gif',
  PDF = 'application/pdf',
  VIDEO_MP4 = 'video/mp4',
  VIDEO_WEBM = 'video/webm'
}


export interface HARFile {
  log: {
    version: string;
    creator: {
      name: string;
      version: string;
    };
    entries: HAREntry[];
  };
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: HARRequest;
  response: HARResponse;
  timings: HARTimings;
}

export interface HARRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: Array<{ name: string; value: string }>;
  queryString: Array<{ name: string; value: string }>;
  bodySize: number;
}

export interface HARResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: Array<{ name: string; value: string }>;
  content: {
    size: number;
    mimeType: string;
  };
}

export interface HARTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
}


export interface TimelineData {
  entries: TimelineEntry[];
  startTime: Date;
  endTime: Date;
  duration: number;
  milestones: Milestone[];
}

export interface Milestone {
  name: string;
  timestamp: Date;
  type: 'start' | 'end' | 'event';
  description?: string;
}


export interface ExecutionOptions {
  env: string;
  tags?: string;
  features?: string[];
  scenarios?: string[];
  parallel?: boolean;
  workers?: number;
  retry?: number;
  timeout?: number;
  debug?: boolean;
  dryRun?: boolean;
  reportName?: string;
  reportFormat?: string[];
  video?: boolean;
  trace?: boolean;
  headed?: boolean;
  slowMo?: number;
  browser?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export enum TimePeriod {
  LAST_HOUR = 'last_hour',
  LAST_24_HOURS = 'last_24_hours',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  CUSTOM = 'custom'
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export interface FilterOptions {
  status?: TestStatus[];
  tags?: string[];
  features?: string[];
  dateRange?: DateRange;
  search?: string;
  environment?: string;
}

export interface FilterCriteria {
  status?: TestStatus[];
  tags?: string[];
  features?: string[];
  dateRange?: DateRange;
  searchText?: string;
  environment?: string;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
  total?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface ResponseWrapper<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}


export enum ReportEvent {
  GENERATION_STARTED = 'generationStarted',
  GENERATION_PROGRESS = 'generationProgress',
  GENERATION_COMPLETED = 'generationCompleted',
  GENERATION_FAILED = 'generationFailed',
  SECTION_STARTED = 'sectionStarted',
  SECTION_COMPLETED = 'sectionCompleted',
  EXPORT_STARTED = 'exportStarted',
  EXPORT_COMPLETED = 'exportCompleted',
  UPLOAD_STARTED = 'uploadStarted',
  UPLOAD_COMPLETED = 'uploadCompleted',
  NOTIFICATION_SENT = 'notificationSent'
}

export interface ReportEventData {
  event: ReportEvent;
  timestamp: Date;
  data: any;
}


export interface ExecutionResult {
  executionId: string;
  startTime: Date;
  endTime: Date;
  status: ExecutionStatus;
  environment: string;
  features: FeatureReport[];
  scenarios: ScenarioReport[];
  totalFeatures: number;
  totalScenarios: number;
  totalSteps: number;
  passedFeatures: number;
  passedScenarios: number;
  passedSteps: number;
  failedFeatures: number;
  failedScenarios: number;
  failedSteps: number;
  skippedFeatures: number;
  skippedScenarios: number;
  skippedSteps: number;
  duration: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ReportOptions {
  outputDir?: string;
  reportName?: string;
  environment?: string;
  formats?: ExportFormat[];
  theme?: Partial<ReportTheme>;
  includeTimestamp?: boolean;
  parallel?: boolean;
  compress?: boolean;
}

export interface ReportResult {
  reportId: string;
  reportPath: string;
  reportPaths: ReportPath[];
  generatedAt: Date;
  duration: number;
  success: boolean;
  errors?: string[];
  metadata?: Record<string, any>;
}

export interface AggregatedData {
  executionResult: ExecutionResult;
  evidence: EvidenceCollection;
  summary: ExecutionSummary;
  metrics: ReportMetrics;
  trends?: TrendData;
  metadata?: Record<string, any>;
}

export type ScenarioResult = ScenarioReport;

export type FeatureResult = FeatureReport;

export interface CollectedData {
  screenshots: Screenshot[];
  videos: Video[];
  logs: ExecutionLog[];
  metrics: PerformanceLog[];
  network: NetworkLog[];
  traces: Trace[];
  metadata?: Record<string, any>;
}

export interface ReportTask {
  taskId: string;
  name: string;
  schedule: string;
  enabled: boolean;
  reportConfig: ReportConfiguration;
  lastRun?: Date;
  nextRun?: Date;
  status?: 'idle' | 'running' | 'completed' | 'failed';
  options: {
    source: {
      type: 'file' | 'api' | 'database';
      path?: string;
      endpoint?: string;
      query?: string;
      headers?: Record<string, string>;
    };
    filters?: {
      dateRange?: {
        start?: string;
        end?: string;
      };
      tags?: string[];
      status?: string;
    };
    reportConfig?: ReportConfiguration;
  };
  postActions?: Array<{
    type: 'email' | 'upload' | 'webhook' | 'archive';
    config: any;
  }>;
  lastResult?: {
    reportId: string;
    reportPath: string;
    duration: number;
    success: boolean;
  };
}

export interface ScheduleOptions {
  cronExpression: string;
  timezone?: string;
  immediate?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export interface ScheduleResult {
  taskId: string;
  scheduled: boolean;
  nextRun?: Date;
  error?: string;
}

export interface ReportData {
  metadata: ReportMetadata;
  configuration: ReportConfiguration;
  summary: ExecutionSummary;
  features: FeatureReport[];
  scenarios: ScenarioReport[];
  evidence: EvidenceCollection;
  metrics: ReportMetrics;
  aggregatedData?: AggregatedData;
  environment?: string;
  tags?: string[];
  logs?: any[];
}


export interface NetworkEntry {
  id: string;
  scenarioId: string;
  stepId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
    resourceType?: string;
    timestamp: string;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
    bodySize: number;
    content: {
      size: number;
      mimeType: string;
      text: string;
      encoding: string;
      compression: number;
    };
    timestamp: string;
    error?: string;
    httpVersion: string;
    cookies: any[];
    redirectURL: string;
  } | null;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    ssl: number;
    send: number;
    wait: number;
    receive: number;
  };
  serverIPAddress: string;
  connection: string;
  cache: CacheInfo;
  pageref: string;
  serverTiming?: ServerTiming[];
  priority?: string;
  initiator?: {
    type: string;
    url?: string;
    lineNumber?: number;
  };
}

export interface WebSocketFrame {
  id: string;
  timestamp: string;
  direction: 'sent' | 'received';
  opcode: number;
  mask: boolean;
  payload: string;
  type: string;
  size: number;
  wsUrl: string;
  wsId: string;
  stepId?: string;
}

export interface SecurityInfo {
  url: string;
  protocol: string;
  hostname: string;
  timestamp: string;
  securityHeaders: Record<string, string | null>;
  issues: Array<{
    severity: string;
    issue: string;
    recommendation: string;
  }>;
  score: number;
}

export interface ResourceTiming {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  initiatorType: string;
  nextHopProtocol: string;
  workerStart: number;
  redirectStart: number;
  redirectEnd: number;
  fetchStart: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  serverTiming: any[];
}

export interface NetworkAnalysis {
  summary: NetworkSummary;
  performance: NetworkPerformance;
  resourceBreakdown: Record<string, any>;
  thirdPartyAnalysis: ThirdPartyAnalysis;
  cacheAnalysis: CacheAnalysis;
  securityAnalysis: {
    httpsRequests: number;
    httpRequests: number;
    securityHeaders: {
      present: number;
      missing: number;
      issues: any[];
    };
  };
  recommendations: any[];
  bandwidth?: any;
  protocols?: any;
}

export interface ThirdPartyAnalysis {
  totalRequests: number;
  domains: Record<string, number>;
  categories: Record<string, number>;
  performanceImpact: number;
  dataTransferred: number;
}

export interface CacheAnalysis {
  cacheableResources: number;
  cachedResources: number;
  cacheHitRate: number;
  potentialSavings: number;
  recommendations: any[];
}

export interface PerformanceImpact {
  responseTime: number;
  dataTransferred: number;
  resourceCount: number;
}

export interface StepTiming {
  stepId: string;
  startTime: number;
  endTime: number;
  requests: string[];
  webSocketFrames: string[];
}

export interface NetworkSummary {
  totalRequests: number;
  totalDataTransferred: number;
  totalTime: number;
  averageResponseTime: number;
  failedRequests: number;
  cachedRequests: number;
  thirdPartyRequests: number;
  scenarios: Record<string, any>;
  harFiles: string[];
  analysisReports: string[];
  waterfallFiles: string[];
  securityReports: string[];
  webSocketReport?: string;
}

export interface CacheInfo {
  cacheControl?: string;
  etag?: string;
  lastModified?: string;
  expires?: string;
  pragma?: string;
  age?: string;
  vary?: string;
  isCacheable: boolean;
  maxAge: number;
  isPrivate: boolean;
  isPublic: boolean;
  mustRevalidate: boolean;
  noCache: boolean;
  noStore: boolean;
  sMaxAge?: number;
}

export interface ServerTiming {
  name: string;
  duration: number;
  description: string;
}

export interface NetworkCollectorOptions {
  captureWebSockets?: boolean;
  captureHAR?: boolean;
  analyzePerformance?: boolean;
  analyzeSecurity?: boolean;
  analyzeThirdParty?: boolean;
  captureResponseBodies?: boolean;
  maxResponseBodySize?: number;
  throttling?: NetworkThrottling | null;
}

export interface NetworkThrottling {
  downloadThroughput: number;
  uploadThroughput: number;
  latency: number;
  connectionType?: string;
}


export const DEFAULT_REPORT_CONFIG: ReportConfiguration = {
  theme: {
    primaryColor: '#93186C',
    secondaryColor: '#FFFFFF',
    successColor: '#28A745',
    failureColor: '#DC3545',
    warningColor: '#FFC107',
    infoColor: '#17A2B8',
    backgroundColor: '#F8F9FA',
    textColor: '#212529',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px'
  },
  exportFormats: [ExportFormat.HTML],
  includeEvidence: {
    includeScreenshots: true,
    includeVideos: true,
    includeTraces: true,
    includeNetworkLogs: true,
    includeConsoleLogs: true,
    maxScreenshotsPerScenario: 10,
    compressImages: false,
    embedInReport: true
  },
  charts: {
    enableCharts: true,
    chartTypes: [
      ChartType.PIE,
      ChartType.BAR,
      ChartType.LINE,
      ChartType.WATERFALL
    ],
    interactive: true,
    exportable: true,
    customCharts: []
  },
  sections: [
    { name: 'summary', enabled: true, order: 1, collapsed: false },
    { name: 'features', enabled: true, order: 2, collapsed: false },
    { name: 'scenarios', enabled: true, order: 3, collapsed: false },
    { name: 'errors', enabled: true, order: 4, collapsed: false },
    { name: 'evidence', enabled: true, order: 5, collapsed: false },
    { name: 'metrics', enabled: true, order: 6, collapsed: false },
    { name: 'network', enabled: true, order: 7, collapsed: true },
    { name: 'logs', enabled: true, order: 8, collapsed: true }
  ],
  customizations: {}
};

export const STATUS_ICONS = {
  passed: '✓',
  failed: '✗',
  skipped: '⊘',
  pending: '⋯',
  undefined: '?',
  ambiguous: '!'
};

export const STATUS_COLORS = {
  passed: '#28A745',
  failed: '#DC3545',
  skipped: '#6C757D',
  pending: '#FFC107',
  undefined: '#17A2B8',
  ambiguous: '#E83E8C'
};

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
  size?: number;
  format: ExportFormat;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ExportOptions {
  format: ExportFormat;
  outputPath?: string;
  includeEvidence?: boolean;
  includeCharts?: boolean;
  compress?: boolean;
  metadata?: Record<string, any>;
}

export interface PDFOptions extends ExportOptions {
  pageFormat?: PDFFormat;
  pageSize?: PDFPageSize;
  orientation?: 'portrait' | 'landscape';
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  header?: {
    enabled?: boolean;
    height?: number;
    content?: string;
  };
  footer?: {
    enabled?: boolean;
    height?: number;
    content?: string;
  };
  watermark?: {
    enabled?: boolean;
    text?: string;
    opacity?: number;
  };
  encryption?: {
    enabled?: boolean;
    userPassword?: string;
    ownerPassword?: string;
    permissions?: PDFPermissions;
  };
  compression?: boolean;
  tableOfContents?: boolean;
  pageNumbers?: boolean;
  bookmarks?: boolean;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    creator?: string;
    producer?: string;
  };
  includeToc?: boolean;
  includeBookmarks?: boolean;
  attachments?: Array<{ name: string; path: string; description?: string }>;
  optimize?: boolean;
  security?: {
    userPassword?: string;
    ownerPassword?: string;
    permissions?: PDFPermissions;
  };
  outputDir?: string;
  filename?: string;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  printBackground?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  landscape?: boolean;
  scale?: number;
  preferCSSPageSize?: boolean;
  pageRanges?: string;
  includeOutline?: boolean;
  taggedPDF?: boolean;
}

export type PDFFormat = 'A4' | 'Letter' | 'Legal' | 'Tabloid' | 'Custom';

export type PDFPageSize = [number, number] | 'A4' | 'Letter' | 'Legal' | 'Tabloid';

export interface PDFPermissions {
  printing?: boolean;
  modifying?: boolean;
  copying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  contentAccessibility?: boolean;
  documentAssembly?: boolean;
  printingHighQuality?: boolean;
}

export interface CollectorInterface {
  name: string;
  type: EvidenceType;
  initialize(sessionId: string): Promise<void>;
  collect(...args: any[]): Promise<Evidence[]>;
  getEvidence(): Evidence[];
  clear(): void;
  finalize(): Promise<void>;
}

export enum EvidenceType {
  SCREENSHOT = 'screenshot',
  VIDEO = 'video',
  LOG = 'log',
  NETWORK = 'network',
  PERFORMANCE = 'performance',
  METRICS = 'metrics',
  TRACE = 'trace',
  CUSTOM = 'custom'
}

export interface CollectorOptions {
  enabled?: boolean;
  maxSize?: number;
  maxCount?: number;
  filter?: (item: any) => boolean;
  format?: string;
  collectSystemMetrics?: boolean;
  metricsInterval?: number;
  aggregateMetrics?: boolean;
  includeGCMetrics?: boolean;
  detectMemoryLeaks?: boolean;
  enableAlerting?: boolean;
  exportFormat?: string;
  collectWebVitals?: boolean;
  performancebudget?: PerformanceThreshold[];
}

export interface MetricsData {
  executionId?: string;
  startTime?: number;
  endTime?: number;
  summary?: any;
  system?: any;
  browser?: any;
  test?: any;
  custom?: any;
  performance?: any;
  trends?: MetricTrend[];
  alerts?: Alert[];
  recommendations?: string[];
  systemMetrics?: [string, SystemMetrics[]][];
  browserMetrics?: [string, BrowserMetrics[]][] | BrowserMetrics;
  testMetrics?: [string, TestMetrics[]][];
  customMetrics?: [string, CustomMetric[]][];
  metricSnapshots?: [string, MetricSnapshot[]][];
  aggregatedData?: [string, AggregatedMetrics[]][];
  gcMetrics?: any[];
  memoryLeaks?: [string, number[]][];
  scenarios?: any[];
  features?: any[];
  networkData?: any[];
  parallelExecutions?: any[];
  elementStats?: {
    totalElements: number;
    healedElements: number;
    interactedElements?: number;
  };
  apiStats?: {
    totalRequests: number;
    avgResponseTime: number;
    totalEndpoints?: number;
    testedEndpoints?: number;
  };
}

export interface TestMetrics {
  timestamp: Date;
  scenarioId: string;
  stepId?: string;
  stepText?: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  memory?: any;
  cpu?: any;
}

export interface CustomMetric {
  name: string;
  value: number;
  unit?: string;
  type: MetricType;
  tags?: Record<string, string>;
  timestamp: Date;
  alert?: {
    threshold: number;
    severity?: AlertSeverity;
    message?: string;
  };
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

export interface AggregatedMetrics {
  startTime: number;
  endTime: number;
  samples: number;
  cpu: { min: number; max: number; avg: number; sum: number };
  memory: { min: number; max: number; avg: number; sum: number };
  disk: { min: number; max: number; avg: number; sum: number };
  responseTime: { min: number; max: number; avg: number; sum: number; p50: number; p90: number; p95: number; p99: number };
  throughput: { requests: number; bytesIn: number; bytesOut: number };
  errors: { count: number; rate: number };
}

export interface MetricSnapshot {
  timestamp: number;
  reason: string;
  system: SystemMetrics | null;
  browser: BrowserMetrics | null;
  test: TestMetrics | null;
  custom: CustomMetric[];
  aggregated: AggregatedMetrics | null;
  alerts: Alert[];
  gcMetrics: any[];
}

export interface MetricTrend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  forecast: number;
  period?: string;
  trend?: 'up' | 'down' | 'stable';
  baseline?: number;
  current?: number;
}

export interface Alert {
  id: string;
  timestamp: Date;
  severity: AlertSeverity;
  metric: string;
  message: string;
  value: number;
  threshold: number;
  condition: string;
  contextId?: string;
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface GrafanaMetric {
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
}

export interface PrometheusMetric {
  name: string;
  help: string;
  type: string;
  value: number;
  labels?: Record<string, string>;
}


export interface PerformanceMetrics {
  navigationTimings: [string, NavigationTiming[]][];
  resourceTimings: [string, ResourceTiming[]][];
  userTimings: [string, UserTiming[]][];
  coreWebVitals: [string, CoreWebVitals[]][];
  longTasks: [string, LongTask[]][];
  memorySnapshots: [string, MemoryInfo[]][];
  customMarks: [string, PerformanceEntry[]][];
  customMeasures: [string, PerformanceEntry[]][];
  avgScenarioDuration?: number;
  minScenarioDuration?: number;
  maxScenarioDuration?: number;
  p50ScenarioDuration?: number;
  p90ScenarioDuration?: number;
  p95ScenarioDuration?: number;
  p99ScenarioDuration?: number;
  avgStepDuration?: number;
  totalExecutionTime?: number;
  avgResponseTime?: number;
  avgPageLoadTime?: number;
  slowestScenarios?: Array<{ name: string; duration: number }>;
  slowestSteps?: Array<{ text: string; duration: number }>;
}

export interface CoreWebVitals {
  timestamp?: number;
  url?: string;
  LCP?: number;
  FID?: number;
  CLS?: number;
  FCP?: number;
  TTFB?: number;
  INP?: number;
  TTI?: number;
  TBT?: number;
  SI?: number;
  
  LCPDetails?: any;
  FIDDetails?: any;
  CLSDetails?: any;
  INPDetails?: any;
}

export interface NavigationTiming {
  navigationStart: number;
  unloadEventStart: number;
  unloadEventEnd: number;
  redirectStart: number;
  redirectEnd: number;
  fetchStart: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  domLoading: number;
  domInteractive: number;
  domContentLoadedEventStart: number;
  domContentLoadedEventEnd: number;
  domComplete: number;
  loadEventStart: number;
  loadEventEnd: number;
  type: string;
  redirectCount: number;
  url?: string;
  ttfb?: number;
  total?: number;
  timestamp?: number;
  dns: number;
  tcp: number;
  ssl: number;
  transfer: number;
  domProcessing: number;
  onLoad: number;
  protocol?: string;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  serverTiming?: any[];
}

export interface UserTiming {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  detail?: any;
  timestamp?: number;
  marks?: any[];
  measures?: any[];
}

export interface LongTask {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  attribution: Array<{
    name: string;
    entryType: string;
    startTime: number;
    duration: number;
    containerType: string;
    containerSrc: string;
    containerId: string;
    containerName: string;
  }>;
}

export interface MemoryInfo {
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  heapUsed?: number;
  heapTotal?: number;
  external?: number;
  arrayBuffers?: number;
}

export interface PerformanceReport {
  timestamp: number;
  scenarioId: string;
  reason: string;
  navigation: NavigationTiming | null;
  resources: ResourceTiming[];
  webVitals: CoreWebVitals | null;
  longTasks: LongTask[];
  memory: MemoryInfo | null;
  userTimings: UserTiming | null;
  summary: PerformanceSummary;
}

export interface PerformanceThreshold {
  metric: string;
  threshold: number;
  unit: string;
}

export interface PerformanceSummary {
  score: number;
  scores: any;
  grade: string;
  violations: string[];
  metrics: {
    pageLoad: number;
    domReady: number;
    resources: any;
    webVitals: CoreWebVitals;
  };
  recommendations: string[];
}

export interface PerformanceViolation {
  metric: string;
  actual: number;
  threshold: number;
  severity: 'warning' | 'error';
  description: string;
}
