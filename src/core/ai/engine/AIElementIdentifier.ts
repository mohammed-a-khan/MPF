// src/core/ai/engine/AIElementIdentifier.ts

import { Page, Locator } from 'playwright';
import { DOMAnalyzer } from './DOMAnalyzer';
import { PatternMatcher } from './PatternMatcher';
import { SimilarityCalculator } from './SimilarityCalculator';
import { ElementFeatureExtractor } from './ElementFeatureExtractor';
import { NaturalLanguageProcessor } from '../nlp/NaturalLanguageProcessor';
import { ActionLogger } from '../../logging/ActionLogger';
import { ConfigurationManager } from '../../configuration/ConfigurationManager';
import { CSWebElement } from '../../elements/CSWebElement';
import {
  ElementCandidate,
  ScoredElement,
  ElementFeatures,
  NLPResult,
  IdentificationCache,
  TrainingData,
  ScoreBreakdown,
  UIPattern
} from '../types/ai.types';

export class AIElementIdentifier {
  private static instance: AIElementIdentifier;
  private readonly domAnalyzer: DOMAnalyzer;
  private readonly patternMatcher: PatternMatcher;
  private readonly similarityCalculator: SimilarityCalculator;
  private readonly featureExtractor: ElementFeatureExtractor;
  private readonly nlp: NaturalLanguageProcessor;
  
  private readonly confidenceThreshold: number;
  private readonly cache: Map<string, IdentificationCache> = new Map();
  private readonly trainingData: Set<TrainingData> = new Set();
  private readonly cacheTimeout: number = 300000;
  private readonly maxCandidates: number = 100;
  
  private constructor() {
    this.domAnalyzer = new DOMAnalyzer();
    this.patternMatcher = new PatternMatcher();
    this.similarityCalculator = new SimilarityCalculator();
    this.featureExtractor = new ElementFeatureExtractor();
    this.nlp = new NaturalLanguageProcessor();
    
    this.confidenceThreshold = ConfigurationManager.getFloat(
      'AI_CONFIDENCE_THRESHOLD',
      0.75
    );
  }
  
  static getInstance(): AIElementIdentifier {
    if (!AIElementIdentifier.instance) {
      AIElementIdentifier.instance = new AIElementIdentifier();
    }
    return AIElementIdentifier.instance;
  }
  
  async identifyByDescription(
    description: string,
    page: Page,
    context?: CSWebElement
  ): Promise<Locator> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(description, page.url());
    
    ActionLogger.logInfo('AI Operation: identification_start', {
      description,
      url: page.url(),
      context: context?.options.description
    });

