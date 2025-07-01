// src/core/ai/engine/PatternMatcher.ts

import { ActionLogger } from '../../logging/ActionLogger';
import { UIPattern, ElementFeatures } from '../types/ai.types';

export class PatternMatcher {
  private patterns: Map<string, UIPattern> = new Map();
  private patternStats: Map<string, PatternStats> = new Map();
  private readonly defaultPatterns: UIPattern[] = [
    {
      name: 'primary-button',
      tags: ['button', 'input'],
      attributes: ['type=submit', 'class*=primary', 'class*=btn-primary', 'id*=submit'],
      weight: 1.2,
      structure: { parent: 'form' }
    },
    {
      name: 'secondary-button',
      tags: ['button', 'a'],
      attributes: ['class*=secondary', 'class*=btn-secondary', 'class*=cancel'],
      weight: 1.0
    },
    {
      name: 'navigation-link',
      tags: ['a'],
      attributes: ['href', 'class*=nav', 'role=navigation'],
      weight: 1.0,
      structure: { parent: 'nav' }
    },
    {
      name: 'form-input',
      tags: ['input', 'textarea'],
      attributes: ['type=text', 'type=email', 'type=password', 'name', 'id'],
      weight: 1.0,
      structure: { parent: 'form' }
    },
    {
      name: 'dropdown-select',
      tags: ['select'],
      attributes: ['name', 'id', 'class*=select', 'class*=dropdown'],
      weight: 1.0
    },
    {
      name: 'checkbox-input',
      tags: ['input'],
      attributes: ['type=checkbox'],
      weight: 1.0
    },
    {
      name: 'radio-input',
      tags: ['input'],
      attributes: ['type=radio'],
      weight: 1.0
    },
    {
      name: 'search-input',
      tags: ['input'],
      attributes: ['type=search', 'placeholder*=search', 'class*=search', 'id*=search'],
      weight: 1.1
    },
    {
      name: 'modal-close',
      tags: ['button', 'a', 'span'],
      attributes: ['class*=close', 'aria-label*=close', 'data-dismiss'],
      weight: 1.1,
      structure: { parent: 'div[class*=modal]' }
    },
    {
      name: 'data-table',
      tags: ['table'],
      attributes: ['class*=table', 'class*=grid', 'role=grid'],
      weight: 1.0
    },
    {
      name: 'card-component',
      tags: ['div', 'article'],
      attributes: ['class*=card', 'class*=panel', 'class*=tile'],
      weight: 0.9
    },
    {
      name: 'alert-message',
      tags: ['div'],
      attributes: ['role=alert', 'class*=alert', 'class*=message', 'class*=notification'],
      weight: 1.1
    },
    {
      name: 'tab-navigation',
      tags: ['a', 'button', 'li'],
      attributes: ['role=tab', 'class*=tab', 'data-toggle=tab'],
      weight: 1.0
    },
    {
      name: 'menu-item',
      tags: ['a', 'button', 'li'],
      attributes: ['role=menuitem', 'class*=menu-item', 'class*=dropdown-item'],
      weight: 1.0
    },
    {
      name: 'pagination-control',
      tags: ['a', 'button'],
      attributes: ['class*=page', 'class*=pagination', 'aria-label*=page'],
      weight: 0.9
    }
  ];

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    for (const pattern of this.defaultPatterns) {
      this.registerPattern(pattern.name, pattern);
      this.patternStats.set(pattern.name, {
        matches: 0,
        successes: 0,
        failures: 0,
        averageConfidence: 0,
        lastUsed: null
      });
    }

