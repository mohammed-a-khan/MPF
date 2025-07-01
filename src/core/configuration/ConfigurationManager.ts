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

import { CryptoUtils } from '../utils/CryptoUtils';

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private static config: ConfigMap = {};
  private static loadedConfiguration: LoadedConfiguration | null = null;
  private static readonly environmentLoader = new EnvironmentLoader();
  private static readonly hierarchicalLoader = new HierarchicalEnvironmentLoader();
  private static readonly validator = new ConfigurationValidator();
  private static isInitialized = false;
  
  private static encryptionEnabled = true;
  private static decryptionCache = new Map<string, string>();

  private constructor() {}

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  static async loadConfiguration(environment: string, options?: Partial<ConfigurationOptions>): Promise<void>;
  static async loadConfiguration(project: string, environment: string, options?: Partial<ConfigurationOptions>): Promise<void>;
  static async loadConfiguration(projectOrEnvironment: string, environmentOrOptions?: string | Partial<ConfigurationOptions>, options?: Partial<ConfigurationOptions>): Promise<void> {
    let project: string;
    let environment: string;
    let actualOptions: Partial<ConfigurationOptions> | undefined;

    if (typeof environmentOrOptions === 'string') {
      project = projectOrEnvironment;
      environment = environmentOrOptions;
      actualOptions = options;
      console.log(`🚀 Loading configuration for project: ${project}, environment: ${environment}`);
    } else {
      environment = projectOrEnvironment;
      actualOptions = environmentOrOptions;
      
      project = ConfigurationManager.inferProjectFromEnvironment(environment);
      console.log(`🔄 Legacy mode: inferred project '${project}' for environment '${environment}'`);
    }

    try {
      const hierarchicalConfig = await ConfigurationManager.hierarchicalLoader.loadConfiguration(project, environment);
      
      const legacyConfig = await ConfigurationManager.loadLegacyConfiguration(environment, actualOptions);
      
      ConfigurationManager.config = { ...legacyConfig, ...hierarchicalConfig };
      
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          ConfigurationManager.config[key] = value;
        }
      }
      
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

  private static async loadLegacyConfiguration(environment: string, options?: Partial<ConfigurationOptions>): Promise<ConfigMap> {
    try {
      const config = await ConfigurationManager.environmentLoader.loadGlobalConfig();
      console.log('✅ Loaded global configuration');
      return config;
    } catch (error) {
      console.log(`⚠️  Legacy configuration loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {};
    }
  }

  private static inferProjectFromEnvironment(environment: string): string {
    const projectMatch = environment.match(/^([a-zA-Z0-9-_]+)[-_]?/);
    return projectMatch && projectMatch[1] ? projectMatch[1] : 'akhan';
  }

  private static parseConfiguration(config: ConfigMap): Partial<FrameworkConfig> {
    return {
      frameworkName: config['FRAMEWORK_NAME'] || 'CS Framework',
      logLevel: (config['LOG_LEVEL'] as any) || 'info',
      
      environment: {
        name: config['ENVIRONMENT_NAME'] || 'unknown',
        baseURL: config['BASE_URL'] || '',
        apiBaseURL: config['API_BASE_URL'] || ''
      },
      
      browser: {
        browser: (config['BROWSER_TYPE'] || config['DEFAULT_BROWSER'] || 'chromium') as any,
        headless: ConfigurationManager.parseBoolean(config['BROWSER_HEADLESS'] || config['HEADLESS']) || false,
        slowMo: ConfigurationManager.parseNumber(config['BROWSER_SLOW_MO']) || 0,
        timeout: ConfigurationManager.parseNumber(config['DEFAULT_TIMEOUT']) || 30000,
        viewport: {
          width: ConfigurationManager.parseNumber(config['VIEWPORT_WIDTH']) || 1280,
          height: ConfigurationManager.parseNumber(config['VIEWPORT_HEIGHT']) || 720
        },
        downloadsPath: config['DOWNLOADS_PATH'] || './downloads',
        ignoreHTTPSErrors: ConfigurationManager.parseBoolean(config['IGNORE_HTTPS_ERRORS']) || false
      },
      
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
      
      execution: {
        parallel: ConfigurationManager.parseBoolean(config['PARALLEL_EXECUTION']) || false,
        maxWorkers: ConfigurationManager.parseNumber(config['MAX_WORKERS']) || 1,
        retryCount: ConfigurationManager.parseNumber(config['RETRY_COUNT'] || config['DEFAULT_RETRY_COUNT']) || 0,
        retryDelay: ConfigurationManager.parseNumber(config['RETRY_DELAY']) || 1000,
        timeout: ConfigurationManager.parseNumber(config['DEFAULT_TIMEOUT']) || 30000,
        screenshotOnFailure: ConfigurationManager.parseBoolean(config['SCREENSHOT_ON_FAILURE']) || true
      },
      
      report: {
        path: config['REPORT_PATH'] || './reports',
        themePrimaryColor: config['REPORT_THEME_PRIMARY'] || '#007bff',
        generatePDF: ConfigurationManager.parseBoolean(config['REPORT_GENERATE_PDF']) || false,
        generateExcel: ConfigurationManager.parseBoolean(config['REPORT_GENERATE_EXCEL']) || false,
        includeScreenshots: ConfigurationManager.parseBoolean(config['REPORT_INCLUDE_SCREENSHOTS']) || true,
        includeVideos: ConfigurationManager.parseBoolean(config['REPORT_INCLUDE_VIDEOS']) || true,
        includeLogs: ConfigurationManager.parseBoolean(config['REPORT_INCLUDE_LOGS']) || true
      },
      
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

  static get(key: string, defaultValue: string = ''): string {
    if (!ConfigurationManager.isInitialized) {
      console.warn('⚠️  Configuration not initialized. Call loadConfiguration() first.');
      return defaultValue;
    }
    
    const rawValue = ConfigurationManager.config[key] || defaultValue;
    
    if (ConfigurationManager.encryptionEnabled && rawValue.startsWith('ENCRYPTED:')) {
      return ConfigurationManager.decryptValue(rawValue, key);
    }
    
    return rawValue;
  }

  static getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = ConfigurationManager.get(key);
    return ConfigurationManager.parseBoolean(value) ?? defaultValue;
  }

  static getNumber(key: string, defaultValue?: number): number | undefined {
    const value = ConfigurationManager.get(key);
    return ConfigurationManager.parseNumber(value) ?? defaultValue;
  }

  static getInt(key: string, defaultValue: number = 0): number {
    const value = ConfigurationManager.get(key);
    return ConfigurationManager.parseNumber(value) ?? defaultValue;
  }

  static getFloat(key: string, defaultValue: number = 0.0): number {
    const value = ConfigurationManager.get(key);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  static getRequired(key: string): string {
    const value = ConfigurationManager.get(key);
    if (value === undefined || value === '') {
      throw new Error(`Required configuration key '${key}' is missing or empty`);
    }
    return value;
  }

  static getArray(key: string, delimiter: string = ','): string[] {
    const value = ConfigurationManager.get(key);
    if (!value) return [];
    return value.split(delimiter).map(item => item.trim()).filter(item => item.length > 0);
  }

  static has(key: string): boolean {
    return ConfigurationManager.config[key] !== undefined;
  }

  static set(key: string, value: string): void {
    ConfigurationManager.config[key] = value;
  }

  static getAllKeys(): string[] {
    return Object.keys(ConfigurationManager.config);
  }

  static getEnvironmentName(): string {
    return ConfigurationManager.get('ENVIRONMENT_NAME') || 
           ConfigurationManager.get('ENV') || 
           'unknown';
  }

  static getAll(): ConfigMap {
    return { ...ConfigurationManager.config };
  }

  static getLoadedConfiguration(): LoadedConfiguration | null {
    return ConfigurationManager.loadedConfiguration;
  }

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

  private static parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
  }

  private static parseNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  static reset(): void {
    ConfigurationManager.config = {};
    ConfigurationManager.loadedConfiguration = null;
    ConfigurationManager.isInitialized = false;
  }

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

  static export(): ConfigMap {
    return { ...ConfigurationManager.config };
  }

  private static decryptValue(encryptedValue: string, key: string): string {
    try {
      const cacheKey = `${key}:${encryptedValue}`;
      if (ConfigurationManager.decryptionCache.has(cacheKey)) {
        return ConfigurationManager.decryptionCache.get(cacheKey)!;
      }

      const base64Data = encryptedValue.replace('ENCRYPTED:', '');
      
      const encryptionData = JSON.parse(atob(base64Data));
      
      const crypto = require('crypto');
      const internalKey = 'CS-Framework-2024-Internal-Encryption-Key-V1';
      const fixedSalt = Buffer.from('CS-Framework-Salt');
      
      const derivedKey = crypto.pbkdf2Sync(internalKey, fixedSalt, 10000, 32, 'sha256');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(encryptionData.iv, 'base64'));
      
      if (encryptionData.tag) {
        decipher.setAuthTag(Buffer.from(encryptionData.tag, 'base64'));
      }
      
      let decrypted = decipher.update(encryptionData.encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      ConfigurationManager.decryptionCache.set(cacheKey, decrypted);
      
      if (ConfigurationManager.isSensitiveKey(key)) {
        console.log(`🔓 Decrypted sensitive configuration: ${key} (length: ${decrypted.length})`);
      }
      
      return decrypted;
    } catch (error) {
      console.error(`❌ Failed to decrypt configuration value for key '${key}':`, error);
      return encryptedValue;
    }
  }

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

  static clearDecryptionCache(): void {
    ConfigurationManager.decryptionCache.clear();
    console.log('🧹 Configuration decryption cache cleared');
  }

  static setEncryptionEnabled(enabled: boolean): void {
    ConfigurationManager.encryptionEnabled = enabled;
    if (!enabled) {
      ConfigurationManager.clearDecryptionCache();
    }
    console.log(`🔐 Transparent encryption ${enabled ? 'enabled' : 'disabled'}`);
  }
}
