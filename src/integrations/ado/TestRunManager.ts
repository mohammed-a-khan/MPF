// src/integrations/ado/TestRunManager.ts
import { ADOClient, ADOListResponse } from './ADOClient';
import { ADOConfig } from './ADOConfig';
import { Logger } from '../../core/utils/Logger';

export interface TestRun {
  id: number;
  name: string;
  url: string;
  isAutomated: boolean;
  iteration?: string;
  owner: {
    displayName: string;
    id: string;
    uniqueName: string;
  };
  project: {
    id: string;
    name: string;
  };
  startedDate?: string;
  completedDate?: string;
  state: 'Unspecified' | 'NotStarted' | 'InProgress' | 'Completed' | 'Waiting' | 'Aborted' | 'NeedsInvestigation';
  totalTests: number;
  incompleteTests: number;
  notApplicableTests: number;
  passedTests: number;
  unanalyzedTests: number;
  revision: number;
  release?: {
    id: string;
    name: string;
    environmentId: string;
    environmentName: string;
  };
  build?: {
    id: string;
    name: string;
    number: string;
  };
  testMessageLogId?: number;
  errorMessage?: string;
  dtlEnvironment?: {
    id: string;
    name: string;
  };
  dtlEnvironmentDetails?: {
    csmContent: string;
    csmParameters: string;
    subscriptionName: string;
  };
  comment?: string;
  runStatistics?: Array<{
    state: string;
    outcome: string;
    count: number;
    resolutionState?: string;
  }>;
  webAccessUrl: string;
  pipelineReference?: {
    pipelineId: number;
    stageReference: {
      stageName: string;
    };
    phaseReference: {
      phaseName: string;
      jobReference: {
        jobName: string;
      };
    };
  };
  testPlan?: {
    id: string;
    name: string;
  };
  testSuite?: {
    id: string;
    name: string;
  };
  testSettings?: {
    areaPath: string;
    description: string;
    isPublic: boolean;
    machineRoles: string;
    testSettingsContent: string;
    testSettingsId: number;
    testSettingsName: string;
  };
  substate?: 'None' | 'CreatingEnvironment' | 'RunningTests' | 'CanceledByUser' | 'AbortedBySystem' | 'TimedOut' | 'PendingAnalysis' | 'Analyzed' | 'CancellationInProgress';
  testEnvironment?: {
    environmentId: string;
    environmentName: string;
  };
  phase?: string;
  controller?: string;
  tags?: string[];
  customFields?: Array<{
    fieldName: string;
    value: any;
  }>;
}

export interface TestRunCreateRequest {
  name: string;
  plan?: {
    id: string;
  };
  testPlanId?: number;
  testSuiteId?: number;
  pointIds?: number[];
  configurationIds?: number[];
  isAutomated?: boolean;
  iteration?: string;
  owner?: {
    id?: string;
    displayName?: string;
  };
  startedDate?: string;
  comment?: string;
  state?: 'NotStarted' | 'InProgress' | 'Waiting';
  testSettings?: {
    areaPath?: string;
    description?: string;
    isPublic?: boolean;
    machineRoles?: string;
    testSettingsContent?: string;
    testSettingsId?: number;
    testSettingsName?: string;
  };
  testEnvironmentId?: string;
  buildId?: string;
  releaseEnvironmentId?: string;
  releaseId?: string;
  controller?: string;
  dtlAutEnvironment?: {
    id: string;
    name: string;
  };
  dtlEnvironment?: {
    id: string;
    name: string;
  };
  dtlEnvironmentDetails?: {
    csmContent: string;
    csmParameters: string;
    subscriptionName: string;
  };
  customTestFields?: Array<{
    fieldName: string;
    value: any;
  }>;
  tags?: string[];
}

export interface TestRunUpdateRequest {
  state?: 'InProgress' | 'Completed' | 'Aborted' | 'Waiting' | 'NeedsInvestigation';
  substate?: 'None' | 'CreatingEnvironment' | 'RunningTests' | 'CanceledByUser' | 'AbortedBySystem' | 'TimedOut' | 'PendingAnalysis' | 'Analyzed' | 'CancellationInProgress';
  completedDate?: string;
  comment?: string;
  errorMessage?: string;
  revision: number;
  testSettings?: {
    areaPath?: string;
    description?: string;
    isPublic?: boolean;
    machineRoles?: string;
    testSettingsContent?: string;
    testSettingsId?: number;
    testSettingsName?: string;
  };
  dtlAutEnvironment?: {
    id: string;
    name: string;
  };
  dtlEnvironment?: {
    id: string;
    name: string;
  };
  dtlEnvironmentDetails?: {
    csmContent: string;
    csmParameters: string;
    subscriptionName: string;
  };
  tags?: string[];
}

