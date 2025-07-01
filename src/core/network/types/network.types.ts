import { Request, Route, WebSocket, APIResponse } from 'playwright';

export interface URLPattern {
    url?: string | RegExp;
    method?: string | string[];
    resourceType?: ResourceType[];
    priority?: number;
}

export type ResourceType = 
    | 'document' 
    | 'stylesheet' 
    | 'image' 
    | 'media' 
    | 'font' 
    | 'script' 
    | 'texttrack' 
    | 'xhr' 
    | 'fetch' 
    | 'eventsource' 
    | 'websocket' 
    | 'manifest' 
    | 'other';

export interface MockResponse {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: any;
    json?: any;
    text?: string;
    contentType?: string;
    delay?: number;
    path?: string;
}

export interface MockCondition {
    (request: Request): boolean;
}

export interface MockCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
    timestamp: Date;
    matchedPattern: string;
    response?: MockResponse;
    responseTime?: number;
}

export interface MockSequenceItem {
    response: MockResponse;
    index: number;
    used: boolean;
}

export interface RequestHandler {
    (route: Route, request: Request): Promise<void>;
}

export interface ResponseHandler {
    (route: Route, response: APIResponse): Promise<void>;
}

export interface BodyTransformer {
    (body: any): any | Promise<any>;
}

export interface NetworkError {
    type: 'abort' | 'timeout' | 'failure' | 'dns' | 'connection';
    message?: string;
    code?: string;
}

export interface InterceptorOptions {
    logRequests?: boolean;
    logResponses?: boolean;
    recordStats?: boolean;
    maxRecordedRequests?: number;
}

export interface RequestStats {
    url: string;
    method: string;
    status: number;
    duration: number;
    size: number;
    timestamp: Date;
}

export interface ThrottleOptions {
    downloadSpeed: number;
    uploadSpeed: number;
    latency: number;
}

export interface InterceptRule {
    pattern: URLPattern;
    handler: RequestHandler | ResponseHandler;
    type: 'request' | 'response';
    priority?: number;
    enabled?: boolean;
}

export interface RequestModification {
    url?: string | ((currentUrl: string) => string);
    method?: string;
    headers?: Record<string, string> | ((currentHeaders: Record<string, string>) => Record<string, string>);
    postData?: string | Buffer | ((currentData: string | null) => string | Buffer);
}

export interface NetworkThrottle {
    downloadSpeed: number;
    uploadSpeed: number;
    latency: number;
    offline?: boolean;
    connectionType?: 'wifi' | '3g' | '4g' | 'slow-2g' | 'edge';
}

export interface ResponseModification {
    url: string;
    type: 'header_injection' | 'header_removal' | 'body_transformation' | 
          'error_simulation' | 'timeout_simulation' | 'slow_response_simulation' |
          'status_code_modification';
    modifications: any;
    timestamp: Date;
}

export interface ModifierRule {
    pattern: URLPattern;
    handler: ResponseHandler;
    enabled: boolean;
    priority: number;
    id: string;
}

export interface ResponseModifierOptions {
    logModifications?: boolean;
    preserveOriginal?: boolean;
    maxHistorySize?: number;
    enableValidation?: boolean;
}

export interface HAROptions {
    content?: 'embed' | 'attach' | 'omit';
    urlFilter?: string | RegExp;
    contentTypes?: string[];
    maxSize?: number;
}

export interface HAR {
    log: {
        version: string;
        creator: {
            name: string;
            version: string;
        };
        pages?: Array<{
            startedDateTime: string;
            id: string;
            title: string;
            pageTimings: {
                onContentLoad?: number;
                onLoad?: number;
            };
        }>;
        entries: HAREntry[];
        _performanceMetrics?: any;
    };
}

export interface HAREntry {
    startedDateTime: string;
    time: number;
    request: {
        method: string;
        url: string;
        httpVersion: string;
        cookies: Array<{
            name: string;
            value: string;
        }>;
        headers: Array<{
            name: string;
            value: string;
        }>;
        queryString: Array<{
            name: string;
            value: string;
        }>;
        postData?: {
            mimeType: string;
            text?: string;
            params?: Array<{
                name: string;
                value: string;
            }>;
        };
        bodySize: number;
    };
    response: {
        status: number;
        statusText: string;
        httpVersion: string;
        cookies: Array<{
            name: string;
            value: string;
        }>;
        headers: Array<{
            name: string;
            value: string;
        }>;
        content: {
            size: number;
            compression?: number;
            mimeType: string;
            text?: string;
            encoding?: string;
        };
        redirectURL: string;
        bodySize: number;
    };
    cache: {
        beforeRequest?: {
            lastAccess: string;
            eTag: string;
            hitCount: number;
        };
        afterRequest?: {
            lastAccess: string;
            eTag: string;
            hitCount: number;
        };
    };
    timings: {
        blocked?: number;
        dns?: number;
        connect?: number;
        ssl?: number;
        send?: number;
        wait?: number;
        receive?: number;
    };
    serverIPAddress?: string;
    connection?: string;
}

