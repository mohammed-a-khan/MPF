import { EventEmitter } from 'events';
import { Feature, Scenario, Step, ExecutionResult } from '../types/bdd.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { MetricsCollector } from '../../reporting/collectors/MetricsCollector';
import { PerformanceCollector } from '../../reporting/collectors/PerformanceCollector';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { CLIReporter } from '../../core/cli/CLIReporter';
import { WebSocketServer } from 'ws';
import * as os from 'os';

/**
 * Monitors test execution progress in real-time
 * Provides live updates, metrics collection, and progress reporting
 */
export class ExecutionMonitor extends EventEmitter {
  private static instance: ExecutionMonitor;
  private startTime: number;
  private features: Map<string, FeatureProgress>;
  private scenarios: Map<string, ScenarioProgress>;
  private steps: Map<string, StepProgress>;
  private currentFeature?: Feature;
  private currentScenario?: Scenario;
  private currentStep?: Step;
  private metricsCollector: MetricsCollector;
  private performanceCollector: PerformanceCollector;
  private cliReporter?: CLIReporter;
  private wsServer?: WebSocketServer;
  private systemMetrics: SystemMetrics;
  private executionState: ExecutionState;
  private updateInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.startTime = 0;
    this.features = new Map();
    this.scenarios = new Map();
    this.steps = new Map();
    this.metricsCollector = MetricsCollector.getInstance();
    this.performanceCollector = PerformanceCollector.getInstance();
    this.systemMetrics = this.initializeSystemMetrics();
    this.executionState = 'idle';
    // Defer monitoring initialization to avoid blocking
    // this.initializeMonitoring();
  }

  static getInstance(): ExecutionMonitor {
    if (!ExecutionMonitor.instance) {
      ExecutionMonitor.instance = new ExecutionMonitor();
    }
    return ExecutionMonitor.instance;
  }

  /**
   * Initialize monitoring systems
   */
  private initializeMonitoring(): void {
    const logger = ActionLogger.getInstance();
    
    // Initialize CLI reporter if in interactive mode
    const isInteractive = process.stdout.isTTY && !process.env['CI'];
    if (isInteractive && !process.env['CS_NO_CLI']) {
      try {
        // 🔥 FIX: Temporarily disable CLI reporter to prevent memory leak
        // this.cliReporter = CLIReporter.getInstance();
        logger.info('ExecutionMonitor - CLI reporter disabled to prevent memory issues');
      } catch (error) {
        logger.warn('ExecutionMonitor - Failed to initialize CLI reporter: ' + (error as Error).message);
      }
    }

    // Initialize WebSocket server for dashboard
    if (process.env['CS_DASHBOARD'] === 'true') {
      try {
        this.initializeWebSocketServer();
      } catch (error) {
        logger.warn('ExecutionMonitor - Failed to initialize WebSocket server: ' + (error as Error).message);
      }
    }

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize system metrics
   */
  private initializeSystemMetrics(): SystemMetrics {
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
      platform: os.platform(),
      nodeVersion: process.version,
      processUptime: process.uptime()
    };
  }

  /**
   * Initialize WebSocket server for live dashboard
   */
  private initializeWebSocketServer(): void {
    const port = ConfigurationManager.getInt('DASHBOARD_PORT', 3001);
    
    this.wsServer = new WebSocketServer({ port });
    
    this.wsServer.on('connection', (ws: any) => {
      const logger = ActionLogger.getInstance();
      logger.debug('ExecutionMonitor - Dashboard client connected');
      
      // Send current state to new client
      ws.send(JSON.stringify({
        type: 'state',
        data: this.getExecutionSnapshot()
      }));

      ws.on('message', (message: any) => {
        this.handleDashboardMessage(ws, message.toString());
      });

      ws.on('close', () => {
        const logger = ActionLogger.getInstance();
        logger.debug('ExecutionMonitor - Dashboard client disconnected');
      });
    });

    const logger = ActionLogger.getInstance();
    logger.info(`ExecutionMonitor - Live dashboard server started on port ${port}`);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen to execution events
    this.on('executionStart', this.handleExecutionStart.bind(this));
    this.on('executionEnd', this.handleExecutionEnd.bind(this));
    this.on('featureStart', this.handleFeatureStart.bind(this));
    this.on('featureEnd', this.handleFeatureEnd.bind(this));
    this.on('scenarioStart', this.handleScenarioStart.bind(this));
    this.on('scenarioEnd', this.handleScenarioEnd.bind(this));
    this.on('stepStart', this.handleStepStart.bind(this));
    this.on('stepEnd', this.handleStepEnd.bind(this));
  }

  /**
   * Start monitoring execution
   */
  startMonitoring(): void {
    // Initialize monitoring on first use if not already done
    if (!this.cliReporter && !this.wsServer) {
      this.initializeMonitoring();
    }
    
    const logger = ActionLogger.getInstance();
    logger.info('ExecutionMonitor - Starting execution monitoring');
    
    this.startTime = Date.now();
    this.executionState = 'running';
    
    // Start progress updates
    this.updateInterval = setInterval(() => {
      this.updateProgress();
    }, 1000); // Update every second

    // Start system metrics collection
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Collect every 5 seconds

    // Notify listeners
    this.emit('monitoringStarted');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    const logger = ActionLogger.getInstance();
    logger.info('ExecutionMonitor - Stopping execution monitoring');
    
    this.executionState = 'completed';
    
    // Clear intervals
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined as any;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined as any;
    }

    // Close WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
    }

    // Generate final report
    this.generateFinalReport();

    // Notify listeners
    this.emit('monitoringStopped');
  }

  /**
   * Handle execution start
   */
  private handleExecutionStart(data: { totalFeatures: number; totalScenarios: number }): void {
    const logger = ActionLogger.getInstance();
    logger.info(`ExecutionMonitor - Execution started: ${data.totalFeatures} features, ${data.totalScenarios} scenarios`);
    
    this.startTime = Date.now();
    this.executionState = 'running';
    
    if (this.cliReporter) {
      // CLI reporter start execution - method not available
      // this.cliReporter.startExecution(data.totalScenarios);
    }

    this.broadcastUpdate({
      type: 'executionStart',
      data
    });
  }

  /**
   * Handle execution end
   */
  private handleExecutionEnd(result: ExecutionResult): void {
    const duration = Date.now() - this.startTime;
    
    const logger = ActionLogger.getInstance();
    logger.info(`ExecutionMonitor - Execution completed in ${duration}ms: ${result.summary.passed} passed, ${result.summary.failed} failed`);
    
    this.executionState = 'completed';
    
    if (this.cliReporter) {
      this.cliReporter.endExecution(result.summary);
    }

    this.broadcastUpdate({
      type: 'executionEnd',
      data: result
    });
  }

  /**
   * Handle feature start
   */
  private handleFeatureStart(feature: Feature): void {
    const logger = ActionLogger.getInstance();
    logger.info(`ExecutionMonitor - Feature: ${feature.name}`);
    
    this.currentFeature = feature;
    this.features.set(feature.name, {
      feature,
      status: 'running',
      startTime: Date.now(),
      scenarios: new Map(),
      totalScenarios: feature.scenarios.length,
      completedScenarios: 0,
      passedScenarios: 0,
      failedScenarios: 0
    });

    if (this.cliReporter) {
      this.cliReporter.startFeature(feature);
    }

    this.broadcastUpdate({
      type: 'featureStart',
      data: feature
    });
  }

  /**
   * Handle feature end
   */
  private handleFeatureEnd(data: { feature: Feature; duration: number; status: string }): void {
    const progress = this.features.get(data.feature.name);
    if (progress) {
      progress.status = data.status as any;
      progress.duration = data.duration;
      progress.endTime = Date.now();
    }

    if (this.cliReporter) {
      this.cliReporter.endFeature(data.feature, data.status);
    }

    this.broadcastUpdate({
      type: 'featureEnd',
      data
    });
  }

  /**
   * Handle scenario start
   */
  private handleScenarioStart(scenario: Scenario): void {
    const logger = ActionLogger.getInstance();
    logger.info(`ExecutionMonitor - Scenario: ${scenario.name}`);
    
    this.currentScenario = scenario;
    const scenarioId = this.getScenarioId(scenario);
    
    this.scenarios.set(scenarioId, {
      scenario,
      status: 'running',
      startTime: Date.now(),
      steps: new Map(),
      totalSteps: scenario.steps.length,
      completedSteps: 0,
      passedSteps: 0,
      failedSteps: 0
    });

    // Update feature progress
    const featureProgress = this.features.get(this.currentFeature?.name || '');
    if (featureProgress) {
      featureProgress.scenarios.set(scenarioId, 'running');
    }

    if (this.cliReporter) {
      this.cliReporter.startScenario(scenario);
    }

    this.broadcastUpdate({
      type: 'scenarioStart',
      data: scenario
    });
  }

  /**
   * Handle scenario end
   */
  private handleScenarioEnd(data: { scenario: Scenario; duration: number; status: string }): void {
    const scenarioId = this.getScenarioId(data.scenario);
    const progress = this.scenarios.get(scenarioId);
    
    if (progress) {
      progress.status = data.status as any;
      progress.duration = data.duration;
      progress.endTime = Date.now();
    }

    // Update feature progress
    const featureProgress = this.features.get(this.currentFeature?.name || '');
    if (featureProgress) {
      featureProgress.completedScenarios++;
      if (data.status === 'passed') {
        featureProgress.passedScenarios++;
      } else if (data.status === 'failed') {
        featureProgress.failedScenarios++;
      }
      featureProgress.scenarios.set(scenarioId, data.status);
    }

    if (this.cliReporter) {
      this.cliReporter.endScenario(data.scenario, data.status);
    }

    this.broadcastUpdate({
      type: 'scenarioEnd',
      data
    });
  }

  /**
   * Handle step start
   */
  private handleStepStart(step: Step): void {
    const logger = ActionLogger.getInstance();
    logger.info(`ExecutionMonitor - Step: ${step.keyword} ${step.text}`);
    
    this.currentStep = step;
    const stepId = this.getStepId(step);
    
    this.steps.set(stepId, {
      step,
      status: 'running',
      startTime: Date.now()
    });

    // Update scenario progress
    const scenarioId = this.getScenarioId(this.currentScenario!);
    const scenarioProgress = this.scenarios.get(scenarioId);
    if (scenarioProgress) {
      scenarioProgress.steps.set(stepId, 'running');
    }

    if (this.cliReporter) {
      this.cliReporter.startStep(step);
    }

    this.broadcastUpdate({
      type: 'stepStart',
      data: step
    });
  }

  /**
   * Handle step end
   */
  private handleStepEnd(data: { step: Step; duration: number; status: string; error?: Error }): void {
    const stepId = this.getStepId(data.step);
    const progress = this.steps.get(stepId);
    
    if (progress) {
      progress.status = data.status as any;
      progress.duration = data.duration;
      progress.endTime = Date.now();
      if (data.error) {
        progress.error = data.error;
      }
    }

    // Update scenario progress
    const scenarioId = this.getScenarioId(this.currentScenario!);
    const scenarioProgress = this.scenarios.get(scenarioId);
    if (scenarioProgress) {
      scenarioProgress.completedSteps++;
      if (data.status === 'passed') {
        scenarioProgress.passedSteps++;
      } else if (data.status === 'failed') {
        scenarioProgress.failedSteps++;
      }
      scenarioProgress.steps.set(stepId, data.status);
    }

    if (this.cliReporter) {
      this.cliReporter.endStep(data.step, data.status, data.error);
    }

    this.broadcastUpdate({
      type: 'stepEnd',
      data
    });
  }

  /**
   * Update progress
   */
  private updateProgress(): void {
    const progress = this.calculateProgress();
    
    // Update CLI reporter
    if (this.cliReporter) {
      this.cliReporter.updateProgress(progress);
    }

    // Broadcast to dashboard
    this.broadcastUpdate({
      type: 'progress',
      data: progress
    });

    // Emit progress event
    this.emit('progress', progress);
  }

  /**
   * Calculate execution progress
   */
  private calculateProgress(): ExecutionProgress {
    let totalFeatures = 0;
    let completedFeatures = 0;
    let totalScenarios = 0;
    let completedScenarios = 0;
    let passedScenarios = 0;
    let failedScenarios = 0;
    let totalSteps = 0;
    let completedSteps = 0;
    let passedSteps = 0;
    let failedSteps = 0;

    // Aggregate feature progress
    for (const feature of Array.from(this.features.values())) {
      totalFeatures++;
      if (feature.status !== 'running') {
        completedFeatures++;
      }
      totalScenarios += feature.totalScenarios;
      completedScenarios += feature.completedScenarios;
      passedScenarios += feature.passedScenarios;
      failedScenarios += feature.failedScenarios;
    }

    // Aggregate scenario progress
    for (const scenario of Array.from(this.scenarios.values())) {
      totalSteps += scenario.totalSteps;
      completedSteps += scenario.completedSteps;
      passedSteps += scenario.passedSteps;
      failedSteps += scenario.failedSteps;
    }

    const duration = Date.now() - this.startTime;
    const percentage = totalScenarios > 0 ? (completedScenarios / totalScenarios) * 100 : 0;

    const progress: ExecutionProgress = {
      totalFeatures,
      completedFeatures,
      totalScenarios,
      completedScenarios,
      passedScenarios,
      failedScenarios,
      totalSteps,
      completedSteps,
      passedSteps,
      failedSteps,
      duration,
      percentage,
      estimatedTimeRemaining: this.estimateTimeRemaining(percentage, duration),
      executionRate: completedScenarios > 0 ? completedScenarios / (duration / 1000) : 0
    };
    
    if (this.currentFeature?.name) {
      progress.currentFeature = this.currentFeature.name;
    }
    if (this.currentScenario?.name) {
      progress.currentScenario = this.currentScenario.name;
    }
    if (this.currentStep?.text) {
      progress.currentStep = this.currentStep.text;
    }
    
    return progress;
  }

  /**
   * Estimate time remaining
   */
  private estimateTimeRemaining(percentage: number, duration: number): number {
    if (percentage === 0 || percentage === 100) {
      return 0;
    }
    
    const estimatedTotal = (duration / percentage) * 100;
    return Math.round(estimatedTotal - duration);
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    
    this.systemMetrics = {
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // Convert to MB
      totalMemory: os.totalmem() / 1024 / 1024,
      freeMemory: os.freemem() / 1024 / 1024,
      loadAverage: os.loadavg(),
      platform: os.platform(),
      nodeVersion: process.version,
      processUptime: process.uptime()
    };

    // Collect performance metrics
    this.performanceCollector.collectSystemMetrics(this.systemMetrics);
  }

  /**
   * Get execution snapshot
   */
  getExecutionSnapshot(): ExecutionSnapshot {
    const progress = this.calculateProgress();
    
    return {
      state: this.executionState,
      startTime: this.startTime,
      progress,
      systemMetrics: this.systemMetrics,
      features: Array.from(this.features.values()),
      currentExecution: {
        ...(this.currentFeature && { feature: this.currentFeature }),
        ...(this.currentScenario && { scenario: this.currentScenario }),
        ...(this.currentStep && { step: this.currentStep })
      }
    };
  }

  /**
   * Handle dashboard message
   */
  private handleDashboardMessage(ws: any, message: string): void {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'getSnapshot':
          ws.send(JSON.stringify({
            type: 'snapshot',
            data: this.getExecutionSnapshot()
          }));
          break;
          
        case 'getMetrics':
          ws.send(JSON.stringify({
            type: 'metrics',
            data: {
              system: this.systemMetrics,
              performance: this.performanceCollector.getMetrics(),
              execution: this.metricsCollector.getMetrics()
            }
          }));
          break;
          
        case 'pause':
          this.emit('pauseRequested');
          break;
          
        case 'resume':
          this.emit('resumeRequested');
          break;
          
        case 'abort':
          this.emit('abortRequested');
          break;
          
        default:
          const logger = ActionLogger.getInstance();
          logger.warn(`ExecutionMonitor - Unknown dashboard message type: ${msg.type}`);
      }
    } catch (error) {
      const logger = ActionLogger.getInstance();
      logger.error('ExecutionMonitor - Error handling dashboard message: ' + (error as Error).message);
    }
  }

  /**
   * Broadcast update to all dashboard clients
   */
  private broadcastUpdate(update: any): void {
    if (!this.wsServer) return;
    
    const message = JSON.stringify(update);
    
    this.wsServer.clients.forEach((client: any) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  /**
   * Generate final execution report
   */
  private generateFinalReport(): void {
    const snapshot = this.getExecutionSnapshot();
    
    const logger = ActionLogger.getInstance();
    logger.info('ExecutionMonitor - === Execution Summary ===');
    logger.info(`ExecutionMonitor - Total Duration: ${snapshot.progress.duration}ms`);
    logger.info(`ExecutionMonitor - Features: ${snapshot.progress.completedFeatures}/${snapshot.progress.totalFeatures}`);
    logger.info(`ExecutionMonitor - Scenarios: ${snapshot.progress.completedScenarios}/${snapshot.progress.totalScenarios}`);
    logger.info(`ExecutionMonitor -   Passed: ${snapshot.progress.passedScenarios}`);
    logger.info(`ExecutionMonitor -   Failed: ${snapshot.progress.failedScenarios}`);
    logger.info(`ExecutionMonitor - Steps: ${snapshot.progress.completedSteps}/${snapshot.progress.totalSteps}`);
    logger.info(`ExecutionMonitor -   Passed: ${snapshot.progress.passedSteps}`);
    logger.info(`ExecutionMonitor -   Failed: ${snapshot.progress.failedSteps}`);
    logger.info(`ExecutionMonitor - Execution Rate: ${snapshot.progress.executionRate.toFixed(2)} scenarios/second`);
    logger.info('ExecutionMonitor - ========================');
  }

  /**
   * Get scenario ID
   */
  private getScenarioId(scenario?: Scenario): string {
    return `${this.currentFeature?.name || 'unknown'}::${scenario?.name || 'unknown'}`;
  }

  /**
   * Get step ID
   */
  private getStepId(step: Step): string {
    return `${this.getScenarioId(this.currentScenario)}::${step.line || 'unknown'}`;
  }

  /**
   * Export monitor state
   */
  exportState(): any {
    return {
      executionSnapshot: this.getExecutionSnapshot(),
      configuration: {
        cliReporterEnabled: !!this.cliReporter,
        dashboardEnabled: !!this.wsServer,
        updateInterval: 1000,
        metricsInterval: 5000
      }
    };
  }
}

// Interfaces
interface FeatureProgress {
  feature: Feature;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime?: number;
  duration?: number;
  scenarios: Map<string, string>;
  totalScenarios: number;
  completedScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
}

interface ScenarioProgress {
  scenario: Scenario;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime?: number;
  duration?: number;
  steps: Map<string, string>;
  totalSteps: number;
  completedSteps: number;
  passedSteps: number;
  failedSteps: number;
}

interface StepProgress {
  step: Step;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: Error;
}

interface ExecutionProgress {
  totalFeatures: number;
  completedFeatures: number;
  totalScenarios: number;
  completedScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  totalSteps: number;
  completedSteps: number;
  passedSteps: number;
  failedSteps: number;
  duration: number;
  percentage: number;
  estimatedTimeRemaining: number;
  currentFeature?: string;
  currentScenario?: string;
  currentStep?: string;
  executionRate: number;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  freeMemory: number;
  loadAverage: number[];
  platform: string;
  nodeVersion: string;
  processUptime: number;
}

interface ExecutionSnapshot {
  state: ExecutionState;
  startTime: number;
  progress: ExecutionProgress;
  systemMetrics: SystemMetrics;
  features: FeatureProgress[];
  currentExecution: {
    feature?: Feature;
    scenario?: Scenario;
    step?: Step;
  };
}

type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'aborted';