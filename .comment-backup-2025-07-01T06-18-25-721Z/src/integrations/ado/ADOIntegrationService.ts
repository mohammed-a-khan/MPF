// src/integrations/ado/ADOIntegrationService.ts
import { ADOClient } from './ADOClient';
import { ADOConfig } from './ADOConfig';
import { TestSuiteManager } from './TestSuiteManager';
import { TestRunManager, TestRunCreateRequest } from './TestRunManager';
import { TestResultUploader } from './TestResultUploader';
import { EvidenceUploader } from './EvidenceUploader';
import { Logger } from '../../core/utils/Logger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { FeatureResult, ScenarioResult, ExecutionResult } from '../../bdd/types/bdd.types';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';

export interface ADOTestRun {
  id: number;
  name: string;
  state: string;
  startedDate?: string;
  completedDate?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  notExecutedTests: number;
  url: string;
  comment?: string;
}
export interface ADOTestResult {
  id: number;
  testCaseId: number;
  testPointId: number;
  outcome: 'Passed' | 'Failed' | 'NotExecuted' | 'Blocked' | 'NotApplicable';
  state: 'Pending' | 'Queued' | 'InProgress' | 'Paused' | 'Completed';
  errorMessage?: string;
  stackTrace?: string;
  startedDate: string;
  completedDate: string;
  durationInMs: number;
  comment?: string;
  associatedBugs?: number[];
  attachments?: Array<{ id: string; name: string; url: string }>;
}
export interface ADOUploadOptions {
  testPlanId?: number;
  testSuiteId?: number;
  buildId?: string;
  releaseId?: string;
  runName?: string;
  includeScreenshots?: boolean;
  includeVideos?: boolean;
  includeLogs?: boolean;
  createBugsOnFailure?: boolean;
  updateTestCases?: boolean;
}
export class ADOIntegrationService {
  private static readonly logger = Logger.getInstance(ADOIntegrationService.name);
  private static instance: ADOIntegrationService;
  
  private readonly client: ADOClient;
  private readonly testSuiteManager: TestSuiteManager;
  private readonly testRunManager: TestRunManager;
  private readonly testResultUploader: TestResultUploader;
  private readonly evidenceUploader: EvidenceUploader;
  
