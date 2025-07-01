
import { ExecutionContext } from '../context/ExecutionContext';

export interface Annotations {
  dataSource?: DataSourceConfig;
  testCase?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface DataSourceConfig {
  type: 'excel' | 'json' | 'csv' | 'database';
  source: string;
  sheet?: string;
  runFlagField?: string;
  filters?: Record<string, any>;
}

export interface MissingStepsReport {
  totalSteps: number;
  missingSteps: string[];
  ambiguousSteps: { step: string; matches: string[] }[];
  summary: {
    total: number;
    missing: number;
    ambiguous: number;
    valid: number;
  };
}

export interface TestResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  features: Feature[];
  scenarios: Scenario[];
  steps: Step[];
  startTime: Date;
  endTime: Date;
  environment: string;
}

export interface Feature {
  name: string;
  
  description?: string;
  
  uri?: string;
  
  file?: string;
  
  line?: number;
  
  tags: string[];
  
  background?: Scenario;
  
  scenarios: Scenario[];
  
  language?: string;
  
  metadata?: FeatureMetadata;
}

export interface Scenario {
  name: string;
  
  description?: string;
  
  type: 'scenario' | 'scenario_outline' | 'background';
  
  tags: string[];
  
  steps: Step[];
  
  examples?: Examples[];
  
  line?: number;
  
  featureFile?: string;
  
  id?: string;
  
  status?: ScenarioStatus;
  
  metadata?: ScenarioMetadata;
}

export interface ScenarioOutline extends Scenario {
  type: 'scenario_outline';
  examples: Examples[];
}

export interface Step {
  keyword: string;
  
  text: string;
  
  dataTable?: DataTable;
  
  docString?: DocString;
  
  line: number;
  
  status?: StepStatus;
  
  result?: StepResult;
  
  match?: StepMatch;
  
  metadata?: StepMetadata;
}

export interface Examples {
  name?: string;
  
  description?: string;
  
  tags: string[];
  
  header: string[];
  
  rows: string[][];
  
  line?: number;
}

export interface TableRow {
  cells: string[];
  
  line?: number;
}

export interface DataTable {
  rows: string[][];
  
  hashes(): Record<string, string>[];
  
  raw(): string[][];
  
  rowsWithoutHeader(): string[][];
  
  rowsHash(): Record<string, string>;
}

export interface DocString {
  contentType?: string;
  
  content: string;
  
  line?: number;
}

export interface StepDefinition {
  pattern: string | RegExp;
  
  patternString: string;
  
  implementation: Function;
  
  metadata: StepDefinitionMetadata;
  
  parameterCount: number;
  
  timeout: number;
}

export type StepDefinitionFn = (...args: any[]) => Promise<void> | void;

export interface StepDefinitionLocation {
  uri: string;
  
  line: number;
}

export interface StepMatch {
  stepText: string;
  
  matched: boolean;
  
  definition: StepDefinition | null;
  
  parameters: any[];
  
  regex?: RegExp;
  
  score?: number;
  
  error?: string;
  
  ambiguousMatches?: string[];
}

export interface MatchResult {
  stepDefinition: StepDefinition;
  
  parameters: any[];
  
  parameterInfo: ParameterInfo[];
  
  score: number;
  
  duration: number;
}

export interface ParameterInfo {
  value: any;
  
  type: string;
  
  start: number;
  
  end: number;
  
  name?: string;
}

export interface StepMatchScore {
  total: number;
  
  exactMatch: number;
  
  patternLength: number;
  
  parameterCount: number;
  
  specificity: number;
}

export type StepPattern = string | RegExp;

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number,
    public readonly file?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface FeatureFile {
  path: string;
  
  feature?: Feature;
  
  errors?: ParserError[];
  
  metadata?: {
    size: number;
    modified: Date;
    hash?: string;
  };
}

export interface RegistryStats {
  totalSteps: number;
  
  totalHooks: number;
  
  hooksByType: Record<string, number>;
  
  loadedFiles: number;
}

export interface StepResult {
  id: string;
  
  keyword?: string;
  
  text?: string;
  
  line?: number;
  
  dataTable?: DataTable;
  
  docString?: DocString;
  
  status: StepStatus;
  
  duration?: number;
  
  startTime?: Date;
  
  endTime?: Date;
  
  error?: ExecutionError;
  
  errorMessage?: string;
  
