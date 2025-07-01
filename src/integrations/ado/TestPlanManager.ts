// src/integrations/ado/TestPlanManager.ts
import { ADOClient, ADOListResponse } from './ADOClient';
import { ADOConfig } from './ADOConfig';
import { Logger } from '../../core/utils/Logger';

export interface TestPlan {
  id: number;
  name: string;
  areaPath: string;
  iteration: string;
  state: 'Active' | 'Inactive';
  revision: number;
  startDate?: string;
  endDate?: string;
  description?: string;
  owner?: {
    displayName: string;
    id: string;
  };
  rootSuite: {
    id: number;
    name: string;
  };
  clientUrl: string;
}

export interface TestPlanCreateRequest {
  name: string;
  areaPath?: string;
  iteration?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  state?: 'Active' | 'Inactive';
}

export interface TestPlanUpdateRequest {
  name?: string;
  areaPath?: string;
  iteration?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  state?: 'Active' | 'Inactive';
  revision: number;
}

export interface TestConfiguration {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  state: 'Active' | 'Inactive';
  values: Array<{
    name: string;
    value: string;
  }>;
}

export interface TestVariable {
  id: number;
  name: string;
  description?: string;
  values: string[];
}

export class TestPlanManager {
  private readonly logger = Logger.getInstance(TestPlanManager.name);
  private planCache = new Map<number, TestPlan>();
  private configCache = new Map<number, TestConfiguration>();

  private get endpoints() {
    return ADOConfig.getEndpoints();
  }

  constructor(private readonly client: ADOClient) {
    this.logger.info('TestPlanManager initialized');
  }

  async getTestPlans(
    options?: {
      state?: 'Active' | 'Inactive';
      includeSuites?: boolean;
      skip?: number;
      top?: number;
    }
  ): Promise<TestPlan[]> {
    try {
      this.logger.info('Fetching test plans...');
      
      const queryParams: Record<string, any> = {};
      if (options?.state) queryParams['filterState'] = options.state;
      if (options?.includeSuites) queryParams['includeSuites'] = true;
      if (options?.skip !== undefined) queryParams['$skip'] = options.skip;
      if (options?.top !== undefined) queryParams['$top'] = options.top;

      const url = ADOConfig.buildUrl(this.endpoints.testPlans, queryParams);
      const response = await this.client.get<ADOListResponse<TestPlan>>(url);
      
      const plans = response.data.value;
      
      plans.forEach(plan => this.planCache.set(plan.id, plan));
      
      this.logger.info(`Retrieved ${plans.length} test plans`);
      return plans;
    } catch (error) {
      this.logger.error('Failed to get test plans:', error as Error);
      throw error;
    }
  }

  async getTestPlan(planId: number, useCache: boolean = true): Promise<TestPlan> {
    try {
      if (useCache && this.planCache.has(planId)) {
        this.logger.debug(`Retrieved test plan ${planId} from cache`);
        return this.planCache.get(planId)!;
      }

      this.logger.info(`Fetching test plan: ${planId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}`);
      const response = await this.client.get<TestPlan>(url);
      
      const plan = response.data;
      this.planCache.set(plan.id, plan);
      
      return plan;
    } catch (error) {
      this.logger.error(`Failed to get test plan ${planId}:`, error as Error);
      throw error;
    }
  }

  async createTestPlan(request: TestPlanCreateRequest): Promise<TestPlan> {
    try {
      this.logger.info(`Creating test plan: ${request.name}`);
      
      const body = {
        name: request.name,
        areaPath: request.areaPath || ADOConfig.getConfig().projectName,
        iteration: request.iteration || ADOConfig.getConfig().projectName,
        startDate: request.startDate,
        endDate: request.endDate,
        description: request.description,
        state: request.state || 'Active'
      };

      const url = ADOConfig.buildUrl(this.endpoints.testPlans);
      const response = await this.client.post<TestPlan>(url, body);
      
      const plan = response.data;
      this.planCache.set(plan.id, plan);
      
      this.logger.info(`Created test plan: ${plan.name} (ID: ${plan.id})`);
      return plan;
    } catch (error) {
      this.logger.error('Failed to create test plan:', error as Error);
      throw error;
    }
  }