  private currentTestRun: ADOTestRun | null = null;
  private testCaseMapping = new Map<string, number>();
  private uploadQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private testCaseToTestPoint = new Map<number, number>();
  private constructor() {
    this.client = ADOClient.getInstance();
    this.testSuiteManager = new TestSuiteManager(this.client);
    this.testRunManager = new TestRunManager(this.client);
    this.testResultUploader = new TestResultUploader(this.client);
    this.evidenceUploader = new EvidenceUploader(this.client);
    
    ADOIntegrationService.logger.info('ADO Integration Service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ADOIntegrationService {
    if (!this.instance) {
      this.instance = new ADOIntegrationService();
    }
    return this.instance;
  }

  /**
   * Initialize service
   */
  async initialize(): Promise<void> {
    try {
      ADOIntegrationService.logger.info('Initializing ADO integration...');
      
      const isEnabled = ConfigurationManager.getBoolean('ADO_INTEGRATION_ENABLED', false);
      
      if (!isEnabled) {
        ADOIntegrationService.logger.info('ADO integration is disabled - service initialized in disabled state');
        return;
      }
      
      ADOConfig.initialize();
      
      await this.verifyConnection();
      
      const config = ADOConfig.getConfig();
      if (config.testPlanId && config.testSuiteId) {
        try {
          await this.loadTestCaseMappings(config.testPlanId, config.testSuiteId);
        } catch (mappingError) {
          ADOIntegrationService.logger.warn('Failed to load test case mappings - will use tag-based mapping', mappingError as Error);
        }
      }
      
      ADOIntegrationService.logger.info('ADO integration initialized successfully');
    } catch (error) {
      ADOIntegrationService.logger.error('Failed to initialize ADO integration:', error as Error);
      throw error;
    }
  }

  /**
   * Verify ADO connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      ADOIntegrationService.logger.info('Verifying ADO connection...');
      
      const orgUrl = ADOConfig.getConfig().organizationUrl;
      const projectName = ADOConfig.getConfig().projectName;
      const projectUrl = `${orgUrl}/_apis/projects/${projectName}`;
      const response = await this.client.get(projectUrl);
      
      if (response.status === 200) {
        ADOIntegrationService.logger.info(`Successfully connected to ADO project: ${response.data.name}`);
      }
    } catch (error) {
      ADOIntegrationService.logger.error('ADO connection verification failed:', error as Error);
      ADOIntegrationService.logger.warn('ADO connection failed - tests will run but results may not be uploaded to ADO');
    }
  }

  /**
   * Upload test results to ADO
   */
  async uploadTestResults(
    executionResult: ExecutionResult,
    options?: ADOUploadOptions
  ): Promise<ADOTestRun[]> {
    try {
      ADOIntegrationService.logger.info('Starting test results upload to ADO...');
      ADOIntegrationService.logger.info(`Processing ${executionResult.features.length} features with ${executionResult.summary.total} total scenarios`);
      
      // Log initial scenario state
      ADOIntegrationService.logger.info(
        `uploadTestResults called with ${executionResult.features.length} features`
      );
      for (const feature of executionResult.features) {
        for (const scenario of feature.scenarios) {
          if (scenario.tags?.some(tag => tag.includes('TestCaseId'))) {
            ADOIntegrationService.logger.info(
              `Initial scenario "${scenario.scenario}" adoMetadata - type: ${typeof scenario.adoMetadata}, value: ${JSON.stringify(scenario.adoMetadata)}`
            );
          }
        }
      }
      
      const scenariosByTestPlanSuite = await this.groupScenariosByTestPlanSuite(executionResult, options);
      
      if (scenariosByTestPlanSuite.size === 0) {
        throw new Error('No scenarios with valid ADO test configuration found');
      }
      
      const testRuns: ADOTestRun[] = [];
      
      for (const [, groupedData] of scenariosByTestPlanSuite) {
        const { testPlanId, testSuiteId, scenarios } = groupedData;
        ADOIntegrationService.logger.info(
          `Creating test run for Plan: ${testPlanId}, Suite: ${testSuiteId} with ${scenarios.length} scenarios`
        );
        
        // Debug: Check if scenarios have metadata before creating partial result
        for (const { scenario } of scenarios) {
          ADOIntegrationService.logger.info(
            `Before createFeaturesFromScenarios - scenario "${scenario.scenario}" adoMetadata: ${JSON.stringify(scenario.adoMetadata)}`
          );
        }
        
        try {
          ADOIntegrationService.logger.info(
            `Creating partial result for ${scenarios.length} scenarios with test plan ${testPlanId}, suite ${testSuiteId}`
          );
          
          const partialResult: ExecutionResult = {
            ...executionResult,
            features: this.createFeaturesFromScenarios(scenarios),
            summary: this.calculateSummaryForScenarios(scenarios)
          };
          
          const runOptions = this.mergeUploadOptions({
            ...options,
            testPlanId,
            testSuiteId
          });
          
          const testRun = await this.createTestRun(partialResult, runOptions, scenarios);
          
          if (!testRun) {
            ADOIntegrationService.logger.warn(
              `Skipping test run for Plan: ${testPlanId}, Suite: ${testSuiteId} - no valid test cases found`
            );
            continue; // Skip to next group
          }
          
          this.currentTestRun = testRun;
          ADOIntegrationService.logger.info(`Created test run: ${this.currentTestRun.name} (ID: ${this.currentTestRun.id})`);
          
          for (const { scenario, feature } of scenarios) {
            try {
              await this.uploadScenarioResult(scenario, feature, runOptions, scenario.adoMetadata!.testCaseId!);
            } catch (scenarioError) {
              ADOIntegrationService.logger.error(
                `Failed to upload result for scenario: ${scenario.scenario}`,
                scenarioError as Error
              );
            }
          }
          
          await this.uploadReportsFolder(partialResult);
          await this.completeTestRun();
          
          testRuns.push(this.currentTestRun);
        } catch (error) {
          ADOIntegrationService.logger.error(
            `Failed to create test run for Plan: ${testPlanId}, Suite: ${testSuiteId}`,
            error as Error
          );
        }
      }
      
      await this.processUploadQueue();
      
      ADOIntegrationService.logger.info(`Test results uploaded successfully. Created ${testRuns.length} test runs`);
      return testRuns;
    } catch (error) {
      ADOIntegrationService.logger.error('Failed to upload test results:', error as Error);
      
      if (this.currentTestRun) {
        try {
          await this.testRunManager.updateTestRun(this.currentTestRun.id, {
            state: 'Aborted',
            comment: `Upload failed: ${(error as Error).message}`
          });
        } catch (updateError) {
          ADOIntegrationService.logger.error('Failed to mark test run as aborted:', updateError as Error);
        }
      }
      
      throw error;
    }
  }

  /**
   * Create test run
   */
  private async createTestRun(
    executionResult: ExecutionResult,
    options: Required<ADOUploadOptions>,
    scenariosWithMetadata?: Array<{ scenario: ScenarioResult; feature: FeatureResult }>
  ): Promise<ADOTestRun | null> {

    if (!options.testPlanId || !options.testSuiteId) {
      throw new Error('Test Plan ID and Test Suite ID are required for ADO integration');
    }
    
    const testPlanId = options.testPlanId;
    const testSuiteId = options.testSuiteId;
    
    const testCaseIdToScenario = new Map<number, { scenario: ScenarioResult; feature: FeatureResult }>();
    
    // Use provided scenarios with metadata if available, otherwise fall back to executionResult
    if (scenariosWithMetadata) {
      ADOIntegrationService.logger.info(`Using ${scenariosWithMetadata.length} scenarios with metadata`);
      for (const { scenario, feature } of scenariosWithMetadata) {
        ADOIntegrationService.logger.info(
          `Checking scenario "${scenario.scenario}" for adoMetadata: ${JSON.stringify(scenario.adoMetadata)}`
        );
        if (scenario.adoMetadata?.testCaseId) {
          testCaseIdToScenario.set(scenario.adoMetadata.testCaseId, { scenario, feature });
          ADOIntegrationService.logger.info(
            `Found test case ID ${scenario.adoMetadata.testCaseId} for scenario "${scenario.scenario}"`
          );
        }
      }
    } else {
      // Fallback to original logic for backward compatibility
      for (const feature of executionResult.features) {
        for (const scenario of feature.scenarios) {
          // Fix metadata if it's in an incorrect format (same as in createFeaturesFromScenarios)
          if (scenario.adoMetadata) {
            if (typeof scenario.adoMetadata === 'string') {
              try {
                scenario.adoMetadata = JSON.parse(scenario.adoMetadata as any);
              } catch (e) {
                ADOIntegrationService.logger.error(`Failed to parse adoMetadata string for scenario "${scenario.scenario}"`);
              }
            } else if (typeof scenario.adoMetadata === 'object' && '0' in scenario.adoMetadata) {
              try {
                const chars = Object.keys(scenario.adoMetadata)
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(key => (scenario.adoMetadata as any)[key]);
                const jsonString = chars.join('');
                scenario.adoMetadata = JSON.parse(jsonString);
              } catch (e) {
                ADOIntegrationService.logger.error(`Failed to reconstruct adoMetadata for scenario "${scenario.scenario}"`);
              }
            }
          }
          
          ADOIntegrationService.logger.info(
            `Checking scenario "${scenario.scenario}" for adoMetadata: ${JSON.stringify(scenario.adoMetadata)}`
          );
          if (scenario.adoMetadata?.testCaseId) {
            testCaseIdToScenario.set(scenario.adoMetadata.testCaseId, { scenario, feature });
            ADOIntegrationService.logger.info(
              `Found test case ID ${scenario.adoMetadata.testCaseId} for scenario "${scenario.scenario}"`
            );
          }
        }
      }
    }
    
    if (testCaseIdToScenario.size === 0) {
      throw new Error('No scenarios with test case IDs found in this test run.');
    }
    
    const testPointIds: number[] = [];
    const testCaseToTestPoint = new Map<number, number>();
    
    try {

      ADOIntegrationService.logger.debug(`Getting test points for Plan: ${testPlanId}, Suite: ${testSuiteId}`);
      const allTestPoints = await this.testSuiteManager.getTestPoints(testPlanId, testSuiteId);
      ADOIntegrationService.logger.debug(`Retrieved ${allTestPoints.length} test points from suite`);
      
      if (allTestPoints.length > 0) {
        ADOIntegrationService.logger.debug('Test points found:', allTestPoints.map(tp => ({
          id: tp.id,
          testCaseId: tp.testCaseId || tp.testCase?.id || tp.testCaseReference?.id,
          testCase: tp.testCase,
          configurationId: tp.configurationId || tp.configuration?.id,
          configurationName: tp.configurationName || tp.configuration?.name
        })));
      }
      
      ADOIntegrationService.logger.debug(`Looking for test cases: ${Array.from(testCaseIdToScenario.keys()).join(', ')}`);
      
      for (const [testCaseId] of testCaseIdToScenario) {
        ADOIntegrationService.logger.debug(`Searching for test point with testCaseId: ${testCaseId}`);
        
        const testPoint = allTestPoints.find(tp => {

          const tcId = tp.testCaseId || 
                       tp.testCase?.id || 
                       tp.testCaseReference?.id ||
                       (tp as any).testCase?.id;
          
          const tcIdStr = String(tcId);
          const testCaseIdStr = String(testCaseId);
          
          ADOIntegrationService.logger.debug(`Comparing tcId: ${tcIdStr} (type: ${typeof tcId}) with testCaseId: ${testCaseIdStr} (type: ${typeof testCaseId})`);
          
          return tcIdStr === testCaseIdStr;
        });
        
        if (testPoint) {
          testPointIds.push(testPoint.id);
          testCaseToTestPoint.set(testCaseId, testPoint.id);
        } else {
          ADOIntegrationService.logger.warn(
            `Test case ${testCaseId} not found in Test Plan ${testPlanId}, Suite ${testSuiteId}. ` +
            `This test case will be skipped.`
          );
        }
      }
      
      if (testPointIds.length === 0) {
        ADOIntegrationService.logger.warn(
          `None of the test cases (${Array.from(testCaseIdToScenario.keys()).join(', ')}) found in ` +
          `Test Plan ${testPlanId}, Suite ${testSuiteId}. Skipping this test run.`
        );
        return null; // Return null to indicate no test run was created
      }
    } catch (error) {
      ADOIntegrationService.logger.error('Failed to get test points:', error as Error);
      throw new Error(`Failed to get test points from suite: ${(error as Error).message}`);
    }
    
    this.testCaseToTestPoint = testCaseToTestPoint;
    
    const featureName = executionResult.features.length > 0 
      ? executionResult.features[0]?.name || 'Unknown Feature'
      : 'Test Suite';
    
    const runData: TestRunCreateRequest = {
      name: `${featureName} - ${options.runName}`,
      isAutomated: true,
      state: 'InProgress',
      startedDate: executionResult.startTime.toISOString(),
      comment: this.generateRunComment(executionResult),
      plan: { id: testPlanId.toString() },
      pointIds: testPointIds
    };
    
    if (options.buildId) {
      runData.buildId = options.buildId;
    }
    if (options.releaseId) {
      runData.releaseEnvironmentId = options.releaseId;
    }
    
    ADOIntegrationService.logger.info(
      `Creating test run with ${testPointIds.length} test points for ${testCaseIdToScenario.size} test cases`
    );
    
    const testRun = await this.testRunManager.createTestRun(runData);
    
    return {
      id: testRun.id,
      name: testRun.name,
      state: testRun.state,
      startedDate: testRun.startedDate || '',
      totalTests: testCaseIdToScenario.size,
      passedTests: executionResult.summary.passed,
      failedTests: executionResult.summary.failed,
      notExecutedTests: executionResult.summary.skipped,
      url: testRun.url
    };
  }


  /**
   * Upload scenario result
   */
  private async uploadScenarioResult(
    scenario: ScenarioResult,
    feature: FeatureResult,
    options: Required<ADOUploadOptions>,
    testCaseId: number
  ): Promise<void> {
    try {
      const testPointId = this.testCaseToTestPoint.get(testCaseId);
      if (!testPointId) {
        ADOIntegrationService.logger.error(`No test point found for test case ${testCaseId}`);
        return;
      }
      ADOIntegrationService.logger.debug(`Getting test results for run ${this.currentTestRun!.id}...`);
      const allResultsUrl = ADOConfig.buildUrl(
        `${ADOConfig.getEndpoints().testRuns}/${this.currentTestRun!.id}/results`
      );
      
      const resultsResponse = await this.client.get<any>(allResultsUrl);
      const allTestResults = Array.isArray(resultsResponse.data) 
        ? resultsResponse.data 
        : resultsResponse.data.value || [];
      
      ADOIntegrationService.logger.debug(
        `Found ${allTestResults.length} test results. Looking for testPoint ${testPointId} or testCase ${testCaseId}`
      );
      
      if (allTestResults.length > 0) {
        ADOIntegrationService.logger.debug(`Sample test results: ${JSON.stringify(allTestResults.slice(0, 2).map((r: any) => ({
          id: r.id,
          testCaseId: r.testCase?.id,
          testPointId: r.testPoint?.id,
          outcome: r.outcome,
          state: r.state
        })))}`);
      }
      
      const testResult = allTestResults.find((result: any) => {

        const resultTestPointId = result.testPoint?.id;
        const resultTestCaseId = result.testCase?.id;
        
        const matchByTestPoint = resultTestPointId === testPointId;
        const matchByTestCase = resultTestCaseId === String(testCaseId) || 
                               resultTestCaseId === testCaseId;
        
        if (matchByTestPoint || matchByTestCase) {
          ADOIntegrationService.logger.debug(
            `Matched test result ${result.id} - TestPoint: ${resultTestPointId}, TestCase: ${resultTestCaseId}`
          );
          return true;
        }
        return false;
      });
      
      let testResultId: number;
      
      if (!testResult) {
        ADOIntegrationService.logger.error(
          `No test result found for test case ${testCaseId}/point ${testPointId} in run ${this.currentTestRun!.id}. ` +
          `Available results: ${allTestResults.map((r: any) => 
            `ID:${r.id}, TestCase:${r.testCase?.id}, TestPoint:${r.testPoint?.id}, State:${r.state}`
          ).join(' | ')}`
        );
        throw new Error(`Test result not found for test case ${testCaseId}`);
      } else {
        testResultId = testResult.id;
        ADOIntegrationService.logger.info(
          `Found test result ${testResultId} for test case ${testCaseId} ` +
          `(current state: ${testResult.state}, outcome: ${testResult.outcome})`
        );
        
        // Debug: Log the full test result object to understand its structure
        ADOIntegrationService.logger.debug(
          `Full test result object for debugging: ${JSON.stringify(testResult, null, 2)}`
        );
      }
      
      const testResultUpdate: any = {
        outcome: this.mapOutcome(scenario.status),
        state: 'Completed',
        startedDate: scenario.startTime.toISOString(),
        completedDate: scenario.endTime.toISOString(),
        durationInMs: scenario.duration,
        comment: this.generateResultComment(scenario),
        automatedTestType: 'Cucumber',
        automatedTestName: `${feature.name || 'Feature'}.${scenario.scenario}`,
        automatedTestStorage: 'CS Test Automation Framework',
        automatedTestId: scenario.id || `${scenario.scenario}_${Date.now()}`,
        priority: this.extractPriority(scenario),
        computerName: require('os').hostname()
      };
      
      if (scenario.error) {
        testResultUpdate.errorMessage = scenario.error.message;
        testResultUpdate.stackTrace = scenario.error.stack;
      }
      
      Object.keys(testResultUpdate).forEach(key => {
        if (testResultUpdate[key] === undefined) {
          delete testResultUpdate[key];
        }
      });
      ADOIntegrationService.logger.info(
        `Updating test result ${testResultId} for test case ${testCaseId} with outcome: ${testResultUpdate.outcome}`
      );
      
      // Use the correct API endpoint format for updating test results
      const updateUrl = ADOConfig.buildUrl(
        `${ADOConfig.getEndpoints().testRuns}/${this.currentTestRun!.id}/results`
      );
      
      // Format the update request according to ADO API requirements
      const updatePayload: any[] = [{
        id: testResultId,
        outcome: testResultUpdate.outcome,
        state: testResultUpdate.state,
        durationInMs: Math.round(testResultUpdate.durationInMs), // Ensure it's an integer
        startedDate: testResultUpdate.startedDate,
        completedDate: testResultUpdate.completedDate,
        comment: testResultUpdate.comment
      }];
      
      // Add error information for failed tests
      if (scenario.error && testResultUpdate.outcome === 'Failed') {
        updatePayload[0].errorMessage = testResultUpdate.errorMessage || 'Test failed';
        updatePayload[0].stackTrace = testResultUpdate.stackTrace || '';
        // Don't include failureType and resolutionState as they might cause errors
      }
      
      ADOIntegrationService.logger.debug(`Test result update payload: ${JSON.stringify(updatePayload, null, 2)}`);
      
      try {
        const updateResponse = await this.client.patch(updateUrl, updatePayload);
        
        ADOIntegrationService.logger.debug(
          `Test result ${testResultId} updated successfully. Response status: ${updateResponse.status}`
        );
        
        // Verify the update by getting the specific test result
        const verifyUrl = ADOConfig.buildUrl(
          `${ADOConfig.getEndpoints().testRuns}/${this.currentTestRun!.id}/results/${testResultId}`
        );
        const verifyResponse = await this.client.get<any>(verifyUrl);
        const updatedResult = verifyResponse.data;
        
        ADOIntegrationService.logger.info(
          `Test result ${testResultId} verification - Outcome: ${updatedResult.outcome}, State: ${updatedResult.state}`
        );
      } catch (updateError: any) {
        ADOIntegrationService.logger.error(
          `Failed to update test result ${testResultId}:`,
          updateError
        );
        
        if (updateError.response) {
          ADOIntegrationService.logger.error('Error response:', {
            status: updateError.response.status,
            statusText: updateError.response.statusText,
            data: updateError.response.data
          });
        }
        
        throw updateError;
      }
      
      await this.uploadScenarioAttachments(scenario, testResultId, options);
      
      if (scenario.status === 'failed' && options.createBugsOnFailure) {
        const testResult: ADOTestResult = {
          id: testResultId,
          testCaseId,
          testPointId,
          outcome: testResultUpdate.outcome as any,
          state: 'Completed',
          startedDate: testResultUpdate.startedDate,
          completedDate: testResultUpdate.completedDate,
          durationInMs: testResultUpdate.durationInMs,
          errorMessage: testResultUpdate.errorMessage!,
          stackTrace: testResultUpdate.stackTrace!,
          comment: testResultUpdate.comment
        };
        
        this.queueEvidenceUpload(async () => {
          await this.createBugForFailure(scenario, testResult);
        });
      }
      
      ADOIntegrationService.logger.info(`Successfully updated test result for scenario: ${scenario.scenario}`);
    } catch (error) {
      ADOIntegrationService.logger.error(`Failed to upload scenario result: ${scenario.scenario}`, error as Error);
      throw error;
    }
  }

  /**
   * Upload scenario attachments
   */
  private async uploadScenarioAttachments(
    scenario: ScenarioResult,
    testResultId: number,
    options: Required<ADOUploadOptions>
  ): Promise<void> {
    if (!scenario.attachments || scenario.attachments.length === 0) {
      return;
    }
    ADOIntegrationService.logger.info(`Uploading ${scenario.attachments.length} attachments for test result ${testResultId}`);
    
    for (const attachment of scenario.attachments) {
      if (attachment.path) {
        try {
          if ((attachment.mimeType === 'image/png' || attachment.mimeType === 'image/jpeg') && options.includeScreenshots) {
            await this.evidenceUploader.uploadScreenshot(
              this.currentTestRun!.id,
              testResultId,
              attachment.path
            );
          } else if (attachment.mimeType === 'video/webm' && options.includeVideos) {
            await this.evidenceUploader.uploadVideo(
              this.currentTestRun!.id,
              testResultId,
              attachment.path
            );
          } else if ((attachment.mimeType === 'text/plain' || attachment.mimeType === 'application/json') && options.includeLogs) {
            await this.evidenceUploader.uploadLog(
              this.currentTestRun!.id,
              testResultId,
              attachment.path,
              attachment.name || 'log.txt'
            );
          }
        } catch (error) {
          ADOIntegrationService.logger.error(`Failed to upload attachment ${attachment.name}:`, error as Error);
        }
      }
    }
  }

  /**
   * Extract priority from scenario tags
   */
  private extractPriority(scenario: ScenarioResult): number {
    const priorityTag = scenario.tags?.find(tag => tag.startsWith('@priority:'));
    if (priorityTag) {
      const priority = priorityTag.replace('@priority:', '').toLowerCase();
      switch (priority) {
        case 'critical': return 1;
        case 'high': return 2;
        case 'medium': return 3;
        case 'low': return 4;
        default: return 3;
      }
    }
    return 3;
  }

  /**
   * Load test case mappings
   */
  private async loadTestCaseMappings(testPlanId: number, testSuiteId: number): Promise<void> {
    try {
      ADOIntegrationService.logger.info('Loading test case mappings...');
      
      const testPoints = await this.testSuiteManager.getTestPoints(testPlanId, testSuiteId);
      
      if (testPoints.length === 0) {
        ADOIntegrationService.logger.warn(`No test points found for Test Plan ${testPlanId}, Suite ${testSuiteId}`);
        return;
      }
      
      ADOIntegrationService.logger.info(`Found ${testPoints.length} test points in Test Plan ${testPlanId}, Suite ${testSuiteId}`);
      
      let validTestPoints = 0;
      let invalidTestPoints = 0;
      
      for (const testPoint of testPoints) {
        if (!testPoint.testCaseId) {
          invalidTestPoints++;
          ADOIntegrationService.logger.debug(`Test point ${testPoint.id} has no test case ID - this test point needs to be configured in ADO`);
          continue;
        }
        
        validTestPoints++;
        this.testCaseToTestPoint.set(testPoint.testCaseId, testPoint.id);
        
        try {
          const testCase = await this.getTestCase(testPoint.testCaseId);
          const automatedTestName = testCase.fields['Microsoft.VSTS.TCM.AutomatedTestName'];
          
          if (automatedTestName) {
            this.testCaseMapping.set(automatedTestName, testCase.id);
            ADOIntegrationService.logger.debug(`Mapped automated test "${automatedTestName}" to test case ${testCase.id}`);
          } else {
            ADOIntegrationService.logger.debug(`Test case ${testPoint.testCaseId} has no automated test name configured`);
          }
        } catch (error) {
          ADOIntegrationService.logger.warn(`Failed to load test case ${testPoint.testCaseId}:`, error as Error);
        }
      }
      
      ADOIntegrationService.logger.info(`Test case mapping summary:`);
      ADOIntegrationService.logger.info(`  - Valid test points with test cases: ${validTestPoints}`);
      ADOIntegrationService.logger.info(`  - Test points without test cases: ${invalidTestPoints}`);
      ADOIntegrationService.logger.info(`  - Automated test mappings loaded: ${this.testCaseMapping.size}`);
      
      if (invalidTestPoints > 0) {
        ADOIntegrationService.logger.warn(
          `⚠️  ${invalidTestPoints} test points in ADO Suite ${testSuiteId} don't have associated test cases. ` +
          `To fix this: Go to Azure DevOps → Test Plans → Suite ${testSuiteId} → Add test cases to test points`
        );
      }
      
    } catch (error) {
      ADOIntegrationService.logger.error('Failed to load test case mappings:', error as Error);
    }
  }

  /**
   * Get test case details
   */
  private async getTestCase(testCaseId: number): Promise<any> {
    const url = ADOConfig.buildUrl(
      `${ADOConfig.getEndpoints().testCases}/${testCaseId}`
    );
    
    const response = await this.client.get(url);
    return response.data;
  }

  /**
   * Create bug for failure
   */
  private async createBugForFailure(
    scenario: ScenarioResult,
    testResult: ADOTestResult
  ): Promise<void> {
    try {
      const bugTemplate = ADOConfig.getBugTemplate();
      if (!bugTemplate) return;
      
      const bugData = [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: ADOConfig.formatBugTitle(scenario.scenario, scenario.error?.message)
        },
        {
          op: 'add',
          path: '/fields/System.WorkItemType',
          value: 'Bug'
        },
        {
          op: 'add',
          path: '/fields/Microsoft.VSTS.TCM.ReproSteps',
          value: this.generateReproSteps(scenario)
        },
        {
          op: 'add',
          path: '/fields/System.Description',
          value: `Test Failed: ${scenario.scenario}\n\nError: ${scenario.error?.message}\n\nStack Trace:\n${scenario.error?.stack}`
        },
        {
          op: 'add',
          path: '/fields/Microsoft.VSTS.Common.Priority',
          value: bugTemplate.priority
        },
        {
          op: 'add',
          path: '/fields/Microsoft.VSTS.Common.Severity',
          value: bugTemplate.severity
        }
      ];
      
      if (bugTemplate.assignedTo) {
        bugData.push({
          op: 'add',
          path: '/fields/System.AssignedTo',
          value: bugTemplate.assignedTo
        });
      }
      
      if (bugTemplate.areaPath) {
        bugData.push({
          op: 'add',
          path: '/fields/System.AreaPath',
          value: bugTemplate.areaPath
        });
      }
      
      if (bugTemplate.iterationPath) {
        bugData.push({
          op: 'add',
          path: '/fields/System.IterationPath',
          value: bugTemplate.iterationPath
        });
      }
      
      if (bugTemplate.tags && bugTemplate.tags.length > 0) {
        bugData.push({
          op: 'add',
          path: '/fields/System.Tags',
          value: bugTemplate.tags.join('; ')
        });
      }
      
      if (bugTemplate.customFields) {
        for (const [field, value] of Object.entries(bugTemplate.customFields)) {
          bugData.push({
            op: 'add',
            path: `/fields/${field}`,
            value
          });
        }
      }
      
      // Use the correct endpoint format for creating bugs
      const bugUrl = ADOConfig.buildUrl(`${ADOConfig.getEndpoints().workItems}/$Bug`);
      
      const response = await this.client.post(
        bugUrl,
        bugData,
        {
          headers: {
            'Content-Type': 'application/json-patch+json'
          }
        }
      );
      
      const bugId = response.data.id;
      
      await this.linkBugToTestResult(testResult.id, bugId);
      
      ADOIntegrationService.logger.info(`Created bug ${bugId} for failed test: ${scenario.scenario}`);
    } catch (error) {
      ADOIntegrationService.logger.error('Failed to create bug for failure:', error as Error);
    }
  }

