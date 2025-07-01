// src/integrations/ado/TestSuiteManager.ts
import { ADOClient, ADOListResponse } from './ADOClient';
import { ADOConfig } from './ADOConfig';
import { Logger } from '../../core/utils/Logger';

export interface TestSuite {
  id: number;
  name: string;
  suiteType: 'StaticTestSuite' | 'DynamicTestSuite' | 'RequirementTestSuite';
  parentSuite?: {
    id: number;
    name: string;
  };
  children?: TestSuite[];
  testCases?: TestCase[];
  testCaseCount: number;
  revision: number;
  inheritDefaultConfigurations: boolean;
  defaultConfigurations?: Array<{ id: number; name: string }>;
  requirementId?: number;
  queryString?: string;
}

export interface TestCase {
  testCase: {
    id: number;
    name: string;
    webUrl: string;
  };
  pointAssignments?: Array<{
    id: number;
    configurationId: number;
    configurationName: string;
    tester?: {
      displayName: string;
      id: string;
    };
  }>;
  workItem?: {
    id: number;
    name: string;
    workItemFields: any[];
  };
}

export interface TestPoint {
  id: number;
  testCaseId?: number;
  testSuiteId?: number;
  testPlanId?: number;
  configurationId?: number;
  configurationName?: string;
  testCase?: {
    id: string | number;
    name?: string;
    url?: string;
    webUrl?: string;
  };
  testCaseReference?: {
    id: number;
    name: string;
    state: string;
    webUrl: string;
  };
  configuration?: {
    id: string | number;
    name: string;
  };
  tester?: {
    displayName: string;
    id: string;
    uniqueName: string;
  };
  outcome?: string;
  lastResultId?: number;
  lastRunId?: number;
  lastUpdated?: string;
  lastUpdatedBy?: {
    displayName: string;
    id: string;
  };
}

export interface TestSuiteCreateRequest {
  name: string;
  suiteType: 'StaticTestSuite' | 'DynamicTestSuite' | 'RequirementTestSuite';
  parentSuiteId?: number;
  inheritDefaultConfigurations?: boolean;
  defaultConfigurations?: number[];
  requirementId?: number;
  queryString?: string;
}

export interface TestSuiteUpdateRequest {
  name?: string;
  inheritDefaultConfigurations?: boolean;
  defaultConfigurations?: number[];
  revision: number;
}

export class TestSuiteManager {
  private readonly logger = Logger.getInstance(TestSuiteManager.name);
  private suiteCache = new Map<string, TestSuite>();
  private testPointCache = new Map<string, TestPoint[]>();

  private get endpoints() {
    return ADOConfig.getEndpoints();
  }

  constructor(private readonly client: ADOClient) {
    this.logger.info('TestSuiteManager initialized');
  }

