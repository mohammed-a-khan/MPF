// src/bdd/decorators/StepRegistry.ts

import { StepDefinition, StepPattern, Hook, HookType, StepDefinitionMetadata, RegistryStats } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Global registry for all step definitions and hooks
 * Thread-safe singleton implementation for managing all BDD components
 */
export class StepRegistry {
  private static instance: StepRegistry;
  private readonly stepDefinitions: Map<string, StepDefinition>;
  private readonly hooks: Map<HookType, Hook[]>;
  private readonly patternCache: Map<string, RegExp>;
  private readonly duplicateChecker: Map<string, string>;
  private readonly loadedFiles: Set<string>;
  private readonly classInstances: Map<string, any>;
  private readonly logger: Logger;
  private isLocked: boolean = false;

  private constructor() {
    this.stepDefinitions = new Map();
    this.hooks = new Map();
    this.patternCache = new Map();
    this.duplicateChecker = new Map();
    this.loadedFiles = new Set();
    this.classInstances = new Map();
    this.logger = Logger.getInstance('StepRegistry');
    this.initializeHookTypes();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): StepRegistry {
    if (!StepRegistry.instance) {
      StepRegistry.instance = new StepRegistry();
    }
    return StepRegistry.instance;
  }

  /**
   * Initialize hook types map
   */
  private initializeHookTypes(): void {
    const hookTypes: HookType[] = ['Before', 'After', 'BeforeStep', 'AfterStep', 'BeforeAll', 'AfterAll'];
    hookTypes.forEach(type => {
      this.hooks.set(type, []);
    });
  }

  /**
   * Register a class instance for step definitions
   */
  public registerClassInstance(className: string, instance: any): void {
    this.classInstances.set(className, instance);
    this.logger.debug(`Registered class instance: ${className}`);
  }

  /**
   * Get class instance by name
   */
  public getClassInstance(className: string): any {
    return this.classInstances.get(className);
  }

  /**
   * Register a step definition
   */
  public registerStep(
    pattern: StepPattern,
    implementation: Function,
    metadata: StepDefinitionMetadata
  ): void {
    if (this.isLocked) {
      throw new Error('StepRegistry is locked. Cannot register new steps after test execution has started.');
    }

    const patternString = typeof pattern === 'string' ? pattern : pattern.source;
    const existingLocation = this.duplicateChecker.get(patternString);

    if (existingLocation) {
      const filePath = metadata['filePath'] || metadata.file || 'unknown';
      const line = metadata['line'] || 0;
      throw new Error(
        `Duplicate step definition detected:\n` +
        `Pattern: "${patternString}"\n` +
        `First defined at: ${existingLocation}\n` +
        `Attempted to redefine at: ${filePath}:${line}`
      );
    }

    // Create regex if pattern is string
    const regex = this.createRegex(pattern);
    
    // Create step definition
    const stepDefinition: StepDefinition = {
      pattern: regex,
      patternString,
      implementation,
      metadata,
      parameterCount: this.countParameters(regex),
      timeout: metadata['timeout'] || 30000
    };

    // Register step
    const key = this.generateKey(patternString);
    this.stepDefinitions.set(key, stepDefinition);
    const filePath = metadata['filePath'] || metadata.file || 'unknown';
    const line = metadata['line'] || 0;
    this.duplicateChecker.set(patternString, `${filePath}:${line}`);

    // Log registration
    ActionLogger.logInfo(`Step registered: "${patternString}" from ${filePath}`);
    this.logger.debug(`Registered step: "${patternString}" from ${filePath}`);
  }

  /**
   * Register a hook
   */
  public registerHook(
    type: HookType,
    implementation: Function,
    options?: {
      tags?: string;
      order?: number;
      timeout?: number;
      name?: string;
    }
  ): void {
    if (this.isLocked && type !== 'BeforeAll' && type !== 'AfterAll') {
      throw new Error('StepRegistry is locked. Cannot register new hooks after test execution has started.');
    }

    const hook: Hook = {
      type,
      implementation,
      order: options?.order || 0,
      timeout: options?.timeout || 30000,
      name: options?.name || implementation.name || 'anonymous'
    };

    // Handle tags - convert string to array if provided
    if (options?.tags !== undefined) {
      hook.tags = [options.tags];
    }

    const hooksOfType = this.hooks.get(type) || [];
    hooksOfType.push(hook);
    
    // Sort hooks by order
    hooksOfType.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    this.hooks.set(type, hooksOfType);

    ActionLogger.logInfo(`Hook registered: ${type} - ${hook.name}`);
    this.logger.debug(`Registered ${type} hook: ${hook.name}`);
  }

