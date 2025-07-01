// src/reporting/collectors/PerformanceCollector.ts

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { performance, PerformanceObserver, PerformanceEntry } from 'perf_hooks';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import {
  CollectorInterface,
  Evidence,
  EvidenceType,
  CollectorOptions,
  PerformanceMetrics,
  CoreWebVitals,
  ResourceTiming,
  NavigationTiming,
  UserTiming,
  LongTask,
  MemoryInfo,
  PerformanceReport,
  PerformanceThreshold,
  PerformanceSummary
} from '../types/reporting.types';

const writeFileAsync = promisify(fs.writeFile);

export class PerformanceCollector implements CollectorInterface {
  name: string = 'PerformanceCollector';
  type: EvidenceType = EvidenceType.PERFORMANCE;
  
  private static instance: PerformanceCollector;
  private executionId: string = '';
  private options: CollectorOptions = {};
  private performancePath: string = '';
  
  private navigationTimings: Map<string, NavigationTiming[]> = new Map();
  private resourceTimings: Map<string, ResourceTiming[]> = new Map();
  private userTimings: Map<string, UserTiming[]> = new Map();
  private coreWebVitals: Map<string, CoreWebVitals[]> = new Map();
  private longTasks: Map<string, LongTask[]> = new Map();
  private memorySnapshots: Map<string, MemoryInfo[]> = new Map();
  private customMarks: Map<string, PerformanceEntry[]> = new Map();
  private customMeasures: Map<string, PerformanceEntry[]> = new Map();
  
  private observer?: PerformanceObserver;
  private scenarioPages: Map<string, any> = new Map();
  
  private thresholds: {
    FCP: number;
    LCP: number;
    FID: number;
    CLS: number;
    TTFB: number;
    TTI: number;
    TBT: number;
    INP: number;
    pageLoad: number;
    resourceLoad: number;
    [key: string]: number;
  } = {
    FCP: 1800,
    LCP: 2500,
    FID: 100,
    CLS: 0.1,
    TTFB: 800,
    TTI: 3800,
    TBT: 200,
    INP: 200,
    pageLoad: 3000,
    resourceLoad: 1000
  };

  private constructor() {
    this.setupPerformanceObserver();
  }

  static getInstance(): PerformanceCollector {
    if (!PerformanceCollector.instance) {
      PerformanceCollector.instance = new PerformanceCollector();
    }
    return PerformanceCollector.instance;
  }

  async collect(): Promise<Evidence[]> {
    return this.getEvidence();
  }

  async initialize(executionId: string, options: CollectorOptions = {}): Promise<void> {
    try {
      this.executionId = executionId;
      this.options = {
        collectWebVitals: ConfigurationManager.getBoolean('COLLECT_WEB_VITALS', true),
        performancebudget: (ConfigurationManager as any).getJSON ? (ConfigurationManager as any).getJSON('PERFORMANCE_BUDGET') : [],
        ...options
      } as any;

      this.performancePath = path.join(
        ConfigurationManager.get('EVIDENCE_PATH', './evidence'),
        'performance',
        executionId
      );
      await fs.promises.mkdir(this.performancePath, { recursive: true });

      if (this.options.performancebudget && Array.isArray(this.options.performancebudget)) {
        const thresholdObj: Record<string, number> = {};
        this.options.performancebudget.forEach((threshold: PerformanceThreshold) => {
          thresholdObj[threshold.metric] = threshold.threshold;
        });
        this.thresholds = { ...this.thresholds, ...thresholdObj };
      }

      ActionLogger.logInfo('PerformanceCollector initialized', { executionId, options: this.options });
    } catch (error) {
      ActionLogger.logError('Failed to initialize PerformanceCollector', error as Error);
      throw error;
    }
  }

