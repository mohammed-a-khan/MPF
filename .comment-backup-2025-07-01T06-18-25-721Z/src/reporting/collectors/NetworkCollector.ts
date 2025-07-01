/**
 * Network Traffic Collector
 * Captures all network activity including HTTP requests, WebSocket frames, and performance metrics
 * Generates HAR files and network analysis reports
 */

import { Page, Request, Response, WebSocket } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { URL } from 'url';
import { performance } from 'perf_hooks';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';
import { 
  NetworkEntry, 
  HARFile, 
  WebSocketFrame, 
  NetworkMetrics,
  SecurityInfo,
  NetworkWaterfall,
  ResourceTiming,
  NetworkAnalysis,
  StepTiming,
  NetworkSummary,
  CacheInfo,
  ServerTiming,
  NetworkCollectorOptions,
  NetworkThrottling
} from '../types/reporting.types';

export class NetworkCollector {
  private static instance: NetworkCollector;
  private evidencePath: string = './evidence/network';
  private entries: Map<string, NetworkEntry[]> = new Map();
  private webSockets: Map<string, WebSocketFrame[]> = new Map();
  private metrics: Map<string, NetworkMetrics> = new Map();
  private harBuilders: Map<string, HARBuilder> = new Map();
  private options: NetworkCollectorOptions = {};
  private requestIdCounter: number = 0;
  private resourceTimings: Map<string, ResourceTiming[]> = new Map();
  private securityInfo: Map<string, SecurityInfo[]> = new Map();
  private throttling: NetworkThrottling | null = null;
  