  /**
   * Find step definition with parameters extracted
   */
  public findStepWithParameters(stepText: string): { definition: StepDefinition; parameters: any[] } | null {
    const definition = this.findStepDefinition(stepText);
    if (!definition) {
      return null;
    }
    
    const parameters = this.extractParameters(stepText, definition);
    return { definition, parameters };
  }

  /**
   * Find step definition matching the step text
   */
  public findStepDefinition(stepText: string): StepDefinition | null {
    const normalizedText = this.normalizeStepText(stepText);
    
    // Try exact match first (for performance)
    const exactKey = this.generateKey(normalizedText);
    const exactMatch = this.stepDefinitions.get(exactKey);
    if (exactMatch && this.matchesPattern(normalizedText, exactMatch)) {
      return exactMatch;
    }

    // Try pattern matching
    const matches: Array<{ definition: StepDefinition; score: number }> = [];
    
    const entries = Array.from(this.stepDefinitions.entries());
    for (const [, definition] of entries) {
      if (this.matchesPattern(normalizedText, definition)) {
        const score = this.calculateMatchScore(normalizedText, definition);
        matches.push({ definition, score });
      }
    }

    if (matches.length === 0) {
      return null;
    }

    const firstMatch = matches[0];
    if (matches.length === 1 && firstMatch) {
      return firstMatch.definition;
    }

    // Sort by score (higher is better)
    matches.sort((a, b) => b.score - a.score);

    // Check for ambiguous matches
    const first = matches[0];
    const second = matches[1];
    if (first && second && first.score === second.score) {
      const ambiguousPatterns = matches
        .filter(m => m.score === first.score)
        .map(m => m.definition.patternString)
        .join('\n  - ');
      
      throw new Error(
        `Ambiguous step definitions for: "${stepText}"\n` +
        `Multiple patterns match with equal score:\n  - ${ambiguousPatterns}`
      );
    }

    return first ? first.definition : null;
  }

  /**
   * Get hooks of specific type
   */
  public getHooks(type: HookType, tags?: string[]): Hook[] {
    const allHooks = this.hooks.get(type) || [];
    
    if (!tags || tags.length === 0) {
      return allHooks.filter(hook => !hook.tags);
    }

    return allHooks.filter(hook => {
      if (!hook.tags) return true;
      return this.evaluateTagExpression(hook.tags, tags);
    });
  }

  /**
   * Get all registered step definitions
   */
  public getAllStepDefinitions(): StepDefinition[] {
    return Array.from(this.stepDefinitions.values());
  }

  /**
   * Get registry statistics
   */
  public getStats(): RegistryStats {
    const stats: RegistryStats = {
      totalSteps: this.stepDefinitions.size,
      totalHooks: 0,
      hooksByType: {},
      loadedFiles: this.loadedFiles.size
    };

    const hookEntries = Array.from(this.hooks.entries());
    for (const [type, hooks] of hookEntries) {
      stats.hooksByType[type] = hooks.length;
      stats.totalHooks += hooks.length;
    }

    return stats;
  }

  /**
   * Mark file as loaded
   */
  public markFileLoaded(filePath: string): void {
    this.loadedFiles.add(filePath);
  }

  /**
   * Check if file is loaded
   */
  public isFileLoaded(filePath: string): boolean {
    return this.loadedFiles.has(filePath);
  }

  /**
   * Lock registry (prevent new registrations)
   */
  public lock(): void {
    this.isLocked = true;
    this.logger.info('StepRegistry locked. No new registrations allowed.');
  }

  /**
   * Unlock registry
   */
  public unlock(): void {
    this.isLocked = false;
    this.logger.info('StepRegistry unlocked.');
  }

  /**
   * Clear all registrations (for testing)
   */
  public clear(): void {
    if (this.isLocked) {
      throw new Error('Cannot clear locked registry');
    }
    
    this.stepDefinitions.clear();
    this.hooks.clear();
    this.patternCache.clear();
    this.duplicateChecker.clear();
    this.loadedFiles.clear();
    this.initializeHookTypes();
    
    this.logger.info('StepRegistry cleared');
  }

