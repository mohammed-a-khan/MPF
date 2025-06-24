// src/core/configuration/ConfigurationManager.ts

import { EnvironmentLoader } from './EnvironmentLoader';
import { HierarchicalEnvironmentLoader } from './HierarchicalEnvironmentLoader';
import { ConfigurationValidator } from './ConfigurationValidator';
import { 
  ConfigMap, 
  ValidationResult, 
  ConfigurationOptions,
  LoadedConfiguration,
  FrameworkConfig,
  APIConfig
} from './types/config.types';

// Import encryption support for transparent background decryption
import { CryptoUtils } from '../utils/CryptoUtils';

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private static config: ConfigMap = {};
  private static loadedConfiguration: LoadedConfiguration | null = null;
  private static readonly environmentLoader = new EnvironmentLoader();
  private static readonly hierarchicalLoader = new HierarchicalEnvironmentLoader();
  private static readonly validator = new ConfigurationValidator();
  private static isInitialized = false;
  
  // Transparent encryption support
  private static encryptionEnabled = true; // Auto-enable encryption
  private static decryptionCache = new Map<string, string>();

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
   * Load configuration with method overloading support
   * Supports both new (project, environment) and legacy (environment only) signatures
   */
  static async loadConfiguration(environment: string, options?: Partial<ConfigurationOptions>): Promise<void>;
  static async loadConfiguration(project: string, environment: string, options?: Partial<ConfigurationOptions>): Promise<void>;
  static async loadConfiguration(projectOrEnvironment: string, environmentOrOptions?: string | Partial<ConfigurationOptions>, options?: Partial<ConfigurationOptions>): Promise<void> {
    // Handle method overloading
    let project: string;
    let environment: string;
    let actualOptions: Partial<ConfigurationOptions> | undefined;

    if (typeof environmentOrOptions === 'string') {
      // New signature: loadConfiguration(project, environment, options?)
      project = projectOrEnvironment;
      environment = environmentOrOptions;
      actualOptions = options;
      console.log(`🚀 Loading configuration for project: ${project}, environment: ${environment}`);
    } else {
      // Legacy signature: loadConfiguration(environment, options?)
      environment = projectOrEnvironment;
      actualOptions = environmentOrOptions;
      
      // Infer project from environment or use default
      project = ConfigurationManager.inferProjectFromEnvironment(environment);
      console.log(`🔄 Legacy mode: inferred project '${project}' for environment '${environment}'`);
    }

    try {
      // Use hierarchical loader for new project-based structure
      const hierarchicalConfig = await ConfigurationManager.hierarchicalLoader.loadConfiguration(project, environment);
      
      // Merge with any legacy configuration if needed
      const legacyConfig = await ConfigurationManager.loadLegacyConfiguration(environment, actualOptions);
      
      // Merge configurations (hierarchical takes precedence)
      ConfigurationManager.config = { ...legacyConfig, ...hierarchicalConfig };
      
      // Create loaded configuration metadata
      ConfigurationManager.loadedConfiguration = {
        raw: ConfigurationManager.config,
        parsed: ConfigurationManager.parseConfiguration(ConfigurationManager.config),
        project: project,
        environment: environment,
        loadedAt: new Date(),
        sources: [`${project}/hierarchical`, 'legacy-fallback']
      };

      ConfigurationManager.isInitialized = true;
      console.log(`✅ Configuration loaded successfully: ${Object.keys(ConfigurationManager.config).length} total keys`);
      
    } catch (error) {
      console.error('❌ Failed to load configuration:', error);
      throw new Error(`Configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load legacy configuration as fallback
   */
  private static async loadLegacyConfiguration(environment: string, options?: Partial<ConfigurationOptions>): Promise<ConfigMap> {
    try {
      // Only load global.env and other .env files except environment-specific ones
      const config = await ConfigurationManager.environmentLoader.loadGlobalConfig();
      console.log('✅ Loaded global configuration');
      return config;
    } catch (error) {
      console.log(`⚠️  Legacy configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {};
    }
  }

  /**
   * Infer project from environment name or use default
   */
  private static inferProjectFromEnvironment(environment: string): string {
    // Extract project name from environment or use default
    const projectMatch = environment.match(/^([a-zA-Z0-9-_]+)[-_]?/);
    return projectMatch && projectMatch[1] ? projectMatch[1] : 'akhan';
  }

  /**
   * Parse raw configuration into typed configuration object
   */
  private static parseConfiguration(config: ConfigMap): Partial<FrameworkConfig> {
    return {
      // Framework metadata
      frameworkName: config['FRAMEWORK_NAME'] || 'CS Framework',
      logLevel: (config['LOG_LEVEL'] as any) || 'info',
      
      // Environment
      environment: {
        name: config['ENVIRONMENT_NAME'] || 'unknown',
        baseURL: config['BASE_URL'] || '',
        apiBaseURL: config['API_BASE_URL'] || ''
      },
      
      // Browser settings
      browser: {
        browser: (config['BROWSER_TYPE'] || config['DEFAULT_BROWSER'] || 'chromium') as any,
        headless: ConfigurationManager.parseBoolean(config['BROWSER_HEADLESS'] || config['HEADLESS_MODE']) || false,
        slowMo: ConfigurationManager.parseNumber(config['BROWSER_SLOW_MO']) || 0,
        timeout: ConfigurationManager.parseNumber(config['DEFAULT_TIMEOUT']) || 30000,
        viewport: {
          width: ConfigurationManager.parseNumber(config['VIEWPORT_WIDTH']) || 1280,
          height: ConfigurationManager.parseNumber(config['VIEWPORT_HEIGHT']) || 720
        },
        downloadsPath: config['DOWNLOADS_PATH'] || './downloads',
        ignoreHTTPSErrors: ConfigurationManager.parseBoolean(config['IGNORE_HTTPS_ERRORS']) || false
      },
      
      // Database (only if host is provided)
      ...(config['DATABASE_HOST'] ? {
        database: {
          type: (config['DATABASE_TYPE'] as any) || 'sqlserver',
          host: config['DATABASE_HOST'],
          port: ConfigurationManager.parseNumber(config['DATABASE_PORT']) || 1433,
          database: config['DATABASE_NAME'] || '',
          username: config['DATABASE_USERNAME'] || '',
          password: config['DATABASE_PASSWORD'] || '',
          connectionPoolSize: ConfigurationManager.parseNumber(config['DATABASE_POOL_SIZE']) || 10
        }
      } : {}),
      
      // API settings
      api: {
        timeout: ConfigurationManager.parseNumber(config['API_TIMEOUT']) || 30000,
        retryCount: ConfigurationManager.parseNumber(config['API_RETRY_COUNT']) || 3,
        retryDelay: ConfigurationManager.parseNumber(config['API_RETRY_DELAY']) || 1000,
        validateSSL: ConfigurationManager.parseBoolean(config['API_VALIDATE_SSL']) !== false,
        logRequestBody: ConfigurationManager.parseBoolean(config['API_LOG_REQUEST_BODY']) || false,
        logResponseBody: ConfigurationManager.parseBoolean(config['API_LOG_RESPONSE_BODY']) || false,
        baseURL: config['API_BASE_URL'] || '',
        headers: config['API_DEFAULT_HEADERS'] ? JSON.parse(config['API_DEFAULT_HEADERS']) : undefined
      },
      
      // Execution settings
      execution: {
        parallel: ConfigurationManager.parseBoolean(config['PARALLEL_EXECUTION']) || false,
        maxWorkers: ConfigurationManager.parseNumber(config['MAX_WORKERS']) || 1,
        retryCount: ConfigurationManager.parseNumber(config['RETRY_COUNT'] || config['DEFAULT_RETRY_COUNT']) || 0,
        retryDelay: ConfigurationManager.parseNumber(config['RETRY_DELAY']) || 1000,
        timeout: ConfigurationManager.parseNumber(config['DEFAULT_TIMEOUT']) || 30000,
        screenshotOnFailure: ConfigurationManager.parseBoolean(config['SCREENSHOT_ON_FAILURE']) || true
      },
      
      // Report settings
      report: {
        path: config['REPORT_PATH'] || './reports',
        themePrimaryColor: config['REPORT_THEME_PRIMARY'] || '#007bff',
        generatePDF: ConfigurationManager.parseBoolean(config['REPORT_GENERATE_PDF']) || false,
        generateExcel: ConfigurationManager.parseBoolean(config['REPORT_GENERATE_EXCEL']) || false,
        includeScreenshots: ConfigurationManager.parseBoolean(config['REPORT_INCLUDE_SCREENSHOTS']) || true,
        includeVideos: ConfigurationManager.parseBoolean(config['REPORT_INCLUDE_VIDEOS']) || true,
        includeLogs: ConfigurationManager.parseBoolean(config['REPORT_INCLUDE_LOGS']) || true
      },
      
      // AI settings
      ai: {
        enabled: ConfigurationManager.parseBoolean(config['AI_ENABLED']) || false,
        selfHealingEnabled: ConfigurationManager.parseBoolean(config['AI_SELF_HEALING_ENABLED']) || false,
        confidenceThreshold: ConfigurationManager.parseNumber(config['AI_CONFIDENCE_THRESHOLD']) || 0.8,
        maxHealingAttempts: ConfigurationManager.parseNumber(config['AI_MAX_HEALING_ATTEMPTS']) || 3,
        cacheEnabled: ConfigurationManager.parseBoolean(config['AI_CACHE_ENABLED']) || true,
        cacheTTL: ConfigurationManager.parseNumber(config['AI_CACHE_TTL']) || 3600
      }
    };
  }

  /**
   * Get configuration value by key with automatic encryption detection and decryption
   */
  static get(key: string, defaultValue: string = ''): string {
    if (!ConfigurationManager.isInitialized) {
      console.warn('⚠️  Configuration not initialized. Call loadConfiguration() first.');
      return defaultValue;
    }
    
    const rawValue = ConfigurationManager.config[key] || defaultValue;
    
    // Transparent encryption support - automatically decrypt if encrypted
    if (ConfigurationManager.encryptionEnabled && rawValue.startsWith('ENCRYPTED:')) {
      return ConfigurationManager.decryptValue(rawValue, key);
    }
    
    return rawValue;
  }

  /**
   * Get configuration value as boolean
   */
  static getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = ConfigurationManager.get(key);
    return ConfigurationManager.parseBoolean(value) ?? defaultValue;
  }

  /**
   * Get configuration value as number
   */
  static getNumber(key: string, defaultValue?: number): number | undefined {
    const value = ConfigurationManager.get(key);
    return ConfigurationManager.parseNumber(value) ?? defaultValue;
  }

  /**
   * Get configuration value as integer
   */
  static getInt(key: string, defaultValue: number = 0): number {
    const value = ConfigurationManager.get(key);
    return ConfigurationManager.parseNumber(value) ?? defaultValue;
  }

  /**
   * Get configuration value as float
   */
  static getFloat(key: string, defaultValue: number = 0.0): number {
    const value = ConfigurationManager.get(key);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get required configuration value (throws if missing)
   */
  static getRequired(key: string): string {
    const value = ConfigurationManager.get(key);
    if (value === undefined || value === '') {
      throw new Error(`Required configuration key '${key}' is missing or empty`);
    }
    return value;
  }

  /**
   * Get configuration value as array (split by delimiter)
   */
  static getArray(key: string, delimiter: string = ','): string[] {
    const value = ConfigurationManager.get(key);
    if (!value) return [];
    return value.split(delimiter).map(item => item.trim()).filter(item => item.length > 0);
  }

  /**
   * Check if configuration key exists
   */
  static has(key: string): boolean {
    return ConfigurationManager.config[key] !== undefined;
  }

  /**
   * Set configuration value (for runtime updates)
   */
  static set(key: string, value: string): void {
    ConfigurationManager.config[key] = value;
  }

  /**
   * Get all configuration keys
   */
  static getAllKeys(): string[] {
    return Object.keys(ConfigurationManager.config);
  }

  /**
   * Get environment name
   */
  static getEnvironmentName(): string {
    return ConfigurationManager.get('ENVIRONMENT_NAME') || 
           ConfigurationManager.get('ENV') || 
           'unknown';
  }

  /**
   * Get all configuration
   */
  static getAll(): ConfigMap {
    return { ...ConfigurationManager.config };
  }

  /**
   * Get loaded configuration metadata
   */
  static getLoadedConfiguration(): LoadedConfiguration | null {
    return ConfigurationManager.loadedConfiguration;
  }

  /**
   * Validate current configuration
   */
  static validate(): ValidationResult {
    if (!ConfigurationManager.isInitialized) {
      return {
        valid: false,
        errors: ['Configuration not initialized'],
        warnings: []
      };
    }
    
    return ConfigurationManager.validator.validate(ConfigurationManager.config);
  }

  /**
   * Parse string value to boolean
   */
  private static parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
  }

  /**
   * Parse string value to number
   */
  private static parseNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  /**
   * Reset configuration (for testing)
   */
  static reset(): void {
    ConfigurationManager.config = {};
    ConfigurationManager.loadedConfiguration = null;
    ConfigurationManager.isInitialized = false;
  }

  /**
   * Get configuration value as JSON
   */
  static getJSON<T = any>(key: string, defaultValue?: T): T {
    const value = ConfigurationManager.get(key);
    if (!value) return defaultValue as T;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn(`⚠️  Failed to parse JSON for key '${key}':`, error);
      return defaultValue as T;
    }
  }

  /**
   * Export all configuration for external use
   */
  static export(): ConfigMap {
    return { ...ConfigurationManager.config };
  }

  /**
   * Transparently decrypt encrypted configuration values
   * Uses internal encryption key - no passwords needed
   */
  private static decryptValue(encryptedValue: string, key: string): string {
    try {
      // Check cache first for performance
      const cacheKey = `${key}:${encryptedValue}`;
      if (ConfigurationManager.decryptionCache.has(cacheKey)) {
        return ConfigurationManager.decryptionCache.get(cacheKey)!;
      }

      // Remove ENCRYPTED: prefix
      const base64Data = encryptedValue.replace('ENCRYPTED:', '');
      
      // Parse the encryption data (same format as encryption tool)
      const encryptionData = JSON.parse(atob(base64Data));
      
      // Use Node.js crypto directly for synchronous decryption
      const crypto = require('crypto');
      const internalKey = 'CS-Framework-2024-Internal-Encryption-Key-V1';
      const fixedSalt = Buffer.from('CS-Framework-Salt-2024');
      
      // Derive key using PBKDF2 (synchronous)
      const derivedKey = crypto.pbkdf2Sync(internalKey, fixedSalt, 10000, 32, 'sha256');
      
      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(encryptionData.iv, 'base64'));
      
      // Set auth tag if present
      if (encryptionData.tag) {
        decipher.setAuthTag(Buffer.from(encryptionData.tag, 'base64'));
      }
      
      // Decrypt
      let decrypted = decipher.update(encryptionData.encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Cache the result for performance
      ConfigurationManager.decryptionCache.set(cacheKey, decrypted);
      
      // Log decryption (without showing sensitive data)
      if (ConfigurationManager.isSensitiveKey(key)) {
        console.log(`🔓 Decrypted sensitive configuration: ${key} (length: ${decrypted.length})`);
      }
      
      return decrypted;
    } catch (error) {
      console.error(`❌ Failed to decrypt configuration value for key '${key}':`, error);
      // Return the encrypted value as fallback to prevent breaking the application
      return encryptedValue;
    }
  }

  /**
   * Check if a configuration key contains sensitive data
   */
  private static isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      'password', 'passwd', 'pwd', 'secret', 'token', 'key', 'credential', 'auth',
      'api_key', 'apikey', 'access_token', 'refresh_token', 'bearer_token',
      'pat_token', 'personal_access_token', 'private_key', 'client_secret',
      'connection_string', 'database_password', 'db_password'
    ];
    
    return sensitivePatterns.some(pattern => 
      key.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Clear decryption cache (for security)
   */
  static clearDecryptionCache(): void {
    ConfigurationManager.decryptionCache.clear();
    console.log('🧹 Configuration decryption cache cleared');
  }

  /**
   * Enable or disable transparent encryption
   */
  static setEncryptionEnabled(enabled: boolean): void {
    ConfigurationManager.encryptionEnabled = enabled;
    if (!enabled) {
      ConfigurationManager.clearDecryptionCache();
    }
    console.log(`🔐 Transparent encryption ${enabled ? 'enabled' : 'disabled'}`);
  }
}