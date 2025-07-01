// src/core/ai/healing/SelfHealingEngine.ts
import { Page, Locator } from 'playwright';
import { ActionLogger } from '../../logging/ActionLogger';
import { CSWebElement } from '../../elements/CSWebElement';
import { AIElementIdentifier } from '../engine/AIElementIdentifier';
import { HealingStrategy } from './HealingStrategies';
import { LocatorGenerator } from './LocatorGenerator';
import { HealingHistory } from './HealingHistory';
import { ConfigurationManager } from '../../configuration/ConfigurationManager';
import { 
  HealingResult, 
  HealingStats
} from '../types/ai.types';

interface ElementSnapshot {
  tagName: string;
  id: string;
  className: string;
  attributes: Record<string, string>;
  textContent: string;
  innerHTML: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  styles: {
    display: string;
    visibility: string;
    opacity: string;
    position: string;
    zIndex: string;
  };
  parentTagName?: string | undefined;
  siblingIndex: number;
  timestamp: Date;
}

interface HealingConfiguration {
  enabled: boolean;
  maxAttempts: number;
  confidenceThreshold: number;
  cacheTimeout: number;
  snapshotInterval: number;
  strategies: string[];
}

interface ExtendedHealingResult extends HealingResult {
  attempts?: number;
  duration?: number;
  snapshot?: ElementSnapshot;
  cachedAt?: number;
}

interface HealingContext {
  element: CSWebElement;
  page: Page;
  lastKnownGoodLocator?: string | undefined;
  previousSnapshots: ElementSnapshot[];
  attemptedStrategies: Set<string>;
  startTime: number;
}

export class SelfHealingEngine {
  private static instance: SelfHealingEngine;
  private aiIdentifier: AIElementIdentifier;
  private strategies: Map<string, HealingStrategy> = new Map();
  private locatorGenerator: LocatorGenerator;
  private history: HealingHistory;
  private config!: HealingConfiguration;
  private isHealing: Map<string, boolean> = new Map();
  private healingCache: Map<string, ExtendedHealingResult> = new Map();
  private elementSnapshots: Map<string, ElementSnapshot[]> = new Map();

  private constructor() {
    this.aiIdentifier = AIElementIdentifier.getInstance();
    this.initializeStrategies();
    this.locatorGenerator = LocatorGenerator.getInstance();
    this.history = HealingHistory.getInstance();
    this.loadConfiguration();
  }

  public static getInstance(): SelfHealingEngine {
    if (!SelfHealingEngine.instance) {
      SelfHealingEngine.instance = new SelfHealingEngine();
    }
    return SelfHealingEngine.instance;
  }

  private initializeStrategies(): void {
    // Initialize healing strategies
    // Note: The actual strategy implementations need to be imported and registered
  }

  private loadConfiguration(): void {
    this.config = {
      enabled: ConfigurationManager.getBoolean('AI_SELF_HEALING_ENABLED', true),
      maxAttempts: ConfigurationManager.getInt('AI_HEALING_MAX_ATTEMPTS', 5),
      confidenceThreshold: ConfigurationManager.getFloat('AI_HEALING_CONFIDENCE_THRESHOLD', 0.7),
      cacheTimeout: ConfigurationManager.getInt('AI_HEALING_CACHE_TIMEOUT', 300000), // 5 minutes
      snapshotInterval: ConfigurationManager.getInt('AI_HEALING_SNAPSHOT_INTERVAL', 60000), // 1 minute
      strategies: ConfigurationManager.getArray('AI_HEALING_STRATEGIES', ',') || [
        'nearby', 'similar-text', 'similar-attributes', 'parent-child', 'ai-identification'
      ]
    };
  }

