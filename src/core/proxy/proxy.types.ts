/**
 * CS Test Automation Framework - Proxy Types
 * 
 * Complete type definitions for the proxy management system.
 * 
 * @author CS Test Automation Team
 * @version 4.0.0
 */

import { Socket } from 'net';
import { TLSSocket } from 'tls';

export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyServer {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  auth?: ProxyAuthentication;
  priority?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProxyConfig {
  enabled: boolean;
  servers: ProxyServer[];
  bypass?: string[];
  pacUrl?: string;
  pacScript?: string;
  rotation?: ProxyRotation;
  healthCheck?: ProxyHealthCheck;
  metrics?: ProxyMetricsConfig;
  connectionPool?: ProxyConnectionPool;
  retry?: ProxyRetry;
  certificates?: ProxyCertificate[];
  environment?: ProxyEnvironment;
}

export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
  bypass?: string[];
}

export interface ProxyAuthentication {
  username: string;
  password: string;
  type?: 'basic' | 'digest' | 'ntlm' | 'negotiate';
  domain?: string;
  workstation?: string;
}

export interface NTLMAuth extends ProxyAuthentication {
  type: 'ntlm';
  domain: string;
  workstation?: string;
}

export interface KerberosAuth extends ProxyAuthentication {
  type: 'negotiate';
  servicePrincipalName?: string;
  delegateCredentials?: boolean;
}

export interface ProxyConnection {
  id: string;
  proxy?: ProxyConfig;
  target: string;
  socket?: Socket | TLSSocket;
  state: 'connecting' | 'connected' | 'idle' | 'error' | 'closed';
  createdAt: Date;
  lastUsed?: Date;
  stats: ConnectionStats;
}

export interface ConnectionStats {
  bytesSent: number;
  bytesReceived: number;
  requestCount: number;
  errorCount: number;
  latency?: number;
}

export interface ProxyTunnel {
  id: string;
  proxy?: ProxyConfig;
  targetHost: string;
  targetPort: number;
  socket: Socket | TLSSocket;
  state: 'connecting' | 'connected' | 'error' | 'closed';
  createdAt: Date;
  stats: TunnelStats;
}

export interface TunnelStats {
  bytesSent: number;
  bytesReceived: number;
  latency: number;
}

export interface ProxyPool {
  id: string;
  proxy: ProxyConfig;
  connections: Map<string, ProxyConnection>;
  maxSize: number;
  maxIdleTime: number;
  stats: PoolStats;
}

export interface PoolStats {
  active: number;
  idle: number;
  total: number;
  created: number;
  destroyed: number;
  errors: number;
}

export interface ProxyStats {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  activeTunnels: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  avgLatency: number;
  connectionsByProxy: Map<string, number>;
  errorsByType: Map<string, number>;
  startTime: Date;
  uptime?: number;
  poolStats?: any;
  healthStats?: any;
}

export interface ProxyMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    active: number;
  };
  bytes: {
    sent: number;
    received: number;
  };
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  connections: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };
  errors: Map<string, number>;
  timestamp?: Date;
}

export interface ProxyRotation {
  enabled: boolean;
  strategy: 'round-robin' | 'weighted' | 'least-connections' | 'random';
  weights?: Record<string, number>;
  sticky?: boolean;
  stickyTTL?: number;
  servers: ProxyConfig[];
}

export interface ProxyHealthCheck {
  enabled: boolean;
  interval?: number;
  timeout?: number;
  retries?: number;
  testUrl?: string;
}

export interface ProxyHealth {
  proxy: ProxyConfig;
  healthy: boolean;
  lastCheck: Date;
  responseTime: number;
  successRate: number;
  errorCount: number;
  error?: string;
}

export interface ProxyMetricsConfig {
  enabled: boolean;
  collectInterval?: number;
  retentionPeriod?: number;
  exporters?: MetricsExporter[];
}

export interface MetricsExporter {
  type: 'console' | 'file' | 'http' | 'prometheus';
  config: any;
}

export interface ProxyConnectionPool {
  maxSize?: number;
  maxIdleTime?: number;
  acquireTimeout?: number;
  testOnBorrow?: boolean;
  testOnReturn?: boolean;
  evictionInterval?: number;
}

export interface ProxyRetry {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  maxDelay?: number;
  retryableErrors?: string[];
}

export interface ProxyCertificate {
  host: string;
  cert: string | Buffer;
  key?: string | Buffer;
  ca?: string | Buffer | Array<string | Buffer>;
  passphrase?: string;
}

export interface ProxyEnvironment {
  httpProxy?: string;
  httpsProxy?: string;
  socksProxy?: string;
  noProxy?: string[];
  allProxy?: string;
}

export interface PACScript {
  id: string;
  content: string;
  url?: string;
  loadedAt: Date;
  cache: Map<string, PACCacheEntry>;
  findProxyForURL?: (url: string, host: string) => string;
}

export interface PACCacheEntry {
  result: string;
  timestamp: number;
}

export interface ConnectionOptions {
  timeout?: number;
  socketOptions?: any;
  retry?: ProxyRetry;
  keepAlive?: boolean;
  proxy?: ProxyConfig;
}

export interface TunnelOptions extends ConnectionOptions {
  tls?: any;
  targetProtocol?: string;
}

export interface ProxyBypassRule {
  pattern: string;
  regex: RegExp;
  ports?: number[];
  protocols?: string[];
}

