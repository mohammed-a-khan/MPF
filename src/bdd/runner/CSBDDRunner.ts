// src/bdd/runner/CSBDDRunner.ts
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { BrowserManager } from '../../core/browser/BrowserManager';
import * as os from 'os';
import * as path from 'path';

import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConsoleCapture } from '../../core/logging/ConsoleCapture';
import { FileUtils } from '../../core/utils/FileUtils';
import { FeatureFileParser } from '../parser/FeatureFileParser';
import { ExamplesParser } from '../parser/ExamplesParser';
import { TestScheduler } from './TestScheduler';
import { ExecutionMonitor } from './ExecutionMonitor';
import { ParallelExecutor } from './ParallelExecutor';
import { FeatureExecutor } from './FeatureExecutor';
import { ReportOrchestrator } from '../../reporting/core/ReportOrchestrator';
import { ReportConfig } from '../../reporting/core/ReportConfig';
import { 
    ReportData, 
    FeatureReport, 
    ScenarioReport,
    ExportFormat,
    ChartType,
    TestStatus,
    ReportTheme,
    EvidenceConfig,
    ChartConfig,
    CustomizationConfig,
    ExecutionMetrics,
    BrowserMetrics,
    NetworkMetrics,
    SystemMetrics
} from '../../reporting/types/reporting.types';
import { StepDefinitionLoader } from '../base/StepDefinitionLoader';
import { OptimizedStepDefinitionLoader } from '../base/OptimizedStepDefinitionLoader';
import { HookExecutor } from '../hooks/HookExecutor';
import { ProxyManager } from '../../core/proxy/ProxyManager';
import { ADOIntegrationService } from '../../integrations/ado/ADOIntegrationService';
import { ADOConfig } from '../../integrations/ado/ADOConfig';
import { stepRegistry } from '../decorators/StepRegistry';
import { 
    RunOptions, 
    ExecutionPlan, 
    ExecutionResult, 
    Feature,
    Scenario,
    ExecutionSummary,
    RunnerState,
    ExecutionStatus,
    ScenarioStatus,
    StepStatus,
    FeatureStatus
} from '../types/bdd.types';


export interface TestExecutionProfile {
    requiresBrowser: boolean;
    requiresAPI: boolean;
    requiresDatabase: boolean;
    stepDefinitionPaths: string[];
    componentInitialization: {
        browser: boolean;
        api: boolean;
        database: boolean;
        proxy: boolean;
    };
}

export class CSBDDRunner {
    private static instance: CSBDDRunner;
    private state: RunnerState = 'idle';
    private executionMonitor: ExecutionMonitor;
    private parallelExecutor: ParallelExecutor;
    private featureExecutor: FeatureExecutor;
    private hookExecutor: HookExecutor;
    private runOptions!: RunOptions;
    private abortController: AbortController;
    private reportOrchestrator: ReportOrchestrator;
    
    private executionProfile: TestExecutionProfile | null = null;

    private constructor() {
        this.executionMonitor = null as any;
        this.parallelExecutor = null as any;
        this.featureExecutor = null as any;
        this.hookExecutor = null as any;
        this.abortController = new AbortController();
        this.reportOrchestrator = null as any;
    }

    private ensureInitialized(): void {
        if (!this.executionMonitor) {
            this.executionMonitor = ExecutionMonitor.getInstance();
        }
        if (!this.parallelExecutor) {
            this.parallelExecutor = ParallelExecutor.getInstance();
        }
        if (!this.featureExecutor) {
            this.featureExecutor = new FeatureExecutor();
        }
        if (!this.hookExecutor) {
            this.hookExecutor = HookExecutor.getInstance();
        }
        if (!this.reportOrchestrator) {
            this.reportOrchestrator = new ReportOrchestrator();
        }
    }

    public static getInstance(): CSBDDRunner {
        if (!CSBDDRunner.instance) {
            CSBDDRunner.instance = new CSBDDRunner();
        }
        return CSBDDRunner.instance;
    }

    public static async run(options: RunOptions): Promise<void> {
        const runner = CSBDDRunner.getInstance();
        await runner.execute(options);
    }

    public async execute(options: RunOptions): Promise<void> {
        const consoleCapture = ConsoleCapture.getInstance();
        consoleCapture.startCapture();
        
        this.ensureInitialized();
        
        this.runOptions = options;
        const startTime = new Date();
        this.state = 'initializing';
        
        let executionResult: ExecutionResult | null = null;
        let initializationSuccess = false;
        let discoverySuccess = false;
        let executionSuccess = false;

        try {
            const logger = ActionLogger.getInstance();
            logger.info('CS BDD Runner - Starting test execution');
            logger.debug('Run Options: ' + JSON.stringify(options, null, 2));

            try {
                await this.initialize(options);
                initializationSuccess = true;
                logger.info('✅ Framework initialization completed successfully');
            } catch (initError) {
                logger.error('❌ Framework initialization failed: ' + (initError as Error).message);
                executionResult = this.createFailedExecutionResult(startTime, 'Initialization failed: ' + (initError as Error).message);
                throw initError;
            }

            stepRegistry.lock();

            let executionPlan: ExecutionPlan;
            try {
                executionPlan = await this.discover(options);
                discoverySuccess = true;
                logger.info('✅ Test discovery completed successfully');

                if (executionPlan.totalScenarios === 0) {
                    logger.warn('⚠️  No scenarios found matching criteria - generating empty report');
                    executionResult = this.createEmptyExecutionResult(startTime, 'No scenarios found matching criteria');
                    await this.report(executionResult);
                    return;
                }
            } catch (discoveryError) {
                logger.error('❌ Test discovery failed: ' + (discoveryError as Error).message);
                executionResult = this.createFailedExecutionResult(startTime, 'Discovery failed: ' + (discoveryError as Error).message);
                throw discoveryError;
            }

            try {
                this.state = 'running';
                executionResult = await this.executeTests(executionPlan);
                executionSuccess = true;
                logger.info('✅ Test execution completed');

                executionResult.startTime = startTime;
            } catch (executionError) {
                logger.error('❌ Test execution failed: ' + (executionError as Error).message);
                if (!executionResult) {
                    executionResult = this.createFailedExecutionResult(startTime, 'Execution failed: ' + (executionError as Error).message);
                }
            }

        } catch (error) {
            this.state = 'error';
            const logger = ActionLogger.getInstance();
            logger.error('CS BDD Runner - Fatal error during execution: ' + (error as Error).message);
            
            if (!executionResult) {
                executionResult = this.createFailedExecutionResult(startTime, 'Fatal error: ' + (error as Error).message);
            }
        }

        const logger = ActionLogger.getInstance();
        try {
            if (executionResult) {
                logger.info('📊 Generating reports (regardless of test outcome)...');
                await this.report(executionResult);
                logger.info('✅ Reports generated successfully');
            }
        } catch (reportError) {
            logger.error('❌ Report generation failed: ' + (reportError as Error).message);
        }

        try {
            const adoConfigEnabled = ConfigurationManager.getBoolean('ADO_UPLOAD_RESULTS', false) ||
                ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false);
            
            const adoRuntimeEnabled = options.adoEnabled !== false;
            
            if (adoConfigEnabled && adoRuntimeEnabled && executionResult) {
                logger.info('📤 Uploading results to ADO (after report generation)...');
                await this.uploadToADO(executionResult);
                logger.info('✅ ADO upload completed');
            }
        } catch (adoError) {
            logger.error('❌ ADO upload failed: ' + (adoError as Error).message);
        }

        try {
            const currentReportDir = ConfigurationManager.get('CURRENT_REPORT_DIR');
            if (currentReportDir) {
                const evidenceDir = path.join(currentReportDir, 'evidence');
                
                await logger.saveConsoleLogs(path.join(evidenceDir, 'console-logs.txt'), 'text');
                await logger.saveConsoleLogs(path.join(evidenceDir, 'console-logs.json'), 'json');
                await logger.saveConsoleLogs(path.join(evidenceDir, 'console-logs.html'), 'html');
                
                const consoleLogsDir = path.join(evidenceDir, 'console-logs');
                await FileUtils.ensureDir(consoleLogsDir);
                
                const consoleLogs = ConsoleCapture.getInstance().getMessages();
                await FileUtils.writeJSON(path.join(consoleLogsDir, 'execution-logs.json'), consoleLogs);
                
                await FileUtils.writeJSON(path.join(evidenceDir, 'execution-logs.json'), consoleLogs);
                
                logger.info(`📝 Console logs saved to report directory: ${currentReportDir}`);
            } else {
                const reportPath = this.runOptions['reportPath'] || './reports';
                await logger.saveConsoleLogs(path.join(reportPath, 'console-logs.txt'), 'text');
                await logger.saveConsoleLogs(path.join(reportPath, 'console-logs.json'), 'json');
                logger.info('📝 Console logs saved to default reports directory');
            }
        } catch (consoleLogError) {
            logger.warn('Failed to save console logs: ' + (consoleLogError as Error).message);
        }

