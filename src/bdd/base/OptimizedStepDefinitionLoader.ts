// src/bdd/base/OptimizedStepDefinitionLoader.ts

import 'reflect-metadata';
import { Logger } from '../../core/utils/Logger';
import { CSBDDBaseStepDefinition } from './CSBDDBaseStepDefinition';
import { stepRegistry } from '../decorators/StepRegistryInstance';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Feature, Scenario, Step } from '../types/bdd.types';

type StepDefinitionClass = new () => CSBDDBaseStepDefinition;

export class OptimizedStepDefinitionLoader {
    private static readonly logger = Logger.getInstance('OptimizedStepDefinitionLoader');
    private static instance: OptimizedStepDefinitionLoader;
    
    private readonly loadedFiles = new Set<string>();
    private readonly stepToFileMap = new Map<string, string[]>();
    private readonly projectStepPaths = new Map<string, string[]>();
    private isInitialized = false;
    private stepFileIndex: Map<string, string[]> | null = null;

    private constructor() {}

    public static getInstance(): OptimizedStepDefinitionLoader {
        if (!this.instance) {
            this.instance = new OptimizedStepDefinitionLoader();
        }
        return this.instance;
    }

    /**
     * Initialize the loader with smart loading strategy
     */
    public async initialize(options?: { preloadCommon?: boolean }): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        console.log('🚀 Initializing OptimizedStepDefinitionLoader...');
        
        // Build step file index for quick lookup
        await this.buildStepFileIndex();
        
        // Optionally preload common step definitions
        if (options?.preloadCommon) {
            await this.preloadCommonSteps();
        }
        
