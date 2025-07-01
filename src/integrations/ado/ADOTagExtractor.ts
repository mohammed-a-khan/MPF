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
  
  static extractADOMetadata(
    scenario: ScenarioResult,
    feature: FeatureResult,
    configDefaults: ADOMetadata
  ): ADOMetadata {
    const metadata: ADOMetadata = {};
    
    let scenarioTags = scenario.tags || [];
    
    if (scenarioTags.length === 0 && scenario.scenarioRef?.tags) {
      scenarioTags = scenario.scenarioRef.tags;
      this.logger.debug(`Using tags from scenarioRef for "${scenario.scenario}"`);
    }
    
    this.logger.debug(`Extracting metadata from scenario "${scenario.scenario}" tags: ${JSON.stringify(scenarioTags)}`);
    
    if (scenarioTags.length > 0) {
      const scenarioMetadata = this.extractFromTags(scenarioTags);
      Object.assign(metadata, scenarioMetadata);
    }
    
    if (feature.tags) {
      const featureMetadata = this.extractFromTags(feature.tags);
      if (!metadata.testPlanId && featureMetadata.testPlanId) {
        metadata.testPlanId = featureMetadata.testPlanId;
      }
      if (!metadata.testSuiteId && featureMetadata.testSuiteId) {
        metadata.testSuiteId = featureMetadata.testSuiteId;
      }
    }
    
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
  
  private static extractFromTags(tags: string[]): ADOMetadata {
    const metadata: ADOMetadata = {};
    this.logger.debug(`Extracting from tags: ${JSON.stringify(tags)}`);
    
    for (const tag of tags) {
      const testCaseMatch = tag.match(/^@?TestCaseId[-:](\d+)$/i);
      if (testCaseMatch && testCaseMatch[1]) {
        metadata.testCaseId = parseInt(testCaseMatch[1], 10);
        this.logger.debug(`Found test case ID ${metadata.testCaseId} from tag ${tag}`);
        continue;
      }
      
      const testPlanMatch = tag.match(/^@?TestPlanId[-:](\d+)$/i);
      if (testPlanMatch && testPlanMatch[1]) {
        metadata.testPlanId = parseInt(testPlanMatch[1], 10);
        this.logger.debug(`Found test plan ID ${metadata.testPlanId} from tag ${tag}`);
        continue;
      }
      
      const testSuiteMatch = tag.match(/^@?TestSuiteId[-:](\d+)$/i);
      if (testSuiteMatch && testSuiteMatch[1]) {
        metadata.testSuiteId = parseInt(testSuiteMatch[1], 10);
        this.logger.debug(`Found test suite ID ${metadata.testSuiteId} from tag ${tag}`);
        continue;
      }
    }
    
    return metadata;
  }
  
  static hasTestCaseMapping(scenario: ScenarioResult): boolean {
    const tags = scenario.tags || scenario.scenarioRef?.tags || [];
    if (tags.length === 0) return false;
    
    return tags.some(tag => 
      /^@?TestCaseId[-:]\d+$/i.test(tag)
    );
  }
  
  static getADOTags(tags: string[]): string[] {
    return tags.filter(tag => 
      /^@?(?:TestCaseId|TestPlanId|TestSuiteId)[-:]\d+$/i.test(tag)
    );
  }
}
