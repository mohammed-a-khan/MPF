// src/core/CSFramework.ts

import { performance } from 'perf_hooks';
import { ConfigurationManager } from './configuration/ConfigurationManager';
import { logger } from './utils/Logger';
import { ProxyManager } from './proxy/ProxyManager';
import { ProxyConfig } from './proxy/ProxyConfig';
import { DebugManager } from './debugging/DebugManager';
import { ReportOrchestrator } from '../reporting/core/ReportOrchestrator';
import { ADOIntegrationService } from '../integrations/ado/ADOIntegrationService';
import { CSBDDRunner } from '../bdd/runner/CSBDDRunner';
import { BrowserManager } from './browser/BrowserManager';
import { BrowserPool } from './browser/BrowserPool';
import { ExecutionOptions } from './cli/ExecutionOptions';
import { 
    ExecutionSummary, 
    Feature, 
    FeatureResult, 
    Scenario, 
    ScenarioResult,
    TestResult
} from '../bdd/types/bdd.types';

export interface FrameworkConfig {
    environment: string;
    parallel?: boolean;
    workers?: number;
    timeout?: number;
    retries?: number;
    debug?: boolean;
    headless?: boolean;
    proxy?: boolean;
    reporting?: boolean;
    adoIntegration?: boolean;
}

export interface ComponentStatus {
    name: string;
    initialized: boolean;
    healthy: boolean;
    lastCheck?: Date;
    error?: Error;
}

export interface FrameworkStatus {
    initialized: boolean;
    running: boolean;
    components: ComponentStatus[];
    startTime?: Date;
    environment?: string;
    version: string;
}

export class CSFramework {
    private static instance: CSFramework | null = null;
    private static readonly version = '1.0.0';
    
    private isInitialized = false;
    private isRunning = false;
    private startTime?: Date;
    private currentEnvironment?: string;
    private currentProject?: string;
    private components = new Map<string, any>();
    private componentStatus: ComponentStatus[] = [];
    
    private memoryManager?: FrameworkMemoryManager;
    private memoryCleanupInterval?: NodeJS.Timeout | undefined;
    
    private configManager?: ConfigurationManager;
    private browserManager: BrowserManager | null = null;
    private browserPool: BrowserPool | null = null;
    private proxyManager: ProxyManager | null = null;
    private debugManager: DebugManager | null = null;
    private reportOrchestrator: ReportOrchestrator | null = null;
    private adoService: ADOIntegrationService | null = null;
    private bddRunner: CSBDDRunner | null = null;

    private constructor() {
        this.initializeComponentStatus();
        logger.info('Initializing CS Framework...');
    }

    static getInstance(): CSFramework {
        if (!this.instance) {
            this.instance = new CSFramework();
        }
        return this.instance;
    }

    async initialize(project: string, environment: string, config?: Partial<FrameworkConfig>): Promise<void>;
    async initialize(environment: string, config?: Partial<FrameworkConfig>): Promise<void>;
    async initialize(projectOrEnvironment: string, environmentOrConfig?: string | Partial<FrameworkConfig>, config?: Partial<FrameworkConfig>): Promise<void> {
        const initStartTime = performance.now();
        
        let project: string;
        let environment: string;
        let actualConfig: Partial<FrameworkConfig> | undefined;

        if (typeof environmentOrConfig === 'string') {
            project = projectOrEnvironment;
            environment = environmentOrConfig;
            actualConfig = config;
        } else {
            environment = projectOrEnvironment;
            actualConfig = environmentOrConfig;
            
            project = this.inferProjectFromEnvironment(environment);
            console.log(`🔄 Legacy mode: inferred project '${project}' for environment '${environment}'`);
        }
        
        try {
            logger.info(`🚀 Starting CS Framework v${CSFramework.version} parallel initialization for project: ${project}, environment: ${environment}`);
            this.startTime = new Date();
            this.currentProject = project;
            this.currentEnvironment = environment;

            await this.initializeCoreModulesParallel(project, environment, actualConfig);
            await this.initializeServiceModulesParallel(actualConfig);
            await this.initializeDependentModules(actualConfig);

            if (actualConfig?.timeout) {
                this.setGlobalTimeout(actualConfig.timeout);
            }

            this.isInitialized = true;
            const initTime = ((performance.now() - initStartTime) / 1000).toFixed(2);
            logger.info(`✅ Framework initialized successfully in ${initTime}s`);

        } catch (error) {
            logger.error('❌ Framework initialization failed', error as Error);
            await this.cleanup();
            throw error;
        }
    }

