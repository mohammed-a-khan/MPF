// src/bdd/base/StepDefinitionLoader.ts

import 'reflect-metadata';
import { Logger } from '../../core/utils/Logger';
import { CSBDDBaseStepDefinition } from './CSBDDBaseStepDefinition';
import { stepRegistry } from '../decorators/StepRegistry';
import * as glob from 'glob';
import * as path from 'path';

type StepDefinitionClass = new () => CSBDDBaseStepDefinition;

export class StepDefinitionLoader {
    private static readonly logger = Logger.getInstance('StepDefinitionLoader');
    private static instance: StepDefinitionLoader;
    
    private readonly stepDefinitions = new Map<string, CSBDDBaseStepDefinition>();
    private readonly stepDefinitionFiles = new Set<string>();
    private readonly stepDefinitionClasses = new Set<string>();
    private readonly stepDefinitionMethods = new Map<string, string>();
    private readonly stepDefinitionRegexps = new Map<string, RegExp>();
    private readonly stepDefinitionInstances = new Map<string, CSBDDBaseStepDefinition>();

    private constructor() {
        // Private constructor to prevent instantiation
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): StepDefinitionLoader {
        if (!this.instance) {
            this.instance = new StepDefinitionLoader();
        }
        return this.instance;
    }

    /**
     * Load all step definitions
     */
    public async loadAll(): Promise<void> {
        try {
            StepDefinitionLoader.logger.info('🔍 Loading step definitions...');
            console.log('🔍 DEBUG: StepDefinitionLoader.loadAll() called');
            
            // Get step definition files
            const files = await this.findStepFiles();
            StepDefinitionLoader.logger.info(`🔍 Found ${files.length} step definition files`);
            console.log(`🔍 DEBUG: Found files: ${JSON.stringify(files, null, 2)}`);
            
            // Check stepRegistry before loading
            const statsBefore = stepRegistry.getStats();
            console.log(`🔍 DEBUG: StepRegistry stats BEFORE loading: ${JSON.stringify(statsBefore, null, 2)}`);
            
            // Load each file - this triggers the decorators
            for (const file of files) {
                try {
                    console.log(`🔍 DEBUG: About to load file: ${file}`);
                    await this.loadStepFile(file);
                    
                    // Check stepRegistry after each file
                    const statsAfter = stepRegistry.getStats();
                    console.log(`🔍 DEBUG: StepRegistry stats AFTER loading ${file}: ${JSON.stringify(statsAfter, null, 2)}`);
                    
                } catch (error) {
                    StepDefinitionLoader.logger.error(`❌ Failed to load step file: ${file}`, error as Error);
                    console.error(`🔍 DEBUG: Error loading ${file}:`, error);
                }
            }
            
            // Get final stats from stepRegistry (which is what actually stores the step definitions)
            const statsFinal = stepRegistry.getStats();
            StepDefinitionLoader.logger.info(`✅ Loaded ${statsFinal.totalSteps} step definitions from ${files.length} files`);
            console.log(`🔍 DEBUG: Final StepRegistry stats: ${JSON.stringify(statsFinal, null, 2)}`);
            
            const classInstances = Array.from(stepRegistry['classInstances'].keys());
            StepDefinitionLoader.logger.info(`🏗️  Class instances: ${classInstances.join(', ')}`);
            console.log(`🔍 DEBUG: Class instances: ${classInstances}`);
            
            // Debug: List all step definitions
            const allSteps = stepRegistry.getAllStepDefinitions();
            console.log(`🔍 DEBUG: All step definitions (${allSteps.length}):`);
            allSteps.forEach((step, index) => {
                console.log(`  ${index + 1}. Pattern: "${step.patternString}"`);
                console.log(`     Metadata: ${JSON.stringify(step.metadata, null, 2)}`);
            });
            
        } catch (error) {
            StepDefinitionLoader.logger.error('❌ Failed to load step definitions:', error as Error);
            console.error('🔍 DEBUG: StepDefinitionLoader.loadAll() error:', error);
            throw error;
        }
    }

