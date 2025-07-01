// src/core/cli/ExecutionOptions.ts

/**
* Complete production-ready execution options interfaces and types
* with full validation, type safety, and comprehensive configuration support
*/

import { ExecutionStatus } from '../../bdd/types/bdd.types';

/**
* Main execution options interface containing all possible configuration
*/
export interface ExecutionOptions {
 // Project and Environment Configuration
 project: string;
 environment: string;
 environmentVariables?: Record<string, string>;
 
 // Test Selection
 tags?: string;
 tagExpression?: ParsedTagExpression;
 features?: string[];
 featurePatterns?: CompiledPattern[];
 scenarios?: string[];
 scenarioPatterns?: CompiledPattern[];
 grep?: string;
 grepPattern?: RegExp;
 grepInvert?: boolean;
 includeExamples?: string[];
 excludeExamples?: string[];
 
 // Execution Configuration
 parallel: boolean;
 workers: number;
 workerIdleMemoryLimit?: number;
 cluster?: boolean;
 browser: BrowserType;
 browserChannel?: string;
 browserExecutablePath?: string;
 headless: boolean;
 headed?: boolean;
 slowMo?: number;
 timeout: number;
 navigationTimeout?: number;
 actionTimeout?: number;
 retry: number;
 retryStrategy?: RetryStrategy;
 dryRun: boolean;
 bail: boolean;
 failFast?: boolean;
 maxFailures: number;
 shard?: ShardConfig;
 randomize?: boolean;
 seed?: string;
 
 // Debug Configuration
 debug: boolean;
 debugPort?: number;
 breakpoint?: string;
 verbose: boolean;
 verboseLevel?: VerboseLevel;
 quiet: boolean;
 noColors: boolean;
 preserveOutput?: boolean;
 
 // Logging Configuration
 logLevel?: string;
 logFile?: boolean;
 logPath?: string;
 
 // Evidence Collection
 video: boolean;
 videoOptions?: VideoOptions;
 trace: boolean;
 traceOptions?: TraceOptions;
 screenshot: ScreenshotMode;
 screenshotOptions?: ScreenshotOptions;
 updateSnapshots: boolean;
 snapshotPathTemplate?: string;
 
 // Reporting Configuration
 skipReport?: boolean;
 skipADO?: boolean;
 reportName: string;
 reportPath: string;
 reportFormats: ReportFormat[];
 reportOptions?: ReportOptions;
 outputFormats: OutputFormat[];
 outputOptions?: OutputOptions;
 publishResults?: boolean;
 publishOptions?: PublishOptions;
 
 // Configuration Files
 configFile?: string;
 profile?: string;
 testDataPath?: string;
 pageObjectsPath?: string;
 stepsPath?: string;
 hooksPath?: string;
 
 // Service Overrides
 apiBaseUrl?: string;
 apiEndpoints?: Record<string, string>;
 dbConnection?: string;
 dbConnections?: Record<string, DatabaseConnection>;
 serviceUrls?: Record<string, string>;
 
 // Proxy Configuration
 proxy?: string;
 proxyAuth?: ProxyAuthentication;
 proxyBypass?: string[];
 proxyOptions?: ProxyOptions;
 
 // Authentication
 authProviders?: Record<string, AuthProvider>;
 credentials?: Record<string, Credential>;
 certificates?: Record<string, Certificate>;
 
 // CI/CD Configuration
 ci: boolean;
 ciProvider?: CIProvider;
 buildId?: string;
 buildUrl?: string;
 jobName?: string;
 branchName?: string;
 commitSha?: string;
 pullRequestId?: string;
 
 // Performance Configuration
 performanceMode?: PerformanceMode;
 memoryLimit?: number;
 cpuLimit?: number;
 networkThrottling?: NetworkProfile;
 cpuThrottling?: number;
 
 // Advanced Configuration
 locale?: string;
 timezone?: string;
 geolocation?: Geolocation;
 permissions?: Permission[];
 extraHTTPHeaders?: Record<string, string>;
 httpCredentials?: HTTPCredentials;
 userAgent?: string;
 viewport?: Viewport;
 deviceScaleFactor?: number;
 isMobile?: boolean;
 hasTouch?: boolean;
 colorScheme?: ColorScheme;
 reducedMotion?: ReducedMotion;
 forcedColors?: ForcedColors;
 
 // Storage Configuration
 storageState?: string;
 saveStorageState?: string;
 clearStorage?: boolean;
 cookies?: Cookie[];
 localStorage?: Record<string, string>;
 sessionStorage?: Record<string, string>;
 
 // Hooks Configuration
 globalSetup?: string;
 globalTeardown?: string;
 beforeAll?: string[];
 afterAll?: string[];
 beforeEach?: string[];
 afterEach?: string[];
 
 // Plugin Configuration
 plugins?: Plugin[];
 pluginOptions?: Record<string, any>;
 
 // Custom Configuration
 customOptions?: Record<string, any>;
 
 // CLI Options
 help?: boolean;
 version?: boolean;
 
