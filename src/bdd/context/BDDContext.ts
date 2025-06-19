// src/bdd/context/BDDContext.ts

import { Page, BrowserContext } from 'playwright';
import { ScenarioContext } from './ScenarioContext';
import { FeatureContext } from './FeatureContext';
import { ExecutionContext } from './ExecutionContext';
import { StepContext } from '../base/StepContext';
import { ResponseStorage } from './ResponseStorage';
import { WorldContext } from './WorldContext';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { Feature, Scenario } from '../types/bdd.types';
import { CSBasePage } from '../../core/pages/CSBasePage';

/**
 * Central BDD execution context
 * Manages all test state and provides access to various contexts
 */
export class BDDContext {
  private static instance: BDDContext;
  private executionContext: ExecutionContext | undefined;
  private featureContext: FeatureContext | undefined;
  private scenarioContext: ScenarioContext | undefined;
  private stepContext: StepContext | undefined;
  private readonly responseStorage: ResponseStorage;
  private readonly worldContext: WorldContext;
  private readonly logger: Logger;
  private testData: any = {};
  private softAssertions: string[] = [];
  private currentPage: Page | undefined;
  private currentBrowserContext: BrowserContext | undefined;
  private pageObjects: Map<string, CSBasePage> = new Map();

  private constructor() {
    this.logger = Logger.getInstance('BDDContext');
    this.responseStorage = ResponseStorage.getInstance();
    this.worldContext = WorldContext.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): BDDContext {
    if (!BDDContext.instance) {
      BDDContext.instance = new BDDContext();
    }
    return BDDContext.instance;
  }

  /**
   * Initialize for new execution
   */
  public initialize(executionContext: ExecutionContext): void {
    this.executionContext = executionContext;
    this.softAssertions = [];
    this.testData = {};
    
    ActionLogger.logContextInitialization('BDDContext');
    this.logger.info('BDD context initialized');
  }

  /**
   * Set current feature
   */
  public setFeature(feature: Feature): void {
    this.featureContext = new FeatureContext(feature);
    ActionLogger.logFeatureStart(feature.name);
  }

  /**
   * Set current scenario
   */
  public setScenario(scenario: Scenario): void {
    if (!this.featureContext) {
      throw new Error('Feature context not set');
    }

    this.scenarioContext = new ScenarioContext(
      scenario,
      this.featureContext.getFeature().name
    );
    
    ActionLogger.logScenarioStart(scenario.name);
  }

  /**
   * Set current step
   */
  public setStep(stepContext: StepContext): void {
    this.stepContext = stepContext;
  }

  /**
   * Get execution context
   */
  public getExecutionContext(): ExecutionContext {
    if (!this.executionContext) {
      throw new Error('Execution context not initialized');
    }
    return this.executionContext;
  }

  /**
   * Get feature context
   */
  public getFeatureContext(): FeatureContext {
    if (!this.featureContext) {
      throw new Error('Feature context not set');
    }
    return this.featureContext;
  }

  /**
   * Get scenario context
   */
  public getScenarioContext(): ScenarioContext {
    if (!this.scenarioContext) {
      throw new Error('Scenario context not set');
    }
    return this.scenarioContext;
  }

  /**
   * Get step context
   */
  public getStepContext(): StepContext {
    if (!this.stepContext) {
      throw new Error('Step context not set');
    }
    return this.stepContext;
  }

  /**
   * Get response storage
   */
  public getResponseStorage(): ResponseStorage {
    return this.responseStorage;
  }

  /**
   * Get world context
   */
  public getWorld(): WorldContext {
    return this.worldContext;
  }

  /**
   * Set test data
   */
  public setTestData(data: any): void {
    this.testData = data;
    ActionLogger.logTestDataSet(`Test data set with ${Object.keys(data).length} keys`, { 
      keys: Object.keys(data),
      count: Object.keys(data).length 
    });
  }

  /**
   * Get test data
   */
  public getTestData(): any {
    return this.testData;
  }

