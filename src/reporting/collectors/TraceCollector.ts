/**
 * Trace Collector
 * Captures Chrome DevTools Protocol traces for performance analysis
 * Includes screenshots, performance metrics, and execution timeline
 */

import { Page, CDPSession } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { performance } from 'perf_hooks';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';
import {
  LongTask,
  UserTiming,
  CustomMetric,
  CollectorOptions
} from '../types/reporting.types';

// Define trace-specific types
export interface TraceEvent {
  cat?: string;
  name?: string;
  ph?: string;
  pid?: number;
  tid?: number;
  ts?: number;
  dur?: number;
  args?: any;
  [key: string]: any;
}

export interface TraceSummary {
  duration: number;
  eventCount: number;
  processes: number;
  threads: number;
  screenshots: number;
  frames: number;
  [key: string]: any;
}

export interface TraceMetrics {
  paint?: any;
  navigation?: any;
  resource?: any;
  marks?: UserTiming[];
  measures?: UserTiming[];
  longTasks?: LongTask[];
  layoutShifts?: LayoutShift[];
  [key: string]: any;
}

export interface FrameMetrics {
  frameId: string;
  metrics: any;
}

export interface LayoutShift {
  score: number;
  sources: any[];
  timestamp: number;
  [key: string]: any;
}

export interface TraceAnalysis {
  summary: TraceSummary;
  metrics: TraceMetrics;
  performance: any;
  coverage?: CoverageData;
  [key: string]: any;
}

export interface TraceCollectorOptions extends CollectorOptions {
  categories?: string[];
  screenshots?: boolean;
  cpuProfile?: boolean;
  coverage?: boolean;
  memoryDump?: boolean;
  includeCoverage?: boolean;
  includeMemory?: boolean;
  includeCPUProfile?: boolean;
  customMetrics?: boolean;
  compressTraces?: boolean;
}

export interface TracingStartOptions {
  categories?: string[];
  options?: string;
  transferMode?: 'ReturnAsStream' | 'ReportEvents';
  streamFormat?: 'json' | 'proto';
  streamCompression?: 'none' | 'gzip';
  traceConfig?: TraceConfig;
  perfettoConfig?: any;
  tracingBackend?: string;
  screenshots?: boolean;
}

export interface TraceConfig {
  recordMode?: string;
  enableSampling?: boolean;
  enableSystrace?: boolean;
  enableArgumentFilter?: boolean;
  includedCategories?: string[];
  excludedCategories?: string[];
  syntheticDelays?: any[];
  memoryDumpConfig?: any;
}

