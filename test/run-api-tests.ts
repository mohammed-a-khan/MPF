#!/usr/bin/env node

/**
 * API Test Runner
 * Runs API feature tests with proper configuration
 */

import { CSFramework } from '../src/core/CSFramework';
import { CommandLineParser } from '../src/core/cli/CommandLineParser';
import { Logger } from '../src/core/utils/Logger';
import { ScenarioStatus } from '../src/bdd/types/bdd.types';

async function main(): Promise<void> {
    const logger = Logger.getInstance('APITestRunner');
    
    try {
        // Parse command line arguments
        const options = CommandLineParser.parse(process.argv);
        
        // Set default environment to dev if not specified (dev has ADO disabled)
        const environment = options.environment || 'dev';
        
        logger.info(`🎯 Running API tests with environment: ${environment}`);
        
        // Get framework instance
        const framework = CSFramework.getInstance();
        
        // Initialize framework with the specified environment
        await framework.initialize(environment);
        
        // Define API feature paths - use command line features if provided, otherwise default
        const featurePaths = options.features && options.features.length > 0 
            ? options.features 
            : ['./test/features/api/*.feature'];
        
        logger.info('📁 Feature paths:', featurePaths);
        
        // Execute tests with API-specific configuration
        const results = await framework.executeTests(featurePaths, {
            environment: environment,
            parallel: options.parallel || false,
            workers: options.workers || 1,
            timeout: options.timeout || 30000,
            retry: options.retry || 0,
            ...(options.tags && { tags: options.tags }),
            dryRun: options.dryRun || false,
            skipADO: true, // Disable ADO integration for API tests
            headless: options.headless !== false, // Default to headless for API tests
            browser: 'chromium', // Default browser for any UI components
            slowMo: 0, // No slow motion for API tests
            video: false, // No video recording for API tests
            screenshot: 'on-failure', // Screenshots only on failure
            trace: false // No trace for API tests
        });
        
        // Log results summary
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
            
            // Exit with appropriate code
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Run the main function
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
