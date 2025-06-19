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

/**
 * Manages parallel test execution across multiple worker threads
 * Distributes tests, manages workers, and aggregates results
 */
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

  /**
   * Execute test plan in parallel
   */
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    ActionLogger.logInfo('ParallelExecutor', 
      `Starting parallel execution with ${this.maxWorkers} workers`);

    this.startTime = Date.now();
    this.aborted = false;

    try {
      // Initialize browser pool if UI tests
      if (this.requiresBrowserPool(plan)) {
        await this.initializeBrowserPool();
      }

      // Create work items from execution plan
      this.createWorkItems(plan);
      this.totalItems = this.workQueue.length;

      ActionLogger.logInfo('ParallelExecutor', 
        `Created ${this.totalItems} work items for execution`);

      // Create worker pool
      await this.createWorkerPool();

      // Start processing work items
      await this.processWorkQueue();

      // Wait for all workers to complete
      await this.waitForCompletion();

      // Aggregate and return results
      return this.aggregateResults();

    } catch (error) {
      ActionLogger.logError('ParallelExecutor: Parallel execution failed', error as Error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Calculate maximum number of workers
   */
  private calculateMaxWorkers(): number {
    const configured = ConfigurationManager.getInt('MAX_PARALLEL_WORKERS', 0);
    if (configured > 0) {
      return configured;
    }

    // Default to CPU count - 1 (leave one for main thread)
    const cpuCount = os.cpus().length;
    return Math.max(1, cpuCount - 1);
  }

  /**
   * Initialize execution statistics
   */
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

  /**
   * Check if browser pool is required
   */
  private requiresBrowserPool(plan: ExecutionPlan): boolean {
    return plan.scenarios.some((scenario: Scenario) => 
      !scenario.tags?.includes('@api') && !scenario.tags?.includes('@database')
    );
  }

  /**
   * DISABLED: Browser pool initialization to prevent multiple browser instances
   */
  private async initializeBrowserPool(): Promise<void> {
    ActionLogger.logInfo('ParallelExecutor', 'Browser pool disabled - using single browser only');
    // CRITICAL FIX: Browser pool completely disabled to prevent multiple browser instances
    // For parallel execution, we'll use single browser with multiple contexts instead
  }

  /**
   * Create work items from execution plan
   */
  private createWorkItems(plan: ExecutionPlan): void {
    // Group scenarios by feature for better resource utilization
    const featureGroups = new Map<string, Scenario[]>();

    for (const scenario of plan.scenarios) {
      const featureId = scenario.featureFile || 'unknown';
      const scenarios = featureGroups.get(featureId) || [];
      scenarios.push(scenario);
      featureGroups.set(featureId, scenarios);
    }

    // Create work items
    let itemId = 0;
    for (const [featureFile, scenarios] of featureGroups) {
      // Option 1: One work item per scenario (fine-grained)
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
        // Option 2: One work item per feature (coarse-grained)
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

    // Sort work queue by priority (highest first)
    this.workQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate scenario priority
   */
  private calculatePriority(scenario: Scenario): number {
    let priority = 50; // Base priority

    // Critical scenarios get highest priority
    if (scenario.tags?.includes('@critical')) priority += 40;
    if (scenario.tags?.includes('@smoke')) priority += 30;
    if (scenario.tags?.includes('@regression')) priority += 20;
    
    // Fast scenarios get higher priority (quick wins)
    if (scenario.tags?.includes('@fast')) priority += 10;
    
    // Flaky tests get lower priority
    if (scenario.tags?.includes('@flaky')) priority -= 20;

    return priority;
  }

  /**
   * Calculate feature priority
   */
  private calculateFeaturePriority(scenarios: Scenario[]): number {
    const priorities = scenarios.map(s => this.calculatePriority(s));
    return Math.max(...priorities);
  }

  /**
   * Estimate scenario duration
   */
  private estimateDuration(scenario: Scenario): number {
    // Use historical data if available
    const historicalDuration = this.getHistoricalDuration(scenario);
    if (historicalDuration > 0) {
      return historicalDuration;
    }

    // Otherwise estimate based on steps
    const baseTime = 1000; // 1 second base
    const perStepTime = 500; // 500ms per step
    return baseTime + (scenario.steps.length * perStepTime);
  }

  /**
   * Estimate feature duration
   */
  private estimateFeatureDuration(scenarios: Scenario[]): number {
    return scenarios.reduce((total, scenario) => 
      total + this.estimateDuration(scenario), 0
    );
  }

  /**
   * Get historical duration for scenario
   */
  private getHistoricalDuration(_scenario: Scenario): number {
    // In a real implementation, this would query historical test data
    return 0;
  }

  /**
   * Create worker pool
   */
  private async createWorkerPool(): Promise<void> {
    ActionLogger.logInfo('ParallelExecutor', `Creating ${this.maxWorkers} workers`);

    const workerPromises: Promise<void>[] = [];

    for (let i = 0; i < this.maxWorkers; i++) {
      workerPromises.push(this.createWorker());
    }

    await Promise.all(workerPromises);
    this.executionStats.totalWorkers = this.workers.size;
  }

  /**
   * Create a single worker
   */
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

  /**
   * Setup worker event handlers
   */
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

  /**
   * Handle worker message
   */
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

  /**
   * Handle worker ready
   */
  private handleWorkerReady(workerInfo: WorkerInfo): void {
    workerInfo.status = 'idle';
    this.assignWork(workerInfo);
  }

  /**
   * Handle worker progress
   */
  private handleWorkerProgress(workerInfo: WorkerInfo, message: WorkerMessage): void {
    this.emit('progress', {
      workerId: workerInfo.id,
      workItem: workerInfo.currentWork,
      progress: message.data
    });
  }

  /**
   * Handle worker result
   */
  private handleWorkerResult(workerInfo: WorkerInfo, message: WorkerMessage): void {
    const result = message.data as WorkerResult;
    
    // Store result
    if (workerInfo.currentWork) {
      this.results.set(workerInfo.currentWork.id, result);
      this.completedItems++;
      workerInfo.itemsProcessed++;
      
      // Update statistics
      if (result.status === 'failed') {
        this.executionStats.workItemsFailed++;
      }
      this.executionStats.workItemsProcessed++;
      
      ActionLogger.logInfo('ParallelExecutor', 
        `Work item ${workerInfo.currentWork.id} completed by worker ${workerInfo.id}`);
      
      // Emit progress event
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

    // Mark worker as idle and assign new work
    workerInfo.status = 'idle';
    workerInfo.currentWork = null;
    this.assignWork(workerInfo);
  }

  /**
   * Handle worker error message
   */
  private handleWorkerErrorMessage(workerInfo: WorkerInfo, message: WorkerMessage): void {
    ActionLogger.logError(`ParallelExecutor: Worker ${workerInfo.id} reported error`, message.data as Error);
    
    workerInfo.errors++;
    
    // If too many errors, terminate worker
    if (workerInfo.errors > 3) {
      this.terminateWorker(workerInfo);
      this.createWorker(); // Replace with new worker
    }
  }

  /**
   * Handle worker log
   */
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

  /**
   * Handle worker error
   */
  private handleWorkerError(workerInfo: WorkerInfo, _error: Error): void {
    workerInfo.status = 'error';
    this.executionStats.failedWorkers++;
    
    // Reassign current work
    if (workerInfo.currentWork) {
      this.workQueue.unshift(workerInfo.currentWork);
    }
    
    // Replace worker
    this.workers.delete(workerInfo.id);
    this.createWorker();
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(workerInfo: WorkerInfo, code: number): void {
    this.workers.delete(workerInfo.id);
    this.executionStats.completedWorkers++;
    
    if (code !== 0 && workerInfo.currentWork) {
      // Worker crashed, reassign work
      this.workQueue.unshift(workerInfo.currentWork);
    }
    
    // Create replacement worker if needed
    if (this.workQueue.length > 0 && !this.aborted) {
      this.createWorker();
    }
  }

  /**
   * Process work queue
   */
  private async processWorkQueue(): Promise<void> {
    // Initial work assignment
    for (const workerInfo of this.workers.values()) {
      this.assignWork(workerInfo);
    }
  }

  /**
   * Assign work to worker
   */
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

    // Send work to worker
    workerInfo.worker.postMessage({
      type: 'execute',
      workItem
    });

    // Update statistics
    this.updateWorkerStats();
  }

  /**
   * Wait for all workers to complete
   */
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

  /**
   * Update worker statistics
   */
  private updateWorkerStats(): void {
    let active = 0;
    let idle = 0;

    for (const workerInfo of this.workers.values()) {
      if (workerInfo.status === 'busy') {
        active++;
      } else if (workerInfo.status === 'idle') {
        idle++;
      }

      // Calculate utilization
      const utilization = (workerInfo.itemsProcessed / this.totalItems) * 100;
      this.executionStats.workerUtilization.set(workerInfo.id, utilization);
    }

    this.executionStats.activeWorkers = active;
    this.executionStats.idleWorkers = idle;
  }

  /**
   * Terminate worker
   */
  private async terminateWorker(workerInfo: WorkerInfo): Promise<void> {
    try {
      await workerInfo.worker.terminate();
    } catch (error) {
      ActionLogger.logError(`ParallelExecutor: Error terminating worker ${workerInfo.id}`, error as Error);
    }
    
    this.workers.delete(workerInfo.id);
  }

  /**
   * Aggregate results
   */
  private aggregateResults(): ExecutionResult {
    const features = new Map<string, FeatureResult>();
    const duration = Date.now() - this.startTime;

    // Group results by feature
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

    // Calculate summary
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

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    ActionLogger.logDebug('ParallelExecutor', 'Cleaning up parallel executor');

    // Terminate all workers
    const terminatePromises: Promise<void>[] = [];
    for (const workerInfo of this.workers.values()) {
      terminatePromises.push(this.terminateWorker(workerInfo));
    }
    await Promise.all(terminatePromises);

    // Cleanup browser pool
    if (this.browserPool) {
      await this.browserPool.drainPool();
    }

    // Clear state
    this.workers.clear();
    this.workQueue = [];
    this.results.clear();
    this.activeWorkers = 0;
    this.completedItems = 0;
  }

  /**
   * Abort execution
   */
  async abort(): Promise<void> {
    ActionLogger.logWarn('ParallelExecutor: Aborting parallel execution');
    this.aborted = true;
    await this.cleanup();
  }

  /**
   * Get execution progress
   */
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

  /**
   * Estimate time remaining
   */
  private estimateTimeRemaining(): number {
    if (this.completedItems === 0) {
      return -1; // Unknown
    }

    const avgTimePerItem = (Date.now() - this.startTime) / this.completedItems;
    const remainingItems = this.totalItems - this.completedItems;
    return Math.round(avgTimePerItem * remainingItems);
  }

  /**
   * Export execution state
   */
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

// Interfaces
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