 // Metadata
 executionId: string;
 startTime: Date;
 endTime?: Date;
 commandLine: string;
 hostInfo?: HostInfo;
 executionMode?: ExecutionMode;
 metadata?: Record<string, any>;
}

/**
* CLI argument definition with full validation support
*/
export interface CLIArgument {
 name: string;
 aliases?: string[];
 type: ArgumentType;
 required?: boolean;
 default?: any;
 description: string;
 examples?: string[];
 choices?: string[] | number[];
 validate?: (value: any) => boolean | void;
 transform?: (value: any) => any;
 dependsOn?: string;
 conflicts?: string[];
 array?: boolean;
 min?: number;
 max?: number;
 pattern?: RegExp;
 env?: string;
 config?: string;
 deprecated?: string;
 hidden?: boolean;
}

/**
* CLI flag definition (boolean options)
*/
export interface CLIFlag {
 name: string;
 aliases?: string[];
 description: string;
 deprecated?: string;
 hidden?: boolean;
}

/**
* CLI option type with additional metadata
*/
export interface CLIOption extends CLIArgument {
 group?: OptionGroup;
 priority?: number;
 experimental?: boolean;
 requiresValue?: boolean;
 multiple?: boolean;
 accumulate?: boolean;
}

/**
* Parsed command line arguments
*/
export interface ParsedArguments {
 [key: string]: any;
}

/**
* Validation error with context
*/
export interface ValidationError {
 argument: string;
 message: string;
 value?: any;
 type?: ValidationErrorType;
 suggestion?: string;
 code?: string;
}

/**
* Configuration file structure
*/
export interface ConfigFile {
 version?: string;
 extends?: string | string[];
 env?: Record<string, EnvironmentConfig>;
 profiles?: Record<string, ProfileConfig>;
 options?: Partial<ExecutionOptions>;
 plugins?: PluginConfig[];
 hooks?: HooksConfig;
 paths?: PathsConfig;
 variables?: Record<string, any>;
}

/**
* Browser type enumeration
*/
export type BrowserType = 'chromium' | 'firefox' | 'webkit' | 'chrome' | 'msedge';

/**
* Screenshot capture mode
*/
export type ScreenshotMode = 'always' | 'on-failure' | 'never' | 'manual';

/**
* Report format types
*/
export type ReportFormat = 'html' | 'pdf' | 'excel' | 'json' | 'xml' | 'markdown' | 'confluence' | 'slack';

/**
* Output format types for console/CI
*/
export type OutputFormat = 'tap' | 'teamcity' | 'github' | 'junit' | 'mocha' | 'spec' | 'json' | 'progress' | 'dot';

/**
* Argument value types
*/
export type ArgumentType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'path' | 'url' | 'regex' | 'json';

/**
* Option grouping for help display
*/
export type OptionGroup = 'Test Selection' | 'Execution' | 'Debug' | 'Reporting' | 'Configuration' | 'Network' | 'Advanced';

/**
* Validation error types
*/
export type ValidationErrorType = 'required' | 'type' | 'choice' | 'pattern' | 'range' | 'dependency' | 'conflict' | 'custom';

/**
* CI provider detection
*/
export type CIProvider = 'jenkins' | 'github' | 'gitlab' | 'azure' | 'circleci' | 'travis' | 'bitbucket' | 'teamcity' | 'bamboo' | 'custom';

/**
* Performance optimization mode
*/
export type PerformanceMode = 'default' | 'fast' | 'thorough' | 'memory-optimized' | 'cpu-optimized';

/**
* Execution mode for different contexts
*/
export type ExecutionMode = 'local' | 'ci' | 'debug' | 'profile' | 'record' | 'playback';

/**
* Verbose logging levels
*/
export type VerboseLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
* Color scheme options
*/
export type ColorScheme = 'light' | 'dark' | 'no-preference';

/**
* Reduced motion options
*/
export type ReducedMotion = 'reduce' | 'no-preference';

/**
* Forced colors options
*/
export type ForcedColors = 'active' | 'none';

/**
* Retry strategy configuration
*/
export interface RetryStrategy {
 maxAttempts: number;
 delay?: number;
 backoff?: BackoffStrategy;
 retryOn?: RetryCondition[];
 timeout?: number;
 jitter?: boolean;
}

/**
* Backoff strategy for retries
*/
export interface BackoffStrategy {
 type: 'fixed' | 'linear' | 'exponential' | 'fibonacci';
 initialDelay: number;
 maxDelay?: number;
 factor?: number;
}

/**
* Retry condition definition
*/
export interface RetryCondition {
 errorType?: string | RegExp;
 errorMessage?: string | RegExp;
 errorCode?: string | number;
 statusCode?: number[];
 custom?: (error: any) => boolean;
}

/**
* Shard configuration for distributed execution
*/
export interface ShardConfig {
 current: number;
 total: number;
 key?: ShardKey;
 distribution?: ShardDistribution;
}

/**
* Shard distribution key
*/
export type ShardKey = 'feature' | 'scenario' | 'tag' | 'hash' | 'round-robin';

