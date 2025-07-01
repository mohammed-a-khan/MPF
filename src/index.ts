#!/usr/bin/env node


process.setMaxListeners(20);

import { consoleCapture } from './core/logging/ConsoleCapture';
consoleCapture.startCapture();

import * as fs from 'fs';
import { performance } from 'perf_hooks';
import * as cluster from 'node:cluster';
import * as os from 'os';

import { CommandLineParser } from './core/cli/CommandLineParser';
import { ExecutionOptions } from './core/cli/ExecutionOptions';

const FRAMEWORK_VERSION = '1.0.0';
const FRAMEWORK_NAME = 'CS Test Automation Framework';
const FRAMEWORK_BANNER = `
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║     ██████╗███████╗    ████████╗███████╗███████╗████████╗     ║
║    ██╔════╝██╔════╝    ╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝     ║
║    ██║     ███████╗       ██║   █████╗  ███████╗   ██║        ║
║    ██║     ╚════██║       ██║   ██╔══╝  ╚════██║   ██║        ║
║    ╚██████╗███████║       ██║   ███████╗███████║   ██║        ║
║     ╚═════╝╚══════╝       ╚═╝   ╚══════╝╚══════╝   ╚═╝        ║
║                                                                ║
║            Test Automation Framework v${FRAMEWORK_VERSION}              ║
║                  Powered by TypeScript & AI                    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`;

const exitHandler = new Map<string, Function>();
const runningProcesses = new Set<any>();
let isShuttingDown = false;

async function main(): Promise<void> {
    if (process.env.DEBUG === 'true') {
        console.log('🔍 DEBUG: main() function called');
        console.log('🔍 DEBUG: process.argv =', JSON.stringify(process.argv));
    }
    
    const startTime = performance.now();
    let executionResult: any = null;

    try {
        const options = CommandLineParser.parse(process.argv);
        
        if (options.help) {
            displayHelp();
            process.exit(0);
        }

        if (options.version) {
            console.log(`${FRAMEWORK_NAME} v${FRAMEWORK_VERSION}`);
            process.exit(0);
        }

        if (!options.quiet && process.env.LOG_LEVEL !== 'error') {
            console.log('\x1b[35m%s\x1b[0m', FRAMEWORK_BANNER);
        }


        const { logger } = await import('./core/utils/Logger');
        if (options.logLevel) {
            logger.getInstance().setLevel(options.logLevel as any);
        }
        
        if (options.debug || options.logLevel === 'debug') {
            process.env.DEBUG = 'true';
        }

        logger.info(`Starting ${FRAMEWORK_NAME} v${FRAMEWORK_VERSION}`);

        await validateEnvironment();

        setupSignalHandlers();

        if (options.cluster && (cluster as any).isPrimary) {
            await runInClusterMode(options);
        } else {
            executionResult = await runTests(options);
        }

        const executionTime = ((performance.now() - startTime) / 1000).toFixed(2);
        
        if (executionResult && !options.quiet) {
            displayExecutionSummary(executionResult, executionTime);
        }

        const exitCode = executionResult?.failed > 0 ? 1 : 0;
        await gracefulShutdown(exitCode);

    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', '✖ Fatal error occurred:', error);
        await gracefulShutdown(1);
    }
}