    ActionLogger.logInfo('AI Operation: patterns_initialized', {
      count: this.patterns.size
    });
  }

  registerPattern(name: string, pattern: UIPattern): void {
    this.patterns.set(name, pattern);
    
    if (!this.patternStats.has(name)) {
      this.patternStats.set(name, {
        matches: 0,
        successes: 0,
        failures: 0,
        averageConfidence: 0,
        lastUsed: null
      });
    }

    ActionLogger.logInfo('AI Operation: pattern_registered', { name, pattern });
  }

  addPattern(pattern: UIPattern): void {
    this.registerPattern(pattern.name, pattern);
  }

  matchPattern(element: Element, pattern: UIPattern): boolean {
    if (!pattern.tags.includes(element.tagName.toLowerCase()) && 
        !pattern.tags.includes('*')) {
      return false;
    }

    let attributeMatches = 0;
    const requiredMatches = Math.ceil(pattern.attributes.length * 0.5);

    for (const attrPattern of pattern.attributes) {
      if (this.matchAttribute(element, attrPattern)) {
        attributeMatches++;
      }
    }

    if (attributeMatches < requiredMatches && pattern.attributes.length > 0) {
      return false;
    }

    if (pattern.structure) {
      if (pattern.structure.parent) {
        const parentMatch = element.closest(pattern.structure.parent);
        if (!parentMatch) return false;
      }

      if (pattern.structure.children) {
        for (const childSelector of pattern.structure.children) {
          const childMatch = element.querySelector(childSelector);
          if (!childMatch) return false;
        }
      }
    }

    return true;
  }

  private matchAttribute(element: Element, attrPattern: string): boolean {
    if (attrPattern.includes('*=')) {
      const [attr, value] = attrPattern.split('*=');
      if (!attr || !value) return false;
      const elementValue = element.getAttribute(attr);
      return elementValue !== null && elementValue.includes(value);
    } else if (attrPattern.includes('=')) {
      const [attr, value] = attrPattern.split('=');
      if (!attr || !value) return false;
      return element.getAttribute(attr) === value;
    } else {
      return element.hasAttribute(attrPattern);
    }
  }

  identifyUIPattern(element: Element): UIPattern | null {
    const matches: Array<{ pattern: UIPattern; score: number }> = [];

    for (const [name, pattern] of this.patterns) {
      if (this.matchPattern(element, pattern)) {
        const stats = this.patternStats.get(name)!;
        const confidence = stats.matches > 0 ? 
          stats.successes / stats.matches : 0.5;
        
        matches.push({
          pattern,
          score: pattern.weight * (0.5 + confidence * 0.5)
        });
      }
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => b.score - a.score);
    const bestMatch = matches[0];
    
    if (!bestMatch) {
      return null;
    }

    const stats = this.patternStats.get(bestMatch.pattern.name);
    if (stats) {
      stats.matches++;
      stats.lastUsed = new Date();
    }

    ActionLogger.logInfo('AI Operation: pattern_identified', {
      pattern: bestMatch.pattern.name,
      score: bestMatch.score
    });

    return bestMatch.pattern;
  }

  getPatternScore(element: Element, pattern?: UIPattern): number {
    if (!pattern) {
      const identified = this.identifyUIPattern(element);
      if (!identified) return 0;
      pattern = identified;
    }

    if (!this.matchPattern(element, pattern)) return 0;

    let score = pattern.weight;

    const stats = this.patternStats.get(pattern.name);
    if (stats && stats.matches > 0) {
      const successRate = stats.successes / stats.matches;
      score *= (0.5 + successRate * 0.5);
    }

    let attributeScore = 0;
    for (const attrPattern of pattern.attributes) {
      if (this.matchAttribute(element, attrPattern)) {
        attributeScore += 1.0 / pattern.attributes.length;
      }
    }
    score *= (0.5 + attributeScore * 0.5);

    return Math.min(score, 1.0);
  }

  quickMatch(element: Element, pattern?: UIPattern): number {
    if (!pattern) {
      const identified = this.identifyUIPattern(element);
      return identified ? 0.5 : 0;
    }
    
    return this.matchPattern(element, pattern) ? pattern.weight : 0;
  }

  identifyPattern(features: ElementFeatures): string | null {
    const mockElement = {
      tagName: features.structural.tagName,
      getAttribute: (name: string) => features.structural.attributes[name] || null,
      hasAttribute: (name: string) => name in features.structural.attributes,
      closest: (selector: string) => {
        if (features.context.parentTag && selector.includes(features.context.parentTag)) {
          return true;
        }
        return null;
      },
      querySelector: () => null
    };

    for (const [name, pattern] of this.patterns) {
      if (this.matchPattern(mockElement as any, pattern)) {
        return name;
      }
    }

    return null;
  }

  incrementPatternSuccess(patternName: string): void {
    const stats = this.patternStats.get(patternName);
    if (stats) {
      stats.successes++;
      this.updateAverageConfidence(patternName);
      
      ActionLogger.logInfo('AI Operation: pattern_success_recorded', {
        pattern: patternName,
        successRate: stats.successes / stats.matches
      });
    }
  }

  incrementPatternFailure(patternName: string): void {
    const stats = this.patternStats.get(patternName);
    if (stats) {
      stats.failures++;
      this.updateAverageConfidence(patternName);
      
      ActionLogger.logInfo('AI Operation: pattern_failure_recorded', {
        pattern: patternName,
        failureRate: stats.failures / stats.matches
      });
    }
  }

  private updateAverageConfidence(patternName: string): void {
    const stats = this.patternStats.get(patternName);
    if (stats && stats.matches > 0) {
      stats.averageConfidence = stats.successes / stats.matches;
    }
  }

  analyzePatternUsage(): PatternAnalysis {
    const analysis: PatternAnalysis = {
      totalPatterns: this.patterns.size,
      mostUsed: [],
      mostSuccessful: [],
      leastSuccessful: [],
      unusedPatterns: [],
      overallStats: {
        totalMatches: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        averageSuccessRate: 0
      }
    };

    const patternUsage: Array<{
      name: string;
      stats: PatternStats;
      successRate: number;
    }> = [];

    for (const [name, stats] of this.patternStats) {
      analysis.overallStats.totalMatches += stats.matches;
      analysis.overallStats.totalSuccesses += stats.successes;
      analysis.overallStats.totalFailures += stats.failures;

      if (stats.matches === 0) {
        analysis.unusedPatterns.push(name);
      } else {
        const successRate = stats.successes / stats.matches;
        patternUsage.push({ name, stats, successRate });
      }
    }

    patternUsage.sort((a, b) => b.stats.matches - a.stats.matches);
    analysis.mostUsed = patternUsage.slice(0, 5).map(p => ({
      name: p.name,
      matches: p.stats.matches,
      successRate: p.successRate
    }));

    patternUsage.sort((a, b) => b.successRate - a.successRate);
    analysis.mostSuccessful = patternUsage
      .filter(p => p.stats.matches >= 10)
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        matches: p.stats.matches,
        successRate: p.successRate
      }));

    analysis.leastSuccessful = patternUsage
      .filter(p => p.stats.matches >= 10)
      .slice(-5)
      .reverse()
      .map(p => ({
        name: p.name,
        matches: p.stats.matches,
        successRate: p.successRate
      }));

    if (analysis.overallStats.totalMatches > 0) {
      analysis.overallStats.averageSuccessRate = 
        analysis.overallStats.totalSuccesses / analysis.overallStats.totalMatches;
    }

    return analysis;
  }

  suggestNewPatterns(elements: ElementFeatures[]): UIPattern[] {
    const suggestions: UIPattern[] = [];
    const commonAttributes = new Map<string, number>();
    const tagCombinations = new Map<string, number>();

    for (const features of elements) {
      if (!features.structural) continue;
      
      const tag = features.structural.tagName;
      tagCombinations.set(tag, (tagCombinations.get(tag) || 0) + 1);

      if (features.structural.attributes) {
        for (const [attr, value] of Object.entries(features.structural.attributes)) {
          if (attr === 'id' || attr === 'style') continue;
          
          const pattern = value.length > 20 ? `${attr}` : `${attr}=${value}`;
          commonAttributes.set(pattern, (commonAttributes.get(pattern) || 0) + 1);
        }
      }
    }

    const threshold = elements.length * 0.3;
    const significantAttributes = Array.from(commonAttributes.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([pattern, _]) => pattern);

    if (significantAttributes.length > 0) {
      const tagEntries = Array.from(tagCombinations.entries())
        .sort((a, b) => b[1] - a[1]);
      
      if (tagEntries.length > 0) {
        const firstEntry = tagEntries[0];
        if (firstEntry) {
          const mostCommonTag = firstEntry[0];
          
          suggestions.push({
            name: `suggested-pattern-${Date.now()}`,
            tags: [mostCommonTag],
            attributes: significantAttributes,
            weight: 1.0
          });
        }
      }
    }

    return suggestions;
  }

  exportPatterns(): ExportedPatterns {
    const patterns: ExportedPattern[] = [];

    for (const [name, pattern] of this.patterns) {
      const stats = this.patternStats.get(name)!;
      patterns.push({
        name,
        pattern,
        stats,
        effectiveness: stats.matches > 0 ? stats.successes / stats.matches : 0
      });
    }

    return {
      version: '1.0',
      exportDate: new Date(),
      patterns,
      analysis: this.analyzePatternUsage()
    };
  }

  importPatterns(data: ExportedPatterns): void {
    for (const exported of data.patterns) {
      this.registerPattern(exported.name, exported.pattern);
      if (exported.stats) {
        this.patternStats.set(exported.name, exported.stats);
      }
    }

    ActionLogger.logInfo('AI Operation: patterns_imported', {
      count: data.patterns.length,
      version: data.version
    });
  }

  match(features: ElementFeatures, keywords: string[]): number {
    let score = 0;
    
    const patternName = this.identifyPattern(features);
    if (patternName) {
      const pattern = this.patterns.get(patternName);
      if (pattern) {
        score += pattern.weight * 0.5;
      }
    }
    
    if (keywords.length > 0) {
      let keywordMatches = 0;
      const textLower = features.text.content.toLowerCase();
      const attributeValues = Object.values(features.structural.attributes).join(' ').toLowerCase();
      
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        if (textLower.includes(keywordLower) || attributeValues.includes(keywordLower)) {
          keywordMatches++;
        }
      }
      
      if (keywords.length > 0) {
        score += (keywordMatches / keywords.length) * 0.5;
      }
    }
    
    return Math.min(score, 1.0);
  }
}

interface PatternStats {
  matches: number;
  successes: number;
  failures: number;
  averageConfidence: number;
  lastUsed: Date | null;
}

interface PatternAnalysis {
  totalPatterns: number;
  mostUsed: Array<{
    name: string;
    matches: number;
    successRate: number;
  }>;
  mostSuccessful: Array<{
    name: string;
    matches: number;
    successRate: number;
  }>;
  leastSuccessful: Array<{
    name: string;
    matches: number;
    successRate: number;
  }>;
  unusedPatterns: string[];
  overallStats: {
    totalMatches: number;
    totalSuccesses: number;
    totalFailures: number;
    averageSuccessRate: number;
  };
}

interface ExportedPattern {
  name: string;
  pattern: UIPattern;
  stats: PatternStats;
  effectiveness: number;
}

interface ExportedPatterns {
  version: string;
  exportDate: Date;
  patterns: ExportedPattern[];
  analysis: PatternAnalysis;
}
