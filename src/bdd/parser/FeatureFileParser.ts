import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { GherkinLexer } from './GherkinLexer';
import { GherkinParser } from './GherkinParser';
import { Feature, ValidationResult, ValidationError, ParseError } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';

export class FeatureFileParser {
  private static instance: FeatureFileParser;
  private readonly lexer: GherkinLexer;
  private readonly parser: GherkinParser;
  private readonly featureCache: Map<string, { feature: Feature; timestamp: number }> = new Map();
  private readonly cacheTimeout: number = 5000; // 5 seconds
  private readonly encoding: BufferEncoding = 'utf-8';
  private readonly featureFileExtension: string = '.feature';
  
  private constructor() {
    this.lexer = new GherkinLexer();
    this.parser = new GherkinParser();
  }
  
  static getInstance(): FeatureFileParser {
    if (!FeatureFileParser.instance) {
      FeatureFileParser.instance = new FeatureFileParser();
    }
    return FeatureFileParser.instance;
  }
  
  async parseFile(filePath: string): Promise<Feature> {
    const startTime = Date.now();
    const logger = Logger.getInstance();
    ActionLogger.logInfo('[PARSER] Starting file parse', { operation: 'parseFile', filePath });
    
    try {
      // Validate file exists and is a feature file
      await this.validateFilePath(filePath);
      
      // Check cache first
      const cached = this.getCachedFeature(filePath);
      if (cached) {
        logger.debug(`Using cached feature for: ${filePath}`);
        return cached;
      }
      
      // Read file content
      const content = await this.readFeatureFile(filePath);
      
      // Parse the feature
      const feature = await this.parseContent(content, filePath);
      
      // Cache the result
      this.cacheFeature(filePath, feature);
      
      const duration = Date.now() - startTime;
      ActionLogger.logInfo('[PARSER] File parse complete', { operation: 'parseFile.complete', filePath, duration });
      
      return feature;
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      const line = error instanceof Error && 'line' in error ? (error as any).line : undefined;
      const column = error instanceof Error && 'column' in error ? (error as any).column : undefined;
      
      const parseError = new ParseError(message, line, column, filePath);
      
      // Preserve stack trace if available
      if (error instanceof Error && error.stack) {
        parseError.stack = error.stack;
      }
      
      ActionLogger.logError('[PARSER] File parse error', parseError);
      throw parseError;
    }
  }
  