/**
* Shard distribution strategy
*/
export type ShardDistribution = 'even' | 'weighted' | 'dynamic' | 'custom';

/**
* Video recording options
*/
export interface VideoOptions {
 dir?: string;
 size?: { width: number; height: number };
 codec?: VideoCodec;
 bitrate?: number;
 fps?: number;
 quality?: VideoQuality;
 saveAs?: VideoSaveStrategy;
}

/**
* Video codec options
*/
export type VideoCodec = 'h264' | 'vp8' | 'vp9' | 'av1';

/**
* Video quality presets
*/
export type VideoQuality = 'low' | 'medium' | 'high' | 'lossless';

/**
* Video save strategy
*/
export type VideoSaveStrategy = 'always' | 'on-failure' | 'on-retry' | 'manual';

/**
* Trace recording options
*/
export interface TraceOptions {
 dir?: string;
 screenshots?: boolean;
 snapshots?: boolean;
 sources?: boolean;
 categories?: TraceCategory[];
 includeTestResults?: boolean;
}

/**
* Trace categories
*/
export type TraceCategory = 'api' | 'browser' | 'navigation' | 'network' | 'console' | 'screencast';

/**
* Screenshot capture options
*/
export interface ScreenshotOptions {
 dir?: string;
 fullPage?: boolean;
 omitBackground?: boolean;
 quality?: number;
 type?: 'png' | 'jpeg';
 animations?: 'disabled' | 'allow';
 caret?: 'hide' | 'initial';
 scale?: 'css' | 'device';
 mask?: string[];
 clip?: BoundingBox;
}

/**
* Bounding box for screenshot clipping
*/
export interface BoundingBox {
 x: number;
 y: number;
 width: number;
 height: number;
}

/**
* Report generation options
*/
export interface ReportOptions {
 title?: string;
 logo?: string;
 theme?: ReportTheme;
 includePassedTests?: boolean;
 includeSkippedTests?: boolean;
 includeTestSteps?: boolean;
 includeTestData?: boolean;
 includeScreenshots?: boolean;
 includeVideos?: boolean;
 includeLogs?: boolean;
 includeNetwork?: boolean;
 includePerformance?: boolean;
 groupBy?: ReportGrouping;
 sortBy?: ReportSorting;
 customCSS?: string;
 customJS?: string;
 template?: string;
}

/**
* Report theme configuration
*/
export interface ReportTheme {
 primaryColor?: string;
 secondaryColor?: string;
 fontFamily?: string;
 fontSize?: string;
 darkMode?: boolean;
 compact?: boolean;
}

/**
* Report grouping options
*/
export type ReportGrouping = 'feature' | 'tag' | 'suite' | 'package' | 'none';

/**
* Report sorting options
*/
export type ReportSorting = 'name' | 'duration' | 'status' | 'timestamp';

/**
* Output formatting options
*/
export interface OutputOptions {
 colors?: boolean;
 timestamps?: boolean;
 verbose?: boolean;
 compact?: boolean;
 realtime?: boolean;
 buffer?: boolean;
 encoding?: BufferEncoding;
}

/**
* Result publishing options
*/
export interface PublishOptions {
 target: PublishTarget;
 url?: string;
 token?: string;
 project?: string;
 runName?: string;
 tags?: string[];
 links?: Link[];
 attachments?: Attachment[];
 updateExisting?: boolean;
 createNew?: boolean;
}

/**
* Publish target systems
*/
export type PublishTarget = 'ado' | 'jira' | 'slack' | 'teams' | 'email' | 's3' | 'artifactory' | 'custom';

/**
* Link reference
*/
export interface Link {
 name: string;
 url: string;
 type?: LinkType;
}

/**
* Link types
*/
export type LinkType = 'issue' | 'requirement' | 'documentation' | 'build' | 'other';

/**
* Attachment reference
*/
export interface Attachment {
 name: string;
 path: string;
 type?: string;
 encoding?: BufferEncoding;
}

/**
* Database connection configuration
*/
export interface DatabaseConnection {
 type: DatabaseType;
 host: string;
 port?: number;
 database: string;
 username?: string;
 password?: string;
 ssl?: boolean | DatabaseSSLConfig;
 poolSize?: number;
 connectionTimeout?: number;
 requestTimeout?: number;
 options?: Record<string, any>;
}

/**
* Database types
*/
export type DatabaseType = 'mssql' | 'mysql' | 'postgresql' | 'oracle' | 'mongodb' | 'redis' | 'cassandra' | 'dynamodb';

/**
* Database SSL configuration
*/
export interface DatabaseSSLConfig {
 ca?: string;
 cert?: string;
 key?: string;
 rejectUnauthorized?: boolean;
}

/**
* Proxy authentication
*/
export interface ProxyAuthentication {
 username: string;
 password: string;
 domain?: string;
 workstation?: string;
}

/**
* Proxy configuration options
*/
export interface ProxyOptions {
 protocol?: ProxyProtocol;
 tunnel?: boolean;
 localAddress?: string;
 headers?: Record<string, string>;
 timeout?: number;
 rejectUnauthorized?: boolean;
}

