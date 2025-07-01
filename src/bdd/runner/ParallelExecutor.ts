import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import { 
  Feature, 
  Scenario, 
  ExecutionResult, 
  ScenarioResult, 
  FeatureResult,
  ExecutionPlan, 
  WorkerMessage, 
  WorkerResult, 
  WorkerStatus,
  ExecutionSummary,
  ExecutionStatus,
  ScenarioStatus,
  FeatureStatus
} from '../types/bdd.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { BrowserPool } from '../../core/browser/BrowserPool';
import { EventEmitter } from 'events';

export class ParallelExecutor extends EventEmitter {
  private static instance: ParallelExecutor;
  private workers: Map<number, WorkerInfo>;
  private workQueue: WorkItem[];
  private results: Map<string, WorkerResult>;
  private browserPool?: BrowserPool;
  private maxWorkers: number;
  private activeWorkers: number;
  private completedItems: number;
  private totalItems: number;
  private startTime: number;
  private executionStats: ExecutionStats;
  private workerIdCounter: number;
  private aborted: boolean;

  private constructor() {
    super();
    this.workers = new Map();
    this.workQueue = [];
    this.results = new Map();
    this.maxWorkers = this.calculateMaxWorkers();
    this.activeWorkers = 0;
    this.completedItems = 0;
    this.totalItems = 0;
    this.startTime = 0;
    this.executionStats = this.initializeStats();
    this.workerIdCounter = 0;
    this.aborted = false;
  }

  static getInstance(): ParallelExecutor {
    if (!ParallelExecutor.instance) {
      ParallelExecutor.instance = new ParallelExecutor();
    }
    return ParallelExecutor.instance;
  }

  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    ActionLogger.logInfo('ParallelExecutor', 
      `Starting parallel execution with ${this.maxWorkers} workers`);

    this.startTime = Date.now();
    this.aborted = false;

