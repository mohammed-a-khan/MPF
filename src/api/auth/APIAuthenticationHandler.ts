
import { createHmac, createHash, randomBytes, createSign } from 'crypto';
import { URL } from 'url';
import { performance } from 'perf_hooks';

import {
  AuthenticationType,
  BasicAuthConfig,
  BearerAuthConfig,
  APIKeyAuthConfig,
  OAuth2Config,
  CertificateAuthConfig,
  NTLMAuthConfig,
  AWSAuthConfig,
  DigestAuthConfig,
  CustomAuthConfig,
  AuthenticationProvider,
  SecurityPolicy,
  AuthenticationMetrics as ImportedAuthenticationMetrics,
  AuthenticationAuditLog,
  AuthenticationEvent as ImportedAuthenticationEvent,
  CredentialStore as ImportedCredentialStore,
} from './auth.types';

import { CertificateManager } from './CertificateManager';
import { OAuth2Handler } from './OAuth2Handler';
import { AWSSignatureHandler } from './AWSSignatureHandler';
import { Logger } from '../../core/utils/Logger';
import { CryptoUtils } from '../../core/utils/CryptoUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { RequestOptions } from '../types/api.types';

export enum AuthType {
  BASIC = 'basic',
  BEARER = 'bearer',
  API_KEY = 'apikey',
  OAUTH2 = 'oauth2',
  CERTIFICATE = 'certificate',
  NTLM = 'ntlm',
  AWS = 'aws',
  DIGEST = 'digest',
  HAWK = 'hawk',
  JWT = 'jwt',
  CUSTOM = 'custom'
}

export interface AuthConfig {
  type: AuthType;

  enabled?: boolean;
}

export interface ExtendedBasicAuthConfig extends BasicAuthConfig {
  realm?: string;
  type?: AuthType;
}

export interface ExtendedBearerAuthConfig extends BearerAuthConfig {
  expiresAt?: Date;
  refreshToken?: string;
  refreshUrl?: string;
  scope?: string;
  type?: AuthType;
}

export interface ExtendedAPIKeyAuthConfig extends APIKeyAuthConfig {
  apiKey: string;
  keyName?: string;
  type?: AuthType;
}

export interface ExtendedDigestAuthConfig extends DigestAuthConfig {
  challenge?: string;
  type?: AuthType;
}

export interface HawkAuthConfig {
  keyId: string;
  key: string;
  algorithm?: string;
  ext?: string;
  app?: string;
  dlg?: string;
  includePayloadHash?: boolean;
  type?: AuthType;
}

export interface JWTAuthConfig {
  token?: string;
  privateKey?: string;
  claims?: any;
  algorithm?: string;
  keyId?: string;
  expiresIn?: number;
  headerName?: string;
  scheme?: string;
  type?: AuthType;
}

export interface ExtendedCustomAuthConfig extends CustomAuthConfig {
  name?: string;
  parameters?: Record<string, any>;
  refreshHandler?: (params: any) => Promise<TokenRefreshResult>;
  challengeHandler?: (challenge: any, params: any) => Promise<any>;
  type?: AuthType;
}

export interface AuthenticationResult {
  success: boolean;
  type: AuthType;
  headers: Record<string, string>;
  expiresAt?: Date | null;
  metadata?: any;
  agent?: any;
  cached?: boolean;
  requiresChallenge?: boolean;
  sessionId?: string;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  scope?: string | undefined;
}

export interface TokenCache {
  token: string;
  expiresAt?: Date | undefined;
  refreshToken?: string | null | undefined;
  scope?: string | undefined;
}

export class AuthenticationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'AuthenticationError';
  }
}

export interface AuthValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface AuthenticationOptions {
  correlationId: string;
  sessionId?: string;
  retryCount: number;
  maxRetries: number;
}

export interface RequestContext {
  correlationId?: string;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  requestUrl?: string;
}

export interface AuthenticationStrategy {
  authenticate: (request: RequestOptions, authConfig: AuthConfig, options: AuthenticationOptions) => Promise<AuthenticationResult>;
  validate: (config: any) => Promise<boolean>;
  refresh: ((config: any) => Promise<TokenRefreshResult>) | null;
}

export interface ChallengeResponse {
  type: string;
  headers: Record<string, string>;
  sessionId?: string;
  metadata?: any;
}

export interface NonceCache {
  nonce: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthenticationEvent extends ImportedAuthenticationEvent {
  success?: boolean;
  duration?: number;
  error?: string;
  correlationId?: string;
  context?: RequestContext;
  authType?: AuthenticationType;
}

export interface AuthenticationState {
  authenticated: boolean;
  expiresAt?: Date;
  metadata?: any;
}

export interface ExtendedCredentialStore extends ImportedCredentialStore {
  type: AuthType;
  credentials: any;
  expiresAt: Date | null;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
  scope?: string | undefined;
  sessionToken?: string | undefined;
}

export interface AuthenticationSession {
  id: string;
  type: AuthType;
  state: string;
  startTime: Date;
  metadata: any;
}

export interface ExtendedSecurityPolicy extends SecurityPolicy {
  id: string;
  name: string;
  enabled: boolean;
  config: any;
}

export interface AuthenticationAudit extends AuthenticationAuditLog {
  id: string;
  type: AuthType;
  success: boolean;
  correlationId?: string | undefined;
  metadata?: any;
}

export interface RateLimitInfo {
  requests: number;
  windowStart: number;
  windowEnd: number;
}

export interface AuthenticationChallenge {
  type: string;
  headers: Record<string, string>;
  request: RequestOptions;
}

export interface ExtendedAuthenticationMetrics extends ImportedAuthenticationMetrics {
  totalAuthentications: number;
  cacheHits: number;
  cacheMisses: number;
  authenticationsByType: Map<AuthType, number>;
  errors: any[];
  lastReset: Date;
}

export interface ExtendedAuthenticationProvider extends AuthenticationProvider {
  id: string;
  name: string;
  enabled: boolean;
  lastUsed?: Date;
}

enum NTLMMessageType {
  TYPE1 = 1,
  TYPE2 = 2,
  TYPE3 = 3
}

enum NTLMFlags {
  NEGOTIATE_UNICODE = 0x00000001,
  NEGOTIATE_OEM = 0x00000002,
  REQUEST_TARGET = 0x00000004,
  NEGOTIATE_SIGN = 0x00000010,
  NEGOTIATE_SEAL = 0x00000020,
  NEGOTIATE_DATAGRAM = 0x00000040,
  NEGOTIATE_LM_KEY = 0x00000080,
  NEGOTIATE_NTLM = 0x00000200,
  NEGOTIATE_DOMAIN_SUPPLIED = 0x00001000,
  NEGOTIATE_WORKSTATION_SUPPLIED = 0x00002000,
  NEGOTIATE_ALWAYS_SIGN = 0x00008000,
  TARGET_TYPE_DOMAIN = 0x00010000,
  TARGET_TYPE_SERVER = 0x00020000,
  NEGOTIATE_EXTENDED_SECURITY = 0x00080000,
  NEGOTIATE_IDENTIFY = 0x00100000,
  REQUEST_NON_NT_SESSION = 0x00400000,
  NEGOTIATE_TARGET_INFO = 0x00800000,
  NEGOTIATE_VERSION = 0x02000000,
  NEGOTIATE_128 = 0x20000000,
  NEGOTIATE_KEY_EXCHANGE = 0x40000000,
  NEGOTIATE_56 = 0x80000000
}

export class APIAuthenticationHandler {
  private static instance: APIAuthenticationHandler;
  private readonly logger: Logger;
  private readonly actionLogger: ActionLogger;
  private readonly certificateManager: CertificateManager;
  private readonly oauth2Handler: OAuth2Handler;
  private readonly awsHandler: AWSSignatureHandler;

  private readonly tokenCache: Map<string, TokenCache> = new Map();
  private readonly nonceCache: Map<string, NonceCache> = new Map();
  private readonly sessionCache: Map<string, AuthenticationSession> = new Map();
  private readonly credentialStore: Map<string, ExtendedCredentialStore> = new Map();

  private readonly activeProviders: Map<string, ExtendedAuthenticationProvider> = new Map();
  private readonly rateLimiters: Map<string, RateLimitInfo> = new Map();

  private readonly metrics: ExtendedAuthenticationMetrics = {
    totalRequests: 0,
    successfulAuthentications: 0,
    failedAuthentications: 0,
    tokenRefreshes: 0,
    averageAuthTime: 0,
    authMethodBreakdown: {
      'none': 0,
      'basic': 0,
      'bearer': 0,
      'apikey': 0,
      'oauth2': 0,
      'certificate': 0,
      'ntlm': 0,
      'digest': 0,
      'aws': 0,
      'azure': 0,
      'custom': 0
    },
    errorBreakdown: {},
    totalAuthentications: 0,
    cacheHits: 0,
    cacheMisses: 0,
    authenticationsByType: new Map(),
    errors: [],
    lastReset: new Date()
  };

  private readonly securityPolicies: Map<string, ExtendedSecurityPolicy> = new Map();
  private readonly auditLog: AuthenticationAudit[] = [];

  private readonly config = {
    tokenCacheTTL: 3600000,
    nonceCacheTTL: 300000,
    maxRetries: 3,
    retryDelay: 1000,
    tokenRefreshBuffer: 300000,
    enableAudit: true,
    enableMetrics: true,
    maxConcurrentAuth: 10,
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    },
    secureCredentialStorage: true,
    validateCertificates: true,
    enforceHttps: true,
    allowSelfSignedCerts: false
  };