export interface ProxyChain {
  proxies: ProxyConfig[];
  currentIndex: number;
  maxHops?: number;
}

export interface ProxyError extends Error {
  code?: string;
  details?: any;
  proxy?: ProxyConfig;
  retry?: boolean;
}

export interface ProxyEvent {
  type: 'connection' | 'tunnel' | 'error' | 'health' | 'rotation' | 'metrics';
  timestamp: Date;
  data: any;
}

export interface ProxySelector {
  select(url: string, proxies: ProxyConfig[]): ProxyConfig | null;
  filter(proxies: ProxyConfig[], criteria: any): ProxyConfig[];
}

export interface ProxyValidator {
  validate(proxy: ProxyConfig): ProxyValidationResult;
  test(proxy: ProxyConfig, testUrl?: string): Promise<boolean>;
}

export interface ProxyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProxyConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    default?: any;
    enum?: any[];
    pattern?: RegExp;
    min?: number;
    max?: number;
    items?: any;
    properties?: ProxyConfigSchema;
  };
}

export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  proxy: ProxyConfig;
  timeout?: number;
  retry?: ProxyRetry;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  proxy: ProxyConfig;
  duration: number;
}

export interface ProxyMiddleware {
  name: string;
  priority: number;
  process(request: ProxyRequest, next: () => Promise<ProxyResponse>): Promise<ProxyResponse>;
}

export interface ProxyInterceptor {
  onRequest?(request: ProxyRequest): ProxyRequest | Promise<ProxyRequest>;
  onResponse?(response: ProxyResponse): ProxyResponse | Promise<ProxyResponse>;
  onError?(error: ProxyError): void | Promise<void>;
}

export interface ProxyPlugin {
  name: string;
  version: string;
  initialize(manager: any): void;
  middleware?: ProxyMiddleware[];
  interceptors?: ProxyInterceptor[];
}

export interface ProxyMonitor {
  start(): void;
  stop(): void;
  getStatus(): ProxyMonitorStatus;
  on(event: string, handler: (data: any) => void): void;
}

export interface ProxyMonitorStatus {
  running: boolean;
  uptime: number;
  connections: {
    active: number;
    total: number;
    failed: number;
  };
  performance: {
    avgLatency: number;
    throughput: number;
    errorRate: number;
  };
}

export interface ProxyLoadBalancer {
  algorithm: string;
  healthCheck: boolean;
  distribute(request: ProxyRequest, proxies: ProxyConfig[]): ProxyConfig;
  updateWeights(weights: Record<string, number>): void;
}

export interface ProxyCircuitBreaker {
  threshold: number;
  timeout: number;
  state: 'closed' | 'open' | 'half-open';
  trip(proxy: ProxyConfig): void;
  reset(proxy: ProxyConfig): void;
  isOpen(proxy: ProxyConfig): boolean;
}

export interface ProxyRateLimiter {
  limit: number;
  window: number;
  isAllowed(proxy: ProxyConfig, identifier: string): boolean;
  consume(proxy: ProxyConfig, identifier: string, tokens?: number): boolean;
}

export interface ProxyCache {
  get(key: string): ProxyResponse | undefined;
  set(key: string, response: ProxyResponse, ttl?: number): void;
  has(key: string): boolean;
  clear(): void;
  size(): number;
}

export interface ProxyLogger {
  log(level: string, message: string, data?: any): void;
  logRequest(request: ProxyRequest): void;
  logResponse(response: ProxyResponse): void;
  logError(error: ProxyError): void;
}

export interface ProxyAnalytics {
  track(event: string, properties: any): void;
  measure(metric: string, value: number, tags?: Record<string, string>): void;
  report(): ProxyAnalyticsReport;
}

export interface ProxyAnalyticsReport {
  period: { start: Date; end: Date };
  requests: {
    total: number;
    byProxy: Record<string, number>;
    byStatus: Record<number, number>;
  };
  performance: {
    avgLatency: number;
    p95Latency: number;
    throughput: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    byProxy: Record<string, number>;
  };
}

export interface ProxySecurityConfig {
  tlsVerification: boolean;
  allowedProtocols: string[];
  blockedHosts: string[];
  certificatePinning?: Array<{
    host: string;
    pins: string[];
  }>;
  dnssec: boolean;
}

export interface ProxyDiagnostics {
  testConnectivity(proxy: ProxyConfig): Promise<DiagnosticResult>;
  traceroute(proxy: ProxyConfig, target: string): Promise<TracerouteResult[]>;
  measureLatency(proxy: ProxyConfig, samples?: number): Promise<LatencyMeasurement>;
  checkCertificate(proxy: ProxyConfig): Promise<CertificateInfo>;
}

export interface DiagnosticResult {
  success: boolean;
  latency: number;
  error?: string;
  details: any;
}

export interface TracerouteResult {
  hop: number;
  host: string;
  latency: number;
}

export interface LatencyMeasurement {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  samples: number[];
}

export interface CertificateInfo {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
}

export interface ProxyOptimizer {
  analyze(stats: ProxyStats, metrics: ProxyMetrics): OptimizationSuggestion[];
  optimize(config: ProxyConfig, suggestions: OptimizationSuggestion[]): ProxyConfig;
}

export interface OptimizationSuggestion {
  type: 'performance' | 'reliability' | 'cost' | 'security';
  priority: 'low' | 'medium' | 'high';
  description: string;
  impact: string;
  implementation: () => void;
}