export interface HARAnalysis {
    summary: {
        totalRequests: number;
        totalSize: number;
        totalTime: number;
        averageResponseTime: number;
        cacheHitRate: number;
    };
    breakdown: {
        byType: Record<string, { count: number; size: number }>;
        byDomain: Record<string, { count: number; size: number }>;
        byStatus: Record<string, number>;
    };
    performance: {
        slowestRequests: HAREntry[];
        largestRequests: HAREntry[];
        failedRequests: HAREntry[];
        timeline: TimelineEntry[];
    };
}

export interface PerformanceMetrics {
    pageLoadTime: number;
    domContentLoaded: number;
    firstPaint: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    timeToInteractive: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
}

export interface HARFilter {
    urlPattern?: string | RegExp;
    method?: string;
    status?: number | number[];
    contentType?: string;
    minDuration?: number;
    minSize?: number;
}

export interface WaterfallData {
    entries: Array<{
        url: string;
        method: string;
        status: number;
        mimeType: string;
        startTime: number;
        duration: number;
        size: number;
        timings: {
            blocked: number;
            dns: number;
            connect: number;
            ssl: number;
            send: number;
            wait: number;
            receive: number;
        };
    }>;
    totalTime: number;
    startTime: number;
}

export interface TimelineEntry {
    timestamp: number;
    type: 'request' | 'response' | 'error';
    url: string;
    duration?: number;
    status?: number;
    error?: string;
}

export interface ResourceTiming {
    name: string;
    entryType: string;
    startTime: number;
    duration: number;
    initiatorType: string;
    nextHopProtocol: string;
    workerStart: number;
    redirectStart: number;
    redirectEnd: number;
    fetchStart: number;
    domainLookupStart: number;
    domainLookupEnd: number;
    connectStart: number;
    connectEnd: number;
    secureConnectionStart: number;
    requestStart: number;
    responseStart: number;
    responseEnd: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
}

export interface WebSocketState {
    readyState: 'connecting' | 'open' | 'closing' | 'closed';
    bufferedAmount: number;
    extensions: string;
    protocol: string;
}

export interface Message {
    type: 'sent' | 'received';
    data: string | Buffer;
    timestamp: Date;
}

export interface MessageMatcher {
    (message: string): boolean;
}

export interface JSONMatcher {
    (json: any): boolean;
}

export interface WebSocketConnection {
    websocket: WebSocket;
    url: string;
    state: 'connecting' | 'open' | 'closing' | 'closed';
    protocol: string;
    extensions: string;
    protocols: string[];
    metrics: WebSocketMetrics;
}

export interface WebSocketOptions {
    autoReconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    messageTimeout?: number;
    logMessages?: boolean;
    maxHistorySize?: number;
}

export interface WebSocketMetrics {
    messagesSent: number;
    messagesReceived: number;
    bytesSent: number;
    bytesReceived: number;
    errors: number;
    reconnects: number;
    bufferedAmount: number;
    connectionTime: number;
}

export interface WebSocketEvent {
    type: 'open' | 'close' | 'error' | 'disconnect' | 'reconnect';
    timestamp: Date;
    code?: number;
    reason?: string;
    error?: string;
    simulated?: boolean;
}

export interface NetworkConditionPreset {
    name: string;
    downloadSpeed: number;
    uploadSpeed: number;
    latency: number;
    packetLoss?: number;
}

export const NETWORK_PRESETS: Record<string, NetworkConditionPreset> = {
    'GPRS': {
        name: 'GPRS',
        downloadSpeed: 50 * 1024,
        uploadSpeed: 20 * 1024,
        latency: 500
    },
    '3G': {
        name: 'Regular 3G',
        downloadSpeed: 750 * 1024,
        uploadSpeed: 250 * 1024,
        latency: 100
    },
    '4G': {
        name: 'Regular 4G',
        downloadSpeed: 4 * 1024 * 1024,
        uploadSpeed: 3 * 1024 * 1024,
        latency: 20
    },
    'WiFi': {
        name: 'WiFi',
        downloadSpeed: 30 * 1024 * 1024,
        uploadSpeed: 15 * 1024 * 1024,
        latency: 2
    },
    'offline': {
        name: 'Offline',
        downloadSpeed: 0,
        uploadSpeed: 0,
        latency: 0
    }
};
