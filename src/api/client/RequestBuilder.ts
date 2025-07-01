// src/api/client/RequestBuilder.ts
import {
  RequestOptions,
  HttpMethod,
  AuthConfig,
  ProxyConfig,
  CertificateConfig,
  MultipartFormData,
  GraphQLRequest
} from '../types/api.types';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import * as crypto from 'crypto';

export class RequestBuilder {
  private options: Partial<RequestOptions> = {};
  private queryParams: URLSearchParams = new URLSearchParams();
  private formData?: MultipartFormData;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.options.url = baseUrl;
    }
    
    try {
      this.options.timeout = ConfigurationManager.getInt('API_DEFAULT_TIMEOUT', 60000);
      this.options.validateSSL = ConfigurationManager.getBoolean('API_VALIDATE_SSL', true);
      this.options.compress = ConfigurationManager.getBoolean('API_COMPRESS', true);
      this.options.maxRedirects = ConfigurationManager.getInt('API_MAX_REDIRECTS', 5);
    } catch (error) {
      this.options.timeout = 60000;
      this.options.validateSSL = true;
      this.options.compress = true;
      this.options.maxRedirects = 5;
    }
  }

  public static create(baseUrl?: string): RequestBuilder {
    return new RequestBuilder(baseUrl);
  }

  public url(url: string): RequestBuilder {
    this.options.url = url;
    return this;
  }

  public method(method: HttpMethod): RequestBuilder {
    this.options.method = method;
    return this;
  }

  public get(path?: string): RequestBuilder {
    this.method('GET');
    if (path) {
      this.path(path);
    }
    return this;
  }

  public post(path?: string): RequestBuilder {
    this.method('POST');
    if (path) {
      this.path(path);
    }
    return this;
  }

  public put(path?: string): RequestBuilder {
    this.method('PUT');
    if (path) {
      this.path(path);
    }
    return this;
  }

  public delete(path?: string): RequestBuilder {
    this.method('DELETE');
    if (path) {
      this.path(path);
    }
    return this;
  }

  public patch(path?: string): RequestBuilder {
    this.method('PATCH');
    if (path) {
      this.path(path);
    }
    return this;
  }

  public path(path: string): RequestBuilder {
    if (!this.options.url) {
      throw new Error('Base URL must be set before adding path');
    }
    
    const baseUrl = this.options.url.endsWith('/') ? this.options.url.slice(0, -1) : this.options.url;
    const pathPart = path.startsWith('/') ? path : `/${path}`;
    
    this.options.url = baseUrl + pathPart;
    return this;
  }

  public query(key: string, value: any): RequestBuilder {
    if (value !== undefined && value !== null) {
      this.queryParams.append(key, String(value));
    }
    return this;
  }

  public queries(params: Record<string, any>): RequestBuilder {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => this.queryParams.append(key, String(v)));
        } else {
          this.queryParams.append(key, String(value));
        }
      }
    });
    return this;
  }

  public header(name: string, value: string): RequestBuilder {
    if (!this.options.headers) {
      this.options.headers = {};
    }
    this.options.headers[name] = value;
    return this;
  }

  public headers(headers: Record<string, string>): RequestBuilder {
    if (!this.options.headers) {
      this.options.headers = {};
    }
    Object.assign(this.options.headers, headers);
    return this;
  }

  public body(body: any): RequestBuilder {
    this.options.body = body;
    return this;
  }

  public json(data: any): RequestBuilder {
    this.header('Content-Type', 'application/json');
    this.options.body = data;
    return this;
  }

  public form(data: Record<string, any>): RequestBuilder {
    this.header('Content-Type', 'application/x-www-form-urlencoded');
    this.options.body = data;
    return this;
  }

  public multipart(): RequestBuilder {
    this.formData = { fields: {}, files: [] };
    return this;
  }

  public field(name: string, value: string): RequestBuilder {
    if (!this.formData) {
      throw new Error('Call multipart() before adding fields');
    }
    this.formData.fields[name] = value;
    return this;
  }

  public file(field: string, filename: string, data: Buffer | string, contentType?: string): RequestBuilder {
    if (!this.formData) {
      throw new Error('Call multipart() before adding files');
    }
    
    const fileData = {
      field,
      filename,
      data: Buffer.isBuffer(data) ? data : Buffer.from(data)
    } as any;
    
    if (contentType !== undefined) {
      fileData.contentType = contentType;
    }
    
    this.formData.files.push(fileData);
    return this;
  }

  public graphql(request: GraphQLRequest): RequestBuilder {
    this.header('Content-Type', 'application/json');
    this.options.body = request;
    return this;
  }

  public xml(data: string): RequestBuilder {
    this.header('Content-Type', 'application/xml');
    this.options.body = data;
    return this;
  }

  public text(data: string): RequestBuilder {
    this.header('Content-Type', 'text/plain');
    this.options.body = data;
    return this;
  }

  public timeout(ms: number): RequestBuilder {
    this.options.timeout = ms;
    return this;
  }

  public socketTimeout(ms: number): RequestBuilder {
    this.options.socketTimeout = ms;
    return this;
  }

  public retry(count: number, delay?: number): RequestBuilder {
    this.options.retryCount = count;
    if (delay !== undefined) {
      this.options.retryDelay = delay;
    }
    return this;
  }

  public auth(config: AuthConfig): RequestBuilder {
    this.options.auth = config;
    return this;
  }

  public basicAuth(username: string, password: string): RequestBuilder {
    this.options.auth = {
      type: 'basic',
      credentials: { username, password }
    };
    return this;
  }

  public bearerToken(token: string): RequestBuilder {
    this.options.auth = {
      type: 'bearer',
      credentials: { token }
    };
    return this;
  }

  public apiKey(key: string, value: string, location: 'header' | 'query' | 'cookie' = 'header'): RequestBuilder {
    this.options.auth = {
      type: 'apikey',
      credentials: { key, value, location }
    };
    return this;
  }

  public oauth2(credentials: any): RequestBuilder {
    this.options.auth = {
      type: 'oauth2',
      credentials
    };
    return this;
  }

  public proxy(config: ProxyConfig): RequestBuilder {
    this.options.proxy = config;
    return this;
  }

  public certificate(config: CertificateConfig): RequestBuilder {
    this.options.cert = config;
    return this;
  }

  public validateSSL(validate: boolean): RequestBuilder {
    this.options.validateSSL = validate;
    return this;
  }

  public keepAlive(enabled: boolean): RequestBuilder {
    this.options.keepAlive = enabled;
    return this;
  }

  public compress(enabled: boolean): RequestBuilder {
    this.options.compress = enabled;
    return this;
  }

  public maxRedirects(count: number): RequestBuilder {
    this.options.maxRedirects = count;
    return this;
  }

  public responseType(type: 'json' | 'text' | 'buffer' | 'stream'): RequestBuilder {
    this.options.responseType = type;
    return this;
  }

  public encoding(encoding: BufferEncoding): RequestBuilder {
    this.options.encoding = encoding;
    return this;
  }

  public userAgent(agent: string): RequestBuilder {
    this.header('User-Agent', agent);
    return this;
  }

  public accept(contentType: string): RequestBuilder {
    this.header('Accept', contentType);
    return this;
  }

  public contentType(contentType: string): RequestBuilder {
    this.header('Content-Type', contentType);
    return this;
  }

  public cookie(name: string, value: string): RequestBuilder {
    const cookies = this.options.headers?.['Cookie'] || '';
    const newCookie = `${name}=${value}`;
    this.header('Cookie', cookies ? `${cookies}; ${newCookie}` : newCookie);
    return this;
  }

  public cookies(cookies: Record<string, string>): RequestBuilder {
    const cookieString = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    this.header('Cookie', cookieString);
    return this;
  }

  public referer(referer: string): RequestBuilder {
    this.header('Referer', referer);
    return this;
  }

  public origin(origin: string): RequestBuilder {
    this.header('Origin', origin);
    return this;
  }

  public signal(signal: AbortSignal): RequestBuilder {
    this.options.signal = signal;
    return this;
  }

  public build(): RequestOptions {
    if (!this.options.url) {
      throw new Error('URL is required');
    }

    if (!this.options.method) {
      this.options.method = 'GET';
    }

    if (this.queryParams.toString()) {
      const separator = this.options.url.includes('?') ? '&' : '?';
      this.options.url += separator + this.queryParams.toString();
    }

    if (this.formData) {
      const boundary = `----CSFormBoundary${crypto.randomBytes(16).toString('hex')}`;
      const body = this.buildMultipartBody(this.formData, boundary);
      
      this.header('Content-Type', `multipart/form-data; boundary=${boundary}`);
      this.options.body = body;
    }

    this.validateOptions();

    ActionLogger.getInstance().debug('Request built', {
      url: this.options.url,
      method: this.options.method,
      headers: this.maskSensitiveHeaders(this.options.headers)
    });

    return this.options as RequestOptions;
  }

  private buildMultipartBody(formData: MultipartFormData, boundary: string): Buffer {
    const parts: Buffer[] = [];
    const newline = Buffer.from('\r\n');

    Object.entries(formData.fields).forEach(([name, value]) => {
      parts.push(Buffer.from(`--${boundary}`));
      parts.push(newline);
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"`));
      parts.push(newline);
      parts.push(newline);
      parts.push(Buffer.from(value));
      parts.push(newline);
    });

    formData.files.forEach(file => {
      parts.push(Buffer.from(`--${boundary}`));
      parts.push(newline);
      parts.push(Buffer.from(
        `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"`
      ));
      parts.push(newline);
      parts.push(Buffer.from(`Content-Type: ${file.contentType || 'application/octet-stream'}`));
      parts.push(newline);
      parts.push(newline);
      const fileData = file.data;
      parts.push(Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData));
      parts.push(newline);
    });

    parts.push(Buffer.from(`--${boundary}--`));
    parts.push(newline);

    return Buffer.concat(parts);
  }

  private validateOptions(): void {
    const url = this.options.url!;
    
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];
    if (!validMethods.includes(this.options.method!)) {
      throw new Error(`Invalid HTTP method: ${this.options.method}`);
    }

    if (this.options.timeout && this.options.timeout < 0) {
      throw new Error('Timeout must be a positive number');
    }

    if (this.options.retryCount && this.options.retryCount < 0) {
      throw new Error('Retry count must be a positive number');
    }
  }

  private maskSensitiveHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) {
      return {};
    }

    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'proxy-authorization'];
    const masked = { ...headers };

    Object.keys(masked).forEach(key => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        masked[key] = '***MASKED***';
      }
    });

    return masked;
  }

  public clone(): RequestBuilder {
    const cloned = new RequestBuilder();
    cloned.options = JSON.parse(JSON.stringify(this.options));
    cloned.queryParams = new URLSearchParams(this.queryParams.toString());
    if (this.formData) {
      cloned.formData = {
        fields: { ...this.formData.fields },
        files: [...this.formData.files]
      };
    }
    return cloned;
  }

  public toString(): string {
    const built = this.build();
    return `${built.method} ${built.url}`;
  }
}
