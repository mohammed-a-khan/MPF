// src/bdd/engine/CSBDDEngine.ts

import { GherkinLexer } from '../parser/GherkinLexer';
import { GherkinParser } from '../parser/GherkinParser';
import { FeatureFileParser } from '../parser/FeatureFileParser';
import { DataTableParser } from '../parser/DataTableParser';
import { ExamplesParser } from '../parser/ExamplesParser';
import { TagParser } from '../parser/TagParser';
import { stepRegistry } from '../decorators/StepRegistry';
import { CSDataProvider } from '../../data/provider/CSDataProvider';
import { logger } from '../../core/utils/Logger';
import { 
    Feature, 
    Scenario, 
    StepMatch, 
    ValidationResult, 
    ValidationError,
    Annotations,
    MissingStepsReport,
    ParseError
} from '../types/bdd.types';

export interface BDDEngineConfig {
    featurePaths: string[];
    stepDefinitionPaths?: string[];
    enableDataAnnotations?: boolean;
    enableTagFiltering?: boolean;
    cacheFeatures?: boolean;
    validateSteps?: boolean;
}

export interface FeatureDiscoveryResult {
    features: Feature[];
    totalFiles: number;
    parsedFiles: number;
    failedFiles: string[];
    validationErrors: ValidationError[];
}

export interface StepValidationResult {
    totalSteps: number;
    matchedSteps: number;
    unmatchedSteps: string[];
    ambiguousSteps: { step: string; matches: string[] }[];
    missingDefinitions: string[];
}

/**
 * CSBDDEngine - Unified BDD Engine
 * Custom BDD parser with zero dependencies, handles all Gherkin syntax
 * Central coordinator for all BDD parsing and step matching operations
 */
export class CSBDDEngine {
    private static instance: CSBDDEngine;
    
    private readonly lexer: GherkinLexer;
    private readonly parser: GherkinParser;
    private readonly featureFileParser: FeatureFileParser;
    private readonly dataTableParser: DataTableParser;
    private readonly examplesParser: ExamplesParser;
    private readonly tagParser: TagParser;
    private readonly dataProvider: CSDataProvider;
    
    private config: BDDEngineConfig;
    private featuresCache = new Map<string, Feature>();
    private stepMatchCache = new Map<string, StepMatch>();
    
    private constructor() {
        this.lexer = new GherkinLexer();
        this.parser = new GherkinParser();
        this.featureFileParser = FeatureFileParser.getInstance();
        this.dataTableParser = DataTableParser.getInstance();
        this.examplesParser = ExamplesParser.getInstance();
        this.tagParser = TagParser.getInstance();
        this.dataProvider = CSDataProvider.getInstance();
        
        this.config = {
            featurePaths: [],
            enableDataAnnotations: true,
            enableTagFiltering: true,
            cacheFeatures: true,
            validateSteps: true
        };
    }

    /**
     * Get singleton instance
     */
    static getInstance(): CSBDDEngine {
        if (!CSBDDEngine.instance) {
            CSBDDEngine.instance = new CSBDDEngine();
        }
        return CSBDDEngine.instance;
    }

    /**
     * Initialize the BDD engine with configuration
     */
    async initialize(config: Partial<BDDEngineConfig>): Promise<void> {
        logger.info('Initializing CSBDDEngine...');
        
        this.config = { ...this.config, ...config };
        
        // Validate configuration
        await this.validateConfiguration();
        
        // Clear caches
        this.featuresCache.clear();
        this.stepMatchCache.clear();
        
        logger.info('CSBDDEngine initialized successfully');
    }