export interface TestRunStatistics {
  run: {
    id: number;
    name: string;
    url: string;
  };
  runStatistics: Array<{
    state: string;
    outcome: string;
    count: number;
    resolutionState?: string;
  }>;
}

export interface RunFilter {
  sourceFilter?: {
    planId?: number;
    testPlanIds?: number[];
    testSuiteIds?: number[];
  };
  runIds?: number[];
  state?: string;
  isAutomated?: boolean;
  owner?: string;
  maxLastUpdatedDate?: string;
  minLastUpdatedDate?: string;
  publishContext?: string;
  buildIds?: string[];
  buildDefIds?: number[];
  branchName?: string;
  releaseIds?: string[];
  releaseDefIds?: number[];
  releaseEnvIds?: string[];
  releaseEnvDefIds?: number[];
  runTitle?: string;
  top?: number;
  continuationToken?: string;
}

export class TestRunManager {
  private readonly logger = Logger.getInstance(TestRunManager.name);
  private runCache = new Map<number, TestRun>();
  private activeRuns = new Map<number, NodeJS.Timeout>();

  constructor(private readonly client: ADOClient) {
    this.logger.info('TestRunManager initialized');
  }
  
  private get endpoints() {
    return ADOConfig.getEndpoints();
  }

  async createTestRun(request: TestRunCreateRequest): Promise<TestRun> {
    try {
      this.logger.info(`Creating test run: ${request.name}`);
      
      const body: TestRunCreateRequest = {
        ...request,
        isAutomated: request.isAutomated ?? true,
        state: request.state || 'NotStarted',
        startedDate: request.startedDate || new Date().toISOString()
      };
      
      if (request.testPlanId) {
        body.plan = {
          id: request.testPlanId.toString()
        };
      }

      const url = ADOConfig.buildUrl(this.endpoints.testRuns);
      const response = await this.client.post<TestRun>(url, body);
      
      const testRun = response.data;
      this.runCache.set(testRun.id, testRun);
      
      if (testRun.state === 'InProgress') {
        this.startRunMonitoring(testRun.id);
      }
      
      this.logger.info(`Created test run: ${testRun.name} (ID: ${testRun.id})`);
      return testRun;
    } catch (error) {
      this.logger.error('Failed to create test run:', error as Error);
      throw error;
    }
  }

  async getTestRun(runId: number, includeDetails: boolean = false): Promise<TestRun> {
    try {
      if (!includeDetails && this.runCache.has(runId)) {
        this.logger.debug(`Retrieved test run ${runId} from cache`);
        return this.runCache.get(runId)!;
      }

      this.logger.info(`Fetching test run: ${runId}`);
      
      const queryParams: Record<string, any> = {};
      if (includeDetails) {
        queryParams['includeDetails'] = true;
      }

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testRuns}/${runId}`,
        queryParams
      );
      const response = await this.client.get<TestRun>(url);
      
      const testRun = response.data;
      this.runCache.set(testRun.id, testRun);
      
      return testRun;
    } catch (error) {
      this.logger.error(`Failed to get test run ${runId}:`, error as Error);
      throw error;
    }
  }

  async updateTestRun(runId: number, request: Partial<TestRunUpdateRequest>): Promise<TestRun> {
    try {
      this.logger.info(`Updating test run: ${runId}`);
      
      const currentRun = await this.getTestRun(runId);
      
      const body: TestRunUpdateRequest = {
        ...request,
        revision: currentRun.revision
      };

      if (request.state === 'Completed' && !request.completedDate) {
        body.completedDate = new Date().toISOString();
      }

      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}`);
      const response = await this.client.patch<TestRun>(url, body);
      
      const testRun = response.data;
      this.runCache.set(testRun.id, testRun);
      
      if (testRun.state === 'Completed' || testRun.state === 'Aborted') {
        this.stopRunMonitoring(testRun.id);
      }
      
