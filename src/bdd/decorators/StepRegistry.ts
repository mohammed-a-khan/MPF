// src/bdd/decorators/StepRegistry.ts

import { StepDefinition, StepPattern, Hook, HookType, HookFn, StepDefinitionMetadata, RegistryStats } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class StepRegistry {
  private static instance: StepRegistry | null = null;
  private readonly stepDefinitions: Map<string, StepDefinition>;
  private readonly hooks: Map<HookType, Hook[]>;
  private readonly patternCache: Map<string, RegExp>;
  private readonly duplicateChecker: Map<string, string>;
  private readonly loadedFiles: Set<string>;
  private readonly classInstances: Map<string, any>;
  private readonly logger: Logger;
  private isLocked: boolean = false;
  private isInitialized: boolean = false;

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

  public static getInstance(): StepRegistry {
    if (!StepRegistry.instance) {
      StepRegistry.instance = new StepRegistry();
    }
    return StepRegistry.instance;
  }

  public initialize(): void {
    if (this.isInitialized) {
      this.logger.debug('StepRegistry already initialized');
      return;
    }

    this.clear();
    this.isInitialized = true;
    this.isLocked = false;
    this.logger.info('StepRegistry initialized');
  }

  private initializeHookTypes(): void {
    const hookTypes: HookType[] = [
      HookType.Before,
      HookType.After,
      HookType.BeforeStep,
      HookType.AfterStep,
      HookType.BeforeAll,
      HookType.AfterAll
    ];
    hookTypes.forEach(type => {
      this.hooks.set(type, []);
    });
  }

  public registerClassInstance(className: string, instance: any): void {
    this.classInstances.set(className, instance);
    this.logger.debug(`Registered class instance: ${className}`);
  }

  public getClassInstance(className: string): any {
    return this.classInstances.get(className);
  }

  public registerStep(
    pattern: StepPattern,
    implementation: Function,
    metadata: StepDefinitionMetadata
  ): void {
    if (!this.isInitialized) {
      this.initialize();
    }

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

    const regex = this.createRegex(pattern);
    
    const stepDefinition: StepDefinition = {
      pattern: regex,
      patternString,
      implementation,
      metadata,
      parameterCount: this.countParameters(regex),
      timeout: metadata['timeout'] || 30000
    };

    const key = this.generateKey(patternString);
    this.stepDefinitions.set(key, stepDefinition);
    const filePath = metadata['filePath'] || metadata.file || 'unknown';
    const line = metadata['line'] || 0;
    this.duplicateChecker.set(patternString, `${filePath}:${line}`);

    ActionLogger.logInfo(`Step registered: "${patternString}" from ${filePath}`);
    this.logger.debug(`Registered step: "${patternString}" from ${filePath}`);
  }

  public registerHook(
    type: HookType,
    implementation: HookFn,
    options?: {
      tags?: string;
      order?: number;
      timeout?: number;
      name?: string;
    }
  ): void {
    if (this.isLocked && type !== HookType.BeforeAll && type !== HookType.AfterAll) {
      throw new Error('StepRegistry is locked. Cannot register new hooks after test execution has started.');
    }

    const hook: Hook = {
      type,
      implementation,
      order: options?.order || 0,
      timeout: options?.timeout || 30000,
      name: options?.name || implementation.name || 'anonymous'
    };

    if (options?.tags !== undefined) {
      hook.tags = [options.tags];
    }

    const hooksOfType = this.hooks.get(type) || [];
    hooksOfType.push(hook);
    
    hooksOfType.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    this.hooks.set(type, hooksOfType);

    ActionLogger.logInfo(`Hook registered: ${type} - ${hook.name}`);
    this.logger.debug(`Registered ${type} hook: ${hook.name}`);
  }

  public findStepWithParameters(stepText: string): { definition: StepDefinition; parameters: any[] } | null {
    const definition = this.findStepDefinition(stepText);
    if (!definition) {
      return null;
    }
    
    const parameters = this.extractParameters(stepText, definition);
    return { definition, parameters };
  }

  public findStepDefinition(stepText: string): StepDefinition | null {
    const normalizedText = this.normalizeStepText(stepText);
    
    const exactKey = this.generateKey(normalizedText);
    const exactMatch = this.stepDefinitions.get(exactKey);
    if (exactMatch && this.matchesPattern(normalizedText, exactMatch)) {
      return exactMatch;
    }

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

    matches.sort((a, b) => b.score - a.score);

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

  public getAllStepDefinitions(): StepDefinition[] {
    return Array.from(this.stepDefinitions.values());
  }

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

  public markFileLoaded(filePath: string): void {
    this.loadedFiles.add(filePath);
  }

  public isFileLoaded(filePath: string): boolean {
    return this.loadedFiles.has(filePath);
  }

  public lock(): void {
    this.isLocked = true;
    this.logger.info('StepRegistry locked. No new registrations allowed.');
  }

  public unlock(): void {
    this.isLocked = false;
    this.logger.info('StepRegistry unlocked.');
  }

  public clear(): void {
    if (this.isLocked) {
      throw new Error('Cannot clear StepRegistry while locked');
    }
    this.stepDefinitions.clear();
    this.hooks.clear();
    this.patternCache.clear();
    this.duplicateChecker.clear();
    this.loadedFiles.clear();
    this.classInstances.clear();
    this.initializeHookTypes();
    this.isInitialized = false;
    this.logger.info('StepRegistry cleared');
  }

  private createRegex(pattern: StepPattern): RegExp {
    if (pattern instanceof RegExp) {
      return pattern;
    }

    const cached = this.patternCache.get(pattern);
    if (cached) {
      return cached;
    }

    let regexPattern = pattern;
    
    regexPattern = regexPattern
      .replace(/\\/g, '\\\\')
      .replace(/\^/g, '\\^')
      .replace(/\$/g, '\\$')
      .replace(/\./g, '\\.')
      .replace(/\|/g, '\\|')
      .replace(/\?(?![^{]*})/g, '\\?')
      .replace(/\*(?![^{]*})/g, '\\*')
      .replace(/\+(?![^{]*})/g, '\\+')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    regexPattern = regexPattern
      .replace(/\{string\}/g, '"([^"]*)"')
      .replace(/\{int\}/g, '(-?\\d+)')
      .replace(/\{float\}/g, '(-?\\d*\\.?\\d+)')
      .replace(/\{word\}/g, '(\\w+)')
      .replace(/\{any\}/g, '(.*)');
      

    const regex = new RegExp(`^${regexPattern}$`);
    this.patternCache.set(pattern, regex);
    
    return regex;
  }

  private countParameters(regex: RegExp): number {
    const match = regex.source.match(/\([^)]*\)/g);
    return match ? match.length : 0;
  }

  private generateKey(pattern: string): string {
    return pattern.toLowerCase().replace(/\s+/g, '_');
  }

  private normalizeStepText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }

  private matchesPattern(text: string, definition: StepDefinition): boolean {
    const pattern = definition.pattern;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return regex.test(text);
  }

  private extractParameters(text: string, definition: StepDefinition): any[] {
    const pattern = definition.pattern;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const match = text.match(regex);
    
    if (!match) {
      return [];
    }
    
    const parameters = match.slice(1);
    
    return parameters.map(param => {
      if (param === undefined) return param;
      
      if (/^-?\d+$/.test(param)) {
        return parseInt(param, 10);
      }
      
      if (/^-?\d*\.\d+$/.test(param)) {
        return parseFloat(param);
      }
      
      if (param.startsWith('"') && param.endsWith('"')) {
        return param.slice(1, -1);
      }
      
      return param;
    });
  }

  private calculateMatchScore(text: string, definition: StepDefinition): number {
    let score = 0;

    if (definition.patternString === text) {
      score += 1000;
    }

    score += 500 - definition.patternString.length;

    score += 100 - (definition.parameterCount * 10);

    const specialCharCount = (definition.patternString.match(/[.*+?^${}()|[\]\\]/g) || []).length;
    score += 50 - specialCharCount;

    return score;
  }

  private evaluateTagExpression(hookTags: string[], scenarioTags: string[]): boolean {
    return hookTags.some(hookTag => {
      if (hookTag.startsWith('@')) {
        return scenarioTags.includes(hookTag);
      }
      
      return scenarioTags.some(scenarioTag => scenarioTag.includes(hookTag));
    });
  }

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

  public getStepCount(): number {
    return this.stepDefinitions.size;
  }
}

export const stepRegistry = StepRegistry.getInstance();