  // Step timing tracking
  private stepTimings: Map<string, Map<string, StepTiming>> = new Map();
  private currentSteps: Map<string, string> = new Map();
  private requestToStep: Map<string, string> = new Map();
  private stepStartTimes: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): NetworkCollector {
    if (!NetworkCollector.instance) {
      NetworkCollector.instance = new NetworkCollector();
    }
    return NetworkCollector.instance;
  }

  async initialize(executionId: string, options: NetworkCollectorOptions = {}): Promise<void> {
    this.options = {
      captureWebSockets: true,
      captureHAR: true,
      analyzePerformance: true,
      analyzeSecurity: true,
      analyzeThirdParty: true,
      captureResponseBodies: true,
      maxResponseBodySize: 10 * 1024 * 1024, // 10MB
      throttling: null,
      ...options
    };

    this.evidencePath = path.join('./evidence', executionId, 'network');
    await FileUtils.createDir(this.evidencePath);

    this.entries.clear();
    this.webSockets.clear();
    this.metrics.clear();
    this.harBuilders.clear();
    this.resourceTimings.clear();
    this.securityInfo.clear();
    this.stepTimings.clear();
    this.currentSteps.clear();
    this.requestToStep.clear();
    this.stepStartTimes.clear();

    ActionLogger.logInfo('NetworkCollector initialized', {
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
    await FileUtils.createDir(scenarioPath);

    // Initialize HAR builder for this scenario
    const harBuilder = new HARBuilder(scenarioName);
    this.harBuilders.set(scenarioId, harBuilder);

    // Initialize collections for this scenario
    this.entries.set(scenarioId, []);
    this.webSockets.set(scenarioId, []);
    this.metrics.set(scenarioId, this.createEmptyMetrics());
    this.resourceTimings.set(scenarioId, []);
    this.securityInfo.set(scenarioId, []);
    this.stepTimings.set(scenarioId, new Map());

    // Apply network throttling if configured
    if (this.options.throttling) {
      await this.applyThrottling(page, this.options.throttling);
    }

    // Set up network interception
    await this.setupNetworkInterception(page, scenarioId);

    // Set up WebSocket monitoring if enabled
    if (this.options.captureWebSockets) {
      await this.setupWebSocketMonitoring(page, scenarioId);
    }

    // Collect resource timings periodically
    if (this.options.analyzePerformance) {
      await this.startResourceTimingCollection(page, scenarioId);
    }

    ActionLogger.logInfo(`Network collection started for scenario: ${scenarioName}`, {
      scenarioId,
      throttling: this.options.throttling
    });
  }

  async startStep(scenarioId: string, stepId: string): Promise<void> {
    const startTime = performance.now();
    this.currentSteps.set(scenarioId, stepId);
    this.stepStartTimes.set(`${scenarioId}_${stepId}`, startTime);
    
    const stepTimings = this.stepTimings.get(scenarioId) || new Map();
    stepTimings.set(stepId, {
      stepId,
      startTime,
      endTime: 0,
      requests: [],
      webSocketFrames: []
    });
    this.stepTimings.set(scenarioId, stepTimings);
  }

  async endStep(scenarioId: string, stepId: string): Promise<void> {
    const endTime = performance.now();
    const stepTimings = this.stepTimings.get(scenarioId);
    if (!stepTimings) return;
    
    const timing = stepTimings.get(stepId);
    if (timing) {
      timing.endTime = endTime;
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
    // Start step timing if not already started
    if (!this.stepStartTimes.has(`${scenarioId}_${stepId}`)) {
      await this.startStep(scenarioId, stepId);
    }
    
    // End step timing
    await this.endStep(scenarioId, stepId);
    
    const stepPath = path.join(this.evidencePath, scenarioId, 'steps', stepId);
    await FileUtils.createDir(stepPath);

    const evidenceFiles: string[] = [];

    try {
      // Get entries for this specific step
      const stepEntries = this.getEntriesForStep(scenarioId, stepId);
      
      if (stepEntries.length > 0) {
        // Generate step-specific HAR file
        const harPath = path.join(stepPath, `${stepId}-network.har`);
        const stepHar = await this.generateStepHAR(stepEntries);
        await fs.promises.writeFile(harPath, JSON.stringify(stepHar, null, 2));
        evidenceFiles.push(harPath);

        // Generate network analysis for the step
        const analysisPath = path.join(stepPath, `${stepId}-network-analysis.json`);
        const analysis = await this.analyzeStepNetwork(stepEntries);
        await fs.promises.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
        evidenceFiles.push(analysisPath);

        // Generate waterfall for this step
        const waterfallPath = path.join(stepPath, `${stepId}-waterfall.json`);
        const waterfall = await this.generateWaterfall(stepEntries);
        await fs.promises.writeFile(waterfallPath, JSON.stringify(waterfall, null, 2));
        evidenceFiles.push(waterfallPath);
      }

      // Capture WebSocket frames for this step
      const wsFrames = this.getWebSocketFramesForStep(scenarioId, stepId);
      if (wsFrames.length > 0) {
        const wsPath = path.join(stepPath, `${stepId}-websocket.json`);
        await fs.promises.writeFile(wsPath, JSON.stringify({
          stepId,
          stepText,
          framesCount: wsFrames.length,
          frames: wsFrames
        }, null, 2));
        evidenceFiles.push(wsPath);
      }

      // Generate step-specific metrics
      const stepMetricsPath = path.join(stepPath, `${stepId}-metrics.json`);
      const stepMetrics = this.calculateStepMetrics(stepEntries);
      await fs.promises.writeFile(stepMetricsPath, JSON.stringify(stepMetrics, null, 2));
      evidenceFiles.push(stepMetricsPath);

      ActionLogger.logInfo(`Network evidence collected for step: ${stepText}`, {
        scenarioId,
        stepId,
        entriesCount: stepEntries.length,
        wsFramesCount: wsFrames.length,
        status
      });

    } catch (error) {
      ActionLogger.logError('Error collecting network evidence for step', error as Error);
    }

    return evidenceFiles;
  }

  private async setupNetworkInterception(page: Page, scenarioId: string): Promise<void> {
    // Intercept all requests
    page.on('request', (request: Request) => {
      this.handleRequest(request, scenarioId);
    });

    // Intercept all responses
    page.on('response', (response: Response) => {
      this.handleResponse(response, scenarioId);
    });

    // Handle request failures
    page.on('requestfailed', (request: Request) => {
      this.handleRequestFailure(request, scenarioId);
    });

    // Handle request completion
    page.on('requestfinished', (request: Request) => {
      this.handleRequestFinished(request, scenarioId);
    });
  }

  private async handleRequest(request: Request, scenarioId: string): Promise<void> {
    const requestId = this.generateRequestId();
    const startTime = performance.now();
    const currentStep = this.currentSteps.get(scenarioId);
    
    const entry: NetworkEntry = {
      id: requestId,
      scenarioId,
      ...(currentStep && { stepId: currentStep }),
      startTime,
      endTime: 0,
      duration: 0,
      request: {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        ...(request.postData() && { postData: request.postData()! }),
        ...(request.resourceType() && { resourceType: request.resourceType() }),
        timestamp: new Date().toISOString()
      },
      response: null,
      timings: {
        blocked: 0,
        dns: 0,
        connect: 0,
        ssl: 0,
        send: 0,
        wait: 0,
        receive: 0
      },
      serverIPAddress: '',
      connection: '',
      cache: {
        isCacheable: false,
        maxAge: 0,
        isPrivate: false,
        isPublic: false,
        mustRevalidate: false,
        noCache: false,
        noStore: false
      },
      pageref: scenarioId
    };

    // Store request metadata
    (request as any)._networkEntry = entry;
    (request as any)._startTime = startTime;
    (request as any)._requestId = requestId;

    // Map request to current step
    if (currentStep) {
      this.requestToStep.set(requestId, currentStep);
      
      // Add to step timing
      const stepTimings = this.stepTimings.get(scenarioId);
      if (stepTimings) {
        const timing = stepTimings.get(currentStep);
        if (timing) {
          timing.requests.push(requestId);
        }
      }
    }

    // Add to HAR builder
    const harBuilder = this.harBuilders.get(scenarioId);
    if (harBuilder) {
      harBuilder.addEntry(entry);
    }

    // Analyze security if HTTPS
    if (request.url().startsWith('https://') && this.options.analyzeSecurity) {
      await this.analyzeRequestSecurity(request, scenarioId);
    }
  }

  private async handleResponse(response: Response, scenarioId: string): Promise<void> {
    const request = response.request();
    const entry = (request as any)._networkEntry as NetworkEntry;
    
    if (!entry) return;

    const endTime = performance.now();
    entry.endTime = endTime;
    entry.duration = endTime - entry.startTime;

    // Get timing details from response
    const timing = (response as any).timing ? (response as any).timing() : null;
    if (timing) {
      entry.timings = {
        blocked: timing.domainLookupStart > 0 ? timing.domainLookupStart : 0,
        dns: timing.domainLookupEnd - timing.domainLookupStart,
        connect: timing.connectEnd - timing.connectStart,
        ssl: timing.connectEnd - timing.connectStart, // Approximate
        send: timing.requestStart - timing.connectEnd,
        wait: timing.responseStart - timing.requestStart,
        receive: timing.responseEnd - timing.responseStart
      };
    }

    // Capture response details
    entry.response = {
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
      mimeType: response.headers()['content-type'] || '',
      bodySize: 0,
      content: {
        size: 0,
        mimeType: response.headers()['content-type'] || '',
        text: '',
        encoding: 'base64',
        compression: 0
      },
      timestamp: new Date().toISOString(),
      httpVersion: '1.1',
      cookies: [],
      redirectURL: response.headers()['location'] || ''
    };

    // Get server IP and connection info
    const securityDetails = await response.securityDetails();
    if (securityDetails) {
      entry.serverIPAddress = securityDetails.subjectName || '';
      entry.connection = securityDetails.protocol || '';
    }

    // Capture response body if enabled and within size limit
    if (this.options.captureResponseBodies) {
      try {
        const body = await response.body();
        if (body.length <= this.options.maxResponseBodySize!) {
          entry.response.content.text = body.toString('base64');
          entry.response.content.encoding = 'base64';
        }
        entry.response.bodySize = body.length;
        entry.response.content.size = body.length;
        
        // Calculate compression
        const contentLength = parseInt(response.headers()['content-length'] || '0', 10);
        if (contentLength > 0) {
          entry.response.content.compression = contentLength - body.length;
        }
      } catch (error) {
        // Body might not be available for some responses
      }
    }

    // Get server timing information
    const serverTiming = response.headers()['server-timing'];
    if (serverTiming) {
      entry.serverTiming = this.parseServerTiming(serverTiming);
    }

    // Update cache information
    entry.cache = this.analyzeCacheHeaders(response.headers());

    // Store the entry
    const entries = this.entries.get(scenarioId) || [];
    entries.push(entry);
    this.entries.set(scenarioId, entries);

    // Update metrics
    this.updateMetrics(scenarioId, entry);

    // Analyze third-party resources
    if (this.options.analyzeThirdParty) {
      this.analyzeThirdPartyRequest(entry, scenarioId);
    }

    // Update HAR builder
    const harBuilder = this.harBuilders.get(scenarioId);
    if (harBuilder) {
      harBuilder.updateEntry(entry);
    }
  }

  private async handleRequestFailure(request: Request, scenarioId: string): Promise<void> {
    const entry = (request as any)._networkEntry as NetworkEntry;
    if (!entry) return;

    const endTime = performance.now();
    entry.endTime = endTime;
    entry.duration = endTime - entry.startTime;

    const errorText = request.failure()?.errorText;
    entry.response = {
      status: 0,
      statusText: errorText || 'Failed',
      headers: {},
      mimeType: '',
      bodySize: 0,
      content: {
        size: 0,
        mimeType: '',
        text: '',
        encoding: 'base64',
        compression: 0
      },
      timestamp: new Date().toISOString(),
      ...(errorText && { error: errorText }),
      httpVersion: '1.1',
      cookies: [],
      redirectURL: ''
    };

    const entries = this.entries.get(scenarioId) || [];
    entries.push(entry);
    this.entries.set(scenarioId, entries);

    const metrics = this.metrics.get(scenarioId);
    if (metrics) {
      metrics.failedRequests++;
    }

    // Update HAR builder
    const harBuilder = this.harBuilders.get(scenarioId);
    if (harBuilder) {
      harBuilder.updateEntry(entry);
    }
  }

  private async handleRequestFinished(request: Request, scenarioId: string): Promise<void> {
    const entry = (request as any)._networkEntry as NetworkEntry;
    if (!entry || entry.response) return; // Already handled in handleResponse

    const endTime = performance.now();
    entry.endTime = endTime;
    entry.duration = endTime - entry.startTime;

    // This might be a cancelled request
    entry.response = {
      status: -1,
      statusText: 'Cancelled',
      headers: {},
      mimeType: '',
      bodySize: 0,
      content: {
        size: 0,
        mimeType: '',
        text: '',
        encoding: 'base64',
        compression: 0
      },
      timestamp: new Date().toISOString(),
      httpVersion: '1.1',
      cookies: [],
      redirectURL: ''
    };

    const entries = this.entries.get(scenarioId) || [];
    entries.push(entry);
    this.entries.set(scenarioId, entries);
  }

  private async setupWebSocketMonitoring(page: Page, scenarioId: string): Promise<void> {
    page.on('websocket', (ws: WebSocket) => {
      const wsId = crypto.randomBytes(16).toString('hex');
      const wsUrl = ws.url();
      const connectionTime = new Date().toISOString();

      ws.on('framereceived', (event: any) => {
        const currentStepId = this.currentSteps.get(scenarioId);
        const frame: WebSocketFrame = {
          id: crypto.randomBytes(16).toString('hex'),
          timestamp: new Date().toISOString(),
          direction: 'received',
          opcode: event.opcode || 0x1,
          mask: event.mask || false,
          payload: event.payload || '',
          type: this.getWebSocketFrameType(event.opcode || 0x1),
          size: event.payload ? event.payload.length : 0,
          wsUrl,
          wsId,
          ...(currentStepId && { stepId: currentStepId })
        };

        const frames = this.webSockets.get(scenarioId) || [];
        frames.push(frame);
        this.webSockets.set(scenarioId, frames);

        // Add to step timing if we have a current step
        const currentStep = this.currentSteps.get(scenarioId);
        if (currentStep) {
          const stepTimings = this.stepTimings.get(scenarioId);
          if (stepTimings) {
            const timing = stepTimings.get(currentStep);
            if (timing) {
              timing.webSocketFrames.push(frame.id);
            }
          }
        }
      });

      ws.on('framesent', (event: any) => {
        const currentStepId = this.currentSteps.get(scenarioId);
        const frame: WebSocketFrame = {
          id: crypto.randomBytes(16).toString('hex'),
          timestamp: new Date().toISOString(),
          direction: 'sent',
          opcode: event.opcode || 0x1,
          mask: event.mask || true,
          payload: event.payload || '',
          type: this.getWebSocketFrameType(event.opcode || 0x1),
          size: event.payload ? event.payload.length : 0,
          wsUrl,
          wsId,
          ...(currentStepId && { stepId: currentStepId })
        };

        const frames = this.webSockets.get(scenarioId) || [];
        frames.push(frame);
        this.webSockets.set(scenarioId, frames);

        // Add to step timing
        const currentStep = this.currentSteps.get(scenarioId);
        if (currentStep) {
          const stepTimings = this.stepTimings.get(scenarioId);
          if (stepTimings) {
            const timing = stepTimings.get(currentStep);
            if (timing) {
              timing.webSocketFrames.push(frame.id);
            }
          }
        }
      });

      ws.on('close', () => {
        ActionLogger.logInfo('WebSocket closed', {
          url: wsUrl,
          wsId,
          connectionTime,
          closeTime: new Date().toISOString()
        });
      });

      ws.on('socketerror', (error: string) => {
        ActionLogger.logError('WebSocket error', new Error(error));
      });
    });
  }

  private getWebSocketFrameType(opcode: number): string {
    switch (opcode) {
      case 0x0: return 'continuation';
      case 0x1: return 'text';
      case 0x2: return 'binary';
      case 0x8: return 'close';
      case 0x9: return 'ping';
      case 0xa: return 'pong';
      default: return 'unknown';
    }
  }

  private async startResourceTimingCollection(page: Page, scenarioId: string): Promise<void> {
    const collectTimings = async () => {
      try {
        const timings = await page.evaluate(() => {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          return entries.map(timing => ({
            name: timing.name,
            entryType: timing.entryType,
            startTime: timing.startTime,
            duration: timing.duration,
            initiatorType: timing.initiatorType,
            nextHopProtocol: timing.nextHopProtocol,
            workerStart: timing.workerStart,
            redirectStart: timing.redirectStart,
            redirectEnd: timing.redirectEnd,
            fetchStart: timing.fetchStart,
            domainLookupStart: timing.domainLookupStart,
            domainLookupEnd: timing.domainLookupEnd,
            connectStart: timing.connectStart,
            connectEnd: timing.connectEnd,
            secureConnectionStart: timing.secureConnectionStart,
            requestStart: timing.requestStart,
            responseStart: timing.responseStart,
            responseEnd: timing.responseEnd,
            transferSize: timing.transferSize,
            encodedBodySize: timing.encodedBodySize,
            decodedBodySize: timing.decodedBodySize,
            serverTiming: timing.serverTiming || []
          }));
        });

        const existingTimings = this.resourceTimings.get(scenarioId) || [];
        // Convert readonly serverTiming arrays to mutable arrays
        const mutableTimings = timings.map(timing => ({
          ...timing,
          serverTiming: [...timing.serverTiming]
        }));
        existingTimings.push(...mutableTimings);
        this.resourceTimings.set(scenarioId, existingTimings);

        // Clear the performance buffer to avoid duplicates
        await page.evaluate(() => performance.clearResourceTimings());
      } catch (error) {
        // Page might be closed
      }
    };

    // Collect timings every 2 seconds
    const interval = setInterval(collectTimings, 2000);
    
    // Store interval for cleanup
    (page as any)._resourceTimingInterval = interval;
    
    // Clear interval when page closes
    page.once('close', () => {
      clearInterval(interval);
    });

    // Collect initial timings
    await collectTimings();
  }

  private async applyThrottling(page: Page, throttling: NetworkThrottling): Promise<void> {
    const client = await page.context().newCDPSession(page);
    
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: throttling.downloadThroughput,
      uploadThroughput: throttling.uploadThroughput,
      latency: throttling.latency,
      connectionType: (throttling.connectionType || 'none') as any
    });

    this.throttling = throttling;

    ActionLogger.logInfo('Network throttling applied', {
      downloadThroughput: `${(throttling.downloadThroughput / 1024).toFixed(2)} KB/s`,
      uploadThroughput: `${(throttling.uploadThroughput / 1024).toFixed(2)} KB/s`,
      latency: `${throttling.latency} ms`
    });
  }

  private getEntriesForStep(scenarioId: string, stepId: string): NetworkEntry[] {
    const entries = this.entries.get(scenarioId) || [];
    const stepTimings = this.stepTimings.get(scenarioId);
    if (!stepTimings) return [];
    
    const timing = stepTimings.get(stepId);
    if (!timing) return [];
    
    // Get entries that belong to this step
    return entries.filter(entry => {
      // Check if entry was initiated during this step
      if (entry.stepId === stepId) return true;
      
      // Also check if entry started within step time boundaries
      return entry.startTime >= timing.startTime && 
             entry.startTime <= timing.endTime;
    });
  }

  private getWebSocketFramesForStep(scenarioId: string, stepId: string): WebSocketFrame[] {
    const frames = this.webSockets.get(scenarioId) || [];
    const stepTimings = this.stepTimings.get(scenarioId);
    if (!stepTimings) return [];
    
    const timing = stepTimings.get(stepId);
    if (!timing) return [];
    
    // Get frames that belong to this step
    return frames.filter(frame => {
      // Check if frame was marked for this step
      if (frame.stepId === stepId) return true;
      
      // Also check timestamp boundaries
      const frameTime = new Date(frame.timestamp).getTime();
      const stepStartTime = timing.startTime;
      const stepEndTime = timing.endTime || performance.now();
      
      return frameTime >= stepStartTime && frameTime <= stepEndTime;
    });
  }

  private calculateStepMetrics(entries: NetworkEntry[]): NetworkMetrics {
    const metrics = this.createEmptyMetrics();
    
    for (const entry of entries) {
      metrics.totalRequests++;
      metrics.totalTime += entry.duration;
      
      if (entry.response) {
        metrics.totalBytesTransferred += entry.response.bodySize;
        
        if (entry.response.status >= 200 && entry.response.status < 300) {
          metrics.successfulRequests++;
        } else if (entry.response.status >= 400) {
          metrics.failedRequests++;
        }
        
        // Check if cached
        if (entry.response.status === 304 || 
            (entry.cache.cacheControl && entry.cache.cacheControl.includes('from-cache'))) {
          metrics.cachedRequests++;
        }
      }
      
      // Update resource type breakdown
      const resourceType = entry.request.resourceType || 'other';
      metrics.resourceTypes[resourceType] = (metrics.resourceTypes[resourceType] || 0) + 1;
      
      // Update protocol breakdown
      const url = new URL(entry.request.url);
      const protocol = url.protocol.replace(':', '');
      metrics.protocols[protocol] = (metrics.protocols[protocol] || 0) + 1;
      
      // Update domain breakdown
      metrics.domains[url.hostname] = (metrics.domains[url.hostname] || 0) + 1;
    }
    
    // Calculate average response time
    if (metrics.totalRequests > 0) {
      metrics.averageResponseTime = metrics.totalTime / metrics.totalRequests;
    }
    
    return metrics;
  }

  private async analyzeRequestSecurity(request: Request, scenarioId: string): Promise<void> {
    const url = new URL(request.url());
    const headers = request.headers();

    const security: SecurityInfo = {
      url: request.url(),
      protocol: url.protocol,
      hostname: url.hostname,
      timestamp: new Date().toISOString(),
      securityHeaders: {
        'strict-transport-security': headers['strict-transport-security'] || null,
        'content-security-policy': headers['content-security-policy'] || null,
        'x-frame-options': headers['x-frame-options'] || null,
        'x-content-type-options': headers['x-content-type-options'] || null,
        'x-xss-protection': headers['x-xss-protection'] || null,
        'referrer-policy': headers['referrer-policy'] || null,
        'permissions-policy': headers['permissions-policy'] || null,
        'cross-origin-opener-policy': headers['cross-origin-opener-policy'] || null,
        'cross-origin-embedder-policy': headers['cross-origin-embedder-policy'] || null,
        'cross-origin-resource-policy': headers['cross-origin-resource-policy'] || null
      },
      issues: [],
      score: 100
    };

    // Check for security issues and calculate score
    if (!security.securityHeaders['strict-transport-security']) {
      security.issues.push({
        severity: 'high',
        issue: 'Missing Strict-Transport-Security header',
        recommendation: 'Add HSTS header with max-age=31536000; includeSubDomains'
      });
      security.score -= 15;
    }
    
    if (!security.securityHeaders['content-security-policy']) {
      security.issues.push({
        severity: 'high',
        issue: 'Missing Content-Security-Policy header',
        recommendation: 'Implement CSP to prevent XSS attacks'
      });
      security.score -= 20;
    }
    
    if (!security.securityHeaders['x-frame-options']) {
      security.issues.push({
        severity: 'medium',
        issue: 'Missing X-Frame-Options header',
        recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN'
      });
      security.score -= 10;
    }
    
    if (!security.securityHeaders['x-content-type-options']) {
      security.issues.push({
        severity: 'medium',
        issue: 'Missing X-Content-Type-Options header',
        recommendation: 'Add X-Content-Type-Options: nosniff'
      });
      security.score -= 10;
    }
    
    if (!security.securityHeaders['referrer-policy']) {
      security.issues.push({
        severity: 'low',
        issue: 'Missing Referrer-Policy header',
        recommendation: 'Add Referrer-Policy: strict-origin-when-cross-origin'
      });
      security.score -= 5;
    }

    const securityInfos = this.securityInfo.get(scenarioId) || [];
    securityInfos.push(security);
    this.securityInfo.set(scenarioId, securityInfos);
  }

  private analyzeCacheHeaders(headers: Record<string, string>): CacheInfo {
    const cacheControl = headers['cache-control'];
    const etag = headers['etag'];
    const lastModified = headers['last-modified'];
    const expires = headers['expires'];
    const pragma = headers['pragma'];
    const age = headers['age'];
    const vary = headers['vary'];

    const cacheInfo: CacheInfo = {
      ...(cacheControl && { cacheControl }),
      ...(etag && { etag }),
      ...(lastModified && { lastModified }),
      ...(expires && { expires }),
      ...(pragma && { pragma }),
      ...(age && { age }),
      ...(vary && { vary }),
      isCacheable: false,
      maxAge: 0,
      isPrivate: false,
      isPublic: false,
      mustRevalidate: false,
      noCache: false,
      noStore: false
    };

    if (cacheControl) {
      cacheInfo.isPrivate = cacheControl.includes('private');
      cacheInfo.isPublic = cacheControl.includes('public');
      cacheInfo.noCache = cacheControl.includes('no-cache');
      cacheInfo.noStore = cacheControl.includes('no-store');
      cacheInfo.mustRevalidate = cacheControl.includes('must-revalidate');
      cacheInfo.isCacheable = !cacheInfo.noStore && !cacheInfo.noCache;
      
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch && maxAgeMatch[1]) {
        cacheInfo.maxAge = parseInt(maxAgeMatch[1], 10);
      }
      
      const sMaxAgeMatch = cacheControl.match(/s-maxage=(\d+)/);
      if (sMaxAgeMatch && sMaxAgeMatch[1]) {
        cacheInfo.sMaxAge = parseInt(sMaxAgeMatch[1], 10);
      }
    }

    return cacheInfo;
  }

  private parseServerTiming(headerValue: string): ServerTiming[] {
    const timings: ServerTiming[] = [];
    const entries = headerValue.split(',');

    for (const entry of entries) {
      const parts = entry.trim().split(';');
      const name = parts[0];
      let duration = 0;
      let description = '';

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i]?.trim();
      if (!part) continue;
        if (part.startsWith('dur=')) {
          duration = parseFloat(part.substring(4));
        } else if (part.startsWith('desc=')) {
          description = part.substring(5).replace(/^"|"$/g, '');
        }
      }

      timings.push({ 
        name: name || '', 
        duration, 
        description 
      });
    }

    return timings;
  }

  private updateMetrics(scenarioId: string, entry: NetworkEntry): void {
    const metrics = this.metrics.get(scenarioId);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.totalTime += entry.duration;

    if (entry.response) {
      metrics.totalBytesTransferred += entry.response.bodySize;
      
      if (entry.response.status >= 200 && entry.response.status < 300) {
        metrics.successfulRequests++;
      } else if (entry.response.status >= 400) {
        metrics.failedRequests++;
      }

      // Check if cached
      if (entry.response.status === 304 || 
          (entry.cache.cacheControl && entry.cache.cacheControl.includes('from-cache'))) {
        metrics.cachedRequests++;
      }
    }

    // Update resource type breakdown
    const resourceType = entry.request.resourceType || 'other';
    metrics.resourceTypes[resourceType] = (metrics.resourceTypes[resourceType] || 0) + 1;

    // Update protocol breakdown
    const url = new URL(entry.request.url);
    const protocol = url.protocol.replace(':', '');
    metrics.protocols[protocol] = (metrics.protocols[protocol] || 0) + 1;

    // Update domain breakdown
    metrics.domains[url.hostname] = (metrics.domains[url.hostname] || 0) + 1;

    // Calculate average response time
    if (metrics.totalRequests > 0) {
      metrics.averageResponseTime = metrics.totalTime / metrics.totalRequests;
    }
  }

  private analyzeThirdPartyRequest(entry: NetworkEntry, scenarioId: string): void {
    const metrics = this.metrics.get(scenarioId);
    if (!metrics) return;

    const url = new URL(entry.request.url);
    const pageUrl = new URL(metrics.pageUrl || 'http://localhost');

    // Check if it's a third-party request
    if (url.hostname !== pageUrl.hostname && 
        !url.hostname.includes(pageUrl.hostname) &&
        !pageUrl.hostname.includes(url.hostname)) {
      
      metrics.thirdPartyRequests++;
      
      // Categorize third-party requests
      const hostname = url.hostname.toLowerCase();
      
      if (hostname.includes('google-analytics') || 
          hostname.includes('googletagmanager') ||
          hostname.includes('doubleclick') ||
          hostname.includes('facebook') ||
          hostname.includes('twitter')) {
        metrics.thirdPartyCategories['analytics'] = 
          (metrics.thirdPartyCategories['analytics'] || 0) + 1;
      } else if (hostname.includes('cdn') || 
                 hostname.includes('cloudflare') ||
                 hostname.includes('akamai') ||
                 hostname.includes('fastly')) {
        metrics.thirdPartyCategories['cdn'] = 
          (metrics.thirdPartyCategories['cdn'] || 0) + 1;
      } else if (hostname.includes('googleapis') ||
                 hostname.includes('jquery') ||
                 hostname.includes('bootstrap') ||
                 hostname.includes('fontawesome')) {
        metrics.thirdPartyCategories['libraries'] = 
          (metrics.thirdPartyCategories['libraries'] || 0) + 1;
      } else if (hostname.includes('stripe') ||
                 hostname.includes('paypal') ||
                 hostname.includes('square')) {
        metrics.thirdPartyCategories['payments'] = 
          (metrics.thirdPartyCategories['payments'] || 0) + 1;
      } else {
        metrics.thirdPartyCategories['other'] = 
          (metrics.thirdPartyCategories['other'] || 0) + 1;
      }
    }
  }

  private createEmptyMetrics(): NetworkMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalBytesTransferred: 0,
      totalTime: 0,
      averageResponseTime: 0,
      cachedRequests: 0,
      thirdPartyRequests: 0,
      resourceTypes: {},
      protocols: {},
      domains: {},
      thirdPartyCategories: {},
      pageUrl: '',
      avgResponseTime: 0,
      totalDataTransferred: 0,
      totalDataSent: 0,
      totalDataReceived: 0,
      slowestRequest: null as any,
      cacheHitRate: 0,
      requestsByType: {},
      requestsByDomain: {}
    };
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private parseQueryString(url: string): any[] {
    try {
      const urlObj = new URL(url);
      const params: any[] = [];
      
      urlObj.searchParams.forEach((value, name) => {
        params.push({ name, value });
      });
      
      return params;
    } catch {
      return [];
    }
  }

  private async generateStepHAR(entries: NetworkEntry[]): Promise<HARFile> {
    const har: HARFile = {
      log: {
        version: '1.2',
        creator: {
          name: 'CS Test Automation Framework',
          version: '1.0.0'
        },
        entries: entries.map(entry => this.convertToHAREntry(entry))
      }
    };

    return har;
  }

  private convertToHAREntry(entry: NetworkEntry): any {
    const request = entry.request;
    const response = entry.response;
    
    return {
      startedDateTime: new Date(entry.startTime).toISOString(),
      time: entry.duration,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: Object.entries(request.headers).map(([name, value]) => ({
          name,
          value: value.toString()
        })),
        queryString: this.parseQueryString(request.url),
        postData: request.postData ? {
          mimeType: request.headers['content-type'] || 'application/octet-stream',
          text: request.postData,
          params: []
        } : undefined,
        headersSize: -1,
        bodySize: request.postData ? request.postData.length : 0,
        comment: `Resource type: ${request.resourceType}`
      },
      response: response ? {
        status: response.status,
        statusText: response.statusText,
        httpVersion: response.httpVersion || 'HTTP/1.1',
        cookies: response.cookies || [],
        headers: Object.entries(response.headers).map(([name, value]) => ({
          name,
          value: value.toString()
        })),
        content: response.content,
        redirectURL: response.redirectURL || '',
        headersSize: -1,
        bodySize: response.bodySize,
        comment: response.error || ''
      } : {
        status: 0,
        statusText: 'No Response',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: [],
        content: {
          size: 0,
          mimeType: 'application/octet-stream',
          text: '',
          encoding: 'base64'
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: 0
      },
      cache: entry.cache || {},
      timings: entry.timings,
      serverIPAddress: entry.serverIPAddress || '',
      connection: entry.connection || '',
      pageref: 'page_1',
      comment: entry.stepId ? `Step: ${entry.stepId}` : ''
    };
  }

  private async analyzeStepNetwork(entries: NetworkEntry[]): Promise<NetworkAnalysis> {
    const analysis: NetworkAnalysis = {
      summary: {
        totalRequests: entries.length,
        successfulRequests: 0,
        failedRequests: 0,
        totalDataSent: 0,
        totalDataReceived: 0,
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Number.MAX_VALUE,
        totalDuration: 0,
        totalDataTransferred: 0,
        totalTime: 0,
        averageResponseTime: 0,
        cachedRequests: 0,
        thirdPartyRequests: 0,
        scenarios: {},
        harFiles: [],
        analysisReports: [],
        waterfallFiles: [],
        securityReports: []
      } as NetworkSummary,
      performance: {
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errorRate: 0,
        byDomain: {},
        byResourceType: {},
        slowestRequests: [],
        largestRequests: [],
        failedRequests: [],
        blockedRequests: [],
        renderBlockingResources: []
      },
      resourceBreakdown: {},
      thirdPartyAnalysis: {
        totalRequests: 0,
        domains: {},
        categories: {},
        performanceImpact: 0,
        dataTransferred: 0
      },
      cacheAnalysis: {
        cacheableResources: 0,
        cachedResources: 0,
        cacheHitRate: 0,
        potentialSavings: 0,
        recommendations: [] as any[]
      },
      securityAnalysis: {
        httpsRequests: 0,
        httpRequests: 0,
        securityHeaders: {
          present: 0,
          missing: 0,
          issues: []
        }
      },
      recommendations: [] as any[],
      requests: [],
      timeline: {
        entries: [],
        startTime: new Date(),
        endTime: new Date(),
        duration: 0
      },
      errors: [],
      failures: [],
      mocks: [],
      waterfall: {
        entries: [],
        totalDuration: 0,
        criticalPath: [],
        startTime: 0,
        endTime: 0,
        duration: 0
      }
    };

    // Analyze each entry
    for (const entry of entries) {
      // Add to requests array
      if (entry.response) {
        analysis.requests.push({
          requestId: entry.id,
          url: entry.request.url,
          method: entry.request.method,
          status: entry.response.status,
          responseTime: entry.duration,
          startTime: new Date(entry.startTime),
          endTime: new Date(entry.endTime),
          size: entry.response.bodySize,
          type: entry.request.resourceType || 'other',
          headers: entry.request.headers,
          timing: {
            ...entry.timings,
            total: entry.duration
          }
        });
      }
      
      // Update summary
      if (entry.response) {
        if (entry.response.status >= 200 && entry.response.status < 300) {
          analysis.summary.successfulRequests++;
        } else if (entry.response.status >= 400) {
          analysis.summary.failedRequests++;
          analysis.performance.failedRequests?.push({
            url: entry.request.url,
            status: entry.response.status,
            statusText: entry.response.statusText,
            duration: entry.duration,
            error: entry.response.error
          });
          
          // Add to failures array
          analysis.failures.push({
            requestId: entry.id,
            url: entry.request.url,
            error: entry.response.error || `HTTP ${entry.response.status}`,
            timestamp: new Date(entry.request.timestamp),
            context: {
              status: entry.response.status,
              statusText: entry.response.statusText,
              duration: entry.duration
            }
          });
          
          // Add to errors if there's an error message
          if (entry.response.error) {
            analysis.errors.push({
              timestamp: new Date(entry.request.timestamp),
              url: entry.request.url,
              method: entry.request.method,
              error: entry.response.error,
              code: entry.response.status.toString()
            });
          }
        }
        
        analysis.summary.totalDataReceived += entry.response.bodySize;
        analysis.summary.totalDataTransferred += entry.response.bodySize;
      }
      
      analysis.summary.totalTime += entry.duration;
      
      // Track data sent
      if (entry.request.postData) {
        const dataSize = Buffer.byteLength(entry.request.postData);
        analysis.summary.totalDataSent += dataSize;
        analysis.summary.totalDataTransferred += dataSize;
      }
      
      // Resource breakdown
      const resourceType = entry.request.resourceType || 'other';
      if (!analysis.resourceBreakdown[resourceType]) {
        analysis.resourceBreakdown[resourceType] = {
          count: 0,
          size: 0,
          time: 0
        };
      }
      analysis.resourceBreakdown[resourceType].count++;
      analysis.resourceBreakdown[resourceType].size += entry.response?.bodySize || 0;
      analysis.resourceBreakdown[resourceType].time += entry.duration;
      
      // Third-party analysis
      const url = new URL(entry.request.url);
      const isThirdParty = !url.hostname.includes(new URL(entries[0]?.request.url || 'http://localhost').hostname);
      
      if (isThirdParty) {
        analysis.summary.thirdPartyRequests++;
        analysis.thirdPartyAnalysis.totalRequests++;
        analysis.thirdPartyAnalysis.domains[url.hostname] = 
          (analysis.thirdPartyAnalysis.domains[url.hostname] || 0) + 1;
        analysis.thirdPartyAnalysis.dataTransferred += entry.response?.bodySize || 0;
        analysis.thirdPartyAnalysis.performanceImpact += entry.duration;
      }
      
      // Security analysis
      if (url.protocol === 'https:') {
        analysis.securityAnalysis.httpsRequests++;
      } else if (url.protocol === 'http:') {
        analysis.securityAnalysis.httpRequests++;
      }
      
      // Cache analysis
      if (entry.cache.isCacheable) {
        analysis.cacheAnalysis.cacheableResources++;
        if (entry.response?.status === 304 || entry.cache.cacheControl?.includes('from-cache')) {
          analysis.summary.cachedRequests++;
          analysis.cacheAnalysis.cachedResources++;
        }
      }
    }

    // Calculate averages and rates
    if (analysis.summary.totalRequests > 0) {
      const avgTime = analysis.summary.totalTime / analysis.summary.totalRequests;
      analysis.summary.avgResponseTime = avgTime;
      analysis.summary.averageResponseTime = avgTime;
      analysis.performance.avgResponseTime = avgTime;
      
      // Calculate response time percentiles
      const responseTimes = entries
        .filter(e => e.response && e.duration > 0)
        .map(e => e.duration)
        .sort((a, b) => a - b);
      
      if (responseTimes.length > 0) {
        analysis.performance.p50ResponseTime = responseTimes[Math.min(Math.floor(responseTimes.length * 0.5), responseTimes.length - 1)] || 0;
        analysis.performance.p95ResponseTime = responseTimes[Math.min(Math.floor(responseTimes.length * 0.95), responseTimes.length - 1)] || 0;
        analysis.performance.p99ResponseTime = responseTimes[Math.min(Math.floor(responseTimes.length * 0.99), responseTimes.length - 1)] || 0;
        analysis.summary.maxResponseTime = Math.max(...responseTimes);
        analysis.summary.minResponseTime = Math.min(...responseTimes);
      }
      
      // Calculate throughput and error rate
      const duration = (entries[entries.length - 1]?.endTime || 0) - (entries[0]?.startTime || 0);
      if (duration > 0) {
        analysis.performance.throughput = (analysis.summary.totalRequests / duration) * 1000; // requests per second
        analysis.summary.totalDuration = duration;
      }
      
      analysis.performance.errorRate = (analysis.summary.failedRequests / analysis.summary.totalRequests) * 100;
    }
    
    // Update timeline
    if (entries.length > 0) {
      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];
      
      if (firstEntry) {
        analysis.timeline.startTime = new Date(firstEntry.startTime);
      }
      if (lastEntry) {
        analysis.timeline.endTime = new Date(lastEntry.endTime || lastEntry.startTime);
      }
      analysis.timeline.duration = analysis.timeline.endTime.getTime() - analysis.timeline.startTime.getTime();
      
      // Add timeline entries for each request
      analysis.timeline.entries = entries.map(entry => ({
        id: entry.id,
        name: `${entry.request.method} ${entry.request.url}`,
        type: 'request',
        startTime: entry.startTime - (entries[0]?.startTime || 0),
        duration: entry.duration,
        status: entry.response ? (entry.response.status >= 200 && entry.response.status < 300 ? 'success' : 'failed') : 'pending',
        details: {
          requestId: entry.id,
          url: entry.request.url,
          method: entry.request.method,
          status: entry.response?.status || 0
        }
      }));
    }
    
    // Update waterfall
    if (entries.length > 0) {
      analysis.waterfall = await this.generateWaterfall(entries);
    }
    
    if (analysis.cacheAnalysis.cacheableResources > 0) {
      analysis.cacheAnalysis.cacheHitRate = 
        (analysis.cacheAnalysis.cachedResources / analysis.cacheAnalysis.cacheableResources) * 100;
    }

    // Find slowest requests
    analysis.performance.slowestRequests = entries
      .filter(e => e.response && e.response.status > 0)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map(e => ({
        url: e.request.url,
        duration: e.duration,
        size: e.response?.bodySize || 0,
        type: e.request.resourceType || 'other'
      }));

    // Find largest requests
    analysis.performance.largestRequests = entries
      .filter(e => e.response && e.response.bodySize > 0)
      .sort((a, b) => (b.response?.bodySize || 0) - (a.response?.bodySize || 0))
      .slice(0, 10)
      .map(e => ({
        url: e.request.url,
        size: e.response?.bodySize || 0,
        duration: e.duration,
        type: e.request.resourceType || 'other'
      }));

    // Identify render-blocking resources
    analysis.performance.renderBlockingResources = entries
      .filter(e => {
        const type = e.request.resourceType;
        return (type === 'stylesheet' || type === 'script') && 
               !e.request.url.includes('async') && 
               !e.request.url.includes('defer');
      })
      .map(e => ({
        url: e.request.url,
        type: e.request.resourceType || 'other',
        duration: e.duration,
        size: e.response?.bodySize || 0
      }));

    // Generate recommendations
    this.generateRecommendations(analysis);

    return analysis;
  }

  private generateRecommendations(analysis: NetworkAnalysis): void {
    // Cache recommendations
    if (analysis.cacheAnalysis.cacheHitRate < 50) {
      analysis.recommendations.push({
        category: 'cache',
        severity: 'medium',
        title: 'Low cache hit rate',
        description: `Only ${analysis.cacheAnalysis.cacheHitRate.toFixed(1)}% of cacheable resources are being served from cache`,
        impact: 'Users are downloading resources repeatedly, increasing load times and bandwidth usage',
        solution: 'Review and optimize cache headers for static resources'
      });
    }

    // Performance recommendations
    if (analysis.performance.slowestRequests && 
        analysis.performance.slowestRequests.length > 0 && 
        analysis.performance.slowestRequests[0].duration > 3000) {
      analysis.recommendations.push({
        category: 'performance',
        severity: 'high',
        title: 'Slow requests detected',
        description: `${analysis.performance.slowestRequests!.filter(r => r.duration > 3000).length} requests took over 3 seconds`,
        impact: 'Poor user experience due to slow loading resources',
        solution: 'Optimize server response times, use CDN, or implement caching'
      });
    }

    // Third-party recommendations
    const thirdPartyPercentage = (analysis.thirdPartyAnalysis.totalRequests / analysis.summary.totalRequests) * 100;
    if (thirdPartyPercentage > 30) {
      analysis.recommendations.push({
        category: 'third-party',
        severity: 'medium',
        title: 'High third-party resource usage',
        description: `${thirdPartyPercentage.toFixed(1)}% of requests are to third-party domains`,
        impact: 'Third-party resources can slow down page load and create dependencies',
        solution: 'Review and minimize third-party dependencies, consider self-hosting critical resources'
      });
    }

    // Security recommendations
    if (analysis.securityAnalysis.httpRequests > 0) {
      analysis.recommendations.push({
        category: 'security',
        severity: 'high',
        title: 'Insecure HTTP requests detected',
        description: `${analysis.securityAnalysis.httpRequests} requests were made over insecure HTTP`,
        impact: 'Data transmitted over HTTP can be intercepted or modified',
        solution: 'Use HTTPS for all requests to ensure data security'
      });
    }

    // Large resource recommendations
    const largeResources = analysis.performance.largestRequests?.filter(r => r.size > 1024 * 1024) || []; // > 1MB
    if (largeResources.length > 0) {
      analysis.recommendations.push({
        category: 'performance',
        severity: 'medium',
        title: 'Large resources detected',
        description: `${largeResources.length} resources are over 1MB in size`,
        impact: 'Large resources increase load times, especially on slower connections',
        solution: 'Compress images, minify JavaScript/CSS, and consider lazy loading'
      });
    }

    // Render-blocking recommendations
    if (analysis.performance.renderBlockingResources && analysis.performance.renderBlockingResources.length > 5) {
      analysis.recommendations.push({
        category: 'performance',
        severity: 'medium',
        title: 'Multiple render-blocking resources',
        description: `${analysis.performance.renderBlockingResources!.length} render-blocking resources detected`,
        impact: 'Render-blocking resources delay page rendering',
        solution: 'Use async/defer for scripts, inline critical CSS, and defer non-critical resources'
      });
    }
  }

  private async generateWaterfall(entries: NetworkEntry[]): Promise<NetworkWaterfall> {
    if (entries.length === 0) {
      return {
        startTime: 0,
        endTime: 0,
        duration: 0,
        entries: [],
        totalDuration: 0,
        criticalPath: []
      };
    }

    // Find the earliest start time
    const startTime = Math.min(...entries.map(e => e.startTime));
    const endTime = Math.max(...entries.map(e => e.endTime || e.startTime + e.duration));

    const waterfall: NetworkWaterfall = {
      startTime,
      endTime,
      duration: endTime - startTime,
      entries: entries.map(entry => ({
        id: entry.id,
        url: entry.request.url,
        method: entry.request.method,
        status: entry.response?.status || 0,
        mimeType: entry.response?.mimeType || '',
        resourceType: entry.request.resourceType || 'other',
        startTime: entry.startTime - startTime,
        duration: entry.duration,
        timings: {
          blocked: entry.timings.blocked,
          dns: entry.timings.dns,
          connect: entry.timings.connect,
          ssl: entry.timings.ssl,
          send: entry.timings.send,
          wait: entry.timings.wait,
          receive: entry.timings.receive
        },
        size: entry.response?.bodySize || 0,
        compressed: entry.response?.content.compression || 0,
        priority: this.getResourcePriority(entry),
        initiator: this.getInitiator(entry),
        timing: {
          blocked: entry.timings.blocked,
          dns: entry.timings.dns,
          connect: entry.timings.connect,
          ssl: entry.timings.ssl,
          send: entry.timings.send,
          wait: entry.timings.wait,
          receive: entry.timings.receive
        } as any,
        type: entry.request.resourceType || 'other'
      })),
      totalDuration: endTime - startTime,
      criticalPath: []
    };

    // Sort entries by start time for waterfall display
    waterfall.entries.sort((a, b) => a.startTime - b.startTime);

    return waterfall;
  }

  private getResourcePriority(entry: NetworkEntry): string {
    const type = entry.request.resourceType;
    
    // Infer priority based on resource type
    if (type === 'document') return 'highest';
    if (type === 'stylesheet' || type === 'script') return 'high';
    if (type === 'font') return 'high';
    if (type === 'xhr' || type === 'fetch') return 'high';
    if (type === 'image') return 'low';
    if (type === 'media') return 'low';
    
    return 'medium';
  }

  private getInitiator(entry: NetworkEntry): string {
    // In a real browser, we would have initiator information
    // For now, infer from resource type
    const type = entry.request.resourceType;
    
    if (type === 'document') return 'navigation';
    if (type === 'stylesheet' || type === 'script') return 'parser';
    if (type === 'xhr' || type === 'fetch') return 'script';
    if (type === 'image' || type === 'font') return 'css';
    
    return 'other';
  }

  private async generateCompleteAnalysis(scenarioId: string): Promise<NetworkAnalysis> {
    const entries = this.entries.get(scenarioId) || [];
    const securityInfos = this.securityInfo.get(scenarioId) || [];
    
    // Generate comprehensive analysis
    const analysis = await this.analyzeStepNetwork(entries);
    
    // Add security information
    analysis.securityAnalysis.securityHeaders.issues = securityInfos
      .flatMap(info => info.issues)
      .filter((issue, index, self) => 
        self.findIndex(i => i.issue === issue.issue) === index
      );
    
    // Add performance impact analysis
    const resourceTimings = this.resourceTimings.get(scenarioId) || [];
    if (resourceTimings.length > 0) {
      analysis.performance.resourceTimings = resourceTimings;
      
      // Calculate critical path
      const criticalPath = this.calculateCriticalPath(entries);
      analysis.performance.criticalPath = criticalPath;
    }
    
    // Add bandwidth analysis
    analysis.bandwidth = this.analyzeBandwidth(entries);
    
    // Add protocol analysis
    analysis.protocols = this.analyzeProtocols(entries);
    
    return analysis;
  }

  private calculateCriticalPath(entries: NetworkEntry[]): any {
    // Identify resources that block rendering
    const criticalResources = entries.filter(entry => {
      const type = entry.request.resourceType;
      return type === 'document' || 
             type === 'stylesheet' || 
             (type === 'script' && !entry.request.url.includes('async'));
    });

    // Sort by start time
    criticalResources.sort((a, b) => a.startTime - b.startTime);

    // Calculate total blocking time
    let totalBlockingTime = 0;
    let lastEndTime = 0;

    for (const resource of criticalResources) {
      if (resource.startTime > lastEndTime) {
        // Gap between resources, not blocking
        totalBlockingTime += resource.duration;
      } else {
        // Overlapping, only add the additional time
        const additionalTime = (resource.startTime + resource.duration) - lastEndTime;
        if (additionalTime > 0) {
          totalBlockingTime += additionalTime;
        }
      }
      lastEndTime = Math.max(lastEndTime, resource.startTime + resource.duration);
    }

    return {
      resources: criticalResources.map(r => ({
        url: r.request.url,
        type: r.request.resourceType,
        duration: r.duration,
        size: r.response?.bodySize || 0
      })),
      totalBlockingTime,
      count: criticalResources.length
    };
  }

  private analyzeBandwidth(entries: NetworkEntry[]): any {
    const timeWindows: Map<number, number> = new Map();
    const windowSize = 1000; // 1 second windows

    // Group data transferred by time windows
    for (const entry of entries) {
      const window = Math.floor(entry.startTime / windowSize) * windowSize;
      const dataTransferred = entry.response?.bodySize || 0;
      
      timeWindows.set(window, (timeWindows.get(window) || 0) + dataTransferred);
    }

    // Calculate statistics
    const bandwidthData = Array.from(timeWindows.entries())
      .map(([time, bytes]) => ({
        time,
        bandwidth: (bytes * 8) / 1000 // Convert to kilobits per second
      }))
      .sort((a, b) => a.time - b.time);

    const bandwidthValues = bandwidthData.map(d => d.bandwidth);
    const peakBandwidth = Math.max(...bandwidthValues);
    const averageBandwidth = bandwidthValues.reduce((a, b) => a + b, 0) / bandwidthValues.length;

    return {
      peak: peakBandwidth,
      average: averageBandwidth,
      timeline: bandwidthData,
      totalDataTransferred: entries.reduce((sum, e) => sum + (e.response?.bodySize || 0), 0)
    };
  }

  private analyzeProtocols(entries: NetworkEntry[]): any {
    const protocolStats: Map<string, any> = new Map();

    for (const entry of entries) {
      const url = new URL(entry.request.url);
      const protocol = url.protocol.replace(':', '');
      
      if (!protocolStats.has(protocol)) {
        protocolStats.set(protocol, {
          count: 0,
          dataTransferred: 0,
          averageTime: 0,
          totalTime: 0
        });
      }
      
      const stats = protocolStats.get(protocol)!;
      stats.count++;
      stats.dataTransferred += entry.response?.bodySize || 0;
      stats.totalTime += entry.duration;
    }

    // Calculate averages
    protocolStats.forEach(stats => {
      if (stats.count > 0) {
        stats.averageTime = stats.totalTime / stats.count;
      }
    });

    return Object.fromEntries(protocolStats);
  }

  async finalize(executionId: string): Promise<NetworkSummary> {
    const summary: NetworkSummary = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDataSent: 0,
      totalDataReceived: 0,
      avgResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Number.MAX_VALUE,
      totalDuration: 0,
      totalDataTransferred: 0,
      totalTime: 0,
      averageResponseTime: 0,
      cachedRequests: 0,
      thirdPartyRequests: 0,
      scenarios: {},
      harFiles: [],
      analysisReports: [],
      waterfallFiles: [],
      securityReports: []
    };

    // Generate final reports for each scenario
    for (const [scenarioId, entries] of this.entries) {
      const scenarioPath = path.join(this.evidencePath, scenarioId);
      
      // Generate complete HAR file
      if (this.options.captureHAR) {
        const harBuilder = this.harBuilders.get(scenarioId);
        if (harBuilder) {
          const harPath = path.join(scenarioPath, `${scenarioId}-complete.har`);
          const har = harBuilder.build();
          await fs.promises.writeFile(harPath, JSON.stringify(har, null, 2));
          summary.harFiles.push(harPath);
        }
      }

      // Generate network analysis report
      if (this.options.analyzePerformance) {
        const analysisPath = path.join(scenarioPath, `${scenarioId}-analysis.json`);
        const analysis = await this.generateCompleteAnalysis(scenarioId);
        await fs.promises.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
        summary.analysisReports.push(analysisPath);
      }

      // Generate waterfall diagram data
      const waterfallPath = path.join(scenarioPath, `${scenarioId}-waterfall.json`);
      const waterfall = await this.generateWaterfall(entries);
      await fs.promises.writeFile(waterfallPath, JSON.stringify(waterfall, null, 2));
      summary.waterfallFiles.push(waterfallPath);

      // Generate security report if enabled
      if (this.options.analyzeSecurity) {
        const securityPath = path.join(scenarioPath, `${scenarioId}-security.json`);
        const securityReport = this.generateSecurityReport(scenarioId);
        await fs.promises.writeFile(securityPath, JSON.stringify(securityReport, null, 2));
        summary.securityReports.push(securityPath);
      }

      // Update summary
      const metrics = this.metrics.get(scenarioId);
      if (metrics) {
        summary.totalRequests += metrics.totalRequests;
        summary.totalDataTransferred += metrics.totalBytesTransferred;
        summary.totalTime += metrics.totalTime;
        summary.failedRequests += metrics.failedRequests;
        summary.cachedRequests += metrics.cachedRequests;
        summary.thirdPartyRequests += metrics.thirdPartyRequests;

        summary.scenarios[scenarioId] = {
          ...metrics,
          harFile: path.join(scenarioPath, `${scenarioId}-complete.har`),
          analysisFile: path.join(scenarioPath, `${scenarioId}-analysis.json`),
          waterfallFile: waterfallPath,
          securityFile: path.join(scenarioPath, `${scenarioId}-security.json`),
          stepReports: await this.generateStepReports(scenarioId)
        };
      }
    }

    // Calculate averages
    if (summary.totalRequests > 0) {
      summary.averageResponseTime = summary.totalTime / summary.totalRequests;
    }

    // Generate WebSocket summary if collected
    const webSocketSummary = await this.generateWebSocketSummary();
    if (webSocketSummary.totalFrames > 0) {
      const wsPath = path.join(this.evidencePath, 'websocket-summary.json');
      await fs.promises.writeFile(wsPath, JSON.stringify(webSocketSummary, null, 2));
      summary.webSocketReport = wsPath;
    }

    // Generate execution summary
    const summaryPath = path.join(this.evidencePath, 'network-summary.json');
    await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    // Generate consolidated metrics
    const metricsPath = path.join(this.evidencePath, 'network-metrics.json');
    const consolidatedMetrics = this.generateConsolidatedMetrics();
    await fs.promises.writeFile(metricsPath, JSON.stringify(consolidatedMetrics, null, 2));

    ActionLogger.logInfo('NetworkCollector finalized', {
      executionId,
      totalRequests: summary.totalRequests,
      totalDataTransferred: `${(summary.totalDataTransferred / 1024 / 1024).toFixed(2)} MB`,
      averageResponseTime: `${summary.averageResponseTime.toFixed(2)} ms`,
      failedRequests: summary.failedRequests,
      cachedRequests: summary.cachedRequests
    });

    return summary;
  }

  private generateSecurityReport(scenarioId: string): any {
    const securityInfos = this.securityInfo.get(scenarioId) || [];
    const entries = this.entries.get(scenarioId) || [];

    const report = {
      summary: {
        totalRequests: entries.length,
        httpsRequests: 0,
        httpRequests: 0,
        securityScore: 100,
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0
      },
      domains: new Map<string, any>(),
      securityHeaders: {
        coverage: new Map<string, number>(),
        missing: new Map<string, string[]>()
      },
      certificates: [],
      vulnerabilities: [],
      recommendations: [] as any[]
    };

    // Analyze each request
    for (const entry of entries) {
      const url = new URL(entry.request.url);
      const domain = url.hostname;

      if (!report.domains.has(domain)) {
        report.domains.set(domain, {
          domain,
          requests: 0,
          httpsRequests: 0,
          httpRequests: 0,
          securityScore: 100,
          issues: []
        });
      }

      const domainInfo = report.domains.get(domain)!;
      domainInfo.requests++;

      if (url.protocol === 'https:') {
        report.summary.httpsRequests++;
        domainInfo.httpsRequests++;
      } else if (url.protocol === 'http:') {
        report.summary.httpRequests++;
        domainInfo.httpRequests++;
        
        // HTTP is a security issue
        domainInfo.issues.push({
          severity: 'high',
          issue: 'Unencrypted HTTP connection',
          url: entry.request.url
        });
        report.summary.highIssues++;
      }
    }

    // Analyze security headers
    const headerChecks = [
      'strict-transport-security',
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'referrer-policy',
      'permissions-policy'
    ];

    for (const info of securityInfos) {
      for (const header of headerChecks) {
        if (!report.securityHeaders.coverage.has(header)) {
          report.securityHeaders.coverage.set(header, 0);
          report.securityHeaders.missing.set(header, []);
        }

        if (info.securityHeaders[header]) {
          report.securityHeaders.coverage.set(
            header, 
            report.securityHeaders.coverage.get(header)! + 1
          );
        } else {
          report.securityHeaders.missing.get(header)!.push(info.url);
        }
      }

      // Count issues
      for (const issue of info.issues) {
        report.summary.totalIssues++;
        if (issue.severity === 'critical') report.summary.criticalIssues++;
        else if (issue.severity === 'high') report.summary.highIssues++;
        else if (issue.severity === 'medium') report.summary.mediumIssues++;
        else if (issue.severity === 'low') report.summary.lowIssues++;
      }
    }

    // Calculate security scores
    const scoreDeductions = {
      critical: 25,
      high: 15,
      medium: 10,
      low: 5
    };

    report.summary.securityScore = Math.max(0, 100 - 
      (report.summary.criticalIssues * scoreDeductions.critical) -
      (report.summary.highIssues * scoreDeductions.high) -
      (report.summary.mediumIssues * scoreDeductions.medium) -
      (report.summary.lowIssues * scoreDeductions.low)
    );

    // Generate recommendations
    if (report.summary.httpRequests > 0) {
      report.recommendations.push({
        priority: 'high',
        title: 'Use HTTPS for all connections',
        description: `${report.summary.httpRequests} requests were made over insecure HTTP`,
        impact: 'Data can be intercepted or modified in transit',
        solution: 'Implement HTTPS across all endpoints and redirect HTTP to HTTPS'
      });
    }

    // Convert maps to objects for JSON serialization
    return {
      ...report,
      domains: Object.fromEntries(report.domains),
      securityHeaders: {
        coverage: Object.fromEntries(report.securityHeaders.coverage),
        missing: Object.fromEntries(report.securityHeaders.missing)
      }
    };
  }

  private async generateStepReports(scenarioId: string): Promise<string[]> {
    const stepReports: string[] = [];
    const stepTimings = this.stepTimings.get(scenarioId);
    
    if (!stepTimings) return stepReports;

    for (const [stepId] of stepTimings) {
      const stepPath = path.join(this.evidencePath, scenarioId, 'steps', stepId);
      const reportPath = path.join(stepPath, `${stepId}-report.json`);
      
      if (await FileUtils.exists(reportPath)) {
        stepReports.push(reportPath);
      }
    }

    return stepReports;
  }

  private async generateWebSocketSummary(): Promise<any> {
    const summary = {
      totalFrames: 0,
      totalConnections: 0,
      framesByType: new Map<string, number>(),
      framesByDirection: {
        sent: 0,
        received: 0
      },
      totalDataTransferred: 0,
      connections: [] as any[]
    };

    for (const [, frames] of this.webSockets) {
      const connectionMap = new Map<string, any>();

      for (const frame of frames) {
        summary.totalFrames++;
        summary.totalDataTransferred += frame.size;

        if (frame.direction === 'sent') {
          summary.framesByDirection.sent++;
        } else {
          summary.framesByDirection.received++;
        }

        const typeCount = summary.framesByType.get(frame.type) || 0;
        summary.framesByType.set(frame.type, typeCount + 1);

        // Group by connection
        if (!connectionMap.has(frame.wsId)) {
          connectionMap.set(frame.wsId, {
            wsId: frame.wsId,
            url: frame.wsUrl,
            frames: [],
            totalFrames: 0,
            sentFrames: 0,
            receivedFrames: 0,
            dataTransferred: 0
          });
        }

        const connection = connectionMap.get(frame.wsId)!;
        connection.frames.push(frame);
        connection.totalFrames++;
        connection.dataTransferred += frame.size;
        
        if (frame.direction === 'sent') {
          connection.sentFrames++;
        } else {
          connection.receivedFrames++;
        }
      }

      summary.connections.push(...Array.from(connectionMap.values()));
    }

    summary.totalConnections = summary.connections.length;

    return {
      ...summary,
      framesByType: Object.fromEntries(summary.framesByType)
    };
  }

  private generateConsolidatedMetrics(): any {
    const consolidated = {
      summary: {
        totalScenarios: this.metrics.size,
        totalRequests: 0,
        totalDataTransferred: 0,
        totalTime: 0,
        averageResponseTime: 0,
        successRate: 0,
        cacheHitRate: 0,
        thirdPartyPercentage: 0
      },
      resourceTypes: new Map<string, any>(),
      protocols: new Map<string, any>(),
      domains: new Map<string, any>(),
      performanceDistribution: {
        under100ms: 0,
        under500ms: 0,
        under1s: 0,
        under3s: 0,
        over3s: 0
      },
      statusCodeDistribution: new Map<string, number>(),
      throttling: this.throttling
    };

    let totalSuccessful = 0;
    let totalCached = 0;
    let totalThirdParty = 0;

    // Aggregate metrics from all scenarios
    for (const [scenarioId, metrics] of this.metrics) {
      consolidated.summary.totalRequests += metrics.totalRequests;
      consolidated.summary.totalDataTransferred += metrics.totalBytesTransferred;
      consolidated.summary.totalTime += metrics.totalTime;
      totalSuccessful += metrics.successfulRequests;
      totalCached += metrics.cachedRequests;
      totalThirdParty += metrics.thirdPartyRequests;

      // Aggregate resource types
      for (const [type, count] of Object.entries(metrics.resourceTypes)) {
        if (!consolidated.resourceTypes.has(type)) {
          consolidated.resourceTypes.set(type, { count: 0, scenarios: [] });
        }
        const typeInfo = consolidated.resourceTypes.get(type)!;
        typeInfo.count += count;
        typeInfo.scenarios.push(scenarioId);
      }

      // Aggregate protocols
      for (const [protocol, count] of Object.entries(metrics.protocols)) {
        if (!consolidated.protocols.has(protocol)) {
          consolidated.protocols.set(protocol, { count: 0, scenarios: [] });
        }
        const protocolInfo = consolidated.protocols.get(protocol)!;
        protocolInfo.count += count;
        protocolInfo.scenarios.push(scenarioId);
      }

      // Aggregate domains
      for (const [domain, count] of Object.entries(metrics.domains)) {
        if (!consolidated.domains.has(domain)) {
          consolidated.domains.set(domain, { count: 0, scenarios: [] });
        }
        const domainInfo = consolidated.domains.get(domain)!;
        domainInfo.count += count;
        domainInfo.scenarios.push(scenarioId);
      }
    }

    // Calculate performance distribution
    for (const entries of this.entries.values()) {
      for (const entry of entries) {
        if (entry.duration < 100) consolidated.performanceDistribution.under100ms++;
        else if (entry.duration < 500) consolidated.performanceDistribution.under500ms++;
        else if (entry.duration < 1000) consolidated.performanceDistribution.under1s++;
        else if (entry.duration < 3000) consolidated.performanceDistribution.under3s++;
        else consolidated.performanceDistribution.over3s++;

        // Status code distribution
        if (entry.response) {
          const statusRange = `${Math.floor(entry.response.status / 100)}xx`;
          consolidated.statusCodeDistribution.set(
            statusRange,
            (consolidated.statusCodeDistribution.get(statusRange) || 0) + 1
          );
        }
      }
    }

    // Calculate final metrics
    if (consolidated.summary.totalRequests > 0) {
      consolidated.summary.averageResponseTime = 
        consolidated.summary.totalTime / consolidated.summary.totalRequests;
      consolidated.summary.successRate = 
        (totalSuccessful / consolidated.summary.totalRequests) * 100;
      consolidated.summary.cacheHitRate = 
        (totalCached / consolidated.summary.totalRequests) * 100;
      consolidated.summary.thirdPartyPercentage = 
        (totalThirdParty / consolidated.summary.totalRequests) * 100;
    }

    // Sort domains by request count
    const sortedDomains = Array.from(consolidated.domains.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20); // Top 20 domains

    return {
      ...consolidated,
      resourceTypes: Object.fromEntries(consolidated.resourceTypes),
      protocols: Object.fromEntries(consolidated.protocols),
      domains: Object.fromEntries(sortedDomains),
      statusCodeDistribution: Object.fromEntries(consolidated.statusCodeDistribution)
    };
  }
}

