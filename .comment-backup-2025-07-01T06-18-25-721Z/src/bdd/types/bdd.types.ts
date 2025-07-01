/**
 * Comprehensive TypeScript type definitions for the BDD framework
 * Provides complete type safety for all BDD-related operations
 */

import { ExecutionContext } from '../context/ExecutionContext';

/**
 * Data annotations for features
 */
export interface Annotations {
  dataSource?: DataSourceConfig;
  testCase?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Data source configuration
 */
export interface DataSourceConfig {
  type: 'excel' | 'json' | 'csv' | 'database';
  source: string;
  sheet?: string;
  runFlagField?: string;
  filters?: Record<string, any>;
}

/**
 * Missing steps report
 */
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

/**
 * Test result structure
 */
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

/**
 * Feature file structure
 */
export interface Feature {
  /** Feature name */
  name: string;
  
  /** Feature description */
  description?: string;
  
  /** Feature file path */
  uri?: string;
  
  /** Feature file name (deprecated, use uri) */
  file?: string;
  
  /** Line number in file */
  line?: number;
  
  /** Feature tags */
  tags: string[];
  
  /** Feature background */
  background?: Scenario;
  
  /** Feature scenarios */
  scenarios: Scenario[];
  
  /** Language of feature file */
  language?: string;
  
  /** Feature metadata */
  metadata?: FeatureMetadata;
}

/**
 * Scenario structure
 */
export interface Scenario {
  /** Scenario name */
  name: string;
  
  /** Scenario description */
  description?: string;
  
  /** Scenario type */
  type: 'scenario' | 'scenario_outline' | 'background';
  
  /** Scenario tags */
  tags: string[];
  
  /** Scenario steps */
  steps: Step[];
  
  /** Examples for scenario outline */
  examples?: Examples[];
  
  /** Line number in feature file */
  line?: number;
  
  /** Parent feature file */
  featureFile?: string;
  
  /** Scenario ID */
  id?: string;
  
  /** Execution status */
  status?: ScenarioStatus;
  
  /** Scenario metadata */
  metadata?: ScenarioMetadata;
}

/**
 * Scenario outline structure
 */
export interface ScenarioOutline extends Scenario {
  type: 'scenario_outline';
  examples: Examples[];
}

/**
 * Step structure
 */
export interface Step {
  /** Step keyword (Given, When, Then, And, But) */
  keyword: string;
  
  /** Step text */
  text: string;
  
  /** Data table */
  dataTable?: DataTable;
  
  /** Doc string */
  docString?: DocString;
  
  /** Line number in feature file */
  line: number;
  
  /** Step execution status */
  status?: StepStatus;
  
  /** Step execution result */
  result?: StepResult;
  
  /** Step definition match */
  match?: StepMatch;
  
  /** Step metadata */
  metadata?: StepMetadata;
}

/**
 * Examples for scenario outline
 */
export interface Examples {
  /** Examples name */
  name?: string;
  
  /** Examples description */
  description?: string;
  
  /** Examples tags */
  tags: string[];
  
  /** Examples table header */
  header: string[];
  
  /** Examples table rows */
  rows: string[][];
  
  /** Line number in feature file */
  line?: number;
}

/**
 * Data table structure
 */
/**
 * Table row structure
 */
export interface TableRow {
  /** Row cells */
  cells: string[];
  
  /** Row line number */
  line?: number;
}

export interface DataTable {
  /** Table data rows - all rows including header */
  rows: string[][];
  
  /** Get table as array of objects (with header row as keys) */
  hashes(): Record<string, string>[];
  
  /** Get table as 2D array (all rows including header) */
  raw(): string[][];
  
  /** Get table rows without header - returns data rows only */
  rowsWithoutHeader(): string[][];
  
  /** Get table as key-value pairs (first column as keys, second as values) */
  rowsHash(): Record<string, string>;
}

/**
 * Doc string structure
 */
export interface DocString {
  /** Content type */
  contentType?: string;
  