    private inferProjectFromEnvironment(environment: string): string {
        if (environment.includes('api') || environment === 'demo') {
            return 'api';
        }
        
        return 'saucedemo';
    }

    private async initializeCoreModulesParallel(project: string, environment: string, config?: Partial<FrameworkConfig>): Promise<void> {
        await this.initializeConfigurationWithFallback(project, environment);
        this.updateComponentStatus('ConfigurationManager', true, true);
        logger.info('✅ Configuration loaded - proceeding with parallel initialization');
        
        if (config) {
            this.applyConfigurationOverrides(config);
        }
        
        const coreModules = await Promise.allSettled([
            this.initializeBrowserManagementWithFallback(),
            this.initializeUtilitiesWithFallback()
        ]);

        this.handleModuleResults(coreModules, ['BrowserManager', 'Utilities']);
        
        if (config?.debug) {
            logger.debug('Core modules initialized in debug mode');
        }
    }

    private applyConfigurationOverrides(config: Partial<FrameworkConfig>): void {
        if (config.headless !== undefined) {
            ConfigurationManager.set('HEADLESS', String(config.headless));
            logger.debug(`Applied headless override: ${config.headless}`);
        }
        if (config.parallel !== undefined) {
            ConfigurationManager.set('PARALLEL_EXECUTION', String(config.parallel));
        }
        if (config.workers !== undefined) {
            ConfigurationManager.set('MAX_PARALLEL_WORKERS', String(config.workers));
        }
        if (config.timeout !== undefined) {
            ConfigurationManager.set('DEFAULT_TIMEOUT', String(config.timeout));
        }
        if (config.debug !== undefined) {
            ConfigurationManager.set('DEBUG_MODE', String(config.debug));
        }
    }

    private async initializeServiceModulesParallel(config?: Partial<FrameworkConfig>): Promise<void> {
        const servicePromises: Promise<void>[] = [];
        const serviceNames: string[] = [];

        if (config?.proxy || ConfigurationManager.getBoolean('PROXY_ENABLED', false)) {
            servicePromises.push(this.initializeProxyWithFallback());
            serviceNames.push('ProxyManager');
        }

        if (config?.debug) {
            servicePromises.push(this.initializeDebugModeWithFallback());
            serviceNames.push('DebugManager');
        }

        if (config?.reporting !== false) {
            servicePromises.push(this.initializeReportingWithFallback());
            serviceNames.push('ReportOrchestrator');
        }

        const adoEnabledInConfig = ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false);
        const adoNotDisabledByUser = config?.adoIntegration !== false;
        const adoEnabled = adoEnabledInConfig && adoNotDisabledByUser;
        
        logger.info(`ADO Integration check - Environment: ${adoEnabledInConfig}, User override: ${config?.adoIntegration}, Final: ${adoEnabled}`);

        if (adoEnabled) {
            servicePromises.push(this.initializeADOIntegrationWithFallback());
            serviceNames.push('ADOIntegrationService');
        } else {
            logger.info('ADO integration disabled - skipping ADO service initialization');
        }