// HAR Builder helper class
class HARBuilder {
  private har: HARFile;
  private pageId: string;
  private entries: Map<string, any> = new Map();

  constructor(pageName: string) {
    this.pageId = `page_${Date.now()}`;
    this.har = {
      log: {
        version: '1.2',
        creator: {
          name: 'CS Test Automation Framework - NetworkCollector',
          version: '1.0.0'
        },
        entries: []
      }
    };
    
    // Store additional metadata separately
    (this.har as any).metadata = {
      browser: {
        name: 'Playwright',
        version: process.env['PLAYWRIGHT_VERSION'] || '1.0.0',
        comment: 'Automated browser'
      },
      pages: [{
        startedDateTime: new Date().toISOString(),
        id: this.pageId,
        title: pageName,
        pageTimings: {
          onContentLoad: -1,
          onLoad: -1,
          comment: 'Timing events not available in headless mode'
        },
        comment: `HAR file for scenario: ${pageName}`
      }],
      comment: 'Complete network activity capture with request/response bodies'
    };
  }

  addEntry(entry: NetworkEntry): void {
    this.entries.set(entry.id, entry);
  }

  updateEntry(entry: NetworkEntry): void {
    this.entries.set(entry.id, entry);
  }

  build(): HARFile {
    // Convert all entries to HAR format
    this.har.log.entries = Array.from(this.entries.values())
      .sort((a, b) => a.startTime - b.startTime)
      .map(entry => this.convertToHAREntry(entry));

    // Update page timings if we have entries
    if (this.har.log.entries.length > 0) {
      const firstEntry = this.har.log.entries[0];
      const lastEntry = this.har.log.entries[this.har.log.entries.length - 1];
      
      // Update page metadata if available
      const metadata = (this.har as any).metadata;
      if (metadata && metadata.pages && metadata.pages[0] && firstEntry && lastEntry) {
        metadata.pages[0].startedDateTime = firstEntry.startedDateTime;
        
        // Calculate page timings
        const pageStart = new Date(firstEntry.startedDateTime).getTime();
        const pageEnd = new Date(lastEntry.startedDateTime).getTime() + lastEntry.time;
        
        metadata.pages[0].pageTimings = {
          onContentLoad: pageEnd - pageStart,
          onLoad: pageEnd - pageStart,
          comment: 'Calculated from first and last requests'
        };
      }
    }

    return this.har;
  }

