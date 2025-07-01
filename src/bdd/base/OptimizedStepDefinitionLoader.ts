// src/bdd/base/OptimizedStepDefinitionLoader.ts

import 'reflect-metadata';
import { Logger } from '../../core/utils/Logger';
import { CSBDDBaseStepDefinition } from './CSBDDBaseStepDefinition';
import { stepRegistry } from '../decorators/StepRegistryInstance';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { Feature, Scenario, Step } from '../types/bdd.types';
import { FeatureFileParser } from '../parser/FeatureFileParser';

type StepDefinitionClass = new () => CSBDDBaseStepDefinition;

interface StepFileMapping {
    pattern: string;
    files: Set<string>;
}

export class OptimizedStepDefinitionLoader {
    private static readonly logger = Logger.getInstance('OptimizedStepDefinitionLoader');
    private static instance: OptimizedStepDefinitionLoader;
    
    private readonly stepDefinitions = new Map<string, CSBDDBaseStepDefinition>();
    private readonly stepFileCache = new Map<string, StepFileMapping>();
    private readonly loadedFiles = new Set<string>();
    private readonly featureParser: FeatureFileParser;
    private isInitialized = false;
    private stepPatternToFileMap = new Map<string, string[]>();

    private constructor() {
        this.featureParser = FeatureFileParser.getInstance();
    }

    public static getInstance(): OptimizedStepDefinitionLoader {
        if (!this.instance) {
            this.instance = new OptimizedStepDefinitionLoader();
        }
        return this.instance;
    }

    public async initialize(featureFiles: string[]): Promise<void> {
        if (this.isInitialized) {
            OptimizedStepDefinitionLoader.logger.debug('OptimizedStepDefinitionLoader already initialized');
            return;
        }

        const startTime = Date.now();
        
        try {
            const requiredSteps = await this.extractRequiredSteps(featureFiles);
            
            await this.buildStepFileIndex();

            const filesToLoad = await this.findRequiredStepFiles(requiredSteps);
            
            await this.loadStepFiles(Array.from(filesToLoad));

            const duration = Date.now() - startTime;
            const stats = stepRegistry.getStats();
            OptimizedStepDefinitionLoader.logger.info(`✅ Optimized loading complete in ${duration}ms - Loaded ${stats.totalSteps} step definitions from ${filesToLoad.size} files`);

            this.isInitialized = true;
        } catch (error) {
            OptimizedStepDefinitionLoader.logger.error('Failed to initialize optimized loader', error as Error);
            throw error;
        }
    }

    private async extractRequiredSteps(featureFiles: string[]): Promise<Set<string>> {
        const requiredSteps = new Set<string>();

        for (const featureFile of featureFiles) {
            try {
                const feature = await this.featureParser.parseFile(featureFile);
                this.extractStepsFromFeature(feature, requiredSteps);
            } catch (error) {
                OptimizedStepDefinitionLoader.logger.warn(`Failed to parse feature file ${featureFile}:`, error as Error);
            }
        }

        return requiredSteps;
    }

    private extractStepsFromFeature(feature: Feature, stepSet: Set<string>): void {
        for (const scenario of feature.scenarios) {
            if (scenario.type === 'background') {
                for (const step of scenario.steps) {
                    stepSet.add(this.normalizeStepText(step));
                }
            } else {
                for (const step of scenario.steps) {
                    stepSet.add(this.normalizeStepText(step));
                }
            }
        }
    }

    private normalizeStepText(step: Step): string {
        return step.text.trim();
    }

    private async buildStepFileIndex(): Promise<void> {
        const cacheKey = 'step-file-index';
        
        const cachedIndex = await this.loadCachedIndex(cacheKey);
        if (cachedIndex) {
            this.stepPatternToFileMap = cachedIndex;
            if (process.env.DEBUG === 'true') OptimizedStepDefinitionLoader.logger.debug('Using cached step file index');
            return;
        }

        const startTime = Date.now();

        const stepFiles = await this.findAllStepFiles();

        for (const file of stepFiles) {
            try {
                const patterns = await this.extractStepPatternsFromFile(file);
                for (const pattern of patterns) {
                    if (!this.stepPatternToFileMap.has(pattern)) {
                        this.stepPatternToFileMap.set(pattern, []);
                    }
                    this.stepPatternToFileMap.get(pattern)!.push(file);
                }
            } catch (error) {
                OptimizedStepDefinitionLoader.logger.debug(`Failed to extract patterns from ${file}:`, error as Error);
            }
        }

        const duration = Date.now() - startTime;
        if (process.env.DEBUG === 'true') {
            OptimizedStepDefinitionLoader.logger.debug(`Built index of ${this.stepPatternToFileMap.size} patterns in ${duration}ms`);
        }

        await this.saveCachedIndex(cacheKey, this.stepPatternToFileMap);
    }