  /**
   * Create regex from pattern
   */
  private createRegex(pattern: StepPattern): RegExp {
    if (pattern instanceof RegExp) {
      return pattern;
    }

    // Check cache
    const cached = this.patternCache.get(pattern);
    if (cached) {
      return cached;
    }

    // Convert Cucumber expression to regex
    let regexPattern = pattern;
    
    // First, escape special regex characters in literal text (but preserve Cucumber expressions)
    regexPattern = regexPattern
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/\^/g, '\\^')
      .replace(/\$/g, '\\$')
      .replace(/\./g, '\\.')
      .replace(/\|/g, '\\|')
      .replace(/\?(?![^{]*})/g, '\\?')  // Don't escape ? inside Cucumber expressions
      .replace(/\*(?![^{]*})/g, '\\*')  // Don't escape * inside Cucumber expressions
      .replace(/\+(?![^{]*})/g, '\\+')  // Don't escape + inside Cucumber expressions
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    // Then replace Cucumber expressions with regex patterns
    regexPattern = regexPattern
      // {string} -> quoted string
      .replace(/\{string\}/g, '"([^"]*)"')
      // {int} -> integer
      .replace(/\{int\}/g, '(-?\\d+)')
      // {float} -> floating point
      .replace(/\{float\}/g, '(-?\\d*\\.?\\d+)')
      // {word} -> single word
      .replace(/\{word\}/g, '(\\w+)')
      // {any} -> anything
      .replace(/\{any\}/g, '(.*)');
      
    // Handle optional text separately (after parameter replacement to avoid conflicts)
    // This should be done carefully to not interfere with parameter capture groups
    // For now, we'll skip optional text handling to avoid breaking parameter capture

    const regex = new RegExp(`^${regexPattern}$`);
    this.patternCache.set(pattern, regex);
    
    return regex;
  }

  /**
   * Count parameters in regex
   */
  private countParameters(regex: RegExp): number {
    const match = regex.source.match(/\([^)]*\)/g);
    return match ? match.length : 0;
  }

  /**
   * Generate unique key for step
   */
  private generateKey(pattern: string): string {
    return pattern.toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Normalize step text
   */
  private normalizeStepText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if step text matches pattern
   */
  private matchesPattern(text: string, definition: StepDefinition): boolean {
    const pattern = definition.pattern;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return regex.test(text);
  }

  /**
   * Extract parameters from step text using definition pattern
   */
  private extractParameters(text: string, definition: StepDefinition): any[] {
    const pattern = definition.pattern;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const match = text.match(regex);
    
    if (!match) {
      return [];
    }
    
    // Extract captured groups (skip the full match at index 0)
    const parameters = match.slice(1);
    
    // Convert parameters to appropriate types
    return parameters.map(param => {
      if (param === undefined) return param;
      
      // Try to convert to number
      if (/^-?\d+$/.test(param)) {
        return parseInt(param, 10);
      }
      
      if (/^-?\d*\.\d+$/.test(param)) {
        return parseFloat(param);
      }
      
      // Remove quotes from string parameters
      if (param.startsWith('"') && param.endsWith('"')) {
        return param.slice(1, -1);
      }
      
      return param;
    });
  }

  /**
   * Calculate match score for ambiguity resolution
   */
  private calculateMatchScore(text: string, definition: StepDefinition): number {
    let score = 0;

    // Exact pattern match gets highest score
    if (definition.patternString === text) {
      score += 1000;
    }

    // Shorter patterns are more specific
    score += 500 - definition.patternString.length;

    // Fewer parameters is more specific
    score += 100 - (definition.parameterCount * 10);

    // Patterns without regex special chars are more specific
    const specialCharCount = (definition.patternString.match(/[.*+?^${}()|[\]\\]/g) || []).length;
    score += 50 - specialCharCount;

    return score;
  }

  /**
   * Evaluate tag expression against tags
   */
  private evaluateTagExpression(hookTags: string[], scenarioTags: string[]): boolean {
    // Simple implementation - check if any hook tag matches any scenario tag
    return hookTags.some(hookTag => {
      // Handle simple tag matching
      if (hookTag.startsWith('@')) {
        return scenarioTags.includes(hookTag);
      }
      
      // Handle expressions (simplified)
      return scenarioTags.some(scenarioTag => scenarioTag.includes(hookTag));
    });
  }

  /**
   * Export registry for debugging
   */
  public export(): any {
    return {
      steps: Array.from(this.stepDefinitions.entries()).map(([key, def]) => ({
        key,
        pattern: def.patternString,
        file: def.metadata['filePath'] || def.metadata.file || 'unknown',
        line: def.metadata['line'] || 0
      })),
      hooks: Array.from(this.hooks.entries()).map(([type, hooks]) => ({
        type,
        count: hooks.length,
        hooks: hooks.map(h => ({ name: h.name, order: h.order, tags: h.tags }))
      })),
      stats: this.getStats()
    };
  }
}

// Export singleton instance
export const stepRegistry = StepRegistry.getInstance();