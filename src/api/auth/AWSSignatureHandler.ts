
import { createHash, createHmac } from 'crypto';
import { performance } from 'perf_hooks';
import { URL } from 'url';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as https from 'https';
import * as http from 'http';
import { exec } from 'child_process';

import {
  AWSAuthConfig,
  AWSCredentials,
  AWSSignedRequest,
  AWSAssumeRoleResponse,
  AWSRegion,
  AWSCredentialProvider,
  AWSCanonicalRequest,
  AWSRequestContext,
  AWSSigningKey,
  AWSSignatureMetrics,
  AWSCredentialCache,
  AWSRegionalEndpoint,
  AWSServiceEndpoint,
  AWSSigningAlgorithm,
  AWSPresignedUrl
} from './auth.types';

import { Logger } from '../../core/utils/Logger';
import { FileUtils } from '../../core/utils/FileUtils';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { RequestOptions } from '../types/api.types';

const execAsync = promisify(exec);

class SimpleXMLParser {
  parse(xml: string): any {
    const result: any = {};

    xml = xml.replace(/<\?xml[^>]*\?>/, '').trim();

    this.parseElement(xml, result);

    return result;
  }

  private parseElement(xml: string, parent: any): void {
    const nestedRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;

    let match;
    while ((match = nestedRegex.exec(xml)) !== null) {
      const tagName = match[1];
      const content = match[3];

      if (!content || !tagName) continue;

      const trimmedContent = content.trim();

      if (trimmedContent.includes('<')) {
        parent[tagName] = parent[tagName] || {};
        this.parseElement(trimmedContent, parent[tagName]);
      } else {
        parent[tagName] = trimmedContent;
      }
    }
  }
}

class SimpleINIParser {
  parse(content: string): any {
    const result: any = {};
    let currentSection: string | null = null;

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      const sectionMatch = trimmed.match(/^\[(.+)\]$/);
      if (sectionMatch && sectionMatch[1]) {
        currentSection = sectionMatch[1];
        if (!result[currentSection]) {
          result[currentSection] = {};
        }
        continue;
      }

      if (currentSection) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          const value = trimmed.substring(equalIndex + 1).trim();
          if (currentSection && result[currentSection]) {
            result[currentSection][key] = value;
          }
        }
      }
    }

    return result;
  }
}

const xmlParser = new SimpleXMLParser();
const iniParser = new SimpleINIParser();

export class AWSSignatureHandler {
  private static instance: AWSSignatureHandler;
  private readonly logger: Logger;
  private readonly actionLogger: ActionLogger;

  private readonly credentialCache: Map<string, AWSCredentialCache> = new Map();
  private readonly signingKeyCache: Map<string, AWSSigningKey> = new Map();
  private readonly credentialProviders: AWSCredentialProvider[] = [];

  private readonly serviceEndpoints: Map<string, AWSServiceEndpoint> = new Map();
  private readonly regionalEndpoints: Map<string, AWSRegionalEndpoint> = new Map();

  private readonly metrics: AWSSignatureMetrics = {
    totalSigningRequests: 0,
    successfulSignings: 0,
    failedSignings: 0,
    credentialRefreshes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageSigningTime: 0,
    signingsByService: new Map(),
    signingsByRegion: new Map(),
    errors: [],
    lastReset: new Date()
  };

  private readonly config = {
    signatureVersion: 'v4',
    signatureAlgorithm: 'AWS4-HMAC-SHA256' as AWSSigningAlgorithm,
    defaultRegion: 'us-east-1' as AWSRegion,
    credentialScope: 'aws4_request',
    maxRetries: 3,
    retryDelay: 1000,
    credentialCacheTTL: 3600000,
    signingKeyCacheTTL: 86400000,
    assumeRoleDuration: 3600,
    enableIMDSv2: true,
    imdsTimeout: 5000,
    ecsCredentialsRelativeUri: process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'],
    ecsCredentialsFullUri: process.env['AWS_CONTAINER_CREDENTIALS_FULL_URI'],
    configFile: join(homedir(), '.aws', 'config'),
    credentialsFile: join(homedir(), '.aws', 'credentials'),
    profile: process.env['AWS_PROFILE'] || 'default',
    enableMetrics: true,
    enableCredentialChain: true,
    unsignedPayload: false,
    doubleUrlEncode: true,
    normalizePath: true,
    signedBodyHeader: 'x-amz-content-sha256',
    securityTokenHeader: 'x-amz-security-token',
    dateHeader: 'x-amz-date',
    expiresQueryParam: 'X-Amz-Expires',
    signatureQueryParam: 'X-Amz-Signature',
    algorithmQueryParam: 'X-Amz-Algorithm',
    credentialQueryParam: 'X-Amz-Credential',
    signedHeadersQueryParam: 'X-Amz-SignedHeaders',
    securityTokenQueryParam: 'X-Amz-Security-Token',
    dateQueryParam: 'X-Amz-Date',
    streamingSignedBodyValue: 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD',
    streamingSignedBodyTrailer: 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD-TRAILER',
    eventStreamContentType: 'application/vnd.amazon.eventstream',
    s3DisableBodySigning: ['GET', 'HEAD'],
    s3UriEscapePath: false,
    applyChecksumHeader: true,
    convertRequestPath: true,
    stsEndpointPattern: /^sts\.[a-z0-9-]+\.amazonaws\.com$/,
    s3EndpointPattern: /^s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/,
    s3VirtualHostedBucketPattern: /^([a-z0-9.-]+)\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/,
    hostedZoneIdByRegion: {
      'us-east-1': 'Z3AQBSTGFYJSTF',
      'us-east-2': 'Z2O1EMRO9K5GLX',
      'us-west-1': 'Z2F56UZL2M1ACD',
      'us-west-2': 'Z3BJ6K6RIION7M',
      'eu-west-1': 'Z1BKCTXD74EZPE',
      'eu-central-1': 'Z3F0SRJ5LGBH90',
      'ap-southeast-1': 'Z3O0J2DXBE1FTB',
      'ap-southeast-2': 'Z1WCIGYICN2BYD',
      'ap-northeast-1': 'Z2M4EHUR26P7ZW',
      'sa-east-1': 'Z7KQH4QJS55SO',
      'ca-central-1': 'Z1QDHH18159H29',
      'eu-west-2': 'Z3GKZC51ZF0DB4',
      'eu-west-3': 'Z3R1K369G5AVDG',
      'eu-north-1': 'Z3BAZG2TWCNX0D',
      'ap-south-1': 'Z11RGJOFQNVJUP',
      'ap-northeast-2': 'Z3W03O7B5YMIYP',
      'ap-northeast-3': 'Z5LXEXXYW11ES',
      'us-gov-west-1': 'Z31GFT0UA1I2HV',
      'us-gov-east-1': 'Z2NIFVYYW2VKV1'
    }
  };

  private constructor() {
    this.logger = Logger.getInstance();
    this.actionLogger = ActionLogger.getInstance();

    this.initializeCredentialProviders();
    this.initializeServiceEndpoints();
    this.startCleanupTimer();
  }

  public static getInstance(): AWSSignatureHandler {
    if (!AWSSignatureHandler.instance) {
      AWSSignatureHandler.instance = new AWSSignatureHandler();
    }
    return AWSSignatureHandler.instance;
  }