  private convertToHAREntry(entry: NetworkEntry): any {
    const request = entry.request;
    const response = entry.response;
    
    // Ensure all required fields are present
    const harEntry = {
      pageref: this.pageId,
      startedDateTime: new Date(entry.startTime).toISOString(),
      time: Math.max(0, entry.duration),
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        cookies: this.parseCookies(request.headers['cookie'] || ''),
        headers: Object.entries(request.headers)
          .filter(([name]) => name.toLowerCase() !== 'cookie')
          .map(([name, value]) => ({
            name,
            value: Array.isArray(value) ? value.join(', ') : value.toString(),
            comment: ''
          })),
        queryString: this.parseQueryString(request.url),
        postData: request.postData ? {
          mimeType: request.headers['content-type'] || 'application/octet-stream',
          text: request.postData,
          params: this.parsePostData(request.postData, request.headers['content-type']),
          comment: ''
        } : undefined,
        headersSize: this.calculateHeadersSize(request.headers),
        bodySize: request.postData ? Buffer.byteLength(request.postData) : 0,
        comment: `Resource type: ${request.resourceType || 'unknown'}`
      },
      response: response ? {
        status: response.status,
        statusText: response.statusText || this.getStatusText(response.status),
        httpVersion: response.httpVersion || 'HTTP/1.1',
        cookies: this.parseCookies(response.headers['set-cookie'] || ''),
        headers: Object.entries(response.headers)
          .filter(([name]) => name.toLowerCase() !== 'set-cookie')
          .map(([name, value]) => ({
            name,
            value: Array.isArray(value) ? value.join(', ') : value.toString(),
            comment: ''
          })),
        content: {
          size: response.content.size,
          compression: response.content.compression || 0,
          mimeType: response.content.mimeType || 'application/octet-stream',
          text: response.content.text || '',
          encoding: response.content.encoding || 'base64',
          comment: response.content.size > 10485760 ? 'Content truncated (>10MB)' : ''
        },
        redirectURL: response.redirectURL || '',
        headersSize: this.calculateHeadersSize(response.headers),
        bodySize: response.bodySize,
        comment: response.error || ''
      } : {
        status: 0,
        statusText: 'No Response',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: [],
        content: {
          size: 0,
          compression: 0,
          mimeType: 'application/octet-stream',
          text: '',
          encoding: 'base64',
          comment: 'Request failed or was cancelled'
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: -1,
        comment: 'No response received'
      },
      cache: entry.cache || {},
      timings: {
        blocked: Math.max(0, entry.timings.blocked || -1),
        dns: Math.max(-1, entry.timings.dns || -1),
        connect: Math.max(-1, entry.timings.connect || -1),
        send: Math.max(0, entry.timings.send || 0),
        wait: Math.max(0, entry.timings.wait || 0),
        receive: Math.max(0, entry.timings.receive || 0),
        ssl: Math.max(-1, entry.timings.ssl || -1),
        comment: ''
      },
      serverIPAddress: entry.serverIPAddress || '',
      connection: entry.connection || '',
      comment: entry.stepId ? `Step: ${entry.stepId}` : ''
    };

    // Add optional fields if present
    if (entry.serverTiming && entry.serverTiming.length > 0) {
      (harEntry as any)._serverTiming = entry.serverTiming;
    }

    if (entry.priority) {
      (harEntry as any)._priority = entry.priority;
    }

    if (entry.initiator) {
      (harEntry as any)._initiator = {
        type: entry.initiator.type || 'other',
        url: entry.initiator.url,
        lineNumber: entry.initiator.lineNumber
      };
    }

    return harEntry;
  }