  /** Doc string content */
  content: string;
  
  /** Line number */
  line?: number;
}

/**
 * Step definition structure
 */
export interface StepDefinition {
  /** Step pattern (string or regex) */
  pattern: string | RegExp;
  
  /** Pattern as string for display */
  patternString: string;
  
  /** Step implementation function */
  implementation: Function;
  
  /** Step definition metadata */
  metadata: StepDefinitionMetadata;
  
  /** Number of parameters expected */
  parameterCount: number;
  
  /** Timeout in milliseconds */
  timeout: number;
}

/**
 * Step definition function type
 */
export type StepDefinitionFn = (...args: any[]) => Promise<void> | void;

/**
 * Step definition location
 */
export interface StepDefinitionLocation {
  /** File path */
  uri: string;
  
  /** Line number */
  line: number;
}

/**
 * Step match result
 */
export interface StepMatch {
  /** Step text being matched */
  stepText: string;
  
  /** Whether the step was matched */
  matched: boolean;
  
  /** Matched step definition */
  definition: StepDefinition | null;
  
  /** Extracted parameters */
  parameters: any[];
  
  /** Regex pattern used for matching */
  regex?: RegExp;
  
  /** Match score */
  score?: number;
  
  /** Error message if match failed */
  error?: string;
  
  /** Ambiguous matches if multiple definitions found */
  ambiguousMatches?: string[];
}

/**
 * Match result from step matcher
 */
export interface MatchResult {
  /** Matched step definition */
  stepDefinition: StepDefinition;
  
  /** Extracted parameters */
  parameters: any[];
  
  /** Parameter information */
  parameterInfo: ParameterInfo[];
  
  /** Match confidence score */
  score: number;
  
  /** Match duration */
  duration: number;
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  /** Parameter value */
  value: any;
  
  /** Parameter type */
  type: string;
  
  /** Start position in step text */
  start: number;
  
  /** End position in step text */
  end: number;
  
  /** Parameter name if available */
  name?: string;
}

/**
 * Step match score details
 */
export interface StepMatchScore {
  /** Total score */
  total: number;
  
  /** Exact match bonus */
  exactMatch: number;
  
  /** Pattern length score */
  patternLength: number;
  
  /** Parameter count score */
  parameterCount: number;
  
  /** Specificity score */
  specificity: number;
}

/**
 * Step pattern type
 */
export type StepPattern = string | RegExp;

/**
 * Parse error class
 */
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

/**
 * Feature file structure
 */
export interface FeatureFile {
  /** File path */
  path: string;
  
  /** Feature content */
  feature?: Feature;
  
  /** Parse errors */
  errors?: ParserError[];
  
  /** File metadata */
  metadata?: {
    size: number;
    modified: Date;
    hash?: string;
  };
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total number of steps registered */
  totalSteps: number;
  
  /** Total number of hooks */
  totalHooks: number;
  
  /** Hooks by type */
  hooksByType: Record<string, number>;
  
  /** Number of loaded files */
  loadedFiles: number;
}

/**
 * Step execution result
 */
export interface StepResult {
  /** Result ID */
  id: string;
  
  /** Step keyword */
  keyword?: string;
  
  /** Step text */
  text?: string;
  
  /** Line number in feature file */
  line?: number;
  
  /** Data table if present */
  dataTable?: DataTable;
  
  /** Doc string if present */
  docString?: DocString;
  
  /** Execution status */
  status: StepStatus;
  
  /** Execution duration in milliseconds */
  duration?: number;
  
  /** Start time */
  startTime?: Date;
  
  /** End time */
  endTime?: Date;
  
  /** Error if step failed */
  error?: ExecutionError;
  
  /** Error message */
  errorMessage?: string;
  
  /** Stack trace */
  stackTrace?: string;
  
  /** Skipped reason */
  skippedReason?: string;
  
