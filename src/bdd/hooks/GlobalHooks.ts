import { HookRegistry } from './HookRegistry';
import { BrowserManager } from '../../core/browser/BrowserManager';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { CSReporter } from '../../reporting/core/CSReporter';
import { StorageManager } from '../../core/storage/StorageManager';
import { NetworkInterceptor } from '../../core/network/NetworkInterceptor';
import { ExecutionContext } from '../context/ExecutionContext';
import { BDDContext } from '../context/BDDContext';
import { DebugManager } from '../../core/debugging/DebugManager';
// import { ScreenshotManager } from '../../core/debugging/ScreenshotManager';
import { TraceRecorder } from '../../core/debugging/TraceRecorder';
import { VideoRecorder } from '../../core/debugging/VideoRecorder';
import { ConsoleLogger } from '../../core/debugging/ConsoleLogger';
import { ProxyManager } from '../../core/proxy/ProxyManager';
import { ElementCache } from '../../core/elements/ElementCache';
import { PageFactory } from '../../core/pages/PageFactory';
import { DataCache } from '../../data/provider/DataCache';
import { PerformanceCollector } from '../../reporting/collectors/PerformanceCollector';
import { MetricsCollector } from '../../reporting/collectors/MetricsCollector';
import { NetworkCollector } from '../../reporting/collectors/NetworkCollector';
import { ProxyConfig } from '../../core/proxy/ProxyConfig';
import { Feature, Scenario, HookType } from '../types/bdd.types';
import * as path from 'path';

/**
 * Global hooks for framework-level setup and teardown
 * Provides default implementations for common test lifecycle operations
 */
export class GlobalHooks {
  private static instance: GlobalHooks;
  private initialized: boolean = false;
  private startTime: number = 0;
  private performanceCollector: PerformanceCollector;
  private metricsCollector: MetricsCollector;
  private networkCollector: NetworkCollector;
  private reporter: CSReporter;

  private constructor() {
    this.performanceCollector = PerformanceCollector.getInstance();
    this.metricsCollector = MetricsCollector.getInstance();
    this.networkCollector = NetworkCollector.getInstance();
    this.reporter = CSReporter.getInstance();
  }

  static getInstance(): GlobalHooks {
    if (!GlobalHooks.instance) {
      GlobalHooks.instance = new GlobalHooks();
    }
    return GlobalHooks.instance;
  }

  /**
   * Initialize global hooks with framework defaults
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      ActionLogger.logWarn('Already initialized');
      return;
    }

    try {
      ActionLogger.logInfo('Initializing global hooks');

      // Register framework-level Before hooks
      await this.registerBeforeHooks();

      // Register framework-level After hooks
      await this.registerAfterHooks();

      // Register step-level hooks
      await this.registerStepHooks();

      // Register cleanup hooks
      await this.registerCleanupHooks();

      this.initialized = true;
      ActionLogger.logInfo('Global hooks initialized successfully');
    } catch (error) {
      ActionLogger.logError('Failed to initialize global hooks', error);
      throw error;
    }
  }

  /**
   * Register Before hooks
   */
  private async registerBeforeHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    // Before All - Run once before all tests
    hookRegistry.registerHook(
      HookType.BeforeAll,
      async (context: ExecutionContext) => {
        ActionLogger.logInfo('Starting framework setup');
        this.startTime = Date.now();

        // Initialize configuration
        await this.initializeConfiguration(context);

        // Setup proxy if configured
        await this.setupProxy();

        // Initialize reporting
        await this.initializeReporting();

        // Setup performance monitoring
        await this.setupPerformanceMonitoring();

        // Clear caches
        await this.clearCaches();

        ActionLogger.logInfo('Framework setup completed');
      },
      {
        name: 'Framework Setup',
        order: 1,
        timeout: 60000
      }
    );

