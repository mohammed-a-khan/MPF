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

  async initialize(): Promise<void> {
    if (this.initialized) {
      ActionLogger.logWarn('Already initialized');
      return;
    }

    try {
      ActionLogger.logInfo('Initializing global hooks');

      await this.registerBeforeHooks();

      await this.registerAfterHooks();

      await this.registerStepHooks();

      await this.registerCleanupHooks();

      this.initialized = true;
      ActionLogger.logInfo('Global hooks initialized successfully');
    } catch (error) {
      ActionLogger.logError('Failed to initialize global hooks', error);
      throw error;
    }
  }

  private async registerBeforeHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    hookRegistry.registerHook(
      HookType.BeforeAll,
      async (context: ExecutionContext) => {
        ActionLogger.logInfo('Starting framework setup');
        this.startTime = Date.now();

        await this.initializeConfiguration(context);

        await this.setupProxy();

        await this.initializeReporting();

        await this.setupPerformanceMonitoring();

        await this.clearCaches();

        ActionLogger.logInfo('Framework setup completed');
      },
      {
        name: 'Framework Setup',
        order: 1,
        timeout: 60000
      }
    );

    hookRegistry.registerHook(
      HookType.BeforeAll,
      async (_context: ExecutionContext) => {
        const feature = BDDContext.getInstance().getFeatureContext()?.getFeature();
        if (feature) {
          ActionLogger.logInfo(`Setting up feature: ${feature.name}`);
          ActionLogger.logInfo('Feature setup completed');
        }
      },
      {
        name: 'Feature Setup',
        order: 10,
        timeout: 30000
      }
    );

    hookRegistry.registerHook(
      HookType.Before,
      async (context: ExecutionContext) => {
        const scenario = BDDContext.getInstance().getScenarioContext()?.getScenario();
        if (scenario) {
          ActionLogger.logInfo(`Setting up scenario: ${scenario.name}`);

          context.setMetadata('scenarioStartTime', Date.now());

          if (this.isUITest(scenario)) {
            await this.setupBrowser(context);
          }

          if (this.isAPITest(scenario)) {
            await this.setupAPIClient(context);
          }

          if (this.isDatabaseTest(scenario)) {
            await this.setupDatabase(context);
          }

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

  private async registerAfterHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    hookRegistry.registerHook(
      HookType.After,
      async (context: ExecutionContext) => {
        const scenario = BDDContext.getInstance().getScenarioContext()?.getScenario();
        if (scenario) {
          ActionLogger.logInfo(`Cleaning up scenario: ${scenario.name}`);

          try {

            await this.cleanupScenarioResources(context);

            await this.updateScenarioMetrics(context, scenario);

            BDDContext.getInstance().clearScenarioState();

          } catch (error) {
            ActionLogger.logError('Error during scenario cleanup', error);
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

    hookRegistry.registerHook(
      HookType.AfterAll,
      async (_context: ExecutionContext) => {
        const feature = BDDContext.getInstance().getFeatureContext()?.getFeature();
        if (feature) {
          ActionLogger.logInfo(`Cleaning up feature: ${feature.name}`);

          try {
            await this.cleanupFeatureResources();

            await this.generateFeatureReport(feature);

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

    hookRegistry.registerHook(
      HookType.AfterAll,
      async (_context: ExecutionContext) => {
        ActionLogger.logInfo('Starting framework cleanup');

        try {
          await this.generateFinalReports();

          await this.cleanupAllResources();

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

  private async registerStepHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    hookRegistry.registerHook(
      HookType.BeforeStep,
      async (context: ExecutionContext) => {
        const currentStep = context.getMetadata('currentStep');
        if (currentStep) {
          ActionLogger.logStepStart(currentStep.keyword, currentStep.text);
          
          context.setMetadata('stepStartTime', Date.now());

          context.setMetadata('stepError', undefined);
        }
      },
      {
        name: 'Step Setup',
        order: 1,
        timeout: 5000
      }
    );

    hookRegistry.registerHook(
      HookType.AfterStep,
      async (context: ExecutionContext) => {
        const currentStep = context.getMetadata('currentStep');
        if (currentStep) {
          const stepStartTime = context.getMetadata('stepStartTime') || Date.now();
          const duration = Date.now() - stepStartTime;
          
          const stepError = context.getMetadata('stepError');
          if (stepError) {
            ActionLogger.logStepFail(currentStep.text, stepError, duration);
          } else {
            ActionLogger.logStepPass(currentStep.text, duration);
          }

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

  private async registerCleanupHooks(): Promise<void> {
    const hookRegistry = HookRegistry.getInstance();

    hookRegistry.registerHook(
      HookType.AfterAll,
      async (_context: ExecutionContext) => {
        try {
          ActionLogger.logWarn('Running emergency cleanup');

          await BrowserManager.getInstance().closeBrowser();

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

  private async initializeConfiguration(context: ExecutionContext): Promise<void> {
    const environment = ConfigurationManager.get('ENVIRONMENT', 'dev');
    await ConfigurationManager.loadConfiguration(environment);
    
    context.setMetadata('environment', environment);
    
    const validation = ConfigurationManager.validate();
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

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

  private async initializeReporting(): Promise<void> {
    await this.reporter.initialize({
      outputDir: ConfigurationManager.get('REPORT_PATH', './reports'),
      reportName: ConfigurationManager.get('PROJECT_NAME', 'CS Test Automation'),
      environment: ConfigurationManager.get('ENVIRONMENT', 'dev')
    });
  }

  private async setupPerformanceMonitoring(): Promise<void> {
    const executionId = 'exec-' + Date.now();
    await this.performanceCollector.initialize(executionId);
    await this.metricsCollector.initialize(executionId);
    await this.networkCollector.initialize(executionId);
  }

  private async clearCaches(): Promise<void> {
    ElementCache.getInstance().invalidateAll();
    DataCache.getInstance().clear();
    PageFactory.clearCache();
    ActionLogger.logInfo('All caches cleared');
  }


  private isUITest(scenario: Scenario): boolean {
    const tags = scenario.tags || [];
    return !tags.includes('@api') && !tags.includes('@database');
  }

  private isAPITest(scenario: Scenario): boolean {
    const tags = scenario.tags || [];
    return tags.includes('@api');
  }

  private isDatabaseTest(scenario: Scenario): boolean {
    const tags = scenario.tags || [];
    return tags.includes('@database');
  }

  private async setupBrowser(context: ExecutionContext): Promise<void> {
    // CRITICAL FIX: Do NOT initialize browser here - it's already initialized by CSBDDRunner
    
    ActionLogger.logInfo('Setting up browser context for UI test scenario');
    
    const browserManager = BrowserManager.getInstance();
    if (!browserManager.isHealthy()) {
      throw new Error('Browser is not initialized. Browser should be initialized by CSBDDRunner before scenarios run.');
    }
    
    await context.createBrowserContext();
    
    const page = await context.createPage();

    if (ConfigurationManager.getBoolean('CAPTURE_CONSOLE_LOGS', true)) {
      ConsoleLogger.getInstance().startCapture(page);
    }

    ActionLogger.logInfo('Browser setup completed');
  }

  private async setupAPIClient(context: ExecutionContext): Promise<void> {
    const apiConfig = {
      baseUrl: ConfigurationManager.get('API_BASE_URL'),
      timeout: ConfigurationManager.getInt('API_DEFAULT_TIMEOUT', 60000),
      retryCount: ConfigurationManager.getInt('API_RETRY_COUNT', 0),
      retryDelay: ConfigurationManager.getInt('API_RETRY_DELAY', 1000),
      validateSSL: ConfigurationManager.getBoolean('API_VALIDATE_SSL', true),
      logRequestBody: ConfigurationManager.getBoolean('API_LOG_REQUEST_BODY', true),
      logResponseBody: ConfigurationManager.getBoolean('API_LOG_RESPONSE_BODY', true)
    };

    context.setMetadata('apiConfig', apiConfig);
    ActionLogger.logInfo('API client configuration set');
  }

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

    context.setMetadata('dbConfig', dbConfig);
    ActionLogger.logInfo('Database configuration set');
  }

  private async setupDebugging(context: ExecutionContext, scenario: Scenario): Promise<void> {
    if (ConfigurationManager.getBoolean('DEBUG_MODE', false) || 
        scenario.tags?.includes('@debug')) {
      await DebugManager.getInstance().enableDebugMode();
    }

    const page = context.getPage();
    if (page) {
      if (ConfigurationManager.getBoolean('RECORD_VIDEO', false)) {
        await VideoRecorder.getInstance().startRecording(page);
      }

      if (ConfigurationManager.getBoolean('RECORD_TRACE', false)) {
        await TraceRecorder.getInstance().startTracing(page);
      }
    }
  }

  // 





  private async cleanupScenarioResources(context: ExecutionContext): Promise<void> {
    try {
      const page = context.getPage();
      
      try {
        const videoPath = await VideoRecorder.getInstance().stopRecording();
        if (videoPath) {
          context.setMetadata('videoPath', videoPath);
        }
      } catch (error) {
      }

      try {
        await TraceRecorder.getInstance().stopTracing();
        const tracePath = path.join(
          ConfigurationManager.get('TRACE_DIR', './traces'),
          `trace-${Date.now()}.zip`
        );
        await TraceRecorder.getInstance().saveTrace(tracePath);
        context.setMetadata('tracePath', tracePath);
      } catch (error) {
      }

      ConsoleLogger.getInstance().stopCapture();

      if (page) {
        const networkInterceptor = new NetworkInterceptor(page);
        await networkInterceptor.clearInterceptors();
      }

      const browserContext = context.getContext();
      if (ConfigurationManager.getBoolean('CLEAR_STORAGE_AFTER_SCENARIO', true) && browserContext) {
        const storageManager = new StorageManager();
        await storageManager.clearAllStorage(browserContext);
      }


    } catch (error) {
      ActionLogger.logError('Error cleaning up scenario resources', error);
    }
  }

  private async updateScenarioMetrics(_context: ExecutionContext, scenario: Scenario): Promise<void> {
    await this.metricsCollector.collectForScenario(
      'scenario-' + Date.now(),
      scenario.name
    );
  }

  private async cleanupFeatureResources(): Promise<void> {
    ActionLogger.logDebug('Cleaning up feature resources');
  }

  private async generateFeatureReport(feature: Feature): Promise<void> {
    ActionLogger.logInfo(`Generating report for feature: ${feature.name}`);
  }

  private async generateFinalReports(): Promise<void> {
    const executionId = 'exec-' + Date.now();
    await this.performanceCollector.finalize();
    await this.metricsCollector.finalize();
    await this.networkCollector.finalize(executionId);

    await this.reporter.shutdown();
  }

  private async cleanupAllResources(): Promise<void> {
    try {
      await BrowserManager.getInstance().closeBrowser();

      await this.clearCaches();

      await this.cleanupTempFiles();

    } catch (error) {
      ActionLogger.logError('Error cleaning up all resources', error);
    }
  }

  private async cleanupTempFiles(): Promise<void> {
    ActionLogger.logDebug('Cleaning up temporary files');
  }

  private async logExecutionSummary(): Promise<void> {
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