  /** Attachments */
  attachments?: Attachment[];
  
  /** Action details captured during step execution */
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

/**
 * Test attachment
 */
export interface Attachment {
  /** Attachment data */
  data: string | Buffer;
  
  /** MIME type */
  mimeType: string;
  
  /** Attachment name */
  name?: string;
  
  /** Attachment path */
  path?: string;
  
  /** Attachment metadata for organization */
  metadata?: {
    featureName?: string;
    scenarioName?: string;
    stepLabel?: string;
    status?: string;
    [key: string]: any;
  };
}

/**
 * Hook types
 */
export enum HookType {
  Before = 'Before',
  After = 'After',
  BeforeStep = 'BeforeStep',
  AfterStep = 'AfterStep',
  BeforeAll = 'BeforeAll',
  AfterAll = 'AfterAll'
}

/**
 * Hook structure
 */
export interface Hook {
  /** Hook type */
  type: HookType;
  
  /** Hook name */
  name: string;
  
  /** Hook implementation */
  implementation: HookFn;
  
  /** Hook function (alias for implementation) */
  fn?: HookFn;
  
  /** Execution order */
  order?: number;
  
  /** Tag filter */
  tags?: string[];
  
  /** Timeout in milliseconds */
  timeout?: number;
  
  /** Always run even on failure */
  alwaysRun?: boolean;
}

/**
 * Hook function types
 */
export type BeforeHookFn = (context: ExecutionContext) => Promise<void> | void;
export type AfterHookFn = (context: ExecutionContext) => Promise<void> | void;
export type BeforeStepHookFn = (context: ExecutionContext, step: Step) => Promise<void> | void;
export type AfterStepHookFn = (context: ExecutionContext, step: Step) => Promise<void> | void;
export type HookFn = BeforeHookFn | AfterHookFn | BeforeStepHookFn | AfterStepHookFn;

/**
 * Hook execution result
 */
export interface HookResult {
  /** Hook that was executed */
  hook: Hook;
  
  /** Execution status */
  status: StepStatus.PASSED | StepStatus.FAILED | StepStatus.SKIPPED;
  
  /** Execution duration */
  duration: number;
  
  /** Error if hook failed */
  error?: Error;
  
  /** Execution timestamp */
  timestamp?: Date;
}

/**
 * Hook error
 */
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

/**
 * Execution plan
 */
export interface ExecutionPlan {
  /** Features to execute */
  features: Feature[];
  
  /** Scenarios to execute */
  scenarios: Scenario[];
  
  /** Total test count */
  totalTests: number;
  
  /** Total features count */
  totalFeatures: number;
  
  /** Total scenarios count */
  totalScenarios: number;
  
  /** Execution order */
  executionOrder: string[];
  
  /** Parallel execution groups */
  parallelGroups?: ScenarioGroup[];
  
  /** Estimated duration */
  estimatedDuration?: number;
}

/**
 * Scenario group for parallel execution
 */
export interface ScenarioGroup {
  /** Group ID */
  id: string;
  
  /** Scenarios in group */
  scenarios: Scenario[];
  
  /** Group priority */
  priority: number;
  
  /** Estimated duration */
  estimatedDuration: number;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Feature results */
  features: FeatureResult[];
  
  /** Execution summary */
  summary: ExecutionSummary;
  
  /** Execution timestamp */
  timestamp: Date;
  
  /** Start time */
  startTime: Date;
  
  /** End time */
  endTime: Date;
  
  /** Total duration */
  duration: number;
  
  /** Execution status */
  status: ExecutionStatus;
  
  /** Environment */
  environment: string;
  
  /** Errors */
  errors?: Error[];
  
  /** Execution metadata */
  executionStats?: any;
}

/**
 * Feature execution result
 */
export interface FeatureResult {
  /** Result ID */
  id: string;
  
  /** Feature */
  feature: Feature;
  
  /** Feature name (for backward compatibility) */
  name?: string;
  
