// src/core/configuration/types/config.types.ts

export interface ConfigMap {
  [key: string]: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface BrowserConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  slowMo: number;
  timeout: number;
  viewport: {
    width: number;
    height: number;
  };
  downloadsPath: string;
  ignoreHTTPSErrors: boolean;
  args?: string[];
  proxy?: ProxyConfig;
  tracesDir?: string;
  videosDir?: string;
}

export interface APIConfig {
  timeout: number;
  retryCount: number;
  retryDelay: number;
  validateSSL: boolean;
  logRequestBody: boolean;
  logResponseBody: boolean;
  baseURL?: string;
  headers?: Record<string, string>;
}

export interface DatabaseConfig {
  type: 'sqlserver' | 'oracle' | 'mysql' | 'postgresql' | 'mongodb' | 'redis';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionPoolSize: number;
  connectionTimeout?: number;
  options?: Record<string, any>;
}

export interface ReportConfig {
  path: string;
  themePrimaryColor: string;
  themeSecondaryColor?: string;
  generatePDF: boolean;
  generateExcel: boolean;
  generateJSON?: boolean;
  includeScreenshots: boolean;
  includeVideos: boolean;
  includeLogs: boolean;
  includeNetworkLogs?: boolean;
  includePerformanceMetrics?: boolean;
  customCSS?: string;
  customLogo?: string;
  reportTitle?: string;
}

export interface ProxyConfig {
  enabled: boolean;
  server: string;
  port: number;
  username?: string;
  password?: string;
  bypass?: string[];
  protocol?: 'http' | 'https' | 'socks5';
}

export interface AIConfig {
  enabled: boolean;
  selfHealingEnabled: boolean;
  confidenceThreshold: number;
  maxHealingAttempts: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  visualMatchingEnabled?: boolean;
  nlpEnabled?: boolean;
}

export interface ExecutionConfig {
  parallel: boolean;
  maxWorkers: number;
  retryCount: number;
  retryDelay: number;
  timeout: number;
  slowMo?: number;
  dryRun?: boolean;
  debugMode?: boolean;
  screenshotOnFailure: boolean;
  videoOnFailure?: boolean;
  traceOnFailure?: boolean;
}

export interface EnvironmentConfig {
  name: string;
  baseURL: string;
  apiBaseURL?: string;
  database?: DatabaseConfig;
  credentials?: Record<string, { username: string; password: string }>;
}

export interface FrameworkConfig {
  frameworkName: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  browser: BrowserConfig;
  api: APIConfig;
  database?: DatabaseConfig;
  report: ReportConfig;
  proxy?: ProxyConfig;
  ai: AIConfig;
  execution: ExecutionConfig;
  environment: EnvironmentConfig;
}

export interface ConfigurationOptions {
  environment: string;
  configPath?: string;
  overrides?: Partial<ConfigMap>;
}

export interface RequiredConfigFields {
  global: string[];
  browser: string[];
  api: string[];
  database: string[];
  report: string[];
  ai: string[];
}

export interface ConfigValidationRule {
  field: string;
  required: boolean;
  type?: 'string' | 'number' | 'boolean' | 'url' | 'email' | 'path';
  pattern?: RegExp;
  min?: number;
  max?: number;
  enum?: string[];
  custom?: (value: any) => boolean;
  message?: string;
}

export interface ConfigDependency {
  field: string;
  dependsOn: string;
  condition?: (dependencyValue: any) => boolean;
}

export interface LoadedConfiguration {
  raw: ConfigMap;
  parsed: Partial<FrameworkConfig>;
  project: string;
  environment: string;
  loadedAt: Date;
  sources: string[];
}