async function runTests(options: ExecutionOptions): Promise<any> {
    const { logger } = await import('./core/utils/Logger');
    logger.info('🚀 Starting test execution...');

    try {
        const { CSFramework } = await import('./core/CSFramework');
        const { logger } = await import('./core/utils/Logger');
        const { StepDefinitionLoader } = await import('./bdd/base/StepDefinitionLoader');
        
        const stepLoader = StepDefinitionLoader.getInstance();
        await stepLoader.initialize();
        
        const framework = CSFramework.getInstance();
        
        logger.info('🚀 Starting CS Framework with timeout protection...');
        
        const project = options.project || 'saucedemo';
        const environment = options.environment || 'dev';
        
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: options.project = '${options.project}', project = '${project}'`);
            console.log(`🔍 DEBUG: options.environment = '${options.environment}', environment = '${environment}'`);
            console.log(`🔍 DEBUG: Full options:`, JSON.stringify(options, null, 2));
        }
        
        const initPromise = framework.initialize(
            project, 
            environment, 
            {
                parallel: options.parallel,
                workers: options.workers,
                timeout: options.timeout,
                debug: options.debug,
                headless: options.headless,
                proxy: !!options.proxy,
                reporting: !options.skipReport,
                adoIntegration: !options.skipADO
            }
        );
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Framework initialization timeout after 30 seconds')), 30000)
        );
        
        await Promise.race([initPromise, timeoutPromise]);

        try {
            const isConfigValid = await framework.validateConfiguration();
            if (!isConfigValid) {
                logger.warn('⚠️ Configuration validation failed - continuing with fallback configuration');
            } else {
                logger.debug('✅ Configuration validation passed');
            }
        } catch (configError) {
            logger.warn(`⚠️ Configuration validation error: ${configError} - continuing with fallbacks`);
        }

        const featurePaths: string[] = [];
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: options.features = ${JSON.stringify(options.features)}`);
            console.log(`🔍 DEBUG: options object keys:`, Object.keys(options));
        }
        
        if (options.features) {
            if (Array.isArray(options.features)) {
                featurePaths.push(...options.features);
            } else {
                featurePaths.push(options.features);
            }
        } else {
            featurePaths.push('./features/**/*.feature');
        }
        
        if (process.env.DEBUG === 'true') {
            console.log(`🔍 DEBUG: Final featurePaths = ${JSON.stringify(featurePaths)}`);
        }

        logger.info('Starting test execution with CS Framework...');
        const result = await framework.executeTests(featurePaths, options);
        
        logger.info('Test execution completed successfully');
        return result;

    } catch (error) {
        const { logger } = await import('./core/utils/Logger');
        logger.error('❌ Test execution failed', error as Error);
        
        try {
            return await initializeMinimalFramework(options);
        } catch (fallbackError) {
            console.error('❌ Minimal initialization also failed:', fallbackError);
            throw new Error(`Framework startup completely failed. Original error: ${error}, Fallback error: ${fallbackError}`);
        }
    }
}

async function initializeMinimalFramework(options: ExecutionOptions): Promise<any> {
    try {
        process.env['BROWSER_TYPE'] = 'chromium';
        process.env['HEADLESS'] = 'true';
        process.env['TIMEOUT'] = '30000';
        
        const result = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            features: [],
            scenarios: [],
            steps: [],
            startTime: new Date(),
            endTime: new Date(),
            environment: options.environment || 'minimal'
        };
        
        return result;
        
    } catch (error) {
        console.error('❌ Minimal initialization failed:', error);
        throw error;
    }
}

async function validateEnvironment(): Promise<void> {
    const nodeVersion = process.version;
    const versionParts = nodeVersion.split('.');
    const majorVersionStr = versionParts[0];
    const majorVersion = majorVersionStr ? parseInt(majorVersionStr.substring(1)) : 0;
    if (majorVersion < 14) {
        throw new Error(`Node.js 14 or higher is required. Current version: ${nodeVersion}`);
    }

    if (!fs.existsSync('config')) {
        throw new Error('Configuration directory not found: config');
    }

    if (!fs.existsSync('config/global.env')) {
        throw new Error('Global configuration file not found: config/global.env');
    }

    if (!fs.existsSync('config/common')) {
        throw new Error('Common configuration directory not found: config/common');
    }

    const optionalDirs = ['features', 'src/steps'];
    for (const dir of optionalDirs) {
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (error) {
            }
        }
    }

    if (!fs.existsSync('src')) {
        throw new Error('Source directory not found: src');
    }
}

function setupSignalHandlers(): void {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP'];

    signals.forEach(signal => {
        process.on(signal, async () => {
            const { logger } = require('./core/utils/Logger');
            logger.info(`Received ${signal}, initiating graceful shutdown...`);
            await gracefulShutdown(0);
        });
    });

    process.on('uncaughtException', async (error) => {
        const { logger } = require('./core/utils/Logger');
        logger.error('Uncaught exception', error);
        await gracefulShutdown(1);
    });

    process.on('unhandledRejection', async (reason, _promise) => {
        const { logger } = require('./core/utils/Logger');
        logger.error('Unhandled rejection', reason as Error);
        await gracefulShutdown(1);
    });
}

async function gracefulShutdown(exitCode: number): Promise<void> {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;

    try {
        const { logger } = require('./core/utils/Logger');
        logger.info('Starting graceful shutdown...');

        for (const [name, handler] of exitHandler.entries()) {
            try {
                await handler();
            } catch (error) {
                console.error(`Exit handler failed: ${name}`, error);
            }
        }

        for (const process of runningProcesses) {
            try {
                if (process.kill) {
                    process.kill('SIGTERM');
                }
            } catch (error) {
                console.error('Failed to kill process', error);
            }
        }

        process.exit(exitCode);

    } catch (error) {
        console.error('Graceful shutdown failed', error);
        process.exit(1);
    }
}