/**
* Proxy protocols
*/
export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

/**
* Authentication provider configuration
*/
export interface AuthProvider {
 type: AuthType;
 config: AuthConfig;
 fallback?: string;
}

/**
* Authentication types
*/
export type AuthType = 'basic' | 'bearer' | 'oauth2' | 'saml' | 'ldap' | 'kerberos' | 'ntlm' | 'apikey' | 'aws' | 'azure' | 'custom';

/**
* Authentication configuration
*/
export interface AuthConfig {
 url?: string;
 clientId?: string;
 clientSecret?: string;
 scope?: string[];
 grantType?: OAuth2GrantType;
 username?: string;
 password?: string;
 token?: string;
 apiKey?: string;
 headerName?: string;
 queryParam?: string;
 algorithm?: string;
 issuer?: string;
 audience?: string;
 privateKey?: string;
 publicKey?: string;
 certificate?: string;
 domain?: string;
 workstation?: string;
 realm?: string;
 servicePrincipalName?: string;
 custom?: Record<string, any>;
}

/**
* OAuth2 grant types
*/
export type OAuth2GrantType = 'authorization_code' | 'implicit' | 'password' | 'client_credentials' | 'refresh_token' | 'device_code';

/**
* Credential storage
*/
export interface Credential {
 id: string;
 type: CredentialType;
 username?: string;
 password?: string;
 token?: string;
 apiKey?: string;
 certificate?: Certificate;
 metadata?: Record<string, any>;
}

/**
* Credential types
*/
export type CredentialType = 'username-password' | 'token' | 'api-key' | 'certificate' | 'multi-factor';

/**
* Certificate configuration
*/
export interface Certificate {
 certPath?: string;
 keyPath?: string;
 pfxPath?: string;
 passphrase?: string;
 ca?: string | string[];
 subject?: CertificateSubject;
}

/**
* Certificate subject details
*/
export interface CertificateSubject {
 commonName?: string;
 organization?: string;
 organizationalUnit?: string;
 country?: string;
 state?: string;
 locality?: string;
 email?: string;
}

/**
* Network throttling profile
*/
export interface NetworkProfile {
 name?: string;
 downloadSpeed: number;
 uploadSpeed: number;
 latency: number;
 packetLoss?: number;
 connectionType?: ConnectionType;
}

/**
* Connection types for network emulation
*/
export type ConnectionType = '2g' | '3g' | '4g' | '5g' | 'wifi' | 'ethernet' | 'offline';

/**
* Geolocation coordinates
*/
export interface Geolocation {
 latitude: number;
 longitude: number;
 accuracy?: number;
 altitude?: number;
 altitudeAccuracy?: number;
 heading?: number;
 speed?: number;
}

/**
* Browser permissions
*/
export type Permission = 'geolocation' | 'notifications' | 'push' | 'camera' | 'microphone' | 
 'background-sync' | 'ambient-light-sensor' | 'accelerometer' | 'gyroscope' | 'magnetometer' |
 'accessibility-events' | 'clipboard-read' | 'clipboard-write' | 'payment-handler' | 'idle-detection' |
 'midi' | 'midi-sysex';

/**
* HTTP credentials for basic auth
*/
export interface HTTPCredentials {
 username: string;
 password: string;
}

/**
* Viewport configuration
*/
export interface Viewport {
 width: number;
 height: number;
}