  private parseCookies(cookieString: string): any[] {
    if (!cookieString) return [];
    
    const cookies = [];
    const pairs = cookieString.split(/;\s*/);
    
    for (const pair of pairs) {
      const [name, ...valueParts] = pair.split('=');
      if (name) {
        cookies.push({
          name: name.trim(),
          value: valueParts.join('='),
          expires: null,
          httpOnly: false,
          secure: false,
          comment: ''
        });
      }
    }
    
    return cookies;
  }

  private parseQueryString(url: string): any[] {
    try {
      const urlObj = new URL(url);
      const params: any[] = [];
      
      urlObj.searchParams.forEach((value, name) => {
        params.push({
          name,
          value,
          comment: ''
        });
      });
      
      return params;
    } catch {
      return [];
    }
  }

  private parsePostData(postData: string, contentType?: string): any[] {
    if (!contentType || !postData) return [];
    
    const params = [];
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const pairs = postData.split('&');
      for (const pair of pairs) {
        const [name, value] = pair.split('=');
        if (name) {
          params.push({
            name: decodeURIComponent(name),
            value: value ? decodeURIComponent(value) : '',
            fileName: undefined,
            contentType: undefined,
            comment: ''
          });
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      // Parse multipart data
      const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
      if (boundary) {
        const parts = postData.split(`--${boundary}`);
        for (const part of parts) {
          const nameMatch = part.match(/name="([^"]+)"/);
          const fileMatch = part.match(/filename="([^"]+)"/);
          const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);
          
          if (nameMatch) {
            const valueStart = part.indexOf('\r\n\r\n');
            const valueEnd = part.lastIndexOf('\r\n');
            const value = valueStart > -1 && valueEnd > valueStart ? 
              part.substring(valueStart + 4, valueEnd) : '';
              
            params.push({
              name: nameMatch[1],
              value,
              fileName: fileMatch ? fileMatch[1] : undefined,
              contentType: contentTypeMatch ? contentTypeMatch[1] : undefined,
              comment: ''
            });
          }
        }
      }
    }
    
    return params;
  }

  private calculateHeadersSize(headers: Record<string, string>): number {
    let size = 0;
    
    for (const [name, value] of Object.entries(headers)) {
      // Each header line is: "name: value\r\n"
      size += name.length + 2 + value.toString().length + 2;
    }
    
    return size;
  }

  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      100: 'Continue',
      101: 'Switching Protocols',
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    };
    
    return statusTexts[status] || 'Unknown';
  }
}