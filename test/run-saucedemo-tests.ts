#!/usr/bin/env node

/**
 * SauceDemo Test Runner
 * Runs SauceDemo feature tests with proper configuration
 */

import { CSFramework } from '../src/core/CSFramework';
import { CommandLineParser } from '../src/core/cli/CommandLineParser';
import { Logger } from '../src/core/utils/Logger';

async function main(): Promise<void> {
    const logger = Logger.getInstance('SauceDemoRunner');
    
    try {
        // Parse command line arguments
        const options = CommandLineParser.parse(process.argv);
        
        // Set default environment to demo if not specified
        const environment = options.environment || 'demo';
        
        logger.info(`🎯 Running SauceDemo tests with environment: ${environment}`);
        
        // Get framework instance
        const framework = CSFramework.getInstance();
        
        // Initialize framework
        await framework.initialize(environment, {
            parallel: options.parallel,
            workers: options.workers || 1,
            timeout: options.timeout || 30000,
            debug: options.debug,
            headless: !options.headed,
            proxy: !!options.proxy,
            reporting: !options.skipReport,
            adoIntegration: !options.skipADO
        });
        
        // Define SauceDemo feature paths
        const featurePaths = [
            './test/saucedemo/features/*.feature'
        ];
        
        logger.info(`🚀 Executing SauceDemo features: ${featurePaths.join(', ')}`);
        
        // Execute tests
        const result = await framework.executeTests(featurePaths, {
            ...options,
            environment,
            features: featurePaths
        });
        
        logger.info('✅ SauceDemo test execution completed');
        
        // Exit with appropriate code
        const exitCode = result.summary?.failed > 0 ? 1 : 0;
        process.exit(exitCode);
        
    } catch (error) {
        logger.error('❌ SauceDemo test execution failed:', error as Error);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error in SauceDemo runner:', error);
        process.exit(1);
    });
} 