/**
* Cookie definition
*/
export interface Cookie {
 name: string;
 value: string;
 domain?: string;
 path?: string;
 expires?: number;
 httpOnly?: boolean;
 secure?: boolean;
 sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
* Plugin configuration
*/
export interface Plugin {
 name: string;
 enabled?: boolean;
 path?: string;
 options?: Record<string, any>;
 hooks?: PluginHooks;
}

/**
* Plugin hook definitions
*/
export interface PluginHooks {
 onBeforeRun?: string;
 onAfterRun?: string;
 onBeforeFeature?: string;
 onAfterFeature?: string;
 onBeforeScenario?: string;
 onAfterScenario?: string;
 onBeforeStep?: string;
 onAfterStep?: string;
 onError?: string;
 onReport?: string;
}

/**
* Host information
*/
export interface HostInfo {
 hostname: string;
 platform: NodeJS.Platform;
 arch: string;
 cpus: number;
 memory: number;
 nodeVersion: string;
 ip?: string;
 user?: string;
}

/**
* Environment-specific configuration
*/
export interface EnvironmentConfig {
 name: string;
 displayName?: string;
 description?: string;
 variables?: Record<string, string>;
 services?: Record<string, ServiceConfig>;
 features?: FeatureFlags;
 data?: Record<string, any>;
}

/**
* Service configuration
*/
export interface ServiceConfig {
 url: string;
 auth?: AuthConfig;
 headers?: Record<string, string>;
 timeout?: number;
 retry?: RetryStrategy;
 healthCheck?: HealthCheckConfig;
}

/**
* Health check configuration
*/
export interface HealthCheckConfig {
 endpoint: string;
 method?: string;
 expectedStatus?: number[];
 timeout?: number;
 interval?: number;
 retries?: number;
}

/**
* Feature flags
*/
export interface FeatureFlags {
 [key: string]: boolean | FeatureFlag;
}

/**
* Feature flag configuration
*/
export interface FeatureFlag {
 enabled: boolean;
 rollout?: number;
 variants?: Record<string, any>;
 conditions?: FlagCondition[];
}

/**
* Feature flag condition
*/
export interface FlagCondition {
 type: 'user' | 'group' | 'percentage' | 'date' | 'custom';
 value: any;
 operator?: 'equals' | 'contains' | 'greater' | 'less' | 'between';
}

/**
* Profile configuration
*/
export interface ProfileConfig {
 name: string;
 description?: string;
 extends?: string | string[];
 options: Partial<ExecutionOptions>;
 variables?: Record<string, any>;
}

/**
* Hooks configuration
*/
export interface HooksConfig {
 globalSetup?: string | string[];
 globalTeardown?: string | string[];
 beforeAll?: string | string[];
 afterAll?: string | string[];
 beforeEach?: string | string[];
 afterEach?: string | string[];
 beforeFeature?: string | string[];
 afterFeature?: string | string[];
 beforeScenario?: string | string[];
 afterScenario?: string | string[];
 beforeStep?: string | string[];
 afterStep?: string | string[];
 onError?: string | string[];
 onRetry?: string | string[];
 onSkip?: string | string[];
}

/**
* Paths configuration
*/
export interface PathsConfig {
 features?: string | string[];
 steps?: string | string[];
 pages?: string | string[];
 hooks?: string | string[];
 support?: string | string[];
 data?: string | string[];
 reports?: string;
 screenshots?: string;
 videos?: string;
 traces?: string;
 downloads?: string;
 uploads?: string;
}

/**
* Plugin configuration in config file
*/
export interface PluginConfig {
 use: string;
 options?: Record<string, any>;
 enabled?: boolean;
}

/**
* Tag expression parser result
*/
export interface ParsedTagExpression {
 type: 'tag' | 'and' | 'or' | 'not';
 value?: string;
 left?: ParsedTagExpression;
 right?: ParsedTagExpression;
 operand?: ParsedTagExpression;
}

/**
* Compiled pattern for matching
*/
export interface CompiledPattern {
 source: string;
 regex?: RegExp;
 glob?: string;
 matcher: (value: string) => boolean;
}

/**
* Execution summary for reporting
*/
export interface ExecutionSummary {
 executionId: string;
 startTime: Date;
 endTime: Date;
 duration: number;
 totalFeatures: number;
 totalScenarios: number;
 totalSteps: number;
 passed: number;
 failed: number;
 skipped: number;
 pending: number;
 undefined: number;
 ambiguous: number;
 flaky: number;
 retried: number;
 tags: string[];
 status: ExecutionStatus;
 error?: string;
 metadata?: Record<string, any>;
}

// ExecutionStatus is now imported from bdd.types.ts

/**
* Step execution timing
*/
export interface StepTiming {
 start: number;
 end: number;
 duration: number;
 breakdown?: TimingBreakdown;
}

/**
* Timing breakdown for performance analysis
*/
export interface TimingBreakdown {
 wait?: number;
 action?: number;
 validation?: number;
 screenshot?: number;
 other?: number;
}

/**
* Test result for reporting
*/
export interface TestResult {
 id: string;
 name: string;
 status: TestStatus;
 duration: number;
 retries: number;
 error?: TestError;
 attachments: TestAttachment[];
 metadata: Record<string, any>;
 steps: StepResult[];
 tags: string[];
 timestamp: Date;
}

/**
* Test status enumeration
*/
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'undefined' | 'ambiguous';

/**
* Test error details
*/
export interface TestError {
 name: string;
 message: string;
 stack?: string;
 actual?: any;
 expected?: any;
 showDiff?: boolean;
 screenshot?: string;
 video?: string;
 trace?: string;
}

/**
* Test attachment
*/
export interface TestAttachment {
 name: string;
 type: AttachmentType;
 path?: string;
 content?: string | Buffer;
 encoding?: BufferEncoding;
 timestamp: Date;
}

/**
* Attachment types
*/
export type AttachmentType = 'screenshot' | 'video' | 'trace' | 'log' | 'har' | 'coverage' | 'other';

/**
* Step result for reporting
*/
export interface StepResult {
 keyword: string;
 name: string;
 line: number;
 status: TestStatus;
 duration: number;
 error?: TestError;
 embeddings: Embedding[];
 arguments?: StepArgument[];
 hidden?: boolean;
}

/**
* Step embedding (screenshots, logs, etc.)
*/
export interface Embedding {
 data: string | Buffer;
 mimeType: string;
 name?: string;
}

/**
* Step argument (data tables, doc strings)
*/
export interface StepArgument {
 type: 'DataTable' | 'DocString';
 content: any;
}

/**
* Configuration validation result
*/
export interface ConfigValidationResult {
 valid: boolean;
 errors: ConfigValidationError[];
 warnings: ConfigValidationWarning[];
 suggestions: ConfigSuggestion[];
}

/**
* Configuration validation error
*/
export interface ConfigValidationError {
 path: string;
 message: string;
 value?: any;
 expected?: any;
}

/**
* Configuration validation warning
*/
export interface ConfigValidationWarning {
 path: string;
 message: string;
 impact?: string;
}

/**
* Configuration suggestion
*/
export interface ConfigSuggestion {
 path: string;
 message: string;
 value?: any;
 reason?: string;
}

/**
* Execution context for runtime
*/
export interface ExecutionContext {
 options: ExecutionOptions;
 environment: EnvironmentConfig;
 services: Map<string, ServiceConfig>;
 data: Map<string, any>;
 metadata: Map<string, any>;
 temp: Map<string, any>;
}

/**
* Runtime state management
*/
export interface RuntimeState {
 currentFeature?: string;
 currentScenario?: string;
 currentStep?: string;
 currentExample?: number;
 retryCount: number;
 failureCount: number;
 skipRemaining: boolean;
 aborted: boolean;
 errors: Error[];
}

/**
* Worker configuration for parallel execution
*/
export interface WorkerConfig {
 id: string;
 index: number;
 total: number;
 features: string[];
 options: ExecutionOptions;
 env: Record<string, string>;
}

/**
* Worker result after execution
*/
export interface WorkerResult {
 workerId: string;
 startTime: Date;
 endTime: Date;
 results: TestResult[];
 coverage?: CoverageData;
 memory?: MemoryUsage;
 errors?: Error[];
}

/**
* Coverage data
*/
export interface CoverageData {
 lines: CoverageMetric;
 statements: CoverageMetric;
 functions: CoverageMetric;
 branches: CoverageMetric;
 files: FileCoverage[];
}

/**
* Coverage metric
*/
export interface CoverageMetric {
 total: number;
 covered: number;
 skipped: number;
 percentage: number;
}

/**
* File coverage data
*/
export interface FileCoverage {
 path: string;
 lines: CoverageMetric;
 statements: CoverageMetric;
 functions: CoverageMetric;
 branches: CoverageMetric;
 uncoveredLines: number[];
}

/**
* Memory usage statistics
*/
export interface MemoryUsage {
 rss: number;
 heapTotal: number;
 heapUsed: number;
 external: number;
 arrayBuffers: number;
}

/**
* Default values provider
*/
export class ExecutionOptionsDefaults {
 public static readonly DEFAULTS: Partial<ExecutionOptions> = {
   environment: 'dev',
   parallel: false,
   workers: 4,
   browser: 'chromium',
   headless: false,
   timeout: 30000,
   retry: 0,
   dryRun: false,
   bail: false,
   maxFailures: 0,
   debug: false,
   verbose: false,
   quiet: false,
   noColors: false,
   video: false,
   trace: false,
   screenshot: 'on-failure',
   updateSnapshots: false,
   reportName: 'Test Execution Report',
   reportPath: './reports',
   reportFormats: ['html'],
   outputFormats: [],
   ci: false,
   clearStorage: true
 };