  public async signRequest(
    request: RequestOptions,
    config: AWSAuthConfig
  ): Promise<AWSSignedRequest> {
    const startTime = performance.now();
    const requestId = this.generateRequestId();

    try {
      this.actionLogger.logAction('AWS Signature', {
        action: 'sign',
        service: config.service,
        region: config.region,
        requestId,
        timestamp: new Date().toISOString()
      });

      const credentials = await this.getCredentials(config);

      const url = new URL(request.url);
      const service = config.service || this.extractServiceFromUrl(url);
      const region = config.region || this.extractRegionFromUrl(url) || this.config.defaultRegion;

      const context: AWSRequestContext = {
        credentials,
        service,
        region,
        signatureVersion: config.signatureVersion || this.config.signatureVersion,
        timestamp: new Date(),
        requestId
      };

      let signedRequest: AWSSignedRequest;

      switch (context.signatureVersion) {
        case 'v4':
          signedRequest = await this.signV4(request, context);
          break;
        case 'v2':
          signedRequest = await this.signV2(request, context);
          break;
        case 's3':
          signedRequest = await this.signS3(request, context);
          break;
        case 's3v4':
          signedRequest = await this.signS3v4(request, context);
          break;
        default:
          throw new AWSSignatureError(
            `Unsupported signature version: ${context.signatureVersion}`,
            'UnsupportedSignatureVersion'
          );
      }

      this.updateMetrics(service, region, true, performance.now() - startTime);

      return signedRequest;

    } catch (error) {
      this.updateMetrics(
        config.service || 'unknown',
        config.region || 'unknown',
        false,
        performance.now() - startTime
      );

      this.logger.error('AWS signature failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId
      });

      throw error;
    }
  }

  private async signV4(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    const timestamp = context.timestamp;
    const dateStamp = this.getDateStamp(timestamp);
    const amzDate = this.getAmzDate(timestamp);

    const canonicalRequest = await this.createCanonicalRequest(request, context, amzDate);

    const credentialScope = this.getCredentialScope(dateStamp, context.region, context.service);
    const stringToSign = this.createStringToSign(
      amzDate,
      credentialScope,
      canonicalRequest.hash
    );

    const signingKey = await this.getSigningKey(
      context.credentials.secretAccessKey,
      dateStamp,
      context.region,
      context.service
    );
    const signature = this.calculateSignature(signingKey, stringToSign);

    const authorizationHeader = this.buildAuthorizationHeader(
      context.credentials.accessKeyId,
      credentialScope,
      canonicalRequest.signedHeaders,
      signature
    );

    const signedHeaders: Record<string, string> = {
      ...request.headers,
      ...canonicalRequest.headers,
      'Authorization': authorizationHeader,
      [this.config.dateHeader]: amzDate
    };

    if (context.credentials.sessionToken) {
      signedHeaders[this.config.securityTokenHeader] = context.credentials.sessionToken;
    }

    return {
      url: request.url,
      method: request.method || 'GET',
      headers: signedHeaders,
      body: request.body,
      signature,
      timestamp: amzDate,
      credentials: {
        accessKeyId: context.credentials.accessKeyId,
        scope: credentialScope
      }
    };
  }

  private async createCanonicalRequest(
    request: RequestOptions,
    context: AWSRequestContext,
    amzDate: string
  ): Promise<AWSCanonicalRequest> {
    const url = new URL(request.url);
    const method = request.method || 'GET';

    const canonicalUri = this.getCanonicalUri(url.pathname, context.service);

    const canonicalQueryString = this.getCanonicalQueryString(url.searchParams);

    const headers: Record<string, string> = {
      ...request.headers,
      'host': url.host,
      [this.config.dateHeader]: amzDate
    };

    if (context.credentials.sessionToken) {
      headers[this.config.securityTokenHeader] = context.credentials.sessionToken;
    }

    const { canonicalHeaders, signedHeaders } = this.getCanonicalHeaders(headers);

    const payloadHash = await this.getPayloadHash(request, context.service, method);

    if (!this.config.unsignedPayload && context.service !== 's3') {
      headers[this.config.signedBodyHeader] = payloadHash;
    }

    if (context.service === 's3' && !this.config.s3DisableBodySigning.includes(method)) {
      headers[this.config.signedBodyHeader] = payloadHash;
    }

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const hash = createHash('sha256').update(canonicalRequest).digest('hex');

    return {
      request: canonicalRequest,
      hash,
      headers,
      signedHeaders,
      payloadHash
    };
  }

  private getCanonicalUri(path: string, service: string): string {
    if (!path || path === '') {
      return '/';
    }

    if (service === 's3' && this.config.s3UriEscapePath === false) {
      return path;
    }

    if (this.config.normalizePath) {
      path = path.replace(/\/+/g, '/');

      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
    }

    const segments = path.split('/');
    const encodedSegments = segments.map(segment => {
      if (segment === '') return segment;

      const encoded = this.awsUrlEncode(segment, service === 's3');

      return encoded;
    });

    return encodedSegments.join('/');
  }

  private awsUrlEncode(str: string, isS3: boolean = false): string {
    let encoded = encodeURIComponent(str);

    encoded = encoded.replace(/[!'()*]/g, (c) => {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });

    if (isS3) {
      encoded = encoded.replace(/%2F/g, '/');
    }

    return encoded;
  }

  private getCanonicalQueryString(params: URLSearchParams): string {
    const sortedParams: Array<[string, string]> = [];

    for (const [key, value] of params.entries()) {
      if (key === this.config.signatureQueryParam) {
        continue;
      }
      sortedParams.push([key, value]);
    }

    sortedParams.sort((a, b) => {
      const keyCompare = a[0].localeCompare(b[0]);
      if (keyCompare !== 0) return keyCompare;
      return a[1].localeCompare(b[1]);
    });

    return sortedParams
      .map(([key, value]) => {
        const encodedKey = this.awsUrlEncode(key);
        const encodedValue = this.awsUrlEncode(value);
        return `${encodedKey}=${encodedValue}`;
      })
      .join('&');
  }

  private getCanonicalHeaders(headers: Record<string, string>): {
    canonicalHeaders: string;
    signedHeaders: string;
  } {
    const headerMap = new Map<string, string>();

    for (const [name, value] of Object.entries(headers)) {
      const lowerName = name.toLowerCase();

      if (lowerName === 'authorization' || lowerName === 'content-length') {
        continue;
      }

      const normalizedValue = value.trim().replace(/\s+/g, ' ');

      headerMap.set(lowerName, normalizedValue);
    }

    const sortedHeaders = Array.from(headerMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const canonicalHeaders = sortedHeaders
      .map(([name, value]) => `${name}:${value}`)
      .join('\n') + '\n';

    const signedHeaders = sortedHeaders
      .map(([name]) => name)
      .join(';');

    return { canonicalHeaders, signedHeaders };
  }

  private async getPayloadHash(request: RequestOptions, service: string, method: string): Promise<string> {
    if (this.config.unsignedPayload) {
      return 'UNSIGNED-PAYLOAD';
    }

    if (service === 's3') {
      if (this.config.s3DisableBodySigning.includes(method)) {
        return 'UNSIGNED-PAYLOAD';
      }

      if (request.headers?.['x-amz-content-sha256'] === this.config.streamingSignedBodyValue) {
        return this.config.streamingSignedBodyValue;
      }
    }

    let payload = '';

    if (request.body) {
      if (typeof request.body === 'string') {
        payload = request.body;
      } else if (Buffer.isBuffer(request.body)) {
        return createHash('sha256').update(request.body).digest('hex');
      } else if (request.body instanceof ArrayBuffer) {
        return createHash('sha256').update(Buffer.from(request.body)).digest('hex');
      } else {
        payload = JSON.stringify(request.body);
      }
    }

    return createHash('sha256').update(payload).digest('hex');
  }

  private createStringToSign(
    amzDate: string,
    credentialScope: string,
    canonicalRequestHash: string
  ): string {
    return [
      this.config.signatureAlgorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash
    ].join('\n');
  }

  private async getSigningKey(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Promise<Buffer> {
    const cacheKey = `${secretKey}:${dateStamp}:${region}:${service}`;
    const cached = this.signingKeyCache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      this.metrics.cacheHits++;
      return cached.key;
    }

    this.metrics.cacheMisses++;

    const kSecret = `AWS4${secretKey}`;
    const kDate = createHmac('sha256', kSecret).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();

    this.signingKeyCache.set(cacheKey, {
      key: kSigning,
      dateStamp,
      region,
      service,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.signingKeyCacheTTL)
    });

    return kSigning;
  }

  private calculateSignature(signingKey: Buffer, stringToSign: string): string {
    return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  }

  private buildAuthorizationHeader(
    accessKeyId: string,
    credentialScope: string,
    signedHeaders: string,
    signature: string
  ): string {
    return `${this.config.signatureAlgorithm} ` +
      `Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`;
  }

  private async signV2(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    const url = new URL(request.url);
    const timestamp = context.timestamp.toISOString();

    const params = new URLSearchParams(url.searchParams);
    params.set('AWSAccessKeyId', context.credentials.accessKeyId);
    params.set('SignatureVersion', '2');
    params.set('SignatureMethod', 'HmacSHA256');
    params.set('Timestamp', timestamp);

    if (context.credentials.sessionToken) {
      params.set('SecurityToken', context.credentials.sessionToken);
    }

    if (!params.has('Action')) {
      if (request.method === 'POST' && request.body) {
        const bodyString = typeof request.body === 'string'
          ? request.body
          : Buffer.isBuffer(request.body)
            ? request.body.toString()
            : JSON.stringify(request.body);
        const bodyParams = new URLSearchParams(bodyString);
        for (const [key, value] of bodyParams.entries()) {
          if (!params.has(key)) {
            params.set(key, value);
          }
        }
      }
    }

    const sortedParams = new URLSearchParams(Array.from(params.entries()).sort());

    const stringToSign = [
      request.method || 'GET',
      url.hostname.toLowerCase(),
      url.pathname || '/',
      sortedParams.toString()
    ].join('\n');

    const signature = createHmac('sha256', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    sortedParams.set('Signature', signature);

    if (request.method === 'POST') {
      return {
        url: url.toString(),
        method: 'POST',
        headers: {
          ...request.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: sortedParams.toString(),
        signature,
        timestamp,
        credentials: {
          accessKeyId: context.credentials.accessKeyId
        }
      };
    } else {
      url.search = sortedParams.toString();
      return {
        url: url.toString(),
        method: request.method || 'GET',
        headers: request.headers || {},
        body: request.body,
        signature,
        timestamp,
        credentials: {
          accessKeyId: context.credentials.accessKeyId
        }
      };
    }
  }

  private async signS3(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    const url = new URL(request.url);
    const timestamp = context.timestamp.toUTCString();
    const method = request.method || 'GET';

    const headers: Record<string, string> = {
      ...request.headers,
      'Date': timestamp
    };

    let contentMD5 = '';
    if (request.body && ['PUT', 'POST'].includes(method)) {
      const payload = typeof request.body === 'string'
        ? Buffer.from(request.body)
        : Buffer.isBuffer(request.body)
          ? request.body
          : Buffer.from(JSON.stringify(request.body));

      contentMD5 = createHash('md5').update(payload).digest('base64');
      headers['Content-MD5'] = contentMD5;
    }

    const contentType = headers['Content-Type'] || headers['content-type'] || '';

    const amzHeaders: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(headers)) {
      const lowerName = name.toLowerCase();
      if (lowerName.startsWith('x-amz-')) {
        amzHeaders.push([lowerName, value.trim()]);
      }
    }
    amzHeaders.sort((a, b) => a[0].localeCompare(b[0]));

    const resource = this.getS3CanonicalResource(url);
    const stringToSignParts = [
      method,
      contentMD5,
      contentType,
      timestamp
    ];

    for (const [name, value] of amzHeaders) {
      stringToSignParts.push(`${name}:${value}`);
    }

    stringToSignParts.push(resource);

    const stringToSign = stringToSignParts.join('\n');

    const signature = createHmac('sha1', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    headers['Authorization'] = `AWS ${context.credentials.accessKeyId}:${signature}`;

    if (context.credentials.sessionToken) {
      headers['x-amz-security-token'] = context.credentials.sessionToken;
    }

    return {
      url: request.url,
      method,
      headers,
      body: request.body,
      signature,
      timestamp,
      credentials: {
        accessKeyId: context.credentials.accessKeyId
      }
    };
  }

  private async signS3v4(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    return this.signV4(request, context);
  }

  private getS3CanonicalResource(url: URL): string {
    let resource = url.pathname || '/';

    resource = decodeURIComponent(resource);

    const virtualHostMatch = url.hostname.match(this.config.s3VirtualHostedBucketPattern);
    if (virtualHostMatch) {
      const bucket = virtualHostMatch[1];
      resource = `/${bucket}${resource === '/' ? '' : resource}`;
    }

    const subResources = [
      'acl', 'accelerate', 'analytics', 'cors', 'delete', 'encryption',
      'inventory', 'lifecycle', 'location', 'logging', 'metrics',
      'notification', 'partNumber', 'policy', 'publicAccessBlock',
      'replication', 'requestPayment', 'restore', 'tagging', 'torrent',
      'uploadId', 'uploads', 'versionId', 'versioning', 'versions',
      'website',
      'response-cache-control', 'response-content-disposition',
      'response-content-encoding', 'response-content-language',
      'response-content-type', 'response-expires'
    ];

    const queryParams: Array<[string, string]> = [];
    for (const param of url.searchParams.keys()) {
      if (subResources.includes(param)) {
        const value = url.searchParams.get(param);
        queryParams.push([param, value || '']);
      }
    }

    queryParams.sort((a, b) => a[0].localeCompare(b[0]));

    if (queryParams.length > 0) {
      const queryString = queryParams
        .map(([key, value]) => value ? `${key}=${value}` : key)
        .join('&');
      resource += '?' + queryString;
    }

    return resource;
  }

  public async generatePresignedUrl(
    url: string,
    config: AWSAuthConfig,
    expiresIn: number = 3600
  ): Promise<AWSPresignedUrl> {
    try {
      if (expiresIn < 1 || expiresIn > 604800) {
        throw new AWSSignatureError(
          'Presigned URL expiration must be between 1 and 604800 seconds',
          'InvalidExpirationTime'
        );
      }

      const credentials = await this.getCredentials(config);

      const urlObj = new URL(url);
      const service = config.service || this.extractServiceFromUrl(urlObj);
      const region = config.region || this.extractRegionFromUrl(urlObj);

      const context: AWSRequestContext = {
        credentials,
        service,
        region,
        signatureVersion: config.signatureVersion || 'v4',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };

      let presignedUrl: string;
      let headers: Record<string, string> = {};

      switch (context.signatureVersion) {
        case 'v4':
          const v4Result = await this.generatePresignedUrlV4(urlObj, context, expiresIn, config.httpMethod);
          presignedUrl = v4Result.url;
          headers = v4Result.headers;
          break;
        case 'v2':
          presignedUrl = await this.generatePresignedUrlV2(urlObj, context, expiresIn);
          break;
        case 's3':
          presignedUrl = await this.generatePresignedUrlS3(urlObj, context, expiresIn);
          break;
        default:
          throw new AWSSignatureError(
            `Presigned URLs not supported for signature version: ${context.signatureVersion}`,
            'UnsupportedOperation'
          );
      }

      return {
        url: presignedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        headers
      };

    } catch (error) {
      this.logger.error('Failed to generate presigned URL', {
        error: error instanceof Error ? error.message : String(error),
        url
      });
      throw error;
    }
  }

  private async generatePresignedUrlV4(
    url: URL,
    context: AWSRequestContext,
    expiresIn: number,
    httpMethod: string = 'GET'
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const timestamp = context.timestamp;
    const dateStamp = this.getDateStamp(timestamp);
    const amzDate = this.getAmzDate(timestamp);

    const credentialScope = this.getCredentialScope(dateStamp, context.region, context.service);
    const queryParams = new URLSearchParams(url.searchParams);

    queryParams.set(this.config.algorithmQueryParam, this.config.signatureAlgorithm);
    queryParams.set(this.config.credentialQueryParam, `${context.credentials.accessKeyId}/${credentialScope}`);
    queryParams.set(this.config.dateQueryParam, amzDate);
    queryParams.set(this.config.expiresQueryParam, expiresIn.toString());
    queryParams.set(this.config.signedHeadersQueryParam, 'host');

    if (context.credentials.sessionToken) {
      queryParams.set(this.config.securityTokenQueryParam, context.credentials.sessionToken);
    }

    const sortedParams = new URLSearchParams(Array.from(queryParams.entries()).sort());

    const canonicalUri = this.getCanonicalUri(url.pathname, context.service);
    const canonicalQueryString = this.getCanonicalQueryString(sortedParams);
    const canonicalHeaders = `host:${url.host}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      httpMethod,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = this.createStringToSign(amzDate, credentialScope, canonicalRequestHash);

    const signingKey = await this.getSigningKey(
      context.credentials.secretAccessKey,
      dateStamp,
      context.region,
      context.service
    );
    const signature = this.calculateSignature(signingKey, stringToSign);

    sortedParams.set(this.config.signatureQueryParam, signature);

    url.search = sortedParams.toString();

    return {
      url: url.toString(),
      headers: {
        'Host': url.host
      }
    };
  }

  private async generatePresignedUrlV2(
    url: URL,
    context: AWSRequestContext,
    expiresIn: number
  ): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.set('AWSAccessKeyId', context.credentials.accessKeyId);
    queryParams.set('Expires', expires.toString());
    queryParams.set('SignatureVersion', '2');
    queryParams.set('SignatureMethod', 'HmacSHA256');

    if (context.credentials.sessionToken) {
      queryParams.set('SecurityToken', context.credentials.sessionToken);
    }

    const sortedParams = new URLSearchParams(Array.from(queryParams.entries()).sort());

    const stringToSign = [
      'GET',
      url.hostname.toLowerCase(),
      url.pathname || '/',
      sortedParams.toString()
    ].join('\n');

    const signature = createHmac('sha256', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    sortedParams.set('Signature', signature);

    url.search = sortedParams.toString();
    return url.toString();
  }

  private async generatePresignedUrlS3(
    url: URL,
    context: AWSRequestContext,
    expiresIn: number
  ): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    const resource = this.getS3CanonicalResource(url);
    const stringToSign = [
      'GET',
      '',
      '',
      expires.toString(),
      resource
    ].join('\n');

    const signature = createHmac('sha1', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.set('AWSAccessKeyId', context.credentials.accessKeyId);
    queryParams.set('Expires', expires.toString());
    queryParams.set('Signature', signature);

    if (context.credentials.sessionToken) {
      queryParams.set('x-amz-security-token', context.credentials.sessionToken);
    }

    url.search = queryParams.toString();
    return url.toString();
  }

  private async getCredentials(config: AWSAuthConfig): Promise<AWSCredentials> {
    if (config.accessKeyId && config.secretAccessKey) {
      return {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
        expiration: config.expiration
      };
    }

    const cacheKey = this.getCredentialCacheKey(config);
    const cached = this.credentialCache.get(cacheKey);

    if (cached && cached.credentials) {
      if (!cached.expiration || cached.expiration > new Date()) {
        this.metrics.cacheHits++;
        return cached.credentials;
      }
    }

    this.metrics.cacheMisses++;

    const credentials = await this.resolveCredentials(config);

    this.credentialCache.set(cacheKey, {
      credentials,
      cachedAt: new Date(),
      expiration: credentials.expiration || new Date(Date.now() + this.config.credentialCacheTTL)
    });

    return credentials;
  }

  private async resolveCredentials(config: AWSAuthConfig): Promise<AWSCredentials> {
    const errors: Error[] = [];

    for (const provider of this.credentialProviders) {
      try {
        const credentials = await provider.getCredentials(config);
        if (credentials) {
          this.logger.debug(`Credentials resolved using ${provider.name}`);
          return credentials;
        }
      } catch (error) {
        errors.push(error as Error);
        this.logger.debug(`Credential provider ${provider.name} failed`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    throw new AWSCredentialError(
      'Unable to load credentials from any providers',
      'CredentialProviderChainFailed',
      errors
    );
  }

  private initializeCredentialProviders(): void {
    this.credentialProviders.push({
      name: 'EnvironmentCredentials',
      getCredentials: async () => this.getEnvironmentCredentials()
    });

    this.credentialProviders.push({
      name: 'SharedCredentials',
      getCredentials: async (config: AWSAuthConfig) => this.getSharedCredentials(config)
    });

    this.credentialProviders.push({
      name: 'AssumeRoleCredentials',
      getCredentials: async (config: AWSAuthConfig) => this.getAssumeRoleCredentials(config)
    });

    if (this.config.ecsCredentialsRelativeUri || this.config.ecsCredentialsFullUri) {
      this.credentialProviders.push({
        name: 'ContainerCredentials',
        getCredentials: async () => this.getContainerCredentials()
      });
    }

    this.credentialProviders.push({
      name: 'InstanceMetadataCredentials',
      getCredentials: async () => this.getInstanceMetadataCredentials()
    });

    this.credentialProviders.push({
      name: 'ProcessCredentials',
      getCredentials: async (config: AWSAuthConfig) => this.getProcessCredentials(config)
    });
  }

  private async getEnvironmentCredentials(): Promise<AWSCredentials | null> {
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
    const sessionToken = process.env['AWS_SESSION_TOKEN'];
    const expiration = process.env['AWS_CREDENTIAL_EXPIRATION'];

    if (!accessKeyId || !secretAccessKey) {
      return null;
    }

    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      expiration: expiration ? new Date(expiration) : undefined
    };
  }

  private async getSharedCredentials(config: AWSAuthConfig): Promise<AWSCredentials | null> {
    const profile = config.profile || this.config.profile;
    const credentialsFile = this.config.credentialsFile;

    if (!existsSync(credentialsFile)) {
      return null;
    }

    try {
      const contentRaw = await FileUtils.readFile(credentialsFile, 'utf8');
      const content = typeof contentRaw === 'string' ? contentRaw : contentRaw.toString();
      const credentials = iniParser.parse(content);

      const profileCreds = credentials[profile];
      if (!profileCreds) {
        return null;
      }

      if (profileCreds.role_arn) {
        return await this.assumeRoleFromProfile(profileCreds, profile);
      }

      if (profileCreds.credential_process) {
        return await this.getProcessCredentialsFromProfile(profileCreds);
      }

      if (profileCreds.web_identity_token_file && profileCreds.role_arn) {
        return await this.getWebIdentityCredentials(profileCreds);
      }

      if (!profileCreds.aws_access_key_id || !profileCreds.aws_secret_access_key) {
        return null;
      }

      return {
        accessKeyId: profileCreds.aws_access_key_id,
        secretAccessKey: profileCreds.aws_secret_access_key,
        sessionToken: profileCreds.aws_session_token
      };

    } catch (error) {
      this.logger.warn('Failed to read shared credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async getWebIdentityCredentials(profileCreds: any): Promise<AWSCredentials> {
    const tokenFile = profileCreds.web_identity_token_file;
    const roleArn = profileCreds.role_arn;
    const sessionName = profileCreds.role_session_name || `cs-automation-${Date.now()}`;

    const webIdentityTokenRaw = await FileUtils.readFile(tokenFile, 'utf8');
    const webIdentityToken = typeof webIdentityTokenRaw === 'string'
      ? webIdentityTokenRaw
      : webIdentityTokenRaw.toString();

    const stsEndpoint = `https://sts.${this.config.defaultRegion}.amazonaws.com/`;
    const params = new URLSearchParams({
      'Action': 'AssumeRoleWithWebIdentity',
      'Version': '2011-06-15',
      'RoleArn': roleArn,
      'RoleSessionName': sessionName,
      'WebIdentityToken': webIdentityToken.trim()
    });

    const response = await this.makeHttpRequest(stsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const result = await this.parseXMLResponse(response);
    const credentials = result.AssumeRoleWithWebIdentityResponse.AssumeRoleWithWebIdentityResult.Credentials;

    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: new Date(credentials.Expiration)
    };
  }

  private async getProcessCredentialsFromProfile(profileCreds: any): Promise<AWSCredentials | null> {
    try {
      const { stdout } = await execAsync(profileCreds.credential_process);
      const result = JSON.parse(stdout);

      if (result.Version !== 1) {
        throw new AWSCredentialError(
          `Unsupported credential process version: ${result.Version}`,
          'UnsupportedCredentialProcessVersion'
        );
      }

      return {
        accessKeyId: result.AccessKeyId,
        secretAccessKey: result.SecretAccessKey,
        sessionToken: result.SessionToken,
        expiration: result.Expiration ? new Date(result.Expiration) : undefined
      };
    } catch (error) {
      this.logger.warn('Failed to get process credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async assumeRoleFromProfile(profileCreds: any, currentProfile: string): Promise<AWSCredentials> {
    const roleArn = profileCreds.role_arn;
    const sourceProfile = profileCreds.source_profile || 'default';
    const externalId = profileCreds.external_id;
    const mfaSerial = profileCreds.mfa_serial;
    const duration = profileCreds.duration_seconds ? parseInt(profileCreds.duration_seconds) : this.config.assumeRoleDuration;

    if (sourceProfile === currentProfile) {
      throw new AWSCredentialError(
        `Circular reference in profile: ${currentProfile}`,
        'CircularProfileReference'
      );
    }

    const sourceCredentials = await this.getSharedCredentials({ profile: sourceProfile });
    if (!sourceCredentials) {
      throw new AWSCredentialError(
        `Unable to load source credentials for profile: ${sourceProfile}`,
        'SourceCredentialsNotFound'
      );
    }

    return await this.assumeRole({
      roleArn,
      credentials: sourceCredentials,
      externalId: externalId || undefined,
      mfaSerial: mfaSerial || undefined,
      duration,
      sessionName: profileCreds.role_session_name || undefined
    });
  }

  private async getAssumeRoleCredentials(config: AWSAuthConfig): Promise<AWSCredentials | null> {
    if (!config.roleArn) {
      return null;
    }

    if (!config.accessKeyId || !config.secretAccessKey) {
      return null;
    }

    return await this.assumeRole({
      roleArn: config.roleArn,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken
      },
      externalId: config.externalId || undefined,
      sessionName: config.roleSessionName || undefined,
      duration: config.duration || this.config.assumeRoleDuration
    });
  }

  private async assumeRole(params: {
    roleArn: string;
    credentials: AWSCredentials;
    externalId?: string | undefined;
    mfaSerial?: string | undefined;
    sessionName?: string | undefined;
    duration?: number | undefined;
  }): Promise<AWSCredentials> {
    const sts = new AWSSTS({
      credentials: params.credentials,
      region: this.config.defaultRegion,
      handler: this
    });

    const assumeRoleParams: any = {
      RoleArn: params.roleArn,
      RoleSessionName: params.sessionName || `cs-automation-${Date.now()}`,
      DurationSeconds: params.duration || this.config.assumeRoleDuration
    };

    if (params.externalId) {
      assumeRoleParams.ExternalId = params.externalId;
    }

    if (params.mfaSerial) {
      const mfaToken = await this.promptMFAToken();
      assumeRoleParams.SerialNumber = params.mfaSerial;
      assumeRoleParams.TokenCode = mfaToken;
    }

    const response = await sts.assumeRole(assumeRoleParams);
    const credentials = response.Credentials;

    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: credentials.Expiration
    };
  }

  private async getContainerCredentials(): Promise<AWSCredentials | null> {
    const relativeUri = this.config.ecsCredentialsRelativeUri;
    const fullUri = this.config.ecsCredentialsFullUri;
    const authorization = process.env['AWS_CONTAINER_AUTHORIZATION_TOKEN'];

    let credentialsUrl: string;
    const headers: Record<string, string> = {};

    if (fullUri) {
      credentialsUrl = fullUri;
      if (authorization) {
        headers['Authorization'] = authorization;
      }
    } else if (relativeUri) {
      credentialsUrl = `http://169.254.170.2${relativeUri}`;
    } else {
      return null;
    }

    try {
      const response = await this.makeHttpRequest(credentialsUrl, {
        headers,
        timeout: this.config.imdsTimeout
      });

      const data = JSON.parse(response);

      return {
        accessKeyId: data.AccessKeyId,
        secretAccessKey: data.SecretAccessKey,
        sessionToken: data.Token,
        expiration: data.Expiration ? new Date(data.Expiration) : undefined
      };

    } catch (error) {
      this.logger.warn('Failed to get container credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async getInstanceMetadataCredentials(): Promise<AWSCredentials | null> {
    const metadataUrl = 'http://169.254.169.254';
    const apiVersion = 'latest';

    try {
      let token: string | undefined;

      if (this.config.enableIMDSv2) {
        try {
          const tokenResponse = await this.makeHttpRequest(
            `${metadataUrl}/${apiVersion}/api/token`,
            {
              method: 'PUT',
              headers: {
                'X-aws-ec2-metadata-token-ttl-seconds': '21600'
              },
              timeout: this.config.imdsTimeout
            }
          );

          token = tokenResponse.trim();
        } catch (error) {
          this.logger.debug('IMDSv2 token request failed, falling back to IMDSv1');
        }
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['X-aws-ec2-metadata-token'] = token;
      }

      const roleResponse = await this.makeHttpRequest(
        `${metadataUrl}/${apiVersion}/meta-data/iam/security-credentials/`,
        {
          headers,
          timeout: this.config.imdsTimeout
        }
      );

      const roles = roleResponse.trim().split('\n');
      if (roles.length === 0 || !roles[0]) {
        return null;
      }

      const role = roles[0];

      const credsResponse = await this.makeHttpRequest(
        `${metadataUrl}/${apiVersion}/meta-data/iam/security-credentials/${role}`,
        {
          headers,
          timeout: this.config.imdsTimeout
        }
      );

      const creds = JSON.parse(credsResponse);

      if (creds.Code !== 'Success') {
        throw new AWSCredentialError(
          `Failed to retrieve instance credentials: ${creds.Message}`,
          'InstanceCredentialsError'
        );
      }

      return {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.Token,
        expiration: new Date(creds.Expiration)
      };

    } catch (error) {
      this.logger.debug('Failed to get instance metadata credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async getProcessCredentials(config: AWSAuthConfig): Promise<AWSCredentials | null> {
    const configFile = this.config.configFile;

    if (!existsSync(configFile)) {
      return null;
    }

    try {
      const contentRaw = await FileUtils.readFile(configFile, 'utf8');
      const content = typeof contentRaw === 'string' ? contentRaw : contentRaw.toString();
      const profiles = iniParser.parse(content);

      const profile = config.profile || this.config.profile;
      const profileConfig = profiles[`profile ${profile}`] || profiles[profile];

      if (!profileConfig || !profileConfig.credential_process) {
        return null;
      }

      const { stdout } = await execAsync(profileConfig.credential_process, {
        env: {
          ...process.env,
          AWS_PROFILE: profile
        }
      });

      const result = JSON.parse(stdout);

      if (result.Version !== 1) {
        throw new AWSCredentialError(
          `Unsupported credential process version: ${result.Version}`,
          'UnsupportedCredentialProcessVersion'
        );
      }

      return {
        accessKeyId: result.AccessKeyId,
        secretAccessKey: result.SecretAccessKey,
        sessionToken: result.SessionToken,
        expiration: result.Expiration ? new Date(result.Expiration) : undefined
      };

    } catch (error) {
      this.logger.warn('Failed to get process credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async makeHttpRequest(
    url: string,
    options: {
      method?: string | undefined;
      headers?: Record<string, string> | undefined;
      body?: string | undefined;
      timeout?: number | undefined;
    } = {}
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.makeHttpRequestAttempt(url, options);
      } catch (error) {
        lastError = error as Error;

        if (error instanceof Error) {
          const message = error.message;
          if (
            message.includes('HTTP 404') ||
            message.includes('HTTP 403') ||
            message.includes('HTTP 401')
          ) {
            throw error;
          }
        }

        if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('HTTP request failed');
  }

  private async makeHttpRequestAttempt(
    url: string,
    options: {
      method?: string | undefined;
      headers?: Record<string, string> | undefined;
      body?: string | undefined;
      timeout?: number | undefined;
    } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';

      const requestOptions: https.RequestOptions | http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const protocol = isHttps ? https : http;

      const req = protocol.request(requestOptions, (res: http.IncomingMessage) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);

      if (options.timeout) {
        req.setTimeout(options.timeout, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      }

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  private async parseXMLResponse(xml: string): Promise<any> {
    try {
      return xmlParser.parse(xml);
    } catch (error) {
      throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async promptMFAToken(): Promise<string> {
    const mfaToken = process.env['AWS_MFA_TOKEN'];
    if (mfaToken) {
      return mfaToken;
    }

    if (process.stdin.isTTY && process.stdout.isTTY) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise((resolve, reject) => {
        rl.question('Enter MFA token: ', (answer) => {
          rl.close();
          if (answer && answer.trim()) {
            resolve(answer.trim());
          } else {
            reject(new AWSCredentialError(
              'MFA token is required',
              'MFATokenRequired'
            ));
          }
        });
      });
    }

    throw new AWSCredentialError(
      'MFA token required but no input mechanism available. Set AWS_MFA_TOKEN environment variable.',
      'MFATokenRequired'
    );
  }

  private initializeServiceEndpoints(): void {
    const partitions = [
      {
        name: 'aws',
        dnsSuffix: 'amazonaws.com',
        regions: [
          'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
          'ca-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3',
          'eu-central-1', 'eu-north-1', 'eu-south-1',
          'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
          'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3',
          'ap-south-1', 'ap-east-1', 'sa-east-1',
          'me-south-1', 'af-south-1'
        ]
      },
      {
        name: 'aws-cn',
        dnsSuffix: 'amazonaws.com.cn',
        regions: ['cn-north-1', 'cn-northwest-1']
      },
      {
        name: 'aws-us-gov',
        dnsSuffix: 'amazonaws.com',
        regions: ['us-gov-east-1', 'us-gov-west-1']
      }
    ];

    const services = [
      { name: 'ec2', global: false },
      { name: 'lambda', global: false },
      { name: 'batch', global: false },
      { name: 'ecs', global: false },
      { name: 'eks', global: false },
      { name: 'fargate', global: false },

      { name: 's3', global: false, dualStack: true },
      { name: 'ebs', global: false },
      { name: 'efs', global: false },
      { name: 'fsx', global: false },
      { name: 'backup', global: false },

      { name: 'dynamodb', global: false },
      { name: 'rds', global: false },
      { name: 'elasticache', global: false },
      { name: 'redshift', global: false },
      { name: 'neptune', global: false },
      { name: 'documentdb', global: false },

      { name: 'vpc', global: false },
      { name: 'cloudfront', global: true },
      { name: 'route53', global: true },
      { name: 'apigateway', global: false },
      { name: 'elasticloadbalancing', global: false },

      { name: 'iam', global: true },
      { name: 'sts', global: false },
      { name: 'kms', global: false },
      { name: 'secretsmanager', global: false },
      { name: 'acm', global: false },
      { name: 'waf', global: true },

      { name: 'kinesis', global: false },
      { name: 'firehose', global: false },
      { name: 'elasticsearch', global: false },
      { name: 'emr', global: false },
      { name: 'athena', global: false },

      { name: 'sqs', global: false },
      { name: 'sns', global: false },
      { name: 'ses', global: false },
      { name: 'eventbridge', global: false },
      { name: 'stepfunctions', global: false },

      { name: 'codecommit', global: false },
      { name: 'codebuild', global: false },
      { name: 'codedeploy', global: false },
      { name: 'codepipeline', global: false },

      { name: 'cloudformation', global: false },
      { name: 'cloudwatch', global: false },
      { name: 'cloudtrail', global: false },
      { name: 'config', global: false },
      { name: 'ssm', global: false },
      { name: 'organizations', global: true },

      { name: 'sagemaker', global: false },
      { name: 'comprehend', global: false },
      { name: 'rekognition', global: false },
      { name: 'polly', global: false },
      { name: 'transcribe', global: false },
      { name: 'translate', global: false }
    ];

    for (const partition of partitions) {
      for (const service of services) {
        if (service.global) {
          const endpoint = this.buildGlobalServiceEndpoint(service.name, partition);
          const key = `${service.name}.${partition.name}`;

          this.serviceEndpoints.set(key, {
            service: service.name,
            region: 'us-east-1' as AWSRegion,
            endpoint,
            protocols: ['https'],
            signatureVersion: 'v4',
            global: true,
            partition: partition.name
          });
        } else {
          for (const region of partition.regions) {
            const endpoint = this.buildServiceEndpoint(service.name, region, partition.dnsSuffix);
            const key = `${service.name}.${region}`;

            this.serviceEndpoints.set(key, {
              service: service.name,
              region: region as AWSRegion,
              endpoint,
              protocols: ['https'],
              signatureVersion: this.getServiceSignatureVersion(service.name),
              global: false,
              partition: partition.name
            });

            if (service.dualStack) {
              const dualStackEndpoint = this.buildServiceEndpoint(
                service.name,
                region,
                partition.dnsSuffix,
                true
              );
              const dualStackKey = `${service.name}.dualstack.${region}`;

              this.serviceEndpoints.set(dualStackKey, {
                service: service.name,
                region: region as AWSRegion,
                endpoint: dualStackEndpoint,
                protocols: ['https'],
                signatureVersion: this.getServiceSignatureVersion(service.name),
                global: false,
                partition: partition.name,
                dualStack: true
              });
            }
          }
        }
      }
    }

    this.addFIPSEndpoints();

    this.addVPCEndpoints();
  }

  private getServiceSignatureVersion(service: string): string {
    const v2Services = ['ec2', 'rds', 'sdb', 'importexport'];
    const s3Services = ['s3'];

    if (v2Services.includes(service)) {
      return 'v2';
    }

    if (s3Services.includes(service)) {
      return 's3v4';
    }

    return 'v4';
  }

  private buildServiceEndpoint(
    service: string,
    region: string,
    dnsSuffix: string,
    dualStack: boolean = false
  ): string {
    if (service === 's3') {
      if (region === 'us-east-1' && !dualStack) {
        return `s3.${dnsSuffix}`;
      }
      if (dualStack) {
        return `s3.dualstack.${region}.${dnsSuffix}`;
      }
      return `s3.${region}.${dnsSuffix}`;
    }

    if (service === 'sts') {
      return `sts.${region}.${dnsSuffix}`;
    }

    return `${service}.${region}.${dnsSuffix}`;
  }

  private buildGlobalServiceEndpoint(service: string, partition: any): string {
    const dnsSuffix = partition.dnsSuffix;

    switch (service) {
      case 'iam':
        return partition.name === 'aws-cn'
          ? `iam.cn-north-1.${dnsSuffix}`
          : `iam.${dnsSuffix}`;

      case 'route53':
        return `route53.${dnsSuffix}`;

      case 'cloudfront':
        return `cloudfront.${dnsSuffix}`;

      case 'waf':
        return `waf.${dnsSuffix}`;

      case 'organizations':
        return partition.name === 'aws-us-gov'
          ? `organizations.us-gov-west-1.${dnsSuffix}`
          : `organizations.${dnsSuffix}`;

      default:
        return `${service}.${dnsSuffix}`;
    }
  }

  private addFIPSEndpoints(): void {
    const fipsRegions = [
      'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
      'us-gov-east-1', 'us-gov-west-1'
    ];

    const fipsServices = [
      'ec2', 'sts', 'kms', 'ssm', 'lambda', 'states',
      'elasticloadbalancing', 'autoscaling', 'cloudformation'
    ];

    for (const region of fipsRegions) {
      for (const service of fipsServices) {
        const fipsEndpoint = `${service}-fips.${region}.amazonaws.com`;
        const key = `${service}.fips.${region}`;

        const regionTyped = region as AWSRegion;

        this.serviceEndpoints.set(key, {
          service,
          region: regionTyped,
          endpoint: fipsEndpoint,
          protocols: ['https'],
          signatureVersion: this.getServiceSignatureVersion(service),
          global: false,
          partition: region.startsWith('us-gov') ? 'aws-us-gov' : 'aws',
          fips: true
        });
      }
    }
  }

  private addVPCEndpoints(): void {
    const vpcEndpointPatterns = [
      /^vpce-[0-9a-f]{17}\..*\.vpce\.amazonaws\.com$/,
      /^vpce-[0-9a-f]{17}\..*\.vpce\.amazonaws\.com\.cn$/
    ];

    this.regionalEndpoints.set('vpc-endpoint-patterns', {
      patterns: vpcEndpointPatterns,
      signatureVersion: 'v4'
    } as any);
  }

  private extractServiceFromUrl(url: URL): string {
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('.vpce.')) {
      const parts = hostname.split('.');
      if (parts.length >= 2 && parts[1]) {
        return parts[1];
      }
    }

    if (this.config.s3EndpointPattern.test(hostname)) {
      return 's3';
    }

    if (this.config.s3VirtualHostedBucketPattern.test(hostname)) {
      return 's3';
    }

    const parts = hostname.split('.');

    if (parts.length >= 3) {
      if (parts[0] && parts[0].endsWith('-fips')) {
        return parts[0].replace('-fips', '');
      }

      if (parts[0] === 's3' && parts[1] === 'dualstack') {
        return 's3';
      }

      if (parts[0]) {
        return parts[0];
      }
    }

    return 'execute-api';
  }

  private extractRegionFromUrl(url: URL): string {
    const hostname = url.hostname.toLowerCase();

    const globalServices = ['iam', 'route53', 'cloudfront', 'waf'];
    const serviceName = this.extractServiceFromUrl(url);
    if (globalServices.includes(serviceName)) {
      return 'us-east-1';
    }

    const s3Match = hostname.match(/\.s3[.-]([a-z0-9-]+)\.amazonaws/);
    if (s3Match && s3Match[1]) {
      return s3Match[1];
    }

    const parts = hostname.split('.');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part && this.isValidRegion(part)) {
        return part;
      }
    }

    const regionMatch = hostname.match(/\.([a-z]{2}-[a-z]+-\d+)\./);
    if (regionMatch && regionMatch[1]) {
      return regionMatch[1];
    }

    if (hostname.includes('.cn-')) {
      const cnMatch = hostname.match(/\.(cn-[a-z]+-\d+)\./);
      if (cnMatch && cnMatch[1]) {
        return cnMatch[1];
      }
    }

    return 'us-east-1';
  }

  private isValidRegion(str: string): boolean {
    const regionPattern = /^(us|eu|ap|sa|ca|me|af|cn)-(east|west|north|south|central|northeast|southeast|northwest|southwest)-\d+$/;
    return regionPattern.test(str) || ['us-gov-east-1', 'us-gov-west-1'].includes(str);
  }

  private getDateStamp(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private getAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private getCredentialScope(dateStamp: string, region: string, service: string): string {
    return `${dateStamp}/${region}/${service}/${this.config.credentialScope}`;
  }

  private getCredentialCacheKey(config: AWSAuthConfig): string {
    const parts = [
      config.profile || this.config.profile,
      config.roleArn || 'default',
      config.accessKeyId || 'env'
    ];

    return createHash('sha256').update(parts.join(':')).digest('hex');
  }

  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `aws-${timestamp}-${random}`;
  }

  private updateMetrics(
    service: string,
    region: string,
    success: boolean,
    duration: number
  ): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalSigningRequests++;

    if (success) {
      this.metrics.successfulSignings++;
    } else {
      this.metrics.failedSignings++;
    }

    const totalTime = this.metrics.averageSigningTime * (this.metrics.totalSigningRequests - 1) + duration;
    this.metrics.averageSigningTime = totalTime / this.metrics.totalSigningRequests;

    const serviceCount = this.metrics.signingsByService.get(service) || 0;
    this.metrics.signingsByService.set(service, serviceCount + 1);

    const regionCount = this.metrics.signingsByRegion.get(region) || 0;
    this.metrics.signingsByRegion.set(region, regionCount + 1);
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 3600000);

    setInterval(() => {
      this.resetMetrics();
    }, 24 * 60 * 60 * 1000);
  }

  private cleanupExpiredEntries(): void {
    const now = new Date();
    let cleanedCredentials = 0;
    let cleanedKeys = 0;

    for (const [key, cache] of this.credentialCache.entries()) {
      if (cache.expiration && cache.expiration < now) {
        this.credentialCache.delete(key);
        cleanedCredentials++;
      }
    }

    for (const [key, cache] of this.signingKeyCache.entries()) {
      if (cache.expiresAt < now) {
        this.signingKeyCache.delete(key);
        cleanedKeys++;
      }
    }

    if (cleanedCredentials > 0 || cleanedKeys > 0) {
      this.logger.debug('Cleaned up expired AWS entries', {
        credentials: cleanedCredentials,
        signingKeys: cleanedKeys
      });
    }
  }

  private resetMetrics(): void {
    this.metrics.totalSigningRequests = 0;
    this.metrics.successfulSignings = 0;
    this.metrics.failedSignings = 0;
    this.metrics.credentialRefreshes = 0;
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    this.metrics.averageSigningTime = 0;
    this.metrics.signingsByService.clear();
    this.metrics.signingsByRegion.clear();
    this.metrics.errors = [];
    this.metrics.lastReset = new Date();
  }

  public getMetrics(): AWSSignatureMetrics {
    return {
      ...this.metrics,
      signingsByService: new Map(this.metrics.signingsByService),
      signingsByRegion: new Map(this.metrics.signingsByRegion),
      errors: [...this.metrics.errors]
    };
  }

  public clearCaches(): void {
    this.credentialCache.clear();
    this.signingKeyCache.clear();
    this.logger.info('All AWS caches cleared');
  }

  public async refreshCredentials(config: AWSAuthConfig): Promise<AWSCredentials> {
    const cacheKey = this.getCredentialCacheKey(config);
    this.credentialCache.delete(cacheKey);

    const credentials = await this.getCredentials(config);

    this.metrics.credentialRefreshes++;

    return credentials;
  }

  public async validateConfig(config: AWSAuthConfig): Promise<boolean> {
    try {
      if (!config.region) {
        config.region = this.config.defaultRegion;
      }

      const credentials = await this.getCredentials(config);

      return !!(credentials.accessKeyId && credentials.secretAccessKey);

    } catch (error) {
      this.logger.error('AWS config validation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  public async testConfiguration(config: AWSAuthConfig): Promise<{
    success: boolean;
    error?: string | undefined;
    details?: any;
  }> {
    try {
      const isValid = await this.validateConfig(config);
      if (!isValid) {
        throw new Error('Invalid configuration');
      }

      const testRequest: RequestOptions = {
        url: `https://sts.${config.region || this.config.defaultRegion}.amazonaws.com/`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'Action=GetCallerIdentity&Version=2011-06-15'
      };

      const signedRequest = await this.signRequest(testRequest, config);

      try {
        const response = await this.makeHttpRequest(signedRequest.url, {
          method: signedRequest.method,
          headers: signedRequest.headers,
          body: signedRequest.body as string
        });

        const result = await this.parseXMLResponse(response);
        const identity = result.GetCallerIdentityResponse?.GetCallerIdentityResult;

        return {
          success: true,
          details: {
            credentials: {
              accessKeyId: signedRequest.credentials.accessKeyId,
              hasSessionToken: !!config.sessionToken
            },
            identity: {
              userId: identity?.UserId,
              account: identity?.Account,
              arn: identity?.Arn
            },
            region: config.region || this.config.defaultRegion,
            service: config.service || 'sts'
          }
        };
      } catch (reqError) {
        return {
          success: true,
          details: {
            credentials: {
              accessKeyId: signedRequest.credentials.accessKeyId,
              hasSessionToken: !!config.sessionToken
            },
            region: config.region || this.config.defaultRegion,
            service: config.service || 'sts',
            note: 'Signature generated successfully but request failed'
          }
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: {
          code: error instanceof AWSSignatureError || error instanceof AWSCredentialError ? error.code : undefined,
          type: error instanceof Error ? error.name : undefined
        }
      };
    }
  }

  public async signStreamingRequest(
    request: RequestOptions,
    config: AWSAuthConfig,
    _chunkSize: number = 65536
  ): Promise<{
    signedRequest: AWSSignedRequest;
    chunkSigner: (chunk: Buffer) => string;
  }> {
    const streamingRequest = {
      ...request,
      headers: {
        ...request.headers,
        'x-amz-content-sha256': this.config.streamingSignedBodyValue,
        'x-amz-decoded-content-length': request.headers?.['content-length'] || '0'
      }
    };

    const signedRequest = await this.signRequest(streamingRequest, config);
    const context = {
      credentials: await this.getCredentials(config),
      service: config.service || this.extractServiceFromUrl(new URL(request.url)),
      region: config.region || this.extractRegionFromUrl(new URL(request.url)),
      timestamp: new Date()
    };

    const dateStamp = this.getDateStamp(context.timestamp);
    const signingKey = await this.getSigningKey(
      context.credentials.secretAccessKey,
      dateStamp,
      context.region,
      context.service
    );

    let previousSignature = signedRequest.signature;

    const chunkSigner = (chunk: Buffer): string => {
      const chunkHash = createHash('sha256').update(chunk).digest('hex');

      const stringToSign = [
        this.config.streamingSignedBodyValue,
        this.getAmzDate(new Date()),
        this.getCredentialScope(dateStamp, context.region, context.service),
        previousSignature,
        createHash('sha256').update('').digest('hex'),
        chunkHash
      ].join('\n');

      const signature = this.calculateSignature(signingKey, stringToSign);
      previousSignature = signature;

      return `${chunk.length.toString(16)};chunk-signature=${signature}\r\n${chunk.toString()}\r\n`;
    };

    return {
      signedRequest,
      chunkSigner
    };
  }
}

export class AWSSTS {
  private credentials: AWSCredentials;
  private region: string;
  private handler: AWSSignatureHandler;
  private endpoint: string;

  constructor(config: {
    credentials: AWSCredentials;
    region: string;
    handler: AWSSignatureHandler;
  }) {
    this.credentials = config.credentials;
    this.region = config.region;
    this.handler = config.handler;
    this.endpoint = `https://sts.${this.region}.amazonaws.com/`;
  }

  async assumeRole(params: any): Promise<AWSAssumeRoleResponse> {
    const body = new URLSearchParams({
      'Action': 'AssumeRole',
      'Version': '2011-06-15',
      'RoleArn': params.RoleArn,
      'RoleSessionName': params.RoleSessionName,
      'DurationSeconds': params.DurationSeconds?.toString() || '3600'
    });

    if (params.ExternalId) {
      body.set('ExternalId', params.ExternalId);
    }

    if (params.SerialNumber && params.TokenCode) {
      body.set('SerialNumber', params.SerialNumber);
      body.set('TokenCode', params.TokenCode);
    }

    if (params.Policy) {
      body.set('Policy', typeof params.Policy === 'string' ? params.Policy : JSON.stringify(params.Policy));
    }

    if (params.PolicyArns) {
      params.PolicyArns.forEach((arn: any, index: number) => {
        body.set(`PolicyArns.member.${index + 1}.arn`, arn.arn || arn);
      });
    }

    if (params.TransitiveTagKeys) {
      params.TransitiveTagKeys.forEach((key: string, index: number) => {
        body.set(`TransitiveTagKeys.member.${index + 1}`, key);
      });
    }

    if (params.Tags) {
      Object.keys(params.Tags).forEach((key, index) => {
        body.set(`Tags.member.${index + 1}.Key`, key);
        body.set(`Tags.member.${index + 1}.Value`, params.Tags[key]);
      });
    }

    const request: RequestOptions = {
      url: this.endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/xml'
      },
      body: body.toString()
    };

    const signedRequest = await this.handler.signRequest(request, {
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      sessionToken: this.credentials.sessionToken,
      region: this.region,
      service: 'sts'
    });

    const response = await this.makeRequest(signedRequest);
    return this.parseAssumeRoleResponse(response);
  }

  async getCallerIdentity(): Promise<{
    UserId: string;
    Account: string;
    Arn: string;
  }> {
    const body = new URLSearchParams({
      'Action': 'GetCallerIdentity',
      'Version': '2011-06-15'
    });

    const request: RequestOptions = {
      url: this.endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/xml'
      },
      body: body.toString()
    };

    const signedRequest = await this.handler.signRequest(request, {
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      sessionToken: this.credentials.sessionToken,
      region: this.region,
      service: 'sts'
    });

    const response = await this.makeRequest(signedRequest);
    const result = await this.parseXMLResponse(response);

    const identity = result.GetCallerIdentityResponse?.GetCallerIdentityResult;
    return {
      UserId: identity.UserId,
      Account: identity.Account,
      Arn: identity.Arn
    };
  }

  async getSessionToken(params?: {
    DurationSeconds?: number | undefined;
    SerialNumber?: string | undefined;
    TokenCode?: string | undefined;
  } | undefined): Promise<AWSCredentials> {
    const body = new URLSearchParams({
      'Action': 'GetSessionToken',
      'Version': '2011-06-15'
    });

    if (params?.DurationSeconds) {
      body.set('DurationSeconds', params.DurationSeconds.toString());
    }

    if (params?.SerialNumber && params?.TokenCode) {
      body.set('SerialNumber', params.SerialNumber);
      body.set('TokenCode', params.TokenCode);
    }

    const request: RequestOptions = {
      url: this.endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/xml'
      },
      body: body.toString()
    };

    const signedRequest = await this.handler.signRequest(request, {
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
      sessionToken: this.credentials.sessionToken,
      region: this.region,
      service: 'sts'
    });

    const response = await this.makeRequest(signedRequest);
    const result = await this.parseXMLResponse(response);

    const credentials = result.GetSessionTokenResponse?.GetSessionTokenResult?.Credentials;
    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: new Date(credentials.Expiration)
    };
  }

  private async makeRequest(request: AWSSignedRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(request.url);
      const isHttps = url.protocol === 'https:';

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: request.method,
        headers: request.headers
      };

      const protocol = isHttps ? https : http;

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            this.parseErrorResponse(data)
              .then(error => reject(error))
              .catch(() => reject(new Error(`STS request failed: ${res.statusCode} ${data}`)));
          }
        });
      });

      req.on('error', reject);

      if (request.body) {
        req.write(request.body);
      }

      req.end();
    });
  }

  private async parseXMLResponse(xml: string): Promise<any> {
    const parser = new SimpleXMLParser();
    try {
      return parser.parse(xml);
    } catch (error) {
      throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async parseAssumeRoleResponse(xml: string): Promise<AWSAssumeRoleResponse> {
    const result = await this.parseXMLResponse(xml);
    const response = result.AssumeRoleResponse?.AssumeRoleResult;

    if (!response) {
      throw new Error('Invalid AssumeRole response');
    }

    return {
      Credentials: {
        AccessKeyId: response.Credentials.AccessKeyId,
        SecretAccessKey: response.Credentials.SecretAccessKey,
        SessionToken: response.Credentials.SessionToken,
        Expiration: new Date(response.Credentials.Expiration)
      },
      AssumedRoleUser: {
        AssumedRoleId: response.AssumedRoleUser.AssumedRoleId,
        Arn: response.AssumedRoleUser.Arn
      },
      PackedPolicySize: response.PackedPolicySize ? parseInt(response.PackedPolicySize) : undefined,
      SourceIdentity: response.SourceIdentity
    };
  }

  private async parseErrorResponse(xml: string): Promise<Error> {
    try {
      const result = await this.parseXMLResponse(xml);
      const error = result.ErrorResponse?.Error || result.Error;

      if (error) {
        const awsError = new AWSSignatureError(
          error.Message || 'Unknown error',
          error.Code || 'UnknownError'
        );
        (awsError as any).requestId = result.ErrorResponse?.RequestId || result.RequestId;
        return awsError;
      }
    } catch (e) {
    }

    return new Error(`STS request failed: ${xml}`);
  }
}

export class AWSSignatureError extends Error {
  public code: string;
  public requestId?: string | undefined;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AWSSignatureError';
    this.code = code;

    Object.setPrototypeOf(this, AWSSignatureError.prototype);
  }
}

export class AWSCredentialError extends Error {
  public code: string;
  public errors?: Error[] | undefined;

  constructor(message: string, code: string, errors?: Error[] | undefined) {
    super(message);
    this.name = 'AWSCredentialError';
    this.code = code;
    this.errors = errors;

    Object.setPrototypeOf(this, AWSCredentialError.prototype);
  }
}