    /**
     * Parse multiple feature files
     */
    async parseFeatureFiles(paths: string[]): Promise<Feature[]> {
        logger.info(`Parsing ${paths.length} feature file(s)...`);
        
        const features: Feature[] = [];
        const errors: string[] = [];
        
        for (const filePath of paths) {
            try {
                // Check cache first
                if (this.config.cacheFeatures && this.featuresCache.has(filePath)) {
                    const cachedFeature = this.featuresCache.get(filePath)!;
                    features.push(cachedFeature);
                    continue;
                }
                
                // Parse the feature file
                const feature = await this.featureFileParser.parseFile(filePath);
                
                // Process data annotations if enabled
                if (this.config.enableDataAnnotations) {
                    await this.processFeatureDataAnnotations(feature);
                }
                
                // Cache the feature
                if (this.config.cacheFeatures) {
                    this.featuresCache.set(filePath, feature);
                }
                
                features.push(feature);
                logger.debug(`Successfully parsed feature: ${feature.name}`);
                
            } catch (error) {
                const errorMessage = `Failed to parse ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                logger.error(errorMessage);
                errors.push(errorMessage);
            }
        }
        
        if (errors.length > 0) {
            logger.warn(`Failed to parse ${errors.length} feature file(s): ${errors.join(', ')}`);
        }
        
        logger.info(`Successfully parsed ${features.length} feature(s)`);
        return features;
    }

    /**
     * Parse single feature content
     */
    async parseFeatureContent(content: string, filePath?: string): Promise<Feature> {
        try {
            // Tokenize the content
            const tokens = this.lexer.tokenize(content, filePath || 'inline');
            
            // Parse tokens into feature
            const feature = this.parser.parse(tokens, filePath || 'inline');
            
            // Process data annotations if enabled
            if (this.config.enableDataAnnotations) {
                await this.processFeatureDataAnnotations(feature);
            }
            
            return feature;
            
        } catch (error) {
            if (error instanceof ParseError) {
                throw error;
            }
            throw new ParseError(
                `Failed to parse feature content: ${error instanceof Error ? error.message : 'Unknown error'}`,
                0,
                0,
                filePath || 'inline'
            );
        }
    }

    /**
     * Find matching step definition for step text
     */
    findMatchingStep(stepText: string): StepMatch {
        // Check cache first
        if (this.stepMatchCache.has(stepText)) {
            return this.stepMatchCache.get(stepText)!;
        }
        
        const matches = stepRegistry.findStepWithParameters(stepText);
        
        let result: StepMatch;
        
        if (!matches) {
            result = {
                stepText,
                matched: false,
                definition: null,
                parameters: [],
                error: `No matching step definition found for: "${stepText}"`
            };
        } else {
            result = {
                stepText,
                matched: true,
                definition: matches.definition,
                parameters: matches.parameters,
                regex: matches.definition.pattern as RegExp
            };
        }
        
        // Cache the result
        this.stepMatchCache.set(stepText, result);
        return result;
    }

    /**
     * Validate feature structure
     */
    validateFeatureStructure(feature: Feature): boolean {
        try {
            // Basic structure validation
            if (!feature.name || feature.name.trim() === '') {
                logger.error('Feature must have a name');
                return false;
            }
            
            if (!feature.scenarios || feature.scenarios.length === 0) {
                logger.warn(`Feature "${feature.name}" has no scenarios`);
            }
            
            // Validate scenarios
            for (const scenario of feature.scenarios) {
                if (!this.validateScenarioStructure(scenario)) {
                    return false;
                }
            }
            
            return true;
            
        } catch (error) {
            logger.error(`Feature validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    /**
     * Extract feature annotations
     */
    extractFeatureAnnotations(lines: string[]): Annotations {
        // Use the tag parser for proper annotation processing
        const parsed = this.tagParser.parseAnnotations(lines);
        
        const annotations: Annotations = {
            tags: parsed.tags,
            metadata: parsed.metadata
        };
        
        // Handle data source metadata
        if (parsed.metadata['dataSource']) {
            annotations.dataSource = parsed.metadata['dataSource'];
        }
        
        if (parsed.metadata['testCase']) {
            annotations.testCase = parsed.metadata['testCase'];
        }
        
        return annotations;
    }

    /**
     * Extract scenario outlines into scenarios
     */
    extractScenarioOutlines(scenario: Scenario): Scenario[] {
        if (!scenario.examples || scenario.examples.length === 0) {
            return [scenario];
        }
        
        const scenarios: Scenario[] = [];
        
        // Use the examples parser to properly expand scenario outlines
        if (scenario.type === 'scenario_outline') {
            const expandedScenarios = this.examplesParser.expandScenarioOutline(scenario as any);
            scenarios.push(...expandedScenarios);
        } else {
            scenarios.push(scenario);
        }
        
        return scenarios;
    }

    /**
     * Load feature test data from annotations
     */
    async loadFeatureTestData(annotations: Annotations): Promise<any[]> {
        if (!annotations.dataSource) {
            return [];
        }
        
        const rawData = await this.dataProvider.loadData({
            source: annotations.dataSource.source,
            type: annotations.dataSource.type
        } as any);
        
        // If the data contains table format, parse it using dataTableParser
        if (Array.isArray(rawData) && rawData.length > 0 && typeof rawData[0] === 'string') {
            try {
                // Convert to string array for table parsing
                const stringArray = rawData.map(item => String(item));
                const dataTable = this.dataTableParser.parseTable(stringArray);
                return dataTable.hashes();
            } catch (error) {
                // If parsing fails, return raw data
                return rawData;
            }
        }
        
        return rawData;
    }

    /**
     * Generate step parameters from step text and pattern
     */
    generateStepParameters(stepText: string, pattern: RegExp): any[] {
        const match = stepText.match(pattern);
        return match ? match.slice(1) : [];
    }

    /**
     * Validate all step definitions
     */
    async validateStepDefinitions(): Promise<ValidationResult> {
        if (!this.config.validateSteps) {
            return { valid: true, errors: [], warnings: [] };
        }
        
        logger.info('Validating step definitions...');
        
        const errors: ValidationError[] = [];
        const allSteps = new Set<string>();
        
        // Collect all steps from parsed features
        for (const feature of this.featuresCache.values()) {
            for (const scenario of feature.scenarios) {
                for (const step of scenario.steps) {
                    allSteps.add(step.text);
                }
            }
        }
        
        // Check each step for matching definitions
        for (const stepText of allSteps) {
            const match = this.findMatchingStep(stepText);
            if (!match.matched) {
                errors.push({
                    type: 'step_definition',
                    message: match.error || `No definition found for step: "${stepText}"`,
                    stepText,
                    severity: 'error'
                });
            }
        }
        
        const isValid = errors.length === 0;
        logger.info(`Step validation completed: ${isValid ? 'PASSED' : 'FAILED'} (${errors.length} errors)`);
        
        return {
            valid: isValid,
            errors,
            warnings: []
        };
    }

    /**
     * Generate missing steps report
     */
    generateMissingStepsReport(): MissingStepsReport {
        const missingSteps: string[] = [];
        const ambiguousSteps: { step: string; matches: string[] }[] = [];
        const totalSteps = new Set<string>();
        
        // Collect all unique steps
        for (const feature of this.featuresCache.values()) {
            for (const scenario of feature.scenarios) {
                for (const step of scenario.steps) {
                    totalSteps.add(step.text);
                }
            }
        }
        
        // Check each step
        for (const stepText of totalSteps) {
            const match = this.findMatchingStep(stepText);
            if (!match.matched) {
                if (match.ambiguousMatches && match.ambiguousMatches.length > 0) {
                    ambiguousSteps.push({
                        step: stepText,
                        matches: match.ambiguousMatches
                    });
                } else {
                    missingSteps.push(stepText);
                }
            }
        }
        
        return {
            totalSteps: totalSteps.size,
            missingSteps,
            ambiguousSteps,
            summary: {
                total: totalSteps.size,
                missing: missingSteps.length,
                ambiguous: ambiguousSteps.length,
                valid: totalSteps.size - missingSteps.length - ambiguousSteps.length
            }
        };
    }

    /**
     * Discover and parse features from configured paths
     */
    async discoverFeatures(): Promise<FeatureDiscoveryResult> {
        logger.info(`Discovering features from ${this.config.featurePaths.length} path(s)...`);
        
        const allFeaturePaths: string[] = [];
        
        // Discover feature files
        for (const searchPath of this.config.featurePaths) {
            try {
                const discoveredPaths = await this.featureFileParser.discoverFeatureFiles(searchPath);
                allFeaturePaths.push(...discoveredPaths);
            } catch (error) {
                logger.error(`Failed to discover features in ${searchPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        
        logger.info(`Discovered ${allFeaturePaths.length} feature file(s)`);
        
        // Parse discovered features
        const features: Feature[] = [];
        const failedFiles: string[] = [];
        const validationErrors: ValidationError[] = [];
        
        for (const filePath of allFeaturePaths) {
            try {
                const feature = await this.featureFileParser.parseFile(filePath);
                
                // Validate feature structure
                if (this.config.validateSteps && !this.validateFeatureStructure(feature)) {
                    failedFiles.push(filePath);
                    validationErrors.push({
                        type: 'feature_structure',
                        message: `Invalid feature structure in ${filePath}`,
                        stepText: feature.name,
                        severity: 'error'
                    });
                    continue;
                }
                
                features.push(feature);
                
            } catch (error) {
                failedFiles.push(filePath);
                validationErrors.push({
                    type: 'parse_error',
                    message: `Failed to parse ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    stepText: filePath,
                    severity: 'error'
                });
            }
        }
        
        return {
            features,
            totalFiles: allFeaturePaths.length,
            parsedFiles: features.length,
            failedFiles,
            validationErrors
        };
    }

    /**
     * Get engine statistics
     */
    getStatistics() {
        return {
            cachedFeatures: this.featuresCache.size,
            cachedStepMatches: this.stepMatchCache.size,
            registeredSteps: stepRegistry.getStats().totalSteps,
            config: { ...this.config }
        };
    }

    /**
     * Clear all caches with size limits and reporting
     */
    clearCaches(): void {
        const featureCount = this.featuresCache.size;
        const stepMatchCount = this.stepMatchCache.size;
        
        this.featuresCache.clear();
        this.stepMatchCache.clear();
        
        logger.info(`🧹 BDD Engine caches cleared: ${featureCount} features, ${stepMatchCount} step matches`);
    }

    /**
     * Limit cache sizes to prevent memory exhaustion
     */
    limitCacheSizes(): void {
        const MAX_FEATURES = 1000;
        const MAX_STEP_MATCHES = 10000;
        
        // Limit features cache
        if (this.featuresCache.size > MAX_FEATURES) {
            const toDelete = this.featuresCache.size - MAX_FEATURES;
            const keys = Array.from(this.featuresCache.keys()).slice(0, toDelete);
            keys.forEach(key => this.featuresCache.delete(key));
            logger.debug(`🗑️ Trimmed ${toDelete} old features from cache`);
        }
        
        // Limit step matches cache
        if (this.stepMatchCache.size > MAX_STEP_MATCHES) {
            const toDelete = this.stepMatchCache.size - MAX_STEP_MATCHES;
            const keys = Array.from(this.stepMatchCache.keys()).slice(0, toDelete);
            keys.forEach(key => this.stepMatchCache.delete(key));
            logger.debug(`🗑️ Trimmed ${toDelete} old step matches from cache`);
        }
    }

    // Private methods

    private async validateConfiguration(): Promise<void> {
        if (!this.config.featurePaths || this.config.featurePaths.length === 0) {
            throw new Error('At least one feature path must be configured');
        }
        
        // Validate feature paths exist
        for (const featurePath of this.config.featurePaths) {
            // Path validation would go here
            logger.debug(`Validating feature path: ${featurePath}`);
        }
    }

    private async processFeatureDataAnnotations(feature: Feature): Promise<void> {
        // Extract and process data annotations from feature tags
        const annotations = this.extractFeatureAnnotations(
            feature.tags.map(tag => `@${tag}`)
        );
        
        // Load test data if data source annotation exists
        if (annotations.dataSource) {
            try {
                const testData = await this.loadFeatureTestData(annotations);
                // Store test data in feature metadata
                (feature as any).testData = testData;
                logger.debug(`Loaded ${testData.length} test data rows for feature: ${feature.name}`);
            } catch (error) {
                logger.error(`Failed to load test data for feature ${feature.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }

    private validateScenarioStructure(scenario: Scenario): boolean {
        if (!scenario.name || scenario.name.trim() === '') {
            logger.error('Scenario must have a name');
            return false;
        }
        
        if (!scenario.steps || scenario.steps.length === 0) {
            logger.warn(`Scenario "${scenario.name}" has no steps`);
        }
        
        return true;
    }
}

// Export singleton instance
export const bddEngine = CSBDDEngine.getInstance();