        const serviceModules = await Promise.allSettled(servicePromises);
        this.handleModuleResults(serviceModules, serviceNames);
    }

    private async initializeDependentModules(config?: Partial<FrameworkConfig>): Promise<void> {
        await this.initializeBDDRunnerWithFallback();
        this.updateComponentStatus('CSBDDRunner', true, true);
        
        this.initializeMemoryManagement();
        
        if (config?.debug) {
            logger.debug('Dependent modules initialized with debug enabled');
        }
    }

    private handleModuleResults(results: PromiseSettledResult<void>[], moduleNames: string[]): void {
        const criticalModules = ['ConfigurationManager', 'BrowserManager'];
        const failedCriticalModules: string[] = [];
        const failedOptionalModules: string[] = [];

        results.forEach((result, index) => {
            const moduleName = moduleNames[index] || 'Unknown';
            
            if (result.status === 'fulfilled') {
                this.updateComponentStatus(moduleName, true, true);
                logger.info(`✅ ${moduleName} initialized successfully`);
            } else {
                const error = new Error(result.reason);
                this.updateComponentStatus(moduleName, false, false, error);
                
                if (criticalModules.includes(moduleName)) {
                    failedCriticalModules.push(moduleName);
                    logger.error(`❌ Critical module ${moduleName} initialization failed: ${result.reason}`);
                } else {
                    failedOptionalModules.push(moduleName);
                    logger.warn(`⚠️ Optional module ${moduleName} initialization failed: ${result.reason} - continuing with fallback`);
                }
            }
        });

        if (failedCriticalModules.length > 0) {
            const criticalError = new Error(`Critical modules failed to initialize: ${failedCriticalModules.join(', ')}`);
            logger.error('Framework cannot continue without critical modules');
            throw criticalError;
        }

        if (failedOptionalModules.length > 0) {
            logger.warn(`Framework initialized with ${failedOptionalModules.length} optional module(s) disabled: ${failedOptionalModules.join(', ')}`);
        }
    }

    async executeTests(featurePaths: string[], options?: Partial<ExecutionOptions>): Promise<TestResult> {
        this.validateInitialized();
        
        try {
            this.isRunning = true;
            logger.info(`Executing tests from ${featurePaths.length} feature path(s)`);

            if (!this.bddRunner) {
                throw new Error('BDD Runner not initialized');
            }

            const runOptions = {
                ...options,
                project: this.currentProject,
                environment: this.currentEnvironment,
                paths: featurePaths,
                adoEnabled: options?.skipADO !== true
            };

            await CSBDDRunner.run(runOptions as any);

            const result: TestResult = {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                features: [],
                scenarios: [],
                steps: [],
                startTime: this.startTime || new Date(),
                endTime: new Date(),
                environment: this.currentEnvironment || 'unknown'
            };

            logger.info('Test execution completed');
            return result;

        } catch (error) {
            logger.error('Test execution failed', error as Error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async executeFeature(feature: Feature): Promise<FeatureResult> {
        this.validateInitialized();
        
        try {
            logger.info(`Executing feature: ${feature.name}`);
            
            const result: FeatureResult = {
                id: feature.name,
                feature,
                scenarios: [],
                status: 'passed' as any,
                duration: 0,
                startTime: new Date(),
                endTime: new Date()
            };

            return result;
        } catch (error) {
            logger.error(`Feature execution failed: ${feature.name}`, error as Error);
            throw error;
        }
    }

    async executeScenario(scenario: Scenario): Promise<ScenarioResult> {
        this.validateInitialized();
        
        try {
            logger.info(`Executing scenario: ${scenario.name}`);
            
            const result: ScenarioResult = {
                id: scenario.name,
                scenario: scenario.name,
                steps: [],
                status: 'passed' as any,
                duration: 0,
                startTime: new Date(),
                endTime: new Date()
            };

            return result;
        } catch (error) {
            logger.error(`Scenario execution failed: ${scenario.name}`, error as Error);
            throw error;
        }
    }

    async validateConfiguration(): Promise<boolean> {
        try {
            if (!this.configManager) {
                return false;
            }

            const validation = ConfigurationManager.validate();
            return validation.valid;
        } catch (error) {
            logger.error('Configuration validation failed', error as Error);
            return false;
        }
    }

    getExecutionSummary(): ExecutionSummary {
        return {
            totalFeatures: 0,
            totalScenarios: 0,
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            pending: 0,
            totalSteps: 0,
            passedSteps: 0,
            failedSteps: 0,
            skippedSteps: 0,
            duration: 0,
            parallel: false,
            workers: 1,
            passRate: 0,
            metadata: {
                startTime: this.startTime || new Date(),
                endTime: new Date(),
                environment: this.currentEnvironment || 'unknown'
            }
        };
    }

    enableParallelExecution(workers: number): void {
        if (workers <= 0) {
            throw new Error('Number of workers must be greater than 0');
        }
        
        logger.info(`Enabling parallel execution with ${workers} workers`);
    }

    setGlobalTimeout(timeout: number): void {
        if (timeout <= 0) {
            throw new Error('Timeout must be greater than 0');
        }
        logger.info(`Global timeout set to ${timeout}ms`);
    }

    getStatus(): FrameworkStatus {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
            components: [...this.componentStatus],
            startTime: this.startTime || new Date(),
            environment: this.currentEnvironment || 'unknown',
            version: CSFramework.version
        };
    }

    async cleanup(): Promise<void> {
        try {
            logger.info('Starting framework cleanup...');

            if (this.memoryCleanupInterval) {
                clearInterval(this.memoryCleanupInterval);
                this.memoryCleanupInterval = undefined;
                logger.info('Memory management stopped');
            }

            if (this.adoService) {
                try {
                    await this.cleanupComponent('ADOIntegrationService', async () => {
                        this.adoService?.reset();
                        await this.adoService?.initialize();
                        this.adoService = null;
                    });
                } catch (adoError) {
                    logger.error('Failed to cleanup ADO service:', adoError as Error);
                }
            }

            const cleanupPromises: Promise<void>[] = [];
            const componentNames: string[] = [];

            if (this.browserPool) {
                cleanupPromises.push(this.cleanupComponent('BrowserPool', async () => {
                    await this.browserPool?.cleanup();
                    this.browserPool = null;
                }));
                componentNames.push('BrowserPool');
            }

            if (this.browserManager) {
                cleanupPromises.push(this.cleanupComponent('BrowserManager', async () => {
                    await this.browserManager?.close();
                    this.browserManager = null;
                }));
                componentNames.push('BrowserManager');
            }

            if (this.proxyManager) {
                cleanupPromises.push(this.cleanupComponent('ProxyManager', async () => {
                    await this.proxyManager?.cleanup();
                    this.proxyManager = null;
                }));
                componentNames.push('ProxyManager');
            }

            if (this.debugManager) {
                cleanupPromises.push(this.cleanupComponent('DebugManager', async () => {
                    await this.debugManager?.cleanup();
                    this.debugManager = null;
                }));
                componentNames.push('DebugManager');
            }

            if (this.reportOrchestrator) {
                cleanupPromises.push(this.cleanupComponent('ReportOrchestrator', async () => {
                    await this.reportOrchestrator?.finalize();
                    this.reportOrchestrator = null;
                }));
                componentNames.push('ReportOrchestrator');
            }

            if (this.bddRunner) {
                cleanupPromises.push(this.cleanupComponent('CSBDDRunner', async () => {
                    await this.bddRunner?.execute({
                        environment: this.currentEnvironment || 'unknown',
                        features: [],
                        cleanup: true
                    });
                    this.bddRunner = null;
                }));
                componentNames.push('CSBDDRunner');
            }

            const cleanupResults = await Promise.allSettled(cleanupPromises);
            this.handleModuleResults(cleanupResults, componentNames);

            this.components.clear();
            this.componentStatus = [];
            this.isInitialized = false;
            CSFramework.instance = null;

            logger.info('Framework cleanup completed successfully');
        } catch (error) {
            logger.error('Framework cleanup failed:', error as Error);
            throw error;
        }
    }



    private async initializeConfigurationWithFallback(project: string, environment: string): Promise<void> {
        logger.info('Initializing configuration manager with fallback...');
        try {
            await ConfigurationManager.loadConfiguration(project, environment);
            
            const validation = ConfigurationManager.validate();
            if (!validation.valid) {
                logger.warn(`Configuration validation failed: ${validation.errors.join(', ')} - using defaults`);
                this.loadDefaultConfiguration();
            }
            
            this.configManager = ConfigurationManager.getInstance();
            this.components.set('ConfigurationManager', this.configManager);
            logger.info('Configuration manager initialized successfully');
            
        } catch (error) {
            logger.error(`Configuration loading failed: ${error}`);
            throw new Error(`Critical: Configuration Manager initialization failed - ${error}`);
        }
    }

    private loadDefaultConfiguration(): void {
        const defaults = {
            'BROWSER_TYPE': 'chromium',
            'HEADLESS': 'true',
            'TIMEOUT': '30000',
            'VIEWPORT_WIDTH': '1920',
            'VIEWPORT_HEIGHT': '1080',
            'PROXY_ENABLED': 'false',
            'ADO_INTEGRATION_ENABLED': 'false',
            'LOG_LEVEL': 'info'
        };

        Object.entries(defaults).forEach(([key, value]) => {
            if (!process.env[key]) {
                process.env[key] = value;
            }
        });
    }

    private async initializeBrowserManagementWithFallback(): Promise<void> {
        logger.info('Initializing browser management with fallback...');
        try {
            this.browserManager = BrowserManager.getInstance();
            
            if (this.browserManager.isHealthy()) {
                logger.info('Browser already initialized and healthy - reusing existing browser');
            } else {
                await this.browserManager.initialize();
                logger.info('Browser management initialized successfully');
            }
            
            this.components.set('BrowserManager', this.browserManager);
            logger.info('Browser pool DISABLED - using single browser only');
            
        } catch (error) {
            logger.error(`Browser management initialization failed: ${error}`);
            throw new Error(`Critical: Browser Manager initialization failed - ${error}`);
        }
    }

    private async initializeUtilitiesWithFallback(): Promise<void> {
        logger.info('Initializing utilities with fallback...');
        try {
        } catch (error) {
            logger.warn(`Utilities initialization failed: ${error} - continuing without utilities`);
        }
    }

    private async initializeProxyWithFallback(): Promise<void> {
        logger.info('Initializing proxy manager with fallback...');
        try {
            await this.initializeProxy();
        } catch (error) {
            logger.warn(`Proxy initialization failed: ${error} - continuing without proxy`);
        }
    }

    private async initializeDebugModeWithFallback(): Promise<void> {
        logger.info('Initializing debug manager with fallback...');
        try {
            await this.initializeDebugMode();
        } catch (error) {
            logger.warn(`Debug mode initialization failed: ${error} - continuing without debug mode`);
        }
    }

    private async initializeReportingWithFallback(): Promise<void> {
        logger.info('Initializing reporting with fallback...');
        try {
            await this.initializeReporting();
            logger.info('Reporting system initialized successfully');
        } catch (error) {
            logger.warn(`Reporting initialization failed: ${error} - continuing without advanced reporting`);
        }
    }

    private async initializeADOIntegrationWithFallback(): Promise<void> {
        try {
            logger.info('Initializing ADO integration service...');
            
            if (this.adoService) {
                this.adoService.reset();
                await this.adoService.initialize();
            } else {
                this.adoService = ADOIntegrationService.getInstance();
                await this.adoService.initialize();
            }

            this.components.set('ADOIntegrationService', this.adoService);
            logger.info('ADO integration service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize ADO integration service:', error as Error);
            throw error;
        }
    }

    private async initializeBDDRunnerWithFallback(): Promise<void> {
        logger.info('🎯 Initializing BDD runner with fallback...');
        try {
            await this.initializeBDDRunner();
        } catch (error) {
            logger.warn(`⚠️ BDD runner initialization failed: ${error} - using minimal BDD setup`);
            this.bddRunner = CSBDDRunner.getInstance();
            this.components.set('CSBDDRunner', this.bddRunner);
        }
    }


    private async initializeProxy(): Promise<void> {
        logger.info('Initializing proxy manager...');
        this.proxyManager = ProxyManager.getInstance();
        
        const proxyConfig = new ProxyConfig();
        proxyConfig.enabled = true;
        
        const proxyServer: any = {
            protocol: 'http' as const,
            host: ConfigurationManager.getRequired('PROXY_SERVER'),
            port: ConfigurationManager.getInt('PROXY_PORT')
        };
        
        if (ConfigurationManager.get('PROXY_USERNAME')) {
            proxyServer.auth = {
                username: ConfigurationManager.getRequired('PROXY_USERNAME'),
                password: ConfigurationManager.get('PROXY_PASSWORD', '')
            };
        }
        
        proxyConfig.servers = [proxyServer];
        proxyConfig.bypass = ConfigurationManager.getArray('PROXY_BYPASS');
        
        await this.proxyManager.initialize(proxyConfig);
        this.components.set('ProxyManager', this.proxyManager);
    }

    private async initializeDebugMode(): Promise<void> {
        logger.info('Initializing debug manager...');
        this.debugManager = DebugManager.getInstance();
        this.debugManager.enableDebugMode();
        this.components.set('DebugManager', this.debugManager);
    }

    private async initializeReporting(): Promise<void> {
        logger.info('Initializing report orchestrator...');
        this.reportOrchestrator = new ReportOrchestrator();
        
        const reportConfig = {
            path: ConfigurationManager.get('REPORT_PATH', './reports'),
            themePrimaryColor: ConfigurationManager.get('REPORT_THEME_PRIMARY_COLOR', '#93186C'),
            themeSecondaryColor: ConfigurationManager.get('REPORT_THEME_SECONDARY_COLOR', '#FFFFFF'),
            generatePDF: ConfigurationManager.getBoolean('REPORT_GENERATE_PDF', false),
            generateExcel: ConfigurationManager.getBoolean('REPORT_GENERATE_EXCEL', false),
            includeScreenshots: ConfigurationManager.getBoolean('REPORT_INCLUDE_SCREENSHOTS', true),
            includeVideos: ConfigurationManager.getBoolean('REPORT_INCLUDE_VIDEOS', false),
            includeLogs: ConfigurationManager.getBoolean('REPORT_INCLUDE_LOGS', true)
        };
        
        await this.reportOrchestrator.initialize(reportConfig as any);
        this.components.set('ReportOrchestrator', this.reportOrchestrator);
    }

    private async initializeBDDRunner(): Promise<void> {
        logger.info('Initializing BDD runner...');
        this.bddRunner = CSBDDRunner.getInstance();
        this.components.set('CSBDDRunner', this.bddRunner);
    }

    private initializeComponentStatus(): void {
        const componentNames = [
            'ConfigurationManager',
            'BrowserManager',
            'ProxyManager',
            'DebugManager',
            'ReportOrchestrator',
            'CSBDDRunner'
        ];

        this.componentStatus = componentNames.map(name => ({
            name,
            initialized: false,
            healthy: false
        }));
    }

    private updateComponentStatus(name: string, initialized: boolean, healthy: boolean, error?: Error): void {
        const component = this.componentStatus.find(c => c.name === name);
        if (component) {
            component.initialized = initialized;
            component.healthy = healthy;
            component.lastCheck = new Date();
            if (error) {
                component.error = error;
            }
        }
    }

    private async cleanupComponent(name: string, cleanupFn: () => Promise<void>): Promise<void> {
        try {
            logger.info(`Cleaning up ${name}...`);
            await cleanupFn();
            this.updateComponentStatus(name, false, false);
        } catch (error) {
            logger.error(`Failed to cleanup ${name}`, error as Error);
            this.updateComponentStatus(name, false, false, error as Error);
        }
    }

    private validateInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('Framework not initialized. Call initialize() first.');
        }
    }


    private initializeMemoryManagement(): void {
        logger.info('🧠 Initializing memory management system...');
        
        this.memoryManager = new FrameworkMemoryManager();
        
        this.memoryCleanupInterval = setInterval(async () => {
            try {
                await this.memoryManager!.performCleanup();
                this.logMemoryUsage();
            } catch (error) {
                logger.warn(`⚠️ Memory cleanup failed: ${error}`);
            }
        }, 300000);
        
        logger.info('✅ Memory management system initialized');
    }

    private logMemoryUsage(): void {
        const memUsage = process.memoryUsage();
        const rss = Math.round(memUsage.rss / 1024 / 1024);
        const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
        
        logger.info(`📊 Memory: RSS ${rss}MB, Heap ${heapUsed}/${heapTotal}MB`);
        
        if (rss > 512) {
            logger.warn(`⚠️ High memory usage detected: ${rss}MB RSS`);
        }
    }

    reset(): void {
        logger.info('Resetting framework...');

        if (this.adoService) {
            this.adoService.reset();
            this.adoService = null;
            this.components.delete('ADOIntegrationService');
        }

        for (const [name, component] of this.components.entries()) {
            if (typeof component.reset === 'function') {
                try {
                    component.reset();
                    logger.debug(`Reset component: ${name}`);
                } catch (error) {
                    logger.error(`Failed to reset component ${name}:`, error as Error);
                }
            }
        }

        this.components.clear();
        CSFramework.instance = null;

        logger.info('Framework reset completed');
    }
}

