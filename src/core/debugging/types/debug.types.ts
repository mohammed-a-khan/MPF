// src/core/debugging/types/debug.types.ts

import { Page, BrowserContext } from 'playwright';

export interface DebugOptions {
    enabled: boolean;
    breakOnError: boolean;
    breakOnWarning: boolean;
    preserveState: boolean;
    maxSnapshots: number;
    autoScreenshot: boolean;
    logLevel: 'verbose' | 'info' | 'error';
}

export interface DebugBreakpoint {
    id: string;
    pattern: string;
    type: 'step' | 'error' | 'custom';
    enabled: boolean;
    hitCount: number;
    condition?: string;
}

export interface DebugState {
    variables: Map<string, any>;
    callStack: CallStackFrame[];
    breakpoints: DebugBreakpoint[];
    watchExpressions: Map<string, string>;
}

export interface CallStackFrame {
    name: string;
    location: string;
    line: number;
    column: number;
    variables: Record<string, any>;
}

export interface DebugSession {
    id: string;
    startTime: Date;
    state: DebugState;
    paused: boolean;
    currentStep?: string;
}

export interface DebugCommand {
    type: 'continue' | 'stepOver' | 'stepInto' | 'stepOut' | 'pause' | 'resume';
    breakpointId?: string;
}

export interface TraceOptions {
    screenshots: boolean;
    snapshots: boolean;
    sources: boolean;
    title?: string;
    preserveOutput?: boolean;
    categories?: string[];
}

export interface TraceMetadata {
    url: string;
    title: string;
    viewport: { width: number; height: number } | null;
    userAgent: string;
    timestamp?: Date;
    custom?: Record<string, any>;
}

export interface TraceEvent {
    type: 'pageLoad' | 'domReady' | 'console' | 'error' | 'dialog' | 'network' | 'download' | 'custom' | 'attachment' | 'performance';
    timestamp: Date;
    data: any;
    duration?: number;
}

export interface TraceResult {
    path: string;
    size: number;
    duration: number;
    events: TraceEvent[];
}

export interface TraceSession {
    id: string;
    browserContext: any;
    startTime: Date;
    endTime?: Date;
    events: TraceEvent[];
    attachments: TraceAttachment[];
    metadata: TraceMetadata;
    status: 'active' | 'stopped' | 'failed';
    checkpoints: Map<string, any>;
}

export interface TraceAttachment {
    name: string;
    contentType: string;
    type?: 'screenshot' | 'html' | 'json' | 'text';
    path?: string;
    body?: Buffer | string;
    timestamp: Date;
}

export interface TraceInfo {
    path: string;
    size: number;
    duration: number;
    eventCount: number;
    attachmentCount: number;
    metadata: TraceMetadata;
}

export interface TraceAnalysis {
    filePath: string;
    fileSize: number;
    duration: number;
    startTime: Date;
    endTime: Date;
    events: TraceEvent[];
    summary: TraceSummary;
    metadata: TraceMetadata;
    eventAnalysis?: any;
    performanceMetrics?: any;
    issues?: any[];
    performance?: {
        pageLoadTime: number;
        domContentLoadedTime: number;
        networkRequests: number;
        totalDataTransferred: number;
        slowestRequests: Array<{url: string; duration: number}>;
    };
    errors?: Array<{message: string; stack?: string; timestamp: Date}>;
    console?: {
        logs: number;
        warnings: number;
        errors: number;
    };
    coverage?: {
        js: number;
        css: number;
    };
}

export interface TraceSummary {
    totalEvents: number;
    screenshots?: number;
    snapshots?: number;
    networkRequests?: number;
    consoleMessages?: number;
    errors?: number;
    eventTypes?: Record<string, number>;
    warnings?: number;
    pageLoads?: number;
    duration?: number;
    pauseDuration?: number;
    totalTraces?: number;
    activeTraces?: number;
    totalSize?: number;
    averageDuration?: number;
    eventStats?: Record<string, number>;
}

export interface TraceFileInfo {
    path: string;
    name: string;
    size: number;
    created: Date;
    metadata?: TraceMetadata;
}

export type VideoFormat = 'webm' | 'mp4' | 'avi';
export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface VideoOptions {
    enabled: boolean;
    format: VideoFormat;
    quality: VideoQuality;
    fps: number;
    width: number;
    height: number;
    preserveOutput: boolean;
    compressVideo: boolean;
    includeAudio: boolean;
    highlightClicks: boolean;
    watermark: string;
    maxDuration: number;
}

export interface VideoAnnotation {
    type: 'text' | 'box' | 'arrow' | 'highlight';
    text?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    startTime?: number;
    duration?: number;
    color?: string;
    style?: 'solid' | 'dashed' | 'dotted';
}

export interface VideoResult {
    path: string;
    size: number;
    duration: number;
    format: VideoFormat;
    resolution: { width: number; height: number };
}