  /** Feature description */
  description?: string;
  
  /** Feature URI */
  uri?: string;
  
  /** Feature tags */
  tags?: string[];
  
  /** Scenario results */
  scenarios: ScenarioResult[];
  
  /** Background result */
  background?: BackgroundResult;
  
  /** Feature status */
  status: FeatureStatus;
  
  /** Execution duration */
  duration: number;
  
  /** Start time */
  startTime?: Date;
  
  /** End time */
  endTime?: Date;
  
  /** Execution timestamp */
  timestamp?: Date;
  
  /** Feature metadata */
  metadata?: Record<string, any>;
  
  /** Feature metrics */
  metrics?: FeatureMetrics;
  
  /** Execution errors */
  errors?: ExecutionError[];
}

/**
 * Background execution result
 */
export interface BackgroundResult {
  /** Background name */
  name: string;
  
  /** Background description */
  description?: string;
  
  /** Step results */
  steps: StepResult[];
  
  /** Background status */
  status: ScenarioStatus;
  
  /** Execution duration */
  duration: number;
  
  /** Start time */
  startTime: Date;
  
  /** End time */
  endTime: Date;
  
  /** Error if background failed */
  error?: ExecutionError;
}

/**
 * Scenario execution result
 */
export interface ScenarioResult {
  /** Result ID */
  id: string;
  
  /** Scenario name */
  scenario: string;
  
  /** Scenario object (optional for full reference) */
  scenarioRef?: Scenario;
  
  /** Step results */
  steps: StepResult[];
  
  /** Hook results */
  hooks?: HookResult[];
  
  /** Scenario status */
  status: ScenarioStatus;
  
  /** Execution duration */
  duration: number;
  
  /** Start time */
  startTime: Date;
  
  /** End time */
  endTime: Date;
  
  /** Execution timestamp */
  timestamp?: Date;
  
  /** Error if scenario failed */
  error?: ExecutionError | null;
  
  /** Retry attempts */
  retries?: number;
  
  /** Combined tags from feature and scenario */
  tags?: string[];
  
  /** Attachments */
  attachments?: Attachment[];
  
  /** Scenario metadata */
  metadata?: Record<string, any>;
  
  /** ADO metadata for test integration */
  adoMetadata?: {
    testCaseId?: number;
    testPlanId?: number;
    testSuiteId?: number;
  };
}

/**
 * Execution summary
 */
export interface ExecutionSummary {
  /** Total features */
  totalFeatures: number;
  
  /** Total scenarios */
  totalScenarios: number;
  
  /** Total steps */
  totalSteps: number;
  
  /** Total tests */
  total: number;
  
  /** Passed scenarios */
  passed: number;
  
  /** Failed scenarios */
  failed: number;
  
  /** Skipped scenarios */
  skipped: number;
  
  /** Pending scenarios */
  pending: number;
  
  /** Passed steps */
  passedSteps: number;
  
  /** Failed steps */
  failedSteps: number;
  
  /** Skipped steps */
  skippedSteps: number;
  
  /** Total duration */
  duration: number;
  
  /** Parallel execution */
  parallel?: boolean;
  
  /** Number of workers */
  workers?: number;
  
  /** Pass rate */
  passRate?: number;
  
  /** Execution metadata */
  metadata?: Record<string, any>;
}

/**
 * Worker message types
 */
export interface WorkerMessage {
  /** Message type */
  type: 'ready' | 'progress' | 'result' | 'error' | 'log';
  
  /** Message data */
  data: any;
  
  /** Worker ID */
  workerId?: number;
  
  /** Timestamp */
  timestamp?: Date;
}

/**
 * Worker result
 */
export interface WorkerResult {
  /** Work item ID */
  workItemId: string;
  
  /** Result type */
  type: 'scenario' | 'feature';
  
  /** Execution status */
  status: ScenarioStatus.PASSED | ScenarioStatus.FAILED | ScenarioStatus.SKIPPED;
  
