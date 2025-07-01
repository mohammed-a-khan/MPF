// src/integrations/ado/ADOClient.ts
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { ADOConfig, ADOProxyConfig } from './ADOConfig';
import { Logger } from '../../core/utils/Logger';

export interface ADORequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retryCount?: number;
  skipRetry?: boolean;
}

export interface ADOResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  request: ADORequestOptions;
}

export interface ADOError extends Error {
  status?: number;
  statusText?: string;
  response?: any;
  request?: ADORequestOptions;
  code?: string;
}

export interface ADOListResponse<T> {
  count: number;
  value: T[];
}

export class ADOClient {
  private static readonly logger = Logger.getInstance(ADOClient.name);
  private static instance: ADOClient;
  private readonly config = ADOConfig.getConfig();
  private get endpoints() {
    return ADOConfig.getEndpoints();
  }
  private requestCount = 0;
  private activeRequests = new Map<string, AbortController>();

  private constructor() {
    ADOClient.logger.info('ADO client initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ADOClient {
    if (!this.instance) {
      this.instance = new ADOClient();
    }
    return this.instance;
  }

  /**
   * Make HTTP request to ADO
   */
  async request<T = any>(options: ADORequestOptions): Promise<ADOResponse<T>> {
    const requestId = `req_${++this.requestCount}`;
    const startTime = Date.now();

    try {
      ADOClient.logger.info(`[${requestId}] ${options.method} ${options.url}`);

      const preparedOptions = await this.prepareRequest(options);

      const response = await this.executeWithRetry<T>(
        requestId,
        preparedOptions,
        options.retryCount ?? this.config.retryCount
      );

      const duration = Date.now() - startTime;
      ADOClient.logger.info(`[${requestId}] Completed in ${duration}ms - Status: ${response.status}`);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      ADOClient.logger.error(`[${requestId}] Failed after ${duration}ms:`, error as Error);
      throw this.enhanceError(error, options);
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, options?: Partial<ADORequestOptions>): Promise<ADOResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      ...options
    });
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, body?: any, options?: Partial<ADORequestOptions>): Promise<ADOResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      body,
      ...options
    });
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, body?: any, options?: Partial<ADORequestOptions>): Promise<ADOResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      body,
      ...options
    });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(url: string, body?: any, options?: Partial<ADORequestOptions>): Promise<ADOResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      url,
      body,
      ...options
    });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string, options?: Partial<ADORequestOptions>): Promise<ADOResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
      ...options
    });
  }

  /**
   * Prepare request options
   */
  private async prepareRequest(options: ADORequestOptions): Promise<ADORequestOptions> {
    const prepared: ADORequestOptions = {
      ...options,
      headers: {
        ...ADOConfig.getAuthHeaders(),
        'Accept': 'application/json',
        ...options.headers
      },
      timeout: options.timeout ?? this.config.timeout
    };

    if (prepared.body && typeof prepared.body === 'object' && 
        !Buffer.isBuffer(prepared.body) && 
        prepared.headers && prepared.headers['Content-Type'] === 'application/json') {
      prepared.body = JSON.stringify(prepared.body);
    }

    return prepared;
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    requestId: string,
    options: ADORequestOptions,
    retriesLeft: number
  ): Promise<ADOResponse<T>> {
    try {
      return await this.executeRequest<T>(requestId, options);
    } catch (error) {
      if (retriesLeft > 0 && this.isRetryableError(error)) {
        const delay = this.config.retryDelay * (this.config.retryCount - retriesLeft + 1);
        ADOClient.logger.warn(`[${requestId}] Retrying after ${delay}ms... (${retriesLeft} retries left)`);
        
        await this.delay(delay);
        return this.executeWithRetry<T>(requestId, options, retriesLeft - 1);
      }
      throw error;
    }
  }

  /**
   * Execute HTTP request
   */
  private executeRequest<T>(requestId: string, options: ADORequestOptions): Promise<ADOResponse<T>> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(options.url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions: https.RequestOptions = {
        method: options.method,
        headers: options.headers,
        timeout: options.timeout,
        family: 4
      };

      const proxyConfig = ADOConfig.getProxyConfig();
      if (proxyConfig?.enabled && !ADOConfig.shouldBypassProxy(options.url)) {
        this.configureProxy(requestOptions, urlObj, proxyConfig, isHttps);
      } else {
        requestOptions.hostname = urlObj.hostname;
        requestOptions.port = urlObj.port || (isHttps ? 443 : 80);
        requestOptions.path = urlObj.pathname + urlObj.search;
      }

      const controller = new AbortController();
      this.activeRequests.set(requestId, controller);

      ADOClient.logger.debug(`[${requestId}] Request details:`, {
        hostname: requestOptions.hostname,
        port: requestOptions.port,
        path: requestOptions.path,
        method: requestOptions.method,
        hasAuth: !!(requestOptions.headers as any)?.['Authorization']
      });

      const req = httpModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const responseText = buffer.toString('utf-8');

          let data: T;
          try {
            if (res.headers['content-type']?.includes('application/json') && responseText) {
              data = JSON.parse(responseText);
            } else {
              data = responseText as any;
            }
          } catch (parseError) {
            ADOClient.logger.error(`[${requestId}] Response parse error:`, parseError as Error);
            data = responseText as any;
          }

          const response: ADOResponse<T> = {
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers: res.headers as Record<string, string>,
            data,
            request: options
          };

          if (res.statusCode && res.statusCode >= 400) {
            const error: ADOError = new Error(
              `ADO request failed: ${res.statusCode} ${res.statusMessage}`
            );
            error.status = res.statusCode;
            error.statusText = res.statusMessage || '';
            error.response = data;
            error.request = options;
            reject(error);
          } else {
            resolve(response);
          }
        });

        res.on('error', (error) => {
          ADOClient.logger.error(`[${requestId}] Response error:`, error);
          reject(error);
        });
      });

      req.on('error', (error) => {
        ADOClient.logger.error(`[${requestId}] Request error:`, error);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        const error: ADOError = new Error(`Request timeout after ${options.timeout}ms`);
        error.code = 'ETIMEDOUT';
        error.request = options;
        reject(error);
      });

      controller.signal.addEventListener('abort', () => {
        req.destroy();
        const error: ADOError = new Error('Request aborted');
        error.code = 'EABORTED';
        error.request = options;
        reject(error);
      });

      if (options.body) {
        if (Buffer.isBuffer(options.body)) {
          req.write(options.body);
        } else if (typeof options.body === 'string') {
          req.write(options.body, 'utf-8');
        } else {
          req.write(JSON.stringify(options.body), 'utf-8');
        }
      }

      req.end();
    });
  }

  /**
   * Configure proxy settings
   */
  private configureProxy(
    options: https.RequestOptions,
    url: URL,
    proxyConfig: ADOProxyConfig,
    isHttps: boolean
  ): void {
    options.hostname = proxyConfig.server;
    options.port = proxyConfig.port;
    options.path = url.href;

    if (proxyConfig.username && proxyConfig.password) {
      const proxyAuth = Buffer.from(`${proxyConfig.username}:${proxyConfig.password}`).toString('base64');
      options.headers = {
        ...options.headers,
        'Proxy-Authorization': `Basic ${proxyAuth}`
      };
    }

    if (isHttps) {
      options.method = 'CONNECT';
      options.path = `${url.hostname}:${url.port || 443}`;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH'].includes(error.code)) {
      return true;
    }

    if (error.status) {
      return [408, 429, 500, 502, 503, 504].includes(error.status);
    }

    return false;
  }

  /**
   * Enhance error with additional context
   */
  private enhanceError(error: any, request: ADORequestOptions): ADOError {
    const enhancedError: ADOError = error;
    enhancedError.request = request;

    if (!enhancedError.message) {
      enhancedError.message = 'ADO request failed';
    }

    return enhancedError;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel all active requests
   */
  cancelAllRequests(): void {
    ADOClient.logger.info(`Cancelling ${this.activeRequests.size} active requests`);
    
    for (const [requestId, controller] of this.activeRequests.entries()) {
      controller.abort();
      ADOClient.logger.debug(`Cancelled request: ${requestId}`);
    }

    this.activeRequests.clear();
  }

  /**
   * Get request statistics
   */
  getStatistics(): { totalRequests: number; activeRequests: number } {
    return {
      totalRequests: this.requestCount,
      activeRequests: this.activeRequests.size
    };
  }

  /**
   * Get list response
   */
  async getList<T>(url: string, options?: Partial<ADORequestOptions>): Promise<ADOListResponse<T>> {
    const response = await this.get<ADOListResponse<T>>(url, options);
    return response.data;
  }

  /**
   * Get all items with pagination
   */
  async *getAllPaginated<T>(
    url: string,
    pageSize: number = 100
  ): AsyncGenerator<T[], void, undefined> {
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const paginatedUrl = this.addQueryParams(url, {
        '$top': pageSize,
        '$skip': skip
      });

      const response = await this.getList<T>(paginatedUrl);
      
      if (response.value.length > 0) {
        yield response.value;
        skip += response.value.length;
        hasMore = response.value.length === pageSize;
      } else {
        hasMore = false;
      }
    }
  }

  /**
   * Get all items (non-paginated)
   */
  async getAll<T>(url: string, pageSize: number = 100): Promise<T[]> {
    const allItems: T[] = [];

    for await (const items of this.getAllPaginated<T>(url, pageSize)) {
      allItems.push(...items);
    }

    return allItems;
  }

  /**
   * Add query parameters to URL
   */
  private addQueryParams(url: string, params: Record<string, any>): string {
    const urlObj = new URL(url);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        urlObj.searchParams.append(key, value.toString());
      }
    }

    return urlObj.toString();
  }

  /**
   * Upload file attachment
   */
  async uploadAttachment(
    fileContent: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<{ id: string; url: string }> {
    const uploadUrl = ADOConfig.buildUrl(this.endpoints.attachments);

    const response = await this.post<{ id: string; url: string }>(
      uploadUrl,
      fileContent,
      {
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileContent.length.toString()
        }
      }
    );

    return response.data;
  }

  /**
   * Execute batch request
   */
  async executeBatch(requests: Array<{
    method: string;
    uri: string;
    headers?: Record<string, string>;
    body?: any;
  }>): Promise<any[]> {
    const batchUrl = `${ADOConfig.getBaseUrl()}/$batch`;
    
    const batchRequest = {
      requests: requests.map((req, index) => ({
        id: index.toString(),
        method: req.method,
        url: req.uri,
        headers: req.headers,
        body: req.body
      }))
    };

    const response = await this.post(batchUrl, batchRequest, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data.responses;
  }
}