      this.logger.info(`Updated test run: ${testRun.name} (State: ${testRun.state})`);
      return testRun;
    } catch (error) {
      this.logger.error(`Failed to update test run ${runId}:`, error as Error);
      throw error;
    }
  }

  async deleteTestRun(runId: number): Promise<void> {
    try {
      this.logger.info(`Deleting test run: ${runId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}`);
      await this.client.delete(url);
      
      this.runCache.delete(runId);
      this.stopRunMonitoring(runId);
      
      this.logger.info(`Deleted test run: ${runId}`);
    } catch (error) {
      this.logger.error(`Failed to delete test run ${runId}:`, error as Error);
      throw error;
    }
  }

  async queryTestRuns(filter: RunFilter): Promise<{ runs: TestRun[]; continuationToken?: string }> {
    try {
      this.logger.info('Querying test runs...');
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/query`);
      const response = await this.client.post<{
        value: TestRun[];
        continuationToken?: string;
      }>(url, filter);
      
      const runs = response.data.value;
      
      runs.forEach(run => this.runCache.set(run.id, run));
      
      this.logger.info(`Retrieved ${runs.length} test runs`);
      const result: { runs: TestRun[]; continuationToken?: string } = {
        runs
      };
      
      if (response.data.continuationToken !== undefined) {
        result.continuationToken = response.data.continuationToken;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Failed to query test runs:', error as Error);
      throw error;
    }
  }

  async getTestRunsForBuild(
    buildId: string,
    options?: {
      includeRunDetails?: boolean;
      top?: number;
    }
  ): Promise<TestRun[]> {
    try {
      this.logger.info(`Fetching test runs for build: ${buildId}`);
      
      const queryParams: Record<string, any> = {
        buildId
      };
      if (options?.includeRunDetails) queryParams['includeRunDetails'] = true;
      if (options?.top) queryParams['$top'] = options.top;

      const url = ADOConfig.buildUrl(this.endpoints.testRuns, queryParams);
      const response = await this.client.get<ADOListResponse<TestRun>>(url);
      
      this.logger.info(`Retrieved ${response.data.count} test runs for build`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test runs for build ${buildId}:`, error as Error);
      throw error;
    }
  }

  async getTestRunsForRelease(
    releaseId: string,
    releaseEnvId: string,
    options?: {
      includeRunDetails?: boolean;
      top?: number;
    }
  ): Promise<TestRun[]> {
    try {
      this.logger.info(`Fetching test runs for release: ${releaseId}, environment: ${releaseEnvId}`);
      
      const queryParams: Record<string, any> = {
        releaseId,
        releaseEnvId
      };
      if (options?.includeRunDetails) queryParams['includeRunDetails'] = true;
      if (options?.top) queryParams['$top'] = options.top;

      const url = ADOConfig.buildUrl(this.endpoints.testRuns, queryParams);
      const response = await this.client.get<ADOListResponse<TestRun>>(url);
      
      this.logger.info(`Retrieved ${response.data.count} test runs for release`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test runs for release ${releaseId}:`, error as Error);
      throw error;
    }
  }

  async getTestRunStatistics(runId: number): Promise<TestRunStatistics> {
    try {
      this.logger.info(`Fetching statistics for test run: ${runId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}/statistics`);
      const response = await this.client.get<TestRunStatistics>(url);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get test run statistics ${runId}:`, error as Error);
      throw error;
    }
  }

  async getTestRunLogs(runId: number): Promise<Array<{
    logId: number;
    message: string;
    timestamp: string;
    level: string;
  }>> {
    try {
      this.logger.info(`Fetching logs for test run: ${runId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}/messagelogs`);
      const response = await this.client.get(url);
      
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test run logs ${runId}:`, error as Error);
      throw error;
    }
  }

  async addTestRunLog(
    runId: number,
    message: string,
    level: 'Info' | 'Warning' | 'Error' = 'Info'
  ): Promise<void> {
    try {
      const body = {
        message,
        level,
        timestamp: new Date().toISOString()
      };

      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}/messagelogs`);
      await this.client.post(url, body);
      
      this.logger.debug(`Added log to test run ${runId}`);
    } catch (error) {
      this.logger.error(`Failed to add test run log ${runId}:`, error as Error);
      throw error;
    }
  }

  async getTestRunCoverage(runId: number): Promise<{
    modules: Array<{
      name: string;
      signature: string;
      statistics: {
        blocksCovered: number;
        blocksNotCovered: number;
        linesCovered: number;
        linesNotCovered: number;
        linesPartiallyCovered: number;
      };
    }>;
    codeCoverageFileUrl?: string;
  }> {
    try {
      this.logger.info(`Fetching coverage for test run: ${runId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}/codecoverage`);
      const response = await this.client.get(url);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get test run coverage ${runId}:`, error as Error);
      throw error;
    }
  }

  async addTestRunAttachment(
    runId: number,
    attachment: {
      filename: string;
      stream: Buffer;
      comment?: string;
      attachmentType?: string;
    }
  ): Promise<{ id: string; url: string }> {
    try {
      this.logger.info(`Adding attachment to test run ${runId}: ${attachment.filename}`);
      
      const uploadUrl = ADOConfig.buildUrl(this.endpoints.attachments);
      const uploadResponse = await this.client.post<{ id: string; url: string }>(
        uploadUrl,
        attachment.stream,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': attachment.stream.length.toString()
          }
        }
      );

      const linkBody = {
        stream: {
          id: uploadResponse.data.id,
          url: uploadResponse.data.url
        },
        fileName: attachment.filename,
        comment: attachment.comment,
        attachmentType: attachment.attachmentType || 'GeneralAttachment'
      };

      const linkUrl = ADOConfig.buildUrl(`${this.endpoints.testRuns}/${runId}/attachments`);
      await this.client.post(linkUrl, linkBody);
      
      this.logger.info(`Attachment added successfully: ${uploadResponse.data.id}`);
      return uploadResponse.data;
    } catch (error) {
      this.logger.error(`Failed to add test run attachment:`, error as Error);
      throw error;
    }
  }

  async cancelTestRun(runId: number): Promise<TestRun> {
    try {
      this.logger.info(`Cancelling test run: ${runId}`);
      
      const currentRun = await this.getTestRun(runId);
      
      if (currentRun.state === 'Completed' || currentRun.state === 'Aborted') {
        this.logger.warn(`Test run ${runId} is already ${currentRun.state}`);
        return currentRun;
      }

      return await this.updateTestRun(runId, {
        state: 'Aborted',
        substate: 'CanceledByUser',
        errorMessage: 'Test run cancelled by user'
      });
    } catch (error) {
      this.logger.error(`Failed to cancel test run ${runId}:`, error as Error);
      throw error;
    }
  }

  async cloneTestRun(
    sourceRunId: number,
    options?: {
      cloneStatistics?: boolean;
      cloneTestSettings?: boolean;
      destinationTestPlanId?: number;
      destinationTestSuiteId?: number;
    }
  ): Promise<TestRun> {
    try {
      this.logger.info(`Cloning test run: ${sourceRunId}`);
      
      const sourceRun = await this.getTestRun(sourceRunId, true);
      
      const newRun: TestRunCreateRequest = {
        name: `${sourceRun.name} - Clone`,
        isAutomated: sourceRun.isAutomated,
        comment: `Cloned from test run ${sourceRunId}`
      };
      
      if (options?.destinationTestPlanId) {
        newRun.testPlanId = options.destinationTestPlanId;
      } else if (sourceRun.testPlan?.id) {
        newRun.testPlanId = parseInt(sourceRun.testPlan.id);
      }
      
      if (options?.destinationTestSuiteId) {
        newRun.testSuiteId = options.destinationTestSuiteId;
      } else if (sourceRun.testSuite?.id) {
        newRun.testSuiteId = parseInt(sourceRun.testSuite.id);
      }
      
      if (sourceRun.iteration !== undefined) {
        newRun.iteration = sourceRun.iteration;
      }
      
      if (options?.cloneTestSettings && sourceRun.testSettings) {
        newRun.testSettings = sourceRun.testSettings;
      }
      
      if (sourceRun.testEnvironment?.environmentId) {
        newRun.testEnvironmentId = sourceRun.testEnvironment.environmentId;
      }
      
      if (sourceRun.tags) {
        newRun.tags = sourceRun.tags;
      }
      
      if (sourceRun.customFields) {
        newRun.customTestFields = sourceRun.customFields;
      }

      return await this.createTestRun(newRun);
    } catch (error) {
      this.logger.error(`Failed to clone test run ${sourceRunId}:`, error as Error);
      throw error;
    }
  }

  private startRunMonitoring(runId: number): void {
    if (this.activeRuns.has(runId)) {
      return;
    }

    this.logger.debug(`Starting monitoring for test run: ${runId}`);
    
    const interval = setInterval(async () => {
      try {
        const run = await this.getTestRun(runId);
        
        if (run.state === 'Completed' || run.state === 'Aborted') {
          this.stopRunMonitoring(runId);
          this.logger.info(`Test run ${runId} ${run.state.toLowerCase()}`);
        }
      } catch (error) {
        this.logger.error(`Error monitoring test run ${runId}:`, error as Error);
        this.stopRunMonitoring(runId);
      }
    }, 30000);

    this.activeRuns.set(runId, interval);
  }

  private stopRunMonitoring(runId: number): void {
    const interval = this.activeRuns.get(runId);
    if (interval) {
      clearInterval(interval);
      this.activeRuns.delete(runId);
      this.logger.debug(`Stopped monitoring for test run: ${runId}`);
    }
  }

  getActiveTestRuns(): number[] {
    return Array.from(this.activeRuns.keys());
  }

  clearCache(): void {
    this.runCache.clear();
    this.logger.debug('Test run cache cleared');
  }

  cleanup(): void {
    for (const runId of this.activeRuns.keys()) {
      this.stopRunMonitoring(runId);
    }
    
    this.clearCache();
    this.logger.info('TestRunManager cleanup completed');
  }
}