  /**
   * Get test suites for a plan
   */
  async getTestSuites(
    planId: number,
    options?: {
      expand?: boolean;
      skip?: number;
      top?: number;
      asTreeView?: boolean;
    }
  ): Promise<TestSuite[]> {
    try {
      this.logger.info(`Fetching test suites for plan: ${planId}`);
      
      const queryParams: Record<string, any> = {};
      if (options?.expand) queryParams['expand'] = 'children';
      if (options?.skip !== undefined) queryParams['$skip'] = options.skip;
      if (options?.top !== undefined) queryParams['$top'] = options.top;
      if (options?.asTreeView) queryParams['asTreeView'] = true;

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites`,
        queryParams
      );
      const response = await this.client.get<ADOListResponse<TestSuite>>(url);
      
      const suites = response.data.value;
      
      suites.forEach(suite => {
        const cacheKey = `${planId}_${suite.id}`;
        this.suiteCache.set(cacheKey, suite);
      });
      
      this.logger.info(`Retrieved ${suites.length} test suites`);
      return suites;
    } catch (error) {
      this.logger.error(`Failed to get test suites for plan ${planId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get test suite by ID
   */
  async getTestSuite(
    planId: number,
    suiteId: number,
    options?: {
      expand?: boolean;
      includeChildSuites?: boolean;
    }
  ): Promise<TestSuite> {
    try {
      const cacheKey = `${planId}_${suiteId}`;
      
      if (!options?.expand && this.suiteCache.has(cacheKey)) {
        this.logger.debug(`Retrieved test suite ${suiteId} from cache`);
        return this.suiteCache.get(cacheKey)!;
      }

      this.logger.info(`Fetching test suite: ${suiteId}`);
      
      const queryParams: Record<string, any> = {};
      if (options?.expand) queryParams['expand'] = 'children';
      if (options?.includeChildSuites) queryParams['includeChildSuites'] = true;

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}`,
        queryParams
      );
      const response = await this.client.get<TestSuite>(url);
      
      const suite = response.data;
      this.suiteCache.set(cacheKey, suite);
      
      return suite;
    } catch (error) {
      this.logger.error(`Failed to get test suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Create test suite
   */
  async createTestSuite(
    planId: number,
    request: TestSuiteCreateRequest
  ): Promise<TestSuite> {
    try {
      this.logger.info(`Creating test suite: ${request.name}`);
      
      const body = {
        name: request.name,
        suiteType: request.suiteType,
        parentSuite: request.parentSuiteId ? { id: request.parentSuiteId } : undefined,
        inheritDefaultConfigurations: request.inheritDefaultConfigurations ?? true,
        defaultConfigurations: request.defaultConfigurations?.map(id => ({ id })),
        requirementId: request.requirementId,
        queryString: request.queryString
      };

      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/suites`);
      const response = await this.client.post<TestSuite>(url, body);
      
      const suite = response.data;
      const cacheKey = `${planId}_${suite.id}`;
      this.suiteCache.set(cacheKey, suite);
      
      this.logger.info(`Created test suite: ${suite.name} (ID: ${suite.id})`);
      return suite;
    } catch (error) {
      this.logger.error('Failed to create test suite:', error as Error);
      throw error;
    }
  }

  /**
   * Update test suite
   */
  async updateTestSuite(
    planId: number,
    suiteId: number,
    request: TestSuiteUpdateRequest
  ): Promise<TestSuite> {
    try {
      this.logger.info(`Updating test suite: ${suiteId}`);
      
      const currentSuite = await this.getTestSuite(planId, suiteId);
      
      const body = {
        ...request,
        revision: currentSuite.revision,
        defaultConfigurations: request.defaultConfigurations?.map(id => ({ id }))
      };

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}`
      );
      const response = await this.client.patch<TestSuite>(url, body);
      
      const suite = response.data;
      const cacheKey = `${planId}_${suite.id}`;
      this.suiteCache.set(cacheKey, suite);
      
      this.logger.info(`Updated test suite: ${suite.name}`);
      return suite;
    } catch (error) {
      this.logger.error(`Failed to update test suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Delete test suite
   */
  async deleteTestSuite(planId: number, suiteId: number): Promise<void> {
    try {
      this.logger.info(`Deleting test suite: ${suiteId}`);
      
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}`
      );
      await this.client.delete(url);
      
      const cacheKey = `${planId}_${suiteId}`;
      this.suiteCache.delete(cacheKey);
      this.testPointCache.delete(cacheKey);
      
      this.logger.info(`Deleted test suite: ${suiteId}`);
    } catch (error) {
      this.logger.error(`Failed to delete test suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get test cases in suite
   */
  async getTestCases(
    planId: number,
    suiteId: number,
    options?: {
      skip?: number;
      top?: number;
      returnIdentityRef?: boolean;
      expand?: boolean;
    }
  ): Promise<TestCase[]> {
    try {
      this.logger.info(`Fetching test cases for suite: ${suiteId}`);
      
      const queryParams: Record<string, any> = {};
      if (options?.skip !== undefined) queryParams['$skip'] = options.skip;
      if (options?.top !== undefined) queryParams['$top'] = options.top;
      if (options?.returnIdentityRef) queryParams['returnIdentityRef'] = true;
      if (options?.expand) queryParams['expand'] = true;

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/testcases`,
        queryParams
      );
      const response = await this.client.get<ADOListResponse<TestCase>>(url);
      
      this.logger.info(`Retrieved ${response.data.count} test cases`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test cases for suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Add test cases to suite
   */
  async addTestCases(
    planId: number,
    suiteId: number,
    testCaseIds: number[]
  ): Promise<TestCase[]> {
    try {
      this.logger.info(`Adding ${testCaseIds.length} test cases to suite ${suiteId}`);
      
      const body = testCaseIds.map(id => ({ id }));

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/testcases`
      );
      const response = await this.client.post<{ value: TestCase[] }>(url, body);
      
      this.logger.info(`Added ${response.data.value.length} test cases to suite`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to add test cases to suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Remove test cases from suite
   */
  async removeTestCases(
    planId: number,
    suiteId: number,
    testCaseIds: number[]
  ): Promise<void> {
    try {
      this.logger.info(`Removing ${testCaseIds.length} test cases from suite ${suiteId}`);
      
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/testcases/${testCaseIds.join(',')}`
      );
      await this.client.delete(url);
      
      this.logger.info('Test cases removed from suite');
    } catch (error) {
      this.logger.error(`Failed to remove test cases from suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get test points
   */
  async getTestPoints(
    planId: number,
    suiteId: number,
    options?: {
      testCaseId?: number;
      testPointIds?: number[];
      configurationIds?: number[];
      includePointDetails?: boolean;
      skip?: number;
      top?: number;
    }
  ): Promise<TestPoint[]> {
    try {
      const cacheKey = `${planId}_${suiteId}`;
      
      if (!options && this.testPointCache.has(cacheKey)) {
        this.logger.debug(`Retrieved test points from cache for suite ${suiteId}`);
        return this.testPointCache.get(cacheKey)!;
      }

      this.logger.info(`Fetching test points for suite: ${suiteId}`);
      
      const queryParams: Record<string, any> = {};
      if (options?.testCaseId) queryParams['testCaseId'] = options.testCaseId;
      if (options?.testPointIds) queryParams['testPointIds'] = options.testPointIds.join(',');
      if (options?.configurationIds) queryParams['configurationIds'] = options.configurationIds.join(',');
      if (options?.includePointDetails) queryParams['includePointDetails'] = true;
      if (options?.skip !== undefined) queryParams['$skip'] = options.skip;
      if (options?.top !== undefined) queryParams['$top'] = options.top;

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/points`,
        queryParams
      );
      const response = await this.client.get<ADOListResponse<TestPoint>>(url);
      
      this.logger.debug(`Test points API response:`, {
        url,
        statusCode: response.status,
        hasData: !!response.data,
        hasValue: !!response.data?.value,
        count: response.data?.count || 0
      });
      
      const testPoints = response.data.value || [];
      
      if (testPoints.length > 0) {
        this.logger.debug('Sample test points:', testPoints.slice(0, 2).map(tp => ({
          id: tp.id,
          testCaseId: tp.testCaseId || tp.testCase?.id || tp.testCaseReference?.id,
          testSuiteId: tp.testSuiteId,
          configurationId: tp.configurationId || tp.configuration?.id,
          configurationName: tp.configurationName || tp.configuration?.name
        })));
      }
      
      if (!options) {
        this.testPointCache.set(cacheKey, testPoints);
      }
      
      this.logger.info(`Retrieved ${testPoints.length} test points`);
      return testPoints;
    } catch (error) {
      this.logger.error(`Failed to get test points for suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Update test points
   */
  async updateTestPoints(
    planId: number,
    suiteId: number,
    pointUpdates: Array<{
      id: number;
      tester?: { id: string };
      outcome?: string;
      resetToActive?: boolean;
    }>
  ): Promise<TestPoint[]> {
    try {
      this.logger.info(`Updating ${pointUpdates.length} test points in suite ${suiteId}`);
      
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/points`
      );
      const response = await this.client.patch<{ value: TestPoint[] }>(url, pointUpdates);
      
      const cacheKey = `${planId}_${suiteId}`;
      this.testPointCache.delete(cacheKey);
      
      this.logger.info('Test points updated successfully');
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to update test points in suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Clone test suite
   */
  async cloneTestSuite(
    sourcePlanId: number,
    sourceSuiteId: number,
    destinationPlanId: number,
    destinationSuiteId: number,
    options?: {
      cloneChildren?: boolean;
      cloneTestCases?: boolean;
      overrideParameters?: Record<string, string>;
    }
  ): Promise<{ cloneOperationResponse: { id: string; state: string; url: string } }> {
    try {
      this.logger.info(`Cloning test suite ${sourceSuiteId} to plan ${destinationPlanId}`);
      
      const body = {
        destinationTestSuite: {
          planId: destinationPlanId,
          suiteId: destinationSuiteId
        },
        options: {
          cloneChildren: options?.cloneChildren ?? true,
          cloneTestCases: options?.cloneTestCases ?? true,
          overrideParameters: options?.overrideParameters || {}
        }
      };

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${sourcePlanId}/suites/${sourceSuiteId}/clone`
      );
      const response = await this.client.post(url, body);
      
      this.logger.info(`Test suite clone operation started: ${response.data.cloneOperationResponse.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to clone test suite ${sourceSuiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Move test suite
   */
  async moveTestSuite(
    planId: number,
    suiteId: number,
    newParentSuiteId: number
  ): Promise<TestSuite> {
    try {
      this.logger.info(`Moving test suite ${suiteId} to parent ${newParentSuiteId}`);
      
      const body = {
        parentSuite: {
          id: newParentSuiteId
        }
      };

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/move`
      );
      const response = await this.client.patch<TestSuite>(url, body);
      
      this.clearSuiteCache(planId, suiteId);
      
      this.logger.info('Test suite moved successfully');
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to move test suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Reorder test suites
   */
  async reorderTestSuites(
    planId: number,
    parentSuiteId: number,
    suiteIds: number[]
  ): Promise<void> {
    try {
      this.logger.info(`Reordering ${suiteIds.length} test suites under parent ${parentSuiteId}`);
      
      const body = suiteIds.map((id, index) => ({
        id,
        order: index + 1
      }));

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${parentSuiteId}/reorder`
      );
      await this.client.patch(url, body);
      
      this.logger.info('Test suites reordered successfully');
    } catch (error) {
      this.logger.error('Failed to reorder test suites:', error as Error);
      throw error;
    }
  }

  /**
   * Get suite test case count
   */
  async getSuiteTestCaseCount(
    planId: number,
    suiteId: number,
    includeChildren: boolean = false
  ): Promise<{ total: number; byOutcome: Record<string, number> }> {
    try {
      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/testcasecount`,
        { includeChildren }
      );
      const response = await this.client.get(url);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get test case count for suite ${suiteId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Clear suite cache
   */
  private clearSuiteCache(planId: number, suiteId: number): void {
    const cacheKey = `${planId}_${suiteId}`;
    this.suiteCache.delete(cacheKey);
    this.testPointCache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.suiteCache.clear();
    this.testPointCache.clear();
    this.logger.debug('Test suite cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { suites: number; testPoints: number } {
    return {
      suites: this.suiteCache.size,
      testPoints: this.testPointCache.size
    };
  }
}