    try {
      const cached = this.getFromCache(cacheKey);
      if (cached && await this.isCacheValid(cached)) {
        ActionLogger.logInfo('AI Operation: cache_hit', {
          description,
          confidence: cached.confidence
        });
        return cached.locator;
      }

      const nlpResult = await this.nlp.processDescription(description);
      
      ActionLogger.logInfo('AI Operation: nlp_complete', {
        intent: nlpResult.intent,
        keywords: nlpResult.keywords
      });

      const candidates = await this.getCandidates(page, nlpResult, context);

      if (candidates.length === 0) {
        throw new Error(`No candidate elements found for description: "${description}"`);
      }

      ActionLogger.logInfo('AI Operation: candidates_found', {
        description,
        count: candidates.length
      });

      const scoredElements = await this.scoreElements(
        candidates,
        nlpResult,
        description
      );

      const bestMatch = this.selectBestMatch(scoredElements);

      if (bestMatch.score < this.confidenceThreshold) {
        ActionLogger.logInfo('AI Operation: low_confidence', {
          description,
          bestScore: bestMatch.score,
          threshold: this.confidenceThreshold
        });
        
        throw new Error(
          `No element found with sufficient confidence for: "${description}". ` +
          `Best match scored ${(bestMatch.score * 100).toFixed(1)}% ` +
          `(threshold: ${(this.confidenceThreshold * 100).toFixed(1)}%)`
        );
      }

      const locator = bestMatch.locator;
      
      this.cacheResult(cacheKey, locator, bestMatch);

      ActionLogger.logInfo('AI Operation: identification_complete', {
        description,
        confidence: bestMatch.score,
        duration: Date.now() - startTime
      });

      return locator;

    } catch (error) {
      ActionLogger.logInfo('AI Operation: identification_failed', {
        description,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });
      throw new Error(`Element identification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async identifyWithFallback(
    description: string,
    page: Page,
    strategies: string[] = ['ai', 'fuzzy', 'semantic', 'visual']
  ): Promise<Locator | null> {
    const startTime = Date.now();
    
    ActionLogger.logInfo('AI Operation: fallback_identification_start', {
      description,
      strategies
    });

    for (const strategy of strategies) {
      try {
        let result: Locator | null = null;

        switch (strategy) {
          case 'ai':
            result = await this.identifyByDescription(description, page);
            break;
          case 'fuzzy':
            result = await this.fuzzyMatch(description, page);
            break;
          case 'semantic':
            result = await this.semanticSearch(description, page);
            break;
          case 'visual':
            result = await this.visualSearch();
            break;
        }

        if (result) {
          ActionLogger.logInfo('AI Operation: fallback_strategy_applied', {
            description,
            strategy,
            success: true,
            duration: Date.now() - startTime
          });
          return result;
        }
      } catch (error) {
        ActionLogger.logInfo('AI Operation: fallback_strategy_failed', {
          description,
          strategy,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    ActionLogger.logInfo('AI Operation: fallback_complete', {
      description,
      success: false,
      duration: Date.now() - startTime
    });

    return null;
  }

  async identifyWithCombinedApproach(
    description: string,
    page: Page,
    options?: {
      useAI?: boolean;
      useVisual?: boolean;
      useSemantic?: boolean;
      minConfidence?: number;
    }
  ): Promise<Locator> {
    const startTime = Date.now();
    const opts = {
      useAI: true,
      useVisual: false,
      useSemantic: true,
      minConfidence: 0.8,
      ...options
    };

    ActionLogger.logInfo('AI Operation: combined_identification_start', {
      description,
      options: opts
    });

    try {
      const scores: Map<string, { score: number; method: string }> = new Map();

      if (opts.useAI) {
        const aiScores = await this.getAIScores(description, page);
        aiScores.forEach(({ selector, score }) => {
          scores.set(selector, { score, method: 'ai' });
        });
      }

      if (opts.useSemantic) {
        const semanticScores = await this.getSemanticScores(description, page);
        semanticScores.forEach(({ selector, score }) => {
          const existing = scores.get(selector);
          if (existing) {
            existing.score = (existing.score + score) / 2;
          } else {
            scores.set(selector, { score, method: 'semantic' });
          }
        });
      }

      let bestSelector = '';
      let bestScore = 0;
      let bestMethod = '';

      scores.forEach(({ score, method }, selector) => {
        if (score > bestScore) {
          bestScore = score;
          bestSelector = selector;
          bestMethod = method;
        }
      });

      if (bestScore < opts.minConfidence) {
        throw new Error(
          `Combined approach failed to find element with confidence >= ${opts.minConfidence}. ` +
          `Best score: ${bestScore.toFixed(2)}`
        );
      }

      const locator = page.locator(bestSelector);

      ActionLogger.logInfo('AI Operation: combined_identification_complete', {
        description,
        selector: bestSelector,
        score: bestScore,
        method: bestMethod,
        duration: Date.now() - startTime
      });

      return locator;

    } catch (error) {
      ActionLogger.logError('Combined identification failed', error as Error);
      throw new Error(`Combined identification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async train(
    description: string,
    selector: string,
    page: Page,
    success: boolean
  ): Promise<void> {
    try {
      const element = await page.locator(selector).elementHandle();
      if (!element) return;

      const features = await this.featureExtractor.extractFeatures(element);
      
      const trainingEntry: TrainingData = {
        id: `training_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        description,
        locator: selector,
        features,
        success,
        timestamp: new Date(),
        url: page.url(),
        elementType: features.structural.tagName
      };

      this.trainingData.add(trainingEntry);

      ActionLogger.logInfo('AI Operation: training_data_added', {
        description,
        selector,
        success,
        featuresExtracted: Object.keys(features).length
      });

      if (success) {
        await this.updatePatterns(features);
      }

    } catch (error) {
      ActionLogger.logError('Training failed', error as Error);
    }
  }


  private async getCandidates(
    page: Page,
    nlpResult: NLPResult,
    _context?: CSWebElement
  ): Promise<ElementCandidate[]> {
    const candidates: ElementCandidate[] = [];
    
    const selectors = this.generateSelectors(nlpResult);
    
    for (const selector of selectors) {
      try {
        const elements = await page.locator(selector).all();
        
        for (const element of elements.slice(0, this.maxCandidates)) {
          const isVisible = await element.isVisible().catch(() => false);
          if (!isVisible) continue;

          const boundingBox = await element.boundingBox().catch(() => null);
          if (!boundingBox) continue;

          const elementHandle = await element.elementHandle();
          if (!elementHandle) continue;

          const features = await this.featureExtractor.extractFeatures(elementHandle);
          
          candidates.push({
            element: elementHandle,
            locator: element,
            selector: selector,
            tagName: features.structural.tagName,
            text: features.text.content,
            attributes: features.structural.attributes,
            position: {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height
            },
            isVisible: features.visual.isVisible,
            isInteractive: features.structural.isInteractive,
            relevance: 0,
            allText: features.text.content,
            page: page
          });
        }
      } catch (error) {
      }
    }

    return candidates;
  }

  private generateSelectors(nlpResult: NLPResult): string[] {
    const selectors: string[] = [];
    const { intent, keywords } = nlpResult;

    if (intent === 'click') {
      selectors.push('button', 'a', '[role="button"]', 'input[type="submit"]');
    }

    if (intent === 'type') {
      selectors.push('input', 'textarea', '[contenteditable="true"]');
    }

    if (intent === 'select') {
      selectors.push('select', '[role="combobox"]', '[role="listbox"]');
    }

    if (nlpResult.elementType) {
      selectors.push(nlpResult.elementType);
    }
    
    if (nlpResult.exactText) {
      selectors.push(`text="${nlpResult.exactText}"`, `*:has-text("${nlpResult.exactText}")`);
    }

    keywords.forEach(keyword => {
      selectors.push(
        `[aria-label*="${keyword}" i]`,
        `[title*="${keyword}" i]`,
        `[placeholder*="${keyword}" i]`,
        `*:has-text("${keyword}")`
      );
    });

    selectors.push('[role="button"]', '[role="link"]', '[role="textbox"]');

    return [...new Set(selectors)];
  }

  private async getElementContext(element: any): Promise<any> {
    try {
      return await element.evaluate((el: Element) => {
        const parent = el.parentElement;
        const siblings = parent ? Array.from(parent.children) : [];
        
        return {
          parent: parent ? {
            tag: parent.tagName.toLowerCase(),
            className: parent.className,
            id: parent.id
          } : null,
          siblings: siblings.length,
          position: siblings.indexOf(el)
        };
      });
    } catch {
      return null;
    }
  }

  private async scoreElements(
    candidates: ElementCandidate[],
    nlpResult: NLPResult,
    description: string
  ): Promise<ScoredElement[]> {
    const scoredElements: ScoredElement[] = [];

    for (const candidate of candidates) {
      const scores = await this.calculateScores(candidate, nlpResult, description);
      const totalScore = this.calculateTotalScore(scores);

      const features = await this.featureExtractor.extractFeatures(candidate.element);
      
      scoredElements.push({
        element: candidate.element,
        locator: candidate.locator,
        score: totalScore,
        breakdown: scores,
        features: features
      });
    }

    return scoredElements.sort((a, b) => b.score - a.score);
  }

  private async calculateScores(
    candidate: ElementCandidate,
    nlpResult: NLPResult,
    description: string
  ): Promise<ScoreBreakdown> {
    const scores: ScoreBreakdown = {
      textScore: 0,
      structureScore: 0,
      visualScore: 0,
      patternScore: 0,
      positionScore: 0,
      contextScore: 0
    };

    if (candidate.text) {
      scores.textScore = this.similarityCalculator.calculateSimilarity(
        description.toLowerCase(),
        candidate.text.toLowerCase()
      );
    }

    const features = await this.featureExtractor.extractFeatures(candidate.element);
    
    const semanticScore = await this.calculateSemanticScore(
      features,
      nlpResult
    );
    scores.structureScore += semanticScore * 0.5;

    const structuralScore = await this.calculateStructuralScore(
      features,
      nlpResult
    );
    scores.structureScore += structuralScore * 0.5;

    scores.visualScore = this.calculateVisualScore(features);

    const context = await this.getElementContext(candidate.element);
    if (context) {
      scores.contextScore = this.calculateContextScore(
        context,
        nlpResult
      );
    }

    scores.patternScore = this.patternMatcher.match(
      features,
      nlpResult.keywords
    );

    if (features.structural.attributes?.['role']) {
      const roleScore = this.calculateRoleScore(
        features.structural.attributes['role'],
        nlpResult.intent
      );
      scores.structureScore += roleScore * 0.1;
    }

    return scores;
  }

  private calculateTotalScore(scores: ScoreBreakdown): number {
    const weights = {
      textScore: 0.25,
      structureScore: 0.20,
      visualScore: 0.15,
      patternScore: 0.20,
      positionScore: 0.10,
      contextScore: 0.10
    };

    let totalScore = 0;
    let totalWeight = 0;

    (Object.keys(weights) as Array<keyof typeof weights>).forEach(key => {
      if (scores[key] !== undefined && scores[key] > 0) {
        totalScore += scores[key] * weights[key];
        totalWeight += weights[key];
      }
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private async calculateSemanticScore(
    features: ElementFeatures,
    nlpResult: NLPResult
  ): Promise<number> {
    let score = 0;
    let matches = 0;

    if (features.structural.tagName && nlpResult.intent) {
      const elementTypeScore = this.matchElementTypeToIntent(
        features.structural.tagName,
        nlpResult.intent
      );
      if (elementTypeScore > 0) {
        score += elementTypeScore;
        matches++;
      }
    }

    if (features.structural.attributes) {
      nlpResult.keywords.forEach(keyword => {
        Object.values(features.structural.attributes).forEach(value => {
          if (value && typeof value === 'string' && value.toLowerCase().includes(keyword.toLowerCase())) {
            score += 0.5;
            matches++;
          }
        });
      });
    }

    return matches > 0 ? score / matches : 0;
  }

  private matchElementTypeToIntent(tagName: string, intent: string): number {
    const intentMap: Record<string, string[]> = {
      click: ['button', 'a', 'input'],
      input: ['input', 'textarea'],
      select: ['select'],
      navigate: ['a', 'button'],
      submit: ['button', 'input']
    };

    const validTags = intentMap[intent] || [];
    return validTags.includes(tagName.toLowerCase()) ? 0.9 : 0;
  }

  private async calculateStructuralScore(
    features: ElementFeatures,
    nlpResult: NLPResult
  ): Promise<number> {
    let score = 0;

    if (features.structural.isInteractive) score += 0.3;
    if (features.visual.isVisible) score += 0.2;
    
    if (nlpResult.intent === 'type' && features.structural.tagName === 'input') {
      score += 0.5;
    }

    return score;
  }

  private calculateVisualScore(features: ElementFeatures): number {
    if (!features.visual.boundingBox) return 0;

    const { width, height } = features.visual.boundingBox;
    
    const area = width * height;
    const viewportArea = 1920 * 1080;
    
    let score = Math.min(area / viewportArea * 10, 0.7);

    if (features.visual.boundingBox?.x && features.visual.boundingBox.x > 100 && features.visual.boundingBox.x < 1820) {
      score += 0.1;
    }

    return score;
  }

  private calculateContextScore(context: any, nlpResult: NLPResult): number {
    let score = 0;

    if (context.parent) {
      nlpResult.keywords.forEach(keyword => {
        if (context.parent.className?.includes(keyword) ||
            context.parent.id?.includes(keyword)) {
          score += 0.3;
        }
      });
    }

    if (nlpResult.positionKeywords && nlpResult.positionKeywords.length > 0) {
      score += 0.2;
    }

    return Math.min(score, 0.9);
  }

  private calculateRoleScore(role: string, intent: string): number {
    const roleIntentMap: Record<string, string[]> = {
      button: ['click', 'submit'],
      link: ['click', 'navigate'],
      textbox: ['type'],
      combobox: ['select', 'choose'],
      checkbox: ['check', 'toggle'],
      radio: ['select', 'choose']
    };

    const validIntents = roleIntentMap[role] || [];
    return validIntents.includes(intent) ? 0.9 : 0.5;
  }

  private selectBestMatch(scoredElements: ScoredElement[]): ScoredElement {
    if (scoredElements.length === 0) {
      throw new Error('No scored elements to select from');
    }

    const bestMatch = scoredElements[0];
    if (!bestMatch) {
      throw new Error('No best match found');
    }

    ActionLogger.logInfo('AI Operation: top_matches', {
      matches: scoredElements.slice(0, 3).map(el => ({
        score: el.score,
        breakdown: el.breakdown
      }))
    });

    return bestMatch;
  }

  private async fuzzyMatch(description: string, page: Page): Promise<Locator | null> {
    try {
      const elements = await page.locator('*:has-text("*")').all();
      
      let bestMatch: { element: Locator; score: number } | null = null;
      let bestScore = 0;

      for (const element of elements) {
        const text = await element.textContent().catch(() => '');
        if (!text) continue;

        const score = this.similarityCalculator.calculateSimilarity(
          description.toLowerCase(),
          text.toLowerCase()
        );

        if (score > bestScore && score > 0.6) {
          bestScore = score;
          bestMatch = { element, score };
        }
      }

      return bestMatch?.element || null;
    } catch (error) {
      ActionLogger.logWarn('Fuzzy match failed', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async semanticSearch(description: string, page: Page): Promise<Locator | null> {
    try {
      const nlpResult = await this.nlp.processDescription(description);
      const semanticMap = await this.domAnalyzer.buildSemanticMap(page);
      
      for (const landmark of semanticMap.landmarks) {
        if (nlpResult.keywords.some(keyword => 
          landmark.className?.includes(keyword) ||
          landmark.id?.includes(keyword)
        )) {
          return page.locator(landmark.selector);
        }
      }

      return null;
    } catch (error) {
      ActionLogger.logWarn('Semantic search failed', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async visualSearch(): Promise<Locator | null> {
    ActionLogger.logWarn('Visual search not implemented');
    return null;
  }

  private async getAIScores(
    description: string,
    page: Page
  ): Promise<Array<{ selector: string; score: number }>> {
    const scores: Array<{ selector: string; score: number }> = [];
    
    try {
      const nlpResult = await this.nlp.processDescription(description);
      const candidates = await this.getCandidates(page, nlpResult);
      
      for (const candidate of candidates) {
        const scoreBreakdown = await this.calculateScores(
          candidate,
          nlpResult,
          description
        );
        
        scores.push({
          selector: candidate.selector,
          score: this.calculateTotalScore(scoreBreakdown)
        });
      }
    } catch (error) {
      ActionLogger.logError('Failed to get AI scores', error as Error);
    }

    return scores;
  }

  private async getSemanticScores(
    description: string,
    page: Page
  ): Promise<Array<{ selector: string; score: number }>> {
    const scores: Array<{ selector: string; score: number }> = [];
    
    try {
      const nlpResult = await this.nlp.processDescription(description);
      const semanticMap = await this.domAnalyzer.buildSemanticMap(page);
      
      for (const landmark of semanticMap.landmarks) {
        let score = 0;
        
        if (landmark.role && nlpResult.intent) {
          score += this.calculateRoleScore(landmark.role, nlpResult.intent);
        }
        
        nlpResult.keywords.forEach(keyword => {
          if (landmark.className?.toLowerCase().includes(keyword.toLowerCase()) ||
              landmark.id?.toLowerCase().includes(keyword.toLowerCase())) {
            score += 0.2;
          }
        });
        
        if (score > 0) {
          scores.push({
            selector: landmark.selector,
            score: Math.min(score, 1)
          });
        }
      }
    } catch (error) {
      ActionLogger.logError('Failed to get semantic scores', error as Error);
    }

    return scores;
  }

  private async updatePatterns(features: ElementFeatures): Promise<void> {
    try {
      const pattern: UIPattern = {
        name: `pattern_${Date.now()}`,
        tags: features.structural.tagName ? [features.structural.tagName] : [],
        attributes: Object.keys(features.structural.attributes || {}),
        weight: 1.0
      };

      this.patternMatcher.addPattern(pattern);
    } catch (error) {
      ActionLogger.logError('Failed to update patterns', error as Error);
    }
  }

  private generateCacheKey(description: string, url: string): string {
    return `${url}::${description.toLowerCase().replace(/\s+/g, '_')}`;
  }

  private getFromCache(key: string): IdentificationCache | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached;
  }

  private async isCacheValid(cached: IdentificationCache): Promise<boolean> {
    try {
      const isVisible = await cached.locator.isVisible().catch(() => false);
      return isVisible;
    } catch {
      return false;
    }
  }

  private cacheResult(
    key: string,
    locator: Locator,
    bestMatch: ScoredElement
  ): void {
    this.cache.set(key, {
      locator,
      confidence: bestMatch.score,
      timestamp: Date.now()
    });

    if (this.cache.size > 100) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      
      if (oldest) {
        this.cache.delete(oldest[0]);
      }
    }
  }

  async convertToStandardElement(csElement: CSWebElement): Promise<Locator> {
    const page = csElement.page;
    
    const selector = this.buildSelectorFromOptions(csElement.options);
    return page.locator(selector);
  }

  private buildSelectorFromOptions(options: any): string {
    if (options.selector) return options.selector;
    if (options.css) return options.css;
    if (options.xpath) return `xpath=${options.xpath}`;
    if (options.text) return `text="${options.text}"`;
    if (options.role) return `[role="${options.role}"]`;
    
    const attrs = [];
    if (options.id) attrs.push(`[id="${options.id}"]`);
    if (options.className) attrs.push(`[class*="${options.className}"]`);
    if (options.name) attrs.push(`[name="${options.name}"]`);
    
    return attrs.join('') || '*';
  }

  clearCache(): void {
    this.cache.clear();
    ActionLogger.logInfo('AI cache cleared');
  }

  exportTrainingData(): TrainingData[] {
    return Array.from(this.trainingData);
  }

  importTrainingData(data: TrainingData[]): void {
    data.forEach(entry => this.trainingData.add(entry));
    ActionLogger.logInfo('AI Operation: training_data_imported', {
      count: data.length
    });
  }

  async trainOnSuccess(element: CSWebElement, healedLocator: Locator): Promise<void> {
    try {
      const description = element.description || element.options.description || 
                         `${element.options.locatorType} element`;
      
      const elementHandle = await healedLocator.elementHandle();
      if (!elementHandle) {
        ActionLogger.logWarn('trainOnSuccess: Could not get element handle from healed locator');
        return;
      }

      const features = await this.featureExtractor.extractFeatures(elementHandle);
      
      const trainingEntry: TrainingData = {
        id: `healing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        description: description,
        locator: healedLocator.toString(),
        features: features,
        success: true,
        timestamp: new Date(),
        url: element.page.url(),
        elementType: features.structural.tagName
      };

      this.trainingData.add(trainingEntry);

      await this.updatePatterns(features);

      const cacheKey = this.generateCacheKey(description, element.page.url());
      this.cacheResult(cacheKey, healedLocator, {
        element: elementHandle,
        locator: healedLocator,
        score: 0.95,
        breakdown: {
          textScore: 0.9,
          structureScore: 0.9,
          visualScore: 0.9,
          patternScore: 0.9,
          positionScore: 0.9,
          contextScore: 0.9
        },
        features: features
      });

      ActionLogger.logInfo('AI Operation: healing_training_success', {
        description: description,
        elementType: features.structural.tagName,
        url: element.page.url(),
        locator: healedLocator.toString()
      });

      await elementHandle.dispose();

    } catch (error) {
      ActionLogger.logError('trainOnSuccess failed', error as Error);
    }
  }
}
