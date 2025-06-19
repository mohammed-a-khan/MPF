import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Runner configuration management
 * Handles all execution-related configuration options
 */
export class RunnerConfig {
  private static instance: RunnerConfig;
  private config: RunnerConfiguration;
  private configFile?: string;
  private commandLineOverrides: Map<string, any>;

  private constructor() {
    this.commandLineOverrides = new Map();
    this.config = this.loadDefaultConfiguration();
  }

  static getInstance(): RunnerConfig {
    if (!RunnerConfig.instance) {
      RunnerConfig.instance = new RunnerConfig();
    }
    return RunnerConfig.instance;
  }

  /**
   * Load configuration from file and command line
   */
  async loadConfiguration(options: RunnerOptions): Promise<void> {
    ActionLogger.logDebug('RunnerConfig', 'Loading runner configuration');

    // Load from config file if specified
    if (options.configFile) {
      await this.loadFromFile(options.configFile);
    }

    // Apply command line overrides
    this.applyCommandLineOptions(options);

    // Validate configuration
    this.validateConfiguration();

    // Apply to ConfigurationManager
    this.applyToConfigurationManager();

    ActionLogger.logInfo('RunnerConfig', 'Runner configuration loaded successfully');
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfiguration(): RunnerConfiguration {
    return {
      // Execution settings
      execution: {
        parallel: ConfigurationManager.getBoolean('PARALLEL_EXECUTION', false),
        maxWorkers: ConfigurationManager.getInt('MAX_PARALLEL_WORKERS', 0),
        retryCount: ConfigurationManager.getInt('RETRY_COUNT', 0),
        retryDelay: ConfigurationManager.getInt('RETRY_DELAY', 1000),
        dryRun: false,
        stopOnFailure: ConfigurationManager.getBoolean('STOP_ON_FAILURE', false),
        randomize: ConfigurationManager.getBoolean('RANDOMIZE_EXECUTION', false),
        seed: ConfigurationManager.get('RANDOM_SEED', Date.now().toString())
      },

      // Test selection
      selection: {
        features: [] as string[],
        scenarios: [] as string[],
        tags: [] as string[],
        lineNumbers: [] as number[]
      },

      // Environment
      environment: {
        name: ConfigurationManager.getEnvironmentName(),
        baseUrl: ConfigurationManager.get('BASE_URL', ''),
        variables: {}
      },

      // Browser settings
      browser: {
        type: ConfigurationManager.get('DEFAULT_BROWSER', 'chromium') as any,
        headless: ConfigurationManager.getBoolean('HEADLESS_MODE', false),
        slowMo: ConfigurationManager.getInt('BROWSER_SLOWMO', 0),
        timeout: ConfigurationManager.getInt('DEFAULT_TIMEOUT', 30000),
        viewport: {
          width: ConfigurationManager.getInt('VIEWPORT_WIDTH', 1920),
          height: ConfigurationManager.getInt('VIEWPORT_HEIGHT', 1080)
        },
        args: ConfigurationManager.getArray('BROWSER_ARGS', ','),
        devtools: ConfigurationManager.getBoolean('BROWSER_DEVTOOLS', false)
      },

      // Reporting
      reporting: {
        outputPath: ConfigurationManager.get('REPORT_PATH', './reports'),
        formats: ConfigurationManager.getArray('REPORT_FORMATS', ','),
        includeScreenshots: ConfigurationManager.getBoolean('REPORT_INCLUDE_SCREENSHOTS', true),
        includeVideos: ConfigurationManager.getBoolean('REPORT_INCLUDE_VIDEOS', false),
        includeTraces: ConfigurationManager.getBoolean('REPORT_INCLUDE_TRACES', false),
        includeLogs: ConfigurationManager.getBoolean('REPORT_INCLUDE_LOGS', true),
        theme: {
          primaryColor: ConfigurationManager.get('REPORT_THEME_PRIMARY_COLOR', '#93186C'),
          secondaryColor: ConfigurationManager.get('REPORT_THEME_SECONDARY_COLOR', '#FFFFFF')
        }
      },

      // Debugging
      debugging: {
        enabled: ConfigurationManager.getBoolean('DEBUG_MODE', false),
        pauseOnFailure: ConfigurationManager.getBoolean('PAUSE_ON_FAILURE', false),
        screenshots: ConfigurationManager.getBoolean('SCREENSHOT_ON_FAILURE', true),
        videos: ConfigurationManager.getBoolean('RECORD_VIDEO', false),
        traces: ConfigurationManager.getBoolean('RECORD_TRACE', false),
        slowMotion: ConfigurationManager.getInt('DEBUG_SLOW_MOTION', 0),
        highlightElements: ConfigurationManager.getBoolean('HIGHLIGHT_ELEMENTS', false)
      },

      // Logging
      logging: {
        level: ConfigurationManager.get('LOG_LEVEL', 'info') as any,
        console: ConfigurationManager.getBoolean('LOG_TO_CONSOLE', true),
        file: ConfigurationManager.getBoolean('LOG_TO_FILE', true),
        filePath: ConfigurationManager.get('LOG_FILE_PATH', './logs'),
        includeTimestamp: ConfigurationManager.getBoolean('LOG_INCLUDE_TIMESTAMP', true),
        includeSource: ConfigurationManager.getBoolean('LOG_INCLUDE_SOURCE', true)
      },

      // Performance
      performance: {
        collectMetrics: ConfigurationManager.getBoolean('COLLECT_PERFORMANCE_METRICS', true),
        slowTestThreshold: ConfigurationManager.getInt('SLOW_TEST_THRESHOLD', 10000),
        memoryLimit: ConfigurationManager.getInt('MEMORY_LIMIT_MB', 2048),
        cpuThreshold: ConfigurationManager.getInt('CPU_THRESHOLD_PERCENT', 80)
      },

      // Network
      network: {
        timeout: ConfigurationManager.getInt('NETWORK_TIMEOUT', 30000),
        proxy: {
          enabled: ConfigurationManager.getBoolean('PROXY_ENABLED', false),
          server: ConfigurationManager.get('PROXY_SERVER', ''),
          port: ConfigurationManager.getInt('PROXY_PORT', 0),
          username: ConfigurationManager.get('PROXY_USERNAME', ''),
          password: ConfigurationManager.get('PROXY_PASSWORD', ''),
          bypass: ConfigurationManager.getArray('PROXY_BYPASS', ',')
        },
        har: {
          record: ConfigurationManager.getBoolean('RECORD_HAR', false),
          path: ConfigurationManager.get('HAR_PATH', './har'),
          content: ConfigurationManager.get('HAR_CONTENT', 'omit') as any
        }
      },

      // AI/Self-healing
      ai: {
        enabled: ConfigurationManager.getBoolean('AI_ENABLED', true),
        selfHealing: ConfigurationManager.getBoolean('AI_SELF_HEALING_ENABLED', true),
        confidenceThreshold: ConfigurationManager.getFloat('AI_CONFIDENCE_THRESHOLD', 0.75),
        maxHealingAttempts: ConfigurationManager.getInt('AI_MAX_HEALING_ATTEMPTS', 3),
        collectTrainingData: ConfigurationManager.getBoolean('AI_COLLECT_TRAINING_DATA', true)
      },

      // Integration
      integration: {
        ado: {
          enabled: ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false),
          url: ConfigurationManager.get('ADO_URL', ''),
          project: ConfigurationManager.get('ADO_PROJECT', ''),
          token: ConfigurationManager.get('ADO_TOKEN', ''),
          testPlanId: ConfigurationManager.get('ADO_TEST_PLAN_ID', ''),
          uploadResults: ConfigurationManager.getBoolean('ADO_UPLOAD_RESULTS', true)
        }
      },

      // Advanced
      advanced: {
        maxContexts: ConfigurationManager.getInt('MAX_BROWSER_CONTEXTS', 10),
        maxPages: ConfigurationManager.getInt('MAX_PAGES_PER_CONTEXT', 5),
        elementCacheSize: ConfigurationManager.getInt('ELEMENT_CACHE_SIZE', 1000),
        elementCacheTTL: ConfigurationManager.getInt('ELEMENT_CACHE_TTL', 60000),
        dataCacheSize: ConfigurationManager.getInt('DATA_CACHE_SIZE', 100),
        cleanupInterval: ConfigurationManager.getInt('CLEANUP_INTERVAL', 300000),
        gcInterval: ConfigurationManager.getInt('GC_INTERVAL', 600000)
      }
    };
  }

