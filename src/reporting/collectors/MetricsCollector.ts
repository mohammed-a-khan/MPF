// src/reporting/collectors/MetricsCollector.ts

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { performance, PerformanceObserver } from 'perf_hooks';
import { EventEmitter } from 'events';
import { Logger } from '../../core/utils/Logger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import {
  CollectorInterface,
  Evidence,
  EvidenceType,
  CollectorOptions,
  MetricsData,
  SystemMetrics,
  BrowserMetrics,
  TestMetrics,
  CustomMetric,
  MetricType,
  AggregatedMetrics,
  MetricSnapshot,
  MetricTrend,
  Alert,
  AlertSeverity,
  GrafanaMetric,
} from '../types/reporting.types';

const execAsync = promisify(exec);

export class MetricsCollector extends EventEmitter implements CollectorInterface {
  private static instance: MetricsCollector;
  private logger: Logger;
  public name: string = 'MetricsCollector';
  public type: EvidenceType = EvidenceType.METRICS;
  private executionId: string = '';
  private options: CollectorOptions = {};
  private metricsPath: string = '';
  private collectionInterval?: NodeJS.Timeout;
  private performanceObserver?: PerformanceObserver;
  
  private systemMetrics: Map<string, SystemMetrics[]> = new Map();
  private browserMetrics: Map<string, BrowserMetrics[]> = new Map();
  private testMetrics: Map<string, TestMetrics[]> = new Map();
  private customMetrics: Map<string, CustomMetric[]> = new Map();
  private metricSnapshots: Map<string, MetricSnapshot[]> = new Map();
  
  private scenarioStartTimes: Map<string, number> = new Map();
  private stepStartTimes: Map<string, number> = new Map();
  private gcMetrics: any[] = [];
  private memoryLeaks: Map<string, number[]> = new Map();
  
  private alerts: Alert[] = [];
  private thresholds = {
    cpuUsage: 80,
    memoryUsage: 85,
    responseTime: 5000,
    errorRate: 5,
    diskUsage: 90
  };
  
  private aggregatedData: Map<string, AggregatedMetrics> = new Map();