  private constructor() {
    this.logger = Logger.getInstance();
    this.actionLogger = ActionLogger.getInstance();
    this.certificateManager = CertificateManager.getInstance();
    this.oauth2Handler = OAuth2Handler.getInstance();
    this.awsHandler = AWSSignatureHandler.getInstance();

    this.initializeProviders();
    this.startCleanupTimer();
    this.loadSecurityPolicies();
  }

  public static getInstance(): APIAuthenticationHandler {
    if (!APIAuthenticationHandler.instance) {
      APIAuthenticationHandler.instance = new APIAuthenticationHandler();
    }
    return APIAuthenticationHandler.instance;
  }

  public async applyAuthentication(
    request: RequestOptions,
    authConfig: AuthConfig,
    context?: RequestContext
  ): Promise<AuthenticationResult> {
    const startTime = performance.now();
    const correlationId = context?.correlationId || this.generateCorrelationId();

    try {
      this.actionLogger.logAction('api_authentication', {
        type: authConfig.type,
        url: request.url,
        correlationId,
        timestamp: new Date()
      });

      const validationResult = await this.validateAuthConfig(authConfig);
      if (!validationResult.isValid) {
        throw new AuthenticationError(
          `Invalid authentication configuration: ${validationResult.errors.join(', ')}`,
          'INVALID_CONFIG'
        );
      }

      await this.checkRateLimit(authConfig.type);

      await this.enforceSecurityPolicies(authConfig, request);

      const strategy = this.getAuthenticationStrategy(authConfig.type);
      if (!strategy) {
        throw new AuthenticationError(
          `Unsupported authentication type: ${authConfig.type}`,
          'UNSUPPORTED_AUTH_TYPE'
        );
      }

      const result = await strategy.authenticate(request, authConfig, {
        correlationId,
        ...(context?.sessionId && { sessionId: context.sessionId }),
        retryCount: 0,
        maxRetries: this.config.maxRetries
      });

      this.updateMetrics(authConfig.type, true, performance.now() - startTime);

      if (this.config.enableAudit) {
        this.auditAuthentication({
          type: 'auth.completed' as any,
          timestamp: new Date(),
          data: {},
          success: true,
          duration: performance.now() - startTime,
          correlationId,
          context,
          authType: this.convertToAuthenticationType(authConfig.type)
        } as AuthenticationEvent);
      }

      return result;

    } catch (error) {
      this.updateMetrics(authConfig.type, false, performance.now() - startTime);

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Authentication failed', {
        error: errorMessage,
        type: authConfig.type,
        correlationId
      });

      if (this.config.enableAudit) {
        this.auditAuthentication({
          type: 'auth.failed' as any,
          timestamp: new Date(),
          data: {},
          success: false,
          error: errorMessage,
          duration: performance.now() - startTime,
          correlationId,
          context,
          authType: this.convertToAuthenticationType(authConfig.type)
        } as AuthenticationEvent);
      }

