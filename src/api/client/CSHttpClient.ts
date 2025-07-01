// src/api/client/CSHttpClient.ts
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import {
  RequestOptions,
  Response,
  RequestError,
  PerformanceMetrics,
  ProxyConfig as APIProxyConfig
} from '../types/api.types';
import { ResponseParser } from './ResponseParser';
import { AuthenticationHandler } from './AuthenticationHandler';
import { RetryHandler } from './RetryHandler';
import { ConnectionPool } from './ConnectionPool';
import { ProxyManager } from '../../core/proxy/ProxyManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';

export class CSHttpClient {
  private static instance: CSHttpClient;
  private connectionPool: ConnectionPool;
  private authHandler: AuthenticationHandler;
  private retryHandler: RetryHandler;
  private responseParser: ResponseParser;
  private activeRequests: Map<string, http.ClientRequest> = new Map();
  private requestCounter: number = 0;

  private constructor() {
    this.connectionPool = ConnectionPool.getInstance();
    this.authHandler = new AuthenticationHandler();
    this.retryHandler = new RetryHandler();
    this.responseParser = new ResponseParser();
  }

  public static getInstance(): CSHttpClient {
    if (!CSHttpClient.instance) {
      CSHttpClient.instance = new CSHttpClient();
    }
    return CSHttpClient.instance;
  }

  public async request(options: RequestOptions): Promise<Response> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    ActionLogger.getInstance().logAPIRequest(requestId, options);