    // Before Each Feature - Run before each feature
    hookRegistry.registerHook(
      HookType.BeforeAll,
      async (_context: ExecutionContext) => {
        const feature = BDDContext.getInstance().getFeatureContext()?.getFeature();
        if (feature) {
          ActionLogger.logInfo(`Setting up feature: ${feature.name}`);
          // Feature setup logic here
          ActionLogger.logInfo('Feature setup completed');
        }
      },
      {
        name: 'Feature Setup',
        order: 10,
        timeout: 30000
      }
    );

    // Before Each Scenario - Run before each scenario
    hookRegistry.registerHook(
      HookType.Before,
      async (context: ExecutionContext) => {
        const scenario = BDDContext.getInstance().getScenarioContext()?.getScenario();
        if (scenario) {
          ActionLogger.logInfo(`Setting up scenario: ${scenario.name}`);

          // Store scenario start time in metadata
          context.setMetadata('scenarioStartTime', Date.now());

          // Setup browser if UI test
          if (this.isUITest(scenario)) {
            await this.setupBrowser(context);
          }

          // Setup API client if API test
          if (this.isAPITest(scenario)) {
            await this.setupAPIClient(context);
          }

          // Setup database if DB test
          if (this.isDatabaseTest(scenario)) {
            await this.setupDatabase(context);
          }

          // Setup debugging if enabled
          await this.setupDebugging(context, scenario);

          ActionLogger.logInfo('Scenario setup completed');
        }
      },
      {
        name: 'Scenario Setup',
        order: 20,
        timeout: 20000
      }
    );
  }

  /**
   * Register After hooks
   */
  private async registerAfterHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    // After Each Scenario
    hookRegistry.registerHook(
      HookType.After,
      async (context: ExecutionContext) => {
        const scenario = BDDContext.getInstance().getScenarioContext()?.getScenario();
        if (scenario) {
          ActionLogger.logInfo(`Cleaning up scenario: ${scenario.name}`);

          try {
            // Capture failure evidence
            // DISABLED: StepExecutor already captures screenshots for failed steps
            // This prevents duplicate screenshots
            // const scenarioStatus = context.getMetadata('scenarioStatus') || 'passed';
            // if (scenarioStatus === 'failed') {
            //   await this.captureFailureEvidence(context);
            // }

            // Cleanup scenario resources
            await this.cleanupScenarioResources(context);

            // Update metrics
            await this.updateScenarioMetrics(context, scenario);

            // Clear scenario context
            BDDContext.getInstance().clearScenarioState();

          } catch (error) {
            ActionLogger.logError('Error during scenario cleanup', error);
            // Don't throw - cleanup should not fail tests
          }

          ActionLogger.logInfo('Scenario cleanup completed');
        }
      },
      {
        name: 'Scenario Cleanup',
        order: 100,
        timeout: 20000
      }
    );

    // After Each Feature
    hookRegistry.registerHook(
      HookType.AfterAll,
      async (_context: ExecutionContext) => {
        const feature = BDDContext.getInstance().getFeatureContext()?.getFeature();
        if (feature) {
          ActionLogger.logInfo(`Cleaning up feature: ${feature.name}`);

          try {
            // Cleanup feature resources
            await this.cleanupFeatureResources();

            // Generate feature report
            await this.generateFeatureReport(feature);

            // Clear feature context
            BDDContext.getInstance().clearFeatureState();

          } catch (error) {
            ActionLogger.logError('Error during feature cleanup', error);
          }

          ActionLogger.logInfo('Feature cleanup completed');
        }
      },
      {
        name: 'Feature Cleanup',
        order: 110,
        timeout: 30000
      }
    );

    // After All - Run once after all tests
    hookRegistry.registerHook(
      HookType.AfterAll,
      async (_context: ExecutionContext) => {
        ActionLogger.logInfo('Starting framework cleanup');

        try {
          // Generate final reports
          await this.generateFinalReports();

          // Cleanup all resources
          await this.cleanupAllResources();

          // Log execution summary
          await this.logExecutionSummary();

          const duration = Date.now() - this.startTime;
          ActionLogger.logInfo(`Total execution time: ${duration}ms`);

        } catch (error) {
          ActionLogger.logError('Error during framework cleanup', error);
        }

        ActionLogger.logInfo('Framework cleanup completed');
      },
      {
        name: 'Framework Cleanup',
        order: 999,
        timeout: 60000
      }
    );
  }

  /**
   * Register step-level hooks
   */
  private async registerStepHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    // Before Each Step
    hookRegistry.registerHook(
      HookType.BeforeStep,
      async (context: ExecutionContext) => {
        const currentStep = context.getMetadata('currentStep');
        if (currentStep) {
          ActionLogger.logStepStart(currentStep.keyword, currentStep.text);
          
          // Start step timing
          context.setMetadata('stepStartTime', Date.now());

          // Clear any previous step errors
          context.setMetadata('stepError', undefined);
        }
      },
      {
        name: 'Step Setup',
        order: 1,
        timeout: 5000
      }
    );

    // After Each Step
    hookRegistry.registerHook(
      HookType.AfterStep,
      async (context: ExecutionContext) => {
        const currentStep = context.getMetadata('currentStep');
        if (currentStep) {
          // Calculate step duration
          const stepStartTime = context.getMetadata('stepStartTime') || Date.now();
          const duration = Date.now() - stepStartTime;
          
          // Log step result
          const stepError = context.getMetadata('stepError');
          if (stepError) {
            ActionLogger.logStepFail(currentStep.text, stepError, duration);
          } else {
            ActionLogger.logStepPass(currentStep.text, duration);
          }

          // Collect step metrics
          await this.metricsCollector.collectForStep(
            'scenario-' + Date.now(),
            'step-' + Date.now(),
            currentStep.text,
            stepError ? 'failed' : 'passed'
          );
        }
      },
      {
        name: 'Step Cleanup',
        order: 100,
        timeout: 5000
      }
    );
  }

  /**
   * Register cleanup-specific hooks
   */
  private async registerCleanupHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    // Emergency cleanup hook
    hookRegistry.registerHook(
      HookType.AfterAll,
      async (_context: ExecutionContext) => {
        try {
          ActionLogger.logWarn('Running emergency cleanup');

          // Force close all browsers
          await BrowserManager.getInstance().closeBrowser();

          // Clear all caches
          ElementCache.getInstance().invalidateAll();
          DataCache.getInstance().clear();
          PageFactory.clearCache();

        } catch (error) {
          ActionLogger.logError('Emergency cleanup error', error);
        }
      },
      {
        name: 'Emergency Cleanup',
        order: 1000,
        timeout: 30000
      }
    );
  }

  /**
   * Initialize configuration
   */
  private async initializeConfiguration(context: ExecutionContext): Promise<void> {
    const environment = ConfigurationManager.get('ENVIRONMENT', 'dev');
    await ConfigurationManager.loadConfiguration(environment);
    
    // Store environment in context
    context.setMetadata('environment', environment);
    
    // Validate configuration
    const validation = ConfigurationManager.validate();
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Setup proxy if configured
   */
  private async setupProxy(): Promise<void> {
    if (ConfigurationManager.getBoolean('PROXY_ENABLED', false)) {
      const proxyConfig = new ProxyConfig({
        enabled: true,
        servers: [{
          protocol: 'http',
          host: ConfigurationManager.get('PROXY_SERVER'),
          port: ConfigurationManager.getInt('PROXY_PORT'),
          auth: {
            username: ConfigurationManager.get('PROXY_USERNAME'),
            password: ConfigurationManager.get('PROXY_PASSWORD')
          }
        }]
      });
      await ProxyManager.getInstance().initialize(proxyConfig);
      ActionLogger.logInfo('Proxy configured successfully');
    }
  }

  /**
   * Initialize reporting
   */
  private async initializeReporting(): Promise<void> {
    await this.reporter.initialize({
      outputDir: ConfigurationManager.get('REPORT_PATH', './reports'),
      reportName: ConfigurationManager.get('PROJECT_NAME', 'CS Test Automation'),
      environment: ConfigurationManager.get('ENVIRONMENT', 'dev')
    });
  }

  /**
   * Setup performance monitoring
   */
  private async setupPerformanceMonitoring(): Promise<void> {
    // Initialize collectors
    const executionId = 'exec-' + Date.now();
    await this.performanceCollector.initialize(executionId);
    await this.metricsCollector.initialize(executionId);
    await this.networkCollector.initialize(executionId);
  }

  /**
   * Clear all caches
   */
  private async clearCaches(): Promise<void> {
    ElementCache.getInstance().invalidateAll();
    DataCache.getInstance().clear();
    PageFactory.clearCache();
    ActionLogger.logInfo('All caches cleared');
  }


  /**
   * Check if test is UI test
   */
  private isUITest(scenario: Scenario): boolean {
    const tags = scenario.tags || [];
    return !tags.includes('@api') && !tags.includes('@database');
  }

  /**
   * Check if test is API test
   */
  private isAPITest(scenario: Scenario): boolean {
    const tags = scenario.tags || [];
    return tags.includes('@api');
  }

  /**
   * Check if test is database test
   */
  private isDatabaseTest(scenario: Scenario): boolean {
    const tags = scenario.tags || [];
    return tags.includes('@database');
  }

  /**
   * Setup browser for UI tests
   */
  private async setupBrowser(context: ExecutionContext): Promise<void> {
    // CRITICAL FIX: Do NOT initialize browser here - it's already initialized by CSBDDRunner
    // This method should only create browser contexts and pages for the scenario
    
    ActionLogger.logInfo('Setting up browser context for UI test scenario');
    
    // Verify browser is available
    const browserManager = BrowserManager.getInstance();
    if (!browserManager.isHealthy()) {
      throw new Error('Browser is not initialized. Browser should be initialized by CSBDDRunner before scenarios run.');
    }
    
    // Create browser context for this scenario
    await context.createBrowserContext();
    
    // Create page
    const page = await context.createPage();

    // Setup console logging
    if (ConfigurationManager.getBoolean('CAPTURE_CONSOLE_LOGS', true)) {
      ConsoleLogger.getInstance().startCapture(page);
    }

    ActionLogger.logInfo('Browser setup completed');
  }

  /**
   * Setup API client for API tests
   */
  private async setupAPIClient(context: ExecutionContext): Promise<void> {
    // API client is initialized on demand in API steps
    // Just set base configuration here
    const apiConfig = {
      baseUrl: ConfigurationManager.get('API_BASE_URL'),
      timeout: ConfigurationManager.getInt('API_DEFAULT_TIMEOUT', 60000),
      retryCount: ConfigurationManager.getInt('API_RETRY_COUNT', 0),
      retryDelay: ConfigurationManager.getInt('API_RETRY_DELAY', 1000),
      validateSSL: ConfigurationManager.getBoolean('API_VALIDATE_SSL', true),
      logRequestBody: ConfigurationManager.getBoolean('API_LOG_REQUEST_BODY', true),
      logResponseBody: ConfigurationManager.getBoolean('API_LOG_RESPONSE_BODY', true)
    };

    // Store in context
    context.setMetadata('apiConfig', apiConfig);
    ActionLogger.logInfo('API client configuration set');
  }

  /**
   * Setup database for database tests
   */
  private async setupDatabase(context: ExecutionContext): Promise<void> {
    const dbConfig = {
      type: ConfigurationManager.get('DB_TYPE'),
      host: ConfigurationManager.get('DB_HOST'),
      port: ConfigurationManager.getInt('DB_PORT'),
      database: ConfigurationManager.get('DB_NAME'),
      username: ConfigurationManager.get('DB_USERNAME'),
      password: ConfigurationManager.get('DB_PASSWORD'),
      connectionPoolSize: ConfigurationManager.getInt('DB_CONNECTION_POOL_SIZE', 10)
    };

    // Store in context - connection created on demand
    context.setMetadata('dbConfig', dbConfig);
    ActionLogger.logInfo('Database configuration set');
  }

  /**
   * Setup debugging tools
   */
  private async setupDebugging(context: ExecutionContext, scenario: Scenario): Promise<void> {
    // Enable debug mode if requested
    if (ConfigurationManager.getBoolean('DEBUG_MODE', false) || 
        scenario.tags?.includes('@debug')) {
      await DebugManager.getInstance().enableDebugMode();
    }

    const page = context.getPage();
    if (page) {
      // Start video recording if enabled
      if (ConfigurationManager.getBoolean('RECORD_VIDEO', false)) {
        await VideoRecorder.getInstance().startRecording(page);
      }

      // Start trace recording if enabled
      if (ConfigurationManager.getBoolean('RECORD_TRACE', false)) {
        await TraceRecorder.getInstance().startTracing(page);
      }
    }
  }

  // /**
  //  * Capture failure evidence
  //  * @deprecated - Now handled by StepExecutor to prevent duplicate screenshots
  //  */
  // private async _captureFailureEvidence(context: ExecutionContext): Promise<void> {
  //   try {
  //     const page = context.getPage();
  //     
  //     // Take screenshot
  //     if (page && ConfigurationManager.getBoolean('SCREENSHOT_ON_FAILURE', true)) {
  //       const screenshotPath = path.join(
  //         ConfigurationManager.get('SCREENSHOT_DIR', './screenshots'),
  //         `failure-${Date.now()}.png`
  //       );
  //       
  //       await ScreenshotManager.getInstance().takeScreenshot(page, {
  //         fullPage: true
  //       });
  //       
  //       // Store screenshot path in metadata
  //       context.setMetadata('failureScreenshot', screenshotPath);
  //     }

  //     // Save page HTML
  //     if (page && ConfigurationManager.getBoolean('SAVE_HTML_ON_FAILURE', true)) {
  //       const html = await page.content();
  //       context.setMetadata('failureHtml', html);
  //     }

  //     // Export console logs
  //     if (page) {
  //       const logs = ConsoleLogger.getInstance().getConsoleLogs();
  //       if (logs.length > 0) {
  //         context.setMetadata('consoleLogs', logs);
  //       }
  //     }

  //     // Export network logs
  //     // Network logs are handled by the collector internally
  //     context.setMetadata('networkLogsCollected', true);

  //   } catch (error) {
  //     ActionLogger.logError('Failed to capture failure evidence', error);
  //   }
  // }

  /**
   * Cleanup scenario resources
   */
  private async cleanupScenarioResources(context: ExecutionContext): Promise<void> {
    try {
      const page = context.getPage();
      
      // Stop video recording
      try {
        const videoPath = await VideoRecorder.getInstance().stopRecording();
        if (videoPath) {
          context.setMetadata('videoPath', videoPath);
        }
      } catch (error) {
        // Video recording not active or failed to stop
      }

      // Stop trace recording
      try {
        await TraceRecorder.getInstance().stopTracing();
        const tracePath = path.join(
          ConfigurationManager.get('TRACE_DIR', './traces'),
          `trace-${Date.now()}.zip`
        );
        await TraceRecorder.getInstance().saveTrace(tracePath);
        context.setMetadata('tracePath', tracePath);
      } catch (error) {
        // Trace recording not active or failed to stop
      }

      // Stop console capture
      ConsoleLogger.getInstance().stopCapture();

      // Clear network interceptors
      if (page) {
        const networkInterceptor = new NetworkInterceptor(page);
        await networkInterceptor.clearInterceptors();
      }

      // Clear storage if configured
      const browserContext = context.getContext();
      if (ConfigurationManager.getBoolean('CLEAR_STORAGE_AFTER_SCENARIO', true) && browserContext) {
        const storageManager = new StorageManager();
        await storageManager.clearAllStorage(browserContext);
      }

      // Pages and contexts are closed by ExecutionContext cleanup

    } catch (error) {
      ActionLogger.logError('Error cleaning up scenario resources', error);
    }
  }

  /**
   * Update scenario metrics
   */
  private async updateScenarioMetrics(_context: ExecutionContext, scenario: Scenario): Promise<void> {
    await this.metricsCollector.collectForScenario(
      'scenario-' + Date.now(),
      scenario.name
    );
  }

  /**
   * Cleanup feature resources
   */
  private async cleanupFeatureResources(): Promise<void> {
    // Feature-specific cleanup
    ActionLogger.logDebug('Cleaning up feature resources');
  }

  /**
   * Generate feature report
   */
  private async generateFeatureReport(feature: Feature): Promise<void> {
    ActionLogger.logInfo(`Generating report for feature: ${feature.name}`);
    // Report generation is handled by CSReporter
  }

  /**
   * Generate final reports
   */
  private async generateFinalReports(): Promise<void> {
    // Finalize collectors
    const executionId = 'exec-' + Date.now();
    await this.performanceCollector.finalize();
    await this.metricsCollector.finalize();
    await this.networkCollector.finalize(executionId);

    // Generate final report
    await this.reporter.shutdown();
  }

  /**
   * Cleanup all resources
   */
  private async cleanupAllResources(): Promise<void> {
    try {
      // Close all browsers
      await BrowserManager.getInstance().closeBrowser();

      // Clear all caches
      await this.clearCaches();

      // Cleanup temp files
      await this.cleanupTempFiles();

    } catch (error) {
      ActionLogger.logError('Error cleaning up all resources', error);
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanupTempFiles(): Promise<void> {
    // Implementation would clean up downloads, screenshots, etc.
    ActionLogger.logDebug('Cleaning up temporary files');
  }

  /**
   * Log execution summary
   */
  private async logExecutionSummary(): Promise<void> {
    // Generate execution summary from collected metrics
    const summary = {
      totalFeatures: 0,
      totalScenarios: 0,
      totalSteps: 0,
      passedScenarios: 0,
      failedScenarios: 0,
      skippedScenarios: 0
    };
    
    ActionLogger.logInfo('=== Execution Summary ===');
    ActionLogger.logInfo(`Features: ${summary.totalFeatures || 0}`);
    ActionLogger.logInfo(`Scenarios: ${summary.totalScenarios || 0}`);
    ActionLogger.logInfo(`Steps: ${summary.totalSteps || 0}`);
    ActionLogger.logInfo(`Passed: ${summary.passedScenarios || 0}`);
    ActionLogger.logInfo(`Failed: ${summary.failedScenarios || 0}`);
    ActionLogger.logInfo(`Skipped: ${summary.skippedScenarios || 0}`);
    ActionLogger.logInfo(`Duration: ${Date.now() - this.startTime}ms`);
    ActionLogger.logInfo('========================');
  }

  /**
   * Export global hooks configuration
   */
  exportConfiguration(): any {
    return {
      initialized: this.initialized,
      registeredHooks: HookRegistry.getInstance().getHooks(HookType.BeforeAll).length +
                      HookRegistry.getInstance().getHooks(HookType.Before).length +
                      HookRegistry.getInstance().getHooks(HookType.BeforeStep).length +
                      HookRegistry.getInstance().getHooks(HookType.AfterStep).length +
                      HookRegistry.getInstance().getHooks(HookType.After).length +
                      HookRegistry.getInstance().getHooks(HookType.AfterAll).length
    };
  }
}