        this.isInitialized = true;
    }

    /**
     * Load only the step definitions needed for specific features
     */
    public async loadStepsForFeatures(features: Feature[]): Promise<void> {
        console.log(`📦 Loading step definitions for ${features.length} features...`);
        
        const requiredSteps = this.extractRequiredSteps(features);
        console.log(`🔍 Found ${requiredSteps.size} unique step patterns`);
        
        const filesToLoad = await this.findFilesForSteps(requiredSteps);
        console.log(`📁 Need to load ${filesToLoad.size} step definition files`);
        
        // Load files in parallel for better performance
        const loadPromises = Array.from(filesToLoad).map(file => this.loadStepFile(file));
        await Promise.all(loadPromises);
        
        const stats = stepRegistry.getStats();
        console.log(`✅ Loaded ${stats.totalSteps} step definitions from ${filesToLoad.size} files`);
    }

    /**
     * Load step definitions for a specific project
     */
    public async loadProjectSteps(project: string): Promise<void> {
        console.log(`📦 Loading step definitions for project: ${project}`);
        
        const projectPaths = this.getProjectStepPaths(project);
        const files = await this.findStepFilesInPaths(projectPaths);
        
        console.log(`📁 Found ${files.length} step files for project ${project}`);
        
        // Load only new files
        const newFiles = files.filter(file => !this.loadedFiles.has(file));
        if (newFiles.length === 0) {
            console.log(`✅ All step files for project ${project} already loaded`);
            return;
        }
        
        // Load files in parallel
        const loadPromises = newFiles.map(file => this.loadStepFile(file));
        await Promise.all(loadPromises);
        
        const stats = stepRegistry.getStats();
        console.log(`✅ Loaded ${stats.totalSteps} total step definitions`);
    }

    /**
     * Extract required step patterns from features
     */
    private extractRequiredSteps(features: Feature[]): Set<string> {
        const steps = new Set<string>();
        
        for (const feature of features) {
            // Extract from background
            if (feature.background) {
                for (const step of feature.background.steps) {
                    steps.add(this.normalizeStepText(step.text));
                }
            }
            
            // Extract from scenarios
            for (const scenario of feature.scenarios) {
                for (const step of scenario.steps) {
                    steps.add(this.normalizeStepText(step.text));
                }
            }
        }
        
        return steps;
    }

    /**
     * Normalize step text for matching
     */
    private normalizeStepText(text: string): string {
        // Remove quotes and parameters for basic matching
        return text
            .replace(/"[^"]*"/g, '"{string}"')
            .replace(/\d+/g, '{int}')
            .replace(/\d*\.\d+/g, '{float}');
    }

    /**
     * Build an index of step patterns to file mappings
     */
    private async buildStepFileIndex(): Promise<void> {
        console.log('🔨 Building step file index...');
        
        const indexFile = path.join(process.cwd(), '.step-index.json');
        
        // Try to load existing index
        try {
            const indexContent = await fs.readFile(indexFile, 'utf-8');
            this.stepFileIndex = new Map(JSON.parse(indexContent));
            console.log('✅ Loaded step index from cache');
            return;
        } catch (error) {
            // Index doesn't exist, build it
            console.log('📝 Building new step index...');
        }
        
        // Build new index
        this.stepFileIndex = new Map();
        const files = await this.findAllStepFiles();
        
        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const patterns = this.extractStepPatterns(content);
                
                for (const pattern of patterns) {
                    const existing = this.stepFileIndex.get(pattern) || [];
                    existing.push(file);
                    this.stepFileIndex.set(pattern, existing);
                }
            } catch (error) {
                console.error(`Failed to index file ${file}:`, error);
            }
        }
        
        // Save index for future use
        try {
            await fs.writeFile(indexFile, JSON.stringify([...this.stepFileIndex]), 'utf-8');
            console.log('💾 Saved step index to cache');
        } catch (error) {
            console.error('Failed to save step index:', error);
        }
    }

    /**
     * Extract step patterns from file content without loading it
     */
    private extractStepPatterns(content: string): string[] {
        const patterns: string[] = [];
        
        // Match @Given, @When, @Then, @And, @But decorators
        const decoratorRegex = /@(?:Given|When|Then|And|But)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        let match;
        
        while ((match = decoratorRegex.exec(content)) !== null) {
            if (match[1]) {
                patterns.push(match[1]);
            }
        }
        
        // Also match CSBDDStepDef patterns
        const stepDefRegex = /@CSBDDStepDef\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = stepDefRegex.exec(content)) !== null) {
            if (match[1]) {
                patterns.push(match[1]);
            }
        }
        
        return patterns;
    }

    /**
     * Find files that contain steps matching the required patterns
     */
    private async findFilesForSteps(requiredSteps: Set<string>): Promise<Set<string>> {
        const files = new Set<string>();
        
        if (!this.stepFileIndex) {
            // Fallback to loading all files if index not available
            console.warn('⚠️ Step index not available, loading all step files');
            const allFiles = await this.findAllStepFiles();
            allFiles.forEach(file => files.add(file));
            return files;
        }
        
        // Use index to find relevant files
        for (const stepText of requiredSteps) {
            // Try exact match first
            const exactMatches = this.stepFileIndex.get(stepText);
            if (exactMatches) {
                exactMatches.forEach(file => files.add(file));
                continue;
            }
            
            // Try pattern matching
            for (const [pattern, fileList] of this.stepFileIndex) {
                if (this.stepMatchesPattern(stepText, pattern)) {
                    fileList.forEach(file => files.add(file));
                }
            }
        }
        
        return files;
    }

    /**
     * Check if a step text matches a pattern
     */
    private stepMatchesPattern(stepText: string, pattern: string): boolean {
        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/\{string\}/g, '"[^"]*"')
            .replace(/\{int\}/g, '\\d+')
            .replace(/\{float\}/g, '\\d*\\.?\\d+')
            .replace(/\{word\}/g, '[^\\s]+')
            .replace(/\{}\|{.*?}/g, '.*');
            
        try {
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(stepText);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get step file paths for a specific project
     */
    private getProjectStepPaths(project: string): string[] {
        // Define project-specific paths
        const projectPaths: Record<string, string[]> = {
            'akhan': [
                '**/test/akhan/steps/**/*.ts',
                '**/test/akhan/steps/**/*.js'
            ],
            'api': [
                '**/test/api/steps/**/*.ts',
                '**/test/api/steps/**/*.js',
                '**/src/steps/api/**/*.ts'
            ],
            'common': [
                '**/src/steps/ui/**/*.ts',
                '**/src/steps/database/**/*.ts'
            ]
        };
        
        return projectPaths[project] || ['**/src/steps/**/*.ts'];
    }

    /**
     * Find all step definition files
     */
    private async findAllStepFiles(): Promise<string[]> {
        const patterns = [
            '**/test/**/steps/**/*.ts',
            '**/test/**/*.steps.ts',
            '**/test/**/*.step.ts',
            '**/src/steps/**/*.ts'
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
     * Find step files in specific paths
     */
    private async findStepFilesInPaths(patterns: string[]): Promise<string[]> {
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
     * Load a single step file
     */
    private async loadStepFile(filePath: string): Promise<void> {
        if (this.loadedFiles.has(filePath)) {
            return;
        }

        try {
            console.log(`📄 Loading: ${path.basename(filePath)}`);
            await import(filePath);
            this.loadedFiles.add(filePath);
        } catch (error) {
            console.error(`❌ Failed to load ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Preload commonly used step definitions
     */
    private async preloadCommonSteps(): Promise<void> {
        const commonStepPatterns = [
            '**/src/steps/ui/InteractionSteps.ts',
            '**/src/steps/ui/ValidationSteps.ts',
            '**/src/steps/ui/NavigationSteps.ts'
        ];
        
        const files = await this.findStepFilesInPaths(commonStepPatterns);
        console.log(`📦 Preloading ${files.length} common step files...`);
        
        const loadPromises = files.map(file => this.loadStepFile(file));
        await Promise.all(loadPromises);
    }

    /**
     * Clear all loaded step definitions
     */
    public reset(): void {
        this.loadedFiles.clear();
        this.stepToFileMap.clear();
        stepRegistry.clear();
        this.isInitialized = false;
        console.log('🔄 Step definition loader reset');
    }

    /**
     * Get loading statistics
     */
    public getStats(): {
        loadedFiles: number;
        totalSteps: number;
        indexSize: number;
    } {
        const stepStats = stepRegistry.getStats();
        return {
            loadedFiles: this.loadedFiles.size,
            totalSteps: stepStats.totalSteps,
            indexSize: this.stepFileIndex?.size || 0
        };
    }
}