  stackTrace?: string;
  
  skippedReason?: string;
  
  attachments?: Attachment[];
  
  actionDetails?: {
    action?: string;
    target?: string;
    value?: string;
    description?: string;
    actions?: Array<{
      id?: string;
      type?: string;
      action: string;
      target?: string;
      value?: any;
      duration?: number;
      success?: boolean;
      metadata?: Record<string, any>;
    }>;
  };
}

export interface Attachment {
  data: string | Buffer;
  
  mimeType: string;
  
  name?: string;
  
  path?: string;
  
  metadata?: {
    featureName?: string;
    scenarioName?: string;
    stepLabel?: string;
    status?: string;
    [key: string]: any;
  };
}

export enum HookType {
  Before = 'Before',
  After = 'After',
  BeforeStep = 'BeforeStep',
  AfterStep = 'AfterStep',
  BeforeAll = 'BeforeAll',
  AfterAll = 'AfterAll'
}

export interface Hook {
  type: HookType;
  
  name: string;
  
  implementation: HookFn;
  
  fn?: HookFn;
  
  order?: number;
  
  tags?: string[];
  
  timeout?: number;
  
  alwaysRun?: boolean;
}

export type BeforeHookFn = (context: ExecutionContext) => Promise<void> | void;
export type AfterHookFn = (context: ExecutionContext) => Promise<void> | void;
export type BeforeStepHookFn = (context: ExecutionContext, step: Step) => Promise<void> | void;
export type AfterStepHookFn = (context: ExecutionContext, step: Step) => Promise<void> | void;
export type HookFn = BeforeHookFn | AfterHookFn | BeforeStepHookFn | AfterStepHookFn;

export interface HookResult {
  hook: Hook;
  
  status: StepStatus.PASSED | StepStatus.FAILED | StepStatus.SKIPPED;
  
  duration: number;
  
  error?: Error;
  
  timestamp?: Date;
}

export class HookError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly hook?: Hook
  ) {
    super(message);
    this.name = 'HookError';
  }
}

export interface ExecutionPlan {
  features: Feature[];
  
  scenarios: Scenario[];
  
  totalTests: number;
  
  totalFeatures: number;
  
  totalScenarios: number;
  
  executionOrder: string[];
  
  parallelGroups?: ScenarioGroup[];
  
  estimatedDuration?: number;
}

export interface ScenarioGroup {
  id: string;
  
  scenarios: Scenario[];
  
  priority: number;
  
  estimatedDuration: number;
}

export interface ExecutionResult {
  features: FeatureResult[];
  
  summary: ExecutionSummary;
  
  timestamp: Date;
  
  startTime: Date;
  
  endTime: Date;
  
  duration: number;
  
  status: ExecutionStatus;
  
  environment: string;
  
  errors?: Error[];
  
  executionStats?: any;
}

export interface FeatureResult {
  id: string;
  
  feature: Feature;
  
  name?: string;
  
  description?: string;
  
  uri?: string;
  
  tags?: string[];
  
  scenarios: ScenarioResult[];
  
  background?: BackgroundResult;
  
  status: FeatureStatus;
  
  duration: number;
  
  startTime?: Date;
  
  endTime?: Date;
  
  timestamp?: Date;
  
  metadata?: Record<string, any>;
  
  metrics?: FeatureMetrics;
  
  errors?: ExecutionError[];
}

export interface BackgroundResult {
  name: string;
  
  description?: string;
  
  steps: StepResult[];
  
  status: ScenarioStatus;
  
  duration: number;
  
  startTime: Date;
  
  endTime: Date;
  
  error?: ExecutionError;
}

export interface ScenarioResult {
  id: string;
  
  scenario: string;
  
  scenarioRef?: Scenario;
  
  steps: StepResult[];
  
  hooks?: HookResult[];
  
  status: ScenarioStatus;
  
  duration: number;
  
  startTime: Date;
  
  endTime: Date;
  
  timestamp?: Date;
  
  error?: ExecutionError | null;
  
  retries?: number;
  
  tags?: string[];
  
  attachments?: Attachment[];
  
  metadata?: Record<string, any>;
  
  adoMetadata?: {
    testCaseId?: number;
    testPlanId?: number;
    testSuiteId?: number;
  };
}

export interface ExecutionSummary {
  totalFeatures: number;
  
  totalScenarios: number;
  
