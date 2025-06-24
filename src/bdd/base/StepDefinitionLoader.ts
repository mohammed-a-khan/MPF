// src/bdd/base/StepDefinitionLoader.ts

import 'reflect-metadata';
import { Logger } from '../../core/utils/Logger';
import { CSBDDBaseStepDefinition } from './CSBDDBaseStepDefinition';
import { stepRegistry } from '../decorators/StepRegistryInstance';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

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
    private logger: Logger;
    private loadedFiles: Set<string> = new Set();
    private isInitialized = false;

    private constructor() {
        this.logger = Logger.getInstance('StepDefinitionLoader');
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
     * Initialize the loader
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log('🔍 DEBUG: StepDefinitionLoader already initialized');
            return;
        }

        console.log('🔍 DEBUG: Initializing StepDefinitionLoader');
        await this.loadAllStepDefinitions();
        this.isInitialized = true;
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
            '**/src/**/steps/**/*.ts',
            '**/test/akhan/steps/*.steps.ts',
            '**/test/akhan/steps/*.step.ts'
        ];
        
        const files = await Promise.all(patterns.map(async pattern => {
            const matches = await glob(pattern, { 
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
                cwd: process.cwd(),
                absolute: true
            });
            return matches;
        }));

        return Array.from(new Set(files.flat()));
    }

    /**
     * Load step definition file
     */
    private async loadStepFile(filePath: string): Promise<void> {
        if (this.loadedFiles.has(filePath)) {
            return;
        }

        try {
            this.logger.debug(`Loading step file: ${filePath}`);
            
            // Import the file to trigger decorators
            const module = await import(filePath);
            
            // Wait for next tick to ensure decorators are applied
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Check if the module exports any classes with step definitions
            for (const exportKey in module) {
                const exportedItem = module[exportKey];
                if (typeof exportedItem === 'function' && exportedItem.prototype) {
                    // Check if this is a class with step definitions
                    const hasStepDefs = Reflect.getMetadata('stepDefinitions', exportedItem.prototype) || 
                                      Reflect.getMetadata('hooks', exportedItem.prototype);
                    
                    if (hasStepDefs) {
                        // Create an instance of the class to trigger decorators
                        const instance = new exportedItem();
                        this.logger.debug(`Created instance of class ${exportKey} from ${filePath}`);
                    }
                }
            }
            
            this.loadedFiles.add(filePath);
            stepRegistry.markFileLoaded(filePath);
            
            this.logger.debug(`Successfully loaded step file: ${filePath}`);
            
        } catch (error) {
            this.logger.error(`Failed to load step file ${filePath}: ${error}`);
            throw error;
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
        this.loadedFiles.clear();
        StepDefinitionLoader.logger.info('Step definition loader reset');
    }

    async loadStepDefinitions(projectPath: string): Promise<void> {
        this.logger.info(`Loading step definitions from: ${projectPath}`);
        
        try {
            // Load step definition files
            const stepsDir = path.join(projectPath, 'steps');
            await this.loadStepsFromDirectory(stepsDir);
            
            const stats = stepRegistry.getStats();
            this.logger.info(`Loaded ${stats.totalSteps} step definitions`);
            
        } catch (error) {
            this.logger.error(`Failed to load step definitions: ${error}`);
            throw error;
        }
    }

    private async loadStepsFromDirectory(directory: string): Promise<void> {
        try {
            const files = await fs.readdir(directory);
            for (const file of files) {
                const filePath = path.join(directory, file);
                const stat = await fs.stat(filePath);
                
                if (stat.isDirectory()) {
                    await this.loadStepsFromDirectory(filePath);
                } else if (file.endsWith('.ts') || file.endsWith('.js')) {
                    await this.loadStepFile(filePath);
                }
            }
        } catch (error) {
            // Directory might not exist, which is fine
            this.logger.debug(`Directory not found or error reading: ${directory}`);
        }
    }

    async loadAllStepDefinitions(): Promise<void> {
        console.log('🔍 DEBUG: Loading all step definitions');
        
        try {
            const files = await this.findStepFiles();
            console.log(`🔍 DEBUG: Found ${files.length} step definition files`);
            
            for (const file of files) {
                try {
                    console.log(`🔍 DEBUG: Loading step definitions from ${file}`);
                    await import(file);
                } catch (error) {
                    console.error(`❌ Failed to load step definitions from ${file}:`, error);
                }
            }

            const stats = stepRegistry.getStats();
            console.log(`🔍 DEBUG: Loaded ${stats.totalSteps} step definitions`);
            
        } catch (error) {
            console.error('❌ Failed to load step definitions:', error);
            throw error;
        }
    }

    isLoaded(): boolean {
        return this.isInitialized;
    }
}