        try {
            await this.cleanup();
        } catch (cleanupError) {
            logger.error('❌ Cleanup failed: ' + (cleanupError as Error).message);
        }

        this.state = 'stopped';
        
        if (!initializationSuccess) {
            logger.error('🔥 FRAMEWORK INITIALIZATION FAILED');
            await this.emergencyCleanup();
            process.exit(3);
        } else if (!discoverySuccess) {
            logger.error('🔍 TEST DISCOVERY FAILED');
            process.exit(4);
        } else if (!executionSuccess && executionResult && executionResult.summary.total > 0) {
            logger.error('🧪 TEST EXECUTION FAILED');
            process.exit(1);
        } else if (executionResult && executionResult.summary.failed > 0) {
            logger.warn('⚠️  TESTS COMPLETED WITH FAILURES');
            logger.info('📊 Reports generated - check HTML report for details');
            process.exit(1);
        } else {
            logger.info('🎉 ALL TESTS PASSED SUCCESSFULLY');
            logger.info('📊 Reports generated - check HTML report for details');
            process.exit(0);
        }
    }

    private async analyzeTestExecutionProfile(options: RunOptions): Promise<TestExecutionProfile> {
        const logger = ActionLogger.getInstance();
        logger.info('🔍 Analyzing test execution profile...');

        const featurePaths = options['featurePaths'] || options['features'] || options['paths'] || ['**/*.feature'];
        
        const parser = FeatureFileParser.getInstance();
        const features = await parser.parseAll(featurePaths);
        
        const allTags = new Set<string>();
        let hasUISteps = false;
        let hasAPISteps = false;
        let hasDatabaseSteps = false;
        
        for (const feature of features) {
            for (const scenario of feature.scenarios) {
                scenario.tags?.forEach(tag => allTags.add(tag));
                
                for (const step of scenario.steps) {
                    const stepText = step.text.toLowerCase();
                    
                    if (stepText.includes('click') || stepText.includes('navigate') || 
                        stepText.includes('browser') || stepText.includes('page') ||
                        stepText.includes('element') || stepText.includes('login') ||
                        stepText.includes('enter') || stepText.includes('type')) {
                        hasUISteps = true;
                    }
                    
                    if (stepText.includes('api') || stepText.includes('request') || 
                        stepText.includes('response') || stepText.includes('http') ||
                        stepText.includes('get ') || stepText.includes('post ') ||
                        stepText.includes('put ') || stepText.includes('delete ') ||
                        stepText.includes('endpoint') || stepText.includes('header')) {
                        hasAPISteps = true;
                    }
                    
                    if (stepText.includes('database') || stepText.includes('query') || 
                        stepText.includes('sql') || stepText.includes('table') ||
                        stepText.includes('record') || stepText.includes('connect')) {
                        hasDatabaseSteps = true;
                    }
                }
            }
        }

        const configRequiresBrowser = ConfigurationManager.getBoolean('BROWSER_REQUIRED', false);
        const configUIEnabled = ConfigurationManager.getBoolean('UI_ENABLED', true);
        const configAPIEnabled = ConfigurationManager.getBoolean('API_ENABLED', true);
        const configDatabaseEnabled = ConfigurationManager.getBoolean('DATABASE_ENABLED', false);

        const hasAPITags = allTags.has('@api');
        const hasDatabaseTags = allTags.has('@database');
        const hasUITags = !hasAPITags && !hasDatabaseTags;

        const requiresAPI = hasAPITags || hasAPISteps || configAPIEnabled;
        const requiresDatabase = hasDatabaseTags || hasDatabaseSteps || configDatabaseEnabled;
        const requiresBrowser = (hasUITags || hasUISteps || configRequiresBrowser || configUIEnabled) && 
                               !options.headless &&
                               !(hasAPITags && !hasUISteps);

        const stepDefinitionPaths: string[] = [];
        if (requiresBrowser || hasUISteps) {
            stepDefinitionPaths.push('src/steps/ui/**/*.ts', 'test/**/steps/**/*.ts');
        }
        if (requiresAPI || hasAPISteps) {
            stepDefinitionPaths.push('src/steps/api/**/*.ts');
        }
        if (requiresDatabase || hasDatabaseSteps) {
            stepDefinitionPaths.push('src/steps/database/**/*.ts');
        }

        const profile: TestExecutionProfile = {
            requiresBrowser,
            requiresAPI,
            requiresDatabase,
            stepDefinitionPaths,
            componentInitialization: {
                browser: requiresBrowser,
                api: requiresAPI,
                database: requiresDatabase,
                proxy: ConfigurationManager.getBoolean('PROXY_ENABLED', false)
            }
        };

        logger.info(`🎯 Test Execution Profile Determined:`);
        logger.info(`   Browser Required: ${requiresBrowser}`);
        logger.info(`   API Required: ${requiresAPI}`);
        logger.info(`   Database Required: ${requiresDatabase}`);
        logger.info(`   Tags Found: [${Array.from(allTags).join(', ')}]`);
        logger.info(`   Step Types: UI=${hasUISteps}, API=${hasAPISteps}, DB=${hasDatabaseSteps}`);

        return profile;
    }

    private async loadStepDefinitionsConditionally(profile: TestExecutionProfile): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.info('📚 Loading step definitions conditionally...');

        const stepLoader = StepDefinitionLoader.getInstance();
        stepLoader.reset();

        if (profile.requiresAPI) {
            logger.info('🔌 Loading API step definitions...');
            await import('../../steps/api/index');
        }

        if (profile.requiresBrowser) {
            logger.info('🖥️  Loading UI step definitions...');
            try {
                await import('../../steps/ui/InteractionSteps');
                await import('../../steps/ui/NavigationSteps');
                await import('../../steps/ui/ValidationSteps');
                await import('../../steps/ui/StorageSteps');
                await import('../../steps/ui/FrameSteps');
                await import('../../steps/ui/AdvancedInteractionSteps');
                await import('../../steps/ui/DebugSteps');
                
                logger.info('✅ UI step definitions loaded');
            } catch (error) {
                logger.warn('⚠️  Some UI step definitions could not be loaded:', error as Error);
            }
        }

        if (profile.requiresDatabase) {
            logger.info('🗄️  Loading Database step definitions...');
            try {
                await import('../../steps/database/ConnectionSteps');
                await import('../../steps/database/DatabaseGenericSteps');
                await import('../../steps/database/DatabaseUtilitySteps');
                await import('../../steps/database/QueryExecutionSteps');
                await import('../../steps/database/DataValidationSteps');
                await import('../../steps/database/TransactionSteps');
                await import('../../steps/database/StoredProcedureSteps');
                logger.info('✅ Database step definitions loaded');
            } catch (error) {
                logger.warn('⚠️  Some Database step definitions could not be loaded:', error as Error);
            }
        }

        await stepLoader.loadAll();
        
        const stats = stepRegistry.getStats();
        logger.info(`✅ Step definitions loaded conditionally - Total steps: ${stats.totalSteps}`);
        logger.info(`🔍 DEBUG: Registered class instances: ${Array.from(stepRegistry['classInstances'].keys()).join(', ')}`);
        logger.info(`🔍 DEBUG: Total step definitions: ${stepRegistry.getAllStepDefinitions().length}`);
    }

    private async initialize(options: RunOptions): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.info('Framework Initialization - Starting initialization');

        try {
            if (options.project) {
                await ConfigurationManager.loadConfiguration(options.project, options.environment || 'default');
                logger.info(`Configuration loaded - Project: ${options.project}, Environment: ${options.environment || 'default'}`);
            } else {
                await ConfigurationManager.loadConfiguration(options.environment || 'default');
                logger.info('Configuration loaded - Environment: ' + (options.environment || 'default'));
            }

            if (ConfigurationManager.getBoolean('PROXY_ENABLED', false)) {
                const proxyManager = ProxyManager.getInstance();
                await proxyManager.initialize({} as any);
                logger.info('Proxy configured');
            }

            await logger.initialize({
                logLevel: options['logLevel'] || ConfigurationManager.get('LOG_LEVEL', 'info'),
                logToFile: ConfigurationManager.getBoolean('LOG_TO_FILE', true),
                logPath: ConfigurationManager.get('LOG_PATH', './logs')
            } as any);

            this.executionProfile = await this.analyzeTestExecutionProfile(options);
            logger.info('✅ Test execution profile analyzed');

            logger.info('🔍 Initializing step registry...');
            stepRegistry.initialize();
            stepRegistry.unlock();

            const useOptimizedLoader = ConfigurationManager.getBoolean('USE_OPTIMIZED_STEP_LOADER', true);
            
            if (useOptimizedLoader) {
                const optimizedLoader = OptimizedStepDefinitionLoader.getInstance();
                
                const featurePaths = options['featurePaths'] || options['features'] || options['paths'] || ['**/*.feature'];
                const parser = FeatureFileParser.getInstance();
                const featureFiles = await parser.discoverFeatureFiles(Array.isArray(featurePaths) ? featurePaths.join(',') : featurePaths);
                
                await optimizedLoader.initialize(featureFiles);
                
                const stats = stepRegistry.getStats();
                logger.info(`✅ Step definitions loaded - ${stats.totalSteps} steps`);
            } else {
                const stepLoader = StepDefinitionLoader.getInstance();
                await stepLoader.loadAll();
                const stats = stepRegistry.getStats();
                logger.info(`✅ Step definitions loaded - ${stats.totalSteps} steps`);
            }

            if (this.executionProfile.componentInitialization.browser) {
                logger.info('🖥️  Browser required - initializing browser...');
                const browserConfig = {
                    browser: (options.browser || ConfigurationManager.get('DEFAULT_BROWSER', 'chromium')) as 'chromium' | 'firefox' | 'webkit',
                    headless: options.headless !== false ? ConfigurationManager.getBoolean('HEADLESS', false) : false,
                    slowMo: ConfigurationManager.getInt('BROWSER_SLOWMO', 0),
                    timeout: ConfigurationManager.getInt('DEFAULT_TIMEOUT', 30000),
                    viewport: {
                        width: ConfigurationManager.getInt('VIEWPORT_WIDTH', 1920),
                        height: ConfigurationManager.getInt('VIEWPORT_HEIGHT', 1080)
                    },
                    downloadsPath: ConfigurationManager.get('DOWNLOADS_PATH', './downloads'),
                    ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false),
                    tracesDir: './traces',
                    videosDir: './videos'
                };

                const browserManager = BrowserManager.getInstance();
                try {
                    if (browserManager.isHealthy()) {
                        logger.info('✅ Browser already initialized and healthy - reusing existing browser');
                    } else {
                        logger.info('🚀 Initializing browser...');
                        await browserManager.initialize();
                        logger.info('✅ Browser instance ready for test execution');
                    }
                } catch (error) {
                    logger.error('❌ Failed to initialize browser:', error);
                    throw error;
                }
            } else {
                logger.info('🚫 Browser initialization SKIPPED - not required for this test type');
            }

            const screenshotOption = options.screenshot || options['screenshot'];
            if (screenshotOption !== undefined) {
                let screenshotMode: string;
                
                if (typeof screenshotOption === 'boolean') {
                    screenshotMode = screenshotOption ? 'always' : 'never';
                } else {
                    screenshotMode = screenshotOption;
                }
                
                ConfigurationManager.set('SCREENSHOT_MODE', screenshotMode);
                ConfigurationManager.set('SCREENSHOT_ON_FAILURE', String(screenshotMode === 'always' || screenshotMode === 'on-failure'));
                ConfigurationManager.set('SCREENSHOT_ON_PASS', String(screenshotMode === 'always'));
                logger.info(`📸 Screenshot mode set to: ${screenshotMode}`);
            }

            const reportConfig = new ReportConfig();
            await reportConfig.load({
                outputDir: options['reportPath'] || ConfigurationManager.get('REPORT_PATH', './reports'),
                reportTitle: options['reportName'] || `Test Report - ${new Date().toISOString()}`,
                includeFormats: options['reportFormats'] || ['html', 'json'],
                theme: {
                    primaryColor: ConfigurationManager.get('REPORT_THEME_PRIMARY_COLOR', '#93186C'),
                    secondaryColor: ConfigurationManager.get('REPORT_THEME_SECONDARY_COLOR', '#FFFFFF')
                },
                generatePDF: ConfigurationManager.getBoolean('GENERATE_PDF_REPORT', true),
                generateExcel: ConfigurationManager.getBoolean('GENERATE_EXCEL_REPORT', true),
                generateJSON: ConfigurationManager.getBoolean('GENERATE_JSON_REPORT', true),
                generateXML: ConfigurationManager.getBoolean('GENERATE_XML_REPORT', false)
            } as any);
            await this.reportOrchestrator.initialize(reportConfig);

            const adoConfigEnabled = ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false);
            const adoRuntimeEnabled = options.adoEnabled !== false;
            
            if (adoConfigEnabled && adoRuntimeEnabled) {
                logger.info('Initializing ADO integration...');

                ADOConfig.initialize();

                await ADOIntegrationService.getInstance().initialize();
                logger.info('ADO integration initialized');
            } else {
                logger.info('ADO integration disabled - skipping initialization');
            }

            await this.hookExecutor.executeBeforeHooks({} as any);

            logger.info('Framework Initialization - Initialization completed');

        } catch (error) {
            logger.error('Framework Initialization - Initialization failed: ' + (error as Error).message);
            throw new Error(`Framework initialization failed: ${(error as Error).message}`);
        }
    }

    private async discover(options: RunOptions): Promise<ExecutionPlan> {
        const logger = ActionLogger.getInstance();
        logger.info('Test Discovery - Starting test discovery');

        try {
            const parser = FeatureFileParser.getInstance();
            
            const featurePaths = options['featurePaths'] || options['features'] || options['paths'] || options['featurePaths'] || ['**/*.feature'];
            
            logger.info(`Feature discovery - Using paths: ${JSON.stringify(featurePaths)}`);
            
            const parsePromise = parser.parseAll(featurePaths);
            const parseTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Feature parsing timeout')), 15000);
            });
            
            const features = await Promise.race([parsePromise, parseTimeoutPromise]) as any[];
            logger.info('Features parsed - Total features: ' + features.length);

            const expandedFeatures = await this.expandScenarioOutlines(features);
            logger.info('Scenario outlines expanded - Total features: ' + expandedFeatures.length);

            expandedFeatures.forEach((feature, i) => {
                logger.debug(`Parsed feature ${i+1}: "${feature.name}" (URI: ${feature.uri}) with ${feature.scenarios.length} scenarios`);
                feature.scenarios.forEach((scenario: any, j: number) => {
                    logger.debug(`  Scenario ${j+1}: "${scenario.name}" (Tags: ${scenario.tags.join(', ')})`);
                });
            });

            logger.debug('Applying filters with options: ' + JSON.stringify({
                features: options['features'],
                tags: options.tags,
                scenarios: options['scenarios']
            }));
            
            const filteredFeatures = this.applyFilters(expandedFeatures, options);
            
            logger.info(`Filtering result: ${features.length} -> ${filteredFeatures.length} features`);
            const totalScenariosAfterFilter = filteredFeatures.reduce((sum, f) => sum + f.scenarios.length, 0);
            logger.info(`Total scenarios after filtering: ${totalScenariosAfterFilter}`);
            
            const scheduler = new TestScheduler();
            const executionPlan = await scheduler.createExecutionPlan(filteredFeatures, options);

            logger.info('Execution plan created: ' +
                'totalFeatures=' + executionPlan.totalFeatures + 
                ', totalScenarios=' + executionPlan.totalScenarios +
                ', estimatedDuration=' + executionPlan.estimatedDuration + 'ms');

            if (options.dryRun) {
                this.logExecutionPlan(executionPlan);
            }

            return executionPlan;

        } catch (error) {
            logger.error('Test Discovery - Discovery failed: ' + (error as Error).message);
            throw new Error(`Test discovery failed: ${(error as Error).message}`);
        }
    }

    private async executeTests(plan: ExecutionPlan): Promise<ExecutionResult> {
        const logger = ActionLogger.getInstance();
        logger.info('Test Execution - Starting test execution');

        this.executionMonitor.startMonitoring();

        try {
            let result: ExecutionResult;

            // CRITICAL FIX: ALWAYS force sequential execution to prevent multiple browser instances
            logger.info('🔧 FORCED SEQUENTIAL EXECUTION - Parallel execution permanently disabled');
            result = await this.executeSequential(plan);

            this.executionMonitor.stopMonitoring();

            this.logExecutionSummary(result.summary);

            return result;

        } catch (error) {
            this.executionMonitor.stopMonitoring();
            logger.error('Test Execution - Execution failed: ' + (error as Error).message);
            throw error;
        }
    }

    private async executeSequential(plan: ExecutionPlan): Promise<ExecutionResult> {
        const results: ExecutionResult = {
            startTime: new Date(),
            endTime: new Date(),
            duration: 0,
            status: ExecutionStatus.PASSED,
            features: [],
            summary: {
                total: 0,
                totalFeatures: 0,
                totalScenarios: 0,
                totalSteps: 0,
                passedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                pending: 0,
                duration: 0
            },
            errors: [],
            environment: this.runOptions.environment || 'default',
            timestamp: new Date()
        };

        for (const feature of plan.features) {
            if (this.abortController.signal.aborted) {
                const logger = ActionLogger.getInstance();
                logger.warn('Execution aborted by user');
                break;
            }

            try {
                const logger = ActionLogger.getInstance();
                logger.info(`🔥 DEBUG: Executing feature: ${feature.name} with ${feature.scenarios.length} scenarios`);
                
                const featureResult = await this.featureExecutor.execute(feature);
                
                logger.info(`🔥 DEBUG: Feature result received: ${featureResult.id}, status: ${featureResult.status}, scenarios: ${featureResult.scenarios.length}`);
                logger.info(`🔥 DEBUG: Feature scenarios details:`, featureResult.scenarios.map(s => ({ id: s.id, name: s.scenario, status: s.status, steps: s.steps?.length || 0 })));
                
                results.features.push(featureResult);

                this.updateSummary(results.summary, featureResult);
                
                logger.info(`🔥 DEBUG: Summary after update: totalFeatures=${results.summary.totalFeatures}, totalScenarios=${results.summary.totalScenarios}, totalSteps=${(results.summary as any).totalSteps}, passed=${results.summary.passed}`);

                if (feature.scenarios && feature.scenarios.length > 0) {
                    this.executionMonitor.emit('scenarioStart', feature.scenarios[0]);
                }

            } catch (error) {
                const logger = ActionLogger.getInstance();
                logger.error('Feature execution failed - ' + feature.name + ': ' + (error as Error).message);
                logger.error('🔥 DEBUG: Feature execution error details:', error);
                if (!results.errors) results.errors = [];
                results.errors.push(error as Error);
            }
        }

        results.endTime = new Date();
        results.duration = results.endTime.getTime() - results.startTime.getTime();
        results.status = results.summary.failed > 0 ? ExecutionStatus.FAILED : ExecutionStatus.PASSED;
        results.summary.duration = results.duration;

        return results;
    }

    private async report(result: ExecutionResult): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.info('Report Generation - Starting report generation');

        try {
            if (!this.reportOrchestrator) {
                this.reportOrchestrator = new ReportOrchestrator();
            }

            try {
                const reportConfig = new ReportConfig();
                await reportConfig.load({
                    outputDir: this.runOptions['reportPath'] || './reports',
                    reportTitle: this.runOptions['reportName'] || `Test Report - ${new Date().toISOString()}`,
                    includeFormats: this.runOptions['reportFormats'] || ['html', 'json'],
                    theme: {
                        primaryColor: ConfigurationManager.get('REPORT_THEME_PRIMARY_COLOR', '#93186C'),
                        secondaryColor: ConfigurationManager.get('REPORT_THEME_SECONDARY_COLOR', '#FFFFFF')
                    },
                    generatePDF: ConfigurationManager.getBoolean('GENERATE_PDF_REPORT', true),
                    generateExcel: ConfigurationManager.getBoolean('GENERATE_EXCEL_REPORT', true),
                    generateJSON: ConfigurationManager.getBoolean('GENERATE_JSON_REPORT', true),
                    generateXML: ConfigurationManager.getBoolean('GENERATE_XML_REPORT', false)
                } as any);
                await this.reportOrchestrator.initialize(reportConfig);
            } catch (configError) {
                logger.warn('Report config initialization failed, using defaults: ' + (configError as Error).message);
            }

            const reportData = this.convertToReportData(result);
            
            await this.reportOrchestrator.generateReports(reportData);

            const reportPaths = { html: './reports/index.html', json: './reports/report.json' };
            logger.info('Reports generated: ' + JSON.stringify(reportPaths));

            if (this.runOptions['openReport'] && reportPaths.html) {
                await this.openReport(reportPaths.html);
            }

        } catch (error) {
            logger.error('Report Generation - Report generation failed: ' + (error as Error).message);
        }
    }

    private async uploadToADO(result: ExecutionResult): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.info('ADO Upload - Starting ADO upload');

        try {
            const adoService = ADOIntegrationService.getInstance();
            
            const uploadResult = await adoService.uploadTestResults(result);

            logger.info('ADO Upload - Upload completed: ' + JSON.stringify(uploadResult));

        } catch (error) {
            logger.error('ADO Upload - Upload failed: ' + (error as Error).message);
        }
    }

    private async cleanup(): Promise<void> {
        const logger = ActionLogger.getInstance();
        logger.info('Cleanup - Starting cleanup');

        try {
            await this.hookExecutor.executeAfterHooks({} as any);

            await BrowserManager.getInstance().close();

            const adoConfigEnabled = ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false);
            const adoRuntimeEnabled = this.runOptions.adoEnabled !== false;
            
            if (adoConfigEnabled && adoRuntimeEnabled) {
                try {
                    ADOIntegrationService.getInstance().reset();
                    await ADOIntegrationService.getInstance().initialize();
                } catch (adoError) {
                    logger.error('Failed to reset and reinitialize ADO service:', adoError as Error);
                }
            }

            await this.cleanupTempFiles();


            logger.info('Cleanup - Cleanup completed');

        } catch (error) {
            logger.error('Cleanup - Cleanup failed: ' + (error as Error).message);
        }
    }

    private convertToReportData(result: ExecutionResult): ReportData {
        const now = new Date();
        
        const logger = ActionLogger.getInstance();
        logger.info(`🔥 DEBUG: Converting ExecutionResult to ReportData`);
        logger.info(`🔥 DEBUG: ExecutionResult features count: ${result.features.length}`);
        logger.info(`🔥 DEBUG: ExecutionResult summary:`, result.summary);
        
        if (result.features.length > 0) {
            const firstFeature = result.features[0];
            if (firstFeature) {
                logger.info(`🔥 DEBUG: First feature details:`, {
                    id: firstFeature.id || 'no-id',
                    name: (firstFeature.feature && firstFeature.feature.name) || firstFeature.name || 'no-name',
                    scenarios: (firstFeature.scenarios && firstFeature.scenarios.length) || 0
                });
                
                if (firstFeature.scenarios && firstFeature.scenarios.length > 0) {
                    const firstScenario = firstFeature.scenarios[0];
                    if (firstScenario) {
                        logger.info(`🔥 DEBUG: First scenario in first feature:`, {
                            id: firstScenario.id || 'no-id',
                            scenario: firstScenario.scenario || 'no-scenario-field',
                            name: firstScenario.scenario || 'no-name-field',
                            scenarioRef: firstScenario.scenarioRef ? {
                                name: firstScenario.scenarioRef.name || 'no-ref-name'
                            } : 'no-scenarioRef',
                            status: firstScenario.status || 'no-status',
                            steps: firstScenario.steps ? firstScenario.steps.length : 0
                        });
                    }
                }
            }
        }

        let browserVersion = 'Unknown';
        let browserName = this.runOptions.browser || 'chromium';
        try {
            const browserManager = BrowserManager.getInstance();
            if (browserManager) {
                browserVersion = browserManager.getBrowserVersion();
            }
        } catch (error) {
            logger.debug('Could not retrieve browser version: ' + (error as Error).message);
        }

        const playwrightVersion = '1.40.1';
        
        const collectedLogs = this.collectLogsFromEvidence();
        
        return {
            metadata: {
                reportId: `report-${Date.now()}`,
                reportName: this.runOptions['reportName'] || 'Test Execution Report',
                executionId: `exec-${Date.now()}`,
                environment: result.environment || ConfigurationManager.getEnvironmentName(),
                executionDate: now,
                startTime: result.startTime || now,
                endTime: result.endTime || now,
                duration: result.duration || 0,
                reportGeneratedAt: now,
                frameworkVersion: '1.0.0',
                reportVersion: '1.0',
                browser: browserName,
                browserVersion: browserVersion,
                playwrightVersion: playwrightVersion,
                machineInfo: {
                    hostname: os.hostname(),
                    platform: process.platform,
                    arch: process.arch,
                    cpuCores: os.cpus().length,
                    totalMemory: os.totalmem(),
                    nodeVersion: process.version,
                    osRelease: os.release()
                },
                userInfo: {
                    username: process.env['USER'] || 'unknown',
                    domain: 'local',
                    executedBy: process.env['USER'] || 'unknown'
                },
                tags: [],
                executionOptions: {
                    env: ConfigurationManager.getEnvironmentName()
                },
                logs: collectedLogs
            },
            configuration: {
                theme: {
                    primaryColor: '#93186C',
                    secondaryColor: '#FFFFFF',
                    successColor: '#4CAF50',
                    failureColor: '#F44336',
                    warningColor: '#FF9800',
                    infoColor: '#2196F3',
                    backgroundColor: '#F5F5F5',
                    fontFamily: 'Arial, sans-serif'
                } as ReportTheme,
                exportFormats: ['html' as ExportFormat, 'json' as ExportFormat],
                includeEvidence: {
                    includeScreenshots: true,
                    includeVideos: false,
                    includeTraces: false,
                    includeNetworkLogs: true,
                    includeConsoleLogs: true,
                    maxScreenshotsPerScenario: 10,
                    compressImages: false,
                    embedInReport: true
                } as EvidenceConfig,
                charts: {
                    enableCharts: true,
                    chartTypes: ['pie' as ChartType, 'bar' as ChartType, 'line' as ChartType],
                    interactive: true,
                    exportable: true,
                    customCharts: []
                } as ChartConfig,
                sections: [],
                customizations: {
                    companyLogo: '',
                    companyName: 'Test Company',
                    projectName: 'Test Project',
                    customCSS: '',
                    customFooter: '',
                    headerTemplate: '',
                    reportTitle: 'Test Execution Report'
                } as CustomizationConfig
            },
            summary: {
                totalFeatures: result.summary.totalFeatures || 0,
                passedFeatures: result.features.filter(f => f.status === 'passed').length,
                failedFeatures: result.features.filter(f => f.status === 'failed').length,
                skippedFeatures: result.features.filter(f => f.status === 'skipped').length,
                totalScenarios: result.summary.totalScenarios || 0,
                passedScenarios: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).filter(s => s.status === 'passed').length, 0),
                failedScenarios: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).filter(s => s.status === 'failed').length, 0),
                skippedScenarios: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).filter(s => s.status === 'skipped').length, 0),
                totalSteps: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).reduce((sacc, s) => 
                        sacc + (s.steps || []).length, 0), 0),
                passedSteps: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).reduce((sacc, s) => 
                        sacc + (s.steps || []).filter(st => st.status === 'passed').length, 0), 0),
                failedSteps: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).reduce((sacc, s) => 
                        sacc + (s.steps || []).filter(st => st.status === 'failed').length, 0), 0),
                skippedSteps: result.features.reduce((acc, f) => 
                    acc + (f.scenarios || []).reduce((sacc, s) => 
                        sacc + (s.steps || []).filter(st => st.status === 'skipped').length, 0), 0),
                pendingSteps: result.summary.pending || 0,
                executionTime: result.duration || 0,
                parallelWorkers: this.runOptions.parallel ? (this.runOptions.workers || 1) : 1,
                retryCount: 0,
                passRate: result.summary.total > 0 ? (result.summary.passed / result.summary.total) * 100 : 0,
                failureRate: result.summary.total > 0 ? (result.summary.failed / result.summary.total) * 100 : 0,
                status: result.status,
                trends: {
                    passRateTrend: 0,
                    executionTimeTrend: 0,
                    failureRateTrend: 0,
                    lastExecutions: []
                },
                statistics: {
                    avgScenarioDuration: result.summary.totalScenarios > 0 ? 
                        (result.duration || 0) / result.summary.totalScenarios : 0,
                    avgStepDuration: 0,
                    fastestScenario: { scenarioId: '', name: '', duration: 0, feature: '' },
                    slowestScenario: { scenarioId: '', name: '', duration: 0, feature: '' },
                    mostFailedFeature: '',
                    mostStableFeature: '',
                    flakyTests: []
                },
                scenarios: result.features.flatMap(f => 
                    (f.scenarios || []).map(s => ({
                        scenarioId: s.id || '',
                        name: s.scenarioRef?.name || s.scenario || 'Unknown Scenario',
                        status: this.mapScenarioStatusToTestStatus(s.status || 'failed'),
                        duration: s.duration || 0,
                        retryCount: s.retries || 0,
                        description: s.scenarioRef?.description || '',
                        tags: s.tags || [],
                        line: s.scenarioRef?.line || 0,
                        keyword: 'Scenario',
                        startTime: s.startTime || now,
                        endTime: s.endTime || now,
                        error: s.error ? (typeof s.error === 'string' ? s.error : s.error.message || '') : '',
                        errorStack: s.error && typeof s.error === 'object' ? (s.error.stack || '') : '',
                        steps: (s.steps || []).map(st => ({
                            keyword: st.keyword || 'Given',
                            text: st.text || '',
                            status: this.mapStepStatusToTestStatus(st.status || 'failed'),
                            duration: st.duration || 0,
                            line: st.line || 0,
                            error: st.error ? (typeof st.error === 'string' ? st.error : st.error.message || '') : '',
                            errorStack: st.error && typeof st.error === 'object' ? (st.error.stack || '') : '',
                            attachments: st.attachments || [],
                            // CRITICAL: Include actionDetails from step execution
                            actionDetails: (st as any).actionDetails || null
                        }))
                    }))
                ),
                features: result.features.map(f => ({
                    featureId: f.id || '',
                    feature: f.feature?.name || f.name || '',
                    name: f.feature?.name || f.name || '',
                    description: f.feature?.description || f.description || '',
                    uri: f.feature?.uri || f.uri || '',
                    line: (f.feature as any).line || 0,
                    keyword: 'Feature',
                    tags: f.feature?.tags || f.tags || [],
                    scenarios: (f.scenarios || []).map(s => ({
                        scenarioId: s.id || '',
                        name: s.scenarioRef?.name || s.scenario || 'Unknown Scenario',
                        status: this.mapScenarioStatusToTestStatus(s.status || 'failed'),
                        duration: s.duration || 0,
                        retryCount: s.retries || 0,
                        description: s.scenarioRef?.description || '',
                        tags: s.tags || [],
                        line: s.scenarioRef?.line || 0,
                        keyword: 'Scenario',
                        startTime: s.startTime || now,
                        endTime: s.endTime || now,
                        error: s.error ? (typeof s.error === 'string' ? s.error : s.error.message || '') : '',
                        errorStack: s.error && typeof s.error === 'object' ? (s.error.stack || '') : '',
                        steps: (s.steps || []).map(st => ({
                            keyword: st.keyword || 'Given',
                            text: st.text || '',
                            status: this.mapStepStatusToTestStatus(st.status || 'failed'),
                            duration: st.duration || 0,
                            line: st.line || 0,
                            error: st.error ? (typeof st.error === 'string' ? st.error : st.error.message || '') : '',
                            errorStack: st.error && typeof st.error === 'object' ? (st.error.stack || '') : '',
                            attachments: st.attachments || [],
                            // CRITICAL: Include actionDetails from step execution
                            actionDetails: (st as any).actionDetails || null
                        }))
                    })),
                    status: this.mapFeatureStatusToTestStatus(f.status || 'failed'),
                    startTime: f.startTime || now,
                    endTime: f.endTime || now,
                    duration: f.duration || 0,
                    statistics: {
                        totalScenarios: f.scenarios?.length || 0,
                        passedScenarios: (f.scenarios || []).filter(s => s.status === 'passed').length,
                        failedScenarios: (f.scenarios || []).filter(s => s.status === 'failed').length,
                        skippedScenarios: (f.scenarios || []).filter(s => s.status === 'skipped').length,
                        totalSteps: (f.scenarios || []).reduce((acc, s) => acc + ((s as any).steps || []).length, 0),
                        passedSteps: (f.scenarios || []).reduce((acc, s) => acc + ((s as any).steps || []).filter((st: any) => st.status === 'passed').length, 0),
                        failedSteps: (f.scenarios || []).reduce((acc, s) => acc + ((s as any).steps || []).filter((st: any) => st.status === 'failed').length, 0),
                        skippedSteps: (f.scenarios || []).reduce((acc, s) => acc + ((s as any).steps || []).filter((st: any) => st.status === 'skipped').length, 0),
                        avgScenarioDuration: f.scenarios?.length > 0 ? (f.scenarios.reduce((acc, s) => acc + (s.duration || 0), 0) / f.scenarios.length) : 0,
                        maxScenarioDuration: Math.max(...(f.scenarios || []).map(s => s.duration || 0), 0),
                        minScenarioDuration: f.scenarios?.length > 0 ? Math.min(...f.scenarios.map(s => s.duration || 0)) : 0,
                        passRate: f.scenarios?.length > 0 ? ((f.scenarios.filter(s => s.status === 'passed').length / f.scenarios.length) * 100) : 0
                    },
                    metadata: f.metadata || {}
                })),
                environment: result.environment || 'default'
            },
            features: result.features.map((f, index) => {
                const feature = result.features[index] || f;
                const scenarios = (f.scenarios || []).map(s => ({
                    scenarioId: s.id || '',
                    name: s.scenarioRef?.name || s.scenario || 'Unknown Scenario',
                    status: this.mapScenarioStatusToTestStatus(s.status || 'failed'),
                    duration: s.duration || 0,
                    retryCount: s.retries || 0,
                    // CRITICAL: Include steps with actionDetails for proper reporting
                    steps: (s.steps || []).map(st => ({
                        stepId: st.id || '',
                        keyword: st.keyword || 'Given',
                        text: st.text || '',
                        line: st.line || 0,
                        status: this.mapStepStatusToTestStatus(st.status || 'failed'),
                        startTime: st.startTime || now,
                        endTime: st.endTime || now,
                        duration: st.duration || 0,
                        // CRITICAL: Include actionDetails from step execution
                        actionDetails: (st as any).actionDetails || null,
                        attachments: st.attachments || [],
                        error: st.error ? (typeof st.error === 'string' ? st.error : (st.error.message || '')) : undefined,
                        errorStack: st.error && typeof st.error === 'object' ? (st.error.stack || '') : undefined
                    }))
                }));
                
                return {
                    featureId: f.id || '',
                    feature: f.feature?.name || f.name || '',
                    name: feature.name || f.name || '',
                    description: feature.description || f.description || '',
                    uri: feature.uri || f.uri || '',
                    line: (feature as any).line || 0,
                    keyword: 'Feature',
                    tags: feature.tags || f.tags || [],
                    scenarios: scenarios,
                    status: this.mapFeatureStatusToTestStatus(f.status || 'failed'),
                    startTime: f.startTime || now,
                    endTime: f.endTime || now,
                    duration: f.duration || 0,
                    statistics: {
                        totalScenarios: scenarios.length,
                        passedScenarios: scenarios.filter(s => s.status === 'passed').length,
                        failedScenarios: scenarios.filter(s => s.status === 'failed').length,
                        skippedScenarios: scenarios.filter(s => s.status === 'skipped').length,
                        totalSteps: scenarios.reduce((acc, s) => acc + ((s as any).steps || []).length, 0),
                        passedSteps: scenarios.reduce((acc, s) => acc + ((s as any).steps || []).filter((st: any) => st.status === 'passed').length, 0),
                        failedSteps: scenarios.reduce((acc, s) => acc + ((s as any).steps || []).filter((st: any) => st.status === 'failed').length, 0),
                        skippedSteps: scenarios.reduce((acc, s) => acc + ((s as any).steps || []).filter((st: any) => st.status === 'skipped').length, 0),
                        avgScenarioDuration: scenarios.length > 0 ? scenarios.reduce((acc, s) => acc + (s.duration || 0), 0) / scenarios.length : 0,
                        maxScenarioDuration: Math.max(...scenarios.map(s => s.duration || 0), 0),
                        minScenarioDuration: scenarios.length > 0 ? Math.min(...scenarios.map(s => s.duration || 0)) : 0,
                        passRate: scenarios.length > 0 ? (scenarios.filter(s => s.status === 'passed').length / scenarios.length) * 100 : 0
                    },
                    metadata: {}
                } as unknown as FeatureReport;
            }),
            scenarios: result.features.flatMap(f => 
                (f.scenarios || []).map(s => ({
                    scenarioId: s.id || '',
                    scenario: s.scenario || '',
                    name: s.scenario || '',
                    description: s.scenarioRef?.description || '',
                    feature: f.feature?.name || f.name || '',
                    featureId: f.id || '',
                    uri: f.uri || '',
                    line: s.scenarioRef?.line || 0,
                    keyword: 'Scenario',
                    tags: s.tags || [],
                    steps: (s.steps || []).map(st => ({
                        stepId: st.id || '',
                        keyword: st.keyword || 'Given',
                        text: st.text || '',
                        line: st.line || 0,
                        status: this.mapStepStatusToTestStatus(st.status || 'failed'),
                        startTime: st.startTime || now,
                        endTime: st.endTime || now,
                        duration: st.duration || 0,
                        result: {
                            status: this.mapStepStatusToTestStatus(st.status || 'failed'),
                            duration: st.duration || 0,
                            error: st.error ? {
                                id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                timestamp: now,
                                type: 'assertion' as any,
                                message: typeof st.error === 'string' ? st.error : (st.error.message || ''),
                                stack: typeof st.error === 'object' ? (st.error.stack || '') : '',
                                location: {
                                    feature: f.feature?.name || f.name || '',
                                    scenario: s.scenario || '',
                                    step: st.text || '',
                                    line: st.line || 0,
                                    file: f.uri || ''
                                },
                                context: {
                                    browser: this.runOptions.browser || 'chromium',
                                    viewport: `${ConfigurationManager.getInt('VIEWPORT_WIDTH', 1920)}x${ConfigurationManager.getInt('VIEWPORT_HEIGHT', 1080)}`,
                                    url: '',
                                    additionalInfo: {}
                                },
                                similar: [],
                                severity: 'high' as any
                            } : undefined
                        },
                        embeddings: [],
                        actions: [],
                        attachments: st.attachments || [],
                        // CRITICAL: Include actionDetails from step execution
                        actionDetails: (st as any).actionDetails || null
                    })),
                    status: this.mapScenarioStatusToTestStatus(s.status || 'failed'),
                    startTime: s.startTime || now,
                    endTime: s.endTime || now,
                    duration: s.duration || 0,
                    retryCount: 0,
                    hooks: [],
                    evidence: {
                        screenshots: [],
                        video: '',
                        trace: '',
                        networkHAR: '',
                        consoleLogs: []
                    },
                    error: s.error ? {
                        id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        timestamp: now,
                        type: 'assertion' as any,
                        message: typeof s.error === 'string' ? s.error : (s.error.message || ''),
                        stack: typeof s.error === 'object' ? (s.error.stack || '') : '',
                        location: {
                            feature: f.feature?.name || f.name || '',
                            scenario: s.scenario || '',
                            step: '',
                            line: s.scenarioRef?.line || 0,
                            file: f.uri || ''
                        },
                        context: {
                            browser: this.runOptions.browser || 'chromium',
                            viewport: `${ConfigurationManager.getInt('VIEWPORT_WIDTH', 1920)}x${ConfigurationManager.getInt('VIEWPORT_HEIGHT', 1080)}`,
                            url: '',
                            additionalInfo: {}
                        },
                        similar: [],
                        severity: 'high' as any
                    } : undefined,
                    context: {
                        browser: this.runOptions.browser || 'chromium',
                        viewport: {
                            width: ConfigurationManager.getInt('VIEWPORT_WIDTH', 1920),
                            height: ConfigurationManager.getInt('VIEWPORT_HEIGHT', 1080)
                        },
                        userAgent: ''
                    }
                }) as ScenarioReport)
            ),
            evidence: {
                screenshots: [],
                videos: [],
                traces: [],
                networkLogs: [],
                consoleLogs: collectedLogs,
                performanceLogs: [],
                downloads: [],
                uploads: []
            },
            metrics: {
                execution: {
                    totalDuration: result.duration || 0,
                    setupDuration: 0,
                    testDuration: result.duration || 0,
                    teardownDuration: 0,
                    avgScenarioDuration: result.summary.totalScenarios > 0 ? 
                        (result.duration || 0) / result.summary.totalScenarios : 0,
                    avgStepDuration: 0,
                    parallelEfficiency: this.runOptions.parallel ? 
                        (this.runOptions.workers || 1) * 0.8 : 1,
                    queueTime: 0,
                    retryRate: 0
                } as ExecutionMetrics,
                browser: {
                    pageLoadTime: 0,
                    domContentLoaded: 0,
                    firstPaint: 0,
                    firstContentfulPaint: 0,
                    largestContentfulPaint: 0,
                    firstInputDelay: 0,
                    timeToInteractive: 0,
                    totalBlockingTime: 0,
                    cumulativeLayoutShift: 0,
                    memoryUsage: {
                        usedJSHeapSize: 0,
                        totalJSHeapSize: 0,
                        jsHeapSizeLimit: 0
                    },
                    consoleErrors: 0,
                    consoleWarnings: 0
                } as BrowserMetrics,
                network: {
                    totalRequests: 0,
                    failedRequests: 0,
                    cachedRequests: 0,
                    avgResponseTime: 0,
                    totalDataTransferred: 0,
                    totalDataSent: 0,
                    totalDataReceived: 0,
                    slowestRequest: {
                        requestId: '',
                        url: '',
                        method: '',
                        status: 0,
                        responseTime: 0,
                        size: 0,
                        type: '',
                        startTime: now,
                        endTime: now,
                        headers: {},
                        timing: {
                            dns: 0,
                            connect: 0,
                            ssl: 0,
                            send: 0,
                            wait: 0,
                            receive: 0,
                            total: 0
                        }
                    },
                    cacheHitRate: 0,
                    requestsByType: {},
                    requestsByDomain: {},
                    successfulRequests: 0,
                    totalBytesTransferred: 0,
                    totalTime: 0,
                    averageResponseTime: 0,
                    successRate: 0,
                    errorRate: 0,
                    thirdPartyRequests: 0,
                    blockedRequests: 0,
                    resourceBreakdown: {},
                    statusCodes: {},
                    domains: {},
                    resourceTypes: {},
                    protocols: {},
                    thirdPartyCategories: {},
                    pageUrl: ''
                } as NetworkMetrics,
                system: {
                    cpuUsage: 0,
                    memoryUsage: 0,
                    processCount: 1
                } as SystemMetrics
            }
        } as ReportData;
    }

    private collectLogsFromEvidence(): any[] {
        const logger = ActionLogger.getInstance();
        const logs: any[] = [];
        
        try {
            const fs = require('fs');
            const path = require('path');
            
            const actionLogs = logger.getAllLogs();
            actionLogs.forEach(log => {
                if (log && log.message && log.timestamp) {
                    logs.push({
                        timestamp: log.timestamp,
                        level: log.level || 'info',
                        category: this.extractLogCategory(log.message) || 'general',
                        message: this.cleanLogMessage(log.message),
                        beautifiedMessage: this.beautifyLogMessage(log.message),
                        context: {
                            source: 'action-logger',
                            id: log.id || 'unknown'
                        }
                    });
                }
            });
            
            const recentLogs = logger.getRecentLogs(500);
            recentLogs.forEach(log => {
                if (log && log.message && log.timestamp) {
                    const exists = logs.some(existingLog => 
                        existingLog.timestamp === log.timestamp && 
                        existingLog.message === log.message
                    );
                    
                    if (!exists) {
                        logs.push({
                            timestamp: log.timestamp,
                            level: log.level || 'info',
                            category: this.extractLogCategory(log.message) || 'general',
                            message: this.cleanLogMessage(log.message),
                            beautifiedMessage: this.beautifyLogMessage(log.message),
                            context: {
                                source: 'action-logger-buffer',
                                id: log.id || 'unknown'
                            }
                        });
                    }
                }
            });
            
            const reportsDir = './reports';
            if (fs.existsSync(reportsDir)) {
                const reportDirs = fs.readdirSync(reportsDir)
                    .filter((dir: string) => dir.startsWith('report-'))
                    .sort()
                    .reverse()
                    .slice(0, 2);
                
                for (const reportDir of reportDirs) {
                    const evidenceDir = path.join(reportsDir, reportDir, 'evidence');
                    if (fs.existsSync(evidenceDir)) {
                        const consoleLogsPath = path.join(evidenceDir, 'console-logs.json');
                        if (fs.existsSync(consoleLogsPath)) {
                            try {
                                const logContent = fs.readFileSync(consoleLogsPath, 'utf8');
                                const consoleLogs = JSON.parse(logContent);
                                
                                if (Array.isArray(consoleLogs)) {
                                    const processedLogs = consoleLogs
                                        .filter((log: any) => log && log.message)
                                        .map((log: any) => ({
                                            timestamp: log.timestamp || new Date().toISOString(),
                                            level: this.extractLogLevel(log.message) || 'info',
                                            category: this.extractLogCategory(log.message) || 'general',
                                            message: this.cleanLogMessage(log.message),
                                            beautifiedMessage: this.beautifyLogMessage(log.message),
                                            context: {
                                                source: 'console-logs',
                                                reportDir: reportDir
                                            }
                                        }))
                                        .filter((log: any) => log.message && log.message.trim().length > 0);
                                    
                                    logs.push(...processedLogs);
                                    logger.info(`🔥 LOG COLLECTION: Found ${processedLogs.length} logs in ${consoleLogsPath}`);
                                    break;
                                }
                            } catch (error) {
                                logger.warn(`🔥 LOG COLLECTION: Failed to parse ${consoleLogsPath}: ${(error as Error).message}`);
                            }
                        }
                    }
                }
            }
            
            if (logs.length === 0) {
                const now = new Date().toISOString();
                logs.push({
                    timestamp: now,
                    level: 'info',
                    category: 'system',
                    message: 'Test execution started',
                    beautifiedMessage: '🚀 Test execution started',
                    context: { source: 'synthetic' }
                });
                
                logs.push({
                    timestamp: new Date(Date.now() + 1000).toISOString(),
                    level: 'info',
                    category: 'system',
                    message: 'Framework initialized successfully',
                    beautifiedMessage: '✅ Framework initialized successfully',
                    context: { source: 'synthetic' }
                });
            }
            
            logger.info(`🔥 LOG COLLECTION: Total logs collected: ${logs.length}`);
            
        } catch (error) {
            logger.error(`🔥 LOG COLLECTION: Error collecting logs: ${(error as Error).message}`);
            
            const now = new Date().toISOString();
            logs.push({
                timestamp: now,
                level: 'warn',
                category: 'system',
                message: 'Log collection encountered an error, showing minimal logs',
                beautifiedMessage: '⚠️ Log collection encountered an error, showing minimal logs',
                context: { source: 'error-fallback', error: (error as Error).message }
            });
        }
        
        return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    private extractLogLevel(message: string): string | null {
        if (!message) return null;
        
        const levelMatches = message.match(/\[(ERROR|WARN|INFO|DEBUG|TRACE)\]/i);
        if (levelMatches && levelMatches[1]) {
            return levelMatches[1].toLowerCase();
        }
        
        if (message.toLowerCase().includes('error')) return 'error';
        if (message.toLowerCase().includes('warn')) return 'warn';
        if (message.toLowerCase().includes('debug')) return 'debug';
        
        return 'info';
    }

    private extractLogCategory(message: string): string | null {
        if (!message) return null;
        
        const categoryMatches = message.match(/\[([A-Z_][A-Z0-9_]*)\]/g);
        if (categoryMatches && categoryMatches.length > 1) {
            const category = categoryMatches[1] ? categoryMatches[1].replace(/[\[\]]/g, '').toLowerCase() : 'general';
            return category;
        }
        
        if (message.includes('Report Generation')) return 'reports';
        if (message.includes('Test Execution')) return 'execution';
        if (message.includes('Framework')) return 'framework';
        if (message.includes('Browser')) return 'browser';
        if (message.includes('ActionLogger')) return 'actions';
        if (message.includes('Step')) return 'steps';
        if (message.includes('Scenario')) return 'scenarios';
        
        return 'general';
    }

    private cleanLogMessage(message: string): string {
        if (!message) return '';
        
        return message
            .replace(/\u001b\[[0-9;]*m/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*Z?\s*/, '')
            .replace(/^\[(ERROR|WARN|INFO|DEBUG|TRACE)\]\s*/i, '')
            .replace(/^\[[A-Z_][A-Z0-9_]*\]\s*/i, '')
            .trim();
    }

    private beautifyLogMessage(message: string): string {
        const cleaned = this.cleanLogMessage(message);
        
        if (cleaned.includes('✅')) return cleaned;
        if (cleaned.includes('❌')) return cleaned;
        if (cleaned.includes('⚠️')) return cleaned;
        if (cleaned.includes('🔥')) return cleaned;
        if (cleaned.includes('📊')) return cleaned;
        
        if (cleaned.toLowerCase().includes('error') || cleaned.toLowerCase().includes('failed')) {
            return `❌ ${cleaned}`;
        }
        if (cleaned.toLowerCase().includes('warn')) {
            return `⚠️ ${cleaned}`;
        }
        if (cleaned.toLowerCase().includes('success') || cleaned.toLowerCase().includes('completed')) {
            return `✅ ${cleaned}`;
        }
        if (cleaned.toLowerCase().includes('debug')) {
            return `🔍 ${cleaned}`;
        }
        if (cleaned.toLowerCase().includes('report')) {
            return `📊 ${cleaned}`;
        }
        
        return cleaned;
    }

    private async emergencyCleanup(): Promise<void> {
        try {
            if (BrowserManager.getInstance()) {
                await BrowserManager.getInstance().close();
            }

            const logger = ActionLogger.getInstance();
            logger.info('Emergency cleanup completed');

        } catch (error) {
            console.error('Emergency cleanup failed:', error);
        }
    }

    private async expandScenarioOutlines(features: Feature[]): Promise<Feature[]> {
        const logger = ActionLogger.getInstance();
        const examplesParser = ExamplesParser.getInstance();
        const expandedFeatures: Feature[] = [];

        for (const feature of features) {
            const expandedScenarios: Scenario[] = [];
            
            for (const scenario of feature.scenarios) {
                if (scenario.type === 'scenario_outline' && scenario.examples && scenario.examples.length > 0) {
                    logger.debug(`Expanding scenario outline: "${scenario.name}" with ${scenario.examples.length} examples tables`);
                    
                    try {
                        const expanded = examplesParser.expandScenarioOutline(scenario as any);
                        expandedScenarios.push(...expanded);
                        logger.debug(`Expanded to ${expanded.length} scenarios`);
                    } catch (error) {
                        logger.error(`Failed to expand scenario outline "${scenario.name}": ${(error as Error).message}`);
                        expandedScenarios.push(scenario);
                    }
                } else {
                    expandedScenarios.push(scenario);
                }
            }
            
            expandedFeatures.push({
                ...feature,
                scenarios: expandedScenarios
            });
        }
        
        return expandedFeatures;
    }

    private applyFilters(features: Feature[], options: RunOptions): Feature[] {
        const logger = ActionLogger.getInstance();
        logger.debug(`Applying filters to ${features.length} features`);
        
        logger.debug(`🔍 FILTER DEBUG: options keys = ${JSON.stringify(Object.keys(options))}`);
        logger.debug(`🔍 FILTER DEBUG: options['features'] = ${JSON.stringify(options['features'])}`);
        logger.debug(`🔍 FILTER DEBUG: options['featurePaths'] = ${JSON.stringify(options['featurePaths'])}`);
        logger.debug(`🔍 FILTER DEBUG: options object = ${JSON.stringify(options, null, 2)}`);
        
        let filtered = [...features];

        
        logger.info(`Feature pattern filtering DISABLED - all ${features.length} discovered features will be processed`);

        if (options.tags) {
            logger.debug(`Filtering by tags: ${options.tags}`);
            const tagFilter = new TagFilter(options.tags);
            
            filtered = filtered.map(feature => {
                const originalScenarios = feature.scenarios.length;
                const filteredScenarios = feature.scenarios.filter(scenario => 
                    tagFilter.matches([...feature.tags, ...scenario.tags])
                );
                
                logger.debug(`Feature "${feature.name}": ${originalScenarios} -> ${filteredScenarios.length} scenarios after tag filtering`);
                
                return {
                    ...feature,
                    scenarios: filteredScenarios
                };
            }).filter(feature => feature.scenarios.length > 0);
            
            logger.info(`Tag filtering: ${filtered.reduce((sum, f) => sum + f.scenarios.length, 0)} scenarios remaining`);
        }

        if (options['scenarios'] && options['scenarios'].length > 0) {
            logger.debug(`Filtering by scenario patterns: ${JSON.stringify(options['scenarios'])}`);
            
            filtered = filtered.map(feature => {
                const originalScenarios = feature.scenarios.length;
                const filteredScenarios = feature.scenarios.filter(scenario =>
                    options['scenarios']!.some((pattern: string) => 
                        scenario.name.includes(pattern)
                    )
                );
                
                logger.debug(`Feature "${feature.name}": ${originalScenarios} -> ${filteredScenarios.length} scenarios after scenario name filtering`);
                
                return {
                    ...feature,
                    scenarios: filteredScenarios
                };
            }).filter(feature => feature.scenarios.length > 0);
            
            logger.info(`Scenario name filtering: ${filtered.reduce((sum, f) => sum + f.scenarios.length, 0)} scenarios remaining`);
        }

        const totalScenariosAfterFiltering = filtered.reduce((sum, f) => sum + f.scenarios.length, 0);
        logger.info(`Final filtering result: ${filtered.length} features, ${totalScenariosAfterFiltering} scenarios`);
        
        if (totalScenariosAfterFiltering > 0) {
            logger.info('Features and scenarios to execute:');
            filtered.forEach(feature => {
                logger.info(`  Feature: ${feature.name} (${feature.scenarios.length} scenarios)`);
                feature.scenarios.forEach(scenario => {
                    logger.info(`    - ${scenario.name}`);
                });
            });
        } else {
            logger.warn('No scenarios match the filtering criteria!');
            logger.warn('Available features:');
            features.forEach(feature => {
                logger.warn(`  Feature: ${feature.name} (URI: ${feature.uri})`);
                feature.scenarios.forEach(scenario => {
                    logger.warn(`    - ${scenario.name} (Tags: ${scenario.tags.join(', ')})`);
                });
            });
        }

        return filtered;
    }

    private updateSummary(summary: ExecutionSummary, featureResult: any): void {
        // CRITICAL FIX: Increment totalFeatures instead of setting to 1
        summary.totalFeatures++;
        
        for (const scenarioResult of featureResult.scenarios) {
            summary.total++;
            summary.totalScenarios++;
            switch (scenarioResult.status) {
                case 'passed':
                    summary.passed++;
                    break;
                case 'failed':
                    summary.failed++;
                    break;
                case 'skipped':
                    summary.skipped++;
                    break;
                case 'pending':
                    summary.pending++;
                    break;
            }
            
            if (scenarioResult.steps && Array.isArray(scenarioResult.steps)) {
                for (const step of scenarioResult.steps) {
                    (summary as any).totalSteps = ((summary as any).totalSteps || 0) + 1;
                    
                    switch (step.status) {
                        case 'passed':
                            (summary as any).passedSteps = ((summary as any).passedSteps || 0) + 1;
                            break;
                        case 'failed':
                            (summary as any).failedSteps = ((summary as any).failedSteps || 0) + 1;
                            break;
                        case 'skipped':
                        case 'pending':
                        case 'undefined':
                            (summary as any).skippedSteps = ((summary as any).skippedSteps || 0) + 1;
                            break;
                    }
                }
            }
        }
    }

    private logExecutionPlan(plan: ExecutionPlan): void {
        console.log('\n=== Execution Plan ===');
        console.log(`Total Features: ${plan.totalFeatures}`);
        console.log(`Total Scenarios: ${plan.totalScenarios}`);
        console.log(`Estimated Duration: ${plan.estimatedDuration}ms`);
        console.log('\nFeatures to execute:');
        
        for (const feature of plan.features) {
            console.log(`\n  ${feature.name}`);
            for (const scenario of feature.scenarios) {
                console.log(`    - ${scenario.name}`);
            }
        }
        console.log('\n');
    }

    private logExecutionSummary(summary: ExecutionSummary): void {
        console.log('\n=== Execution Summary ===');
        console.log(`Total Scenarios: ${summary.totalScenarios || summary.total}`);
        const total = summary.totalScenarios || summary.total || 1;
        console.log(`Passed: ${summary.passed} (${total > 0 ? (summary.passed / total * 100).toFixed(1) : '0.0'}%)`);
        console.log(`Failed: ${summary.failed} (${total > 0 ? (summary.failed / total * 100).toFixed(1) : '0.0'}%)`);
        console.log(`Skipped: ${summary.skipped}`);
        console.log(`Pending: ${summary.pending}`);
        console.log('\n');
    }

    private async openReport(reportPath: string): Promise<void> {
        const open = await import('open');
        await open.default(reportPath);
    }

    private async cleanupTempFiles(): Promise<void> {
        const fs = await import('fs/promises');

        const tempDirs = [
            './temp',
            './downloads',
            './screenshots/temp'
        ];

        for (const dir of tempDirs) {
            try {
                await fs.rmdir(dir, { recursive: true });
            } catch (error) {
            }
        }
    }

    public abort(): void {
        const logger = ActionLogger.getInstance();
        logger.warn('Aborting test execution');
        this.abortController.abort();
        this.state = 'stopped';
    }

    public getState(): RunnerState {
        return this.state;
    }

    public getProgress(): any {
        return this.executionMonitor.getExecutionSnapshot();
    }

    private mapScenarioStatusToTestStatus(status: ScenarioStatus | string): TestStatus {
        switch (status) {
            case 'passed':
                return TestStatus.PASSED;
            case 'failed':
                return TestStatus.FAILED;
            case 'skipped':
            case 'pending':
                return TestStatus.SKIPPED;
            default:
                return TestStatus.FAILED;
        }
    }

    private mapStepStatusToTestStatus(status: StepStatus | string): TestStatus {
        switch (status) {
            case 'passed':
                return TestStatus.PASSED;
            case 'failed':
                return TestStatus.FAILED;
            case 'skipped':
            case 'pending':
            case 'undefined':
            case 'ambiguous':
                return TestStatus.SKIPPED;
            default:
                return TestStatus.FAILED;
        }
    }

    private mapFeatureStatusToTestStatus(status: FeatureStatus | string): TestStatus {
        switch (status) {
            case 'passed':
                return TestStatus.PASSED;
            case 'failed':
                return TestStatus.FAILED;
            case 'skipped':
            case 'pending':
                return TestStatus.SKIPPED;
            default:
                return TestStatus.FAILED;
        }
    }

    private createFailedExecutionResult(startTime: Date, errorMessage: string): ExecutionResult {
        return {
            startTime,
            endTime: new Date(),
            duration: Date.now() - startTime.getTime(),
            summary: {
                total: 0,
                totalScenarios: 0,
                totalFeatures: 0,
                totalSteps: 0,
                passedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                pending: 0,
                duration: Date.now() - startTime.getTime()
            },
            features: [],
            environment: this.runOptions?.environment || 'unknown',
            status: ExecutionStatus.FAILED,
            timestamp: startTime,
            errors: [new Error(errorMessage)],
            executionStats: {
                framework: 'CS Test Automation Framework',
                version: '1.0.0',
                executionId: `exec_${Date.now()}`,
                error: errorMessage,
                status: 'failed'
            }
        };
    }

    private createEmptyExecutionResult(startTime: Date, message: string): ExecutionResult {
        return {
            startTime,
            endTime: new Date(),
            duration: Date.now() - startTime.getTime(),
            summary: {
                total: 0,
                totalScenarios: 0,
                totalFeatures: 0,
                totalSteps: 0,
                passedSteps: 0,
                failedSteps: 0,
                skippedSteps: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                pending: 0,
                duration: Date.now() - startTime.getTime()
            },
            features: [],
            environment: this.runOptions?.environment || 'unknown',
            status: ExecutionStatus.PASSED,
            timestamp: startTime,
            executionStats: {
                framework: 'CS Test Automation Framework',
                version: '1.0.0',
                executionId: `exec_${Date.now()}`,
                message: message,
                status: 'empty'
            }
        };
    }
}

class TagFilter {
    private expression: string;

    constructor(expression: string) {
        this.expression = expression;
    }

    public matches(tags: string[]): boolean {
        const normalizedTags = tags.map(t => t.toLowerCase());
        const normalizedExpression = this.expression.toLowerCase();

        if (normalizedExpression.includes(' and ')) {
            const parts = normalizedExpression.split(' and ').map(p => p.trim());
            return parts.every(part => this.evaluatePart(part, normalizedTags));
        } else if (normalizedExpression.includes(' or ')) {
            const parts = normalizedExpression.split(' or ').map(p => p.trim());
            return parts.some(part => this.evaluatePart(part, normalizedTags));
        } else {
            return this.evaluatePart(normalizedExpression, normalizedTags);
        }
    }

    private evaluatePart(part: string, tags: string[]): boolean {
        if (part.startsWith('not ')) {
            const tag = part.substring(4).trim();
            return !tags.includes(tag);
        } else {
            return tags.includes(part);
        }
    }
}
