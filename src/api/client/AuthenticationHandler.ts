// src/api/client/AuthenticationHandler.ts
import * as crypto from 'crypto';
import {
  AuthConfig,
  RequestOptions,
  BasicAuthCredentials,
  BearerAuthCredentials,
  ApiKeyAuthCredentials,
  OAuth2Credentials,
  NTLMCredentials,
  AWSCredentials,
  DigestAuthCredentials,
  HawkCredentials,
  Response
} from '../types/api.types';
import { CertificateManager } from './CertificateManager';
import { CSHttpClient } from './CSHttpClient';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class AuthenticationHandler {
  private static instance: AuthenticationHandler;
  private certificateManager: CertificateManager;
  private oauthTokenCache: Map<string, { token: string; expiresAt: number }> = new Map();
  private digestAuthCache: Map<string, DigestAuthChallenge> = new Map();
  private ntlmHandshakeCache: Map<string, NTLMHandshake> = new Map();

  constructor() {
    this.certificateManager = CertificateManager.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): AuthenticationHandler {
    if (!AuthenticationHandler.instance) {
      AuthenticationHandler.instance = new AuthenticationHandler();
    }
    return AuthenticationHandler.instance;
  }

  public async applyAuthentication(request: RequestOptions, auth: AuthConfig): Promise<RequestOptions> {
    ActionLogger.getInstance().debug(`Applying ${auth.type} authentication`);

    switch (auth.type) {
      case 'basic':
        return this.applyBasicAuth(request, auth.credentials as BasicAuthCredentials);
      
      case 'bearer':
        return this.applyBearerAuth(request, auth.credentials as BearerAuthCredentials);
      
      case 'apikey':
        return this.applyApiKeyAuth(request, auth.credentials as ApiKeyAuthCredentials);
      
      case 'oauth2':
        return await this.applyOAuth2Auth(request, auth.credentials as OAuth2Credentials);
      
      case 'certificate':
        return await this.applyCertificateAuth(request, auth.credentials);
      
      case 'ntlm':
        return await this.applyNTLMAuth(request, auth.credentials as NTLMCredentials);
      
      case 'aws':
        return this.applyAWSAuth(request, auth.credentials as AWSCredentials);
      
      case 'digest':
        return await this.applyDigestAuth(request, auth.credentials as DigestAuthCredentials);
      
      case 'hawk':
        return this.applyHawkAuth(request, auth.credentials as HawkCredentials);
      
      case 'custom':
        return this.applyCustomAuth(request, auth.credentials);
      
      default:
        throw new Error(`Unsupported authentication type: ${auth.type}`);
    }
  }

  private applyBasicAuth(request: RequestOptions, credentials: BasicAuthCredentials): RequestOptions {
    const authString = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
    
    if (!request.headers) {
      request.headers = {};
    }
    
    request.headers['Authorization'] = `Basic ${authString}`;
    
    ActionLogger.getInstance().debug('Basic authentication applied', { username: credentials.username });
    return request;
  }

  private applyBearerAuth(request: RequestOptions, credentials: BearerAuthCredentials): RequestOptions {
    if (!request.headers) {
      request.headers = {};
    }
    
    request.headers['Authorization'] = `Bearer ${credentials.token}`;
    
    ActionLogger.getInstance().debug('Bearer authentication applied');
    return request;
  }

  private applyApiKeyAuth(request: RequestOptions, credentials: ApiKeyAuthCredentials): RequestOptions {
    if (!request.headers) {
      request.headers = {};
    }

    switch (credentials.location) {
      case 'header':
        request.headers[credentials.key] = credentials.value;
        break;
      
      case 'query':
        const parsedUrl = new URL(request.url);
        parsedUrl.searchParams.set(credentials.key, credentials.value);
        request.url = parsedUrl.toString();
        break;
      
      case 'cookie':
        const existingCookie = request.headers['Cookie'] || '';
        const newCookie = `${credentials.key}=${credentials.value}`;
        request.headers['Cookie'] = existingCookie ? `${existingCookie}; ${newCookie}` : newCookie;
        break;
    }

    ActionLogger.getInstance().debug('API key authentication applied', { location: credentials.location });
    return request;
  }

  private async applyOAuth2Auth(request: RequestOptions, credentials: OAuth2Credentials): Promise<RequestOptions> {
    const token = await this.getOAuth2Token(credentials);
    
    if (!request.headers) {
      request.headers = {};
    }
    
    request.headers['Authorization'] = `Bearer ${token}`;
    
    ActionLogger.getInstance().debug('OAuth2 authentication applied', { grantType: credentials.grantType });
    return request;
  }

  private async getOAuth2Token(credentials: OAuth2Credentials): Promise<string> {
    const cacheKey = this.getOAuth2CacheKey(credentials);
    const cached = this.oauthTokenCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      ActionLogger.getInstance().debug('Using cached OAuth2 token');
      return cached.token;
    }

    ActionLogger.getInstance().debug('Fetching new OAuth2 token', { grantType: credentials.grantType });
    
    const tokenRequest = this.buildOAuth2TokenRequest(credentials);
    const httpClient = CSHttpClient.getInstance();
    const response = await httpClient.request(tokenRequest);
    
    if (response.status !== 200) {
      throw new Error(`OAuth2 token request failed: ${response.status} ${response.statusText}`);
    }

    const tokenData = response.body;
    const token = tokenData.access_token || tokenData.token;
    
    if (!token) {
      throw new Error('OAuth2 response missing access token');
    }

    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = Date.now() + (expiresIn * 1000) - 60000; // Subtract 1 minute for safety
    
    this.oauthTokenCache.set(cacheKey, { token, expiresAt });
    
    ActionLogger.getInstance().info('OAuth2 token obtained successfully');
    return token;
  }

  private buildOAuth2TokenRequest(credentials: OAuth2Credentials): RequestOptions {
    const params: Record<string, string> = {
      grant_type: credentials.grantType || 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    };

    if (credentials.scope) {
      params['scope'] = credentials.scope;
    }

    switch (credentials.grantType) {
      case 'password':
        if (!credentials.username || !credentials.password) {
          throw new Error('Username and password required for password grant');
        }
        params['username'] = credentials.username;
        params['password'] = credentials.password;
        break;
      
      case 'authorization_code':
        if (!credentials.authorizationCode || !credentials.redirectUri) {
          throw new Error('Authorization code and redirect URI required');
        }
        params['code'] = credentials.authorizationCode;
        params['redirect_uri'] = credentials.redirectUri;
        break;
      
      case 'refresh_token':
        if (!credentials.refreshToken) {
          throw new Error('Refresh token required');
        }
        params['refresh_token'] = credentials.refreshToken;
        break;
    }

    return {
      url: credentials.tokenUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(params).toString()
    };
  }

  private getOAuth2CacheKey(credentials: OAuth2Credentials): string {
    const parts = [
      credentials.tokenUrl,
      credentials.clientId,
      credentials.grantType,
      credentials.scope,
      credentials.username
    ].filter(Boolean);
    
    return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
  }

  private async applyCertificateAuth(request: RequestOptions, certificateConfig: any): Promise<RequestOptions> {
    const cert = await this.certificateManager.loadCertificate(certificateConfig);
    request.cert = cert;
    
    ActionLogger.getInstance().debug('Certificate authentication applied');
    return request;
  }

  private async applyNTLMAuth(request: RequestOptions, credentials: NTLMCredentials): Promise<RequestOptions> {
    // NTLM requires a multi-step handshake process
    const handshakeKey = `${request.url}:${credentials.username}`;
    let handshake = this.ntlmHandshakeCache.get(handshakeKey);
    
    if (!handshake) {
      handshake = {
        type1: this.createNTLMType1Message(credentials),
        credentials
      };
      this.ntlmHandshakeCache.set(handshakeKey, handshake);
    }

    if (!request.headers) {
      request.headers = {};
    }

    // For initial request, send Type 1 message
    if (!handshake.type3) {
      request.headers['Authorization'] = `NTLM ${handshake.type1}`;
      ActionLogger.getInstance().debug('NTLM Type 1 message sent');
    } else {
      // For subsequent requests, use Type 3 message
      request.headers['Authorization'] = `NTLM ${handshake.type3}`;
      ActionLogger.getInstance().debug('NTLM Type 3 message sent');
    }

    return request;
  }

  private createNTLMType1Message(credentials: NTLMCredentials): string {
    // NTLM Type 1 message structure
    const NTLMSSP_NEGOTIATE = 0x00000001;
    const NTLM_NEGOTIATE_OEM = 0x00000002;
    const NTLM_NEGOTIATE_UNICODE = 0x00000001;
    const NTLM_NEGOTIATE_ALWAYS_SIGN = 0x00008000;
    const NTLM_NEGOTIATE_NTLM = 0x00000200;
    const NTLM_NEGOTIATE_WORKSTATION = 0x00002000;
    const NTLM_NEGOTIATE_DOMAIN = 0x00001000;
    
    const flags = NTLMSSP_NEGOTIATE | NTLM_NEGOTIATE_OEM | NTLM_NEGOTIATE_UNICODE |
                  NTLM_NEGOTIATE_ALWAYS_SIGN | NTLM_NEGOTIATE_NTLM | 
                  NTLM_NEGOTIATE_WORKSTATION | NTLM_NEGOTIATE_DOMAIN;

    const domain = credentials.domain.toUpperCase();
    const workstation = credentials.workstation || 'WORKSTATION';
    
    // Build Type 1 message
    const type1 = Buffer.alloc(32 + domain.length + workstation.length);
    
    // Signature
    type1.write('NTLMSSP\0', 0, 'ascii');
    
    // Type
    type1.writeUInt32LE(1, 8);
    
    // Flags
    type1.writeUInt32LE(flags, 12);
    
    // Domain
    type1.writeUInt16LE(domain.length, 16);
    type1.writeUInt16LE(domain.length, 18);
    type1.writeUInt32LE(32, 20);
    
    // Workstation
    type1.writeUInt16LE(workstation.length, 24);
    type1.writeUInt16LE(workstation.length, 26);
    type1.writeUInt32LE(32 + domain.length, 28);
    
    // Write domain and workstation
    type1.write(domain, 32, 'ascii');
    type1.write(workstation, 32 + domain.length, 'ascii');
    
    return type1.toString('base64');
  }

  public async handleNTLMChallenge(response: Response, request: RequestOptions): Promise<RequestOptions> {
    const authHeader = response.headers['www-authenticate'];
    if (!authHeader || !authHeader.toString().startsWith('NTLM ')) {
      throw new Error('Invalid NTLM challenge response');
    }

    const challenge = authHeader.toString().substring(5);
    const handshakeKey = Object.keys(this.ntlmHandshakeCache).find(key => key.startsWith(request.url));
    
    if (!handshakeKey) {
      throw new Error('NTLM handshake not found');
    }

    const handshake = this.ntlmHandshakeCache.get(handshakeKey)!;
    const type2 = Buffer.from(challenge, 'base64');
    
    // Parse Type 2 message and create Type 3 response
    const type3 = this.createNTLMType3Message(type2, handshake.credentials);
    handshake.type3 = type3;
    
    request.headers!['Authorization'] = `NTLM ${type3}`;
    
    ActionLogger.getInstance().debug('NTLM Type 3 message created');
    return request;
  }

  private createNTLMType3Message(type2: Buffer, credentials: NTLMCredentials): string {
    // Parse Type 2 message
    if (type2.toString('ascii', 0, 8) !== 'NTLMSSP\0' || type2.readUInt32LE(8) !== 2) {
      throw new Error('Invalid NTLM Type 2 message');
    }

    const targetNameLen = type2.readUInt16LE(12);
    const targetNameOffset = type2.readUInt32LE(16);
    const flags = type2.readUInt32LE(20);
    const challenge = type2.slice(24, 32);
    
    // Generate responses
    const timestamp = this.getNTLMTimestamp();
    const clientChallenge = crypto.randomBytes(8);
    
    const ntlmHash = this.getNTLMHash(credentials.password);
    const ntlmV2Hash = this.getNTLMv2Hash(ntlmHash, credentials.username, credentials.domain);
    
    const ntlmV2Response = this.calculateNTLMv2Response(
      ntlmV2Hash,
      challenge,
      clientChallenge,
      timestamp,
      type2.slice(targetNameOffset, targetNameOffset + targetNameLen)
    );

    // Build Type 3 message
    const domain = credentials.domain.toUpperCase();
    const username = credentials.username;
    const workstation = credentials.workstation || 'WORKSTATION';
    
    const domainBytes = Buffer.from(domain, 'utf16le');
    const usernameBytes = Buffer.from(username, 'utf16le');
    const workstationBytes = Buffer.from(workstation, 'utf16le');
    
    const type3Length = 64 + domainBytes.length + usernameBytes.length + 
                       workstationBytes.length + ntlmV2Response.length;
    const type3 = Buffer.alloc(type3Length);
    
    // Signature
    type3.write('NTLMSSP\0', 0, 'ascii');
    
    // Type
    type3.writeUInt32LE(3, 8);
    
    // LM Response (not used in NTLMv2)
    type3.writeUInt16LE(0, 12);
    type3.writeUInt16LE(0, 14);
    type3.writeUInt32LE(64, 16);
    
    // NTLM Response
    type3.writeUInt16LE(ntlmV2Response.length, 20);
    type3.writeUInt16LE(ntlmV2Response.length, 22);
    type3.writeUInt32LE(64, 24);
    
    // Domain
    type3.writeUInt16LE(domainBytes.length, 28);
    type3.writeUInt16LE(domainBytes.length, 30);
    type3.writeUInt32LE(64 + ntlmV2Response.length, 32);
    
    // Username
    type3.writeUInt16LE(usernameBytes.length, 36);
    type3.writeUInt16LE(usernameBytes.length, 38);
    type3.writeUInt32LE(64 + ntlmV2Response.length + domainBytes.length, 40);
    
    // Workstation
    type3.writeUInt16LE(workstationBytes.length, 44);
    type3.writeUInt16LE(workstationBytes.length, 46);
    type3.writeUInt32LE(64 + ntlmV2Response.length + domainBytes.length + usernameBytes.length, 48);
    
    // Session Key (not used)
    type3.writeUInt16LE(0, 52);
    type3.writeUInt16LE(0, 54);
    type3.writeUInt32LE(64 + ntlmV2Response.length + domainBytes.length + usernameBytes.length + workstationBytes.length, 56);
    
    // Flags
    type3.writeUInt32LE(flags, 60);
    
    // Write data
    let offset = 64;
    ntlmV2Response.copy(type3, offset);
    offset += ntlmV2Response.length;
    domainBytes.copy(type3, offset);
    offset += domainBytes.length;
    usernameBytes.copy(type3, offset);
    offset += usernameBytes.length;
    workstationBytes.copy(type3, offset);
    
    return type3.toString('base64');
  }

  private getNTLMHash(password: string): Buffer {
    const passwordBytes = Buffer.from(password, 'utf16le');
    return crypto.createHash('md4').update(passwordBytes).digest();
  }

  private getNTLMv2Hash(ntlmHash: Buffer, username: string, domain: string): Buffer {
    const usernameBytes = Buffer.from(username.toUpperCase(), 'utf16le');
    const domainBytes = Buffer.from(domain, 'utf16le');
    const identity = Buffer.concat([usernameBytes, domainBytes]);
    
    return crypto.createHmac('md5', ntlmHash).update(identity).digest();
  }

  private calculateNTLMv2Response(
    hash: Buffer,
    serverChallenge: Buffer,
    clientChallenge: Buffer,
    timestamp: Buffer,
    targetInfo: Buffer
  ): Buffer {
    const temp = Buffer.concat([
      Buffer.from([0x01, 0x01, 0x00, 0x00]), // Signature
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // Reserved
      timestamp,
      clientChallenge,
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // Reserved
      targetInfo,
      Buffer.from([0x00, 0x00, 0x00, 0x00]) // Reserved
    ]);
    
    const ntProofStr = crypto.createHmac('md5', hash)
      .update(Buffer.concat([serverChallenge, temp]))
      .digest();
    
    return Buffer.concat([ntProofStr, temp]);
  }

  private getNTLMTimestamp(): Buffer {
    // Windows FILETIME: 100-nanosecond intervals since January 1, 1601
    const EPOCH_DIFFERENCE = 11644473600000;
    const timestamp = Date.now() + EPOCH_DIFFERENCE;
    const filetime = timestamp * 10000;
    
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(filetime & 0xffffffff, 0);
    buffer.writeUInt32LE((filetime / 0x100000000) & 0xffffffff, 4);
    
    return buffer;
  }

  private applyAWSAuth(request: RequestOptions, credentials: AWSCredentials): RequestOptions {
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = timestamp.substring(0, 8);
    const credentialScope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;
    
    if (!request.headers) {
      request.headers = {};
    }

    // Add required headers
    request.headers['X-Amz-Date'] = timestamp;
    if (credentials.sessionToken) {
      request.headers['X-Amz-Security-Token'] = credentials.sessionToken;
    }

    // Create canonical request
    const parsedUrl = new URL(request.url);
    const canonicalUri = parsedUrl.pathname || '/';
    const canonicalQueryString = this.createCanonicalQueryString(parsedUrl.searchParams);
    const canonicalHeaders = this.createCanonicalHeaders(request.headers, parsedUrl.hostname);
    const signedHeaders = Object.keys(canonicalHeaders).sort().join(';');
    
    const payload = request.body ? 
      (typeof request.body === 'string' ? request.body : JSON.stringify(request.body)) : '';
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    
    const canonicalRequest = [
      request.method,
      canonicalUri,
      canonicalQueryString,
      Object.entries(canonicalHeaders)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('\n') + '\n',
      signedHeaders,
      payloadHash
    ].join('\n');

    // Create string to sign
    const canonicalRequestHash = crypto.createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');
    
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      canonicalRequestHash
    ].join('\n');

    // Calculate signature
    const signingKey = this.getAWSSignatureKey(
      credentials.secretAccessKey,
      dateStamp,
      credentials.region,
      credentials.service
    );
    
    const signature = crypto.createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    // Add authorization header
    request.headers['Authorization'] = [
      'AWS4-HMAC-SHA256',
      `Credential=${credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(' ');

    ActionLogger.getInstance().debug('AWS Signature V4 authentication applied', {
      region: credentials.region,
      service: credentials.service
    });

    return request;
  }

  private createCanonicalQueryString(params: URLSearchParams): string {
    const sorted = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return sorted;
  }

  private createCanonicalHeaders(headers: Record<string, string>, host: string): Record<string, string> {
    const canonical: Record<string, string> = {
      host: host
    };

    Object.entries(headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('x-amz-') || lowerKey === 'content-type') {
        canonical[lowerKey] = value.trim();
      }
    });

    return canonical;
  }

  private getAWSSignatureKey(
    secretKey: string,
    dateStamp: string,
    region: string,
    service: string
  ): Buffer {
    const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`)
      .update(dateStamp)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate)
      .update(region)
      .digest();
    const kService = crypto.createHmac('sha256', kRegion)
      .update(service)
      .digest();
    const kSigning = crypto.createHmac('sha256', kService)
      .update('aws4_request')
      .digest();
    
    return kSigning;
  }

  private async applyDigestAuth(request: RequestOptions, credentials: DigestAuthCredentials): Promise<RequestOptions> {
    // Check if we have a cached challenge for this URL
    const cacheKey = `${request.url}:${credentials.username}`;
    const cachedChallenge = this.digestAuthCache.get(cacheKey);
    
    if (cachedChallenge && cachedChallenge.nc < 99999999) {
      // Use cached challenge
      const authHeader = this.createDigestAuthHeader(
        request,
        credentials,
        cachedChallenge
      );
      
      if (!request.headers) {
        request.headers = {};
      }
      request.headers['Authorization'] = authHeader;
      
      // Increment nonce counter
      cachedChallenge.nc++;
      
      ActionLogger.getInstance().debug('Digest authentication applied (cached)', { username: credentials.username });
    } else {
      // Need to get challenge first
      ActionLogger.getInstance().debug('Digest authentication requires challenge', { username: credentials.username });
    }
    
    return request;
  }

  public async handleDigestChallenge(response: Response, request: RequestOptions): Promise<RequestOptions> {
    const authHeader = response.headers['www-authenticate'];
    if (!authHeader || !authHeader.toString().toLowerCase().startsWith('digest ')) {
      throw new Error('Invalid digest challenge response');
    }

    const challenge = this.parseDigestChallenge(authHeader.toString());
    const credentials = this.findDigestCredentials(request);
    
    if (!credentials) {
      throw new Error('Digest credentials not found');
    }

    // Cache the challenge
    const cacheKey = `${request.url}:${credentials.username}`;
    this.digestAuthCache.set(cacheKey, { ...challenge, nc: 1 });
    
    // Create authorization header
    const authHeaderValue = this.createDigestAuthHeader(request, credentials, challenge);
    
    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = authHeaderValue;
    
    ActionLogger.getInstance().debug('Digest authentication challenge handled');
    return request;
  }

  private parseDigestChallenge(header: string): DigestAuthChallenge {
    const challenge: any = {};
    const regex = /(\w+)=(?:"([^"]+)"|([^,\s]+))/g;
    let match;
    
    while ((match = regex.exec(header)) !== null) {
      const key = match[1];
      const value = match[2] || match[3];
      if (key) {
        challenge[key] = value;
      }
    }
    
    return {
      realm: challenge.realm || '',
      nonce: challenge.nonce || '',
      qop: challenge.qop,
      opaque: challenge.opaque,
      algorithm: challenge.algorithm || 'MD5',
      stale: challenge.stale === 'true',
      nc: 0
    };
  }

  private createDigestAuthHeader(
    request: RequestOptions,
    credentials: DigestAuthCredentials,
    challenge: DigestAuthChallenge
  ): string {
    const parsedUrl = new URL(request.url);
    const uri = parsedUrl.pathname + parsedUrl.search;
    const nc = String(challenge.nc).padStart(8, '0');
    const cnonce = crypto.randomBytes(16).toString('hex');
    
    let ha1: string;
    if (challenge.algorithm === 'MD5-sess') {
      const initialHa1 = crypto.createHash('md5')
        .update(`${credentials.username}:${challenge.realm}:${credentials.password}`)
        .digest('hex');
      ha1 = crypto.createHash('md5')
        .update(`${initialHa1}:${challenge.nonce}:${cnonce}`)
        .digest('hex');
    } else {
      ha1 = crypto.createHash('md5')
        .update(`${credentials.username}:${challenge.realm}:${credentials.password}`)
        .digest('hex');
    }
    
    const ha2 = crypto.createHash('md5')
      .update(`${request.method}:${uri}`)
      .digest('hex');
    
    let response: string;
    if (challenge.qop === 'auth' || challenge.qop === 'auth-int') {
      response = crypto.createHash('md5')
        .update(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
        .digest('hex');
    } else {
      response = crypto.createHash('md5')
        .update(`${ha1}:${challenge.nonce}:${ha2}`)
        .digest('hex');
    }
    
    const authParams = [
      `username="${credentials.username}"`,
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `uri="${uri}"`,
      `response="${response}"`,
      `algorithm=${challenge.algorithm}`
    ];
    
    if (challenge.qop) {
      authParams.push(`qop=${challenge.qop}`);
      authParams.push(`nc=${nc}`);
      authParams.push(`cnonce="${cnonce}"`);
    }
    
    if (challenge.opaque) {
      authParams.push(`opaque="${challenge.opaque}"`);
    }
    
    return `Digest ${authParams.join(', ')}`;
  }

  private findDigestCredentials(_request: RequestOptions): DigestAuthCredentials | null {
    // This would need to be passed in the request somehow
    // For now, returning null
    return null;
  }

  private applyHawkAuth(request: RequestOptions, credentials: HawkCredentials): RequestOptions {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(6).toString('base64');
    const parsedUrl = new URL(request.url);
    
    const artifacts = {
      ts: timestamp,
      nonce: nonce,
      method: request.method,
      resource: parsedUrl.pathname + parsedUrl.search,
      host: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
      hash: '',
      ext: '',
      app: '',
      dlg: ''
    };
    
    // Calculate payload hash if body exists
    if (request.body) {
      const payload = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      artifacts.hash = crypto.createHash('sha256').update(payload).digest('base64');
    }
    
    // Create auth string
    const authString = [
      'hawk.1.header',
      artifacts.ts,
      artifacts.nonce,
      artifacts.method.toUpperCase(),
      artifacts.resource,
      artifacts.host.toLowerCase(),
      artifacts.port,
      artifacts.hash,
      artifacts.ext
    ].join('\n') + '\n';
    
    // Calculate MAC
    const mac = crypto.createHmac(credentials.algorithm || 'sha256', credentials.key)
      .update(authString)
      .digest('base64');
    
    // Build authorization header
    const authHeader = [
      `id="${credentials.id}"`,
      `ts="${artifacts.ts}"`,
      `nonce="${artifacts.nonce}"`,
      `mac="${mac}"`
    ];
    
    if (artifacts.hash) {
      authHeader.push(`hash="${artifacts.hash}"`);
    }
    
    if (!request.headers) {
      request.headers = {};
    }
    request.headers['Authorization'] = `Hawk ${authHeader.join(', ')}`;
    
    ActionLogger.getInstance().debug('Hawk authentication applied');
    return request;
  }

  private applyCustomAuth(request: RequestOptions, customAuth: any): RequestOptions {
    if (typeof customAuth.apply === 'function') {
      return customAuth.apply(request);
    }
    
    throw new Error('Custom authentication must provide an apply function');
  }

  public clearCache(): void {
    this.oauthTokenCache.clear();
    this.digestAuthCache.clear();
    this.ntlmHandshakeCache.clear();
    ActionLogger.getInstance().info('Authentication cache cleared');
  }
  
  /**
   * REAL IMPLEMENTATION: Clear expired tokens to prevent memory leaks
   */
  clearExpiredTokens(): void {
    const now = Date.now();
    let expiredOAuthTokens = 0;
    let expiredDigestTokens = 0;
    
    // Clear expired OAuth tokens
    for (const [key, tokenData] of this.oauthTokenCache.entries()) {
      if (tokenData.expiresAt <= now) {
        this.oauthTokenCache.delete(key);
        expiredOAuthTokens++;
      }
    }
    
    // Clear old digest auth challenges (using nc count heuristic)
    for (const [key, challenge] of this.digestAuthCache.entries()) {
      // Use a heuristic - if nc is very high, it's probably old
      if (challenge.nc > 1000) {
        this.digestAuthCache.delete(key);
        expiredDigestTokens++;
      }
    }
    
    // Clear old NTLM handshakes (no expiration logic, just limit count)
    const MAX_NTLM_HANDSHAKES = 100;
    if (this.ntlmHandshakeCache.size > MAX_NTLM_HANDSHAKES) {
      const toDelete = this.ntlmHandshakeCache.size - MAX_NTLM_HANDSHAKES;
      const keys = Array.from(this.ntlmHandshakeCache.keys()).slice(0, toDelete);
      keys.forEach(key => this.ntlmHandshakeCache.delete(key));
    }
    
    ActionLogger.getInstance().info('Authentication expired tokens cleared', {
      operation: 'auth_token_cleanup',
      expiredOAuthTokens,
      expiredDigestTokens,
      remainingOAuth: this.oauthTokenCache.size,
      remainingDigest: this.digestAuthCache.size,
      remainingNTLM: this.ntlmHandshakeCache.size
    });
  }
}

interface DigestAuthChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm: string;
  stale: boolean;
  nc: number;
}

interface NTLMHandshake {
  type1: string;
  type3?: string;
  credentials: NTLMCredentials;
}