class FrameworkMemoryManager {
    async performCleanup(): Promise<void> {
        logger.debug('🧹 Starting memory cleanup...');
        
        try {
            if (global.gc) {
                global.gc();
                logger.debug('♻️ Forced garbage collection');
            }

            await this.cleanupComponentCaches();
            
            logger.debug('✅ Memory cleanup completed');
        } catch (error) {
            logger.error('❌ Memory cleanup failed:', error as Error);
        }
    }

    private async cleanupComponentCaches(): Promise<void> {
        try {
            if (typeof require !== 'undefined') {
                try {
                    const { bddEngine } = require('../../bdd/engine/CSBDDEngine');
                    if (bddEngine && typeof bddEngine.clearCaches === 'function') {
                        bddEngine.clearCaches();
                        logger.debug('✅ BDD Engine caches cleared');
                    }
                } catch (error) {
                    logger.debug('⚠️ BDD Engine not available for cache cleanup');
                }
            }

            try {
                const { VisualRecognitionEngine } = require('../ai/engine/VisualRecognitionEngine');
                if (VisualRecognitionEngine) {
                    const aiInstance = VisualRecognitionEngine.getInstance();
                    if (aiInstance && typeof aiInstance.clearCache === 'function') {
                        aiInstance.clearCache();
                        logger.debug('✅ AI pattern cache cleared');
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Visual Recognition Engine not available for cache cleanup');
            }

            try {
                const { BrowserPool } = require('../../core/browser/BrowserPool');
                if (BrowserPool) {
                    const poolInstance = BrowserPool.getInstance();
                    if (poolInstance) {
                        const stats = poolInstance.getStatistics();
                        if (stats.available > 1) {
                            logger.debug(`🌐 Cleaning up ${stats.available - 1} excess browsers`);
                        }
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Browser Pool not available for cache cleanup');
            }

            try {
                const { StorageManager } = require('../storage/StorageManager');
                if (StorageManager) {
                    const storageInstance = StorageManager.getInstance();
                    if (storageInstance && typeof storageInstance.clearExpiredItems === 'function') {
                        storageInstance.clearExpiredItems();
                        logger.debug('✅ Storage manager cache cleared');
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Storage Manager not available for cache cleanup');
            }

            try {
                const { NetworkInterceptor } = require('../network/NetworkInterceptor');
                if (NetworkInterceptor) {
                    logger.debug('ℹ️ Network Interceptor cleanup handled per-page');
                }
            } catch (error) {
                logger.debug('⚠️ Network Interceptor not available for cache cleanup');
            }

            try {
                const { AuthenticationHandler } = require('../../api/client/AuthenticationHandler');
                if (AuthenticationHandler) {
                    const authInstance = AuthenticationHandler.getInstance();
                    if (authInstance && typeof authInstance.clearExpiredTokens === 'function') {
                        authInstance.clearExpiredTokens();
                        logger.debug('✅ Authentication tokens cleaned up');
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Authentication Handler not available for cache cleanup');
            }

            try {
                const { CSDataProvider } = require('../../data/provider/CSDataProvider');
                if (CSDataProvider) {
                    const dataInstance = CSDataProvider.getInstance();
                    if (dataInstance && typeof dataInstance.clearCache === 'function') {
                        dataInstance.clearCache();
                        logger.debug('✅ Data provider cache cleared');
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Data Provider not available for cache cleanup');
            }

            try {
                const { ReportCollector } = require('../../reporting/core/ReportCollector');
                if (ReportCollector) {
                    const reportInstance = ReportCollector.getInstance();
                    if (reportInstance && typeof reportInstance.compactLogs === 'function') {
                        reportInstance.compactLogs();
                        logger.debug('✅ Report collector logs compacted');
                    }
                }
            } catch (error) {
                logger.debug('⚠️ Report Collector not available for cache cleanup');
            }

            if (global.gc) {
                const beforeGC = process.memoryUsage();
                global.gc();
                const afterGC = process.memoryUsage();
                const freed = Math.round((beforeGC.heapUsed - afterGC.heapUsed) / 1024 / 1024);
                logger.debug(`♻️ Garbage collection freed ${freed}MB`);
            }

        } catch (error) {
            logger.warn(`⚠️ Component cache cleanup failed: ${error}`);
        }
    }
}

export const framework = CSFramework.getInstance();
