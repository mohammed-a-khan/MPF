// src/bdd/decorators/StepMatcher.ts

import { 
  StepDefinition, 
  MatchResult, 
  ParameterInfo,
  StepMatchScore 
} from '../types/bdd.types';
import { stepRegistry } from './StepRegistry';
import { parameterTypeRegistry } from './ParameterTypeRegistry';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class StepMatcher {
  private static instance: StepMatcher;
  private readonly logger: Logger;
  private readonly matchCache: Map<string, MatchResult | null>;
  private readonly parameterExtractionCache: Map<string, any[]>;

  private constructor() {
    this.logger = Logger.getInstance('StepMatcher');
    this.matchCache = new Map();
    this.parameterExtractionCache = new Map();
  }

  public static getInstance(): StepMatcher {
    if (!StepMatcher.instance) {
      StepMatcher.instance = new StepMatcher();
    }
    return StepMatcher.instance;
  }

  public match(stepText: string): MatchResult | null {
    const cached = this.matchCache.get(stepText);
    if (cached !== undefined) {
      return cached;
    }

    const startTime = Date.now();

    try {
      const stepDefinition = stepRegistry.findStepDefinition(stepText);
      
      if (!stepDefinition) {
        this.matchCache.set(stepText, null);
        return null;
      }

      const parameters = this.extractParameters(stepText, stepDefinition);
      const parameterInfo = this.extractParameterInfo(stepText, stepDefinition, parameters);

      const score = this.calculateMatchScore(stepText, stepDefinition);

      const matchResult: MatchResult = {
        stepDefinition,
        parameters,
        parameterInfo,
        score,
        duration: Date.now() - startTime
      };

      this.matchCache.set(stepText, matchResult);
      
      ActionLogger.logInfo(`Step matched: "${stepText}" -> "${stepDefinition.patternString}" (${matchResult.duration}ms)`);
      
      return matchResult;
    } catch (error) {
      this.logger.error(`Error matching step "${stepText}": ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  public extractParameters(stepText: string, stepDefinition: StepDefinition): any[] {
    const cacheKey = `${stepText}::${stepDefinition.patternString}`;
    
    const cached = this.parameterExtractionCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const regex = this.ensureRegExp(stepDefinition.pattern);
      const match = stepText.match(regex);

      if (!match) {
        return [];
      }

      const rawParameters = match.slice(1);

      const transformedParameters = rawParameters.map((value, index) => {
        return this.transformParameterValue(value, index, stepDefinition.patternString);
      });

      this.parameterExtractionCache.set(cacheKey, transformedParameters);

      return transformedParameters;
    } catch (error) {
      this.logger.error(`Error extracting parameters from "${stepText}"`);
      throw error;
    }
  }

  public findAllMatches(stepText: string): MatchResult[] {
    const matches: MatchResult[] = [];
    const stepDefinitions = stepRegistry.getAllStepDefinitions();

    for (const definition of stepDefinitions) {
      const regex = this.ensureRegExp(definition.pattern);
      if (regex.test(stepText)) {
        try {
          const parameters = this.extractParameters(stepText, definition);
          const parameterInfo = this.extractParameterInfo(stepText, definition, parameters);
          const score = this.calculateMatchScore(stepText, definition);

          matches.push({
            stepDefinition: definition,
            parameters,
            parameterInfo,
            score,
            duration: 0
          });
        } catch (error) {
          this.logger.warn(`Error processing match for pattern ${definition.patternString}`);
        }
      }
    }

    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  public isAmbiguous(matches: MatchResult[]): boolean {
    if (matches.length < 2) {
      return false;
    }

    const first = matches[0];
    const second = matches[1];
    
    return first !== undefined && second !== undefined && first.score === second.score;
  }

  private calculateMatchScore(stepText: string, stepDefinition: StepDefinition): number {
    const scoreDetails: StepMatchScore = {
      total: 0,
      exactMatch: 0,
      patternLength: 0,
      parameterCount: 0,
      specificity: 0
    };

    if (stepDefinition.patternString === stepText) {
      scoreDetails.exactMatch = 1000;
    }

    scoreDetails.patternLength = stepDefinition.patternString.length;

    scoreDetails.parameterCount = 100 - (stepDefinition.parameterCount * 10);

    scoreDetails.specificity = this.calculateSpecificityScore(stepDefinition.pattern);

    scoreDetails.total = 
      scoreDetails.exactMatch +
      scoreDetails.patternLength +
      scoreDetails.parameterCount +
      scoreDetails.specificity;

    return scoreDetails.total;
  }

  private calculateSpecificityScore(pattern: string | RegExp): number {
    const regex = this.ensureRegExp(pattern);
    const source = regex.source;
    let score = 0;

    const literalCount = (source.match(/[a-zA-Z0-9\s]/g) || []).length;
    score += literalCount * 2;

    const specialCount = (source.match(/[.*+?^${}()|[\]\\]/g) || []).length;
    score -= specialCount;

    const boundaryCount = (source.match(/\\b/g) || []).length;
    score += boundaryCount * 5;

    return Math.max(0, score);
  }

  private extractParameterInfo(
    stepText: string,
    stepDefinition: StepDefinition,
    parameters: any[]
  ): ParameterInfo[] {
    const parameterInfo: ParameterInfo[] = [];
    const regex = this.ensureRegExp(stepDefinition.pattern);
    const match = stepText.match(regex);

    if (!match) {
      return parameterInfo;
    }

    let currentIndex = 0;
    
    for (let i = 1; i < match.length; i++) {
      const value = match[i];
      if (value === undefined) continue;
      
      const start = stepText.indexOf(value, currentIndex);
      const end = start + value.length;
      
      parameterInfo.push({
        value: parameters[i - 1],
        type: this.detectParameterType(value) || 'string',
        start,
        end
      });
      
      currentIndex = end;
    }

    return parameterInfo;
  }

  private transformParameterValue(value: string, index: number, pattern: string): any {
    if (!value) {
      return value;
    }

    try {
      const typeHint = this.extractTypeHint(pattern, index);
      
      if (typeHint) {
        return this.transformParameter(value, typeHint);
      }

      const detectedType = this.detectParameterType(value);
      if (detectedType) {
        return this.transformParameter(value, detectedType);
      }

      return value;
    } catch (error) {
      this.logger.warn(`Failed to transform parameter value: ${value}`);
      return value;
    }
  }

  private extractTypeHint(pattern: string, index: number): string | null {
    const typeMatches = pattern.match(/\{(\w+)\}/g);
    
    if (typeMatches && typeMatches[index]) {
      const typeMatch = typeMatches[index];
      if (typeMatch) {
        const match = typeMatch.match(/\{(\w+)\}/);
        return match && match[1] ? match[1] : null;
      }
    }

    return null;
  }

  private detectParameterType(value: string): string | null {
    return parameterTypeRegistry.detectType(value);
  }

  private transformParameter(value: string, typeName: string): any {
    try {
      return parameterTypeRegistry.transform(value, typeName);
    } catch (error) {
      throw new Error(`Failed to transform parameter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private ensureRegExp(pattern: string | RegExp): RegExp {
    return typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  }

  public clearCache(): void {
    this.matchCache.clear();
    this.parameterExtractionCache.clear();
    this.logger.debug('Match caches cleared');
  }

  public getAmbiguousMatchDetails(matches: MatchResult[]): string {
    if (matches.length < 2) {
      return 'No ambiguous matches';
    }

    const names: string[] = [];
    
    if (matches[0] && matches[1] && matches[0].score === matches[1].score) {
      matches.forEach((match) => {
        if (matches[0] && matches[0].score === match.score) {
          names.push(match.stepDefinition.patternString);
        }
      });
    }

    return `Ambiguous step definitions:\n${names.map(n => `  - ${n}`).join('\n')}`;
  }

  public getMatchStats(): {
    cacheSize: number;
    parameterCacheSize: number;
    hitRate: number;
  } {
    return {
      cacheSize: this.matchCache.size,
      parameterCacheSize: this.parameterExtractionCache.size,
      hitRate: 0
    };
  }

  public validateUniqueMatch(stepText: string): void {
    const matches = this.findAllMatches(stepText);
    
    if (matches.length === 0) {
      throw new Error(`Undefined step: "${stepText}"`);
    }

    if (this.isAmbiguous(matches)) {
      throw new Error(this.getAmbiguousMatchDetails(matches));
    }
  }

  public getBestMatchScore(matches: MatchResult[]): number {
    if (matches.length === 0) {
      return 0;
    }

    const scoreGroups = new Map<number, MatchResult[]>();
    
    matches.forEach((match) => {
      const score = match.score;
      if (!scoreGroups.has(score)) {
        scoreGroups.set(score, []);
      }
      scoreGroups.get(score)?.push(match);
    });

    const topScore = Math.max(...Array.from(scoreGroups.keys()));
    const topMatches = scoreGroups.get(topScore) || [];
    
    if (topMatches.length > 1) {
      const stepDefinitionNames: string[] = [];
      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const next = matches[i + 1];
        if (current && next && i < matches.length - 1 && current.score === next.score) {
          if (current) {
            stepDefinitionNames.push(current.stepDefinition.patternString);
          }
        }
      }
      
      this.logger.warn(`Multiple step definitions with same score ${topScore}`);
    }

    return matches[0]?.score || 0;
  }
}

export const stepMatcher = StepMatcher.getInstance();