  /** Execution duration */
  duration: number;
  
  /** Feature file */
  featureFile?: string;
  
  /** Scenario result */
  scenarioResult?: ScenarioResult;
  
  /** Feature result */
  featureResult?: FeatureResult;
  
  /** Error if failed */
  error?: Error;
}

/**
 * Worker status
 */
export type WorkerStatus = 'idle' | 'busy' | 'error' | 'terminated';

/**
 * Feature metadata
 */
export interface FeatureMetadata {
  /** Author */
  author?: string;
  
  /** Version */
  version?: string;
  
  /** Creation date */
  created?: Date;
  
  /** Last modified date */
  modified?: Date;
  
  /** Feature ID */
  id?: string;
  
  /** Related requirements */
  requirements?: string[];
  
  /** Custom properties */
  [key: string]: any;
}

/**
 * Scenario metadata
 */
export interface ScenarioMetadata {
  /** Test ID */
  testId?: string;
  
  /** Priority */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  
  /** Test type */
  testType?: 'functional' | 'integration' | 'e2e' | 'performance' | 'security';
  
  /** Estimated duration */
  estimatedDuration?: number;
  
  /** Flaky test */
  flaky?: boolean;
  
  /** Skip reason */
  skipReason?: string;
  
  /** Custom properties */
  [key: string]: any;
}

/**
 * Step metadata
 */
export interface StepMetadata {
  /** Step timeout */
  timeout?: number;
  
  /** Retry count */
  retry?: number;
  
  /** Screenshot */
  screenshot?: boolean;
  
  /** Custom properties */
  [key: string]: any;
}

/**
 * Step definition metadata
 */
export interface StepDefinitionMetadata {
  /** Definition file */
  file?: string;
  
  /** Definition line */
  line?: number;
  
  /** Definition type */
  type?: 'sync' | 'async';
  
  /** Parameter types */
  parameterTypes?: string[];
  
  /** Usage count */
  usageCount?: number;
  
  /** Custom properties */
  [key: string]: any;
}

/**
 * Parser token types
 */
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

/**
 * TokenType enum for runtime usage
 */
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

/**
 * Parser token
 */
export interface Token {
  /** Token type */
  type: TokenType;
  
  /** Token value */
  value: string;
  
  /** Line number */
  line: number;
  
  /** Column number */
  column: number;
  
  /** Indentation level */
  indent?: number;
}

/**
 * Tag structure
 */
export interface Tag {
  /** Tag name */
  name: string;
  
  /** Line number */
  line: number;
}

/**
 * Background structure
 */
export interface Background {
  /** Background name */
  name?: string;
  
  /** Background description */
  description?: string;
  
  /** Background steps */
  steps: Step[];
  
  /** Line number */
  line: number;
}

/**
 * Parser error
 */
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

/**
 * Validation result
 */
export interface ValidationResult {
  /** Validation status */
  valid: boolean;
  
  /** Validation errors */
  errors: ValidationError[];
  
  /** Validation warnings */
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Error type */
  type: string;
  
  /** Error message */
  message: string;
  
  /** Related step text */
  stepText: string;
  
  /** Error severity */
  severity: 'error' | 'warning' | 'info';
  
  /** Error location */
  location?: {
    uri?: string;
    line?: number;
    column?: number;
  };
  
  /** Error code */
  code?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Warning message */
  message: string;
  
  /** Warning location */
  location?: {
    uri?: string;
    line?: number;
    column?: number;
  };
  
  /** Warning code */
  code?: string;
  