  private setupPerformanceObserver(): void {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.processServerPerformanceEntry(entry);
      }
    });

    try {
      this.observer.observe({ entryTypes: ['measure', 'mark', 'function', 'gc'] });
    } catch (error) {
      this.observer.observe({ entryTypes: ['measure', 'mark'] });
    }
  }

  private processServerPerformanceEntry(entry: PerformanceEntry): void {
    if (entry.entryType === 'mark') {
      if (!this.customMarks.has(this.executionId)) {
        this.customMarks.set(this.executionId, []);
      }
      this.customMarks.get(this.executionId)!.push(entry);
    } else if (entry.entryType === 'measure') {
      if (!this.customMeasures.has(this.executionId)) {
        this.customMeasures.set(this.executionId, []);
      }
      this.customMeasures.get(this.executionId)!.push(entry);
    }
  }

  async collectForScenario(scenarioId: string, scenarioName: string): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      this.navigationTimings.set(scenarioId, []);
      this.resourceTimings.set(scenarioId, []);
      this.userTimings.set(scenarioId, []);
      this.coreWebVitals.set(scenarioId, []);
      this.longTasks.set(scenarioId, []);
      this.memorySnapshots.set(scenarioId, []);

      performance.mark(`scenario-start-${scenarioId}`);

      ActionLogger.logInfo(`Started performance collection for scenario: ${scenarioName}`, { scenarioId });

    } catch (error) {
      ActionLogger.logError(`Failed to collect performance for scenario ${scenarioId}`, error as Error);
    }

    return evidence;
  }

  async collectForStep(
    scenarioId: string,
    stepId: string,
    _stepText: string,
    status: 'passed' | 'failed' | 'skipped'
  ): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      const stepKey = `${scenarioId}-${stepId}`;
      
      performance.mark(`step-${status}-${stepKey}`);
      
      try {
        performance.measure(
          `step-duration-${stepKey}`,
          `step-start-${stepKey}`,
          `step-${status}-${stepKey}`
        );
      } catch (error) {
      }

      const page = this.scenarioPages.get(scenarioId);
      if (page) {
        await this.collectBrowserMetrics(scenarioId, page);
        
        if (status === 'failed') {
          const report = await this.generatePerformanceSnapshot(scenarioId, `step-failed-${stepId}`);
          evidence.push(report);
        }
      }

    } catch (error) {
      ActionLogger.logError(`Failed to collect step performance for ${stepId}`, error as Error);
    }

    return evidence;
  }

  async collectBrowserMetrics(scenarioId: string, page: any): Promise<void> {
    try {
      const metrics = await page.evaluate(() => {
        const getNavigationTiming = () => {
          const navigation = (performance as any).getEntriesByType('navigation')[0] as any;
          if (!navigation) return null;
          
          return {
            timestamp: Date.now(),
            url: window.location.href,
            fetchStart: navigation.fetchStart,
            domainLookupStart: navigation.domainLookupStart,
            domainLookupEnd: navigation.domainLookupEnd,
            connectStart: navigation.connectStart,
            connectEnd: navigation.connectEnd,
            secureConnectionStart: navigation.secureConnectionStart,
            requestStart: navigation.requestStart,
            responseStart: navigation.responseStart,
            responseEnd: navigation.responseEnd,
            domInteractive: navigation.domInteractive,
            domContentLoadedEventStart: navigation.domContentLoadedEventStart,
            domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
            domComplete: navigation.domComplete,
            loadEventStart: navigation.loadEventStart,
            loadEventEnd: navigation.loadEventEnd,
            dns: navigation.domainLookupEnd - navigation.domainLookupStart,
            tcp: navigation.connectEnd - navigation.connectStart,
            ssl: navigation.secureConnectionStart > 0 ? navigation.connectEnd - navigation.secureConnectionStart : 0,
            ttfb: navigation.responseStart - navigation.fetchStart,
            transfer: navigation.responseEnd - navigation.responseStart,
            domProcessing: navigation.domComplete - navigation.domInteractive,
            onLoad: navigation.loadEventEnd - navigation.loadEventStart,
            total: navigation.loadEventEnd - navigation.fetchStart,
            redirectCount: navigation.redirectCount,
            type: navigation.type,
            protocol: navigation.nextHopProtocol,
            transferSize: navigation.transferSize,
            encodedBodySize: navigation.encodedBodySize,
            decodedBodySize: navigation.decodedBodySize,
            serverTiming: navigation.serverTiming || []
          };
        };

        const getResourceTimings = () => {
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          return resources.map(resource => ({
            name: resource.name,
            entryType: resource.entryType,
            startTime: resource.startTime,
            duration: resource.duration,
            initiatorType: resource.initiatorType,
            nextHopProtocol: resource.nextHopProtocol,
            workerStart: resource.workerStart,
            redirectStart: resource.redirectStart,
            redirectEnd: resource.redirectEnd,
            fetchStart: resource.fetchStart,
            domainLookupStart: resource.domainLookupStart,
            domainLookupEnd: resource.domainLookupEnd,
            connectStart: resource.connectStart,
            connectEnd: resource.connectEnd,
            secureConnectionStart: resource.secureConnectionStart,
            requestStart: resource.requestStart,
            responseStart: resource.responseStart,
            responseEnd: resource.responseEnd,
            transferSize: resource.transferSize,
            encodedBodySize: resource.encodedBodySize,
            decodedBodySize: resource.decodedBodySize,
            serverTiming: resource.serverTiming || [],
            dns: resource.domainLookupEnd - resource.domainLookupStart,
            tcp: resource.connectEnd - resource.connectStart,
            ssl: resource.secureConnectionStart > 0 ? resource.connectEnd - resource.secureConnectionStart : 0,
            ttfb: resource.responseStart - resource.startTime,
            download: resource.responseEnd - resource.responseStart,
            cached: resource.transferSize === 0 && resource.decodedBodySize > 0
          }));
        };

        const getPaintTimings = () => {
          const paints = (performance as any).getEntriesByType('paint');
          const paintTimings: any = {};
          paints.forEach((paint: any) => {
            paintTimings[paint.name] = paint.startTime;
          });
          return paintTimings;
        };

        const getLargestContentfulPaint = () => {
          return new Promise(resolve => {
            new PerformanceObserver(list => {
              const entries = list.getEntries();
              const lastEntry = entries[entries.length - 1];
              if (!lastEntry) {
                resolve(null);
                return;
              }
              resolve({
                value: lastEntry.startTime,
                element: (lastEntry as any).element?.tagName,
                url: (lastEntry as any).url,
                size: (lastEntry as any).size,
                loadTime: (lastEntry as any).loadTime,
                renderTime: lastEntry.startTime
              });
            }).observe({ entryTypes: ['largest-contentful-paint' as any] });
            
            setTimeout(() => resolve(null), 10000);
          });
        };

        const getFirstInputDelay = () => {
          return new Promise(resolve => {
            new PerformanceObserver(list => {
              const firstInput = list.getEntries()[0] as any;
              resolve({
                value: firstInput.processingStart - firstInput.startTime,
                target: firstInput.target?.tagName,
                type: firstInput.name
              });
            }).observe({ entryTypes: ['first-input' as any] });
            
            setTimeout(() => resolve(null), 10000);
          });
        };

        const getCumulativeLayoutShift = () => {
          let clsValue = 0;
          let clsEntries: any[] = [];
          
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!(entry as any).hadRecentInput) {
                clsValue += (entry as any).value;
                clsEntries.push({
                  value: (entry as any).value,
                  startTime: entry.startTime,
                  sources: (entry as any).sources?.map((s: any) => ({
                    node: s.node?.tagName,
                    previousRect: s.previousRect,
                    currentRect: s.currentRect
                  }))
                });
              }
            }
          }).observe({ entryTypes: ['layout-shift'] as any });
          
          return { value: clsValue, entries: clsEntries };
        };

        const getInteractionToNextPaint = () => {
          const interactions: any[] = [];
          
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              interactions.push({
                duration: entry.duration,
                startTime: entry.startTime,
                processingStart: (entry as any).processingStart,
                processingEnd: (entry as any).processingEnd,
                inputDelay: (entry as any).processingStart - entry.startTime,
                processingTime: (entry as any).processingEnd - (entry as any).processingStart,
                presentationDelay: entry.startTime + entry.duration - (entry as any).processingEnd,
                target: (entry as any).target?.tagName
              });
            }
          }).observe({ entryTypes: ['event' as any] });
          
          const sortedDurations = interactions.map(i => i.duration).sort((a, b) => a - b);
          const p75Index = Math.floor(sortedDurations.length * 0.75);
          
          return {
            value: sortedDurations[p75Index] || 0,
            interactions: interactions.slice(-10)
          };
        };

        const getLongTasks = () => {
          const tasks: any[] = [];
          
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              tasks.push({
                startTime: entry.startTime,
                duration: entry.duration,
                attribution: (entry as any).attribution?.map((attr: any) => ({
                  name: attr.name,
                  entryType: attr.entryType,
                  startTime: attr.startTime,
                  duration: attr.duration,
                  containerType: attr.containerType,
                  containerSrc: attr.containerSrc,
                  containerId: attr.containerId,
                  containerName: attr.containerName
                }))
              });
            }
          }).observe({ entryTypes: ['longtask' as any] });
          
          return tasks;
        };

        const getMemoryInfo = () => {
          if ((performance as any).memory) {
            return {
              totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
              usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
              jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
              usagePercent: ((performance as any).memory.usedJSHeapSize / (performance as any).memory.jsHeapSizeLimit) * 100
            };
          }
          return null;
        };

        const getUserTimings = () => {
          const marks = (performance as any).getEntriesByType('mark');
          const measures = (performance as any).getEntriesByType('measure');
          
          return {
            marks: marks.map((m: any) => ({
              name: m.name,
              startTime: m.startTime,
              detail: (m as any).detail
            })),
            measures: measures.map((m: any) => ({
              name: m.name,
              startTime: m.startTime,
              duration: m.duration,
              detail: (m as any).detail
            }))
          };
        };

        return {
          navigation: getNavigationTiming(),
          resources: getResourceTimings(),
          paints: getPaintTimings(),
          lcp: getLargestContentfulPaint(),
          fid: getFirstInputDelay(),
          cls: getCumulativeLayoutShift(),
          inp: getInteractionToNextPaint(),
          longTasks: getLongTasks(),
          memory: getMemoryInfo(),
          userTimings: getUserTimings()
        };
      });

      if (metrics.navigation) {
        this.navigationTimings.get(scenarioId)!.push(metrics.navigation);
      }

      if (metrics.resources && metrics.resources.length > 0) {
        const existing = this.resourceTimings.get(scenarioId) || [];
        this.resourceTimings.set(scenarioId, [...existing, ...metrics.resources]);
      }

      await this.processCoreWebVitals(scenarioId, metrics);

      if (metrics.longTasks && metrics.longTasks.length > 0) {
        const existing = this.longTasks.get(scenarioId) || [];
        this.longTasks.set(scenarioId, [...existing, ...metrics.longTasks]);
      }

      if (metrics.memory) {
        this.memorySnapshots.get(scenarioId)!.push({
          timestamp: Date.now(),
          ...metrics.memory
        });
      }

      if (metrics.userTimings) {
        const userTimingEntry: UserTiming = {
          name: 'userTimings',
          entryType: 'measure',
          startTime: Date.now(),
          duration: 0,
          timestamp: Date.now(),
          marks: metrics.userTimings.marks,
          measures: metrics.userTimings.measures
        };
        this.userTimings.get(scenarioId)!.push(userTimingEntry);
      }

      await this.checkPerformanceBudget(scenarioId, metrics);

    } catch (error) {
      ActionLogger.logError('Failed to collect browser metrics', error as Error);
    }
  }

  private async processCoreWebVitals(scenarioId: string, metrics: any): Promise<void> {
    const vitals: CoreWebVitals = {
      timestamp: Date.now(),
      url: this.navigationTimings.get(scenarioId)?.[0]?.url || '',
      FCP: metrics.paints?.['first-contentful-paint'] || 0,
      LCP: 0,
      FID: 0,
      CLS: 0,
      TTFB: metrics.navigation?.ttfb || 0,
      INP: 0
    };

    if (metrics.lcp) {
      const lcpData = await metrics.lcp;
      if (lcpData) {
        vitals.LCP = lcpData.value;
        vitals.LCPDetails = lcpData;
      }
    }

    if (metrics.fid) {
      const fidData = await metrics.fid;
      if (fidData) {
        vitals.FID = fidData.value;
        vitals.FIDDetails = fidData;
      }
    }

    if (metrics.cls) {
      vitals.CLS = metrics.cls.value;
      vitals.CLSDetails = metrics.cls;
    }

    if (metrics.inp) {
      vitals.INP = metrics.inp.value;
      vitals.INPDetails = metrics.inp;
    }

    if (metrics.navigation) {
      vitals.TTI = this.calculateTimeToInteractive(metrics.navigation, metrics.longTasks || []);
      vitals.TBT = this.calculateTotalBlockingTime(metrics.longTasks || [], vitals['FCP'] || 0, vitals.TTI || 0);
      vitals.SI = await this.calculateSpeedIndex(scenarioId);
    }

    this.coreWebVitals.get(scenarioId)!.push(vitals);
  }

  private calculateTimeToInteractive(navigation: NavigationTiming, longTasks: LongTask[]): number {
    
    const fcp = navigation.responseEnd;
    const dcl = navigation.domContentLoadedEventEnd;
    
    let tti = Math.max(fcp, dcl);
    
    const sortedTasks = longTasks.sort((a, b) => a.startTime - b.startTime);
    for (const task of sortedTasks) {
      if (task.startTime > tti) {
        tti = task.startTime + (task.duration || 0);
      }
    }
    
    return tti + 5000;
  }

  private calculateTotalBlockingTime(longTasks: LongTask[], fcp: number, tti: number): number {
    let tbt = 0;
    
    for (const task of longTasks) {
      if (task.startTime > fcp && task.startTime < tti) {
        if (task.duration > 50) {
          tbt += task.duration - 50;
        }
      }
    }
    
    return tbt;
  }

  private async calculateSpeedIndex(scenarioId: string): Promise<number> {
    const page = this.scenarioPages.get(scenarioId);
    if (!page) return 0;

    try {
      const speedIndex = await page.evaluate(async () => {
        const elements = document.querySelectorAll('*');
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight
        };
        
        const visualProgressData: Array<{time: number, completeness: number}> = [];
        const observedElements = new Map<Element, {visible: boolean, area: number, time: number}>();
        
        const totalViewportArea = viewport.width * viewport.height;
        let visibleArea = 0;
        
        elements.forEach(element => {
          const rect = element.getBoundingClientRect();
          const styles = window.getComputedStyle(element);
          
          if (rect.width > 0 && rect.height > 0 && 
              styles.display !== 'none' && 
              styles.visibility !== 'hidden' &&
              styles.opacity !== '0') {
            
            const intersectionRect = {
              left: Math.max(0, rect.left),
              top: Math.max(0, rect.top),
              right: Math.min(viewport.width, rect.right),
              bottom: Math.min(viewport.height, rect.bottom)
            };
            
            const intersectionArea = Math.max(0, intersectionRect.right - intersectionRect.left) * 
                                   Math.max(0, intersectionRect.bottom - intersectionRect.top);
            
            if (intersectionArea > 0) {
              observedElements.set(element, {
                visible: true,
                area: intersectionArea,
                time: performance.now()
              });
              visibleArea += intersectionArea;
            }
          }
        });
        
        const paintEvents = (performance as any).getEntriesByType('paint');
        const resourceTimings = (performance as any).getEntriesByType('resource') as PerformanceResourceTiming[];
        
        const timeline: Array<{time: number, area: number}> = [];
        
        const fcp = paintEvents.find((p: any) => p.name === 'first-contentful-paint');
        if (fcp) {
          timeline.push({time: fcp.startTime, area: 0});
        }
        
        const images = Array.from(document.querySelectorAll('img'));
        images.forEach(img => {
          const rect = img.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const area = rect.width * rect.height;
            const resource = resourceTimings.find(r => r.name === img.src);
            if (resource) {
              timeline.push({
                time: resource.responseEnd,
                area: area
              });
            }
          }
        });
        
        timeline.sort((a, b) => a.time - b.time);
        
        let cumulativeArea = 0;
        let lastTime = 0;
        let speedIndexSum = 0;
        
        timeline.forEach((event, _index) => {
          const timeDelta = event.time - lastTime;
          const incompleteness = 1 - (cumulativeArea / totalViewportArea);
          speedIndexSum += timeDelta * incompleteness;
          
          cumulativeArea = Math.min(cumulativeArea + event.area, totalViewportArea);
          lastTime = event.time;
          
          visualProgressData.push({
            time: event.time,
            completeness: (cumulativeArea / totalViewportArea) * 100
          });
        });
        
        const navTiming = (performance as any).getEntriesByType('navigation')[0] as any;
        const loadTime = navTiming ? (navTiming.loadEventEnd || navTiming.duration) : 0;
        if (lastTime < loadTime) {
          const timeDelta = loadTime - lastTime;
          const incompleteness = 1 - (cumulativeArea / totalViewportArea);
          speedIndexSum += timeDelta * incompleteness;
        }
        
        return speedIndexSum;
      });
      
      return speedIndex;
    } catch (error) {
      const navigation = this.navigationTimings.get(scenarioId)?.[0];
      const resources = this.resourceTimings.get(scenarioId) || [];
      
      if (!navigation) return 0;
      
      const criticalResources = resources.filter(r => 
        r.initiatorType === 'css' || 
        r.initiatorType === 'img' || 
        r.initiatorType === 'script'
      );
      
      criticalResources.sort((a, b) => a.responseEnd - b.responseEnd);
      
      let speedIndex = 0;
      let lastTime = 0;
      let loadedBytes = 0;
      const totalBytes = criticalResources.reduce((sum, r) => sum + (r.decodedBodySize || 0), 0);
      
      criticalResources.forEach(resource => {
        const timeDelta = resource.responseEnd - lastTime;
        const incompleteness = 1 - (loadedBytes / totalBytes);
        speedIndex += timeDelta * incompleteness;
        
        loadedBytes += resource.decodedBodySize || 0;
        lastTime = resource.responseEnd;
      });
      
      return speedIndex;
    }
  }

  private async checkPerformanceBudget(scenarioId: string, metrics: any): Promise<void> {
    const violations: string[] = [];
    
    const vitals = this.coreWebVitals.get(scenarioId)?.slice(-1)[0];
    if (vitals) {
      if (vitals['FCP'] !== undefined && vitals['FCP'] > this.thresholds['FCP']) {
        violations.push(`FCP (${vitals['FCP']}ms) exceeds threshold (${this.thresholds['FCP']}ms)`);
      }
      if (vitals['LCP'] !== undefined && vitals['LCP'] > this.thresholds['LCP']) {
        violations.push(`LCP (${vitals['LCP']}ms) exceeds threshold (${this.thresholds['LCP']}ms)`);
      }
      if (vitals['FID'] !== undefined && vitals['FID'] > this.thresholds['FID']) {
        violations.push(`FID (${vitals['FID']}ms) exceeds threshold (${this.thresholds['FID']}ms)`);
      }
      if (vitals['CLS'] !== undefined && vitals['CLS'] > this.thresholds['CLS']) {
        violations.push(`CLS (${vitals['CLS']}) exceeds threshold (${this.thresholds['CLS']})`);
      }
      if (vitals['TTFB'] !== undefined && vitals['TTFB'] > this.thresholds['TTFB']) {
        violations.push(`TTFB (${vitals['TTFB']}ms) exceeds threshold (${this.thresholds['TTFB']}ms)`);
      }
    }
    
    if (metrics.navigation && metrics.navigation.total !== undefined && metrics.navigation.total > this.thresholds['pageLoad']) {
      violations.push(`Page load time (${metrics.navigation.total}ms) exceeds threshold (${this.thresholds['pageLoad']}ms)`);
    }
    
    const slowResources = metrics.resources?.filter((r: ResourceTiming) => 
      r.duration > this.thresholds['resourceLoad']
    ) || [];
    
    if (slowResources.length > 0) {
      violations.push(`${slowResources.length} resources exceed load time threshold (${this.thresholds['resourceLoad']}ms)`);
    }
    
    if (violations.length > 0) {
      ActionLogger.logWarn('Performance budget violations detected', {
        scenarioId,
        violations,
        url: metrics.navigation?.url
      });
    }
  }

  async registerPage(scenarioId: string, page: any): Promise<void> {
    this.scenarioPages.set(scenarioId, page);
    
    await page.evaluateOnNewDocument(() => {
      window.addEventListener('load', () => {
        if ('PerformanceObserver' in window) {
          try {
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                console.log('[PERF]', entry);
              }
            }).observe({ 
              entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift', 'longtask'] as any
            });
          } catch (e) {
          }
        }
      });
    });
  }

  private async generatePerformanceSnapshot(scenarioId: string, reason: string): Promise<Evidence> {
    const snapshot: PerformanceReport = {
      timestamp: Date.now(),
      scenarioId,
      reason,
      navigation: this.navigationTimings.get(scenarioId)?.slice(-1)[0] || null,
      resources: this.resourceTimings.get(scenarioId) || [],
      webVitals: this.coreWebVitals.get(scenarioId)?.slice(-1)[0] || null,
      longTasks: this.longTasks.get(scenarioId) || [],
      memory: this.memorySnapshots.get(scenarioId)?.slice(-1)[0] || null,
      userTimings: this.userTimings.get(scenarioId)?.slice(-1)[0] || null,
      summary: this.generateSummary(scenarioId)
    };

    const filename = `performance-${reason}-${Date.now()}.json`;
    const filepath = path.join(this.performancePath, filename);
    await writeFileAsync(filepath, JSON.stringify(snapshot, null, 2));

    return {
      id: `performance-snapshot-${Date.now()}`,
      type: 'performance' as EvidenceType,
      scenarioId,
      timestamp: snapshot.timestamp,
      path: filepath,
      size: Buffer.byteLength(JSON.stringify(snapshot)),
      metadata: {
        reason,
        hasViolations: snapshot.summary.violations.length > 0,
        webVitalsScore: snapshot.summary.score
      },
      tags: ['performance', 'snapshot', reason]
    };
  }

  private generateSummary(scenarioId: string): PerformanceSummary {
    const navigation = this.navigationTimings.get(scenarioId)?.slice(-1)[0];
    const vitals = this.coreWebVitals.get(scenarioId)?.slice(-1)[0];
    const resources = this.resourceTimings.get(scenarioId) || [];
    
    const scores = {
      FCP: this.calculateMetricScore(vitals && vitals['FCP'] !== undefined ? vitals['FCP'] : 0, this.thresholds['FCP']),
      LCP: this.calculateMetricScore(vitals && vitals['LCP'] !== undefined ? vitals['LCP'] : 0, this.thresholds['LCP']),
      FID: this.calculateMetricScore(vitals && vitals['FID'] !== undefined ? vitals['FID'] : 0, this.thresholds['FID']),
      CLS: this.calculateCLSScore(vitals && vitals['CLS'] !== undefined ? vitals['CLS'] : 0),
      TTFB: this.calculateMetricScore(vitals && vitals['TTFB'] !== undefined ? vitals['TTFB'] : 0, this.thresholds['TTFB'])
    };
    
    const overallScore = (
      scores.FCP * 0.1 +
      scores.LCP * 0.25 +
      scores.FID * 0.3 +
      scores.CLS * 0.25 +
      scores.TTFB * 0.1
    );
    
    const violations: string[] = [];
    if (scores.FCP < 0.5) violations.push('Poor First Contentful Paint');
    if (scores.LCP < 0.5) violations.push('Poor Largest Contentful Paint');
    if (scores.FID < 0.5) violations.push('Poor First Input Delay');
    if (scores.CLS < 0.5) violations.push('Poor Cumulative Layout Shift');
    if (scores.TTFB < 0.5) violations.push('Poor Time to First Byte');
    
    const resourceStats = {
      total: resources.length,
      cached: resources.filter(r => (r as any).cached).length,
      totalSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      totalDuration: resources.reduce((sum, r) => sum + r.duration, 0),
      byType: this.groupResourcesByType(resources)
    };
    
    return {
      score: overallScore,
      scores,
      grade: this.getPerformanceGrade(overallScore),
      violations,
      metrics: {
        pageLoad: navigation?.total || 0,
        domReady: navigation?.domComplete || 0,
        resources: resourceStats,
        webVitals: vitals || {} as CoreWebVitals
      },
      recommendations: this.generateRecommendations(scenarioId)
    };
  }

  private calculateMetricScore(value: number, threshold: number): number {
    if (value <= threshold * 0.75) return 1;
    if (value <= threshold) return 0.75;
    if (value <= threshold * 1.5) return 0.5;
    return 0.25;
  }

  private calculateCLSScore(cls: number): number {
    if (cls <= 0.1) return 1;
    if (cls <= 0.25) return 0.75;
    return 0.5;
  }

  private getPerformanceGrade(score: number): string {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }

  private groupResourcesByType(resources: ResourceTiming[]): any {
    const byType: any = {};
    
    resources.forEach(resource => {
      if (!byType[resource.initiatorType]) {
        byType[resource.initiatorType] = {
          count: 0,
          size: 0,
          duration: 0,
          cached: 0
        };
      }
      
      byType[resource.initiatorType].count++;
      byType[resource.initiatorType].size += resource.transferSize || 0;
      byType[resource.initiatorType].duration += resource.duration;
      if ((resource as any).cached) byType[resource.initiatorType].cached++;
    });
    
    return byType;
  }

  private generateRecommendations(scenarioId: string): string[] {
    const recommendations: string[] = [];
    const vitals = this.coreWebVitals.get(scenarioId)?.slice(-1)[0];
    const resources = this.resourceTimings.get(scenarioId) || [];
    const navigation = this.navigationTimings.get(scenarioId)?.slice(-1)[0];
    
    if (vitals && vitals['FCP'] !== undefined && vitals['FCP'] > this.thresholds['FCP']) {
      recommendations.push('Reduce server response time and eliminate render-blocking resources to improve FCP');
    }
    
    if (vitals && vitals['LCP'] !== undefined && vitals['LCP'] > this.thresholds['LCP']) {
      recommendations.push('Optimize largest content element loading (images, videos, or large text blocks)');
      if (vitals.LCPDetails?.element) {
        recommendations.push(`Consider optimizing the ${vitals.LCPDetails.element} element`);
      }
    }
    
    if (vitals && vitals['CLS'] !== undefined && vitals['CLS'] > this.thresholds['CLS']) {
      recommendations.push('Add size attributes to images and videos to prevent layout shifts');
      recommendations.push('Avoid inserting content above existing content');
    }
    
    if (vitals && vitals['TTFB'] !== undefined && vitals['TTFB'] > this.thresholds['TTFB']) {
      recommendations.push('Improve server response time - consider caching, CDN, or server optimization');
    }
    
    const uncachedResources = resources.filter(r => !(r as any).cached);
    if (uncachedResources.length > resources.length * 0.5) {
      recommendations.push('Enable caching for static resources to improve load times');
    }
    
    const largeResources = resources.filter(r => (r.transferSize || 0) > 500000);
    if (largeResources.length > 0) {
      recommendations.push(`Optimize ${largeResources.length} large resources (>500KB)`);
    }
    
    const longTasks = this.longTasks.get(scenarioId) || [];
    if (longTasks.length > 5) {
      recommendations.push('Break up long JavaScript tasks to improve interactivity');
    }
    
    const memorySnapshots = this.memorySnapshots.get(scenarioId) || [];
    if (memorySnapshots.length > 1) {
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      if (firstSnapshot && lastSnapshot) {
        const memoryGrowth = ((lastSnapshot.usedJSHeapSize - firstSnapshot.usedJSHeapSize) / firstSnapshot.usedJSHeapSize) * 100;
        
        if (memoryGrowth > 50) {
          recommendations.push(`Memory usage increased by ${memoryGrowth.toFixed(1)}% - check for memory leaks`);
        }
      }
    }
    
    const thirdPartyResources = resources.filter(r => {
      try {
        const resourceUrl = new URL(r.name);
        const pageUrl = new URL(navigation?.url || '');
        return resourceUrl.hostname !== pageUrl.hostname;
      } catch {
        return false;
      }
    });
    
    if (thirdPartyResources.length > resources.length * 0.3) {
      recommendations.push('Reduce dependency on third-party resources');
    }
    
    return recommendations;
  }

  getEvidence(): Evidence[] {
    const evidence: Evidence[] = [];
    
    for (const [scenarioId, timings] of Array.from(this.navigationTimings.entries())) {
      evidence.push({
        id: `nav-${scenarioId}`,
        type: EvidenceType.PERFORMANCE,
        timestamp: Date.now(),
        data: timings,
        scenarioId,
        path: path.join(this.performancePath, scenarioId, 'navigation.json'),
        size: JSON.stringify(timings).length
      });
    }
    
    return evidence;
  }

  clear(): void {
    this.navigationTimings.clear();
    this.resourceTimings.clear();
    this.userTimings.clear();
    this.coreWebVitals.clear();
    this.longTasks.clear();
    this.memorySnapshots.clear();
    this.customMarks.clear();
    this.customMeasures.clear();
    this.scenarioPages.clear();
  }

  async finalize(): Promise<void> {
    const evidence: Evidence[] = [];
    
    try {
      const report = await this.generateFinalReport(this.executionId);
      
      const reportPath = path.join(this.performancePath, 'performance-report.json');
      await writeFileAsync(reportPath, JSON.stringify(report, null, 2));
      
      evidence.push({
        id: `performance-report-${this.executionId}`,
        type: 'performance' as EvidenceType,
        scenarioId: this.executionId,
        timestamp: Date.now(),
        path: reportPath,
        size: Buffer.byteLength(JSON.stringify(report)),
        metadata: {
          totalScenarios: this.navigationTimings.size,
          overallScore: report.summary.overallScore,
          grade: report.summary.grade
        },
        tags: ['performance', 'report', 'final']
      });

      const analysisPath = await this.generateDetailedAnalysis(this.executionId);
      evidence.push({
        id: `performance-analysis-${this.executionId}`,
        type: 'performance' as EvidenceType,
        scenarioId: this.executionId,
        timestamp: Date.now(),
        path: analysisPath,
        size: fs.statSync(analysisPath).size,
        metadata: { type: 'detailed-analysis' },
        tags: ['performance', 'analysis']
      });

      const waterfallPath = await this.generateResourceWaterfall(this.executionId);
      evidence.push({
        id: `performance-waterfall-${this.executionId}`,
        type: 'performance' as EvidenceType,
        scenarioId: this.executionId,
        timestamp: Date.now(),
        path: waterfallPath,
        size: fs.statSync(waterfallPath).size,
        metadata: { type: 'waterfall' },
        tags: ['performance', 'waterfall']
      });

      const filmstripPath = await this.generateFilmstrip(this.executionId);
      if (filmstripPath) {
        evidence.push({
          id: `performance-filmstrip-${this.executionId}`,
          type: 'performance' as EvidenceType,
          scenarioId: this.executionId,
          timestamp: Date.now(),
          path: filmstripPath,
          size: fs.statSync(filmstripPath).size,
          metadata: { type: 'filmstrip' },
          tags: ['performance', 'visual']
        });
      }

      this.cleanup();

      ActionLogger.logInfo('PerformanceCollector finalized', {
        executionId: this.executionId,
        totalScenarios: this.navigationTimings.size,
        evidenceGenerated: evidence.length
      });

    } catch (error) {
      ActionLogger.logError('Failed to finalize PerformanceCollector', error as Error);
    }
  }

  private async generateFinalReport(executionId: string): Promise<any> {
    const scenarios: any[] = [];
    
    for (const [scenarioId, navigations] of Array.from(this.navigationTimings.entries())) {
      const scenarioReport = {
        scenarioId,
        executions: navigations.length,
        navigation: this.aggregateNavigationTimings(navigations),
        resources: this.analyzeResources(scenarioId),
        webVitals: this.aggregateWebVitals(scenarioId),
        longTasks: this.analyzeLongTasks(scenarioId),
        memory: this.analyzeMemory(scenarioId),
        summary: this.generateSummary(scenarioId)
      };
      
      scenarios.push(scenarioReport);
    }
    
    const overallScore = scenarios.reduce((sum, s) => sum + s.summary.score, 0) / scenarios.length;
    const overallGrade = this.getPerformanceGrade(overallScore);
    
    return {
      executionId,
      timestamp: Date.now(),
      scenarios,
      summary: {
        totalScenarios: scenarios.length,
        overallScore,
        grade: overallGrade,
        passedBudget: scenarios.filter(s => s.summary.violations.length === 0).length,
        failedBudget: scenarios.filter(s => s.summary.violations.length > 0).length,
        topViolations: this.getTopViolations(scenarios),
        recommendations: this.getOverallRecommendations(scenarios)
      },
      benchmarks: this.generateBenchmarks(scenarios)
    };
  }

  private aggregateNavigationTimings(timings: NavigationTiming[]): any {
    if (timings.length === 0) return null;
    
    const values = {
      dns: timings.map(t => t.dns),
      tcp: timings.map(t => t.tcp),
      ssl: timings.map(t => t.ssl),
      ttfb: timings.map(t => t.ttfb),
      transfer: timings.map(t => t.transfer),
      domProcessing: timings.map(t => t.domProcessing),
      onLoad: timings.map(t => t.onLoad),
      total: timings.map(t => t.total)
    };
    
    const result: any = {};
    for (const [key, vals] of Object.entries(values)) {
      result[key] = this.calculateStats(vals as number[]);
    }
    
    return result;
  }

  private analyzeResources(scenarioId: string): any {
    const resources = this.resourceTimings.get(scenarioId) || [];
    
    const byType = this.groupResourcesByType(resources);
    
    const slowest = [...resources]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map(r => ({
        name: r.name,
        duration: r.duration,
        size: r.transferSize || 0,
        type: r.initiatorType
      }));
    
    const largest = [...resources]
      .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
      .slice(0, 10)
      .map(r => ({
        name: r.name,
        size: r.transferSize || 0,
        duration: r.duration,
        type: r.initiatorType
      }));
    
    return {
      total: resources.length,
      byType,
      slowest,
      largest,
      cacheHitRate: resources.length > 0 ? (resources.filter(r => (r as any).cached).length / resources.length) * 100 : 0,
      totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      totalDuration: resources.reduce((sum, r) => sum + r.duration, 0)
    };
  }

  private aggregateWebVitals(scenarioId: string): any {
    const vitals = this.coreWebVitals.get(scenarioId) || [];
    if (vitals.length === 0) return null;
    
    return {
      FCP: this.calculateStats(vitals.map(v => v['FCP']).filter((v): v is number => v !== undefined)),
      LCP: this.calculateStats(vitals.map(v => v['LCP']).filter((v): v is number => v !== undefined)),
      FID: this.calculateStats(vitals.map(v => v['FID']).filter((v): v is number => v !== undefined && v > 0)),
      CLS: this.calculateStats(vitals.map(v => v['CLS']).filter((v): v is number => v !== undefined)),
      TTFB: this.calculateStats(vitals.map(v => v['TTFB']).filter((v): v is number => v !== undefined)),
      TTI: this.calculateStats(vitals.map(v => v.TTI || 0).filter(v => v > 0)),
      TBT: this.calculateStats(vitals.map(v => v.TBT || 0).filter(v => v > 0)),
      INP: this.calculateStats(vitals.map(v => v['INP']).filter((v): v is number => v !== undefined && v > 0))
    };
  }

  private analyzeLongTasks(scenarioId: string): any {
    const tasks = this.longTasks.get(scenarioId) || [];
    if (tasks.length === 0) return null;
    
    const durations = tasks.map(t => t.duration);
    
    return {
      count: tasks.length,
      totalDuration: durations.reduce((sum, d) => sum + d, 0),
      duration: this.calculateStats(durations),
      worstTasks: [...tasks]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map(t => ({
          duration: t.duration,
          startTime: t.startTime,
          attribution: t.attribution?.[0]?.containerName || 'Unknown'
        }))
    };
  }

  private analyzeMemory(scenarioId: string): any {
    const snapshots = this.memorySnapshots.get(scenarioId) || [];
    if (snapshots.length === 0) return null;
    
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    
    if (!first || !last) return null;
    
    return {
      initial: {
        used: first.usedJSHeapSize,
        total: first.totalJSHeapSize,
        limit: first.jsHeapSizeLimit
      },
      final: {
        used: last.usedJSHeapSize,
        total: last.totalJSHeapSize,
        limit: last.jsHeapSizeLimit
      },
      growth: {
        absolute: last.usedJSHeapSize - first.usedJSHeapSize,
        percentage: ((last.usedJSHeapSize - first.usedJSHeapSize) / first.usedJSHeapSize) * 100
      },
      peak: Math.max(...snapshots.map(s => s.usedJSHeapSize)),
      average: snapshots.reduce((sum, s) => sum + s.usedJSHeapSize, 0) / snapshots.length
    };
  }

  private calculateStats(values: number[]): any {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.90)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  private getTopViolations(scenarios: any[]): string[] {
    const violationCounts: Record<string, number> = {};
    
    scenarios.forEach(scenario => {
      scenario.summary.violations.forEach((violation: string) => {
        violationCounts[violation] = (violationCounts[violation] || 0) + 1;
      });
    });
    
    return Object.entries(violationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([violation, count]) => `${violation} (${count} scenarios)`);
  }

  private getOverallRecommendations(scenarios: any[]): string[] {
    const allRecommendations: Record<string, number> = {};
    
    scenarios.forEach(scenario => {
      scenario.summary.recommendations.forEach((rec: string) => {
        allRecommendations[rec] = (allRecommendations[rec] || 0) + 1;
      });
    });
    
    return Object.entries(allRecommendations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rec]) => rec);
  }

  private generateBenchmarks(_scenarios: any[]): any {
    const benchmarks = {
      webVitals: {
        FCP: { good: 1800, poor: 3000 },
        LCP: { good: 2500, poor: 4000 },
        FID: { good: 100, poor: 300 },
        CLS: { good: 0.1, poor: 0.25 },
        TTFB: { good: 800, poor: 1800 }
      },
      comparison: {
        industry: this.getIndustryBenchmarks(),
        previous: this.getPreviousRunBenchmarks()
      }
    };
    
    return benchmarks;
  }

  private getIndustryBenchmarks(): any {
    return {
      FCP: { p50: 1500, p75: 2500, p90: 4000 },
      LCP: { p50: 2000, p75: 3500, p90: 5500 },
      FID: { p50: 50, p75: 100, p90: 200 },
      CLS: { p50: 0.05, p75: 0.15, p90: 0.3 }
    };
  }

  private getPreviousRunBenchmarks(): any {
    return null;
  }

  private async generateDetailedAnalysis(executionId: string): Promise<string> {
    const analysis = {
      executionId,
      timestamp: new Date().toISOString(),
      sections: {
        networkAnalysis: this.analyzeNetworkPerformance(),
        renderingAnalysis: this.analyzeRenderingPerformance(),
        interactivityAnalysis: this.analyzeInteractivity(),
        resourceOptimization: this.analyzeResourceOptimization(),
        thirdPartyImpact: this.analyzeThirdPartyImpact()
      }
    };
    
    const filepath = path.join(this.performancePath, 'performance-analysis.json');
    await writeFileAsync(filepath, JSON.stringify(analysis, null, 2));
    
    return filepath;
  }

  private analyzeNetworkPerformance(): any {
    const allNavigations: NavigationTiming[] = [];
    this.navigationTimings.forEach(timings => {
      allNavigations.push(...timings);
    });
    
    return {
      dns: {
        average: this.average(allNavigations.map(n => n.dns)),
        recommendations: allNavigations.some(n => n.dns > 50) ? 
          ['Consider DNS prefetching for critical domains'] : []
      },
      tcp: {
        average: this.average(allNavigations.map(n => n.tcp)),
        sslOverhead: this.average(allNavigations.map(n => n.ssl).filter(s => s > 0)),
        recommendations: allNavigations.some(n => n.tcp > 100) ?
          ['Consider using HTTP/2 or HTTP/3 for connection reuse'] : []
      },
      ttfb: {
        average: this.average(allNavigations.map(n => n.ttfb).filter((t): t is number => t !== undefined)),
        breakdown: {
          redirect: this.average(allNavigations.map(n => n.redirectCount * 100)),
          serverProcessing: this.average(allNavigations.map(n => {
            if (n.ttfb !== undefined && n.tcp !== undefined && n.dns !== undefined) {
              return n.ttfb - n.tcp - n.dns;
            }
            return undefined;
          }).filter((t): t is number => t !== undefined))
        }
      }
    };
  }

  private analyzeRenderingPerformance(): any {
    const allVitals: CoreWebVitals[] = [];
    this.coreWebVitals.forEach(vitals => {
      allVitals.push(...vitals);
    });
    
    return {
      paintMetrics: {
        FCP: this.calculateStats(allVitals.map(v => v['FCP']).filter((v): v is number => v !== undefined)),
        LCP: this.calculateStats(allVitals.map(v => v['LCP']).filter((v): v is number => v !== undefined))
      },
      layoutStability: {
        CLS: this.calculateStats(allVitals.map(v => v['CLS']).filter((v): v is number => v !== undefined)),
        shiftSources: this.getLayoutShiftSources(allVitals)
      }
    };
  }

  private analyzeInteractivity(): any {
    const allVitals: CoreWebVitals[] = [];
    this.coreWebVitals.forEach(vitals => {
      allVitals.push(...vitals);
    });
    
    const allLongTasks: LongTask[] = [];
    this.longTasks.forEach(tasks => {
      allLongTasks.push(...tasks);
    });
    
    return {
      responsiveness: {
        FID: this.calculateStats(allVitals.map(v => v['FID']).filter((v): v is number => v !== undefined && v > 0)),
        INP: this.calculateStats(allVitals.map(v => v['INP']).filter((v): v is number => v !== undefined && v > 0))
      },
      blockingTime: {
        TBT: this.calculateStats(allVitals.map(v => v.TBT || 0).filter(v => v > 0)),
        longTasks: {
          count: allLongTasks.length,
          totalDuration: allLongTasks.reduce((sum, t) => sum + t.duration, 0)
        }
      }
    };
  }

  private analyzeResourceOptimization(): any {
    const allResources: ResourceTiming[] = [];
    this.resourceTimings.forEach(resources => {
      allResources.push(...resources);
    });
    
    const opportunities = [];
    
    const uncompressedResources = allResources.filter(r => 
      r.encodedBodySize === r.decodedBodySize && r.decodedBodySize > 1000
    );
    if (uncompressedResources.length > 0) {
      opportunities.push({
        type: 'compression',
        impact: 'high',
        resources: uncompressedResources.length,
        potentialSavings: uncompressedResources.reduce((sum, r) => 
          sum + (r.decodedBodySize * 0.7), 0
        )
      });
    }
    
    const uncachedResources = allResources.filter(r => !(r as any).cached);
    if (uncachedResources.length > allResources.length * 0.3) {
      opportunities.push({
        type: 'caching',
        impact: 'high',
        resources: uncachedResources.length,
        potentialSavings: uncachedResources.reduce((sum, r) => sum + r.duration, 0)
      });
    }
    
    return { opportunities };
  }

  private analyzeThirdPartyImpact(): any {
    const allResources: ResourceTiming[] = [];
    this.resourceTimings.forEach(resources => {
      allResources.push(...resources);
    });
    
    const thirdParty = allResources.filter(r => this.isThirdParty(r.name));
    
    return {
      count: thirdParty.length,
      totalSize: thirdParty.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      totalDuration: thirdParty.reduce((sum, r) => sum + r.duration, 0),
      percentage: allResources.length > 0 ? (thirdParty.length / allResources.length) * 100 : 0,
      byDomain: this.groupByDomain(thirdParty)
    };
  }

  private isThirdParty(url: string): boolean {
    try {
      const resourceUrl = new URL(url);
      return !resourceUrl.hostname.includes('localhost') && 
             !resourceUrl.hostname.includes('127.0.0.1');
    } catch {
      return false;
    }
  }

  private groupByDomain(resources: ResourceTiming[]): any {
    const byDomain: Record<string, any> = {};
    
    resources.forEach(resource => {
      try {
        const url = new URL(resource.name);
        const domain = url.hostname;
        
        if (!byDomain[domain]) {
          byDomain[domain] = {
            count: 0,
            size: 0,
            duration: 0
          };
        }
        
        byDomain[domain].count++;
        byDomain[domain].size += resource.transferSize || 0;
        byDomain[domain].duration += resource.duration;
      } catch {
      }
    });
    
    return byDomain;
  }

  private getLayoutShiftSources(vitals: CoreWebVitals[]): string[] {
    const sources = new Set<string>();
    
    vitals.forEach(v => {
      if (v.CLSDetails?.entries) {
        v.CLSDetails.entries.forEach((entry: any) => {
          if (entry.sources) {
            entry.sources.forEach((source: any) => {
              if (source.node) {
                sources.add(source.node);
              }
            });
          }
        });
      }
    });
    
    return Array.from(sources);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private async generateResourceWaterfall(_executionId: string): Promise<string> {
    const waterfall: any[] = [];
    
    for (const [scenarioId, resources] of Array.from(this.resourceTimings.entries())) {
      const navigation = this.navigationTimings.get(scenarioId)?.[0];
      if (!navigation) continue;
      
      const scenarioWaterfall = {
        scenarioId,
        startTime: navigation.fetchStart,
        entries: [
          {
            name: 'Navigation',
            type: 'navigation',
            startTime: 0,
            duration: navigation.total,
            phases: {
              dns: { start: navigation.domainLookupStart, end: navigation.domainLookupEnd },
              tcp: { start: navigation.connectStart, end: navigation.connectEnd },
              ssl: navigation.secureConnectionStart > 0 ? 
                { start: navigation.secureConnectionStart, end: navigation.connectEnd } : null,
              request: { start: navigation.requestStart, end: navigation.responseStart },
              response: { start: navigation.responseStart, end: navigation.responseEnd },
              dom: { start: navigation.domInteractive, end: navigation.domComplete },
              load: { start: navigation.loadEventStart, end: navigation.loadEventEnd }
            }
          },
          ...resources.map(r => ({
            name: r.name,
            type: r.initiatorType,
            startTime: r.startTime,
            duration: r.duration,
            size: r.transferSize || 0,
            cached: (r as any).cached,
            phases: {
              dns: r.domainLookupEnd - r.domainLookupStart > 0 ? { start: r.domainLookupStart, end: r.domainLookupEnd } : null,
              tcp: r.connectEnd - r.connectStart > 0 ? { start: r.connectStart, end: r.connectEnd } : null,
              ssl: r.secureConnectionStart > 0 ? { start: r.secureConnectionStart, end: r.connectEnd } : null,
              request: { start: r.requestStart, end: r.responseStart },
              response: { start: r.responseStart, end: r.responseEnd }
            }
          }))
        ].sort((a, b) => a.startTime - b.startTime)
      };
      
      waterfall.push(scenarioWaterfall);
    }
    
    const filepath = path.join(this.performancePath, 'resource-waterfall.json');
    await writeFileAsync(filepath, JSON.stringify(waterfall, null, 2));
    
    return filepath;
  }

  private async generateFilmstrip(executionId: string): Promise<string | null> {
    try {
      const filmstripData: any = {
        executionId,
        timestamp: Date.now(),
        scenarios: []
      };

      for (const [scenarioId, page] of Array.from(this.scenarioPages.entries())) {
        if (!page) continue;

        const client = await page.context().newCDPSession(page);
        
        await client.send('Tracing.start', {
          categories: ['devtools.timeline', 'v8.execute', 'blink.user_timing', 'disabled-by-default-devtools.screenshot'],
          options: 'sampling-frequency=10000',
          screenshots: true
        });

        await page.waitForLoadState('networkidle');

        await client.send('Tracing.end');
        
        const frames: Array<{timestamp: number, screenshot: string}> = [];
        let traceData = '';
        
        await new Promise<void>((resolve) => {
          client.on('Tracing.dataCollected', (params: any) => {
            traceData += params.value;
          });
          
          client.on('Tracing.tracingComplete', () => {
            resolve();
          });
        });

        const traceEvents = traceData.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(event => event !== null);

        for (const event of traceEvents) {
          if (event.name === 'Screenshot' && event.args && event.args.snapshot) {
            frames.push({
              timestamp: event.ts,
              screenshot: event.args.snapshot
            });
          }
        }

        const navigation = this.navigationTimings.get(scenarioId)?.[0];
        
        if (frames.length === 0) {
          if (navigation) {
            const keyMoments = [
              { name: 'start', time: 0 },
              { name: 'ttfb', time: navigation.ttfb || 0 },
              { name: 'fcp', time: this.coreWebVitals.get(scenarioId)?.[0]?.['FCP'] || navigation.responseEnd },
              { name: 'lcp', time: this.coreWebVitals.get(scenarioId)?.[0]?.['LCP'] || navigation.domComplete },
              { name: 'load', time: navigation.total || 0 }
            ];

            for (const moment of keyMoments) {
              try {
                await page.evaluate((time: number) => {
                  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                    const startTime = performance.now();
                    const animate = () => {
                      const elapsed = performance.now() - startTime;
                      if (elapsed < time) {
                        requestAnimationFrame(animate);
                      }
                    };
                    animate();
                  }
                }, moment.time);

                const screenshot = await page.screenshot({
                  type: 'jpeg',
                  quality: 75,
                  fullPage: false
                });

                frames.push({
                  timestamp: moment.time,
                  screenshot: screenshot.toString('base64')
                });
              } catch (error) {
                ActionLogger.logWarn(`Failed to capture screenshot at ${moment.name}`, { error });
              }
            }
          }
        }

        const visualProgression = this.analyzeVisualProgression(frames);
        
        filmstripData.scenarios.push({
          scenarioId,
          url: navigation?.url || page.url(),
          frames: frames.map((frame, index) => ({
            index,
            timestamp: frame.timestamp,
            screenshot: frame.screenshot,
            visualCompleteness: visualProgression[index] || 0
          })),
          keyFrames: this.identifyKeyFrames(frames, visualProgression),
          speedIndex: await this.calculateSpeedIndex(scenarioId)
        });

        await client.detach();
      }

      const filepath = path.join(this.performancePath, 'performance-filmstrip.json');
      await writeFileAsync(filepath, JSON.stringify(filmstripData, null, 2));

      const htmlPath = await this.generateFilmstripHTML(filmstripData);
      
      return htmlPath;
    } catch (error) {
      ActionLogger.logError('Failed to generate filmstrip', error as Error);
      return null;
    }
  }

  private analyzeVisualProgression(frames: Array<{timestamp: number, screenshot: string}>): number[] {
    if (frames.length === 0) return [];
    
    const progression: number[] = [];
    const firstFrame = frames[0] ? Buffer.from(frames[0].screenshot, 'base64') : null;
    const lastFrameData = frames[frames.length - 1];
    const lastFrame = lastFrameData ? Buffer.from(lastFrameData.screenshot, 'base64') : null;
    
    if (!firstFrame || !lastFrame) return [];
    
    frames.forEach((frame, index) => {
      if (index === 0) {
        progression.push(0);
      } else if (index === frames.length - 1) {
        progression.push(100);
      } else {
        const currentFrame = Buffer.from(frame.screenshot, 'base64');
        const similarity = this.calculateImageSimilarity(currentFrame, lastFrame);
        progression.push(similarity * 100);
      }
    });
    
    return progression;
  }

  private calculateImageSimilarity(image1: Buffer, image2: Buffer): number {
    const hash1 = this.calculatePerceptualHash(image1);
    const hash2 = this.calculatePerceptualHash(image2);
    
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    
    return 1 - (distance / hash1.length);
  }

  private calculatePerceptualHash(imageBuffer: Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(imageBuffer);
    return hash.digest('hex');
  }

  private identifyKeyFrames(
    frames: Array<{timestamp: number, screenshot: string}>, 
    progression: number[]
  ): Array<{index: number, type: string, timestamp: number}> {
    const keyFrames: Array<{index: number, type: string, timestamp: number}> = [];
    
    if (frames.length > 0) {
      keyFrames.push({
        index: 0,
        type: 'start',
        timestamp: frames[0]?.timestamp || 0
      });
    }
    
    for (let i = 1; i < progression.length; i++) {
      const frame = frames[i];
      const progressValue = progression[i];
      if (progressValue !== undefined && progressValue > 0 && frame) {
        keyFrames.push({
          index: i,
          type: 'first-visual-change',
          timestamp: frame.timestamp
        });
        break;
      }
    }
    
    const thresholds = [50, 85, 95, 100];
    thresholds.forEach(threshold => {
      for (let i = 0; i < progression.length; i++) {
        const frame = frames[i];
        const progressValue = progression[i];
        if (progressValue !== undefined && progressValue >= threshold && frame) {
          keyFrames.push({
            index: i,
            type: `visually-complete-${threshold}`,
            timestamp: frame.timestamp
          });
          break;
        }
      }
    });
    
    return keyFrames;
  }

  private async generateFilmstripHTML(filmstripData: any): Promise<string> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Performance Filmstrip - ${filmstripData.executionId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .scenario {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .scenario h2 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .url {
      color: #666;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .filmstrip {
      display: flex;
      overflow-x: auto;
      gap: 10px;
      padding: 10px 0;
    }
    .frame {
      flex-shrink: 0;
      text-align: center;
    }
    .frame img {
      width: 200px;
      height: 150px;
      object-fit: cover;
      border: 2px solid #ddd;
      border-radius: 4px;
    }
    .frame.key-frame img {
      border-color: #93186C;
    }
    .frame-info {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    .frame-time {
      font-weight: bold;
    }
    .frame-completeness {
      color: #93186C;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }
    .metric {
      background: #f8f8f8;
      padding: 15px;
      border-radius: 4px;
    }
    .metric-label {
      font-size: 12px;
      color: #666;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    .timeline {
      margin-top: 20px;
      height: 60px;
      background: #f0f0f0;
      border-radius: 4px;
      position: relative;
      overflow: hidden;
    }
    .timeline-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #93186C;
    }
    .timeline-label {
      position: absolute;
      top: -20px;
      font-size: 11px;
      white-space: nowrap;
      transform: translateX(-50%);
    }
  </style>
</head>
<body>
  <h1>Performance Filmstrip Analysis</h1>
  <p>Generated: ${new Date(filmstripData.timestamp).toLocaleString()}</p>
  
  ${filmstripData.scenarios.map((scenario: any) => `
    <div class="scenario">
      <h2>Scenario: ${scenario.scenarioId}</h2>
      <div class="url">${scenario.url}</div>
      
      <div class="filmstrip">
        ${scenario.frames.map((frame: any, index: number) => {
          const keyFrame = scenario.keyFrames.find((kf: any) => kf.index === index);
          return `
            <div class="frame ${keyFrame ? 'key-frame' : ''}">
              <img src="data:image/jpeg;base64,${frame.screenshot}" alt="Frame ${index}">
              <div class="frame-info">
                <div class="frame-time">${(frame.timestamp / 1000).toFixed(2)}s</div>
                <div class="frame-completeness">${frame.visualCompleteness.toFixed(1)}%</div>
                ${keyFrame ? `<div style="color: #93186C; font-weight: bold;">${keyFrame.type}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div class="timeline">
        ${scenario.keyFrames.map((kf: any) => {
          const percentage = (kf.timestamp / scenario.frames[scenario.frames.length - 1].timestamp) * 100;
          return `
            <div class="timeline-marker" style="left: ${percentage}%;">
              <div class="timeline-label">${kf.type}</div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div class="metrics">
        <div class="metric">
          <div class="metric-label">Speed Index</div>
          <div class="metric-value">${scenario.speedIndex.toFixed(0)}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Total Frames</div>
          <div class="metric-value">${scenario.frames.length}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Duration</div>
          <div class="metric-value">${(scenario.frames[scenario.frames.length - 1].timestamp / 1000).toFixed(2)}s</div>
        </div>
      </div>
    </div>
  `).join('')}
</body>
</html>
    `;
    
    const filepath = path.join(this.performancePath, 'performance-filmstrip.html');
    await writeFileAsync(filepath, html);
    
    return filepath;
  }

  async collectSystemMetrics(metrics: any): Promise<void> {
    try {
      const timestamp = Date.now();
      
      const systemSnapshot: MemoryInfo = {
        timestamp,
        heapUsed: metrics.memoryUsage || 0,
        heapTotal: metrics.totalMemory || 0,
        external: metrics.freeMemory || 0,
        arrayBuffers: 0,
        jsHeapSizeLimit: metrics.totalMemory || 0,
        totalJSHeapSize: metrics.memoryUsage || 0,
        usedJSHeapSize: metrics.memoryUsage || 0
      };
      
      if (!this.memorySnapshots.has('system')) {
        this.memorySnapshots.set('system', []);
      }
      this.memorySnapshots.get('system')!.push(systemSnapshot);
      
      const memoryUsagePercent = (metrics.memoryUsage / metrics.totalMemory) * 100;
      if (memoryUsagePercent > 80) {
        const logger = ActionLogger.getInstance();
        logger.warn(`High memory usage detected: ${memoryUsagePercent.toFixed(1)}%`);
      }
    } catch (error) {
      ActionLogger.logError('Failed to collect system metrics', error as Error);
    }
  }

  getMetrics(): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      navigationTimings: Array.from(this.navigationTimings.entries()),
      resourceTimings: Array.from(this.resourceTimings.entries()),
      userTimings: Array.from(this.userTimings.entries()),
      coreWebVitals: Array.from(this.coreWebVitals.entries()),
      longTasks: Array.from(this.longTasks.entries()),
      memorySnapshots: Array.from(this.memorySnapshots.entries()),
      customMarks: Array.from(this.customMarks.entries()),
      customMeasures: Array.from(this.customMeasures.entries())
    };
    
    return metrics;
  }

  private cleanup(): void {
    this.navigationTimings.clear();
    this.resourceTimings.clear();
    this.userTimings.clear();
    this.coreWebVitals.clear();
    this.longTasks.clear();
    this.memorySnapshots.clear();
    this.customMarks.clear();
    this.customMeasures.clear();
    this.scenarioPages.clear();
    
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