 /**
  * Get default value for option
  */
 public static getDefault(option: keyof ExecutionOptions): any {
   return this.DEFAULTS[option];
 }

 /**
  * Merge options with defaults
  */
 public static mergeWithDefaults(options: Partial<ExecutionOptions>): ExecutionOptions {
   const merged = { ...this.DEFAULTS, ...options };
   
   // Ensure required fields
   if (!merged.executionId) {
     merged.executionId = this.generateExecutionId();
   }
   
   if (!merged.startTime) {
     merged.startTime = new Date();
   }
   
   if (!merged.commandLine) {
     merged.commandLine = process.argv.join(' ');
   }
   
   return merged as ExecutionOptions;
 }

 /**
  * Generate unique execution ID
  */
 private static generateExecutionId(): string {
   const timestamp = Date.now();
   const random = Math.random().toString(36).substring(2, 8);
   const pid = process.pid;
   
   return `exec-${timestamp}-${pid}-${random}`;
 }
}

/**
* Options validator
*/
export class ExecutionOptionsValidator {
 /**
  * Validate execution options
  */
 public static validate(options: ExecutionOptions): ConfigValidationResult {
   const errors: ConfigValidationError[] = [];
   const warnings: ConfigValidationWarning[] = [];
   const suggestions: ConfigSuggestion[] = [];

   // Validate environment
   if (!options.environment) {
     errors.push({
       path: 'environment',
       message: 'Environment is required'
     });
   }

   // Validate parallel execution
   if (options.parallel && options.workers < 1) {
     errors.push({
       path: 'workers',
       message: 'Workers must be at least 1 for parallel execution',
       value: options.workers,
       expected: '>= 1'
     });
   }

   // Validate shard configuration
   if (options.shard) {
     if (options.shard.current < 1 || options.shard.current > options.shard.total) {
       errors.push({
         path: 'shard.current',
         message: 'Current shard must be between 1 and total shards',
         value: options.shard.current,
         expected: `1-${options.shard.total}`
       });
     }
   }

   // Validate timeouts
   if (options.timeout < 1000) {
     warnings.push({
       path: 'timeout',
       message: 'Timeout less than 1 second may cause flaky tests',
       impact: 'Tests may fail due to insufficient time'
     });
   }

   // Suggest optimizations
   if (options.parallel && options.workers > 16) {
     suggestions.push({
       path: 'workers',
       message: 'Consider reducing workers to avoid resource exhaustion',
       value: 8,
       reason: 'Too many workers can degrade performance'
     });
   }

   // Validate paths
   if (options.reportPath && !this.isValidPath(options.reportPath)) {
     errors.push({
       path: 'reportPath',
       message: 'Invalid report path',
       value: options.reportPath
     });
   }

   // Check for deprecated options
   if (options.customOptions?.['legacyMode']) {
     warnings.push({
       path: 'customOptions.legacyMode',
       message: 'Legacy mode is deprecated and will be removed in next major version',
       impact: 'Some features may not work as expected'
     });
   }

   return {
     valid: errors.length === 0,
     errors,
     warnings,
     suggestions
   };
 }