  totalSteps: number;
  
  total: number;
  
  passed: number;
  
  failed: number;
  
  skipped: number;
  
  pending: number;
  
  passedSteps: number;
  
  failedSteps: number;
  
  skippedSteps: number;
  
  duration: number;
  
  parallel?: boolean;
  
  workers?: number;
  
  passRate?: number;
  
  metadata?: Record<string, any>;
}

export interface WorkerMessage {
  type: 'ready' | 'progress' | 'result' | 'error' | 'log';
  
  data: any;
  
  workerId?: number;
  
  timestamp?: Date;
}

export interface WorkerResult {
  workItemId: string;
  
  type: 'scenario' | 'feature';
  
  status: ScenarioStatus.PASSED | ScenarioStatus.FAILED | ScenarioStatus.SKIPPED;
  
  duration: number;
  
  featureFile?: string;
  
  scenarioResult?: ScenarioResult;
  
  featureResult?: FeatureResult;
  
  error?: Error;
}

export type WorkerStatus = 'idle' | 'busy' | 'error' | 'terminated';

export interface FeatureMetadata {
  author?: string;
  
  version?: string;
  
  created?: Date;
  
  modified?: Date;
  
  id?: string;
  
  requirements?: string[];
  
  [key: string]: any;
}

export interface ScenarioMetadata {
  testId?: string;
  
  priority?: 'low' | 'medium' | 'high' | 'critical';
  
  testType?: 'functional' | 'integration' | 'e2e' | 'performance' | 'security';
  
  estimatedDuration?: number;
  
  flaky?: boolean;
  
  skipReason?: string;
  
  [key: string]: any;
}

export interface StepMetadata {
  timeout?: number;
  
  retry?: number;
  
  screenshot?: boolean;
  
  [key: string]: any;
}

export interface StepDefinitionMetadata {
  file?: string;
  
  line?: number;
  
  type?: 'sync' | 'async';
  
  parameterTypes?: string[];
  
  usageCount?: number;
  
  [key: string]: any;
}

export type TokenType = 
  | 'FeatureLine'
  | 'BackgroundLine' 
  | 'ScenarioLine'
  | 'ScenarioOutlineLine'
  | 'ExamplesLine'
  | 'StepLine'
  | 'DocStringSeparator'
  | 'TableRow'
  | 'TagLine'
  | 'Comment'
  | 'Empty'
  | 'EOF';

export const TokenType = {
  FeatureLine: 'FeatureLine' as TokenType,
  BackgroundLine: 'BackgroundLine' as TokenType,
  ScenarioLine: 'ScenarioLine' as TokenType,
  ScenarioOutlineLine: 'ScenarioOutlineLine' as TokenType,
  ExamplesLine: 'ExamplesLine' as TokenType,
  StepLine: 'StepLine' as TokenType,
  DocStringSeparator: 'DocStringSeparator' as TokenType,
  TableRow: 'TableRow' as TokenType,
  TagLine: 'TagLine' as TokenType,
  Comment: 'Comment' as TokenType,
  Empty: 'Empty' as TokenType,
  EOF: 'EOF' as TokenType
} as const;

export interface Token {
  type: TokenType;
  
  value: string;
  
  line: number;
  
  column: number;
  
  indent?: number;
}

export interface Tag {
  name: string;
  
  line: number;
}

export interface Background {
  name?: string;
  
  description?: string;
  
  steps: Step[];
  
  line: number;
}

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly uri?: string
  ) {
    super(message);
    this.name = 'ParserError';
  }
}

export interface ValidationResult {
  valid: boolean;
  
  errors: ValidationError[];
  
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: string;
  
  message: string;
  
  stepText: string;
  
  severity: 'error' | 'warning' | 'info';
  
  location?: {
    uri?: string;
    line?: number;
    column?: number;
  };
  
  code?: string;
}

export interface ValidationWarning {
  message: string;
  
  location?: {
    uri?: string;
    line?: number;
    column?: number;
  };
  
  code?: string;
  
  severity?: 'low' | 'medium' | 'high';
}

export type TagExpressionNode = 
  | TagNode
  | AndNode
  | OrNode
  | NotNode;

export interface TagNode {
  type: 'tag';
  tag: string;
}

export interface AndNode {
  type: 'and';
  left: TagExpressionNode;
  right: TagExpressionNode;
}

