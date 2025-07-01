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

  public static getInstance(): BDDContext {
    if (!BDDContext.instance) {
      BDDContext.instance = new BDDContext();
    }
    return BDDContext.instance;
  }

  public initialize(executionContext: ExecutionContext): void {
    this.executionContext = executionContext;
    this.softAssertions = [];
    this.testData = {};
    
    ActionLogger.logContextInitialization('BDDContext');
    this.logger.info('BDD context initialized');
  }

  public setFeature(feature: Feature): void {
    this.featureContext = new FeatureContext(feature);
    ActionLogger.logFeatureStart(feature.name);
  }

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

  public setStep(stepContext: StepContext): void {
    this.stepContext = stepContext;
  }

  public getExecutionContext(): ExecutionContext {
    if (!this.executionContext) {
      throw new Error('Execution context not initialized');
    }
    return this.executionContext;
  }

  public getFeatureContext(): FeatureContext {
    if (!this.featureContext) {
      throw new Error('Feature context not set');
    }
    return this.featureContext;
  }

  public getScenarioContext(): ScenarioContext {
    if (!this.scenarioContext) {
      throw new Error('Scenario context not set');
    }
    return this.scenarioContext;
  }

  public getStepContext(): StepContext {
    if (!this.stepContext) {
      throw new Error('Step context not set');
    }
    return this.stepContext;
  }

  public getResponseStorage(): ResponseStorage {
    return this.responseStorage;
  }

  public getWorld(): WorldContext {
    return this.worldContext;
  }

  public setTestData(data: any): void {
    this.testData = data;
    ActionLogger.logTestDataSet(`Test data set with ${Object.keys(data).length} keys`, { 
      keys: Object.keys(data),
      count: Object.keys(data).length 
    });
  }

  public getTestData(): any {
    return this.testData;
  }

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

  public registerPageObject<T extends CSBasePage>(name: string, pageObjectClass: new () => T): void {
    const pageObject = new pageObjectClass();
    if (this.currentPage) {
      pageObject.initialize(this.currentPage);
    }
    this.pageObjects.set(name, pageObject);
    
    ActionLogger.logDebug(`Page object registered: ${name}`);
  }

  public getPageObject<T extends CSBasePage>(name: string): T {
    const pageObject = this.pageObjects.get(name);
    if (!pageObject) {
      throw new Error(`Page object '${name}' not found. Make sure it's registered before use.`);
    }
    return pageObject as T;
  }

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

  public async setCurrentPage(page: Page): Promise<void> {
    this.currentPage = page;
    
    await this.initializePageObjects();
  }

  public static getCurrentPage(): Page {
    const instance = BDDContext.getInstance();
    
    if (!instance.currentPage || instance.currentPage.isClosed()) {
      if (instance.executionContext) {
        try {
          if (instance.executionContext.isPageValid()) {
            instance.currentPage = instance.executionContext.getPage();
            ActionLogger.logInfo('Reusing valid page from execution context');
          } else {
            ActionLogger.logWarn('Current page is invalid, will need reinitialization');
            throw new Error('Page is not available or has been closed - please reinitialize');
          }
        } catch (error) {
          ActionLogger.logError('Failed to get page from execution context', error as Error);
          throw new Error('Page is not available or has been closed - please reinitialize');
        }
      } else {
        throw new Error('No execution context available - BDD context not properly initialized');
      }
    }

    if (!instance.currentPage || instance.currentPage.isClosed()) {
      throw new Error('Page is not available or has been closed - please reinitialize');
    }

    return instance.currentPage;
  }

  public setCurrentBrowserContext(context: BrowserContext): void {
    this.currentBrowserContext = context;
  }

  public getCurrentBrowserContext(): BrowserContext {
    if (!this.currentBrowserContext) {
      throw new Error('No browser context is currently active');
    }
    return this.currentBrowserContext;
  }

  public addSoftAssertionFailure(message: string): void {
    this.softAssertions.push(message);
    ActionLogger.logSoftAssertionFailure(message);
  }

  public getSoftAssertionFailures(): string[] {
    return [...this.softAssertions];
  }

  public hasSoftAssertionFailures(): boolean {
    return this.softAssertions.length > 0;
  }

  public clearSoftAssertions(): void {
    this.softAssertions = [];
  }

  public storeResponse(alias: string, response: any): void {
    const scenarioId = this.scenarioContext?.getScenarioId() || 'global';
    this.responseStorage.store(alias, response, scenarioId);
  }

  public retrieveResponse<T = any>(alias: string): T {
    const scenarioId = this.scenarioContext?.getScenarioId() || 'global';
    return this.responseStorage.retrieve<T>(alias, scenarioId);
  }

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

  public retrieve<T = any>(key: string, defaultValue?: T): T | undefined {
    if (this.stepContext) {
      const stepValue = this.stepContext.getMetadata(key);
      if (stepValue !== undefined) {
        return stepValue;
      }
    }

    if (this.scenarioContext && this.scenarioContext.has(key)) {
      return this.scenarioContext.get<T>(key);
    }

    if (this.featureContext && this.featureContext.has(key)) {
      return this.featureContext.get<T>(key);
    }

    if (this.worldContext.has(key)) {
      return this.worldContext.get<T>(key);
    }

    return defaultValue;
  }

  public clearScenarioState(): void {
    this.scenarioContext?.clear();
    this.stepContext = undefined;
    this.clearSoftAssertions();
    
    if (this.scenarioContext) {
      this.responseStorage.clearScenario(this.scenarioContext.getScenarioId());
    }
  }

  public clearFeatureState(): void {
    this.featureContext?.clear();
    this.scenarioContext = undefined;
    this.stepContext = undefined;
    this.clearSoftAssertions();
  }

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

export const bddContext = BDDContext.getInstance();