 /**
  * Check if path is valid
  */
 private static isValidPath(path: string): boolean {
   // Simple path validation
   const invalidChars = /[<>:"|?*\x00-\x1f]/;
   return !invalidChars.test(path);
 }
}

/**
* Tag expression parser
*/
export class TagExpressionParser {
 /**
  * Parse tag expression string
  */
 public static parse(expression: string): ParsedTagExpression {
   // Remove extra whitespace
   expression = expression.trim().replace(/\s+/g, ' ');
   
   return this.parseExpression(expression);
 }

 /**
  * Parse expression recursively
  */
 private static parseExpression(expr: string): ParsedTagExpression {
   // Handle parentheses
   expr = expr.trim();
   
   if (expr.startsWith('(') && expr.endsWith(')')) {
     // Find matching closing parenthesis
     let depth = 0;
     // let matchingIndex = -1;
     
     for (let i = 0; i < expr.length; i++) {
       if (expr[i] === '(') depth++;
       if (expr[i] === ')') {
         depth--;
         if (depth === 0 && i === expr.length - 1) {
           return this.parseExpression(expr.substring(1, expr.length - 1));
         }
       }
     }
   }
   
   // Parse OR (lowest precedence)
   const orIndex = this.findOperator(expr, 'or');
   if (orIndex !== -1) {
     return {
       type: 'or',
       left: this.parseExpression(expr.substring(0, orIndex).trim()),
       right: this.parseExpression(expr.substring(orIndex + 2).trim())
     };
   }
   
   // Parse AND
   const andIndex = this.findOperator(expr, 'and');
   if (andIndex !== -1) {
     return {
       type: 'and',
       left: this.parseExpression(expr.substring(0, andIndex).trim()),
       right: this.parseExpression(expr.substring(andIndex + 3).trim())
     };
   }
   
   // Parse NOT
   if (expr.toLowerCase().startsWith('not ')) {
     return {
       type: 'not',
       operand: this.parseExpression(expr.substring(4).trim())
     };
   }
   
   // Must be a tag
   if (!expr.startsWith('@')) {
     throw new Error(`Invalid tag expression: tags must start with @, got: ${expr}`);
   }
   
   return {
     type: 'tag',
     value: expr
   };
 }

 /**
  * Find operator position outside of parentheses
  */
 private static findOperator(expr: string, operator: string): number {
   let depth = 0;
   const pattern = new RegExp(`\\b${operator}\\b`, 'i');
   
   for (let i = 0; i < expr.length; i++) {
     if (expr[i] === '(') depth++;
     if (expr[i] === ')') depth--;
     
     if (depth === 0) {
       const substring = expr.substring(i);
       const match = substring.match(pattern);
       
       if (match && match.index === 0) {
         return i;
       }
     }
   }
   
   return -1;
 }

 /**
  * Evaluate tag expression against tags
  */
 public static evaluate(expression: ParsedTagExpression, tags: string[]): boolean {
   switch (expression.type) {
     case 'tag':
       return tags.includes(expression.value!);
       
     case 'and':
       return this.evaluate(expression.left!, tags) && 
              this.evaluate(expression.right!, tags);
              
     case 'or':
       return this.evaluate(expression.left!, tags) || 
              this.evaluate(expression.right!, tags);
              
     case 'not':
       return !this.evaluate(expression.operand!, tags);
       
     default:
       throw new Error(`Unknown expression type: ${expression.type}`);
   }
 }
}

/**
* Pattern compiler for glob and regex patterns
*/
export class PatternCompiler {
 /**
  * Compile pattern string to matcher
  */
 public static compile(pattern: string): CompiledPattern {
   const isGlob = pattern.includes('*') || pattern.includes('?') || 
                  pattern.includes('[') || pattern.includes('{');
   
   if (isGlob) {
     return this.compileGlob(pattern);
   } else {
     return this.compileLiteral(pattern);
   }
 }