export interface CPUProfile {
  nodes: any[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

export interface MemorySnapshot {
  timestamp: number;
  snapshot: any;
}

export interface CoverageData {
  js: {
    total: number;
    used: number;
    percentage: number;
    files: any[];
  };
  css: {
    total: number;
    used: number;
    percentage: number;
    files: any[];
  };
}

const gzipAsync = promisify(zlib.gzip);

// Define TraceData interface
interface TraceData {
  events: TraceEvent[];
  metadata?: any;
  startTime?: number;
  endTime?: number;
  scenarioId?: string;
  scenarioName?: string;
  screenshots?: Array<{
    timestamp: number;
    snapshot: any;
    stepId?: string;
  }>;
  metrics?: TraceMetrics;
  [key: string]: any;
}

export class TraceCollector {
  private static instance: TraceCollector;
  private evidencePath: string = './evidence/traces';
  private traces: Map<string, TraceData> = new Map();
  private cdpSessions: Map<string, CDPSession> = new Map();
  private tracingStarted: Map<string, boolean> = new Map();
  private options: TraceCollectorOptions = {} as TraceCollectorOptions;
  private customMetrics: Map<string, CustomMetric[]> = new Map();
  private userTimings: Map<string, UserTiming[]> = new Map();
  private coverageData: Map<string, CoverageData> = new Map();
  private currentSteps: Map<string, string> = new Map();
  private stepTraces: Map<string, Map<string, TraceEvent[]>> = new Map();

  private constructor() {}

  static getInstance(): TraceCollector {
    if (!TraceCollector.instance) {
      TraceCollector.instance = new TraceCollector();
    }
    return TraceCollector.instance;
  }

  async initialize(executionId: string, options: TraceCollectorOptions = {} as TraceCollectorOptions): Promise<void> {
    this.options = {
      screenshots: true,
      categories: [
        'devtools.timeline',
        'v8.execute',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'disabled-by-default-devtools.timeline.stack',
        'disabled-by-default-devtools.screenshot',
        'disabled-by-default-v8.cpu_profiler',
        'disabled-by-default-v8.cpu_profiler.hires'
      ],
      includeCoverage: true,
      includeMemory: true,
      includeCPUProfile: true,
      customMetrics: true,
      compressTraces: true,
      ...options
    };

    this.evidencePath = path.join('./evidence', executionId, 'traces');
    await FileUtils.ensureDir(this.evidencePath);

    this.traces.clear();
    this.cdpSessions.clear();
    this.tracingStarted.clear();
    this.customMetrics.clear();
    this.userTimings.clear();
    this.coverageData.clear();
    this.currentSteps.clear();
    this.stepTraces.clear();

    ActionLogger.logInfo('TraceCollector initialized', {
      executionId,
      options: this.options
    });
  }

  async collectForScenario(
    scenarioId: string,
    scenarioName: string,
    page: Page
  ): Promise<void> {
    const scenarioPath = path.join(this.evidencePath, scenarioId);
    await FileUtils.ensureDir(scenarioPath);

    try {
      // Create CDP session
      const client = await page.context().newCDPSession(page);
      this.cdpSessions.set(scenarioId, client);

      // Initialize trace data
      this.traces.set(scenarioId, {
        scenarioId,
        scenarioName,
        events: [],
        screenshots: [],
        metrics: this.createEmptyMetrics(),
        startTime: performance.now(),
        endTime: 0
      });

      // Initialize step traces
      this.stepTraces.set(scenarioId, new Map());

      // Enable necessary domains
      await this.enableDomains(client);

      // Start tracing
      await this.startTracing(client, scenarioId);

      // Start collecting metrics
      if (this.options.customMetrics) {
        await this.startMetricsCollection(page, scenarioId);
      }

      // Start coverage collection if enabled
      if (this.options.includeCoverage) {
        await this.startCoverageCollection(page, scenarioId);
      }

      ActionLogger.logInfo(`Trace collection started for scenario: ${scenarioName}`, {
        scenarioId,
        categories: this.options.categories
      });

    } catch (error) {
      ActionLogger.logError('Error starting trace collection', error as Error);
    }
  }

  async startStep(scenarioId: string, stepId: string): Promise<void> {
    this.currentSteps.set(scenarioId, stepId);
    
    // Mark step start in trace
    const client = this.cdpSessions.get(scenarioId);
    if (client) {
      await this.injectStepMarker(client, stepId, 'start');
    }

    // Initialize step trace storage
    const stepTraces = this.stepTraces.get(scenarioId);
    if (stepTraces) {
      stepTraces.set(stepId, []);
    }
  }

  async endStep(scenarioId: string, stepId: string): Promise<void> {
    // Mark step end in trace
    const client = this.cdpSessions.get(scenarioId);
    if (client) {
      await this.injectStepMarker(client, stepId, 'end');
    }

    // Clear current step
    if (this.currentSteps.get(scenarioId) === stepId) {
      this.currentSteps.delete(scenarioId);
    }
  }

  async collectForStep(
    scenarioId: string,
    stepId: string,
    stepText: string,
    status: 'passed' | 'failed' | 'skipped'
  ): Promise<string[]> {
    await this.startStep(scenarioId, stepId);
    await this.endStep(scenarioId, stepId);

    const stepPath = path.join(this.evidencePath, scenarioId, 'steps', stepId);
    await FileUtils.ensureDir(stepPath);

    const evidenceFiles: string[] = [];

    try {
      // Extract step-specific trace events
      const stepEvents = await this.extractStepEvents(scenarioId, stepId);
      
      if (stepEvents.length > 0) {
        // Generate step trace file
        const tracePath = path.join(stepPath, `${stepId}-trace.json`);
        const stepTrace = {
          stepId,
          stepText,
          status,
          events: stepEvents,
          metrics: this.analyzeStepTrace(stepEvents)
        };
        
        if (this.options.compressTraces) {
          const compressed = await gzipAsync(JSON.stringify(stepTrace));
          await fs.promises.writeFile(`${tracePath}.gz`, compressed);
          evidenceFiles.push(`${tracePath}.gz`);
        } else {
          await fs.promises.writeFile(tracePath, JSON.stringify(stepTrace, null, 2));
          evidenceFiles.push(tracePath);
        }

        // Generate performance analysis
        const analysisPath = path.join(stepPath, `${stepId}-performance.json`);
        const analysis = await this.analyzeStepPerformance(stepEvents);
        await fs.promises.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
        evidenceFiles.push(analysisPath);

        // Extract screenshots if any
        const screenshots = await this.extractStepScreenshots(stepEvents);
        if (screenshots.length > 0) {
          const screenshotsPath = path.join(stepPath, `${stepId}-screenshots.json`);
          await fs.promises.writeFile(screenshotsPath, JSON.stringify({
            stepId,
            screenshots
          }, null, 2));
          evidenceFiles.push(screenshotsPath);
        }
      }

      // Capture custom metrics for this step
      const stepMetrics = await this.captureStepMetrics(scenarioId, stepId);
      if (stepMetrics) {
        const metricsPath = path.join(stepPath, `${stepId}-metrics.json`);
        await fs.promises.writeFile(metricsPath, JSON.stringify(stepMetrics, null, 2));
        evidenceFiles.push(metricsPath);
      }

      ActionLogger.logInfo(`Trace evidence collected for step: ${stepText}`, {
        scenarioId,
        stepId,
        eventsCount: stepEvents.length,
        status
      });

    } catch (error) {
      ActionLogger.logError('Error collecting trace evidence for step', error as Error);
    }

    return evidenceFiles;
  }

  private async enableDomains(client: CDPSession): Promise<void> {
    // Enable Page domain for screenshots
    await client.send('Page.enable');

    // Enable Runtime domain for console and exceptions
    await client.send('Runtime.enable');

    // Enable Network domain
    await client.send('Network.enable');

    // Enable Performance domain for metrics
    await client.send('Performance.enable');

    // Enable HeapProfiler if memory profiling is enabled
    if (this.options.includeMemory) {
      await client.send('HeapProfiler.enable');
    }

    // Enable Profiler if CPU profiling is enabled
    if (this.options.includeCPUProfile) {
      await client.send('Profiler.enable');
      await client.send('Profiler.setSamplingInterval', { interval: 100 });
    }

    // Enable Coverage if enabled
    if (this.options.includeCoverage) {
      await client.send('Profiler.startPreciseCoverage', {
        callCount: true,
        detailed: true
      });
      await client.send('CSS.enable');
      await client.send('CSS.startRuleUsageTracking');
    }

    // Enable LayerTree for paint events
    await client.send('LayerTree.enable');

    // Enable DOM for DOM operations
    await client.send('DOM.enable');

    // Enable Overlay for highlighting
    await client.send('Overlay.enable');
  }

  private async startTracing(client: CDPSession, scenarioId: string): Promise<void> {
    const tracingOptions: TracingStartOptions = {
      categories: this.options.categories || [],
      options: 'sampling-frequency=10000'  // 10kHz sampling
    };

    if (this.options.screenshots) {
      tracingOptions.screenshots = true;
    }

    // Configure trace buffer
    await client.send('Tracing.start', {
      traceConfig: {
        recordMode: 'recordContinuously',
        enableSampling: true,
        enableSystrace: true,
        enableArgumentFilter: false,
        includedCategories: this.options.categories || [],
        excludedCategories: [],
        syntheticDelays: [],
        ...(this.options.includeMemory ? {
          memoryDumpConfig: {
            triggers: [
              { mode: 'detailed', periodic_interval_ms: 1000 }
            ]
          }
        } : {})
      } as any,
      streamFormat: 'json',
      streamCompression: 'none',
      bufferUsageReportingInterval: 1000
    });

    this.tracingStarted.set(scenarioId, true);

    // Set up event listeners
    client.on('Tracing.dataCollected', (params) => {
      this.handleTraceData(scenarioId, params.value);
    });

    client.on('Tracing.tracingComplete', (params) => {
      ActionLogger.logInfo('Tracing complete', {
        scenarioId,
        streamHandle: params.stream
      });
    });

    client.on('Tracing.bufferUsage', (params) => {
      if (params.percentFull && params.percentFull > 90) {
        ActionLogger.logWarn('Trace buffer nearly full', {
          scenarioId,
          percentFull: params.percentFull
        });
      }
    });
  }

  private handleTraceData(scenarioId: string, data: any[]): void {
    const traceData = this.traces.get(scenarioId);
    if (!traceData) return;

    const currentStep = this.currentSteps.get(scenarioId);

    for (const event of data) {
      // Add to main trace
      traceData.events.push(event);

      // Add to step trace if we have a current step
      if (currentStep) {
        const stepTraces = this.stepTraces.get(scenarioId);
        if (stepTraces) {
          const stepEvents = stepTraces.get(currentStep) || [];
          stepEvents.push(event);
          stepTraces.set(currentStep, stepEvents);
        }
      }

      // Extract screenshots
      if (event.name === 'Screenshot' && event.args && event.args.snapshot) {
        const screenshotData: any = {
          timestamp: event.ts,
          snapshot: event.args.snapshot
        };
        if (currentStep) {
          screenshotData.stepId = currentStep;
        }
        if (traceData.screenshots) {
          traceData.screenshots.push(screenshotData);
        } else {
          traceData.screenshots = [screenshotData];
        }
      }

      // Update metrics based on events
      if (traceData.metrics) {
        this.updateMetricsFromEvent(traceData.metrics, event);
      }
    }
  }

  private updateMetricsFromEvent(metrics: TraceMetrics, event: TraceEvent): void {
    // Frame metrics
    if (event.name === 'DrawFrame') {
      if (metrics['frames']) {
        (metrics['frames'] as any).total++;
        
        const duration = event.dur || 0;
        if (duration > 16666) { // Longer than 16.66ms (60fps)
          (metrics['frames'] as any).dropped++;
        }
      }
    }

    // Long tasks (>50ms)
    if (event.name === 'RunTask' && event.dur && event.dur > 50000) {
      if (metrics.longTasks) {
        metrics.longTasks.push({
          name: 'RunTask',
          entryType: 'longtask',
          startTime: event.ts || 0,
          duration: event.dur / 1000, // Convert to ms
          attribution: [{
            name: event.args?.data?.functionName || 'anonymous',
            entryType: 'script',
            startTime: event.ts || 0,
            duration: event.dur / 1000,
            containerType: 'window',
            containerSrc: event.args?.data?.scriptName || 'unknown',
            containerId: '',
            containerName: ''
          }]
        });
      }
    }

    // Layout shifts
    if (event.name === 'LayoutShift' && event.args && metrics.layoutShifts) {
      const shift: LayoutShift = {
        score: event.args.data?.score || 0,
        sources: event.args.data?.sources || [],
        timestamp: event.ts || 0
      };
      
      metrics.layoutShifts.push(shift);
      
      if (!event.args.data?.['hadRecentInput']) {
        const currentCLS = metrics['cumulativeLayoutShift'] || 0;
        (metrics as any)['cumulativeLayoutShift'] = currentCLS + shift.score;
      }
    }

    // Parse events
    if (event.name === 'ParseHTML' && event.dur) {
      const currentParseTime = metrics['parseTime'] || 0;
      (metrics as any)['parseTime'] = currentParseTime + (event.dur / 1000);
    }

    // Script execution
    if (event.name === 'EvaluateScript' && event.dur) {
      const currentScriptTime = metrics['scriptTime'] || 0;
      (metrics as any)['scriptTime'] = currentScriptTime + (event.dur / 1000);
    }

    // Layout time
    if (event.name === 'Layout' && event.dur) {
      const currentLayoutTime = metrics['layoutTime'] || 0;
      const currentLayoutCount = metrics['layoutCount'] || 0;
      (metrics as any)['layoutTime'] = currentLayoutTime + (event.dur / 1000);
      (metrics as any)['layoutCount'] = currentLayoutCount + 1;
    }

    // Paint time
    if (event.name === 'Paint' && event.dur) {
      const currentPaintTime = metrics['paintTime'] || 0;
      const currentPaintCount = metrics['paintCount'] || 0;
      (metrics as any)['paintTime'] = currentPaintTime + (event.dur / 1000);
      (metrics as any)['paintCount'] = currentPaintCount + 1;
    }

    // Style recalculation
    if (event.name === 'UpdateLayoutTree' && event.dur) {
      const currentStyleTime = metrics['styleTime'] || 0;
      const currentStyleCount = metrics['styleCount'] || 0;
      (metrics as any)['styleTime'] = currentStyleTime + (event.dur / 1000);
      (metrics as any)['styleCount'] = currentStyleCount + 1;
    }

    // First paint markers
    if (event.name === 'firstPaint' && !metrics['firstPaint']) {
      (metrics as any)['firstPaint'] = event.ts;
    }

    if (event.name === 'firstContentfulPaint' && !metrics['firstContentfulPaint']) {
      (metrics as any)['firstContentfulPaint'] = event.ts;
    }

    // Largest contentful paint
    if (event.name === 'largestContentfulPaint::Candidate') {
      (metrics as any)['largestContentfulPaint'] = event.ts;
      (metrics as any)['largestContentfulPaintSize'] = event.args?.data?.size || 0;
    }

    // User interactions
    if (event.name === 'EventDispatch') {
      const eventType = event.args?.data?.type;
      if (['click', 'tap', 'keydown', 'keyup'].includes(eventType)) {
        const currentInteractions = metrics['userInteractions'] || 0;
        (metrics as any)['userInteractions'] = currentInteractions + 1;
      }
    }

    // Resource timing
    if (event.name === 'ResourceSendRequest') {
      const currentResources = metrics['totalResources'] || 0;
      (metrics as any)['totalResources'] = currentResources + 1;
    }

    // JavaScript heap
    if (event.name === 'UpdateCounters' && event.args?.data?.jsHeapSizeUsed) {
      const currentHeapUsed = metrics['jsHeapUsed'] || 0;
      (metrics as any)['jsHeapUsed'] = Math.max(currentHeapUsed, event.args.data.jsHeapSizeUsed);
    }

    // DOM nodes
    if (event.name === 'UpdateCounters' && event.args?.data?.nodes) {
      const currentDomNodes = metrics['domNodes'] || 0;
      (metrics as any)['domNodes'] = Math.max(currentDomNodes, event.args.data.nodes);
    }
  }

  private async injectStepMarker(client: CDPSession, stepId: string, type: 'start' | 'end'): Promise<void> {
    try {
      // Inject a custom user timing mark
      await client.send('Runtime.evaluate', {
        expression: `performance.mark('step-${stepId}-${type}');`,
        includeCommandLineAPI: true
      });

      // Also inject a trace event
      await client.send('Runtime.evaluate', {
        expression: `console.timeStamp('Step ${stepId} ${type}');`,
        includeCommandLineAPI: true
      });
    } catch (error) {
      // Page might be navigating
    }
  }

  private async startMetricsCollection(page: Page, scenarioId: string): Promise<void> {
    const collectMetrics = async () => {
      try {
        const metrics = await page.evaluate(() => {
          const navigation = (performance as any).getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const paint = (performance as any).getEntriesByType('paint');
          const measures = (performance as any).getEntriesByType('measure');
          const marks = (performance as any).getEntriesByType('mark');

          return {
            navigation: navigation ? {
              domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
              loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
              domInteractive: navigation.domInteractive,
              domComplete: navigation.domComplete
            } : null,
            paint: paint.map((p: any) => ({
              name: p.name,
              startTime: p.startTime
            })),
            userTimings: {
              measures: measures.map((m: any) => ({
                name: m.name,
                startTime: m.startTime,
                duration: m.duration
              })),
              marks: marks.map((m: any) => ({
                name: m.name,
                startTime: m.startTime
              }))
            },
            memory: (performance as any).memory ? {
              usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
              totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
              jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
            } : null
          };
        });

        // Store user timings
        if (metrics.userTimings) {
          const timings = this.userTimings.get(scenarioId) || [];
          
          (metrics.userTimings.measures as any[]).forEach((measure: any) => {
            timings.push({
              name: measure.name,
              entryType: 'measure',
              startTime: measure.startTime,
              duration: measure.duration,
              detail: { timestamp: Date.now() }
            });
          });

          (metrics.userTimings.marks as any[]).forEach((mark: any) => {
            timings.push({
              name: mark.name,
              entryType: 'mark',
              startTime: mark.startTime,
              duration: 0,
              detail: { timestamp: Date.now() }
            });
          });

          this.userTimings.set(scenarioId, timings);
        }

        // Clear performance entries to avoid duplicates
        await page.evaluate(() => {
          performance.clearMarks();
          performance.clearMeasures();
        });

      } catch (error) {
        // Page might be closed
      }
    };

    // Collect metrics every second
    const interval = setInterval(collectMetrics, 1000);
    
    // Store interval for cleanup
    (page as any)._metricsInterval = interval;
    
    // Clear interval when page closes
    page.once('close', () => {
      clearInterval(interval);
    });

    // Collect initial metrics
    await collectMetrics();
  }

  private async startCoverageCollection(page: Page, scenarioId: string): Promise<void> {
    try {
      // Start JavaScript coverage
      await page.coverage.startJSCoverage();
      
      // Start CSS coverage
      await page.coverage.startCSSCoverage();

      ActionLogger.logInfo('Coverage collection started', { scenarioId });
    } catch (error) {
      ActionLogger.logError('Error starting coverage collection', error as Error);
    }
  }

  private async extractStepEvents(scenarioId: string, stepId: string): Promise<TraceEvent[]> {
    const stepTraces = this.stepTraces.get(scenarioId);
    if (!stepTraces) return [];

    const stepEvents = stepTraces.get(stepId) || [];
    
    // Also extract events based on step markers
    const traceData = this.traces.get(scenarioId);
    if (!traceData) return stepEvents;

    const startMarker = `step-${stepId}-start`;
    const endMarker = `step-${stepId}-end`;
    
    let startTime: number | null = null;
    let endTime: number | null = null;

    // Find step boundaries
    for (const event of traceData.events) {
      if (event.name === 'TimeStamp' && event.args?.data?.message?.includes(startMarker)) {
        startTime = event.ts ?? 0;
      }
      if (event.name === 'TimeStamp' && event.args?.data?.message?.includes(endMarker)) {
        endTime = event.ts ?? 0;
        break;
      }
    }

    if (startTime && endTime) {
      // Extract events within step boundaries
      const boundedEvents = traceData.events.filter(event => 
        (event.ts ?? 0) >= startTime! && (event.ts ?? 0) <= endTime!
      );
      
      // Merge with tracked events
      const allEvents = [...stepEvents, ...boundedEvents];
      
      // Remove duplicates based on timestamp and name
      const uniqueEvents = Array.from(
        new Map(allEvents.map(e => [`${e.ts}-${e.name}`, e])).values()
      );
      
      return uniqueEvents.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    }

    return stepEvents;
  }

  private analyzeStepTrace(events: TraceEvent[]): any {
    const metrics = {
      duration: 0,
      scriptTime: 0,
      layoutTime: 0,
      paintTime: 0,
      idleTime: 0,
      longTasks: [] as LongTask[],
      frameCount: 0,
      droppedFrames: 0
    };

    if (events.length === 0) return metrics;

    const startTime = Math.min(...events.map(e => e.ts ?? 0));
    const endTime = Math.max(...events.map(e => (e.ts ?? 0) + (e.dur || 0)));
    metrics.duration = (endTime - startTime) / 1000; // Convert to ms

    let busyTime = 0;

    for (const event of events) {
      const duration = event.dur ? event.dur / 1000 : 0;

      // Script execution
      if (['EvaluateScript', 'FunctionCall', 'RunMicrotasks'].includes(event.name ?? '')) {
        metrics.scriptTime += duration;
        busyTime += duration;
      }

      // Layout
      if (['Layout', 'UpdateLayoutTree', 'InvalidateLayout'].includes(event.name ?? '')) {
        metrics.layoutTime += duration;
        busyTime += duration;
      }

      // Paint
      if (['Paint', 'PaintImage', 'Rasterize'].includes(event.name ?? '')) {
        metrics.paintTime += duration;
        busyTime += duration;
      }

      // Long tasks
      if (event.name === 'RunTask' && duration > 50) {
        metrics.longTasks.push({
          name: 'RunTask',
          entryType: 'longtask',
          startTime: event.ts ?? 0,
          duration,
          attribution: [{
            name: event.args?.data?.functionName || 'anonymous',
            entryType: 'script',
            startTime: event.ts ?? 0,
            duration,
            containerType: 'window',
            containerSrc: event.args?.data?.scriptName || 'unknown',
            containerId: '',
            containerName: ''
          }]
        });
      }

      // Frames
      if (event.name === 'DrawFrame') {
        metrics.frameCount++;
        if (duration > 16.66) {
          metrics.droppedFrames++;
        }
      }
    }

    metrics.idleTime = Math.max(0, metrics.duration - busyTime);

    return metrics;
  }

  private async analyzeStepPerformance(events: TraceEvent[]): Promise<TraceAnalysis> {
    const analysis: TraceAnalysis = {
      summary: {
        duration: 0,
        eventCount: 0,
        processes: 0,
        threads: 0,
        screenshots: 0,
        frames: 0,
        totalTime: 0,
        scriptingTime: 0,
        renderingTime: 0,
        paintingTime: 0,
        idleTime: 0,
        longTaskTime: 0
      },
      metrics: {
        longTasks: [],
        layoutShifts: [],
        frameMetrics: {
          total: 0,
          dropped: 0,
          fps: 0,
          jank: 0
        },
        memoryMetrics: {
          peakJSHeapSize: 0,
          averageJSHeapSize: 0,
          totalAllocated: 0,
          totalFreed: 0
        },
        recommendations: []
      },
      performance: {}
    };

    if (events.length === 0) return analysis;

    const startTime = Math.min(...events.map(e => e.ts ?? 0));
    const endTime = Math.max(...events.map(e => (e.ts ?? 0) + (e.dur || 0)));
    (analysis.summary as any).totalTime = (endTime - startTime) / 1000;

    // Categorize time spent
    const timeByCategory = new Map<string, number>();
    const memorySnapshots: number[] = [];
    const frameDurations: number[] = [];

    for (const event of events) {
      const duration = event.dur ? event.dur / 1000 : 0;
      const category = this.categorizeEvent(event);
      
      timeByCategory.set(category, (timeByCategory.get(category) || 0) + duration);

      // Long tasks
      if (event.name === 'RunTask' && duration > 50) {
        const longTask: LongTask = {
          name: 'RunTask',
          entryType: 'longtask',
          startTime: event.ts ?? 0,
          duration,
          attribution: [{
            name: event.args?.data?.functionName || 'anonymous',
            entryType: 'script',
            startTime: event.ts ?? 0,
            duration,
            containerType: 'window',
            containerSrc: event.args?.data?.scriptName || 'unknown',
            containerId: '',
            containerName: ''
          }]
        };
        const longTasks = (analysis.metrics as any).longTasks || [];
        longTasks.push(longTask);
        (analysis.metrics as any).longTasks = longTasks;
        (analysis.summary as any).longTaskTime += duration;
      }

      // Layout shifts
      if (event.name === 'LayoutShift' && event.args?.data) {
        const layoutShifts = (analysis.metrics as any).layoutShifts || [];
        layoutShifts.push({
          score: event.args.data.score || 0,
          sources: event.args.data.sources || [],
          timestamp: event.ts ?? 0
        });
        (analysis.metrics as any).layoutShifts = layoutShifts;
      }

      // Frame metrics
      if (event.name === 'DrawFrame') {
        const frameMetrics = (analysis.metrics as any).frameMetrics || { total: 0, dropped: 0 };
        frameMetrics.total++;
        frameDurations.push(duration);
        
        if (duration > 16.66) {
          frameMetrics.dropped++;
        }
        (analysis.metrics as any).frameMetrics = frameMetrics;
      }

      // Memory metrics
      if (event.name === 'UpdateCounters' && event.args?.data?.jsHeapSizeUsed) {
        memorySnapshots.push(event.args.data.jsHeapSizeUsed);
      }
    }

    // Calculate summary times
    (analysis.summary as any).scriptingTime = timeByCategory.get('scripting') || 0;
    (analysis.summary as any).renderingTime = timeByCategory.get('rendering') || 0;
    (analysis.summary as any).paintingTime = timeByCategory.get('painting') || 0;
    (analysis.summary as any).idleTime = Math.max(0, 
      (analysis.summary as any).totalTime - 
      (analysis.summary as any).scriptingTime - 
      (analysis.summary as any).renderingTime - 
      (analysis.summary as any).paintingTime
    );

    // Calculate frame metrics
    if (frameDurations.length > 0) {
      const avgFrameDuration = frameDurations.reduce((a, b) => a + b, 0) / frameDurations.length;
      const frameMetrics = (analysis.metrics as any).frameMetrics || {};
      frameMetrics.fps = 1000 / avgFrameDuration;
      
      // Calculate jank (frame time variance)
      const variance = frameDurations.reduce((sum, duration) => {
        return sum + Math.pow(duration - avgFrameDuration, 2);
      }, 0) / frameDurations.length;
      frameMetrics.jank = Math.sqrt(variance);
      (analysis.metrics as any).frameMetrics = frameMetrics;
    }

    // Calculate memory metrics
    if (memorySnapshots.length > 0) {
      const memoryMetrics = (analysis.metrics as any).memoryMetrics || {};
      memoryMetrics.peakJSHeapSize = Math.max(...memorySnapshots);
      memoryMetrics.averageJSHeapSize = 
        memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
      (analysis.metrics as any).memoryMetrics = memoryMetrics;
    }

    // Generate recommendations
    this.generatePerformanceRecommendations(analysis);

    return analysis;
  }

  private categorizeEvent(event: TraceEvent): string {
    const scriptingEvents = [
      'EvaluateScript', 'FunctionCall', 'RunMicrotasks', 'V8.Execute',
      'v8.run', 'v8.compile', 'V8.ParseLazy', 'V8.CompileLazy'
    ];
    
    const renderingEvents = [
      'Layout', 'UpdateLayoutTree', 'InvalidateLayout', 'RecalculateStyles',
      'UpdateLayerTree', 'ScheduleStyleRecalculation'
    ];
    
    const paintingEvents = [
      'Paint', 'PaintImage', 'Rasterize', 'RasterTask', 'CompositeLayers',
      'GPUTask', 'DecodeImage', 'ResizeImage'
    ];

    if (scriptingEvents.includes(event.name ?? '')) return 'scripting';
    if (renderingEvents.includes(event.name ?? '')) return 'rendering';
    if (paintingEvents.includes(event.name ?? '')) return 'painting';
    
    return 'other';
  }


  private generatePerformanceRecommendations(analysis: TraceAnalysis): void {
    // Long task recommendations
    const longTasks = (analysis.metrics as any)?.longTasks || [];
    if (longTasks.length > 0) {
      const totalLongTaskTime = longTasks.reduce((sum: number, task: any) => sum + task.duration, 0);
      const percentage = (totalLongTaskTime / ((analysis.summary as any).totalTime || 1)) * 100;
      
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: percentage > 25 ? 'high' : 'medium',
        title: 'Long JavaScript tasks detected',
        description: `${longTasks.length} tasks took longer than 50ms, blocking the main thread for ${totalLongTaskTime.toFixed(0)}ms (${percentage.toFixed(1)}% of total time)`,
        impact: 'Long tasks block user interactions and make the page feel unresponsive',
        solution: 'Break up long tasks, use web workers, or defer non-critical work'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }

    // Layout shift recommendations
    const layoutShifts = (analysis.metrics as any)?.layoutShifts || [];
    const unstableShifts = layoutShifts.filter((shift: any) => !shift.hadRecentInput);
    if (unstableShifts.length > 0) {
      const totalShift = unstableShifts.reduce((sum: number, shift: any) => sum + (shift.score || 0), 0);
      
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'stability',
        severity: totalShift > 0.1 ? 'high' : 'medium',
        title: 'Layout instability detected',
        description: `Cumulative Layout Shift score: ${totalShift.toFixed(3)}`,
        impact: 'Unexpected layout shifts create a poor user experience',
        solution: 'Set explicit dimensions on images/videos, avoid inserting content above existing content'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }

    // Frame rate recommendations
    const frameMetrics = (analysis.metrics as any)?.frameMetrics;
    if (frameMetrics && frameMetrics.fps < 60 && frameMetrics.total > 0) {
      const dropRate = (frameMetrics.dropped / frameMetrics.total) * 100;
      
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: frameMetrics.fps < 30 ? 'high' : 'medium',
        title: 'Poor frame rate detected',
        description: `Average FPS: ${frameMetrics.fps.toFixed(1)}, ${dropRate.toFixed(1)}% frames dropped`,
        impact: 'Low frame rates make animations and scrolling feel janky',
        solution: 'Optimize animations, reduce paint complexity, use CSS transforms'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }

    // Scripting time recommendations
    const scriptingTime = (analysis.summary as any).scriptingTime || 0;
    const totalTime = (analysis.summary as any).totalTime || 1;
    const scriptingPercentage = (scriptingTime / totalTime) * 100;
    if (scriptingPercentage > 50) {
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: 'high',
        title: 'Excessive JavaScript execution time',
        description: `JavaScript consumed ${scriptingPercentage.toFixed(1)}% of total time`,
        impact: 'Heavy JavaScript execution blocks rendering and user interactions',
        solution: 'Optimize algorithms, reduce bundle size, lazy load non-critical scripts'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }

    // Memory recommendations
    const memoryMetrics = (analysis.metrics as any)?.memoryMetrics;
    if (memoryMetrics && memoryMetrics.peakJSHeapSize > 100 * 1024 * 1024) { // 100MB
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'memory',
        severity: 'medium',
        title: 'High memory usage detected',
        description: `Peak JS heap size: ${(memoryMetrics.peakJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        impact: 'High memory usage can cause performance issues and crashes on low-end devices',
        solution: 'Remove memory leaks, clear unused references, optimize data structures'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }
  }

  private async extractStepScreenshots(events: TraceEvent[]): Promise<any[]> {
    const screenshots = [];
    
    for (const event of events) {
      if (event.name === 'Screenshot' && event.args?.snapshot) {
        screenshots.push({
          timestamp: event.ts,
          data: event.args.snapshot,
          size: {
            width: event.args.snapshot.width || 0,
            height: event.args.snapshot.height || 0
          }
        });
      }
    }
    
    return screenshots;
  }

  private async captureStepMetrics(scenarioId: string, stepId: string): Promise<any> {
    const client = this.cdpSessions.get(scenarioId);
    if (!client) return null;

    try {
      // Get current performance metrics
      const perfMetrics = await client.send('Performance.getMetrics');
      
      // Get memory info
      let memoryInfo = null;
      if (this.options.includeMemory) {
        try {
          await client.send('HeapProfiler.collectGarbage');
          await client.send('HeapProfiler.getSamplingProfile');
          memoryInfo = {
            heapUsed: perfMetrics.metrics.find(m => m.name === 'JSHeapUsedSize')?.value || 0,
            heapTotal: perfMetrics.metrics.find(m => m.name === 'JSHeapTotalSize')?.value || 0,
            external: perfMetrics.metrics.find(m => m.name === 'JSExternalMemory')?.value || 0
          };
        } catch {
          // Heap profiler might not be available
        }
      }

      // Get layout metrics
      const layoutMetrics = await client.send('Page.getLayoutMetrics');

      return {
        stepId,
        timestamp: Date.now(),
        performance: {
          timestamp: perfMetrics.metrics.find(m => m.name === 'Timestamp')?.value || 0,
          documents: perfMetrics.metrics.find(m => m.name === 'Documents')?.value || 0,
          frames: perfMetrics.metrics.find(m => m.name === 'Frames')?.value || 0,
          jsEventListeners: perfMetrics.metrics.find(m => m.name === 'JSEventListeners')?.value || 0,
          nodes: perfMetrics.metrics.find(m => m.name === 'Nodes')?.value || 0,
          layoutCount: perfMetrics.metrics.find(m => m.name === 'LayoutCount')?.value || 0,
          recalcStyleCount: perfMetrics.metrics.find(m => m.name === 'RecalcStyleCount')?.value || 0,
          layoutDuration: perfMetrics.metrics.find(m => m.name === 'LayoutDuration')?.value || 0,
          recalcStyleDuration: perfMetrics.metrics.find(m => m.name === 'RecalcStyleDuration')?.value || 0,
          scriptDuration: perfMetrics.metrics.find(m => m.name === 'ScriptDuration')?.value || 0,
          taskDuration: perfMetrics.metrics.find(m => m.name === 'TaskDuration')?.value || 0,
          jsHeapUsedSize: perfMetrics.metrics.find(m => m.name === 'JSHeapUsedSize')?.value || 0,
          jsHeapTotalSize: perfMetrics.metrics.find(m => m.name === 'JSHeapTotalSize')?.value || 0
        },
        memory: memoryInfo,
        layout: {
          contentSize: layoutMetrics.contentSize,
          layoutViewport: layoutMetrics.layoutViewport,
          visualViewport: layoutMetrics.visualViewport
        }
      };
    } catch (error) {
      ActionLogger.logError('Error capturing step metrics', error as Error);
      return null;
    }
  }

  private createEmptyMetrics(): TraceMetrics {
    return {
      frames: {
        total: 0,
        dropped: 0
      },
      parseTime: 0,
      scriptTime: 0,
      layoutTime: 0,
      layoutCount: 0,
      paintTime: 0,
      paintCount: 0,
      styleTime: 0,
      styleCount: 0,
      longTasks: [],
      layoutShifts: [],
      cumulativeLayoutShift: 0,
      firstPaint: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      largestContentfulPaintSize: 0,
      userInteractions: 0,
      totalResources: 0,
      jsHeapUsed: 0,
      domNodes: 0
    };
  }

  async finalize(executionId: string): Promise<TraceSummary> {
    const summary: TraceSummary = {
      duration: 0,
      eventCount: 0,
      processes: 0,
      threads: 0,
      screenshots: 0,
      frames: 0,
      totalScenarios: this.traces.size,
      totalEvents: 0,
      totalDuration: 0,
      scenarios: {},
      traceFiles: [],
      analysisReports: [],
      coverageReports: [],
      customMetrics: []
    };

    // Process each scenario
    for (const [scenarioId, traceData] of Array.from(this.traces.entries())) {
      const scenarioPath = path.join(this.evidencePath, scenarioId);
      
      try {
        // Stop tracing if still active
        const client = this.cdpSessions.get(scenarioId);
        if (client && this.tracingStarted.get(scenarioId)) {
          await this.stopTracing(client, scenarioId);
        }

        // Collect final coverage data
        let coverageData = null;
        if (this.options.includeCoverage && client) {
          coverageData = await this.collectCoverageData(client, scenarioId);
        }

        // Generate complete trace file
        const tracePath = path.join(scenarioPath, `${scenarioId}-trace.json`);
        const completeTrace = {
          traceEvents: traceData.events,
          metadata: {
            'clock-domain': 'LINUX_CLOCK_MONOTONIC',
            'command-line': 'Playwright',
            'cpu-brand': 'Intel',
            'format-version': 1,
            'highres-time': true,
            'process-labels': true,
            'product-version': '1.0.0',
            'protocol-version': '1.0',
            'screenshots': this.options.screenshots,
            'startTime': traceData.startTime,
            'endTime': performance.now()
          }
        };

        if (this.options.compressTraces) {
          const compressed = await gzipAsync(JSON.stringify(completeTrace));
          await fs.promises.writeFile(`${tracePath}.gz`, compressed);
          (summary as any)['traceFiles'].push(`${tracePath}.gz`);
        } else {
          await fs.promises.writeFile(tracePath, JSON.stringify(completeTrace, null, 2));
          (summary as any)['traceFiles'].push(tracePath);
        }

        // Generate analysis report
        const analysisPath = path.join(scenarioPath, `${scenarioId}-analysis.json`);
        const analysis = await this.generateCompleteAnalysis(traceData);
        await fs.promises.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
        (summary as any)['analysisReports'].push(analysisPath);

        // Save coverage report if collected
        if (coverageData) {
          const coveragePath = path.join(scenarioPath, `${scenarioId}-coverage.json`);
          await fs.promises.writeFile(coveragePath, JSON.stringify(coverageData, null, 2));
          (summary as any)['coverageReports'].push(coveragePath);
        }

        // Save custom metrics
        const customMetrics = this.customMetrics.get(scenarioId);
        if (customMetrics && customMetrics.length > 0) {
          const metricsPath = path.join(scenarioPath, `${scenarioId}-custom-metrics.json`);
          await fs.promises.writeFile(metricsPath, JSON.stringify({
            scenarioId,
            metrics: customMetrics
          }, null, 2));
          (summary as any)['customMetrics'].push(metricsPath);
        }

        // Generate flame chart data
        const flameChartPath = path.join(scenarioPath, `${scenarioId}-flamechart.json`);
        const flameChart = await this.generateFlameChart(traceData.events);
        await fs.promises.writeFile(flameChartPath, JSON.stringify(flameChart, null, 2));

        // Update summary
        (summary as any)['totalEvents'] += traceData.events.length;
        (summary as any)['totalDuration'] += (performance.now() - (traceData.startTime ?? 0));
        
        (summary as any)['scenarios'][scenarioId] = {
          eventCount: traceData.events.length,
          duration: performance.now() - (traceData.startTime ?? 0),
          metrics: traceData.metrics,
          traceFile: tracePath,
          analysisFile: analysisPath,
          coverageFile: coverageData ? path.join(scenarioPath, `${scenarioId}-coverage.json`) : undefined,
          flameChartFile: flameChartPath
        };

      } catch (error) {
        ActionLogger.logError('Error finalizing trace for scenario', error as Error);
      } finally {
        // Cleanup CDP session
        const client = this.cdpSessions.get(scenarioId);
        if (client) {
          try {
            await client.detach();
          } catch {
            // Session might already be detached
          }
          this.cdpSessions.delete(scenarioId);
        }
      }
    }

    // Generate execution summary
    const summaryPath = path.join(this.evidencePath, 'trace-summary.json');
    await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    // Generate consolidated metrics
    const metricsPath = path.join(this.evidencePath, 'performance-metrics.json');
    const consolidatedMetrics = this.generateConsolidatedMetrics();
    await fs.promises.writeFile(metricsPath, JSON.stringify(consolidatedMetrics, null, 2));

    ActionLogger.logInfo('TraceCollector finalized', {
      executionId,
      totalScenarios: (summary as any)['totalScenarios'],
      totalEvents: (summary as any)['totalEvents'],
      totalDuration: `${((summary as any)['totalDuration'] / 1000).toFixed(2)}s`
    });

    return summary;
  }

  private async stopTracing(client: CDPSession, scenarioId: string): Promise<void> {
    try {
      await client.send('Tracing.end');
      this.tracingStarted.set(scenarioId, false);
      
      // Give some time for final events to be collected
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      ActionLogger.logError('Error stopping trace', error as Error);
    }
  }

  private async collectCoverageData(client: CDPSession, _scenarioId: string): Promise<CoverageData> {
    const coverage: CoverageData = {
      js: {
        total: 0,
        used: 0,
        percentage: 0,
        files: []
      },
      css: {
        total: 0,
        used: 0,
        percentage: 0,
        files: []
      }
    };

    try {
      // Get JavaScript coverage
      const jsCoverage = await client.send('Profiler.takePreciseCoverage');
      
      for (const script of jsCoverage.result) {
        let totalBytes = 0;
        let usedBytes = 0;
        
        // Process functions
        for (const func of script.functions) {
          for (const range of func.ranges) {
            const bytes = range.endOffset - range.startOffset;
            totalBytes += bytes;
            if (range.count > 0) {
              usedBytes += bytes;
            }
          }
        }
        
        coverage.js.total += totalBytes;
        coverage.js.used += usedBytes;
        
        coverage.js.files.push({
          url: script.url,
          total: totalBytes,
          used: usedBytes,
          percentage: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
          ranges: script.functions.flatMap(f => f.ranges.map(r => ({
            start: r.startOffset,
            end: r.endOffset,
            count: r.count
          })))
        });
      }
      
      // Get CSS coverage
      const cssCoverage = await client.send('CSS.takeCoverageDelta');
      
      for (const stylesheet of cssCoverage.coverage) {
        let totalBytes = stylesheet.endOffset - stylesheet.startOffset;
        let usedBytes = 0;
        
        // Calculate used bytes from ranges
        if ((stylesheet as any).usedRanges) {
          for (const range of (stylesheet as any).usedRanges) {
            usedBytes += range.endOffset - range.startOffset;
          }
        }
        
        coverage.css.total += totalBytes;
        coverage.css.used += usedBytes;
        
        coverage.css.files.push({
          url: stylesheet.styleSheetId,
          total: totalBytes,
          used: usedBytes,
          percentage: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
          ranges: ((stylesheet as any).usedRanges || []).map((r: any) => ({
            start: r.startOffset,
            end: r.endOffset,
            count: 1
          }))
        });
      }
      
      // Calculate overall percentages
      coverage.js.percentage = coverage.js.total > 0 ? 
        (coverage.js.used / coverage.js.total) * 100 : 0;
      coverage.css.percentage = coverage.css.total > 0 ? 
        (coverage.css.used / coverage.css.total) * 100 : 0;
      
      // Stop coverage collection
      await client.send('Profiler.stopPreciseCoverage');
      await client.send('CSS.stopRuleUsageTracking');
      
    } catch (error) {
      ActionLogger.logError('Error collecting coverage data', error as Error);
    }
    
    return coverage;
  }

  private async generateCompleteAnalysis(traceData: TraceData): Promise<TraceAnalysis> {
    const events = traceData.events;
    const metrics = traceData.metrics || this.createEmptyMetrics();
    
    const analysis: TraceAnalysis = {
      summary: {
        duration: 0,
        eventCount: events.length,
        processes: 1,
        threads: 1,
        screenshots: 0,
        frames: 0,
        totalTime: (performance.now() - (traceData.startTime || 0)) / 1000,
        scriptingTime: (metrics as any)['scriptTime'] || 0,
        renderingTime: ((metrics as any)['layoutTime'] || 0) + ((metrics as any)['styleTime'] || 0),
        paintingTime: (metrics as any)['paintTime'] || 0,
        idleTime: 0,
        longTaskTime: (metrics.longTasks || []).reduce((sum, task) => sum + task.duration, 0)
      },
      metrics: {
        longTasks: metrics.longTasks || [],
        layoutShifts: metrics.layoutShifts || []
      },
      performance: {
        frameMetrics: {
          total: (metrics as any)['frames']?.total || 0,
          dropped: (metrics as any)['frames']?.dropped || 0,
          fps: 0,
          jank: 0
        },
        memoryMetrics: {
          peakJSHeapSize: (metrics as any)['jsHeapUsed'] || 0,
          averageJSHeapSize: 0,
          totalAllocated: 0,
          totalFreed: 0,
          leaks: []
        },
        cpuMetrics: {
          totalTime: 0,
          idleTime: 0,
          categories: {}
        },
        networkMetrics: {
          requests: (metrics as any)['totalResources'] || 0,
          totalSize: 0,
          totalDuration: 0
        },
        customMetrics: this.customMetrics.get(traceData.scenarioId || '') || [],
        userTimings: this.userTimings.get(traceData.scenarioId || '') || [],
        recommendations: []
      }
    };
    
    // Calculate idle time
    const summaryTotalTime = (analysis.summary as any).totalTime || 0;
    const summaryScriptingTime = (analysis.summary as any).scriptingTime || 0;
    const summaryRenderingTime = (analysis.summary as any).renderingTime || 0;
    const summaryPaintingTime = (analysis.summary as any).paintingTime || 0;
    
    (analysis.summary as any).idleTime = Math.max(0,
      summaryTotalTime -
      summaryScriptingTime -
      summaryRenderingTime -
      summaryPaintingTime
    );
    
    // Calculate FPS if we have frame data
    if ((metrics as any).frames?.total > 0 && (analysis.summary as any).totalTime > 0) {
      const frameMetrics = (analysis as any).frameMetrics || {};
      frameMetrics.fps = (metrics as any).frames.total / (analysis.summary as any).totalTime;
      (analysis as any).frameMetrics = frameMetrics;
    }
    
    // Analyze CPU usage by category
    const cpuByCategory = new Map<string, number>();
    let totalCPUTime = 0;
    
    for (const event of events) {
      if (event.dur) {
        const category = this.categorizeEvent(event);
        const duration = event.dur / 1000;
        cpuByCategory.set(category, (cpuByCategory.get(category) || 0) + duration);
        totalCPUTime += duration;
      }
    }
    
    (analysis as any).cpuMetrics.totalTime = totalCPUTime;
    (analysis as any).cpuMetrics.idleTime = Math.max(0, (analysis.summary as any).totalTime - totalCPUTime);
    (analysis as any).cpuMetrics.categories = Object.fromEntries(cpuByCategory);
    
    // Detect memory leaks
    const memoryEvents = events
      .filter((e: TraceEvent) => e.name === 'UpdateCounters' && e.args?.data?.jsHeapSizeUsed)
      .map((e: TraceEvent) => ({
        timestamp: e.ts ?? 0,
        heapSize: e.args!.data!.jsHeapSizeUsed
      }));
    
    if (memoryEvents.length > 10) {
      const leaks = this.detectMemoryLeaks(memoryEvents);
      const memoryMetrics = (analysis as any).memoryMetrics || {};
      memoryMetrics.leaks = leaks;
      (analysis as any).memoryMetrics = memoryMetrics;
    }
    
    // Generate performance recommendations
    this.generateCompleteRecommendations(analysis, events);
    
    return analysis;
  }

  private detectMemoryLeaks(memoryEvents: Array<{timestamp: number, heapSize: number}>): Array<{startTime: number, endTime: number, duration: number, growth: number, rate: number, severity: string}> {
    const leaks: Array<{startTime: number, endTime: number, duration: number, growth: number, rate: number, severity: string}> = [];
    const windowSize = 10;
    
    if (memoryEvents.length < windowSize * 2) return leaks;
    
    // Simple linear regression over sliding windows
    for (let i = 0; i <= memoryEvents.length - windowSize; i++) {
      const window = memoryEvents.slice(i, i + windowSize);
      const slope = this.calculateSlope(window);
      
      // If memory is growing consistently (positive slope)
      if (slope > 1000) { // 1KB per timestamp unit
        const startTime = window[0]?.timestamp ?? 0;
        const endTime = window[window.length - 1]?.timestamp ?? 0;
        const growth = (window[window.length - 1]?.heapSize ?? 0) - (window[0]?.heapSize ?? 0);
        
        leaks.push({
          startTime,
          endTime,
          duration: (endTime - startTime) / 1000,
          growth,
          rate: slope,
          severity: slope > 10000 ? 'high' : 'medium'
        });
        
        // Skip ahead to avoid duplicate detections
        i += windowSize - 1;
      }
    }
    
    return leaks;
  }

  private calculateSlope(points: Array<{timestamp: number, heapSize: number}>): number {
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    for (const point of points) {
      sumX += point.timestamp;
      sumY += point.heapSize;
      sumXY += point.timestamp * point.heapSize;
      sumX2 += point.timestamp * point.timestamp;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  private generateCompleteRecommendations(analysis: TraceAnalysis, events: TraceEvent[]): void {
    // Long task analysis
    const longTasks = (analysis.metrics as any)?.longTasks || [];
    if (longTasks.length > 5) {
      const topTasks = longTasks
        .sort((a: any, b: any) => b.duration - a.duration)
        .slice(0, 5);
      
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: 'high',
        title: 'Multiple long-running tasks detected',
        description: `${longTasks.length} tasks exceeded 50ms, with the longest taking ${topTasks[0].duration.toFixed(0)}ms`,
        impact: 'Long tasks block the main thread and make the UI unresponsive',
        solution: 'Break up long tasks using requestIdleCallback, use Web Workers for heavy computation',
        details: {
          topTasks: topTasks.map((t: any) => ({
            duration: t.duration,
            source: t.attribution
          }))
        }
      });
      (analysis.metrics as any).recommendations = recommendations;
    }
    
    // Memory leak detection
    const memoryMetrics = (analysis.metrics as any)?.memoryMetrics;
    if (memoryMetrics && memoryMetrics.leaks && memoryMetrics.leaks.length > 0) {
      const totalGrowth = memoryMetrics.leaks.reduce((sum: number, leak: any) => sum + leak.growth, 0);
      
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'memory',
        severity: 'high',
        title: 'Potential memory leaks detected',
        description: `${memoryMetrics.leaks.length} potential memory leaks found, total growth: ${(totalGrowth / 1024 / 1024).toFixed(2)}MB`,
        impact: 'Memory leaks cause performance degradation and potential crashes',
        solution: 'Review event listeners, clear timers/intervals, remove DOM references',
        details: {
          leaks: memoryMetrics.leaks
        }
      });
      (analysis.metrics as any).recommendations = recommendations;
    }
    
    // Layout thrashing detection
    const layoutEvents = events.filter((e: TraceEvent) => e.name === 'Layout');
    const consecutiveLayouts = this.findConsecutiveEvents(layoutEvents, 10); // within 10ms
    
    if (consecutiveLayouts.length > 0) {
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: 'medium',
        title: 'Layout thrashing detected',
        description: `Found ${consecutiveLayouts.length} instances of multiple layouts occurring in rapid succession`,
        impact: 'Layout thrashing causes unnecessary reflows and poor performance',
        solution: 'Batch DOM reads and writes, use requestAnimationFrame for animations'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }
    
    // Render blocking resources
    const renderBlockingTime = this.calculateRenderBlockingTime(events);
    if (renderBlockingTime > 1000) { // > 1 second
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: 'high',
        title: 'Significant render blocking detected',
        description: `Render was blocked for ${(renderBlockingTime / 1000).toFixed(2)} seconds`,
        impact: 'Render blocking delays when users can see and interact with the page',
        solution: 'Defer non-critical scripts, inline critical CSS, use resource hints'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }
    
    // CPU usage recommendations
    const cpuMetrics = (analysis as any).cpuMetrics;
    const summaryTotalTime = (analysis.summary as any).totalTime || 1;
    const cpuTotalTime = cpuMetrics?.totalTime || 0;
    const cpuUsage = (cpuTotalTime / summaryTotalTime) * 100;
    if (cpuUsage > 80) {
      const recommendations = (analysis.metrics as any).recommendations || [];
      recommendations.push({
        category: 'performance',
        severity: 'high',
        title: 'High CPU usage detected',
        description: `CPU was busy ${cpuUsage.toFixed(1)}% of the time`,
        impact: 'High CPU usage drains battery and causes heat on mobile devices',
        solution: 'Optimize JavaScript execution, reduce complexity of operations'
      });
      (analysis.metrics as any).recommendations = recommendations;
    }
  }

  private findConsecutiveEvents(events: TraceEvent[], threshold: number): TraceEvent[][] {
    const consecutive: TraceEvent[][] = [];
    let current: TraceEvent[] = [];
    
    for (let i = 0; i < events.length - 1; i++) {
      const currentEvent = events[i];
      const nextEvent = events[i + 1];
      if (!currentEvent || !nextEvent) continue;
      const gap = (nextEvent?.ts ?? 0) - ((currentEvent?.ts ?? 0) + (currentEvent?.dur ?? 0));
      
      if (gap < threshold * 1000) { // Convert ms to microseconds
        if (current.length === 0) current.push(currentEvent);
        current.push(nextEvent);
      } else {
        if (current.length > 1) {
          consecutive.push(current);
        }
        current = [];
      }
    }
    
    if (current.length > 1) {
      consecutive.push(current);
    }
    
    return consecutive;
  }

  private calculateRenderBlockingTime(events: TraceEvent[]): number {
    let blockingTime = 0;
    
    // Find parse blocking scripts
    const scriptEvaluations = events.filter((e: TraceEvent) => 
      e.name === 'EvaluateScript' && 
      e.args?.data?.url && 
      !e.args.data.url.includes('async') &&
      !e.args.data.url.includes('defer')
    );
    
    // Find render blocking stylesheets
    const styleParses = events.filter((e: TraceEvent) => 
      e.name === 'ParseAuthorStyleSheet'
    );
    
    // Calculate total blocking time
    [...scriptEvaluations, ...styleParses].forEach((event: TraceEvent) => {
      if (event.dur) {
        blockingTime += event.dur / 1000; // Convert to ms
      }
    });
    
    return blockingTime;
  }

  private async generateFlameChart(events: TraceEvent[]): Promise<any> {
    // Build call tree for flame chart
    const callTree = {
      name: 'root',
      value: 0,
      children: [] as any[]
    };
    
    const stack: any[] = [callTree];
    const eventsByThread = new Map<string, TraceEvent[]>();
    
    // Group events by thread
    for (const event of events) {
      const tid = String(event.tid || 'main');
      if (!eventsByThread.has(tid)) {
        eventsByThread.set(tid, []);
      }
      eventsByThread.get(tid)!.push(event);
    }
    
    // Process main thread events
    const mainThreadEvents = eventsByThread.get('main') || events;
    const sortedEvents = mainThreadEvents.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    
    for (const event of sortedEvents) {
      if (event.ph === 'B' || event.ph === 'X') { // Begin or Complete
        const node = {
          name: event.name,
          value: event.dur || 0,
          startTime: event.ts ?? 0,
          endTime: (event.ts ?? 0) + (event.dur || 0),
          category: event.cat,
          args: event.args,
          children: []
        };
        
        // Pop stack until we find parent
        while (stack.length > 1) {
          const parent = stack[stack.length - 1];
          if (parent.endTime > (event.ts ?? 0)) {
            break;
          }
          stack.pop();
        }
        
        // Add to parent
        const parent = stack[stack.length - 1];
        parent.children.push(node);
        
        // Push to stack if it's a duration event
        if (event.ph === 'B' || event.dur) {
          stack.push(node);
        }
      }
    }
    
    return {
      root: callTree,
      threads: Array.from(eventsByThread.keys()),
      totalTime: sortedEvents.length > 0 ? 
        (sortedEvents[sortedEvents.length - 1]?.ts ?? 0) - (sortedEvents[0]?.ts ?? 0) : 0
    };
  }

  private generateConsolidatedMetrics(): any {
    const consolidated = {
      summary: {
        totalScenarios: this.traces.size,
        totalEvents: 0,
        totalDuration: 0,
        averageFPS: 0,
        totalLongTasks: 0,
        totalLayoutShifts: 0,
        averageCLS: 0
      },
      performance: {
        scriptingTime: 0,
        renderingTime: 0,
        paintingTime: 0,
        idleTime: 0
      },
      memory: {
        peakHeapSize: 0,
        averageHeapSize: 0,
        leaksDetected: 0
      },
      coverage: {
        jsTotal: 0,
        jsUsed: 0,
        cssTotal: 0,
        cssUsed: 0
      },
      userTimings: {
        marks: [] as string[],
        measures: [] as string[]
      }
    };
    
    let totalFPS = 0;
    let fpsCount = 0;
    let totalCLS = 0;
    let clsCount = 0;
    let heapSizes: number[] = [];
    
    // Aggregate metrics from all scenarios
    for (const [scenarioId, traceData] of Array.from(this.traces.entries())) {
      const metrics = traceData.metrics;
      
      consolidated.summary.totalEvents += traceData.events.length;
      consolidated.summary.totalDuration += performance.now() - (traceData.startTime || 0);
      consolidated.summary.totalLongTasks += (metrics?.longTasks?.length || 0);
      consolidated.summary.totalLayoutShifts += (metrics?.layoutShifts?.length || 0);
      
      consolidated.performance.scriptingTime += ((metrics as any)?.scriptTime || 0);
      consolidated.performance.renderingTime += ((metrics as any)?.layoutTime || 0) + ((metrics as any)?.styleTime || 0);
      consolidated.performance.paintingTime += ((metrics as any)?.paintTime || 0);
      
      const framesData = (metrics as any)?.frames;
      if (framesData && framesData.total > 0) {
        const fps = framesData.total / ((performance.now() - (traceData.startTime || 0)) / 1000);
        totalFPS += fps;
        fpsCount++;
      }
      
      const cumulativeLayoutShift = (metrics as any)?.cumulativeLayoutShift;
      if (cumulativeLayoutShift && cumulativeLayoutShift > 0) {
        totalCLS += cumulativeLayoutShift;
        clsCount++;
      }
      
      const jsHeapUsed = (metrics as any)?.jsHeapUsed;
      if (jsHeapUsed && jsHeapUsed > 0) {
        heapSizes.push(jsHeapUsed);
      }
      
      // Aggregate user timings
      const timings = this.userTimings.get(scenarioId) || [];
      for (const timing of timings) {
        if (timing.entryType === 'mark' && !consolidated.userTimings.marks.includes(timing.name)) {
          consolidated.userTimings.marks.push(timing.name);
        } else if (timing.entryType === 'measure' && !consolidated.userTimings.measures.includes(timing.name)) {
          consolidated.userTimings.measures.push(timing.name);
        }
      }
    }
    
    // Calculate averages
    if (fpsCount > 0) {
      consolidated.summary.averageFPS = totalFPS / fpsCount;
    }
    
    if (clsCount > 0) {
      consolidated.summary.averageCLS = totalCLS / clsCount;
    }
    
    if (heapSizes.length > 0) {
      consolidated.memory.peakHeapSize = Math.max(...heapSizes);
      consolidated.memory.averageHeapSize = heapSizes.reduce((a, b) => a + b, 0) / heapSizes.length;
    }
    
    consolidated.performance.idleTime = Math.max(0,
      consolidated.summary.totalDuration -
      consolidated.performance.scriptingTime -
      consolidated.performance.renderingTime -
      consolidated.performance.paintingTime
    );
    
    // Aggregate coverage data
    for (const [_scenarioId, coverage] of Array.from(this.coverageData.entries())) {
      consolidated.coverage.jsTotal += coverage.js.total;
      consolidated.coverage.jsUsed += coverage.js.used;
      consolidated.coverage.cssTotal += coverage.css.total;
      consolidated.coverage.cssUsed += coverage.css.used;
    }
    
    return consolidated;
  }
}

// Helper interfaces for trace data (removing duplicate, using the main interface)