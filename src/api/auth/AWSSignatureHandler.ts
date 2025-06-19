/**
 * CS Test Automation Framework
 * AWS Signature V4 Authentication Handler
 * Complete implementation of AWS signature authentication
 * 
 * @version 4.0.0
 * @author CS Test Automation Team
 */

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

/**
 * Simple XML parser for AWS responses
 */
class SimpleXMLParser {
  parse(xml: string): any {
    const result: any = {};

    // Remove XML declaration
    xml = xml.replace(/<\?xml[^>]*\?>/, '').trim();

    // Parse recursively
    this.parseElement(xml, result);

    return result;
  }

  private parseElement(xml: string, parent: any): void {
    const nestedRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;

    let match;
    while ((match = nestedRegex.exec(xml)) !== null) {
      const tagName = match[1];
      const content = match[3];

      if (!content || !tagName) continue;  // Add check for tagName

      const trimmedContent = content.trim();

      if (trimmedContent.includes('<')) {
        // Nested element
        parent[tagName] = parent[tagName] || {};
        this.parseElement(trimmedContent, parent[tagName]);
      } else {
        // Simple element
        parent[tagName] = trimmedContent;
      }
    }
  }
}

/**
 * Simple INI parser for AWS config files
 */
class SimpleINIParser {
  parse(content: string): any {
    const result: any = {};
    let currentSection: string | null = null;

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      // Section header
      const sectionMatch = trimmed.match(/^\[(.+)\]$/);
      if (sectionMatch && sectionMatch[1]) {  // Add check for sectionMatch[1]
        currentSection = sectionMatch[1];
        if (!result[currentSection]) {
          result[currentSection] = {};
        }
        continue;
      }

      // Key-value pair
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

/**
 * AWS Signature Handler Implementation
 */
export class AWSSignatureHandler {
  private static instance: AWSSignatureHandler;
  private readonly logger: Logger;
  private readonly actionLogger: ActionLogger;

  // Credential management
  private readonly credentialCache: Map<string, AWSCredentialCache> = new Map();
  private readonly signingKeyCache: Map<string, AWSSigningKey> = new Map();
  private readonly credentialProviders: AWSCredentialProvider[] = [];

  // Endpoint mappings
  private readonly serviceEndpoints: Map<string, AWSServiceEndpoint> = new Map();
  private readonly regionalEndpoints: Map<string, AWSRegionalEndpoint> = new Map();

  // Metrics
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

  // Configuration
  private readonly config = {
    signatureVersion: 'v4',
    signatureAlgorithm: 'AWS4-HMAC-SHA256' as AWSSigningAlgorithm,
    defaultRegion: 'us-east-1' as AWSRegion,
    credentialScope: 'aws4_request',
    maxRetries: 3,
    retryDelay: 1000,
    credentialCacheTTL: 3600000, // 1 hour
    signingKeyCacheTTL: 86400000, // 24 hours
    assumeRoleDuration: 3600, // 1 hour
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

  /**
   * Private constructor for singleton
   */
  private constructor() {
    this.logger = Logger.getInstance();
    this.actionLogger = ActionLogger.getInstance();

    this.initializeCredentialProviders();
    this.initializeServiceEndpoints();
    this.startCleanupTimer();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): AWSSignatureHandler {
    if (!AWSSignatureHandler.instance) {
      AWSSignatureHandler.instance = new AWSSignatureHandler();
    }
    return AWSSignatureHandler.instance;
  }

  /**
   * Sign AWS request
   */
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

      // Get credentials
      const credentials = await this.getCredentials(config);

      // Parse request URL
      const url = new URL(request.url);
      const service = config.service || this.extractServiceFromUrl(url);
      const region = config.region || this.extractRegionFromUrl(url) || this.config.defaultRegion;

      // Create signing context
      const context: AWSRequestContext = {
        credentials,
        service,
        region,
        signatureVersion: config.signatureVersion || this.config.signatureVersion,
        timestamp: new Date(),
        requestId
      };

      // Sign based on signature version
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

      // Update metrics
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

  /**
   * Sign request with AWS Signature V4
   */
  private async signV4(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    const timestamp = context.timestamp;
    const dateStamp = this.getDateStamp(timestamp);
    const amzDate = this.getAmzDate(timestamp);

    // Step 1: Create canonical request
    const canonicalRequest = await this.createCanonicalRequest(request, context, amzDate);

    // Step 2: Create string to sign
    const credentialScope = this.getCredentialScope(dateStamp, context.region, context.service);
    const stringToSign = this.createStringToSign(
      amzDate,
      credentialScope,
      canonicalRequest.hash
    );

    // Step 3: Calculate signature
    const signingKey = await this.getSigningKey(
      context.credentials.secretAccessKey,
      dateStamp,
      context.region,
      context.service
    );
    const signature = this.calculateSignature(signingKey, stringToSign);

    // Step 4: Build Authorization header
    const authorizationHeader = this.buildAuthorizationHeader(
      context.credentials.accessKeyId,
      credentialScope,
      canonicalRequest.signedHeaders,
      signature
    );

    // Step 5: Add signature to request
    const signedHeaders: Record<string, string> = {
      ...request.headers,
      ...canonicalRequest.headers,
      'Authorization': authorizationHeader,
      [this.config.dateHeader]: amzDate
    };

    // Add security token if present
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

  /**
   * Create canonical request
   */
  private async createCanonicalRequest(
    request: RequestOptions,
    context: AWSRequestContext,
    amzDate: string
  ): Promise<AWSCanonicalRequest> {
    const url = new URL(request.url);
    const method = request.method || 'GET';

    // Canonical URI
    const canonicalUri = this.getCanonicalUri(url.pathname, context.service);

    // Canonical query string
    const canonicalQueryString = this.getCanonicalQueryString(url.searchParams);

    // Headers to sign
    const headers: Record<string, string> = {
      ...request.headers,
      'host': url.host,
      [this.config.dateHeader]: amzDate
    };

    // Add security token if present
    if (context.credentials.sessionToken) {
      headers[this.config.securityTokenHeader] = context.credentials.sessionToken;
    }

    // Canonical headers
    const { canonicalHeaders, signedHeaders } = this.getCanonicalHeaders(headers);

    // Payload hash
    const payloadHash = await this.getPayloadHash(request, context.service, method);

    // Add payload hash header
    if (!this.config.unsignedPayload && context.service !== 's3') {
      headers[this.config.signedBodyHeader] = payloadHash;
    }

    // Special handling for S3
    if (context.service === 's3' && !this.config.s3DisableBodySigning.includes(method)) {
      headers[this.config.signedBodyHeader] = payloadHash;
    }

    // Build canonical request
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

  /**
   * Get canonical URI
   */
  private getCanonicalUri(path: string, service: string): string {
    if (!path || path === '') {
      return '/';
    }

    // S3 special handling
    if (service === 's3' && this.config.s3UriEscapePath === false) {
      return path;
    }

    // Normalize path
    if (this.config.normalizePath) {
      // Remove redundant slashes
      path = path.replace(/\/+/g, '/');

      // Remove trailing slash unless it's the root
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
    }

    // URL encode each path segment
    const segments = path.split('/');
    const encodedSegments = segments.map(segment => {
      if (segment === '') return segment;

      // Encode segment
      const encoded = this.awsUrlEncode(segment, service === 's3');

      return encoded;
    });

    return encodedSegments.join('/');
  }

  /**
   * AWS URL encoding
   */
  private awsUrlEncode(str: string, isS3: boolean = false): string {
    // Standard percent encoding
    let encoded = encodeURIComponent(str);

    // AWS specific replacements
    encoded = encoded.replace(/[!'()*]/g, (c) => {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });

    // S3 specific encoding
    if (isS3) {
      // S3 doesn't encode forward slashes in object keys
      encoded = encoded.replace(/%2F/g, '/');
    }

    return encoded;
  }

  /**
   * Get canonical query string
   */
  private getCanonicalQueryString(params: URLSearchParams): string {
    const sortedParams: Array<[string, string]> = [];

    // Collect all parameters
    for (const [key, value] of params.entries()) {
      // Skip signature parameter if present (for presigned URLs)
      if (key === this.config.signatureQueryParam) {
        continue;
      }
      sortedParams.push([key, value]);
    }

    // Sort by key, then by value
    sortedParams.sort((a, b) => {
      const keyCompare = a[0].localeCompare(b[0]);
      if (keyCompare !== 0) return keyCompare;
      return a[1].localeCompare(b[1]);
    });

    // Build canonical query string
    return sortedParams
      .map(([key, value]) => {
        const encodedKey = this.awsUrlEncode(key);
        const encodedValue = this.awsUrlEncode(value);
        return `${encodedKey}=${encodedValue}`;
      })
      .join('&');
  }

  /**
   * Get canonical headers
   */
  private getCanonicalHeaders(headers: Record<string, string>): {
    canonicalHeaders: string;
    signedHeaders: string;
  } {
    const headerMap = new Map<string, string>();

    // Normalize header names and values
    for (const [name, value] of Object.entries(headers)) {
      const lowerName = name.toLowerCase();

      // Skip certain headers
      if (lowerName === 'authorization' || lowerName === 'content-length') {
        continue;
      }

      // Normalize value: trim and collapse spaces
      const normalizedValue = value.trim().replace(/\s+/g, ' ');

      headerMap.set(lowerName, normalizedValue);
    }

    // Sort headers by name
    const sortedHeaders = Array.from(headerMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Build canonical headers
    const canonicalHeaders = sortedHeaders
      .map(([name, value]) => `${name}:${value}`)
      .join('\n') + '\n';

    // Build signed headers
    const signedHeaders = sortedHeaders
      .map(([name]) => name)
      .join(';');

    return { canonicalHeaders, signedHeaders };
  }

  /**
   * Get payload hash
   */
  private async getPayloadHash(request: RequestOptions, service: string, method: string): Promise<string> {
    // Check for unsigned payload
    if (this.config.unsignedPayload) {
      return 'UNSIGNED-PAYLOAD';
    }

    // S3 special cases
    if (service === 's3') {
      // For S3, certain operations use unsigned payload
      if (this.config.s3DisableBodySigning.includes(method)) {
        return 'UNSIGNED-PAYLOAD';
      }

      // Check for streaming
      if (request.headers?.['x-amz-content-sha256'] === this.config.streamingSignedBodyValue) {
        return this.config.streamingSignedBodyValue;
      }
    }

    // Calculate payload hash
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

  /**
   * Create string to sign
   */
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

  /**
   * Get signing key
   */
  private async getSigningKey(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Promise<Buffer> {
    // Check cache
    const cacheKey = `${secretKey}:${dateStamp}:${region}:${service}`;
    const cached = this.signingKeyCache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      this.metrics.cacheHits++;
      return cached.key;
    }

    this.metrics.cacheMisses++;

    // Derive signing key using the AWS Signature V4 key derivation process
    const kSecret = `AWS4${secretKey}`;
    const kDate = createHmac('sha256', kSecret).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();

    // Cache signing key
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

  /**
   * Calculate signature
   */
  private calculateSignature(signingKey: Buffer, stringToSign: string): string {
    return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  }

  /**
   * Build Authorization header
   */
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

  /**
   * Sign request with AWS Signature V2
   */
  private async signV2(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    const url = new URL(request.url);
    const timestamp = context.timestamp.toISOString();

    // Build parameters
    const params = new URLSearchParams(url.searchParams);
    params.set('AWSAccessKeyId', context.credentials.accessKeyId);
    params.set('SignatureVersion', '2');
    params.set('SignatureMethod', 'HmacSHA256');
    params.set('Timestamp', timestamp);

    if (context.credentials.sessionToken) {
      params.set('SecurityToken', context.credentials.sessionToken);
    }

    // Add action and version for the service
    if (!params.has('Action')) {
      // Try to extract from body for POST requests
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

    // Sort parameters
    const sortedParams = new URLSearchParams(Array.from(params.entries()).sort());

    // Create string to sign
    const stringToSign = [
      request.method || 'GET',
      url.hostname.toLowerCase(),
      url.pathname || '/',
      sortedParams.toString()
    ].join('\n');

    // Calculate signature
    const signature = createHmac('sha256', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    // Add signature to parameters
    sortedParams.set('Signature', signature);

    // Update URL or body based on method
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

  /**
   * Sign request with S3 signature
   */
  private async signS3(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    const url = new URL(request.url);
    const timestamp = context.timestamp.toUTCString();
    const method = request.method || 'GET';

    // Headers
    const headers: Record<string, string> = {
      ...request.headers,
      'Date': timestamp
    };

    // Content-MD5 if needed
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

    // Content-Type
    const contentType = headers['Content-Type'] || headers['content-type'] || '';

    // Canonical headers (x-amz-*)
    const amzHeaders: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(headers)) {
      const lowerName = name.toLowerCase();
      if (lowerName.startsWith('x-amz-')) {
        amzHeaders.push([lowerName, value.trim()]);
      }
    }
    amzHeaders.sort((a, b) => a[0].localeCompare(b[0]));

    // String to sign
    const resource = this.getS3CanonicalResource(url);
    const stringToSignParts = [
      method,
      contentMD5,
      contentType,
      timestamp
    ];

    // Add AMZ headers
    for (const [name, value] of amzHeaders) {
      stringToSignParts.push(`${name}:${value}`);
    }

    // Add resource
    stringToSignParts.push(resource);

    const stringToSign = stringToSignParts.join('\n');

    // Calculate signature
    const signature = createHmac('sha1', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    // Authorization header
    headers['Authorization'] = `AWS ${context.credentials.accessKeyId}:${signature}`;

    // Security token
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

  /**
   * Sign request with S3 V4 signature
   */
  private async signS3v4(
    request: RequestOptions,
    context: AWSRequestContext
  ): Promise<AWSSignedRequest> {
    // S3 V4 uses the standard V4 signing process with S3-specific handling
    return this.signV4(request, context);
  }

  /**
   * Get S3 canonical resource
   */
  private getS3CanonicalResource(url: URL): string {
    let resource = url.pathname || '/';

    // Decode the path
    resource = decodeURIComponent(resource);

    // Add bucket for virtual-hosted style URLs
    const virtualHostMatch = url.hostname.match(this.config.s3VirtualHostedBucketPattern);
    if (virtualHostMatch) {
      const bucket = virtualHostMatch[1];
      resource = `/${bucket}${resource === '/' ? '' : resource}`;
    }

    // Add sub-resources
    const subResources = [
      'acl', 'accelerate', 'analytics', 'cors', 'delete', 'encryption',
      'inventory', 'lifecycle', 'location', 'logging', 'metrics',
      'notification', 'partNumber', 'policy', 'publicAccessBlock',
      'replication', 'requestPayment', 'restore', 'tagging', 'torrent',
      'uploadId', 'uploads', 'versionId', 'versioning', 'versions',
      'website',
      // Response overrides
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

    // Sort query parameters
    queryParams.sort((a, b) => a[0].localeCompare(b[0]));

    if (queryParams.length > 0) {
      const queryString = queryParams
        .map(([key, value]) => value ? `${key}=${value}` : key)
        .join('&');
      resource += '?' + queryString;
    }

    return resource;
  }

  /**
   * Generate presigned URL
   */
  public async generatePresignedUrl(
    url: string,
    config: AWSAuthConfig,
    expiresIn: number = 3600
  ): Promise<AWSPresignedUrl> {
    try {
      // Validate expiration
      if (expiresIn < 1 || expiresIn > 604800) { // 1 second to 7 days
        throw new AWSSignatureError(
          'Presigned URL expiration must be between 1 and 604800 seconds',
          'InvalidExpirationTime'
        );
      }

      // Get credentials
      const credentials = await this.getCredentials(config);

      // Parse URL
      const urlObj = new URL(url);
      const service = config.service || this.extractServiceFromUrl(urlObj);
      const region = config.region || this.extractRegionFromUrl(urlObj);

      // Create context
      const context: AWSRequestContext = {
        credentials,
        service,
        region,
        signatureVersion: config.signatureVersion || 'v4',
        timestamp: new Date(),
        requestId: this.generateRequestId()
      };

      // Generate based on signature version
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

  /**
   * Generate presigned URL V4
   */
  private async generatePresignedUrlV4(
    url: URL,
    context: AWSRequestContext,
    expiresIn: number,
    httpMethod: string = 'GET'
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const timestamp = context.timestamp;
    const dateStamp = this.getDateStamp(timestamp);
    const amzDate = this.getAmzDate(timestamp);

    // Build query parameters
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

    // Sort query parameters
    const sortedParams = new URLSearchParams(Array.from(queryParams.entries()).sort());

    // Create canonical request
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

    // Create string to sign
    const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = this.createStringToSign(amzDate, credentialScope, canonicalRequestHash);

    // Calculate signature
    const signingKey = await this.getSigningKey(
      context.credentials.secretAccessKey,
      dateStamp,
      context.region,
      context.service
    );
    const signature = this.calculateSignature(signingKey, stringToSign);

    // Add signature to query parameters
    sortedParams.set(this.config.signatureQueryParam, signature);

    // Build final URL
    url.search = sortedParams.toString();

    return {
      url: url.toString(),
      headers: {
        'Host': url.host
      }
    };
  }

  /**
   * Generate presigned URL V2
   */
  private async generatePresignedUrlV2(
    url: URL,
    context: AWSRequestContext,
    expiresIn: number
  ): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    // Build query parameters
    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.set('AWSAccessKeyId', context.credentials.accessKeyId);
    queryParams.set('Expires', expires.toString());
    queryParams.set('SignatureVersion', '2');
    queryParams.set('SignatureMethod', 'HmacSHA256');

    if (context.credentials.sessionToken) {
      queryParams.set('SecurityToken', context.credentials.sessionToken);
    }

    // Sort parameters
    const sortedParams = new URLSearchParams(Array.from(queryParams.entries()).sort());

    // Create string to sign
    const stringToSign = [
      'GET',
      url.hostname.toLowerCase(),
      url.pathname || '/',
      sortedParams.toString()
    ].join('\n');

    // Calculate signature
    const signature = createHmac('sha256', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    // Add signature
    sortedParams.set('Signature', signature);

    // Build final URL
    url.search = sortedParams.toString();
    return url.toString();
  }

  /**
   * Generate presigned URL for S3
   */
  private async generatePresignedUrlS3(
    url: URL,
    context: AWSRequestContext,
    expiresIn: number
  ): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    // Build string to sign
    const resource = this.getS3CanonicalResource(url);
    const stringToSign = [
      'GET',
      '', // Content-MD5
      '', // Content-Type
      expires.toString(),
      resource
    ].join('\n');

    // Calculate signature
    const signature = createHmac('sha1', context.credentials.secretAccessKey)
      .update(stringToSign)
      .digest('base64');

    // Add query parameters
    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.set('AWSAccessKeyId', context.credentials.accessKeyId);
    queryParams.set('Expires', expires.toString());
    queryParams.set('Signature', signature);

    if (context.credentials.sessionToken) {
      queryParams.set('x-amz-security-token', context.credentials.sessionToken);
    }

    // Build final URL
    url.search = queryParams.toString();
    return url.toString();
  }

  /**
   * Get credentials
   */
  private async getCredentials(config: AWSAuthConfig): Promise<AWSCredentials> {
    // Check if credentials are directly provided
    if (config.accessKeyId && config.secretAccessKey) {
      return {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
        expiration: config.expiration
      };
    }

    // Check cache
    const cacheKey = this.getCredentialCacheKey(config);
    const cached = this.credentialCache.get(cacheKey);

    if (cached && cached.credentials) {
      // Check if credentials are still valid
      if (!cached.expiration || cached.expiration > new Date()) {
        this.metrics.cacheHits++;
        return cached.credentials;
      }
    }

    this.metrics.cacheMisses++;

    // Use credential chain
    const credentials = await this.resolveCredentials(config);

    // Cache credentials
    this.credentialCache.set(cacheKey, {
      credentials,
      cachedAt: new Date(),
      expiration: credentials.expiration || new Date(Date.now() + this.config.credentialCacheTTL)
    });

    return credentials;
  }

  /**
   * Resolve credentials using credential chain
   */
  private async resolveCredentials(config: AWSAuthConfig): Promise<AWSCredentials> {
    const errors: Error[] = [];

    // Try each provider in order
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

    // All providers failed
    throw new AWSCredentialError(
      'Unable to load credentials from any providers',
      'CredentialProviderChainFailed',
      errors
    );
  }

  /**
   * Initialize credential providers
   */
  private initializeCredentialProviders(): void {
    // 1. Environment variables
    this.credentialProviders.push({
      name: 'EnvironmentCredentials',
      getCredentials: async () => this.getEnvironmentCredentials()
    });

    // 2. Shared credentials file
    this.credentialProviders.push({
      name: 'SharedCredentials',
      getCredentials: async (config: AWSAuthConfig) => this.getSharedCredentials(config)
    });

    // 3. Assume role
    this.credentialProviders.push({
      name: 'AssumeRoleCredentials',
      getCredentials: async (config: AWSAuthConfig) => this.getAssumeRoleCredentials(config)
    });

    // 4. ECS container credentials
    if (this.config.ecsCredentialsRelativeUri || this.config.ecsCredentialsFullUri) {
      this.credentialProviders.push({
        name: 'ContainerCredentials',
        getCredentials: async () => this.getContainerCredentials()
      });
    }

    // 5. EC2 instance metadata
    this.credentialProviders.push({
      name: 'InstanceMetadataCredentials',
      getCredentials: async () => this.getInstanceMetadataCredentials()
    });

    // 6. Process credentials
    this.credentialProviders.push({
      name: 'ProcessCredentials',
      getCredentials: async (config: AWSAuthConfig) => this.getProcessCredentials(config)
    });
  }

  /**
   * Get environment credentials
   */
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

  /**
   * Get shared credentials
   */
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

      // Check for role assumption
      if (profileCreds.role_arn) {
        return await this.assumeRoleFromProfile(profileCreds, profile);
      }

      // Check for credential process
      if (profileCreds.credential_process) {
        return await this.getProcessCredentialsFromProfile(profileCreds);
      }

      // Check for web identity
      if (profileCreds.web_identity_token_file && profileCreds.role_arn) {
        return await this.getWebIdentityCredentials(profileCreds);
      }

      // Standard credentials
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

  /**
   * Get web identity credentials
   */
  private async getWebIdentityCredentials(profileCreds: any): Promise<AWSCredentials> {
    const tokenFile = profileCreds.web_identity_token_file;
    const roleArn = profileCreds.role_arn;
    const sessionName = profileCreds.role_session_name || `cs-automation-${Date.now()}`;

    // Read web identity token
    const webIdentityTokenRaw = await FileUtils.readFile(tokenFile, 'utf8');
    const webIdentityToken = typeof webIdentityTokenRaw === 'string'
      ? webIdentityTokenRaw
      : webIdentityTokenRaw.toString();

    // Assume role with web identity
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

  /**
   * Get process credentials from profile
   */
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

  /**
   * Assume role from profile
   */
  private async assumeRoleFromProfile(profileCreds: any, currentProfile: string): Promise<AWSCredentials> {
    const roleArn = profileCreds.role_arn;
    const sourceProfile = profileCreds.source_profile || 'default';
    const externalId = profileCreds.external_id;
    const mfaSerial = profileCreds.mfa_serial;
    const duration = profileCreds.duration_seconds ? parseInt(profileCreds.duration_seconds) : this.config.assumeRoleDuration;

    // Prevent infinite recursion
    if (sourceProfile === currentProfile) {
      throw new AWSCredentialError(
        `Circular reference in profile: ${currentProfile}`,
        'CircularProfileReference'
      );
    }

    // Get source credentials
    const sourceCredentials = await this.getSharedCredentials({ profile: sourceProfile });
    if (!sourceCredentials) {
      throw new AWSCredentialError(
        `Unable to load source credentials for profile: ${sourceProfile}`,
        'SourceCredentialsNotFound'
      );
    }

    // Assume role
    return await this.assumeRole({
      roleArn,
      credentials: sourceCredentials,
      externalId: externalId || undefined,
      mfaSerial: mfaSerial || undefined,
      duration,
      sessionName: profileCreds.role_session_name || undefined
    });
  }

  /**
   * Get assume role credentials
   */
  private async getAssumeRoleCredentials(config: AWSAuthConfig): Promise<AWSCredentials | null> {
    if (!config.roleArn) {
      return null;
    }

    // Need base credentials to assume role
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

  /**
   * Assume IAM role
   */
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

  /**
   * Get container credentials
   */
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
      // ECS credentials endpoint
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

  /**
   * Get instance metadata credentials
   */
  private async getInstanceMetadataCredentials(): Promise<AWSCredentials | null> {
    const metadataUrl = 'http://169.254.169.254';
    const apiVersion = 'latest';

    try {
      // Get token for IMDSv2
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
          // Fall back to IMDSv1 if v2 fails
          this.logger.debug('IMDSv2 token request failed, falling back to IMDSv1');
        }
      }

      // Get instance role
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

      // Get credentials for role
      const credsResponse = await this.makeHttpRequest(
        `${metadataUrl}/${apiVersion}/meta-data/iam/security-credentials/${role}`,
        {
          headers,
          timeout: this.config.imdsTimeout
        }
      );

      const creds = JSON.parse(credsResponse);

      // Validate credential response
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
      // Not running on EC2 or no instance profile
      this.logger.debug('Failed to get instance metadata credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get process credentials
   */
  private async getProcessCredentials(config: AWSAuthConfig): Promise<AWSCredentials | null> {
    // Check for credential_process in config
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

      // Execute credential process
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

  /**
   * Make HTTP request with retry logic
   */
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

        // Don't retry on certain errors
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

        // Wait before retry
        if (attempt < this.config.maxRetries - 1) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('HTTP request failed');
  }

  /**
   * Make single HTTP request attempt
   */
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

  /**
   * Parse XML response
   */
  private async parseXMLResponse(xml: string): Promise<any> {
    try {
      return xmlParser.parse(xml);
    } catch (error) {
      throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Prompt for MFA token
   */
  private async promptMFAToken(): Promise<string> {
    // Check environment variable first
    const mfaToken = process.env['AWS_MFA_TOKEN'];
    if (mfaToken) {
      return mfaToken;
    }

    // Check if running in TTY for interactive prompt
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

  /**
   * Initialize service endpoints
   */
  private initializeServiceEndpoints(): void {
    // AWS partition endpoints
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

    // Common AWS services
    const services = [
      // Compute
      { name: 'ec2', global: false },
      { name: 'lambda', global: false },
      { name: 'batch', global: false },
      { name: 'ecs', global: false },
      { name: 'eks', global: false },
      { name: 'fargate', global: false },

      // Storage
      { name: 's3', global: false, dualStack: true },
      { name: 'ebs', global: false },
      { name: 'efs', global: false },
      { name: 'fsx', global: false },
      { name: 'backup', global: false },

      // Database
      { name: 'dynamodb', global: false },
      { name: 'rds', global: false },
      { name: 'elasticache', global: false },
      { name: 'redshift', global: false },
      { name: 'neptune', global: false },
      { name: 'documentdb', global: false },

      // Networking
      { name: 'vpc', global: false },
      { name: 'cloudfront', global: true },
      { name: 'route53', global: true },
      { name: 'apigateway', global: false },
      { name: 'elasticloadbalancing', global: false },

      // Security
      { name: 'iam', global: true },
      { name: 'sts', global: false },
      { name: 'kms', global: false },
      { name: 'secretsmanager', global: false },
      { name: 'acm', global: false },
      { name: 'waf', global: true },

      // Analytics
      { name: 'kinesis', global: false },
      { name: 'firehose', global: false },
      { name: 'elasticsearch', global: false },
      { name: 'emr', global: false },
      { name: 'athena', global: false },

      // Application Integration
      { name: 'sqs', global: false },
      { name: 'sns', global: false },
      { name: 'ses', global: false },
      { name: 'eventbridge', global: false },
      { name: 'stepfunctions', global: false },

      // Developer Tools
      { name: 'codecommit', global: false },
      { name: 'codebuild', global: false },
      { name: 'codedeploy', global: false },
      { name: 'codepipeline', global: false },

      // Management & Governance
      { name: 'cloudformation', global: false },
      { name: 'cloudwatch', global: false },
      { name: 'cloudtrail', global: false },
      { name: 'config', global: false },
      { name: 'ssm', global: false },
      { name: 'organizations', global: true },

      // Machine Learning
      { name: 'sagemaker', global: false },
      { name: 'comprehend', global: false },
      { name: 'rekognition', global: false },
      { name: 'polly', global: false },
      { name: 'transcribe', global: false },
      { name: 'translate', global: false }
    ];

    // Build endpoint map
    for (const partition of partitions) {
      for (const service of services) {
        if (service.global) {
          // Global services
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
          // Regional services
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

            // Add dual-stack endpoint for S3
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

    // Add FIPS endpoints
    this.addFIPSEndpoints();

    // Add VPC endpoints
    this.addVPCEndpoints();
  }

  /**
   * Get service signature version
   */
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

  /**
   * Build service endpoint
   */
  private buildServiceEndpoint(
    service: string,
    region: string,
    dnsSuffix: string,
    dualStack: boolean = false
  ): string {
    // Special cases
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

    // Standard format
    return `${service}.${region}.${dnsSuffix}`;
  }

  /**
   * Build global service endpoint
   */
  private buildGlobalServiceEndpoint(service: string, partition: any): string {
    const dnsSuffix = partition.dnsSuffix;

    // Special cases for global services
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

  /**
   * Add FIPS endpoints
   */
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

  /**
   * Add VPC endpoints
   */
  private addVPCEndpoints(): void {
    // VPC endpoint patterns
    const vpcEndpointPatterns = [
      /^vpce-[0-9a-f]{17}\..*\.vpce\.amazonaws\.com$/,
      /^vpce-[0-9a-f]{17}\..*\.vpce\.amazonaws\.com\.cn$/
    ];

    // Store patterns for runtime matching
    this.regionalEndpoints.set('vpc-endpoint-patterns', {
      patterns: vpcEndpointPatterns,
      signatureVersion: 'v4'
    } as any);
  }

  /**
   * Extract service from URL
   */
  private extractServiceFromUrl(url: URL): string {
    const hostname = url.hostname.toLowerCase();

    // Check for VPC endpoints
    if (hostname.includes('.vpce.')) {
      // Extract service from VPC endpoint
      const parts = hostname.split('.');
      if (parts.length >= 2 && parts[1]) {  // Add check for parts[1]
        return parts[1];
      }
    }

    // Check for S3
    if (this.config.s3EndpointPattern.test(hostname)) {
      return 's3';
    }

    // Check for virtual-hosted bucket
    if (this.config.s3VirtualHostedBucketPattern.test(hostname)) {
      return 's3';
    }

    // Standard service extraction
    const parts = hostname.split('.');

    if (parts.length >= 3) {
      // Handle FIPS endpoints
      if (parts[0] && parts[0].endsWith('-fips')) {  // Add check for parts[0]
        return parts[0].replace('-fips', '');
      }

      // Handle dualstack endpoints
      if (parts[0] === 's3' && parts[1] === 'dualstack') {
        return 's3';
      }

      if (parts[0]) {  // Add check for parts[0]
        return parts[0];
      }
    }

    // Default to execute-api for API Gateway
    return 'execute-api';
  }

  /**
   * Extract region from URL
   */
  private extractRegionFromUrl(url: URL): string {
    const hostname = url.hostname.toLowerCase();

    // Check for global services
    const globalServices = ['iam', 'route53', 'cloudfront', 'waf'];
    const serviceName = this.extractServiceFromUrl(url);
    if (globalServices.includes(serviceName)) {
      return 'us-east-1';
    }

    // Extract from S3 virtual-hosted bucket
    const s3Match = hostname.match(/\.s3[.-]([a-z0-9-]+)\.amazonaws/);
    if (s3Match && s3Match[1]) {  // Add check for s3Match[1]
      return s3Match[1];
    }

    // Standard region extraction
    const parts = hostname.split('.');

    // Look for region pattern
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part && this.isValidRegion(part)) {  // Use the assigned variable instead
        return part;
      }
    }

    // Check for specific patterns
    const regionMatch = hostname.match(/\.([a-z]{2}-[a-z]+-\d+)\./);
    if (regionMatch && regionMatch[1]) {  // Add check for regionMatch[1]
      return regionMatch[1];
    }

    // China regions
    if (hostname.includes('.cn-')) {
      const cnMatch = hostname.match(/\.(cn-[a-z]+-\d+)\./);
      if (cnMatch && cnMatch[1]) {  // Add check for cnMatch[1]
        return cnMatch[1];
      }
    }

    // Default to us-east-1 if no region found
    return 'us-east-1';
  }

  /**
   * Check if string is valid AWS region
   */
  private isValidRegion(str: string): boolean {
    const regionPattern = /^(us|eu|ap|sa|ca|me|af|cn)-(east|west|north|south|central|northeast|southeast|northwest|southwest)-\d+$/;
    return regionPattern.test(str) || ['us-gov-east-1', 'us-gov-west-1'].includes(str);
  }

  /**
   * Get date stamp
   */
  private getDateStamp(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Get AMZ date
   */
  private getAmzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  /**
   * Get credential scope
   */
  private getCredentialScope(dateStamp: string, region: string, service: string): string {
    return `${dateStamp}/${region}/${service}/${this.config.credentialScope}`;
  }

  /**
   * Get credential cache key
   */
  private getCredentialCacheKey(config: AWSAuthConfig): string {
    const parts = [
      config.profile || this.config.profile,
      config.roleArn || 'default',
      config.accessKeyId || 'env'
    ];

    return createHash('sha256').update(parts.join(':')).digest('hex');
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `aws-${timestamp}-${random}`;
  }

  /**
   * Update metrics
   */
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

    // Update average time
    const totalTime = this.metrics.averageSigningTime * (this.metrics.totalSigningRequests - 1) + duration;
    this.metrics.averageSigningTime = totalTime / this.metrics.totalSigningRequests;

    // Update service usage
    const serviceCount = this.metrics.signingsByService.get(service) || 0;
    this.metrics.signingsByService.set(service, serviceCount + 1);

    // Update region usage
    const regionCount = this.metrics.signingsByRegion.get(region) || 0;
    this.metrics.signingsByRegion.set(region, regionCount + 1);
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean up expired entries every hour
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 3600000);

    // Reset metrics daily
    setInterval(() => {
      this.resetMetrics();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = new Date();
    let cleanedCredentials = 0;
    let cleanedKeys = 0;

    // Clean expired credentials
    for (const [key, cache] of this.credentialCache.entries()) {
      if (cache.expiration && cache.expiration < now) {
        this.credentialCache.delete(key);
        cleanedCredentials++;
      }
    }

    // Clean old signing keys
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

  /**
   * Reset metrics
   */
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

  /**
   * Get metrics
   */
  public getMetrics(): AWSSignatureMetrics {
    return {
      ...this.metrics,
      signingsByService: new Map(this.metrics.signingsByService),
      signingsByRegion: new Map(this.metrics.signingsByRegion),
      errors: [...this.metrics.errors]
    };
  }

  /**
   * Clear all caches
   */
  public clearCaches(): void {
    this.credentialCache.clear();
    this.signingKeyCache.clear();
    this.logger.info('All AWS caches cleared');
  }

  /**
   * Refresh credentials
   */
  public async refreshCredentials(config: AWSAuthConfig): Promise<AWSCredentials> {
    // Clear cache
    const cacheKey = this.getCredentialCacheKey(config);
    this.credentialCache.delete(cacheKey);

    // Re-resolve credentials
    const credentials = await this.getCredentials(config);

    this.metrics.credentialRefreshes++;

    return credentials;
  }

  /**
   * Validate configuration
   */
  public async validateConfig(config: AWSAuthConfig): Promise<boolean> {
    try {
      // Basic validation
      if (!config.region) {
        config.region = this.config.defaultRegion;
      }

      // Try to get credentials
      const credentials = await this.getCredentials(config);

      return !!(credentials.accessKeyId && credentials.secretAccessKey);

    } catch (error) {
      this.logger.error('AWS config validation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Test AWS configuration
   */
  public async testConfiguration(config: AWSAuthConfig): Promise<{
    success: boolean;
    error?: string | undefined;
    details?: any;
  }> {
    try {
      // Validate config
      const isValid = await this.validateConfig(config);
      if (!isValid) {
        throw new Error('Invalid configuration');
      }

      // Try to sign a simple request
      const testRequest: RequestOptions = {
        url: `https://sts.${config.region || this.config.defaultRegion}.amazonaws.com/`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'Action=GetCallerIdentity&Version=2011-06-15'
      };

      const signedRequest = await this.signRequest(testRequest, config);

      // Actually make the request to verify credentials
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
        // Request failed but signing succeeded
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

  /**
   * Sign streaming request (for S3 uploads)
   */
  public async signStreamingRequest(
    request: RequestOptions,
    config: AWSAuthConfig,
    _chunkSize: number = 65536
  ): Promise<{
    signedRequest: AWSSignedRequest;
    chunkSigner: (chunk: Buffer) => string;
  }> {
    // Sign initial request with streaming body
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

    // Chunk signer function
    const chunkSigner = (chunk: Buffer): string => {
      const chunkHash = createHash('sha256').update(chunk).digest('hex');

      const stringToSign = [
        this.config.streamingSignedBodyValue,
        this.getAmzDate(new Date()),
        this.getCredentialScope(dateStamp, context.region, context.service),
        previousSignature,
        createHash('sha256').update('').digest('hex'), // empty string hash
        chunkHash
      ].join('\n');

      const signature = this.calculateSignature(signingKey, stringToSign);
      previousSignature = signature;

      // Return formatted chunk
      return `${chunk.length.toString(16)};chunk-signature=${signature}\r\n${chunk.toString()}\r\n`;
    };

    return {
      signedRequest,
      chunkSigner
    };
  }
}

/**
 * AWS STS Client Implementation
 */
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

  /**
   * Assume role
   */
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

  /**
   * Get caller identity
   */
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

  /**
   * Get session token
   */
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

  /**
   * Make HTTP request
   */
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
            // Parse error response
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

  /**
   * Parse XML response
   */
  private async parseXMLResponse(xml: string): Promise<any> {
    const parser = new SimpleXMLParser();
    try {
      return parser.parse(xml);
    } catch (error) {
      throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse assume role response
   */
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

  /**
 * Parse error response
 */
  private async parseErrorResponse(xml: string): Promise<Error> {  // Change Promise<e> to Promise<Error>
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
      // Failed to parse as XML, return generic error
    }

    return new Error(`STS request failed: ${xml}`);
  }
}

/**
 * AWS Signature Error
 */
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

/**
 * AWS Credential Error
 */
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