  async updateTestPlan(planId: number, request: TestPlanUpdateRequest): Promise<TestPlan> {
    try {
      this.logger.info(`Updating test plan: ${planId}`);
      
      const currentPlan = await this.getTestPlan(planId, false);
      
      const body = {
        ...request,
        revision: currentPlan.revision
      };

      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}`);
      const response = await this.client.patch<TestPlan>(url, body);
      
      const plan = response.data;
      this.planCache.set(plan.id, plan);
      
      this.logger.info(`Updated test plan: ${plan.name}`);
      return plan;
    } catch (error) {
      this.logger.error(`Failed to update test plan ${planId}:`, error as Error);
      throw error;
    }
  }

  async deleteTestPlan(planId: number): Promise<void> {
    try {
      this.logger.info(`Deleting test plan: ${planId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}`);
      await this.client.delete(url);
      
      this.planCache.delete(planId);
      
      this.logger.info(`Deleted test plan: ${planId}`);
    } catch (error) {
      this.logger.error(`Failed to delete test plan ${planId}:`, error as Error);
      throw error;
    }
  }

  async getTestConfigurations(planId: number): Promise<TestConfiguration[]> {
    try {
      this.logger.info(`Fetching test configurations for plan: ${planId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/configurations`);
      const response = await this.client.get<ADOListResponse<TestConfiguration>>(url);
      
      const configs = response.data.value;
      
      configs.forEach(config => this.configCache.set(config.id, config));
      
      this.logger.info(`Retrieved ${configs.length} test configurations`);
      return configs;
    } catch (error) {
      this.logger.error(`Failed to get test configurations for plan ${planId}:`, error as Error);
      throw error;
    }
  }

  async createTestConfiguration(
    planId: number,
    config: {
      name: string;
      description?: string;
      values: Array<{ name: string; value: string }>;
      isDefault?: boolean;
      state?: 'Active' | 'Inactive';
    }
  ): Promise<TestConfiguration> {
    try {
      this.logger.info(`Creating test configuration: ${config.name}`);
      
      const body = {
        name: config.name,
        description: config.description,
        values: config.values,
        isDefault: config.isDefault || false,
        state: config.state || 'Active'
      };

      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/configurations`);
      const response = await this.client.post<TestConfiguration>(url, body);
      
      const configuration = response.data;
      this.configCache.set(configuration.id, configuration);
      
      this.logger.info(`Created test configuration: ${configuration.name} (ID: ${configuration.id})`);
      return configuration;
    } catch (error) {
      this.logger.error('Failed to create test configuration:', error as Error);
      throw error;
    }
  }

  async getTestVariables(planId: number): Promise<TestVariable[]> {
    try {
      this.logger.info(`Fetching test variables for plan: ${planId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/variables`);
      const response = await this.client.get<ADOListResponse<TestVariable>>(url);
      
      this.logger.info(`Retrieved ${response.data.count} test variables`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test variables for plan ${planId}:`, error as Error);
      throw error;
    }
  }

  async createTestVariable(
    planId: number,
    variable: {
      name: string;
      description?: string;
      values: string[];
    }
  ): Promise<TestVariable> {
    try {
      this.logger.info(`Creating test variable: ${variable.name}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/variables`);
      const response = await this.client.post<TestVariable>(url, variable);
      
      this.logger.info(`Created test variable: ${response.data.name} (ID: ${response.data.id})`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create test variable:', error as Error);
      throw error;
    }
  }

  async cloneTestPlan(
    sourcePlanId: number,
    options: {
      destinationName: string;
      destinationAreaPath?: string;
      destinationIteration?: string;
      cloneOptions?: {
        copyAllSuites?: boolean;
        copyTestCases?: boolean;
        cloneRequirements?: boolean;
        overrideParameters?: Record<string, string>;
      };
    }
  ): Promise<{ cloneOperationResponse: { id: string; state: string; url: string } }> {
    try {
      this.logger.info(`Cloning test plan ${sourcePlanId} to ${options.destinationName}`);
      
      const body = {
        cloneRequestBody: {
          destinationTestPlan: {
            name: options.destinationName,
            areaPath: options.destinationAreaPath || ADOConfig.getConfig().projectName,
            iteration: options.destinationIteration || ADOConfig.getConfig().projectName
          },
          options: {
            copyAllSuites: options.cloneOptions?.copyAllSuites ?? true,
            copyTestCases: options.cloneOptions?.copyTestCases ?? true,
            cloneRequirements: options.cloneOptions?.cloneRequirements ?? false,
            destinationWorkItemType: 'Test Case',
            overrideParameters: options.cloneOptions?.overrideParameters || {}
          }
        }
      };

      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${sourcePlanId}/clone`);
      const response = await this.client.post<{ cloneOperationResponse: any }>(url, body);
      
      this.logger.info(`Test plan clone operation started: ${response.data.cloneOperationResponse.id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to clone test plan ${sourcePlanId}:`, error as Error);
      throw error;
    }
  }

  async getCloneOperationStatus(
    planId: number,
    operationId: string
  ): Promise<{ state: string; message?: string; completedDate?: string; resultObjectType?: string; resultObjectId?: number }> {
    try {
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/cloneOperations/${operationId}`);
      const response = await this.client.get(url);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get clone operation status ${operationId}:`, error as Error);
      throw error;
    }
  }

  async exportTestPlan(
    planId: number,
    suiteIds?: number[]
  ): Promise<{ content: string; fileName: string }> {
    try {
      this.logger.info(`Exporting test plan: ${planId}`);
      
      const body = {
        suiteIds: suiteIds || []
      };

      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/testcases/export`);
      const response = await this.client.post(url, body);
      
      this.logger.info('Test plan exported successfully');
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to export test plan ${planId}:`, error as Error);
      throw error;
    }
  }

  async getTestPlanStatistics(planId: number): Promise<{
    totalTests: number;
    automatedTests: number;
    manualTests: number;
    totalSuites: number;
    requirementsCoverage: number;
    testOutcome: {
      passed: number;
      failed: number;
      blocked: number;
      notExecuted: number;
      inProgress: number;
    };
  }> {
    try {
      this.logger.info(`Fetching statistics for test plan: ${planId}`);
      
      const url = ADOConfig.buildUrl(`${this.endpoints.testPlans}/${planId}/statistics`);
      const response = await this.client.get(url);
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get test plan statistics ${planId}:`, error as Error);
      throw error;
    }
  }

  async assignTester(
    planId: number,
    suiteId: number,
    testPointIds: number[],
    testerIdentity: string
  ): Promise<void> {
    try {
      this.logger.info(`Assigning tester ${testerIdentity} to ${testPointIds.length} test points`);
      
      const body = {
        testPointIds,
        tester: {
          displayName: testerIdentity
        }
      };

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/suites/${suiteId}/testpoints/assign`
      );
      await this.client.post(url, body);
      
      this.logger.info('Tester assigned successfully');
    } catch (error) {
      this.logger.error('Failed to assign tester:', error as Error);
      throw error;
    }
  }

  async getTestPlanWorkItems(
    planId: number,
    options?: {
      workItemTypes?: string[];
      states?: string[];
      assignedTo?: string;
      skip?: number;
      top?: number;
    }
  ): Promise<any[]> {
    try {
      this.logger.info(`Fetching work items for test plan: ${planId}`);
      
      const queryParams: Record<string, any> = {};
      if (options?.workItemTypes) queryParams['workItemTypes'] = options.workItemTypes.join(',');
      if (options?.states) queryParams['states'] = options.states.join(',');
      if (options?.assignedTo) queryParams['assignedTo'] = options.assignedTo;
      if (options?.skip !== undefined) queryParams['$skip'] = options.skip;
      if (options?.top !== undefined) queryParams['$top'] = options.top;

      const url = ADOConfig.buildUrl(
        `${this.endpoints.testPlans}/${planId}/workitems`,
        queryParams
      );
      const response = await this.client.get(url);
      
      this.logger.info(`Retrieved ${response.data.count} work items`);
      return response.data.value;
    } catch (error) {
      this.logger.error(`Failed to get test plan work items ${planId}:`, error as Error);
      throw error;
    }
  }

  clearCache(): void {
    this.planCache.clear();
    this.configCache.clear();
    this.logger.debug('Test plan cache cleared');
  }

  getCacheStats(): { plans: number; configurations: number } {
    return {
      plans: this.planCache.size,
      configurations: this.configCache.size
    };
  }
}