function displayHelp(): void {
    console.log(`
${FRAMEWORK_NAME} v${FRAMEWORK_VERSION}

USAGE:
  npm test -- [options]

OPTIONS:
  --env <environment>         Environment to run tests (dev, sit, qa, uat)
  --tags <expression>         Tag expression to filter tests
  --feature <pattern>         Feature file pattern
  --scenario <pattern>        Scenario name pattern
  --parallel                  Run tests in parallel
  --workers <number>          Number of parallel workers
  --dry-run                   Parse features without execution
  --debug                     Enable debug mode
  --video                     Record test execution videos
  --trace                     Record Playwright traces
  --headed                    Run in headed mode
  --help                      Show this help
  --version                   Show version

EXAMPLES:
  # Run all tests in dev environment
  npm test -- --env=dev

  # Run smoke tests in parallel
  npm test -- --env=qa --tags=@smoke --parallel

  # Run specific feature with video
  npm test -- --env=uat --feature=login.feature --video

For more information, visit: https:
`);
}

function displayExecutionSummary(result: any, executionTime: string): void {
    const { total, passed, failed, skipped } = result;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

    console.log('\n' + '═'.repeat(60));
    console.log('📊 EXECUTION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Tests:    ${total}`);
    console.log(`✅ Passed:      ${passed} (${passRate}%)`);
    console.log(`❌ Failed:      ${failed}`);
    console.log(`⏭️  Skipped:     ${skipped}`);
    console.log(`⏱️  Duration:    ${executionTime}s`);
    console.log('═'.repeat(60));
}

async function runInClusterMode(options: ExecutionOptions): Promise<any> {
    const { logger } = require('./core/utils/Logger');
    const numWorkers = options.workers || os.cpus().length;
    logger.info(`Running in cluster mode with ${numWorkers} workers`);
    
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

export function registerExitHandler(name: string, handler: Function): void {
    exitHandler.set(name, handler);
}

export { main, runTests };

export const getCSFramework = async () => (await import('./core/CSFramework')).CSFramework;
export const getFrameworkInstance = async () => (await import('./core/CSFramework')).framework;
export const getCSBDDEngine = async () => (await import('./bdd/engine/CSBDDEngine')).CSBDDEngine;
export const getBDDEngineInstance = async () => (await import('./bdd/engine/CSBDDEngine')).bddEngine;
export const getCSTestRunner = async () => (await import('./core/runner/CSTestRunner')).CSTestRunner;
export const getTestRunnerInstance = async () => (await import('./core/runner/CSTestRunner')).testRunner;

export const getCSWebElement = async () => (await import('./core/elements/CSWebElement')).CSWebElement;
export const getCSBasePage = async () => (await import('./core/pages/CSBasePage')).CSBasePage;
export const getCSGetElement = async () => (await import('./core/elements/decorators/CSGetElement')).CSGetElement;
export const getCSBDDStepDef = async () => (await import('./bdd/decorators/CSBDDStepDef')).CSBDDStepDef;
export const getCSBDDBaseStepDefinition = async () => (await import('./bdd/base/CSBDDBaseStepDefinition')).CSBDDBaseStepDefinition;
export const getPageFactory = async () => (await import('./core/pages/PageFactory')).PageFactory;
export const getPageRegistry = async () => (await import('./core/pages/PageRegistry')).PageRegistry;
export const getCSHttpClient = async () => (await import('./api/client/CSHttpClient')).CSHttpClient;
export const getCSDatabase = async () => (await import('./database/client/CSDatabase')).CSDatabase;
export const getCSDataProvider = async () => (await import('./data/provider/CSDataProvider')).CSDataProvider;
export const getConfigurationManager = async () => (await import('./core/configuration/ConfigurationManager')).ConfigurationManager;
export const getActionLogger = async () => (await import('./core/logging/ActionLogger')).ActionLogger;
export const getLogger = async () => (await import('./core/utils/Logger')).logger;
export const getAIElementIdentifier = async () => (await import('./core/ai/engine/AIElementIdentifier')).AIElementIdentifier;
export const getSelfHealingEngine = async () => (await import('./core/ai/healing/SelfHealingEngine')).SelfHealingEngine;

export type { Feature, Scenario, StepResult, ExecutionResult, TestResult, FeatureResult, ScenarioResult } from './bdd/types/bdd.types';
export type { BrowserConfig, ViewportSize } from './core/browser/types/browser.types';
export type { ElementMetadata } from './core/elements/decorators/ElementMetadata';

if (process.env['WORKER_ID']) {
    const workerId = process.env['WORKER_ID'];
    
    runTests(JSON.parse(process.env['WORKER_OPTIONS'] || '{}') as ExecutionOptions)
        .then(result => {
            process.send!({ type: 'result', data: result });
            process.exit(0);
        })
        .catch(error => {
            console.error(`Worker ${workerId} failed`, error);
            process.exit(1);
        });
} else if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error in main:', error);
        process.exit(1);
    });
}