export interface OrNode {
  type: 'or';
  left: TagExpressionNode;
  right: TagExpressionNode;
}

export interface NotNode {
  type: 'not';
  operand: TagExpressionNode;
}

export interface RuntimeOptions {
  dryRun?: boolean;
  
  failFast?: boolean;
  
  tags?: string[];
  
  name?: string | RegExp;
  
  parallel?: boolean;
  
  workers?: number;
  
  retry?: number;
  
  retryDelay?: number;
  
  strict?: boolean;
  
  order?: 'defined' | 'random';
  
  seed?: string;
}

export interface DataProviderOptions {
  source: string;
  
  sheet?: string;
  
  executionFlag?: string;
  
  keyColumn?: string;
  
  variablePrefix?: string;
}

export interface TestData {
  [key: string]: any;
  
  _execute?: boolean;
  
  _id?: string;
  
  _description?: string;
}

export interface ReportOptions {
  outputPath: string;
  
  formats: ReportFormat[];
  
  name?: string;
  
  includeScreenshots?: boolean;
  
  includeVideos?: boolean;
  
  includeLogs?: boolean;
  
  theme?: ReportTheme;
}

export type ReportFormat = 'html' | 'json' | 'xml' | 'pdf' | 'excel';

export interface ReportTheme {
  primaryColor: string;
  
  secondaryColor: string;
  
  logo?: string;
  
  customCss?: string;
}

export interface PerformanceMetrics {
  pageLoadTime?: number;
  
  domContentLoaded?: number;
  
  firstPaint?: number;
  
  firstContentfulPaint?: number;
  
  largestContentfulPaint?: number;
  
  timeToInteractive?: number;
  
  totalBlockingTime?: number;
  
  cumulativeLayoutShift?: number;
  
  custom?: Record<string, number>;
}

export interface NetworkMetrics {
  totalRequests: number;
  
  failedRequests: number;
  
  totalSize: number;
  
  averageResponseTime: number;
  
  slowestRequest?: {
    url: string;
    duration: number;
  };
  
  largestRequest?: {
    url: string;
    size: number;
  };
}

export interface ExecutionMetrics {
  totalTime: number;
  
  setupTime: number;
  
  teardownTime: number;
  
  testTime: number;
  
  averageTestTime: number;
  
  slowestTest?: {
    name: string;
    duration: number;
  };
  
  memoryUsage?: {
    peak: number;
    average: number;
  };
  
  cpuUsage?: {
    peak: number;
    average: number;
  };
}

export enum ErrorType {
  PARSER_ERROR = 'PARSER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  ASSERTION_ERROR = 'ASSERTION_ERROR',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  HOOK_ERROR = 'HOOK_ERROR',
  STEP_DEFINITION_ERROR = 'STEP_DEFINITION_ERROR'
}

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  UNDEFINED = 'undefined',
  AMBIGUOUS = 'ambiguous'
}

export enum ScenarioStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  ERROR = 'error'
}

export enum FeatureStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface GherkinKeywords {
  feature: string[];
  background: string[];
  scenario: string[];
  scenarioOutline: string[];
  examples: string[];
  given: string[];
  when: string[];
  then: string[];
  and: string[];
  but: string[];
}

export interface LanguageConfig {
  code: string;
  
  name: string;
  
  nativeName: string;
  
  keywords: GherkinKeywords;
}

export interface ParameterType {
  name: string;
  
  regexp: RegExp | RegExp[];
  
  transformer: (match: string) => any;
  
  useForSnippets?: boolean;
  
  preferForRegexpMatch?: boolean;
}

export interface ParameterTypeDefinition {
  name: string;
  
  regexp: RegExp;
  
  transformer: TransformFunction;
  
  useForSnippets: boolean;
  
  preferForRegexpMatch: boolean;
  
  type?: string;
}

export type TransformFunction = (value: string) => any;

export interface ParameterTypeOptions {
  name: string;
  
  regexp: RegExp | string | string[];
  
  transformer?: TransformFunction;
  
  useForSnippets?: boolean;
  
  preferForRegexpMatch?: boolean;
  
  type?: string;
}

export interface SnippetOptions {
  syntax: 'async-await' | 'callback' | 'promise';
  
  interface: 'synchronous' | 'callback' | 'promise' | 'async-await';
  
  comments?: boolean;
  
  functionNameStyle?: 'camelCase' | 'snake_case';
}