  /** Warning severity */
  severity?: 'low' | 'medium' | 'high';
}

/**
 * Tag expression AST node types
 */
export type TagExpressionNode = 
  | TagNode
  | AndNode
  | OrNode
  | NotNode;

/**
 * Tag node
 */
export interface TagNode {
  type: 'tag';
  tag: string;
}

/**
 * AND node
 */
export interface AndNode {
  type: 'and';
  left: TagExpressionNode;
  right: TagExpressionNode;
}

/**
 * OR node
 */
export interface OrNode {
  type: 'or';
  left: TagExpressionNode;
  right: TagExpressionNode;
}

/**
 * NOT node
 */
export interface NotNode {
  type: 'not';
  operand: TagExpressionNode;
}

/**
 * Runtime options
 */
export interface RuntimeOptions {
  /** Dry run mode */
  dryRun?: boolean;
  
  /** Fail fast on first error */
  failFast?: boolean;
  
  /** Filter by tags */
  tags?: string[];
  
  /** Filter by name */
  name?: string | RegExp;
  
  /** Parallel execution */
  parallel?: boolean;
  
  /** Number of parallel workers */
  workers?: number;
  
  /** Retry failed tests */
  retry?: number;
  
  /** Retry delay */
  retryDelay?: number;
  
  /** Strict mode */
  strict?: boolean;
  
  /** Order */
  order?: 'defined' | 'random';
  
  /** Random seed */
  seed?: string;
}

/**
 * Test data provider options
 */
export interface DataProviderOptions {
  /** Data source */
  source: string;
  
  /** Sheet name for Excel */
  sheet?: string;
  
  /** Filter by execution flag */
  executionFlag?: string;
  
  /** Key column */
  keyColumn?: string;
  
  /** Variable prefix */
  variablePrefix?: string;
}

/**
 * Test data
 */
export interface TestData {
  /** Data row */
  [key: string]: any;
  
  /** Execution flag */
  _execute?: boolean;
  
  /** Data ID */
  _id?: string;
  
  /** Data description */
  _description?: string;
}

/**
 * Report options
 */
export interface ReportOptions {
  /** Output path */
  outputPath: string;
  
  /** Report formats */
  formats: ReportFormat[];
  
  /** Report name */
  name?: string;
  
  /** Include screenshots */
  includeScreenshots?: boolean;
  
  /** Include videos */
  includeVideos?: boolean;
  
  /** Include logs */
  includeLogs?: boolean;
  
  /** Theme */
  theme?: ReportTheme;
}

/**
 * Report format
 */
export type ReportFormat = 'html' | 'json' | 'xml' | 'pdf' | 'excel';

/**
 * Report theme
 */
export interface ReportTheme {
  /** Primary color */
  primaryColor: string;
  
  /** Secondary color */
  secondaryColor: string;
  
  /** Logo URL */
  logo?: string;
  
  /** Custom CSS */
  customCss?: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Page load time */
  pageLoadTime?: number;
  
  /** DOM content loaded */
  domContentLoaded?: number;
  
  /** First paint */
  firstPaint?: number;
  
  /** First contentful paint */
  firstContentfulPaint?: number;
  
  /** Largest contentful paint */
  largestContentfulPaint?: number;
  
  /** Time to interactive */
  timeToInteractive?: number;
  
  /** Total blocking time */
  totalBlockingTime?: number;
  
  /** Cumulative layout shift */
  cumulativeLayoutShift?: number;
  
  /** Custom metrics */
  custom?: Record<string, number>;
}

/**
 * Network metrics
 */
export interface NetworkMetrics {
  /** Total requests */
  totalRequests: number;
  
  /** Failed requests */
  failedRequests: number;
  
  /** Total size */
  totalSize: number;
  
  /** Average response time */
  averageResponseTime: number;
  
  /** Slowest request */
  slowestRequest?: {
    url: string;
    duration: number;
  };
  
  /** Largest request */
  largestRequest?: {
    url: string;
    size: number;
  };
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  /** Total execution time */
  totalTime: number;
  
  /** Setup time */
  setupTime: number;
  
  /** Teardown time */
  teardownTime: number;
  
  /** Test execution time */
  testTime: number;
  
  /** Average test time */
  averageTestTime: number;
  
