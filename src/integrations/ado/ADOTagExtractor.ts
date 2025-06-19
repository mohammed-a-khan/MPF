// src/integrations/ado/ADOTagExtractor.ts
import { FeatureResult, ScenarioResult } from '../../bdd/types/bdd.types';
import { Logger } from '../../core/utils/Logger';

export interface ADOMetadata {
  testPlanId?: number;
  testSuiteId?: number;
  testCaseId?: number;
}

export class ADOTagExtractor {
  private static readonly logger = Logger.getInstance(ADOTagExtractor.name);
  
  /**
   * Extract ADO metadata from scenario and feature tags
   * Priority: Scenario tags > Feature tags > Configuration
   * 
   * @TestCaseId-XXX - Test case ID (scenario level only)
   * @TestPlanId-XXX - Test plan ID (feature or scenario level)
   * @TestSuiteId-XXX - Test suite ID (feature or scenario level)
   */
  static extractADOMetadata(
    scenario: ScenarioResult,
    feature: FeatureResult,
    configDefaults: ADOMetadata
  ): ADOMetadata {
    const metadata: ADOMetadata = {};
    
    // First, check scenario tags (from result or from scenarioRef)
    let scenarioTags = scenario.tags || [];
    
    // If no tags but scenarioRef exists, use tags from there
    if (scenarioTags.length === 0 && scenario.scenarioRef?.tags) {
      scenarioTags = scenario.scenarioRef.tags;
      this.logger.debug(`Using tags from scenarioRef for "${scenario.scenario}"`);
    }
    
    this.logger.debug(`Extracting metadata from scenario "${scenario.scenario}" tags: ${JSON.stringify(scenarioTags)}`);
    
    if (scenarioTags.length > 0) {
      const scenarioMetadata = this.extractFromTags(scenarioTags);
      Object.assign(metadata, scenarioMetadata);
    }
    
    // Then, check feature tags for missing values
    if (feature.tags) {
      const featureMetadata = this.extractFromTags(feature.tags);
      // Only use feature values if not already set from scenario
      if (!metadata.testPlanId && featureMetadata.testPlanId) {
        metadata.testPlanId = featureMetadata.testPlanId;
      }
      if (!metadata.testSuiteId && featureMetadata.testSuiteId) {
        metadata.testSuiteId = featureMetadata.testSuiteId;
      }
    }
    
    // Finally, use configuration defaults for any missing values
    if (!metadata.testPlanId && configDefaults.testPlanId) {
      metadata.testPlanId = configDefaults.testPlanId;
    }
    if (!metadata.testSuiteId && configDefaults.testSuiteId) {
      metadata.testSuiteId = configDefaults.testSuiteId;
    }
    if (!metadata.testCaseId && configDefaults.testCaseId) {
      metadata.testCaseId = configDefaults.testCaseId;
    }
    
    this.logger.debug(
      `Extracted ADO metadata - TestPlan: ${metadata.testPlanId}, TestSuite: ${metadata.testSuiteId}, TestCase: ${metadata.testCaseId}`
    );
    
    return metadata;
  }
  
  /**
   * Extract ADO metadata from tags array
   */
  private static extractFromTags(tags: string[]): ADOMetadata {
    const metadata: ADOMetadata = {};
    this.logger.debug(`Extracting from tags: ${JSON.stringify(tags)}`);
    
    for (const tag of tags) {
      // Test Case ID: @TestCaseId-415 or @TestCaseId:415
      const testCaseMatch = tag.match(/^@?TestCaseId[-:](\d+)$/i);
      if (testCaseMatch && testCaseMatch[1]) {
        metadata.testCaseId = parseInt(testCaseMatch[1], 10);
        this.logger.debug(`Found test case ID ${metadata.testCaseId} from tag ${tag}`);
        continue;
      }
      
      // Test Plan ID: @TestPlanId-413 or @TestPlanId:413
      const testPlanMatch = tag.match(/^@?TestPlanId[-:](\d+)$/i);
      if (testPlanMatch && testPlanMatch[1]) {
        metadata.testPlanId = parseInt(testPlanMatch[1], 10);
        this.logger.debug(`Found test plan ID ${metadata.testPlanId} from tag ${tag}`);
        continue;
      }
      
      // Test Suite ID: @TestSuiteId-414 or @TestSuiteId:414
      const testSuiteMatch = tag.match(/^@?TestSuiteId[-:](\d+)$/i);
      if (testSuiteMatch && testSuiteMatch[1]) {
        metadata.testSuiteId = parseInt(testSuiteMatch[1], 10);
        this.logger.debug(`Found test suite ID ${metadata.testSuiteId} from tag ${tag}`);
        continue;
      }
    }
    
    return metadata;
  }
  
  /**
   * Check if a scenario has ADO test case mapping
   */
  static hasTestCaseMapping(scenario: ScenarioResult): boolean {
    const tags = scenario.tags || scenario.scenarioRef?.tags || [];
    if (tags.length === 0) return false;
    
    return tags.some(tag => 
      /^@?TestCaseId[-:]\d+$/i.test(tag)
    );
  }
  
  /**
   * Get all ADO-related tags from scenario
   */
  static getADOTags(tags: string[]): string[] {
    return tags.filter(tag => 
      /^@?(?:TestCaseId|TestPlanId|TestSuiteId)[-:]\d+$/i.test(tag)
    );
  }
}