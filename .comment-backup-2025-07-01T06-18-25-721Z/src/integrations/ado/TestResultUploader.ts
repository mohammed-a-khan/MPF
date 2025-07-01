// src/integrations/ado/TestResultUploader.ts
import { ADOClient, ADOListResponse } from './ADOClient';
import { ADOConfig } from './ADOConfig';
import { Logger } from '../../core/utils/Logger';
import { ADOTestResult } from './ADOIntegrationService';

export interface TestResultCreateRequest {
  testCaseId: number;
  testPointId?: number;
  outcome: 'Passed' | 'Failed' | 'NotExecuted' | 'Blocked' | 'NotApplicable' | 'Paused' | 'InProgress' | 'Warning';
  state?: 'Pending' | 'Queued' | 'InProgress' | 'Paused' | 'Completed';
  startedDate?: string;
  completedDate?: string;
  durationInMs?: number;
  errorMessage?: string;
  stackTrace?: string;
  comment?: string;
  failureType?: 'None' | 'Regression' | 'New_Issue' | 'Known_Issue' | 'Unknown' | 'Null';
  resolutionStateId?: number;
  priority?: number;
  computerName?: string;
  automatedTestName?: string;
  automatedTestStorage?: string;
  automatedTestId?: string;
  automatedTestType?: string;
  testCaseRevision?: number;
  resetCount?: number;
  customFields?: Array<{
    fieldName: string;
    value: any;
  }>;
  associatedBugs?: Array<{
    id: number;
  }>;
}

export interface TestResultUpdateRequest {
  outcome?: 'Passed' | 'Failed' | 'NotExecuted' | 'Blocked' | 'NotApplicable' | 'Paused' | 'InProgress' | 'Warning';
  state?: 'Pending' | 'Queued' | 'InProgress' | 'Paused' | 'Completed';
  comment?: string;
  errorMessage?: string;
  stackTrace?: string;
  completedDate?: string;
  durationInMs?: number;
  failureType?: 'None' | 'Regression' | 'New_Issue' | 'Known_Issue' | 'Unknown' | 'Null';
  resolutionStateId?: number;
  associatedBugs?: Array<{
    id: number;
  }>;
}