  async parseAll(pattern: string | string[]): Promise<Feature[]> {
    const startTime = Date.now();
    const logger = Logger.getInstance();
    ActionLogger.logInfo('[PARSER] Starting pattern parse', { operation: 'parseAll', pattern });
    
    try {
      // Handle both string and array patterns
      const patternString = Array.isArray(pattern) ? pattern.join(',') : pattern;
      
      // Find all matching feature files
      const files = await this.findFeatureFiles(patternString);
      
      if (files.length === 0) {
        logger.warn(`No feature files found matching pattern: ${pattern}`);
        return [];
      }
      
      logger.info(`Found ${files.length} feature files to parse`);
      
      // Parse all files in parallel with error handling
      const parsePromises = files.map(async (file) => {
        try {
          return await this.parseFile(file);
        } catch (error) {
          logger.error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
          // Return null for failed parses, filter out later
          return null;
        }
      });
      
      const results = await Promise.all(parsePromises);
      
      // Filter out failed parses
      const features = results.filter(feature => feature !== null) as Feature[];
      
      const duration = Date.now() - startTime;
      ActionLogger.logInfo('[PARSER] Pattern parse complete', {
        operation: 'parseAll.complete',
        pattern,
        totalFiles: files.length,
        successfulParses: features.length,
        failedParses: files.length - features.length,
        duration
      });
      
      return features;
      
    } catch (error) {
      ActionLogger.logError('[PARSER] Pattern parse error', {
        pattern,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
  
  async parseContent(content: string, filePath: string): Promise<Feature> {
    try {
      // Normalize line endings
      const normalizedContent = this.normalizeLineEndings(content);
      
      // Tokenize the content
      const tokens = this.lexer.tokenize(normalizedContent, filePath);
      
      // Parse tokens into feature
      const feature = this.parser.parse(tokens, filePath);
      
      // Set file information
      feature.uri = filePath;
      feature.name = feature.name || path.basename(filePath, this.featureFileExtension);
      
      // Validate the parsed feature
      const validation = await this.validate(feature);
      if (!validation.valid) {
        throw new Error(`Feature validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }
      
      return feature;
      
    } catch (error) {
      if (error instanceof Error && 'line' in error) {
        throw error; // Already a parse error
      }
      
      throw {
        file: filePath,
        line: 0,
        column: 0,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }
  
  async validate(feature: Feature): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    
    // Validate feature structure
    if (!feature.name || feature.name.trim() === '') {
      errors.push({ type: 'validation', message: 'Feature must have a name', stepText: '', severity: 'error' });
    }
    
    if (!feature.scenarios || feature.scenarios.length === 0) {
      errors.push({ type: 'validation', message: 'Feature must have at least one scenario', stepText: '', severity: 'error' });
    }
    
    // Validate scenarios
    feature.scenarios.forEach((scenario, index) => {
      if (!scenario.name || scenario.name.trim() === '') {
        errors.push({ type: 'validation', message: `Scenario at index ${index} must have a name`, stepText: '', severity: 'error' });
      }
      
      if (!scenario.steps || scenario.steps.length === 0) {
        errors.push({ type: 'validation', message: `Scenario "${scenario.name}" must have at least one step`, stepText: scenario.name, severity: 'error' });
      }
      
      // Validate steps
      scenario.steps.forEach((step, stepIndex) => {
        if (!step.text || step.text.trim() === '') {
          errors.push({ type: 'validation', message: `Step at index ${stepIndex} in scenario "${scenario.name}" must have text`, stepText: scenario.name, severity: 'error' });
        }
        
        if (!step.keyword) {
          errors.push({ type: 'validation', message: `Step at index ${stepIndex} in scenario "${scenario.name}" must have a keyword`, stepText: scenario.name, severity: 'error' });
        }
      });
      
      // Validate scenario outline
      if (scenario.type === 'scenario_outline') {
        if (!scenario.examples || scenario.examples.length === 0) {
          errors.push({ type: 'validation', message: `Scenario Outline "${scenario.name}" must have examples`, stepText: scenario.name, severity: 'error' });
        }
        
        // Check if all placeholders in steps exist in examples
        const placeholders = this.extractPlaceholders(scenario);
        const exampleHeaders = scenario.examples?.[0]?.header || [];
        
        placeholders.forEach(placeholder => {
          if (!exampleHeaders.includes(placeholder)) {
            errors.push({ type: 'validation', message: `Placeholder <${placeholder}> in scenario "${scenario.name}" not found in examples`, stepText: scenario.name, severity: 'error' });
          }
        });
      }
    });
    
    // Validate tags
    this.validateTags(feature, errors);
    
    // Validate unique scenario names
    const scenarioNames = new Set<string>();
    feature.scenarios.forEach(scenario => {
      if (scenarioNames.has(scenario.name)) {
        errors.push({ type: 'validation', message: `Duplicate scenario name: "${scenario.name}"`, stepText: scenario.name, severity: 'error' });
      }
      scenarioNames.add(scenario.name);
    });
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }
  
  private async validateFilePath(filePath: string): Promise<void> {
    // Check if file exists
    const exists = await FileUtils.exists(filePath);
    if (!exists) {
      throw new Error(`Feature file not found: ${filePath}`);
    }
    
    // Check if it's a feature file
    if (!filePath.endsWith(this.featureFileExtension)) {
      throw new Error(`Invalid file extension. Expected ${this.featureFileExtension}: ${filePath}`);
    }
    
    // Check if it's a file (not directory)
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }
  }
  
  private async readFeatureFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, { encoding: this.encoding });
      
      // Check for BOM and remove if present
      const bomRemoved = this.removeBOM(content);
      
      // Validate content is not empty
      if (!bomRemoved || bomRemoved.trim() === '') {
        throw new Error('Feature file is empty');
      }
      
      return bomRemoved;
      
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
          throw new Error(`Feature file not found: ${filePath}`);
        } else if (nodeError.code === 'EACCES') {
          throw new Error(`Permission denied reading feature file: ${filePath}`);
        }
      }
      throw error;
    }
  }
  
  async discoverFeatureFiles(pattern: string): Promise<string[]> {
    return this.findFeatureFiles(pattern);
  }

  private async findFeatureFiles(pattern: string): Promise<string[]> {
    try {
      // Support multiple patterns separated by comma
      const patterns = pattern.split(',').map(p => p.trim());
      
      const allFiles = new Set<string>();
      
      for (const singlePattern of patterns) {
        // Handle direct file paths
        if (singlePattern.endsWith(this.featureFileExtension) && !singlePattern.includes('*')) {
          const exists = await FileUtils.exists(singlePattern);
          if (exists) {
            allFiles.add(path.resolve(singlePattern));
          }
          continue;
        }
        
        // Handle glob patterns with timeout
        const globPattern = singlePattern.includes('*') 
          ? singlePattern 
          : `${singlePattern}/**/*${this.featureFileExtension}`;
          
        // Add timeout to prevent hanging
        const globPromise = glob(globPattern, {
          absolute: true,
          nodir: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
          maxDepth: 10 // Limit search depth
        });
        
        const timeoutPromise = new Promise<string[]>((_, reject) => {
          setTimeout(() => reject(new Error(`Glob pattern timeout: ${globPattern}`)), 8000);
        });
        
        const globResult = await Promise.race([globPromise, timeoutPromise]);
        const files = Array.isArray(globResult) ? globResult.map(f => String(f)) : [];
        
        files.forEach(file => allFiles.add(file));
      }
      
      return Array.from(allFiles).sort();
      
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error(`Error finding feature files: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  private normalizeLineEndings(content: string): string {
    // Normalize to LF
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  
  private removeBOM(content: string): string {
    // Remove UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      return content.slice(1);
    }
    return content;
  }
  
  private getCachedFeature(filePath: string): Feature | null {
    const cached = this.featureCache.get(filePath);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is still valid
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTimeout) {
      this.featureCache.delete(filePath);
      return null;
    }
    
    return cached.feature;
  }
  
  private cacheFeature(filePath: string, feature: Feature): void {
    this.featureCache.set(filePath, {
      feature,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.featureCache.size > 100) {
      // Remove oldest entries
      const entries = Array.from(this.featureCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20 entries
      for (let i = 0; i < 20; i++) {
        const entry = entries[i];
        if (entry) {
          this.featureCache.delete(entry[0]);
        }
      }
    }
  }
  
  private extractPlaceholders(scenario: any): string[] {
    const placeholders = new Set<string>();
    
    scenario.steps.forEach((step: any) => {
      // Extract placeholders from step text
      const matches = step.text.match(/<([^>]+)>/g);
      if (matches) {
        matches.forEach((match: string) => {
          const placeholder = match.slice(1, -1); // Remove < and >
          placeholders.add(placeholder);
        });
      }
      
      // Check data table cells
      if (step.dataTable) {
        step.dataTable.rows.forEach((row: any) => {
          row.cells.forEach((cell: any) => {
            const cellMatches = cell.match(/<([^>]+)>/g);
            if (cellMatches) {
              cellMatches.forEach((match: string) => {
                const placeholder = match.slice(1, -1);
                placeholders.add(placeholder);
              });
            }
          });
        });
      }
      
      // Check doc string
      if (step.docString) {
        const docMatches = step.docString.content.match(/<([^>]+)>/g);
        if (docMatches) {
          docMatches.forEach((match: string) => {
            const placeholder = match.slice(1, -1);
            placeholders.add(placeholder);
          });
        }
      }
    });
    
    return Array.from(placeholders);
  }
  
  private validateTags(feature: Feature, errors: ValidationError[]): void {
    // Validate feature tags
    if (feature.tags) {
      feature.tags.forEach(tag => {
        if (!tag.startsWith('@')) {
          errors.push({ type: 'validation', message: `Invalid tag format: "${tag}". Tags must start with @`, stepText: tag, severity: 'error' });
        }
        
        if (!/^@[a-zA-Z0-9_:\-]+$/.test(tag)) {
          errors.push({ type: 'validation', message: `Invalid tag format: "${tag}". Tags can only contain letters, numbers, underscores, colons, and hyphens`, stepText: tag, severity: 'error' });
        }
      });
    }
    
    // Validate scenario tags
    feature.scenarios.forEach(scenario => {
      if (scenario.tags) {
        scenario.tags.forEach(tag => {
          if (!tag.startsWith('@')) {
            errors.push({ type: 'validation', message: `Invalid tag format in scenario "${scenario.name}": "${tag}"`, stepText: tag, severity: 'error' });
          }
          
          if (!/^@[a-zA-Z0-9_:\-]+$/.test(tag)) {
            errors.push({ type: 'validation', message: `Invalid tag format in scenario "${scenario.name}": "${tag}"`, stepText: tag, severity: 'error' });
          }
        });
      }
    });
  }
  
  clearCache(): void {
    this.featureCache.clear();
    const logger = Logger.getInstance();
    logger.debug('Feature parser cache cleared');
  }
  
  getCacheStats(): { size: number; files: string[] } {
    return {
      size: this.featureCache.size,
      files: Array.from(this.featureCache.keys())
    };
  }
}

// Export singleton instance
export const featureFileParser = FeatureFileParser.getInstance();