 /**
  * Compile glob pattern
  */
 private static compileGlob(pattern: string): CompiledPattern {
   // Convert glob to regex
   let regex = pattern
     .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
     .replace(/\*/g, '.*')                   // * -> .*
     .replace(/\?/g, '.');                   // ? -> .
   
   const re = new RegExp(`^${regex}$`);
   
   return {
     source: pattern,
     glob: pattern,
     regex: re,
     matcher: (value: string) => re.test(value)
   };
 }

 /**
  * Compile literal pattern
  */
 private static compileLiteral(pattern: string): CompiledPattern {
   return {
     source: pattern,
     matcher: (value: string) => value.includes(pattern)
   };
 }
}

/**
* Environment detector for CI systems
*/
export class CIEnvironmentDetector {
 /**
  * Detect CI provider
  */
 public static detect(): CIProvider | undefined {
   const env = process.env;
   
   if (env['JENKINS_URL'] || env['JENKINS_HOME']) {
     return 'jenkins';
   }
   
   if (env['GITHUB_ACTIONS']) {
     return 'github';
   }
   
   if (env['GITLAB_CI']) {
     return 'gitlab';
   }
   
   if (env['TF_BUILD'] || env['AZURE_PIPELINES']) {
     return 'azure';
   }
   
   if (env['CIRCLECI']) {
     return 'circleci';
   }
   
   if (env['TRAVIS']) {
     return 'travis';
   }
   
   if (env['BITBUCKET_BUILD_NUMBER']) {
     return 'bitbucket';
   }
   
   if (env['TEAMCITY_VERSION']) {
     return 'teamcity';
   }
   
   if (env['bamboo_buildNumber']) {
     return 'bamboo';
   }
   
   if (env['CI']) {
     return 'custom';
   }
   
   return undefined;
 }

 /**
  * Get CI-specific information
  */
 public static getCIInfo(): Partial<ExecutionOptions> {
   const provider = this.detect();
   const env = process.env;
   
   const info: Partial<ExecutionOptions> = {
     ci: true
   };
   
   if (provider) {
     info.ciProvider = provider;
   }
   
   switch (provider) {
     case 'github':
       if (env['GITHUB_RUN_ID']) {
         info.buildId = env['GITHUB_RUN_ID'];
       }
       if (env['GITHUB_SERVER_URL'] && env['GITHUB_REPOSITORY'] && env['GITHUB_RUN_ID']) {
         info.buildUrl = `${env['GITHUB_SERVER_URL']}/${env['GITHUB_REPOSITORY']}/actions/runs/${env['GITHUB_RUN_ID']}`;
       }
       if (env['GITHUB_JOB']) {
         info.jobName = env['GITHUB_JOB'];
       }
       if (env['GITHUB_REF_NAME']) {
         info.branchName = env['GITHUB_REF_NAME'];
       }
       if (env['GITHUB_SHA']) {
         info.commitSha = env['GITHUB_SHA'];
       }
       if (env['GITHUB_EVENT_NAME'] === 'pull_request' && env['GITHUB_EVENT_PATH']) {
         info.pullRequestId = env['GITHUB_EVENT_PATH'];
       }
       break;
       
     case 'jenkins':
       if (env['BUILD_ID']) {
         info.buildId = env['BUILD_ID'];
       }
       if (env['BUILD_URL']) {
         info.buildUrl = env['BUILD_URL'];
       }
       if (env['JOB_NAME']) {
         info.jobName = env['JOB_NAME'];
       }
       if (env['BRANCH_NAME']) {
         info.branchName = env['BRANCH_NAME'];
       } else if (env['GIT_BRANCH']) {
         info.branchName = env['GIT_BRANCH'];
       }
       if (env['GIT_COMMIT']) {
         info.commitSha = env['GIT_COMMIT'];
       }
       break;
       
     case 'azure':
       if (env['BUILD_BUILDID']) {
         info.buildId = env['BUILD_BUILDID'];
       }
       if (env['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'] && env['SYSTEM_TEAMPROJECT'] && env['BUILD_BUILDID']) {
         info.buildUrl = `${env['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI']}${env['SYSTEM_TEAMPROJECT']}/_build/results?buildId=${env['BUILD_BUILDID']}`;
       }
       if (env['BUILD_DEFINITIONNAME']) {
         info.jobName = env['BUILD_DEFINITIONNAME'];
       }
       if (env['BUILD_SOURCEBRANCHNAME']) {
         info.branchName = env['BUILD_SOURCEBRANCHNAME'];
       }
       if (env['BUILD_SOURCEVERSION']) {
         info.commitSha = env['BUILD_SOURCEVERSION'];
       }
       if (env['SYSTEM_PULLREQUEST_PULLREQUESTID']) {
         info.pullRequestId = env['SYSTEM_PULLREQUEST_PULLREQUESTID'];
       }
       break;
       
     // Add other CI providers...
   }
   
   return info;
 }
}