export interface TestIterationResult {
  id: number;
  iterationId: number;
  outcome: string;
  startedDate: string;
  completedDate: string;
  durationInMs: number;
  comment?: string;
  errorMessage?: string;
  actionResults?: Array<{
    actionPath: string;
    iterationId: number;
    outcome: string;
    startedDate: string;
    completedDate: string;
    durationInMs: number;
    errorMessage?: string;
  }>;
  parameters?: Array<{
    parameterName: string;
    value: any;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

export interface TestSubResult {
  id: number;
  testResultId: number;
  displayName: string;
  parentId?: number;
  sequenceId: number;
  startedDate: string;
  completedDate: string;
  durationInMs: number;
  outcome: string;
  state: string;
  computerName?: string;
  comment?: string;
  errorMessage?: string;
  stackTrace?: string;
  subResults?: TestSubResult[];
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

export class TestResultUploader {
  private readonly logger = Logger.getInstance(TestResultUploader.name);
  private resultCache = new Map<string, ADOTestResult>();
  private uploadQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private readonly batchSize = 100;

  private get endpoints() {
    return ADOConfig.getEndpoints();
  }

  constructor(private readonly client: ADOClient) {
    this.logger.info('TestResultUploader initialized');
  }

  /**
   * Upload test result
   */
  async uploadTestResult(
    runId: number,
    result: TestResultCreateRequest | ADOTestResult
  ): Promise<ADOTestResult> {
    try {
      this.logger.info(`Uploading test result for test case: ${result.testCaseId}`);
      
      const body: TestResultCreateRequest = this.prepareResultRequest(result);
      
      const url = ADOConfig.buildUrl(
        this.endpoints.testResults.replace('{runId}', runId.toString())
      );
      
      const response = await this.client.post<any>(url, [body]);
      
      this.logger.debug('Test result upload response:', response.data);
      
      let uploadedResult: ADOTestResult;
      if (Array.isArray(response.data)) {
        if (response.data.length === 0) {
          throw new Error('No test result returned from API');
        }
        uploadedResult = response.data[0];
      } else if (response.data && response.data.value && Array.isArray(response.data.value)) {
        if (response.data.value.length === 0) {
          throw new Error('No test result returned from API');
        }
        uploadedResult = response.data.value[0];
      } else if (response.data && typeof response.data === 'object') {
        uploadedResult = response.data as ADOTestResult;
      } else {
        throw new Error('Invalid response format from API');
      }
      
      if (!uploadedResult) {
        throw new Error('Invalid test result returned from API');
      }
      const cacheKey = `${runId}_${uploadedResult.id}`;
      this.resultCache.set(cacheKey, uploadedResult);
      
      this.logger.info(`Test result uploaded: ID ${uploadedResult.id}, Outcome: ${uploadedResult.outcome}`);
      return uploadedResult;
    } catch (error) {
      this.logger.error('Failed to upload test result:', error as Error);
      throw error;
    }
  }

  /**
   * Upload test results in batch
   */
  async uploadTestResultsBatch(
    runId: number,
    results: Array<TestResultCreateRequest | ADOTestResult>
  ): Promise<ADOTestResult[]> {
    try {
      this.logger.info(`Uploading ${results.length} test results in batch`);
      
      const allResults: ADOTestResult[] = [];
      
      for (let i = 0; i < results.length; i += this.batchSize) {
        const batch = results.slice(i, i + this.batchSize);
        const batchResults = await this.uploadBatch(runId, batch);
        allResults.push(...batchResults);
        
        this.logger.info(`Uploaded batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(results.length / this.batchSize)}`);
      }
      
      return allResults;
    } catch (error) {
      this.logger.error('Failed to upload test results batch:', error as Error);
      throw error;
    }
  }

  /**
   * Upload single batch
   */
  private async uploadBatch(
    runId: number,
    batch: Array<TestResultCreateRequest | ADOTestResult>
  ): Promise<ADOTestResult[]> {
    const body = batch.map(result => this.prepareResultRequest(result));
    
    const url = ADOConfig.buildUrl(
      this.endpoints.testResults.replace('{runId}', runId.toString())
    );
    
    const response = await this.client.post<ADOTestResult[]>(url, body);
    
    response.data.forEach(result => {
      const cacheKey = `${runId}_${result.id}`;
      this.resultCache.set(cacheKey, result);
    });
    
    return response.data;
  }

  /**
   * Get test results for run
   */
  async getTestResults(
    runId: number,
    options?: {
      outcomes?: string[];
      skip?: number;
      top?: number;
      includeIterationDetails?: boolean;
    }
  ): Promise<ADOTestResult[]> {
    try {
      this.logger.info(`Fetching test results for run: ${runId}`);
      
      const queryParams: Record<string, any> = {};
      if (options?.outcomes) queryParams['outcomes'] = options.outcomes.join(',');
      if (options?.skip !== undefined) queryParams['$skip'] = options.skip;
      if (options?.top !== undefined) queryParams['$top'] = options.top;
      if (options?.includeIterationDetails) queryParams['detailsToInclude'] = 'iterations';

      const url = ADOConfig.buildUrl(
        this.endpoints.testResults.replace('{runId}', runId.toString()),
        queryParams
      );
      
      const response = await this.client.get<ADOListResponse<ADOTestResult>>(url);
      
      this.logger.info(`Retrieved ${response.data.count} test results`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test results for run ${runId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get test result by ID
   */
  async getTestResult(
    runId: number,
    resultId: number,
    includeDetails: boolean = false
  ): Promise<ADOTestResult> {
    try {
      const cacheKey = `${runId}_${resultId}`;
      
      if (!includeDetails && this.resultCache.has(cacheKey)) {
        this.logger.debug(`Retrieved test result ${resultId} from cache`);
        return this.resultCache.get(cacheKey)!;
      }

      this.logger.info(`Fetching test result: ${resultId}`);
      
      const queryParams: Record<string, any> = {};
      if (includeDetails) {
        queryParams['detailsToInclude'] = 'iterations,workItems';
      }

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}`,
        queryParams
      );
      
      const response = await this.client.get<ADOTestResult>(url);
      
      const result = response.data;
      this.resultCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to get test result ${resultId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Update test result
   */
  async updateTestResult(
    runId: number,
    resultId: number,
    update: TestResultUpdateRequest | any[]
  ): Promise<ADOTestResult> {
    try {
      this.logger.info(`Updating test result: ${resultId}`);
      
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}`
      );
      
      const response = await this.client.patch<ADOTestResult>(url, update);
      
      const result = response.data;
      const cacheKey = `${runId}_${resultId}`;
      this.resultCache.set(cacheKey, result);
      
      this.logger.info(`Updated test result: ${resultId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to update test result ${resultId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Add test result attachment
   */
  async addTestResultAttachment(
    runId: number,
    resultId: number,
    attachment: {
      filename: string;
      stream: Buffer;
      comment?: string;
      attachmentType?: string;
    }
  ): Promise<{ id: string; url: string }> {
    try {
      this.logger.info(`Adding attachment to test result ${resultId}: ${attachment.filename}`);
      
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

      const linkUrl = ADOConfig.buildUrl(
        `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}/attachments`
      );
      await this.client.post(linkUrl, linkBody);
      
      this.logger.info(`Attachment added successfully: ${uploadResponse.data.id}`);
      return uploadResponse.data;
    } catch (error) {
      this.logger.error('Failed to add test result attachment:', error as Error);
      throw error;
    }
  }

  /**
   * Add test iteration result
   */
  async addTestIterationResult(
    runId: number,
    resultId: number,
    iteration: {
      outcome: string;
      startedDate: string;
      completedDate: string;
      durationInMs: number;
      comment?: string;
      errorMessage?: string;
      stackTrace?: string;
      parameters?: Array<{ parameterName: string; value: any }>;
      actionResults?: Array<{
        actionPath: string;
        outcome: string;
        startedDate: string;
        completedDate: string;
        durationInMs: number;
        errorMessage?: string;
      }>;
    }
  ): Promise<TestIterationResult> {
    try {
      this.logger.info(`Adding iteration to test result: ${resultId}`);
      
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}/iterations`
      );
      
      const response = await this.client.post<TestIterationResult>(url, iteration);
      
      this.logger.info(`Test iteration added: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to add test iteration:', error as Error);
      throw error;
    }
  }

  /**
   * Add test sub result
   */
  async addTestSubResult(
    runId: number,
    resultId: number,
    subResult: {
      displayName: string;
      parentId?: number;
      outcome: string;
      startedDate: string;
      completedDate: string;
      durationInMs: number;
      state?: string;
      computerName?: string;
      comment?: string;
      errorMessage?: string;
      stackTrace?: string;
    }
  ): Promise<TestSubResult> {
    try {
      this.logger.info(`Adding sub result to test result: ${resultId}`);
      
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}/subresults`
      );
      
      const response = await this.client.post<TestSubResult>(url, subResult);
      
      this.logger.info(`Test sub result added: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to add test sub result:', error as Error);
      throw error;
    }
  }

  /**
   * Associate work items with test result
   */
  async associateWorkItems(
    runId: number,
    resultId: number,
    workItemIds: number[]
  ): Promise<void> {
    try {
      this.logger.info(`Associating ${workItemIds.length} work items with test result ${resultId}`);
      
      const body = workItemIds.map(id => ({
        id,
        rel: 'ArtifactLink',
        attributes: {
          name: 'Related'
        }
      }));

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testResults.replace('{runId}', runId.toString())}/${resultId}/workitems`
      );
      
      await this.client.post(url, body);
      
      this.logger.info('Work items associated successfully');
    } catch (error) {
      this.logger.error('Failed to associate work items:', error as Error);
      throw error;
    }
  }

  /**
   * Get test result history
   */
  async getTestResultHistory(
    testCaseId: number,
    options?: {
      maxResults?: number;
      continuationToken?: string;
      branch?: string;
      buildDefinitionId?: number;
      releaseDefinitionId?: number;
    }
  ): Promise<{
    results: Array<{
      id: number;
      runId: number;
      outcome: string;
      startedDate: string;
      completedDate: string;
      build?: { id: string; name: string };
      release?: { id: string; name: string };
    }>;
    continuationToken?: string;
  }> {
    try {
      this.logger.info(`Fetching test result history for test case: ${testCaseId}`);
      
      const queryParams: Record<string, any> = {
        testCaseId
      };
      if (options?.maxResults) queryParams['maxResults'] = options.maxResults;
      if (options?.continuationToken) queryParams['continuationToken'] = options.continuationToken;
      if (options?.branch) queryParams['branch'] = options.branch;
      if (options?.buildDefinitionId) queryParams['buildDefinitionId'] = options.buildDefinitionId;
      if (options?.releaseDefinitionId) queryParams['releaseDefinitionId'] = options.releaseDefinitionId;

      const url = ADOConfig.buildUrl(
        `${ADOConfig.getBaseUrl()}/test/results/history`,
        queryParams
      );
      
      const response = await this.client.get(url);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get test result history for test case ${testCaseId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Prepare result request
   */
  private prepareResultRequest(result: TestResultCreateRequest | ADOTestResult): TestResultCreateRequest {
    if ('id' in result) {
      const request: TestResultCreateRequest = {
        testCaseId: result.testCaseId,
        testPointId: result.testPointId,
        outcome: result.outcome,
        state: result.state,
        startedDate: result.startedDate,
        completedDate: result.completedDate,
        durationInMs: result.durationInMs,
        automatedTestName: `CS.${result.testCaseId}`,
        automatedTestStorage: 'CS Test Automation Framework',
        computerName: require('os').hostname()
      };
      
      if (result.errorMessage !== undefined) {
        request.errorMessage = result.errorMessage;
      }
      
      if (result.stackTrace !== undefined) {
        request.stackTrace = result.stackTrace;
      }
      
      if (result.comment !== undefined) {
        request.comment = result.comment;
      }
      
      return request;
    }
    
    return {
      ...result,
      state: result.state || 'Completed',
      startedDate: result.startedDate || new Date().toISOString(),
      completedDate: result.completedDate || new Date().toISOString(),
      durationInMs: result.durationInMs || 0,
      automatedTestName: result.automatedTestName || `CS.${result.testCaseId}`,
      automatedTestStorage: result.automatedTestStorage || 'CS Test Automation Framework',
      computerName: result.computerName || require('os').hostname()
    };
  }

  /**
   * Queue upload operation
   */
  queueUpload(uploadFn: () => Promise<void>): void {
    this.uploadQueue.push(uploadFn);
    this.processQueue();
  }

  /**
   * Process upload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.uploadQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    try {
      while (this.uploadQueue.length > 0) {
        const batch = this.uploadQueue.splice(0, 5);
        await Promise.all(batch.map(fn => fn().catch(error => {
          this.logger.error('Queued upload failed:', error as Error);
        })));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.resultCache.clear();
    this.logger.debug('Test result cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { results: number; queueSize: number } {
    return {
      results: this.resultCache.size,
      queueSize: this.uploadQueue.length
    };
  }
}