      throw error;
    }
  }

  private convertToAuthenticationType(authType: AuthType): AuthenticationType {
    const mapping: Record<AuthType, AuthenticationType> = {
      [AuthType.BASIC]: 'basic' as AuthenticationType,
      [AuthType.BEARER]: 'bearer' as AuthenticationType,
      [AuthType.API_KEY]: 'apikey' as AuthenticationType,
      [AuthType.OAUTH2]: 'oauth2' as AuthenticationType,
      [AuthType.CERTIFICATE]: 'certificate' as AuthenticationType,
      [AuthType.NTLM]: 'ntlm' as AuthenticationType,
      [AuthType.AWS]: 'aws' as AuthenticationType,
      [AuthType.DIGEST]: 'digest' as AuthenticationType,
      [AuthType.HAWK]: 'custom' as AuthenticationType,
      [AuthType.JWT]: 'custom' as AuthenticationType,
      [AuthType.CUSTOM]: 'custom' as AuthenticationType
    };
    return mapping[authType] || 'none';
  }

  private getAuthenticationStrategy(type: AuthType): AuthenticationStrategy | null {
    const strategies: Record<AuthType, AuthenticationStrategy> = {
      [AuthType.BASIC]: {
        authenticate: this.applyBasicAuth.bind(this),
        validate: this.validateBasicAuth.bind(this),
        refresh: null
      },
      [AuthType.BEARER]: {
        authenticate: this.applyBearerAuth.bind(this),
        validate: this.validateBearerAuth.bind(this),
        refresh: this.refreshBearerToken.bind(this)
      },
      [AuthType.API_KEY]: {
        authenticate: this.applyAPIKeyAuth.bind(this),
        validate: this.validateAPIKey.bind(this),
        refresh: null
      },
      [AuthType.OAUTH2]: {
        authenticate: this.applyOAuth2Auth.bind(this),
        validate: this.validateOAuth2.bind(this),
        refresh: this.refreshOAuth2Token.bind(this)
      },
      [AuthType.CERTIFICATE]: {
        authenticate: this.applyCertificateAuth.bind(this),
        validate: this.validateCertificate.bind(this),
        refresh: null
      },
      [AuthType.NTLM]: {
        authenticate: this.applyNTLMAuth.bind(this),
        validate: this.validateNTLM.bind(this),
        refresh: null
      },
      [AuthType.AWS]: {
        authenticate: this.applyAWSAuth.bind(this),
        validate: this.validateAWS.bind(this),
        refresh: this.refreshAWSCredentials.bind(this)
      },
      [AuthType.DIGEST]: {
        authenticate: this.applyDigestAuth.bind(this),
        validate: this.validateDigest.bind(this),
        refresh: null
      },
      [AuthType.HAWK]: {
        authenticate: this.applyHawkAuth.bind(this),
        validate: this.validateHawk.bind(this),
        refresh: null
      },
      [AuthType.JWT]: {
        authenticate: this.applyJWTAuth.bind(this),
        validate: this.validateJWT.bind(this),
        refresh: this.refreshJWT.bind(this)
      },
      [AuthType.CUSTOM]: {
        authenticate: this.applyCustomAuth.bind(this),
        validate: this.validateCustom.bind(this),
        refresh: this.refreshCustom.bind(this)
      }
    };

    return strategies[type] || null;
  }

  private async applyBasicAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as ExtendedBasicAuthConfig;

    if (!config.username || !config.password) {
      throw new AuthenticationError('Username and password are required for Basic auth', 'MISSING_CREDENTIALS');
    }

    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = `Basic ${credentials}`;

    if (this.config.secureCredentialStorage) {
      await this.storeCredentials(options.correlationId, {
        type: AuthType.BASIC,
        credentials: { username: config.username, password: config.password },
        expiresAt: null,
        save: async () => { },
        get: async () => null,
        delete: async () => { },
        list: async () => [],
        encrypt: async (data: string) => data,
        decrypt: async (data: string) => data
      });
    }

    return {
      success: true,
      type: AuthType.BASIC,
      headers: { 'Authorization': request.headers['Authorization'] },
      expiresAt: null,
      metadata: {
        username: config.username,
        realm: config.realm
      }
    };
  }

  private async applyBearerAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as ExtendedBearerAuthConfig;

    const cacheKey = this.generateCacheKey(AuthType.BEARER, config);
    const cachedToken = this.getFromTokenCache(cacheKey);

    if (cachedToken && !this.isTokenExpired(cachedToken)) {
      this.metrics.cacheHits++;
      request.headers = request.headers || {};
      request.headers['Authorization'] = `Bearer ${cachedToken.token}`;

      return {
        success: true,
        type: AuthType.BEARER,
        headers: { 'Authorization': request.headers['Authorization'] },
        expiresAt: cachedToken.expiresAt || null,
        cached: true
      };
    }

    this.metrics.cacheMisses++;

    if (!config.token) {
      throw new AuthenticationError('Bearer token is required', 'MISSING_TOKEN');
    }

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = `Bearer ${config.token}`;

    if (config.expiresAt) {
      this.addToTokenCache(cacheKey, {
        token: config.token,
        expiresAt: config.expiresAt,
        refreshToken: config.refreshToken || null
      });
    }

    return {
      success: true,
      type: AuthType.BEARER,
      headers: { 'Authorization': request.headers['Authorization'] },
      expiresAt: config.expiresAt || null,
      metadata: {
        tokenType: 'Bearer',
        scope: config.scope
      }
    };
  }

  private async applyAPIKeyAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as ExtendedAPIKeyAuthConfig;

    if (!config.apiKey) {
      throw new AuthenticationError('API key is required', 'MISSING_API_KEY');
    }

    switch (config.location) {
      case 'header':
        if (!request.headers) {
          request.headers = {};
        }
        request.headers[config.keyName || 'X-API-Key'] = config.apiKey;
        break;

      case 'query':
        const url = new URL(request.url);
        url.searchParams.set(config.keyName || 'api_key', config.apiKey);
        request.url = url.toString();
        break;

      case 'cookie':
        if (!request.headers) {
          request.headers = {};
        }
        const existingCookies = request.headers['Cookie'] || '';
        const newCookie = `${config.keyName || 'api_key'}=${config.apiKey}`;
        request.headers['Cookie'] = existingCookies ? `${existingCookies}; ${newCookie}` : newCookie;
        break;

      default:
        throw new AuthenticationError(`Invalid API key location: ${config.location}`, 'INVALID_LOCATION');
    }

    return {
      success: true,
      type: AuthType.API_KEY,
      headers: request.headers || {},
      expiresAt: null,
      metadata: {
        location: config.location,
        keyName: config.keyName
      }
    };
  }

  private async applyOAuth2Auth(
    request: RequestOptions,
    authConfig: AuthConfig,
    options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as unknown as OAuth2Config;

    const result = await this.oauth2Handler.authenticate(request, config, options);

    if (result.accessToken) {
      const cacheKey = this.generateCacheKey(AuthType.OAUTH2, config);
      this.addToTokenCache(cacheKey, {
        token: result.accessToken,
        refreshToken: result.refreshToken || null,
        expiresAt: result.expiresAt || new Date(),
        scope: result.scope || undefined
      });
    }

    return {
      success: true,
      type: AuthType.OAUTH2,
      headers: result.headers || {},
      expiresAt: result.expiresAt || null,
      metadata: result.metadata,
      accessToken: result.accessToken || undefined,
      refreshToken: result.refreshToken || undefined,
      scope: result.scope || undefined
    };
  }

  private async applyCertificateAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as CertificateAuthConfig;

    const result = await this.certificateManager.applyCertificateAuth(request, config);

    return {
      success: true,
      type: AuthType.CERTIFICATE,
      agent: result.agent,
      headers: result.headers || {},
      expiresAt: result.validUntil || null,
      metadata: {
        subject: result.subject,
        issuer: result.issuer,
        serialNumber: result.serialNumber,
        fingerprint: result.fingerprint
      }
    };
  }

  private async applyNTLMAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as unknown as NTLMAuthConfig;

    const sessionId = options.sessionId || this.generateSessionId();
    let session = this.sessionCache.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        type: AuthType.NTLM,
        state: 'TYPE1',
        startTime: new Date(),
        metadata: {}
      };
      this.sessionCache.set(sessionId, session);
    }

    switch (session.state) {
      case 'TYPE1':
        return await this.sendNTLMType1(request, config, session);

      case 'TYPE2':
        return await this.sendNTLMType3(request, config, session);

      case 'AUTHENTICATED':
        return await this.applyNTLMSessionAuth(request, session);

      default:
        throw new AuthenticationError(`Invalid NTLM session state: ${session.state}`, 'INVALID_STATE');
    }
  }

  private async sendNTLMType1(
    request: RequestOptions,
    config: NTLMAuthConfig,
    session: AuthenticationSession
  ): Promise<AuthenticationResult> {
    const type1Message = this.buildNTLMType1Message(config);

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = `NTLM ${type1Message}`;

    session.state = 'TYPE2';
    session.metadata.type1Sent = new Date();

    return {
      success: true,
      type: AuthType.NTLM,
      headers: { 'Authorization': request.headers['Authorization'] },
      requiresChallenge: true,
      sessionId: session.id,
      expiresAt: null,
      metadata: {
        messageType: 'Type1',
        domain: config.domain,
        workstation: config.workstation
      }
    };
  }

  private buildNTLMType1Message(config: NTLMAuthConfig): string {
    const domain = config.domain || '';
    const workstation = config.workstation || '';

    const type1 = Buffer.alloc(32 + domain.length + workstation.length);

    type1.write('NTLMSSP\0', 0, 'ascii');

    type1.writeUInt32LE(NTLMMessageType.TYPE1, 8);

    const flags = NTLMFlags.NEGOTIATE_UNICODE |
      NTLMFlags.NEGOTIATE_OEM |
      NTLMFlags.REQUEST_TARGET |
      NTLMFlags.NEGOTIATE_NTLM |
      NTLMFlags.NEGOTIATE_ALWAYS_SIGN |
      NTLMFlags.NEGOTIATE_EXTENDED_SECURITY;
    type1.writeUInt32LE(flags, 12);

    let offset = 32;
    if (domain) {
      type1.writeUInt16LE(domain.length, 16);
      type1.writeUInt16LE(domain.length, 18);
      type1.writeUInt32LE(offset, 20);
      type1.write(domain, offset, 'ascii');
      offset += domain.length;
    }

    if (workstation) {
      type1.writeUInt16LE(workstation.length, 24);
      type1.writeUInt16LE(workstation.length, 26);
      type1.writeUInt32LE(offset, 28);
      type1.write(workstation, offset, 'ascii');
    }

    return type1.toString('base64');
  }

  private async sendNTLMType3(
    request: RequestOptions,
    config: NTLMAuthConfig,
    session: AuthenticationSession
  ): Promise<AuthenticationResult> {
    const challenge = session.metadata.challenge;
    if (!challenge) {
      throw new AuthenticationError('Missing NTLM Type 2 challenge', 'MISSING_CHALLENGE');
    }

    const type2Data = this.parseNTLMType2Message(challenge);

    const type3Message = await this.buildNTLMType3Message(config, type2Data);

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = `NTLM ${type3Message}`;

    session.state = 'AUTHENTICATED';
    session.metadata.type3Sent = new Date();
    session.metadata.authenticated = true;

    return {
      success: true,
      type: AuthType.NTLM,
      headers: { 'Authorization': request.headers['Authorization'] },
      sessionId: session.id,
      expiresAt: null,
      metadata: {
        messageType: 'Type3',
        username: config.username,
        domain: config.domain,
        authenticated: true
      }
    };
  }

  private parseNTLMType2Message(challengeBase64: string): any {
    const challenge = Buffer.from(challengeBase64, 'base64');

    const signature = challenge.toString('ascii', 0, 7);
    if (signature !== 'NTLMSSP') {
      throw new AuthenticationError('Invalid NTLM Type 2 signature', 'INVALID_SIGNATURE');
    }

    const type = challenge.readUInt32LE(8);
    if (type !== NTLMMessageType.TYPE2) {
      throw new AuthenticationError('Invalid NTLM message type', 'INVALID_TYPE');
    }

    const targetNameLen = challenge.readUInt16LE(12);
    const targetNameOffset = challenge.readUInt32LE(16);
    const flags = challenge.readUInt32LE(20);
    const serverChallenge = challenge.slice(24, 32);

    let targetInfo = null;
    if (flags & NTLMFlags.NEGOTIATE_TARGET_INFO) {
      const targetInfoLen = challenge.readUInt16LE(40);
      const targetInfoOffset = challenge.readUInt32LE(44);
      if (targetInfoLen > 0 && targetInfoOffset < challenge.length) {
        targetInfo = challenge.slice(targetInfoOffset, targetInfoOffset + targetInfoLen);
      }
    }

    return {
      targetName: targetNameLen > 0 ? challenge.toString('ucs2', targetNameOffset, targetNameOffset + targetNameLen) : '',
      flags,
      serverChallenge,
      targetInfo
    };
  }

  private async buildNTLMType3Message(config: NTLMAuthConfig, type2Data: any): Promise<string> {
    const username = config.username;
    const password = config.password;
    const domain = config.domain || '';
    const workstation = config.workstation || '';

    const ntlmResponse = await this.generateNTLMResponse(password, type2Data.serverChallenge);
    const lmResponse = await this.generateLMResponse(password, type2Data.serverChallenge);

    let offset = 64;
    const domainLen = domain.length * 2;
    const userLen = username.length * 2;
    const workstationLen = workstation.length * 2;
    const ntlmResponseLen = ntlmResponse.length;
    const lmResponseLen = lmResponse.length;
    const sessionKeyLen = 0;

    const type3 = Buffer.alloc(offset + domainLen + userLen + workstationLen + lmResponseLen + ntlmResponseLen + sessionKeyLen);

    type3.write('NTLMSSP\0', 0, 'ascii');

    type3.writeUInt32LE(NTLMMessageType.TYPE3, 8);

    type3.writeUInt16LE(lmResponseLen, 12);
    type3.writeUInt16LE(lmResponseLen, 14);
    type3.writeUInt32LE(offset, 16);
    lmResponse.copy(type3, offset);
    offset += lmResponseLen;

    type3.writeUInt16LE(ntlmResponseLen, 20);
    type3.writeUInt16LE(ntlmResponseLen, 22);
    type3.writeUInt32LE(offset, 24);
    ntlmResponse.copy(type3, offset);
    offset += ntlmResponseLen;

    type3.writeUInt16LE(domainLen, 28);
    type3.writeUInt16LE(domainLen, 30);
    type3.writeUInt32LE(offset, 32);
    if (domain) {
      type3.write(domain, offset, 'ucs2');
      offset += domainLen;
    }

    type3.writeUInt16LE(userLen, 36);
    type3.writeUInt16LE(userLen, 38);
    type3.writeUInt32LE(offset, 40);
    type3.write(username, offset, 'ucs2');
    offset += userLen;

    type3.writeUInt16LE(workstationLen, 44);
    type3.writeUInt16LE(workstationLen, 46);
    type3.writeUInt32LE(offset, 48);
    if (workstation) {
      type3.write(workstation, offset, 'ucs2');
      offset += workstationLen;
    }

    type3.writeUInt16LE(sessionKeyLen, 52);
    type3.writeUInt16LE(sessionKeyLen, 54);
    type3.writeUInt32LE(offset, 56);

    type3.writeUInt32LE(type2Data.flags, 60);

    return type3.toString('base64');
  }

  private async generateNTLMResponse(password: string, serverChallenge: Buffer): Promise<Buffer> {
    const unicodePwd = Buffer.from(password, 'ucs2');

    const md4 = createHash('md4');
    md4.update(unicodePwd);
    const passwordHash = md4.digest();

    const response = Buffer.alloc(24);

    const hmac = createHmac('md5', passwordHash);
    hmac.update(serverChallenge);
    const hash = hmac.digest();

    hash.copy(response, 0, 0, 24);

    return response;
  }

  private async generateLMResponse(_password: string, _serverChallenge: Buffer): Promise<Buffer> {
    return Buffer.alloc(24);
  }

  private async applyAWSAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as AWSAuthConfig;

    const result = await this.awsHandler.signRequest(request, config);

    return {
      success: true,
      type: AuthType.AWS,
      headers: result.headers,
      expiresAt: null,
      metadata: {
        accessKeyId: config.accessKeyId,
        region: config.region,
        service: config.service,
        signatureVersion: config.signatureVersion || 'v4'
      }
    };
  }

  private async applyDigestAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as ExtendedDigestAuthConfig;

    if (!config.challenge) {
      throw new AuthenticationError('Digest authentication requires a challenge', 'MISSING_CHALLENGE');
    }

    const challengeParams = this.parseDigestChallenge(config.challenge);

    const response = await this.generateDigestResponse(request, config, challengeParams);

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = `Digest ${response}`;

    return {
      success: true,
      type: AuthType.DIGEST,
      headers: { 'Authorization': request.headers['Authorization'] },
      expiresAt: null,
      metadata: {
        username: config.username,
        realm: challengeParams.realm,
        algorithm: challengeParams.algorithm || 'MD5'
      }
    };
  }

  private parseDigestChallenge(challenge: string): any {
    const params: any = {};

    const cleanChallenge = challenge.replace(/^Digest\s+/i, '');

    const regex = /(\w+)=(?:"([^"]+)"|([^,\s]+))/g;
    let match;

    while ((match = regex.exec(cleanChallenge)) !== null) {
      const key = match[1];
      const value = match[2] || match[3];
      if (key) {
        params[key] = value;
      }
    }

    if (!params.realm || !params.nonce) {
      throw new AuthenticationError('Invalid Digest challenge', 'INVALID_CHALLENGE');
    }

    return params;
  }

  private async generateDigestResponse(
    request: RequestOptions,
    config: DigestAuthConfig,
    challenge: any
  ): Promise<string> {
    const username = config.username;
    const password = config.password;
    const method = request.method || 'GET';
    const uri = new URL(request.url).pathname;

    const cnonce = challenge.qop ? randomBytes(16).toString('hex') : null;
    const nc = '00000001';

    let ha1: string;
    if (challenge.algorithm === 'MD5-sess') {
      const ha1Base = createHash('md5')
        .update(`${username}:${challenge.realm}:${password}`)
        .digest('hex');
      ha1 = createHash('md5')
        .update(`${ha1Base}:${challenge.nonce}:${cnonce}`)
        .digest('hex');
    } else {
      ha1 = createHash('md5')
        .update(`${username}:${challenge.realm}:${password}`)
        .digest('hex');
    }

    const ha2 = createHash('md5')
      .update(`${method}:${uri}`)
      .digest('hex');

    let response: string;
    if (challenge.qop === 'auth' || challenge.qop === 'auth-int') {
      if (!cnonce) {
        throw new AuthenticationError('cnonce is required for qop auth', 'MISSING_CNONCE');
      }
      response = createHash('md5')
        .update(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
        .digest('hex');
    } else {
      response = createHash('md5')
        .update(`${ha1}:${challenge.nonce}:${ha2}`)
        .digest('hex');
    }

    const authParams = [
      `username="${username}"`,
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `uri="${uri}"`,
      `response="${response}"`
    ];

    if (challenge.opaque) {
      authParams.push(`opaque="${challenge.opaque}"`);
    }

    if (challenge.qop && cnonce) {
      authParams.push(`qop=${challenge.qop}`);
      authParams.push(`nc=${nc}`);
      authParams.push(`cnonce="${cnonce}"`);
    }

    if (challenge.algorithm) {
      authParams.push(`algorithm=${challenge.algorithm}`);
    }

    return authParams.join(', ');
  }

  private async applyHawkAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as HawkAuthConfig;

    const url = new URL(request.url);
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(6).toString('base64');

    const artifacts = {
      ts: timestamp,
      nonce,
      method: request.method || 'GET',
      resource: url.pathname + url.search,
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      hash: '',
      ext: config.ext,
      app: config.app,
      dlg: config.dlg
    };

    if (request.body && config.includePayloadHash) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(request.body))
        .digest('base64');
      artifacts.hash = payloadHash;
    }

    const mac = await this.generateHawkMAC(config.keyId, config.key, artifacts);

    const authHeader = this.buildHawkHeader(config.keyId, mac, artifacts);

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = authHeader;

    return {
      success: true,
      type: AuthType.HAWK,
      headers: { 'Authorization': request.headers['Authorization'] },
      expiresAt: null,
      metadata: {
        keyId: config.keyId,
        timestamp,
        nonce,
        algorithm: config.algorithm || 'sha256'
      }
    };
  }

  private async generateHawkMAC(_keyId: string, key: string, artifacts: any): Promise<string> {
    const normalized = [
      'hawk.1.header',
      artifacts.ts,
      artifacts.nonce,
      artifacts.method.toUpperCase(),
      artifacts.resource,
      artifacts.host.toLowerCase(),
      artifacts.port,
      artifacts.hash || '',
      artifacts.ext || ''
    ].join('\n') + '\n';

    const mac = createHmac('sha256', key)
      .update(normalized)
      .digest('base64');

    return mac;
  }

  private buildHawkHeader(keyId: string, mac: string, artifacts: any): string {
    const params = [
      `id="${keyId}"`,
      `ts="${artifacts.ts}"`,
      `nonce="${artifacts.nonce}"`,
      `mac="${mac}"`
    ];

    if (artifacts.hash) {
      params.push(`hash="${artifacts.hash}"`);
    }

    if (artifacts.ext) {
      params.push(`ext="${artifacts.ext}"`);
    }

    if (artifacts.app) {
      params.push(`app="${artifacts.app}"`);
    }

    return `Hawk ${params.join(', ')}`;
  }

  private async applyJWTAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as JWTAuthConfig;

    const cacheKey = this.generateCacheKey(AuthType.JWT, config);
    const cachedToken = this.getFromTokenCache(cacheKey);

    if (cachedToken && !this.isTokenExpired(cachedToken)) {
      this.metrics.cacheHits++;
      request.headers = request.headers || {};
      const headerName = config.headerName || 'Authorization';
      request.headers[headerName] = config.scheme ? `${config.scheme} ${cachedToken.token}` : cachedToken.token;

      return {
        success: true,
        type: AuthType.JWT,
        headers: { [headerName]: request.headers[headerName] },
        expiresAt: cachedToken.expiresAt || null,
        cached: true
      };
    }

    let token: string;
    if (config.token) {
      token = config.token;
    } else if (config.privateKey && config.claims) {
      token = await this.generateJWT(config);
    } else {
      throw new AuthenticationError('JWT token or generation parameters required', 'MISSING_TOKEN');
    }

    if (!request.headers) {
      request.headers = {};
    }
    const headerName = config.headerName || 'Authorization';
    request.headers[headerName] = config.scheme ? `${config.scheme} ${token}` : token;

    if (config.expiresIn) {
      const expiresAt = new Date(Date.now() + config.expiresIn * 1000);
      this.addToTokenCache(cacheKey, {
        token,
        expiresAt,
        refreshToken: null
      });
    }

    return {
      success: true,
      type: AuthType.JWT,
      headers: { [headerName]: request.headers[headerName] },
      expiresAt: config.expiresIn ? new Date(Date.now() + config.expiresIn * 1000) : null,
      metadata: {
        algorithm: config.algorithm || 'RS256',
        issuer: config.claims?.iss,
        audience: config.claims?.aud
      }
    };
  }

  private async generateJWT(config: JWTAuthConfig): Promise<string> {
    const header = {
      alg: config.algorithm || 'RS256',
      typ: 'JWT',
      ...(config.keyId && { kid: config.keyId })
    };

    const payload = {
      ...config.claims,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (config.expiresIn || 3600)
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    let signature: string;

    switch (config.algorithm) {
      case 'HS256':
      case 'HS384':
      case 'HS512':
        const algorithm = config.algorithm.replace('HS', 'sha');
        signature = createHmac(algorithm, config.privateKey!)
          .update(signingInput)
          .digest('base64url');
        break;

      case 'RS256':
      case 'RS384':
      case 'RS512':
        const rsaAlgorithm = config.algorithm.replace('RS', 'RSA-SHA');
        const signer = createSign(rsaAlgorithm);
        signer.update(signingInput);
        signature = signer.sign(config.privateKey!, 'base64url');
        break;

      default:
        throw new AuthenticationError(`Unsupported JWT algorithm: ${config.algorithm}`, 'UNSUPPORTED_ALGORITHM');
    }

    return `${signingInput}.${signature}`;
  }

  private async applyCustomAuth(
    request: RequestOptions,
    authConfig: AuthConfig,
    _options: AuthenticationOptions
  ): Promise<AuthenticationResult> {
    const config = authConfig as ExtendedCustomAuthConfig;

    if (!config.handler || typeof config.handler !== 'function') {
      throw new AuthenticationError('Custom authentication handler function is required', 'MISSING_HANDLER');
    }

    const handler = config.handler as Function;
    const result = await handler({
      method: request.method || 'GET',
      url: request.url,
      headers: request.headers || {},
      body: request.body
    });

    return {
      success: true,
      type: AuthType.CUSTOM,
      headers: result.headers || {},
      expiresAt: result.expiresAt || null,
      metadata: {
        handlerName: config.name,
        parameters: config.parameters
      }
    };
  }

  private async validateAuthConfig(authConfig: AuthConfig): Promise<AuthValidationResult> {
    const errors: string[] = [];

    if (!authConfig.type) {
      errors.push('Authentication type is required');
    }

    switch (authConfig.type) {
      case AuthType.BASIC:
        const basicConfig = authConfig as unknown as BasicAuthConfig;
        if (!basicConfig.username) errors.push('Username is required for Basic auth');
        if (!basicConfig.password) errors.push('Password is required for Basic auth');
        break;

      case AuthType.BEARER:
        const bearerConfig = authConfig as ExtendedBearerAuthConfig;
        if (!bearerConfig.token) errors.push('Token is required for Bearer auth');
        break;

      case AuthType.API_KEY:
        const apiKeyConfig = authConfig as ExtendedAPIKeyAuthConfig;
        if (!apiKeyConfig.apiKey) errors.push('API key is required');
        if (!apiKeyConfig.location) errors.push('API key location is required');
        if (!['header', 'query', 'cookie'].includes(apiKeyConfig.location)) {
          errors.push('Invalid API key location');
        }
        break;

      case AuthType.OAUTH2:
        const oauth2Config = authConfig as unknown as OAuth2Config;
        if (!oauth2Config.grantType) errors.push('Grant type is required for OAuth2');
        if (!oauth2Config.tokenUrl) errors.push('Token URL is required for OAuth2');
        break;

      case AuthType.CERTIFICATE:
        const certConfig = authConfig as CertificateAuthConfig;
        if (!certConfig.certPath && !certConfig.cert) {
          errors.push('Certificate path or content is required');
        }
        if (!certConfig.keyPath && !certConfig.key) {
          errors.push('Private key path or content is required');
        }
        break;

      case AuthType.NTLM:
        const ntlmConfig = authConfig as unknown as NTLMAuthConfig;
        if (!ntlmConfig.username) errors.push('Username is required for NTLM');
        if (!ntlmConfig.password) errors.push('Password is required for NTLM');
        break;

      case AuthType.AWS:
        const awsConfig = authConfig as AWSAuthConfig;
        if (!awsConfig.accessKeyId) errors.push('Access key ID is required for AWS');
        if (!awsConfig.secretAccessKey) errors.push('Secret access key is required for AWS');
        if (!awsConfig.region) errors.push('Region is required for AWS');
        break;

      case AuthType.DIGEST:
        const digestConfig = authConfig as unknown as DigestAuthConfig;
        if (!digestConfig.username) errors.push('Username is required for Digest auth');
        if (!digestConfig.password) errors.push('Password is required for Digest auth');
        break;

      case AuthType.HAWK:
        const hawkConfig = authConfig as HawkAuthConfig;
        if (!hawkConfig.keyId) errors.push('Key ID is required for Hawk auth');
        if (!hawkConfig.key) errors.push('Key is required for Hawk auth');
        break;

      case AuthType.JWT:
        const jwtConfig = authConfig as JWTAuthConfig;
        if (!jwtConfig.token && (!jwtConfig.privateKey || !jwtConfig.claims)) {
          errors.push('JWT token or generation parameters required');
        }
        break;

      case AuthType.CUSTOM:
        const customConfig = authConfig as ExtendedCustomAuthConfig;
        if (!customConfig.handler) errors.push('Handler function is required for custom auth');
        if (!customConfig.name) errors.push('Name is required for custom auth');
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async validateBasicAuth(config: BasicAuthConfig): Promise<boolean> {
    return !!(config.username && config.password);
  }

  private async validateBearerAuth(config: ExtendedBearerAuthConfig): Promise<boolean> {
    if (!config.token) return false;

    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      return false;
    }

    return true;
  }

  private async validateAPIKey(config: ExtendedAPIKeyAuthConfig): Promise<boolean> {
    return !!(config.apiKey && config.location);
  }

  private async validateOAuth2(config: OAuth2Config): Promise<boolean> {
    return await this.oauth2Handler.validateConfig(config);
  }

  private async validateCertificate(config: CertificateAuthConfig): Promise<boolean> {
    const result = await this.certificateManager.validateCertificate(config);
    return result.isValid;
  }

  private async validateNTLM(config: NTLMAuthConfig): Promise<boolean> {
    return !!(config.username && config.password);
  }

  private async validateAWS(config: AWSAuthConfig): Promise<boolean> {
    return await this.awsHandler.validateConfig(config);
  }

  private async validateDigest(config: DigestAuthConfig): Promise<boolean> {
    return !!(config.username && config.password);
  }

  private async validateHawk(config: HawkAuthConfig): Promise<boolean> {
    return !!(config.keyId && config.key);
  }

  private async validateJWT(config: JWTAuthConfig): Promise<boolean> {
    if (config.token) {
      const parts = config.token.split('.');
      if (parts.length !== 3) return false;

      try {
        const payload = JSON.parse(Buffer.from(parts[1] || '', 'base64url').toString());

        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    }

    return !!(config.privateKey && config.claims);
  }

  private async validateCustom(config: ExtendedCustomAuthConfig): Promise<boolean> {
    return !!(config.handler && typeof config.handler === 'function');
  }

  private async refreshBearerToken(config: ExtendedBearerAuthConfig): Promise<TokenRefreshResult> {
    if (!config.refreshToken || !config.refreshUrl) {
      throw new AuthenticationError('Refresh token and URL required', 'MISSING_REFRESH_CONFIG');
    }

    const response = await this.makeRefreshRequest(config.refreshUrl, {
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    });

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || config.refreshToken || undefined,
      expiresIn: response.expires_in,
      scope: response.scope || undefined
    };
  }

  private async refreshOAuth2Token(config: OAuth2Config): Promise<TokenRefreshResult> {
    return await this.oauth2Handler.refreshToken(config);
  }

  private async refreshAWSCredentials(config: AWSAuthConfig): Promise<TokenRefreshResult> {
    const result = await this.awsHandler.refreshCredentials(config);
    return {
      accessToken: result.accessKeyId || '',
      sessionToken: result.sessionToken || undefined,
      expiresIn: 3600
    };
  }

  private async refreshJWT(config: JWTAuthConfig): Promise<TokenRefreshResult> {
    if (!config.privateKey || !config.claims) {
      throw new AuthenticationError('JWT generation parameters required for refresh', 'MISSING_CONFIG');
    }

    const newToken = await this.generateJWT(config);

    return {
      accessToken: newToken,
      expiresIn: config.expiresIn || 3600
    };
  }

  private async refreshCustom(config: ExtendedCustomAuthConfig): Promise<TokenRefreshResult> {
    if (!config.refreshHandler) {
      throw new AuthenticationError('Custom refresh handler not provided', 'MISSING_HANDLER');
    }

    return await config.refreshHandler(config.parameters || {});
  }

  private async makeRefreshRequest(url: string, body: any): Promise<any> {
    const https = require('https');
    const http = require('http');

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(new URLSearchParams(body).toString())
        }
      };

      const protocol = urlObj.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(response);
            } else {
              reject(new AuthenticationError(`Token refresh failed: ${response.error}`, 'REFRESH_FAILED'));
            }
          } catch (error) {
            reject(new AuthenticationError('Invalid refresh response', 'INVALID_RESPONSE'));
          }
        });
      });

      req.on('error', (error: any) => {
        reject(new AuthenticationError(`Refresh request failed: ${error.message}`, 'REQUEST_FAILED'));
      });

      req.write(new URLSearchParams(body).toString());
      req.end();
    });
  }

  private async checkRateLimit(authType: AuthType): Promise<void> {
    const key = `ratelimit:${authType}`;
    const now = Date.now();

    let rateLimitInfo = this.rateLimiters.get(key);
    if (!rateLimitInfo) {
      rateLimitInfo = {
        requests: 0,
        windowStart: now,
        windowEnd: now + this.config.rateLimit.windowMs
      };
      this.rateLimiters.set(key, rateLimitInfo);
    }

    if (now > rateLimitInfo.windowEnd) {
      rateLimitInfo.requests = 0;
      rateLimitInfo.windowStart = now;
      rateLimitInfo.windowEnd = now + this.config.rateLimit.windowMs;
    }

    if (rateLimitInfo.requests >= this.config.rateLimit.maxRequests) {
      const waitTime = rateLimitInfo.windowEnd - now;
      throw new AuthenticationError(
        `Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)} seconds`,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    rateLimitInfo.requests++;
  }

  private async enforceSecurityPolicies(authConfig: AuthConfig, request: RequestOptions): Promise<void> {
    const url = new URL(request.url);

    if (this.config.enforceHttps && url.protocol !== 'https:') {
      const policy = this.securityPolicies.get('enforce-https');
      if (policy && policy.enabled) {
        throw new AuthenticationError('HTTPS is required for authentication', 'HTTPS_REQUIRED');
      }
    }

    const domainPolicy = this.securityPolicies.get('allowed-domains');
    if (domainPolicy && domainPolicy.enabled) {
      const allowedDomains = domainPolicy.config.domains as string[];
      if (!allowedDomains.some(domain => url.hostname.endsWith(domain))) {
        throw new AuthenticationError(`Domain ${url.hostname} is not allowed`, 'DOMAIN_NOT_ALLOWED');
      }
    }

    const authTypePolicy = this.securityPolicies.get('auth-type-restrictions');
    if (authTypePolicy && authTypePolicy.enabled) {
      const restrictions = authTypePolicy.config.restrictions as Map<string, AuthType[]>;
      const allowedTypes = restrictions.get(url.hostname);
      if (allowedTypes && !allowedTypes.includes(authConfig.type)) {
        throw new AuthenticationError(
          `Authentication type ${authConfig.type} not allowed for ${url.hostname}`,
          'AUTH_TYPE_NOT_ALLOWED'
        );
      }
    }
  }

  private generateCacheKey(type: AuthType, config: any): string {
    const parts: string[] = [type];

    switch (type) {
      case AuthType.BEARER:
        parts.push((config as ExtendedBearerAuthConfig).token?.substring(0, 10) || '');
        break;
      case AuthType.OAUTH2:
        const oauth2 = config as OAuth2Config;
        parts.push(oauth2.clientId, oauth2.tokenUrl || '');
        break;
      case AuthType.JWT:
        const jwt = config as JWTAuthConfig;
        parts.push(jwt.claims?.iss || 'default', jwt.claims?.aud || 'default');
        break;
      default:
        parts.push(JSON.stringify(config).substring(0, 20));
    }

    return parts.join(':');
  }

  private getFromTokenCache(key: string): TokenCache | null {
    const cached = this.tokenCache.get(key);
    if (!cached) return null;

    if (this.isTokenExpired(cached)) {
      this.tokenCache.delete(key);
      return null;
    }

    return cached;
  }

  private addToTokenCache(key: string, cache: TokenCache): void {
    this.tokenCache.set(key, cache);

    if (cache.expiresAt) {
      const ttl = new Date(cache.expiresAt).getTime() - Date.now();
      setTimeout(() => {
        this.tokenCache.delete(key);
      }, ttl);
    }
  }

  private isTokenExpired(cache: TokenCache): boolean {
    if (!cache.expiresAt) return false;

    const now = new Date();
    const expiresAt = new Date(cache.expiresAt);
    const buffer = this.config.tokenRefreshBuffer;

    return now.getTime() + buffer >= expiresAt.getTime();
  }

  private async storeCredentials(id: string, credentials: ExtendedCredentialStore): Promise<void> {
    const encrypted = await CryptoUtils.encrypt(JSON.stringify(credentials.credentials), 'default-password');

    this.credentialStore.set(id, {
      ...credentials,
      credentials: encrypted
    });
  }

  private updateMetrics(type: AuthType, success: boolean, duration: number): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalAuthentications++;

    if (success) {
      this.metrics.successfulAuthentications++;
    } else {
      this.metrics.failedAuthentications++;
    }

    const totalTime = this.metrics.averageAuthTime * (this.metrics.totalAuthentications - 1) + duration;
    this.metrics.averageAuthTime = totalTime / this.metrics.totalAuthentications;

    const typeCount = this.metrics.authenticationsByType.get(type) || 0;
    this.metrics.authenticationsByType.set(type, typeCount + 1);
  }

  private auditAuthentication(event: AuthenticationEvent): void {
    if (!this.config.enableAudit) return;

    const auditEntry: AuthenticationAudit = {
      id: this.generateCorrelationId(),
      timestamp: event.timestamp,
      type: this.convertEventTypeToAuthType(event.authType || 'none'),
      authType: event.authType || 'none',
      success: event.success || false,
      duration: event.duration || 0,
      correlationId: event.correlationId || undefined,
      metadata: {
        userAgent: event.context?.userAgent,
        ipAddress: event.context?.ipAddress,
        sessionId: event.context?.sessionId,
        requestUrl: event.context?.requestUrl
      }
    };

    if (event.error) {
      auditEntry.errorMessage = event.error;
    }

    this.auditLog.push(auditEntry);

    const maxAuditLogSize = 10000;
    if (this.auditLog.length > maxAuditLogSize) {
      this.auditLog.splice(0, this.auditLog.length - maxAuditLogSize);
    }
  }

  private convertEventTypeToAuthType(type: AuthenticationType): AuthType {
    const mapping: Record<AuthenticationType, AuthType> = {
      'basic': AuthType.BASIC,
      'bearer': AuthType.BEARER,
      'apikey': AuthType.API_KEY,
      'oauth2': AuthType.OAUTH2,
      'certificate': AuthType.CERTIFICATE,
      'ntlm': AuthType.NTLM,
      'aws': AuthType.AWS,
      'digest': AuthType.DIGEST,
      'azure': AuthType.CUSTOM,
      'custom': AuthType.CUSTOM,
      'none': AuthType.CUSTOM
    };
    return mapping[type] || AuthType.CUSTOM;
  }

  private initializeProviders(): void {
    const createProvider = (
      id: string,
      name: string,
      type: AuthType,
      authenticateFn: Function,
      validateFn: Function,
      refreshFn: Function | null
    ): ExtendedAuthenticationProvider => {
      return {
        id,
        name,
        type: this.convertToAuthenticationType(type),
        enabled: true,
        authenticate: async (config: any, request: any) => {
          const result = await authenticateFn(request, { type, ...config }, {
            correlationId: this.generateCorrelationId(),
            retryCount: 0,
            maxRetries: this.config.maxRetries
          });
          return {
            headers: result.headers,
            token: result.accessToken ? {
              accessToken: result.accessToken,
              tokenType: 'Bearer',
              expiresAt: result.expiresAt
            } : undefined as any
          };
        },
        validate: async (_token: string, config: any) => validateFn(config),
        refresh: refreshFn ? async (_token: string, config: any) => {
          const result = await refreshFn(config);
          return {
            headers: {},
            token: {
              accessToken: result.accessToken,
              tokenType: 'Bearer',
              refreshToken: result.refreshToken,
              expiresIn: result.expiresIn
            }
          };
        } : undefined as any
      };
    };

    this.activeProviders.set('basic', createProvider(
      'basic',
      'Basic Authentication Provider',
      AuthType.BASIC,
      this.applyBasicAuth.bind(this),
      this.validateBasicAuth.bind(this),
      null
    ));

    this.activeProviders.set('bearer', createProvider(
      'bearer',
      'Bearer Token Provider',
      AuthType.BEARER,
      this.applyBearerAuth.bind(this),
      this.validateBearerAuth.bind(this),
      this.refreshBearerToken.bind(this)
    ));

    this.activeProviders.set('apikey', createProvider(
      'apikey',
      'API Key Provider',
      AuthType.API_KEY,
      this.applyAPIKeyAuth.bind(this),
      this.validateAPIKey.bind(this),
      null
    ));

    this.activeProviders.set('oauth2', createProvider(
      'oauth2',
      'OAuth 2.0 Provider',
      AuthType.OAUTH2,
      this.applyOAuth2Auth.bind(this),
      this.validateOAuth2.bind(this),
      this.refreshOAuth2Token.bind(this)
    ));

    this.activeProviders.set('certificate', createProvider(
      'certificate',
      'Certificate Authentication Provider',
      AuthType.CERTIFICATE,
      this.applyCertificateAuth.bind(this),
      this.validateCertificate.bind(this),
      null
    ));

    this.activeProviders.set('ntlm', createProvider(
      'ntlm',
      'NTLM Authentication Provider',
      AuthType.NTLM,
      this.applyNTLMAuth.bind(this),
      this.validateNTLM.bind(this),
      null
    ));

    this.activeProviders.set('aws', createProvider(
      'aws',
      'AWS Signature Provider',
      AuthType.AWS,
      this.applyAWSAuth.bind(this),
      this.validateAWS.bind(this),
      this.refreshAWSCredentials.bind(this)
    ));

    this.activeProviders.set('digest', createProvider(
      'digest',
      'Digest Authentication Provider',
      AuthType.DIGEST,
      this.applyDigestAuth.bind(this),
      this.validateDigest.bind(this),
      null
    ));

    this.activeProviders.set('hawk', createProvider(
      'hawk',
      'Hawk Authentication Provider',
      AuthType.HAWK,
      this.applyHawkAuth.bind(this),
      this.validateHawk.bind(this),
      null
    ));

    this.activeProviders.set('jwt', createProvider(
      'jwt',
      'JWT Authentication Provider',
      AuthType.JWT,
      this.applyJWTAuth.bind(this),
      this.validateJWT.bind(this),
      this.refreshJWT.bind(this)
    ));

    this.activeProviders.set('custom', createProvider(
      'custom',
      'Custom Authentication Provider',
      AuthType.CUSTOM,
      this.applyCustomAuth.bind(this),
      this.validateCustom.bind(this),
      this.refreshCustom.bind(this)
    ));
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredTokens();
      this.cleanupExpiredNonces();
      this.cleanupExpiredSessions();
      this.cleanupRateLimiters();
    }, 60000);

    setInterval(() => {
      this.resetMetrics();
    }, 24 * 60 * 60 * 1000);
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.tokenCache.forEach((cache, key) => {
      if (cache.expiresAt && new Date(cache.expiresAt).getTime() < now) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.tokenCache.delete(key));

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired tokens`);
    }
  }

  private cleanupExpiredNonces(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.nonceCache.forEach((cache, key) => {
      if (cache.expiresAt.getTime() < now) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.nonceCache.delete(key));
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const maxSessionAge = 24 * 60 * 60 * 1000;
    const expiredSessions: string[] = [];

    this.sessionCache.forEach((session, id) => {
      if (now - session.startTime.getTime() > maxSessionAge) {
        expiredSessions.push(id);
      }
    });

    expiredSessions.forEach(id => this.sessionCache.delete(id));
  }

  private cleanupRateLimiters(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.rateLimiters.forEach((info, key) => {
      if (now > info.windowEnd) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.rateLimiters.delete(key));
  }

  private loadSecurityPolicies(): void {
    this.securityPolicies.set('enforce-https', {
      id: 'enforce-https',
      name: 'Enforce HTTPS',
      enabled: ConfigurationManager.getBoolean('AUTH_ENFORCE_HTTPS', true),
      config: {}
    });

    const allowedDomains = ConfigurationManager.getArray('AUTH_ALLOWED_DOMAINS');
    if (allowedDomains.length > 0) {
      this.securityPolicies.set('allowed-domains', {
        id: 'allowed-domains',
        name: 'Allowed Domains',
        enabled: true,
        config: { domains: allowedDomains }
      });
    }

    const restrictions = ConfigurationManager.getJSON<Record<string, string[]>>('AUTH_TYPE_RESTRICTIONS');
    if (restrictions) {
      const restrictionMap = new Map<string, AuthType[]>();
      Object.entries(restrictions).forEach(([domain, types]) => {
        const validTypes = types.map(t => {
          if (Object.values(AuthType).includes(t as AuthType)) {
            return t as AuthType;
          }
          return AuthType.CUSTOM;
        });
        restrictionMap.set(domain, validTypes);
      });

      this.securityPolicies.set('auth-type-restrictions', {
        id: 'auth-type-restrictions',
        name: 'Authentication Type Restrictions',
        enabled: true,
        config: { restrictions: restrictionMap }
      });
    }

    this.securityPolicies.set('validate-certificates', {
      id: 'validate-certificates',
      name: 'Validate Certificates',
      enabled: ConfigurationManager.getBoolean('AUTH_VALIDATE_CERTIFICATES', true),
      config: {
        allowSelfSigned: ConfigurationManager.getBoolean('AUTH_ALLOW_SELF_SIGNED', false),
        checkRevocation: ConfigurationManager.getBoolean('AUTH_CHECK_REVOCATION', true)
      }
    });

    this.securityPolicies.set('token-expiry', {
      id: 'token-expiry',
      name: 'Token Expiry Policy',
      enabled: true,
      config: {
        maxTokenAge: ConfigurationManager.getInt('AUTH_MAX_TOKEN_AGE', 86400000),
        refreshBuffer: ConfigurationManager.getInt('AUTH_REFRESH_BUFFER', 300000)
      }
    });

    this.securityPolicies.set('password-complexity', {
      id: 'password-complexity',
      name: 'Password Complexity',
      enabled: ConfigurationManager.getBoolean('AUTH_ENFORCE_PASSWORD_COMPLEXITY', false),
      config: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      }
    });
  }

  private resetMetrics(): void {
    this.metrics.totalAuthentications = 0;
    this.metrics.successfulAuthentications = 0;
    this.metrics.failedAuthentications = 0;
    this.metrics.tokenRefreshes = 0;
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
    this.metrics.averageAuthTime = 0;
    this.metrics.authenticationsByType.clear();
    this.metrics.errors = [];
    this.metrics.lastReset = new Date();
  }

  private generateCorrelationId(): string {
    return `auth-${Date.now()}-${randomBytes(8).toString('hex')}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${randomBytes(16).toString('hex')}`;
  }

  private async applyNTLMSessionAuth(
    request: RequestOptions,
    session: AuthenticationSession
  ): Promise<AuthenticationResult> {
    const credentials = session.metadata.credentials;
    if (!credentials) {
      throw new AuthenticationError('NTLM session credentials not found', 'MISSING_CREDENTIALS');
    }

    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = credentials;

    return {
      success: true,
      type: AuthType.NTLM,
      headers: { 'Authorization': request.headers['Authorization'] || credentials },
      sessionId: session.id,
      expiresAt: null,
      metadata: {
        authenticated: true,
        sessionAge: Date.now() - session.startTime.getTime()
      }
    };
  }

  public async handleChallengeResponse(
    challenge: AuthenticationChallenge,
    authConfig: AuthConfig,
    options?: AuthenticationOptions
  ): Promise<ChallengeResponse> {
    const startTime = performance.now();

    try {
      switch (challenge.type) {
        case 'www-authenticate':
          return await this.handleWWWAuthenticate(challenge, authConfig, options);

        case 'proxy-authenticate':
          return await this.handleProxyAuthenticate(challenge, authConfig, options);

        case 'x-amz-security-token':
          return await this.handleAWSSecurityToken(challenge, authConfig, options);

        case 'custom':
          return await this.handleCustomChallenge(challenge, authConfig, options);

        default:
          throw new AuthenticationError(`Unsupported challenge type: ${challenge.type}`, 'UNSUPPORTED_CHALLENGE');
      }
    } finally {
      const duration = performance.now() - startTime;
      this.logger.debug(`Challenge response handled in ${duration}ms`, {
        challengeType: challenge.type,
        authType: authConfig.type
      });
    }
  }

  private async handleWWWAuthenticate(
    challenge: AuthenticationChallenge,
    authConfig: AuthConfig,
    options?: AuthenticationOptions
  ): Promise<ChallengeResponse> {
    const authHeader = challenge.headers['www-authenticate'] || challenge.headers['WWW-Authenticate'];
    if (!authHeader) {
      throw new AuthenticationError('WWW-Authenticate header not found', 'MISSING_HEADER');
    }

    const schemeMatch = authHeader.match(/^(\w+)\s+(.*)$/);
    if (!schemeMatch) {
      throw new AuthenticationError('Invalid WWW-Authenticate header format', 'INVALID_HEADER');
    }

    const scheme = schemeMatch[1]?.toLowerCase() || '';
    const params = schemeMatch[2] || '';

    switch (scheme) {
      case 'basic':
        const basicAuthConfig = authConfig as unknown as BasicAuthConfig;
        return {
          type: 'basic',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${basicAuthConfig.username}:${basicAuthConfig.password}`).toString('base64')}`
          }
        };

      case 'digest':
        const digestConfig = { ...authConfig, challenge: authHeader, type: authConfig.type } as ExtendedDigestAuthConfig;
        const digestAuthConfig: AuthConfig = { ...digestConfig, type: authConfig.type };
        const digestResult = await this.applyDigestAuth(challenge.request, digestAuthConfig, options!);
        return {
          type: 'digest',
          headers: digestResult.headers
        };

      case 'ntlm':
        const ntlmConfig = { ...authConfig, type: authConfig.type } as unknown as NTLMAuthConfig;
        const sessionId = options?.sessionId || this.generateSessionId();
        const session = this.sessionCache.get(sessionId);

        const defaultOptions = options || {
          correlationId: this.generateCorrelationId(),
          retryCount: 0,
          maxRetries: this.config.maxRetries
        };
        
        if (schemeMatch && params && params.length > 100 && session) {
          session.metadata.challenge = params;
          const ntlmAuthConfig: AuthConfig = { ...ntlmConfig, type: authConfig.type };
          const ntlmResult = await this.applyNTLMAuth(challenge.request, ntlmAuthConfig, { ...defaultOptions, sessionId });
          return {
            type: 'ntlm',
            headers: ntlmResult.headers,
            sessionId: ntlmResult.sessionId || ''
          };
        } else {
          const ntlmAuthConfig: AuthConfig = { ...ntlmConfig, type: authConfig.type };
          const ntlmResult = await this.applyNTLMAuth(challenge.request, ntlmAuthConfig, { ...defaultOptions, sessionId });
          return {
            type: 'ntlm',
            headers: ntlmResult.headers,
            sessionId: ntlmResult.sessionId || ''
          };
        }

      case 'bearer':
        return {
          type: 'bearer',
          headers: {
            'Authorization': `Bearer ${(authConfig as ExtendedBearerAuthConfig).token}`
          }
        };

      case 'negotiate':
        return await this.handleWWWAuthenticate(
          { ...challenge, headers: { 'www-authenticate': 'NTLM' } },
          authConfig,
          options
        );

      default:
        throw new AuthenticationError(`Unsupported authentication scheme: ${scheme}`, 'UNSUPPORTED_SCHEME');
    }
  }

  private async handleProxyAuthenticate(
    challenge: AuthenticationChallenge,
    authConfig: AuthConfig,
    options?: AuthenticationOptions
  ): Promise<ChallengeResponse> {
    const proxyAuthHeader = challenge.headers['proxy-authenticate'] || challenge.headers['Proxy-Authenticate'];
    if (!proxyAuthHeader) {
      throw new AuthenticationError('Proxy-Authenticate header not found', 'MISSING_HEADER');
    }

    const response = await this.handleWWWAuthenticate(
      { ...challenge, headers: { 'www-authenticate': proxyAuthHeader } },
      authConfig,
      options
    );

    const headers: any = {};
    if (response.headers['Authorization']) {
      headers['Proxy-Authorization'] = response.headers['Authorization'];
    }

    return {
      ...response,
      headers
    };
  }

  private async handleAWSSecurityToken(
    challenge: AuthenticationChallenge,
    authConfig: AuthConfig,
    _options?: AuthenticationOptions
  ): Promise<ChallengeResponse> {
    const awsConfig = authConfig as AWSAuthConfig;

    const refreshResult = await this.awsHandler.refreshCredentials(awsConfig);

    awsConfig.sessionToken = refreshResult.sessionToken;

    const result = await this.awsHandler.signRequest(challenge.request, awsConfig);

    return {
      type: 'aws',
      headers: result.headers
    };
  }

  private async handleCustomChallenge(
    challenge: AuthenticationChallenge,
    authConfig: AuthConfig,
    _options?: AuthenticationOptions
  ): Promise<ChallengeResponse> {
    const customConfig = authConfig as ExtendedCustomAuthConfig;

    if (!customConfig.challengeHandler) {
      throw new AuthenticationError('Custom challenge handler not provided', 'MISSING_HANDLER');
    }

    const result = await customConfig.challengeHandler(challenge, customConfig.parameters || {});

    return {
      type: 'custom',
      headers: result.headers || {},
      metadata: result.metadata
    };
  }

  public getMetrics(): ExtendedAuthenticationMetrics {
    return { ...this.metrics };
  }

  public getAuditLog(filter?: {
    startDate?: Date;
    endDate?: Date;
    type?: AuthType;
    success?: boolean;
    correlationId?: string;
  }): AuthenticationAudit[] {
    let logs = [...this.auditLog];

    if (filter) {
      if (filter.startDate) {
        logs = logs.filter(log => log.timestamp >= filter.startDate!);
      }
      if (filter.endDate) {
        logs = logs.filter(log => log.timestamp <= filter.endDate!);
      }
      if (filter.type) {
        logs = logs.filter(log => log.type === filter.type);
      }
      if (filter.success !== undefined) {
        logs = logs.filter(log => log.success === filter.success);
      }
      if (filter.correlationId) {
        logs = logs.filter(log => log.correlationId === filter.correlationId);
      }
    }

    return logs;
  }

  public async exportAuditLog(format: 'json' | 'csv', path: string): Promise<void> {
    const logs = this.getAuditLog();

    if (format === 'json') {
      const fs = require('fs').promises;
      await fs.writeFile(path, JSON.stringify(logs, null, 2));
    } else if (format === 'csv') {
      const csv = this.convertAuditLogToCSV(logs);
      const fs = require('fs').promises;
      await fs.writeFile(path, csv);
    }
  }

  private convertAuditLogToCSV(logs: AuthenticationAudit[]): string {
    const headers = ['ID', 'Timestamp', 'Type', 'Success', 'Duration', 'Error', 'Correlation ID', 'Session ID', 'IP Address'];
    const rows = logs.map(log => [
      log.id,
      log.timestamp.toISOString(),
      log.type,
      log.success,
      log.duration || '',
      log.errorMessage || '',
      log.correlationId || '',
      log.metadata?.sessionId || '',
      log.metadata?.ipAddress || ''
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  public clearCaches(): void {
    this.tokenCache.clear();
    this.nonceCache.clear();
    this.sessionCache.clear();
    this.credentialStore.clear();
    this.logger.info('All authentication caches cleared');
  }

  public setProviderEnabled(providerId: string, enabled: boolean): void {
    const provider = this.activeProviders.get(providerId);
    if (provider) {
      provider.enabled = enabled;
      this.logger.info(`Authentication provider ${providerId} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  public registerProvider(provider: ExtendedAuthenticationProvider): void {
    if (this.activeProviders.has(provider.id)) {
      throw new Error(`Provider with ID ${provider.id} already exists`);
    }

    this.activeProviders.set(provider.id, provider);
    this.logger.info(`Registered custom authentication provider: ${provider.name}`);
  }

  public updateSecurityPolicy(policyId: string, config: Partial<ExtendedSecurityPolicy>): void {
    const policy = this.securityPolicies.get(policyId);
    if (!policy) {
      throw new Error(`Security policy ${policyId} not found`);
    }

    Object.assign(policy, config);
    this.logger.info(`Updated security policy: ${policyId}`);
  }

  public async testAuthentication(
    authConfig: AuthConfig,
    testUrl?: string
  ): Promise<{
    success: boolean;
    error?: string;
    duration: number;
    details: any;
  }> {
    const startTime = performance.now();
    const url = testUrl || ConfigurationManager.get('AUTH_TEST_URL', 'https://httpbin.org/get');

    try {
      const request: RequestOptions = {
        url,
        method: 'GET',
        headers: {}
      };

      const result = await this.applyAuthentication(request, authConfig);

      return {
        success: true,
        duration: performance.now() - startTime,
        details: {
          type: result.type,
          headers: Object.keys(result.headers || {}),
          expiresAt: result.expiresAt,
          metadata: result.metadata
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof AuthenticationError ? error.code : 'UNKNOWN_ERROR';
      const errorStack = error instanceof Error ? error.stack : undefined;

      return {
        success: false,
        error: errorMessage,
        duration: performance.now() - startTime,
        details: {
          errorCode,
          stack: errorStack
        }
      };
    }
  }

  public getProviderStatus(): Map<string, {
    enabled: boolean;
    lastUsed?: Date;
    successRate: number;
    totalRequests: number;
  }> {
    const status = new Map();

    this.activeProviders.forEach((provider, id) => {
      const authType = this.convertAuthenticationTypeToAuthType(provider.type);
      const typeMetrics = this.metrics.authenticationsByType.get(authType) || 0;

      status.set(id, {
        enabled: provider.enabled,
        lastUsed: provider.lastUsed,
        successRate: typeMetrics > 0 ?
          (this.metrics.successfulAuthentications / typeMetrics) * 100 : 0,
        totalRequests: typeMetrics
      });
    });

    return status;
  }

  private convertAuthenticationTypeToAuthType(type: AuthenticationType): AuthType {
    const mapping: Record<AuthenticationType, AuthType> = {
      'basic': AuthType.BASIC,
      'bearer': AuthType.BEARER,
      'apikey': AuthType.API_KEY,
      'oauth2': AuthType.OAUTH2,
      'certificate': AuthType.CERTIFICATE,
      'ntlm': AuthType.NTLM,
      'aws': AuthType.AWS,
      'digest': AuthType.DIGEST,
      'azure': AuthType.CUSTOM,
      'custom': AuthType.CUSTOM,
      'none': AuthType.CUSTOM
    };
    return mapping[type] || AuthType.CUSTOM;
  }

  public invalidateTokenCache(authConfig: AuthConfig): void {
    const cacheKey = this.generateCacheKey(authConfig.type, authConfig);
    if (this.tokenCache.has(cacheKey)) {
      this.tokenCache.delete(cacheKey);
      this.logger.info(`Invalidated token cache for ${authConfig.type}`);
    }
  }

  public getActiveSessions(): Map<string, AuthenticationSession> {
    return new Map(this.sessionCache);
  }

  public terminateSession(sessionId: string): boolean {
    if (this.sessionCache.has(sessionId)) {
      this.sessionCache.delete(sessionId);
      this.logger.info(`Terminated session: ${sessionId}`);
      return true;
    }
    return false;
  }

  public getSecurityPolicy(policyId: string): ExtendedSecurityPolicy | undefined {
    return this.securityPolicies.get(policyId);
  }

  public getAllSecurityPolicies(): Map<string, ExtendedSecurityPolicy> {
    return new Map(this.securityPolicies);
  }

  public async validateProviderConfig(providerId: string, config: any): Promise<boolean> {
    const provider = this.activeProviders.get(providerId);
    if (!provider || !provider.validate) {
      return false;
    }

    return await provider.validate('', config);
  }

  public async forceTokenRefresh(authConfig: AuthConfig): Promise<TokenRefreshResult> {
    const strategy = this.getAuthenticationStrategy(authConfig.type);
    if (!strategy || !strategy.refresh) {
      throw new AuthenticationError(
        `Token refresh not supported for ${authConfig.type}`,
        'REFRESH_NOT_SUPPORTED'
      );
    }

    this.metrics.tokenRefreshes++;
    const result = await strategy.refresh(authConfig);

    const cacheKey = this.generateCacheKey(authConfig.type, authConfig);
    if (result.accessToken) {
      this.addToTokenCache(cacheKey, {
        token: result.accessToken,
        refreshToken: result.refreshToken || undefined,
        expiresAt: result.expiresIn
          ? new Date(Date.now() + result.expiresIn * 1000)
          : undefined,
        scope: result.scope || undefined
      });
    }

    return result;
  }

  public getCacheStats(): {
    tokenCacheSize: number;
    nonceCacheSize: number;
    sessionCacheSize: number;
    credentialStoreSize: number;
    hitRate: number;
  } {
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = totalRequests > 0 ? (this.metrics.cacheHits / totalRequests) * 100 : 0;

    return {
      tokenCacheSize: this.tokenCache.size,
      nonceCacheSize: this.nonceCache.size,
      sessionCacheSize: this.sessionCache.size,
      credentialStoreSize: this.credentialStore.size,
      hitRate
    };
  }

  public async backupConfiguration(path: string): Promise<void> {
    const backup = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      providers: Array.from(this.activeProviders.entries()),
      securityPolicies: Array.from(this.securityPolicies.entries()),
      config: this.config,
      metrics: this.metrics
    };

    const fs = require('fs').promises;
    await fs.writeFile(path, JSON.stringify(backup, null, 2));
    this.logger.info(`Authentication configuration backed up to ${path}`);
  }

  public async restoreConfiguration(path: string): Promise<void> {
    const fs = require('fs').promises;
    const data = await fs.readFile(path, 'utf8');
    const backup = JSON.parse(data);

    backup.providers.forEach(([id, provider]: [string, any]) => {
      if (!this.activeProviders.has(id)) {
        this.activeProviders.set(id, provider);
      }
    });

    backup.securityPolicies.forEach(([id, policy]: [string, ExtendedSecurityPolicy]) => {
      this.securityPolicies.set(id, policy);
    });

    Object.assign(this.config, backup.config);

    this.logger.info(`Authentication configuration restored from ${path}`);
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: Map<string, boolean>;
    issues: string[];
  }> {
    const issues: string[] = [];
    const providerHealth = new Map<string, boolean>();

    for (const [id, provider] of this.activeProviders) {
      if (!provider.enabled) {
        providerHealth.set(id, false);
        continue;
      }

      try {
        const isHealthy = typeof provider.authenticate === 'function' &&
          typeof provider.validate === 'function';
        providerHealth.set(id, isHealthy);

        if (!isHealthy) {
          issues.push(`Provider ${id} is not properly configured`);
        }
      } catch (error) {
        providerHealth.set(id, false);
        issues.push(`Provider ${id} health check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.tokenCache.size > 10000) {
      issues.push('Token cache size exceeds recommended limit');
    }

    if (this.sessionCache.size > 5000) {
      issues.push('Session cache size exceeds recommended limit');
    }

    const healthyProviders = Array.from(providerHealth.values()).filter(h => h).length;
    const totalProviders = providerHealth.size;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyProviders === totalProviders && issues.length === 0) {
      status = 'healthy';
    } else if (healthyProviders >= totalProviders / 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      providers: providerHealth,
      issues
    };
  }
}