  private constructor() {
    super();
    this.logger = Logger.getInstance('MetricsCollector');
    this.setupPerformanceObserver();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  async initialize(executionId: string, options: CollectorOptions = {}): Promise<void> {
    try {
      this.executionId = executionId;
      this.options = {
        collectSystemMetrics: ConfigurationManager.getBoolean('COLLECT_SYSTEM_METRICS', true),
        metricsInterval: ConfigurationManager.getInt('METRICS_INTERVAL_MS', 5000),
        aggregateMetrics: ConfigurationManager.getBoolean('AGGREGATE_METRICS', true),
        includeGCMetrics: ConfigurationManager.getBoolean('INCLUDE_GC_METRICS', true),
        detectMemoryLeaks: ConfigurationManager.getBoolean('DETECT_MEMORY_LEAKS', true),
        enableAlerting: ConfigurationManager.getBoolean('ENABLE_METRIC_ALERTS', true),
        exportFormat: ConfigurationManager.get('METRICS_EXPORT_FORMAT', 'json'),
        ...options
      };

      this.metricsPath = path.join(
        ConfigurationManager.get('EVIDENCE_PATH', './evidence'),
        'metrics',
        executionId
      );
      await fs.promises.mkdir(this.metricsPath, { recursive: true });

      if (this.options.collectSystemMetrics) {
        this.startSystemMetricsCollection();
      }

      if (this.options.includeGCMetrics && global.gc) {
        this.setupGCTracking();
      }

      this.logger.info('MetricsCollector initialized', { executionId, options: this.options });
    } catch (error) {
      this.logger.error('Failed to initialize MetricsCollector', error as Error);
      throw error;
    }
  }

  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.processPerformanceEntry(entry);
      }
    });

    this.performanceObserver.observe({ 
      entryTypes: ['measure', 'mark', 'resource'] as any
    });
  }

  private processPerformanceEntry(entry: PerformanceEntry): void {
    const metric: CustomMetric = {
      name: entry.name,
      value: entry.duration || 0,
      type: entry.entryType as MetricType,
      timestamp: new Date(),
      unit: 'ms',
      tags: {
        entryType: entry.entryType,
        startTime: entry.startTime.toString()
      }
    };

    this.recordCustomMetric(this.executionId, metric);
  }

  private startSystemMetricsCollection(): void {
    this.collectSystemMetrics(this.executionId);

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics(this.executionId);
    }, this.options.metricsInterval || 5000);
  }

  private async collectSystemMetrics(contextId: string): Promise<void> {
    try {
      const cpuData = await this.getCPUMetrics();
      const memoryData = this.getMemoryMetrics();
      const diskData = await this.getDiskMetrics();
      const processData = this.getProcessMetrics();
      
      const metrics: SystemMetrics = {
        cpuUsage: cpuData.usage,
        memoryUsage: memoryData.percent,
        diskIO: diskData.io,
        networkLatency: 0,
        processCount: processData.handles,
        timestamp: new Date(),
        cpu: cpuData,
        memory: memoryData,
        disk: diskData
      };

      if (!this.systemMetrics.has(contextId)) {
        this.systemMetrics.set(contextId, []);
      }
      this.systemMetrics.get(contextId)!.push(metrics);

      if (this.options.enableAlerting) {
        this.checkThresholds(metrics);
      }

      if (this.options.detectMemoryLeaks && metrics.memory) {
        this.detectMemoryLeak(contextId, metrics.memory.used);
      }

      if (this.options.aggregateMetrics) {
        this.aggregateMetric(contextId, metrics);
      }

      this.emit('metric', { type: 'system', contextId, metrics });

    } catch (error) {
      this.logger.error('Failed to collect system metrics', error as Error);
    }
  }

  private async getCPUMetrics(): Promise<any> {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    const startUsage = process.cpuUsage();
    const startTime = Date.now();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const endUsage = process.cpuUsage(startUsage);
    const endTime = Date.now();
    const elapsedTime = (endTime - startTime) * 1000;
    
    const userPercent = (endUsage.user / elapsedTime) * 100;
    const systemPercent = (endUsage.system / elapsedTime) * 100;
    const totalPercent = userPercent + systemPercent;

    return {
      usage: totalPercent,
      count: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      cores: cpus.length,
      usageDetails: {
        user: userPercent,
        system: systemPercent,
        total: totalPercent,
        idle: 100 - totalPercent
      },
      loadAverage: {
        '1min': loadAvg[0],
        '5min': loadAvg[1],
        '15min': loadAvg[2]
      },
      coreDetails: cpus.map((cpu, index) => ({
        core: index,
        model: cpu.model,
        speed: cpu.speed,
        times: cpu.times
      }))
    };
  }

  private getMemoryMetrics(): any {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = process.memoryUsage();

    return {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percent: (usedMem / totalMem) * 100,
      percentage: (usedMem / totalMem) * 100,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      heapPercentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
    };
  }

  private async getDiskMetrics(): Promise<any> {
    try {
      const platform = os.platform();
      let command: string;
      
      if (platform === 'win32') {
        command = 'wmic logicaldisk get size,freespace,caption';
      } else {
        command = 'df -B1';
      }

      const { stdout } = await execAsync(command);
      return this.parseDiskUsage(stdout, platform);
    } catch (error) {
      this.logger.error('Failed to get disk metrics', error as Error);
      return { disks: [], totalUsage: 0, io: 0, read: 0, write: 0, usage: 0 };
    }
  }

  private parseDiskUsage(output: string, platform: string): any {
    const disks: any[] = [];
    let totalSize = 0;
    let totalUsed = 0;

    if (platform === 'win32') {
      const lines = output.trim().split('\n').slice(1);
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const caption = parts[0] || '';
          const free = parseInt(parts[1] || '0') || 0;
          const size = parseInt(parts[2] || '0') || 0;
          const used = size - free;
          
          if (size > 0) {
            disks.push({
              filesystem: caption,
              size,
              used,
              available: free,
              usePercent: (used / size) * 100,
              mountpoint: caption
            });
            totalSize += size;
            totalUsed += used;
          }
        }
      });
    } else {
      const lines = output.trim().split('\n').slice(1);
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6 && parts[0] && !parts[0].startsWith('tmpfs')) {
          const filesystem = parts[0]!;
          const size = parseInt(parts[1] || '0') || 0;
          const used = parseInt(parts[2] || '0') || 0;
          const available = parseInt(parts[3] || '0') || 0;
          const usePercent = parts[4] ? parseInt(parts[4]) || 0 : 0;
          
          disks.push({
            filesystem,
            size,
            used,
            available,
            usePercent,
            mountpoint: parts[5]
          });
          totalSize += size;
          totalUsed += used;
        }
      });
    }

    return {
      disks,
      totalSize,
      totalUsed,
      totalAvailable: totalSize - totalUsed,
      totalUsagePercent: totalSize > 0 ? (totalUsed / totalSize) * 100 : 0,
      io: 0,
      read: 0,
      write: 0,
      usage: totalSize > 0 ? (totalUsed / totalSize) * 100 : 0
    };
  }



  private getProcessMetrics(): any {
    const uptime = process.uptime();
    const usage = process.cpuUsage();
    
    return {
      pid: process.pid,
      ppid: process.ppid,
      uptime,
      cpuUsage: usage,
      handles: (process as any).getActiveHandles?.()?.length || 0,
      requests: (process as any).getActiveRequests?.()?.length || 0,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      title: process.title
    };
  }

  private setupGCTracking(): void {
    if (!global.gc) {
      this.logger.warn('GC tracking requested but global.gc not available. Run with --expose-gc flag.');
      return;
    }

    const obs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (entry.entryType === 'gc') {
          this.gcMetrics.push({
            timestamp: new Date(),
            duration: entry.duration,
            type: entry.kind,
            flags: entry.flags
          });
        }
      });
    });

    obs.observe({ entryTypes: ['gc'], buffered: true });
  }

  private detectMemoryLeak(contextId: string, heapUsed: number): void {
    if (!this.memoryLeaks.has(contextId)) {
      this.memoryLeaks.set(contextId, []);
    }

    const history = this.memoryLeaks.get(contextId)!;
    history.push(heapUsed);

    if (history.length > 10) {
      history.shift();
    }

    if (history.length >= 5) {
      let increasing = true;
      for (let i = 1; i < history.length; i++) {
        if (history[i]! <= history[i - 1]!) {
          increasing = false;
          break;
        }
      }

      if (increasing) {
        const growthRate = ((history[history.length - 1]! - history[0]!) / history[0]!) * 100;
        if (growthRate > 50) {
          this.generateAlert({
            severity: AlertSeverity.ERROR,
            metric: 'memory.heapUsed',
            value: heapUsed,
            threshold: history[0]! * 1.5,
            message: `Potential memory leak detected. Heap usage increased by ${growthRate.toFixed(2)}%`,
            condition: 'growth > 50%'
          });
        }
      }
    }
  }

  private checkThresholds(metrics: SystemMetrics): void {
    if (metrics.cpu && metrics.cpu.usage > this.thresholds.cpuUsage) {
      this.generateAlert({
        severity: AlertSeverity.ERROR,
        metric: 'cpu.usage',
        value: metrics.cpu.usage,
        threshold: this.thresholds.cpuUsage,
        message: `CPU usage (${metrics.cpu.usage.toFixed(2)}%) exceeds threshold (${this.thresholds.cpuUsage}%)`,
        condition: `> ${this.thresholds.cpuUsage}%`
      });
    }

    if (metrics.memory && metrics.memory.percent > this.thresholds.memoryUsage) {
      this.generateAlert({
        severity: AlertSeverity.ERROR,
        metric: 'memory.usage',
        value: metrics.memory.percent,
        threshold: this.thresholds.memoryUsage,
        message: `Memory usage (${metrics.memory.percent.toFixed(2)}%) exceeds threshold (${this.thresholds.memoryUsage}%)`,
        condition: `> ${this.thresholds.memoryUsage}%`
      });
    }

    if (metrics.disk && metrics.disk.usage > this.thresholds.diskUsage) {
      this.generateAlert({
        severity: AlertSeverity.WARNING,
        metric: 'disk.usage',
        value: metrics.disk.usage,
        threshold: this.thresholds.diskUsage,
        message: `Disk usage (${metrics.disk.usage.toFixed(2)}%) exceeds threshold (${this.thresholds.diskUsage}%)`,
        condition: `> ${this.thresholds.diskUsage}%`
      });
    }
  }

  private generateAlert(alertData: Omit<Alert, 'id' | 'timestamp'>): void {
    const alert: Alert = {
      ...alertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    this.alerts.push(alert);
    this.emit('alert', alert);
    
    this.logger.warn(`Metric Alert: ${alert.message}`, {
      severity: alert.severity,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold
    });
  }

  private aggregateMetric(contextId: string, metrics: SystemMetrics): void {
    if (!this.aggregatedData.has(contextId)) {
      this.aggregatedData.set(contextId, {
        startTime: Date.now(),
        endTime: Date.now(),
        samples: 0,
        cpu: { min: Infinity, max: -Infinity, avg: 0, sum: 0 },
        memory: { min: Infinity, max: -Infinity, avg: 0, sum: 0 },
        disk: { min: Infinity, max: -Infinity, avg: 0, sum: 0 },
        responseTime: { min: Infinity, max: -Infinity, avg: 0, sum: 0, p50: 0, p90: 0, p95: 0, p99: 0 },
        throughput: { requests: 0, bytesIn: 0, bytesOut: 0 },
        errors: { count: 0, rate: 0 }
      });
    }

    const agg = this.aggregatedData.get(contextId)!;
    agg.samples++;
    agg.endTime = Date.now();

    if (metrics.cpu && metrics.cpu.usage) {
      const cpuUsage = metrics.cpu.usage;
      agg.cpu.min = Math.min(agg.cpu.min, cpuUsage);
      agg.cpu.max = Math.max(agg.cpu.max, cpuUsage);
      agg.cpu.sum += cpuUsage;
      agg.cpu.avg = agg.cpu.sum / agg.samples;
    }

    if (metrics.memory && metrics.memory.percent !== undefined) {
      const memUsage = metrics.memory.percent;
      agg.memory.min = Math.min(agg.memory.min, memUsage);
      agg.memory.max = Math.max(agg.memory.max, memUsage);
      agg.memory.sum += memUsage;
      agg.memory.avg = agg.memory.sum / agg.samples;
    }

    if (metrics.disk && metrics.disk.usage !== undefined) {
      const diskUsage = metrics.disk.usage;
      agg.disk.min = Math.min(agg.disk.min, diskUsage);
      agg.disk.max = Math.max(agg.disk.max, diskUsage);
      agg.disk.sum += diskUsage;
      agg.disk.avg = agg.disk.sum / agg.samples;
    }
  }

  async collectForScenario(scenarioId: string, scenarioName: string): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      this.scenarioStartTimes.set(scenarioId, Date.now());
      performance.mark(`scenario-start-${scenarioId}`);
      
      if (this.options.collectSystemMetrics) {
        this.collectSystemMetrics(scenarioId);
      }

      this.browserMetrics.set(scenarioId, []);
      this.testMetrics.set(scenarioId, []);

      const snapshot = await this.captureMetricSnapshot(scenarioId, 'scenario-start');
      evidence.push(snapshot);

      this.logger.info(`Started metrics collection for scenario: ${scenarioName}`, { scenarioId });

    } catch (error) {
      this.logger.error(`Failed to collect metrics for scenario ${scenarioId}`, error as Error);
    }

    return evidence;
  }

  async collectForStep(
    scenarioId: string,
    stepId: string,
    stepText: string,
    status: 'passed' | 'failed' | 'skipped'
  ): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      const stepKey = `${scenarioId}-${stepId}`;
      
      if (!this.stepStartTimes.has(stepKey)) {
        this.stepStartTimes.set(stepKey, Date.now());
        performance.mark(`step-start-${stepKey}`);
      } else {
        const startTime = this.stepStartTimes.get(stepKey)!;
        const duration = Date.now() - startTime;
        
        performance.mark(`step-end-${stepKey}`);
        performance.measure(
          `step-${stepKey}`,
          `step-start-${stepKey}`,
          `step-end-${stepKey}`
        );

        const stepMetric: TestMetrics = {
          timestamp: new Date(),
          scenarioId,
          stepId,
          stepText,
          duration,
          status,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        };

        if (!this.testMetrics.has(scenarioId)) {
          this.testMetrics.set(scenarioId, []);
        }
        this.testMetrics.get(scenarioId)!.push(stepMetric);

        this.stepStartTimes.delete(stepKey);

        if (status === 'failed') {
          const snapshot = await this.captureMetricSnapshot(scenarioId, `step-failed-${stepId}`);
          evidence.push(snapshot);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to collect step metrics for ${stepId}`, error as Error);
    }

    return evidence;
  }

  async collectBrowserMetrics(scenarioId: string, page: any): Promise<void> {
    try {
      const metrics = await page.evaluate(() => {
        const navigation = (performance as any).getEntriesByType('navigation')[0] as any;
        const paint = (performance as any).getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');
        
        return {
          navigation: navigation ? {
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
            domInteractive: navigation.domInteractive - navigation.fetchStart,
            requestStart: navigation.requestStart - navigation.fetchStart,
            responseStart: navigation.responseStart - navigation.requestStart,
            responseEnd: navigation.responseEnd - navigation.responseStart
          } : null,
          paint: paint.map((p: any) => ({
            name: p.name,
            startTime: p.startTime
          })),
          resources: resources.map(r => ({
            name: r.name,
            duration: r.duration,
            size: (r as any).transferSize || 0,
            type: (r as any).initiatorType
          })),
          memory: (performance as any).memory ? {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
            jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
          } : null
        };
      });

      const browserMetric: any = {
        timestamp: new Date(),
        url: await page.url(),
        navigation: metrics.navigation,
        paint: metrics.paint,
        resources: metrics.resources,
        memory: metrics.memory,
        pageLoadTime: metrics.navigation ? metrics.navigation.loadComplete : 0,
        domContentLoaded: metrics.navigation ? metrics.navigation.domContentLoaded : 0
      };

      if (!this.browserMetrics.has(scenarioId)) {
        this.browserMetrics.set(scenarioId, []);
      }
      this.browserMetrics.get(scenarioId)!.push(browserMetric);

    } catch (error) {
      this.logger.error('Failed to collect browser metrics', error as Error);
    }
  }

  recordCustomMetric(contextId: string, metric: CustomMetric): void {
    if (!this.customMetrics.has(contextId)) {
      this.customMetrics.set(contextId, []);
    }
    this.customMetrics.get(contextId)!.push(metric);
    
    if (metric.alert && metric.value > metric.alert.threshold) {
      this.generateAlert({
        severity: metric.alert.severity || AlertSeverity.ERROR,
        metric: metric.name,
        value: metric.value,
        threshold: metric.alert.threshold,
        message: metric.alert.message || `${metric.name} exceeded threshold`,
        condition: `> ${metric.alert.threshold}`
      });
    }
  }

  private async captureMetricSnapshot(contextId: string, reason: string): Promise<Evidence> {
    const snapshot: MetricSnapshot = {
      timestamp: Date.now(),
      reason,
      system: this.systemMetrics.get(contextId)?.slice(-1)[0] || null,
      browser: this.browserMetrics.get(contextId)?.slice(-1)[0] || null,
      test: this.testMetrics.get(contextId)?.slice(-1)[0] || null,
      custom: this.customMetrics.get(contextId) || [],
      aggregated: this.aggregatedData.get(contextId) || null,
      alerts: this.alerts.filter(a => (a as any).contextId === contextId),
      gcMetrics: this.gcMetrics.slice(-10)
    };

    const filename = `snapshot-${reason}-${Date.now()}.json`;
    const filepath = path.join(this.metricsPath, filename);
    await fs.promises.writeFile(filepath, JSON.stringify(snapshot, null, 2));

    if (!this.metricSnapshots.has(contextId)) {
      this.metricSnapshots.set(contextId, []);
    }
    this.metricSnapshots.get(contextId)!.push(snapshot);

    return {
      id: `metrics-snapshot-${Date.now()}`,
      type: 'metrics' as EvidenceType,
      scenarioId: contextId,
      timestamp: snapshot.timestamp,
      path: filepath,
      size: Buffer.byteLength(JSON.stringify(snapshot)),
      metadata: {
        reason,
        hasAlerts: snapshot.alerts.length > 0,
        systemMetrics: !!snapshot.system,
        browserMetrics: !!snapshot.browser,
        customMetrics: snapshot.custom.length
      },
      tags: ['snapshot', reason]
    };
  }

  async finalize(): Promise<void> {
    this.cleanup();
  }
  
  async collect(...args: any[]): Promise<Evidence[]> {
    const executionId = args[0] || this.executionId;
    const evidence: Evidence[] = [];
    
    try {
      if (this.collectionInterval) {
        clearInterval(this.collectionInterval);
      }

      const allMetrics = await this.generateFinalReport(executionId);
      
      const reportPath = path.join(this.metricsPath, 'metrics-report.json');
      await fs.promises.writeFile(reportPath, JSON.stringify(allMetrics, null, 2));
      
      evidence.push({
        id: `metrics-report-${executionId}`,
        type: 'metrics' as EvidenceType,
        scenarioId: executionId,
        timestamp: new Date(),
        path: reportPath,
        size: Buffer.byteLength(JSON.stringify(allMetrics)),
        metadata: {
          totalScenarios: this.systemMetrics.size,
          totalAlerts: this.alerts.length,
          exportFormat: this.options.exportFormat
        },
        tags: ['report', 'final']
      });

      if (this.options.exportFormat === 'grafana') {
        const grafanaPath = await this.exportToGrafana(executionId, allMetrics);
        evidence.push({
          id: `metrics-grafana-${executionId}`,
          type: 'metrics' as EvidenceType,
          scenarioId: executionId,
          timestamp: new Date(),
          path: grafanaPath,
          size: fs.statSync(grafanaPath).size,
          metadata: { format: 'grafana' },
          tags: ['export', 'grafana']
        });
      } else if (this.options.exportFormat === 'prometheus') {
        const promPath = await this.exportToPrometheus(executionId, allMetrics);
        evidence.push({
          id: `metrics-prometheus-${executionId}`,
          type: 'metrics' as EvidenceType,
          scenarioId: executionId,
          timestamp: new Date(),
          path: promPath,
          size: fs.statSync(promPath).size,
          metadata: { format: 'prometheus' },
          tags: ['export', 'prometheus']
        });
      }

      const trendsPath = await this.generateTrendAnalysis(executionId);
      evidence.push({
        id: `metrics-trends-${executionId}`,
        type: 'metrics' as EvidenceType,
        scenarioId: executionId,
        timestamp: new Date(),
        path: trendsPath,
        size: fs.statSync(trendsPath).size,
        metadata: { analysis: 'trends' },
        tags: ['analysis', 'trends']
      });

      this.cleanup();

      this.logger.info('MetricsCollector finalized', { 
        executionId, 
        totalMetrics: allMetrics.summary.totalDataPoints,
        alerts: this.alerts.length 
      });

    } catch (error) {
      this.logger.error('Failed to finalize MetricsCollector', error as Error);
    }

    return evidence;
  }

  private async generateFinalReport(executionId: string): Promise<MetricsData> {
    const allResponseTimes: number[] = [];
    this.testMetrics.forEach(metrics => {
      metrics.forEach(m => {
        if (m.duration) {
          allResponseTimes.push(m.duration);
        }
      });
    });
    allResponseTimes.sort((a, b) => a - b);

    const percentile = (p: number) => {
      const index = Math.ceil(allResponseTimes.length * (p / 100)) - 1;
      return allResponseTimes[index] || 0;
    };

    let totalSteps = 0;
    let failedSteps = 0;
    this.testMetrics.forEach(metrics => {
      metrics.forEach(m => {
        totalSteps++;
        if (m.status === 'failed') failedSteps++;
      });
    });
    const errorRate = totalSteps > 0 ? (failedSteps / totalSteps) * 100 : 0;

    const report: MetricsData = {
      executionId,
      startTime: Math.min(...Array.from(this.systemMetrics.values()).map(m => m[0]?.timestamp ? m[0].timestamp.getTime() : Date.now())),
      endTime: Date.now(),
      summary: {
        totalScenarios: this.systemMetrics.size,
        totalDataPoints: this.countAllDataPoints(),
        avgCPU: this.calculateAverage('cpu'),
        avgMemory: this.calculateAverage('memory'),
        peakCPU: this.calculatePeak('cpu'),
        peakMemory: this.calculatePeak('memory'),
        totalAlerts: this.alerts.length,
        errorRate
      },
      system: this.aggregateSystemMetrics(),
      browser: this.aggregateBrowserMetrics(),
      test: this.aggregateTestMetrics(),
      custom: this.aggregateCustomMetrics(),
      performance: {
        responseTime: {
          min: Math.min(...allResponseTimes) || 0,
          max: Math.max(...allResponseTimes) || 0,
          avg: allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length || 0,
          p50: percentile(50),
          p90: percentile(90),
          p95: percentile(95),
          p99: percentile(99)
        },
        throughput: this.calculateThroughput(),
        concurrency: {
          max: Math.max(...Array.from(this.systemMetrics.keys()).map(k => 
            this.systemMetrics.get(k)?.length || 0
          ))
        }
      },
      trends: this.calculateTrends(),
      alerts: this.alerts,
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  private countAllDataPoints(): number {
    let count = 0;
    this.systemMetrics.forEach(m => count += m.length);
    this.browserMetrics.forEach(m => count += m.length);
    this.testMetrics.forEach(m => count += m.length);
    this.customMetrics.forEach(m => count += m.length);
    return count;
  }

  private calculateAverage(metric: 'cpu' | 'memory'): number {
    let sum = 0;
    let count = 0;
    
    this.systemMetrics.forEach(metrics => {
      metrics.forEach(m => {
        if (metric === 'cpu' && m.cpu) {
          sum += m.cpu.usage || m.cpuUsage;
        } else if (metric === 'memory' && m.memory) {
          sum += m.memory.percent || m.memoryUsage;
        }
        count++;
      });
    });
    
    return count > 0 ? sum / count : 0;
  }

  private calculatePeak(metric: 'cpu' | 'memory'): number {
    let peak = 0;
    
    this.systemMetrics.forEach(metrics => {
      metrics.forEach(m => {
        const value = metric === 'cpu' ? (m.cpu ? m.cpu.usage : m.cpuUsage) : (m.memory ? m.memory.percent : m.memoryUsage);
        peak = Math.max(peak, value);
      });
    });
    
    return peak;
  }

  private aggregateSystemMetrics(): any {
    const aggregated: any = {};
    
    this.systemMetrics.forEach((metrics, contextId) => {
      aggregated[contextId] = {
        samples: metrics.length,
        cpu: this.aggregateMetricValues(metrics.map(m => m.cpu ? m.cpu.usage : m.cpuUsage)),
        memory: this.aggregateMetricValues(metrics.map(m => m.memory ? m.memory.percent : m.memoryUsage)),
        disk: this.aggregateMetricValues(metrics.map(m => m.disk ? m.disk.usage : 0))
      };
    });
    
    return aggregated;
  }

  private aggregateBrowserMetrics(): any {
    const aggregated: any = {};
    
    this.browserMetrics.forEach((metrics, contextId) => {
      const loadTimes = metrics
        .filter(m => m.pageLoadTime)
        .map(m => m.pageLoadTime);
        
      aggregated[contextId] = {
        samples: metrics.length,
        pageLoadTime: this.aggregateMetricValues(loadTimes),
        resources: {
          total: metrics.reduce((sum, m) => sum + (m.resources?.length || 0), 0),
          byType: this.groupResourcesByType(metrics)
        }
      };
    });
    
    return aggregated;
  }

  private aggregateTestMetrics(): any {
    const aggregated: any = {};
    
    this.testMetrics.forEach((metrics, scenarioId) => {
      const durations = metrics.map(m => m.duration);
      const passed = metrics.filter(m => m.status === 'passed').length;
      const failed = metrics.filter(m => m.status === 'failed').length;
      const skipped = metrics.filter(m => m.status === 'skipped').length;
      
      aggregated[scenarioId] = {
        totalSteps: metrics.length,
        passed,
        failed,
        skipped,
        duration: this.aggregateMetricValues(durations),
        errorRate: metrics.length > 0 ? (failed / metrics.length) * 100 : 0
      };
    });
    
    return aggregated;
  }

  private aggregateCustomMetrics(): any {
    const aggregated: any = {};
    
    this.customMetrics.forEach((metrics, contextId) => {
      const byName: any = {};
      
      metrics.forEach(metric => {
        if (!byName[metric.name]) {
          byName[metric.name] = [];
        }
        byName[metric.name].push(metric.value);
      });
      
      Object.keys(byName).forEach(name => {
        byName[name] = this.aggregateMetricValues(byName[name]);
      });
      
      aggregated[contextId] = byName;
    });
    
    return aggregated;
  }

  private aggregateMetricValues(values: number[]): any {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, sum: 0, count: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      sum,
      count: values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  private groupResourcesByType(metrics: BrowserMetrics[]): any {
    const byType: any = {};
    
    metrics.forEach(m => {
      m.resources?.forEach((r: any) => {
        if (!byType[r.type]) {
          byType[r.type] = { count: 0, totalSize: 0, totalDuration: 0 };
        }
        byType[r.type].count++;
        byType[r.type].totalSize += r.size;
        byType[r.type].totalDuration += r.duration;
      });
    });
    
    return byType;
  }

  private calculateThroughput(): any {
    const timeWindow = 60000;
    const throughputByWindow: any = {};
    
    this.testMetrics.forEach(metrics => {
      metrics.forEach(m => {
        const window = Math.floor(m.timestamp.getTime() / timeWindow) * timeWindow;
        if (!throughputByWindow[window]) {
          throughputByWindow[window] = 0;
        }
        throughputByWindow[window]++;
      });
    });
    
    const values = Object.values(throughputByWindow) as number[];
    return {
      avg: values.reduce((a: number, b: number) => a + b, 0) / values.length || 0,
      max: Math.max(...values) || 0,
      windows: throughputByWindow
    };
  }

  private calculateTrends(): MetricTrend[] {
    const trends: MetricTrend[] = [];
    
    const cpuValues = this.extractTimeSeriesValues('cpu');
    if (cpuValues.length > 2) {
      trends.push({
        metric: 'cpu',
        direction: this.calculateTrendDirection(cpuValues),
        changePercent: this.calculateChangePercent(cpuValues),
        forecast: this.simpleForecast(cpuValues)
      });
    }
    
    const memoryValues = this.extractTimeSeriesValues('memory');
    if (memoryValues.length > 2) {
      trends.push({
        metric: 'memory',
        direction: this.calculateTrendDirection(memoryValues),
        changePercent: this.calculateChangePercent(memoryValues),
        forecast: this.simpleForecast(memoryValues)
      });
    }
    
    return trends;
  }

  private extractTimeSeriesValues(metric: 'cpu' | 'memory'): Array<{time: number, value: number}> {
    const values: Array<{time: number, value: number}> = [];
    
    this.systemMetrics.forEach(metrics => {
      metrics.forEach(m => {
        values.push({
          time: m.timestamp ? m.timestamp.getTime() : Date.now(),
          value: metric === 'cpu' ? (m.cpu ? m.cpu.usage : m.cpuUsage) : (m.memory ? m.memory.percent : m.memoryUsage)
        });
      });
    });
    
    return values.sort((a, b) => a.time - b.time);
  }

  private calculateTrendDirection(values: Array<{time: number, value: number}>): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const avgFirst = firstHalf.reduce((sum, v) => sum + v.value, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, v) => sum + v.value, 0) / secondHalf.length;
    
    const change = ((avgSecond - avgFirst) / avgFirst) * 100;
    
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'up' : 'down';
  }

  private calculateChangePercent(values: Array<{time: number, value: number}>): number {
    if (values.length < 2) return 0;
    
    const first = values[0]!.value;
    const last = values[values.length - 1]!.value;
    
    return ((last - first) / first) * 100;
  }

  private simpleForecast(values: Array<{time: number, value: number}>): number {
    if (values.length < 2) return values[0]?.value || 0;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = values.length;
    
    values.forEach((v, i) => {
      sumX += i;
      sumY += v.value;
      sumXY += i * v.value;
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return slope * n + intercept;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    const avgCPU = this.calculateAverage('cpu');
    if (avgCPU > 70) {
      recommendations.push('High CPU usage detected. Consider optimizing compute-intensive operations or scaling resources.');
    }
    
    const avgMemory = this.calculateAverage('memory');
    if (avgMemory > 80) {
      recommendations.push('High memory usage detected. Review for memory leaks and optimize memory allocation.');
    }
    
    if (this.alerts.some(a => a.message.includes('memory leak'))) {
      recommendations.push('Potential memory leak detected. Profile application memory usage and fix leaks.');
    }
    
    let totalSteps = 0, failedSteps = 0;
    this.testMetrics.forEach(metrics => {
      metrics.forEach(m => {
        totalSteps++;
        if (m.status === 'failed') failedSteps++;
      });
    });
    const errorRate = totalSteps > 0 ? (failedSteps / totalSteps) * 100 : 0;
    
    if (errorRate > 10) {
      recommendations.push(`High error rate (${errorRate.toFixed(2)}%). Investigate failing tests and improve stability.`);
    }
    
    const allResponseTimes: number[] = [];
    this.testMetrics.forEach(metrics => {
      metrics.forEach(m => {
        if (m.duration) allResponseTimes.push(m.duration);
      });
    });
    
    if (allResponseTimes.length > 0) {
      const avgResponseTime = allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
      if (avgResponseTime > 3000) {
        recommendations.push('High average response time. Optimize slow operations and consider caching.');
      }
    }
    
    return recommendations;
  }

  private async exportToGrafana(executionId: string, metrics: MetricsData): Promise<string> {
    const grafanaData: GrafanaMetric[] = [];
    
    this.logger.debug(`Exporting ${Object.keys(metrics).length} metric types to Grafana format`);
    
    this.systemMetrics.forEach((metrics, contextId) => {
      metrics.forEach(m => {
        grafanaData.push({
          name: `${contextId}.cpu.usage`,
          value: m.cpu ? m.cpu.usage : m.cpuUsage,
          timestamp: m.timestamp ? m.timestamp.getTime() : Date.now(),
          tags: { contextId, metric: 'cpu.usage' }
        });
        grafanaData.push({
          name: `${contextId}.memory.usage`,
          value: m.memory ? m.memory.percent : m.memoryUsage,
          timestamp: m.timestamp ? m.timestamp.getTime() : Date.now(),
          tags: { contextId, metric: 'memory.usage' }
        });
        if (m.disk) {
          grafanaData.push({
            name: `${contextId}.disk.usage`,
            value: m.disk.usage,
            timestamp: m.timestamp ? m.timestamp.getTime() : Date.now(),
            tags: { contextId, metric: 'disk.usage' }
          });
        }
      });
    });
    
    this.testMetrics.forEach((metrics, scenarioId) => {
      metrics.forEach(m => {
        grafanaData.push({
          name: `${scenarioId}.step.duration`,
          value: m.duration,
          timestamp: m.timestamp ? m.timestamp.getTime() : Date.now(),
          tags: { scenarioId, metric: 'step.duration', stepId: m.stepId || '' }
        });
      });
    });
    
    const filepath = path.join(this.metricsPath, `metrics-grafana-${executionId}.json`);
    await fs.promises.writeFile(filepath, JSON.stringify(grafanaData, null, 2));
    
    return filepath;
  }

  private async exportToPrometheus(executionId: string, metrics: MetricsData): Promise<string> {
    const lines: string[] = [];
    
    this.logger.debug(`Exporting metrics to Prometheus format for execution: ${executionId}`);
    
    lines.push(`# HELP cpu_usage CPU usage percentage`);
    lines.push(`# TYPE cpu_usage gauge`);
    lines.push(`# Metrics export for ${metrics.executionId || executionId}`);
    
    this.systemMetrics.forEach((metrics, contextId) => {
      const latest = metrics[metrics.length - 1];
      if (latest) {
        const cpuValue = latest.cpu ? latest.cpu.usage : latest.cpuUsage;
        const memoryValue = latest.memory ? latest.memory.percent : latest.memoryUsage;
        const timestamp = latest.timestamp ? latest.timestamp.getTime() : Date.now();
        
        lines.push(`cpu_usage{context="${contextId}"} ${cpuValue} ${timestamp}`);
        lines.push(`memory_usage{context="${contextId}"} ${memoryValue} ${timestamp}`);
        if (latest.disk) {
          lines.push(`disk_usage{context="${contextId}"} ${latest.disk.usage} ${timestamp}`);
        }
      }
    });
    
    lines.push(`# HELP test_duration Test step duration in milliseconds`);
    lines.push(`# TYPE test_duration histogram`);
    
    this.testMetrics.forEach((metrics, scenarioId) => {
      metrics.forEach(m => {
        const timestampMs = m.timestamp ? m.timestamp.getTime() : Date.now();
        lines.push(`test_duration{scenario="${scenarioId}",step="${m.stepId || ''}",status="${m.status}"} ${m.duration} ${timestampMs}`);
      });
    });
    
    const filepath = path.join(this.metricsPath, `metrics-prometheus-${executionId}.txt`);
    await fs.promises.writeFile(filepath, lines.join('\n'));
    
    return filepath;
  }

  private async generateTrendAnalysis(executionId: string): Promise<string> {
    const analysis = {
      executionId,
      generatedAt: new Date().toISOString(),
      trends: this.calculateTrends(),
      predictions: {
        cpu: this.predictNextValue('cpu'),
        memory: this.predictNextValue('memory'),
        errorRate: this.predictErrorRate()
      },
      anomalies: this.detectAnomalies(),
      correlations: this.calculateCorrelations()
    };
    
    const filepath = path.join(this.metricsPath, 'metrics-trends.json');
    await fs.promises.writeFile(filepath, JSON.stringify(analysis, null, 2));
    
    return filepath;
  }

  private predictNextValue(metric: 'cpu' | 'memory'): number {
    const values = this.extractTimeSeriesValues(metric);
    return this.simpleForecast(values);
  }

  private predictErrorRate(): number {
    const errorRates: Array<{time: number, value: number}> = [];
    
    this.testMetrics.forEach((metrics) => {
      const failed = metrics.filter(m => m.status === 'failed').length;
      const total = metrics.length;
      if (total > 0) {
        errorRates.push({
          time: Date.now(),
          value: (failed / total) * 100
        });
      }
    });
    
    return this.simpleForecast(errorRates);
  }

  private detectAnomalies(): any[] {
    const anomalies: any[] = [];
    
    this.systemMetrics.forEach((metrics, contextId) => {
      metrics.forEach((m, i) => {
        if (i > 0) {
          const prev = metrics[i - 1];
          if (!prev) return;
          const currentCpu = m.cpu ? m.cpu.usage : m.cpuUsage;
          const prevCpu = prev.cpu ? prev.cpu.usage : prev.cpuUsage;
          const cpuDiff = currentCpu - prevCpu;
          if (cpuDiff > 30) {
            anomalies.push({
              type: 'cpu_spike',
              contextId,
              timestamp: m.timestamp,
              value: currentCpu,
              previousValue: prevCpu,
              change: cpuDiff
            });
          }
        }
      });
    });
    
    return anomalies;
  }

  private calculateCorrelations(): any {
    const cpuValues: number[] = [];
    const memoryValues: number[] = [];
    
    this.systemMetrics.forEach(metrics => {
      metrics.forEach(m => {
        cpuValues.push(m.cpu ? m.cpu.usage : m.cpuUsage);
        memoryValues.push(m.memory ? m.memory.percent : m.memoryUsage);
      });
    });
    
    const correlation = this.pearsonCorrelation(cpuValues, memoryValues);
    
    return {
      cpuMemory: correlation
    };
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i]!, 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  getMetrics(): MetricsData {
    const metrics: MetricsData = {
      systemMetrics: Array.from(this.systemMetrics.entries()),
      browserMetrics: Array.from(this.browserMetrics.entries()),
      testMetrics: Array.from(this.testMetrics.entries()),
      customMetrics: Array.from(this.customMetrics.entries()),
      metricSnapshots: Array.from(this.metricSnapshots.entries()),
      aggregatedData: Array.from(this.aggregatedData.entries()).map(([key, value]) => [key, [value]]),
      alerts: this.alerts,
      gcMetrics: this.gcMetrics,
      memoryLeaks: Array.from(this.memoryLeaks.entries())
    };
    
    return metrics;
  }

  private cleanup(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    this.systemMetrics.clear();
    this.browserMetrics.clear();
    this.testMetrics.clear();
    this.customMetrics.clear();
    this.metricSnapshots.clear();
    this.aggregatedData.clear();
    this.memoryLeaks.clear();
    this.scenarioStartTimes.clear();
    this.stepStartTimes.clear();
    this.gcMetrics = [];
    this.alerts = [];
  }
  
  getEvidence(): Evidence[] {
    const evidence: Evidence[] = [];
    
    this.systemMetrics.forEach((metrics, contextId) => {
      if (metrics.length > 0) {
        evidence.push({
          type: 'metrics',
          timestamp: new Date(),
          data: {
            contextId,
            metrics,
            type: 'system'
          }
        });
      }
    });
    
    return evidence;
  }
  
  clear(): void {
    this.cleanup();
  }
}