  public async heal(element: CSWebElement): Promise<Locator> {
    if (!this.config.enabled) {
      throw new Error('Self-healing is disabled');
    }

    const elementId = this.getElementId(element);
    
    // Check if already healing
    if (this.isHealing.get(elementId)) {
      throw new Error('Healing already in progress for this element');
    }

    // Check cache
    const cached = this.getCachedHealing(elementId);
    if (cached && cached.newLocator) {
      ActionLogger.logInfo('Self-healing cache hit', { 
        elementId,
        operation: 'self-healing',
        result: 'cache-hit',
        type: 'ai_operation'
      });
      const locator = element.page.locator(cached.newLocator.toString());
      return locator;
    }

    this.isHealing.set(elementId, true);
    const context = this.createHealingContext(element);

    try {
      ActionLogger.logInfo('Self-healing started', {
        element: element.description,
        originalLocator: element.options.locatorValue,
        operation: 'self-healing',
        result: 'start',
        type: 'ai_operation'
      });

      // Try each strategy
      const healingResult = await this.attemptHealing(context);

      if (healingResult.success && healingResult.newLocator) {
        // Validate the healed locator
        const isValid = await this.validateHealing(element, healingResult.newLocator);
        
        if (isValid) {
          // Update element with new locator
          await this.updateElement(element, healingResult);
          
          // Record success
          await this.recordHealingSuccess(element, healingResult);
          
          // Cache result
          this.cacheHealing(elementId, healingResult);
          
          ActionLogger.logInfo('Self-healing successful', {
            element: element.description,
            newLocator: healingResult.newLocator,
            strategy: healingResult.strategy,
            confidence: healingResult.confidence,
            duration: Date.now() - context.startTime,
            operation: 'self-healing',
            result: 'success',
            type: 'ai_operation'
          });

          return healingResult.newLocator;
        }
      }

      // Healing failed
      this.recordHealingFailure(element, context);
      
      throw new Error(`Failed to heal element: ${element.description}`);

    } catch (error) {
      ActionLogger.logError('Self-healing failed', error as Error);
      throw error;
    } finally {
      this.isHealing.set(elementId, false);
    }
  }

  private createHealingContext(element: CSWebElement): HealingContext {
    const elementId = this.getElementId(element);
    const snapshots = this.elementSnapshots.get(elementId) || [];
    const lastKnownGoodLocator = this.getLastKnownGoodLocator(element);
    
    return {
      element,
      page: element.page,
      lastKnownGoodLocator,
      previousSnapshots: snapshots,
      attemptedStrategies: new Set<string>(),
      startTime: Date.now()
    };
  }

  private async attemptHealing(context: HealingContext): Promise<ExtendedHealingResult> {
    let attempts = 0;
    const maxAttempts = this.config.maxAttempts;
    
    // Get ordered strategies
    const orderedStrategies = this.getOrderedStrategies(context);

    for (const strategyName of orderedStrategies) {
      if (attempts >= maxAttempts) {
        break;
      }

      if (context.attemptedStrategies.has(strategyName)) {
        continue;
      }

      context.attemptedStrategies.add(strategyName);
      attempts++;

      try {
        ActionLogger.logInfo('Trying healing strategy', {
          strategy: strategyName,
          attempt: attempts,
          operation: 'self-healing',
          result: 'try-strategy',
          type: 'ai_operation'
        });

        const strategy = this.strategies.get(strategyName);
        if (!strategy) {
          continue;
        }

        const result = await this.executeStrategy(strategy, context);
        
        if (result && result.confidence >= this.config.confidenceThreshold) {
          return {
            success: true,
            strategy: strategyName,
            newLocator: result.locator,
            confidence: result.confidence,
            attempts,
            duration: Date.now() - context.startTime,
            snapshot: await this.captureElementSnapshot(result.locator)
          };
        }
      } catch (error) {
        ActionLogger.logWarn(`Strategy ${strategyName} failed: ${(error as Error).message}`);
      }
    }

    return {
      success: false,
      strategy: 'none',
      confidence: 0,
      attempts,
      duration: Date.now() - context.startTime,
      newLocator: context.page.locator('body') // placeholder locator
    };
  }

