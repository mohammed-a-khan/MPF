// src/bdd/base/StepDefinitionLoader.ts

import 'reflect-metadata';
import { Logger } from '../../core/utils/Logger';
import { CSBDDBaseStepDefinition } from './CSBDDBaseStepDefinition';
import * as glob from 'glob';

type StepDefinitionClass = new () => CSBDDBaseStepDefinition;

export class StepDefinitionLoader {
    private static readonly logger = Logger.getInstance(StepDefinitionLoader.name);
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
            StepDefinitionLoader.logger.info('Loading step definitions...');
            
            // Get step definition files
            const files = await this.findStepFiles();
            
            // Load each file
            for (const file of files) {
                try {
                    await this.loadStepFile(file);
                } catch (error) {
                    StepDefinitionLoader.logger.error(`Failed to load step file: ${file}`, error as Error);
                }
            }
            
            StepDefinitionLoader.logger.info(`Loaded ${this.stepDefinitions.size} step definitions from ${files.length} files`);
        } catch (error) {
            StepDefinitionLoader.logger.error('Failed to load step definitions:', error as Error);
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
        
        for (const pattern of patterns) {
            const matches = glob.sync(pattern, {
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
                absolute: true
            });
            
            matches.forEach(file => files.add(file));
        }
        
        return Array.from(files);
    }

    /**
     * Load step definition file
     */
    private async loadStepFile(file: string): Promise<void> {
        try {
            StepDefinitionLoader.logger.debug(`Loading step file: ${file}`);
            
            // Import file
            const module = await import(file);
            
            // Get exported classes
            const classes = Object.values(module).filter(value => {
                return typeof value === 'function' && 
                       value.prototype instanceof CSBDDBaseStepDefinition &&
                       Reflect.getMetadata('stepDefinitions', value) === true;
            }) as StepDefinitionClass[];
            
            // Create instances and register step definitions
            for (const stepClass of classes) {
                const instance = new stepClass();
                const className = stepClass.name;
                
                if (this.stepDefinitionClasses.has(className)) {
                    StepDefinitionLoader.logger.warn(`Duplicate step definition class: ${className} in ${file}`);
                    continue;
                }
                
                this.stepDefinitionClasses.add(className);
                this.stepDefinitionFiles.add(file);
                
                // Get step definitions from class
                const stepDefs = Reflect.getMetadata('stepDefs', stepClass.prototype) || [];
                
                for (const stepDef of stepDefs) {
                    const { pattern, methodName } = stepDef;
                    
                    if (this.stepDefinitionMethods.has(pattern)) {
                        StepDefinitionLoader.logger.warn(`Duplicate step definition pattern: ${pattern} in ${className}`);
                        continue;
                    }
                    
                    this.stepDefinitionMethods.set(pattern, methodName);
                    this.stepDefinitionRegexps.set(pattern, this.patternToRegExp(pattern));
                    this.stepDefinitionInstances.set(pattern, instance);
                    this.stepDefinitions.set(pattern, instance);
                    
                    StepDefinitionLoader.logger.debug(`Registered step definition: ${pattern} -> ${className}.${methodName}`);
                }
            }
            
            StepDefinitionLoader.logger.debug(`Loaded ${classes.length} step definition classes from ${file}`);
        } catch (error) {
            StepDefinitionLoader.logger.error(`Failed to load step file: ${file}`, error as Error);
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
     * Get step definition for step text
     */
    public getStepDefinition(stepText: string): { instance: CSBDDBaseStepDefinition; method: string; args: any[] } | null {
        for (const [pattern, regexp] of this.stepDefinitionRegexps) {
            const match = stepText.match(regexp);
            if (match) {
                const instance = this.stepDefinitionInstances.get(pattern)!;
                const method = this.stepDefinitionMethods.get(pattern)!;
                const args = match.slice(1);
                return { instance, method, args };
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
        StepDefinitionLoader.logger.info('Step definition loader reset');
    }
}