  /** Slowest test */
  slowestTest?: {
    name: string;
    duration: number;
  };
  
  /** Memory usage */
  memoryUsage?: {
    peak: number;
    average: number;
  };
  
  /** CPU usage */
  cpuUsage?: {
    peak: number;
    average: number;
  };
}

/**
 * Error types
 */
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

/**
 * Step status
 */
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  UNDEFINED = 'undefined',
  AMBIGUOUS = 'ambiguous'
}

/**
 * Scenario status
 */
export enum ScenarioStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  ERROR = 'error'
}

/**
 * Feature status
 */
export enum FeatureStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Gherkin keywords
 */
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

/**
 * Language configuration
 */
export interface LanguageConfig {
  /** Language code */
  code: string;
  
  /** Language name */
  name: string;
  
  /** Native name */
  nativeName: string;
  
  /** Keywords */
  keywords: GherkinKeywords;
}

/**
 * Custom parameter type
 */
export interface ParameterType {
  /** Parameter name */
  name: string;
  
  /** Regular expression */
  regexp: RegExp | RegExp[];
  
  /** Transform function */
  transformer: (match: string) => any;
  
  /** Use for snippets */
  useForSnippets?: boolean;
  
  /** Prefer for regexp match */
  preferForRegexpMatch?: boolean;
}

/**
 * Parameter type definition for registry
 */
export interface ParameterTypeDefinition {
  /** Parameter name */
  name: string;
  
  /** Regular expression for matching */
  regexp: RegExp;
  
  /** Transform function */
  transformer: TransformFunction;
  
  /** Use for snippets generation */
  useForSnippets: boolean;
  
  /** Prefer for regexp match */
  preferForRegexpMatch: boolean;
  
  /** Optional type information */
  type?: string;
}

/**
 * Transform function type
 */
export type TransformFunction = (value: string) => any;

/**
 * Parameter type options for registration
 */
export interface ParameterTypeOptions {
  /** Parameter type name */
  name: string;
  
  /** Regular expression(s) */
  regexp: RegExp | string | string[];
  
  /** Transform function */
  transformer?: TransformFunction;
  
  /** Use for snippets */
  useForSnippets?: boolean;
  
  /** Prefer for regexp match */
  preferForRegexpMatch?: boolean;
  
  /** Type hint */
  type?: string;
}

/**
 * Snippet options
 */
export interface SnippetOptions {
  /** Snippet syntax */
  syntax: 'async-await' | 'callback' | 'promise';
  
  /** Interface type */
  interface: 'synchronous' | 'callback' | 'promise' | 'async-await';
  
  /** Comment style */
  comments?: boolean;
  
  /** Function name style */
  functionNameStyle?: 'camelCase' | 'snake_case';
}

/**
 * Code snippet
 */
export interface CodeSnippet {
  /** Step text */
  step: string;
  
  /** Snippet code */
  code: string;
  
  /** Programming language */
  language: string;
  
  /** Pattern type */
  patternType: 'string' | 'regexp';
}

/**
 * Test context data
 */
export interface TestContextData {
  /** Current feature */
  feature?: Feature;
  
  /** Current scenario */
  scenario?: Scenario;
  
  /** Current step */
  step?: Step;
  
  /** Test data */
  testData?: TestData;
  
  /** Custom data */
  [key: string]: any;
}

/**
 * Event types
 */
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

/**
 * Event data
 */
export interface EventData {
  /** Event type */
  type: EventType;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Event data */
  data: any;
}

/**
 * Formatter interface
 */
export interface Formatter {
  /** Initialize formatter */
  initialize?(options: FormatterOptions): void;
  
  /** Handle event */
  handleEvent(event: EventData): void;
  
  /** Finalize formatter */
  finalize?(): void;
}

/**
 * Formatter options
 */
export interface FormatterOptions {
  /** Output stream */
  stream?: NodeJS.WritableStream;
  
  /** Output file */
  outputFile?: string;
  