export interface VideoMetadata {
    scenarioName: string;
    timestamp: Date;
    duration: number;
    annotations: VideoAnnotation[];
}

export interface ScreenshotOptions {
    type?: 'png' | 'jpeg';
    quality?: number;
    fullPage?: boolean;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    omitBackground?: boolean;
    animations?: 'disabled' | 'allow';
    caret?: 'hide' | 'initial';
    scale?: 'device' | 'css';
    timeout?: number;
    mask?: string[];
}

export interface ScreenshotComparison {
    threshold: number;
    includeAA?: boolean;
    generateDiff?: boolean;
    ignoreRegions?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}

export interface ScreenshotDiff {
    identical: boolean;
    diffPercentage: number;
    diffPixels: number;
    totalPixels: number;
    diffImage?: Buffer;
    regions?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}

export interface VisualTestResult {
    passed: boolean;
    testName: string;
    baselinePath?: string;
    actualPath: string;
    diffPath?: string;
    difference?: number;
    diffPixels?: number;
    totalPixels?: number;
    isNewBaseline?: boolean;
}

export interface VisualTestOptions {
    updateBaseline?: boolean;
    failOnDiff?: boolean;
    threshold?: number;
    fullPage?: boolean;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    mask?: string[];
    ignoreColors?: boolean;
    ignoreAntialiasing?: boolean;
}

export interface ScreenshotResult {
    path: string;
    buffer: Buffer;
    timestamp: Date;
    metadata: {
        width: number;
        height: number;
        format: 'png' | 'jpeg';
        size: number;
    };
}

export interface ScreenshotMask {
    selector?: string;
    element?: any;
    color?: string;
    blur?: boolean;
}

export type ConsoleLogLevel = 'error' | 'warning' | 'info' | 'log' | 'debug' | 'trace';

export interface ConsoleLogEntry {
    level: ConsoleLogLevel;
    text: string;
    timestamp: Date;
    args: any[];
    location?: {
        url: string;
        lineNumber: number;
        columnNumber: number;
    };
    stackTrace?: string;
    category?: string;
}

export interface ConsoleFilter {
    levels?: ConsoleLogLevel[];
    includePatterns?: RegExp[];
    excludePatterns?: RegExp[];
    timeRange?: {
        start: Date;
        end: Date;
    };
}

export interface ConsoleReport {
    entries: ConsoleLogEntry[];
    summary: {
        total: number;
        byLevel: Record<ConsoleLogLevel, number>;
        errors: ConsoleLogEntry[];
        warnings: ConsoleLogEntry[];
    };
    filtered: boolean;
}

export interface DebugMetrics {
    executionTime: number;
    memoryUsage: {
        heap: number;
        external: number;
        total: number;
    };
    cpuUsage: number;
    networkRequests: number;
    domElements: number;
}

export interface DebugContext {
    page: Page;
    browserContext: BrowserContext;
    scenarioName: string;
    featureName: string;
    stepText?: string;
    tags: string[];
}

export interface DebugArtifact {
    type: 'screenshot' | 'video' | 'trace' | 'console' | 'har' | 'coverage';
    path: string;
    timestamp: Date;
    size: number;
    metadata?: any;
}

export interface DebugReport {
    session: DebugSession;
    artifacts: DebugArtifact[];
    metrics: DebugMetrics;
    errors: Error[];
    timeline: TimelineEntry[];
}

export interface TimelineEntry {
    timestamp: Date;
    type: string;
    description: string;
    duration?: number;
    metadata?: any;
}

export interface PageSnapshot {
    url: string;
    title: string;
    html: string;
    timestamp: Date;
    viewport: { width: number; height: number };
    cookies: any[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
}

export interface DebugConfiguration {
    options: DebugOptions;
    traceOptions: TraceOptions;
    videoOptions: VideoOptions;
    screenshotOptions: ScreenshotOptions;
    consoleOptions: {
        captureAll: boolean;
        filterLevels: ConsoleLogLevel[];
    };
}

export interface DebugEvent {
    type: 'breakpoint-hit' | 'step-complete' | 'error' | 'warning' | 'pause' | 'resume';
    timestamp: Date;
    data: any;
}

export interface BreakpointHitEvent extends DebugEvent {
    type: 'breakpoint-hit';
    data: {
        breakpoint: DebugBreakpoint;
        callStack: CallStackFrame[];
        variables: Record<string, any>;
    };
}

export interface StepCompleteEvent extends DebugEvent {
    type: 'step-complete';
    data: {
        step: string;
        result: 'passed' | 'failed' | 'skipped';
        duration: number;
        screenshot?: string;
    };
}

export interface ErrorEvent extends DebugEvent {
    type: 'error';
    data: {
        error: Error;
        step?: string;
        screenshot?: string;
        callStack: CallStackFrame[];
    };
}