  /**
   * Link bug to test result
   */
  private async linkBugToTestResult(testResultId: number, bugId: number): Promise<void> {
    const linkData = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'Microsoft.VSTS.Common.TestedBy-Reverse',
          url: `${ADOConfig.getBaseUrl()}/wit/workitems/${bugId}`
        }
      }
    ];
    
    await this.testResultUploader.updateTestResult(
      this.currentTestRun!.id,
      testResultId,
      linkData
    );
  }

  /**
   * Complete test run
   */
  private async completeTestRun(): Promise<void> {
    if (!this.currentTestRun) return;
    
    const updateData: any = {
      state: 'Completed',
      completedDate: new Date().toISOString()
    };
    
    const buildId = process.env['BUILD_BUILDID'] || process.env['BUILD_BUILDNUMBER'];
    if (buildId) {
      updateData.buildId = buildId;
      ADOIntegrationService.logger.info(`Updating test run with build ID: ${buildId}`);
    }
    
    updateData.comment = `${this.currentTestRun.comment || ''}\n\nExecution completed at ${new Date().toISOString()}`;
    
    await this.testRunManager.updateTestRun(this.currentTestRun.id, updateData);
    
    this.currentTestRun.state = 'Completed';
    this.currentTestRun.completedDate = new Date().toISOString();
    
    ADOIntegrationService.logger.info(`Test run ${this.currentTestRun.id} completed successfully`);
  }

  /**
   * Queue evidence upload
   */
  private queueEvidenceUpload(uploadFn: () => Promise<void>): void {
    this.uploadQueue.push(uploadFn);
  }

  /**
   * Process upload queue
   */
  private async processUploadQueue(): Promise<void> {
    if (this.isProcessingQueue || this.uploadQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    ADOIntegrationService.logger.info(`Processing ${this.uploadQueue.length} evidence uploads...`);
    
    try {

      const batchSize = 5;
      while (this.uploadQueue.length > 0) {
        const batch = this.uploadQueue.splice(0, batchSize);
        await Promise.all(batch.map(fn => fn().catch(error => {
          ADOIntegrationService.logger.error('Evidence upload failed:', error as Error);
        })));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Merge upload options with configuration
   */
  private mergeUploadOptions(options?: ADOUploadOptions): Required<ADOUploadOptions> {
    const config = ADOConfig.getConfig();
    const uploadConfig = ADOConfig.getUploadConfig();
    
    return {
      testPlanId: options?.testPlanId ?? config.testPlanId ?? 0,
      testSuiteId: options?.testSuiteId ?? config.testSuiteId ?? 0,
      buildId: options?.buildId ?? config.buildId ?? '',
      releaseId: options?.releaseId ?? config.releaseId ?? '',
      runName: this.formatRunName(options?.runName ?? config.runName ?? `Automated Test Run - {{timestamp}}`),
      includeScreenshots: options?.includeScreenshots ?? uploadConfig.uploadScreenshots ?? true,
      includeVideos: options?.includeVideos ?? uploadConfig.uploadVideos ?? true,
      includeLogs: options?.includeLogs ?? uploadConfig.uploadLogs ?? true,
      createBugsOnFailure: options?.createBugsOnFailure ?? config.createBugsOnFailure ?? false,
      updateTestCases: options?.updateTestCases ?? config.updateTestCases ?? false
    };
  }

  /**
   * Map test status to ADO outcome
   */
  private mapOutcome(status: string): ADOTestResult['outcome'] {
    switch (status) {
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      case 'skipped':
        return 'NotExecuted';
      case 'blocked':
        return 'Blocked';
      default:
        return 'NotApplicable';
    }
  }

  /**
   * Format run name by replacing placeholders
   */
  private formatRunName(name: string): string {
    const now = new Date();
    return name
      .replace('{{timestamp}}', now.toISOString())
      .replace('{{date}}', now.toISOString().split('T')[0] || '')
      .replace('{{time}}', now.toTimeString().split(' ')[0] || '');
  }

  /**
   * Generate run comment
   */
  private generateRunComment(executionResult: ExecutionResult): string {
    const { summary } = executionResult;
    return `Automated test run executed ${summary.total} tests. ` +
           `Passed: ${summary.passed}, Failed: ${summary.failed}, Skipped: ${summary.skipped}. ` +
           `Duration: ${summary.duration}ms. ` +
           `Environment: ${executionResult.environment}`;
  }

  /**
   * Generate result comment
   */
  private generateResultComment(scenario: ScenarioResult): string {
    const steps = scenario.steps.length;
    const failedStep = scenario.steps.find(s => s.status === 'failed');
    
    let comment = `Scenario: ${scenario.scenario}\n`;
    comment += `Steps: ${steps}\n`;
    comment += `Duration: ${scenario.duration}ms\n`;
    
    if (failedStep) {
      comment += `\nFailed at step: ${failedStep.text}\n`;
      if (failedStep.error) {
        comment += `Error: ${failedStep.error.message}`;
      }
    }
    
    return comment;
  }

  /**
   * Generate repro steps
   */
  private generateReproSteps(scenario: ScenarioResult): string {
    let steps = '<ol>';
    
    for (const step of scenario.steps) {
      steps += `<li>${step.keyword} ${step.text}`;
      
      if (step.status === 'failed' && step.error) {
        steps += `<br/><strong>Failed with error:</strong> ${step.error.message}`;
      }
      
      steps += '</li>';
    }
    
    steps += '</ol>';
    return steps;
  }

  /**
   * Get test run by ID
   */
  async getTestRun(runId: number): Promise<ADOTestRun> {
    const testRun = await this.testRunManager.getTestRun(runId);
    const result: ADOTestRun = {
      id: testRun.id,
      name: testRun.name,
      state: testRun.state,
      totalTests: testRun.totalTests,
      passedTests: testRun.passedTests,
      failedTests: testRun.totalTests - testRun.passedTests - testRun.notApplicableTests - testRun.incompleteTests,
      notExecutedTests: testRun.incompleteTests,
      url: testRun.url
    };
    
    if (testRun.startedDate) {
      result.startedDate = testRun.startedDate;
    }
    
    if (testRun.completedDate) {
      result.completedDate = testRun.completedDate;
    }
    
    return result;
  }

  /**
   * Get test results for run
   */
  async getTestResults(runId: number): Promise<ADOTestResult[]> {
    return this.testResultUploader.getTestResults(runId);
  }

  /**
   * Upload reports folder as zip
   */
  private async uploadReportsFolder(executionResult: ExecutionResult): Promise<void> {
    if (!this.currentTestRun) {
      ADOIntegrationService.logger.warn('No current test run to upload reports to');
      return;
    }
    let tempZipPath: string | undefined;
    
    try {
      ADOIntegrationService.logger.info('Uploading reports folder as zip attachment...');
      
      const reportsPath = path.join(process.cwd(), 'reports');
      
      if (!fs.existsSync(reportsPath)) {
        ADOIntegrationService.logger.warn('Reports folder not found, skipping upload');
        return;
      }
      tempZipPath = path.join(process.cwd(), `reports_${this.currentTestRun.id}_${Date.now()}.zip`);
      const output = fs.createWriteStream(tempZipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      output.on('close', () => {
        ADOIntegrationService.logger.info(`Reports zip created: ${archive.pointer()} bytes`);
      });
      archive.on('error', (err: Error) => {
        throw err;
      });
      archive.pipe(output);
      
      const currentReportDir = ConfigurationManager.get('CURRENT_REPORT_DIR');
      let htmlReportPath: string | undefined;
      let screenshotsPath: string | undefined;
      
      ADOIntegrationService.logger.info(`Looking for report files. CURRENT_REPORT_DIR: ${currentReportDir}`);
      
      if (currentReportDir) {
        // Check for HTML report in 'html' subdirectory first, then root
        const htmlSubdirPath = path.join(currentReportDir, 'html', 'index.html');
        const htmlRootPath = path.join(currentReportDir, 'index.html');
        
        if (fs.existsSync(htmlSubdirPath)) {
          htmlReportPath = htmlSubdirPath;
          ADOIntegrationService.logger.info(`Found HTML report in html subdirectory: ${htmlReportPath}`);
        } else if (fs.existsSync(htmlRootPath)) {
          htmlReportPath = htmlRootPath;
          ADOIntegrationService.logger.info(`Found HTML report in root: ${htmlReportPath}`);
        } else {
          ADOIntegrationService.logger.warn(`HTML report not found in ${currentReportDir}/html/ or ${currentReportDir}/`);
        }
        
        screenshotsPath = path.join(currentReportDir, 'evidence', 'screenshots');
        if (!fs.existsSync(screenshotsPath)) {
          // Fallback to older structure
          screenshotsPath = path.join(currentReportDir, 'screenshots');
        }
        ADOIntegrationService.logger.info(`HTML report exists: ${htmlReportPath ? fs.existsSync(htmlReportPath) : false}`);
      } else {
        const reportTimestamp = executionResult.startTime.toISOString().replace(/[:.]/g, '-');
        const expectedReportDir = path.join(reportsPath, `report_${reportTimestamp}`);
        ADOIntegrationService.logger.info(`No CURRENT_REPORT_DIR, checking expected dir: ${expectedReportDir}`);
        if (fs.existsSync(expectedReportDir)) {
          // Check for HTML report in 'html' subdirectory first, then root
          const htmlSubdirPath = path.join(expectedReportDir, 'html', 'index.html');
          const htmlRootPath = path.join(expectedReportDir, 'index.html');
          
          if (fs.existsSync(htmlSubdirPath)) {
            htmlReportPath = htmlSubdirPath;
          } else if (fs.existsSync(htmlRootPath)) {
            htmlReportPath = htmlRootPath;
          }
          
          screenshotsPath = path.join(expectedReportDir, 'evidence', 'screenshots');
          if (!fs.existsSync(screenshotsPath)) {
            // Fallback to older structure
            screenshotsPath = path.join(expectedReportDir, 'screenshots');
          }
          ADOIntegrationService.logger.info(`Found report directory at expected location`);
        }
      }
      
      if (htmlReportPath && fs.existsSync(htmlReportPath)) {
        // FIXED: Place HTML file directly in zip root (not in html/ folder)
        archive.file(htmlReportPath, { name: 'index.html' });
        ADOIntegrationService.logger.info(`Added HTML report to zip root from: ${htmlReportPath}`);
        
        // Also add CSS and JS files if they exist (also in root)
        const htmlDir = path.dirname(htmlReportPath);
        const cssPath = path.join(htmlDir, 'styles.css');
        const jsPath = path.join(htmlDir, 'script.js');
        
        if (fs.existsSync(cssPath)) {
          archive.file(cssPath, { name: 'styles.css' });
          ADOIntegrationService.logger.info(`Added CSS file to zip root from: ${cssPath}`);
        }
        if (fs.existsSync(jsPath)) {
          archive.file(jsPath, { name: 'script.js' });
          ADOIntegrationService.logger.info(`Added JS file to zip root from: ${jsPath}`);
        }
      } else {
        ADOIntegrationService.logger.warn(`HTML report not found at: ${htmlReportPath}`);
      }
      
      if (screenshotsPath && fs.existsSync(screenshotsPath)) {
        // FIXED: Place screenshots in evidence/screenshots/ folder to preserve relative paths
        archive.directory(screenshotsPath, 'evidence/screenshots');
        ADOIntegrationService.logger.info('Added screenshots folder to zip at evidence/screenshots/');
      }
      
      if (!htmlReportPath || !fs.existsSync(htmlReportPath)) {
        ADOIntegrationService.logger.warn('HTML report not found, creating minimal zip');
        // Add a summary file if no HTML report exists
        const summaryContent = `Test Execution Summary
=====================
Environment: ${executionResult.environment}
Test Run ID: ${this.currentTestRun.id}
Total Tests: ${executionResult.summary.total}
Passed: ${executionResult.summary.passed}
Failed: ${executionResult.summary.failed}
Skipped: ${executionResult.summary.skipped}
Duration: ${executionResult.summary.duration}ms
Timestamp: ${new Date().toISOString()}
`;
        archive.append(summaryContent, { name: 'summary.txt' });
      }
      await archive.finalize();
      await new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
      });
      const zipBuffer = fs.readFileSync(tempZipPath);
      const fileName = `html-report-screenshots_${executionResult.environment}_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      
      // Use the simpler approach - upload directly with stream
      const attachmentUrl = ADOConfig.buildUrl(
        `${ADOConfig.getEndpoints().testRuns}/${this.currentTestRun.id}/attachments`
      );
      
      ADOIntegrationService.logger.info('Uploading zip file as test run attachment...');
      
      // Convert buffer to base64 for stream upload
      const base64Content = zipBuffer.toString('base64');
      
      const attachmentData = {
        stream: base64Content,
        fileName: fileName,
        comment: `Test execution reports for ${executionResult.environment} environment. ` +
                 `Total tests: ${executionResult.summary.total}, ` +
                 `Passed: ${executionResult.summary.passed}, ` +
                 `Failed: ${executionResult.summary.failed}`,
        attachmentType: 'GeneralAttachment'
      };
      
      const uploadResponse = await this.client.post<{ id: string; url: string }>(
        attachmentUrl,
        attachmentData
      );
      
      ADOIntegrationService.logger.info(`Zip file uploaded successfully. Attachment ID: ${uploadResponse.data.id}`);
      if (tempZipPath && fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
        ADOIntegrationService.logger.debug(`Deleted temporary zip file: ${tempZipPath}`);
      }
      ADOIntegrationService.logger.info(`Reports folder uploaded successfully as ${attachmentData.fileName}`);
    } catch (error) {
      ADOIntegrationService.logger.error('Failed to upload reports folder:', error as Error);
      
      if (tempZipPath && fs.existsSync(tempZipPath)) {
        try {
          fs.unlinkSync(tempZipPath);
          ADOIntegrationService.logger.debug(`Deleted temporary zip file after error: ${tempZipPath}`);
        } catch (cleanupError) {
          ADOIntegrationService.logger.warn(`Failed to delete temporary zip file: ${tempZipPath}`, cleanupError as Error);
        }
      }

    }
  }

  /**
   * Group scenarios by test plan and suite
   */
  private async groupScenariosByTestPlanSuite(
    executionResult: ExecutionResult,
    options?: ADOUploadOptions
  ): Promise<Map<string, { testPlanId: number; testSuiteId: number; scenarios: Array<{ scenario: ScenarioResult; feature: FeatureResult }> }>> {
    const grouped = new Map<string, { testPlanId: number; testSuiteId: number; scenarios: Array<{ scenario: ScenarioResult; feature: FeatureResult }> }>();
    
    ADOIntegrationService.logger.info('Starting to group scenarios by test plan/suite');
    
    for (const feature of executionResult.features) {
      ADOIntegrationService.logger.info(`Processing feature: ${feature.name} with ${feature.scenarios.length} scenarios`);
      
      for (const scenario of feature.scenarios) {
        ADOIntegrationService.logger.info(`Processing scenario: ${scenario.scenario}`);
        const adoMetadata = this.extractCompleteADOMetadata(scenario, feature, options);
        
        ADOIntegrationService.logger.info(
          `Scenario "${scenario.scenario}" extracted metadata: ${JSON.stringify(adoMetadata)}`
        );
        
        if (!adoMetadata.testCaseId) {
          ADOIntegrationService.logger.warn(
            `Scenario "${scenario.scenario}" does not have a @TestCaseId-XXX tag. Skipping ADO upload for this scenario.`
          );
          continue;
        }
        
        if (!adoMetadata.testPlanId || !adoMetadata.testSuiteId) {
          ADOIntegrationService.logger.warn(
            `Scenario "${scenario.scenario}" has TestCaseId ${adoMetadata.testCaseId} but missing TestPlanId or TestSuiteId. Skipping.`
          );
          continue;
        }
        
        const key = `${adoMetadata.testPlanId}_${adoMetadata.testSuiteId}`;
        
        if (!grouped.has(key)) {
          grouped.set(key, {
            testPlanId: adoMetadata.testPlanId,
            testSuiteId: adoMetadata.testSuiteId,
            scenarios: []
          });
        }
        
        scenario.adoMetadata = adoMetadata as any;
        ADOIntegrationService.logger.info(
          `Attached adoMetadata to scenario "${scenario.scenario}": ${JSON.stringify(scenario.adoMetadata)}`
        );
        // Double-check the type after assignment
        ADOIntegrationService.logger.info(
          `After assignment - type: ${typeof scenario.adoMetadata}, value: ${JSON.stringify(scenario.adoMetadata)}`
        );
        grouped.get(key)!.scenarios.push({ scenario, feature });
      }
    }
    
    return grouped;
  }

  /**
   * Extract complete ADO metadata with inheritance
   */
  private extractCompleteADOMetadata(
    scenario: ScenarioResult,
    feature: FeatureResult,
    options?: ADOUploadOptions
  ): { testCaseId?: number | undefined; testPlanId?: number | undefined; testSuiteId?: number | undefined } {
    const scenarioTags = scenario.tags || [];
    const featureTags = feature.tags || [];
    
    ADOIntegrationService.logger.info(
      `Extracting ADO metadata for scenario "${scenario.scenario}". ` +
      `Scenario tags: [${scenarioTags.join(', ')}]. ` +
      `Feature tags: [${featureTags.join(', ')}]`
    );
    
    const testCaseId = this.extractIdFromTags(scenarioTags, 'TestCaseId');
    let testPlanId = this.extractIdFromTags(scenarioTags, 'TestPlanId');
    let testSuiteId = this.extractIdFromTags(scenarioTags, 'TestSuiteId');
    
    if (!testPlanId) {
      testPlanId = this.extractIdFromTags(featureTags, 'TestPlanId');
    }
    if (!testSuiteId) {
      testSuiteId = this.extractIdFromTags(featureTags, 'TestSuiteId');
    }
    
    const config = ADOConfig.getConfig();
    if (!testPlanId && (options?.testPlanId || config.testPlanId)) {
      testPlanId = options?.testPlanId || config.testPlanId;
    }
    if (!testSuiteId && (options?.testSuiteId || config.testSuiteId)) {
      testSuiteId = options?.testSuiteId || config.testSuiteId;
    }
    
    return { testCaseId, testPlanId, testSuiteId };
  }

  /**
   * Extract ID from tags
   */
  private extractIdFromTags(tags: string[], idType: 'TestCaseId' | 'TestPlanId' | 'TestSuiteId'): number | undefined {
    ADOIntegrationService.logger.info(`Extracting ${idType} from tags: ${JSON.stringify(tags)}`);
    
    for (const tag of tags) {
      const match = tag.match(new RegExp(`^@?${idType}[-:](\\d+)$`, 'i'));
      if (match && match[1]) {
        ADOIntegrationService.logger.info(`Found ${idType}: ${match[1]} from tag: ${tag}`);
        return parseInt(match[1], 10);
      }
    }
    
    ADOIntegrationService.logger.info(`No ${idType} found in tags`);
    return undefined;
  }

  /**
   * Create features from scenarios
   */
  private createFeaturesFromScenarios(
    scenarios: Array<{ scenario: ScenarioResult; feature: FeatureResult }>
  ): FeatureResult[] {
    const featureMap = new Map<string, FeatureResult>();
    
    ADOIntegrationService.logger.info(`Creating features from ${scenarios.length} scenarios`);
    
    // Create a map to track unique test cases per feature to avoid duplicates
    const processedTestCases = new Map<string, Set<number>>();
    
    for (const { scenario, feature } of scenarios) {
      // FIXED: Get feature name from feature.feature.name (the nested Feature object) first, then fallback to feature.name
      const featureName = feature.feature?.name || feature.name || 'Unnamed Feature';
      ADOIntegrationService.logger.info(
        `Processing scenario "${scenario.scenario}" for feature "${featureName}" (from feature.feature.name: ${feature.feature?.name}, feature.name: ${feature.name})`
      );
      
      // Fix metadata if it's in an incorrect format
      if (scenario.adoMetadata) {
        // Check if it's a string that needs parsing
        if (typeof scenario.adoMetadata === 'string') {
          ADOIntegrationService.logger.warn(
            `adoMetadata is a string for scenario "${scenario.scenario}", parsing...`
          );
          try {
            scenario.adoMetadata = JSON.parse(scenario.adoMetadata as any);
          } catch (e) {
            ADOIntegrationService.logger.error(`Failed to parse adoMetadata string`);
          }
        } 
        // Check if it's been converted to a character-by-character object
        else if (typeof scenario.adoMetadata === 'object' && '0' in scenario.adoMetadata) {
          ADOIntegrationService.logger.warn(
            `adoMetadata appears to be a stringified object for scenario "${scenario.scenario}", reconstructing...`
          );
          try {
            // Reconstruct the string from the character-by-character object
            const chars = Object.keys(scenario.adoMetadata)
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map(key => (scenario.adoMetadata as any)[key]);
            const jsonString = chars.join('');
            scenario.adoMetadata = JSON.parse(jsonString);
            ADOIntegrationService.logger.info(
              `Successfully reconstructed adoMetadata: ${JSON.stringify(scenario.adoMetadata)}`
            );
          } catch (e) {
            ADOIntegrationService.logger.error(`Failed to reconstruct adoMetadata from character object`);
          }
        }
      }
      
      // Check if we've already processed this test case for this feature
      const testCaseId = scenario.adoMetadata?.testCaseId;
      if (testCaseId) {
        if (!processedTestCases.has(featureName)) {
          processedTestCases.set(featureName, new Set<number>());
        }
        
        const featureTestCases = processedTestCases.get(featureName)!;
        if (featureTestCases.has(testCaseId)) {
          ADOIntegrationService.logger.warn(
            `Skipping duplicate test case ${testCaseId} for feature "${featureName}" (scenario: "${scenario.scenario}")`
          );
          continue; // Skip this scenario as we've already processed this test case
        }
        
        featureTestCases.add(testCaseId);
      }
      
      if (!featureMap.has(featureName)) {
        featureMap.set(featureName, {
          ...feature,
          name: featureName, // Ensure name is set
          scenarios: []
        });
      }
      
      const targetFeature = featureMap.get(featureName)!;
      targetFeature.scenarios.push(scenario);
    }
    
    ADOIntegrationService.logger.info(
      `After deduplication: ${Array.from(featureMap.values()).reduce((sum, f) => sum + f.scenarios.length, 0)} unique scenarios across ${featureMap.size} features`
    );
    
    return Array.from(featureMap.values());
  }

  /**
   * Calculate summary for scenarios
   */
  private calculateSummaryForScenarios(scenarios: Array<{ scenario: ScenarioResult; feature: FeatureResult }>): ExecutionResult['summary'] {
    const summary: ExecutionResult['summary'] = {
      total: scenarios.length,
      totalScenarios: scenarios.length,
      totalFeatures: new Set(scenarios.map(s => s.feature.feature?.name || s.feature.name || 'Unnamed Feature')).size,
      totalSteps: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      passedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      duration: 0
    };
    
    for (const { scenario } of scenarios) {
      if (scenario.status === 'passed') summary.passed++;
      else if (scenario.status === 'failed') summary.failed++;
      else if (scenario.status === 'skipped') summary.skipped++;
      else if (scenario.status === 'pending') summary.pending++;
      
      summary.duration += scenario.duration;
      summary.totalSteps += scenario.steps.length;
      
      for (const step of scenario.steps) {
        if (step.status === 'passed') summary.passedSteps++;
        else if (step.status === 'failed') summary.failedSteps++;
        else if (step.status === 'skipped') summary.skippedSteps++;
      }
    }
    
    return summary;
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.currentTestRun = null;
    this.testCaseMapping.clear();
    this.uploadQueue = [];
    this.isProcessingQueue = false;
    ADOIntegrationService.logger.info('ADO Integration Service reset');
  }
}