#!/usr/bin/env node


import { CSFramework } from '../src/core/CSFramework';
import { CommandLineParser } from '../src/core/cli/CommandLineParser';
import { Logger } from '../src/core/utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance('APITestRunner');
    
    try {
        const options = CommandLineParser.parse(process.argv);
        
        const environment = options.environment || 'dev';
        
        logger.info(`🎯 Running API tests with environment: ${environment}`);
        
        const framework = CSFramework.getInstance();
        
        await framework.initialize(environment);
        
        const featurePaths = options.features && options.features.length > 0 
            ? options.features 
            : ['./test/features/api/*.feature'];
        
        logger.info('📁 Feature paths:', featurePaths);
        
        const testOptions: any = {
            environment: environment,
            parallel: options.parallel || false,
            workers: options.workers || 1,
            timeout: options.timeout || 30000,
            retry: options.retry || 0,
            ...(options.tags && { tags: options.tags }),
            dryRun: options.dryRun || false,
            skipADO: true,
            headless: options.headless !== false,
            browser: 'chromium',
            slowMo: 0,
            video: false,
            trace: false
        };
        
        if (!options.dryRun) {
            testOptions.screenshot = 'on-failure';
        }
        
        const results = await framework.executeTests(featurePaths, testOptions);
        
        if (results) {
            logger.info('\n📊 API Test Results Summary:');
            logger.info(`   Total Features: ${results.features?.length || 0}`);
            logger.info(`   Total Scenarios: ${results.scenarios?.length || 0}`);
            logger.info(`   Total Tests: ${results.total || 0}`);
            logger.info(`   Passed: ${results.passed || 0}`);
            logger.info(`   Failed: ${results.failed || 0}`);
            logger.info(`   Skipped: ${results.skipped || 0}`);
            logger.info(`   Duration: ${results.duration || 0}ms`);
            logger.info(`   Environment: ${results.environment || 'unknown'}`);
            
            const exitCode = (results.failed || 0) > 0 ? 1 : 0;
            process.exit(exitCode);
        } else {
            logger.error('❌ No test results available');
            process.exit(1);
        }
        
    } catch (error) {
        logger.error('❌ API test execution failed:', error as Error);
        process.exit(1);
    }
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