  /**
   * Get test data value
   */
  public getTestDataValue(key: string, defaultValue?: any): any {
    const keys = key.split('.');
    let value = this.testData;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Register a page object for use in steps
   */
  public registerPageObject<T extends CSBasePage>(name: string, pageObjectClass: new () => T): void {
    const pageObject = new pageObjectClass();
    if (this.currentPage) {
      pageObject.initialize(this.currentPage);
    }
    this.pageObjects.set(name, pageObject);
    
    ActionLogger.logDebug(`Page object registered: ${name}`);
  }

  /**
   * Get a registered page object
   */
  public getPageObject<T extends CSBasePage>(name: string): T {
    const pageObject = this.pageObjects.get(name);
    if (!pageObject) {
      throw new Error(`Page object '${name}' not found. Make sure it's registered before use.`);
    }
    return pageObject as T;
  }

  /**
   * Initialize all registered page objects with current page
   */
  private async initializePageObjects(): Promise<void> {
    if (!this.currentPage) {
      return;
    }

    for (const [name, pageObject] of this.pageObjects) {
      try {
        await pageObject.initialize(this.currentPage);
        ActionLogger.logDebug(`Page object initialized: ${name}`);
      } catch (error) {
        this.logger.error(`Failed to initialize page object ${name}:`, error as Error);
      }
    }
  }

  /**
   * Set current page
   */
  public async setCurrentPage(page: Page): Promise<void> {
    this.currentPage = page;
    
    // Initialize all registered page objects with the new page
    await this.initializePageObjects();
  }

  /**
   * Get current page
   */
  public static getCurrentPage(): Page {
    const instance = BDDContext.getInstance();
    if (!instance.currentPage) {
      throw new Error('No page is currently active');
    }
    return instance.currentPage;
  }

  /**
   * Set browser context
   */
  public setCurrentBrowserContext(context: BrowserContext): void {
    this.currentBrowserContext = context;
  }

  /**
   * Get browser context
   */
  public getCurrentBrowserContext(): BrowserContext {
    if (!this.currentBrowserContext) {
      throw new Error('No browser context is currently active');
    }
    return this.currentBrowserContext;
  }

  /**
   * Add soft assertion failure
   */
  public addSoftAssertionFailure(message: string): void {
    this.softAssertions.push(message);
    ActionLogger.logSoftAssertionFailure(message);
  }

  /**
   * Get soft assertion failures
   */
  public getSoftAssertionFailures(): string[] {
    return [...this.softAssertions];
  }

  /**
   * Check if there are soft assertion failures
   */
  public hasSoftAssertionFailures(): boolean {
    return this.softAssertions.length > 0;
  }

  /**
   * Clear soft assertions
   */
  public clearSoftAssertions(): void {
    this.softAssertions = [];
  }

  /**
   * Store API response
   */
  public storeResponse(alias: string, response: any): void {
    const scenarioId = this.scenarioContext?.getScenarioId() || 'global';
    this.responseStorage.store(alias, response, scenarioId);
  }

  /**
   * Retrieve API response
   */
  public retrieveResponse<T = any>(alias: string): T {
    const scenarioId = this.scenarioContext?.getScenarioId() || 'global';
    return this.responseStorage.retrieve<T>(alias, scenarioId);
  }

  /**
   * Store value in appropriate context
   */
  public store(key: string, value: any, scope: 'step' | 'scenario' | 'feature' | 'world' = 'scenario'): void {
    switch (scope) {
      case 'step':
        if (this.stepContext) {
          this.stepContext.setMetadata(key, value);
        }
        break;
      case 'scenario':
        if (this.scenarioContext) {
          this.scenarioContext.set(key, value);
        }
        break;
      case 'feature':
        if (this.featureContext) {
          this.featureContext.set(key, value);
        }
        break;
      case 'world':
        this.worldContext.set(key, value);
        break;
    }
  }

  /**
   * Retrieve value from contexts (searches in order: step -> scenario -> feature -> world)
   */
  public retrieve<T = any>(key: string, defaultValue?: T): T | undefined {
    // Check step context
    if (this.stepContext) {
      const stepValue = this.stepContext.getMetadata(key);
      if (stepValue !== undefined) {
        return stepValue;
      }
    }

    // Check scenario context
    if (this.scenarioContext && this.scenarioContext.has(key)) {
      return this.scenarioContext.get<T>(key);
    }

    // Check feature context
    if (this.featureContext && this.featureContext.has(key)) {
      return this.featureContext.get<T>(key);
    }

    // Check world context
    if (this.worldContext.has(key)) {
      return this.worldContext.get<T>(key);
    }

    return defaultValue;
  }

  /**
   * Clear scenario-level state
   */
  public clearScenarioState(): void {
    this.scenarioContext?.clear();
    this.stepContext = undefined;
    this.clearSoftAssertions();
    
    // Clear scenario-specific responses
    if (this.scenarioContext) {
      this.responseStorage.clearScenario(this.scenarioContext.getScenarioId());
    }
  }

  /**
   * Clear feature-level state
   */
  public clearFeatureState(): void {
    this.featureContext?.clear();
    this.scenarioContext = undefined;
    this.stepContext = undefined;
    this.clearSoftAssertions();
  }

  /**
   * Clear all state
   */
  public clear(): void {
    this.executionContext = undefined;
    this.featureContext = undefined;
    this.scenarioContext = undefined;
    this.stepContext = undefined;
    this.testData = {};
    this.softAssertions = [];
    this.currentPage = undefined;
    this.currentBrowserContext = undefined;
    this.responseStorage.clear();
    
    this.logger.info('BDD context cleared');
  }

  /**
   * Export context for debugging
   */
  public export(): any {
    return {
      hasExecutionContext: !!this.executionContext,
      feature: this.featureContext?.getFeature().name,
      scenario: this.scenarioContext?.getScenario().name,
      step: this.stepContext?.getStepText(),
      testDataKeys: Object.keys(this.testData),
      softAssertions: this.softAssertions.length,
      hasPage: !!this.currentPage,
      hasBrowserContext: !!this.currentBrowserContext,
      storedResponses: this.responseStorage.export()
    };
  }
}

// Export singleton instance
export const bddContext = BDDContext.getInstance();