  /**
   * Load configuration from file
   */
  private async loadFromFile(filePath: string): Promise<void> {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found: ${absolutePath}`);
      }

      const content = await fs.promises.readFile(absolutePath, 'utf-8');
      const fileConfig = JSON.parse(content);

      // Merge with default configuration
      this.config = this.mergeConfigurations(this.config, fileConfig);
      this.configFile = absolutePath;

      ActionLogger.logInfo('RunnerConfig', `Configuration loaded from: ${absolutePath}`);
    } catch (error) {
      ActionLogger.logError('RunnerConfig: Failed to load configuration file', error as Error);
      throw error;
    }
  }

  /**
   * Apply command line options
   */
  private applyCommandLineOptions(options: RunnerOptions): void {
    // Execution options
    if (options.parallel !== undefined) {
      this.config.execution.parallel = options.parallel;
      this.commandLineOverrides.set('execution.parallel', options.parallel);
    }

    if (options.workers !== undefined) {
      this.config.execution.maxWorkers = options.workers;
      this.commandLineOverrides.set('execution.maxWorkers', options.workers);
    }

    if (options.retry !== undefined) {
      this.config.execution.retryCount = options.retry;
      this.commandLineOverrides.set('execution.retryCount', options.retry);
    }

    if (options.dryRun !== undefined) {
      this.config.execution.dryRun = options.dryRun;
      this.commandLineOverrides.set('execution.dryRun', options.dryRun);
    }

    // Selection options
    if (options.features && options.features.length > 0) {
      this.config.selection.features = options.features;
      this.commandLineOverrides.set('selection.features', options.features);
    }

    if (options.scenarios && options.scenarios.length > 0) {
      this.config.selection.scenarios = options.scenarios;
      this.commandLineOverrides.set('selection.scenarios', options.scenarios);
    }

    if (options.tags && options.tags.length > 0) {
      this.config.selection.tags = options.tags;
      this.commandLineOverrides.set('selection.tags', options.tags);
    }

    // Environment
    if (options.env) {
      this.config.environment.name = options.env;
      this.commandLineOverrides.set('environment.name', options.env);
    }

    // Browser options
    if (options.browser) {
      const validBrowsers = ['chromium', 'firefox', 'webkit'] as const;
      if (validBrowsers.includes(options.browser as any)) {
        this.config.browser.type = options.browser as 'chromium' | 'firefox' | 'webkit';
        this.commandLineOverrides.set('browser.type', options.browser);
      } else {
        throw new Error(`Invalid browser type: ${options.browser}. Must be one of: ${validBrowsers.join(', ')}`);
      }
    }

    if (options.headless !== undefined) {
      this.config.browser.headless = options.headless;
      this.commandLineOverrides.set('browser.headless', options.headless);
    }

    if (options.timeout !== undefined) {
      this.config.browser.timeout = options.timeout;
      this.commandLineOverrides.set('browser.timeout', options.timeout);
    }

    // Debugging options
    if (options.debug !== undefined) {
      this.config.debugging.enabled = options.debug;
      this.commandLineOverrides.set('debugging.enabled', options.debug);
    }

    if (options.video !== undefined) {
      this.config.debugging.videos = options.video;
      this.commandLineOverrides.set('debugging.videos', options.video);
    }

    if (options.trace !== undefined) {
      this.config.debugging.traces = options.trace;
      this.commandLineOverrides.set('debugging.traces', options.trace);
    }

    // Reporting options
    if (options.reportName) {
      this.config.reporting.name = options.reportName;
      this.commandLineOverrides.set('reporting.name', options.reportName);
    }

    if (options.reportFormat && options.reportFormat.length > 0) {
      this.config.reporting.formats = options.reportFormat;
      this.commandLineOverrides.set('reporting.formats', options.reportFormat);
    }
  }

  /**
   * Merge configurations
   */
  private mergeConfigurations(base: any, override: any): any {
    const result = { ...base };

    for (const key in override) {
      if (override.hasOwnProperty(key)) {
        if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
          result[key] = this.mergeConfigurations(base[key] || {}, override[key]);
        } else {
          result[key] = override[key];
        }
      }
    }

    return result;
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(): void {
    const errors: string[] = [];

    // Validate execution settings
    if (this.config.execution.maxWorkers < 0) {
      errors.push('maxWorkers must be >= 0');
    }

    if (this.config.execution.retryCount < 0) {
      errors.push('retryCount must be >= 0');
    }

    // Validate browser settings
    const validBrowsers = ['chromium', 'firefox', 'webkit'];
    if (!validBrowsers.includes(this.config.browser.type)) {
      errors.push(`Invalid browser type: ${this.config.browser.type}`);
    }

    if (this.config.browser.timeout < 0) {
      errors.push('Browser timeout must be >= 0');
    }

    // Validate viewport
    if (this.config.browser.viewport.width < 1 || this.config.browser.viewport.height < 1) {
      errors.push('Viewport dimensions must be >= 1');
    }

    // Validate AI settings
    if (this.config.ai.confidenceThreshold < 0 || this.config.ai.confidenceThreshold > 1) {
      errors.push('AI confidence threshold must be between 0 and 1');
    }

    // Validate performance settings
    if (this.config.performance.memoryLimit < 128) {
      errors.push('Memory limit must be >= 128 MB');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Apply configuration to ConfigurationManager
   */
  private applyToConfigurationManager(): void {
    // Apply all configuration values to ConfigurationManager
    // This ensures all components can access the configuration

    // Execution settings
    ConfigurationManager.set('PARALLEL_EXECUTION', String(this.config.execution.parallel));
    ConfigurationManager.set('MAX_PARALLEL_WORKERS', String(this.config.execution.maxWorkers));
    ConfigurationManager.set('RETRY_COUNT', String(this.config.execution.retryCount));
    ConfigurationManager.set('RETRY_DELAY', String(this.config.execution.retryDelay));
    ConfigurationManager.set('STOP_ON_FAILURE', String(this.config.execution.stopOnFailure));

    // Browser settings
    ConfigurationManager.set('DEFAULT_BROWSER', this.config.browser.type);
    ConfigurationManager.set('HEADLESS_MODE', String(this.config.browser.headless));
    ConfigurationManager.set('BROWSER_SLOWMO', String(this.config.browser.slowMo));
    ConfigurationManager.set('DEFAULT_TIMEOUT', String(this.config.browser.timeout));
    ConfigurationManager.set('VIEWPORT_WIDTH', String(this.config.browser.viewport.width));
    ConfigurationManager.set('VIEWPORT_HEIGHT', String(this.config.browser.viewport.height));

    // Continue for all other settings...
    ActionLogger.logDebug('RunnerConfig', 'Configuration applied to ConfigurationManager');
  }

  /**
   * Get configuration
   */
  getConfiguration(): RunnerConfiguration {
    return { ...this.config };
  }

  /**
   * Get specific configuration value
   */
  get<T>(path: string, defaultValue?: T): T {
    const parts = path.split('.');
    let value: any = this.config;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue as T;
      }
    }

    return value as T;
  }

  /**
   * Set configuration value
   */
  set(path: string, value: any): void {
    const parts = path.split('.');
    if (parts.length === 0) {
      throw new Error('Invalid configuration path');
    }
    
    let target: any = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!key) {
        throw new Error(`Invalid configuration path: ${path}`);
      }
      
      if (!target[key]) {
        target[key] = {};
      }
      target = target[key];
    }

    const lastKey = parts[parts.length - 1];
    if (!lastKey) {
      throw new Error(`Invalid configuration path: ${path}`);
    }
    
    target[lastKey] = value;
  }

  /**
   * Check if value was overridden by command line
   */
  isOverridden(path: string): boolean {
    return this.commandLineOverrides.has(path);
  }

  /**
   * Export configuration
   */
  exportConfiguration(): any {
    return {
      config: this.config,
      configFile: this.configFile,
      commandLineOverrides: Object.fromEntries(this.commandLineOverrides)
    };
  }

  /**
   * Generate configuration report
   */
  generateConfigurationReport(): string {
    const report: string[] = [];

    report.push('=== Runner Configuration ===');
    report.push(`Environment: ${this.config.environment.name}`);
    report.push(`Parallel Execution: ${this.config.execution.parallel}`);
    if (this.config.execution.parallel) {
      report.push(`Max Workers: ${this.config.execution.maxWorkers || 'auto'}`);
    }
    report.push(`Browser: ${this.config.browser.type} (${this.config.browser.headless ? 'headless' : 'headed'})`);
    report.push(`Timeout: ${this.config.browser.timeout}ms`);
    report.push(`AI/Self-Healing: ${this.config.ai.enabled ? 'enabled' : 'disabled'}`);
    report.push(`Debug Mode: ${this.config.debugging.enabled ? 'enabled' : 'disabled'}`);
    
    if (this.config.selection.tags.length > 0) {
      report.push(`Tags: ${this.config.selection.tags.join(', ')}`);
    }
    
    if (this.config.selection.features.length > 0) {
      report.push(`Features: ${this.config.selection.features.join(', ')}`);
    }

    if (this.configFile) {
      report.push(`Config File: ${this.configFile}`);
    }

    if (this.commandLineOverrides.size > 0) {
      report.push('\nCommand Line Overrides:');
      for (const [key, value] of this.commandLineOverrides) {
        report.push(`  ${key}: ${value}`);
      }
    }

    report.push('===========================');

    return report.join('\n');
  }
}

// Interfaces
interface RunnerOptions {
  // Execution
  parallel?: boolean;
  workers?: number;
  retry?: number;
  dryRun?: boolean;
  
  // Selection
  features?: string[];
  scenarios?: string[];
  tags?: string[];
  
  // Environment
  env?: string;
  
  // Browser
  browser?: string;
  headless?: boolean;
  timeout?: number;
  
  // Debugging
  debug?: boolean;
  video?: boolean;
  trace?: boolean;
  
  // Reporting
  reportName?: string;
  reportFormat?: string[];
  
  // Configuration
  configFile?: string;
}

interface RunnerConfiguration {
  execution: {
    parallel: boolean;
    maxWorkers: number;
    retryCount: number;
    retryDelay: number;
    dryRun: boolean;
    stopOnFailure: boolean;
    randomize: boolean;
    seed: string;
  };
  
  selection: {
    features: string[];
    scenarios: string[];
    tags: string[];
    namePattern?: string;
    lineNumbers: number[];
  };
  
  environment: {
    name: string;
    baseUrl: string;
    variables: Record<string, string>;
  };
  
  browser: {
    type: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    slowMo: number;
    timeout: number;
    viewport: {
      width: number;
      height: number;
    };
    args: string[];
    devtools: boolean;
  };
  
  reporting: {
    outputPath: string;
    formats: string[];
    includeScreenshots: boolean;
    includeVideos: boolean;
    includeTraces: boolean;
    includeLogs: boolean;
    theme: {
      primaryColor: string;
      secondaryColor: string;
    };
    name?: string;
  };
  
  debugging: {
    enabled: boolean;
    pauseOnFailure: boolean;
    screenshots: boolean;
    videos: boolean;
    traces: boolean;
    slowMotion: number;
    highlightElements: boolean;
  };
  
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    console: boolean;
    file: boolean;
    filePath: string;
    includeTimestamp: boolean;
    includeSource: boolean;
  };
  
  performance: {
    collectMetrics: boolean;
    slowTestThreshold: number;
    memoryLimit: number;
    cpuThreshold: number;
  };
  
  network: {
    timeout: number;
    proxy: {
      enabled: boolean;
      server: string;
      port: number;
      username: string;
      password: string;
      bypass: string[];
    };
    har: {
      record: boolean;
      path: string;
      content: 'omit' | 'embed' | 'attach';
    };
  };
  
  ai: {
    enabled: boolean;
    selfHealing: boolean;
    confidenceThreshold: number;
    maxHealingAttempts: number;
    collectTrainingData: boolean;
  };
  
  integration: {
    ado: {
      enabled: boolean;
      url: string;
      project: string;
      token: string;
      testPlanId: string;
      uploadResults: boolean;
    };
  };
  
  advanced: {
    maxContexts: number;
    maxPages: number;
    elementCacheSize: number;
    elementCacheTTL: number;
    dataCacheSize: number;
    cleanupInterval: number;
    gcInterval: number;
  };
}