  /** Color output */
  colorsEnabled?: boolean;
  
  /** Snippets */
  snippets?: boolean;
  
  /** Snippet options */
  snippetOptions?: SnippetOptions;
}

/**
 * Type guards
 */
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

/**
 * Utility types
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncReturnType<T extends (...args: any) => any> = 
  T extends (...args: any) => Promise<infer U> ? U : 
  T extends (...args: any) => infer U ? U : any;

export type UnionToIntersection<U> = 
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

/**
 * Runner options
 */
export interface RunOptions {
  /** Feature paths to execute */
  paths?: string[];
  
  /** Tags to filter scenarios */
  tags?: string;
  
  /** Dry run mode */
  dryRun?: boolean;
  
  /** Parallel execution */
  parallel?: boolean;
  
  /** Number of workers for parallel execution */
  workers?: number;
  
  /** Retry count for failed scenarios */
  retry?: number;
  
  /** Output format */
  format?: string[];
  
  /** Output directory */
  outputDir?: string;
  
  /** Browser configuration */
  browser?: string;
  
  /** Headless mode */
  headless?: boolean;
  
  /** Timeout in milliseconds */
  timeout?: number;
  
  /** Project */
  project?: string;
  
  /** Environment */
  environment?: string;
  
  /** Proxy configuration */
  proxy?: any;
  
  /** Debug mode */
  debug?: boolean;
  
  /** Slow motion delay */
  slowMo?: number;
  
  /** Video recording */
  video?: boolean;
  
  /** Screenshot on failure */
  screenshot?: boolean;
  
  /** Trace recording */
  trace?: boolean;
  
  /** ADO integration */
  adoEnabled?: boolean;
  
  /** Additional options */
  [key: string]: any;
}

/**
 * Run mode enum
 */
export enum RunMode {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  DISTRIBUTED = 'distributed'
}

/**
 * Execution status enum
 */
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

/**
 * Runner state type
 */
export type RunnerState = 'idle' | 'initializing' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Feature metrics interface
 */
export interface FeatureMetrics {
  /** Total execution time */
  totalTime: number;
  
  /** Average scenario time */
  avgScenarioTime: number;
  
  /** Average step time */
  avgStepTime: number;
  
  /** Fastest scenario */
  fastestScenario: number | { name: string; duration: number } | null;
  
  /** Slowest scenario */
  slowestScenario: number | { name: string; duration: number } | null;
  
  /** Retries count */
  retriesCount: number;
  
  /** Flakiness rate */
  flakinessRate: number;
  
  /** Success rate */
  successRate: number;
  
  /** Total scenarios */
  totalScenarios: number;
  
  /** Passed scenarios */
  passedScenarios: number;
  
  /** Failed scenarios */
  failedScenarios: number;
  
  /** Skipped scenarios */
  skippedScenarios: number;
  
  /** Total steps */
  totalSteps: number;
  
  /** Passed steps */
  passedSteps: number;
  
  /** Failed steps */
  failedSteps: number;
  
  /** Skipped steps */
  skippedSteps: number;
  
  /** Average scenario duration */
  averageScenarioDuration: number;
  
  /** Error rate */
  errorRate: number;
  
  /** Tags */
  tags: Record<string, {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  }>;
  
  /** Step metrics */
  stepMetrics?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
  };
}

/**
 * Execution error interface
 */
export interface ExecutionError {
  /** Error type */
  type: 'setup' | 'execution' | 'teardown' | 'timeout' | 'assertion' | 'system';
  
  /** Error message */
  message: string;
  
  /** Error stack trace */
  stack?: string;
  
  /** Context where error occurred */
  context?: {
    feature?: string;
    scenario?: string;
    step?: string;
    hook?: string;
  };
  
  /** Timestamp */
  timestamp: Date;
  
  /** Additional error details */
  details?: Record<string, any>;
  
  /** Original error */
  originalError?: Error;
}