    private async extractStepPatternsFromFile(filePath: string): Promise<string[]> {
        const patterns: string[] = [];
        
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            
            const decoratorRegex = /@(Given|When|Then|And|But)\s*\(\s*['"](.*?)['"]/g;
            const stepDefRegex = /CSBDDStepDef\s*\(\s*['"]?(Given|When|Then|And|But)['"]?\s*,\s*['"](.*?)['"]/g;
            
            let match;
            
            while ((match = decoratorRegex.exec(content)) !== null) {
                if (match[2]) {
                    patterns.push(match[2]);
                }
            }
            
            while ((match = stepDefRegex.exec(content)) !== null) {
                if (match[2]) {
                    patterns.push(match[2]);
                }
            }
            
        } catch (error) {
            OptimizedStepDefinitionLoader.logger.debug(`Error reading file ${filePath}:`, error as Error);
        }
        
        return patterns;
    }

    private async findRequiredStepFiles(requiredSteps: Set<string>): Promise<Set<string>> {
        const requiredFiles = new Set<string>();
        const unmatchedSteps = new Set<string>();

        for (const stepText of requiredSteps) {
            let matched = false;

            for (const [pattern, files] of this.stepPatternToFileMap) {
                if (this.stepMatchesPattern(stepText, pattern)) {
                    files.forEach(file => requiredFiles.add(file));
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                unmatchedSteps.add(stepText);
            }
        }

        const commonStepFiles = await this.getCommonStepFiles();
        commonStepFiles.forEach(file => requiredFiles.add(file));

        if (unmatchedSteps.size > 0 && process.env.DEBUG === 'true') {
            OptimizedStepDefinitionLoader.logger.debug(`${unmatchedSteps.size} steps could not be matched to files`);
            const samples = Array.from(unmatchedSteps).slice(0, 5);
            samples.forEach(step => {
                OptimizedStepDefinitionLoader.logger.debug(`  - "${step}"`);
            });
        }

        return requiredFiles;
    }

    private stepMatchesPattern(stepText: string, pattern: string): boolean {
        const regexPattern = this.convertPatternToRegex(pattern);
        
        try {
            const regex = new RegExp(`^${regexPattern}$`, 'i');
            return regex.test(stepText);
        } catch (error) {
            return stepText.toLowerCase().includes(pattern.toLowerCase());
        }
    }

    private convertPatternToRegex(pattern: string): string {
        return pattern
            .replace(/\\/g, '\\\\')
            .replace(/\{string\}/g, '"([^"]*)"')
            .replace(/\{int\}/g, '(\\d+)')
            .replace(/\{float\}/g, '(\\d*\\.?\\d+)')
            .replace(/\{word\}/g, '([^\\s]+)')
            .replace(/\{\}/g, '(.+)')
            .replace(/"/g, '"')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');
    }

    private async getCommonStepFiles(): Promise<string[]> {
        const patterns = [
            'src/steps/ui/InteractionSteps.{ts,js}',
            'src/steps/ui/ValidationSteps.{ts,js}',
            'src/steps/ui/NavigationSteps.{ts,js}'
        ];

        const files: string[] = [];
        for (const pattern of patterns) {
            const matches = await glob(pattern, {
                cwd: process.cwd(),
                absolute: true
            });
            files.push(...matches);
        }

        return files;
    }

    private async findAllStepFiles(): Promise<string[]> {
        const patterns = [
            'test/**/steps/**/*.{ts,js}',
            'src/steps/**/*.{ts,js}'
        ];

        const files = await Promise.all(patterns.map(async pattern => {
            const matches = await glob(pattern, {
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts'],
                cwd: process.cwd(),
                absolute: true,
                maxDepth: 8
            });
            return matches;
        }));

        return Array.from(new Set(files.flat()));
    }

    private async loadStepFiles(files: string[]): Promise<void> {
        const loadPromises = files.map(async file => {
            if (this.loadedFiles.has(file)) {
                return;
            }

            try {
                if (process.env.DEBUG === 'true') OptimizedStepDefinitionLoader.logger.debug(`Loading step file: ${file}`);
                await import(file);
                this.loadedFiles.add(file);
                stepRegistry.markFileLoaded(file);
            } catch (error) {
                OptimizedStepDefinitionLoader.logger.error(`Failed to load step file ${file}:`, error as Error);
            }
        });

        await Promise.all(loadPromises);
    }

    private async loadCachedIndex(cacheKey: string): Promise<Map<string, string[]> | null> {
        try {
            const cacheDir = path.join(process.cwd(), '.cs-framework-cache');
            const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
            
            const stat = await fs.stat(cacheFile);
            const cacheAge = Date.now() - stat.mtime.getTime();
            
            if (cacheAge > 24 * 60 * 60 * 1000) {
                return null;
            }

            const content = await fs.readFile(cacheFile, 'utf-8');
            const data = JSON.parse(content);
            return new Map(data);
        } catch (error) {
            return null;
        }
    }

    private async saveCachedIndex(cacheKey: string, index: Map<string, string[]>): Promise<void> {
        try {
            const cacheDir = path.join(process.cwd(), '.cs-framework-cache');
            await fs.mkdir(cacheDir, { recursive: true });
            
            const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
            const data = Array.from(index.entries());
            await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
        } catch (error) {
            OptimizedStepDefinitionLoader.logger.debug('Failed to save cache:', error as Error);
        }
    }

    public isLoaded(): boolean {
        return this.isInitialized;
    }

    public reset(): void {
        this.stepDefinitions.clear();
        this.stepFileCache.clear();
        this.loadedFiles.clear();
        this.stepPatternToFileMap.clear();
        this.isInitialized = false;
        if (process.env.DEBUG === 'true') OptimizedStepDefinitionLoader.logger.debug('Optimized step definition loader reset');
    }
}
