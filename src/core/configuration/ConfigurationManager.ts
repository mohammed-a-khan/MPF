// src/core/configuration/ConfigurationManager.ts

import { EnvironmentLoader } from './EnvironmentLoader';
import { ConfigurationValidator } from './ConfigurationValidator';
import { 
  ConfigMap, 
  ValidationResult, 
  ConfigurationOptions,
  LoadedConfiguration,
  FrameworkConfig,
  APIConfig
} from './types/config.types';

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private static config: ConfigMap = {};
  private static loadedConfiguration: LoadedConfiguration | null = null;
  private static readonly environmentLoader = new EnvironmentLoader();
  private static readonly validator = new ConfigurationValidator();
  private static isInitialized = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Load configuration for specified environment
   */
  static async loadConfiguration(environment: string, options?: Partial<ConfigurationOptions>): Promise<void> {
    try {
      console.log(`Loading configuration for environment: ${environment}`);
      
      // Validate environment exists
      const isValidEnv = await this.environmentLoader.validateEnvironment(environment);
      if (!isValidEnv) {
        throw new Error(`Invalid environment: ${environment}. Available environments: ${await this.environmentLoader.getAvailableEnvironments()}`);
      }
      
      // Load environment files
      const loadedConfig = await this.environmentLoader.loadEnvironmentFiles(environment);
      
      // Apply overrides if provided
      if (options?.overrides) {
        Object.assign(loadedConfig, options.overrides);
      }
      
      // Validate configuration
      const validationResult = this.validator.validate(loadedConfig);
      if (!validationResult.valid) {
        throw new Error(`Configuration validation failed:\n${validationResult.errors.join('\n')}`);
      }
      
      // Store configuration
      this.config = loadedConfig;
      console.log(`DEBUG ConfigurationManager: Configuration stored with ${Object.keys(loadedConfig).length} keys`);
      console.log(`DEBUG ConfigurationManager: Sample keys after storing:`, Object.keys(loadedConfig).slice(0, 15));
      console.log(`DEBUG ConfigurationManager: STEP_DEFINITION_PATHS after storing:`, loadedConfig['STEP_DEFINITION_PATHS']);
      console.log(`DEBUG ConfigurationManager: this.config has ${Object.keys(this.config).length} keys`);
      console.log(`DEBUG ConfigurationManager: this.config STEP_DEFINITION_PATHS:`, this.config['STEP_DEFINITION_PATHS']);
      
      this.loadedConfiguration = {
        raw: loadedConfig,
        parsed: this.parseConfiguration(loadedConfig),
        environment,
        loadedAt: new Date(),
        sources: [`${environment}.env`, 'global.env']
      };
      
      console.log(`DEBUG ConfigurationManager: After setting loadedConfiguration, this.config has ${Object.keys(this.config).length} keys`);
      console.log(`DEBUG ConfigurationManager: Final this.config STEP_DEFINITION_PATHS:`, this.config['STEP_DEFINITION_PATHS']);

      this.isInitialized = true;
      console.log(`Configuration loaded successfully for ${environment}`);
      
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration value
   */
  static get(key: string, defaultValue?: string): string {
    // 🔥 FIX: Reduce debug logging spam - only log in verbose mode
    const isVerbose = process.env['CS_DEBUG'] === 'true';
    if (isVerbose) {
      console.log(`DEBUG ConfigurationManager.get: key=${key}, defaultValue='${defaultValue}', isInitialized=${this.isInitialized}`);
    }
    
    // If not initialized, check process.env first, then return default
    if (!this.isInitialized) {
      const envValue = process.env[key];
      if (isVerbose) {
        console.log(`DEBUG ConfigurationManager.get: not initialized, checking process.env[${key}]='${envValue}'`);
      }
      if (envValue !== undefined) {
        if (isVerbose) {
          console.log(`DEBUG ConfigurationManager.get: returning from process.env: '${envValue}'`);
        }
        return envValue;
      }
      if (isVerbose) {
        console.log(`DEBUG ConfigurationManager.get: returning default: '${defaultValue || ''}'`);
      }
      return defaultValue || '';
    }
    
    const configValue = this.config[key];
    const result = configValue || defaultValue || '';
    if (isVerbose) {
      console.log(`DEBUG ConfigurationManager.get: config[${key}]='${configValue}', returning='${result}'`);
      console.log(`DEBUG ConfigurationManager.get: available config keys:`, Object.keys(this.config).slice(0, 10));
    }
    return result;
  }

  /**
   * Get required configuration value
   */
  static getRequired(key: string): string {
    // If not initialized, check process.env first
    if (!this.isInitialized) {
      const envValue = process.env[key];
      if (envValue !== undefined && envValue !== '') {
        return envValue;
      }
      throw new Error(`Required configuration key not found: ${key} (configuration not initialized)`);
    }
    
    // Check process.env first, then config
    const envValue = process.env[key];
    if (envValue !== undefined && envValue !== '') {
      return envValue;
    }
    
    const value = this.config[key];
    if (!value) {
      throw new Error(`Required configuration key not found: ${key}`);
    }
    return value;
  }

  /**
   * Get integer configuration value
   */
  static getInt(key: string, defaultValue?: number): number {
    const value = this.get(key);
    if (!value && defaultValue !== undefined) {
      return defaultValue;
    }
    if (!value) {
      return 0;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Configuration value for ${key} is not a valid integer: ${value}`);
    }
    return parsed;
  }

  /**
   * Get float configuration value
   */
  static getFloat(key: string, defaultValue?: number): number {
    const value = this.get(key);
    if (!value && defaultValue !== undefined) {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new Error(`Configuration value for ${key} is not a valid float: ${value}`);
    }
    return parsed;
  }

  /**
   * Get boolean configuration value
   */
  static getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.get(key);
    if (!value && defaultValue !== undefined) {
      return defaultValue;
    }
    if (!value) {
      return false;
    }
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Configuration value for ${key} is not a valid boolean: ${value}`);
  }

  /**
   * Get array configuration value
   */
  static getArray(key: string, separator: string = ','): string[] {
    const value = this.get(key);
    // 🔥 FIX: Reduce debug logging spam - only log in verbose mode
    const isVerbose = process.env['CS_DEBUG'] === 'true';
    if (isVerbose) {
      console.log(`DEBUG ConfigurationManager.getArray: key=${key}, value='${value}', typeof='${typeof value}'`);
      console.log(`DEBUG ConfigurationManager.getArray: isInitialized=${this.isInitialized}, config keys:`, Object.keys(this.config || {}));
    }
    if (!value) {
      if (isVerbose) {
        console.log(`DEBUG ConfigurationManager.getArray: returning empty array for key=${key}`);
      }
      return [];
    }
    const result = value.split(separator).map(item => item.trim()).filter(item => item.length > 0);
    if (isVerbose) {
      console.log(`DEBUG ConfigurationManager.getArray: returning:`, result);
    }
    return result;
  }

  /**
   * Get JSON configuration value
   */
  static getJSON<T>(key: string): T {
    const value = this.get(key);
    if (!value) {
      throw new Error(`Configuration key not found: ${key}`);
    }
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      throw new Error(`Configuration value for ${key} is not valid JSON: ${value}`);
    }
  }

  /**
   * Reload configuration
   */
  static async reload(): Promise<void> {
    if (!this.loadedConfiguration) {
      throw new Error('No configuration loaded to reload');
    }
    await this.loadConfiguration(this.loadedConfiguration.environment);
  }

  /**
   * Set configuration value (runtime only)
   */
  static set(key: string, value: string): void {
    this.ensureInitialized();
    this.config[key] = value;
  }

  /**
   * Check if configuration key exists
   */
  static has(key: string): boolean {
    this.ensureInitialized();
    return key in this.config;
  }

  /**
   * Get environment name
   */
  static getEnvironmentName(): string {
    this.ensureInitialized();
    return this.loadedConfiguration?.environment || 'unknown';
  }

  /**
   * Validate current configuration
   */
  static validate(): ValidationResult {
    this.ensureInitialized();
    return this.validator.validate(this.config);
  }

  /**
   * Get all configuration keys
   */
  static getAllKeys(): string[] {
    this.ensureInitialized();
    return Object.keys(this.config);
  }

  /**
   * Get configuration by prefix
   */
  static getByPrefix(prefix: string): ConfigMap {
    this.ensureInitialized();
    const filtered: ConfigMap = {};
    Object.entries(this.config).forEach(([key, value]) => {
      if (key.startsWith(prefix)) {
        filtered[key] = value;
      }
    });
    return filtered;
  }

  /**
   * Export configuration (excludes sensitive data)
   */
  static export(includeSensitive: boolean = false): ConfigMap {
    this.ensureInitialized();
    const exported: ConfigMap = {};
    const sensitivePatterns = [/PASSWORD/i, /SECRET/i, /KEY/i, /TOKEN/i];
    
    Object.entries(this.config).forEach(([key, value]) => {
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      if (includeSensitive || !isSensitive) {
        exported[key] = isSensitive && !includeSensitive ? '***' : value;
      }
    });
    
    return exported;
  }

  /**
   * Get parsed framework configuration
   */
  static getFrameworkConfig(): Partial<FrameworkConfig> {
    this.ensureInitialized();
    return this.loadedConfiguration?.parsed || {};
  }

  /**
   * Parse raw configuration into typed structure
   */
  private static parseConfiguration(raw: ConfigMap): Partial<FrameworkConfig> {
    const apiConfig: APIConfig = {
      timeout: this.parseNumber(raw['API_DEFAULT_TIMEOUT'], 60000),
      retryCount: this.parseNumber(raw['API_RETRY_COUNT'], 3),
      retryDelay: this.parseNumber(raw['API_RETRY_DELAY'], 1000),
      validateSSL: this.parseBoolean(raw['API_VALIDATE_SSL'], true),
      logRequestBody: this.parseBoolean(raw['API_LOG_REQUEST_BODY']),
      logResponseBody: this.parseBoolean(raw['API_LOG_RESPONSE_BODY'])
    };
    
    if (raw['API_BASE_URL']) {
      apiConfig.baseURL = raw['API_BASE_URL'];
    }
    
    const config: Partial<FrameworkConfig> = {};
    
    if (raw['FRAMEWORK_NAME']) {
      config.frameworkName = raw['FRAMEWORK_NAME'];
    }
    
    if (raw['LOG_LEVEL']) {
      config.logLevel = raw['LOG_LEVEL'] as any;
    }
    
    config.browser = {
      browser: raw['DEFAULT_BROWSER'] as any,
      headless: this.parseBoolean(raw['HEADLESS_MODE']),
      slowMo: this.parseNumber(raw['BROWSER_SLOWMO'], 0),
      timeout: this.parseNumber(raw['DEFAULT_TIMEOUT'], 30000),
      viewport: {
        width: this.parseNumber(raw['VIEWPORT_WIDTH'], 1920),
        height: this.parseNumber(raw['VIEWPORT_HEIGHT'], 1080)
      },
      downloadsPath: raw['DOWNLOADS_PATH'] || './downloads',
      ignoreHTTPSErrors: this.parseBoolean(raw['IGNORE_HTTPS_ERRORS'])
    };
    
    config.api = apiConfig;
    
    config.report = {
      path: raw['REPORT_PATH'] || './reports',
      themePrimaryColor: raw['REPORT_THEME_PRIMARY_COLOR'] || '#93186C',
      generatePDF: this.parseBoolean(raw['GENERATE_PDF_REPORT']),
      generateExcel: this.parseBoolean(raw['GENERATE_EXCEL_REPORT']),
      includeScreenshots: this.parseBoolean(raw['INCLUDE_SCREENSHOTS'], true),
      includeVideos: this.parseBoolean(raw['INCLUDE_VIDEOS']),
      includeLogs: this.parseBoolean(raw['INCLUDE_LOGS'], true)
    };
    
    config.ai = {
      enabled: this.parseBoolean(raw['AI_ENABLED']),
      selfHealingEnabled: this.parseBoolean(raw['AI_SELF_HEALING_ENABLED']),
      confidenceThreshold: this.parseNumber(raw['AI_CONFIDENCE_THRESHOLD'], 0.75),
      maxHealingAttempts: this.parseNumber(raw['AI_MAX_HEALING_ATTEMPTS'], 3),
      cacheEnabled: this.parseBoolean(raw['AI_CACHE_ENABLED'], true),
      cacheTTL: this.parseNumber(raw['AI_CACHE_TTL'], 3600)
    };
    
    config.execution = {
      parallel: this.parseBoolean(raw['PARALLEL_EXECUTION']),
      maxWorkers: this.parseNumber(raw['MAX_PARALLEL_WORKERS'], 4),
      retryCount: this.parseNumber(raw['RETRY_COUNT'], 2),
      retryDelay: this.parseNumber(raw['RETRY_DELAY'], 1000),
      timeout: this.parseNumber(raw['EXECUTION_TIMEOUT'], 300000),
      screenshotOnFailure: this.parseBoolean(raw['SCREENSHOT_ON_FAILURE'], true)
    };
    
    return config;
  }

  /**
   * Helper to parse boolean values
   */
  private static parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  /**
   * Helper to parse number values
   */
  private static parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Ensure configuration is initialized
   */
  private static ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Configuration not initialized. Call loadConfiguration() first.');
    }
  }

  /**
   * Reset configuration (for testing)
   */
  static reset(): void {
    this.config = {};
    this.loadedConfiguration = null;
    this.isInitialized = false;
  }
}