    /**
     * Find step definition files
     */
    private async findStepFiles(): Promise<string[]> {
        const patterns = [
            '**/test/**/*.steps.ts',
            '**/test/**/*.step.ts',
            '**/test/**/steps/**/*.ts',
            '**/test/**/step/**/*.ts',
            '**/src/steps/**/*.ts',
            '**/src/**/steps/**/*.ts'
        ];
        
        const files = new Set<string>();
        
        console.log('🔍 DEBUG: Searching for step files with patterns:', patterns);
        
        for (const pattern of patterns) {
            try {
                console.log(`🔍 DEBUG: Searching with pattern: ${pattern}`);
                const matches = glob.sync(pattern, {
                    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
                    absolute: true
                });
                
                console.log(`🔍 DEBUG: Pattern ${pattern} found ${matches.length} files:`);
                matches.forEach((file, index) => {
                    console.log(`  ${index + 1}. ${file}`);
                });
                
                matches.forEach(file => {
                    const normalizedPath = path.normalize(file);
                    files.add(normalizedPath);
                    StepDefinitionLoader.logger.debug(`Found step file: ${normalizedPath}`);
                });
            } catch (error) {
                StepDefinitionLoader.logger.warn(`Failed to find files for pattern ${pattern}:`, error);
                console.error(`🔍 DEBUG: Error with pattern ${pattern}:`, error);
            }
        }
        
        const allFiles = Array.from(files);
        console.log(`🔍 DEBUG: Total unique files found: ${allFiles.length}`);
        allFiles.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file}`);
        });
        
        return allFiles;
    }

    /**
     * Load step definition file
     */
    private async loadStepFile(filePath: string): Promise<void> {
        console.log(`🔍 DEBUG: About to load file: ${filePath}`);
        
        // Check if file is already loaded to prevent duplicate registrations
        if (stepRegistry.isFileLoaded(filePath)) {
            console.log(`🔍 DEBUG: File already loaded, skipping: ${filePath}`);
            return;
        }
        
        try {
            console.log(`🔍 DEBUG: Loading step file: ${filePath}`);
            
            // Convert to absolute path
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
            console.log(`🔍 DEBUG: Absolute path: ${absolutePath}`);
            
            // Use require.resolve to get the actual file path
            const resolvedPath = require.resolve(absolutePath);
            console.log(`🔍 DEBUG: Resolved path: ${resolvedPath}`);
            
            // Clear require cache for this file to ensure fresh load
            delete require.cache[resolvedPath];
            
            console.log(`🔍 DEBUG: Using require() for: ${resolvedPath}`);
            
            // Get step registry stats before loading
            const statsBefore = stepRegistry.getStats();
            console.log(`🔍 DEBUG: Step registry stats before loading ${filePath}:`, JSON.stringify(statsBefore, null, 2));
            
            // Use synchronous require
            require(resolvedPath);
            
            // Mark file as loaded
            stepRegistry.markFileLoaded(filePath);
            
            console.log(`🔍 DEBUG: Successfully required ${resolvedPath}`);
            
            // Get step registry stats after loading
            const statsAfter = stepRegistry.getStats();
            console.log(`🔍 DEBUG: Step registry stats after loading ${filePath}:`, JSON.stringify(statsAfter, null, 2));
            console.log(`🔍 DEBUG: StepRegistry stats AFTER loading ${filePath}:`, JSON.stringify(statsAfter, null, 2));
            
            // Verify that decorators executed by checking if step count increased
            if (statsAfter.totalSteps === statsBefore.totalSteps) {
                console.warn(`⚠️ WARNING: No new steps registered from ${filePath}. This might indicate decorator execution issues.`);
            } else {
                console.log(`✅ SUCCESS: ${statsAfter.totalSteps - statsBefore.totalSteps} new steps registered from ${filePath}`);
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : '';
            
            console.error(`❌ ERROR loading step file ${filePath}:`, {
                message: errorMessage,
                stack: errorStack,
                filePath
            });
            
            // Don't throw the error, just log it and continue with other files
            // This prevents one bad file from stopping the entire step loading process
        }
    }

    /**
     * Convert step pattern to regular expression
     */
    private patternToRegExp(pattern: string): RegExp {
        // Replace Cucumber expression placeholders with regex patterns
        const regexStr = pattern
            .replace(/{string}/g, '"([^"]*)"')
            .replace(/{int}/g, '(\\d+)')
            .replace(/{float}/g, '(\\d*\\.?\\d+)')
            .replace(/{word}/g, '([^\\s]+)')
            .replace(/{}/g, '(.+)');
        
        return new RegExp(`^${regexStr}$`);
    }

    /**
     * Get step definition for step text - delegate to stepRegistry
     */
    public getStepDefinition(stepText: string): { instance: CSBDDBaseStepDefinition; method: string; args: any[] } | null {
        // Use stepRegistry which is what actually stores the step definitions
        const stepWithParams = stepRegistry.findStepWithParameters(stepText);
        if (stepWithParams) {
            const { definition, parameters } = stepWithParams;
            const className = definition.metadata.className;
            if (className) {
                const classInstance = stepRegistry.getClassInstance(className);
                if (classInstance) {
                    return {
                        instance: classInstance,
                        method: definition.metadata.methodName || 'execute',
                        args: parameters || []
                    };
                }
            }
        }
        return null;
    }

    /**
     * Reset loader state
     */
    public reset(): void {
        this.stepDefinitions.clear();
        this.stepDefinitionFiles.clear();
        this.stepDefinitionClasses.clear();
        this.stepDefinitionMethods.clear();
        this.stepDefinitionRegexps.clear();
        this.stepDefinitionInstances.clear();
        // Also reset the stepRegistry
        stepRegistry.clear();
        StepDefinitionLoader.logger.info('Step definition loader reset');
    }
}