    try {
      if (options.auth) {
        options = await this.authHandler.applyAuthentication(options, options.auth);
      }

      if (options.proxy || ConfigurationManager.getBoolean('USE_PROXY', false)) {
        options = await this.applyProxy(options);
      }

      const response = await this.retryHandler.executeWithRetry(
        () => this.executeRequest(requestId, options),
        {
          maxRetries: options.retryCount || ConfigurationManager.getInt('API_RETRY_COUNT', 3),
          delay: options.retryDelay || ConfigurationManager.getInt('API_RETRY_DELAY', 1000),
          retryCondition: this.shouldRetry.bind(this)
        }
      );

      const duration = Date.now() - startTime;
      response.duration = duration;

      ActionLogger.getInstance().logAPIResponse(requestId, response);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      ActionLogger.getInstance().logAPIError(requestId, error as Error, duration);
      throw this.enhanceError(error as Error, options);
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  public async get(url: string, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'GET' });
  }

  public async post(url: string, body?: any, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'POST', body });
  }

  public async put(url: string, body?: any, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'PUT', body });
  }

  public async delete(url: string, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'DELETE' });
  }

  public async patch(url: string, body?: any, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'PATCH', body });
  }

  public async head(url: string, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'HEAD' });
  }

  public async options(url: string, options?: Partial<RequestOptions>): Promise<Response> {
    return this.request({ ...options, url, method: 'OPTIONS' });
  }

  private async executeRequest(requestId: string, options: RequestOptions): Promise<Response> {
    return new Promise((resolve, reject) => {
      const parsedUrl = url.parse(options.url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const requestOptions = this.buildNodeRequestOptions(options, parsedUrl);
      const performanceMetrics: PerformanceMetrics = { total: 0 };
      
      const agent = this.connectionPool.getAgent(options.url, parsedUrl.protocol === 'https:');
      requestOptions.agent = agent;

      const req = protocol.request(requestOptions, (res) => {
        this.handleResponse(requestId, res, options, performanceMetrics)
          .then(resolve)
          .catch(reject);
      });

      this.activeRequests.set(requestId, req);

      this.setupRequestEventHandlers(req, requestId, options, performanceMetrics, reject);

      if (options.body) {
        this.writeRequestBody(req, options);
      }

      req.end();
    });
  }

  private buildNodeRequestOptions(options: RequestOptions, parsedUrl: url.UrlWithStringQuery): http.RequestOptions & https.RequestOptions {
    const nodeOptions: http.RequestOptions & https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path || '/',
      method: options.method,
      headers: this.buildHeaders(options),
      timeout: options.timeout || ConfigurationManager.getInt('API_DEFAULT_TIMEOUT', 60000),
      rejectUnauthorized: options.validateSSL !== false
    };

    if (options.cert) {
      Object.assign(nodeOptions, {
        ...(options.cert.cert && { cert: options.cert.cert }),
        ...(options.cert.key && { key: options.cert.key }),
        ...(options.cert.ca && { ca: options.cert.ca }),
        ...(options.cert.passphrase && { passphrase: options.cert.passphrase }),
        ...(options.cert.pfx && { pfx: options.cert.pfx }),
        ...(options.cert.rejectUnauthorized !== undefined && { rejectUnauthorized: options.cert.rejectUnauthorized })
      });
    }

    return nodeOptions;
  }

  private buildHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': ConfigurationManager.get('API_USER_AGENT', 'CS-Test-Automation-Framework/1.0'),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': options.compress !== false ? 'gzip, deflate, br' : 'identity',
      ...options.headers
    };

    if (options.body) {
      if (!headers['Content-Type']) {
        if (typeof options.body === 'object') {
          headers['Content-Type'] = 'application/json';
        } else {
          headers['Content-Type'] = 'text/plain';
        }
      }

      const bodyData = this.prepareRequestBody(options.body, headers['Content-Type']);
      headers['Content-Length'] = Buffer.byteLength(bodyData).toString();
    }

    return headers;
  }

  private prepareRequestBody(body: any, contentType: string): string | Buffer {
    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (contentType.includes('application/json') && typeof body === 'object') {
      return JSON.stringify(body);
    }

    if (contentType.includes('application/x-www-form-urlencoded') && typeof body === 'object') {
      return new URLSearchParams(body).toString();
    }

    return String(body);
  }

  private writeRequestBody(req: http.ClientRequest, options: RequestOptions): void {
    const body = this.prepareRequestBody(
      options.body,
      options.headers?.['Content-Type'] || 'application/json'
    );

    if (options.body instanceof Readable) {
      options.body.pipe(req);
    } else {
      req.write(body);
    }
  }

  private async handleResponse(
    _requestId: string,
    res: http.IncomingMessage,
    options: RequestOptions,
    metrics: PerformanceMetrics
  ): Promise<Response> {
    metrics.firstByte = Date.now();
    
    if (this.isRedirect(res.statusCode) && options.maxRedirects !== 0) {
      return this.handleRedirect(res, options);
    }

    const responseStream = this.decompressResponse(res);
    
    const chunks: Buffer[] = [];
    let totalSize = 0;

    return new Promise((resolve, reject) => {
      responseStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });

      responseStream.on('end', async () => {
        metrics.download = Date.now() - metrics.firstByte!;
        metrics.total = Date.now();

        try {
          const body = Buffer.concat(chunks);
          const parsedResponse = await this.responseParser.parse({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: res.headers as Record<string, string | string[]>,
            body,
            contentType: res.headers['content-type'] || 'text/plain',
            encoding: 'utf8',
            size: totalSize
          });

          const response: Response = {
            status: parsedResponse.status,
            statusText: parsedResponse.statusText,
            headers: parsedResponse.headers,
            body: parsedResponse.body,
            request: {
              url: options.url,
              method: options.method,
              headers: options.headers || {},
              body: options.body
            },
            duration: metrics.total,
            size: totalSize,
            timestamp: new Date()
          };

          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      responseStream.on('error', reject);
    });
  }

  private decompressResponse(res: http.IncomingMessage): NodeJS.ReadableStream {
    const encoding = res.headers['content-encoding'];
    
    if (!encoding) {
      return res;
    }

    switch (encoding) {
      case 'gzip':
        return res.pipe(zlib.createGunzip());
      case 'deflate':
        return res.pipe(zlib.createInflate());
      case 'br':
        return res.pipe(zlib.createBrotliDecompress());
      default:
        return res;
    }
  }

  private setupRequestEventHandlers(
    req: http.ClientRequest,
    _requestId: string,
    options: RequestOptions,
    metrics: PerformanceMetrics,
    reject: (error: any) => void
  ): void {
    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        metrics.dns = Date.now();
      });

      socket.on('connect', () => {
        metrics.tcp = Date.now() - (metrics.dns || Date.now());
      });

      socket.on('secureConnect', () => {
        metrics.tls = Date.now() - (metrics.tcp || Date.now());
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(this.createTimeoutError(options));
    });

    req.on('error', (error: Error) => {
      reject(this.enhanceError(error, options));
    });

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('Request aborted'));
      });
    }
  }

  private isRedirect(statusCode?: number): boolean {
    return statusCode !== undefined && [301, 302, 303, 307, 308].includes(statusCode);
  }

  private async handleRedirect(
    res: http.IncomingMessage,
    options: RequestOptions
  ): Promise<Response> {
    const location = res.headers.location;
    if (!location) {
      throw new Error('Redirect response missing location header');
    }

    const redirectUrl = url.resolve(options.url, location);
    const maxRedirects = options.maxRedirects ?? ConfigurationManager.getInt('API_MAX_REDIRECTS', 5);
    
    ActionLogger.getInstance().info(`Redirecting to: ${redirectUrl}`);

    return this.request({
      ...options,
      url: redirectUrl,
      maxRedirects: maxRedirects - 1
    });
  }

  private shouldRetry(error: any, response?: Response): boolean {
    if (error && error.noRetry) {
      return false;
    }

    if (error && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
      return true;
    }

    if (response && response.status >= 500) {
      return true;
    }

    if (response && response.status === 429) {
      return true;
    }

    return false;
  }

  private async applyProxy(options: RequestOptions): Promise<RequestOptions> {
    let proxyConfig: APIProxyConfig | null = null;
    
    if (options.proxy) {
      proxyConfig = options.proxy;
    } else {
      const coreProxy = ProxyManager.getProxyConfig(options.url);
      if (coreProxy && (coreProxy as any).servers && (coreProxy as any).servers.length > 0) {
        const proxyServer = (coreProxy as any).servers[0];
        if (proxyServer) {
          let apiProtocol: 'http' | 'https' | 'socks5';
          switch (proxyServer.protocol) {
            case 'http':
            case 'https':
            case 'socks5':
              apiProtocol = proxyServer.protocol;
              break;
            case 'socks4':
              apiProtocol = 'socks5';
              break;
            default:
              apiProtocol = 'http';
          }
          
          const config: APIProxyConfig = {
            host: proxyServer.host,
            port: proxyServer.port
          };
          
          if (apiProtocol) {
            config.protocol = apiProtocol;
          }
          if (proxyServer.auth) {
            config.auth = proxyServer.auth;
          }
          if ((coreProxy as any).bypass) {
            config.bypass = (coreProxy as any).bypass;
          }
          
          proxyConfig = config;
        }
      }
    }
    
    if (!proxyConfig) {
      return options;
    }

    if (proxyConfig.bypass && this.shouldBypassProxy(options.url, proxyConfig.bypass)) {
      return options;
    }

    if (proxyConfig.protocol === 'socks5') {
      throw new Error('SOCKS5 proxy support requires additional implementation');
    }

    return {
      ...options,
      headers: {
        ...options.headers,
        'Host': url.parse(options.url).hostname || '',
        ...(proxyConfig.auth ? {
          'Proxy-Authorization': 'Basic ' + Buffer.from(
            `${proxyConfig.auth.username}:${proxyConfig.auth.password}`
          ).toString('base64')
        } : {})
      },
      proxy: proxyConfig
    };
  }

  private shouldBypassProxy(targetUrl: string, bypassList: string[]): boolean {
    const parsedUrl = url.parse(targetUrl);
    const hostname = parsedUrl.hostname || '';

    return bypassList.some(pattern => {
      if (pattern.startsWith('*.')) {
        return hostname.endsWith(pattern.substring(2));
      }
      return hostname === pattern;
    });
  }

  private createTimeoutError(options: RequestOptions): RequestError {
    const error = new Error(`Request timeout after ${options.timeout}ms`) as RequestError;
    error.code = 'ETIMEDOUT';
    error.request = options;
    return error;
  }

  private enhanceError(error: Error, options: RequestOptions): RequestError {
    const enhancedError = error as RequestError;
    enhancedError.request = options;
    
    if (enhancedError.code === 'ENOTFOUND') {
      enhancedError.message = `Unable to resolve hostname: ${url.parse(options.url).hostname}`;
    } else if (enhancedError.code === 'ECONNREFUSED') {
      enhancedError.message = `Connection refused: ${options.url}`;
    }

    return enhancedError;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}_${crypto.randomBytes(4).toString('hex')}`;
  }

  public abortRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.destroy();
      this.activeRequests.delete(requestId);
      ActionLogger.getInstance().info(`Request ${requestId} aborted`);
    }
  }

  public getActiveRequests(): string[] {
    return Array.from(this.activeRequests.keys());
  }

  public async downloadFile(
    url: string,
    destinationPath: string,
    options?: Partial<RequestOptions>,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const fs = await import('fs');
    const response = await this.request({
      ...options,
      url,
      method: 'GET',
      responseType: 'stream'
    });

    const totalSize = parseInt(response.headers['content-length'] as string) || 0;
    let downloadedSize = 0;

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(destinationPath);
      const responseStream = response.body as Readable;

      responseStream.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize > 0) {
          onProgress((downloadedSize / totalSize) * 100);
        }
      });

      responseStream.pipe(writeStream);

      writeStream.on('finish', () => {
        ActionLogger.getInstance().info(`File downloaded successfully: ${destinationPath}`);
        resolve();
      });

      writeStream.on('error', reject);
      responseStream.on('error', reject);
    });
  }

  public async uploadFile(
    url: string,
    filePath: string,
    fieldName: string,
    options?: Partial<RequestOptions>
  ): Promise<Response> {
    const fs = await import('fs');
    const path = await import('path');
    
    const boundary = `----CSFormBoundary${crypto.randomBytes(16).toString('hex')}`;
    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);
    
    const formDataParts: string[] = [];
    formDataParts.push(`--${boundary}`);
    formDataParts.push(`Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"`);
    formDataParts.push('Content-Type: application/octet-stream');
    formDataParts.push('');
    
    const prefix = Buffer.from(formDataParts.join('\r\n') + '\r\n');
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    
    const fileSize = fs.statSync(filePath).size;
    const totalSize = prefix.length + fileSize + suffix.length;

    const formDataStream = new Readable({
      read() {}
    });

    formDataStream.push(prefix);
    
    fileStream.on('data', (chunk) => {
      formDataStream.push(chunk);
    });
    
    fileStream.on('end', () => {
      formDataStream.push(suffix);
      formDataStream.push(null);
    });

    return this.request({
      ...options,
      url,
      method: 'POST',
      headers: {
        ...options?.headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize.toString()
      },
      body: formDataStream
    });
  }
}