  private async executeStrategy(
    strategy: HealingStrategy,
    context: HealingContext
  ): Promise<{ locator: Locator; selector: string; confidence: number } | null> {
    const result = await (strategy as any).heal(context.element, context.page);
    
    if (!result) {
      return null;
    }

    // Generate robust locator
    const element = await result.elementHandle();
    if (!element) {
      return null;
    }

    const robustLocator = await this.locatorGenerator.generateRobustLocator(element);
    await element.dispose();

    if (!robustLocator.primary) {
      return null;
    }

    // Create Playwright locator
    const locator = context.page.locator(robustLocator.primary);
    
    // Verify locator finds exactly one element
    const count = await locator.count();
    if (count !== 1) {
      return null;
    }

    return {
      locator,
      selector: robustLocator.primary,
      confidence: result.confidence * robustLocator.confidence
    };
  }

  private getOrderedStrategies(context: HealingContext): string[] {
    // Get success rates for each strategy
    const strategyStats = this.history.getStrategyStatistics();
    
    // Order strategies by success rate for similar elements
    const elementType = this.getElementType(context.element);
    const orderedStrategies = [...this.config.strategies].sort((a, b) => {
      const aStats = (strategyStats as any)[a];
      const bStats = (strategyStats as any)[b];
      
      if (!aStats || !bStats) return 0;
      
      // Prioritize by success rate for element type
      const aRate = aStats.successRateByType.get(elementType) || aStats.overallSuccessRate;
      const bRate = bStats.successRateByType.get(elementType) || bStats.overallSuccessRate;
      
      return bRate - aRate;
    });

    // Always try AI identification last if enabled
    if (orderedStrategies.includes('ai-identification')) {
      const aiIndex = orderedStrategies.indexOf('ai-identification');
      orderedStrategies.splice(aiIndex, 1);
      orderedStrategies.push('ai-identification');
    }

    return orderedStrategies;
  }