export interface CodeSnippet {
  step: string;
  
  code: string;
  
  language: string;
  
  patternType: 'string' | 'regexp';
}

export interface TestContextData {
  feature?: Feature;
  
  scenario?: Scenario;
  
  step?: Step;
  
  testData?: TestData;
  
  [key: string]: any;
}

export type EventType = 
  | 'test-run-started'
  | 'test-run-finished'
  | 'feature-started'
  | 'feature-finished'
  | 'scenario-started'
  | 'scenario-finished'
  | 'step-started'
  | 'step-finished'
  | 'hook-started'
  | 'hook-finished'
  | 'test-case-started'
  | 'test-case-finished';

export interface EventData {
  type: EventType;
  
  timestamp: Date;
  
  data: any;
}

export interface Formatter {
  initialize?(options: FormatterOptions): void;
  
  handleEvent(event: EventData): void;
  
  finalize?(): void;
}

export interface FormatterOptions {
  stream?: NodeJS.WritableStream;
  
  outputFile?: string;
  
  colorsEnabled?: boolean;
  
  snippets?: boolean;
  
  snippetOptions?: SnippetOptions;
}

export const TypeGuards = {
  isFeature: (obj: any): obj is Feature => {
    return obj && typeof obj.name === 'string' && Array.isArray(obj.scenarios);
  },
  
  isScenario: (obj: any): obj is Scenario => {
    return obj && typeof obj.name === 'string' && Array.isArray(obj.steps);
  },
  
  isScenarioOutline: (obj: any): obj is ScenarioOutline => {
    return obj && obj.type === 'scenario_outline' && Array.isArray(obj.examples);
  },
  
  isStep: (obj: any): obj is Step => {
    return obj && typeof obj.keyword === 'string' && typeof obj.text === 'string';
  },
  
  isDataTable: (obj: any): obj is DataTable => {
    return obj && Array.isArray(obj.rows) && typeof obj.hashes === 'function';
  },
  
  isDocString: (obj: any): obj is DocString => {
    return obj && typeof obj.content === 'string';
  }
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncReturnType<T extends (...args: any) => any> = 
  T extends (...args: any) => Promise<infer U> ? U : 
  T extends (...args: any) => infer U ? U : any;

export type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

export interface RunOptions {
  paths?: string[];
  
  tags?: string;
  
  dryRun?: boolean;
  
  parallel?: boolean;
  
  workers?: number;
  
  retry?: number;
  
  format?: string[];
  
  outputDir?: string;
  
  browser?: string;
  
  headless?: boolean;
  
  timeout?: number;
  
  project?: string;
  
  environment?: string;
  
  proxy?: any;
  
  debug?: boolean;
  
  slowMo?: number;
  
  video?: boolean;
  
  screenshot?: boolean;
  
  trace?: boolean;
  
  adoEnabled?: boolean;
  
  [key: string]: any;
}

export enum RunMode {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  DISTRIBUTED = 'distributed'
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  ABORTED = 'aborted',
  PARTIAL = 'partial',
  ERROR = 'error',
  TIMEOUT = 'timeout'
}

export type RunnerState = 'idle' | 'initializing' | 'running' | 'stopping' | 'stopped' | 'error';

export interface FeatureMetrics {
  totalTime: number;
  
  avgScenarioTime: number;
  
  avgStepTime: number;
  
  fastestScenario: number | { name: string; duration: number } | null;
  
  slowestScenario: number | { name: string; duration: number } | null;
  
  retriesCount: number;
  
  flakinessRate: number;
  
  successRate: number;
  
  totalScenarios: number;
  
  passedScenarios: number;
  
  failedScenarios: number;
  
  skippedScenarios: number;
  
  totalSteps: number;
  
  passedSteps: number;
  
  failedSteps: number;
  
  skippedSteps: number;
  
  averageScenarioDuration: number;
  
  errorRate: number;
  
  tags: Record<string, {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  }>;
  
  stepMetrics?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
  };
}

export interface ExecutionError {
  type: 'setup' | 'execution' | 'teardown' | 'timeout' | 'assertion' | 'system';
  
  message: string;
  
  stack?: string;
  
  context?: {
    feature?: string;
    scenario?: string;
    step?: string;
    hook?: string;
  };
  
  timestamp: Date;
  
  details?: Record<string, any>;
  
  originalError?: Error;
}