    try {
      if (this.requiresBrowserPool(plan)) {
        await this.initializeBrowserPool();
      }

      this.createWorkItems(plan);
      this.totalItems = this.workQueue.length;

      ActionLogger.logInfo('ParallelExecutor', 
        `Created ${this.totalItems} work items for execution`);

      await this.createWorkerPool();

      await this.processWorkQueue();

      await this.waitForCompletion();

      return this.aggregateResults();

    } catch (error) {
      ActionLogger.logError('ParallelExecutor: Parallel execution failed', error as Error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private calculateMaxWorkers(): number {
    const configured = ConfigurationManager.getInt('MAX_PARALLEL_WORKERS', 0);
    if (configured > 0) {
      return configured;
    }

    const cpuCount = os.cpus().length;
    return Math.max(1, cpuCount - 1);
  }

  private initializeStats(): ExecutionStats {
    return {
      totalWorkers: 0,
      activeWorkers: 0,
      idleWorkers: 0,
      completedWorkers: 0,
      failedWorkers: 0,
      workItemsProcessed: 0,
      workItemsFailed: 0,
      averageExecutionTime: 0,
      workerUtilization: new Map()
    };
  }

  private requiresBrowserPool(plan: ExecutionPlan): boolean {
    return plan.scenarios.some((scenario: Scenario) => 
      !scenario.tags?.includes('@api') && !scenario.tags?.includes('@database')
    );
  }

  private async initializeBrowserPool(): Promise<void> {
    ActionLogger.logInfo('ParallelExecutor', 'Browser pool disabled - using single browser only');
    // CRITICAL FIX: Browser pool completely disabled to prevent multiple browser instances
  }

  private createWorkItems(plan: ExecutionPlan): void {
    const featureGroups = new Map<string, Scenario[]>();

    for (const scenario of plan.scenarios) {
      const featureId = scenario.featureFile || 'unknown';
      const scenarios = featureGroups.get(featureId) || [];
      scenarios.push(scenario);
      featureGroups.set(featureId, scenarios);
    }

    let itemId = 0;
    for (const [featureFile, scenarios] of featureGroups) {
              if (ConfigurationManager.getBoolean('PARALLEL_SCENARIO_EXECUTION', false)) {
        for (const scenario of scenarios) {
          this.workQueue.push({
            id: `work-item-${itemId++}`,
            type: 'scenario',
            featureFile,
            scenario,
            priority: this.calculatePriority(scenario),
            estimatedDuration: this.estimateDuration(scenario)
          });
        }
      } else {
        this.workQueue.push({
          id: `work-item-${itemId++}`,
          type: 'feature',
          featureFile,
          scenarios,
          priority: this.calculateFeaturePriority(scenarios),
          estimatedDuration: this.estimateFeatureDuration(scenarios)
        });
      }
    }

    this.workQueue.sort((a, b) => b.priority - a.priority);
  }

  private calculatePriority(scenario: Scenario): number {
    let priority = 50;

    // Critical scenarios get highest priority
    if (scenario.tags?.includes('@critical')) priority += 40;
    if (scenario.tags?.includes('@smoke')) priority += 30;
    if (scenario.tags?.includes('@regression')) priority += 20;
    
    if (scenario.tags?.includes('@fast')) priority += 10;
    
    if (scenario.tags?.includes('@flaky')) priority -= 20;

    return priority;
  }

  private calculateFeaturePriority(scenarios: Scenario[]): number {
    const priorities = scenarios.map(s => this.calculatePriority(s));
    return Math.max(...priorities);
  }

  private estimateDuration(scenario: Scenario): number {
    const historicalDuration = this.getHistoricalDuration(scenario);
    if (historicalDuration > 0) {
      return historicalDuration;
    }

    const baseTime = 1000;
    const perStepTime = 500;
    return baseTime + (scenario.steps.length * perStepTime);
  }

  private estimateFeatureDuration(scenarios: Scenario[]): number {
    return scenarios.reduce((total, scenario) => 
      total + this.estimateDuration(scenario), 0
    );
  }

  private getHistoricalDuration(_scenario: Scenario): number {
    return 0;
  }

  private async createWorkerPool(): Promise<void> {
    ActionLogger.logInfo('ParallelExecutor', `Creating ${this.maxWorkers} workers`);

    const workerPromises: Promise<void>[] = [];

    for (let i = 0; i < this.maxWorkers; i++) {
      workerPromises.push(this.createWorker());
    }

    await Promise.all(workerPromises);
    this.executionStats.totalWorkers = this.workers.size;
  }

  private async createWorker(): Promise<void> {
    const workerId = this.workerIdCounter++;
    const workerPath = path.join(__dirname, 'TestWorker.js');

    const worker = new Worker(workerPath, {
      workerData: {
        workerId,
        environment: ConfigurationManager.getEnvironmentName(),
        config: ConfigurationManager.export()
      }
    });

    const workerInfo: WorkerInfo = {
      id: workerId,
      worker,
      status: 'idle',
      currentWork: null,
      startTime: Date.now(),
      itemsProcessed: 0,
      errors: 0
    };

    this.workers.set(workerId, workerInfo);
    this.setupWorkerEventHandlers(workerInfo);

    ActionLogger.logDebug('ParallelExecutor', `Worker ${workerId} created`);
  }

  private setupWorkerEventHandlers(workerInfo: WorkerInfo): void {
    const { worker, id } = workerInfo;

    worker.on('message', (message: WorkerMessage) => {
      this.handleWorkerMessage(workerInfo, message);
    });

    worker.on('error', (error) => {
      ActionLogger.logError(`ParallelExecutor: Worker ${id} error`, error as Error);
      this.handleWorkerError(workerInfo, error);
    });

    worker.on('exit', (code) => {
      ActionLogger.logDebug('ParallelExecutor', 
        `Worker ${id} exited with code ${code}`);
      this.handleWorkerExit(workerInfo, code);
    });
  }

  private handleWorkerMessage(workerInfo: WorkerInfo, message: WorkerMessage): void {
    switch (message.type) {
      case 'ready':
        this.handleWorkerReady(workerInfo);
        break;

      case 'progress':
        this.handleWorkerProgress(workerInfo, message);
        break;

      case 'result':
        this.handleWorkerResult(workerInfo, message);
        break;

      case 'error':
        this.handleWorkerErrorMessage(workerInfo, message);
        break;

      case 'log':
        this.handleWorkerLog(message);
        break;

      default:
        ActionLogger.logWarn(`ParallelExecutor: Unknown message type from worker ${workerInfo.id}: ${message.type}`);
    }
  }

  private handleWorkerReady(workerInfo: WorkerInfo): void {
    workerInfo.status = 'idle';
    this.assignWork(workerInfo);
  }

  private handleWorkerProgress(workerInfo: WorkerInfo, message: WorkerMessage): void {
    this.emit('progress', {
      workerId: workerInfo.id,
      workItem: workerInfo.currentWork,
      progress: message.data
    });
  }

  private handleWorkerResult(workerInfo: WorkerInfo, message: WorkerMessage): void {
    const result = message.data as WorkerResult;
    
    if (workerInfo.currentWork) {
      this.results.set(workerInfo.currentWork.id, result);
      this.completedItems++;
      workerInfo.itemsProcessed++;
      
      if (result.status === 'failed') {
        this.executionStats.workItemsFailed++;
      }
      this.executionStats.workItemsProcessed++;
      
      ActionLogger.logInfo('ParallelExecutor', 
        `Work item ${workerInfo.currentWork.id} completed by worker ${workerInfo.id}`);
      
      this.emit('itemComplete', {
        workItem: workerInfo.currentWork,
        result,
        progress: {
          completed: this.completedItems,
          total: this.totalItems,
          percentage: (this.completedItems / this.totalItems) * 100
        }
      });
    }

    workerInfo.status = 'idle';
    workerInfo.currentWork = null;
    this.assignWork(workerInfo);
  }

  private handleWorkerErrorMessage(workerInfo: WorkerInfo, message: WorkerMessage): void {
    ActionLogger.logError(`ParallelExecutor: Worker ${workerInfo.id} reported error`, message.data as Error);
    
    workerInfo.errors++;
    
    if (workerInfo.errors > 3) {
      this.terminateWorker(workerInfo);
      this.createWorker();
    }
  }

  private handleWorkerLog(message: WorkerMessage): void {
    const { level, message: logMessage, data } = message.data;
    const workerMessage = `Worker: ${logMessage}`;
    
    switch (level) {
      case 'debug':
        ActionLogger.logDebug(workerMessage, data);
        break;
      case 'info':
        ActionLogger.logInfo(workerMessage, data);
        break;
      case 'warn':
        ActionLogger.logWarn(workerMessage, data);
        break;
      case 'error':
        ActionLogger.logError(workerMessage, data);
        break;
      default:
        ActionLogger.logInfo(workerMessage, data);
    }
  }

  private handleWorkerError(workerInfo: WorkerInfo, _error: Error): void {
    workerInfo.status = 'error';
    this.executionStats.failedWorkers++;
    
    if (workerInfo.currentWork) {
      this.workQueue.unshift(workerInfo.currentWork);
    }
    
    this.workers.delete(workerInfo.id);
    this.createWorker();
  }

  private handleWorkerExit(workerInfo: WorkerInfo, code: number): void {
    this.workers.delete(workerInfo.id);
    this.executionStats.completedWorkers++;
    
    if (code !== 0 && workerInfo.currentWork) {
      this.workQueue.unshift(workerInfo.currentWork);
    }
    
    if (this.workQueue.length > 0 && !this.aborted) {
      this.createWorker();
    }
  }

  private async processWorkQueue(): Promise<void> {
    for (const workerInfo of this.workers.values()) {
      this.assignWork(workerInfo);
    }
  }

  private assignWork(workerInfo: WorkerInfo): void {
    if (this.aborted || workerInfo.status !== 'idle' || this.workQueue.length === 0) {
      return;
    }

    const workItem = this.workQueue.shift()!;
    workerInfo.currentWork = workItem;
    workerInfo.status = 'busy';
    this.activeWorkers++;

    ActionLogger.logDebug('ParallelExecutor', 
      `Assigning work item ${workItem.id} to worker ${workerInfo.id}`);

    workerInfo.worker.postMessage({
      type: 'execute',
      workItem
    });

    this.updateWorkerStats();
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.completedItems === this.totalItems || this.aborted) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  private updateWorkerStats(): void {
    let active = 0;
    let idle = 0;

    for (const workerInfo of this.workers.values()) {
      if (workerInfo.status === 'busy') {
        active++;
      } else if (workerInfo.status === 'idle') {
        idle++;
      }

      const utilization = (workerInfo.itemsProcessed / this.totalItems) * 100;
      this.executionStats.workerUtilization.set(workerInfo.id, utilization);
    }

    this.executionStats.activeWorkers = active;
    this.executionStats.idleWorkers = idle;
  }

  private async terminateWorker(workerInfo: WorkerInfo): Promise<void> {
    try {
      await workerInfo.worker.terminate();
    } catch (error) {
      ActionLogger.logError(`ParallelExecutor: Error terminating worker ${workerInfo.id}`, error as Error);
    }
    
    this.workers.delete(workerInfo.id);
  }

  private aggregateResults(): ExecutionResult {
    const features = new Map<string, FeatureResult>();
    const duration = Date.now() - this.startTime;

    for (const [, result] of this.results) {
      if (result.type === 'scenario') {
        const featureFile = result.featureFile || 'unknown';
        const featureResult = features.get(featureFile) || {
          id: `feature-${featureFile}-${Date.now()}`,
          feature: { name: featureFile } as Feature,
          scenarios: [] as ScenarioResult[],
          status: 'passed' as const,
          duration: 0,
          timestamp: new Date()
        } as FeatureResult;

        featureResult.scenarios.push(result.scenarioResult!);
        if (result.status === ScenarioStatus.FAILED) {
          featureResult.status = FeatureStatus.FAILED;
        }
        featureResult.duration += result.duration;

        features.set(featureFile, featureResult);
      }
    }

    const allScenarios = Array.from(this.results.values())
      .map(r => r.scenarioResult)
      .filter(Boolean) as ScenarioResult[];

    const passed = allScenarios.filter(s => s.status === 'passed').length;
    const failed = allScenarios.filter(s => s.status === 'failed').length;
    const skipped = allScenarios.filter(s => s.status === 'skipped').length;
    const pending = allScenarios.filter(s => s.status === 'skipped' || s.status === 'error').length;
    
    const summary: ExecutionSummary = {
      totalFeatures: features.size,
      totalScenarios: allScenarios.length,
      total: allScenarios.length,
      passed,
      failed,
      skipped,
      pending,
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      duration,
      parallel: true,
      workers: this.maxWorkers,
      passRate: allScenarios.length > 0 ? (passed / allScenarios.length) * 100 : 0
    };

    ActionLogger.logInfo('ParallelExecutor', 
      `Parallel execution completed: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);

    const endTime = new Date();
    const hasFailures = summary.failed > 0;
    
    return {
      features: Array.from(features.values()),
      summary,
      timestamp: endTime,
      startTime: new Date(this.startTime),
      endTime,
      duration,
      status: this.aborted ? ExecutionStatus.ABORTED : (hasFailures ? ExecutionStatus.FAILED : ExecutionStatus.PASSED),
      environment: ConfigurationManager.getEnvironmentName(),
      executionStats: this.executionStats
    };
  }

  private async cleanup(): Promise<void> {
    ActionLogger.logDebug('ParallelExecutor', 'Cleaning up parallel executor');

    const terminatePromises: Promise<void>[] = [];
    for (const workerInfo of this.workers.values()) {
      terminatePromises.push(this.terminateWorker(workerInfo));
    }
    await Promise.all(terminatePromises);

    if (this.browserPool) {
      await this.browserPool.drainPool();
    }

    this.workers.clear();
    this.workQueue = [];
    this.results.clear();
    this.activeWorkers = 0;
    this.completedItems = 0;
  }

  async abort(): Promise<void> {
    ActionLogger.logWarn('ParallelExecutor: Aborting parallel execution');
    this.aborted = true;
    await this.cleanup();
  }

  getProgress(): ExecutionProgress {
    return {
      totalItems: this.totalItems,
      completedItems: this.completedItems,
      percentage: this.totalItems > 0 ? (this.completedItems / this.totalItems) * 100 : 0,
      activeWorkers: this.executionStats.activeWorkers,
      duration: Date.now() - this.startTime,
      estimatedTimeRemaining: this.estimateTimeRemaining()
    };
  }

  private estimateTimeRemaining(): number {
    if (this.completedItems === 0) {
      return -1;
    }

    const avgTimePerItem = (Date.now() - this.startTime) / this.completedItems;
    const remainingItems = this.totalItems - this.completedItems;
    return Math.round(avgTimePerItem * remainingItems);
  }

  exportState(): any {
    return {
      workers: this.workers.size,
      maxWorkers: this.maxWorkers,
      activeWorkers: this.activeWorkers,
      workQueue: this.workQueue.length,
      completedItems: this.completedItems,
      totalItems: this.totalItems,
      results: this.results.size,
      executionStats: this.executionStats,
      progress: this.getProgress()
    };
  }
}

interface WorkerInfo {
  id: number;
  worker: Worker;
  status: WorkerStatus;
  currentWork: WorkItem | null;
  startTime: number;
  itemsProcessed: number;
  errors: number;
}

interface WorkItem {
  id: string;
  type: 'scenario' | 'feature';
  featureFile: string;
  scenario?: Scenario;
  scenarios?: Scenario[];
  priority: number;
  estimatedDuration: number;
}

interface ExecutionStats {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  completedWorkers: number;
  failedWorkers: number;
  workItemsProcessed: number;
  workItemsFailed: number;
  averageExecutionTime: number;
  workerUtilization: Map<number, number>;
}

interface ExecutionProgress {
  totalItems: number;
  completedItems: number;
  percentage: number;
  activeWorkers: number;
  duration: number;
  estimatedTimeRemaining: number;
}