  public async validateHealing(element: CSWebElement, healedLocator: Locator): Promise<boolean> {
    try {
      // Check if element exists
      const exists = await healedLocator.count() === 1;
      if (!exists) {
        return false;
      }

      // Wait for element to be stable
      await healedLocator.waitFor({ state: 'attached', timeout: 5000 });

      // Compare with expected properties if available
      if (element.description) {
        const actualText = await healedLocator.textContent();
        const similarity = this.calculateTextSimilarity(
          element.description.toLowerCase(),
          (actualText || '').toLowerCase()
        );
        
        if (similarity < 0.5) {
          return false;
        }
      }

      // Verify element type matches
      const tagName = await healedLocator.evaluate(el => el.tagName.toLowerCase());
      if (!this.isCompatibleElementType(element, tagName)) {
        return false;
      }

      // Check visibility if required
      if (element.options.waitForVisible) {
        const isVisible = await healedLocator.isVisible();
        if (!isVisible) {
          return false;
        }
      }

      return true;
    } catch (error) {
      ActionLogger.logWarn(`Healing validation failed: ${(error as Error).message}`);
      return false;
    }
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Levenshtein distance based similarity
    const maxLength = Math.max(text1.length, text2.length);
    if (maxLength === 0) return 1;
    
    const distance = this.levenshteinDistance(text1, text2);
    return 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i]![j] = dp[i - 1]![j - 1]!;
        } else {
          dp[i]![j] = Math.min(
            dp[i - 1]![j]! + 1,
            dp[i]![j - 1]! + 1,
            dp[i - 1]![j - 1]! + 1
          );
        }
      }
    }

    return dp[m]![n]!;
  }

  private isCompatibleElementType(element: CSWebElement, tagName: string): boolean {
    
    // Map expected types to compatible tag names
    const compatibilityMap: Record<string, string[]> = {
      'button': ['button', 'input', 'a', 'div', 'span'],
      'input': ['input', 'textarea'],
      'link': ['a', 'button', 'div', 'span'],
      'dropdown': ['select', 'div', 'ul'],
      'checkbox': ['input'],
      'radio': ['input']
    };

    // Check text content for element type hints
    const description = element.description.toLowerCase();
    for (const [type, tags] of Object.entries(compatibilityMap)) {
      if (description.includes(type) && tags.includes(tagName)) {
        return true;
      }
    }

    // Default permissive for generic elements
    return true;
  }

  private async updateElement(element: CSWebElement, healingResult: ExtendedHealingResult): Promise<void> {
    // Store old locator as fallback
    if (!element.options.fallbacks) {
      element.options.fallbacks = [];
    }
    
    element.options.fallbacks.unshift({
      locatorType: element.options.locatorType,
      value: element.options.locatorValue
    });

    // Update primary locator
    element.options.locatorValue = healingResult.newLocator!.toString();
    
    // Add healing metadata
    (element as any)._healingMetadata = {
      healedAt: new Date(),
      strategy: healingResult.strategy,
      confidence: healingResult.confidence,
      originalLocator: element.options.fallbacks[0]?.value
    };

    // Store snapshot for future healing
    if ((healingResult as ExtendedHealingResult).snapshot) {
      this.storeElementSnapshot(element, (healingResult as ExtendedHealingResult).snapshot!);
    }
  }

  public async recordHealingSuccess(element: CSWebElement, result: ExtendedHealingResult): Promise<void> {
    const elementId = this.getElementId(element);
    
    this.history.recordAttempt(
      elementId,
      result.strategy,
      true,
      {
        confidence: result.confidence,
        duration: result.duration || 0,
        newLocator: result.newLocator ? result.newLocator.toString() : undefined,
        elementType: this.getElementType(element),
        pageUrl: element.page.url()
      }
    );

    // Train AI if AI strategy was used
    if (result.strategy === 'ai-identification' && result.newLocator) {
      await this.aiIdentifier.trainOnSuccess(element, result.newLocator);
    }
  }

  private recordHealingFailure(element: CSWebElement, context: HealingContext): void {
    const elementId = this.getElementId(element);
    
    this.history.recordAttempt(
      elementId,
      'all',
      false,
      {
        confidence: 0,
        duration: Date.now() - context.startTime,
        errorMessage: 'All healing strategies failed',
        elementType: this.getElementType(element),
        pageUrl: element.page.url()
      }
    );
  }

  public getHealingStats(): HealingStats {
    const stats = this.history.getStrategyStatistics();
    const fragileElements = this.history.getFragileElements();
    
    // Convert to HealingStats format
    const byStrategy: Record<string, any> = {};
    for (const [strategyName, strategyStats] of Object.entries(stats)) {
      byStrategy[strategyName] = {
        attempts: (strategyStats as any).totalAttempts || 0,
        successes: (strategyStats as any).successfulAttempts || 0,
        averageConfidence: (strategyStats as any).averageConfidence || 0
      };
    }
    
    return {
      totalAttempts: Object.values(byStrategy).reduce((sum, s) => sum + s.attempts, 0),
      successfulHeals: Object.values(byStrategy).reduce((sum, s) => sum + s.successes, 0),
      failedHeals: Object.values(byStrategy).reduce((sum, s) => sum + s.attempts - s.successes, 0),
      byStrategy,
      fragileElements: fragileElements.map(f => ({
        description: f.elementId,
        healCount: f.totalAttempts,
        lastHealed: f.lastFailure || new Date()
      }))
    };
  }

  private getElementId(element: CSWebElement): string {
    return `${element.constructor.name}_${element.options.locatorType}_${element.options.locatorValue}`;
  }

  private getElementType(element: CSWebElement): string {
    // Extract type from description or locator
    const description = element.description.toLowerCase();
    const types = ['button', 'input', 'link', 'dropdown', 'checkbox', 'radio', 'text', 'image'];
    
    for (const type of types) {
      if (description.includes(type)) {
        return type;
      }
    }
    
    return 'element';
  }

  private getLastKnownGoodLocator(element: CSWebElement): string | undefined {
    const elementId = this.getElementId(element);
    const history = this.history.getElementHistory(elementId);
    
    // Find last successful healing
    const lastSuccess = history
      .filter(h => h.success && h.newLocator)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    
    return lastSuccess?.newLocator;
  }

  private async captureElementSnapshot(locator: Locator): Promise<ElementSnapshot> {
    try {
      const element = await locator.elementHandle();
      if (!element) {
        throw new Error('Element not found');
      }

      const snapshot: ElementSnapshot = await element.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        
        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className,
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {} as Record<string, string>),
          textContent: el.textContent?.trim() || '',
          innerHTML: el.innerHTML,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          styles: {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            position: styles.position,
            zIndex: styles.zIndex
          },
          parentTagName: el.parentElement?.tagName.toLowerCase(),
          siblingIndex: Array.from(el.parentElement?.children || []).indexOf(el),
          timestamp: new Date()
        };
      });

      await element.dispose();
      return snapshot;
    } catch (error) {
      ActionLogger.logWarn(`Failed to capture element snapshot: ${(error as Error).message}`);
      throw error;
    }
  }

  private storeElementSnapshot(element: CSWebElement, snapshot: ElementSnapshot): void {
    const elementId = this.getElementId(element);
    
    if (!this.elementSnapshots.has(elementId)) {
      this.elementSnapshots.set(elementId, []);
    }
    
    const snapshots = this.elementSnapshots.get(elementId)!;
    snapshots.push(snapshot);
    
    // Keep only last 10 snapshots
    if (snapshots.length > 10) {
      snapshots.shift();
    }
  }

  private getCachedHealing(elementId: string): ExtendedHealingResult | null {
    const cached = this.healingCache.get(elementId);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is still valid
    const age = Date.now() - (cached.cachedAt || 0);
    if (age > this.config.cacheTimeout) {
      this.healingCache.delete(elementId);
      return null;
    }
    
    return cached;
  }

  private cacheHealing(elementId: string, result: ExtendedHealingResult): void {
    this.healingCache.set(elementId, {
      ...result,
      cachedAt: Date.now()
    } as ExtendedHealingResult);
  }

  public clearCache(): void {
    this.healingCache.clear();
  }

  public async takePreventiveSnapshot(element: CSWebElement): Promise<void> {
    try {
      // Use public method to get locator instead of private resolve
      const locator = element.page.locator(element.options.locatorValue);
      const snapshot = await this.captureElementSnapshot(locator);
      this.storeElementSnapshot(element, snapshot);
    } catch (error) {
      // Ignore errors in preventive snapshots
      ActionLogger.logDebug(`Failed to take preventive snapshot: ${(error as Error).message}`);
    }
  }

  public getFragileElements(): Array<{elementId: string; description: string; failureRate: number}> {
    const fragileElements = this.history.getFragileElements();
    return fragileElements.map(fe => ({
      elementId: fe.elementId,
      description: fe.elementId,
      failureRate: 1 - fe.successRate
    }));
  }

  public exportHealingData(): any {
    return {
      stats: this.getHealingStats(),
      history: this.history.exportHistoryData(),
      snapshots: Array.from(this.elementSnapshots.entries()).map(([id, snapshots]) => ({
        elementId: id,
        snapshots: snapshots.map(s => ({
          ...s,
          innerHTML: undefined // Exclude HTML for size
        }))
      }))
    };
  }

  public importHealingData(data: any): void {
    if (data.history) {
      this.history.importHistory(data.history);
    }
    
    if (data.snapshots) {
      data.snapshots.forEach((item: any) => {
        this.elementSnapshots.set(item.elementId, item.snapshots);
      });
    }
  }

  public resetHealingData(): void {
    this.history.clear();
    this.elementSnapshots.clear();
    this.healingCache.clear();
  }
}