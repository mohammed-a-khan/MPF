/**
 * CS Test Automation Framework - Authentication Type Definitions
 * 
 * Comprehensive type definitions for all authentication mechanisms
 * supporting 10+ authentication methods with full configuration options.
 */

export type AuthenticationType = 
  | 'none'
  | 'basic'
  | 'bearer'
  | 'apikey'
  | 'oauth2'
  | 'certificate'
  | 'ntlm'
  | 'digest'
  | 'aws'
  | 'azure'
  | 'custom';

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

export type CertificateFormat = 
  | 'pem'
  | 'der'
  | 'p12'
  | 'pfx'
  | 'jks'
  | 'cer'
  | 'crt';

export type KeyFormat = 
  | 'pem'
  | 'der'
  | 'pkcs8';

export type APIKeyLocation = 
  | 'header'
  | 'query'
  | 'cookie';

// Base AuthConfig interface
export interface AuthConfig {
  type: AuthType;
  enabled?: boolean | undefined;
}

export interface AuthenticationConfig {
  type: AuthenticationType;
  config: AuthTypeConfig;
  retry?: AuthRetryConfig | undefined;
  cache?: AuthCacheConfig | undefined;
  proxy?: AuthProxyConfig | undefined;
}

export type AuthTypeConfig = 
  | BasicAuthConfig
  | BearerAuthConfig
  | APIKeyAuthConfig
  | OAuth2AuthConfig
  | CertificateAuthConfig
  | NTLMAuthConfig
  | DigestAuthConfig
  | AWSAuthConfig
  | AzureAuthConfig
  | CustomAuthConfig
  | HawkAuthConfig
  | JWTAuthConfig;

export interface BasicAuthConfig {
  username: string;
  password: string;
  encoding?: 'utf-8' | 'iso-8859-1' | undefined;
  preemptive?: boolean | undefined;
  realm?: string | undefined;
  type?: AuthType | undefined;
}

export interface BearerAuthConfig {
  token: string;
  scheme?: string | undefined; // Default: 'Bearer'
  headerName?: string | undefined; // Default: 'Authorization'
  expiresAt?: Date | undefined;
  refreshToken?: string | undefined;
  refreshUrl?: string | undefined;
  scope?: string | undefined;
  type?: AuthType | undefined;
}

export interface APIKeyAuthConfig {
  key: string;
  value: string;
  location: APIKeyLocation;
  parameterName?: string | undefined;
  // Extended properties
  apiKey?: string | undefined;
  keyName?: string | undefined;
  type?: AuthType | undefined;
}

export interface OAuth2AuthConfig {
  grantType: OAuth2GrantType;
  clientId: string;
  clientSecret?: string | undefined;
  tokenUrl: string;
  authorizationUrl?: string | undefined;
  redirectUri?: string | undefined;
  scope?: string | string[] | undefined;
  audience?: string | undefined;
  resource?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  refreshToken?: string | undefined;
  code?: string | undefined;
  codeVerifier?: string | undefined;
  codeChallenge?: string | undefined;
  codeChallengeMethod?: 'plain' | 'S256' | undefined;
  deviceCode?: string | undefined;
  interval?: number | undefined;
  additionalParams?: Record<string, string> | undefined;
  tokenExchangeOptions?: TokenExchangeOptions | undefined;
}

export interface TokenExchangeOptions {
  subjectToken: string;
  subjectTokenType: string;
  actorToken?: string | undefined;
  actorTokenType?: string | undefined;
  requestedTokenType?: string | undefined;
}

export interface CertificateAuthConfig {
  certPath?: string | undefined;
  certContent?: string | Buffer | undefined;
  keyPath?: string | undefined;
  keyContent?: string | Buffer | undefined;
  passphrase?: string | undefined;
  caPath?: string | undefined;
  caContent?: string | Buffer | undefined;
  format?: CertificateFormat | undefined;
  encoding?: 'base64' | 'hex' | 'utf8' | undefined;
  rejectUnauthorized?: boolean | undefined;
  checkServerIdentity?: boolean | undefined;
  ciphers?: string | undefined;
  minVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3' | undefined;
  // Additional properties for extended functionality
  cert?: string | Buffer | undefined;
  key?: string | Buffer | undefined;
  ca?: string | Buffer | undefined;
  headers?: Record<string, string> | undefined;
  type?: AuthType | undefined;
}

// Certificate Result Interface for APIAuthenticationHandler
export interface CertificateAuthResult {
  agent?: any;
  headers?: Record<string, string> | undefined;
  validUntil?: Date | null | undefined;
  subject?: string | undefined;
  issuer?: string | undefined;
  serialNumber?: string | undefined;
  fingerprint?: string | undefined;
}

// Certificate-related interfaces
export interface CertificateInfo {
  certificate: string;
  privateKey: string;
  ca?: string[] | undefined;
  format: CertificateFormat;
  raw: Buffer;
  chain?: string[] | undefined;
  friendlyName?: string | undefined;
}

export interface CertificateValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  certificate?: {
    subject: string;
    issuer: string;
    serialNumber: string;
    validFrom: Date;
    validTo: Date;
    fingerprint: string;
    signatureAlgorithm: string;
    keyUsage?: CertificateUsage | undefined;
    extendedKeyUsage?: ExtendedKeyUsage | undefined;
    subjectAlternativeNames?: SubjectAlternativeName[] | undefined;
  } | undefined;
  validationTime: number;
}

export interface CertificateStore {
  id: string;
  info: CertificateInfo;
  loadedAt: Date;
  lastUsed: Date;
  usageCount: number;
}

export interface TrustStore {
  certificate: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  trusted: boolean;
  source: string;
}

export class CertificateError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'CertificateError';
  }
}

export interface PKCS12Info {
  certificate: string;
  privateKey: string;
  ca?: string[] | undefined;
  friendlyName?: string | undefined;
}

export interface CertificateMetrics {
  certificatesLoaded: number;
  certificatesValidated: number;
  certificatesFailed: number;
  revocationChecks: number;
  cacheHits: number;
  cacheMisses: number;
  averageValidationTime: number;
  validationErrors: string[];
  lastReset: Date;
}

export interface CertificateCache {
  certificate: CertificateInfo;
  validUntil: Date;
  lastAccessed: Date;
}

export interface ValidationOptions {
  checkRevocation?: boolean | undefined;
  hostname?: string | undefined;
  allowCA?: boolean | undefined;
}

export interface CertificateUsage {
  digitalSignature: boolean;
  nonRepudiation: boolean;
  keyEncipherment: boolean;
  dataEncipherment: boolean;
  keyAgreement: boolean;
  keyCertSign: boolean;
  cRLSign: boolean;
  encipherOnly: boolean;
  decipherOnly: boolean;
}

export interface ExtendedKeyUsage {
  serverAuth: boolean;
  clientAuth: boolean;
  codeSigning: boolean;
  emailProtection: boolean;
  timeStamping: boolean;
  ocspSigning: boolean;
}

export interface RevocationCheckResult {
  checked: boolean;
  isRevoked: boolean;
  reason?: string | undefined;
  revocationTime?: Date | undefined;
  error?: string | undefined;
  checkTime?: number | undefined;
}

export interface OCSPResponse {
  status: 'good' | 'revoked' | 'unknown';
  revocationReason?: string | undefined;
  revocationTime?: Date | undefined;
  validUntil: Date;
  responseTime: Date;
}

export interface CRLInfo {
  version: number;
  issuer: string;
  thisUpdate: Date;
  nextUpdate: Date;
  revokedCertificates: Array<{
    serialNumber: string;
    revocationDate: Date;
    reason?: string | undefined;
  }>;
  signatureAlgorithm: string;
}

export interface SubjectAlternativeName {
  type: 'dns' | 'ip' | 'email' | 'uri';
  value: string;
}

export interface PublicKeyInfo {
  algorithm: string;
  size: number;
  exponent?: number | undefined;
  modulus?: string | undefined;
  curve?: string | undefined;
}

export interface CertificateConstraints {
  ca: boolean;
  pathLength?: number | undefined;
  keyUsage?: string[] | undefined;
  extendedKeyUsage?: string[] | undefined;
}

// Additional certificate-related types
export interface CertificateBundle {
  certificates: CertificateInfo[];
  trustChain: string[];
}

export interface CertificateValidityPeriod {
  notBefore: Date;
  notAfter: Date;
}

// OAuth2 specific types
export enum OAuth2GrantType {
  AUTHORIZATION_CODE = 'authorization_code',
  IMPLICIT = 'implicit',
  PASSWORD = 'password',
  CLIENT_CREDENTIALS = 'client_credentials',
  REFRESH_TOKEN = 'refresh_token',
  DEVICE_CODE = 'urn:ietf:params:oauth:grant-type:device_code',
  JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer',
  SAML2_BEARER = 'urn:ietf:params:oauth:grant-type:saml2-bearer',
  TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange'
}

export interface OAuth2Config {
  grantType: OAuth2GrantType;
  clientId: string;
  clientSecret?: string | undefined;
  tokenUrl?: string | undefined;
  authorizationUrl?: string | undefined;
  redirectUri?: string | undefined;
  scope?: string | undefined;
  audience?: string | undefined;
  resource?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  refreshToken?: string | undefined;
  authorizationCode?: string | undefined;
  codeVerifier?: string | undefined;
  codeChallenge?: string | undefined;
  codeChallengeMethod?: 'plain' | 'S256' | undefined;
  deviceCode?: string | undefined;
  deviceAuthorizationUrl?: string | undefined;
  interval?: number | undefined;
  privateKey?: string | undefined;
  algorithm?: string | undefined;
  keyId?: string | undefined;
  subject?: string | undefined;
  jwtAssertion?: string | undefined;
  samlAssertion?: string | undefined;
  subjectToken?: string | undefined;
  subjectTokenType?: string | undefined;
  actorToken?: string | undefined;
  actorTokenType?: string | undefined;
  requestedTokenType?: string | undefined;
  clientAuthMethod?: string | undefined;
  prompt?: string | undefined;
  loginHint?: string | undefined;
  maxAge?: number | undefined;
  uiLocales?: string | undefined;
  acrValues?: string | undefined;
  nonce?: string | undefined;
  additionalParameters?: Record<string, string> | undefined;
  additionalClaims?: Record<string, any> | undefined;
  introspectionUrl?: string | undefined;
  revocationUrl?: string | undefined;
  provider?: string | undefined;
  type?: AuthType | undefined;
}

export interface OAuth2Token {
  access_token: string;
  token_type: string;
  expires_in?: number | undefined;
  expires_at?: Date | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
  id_token?: string | undefined;
  iss?: string | undefined;
  aud?: string | string[] | undefined;
  sub?: string | undefined;
  azp?: string | undefined;
  iat?: number | undefined;
  exp?: number | undefined;
  mac_key?: string | undefined;
}

export interface OAuth2TokenResponse {
  success: boolean;
  accessToken?: string | undefined;
  tokenType?: string | undefined;
  expiresIn?: number | undefined;
  expiresAt?: Date | undefined;
  refreshToken?: string | undefined;
  scope?: string | undefined;
  idToken?: string | undefined;
  headers?: Record<string, string> | undefined;
  cached?: boolean | undefined;
  sessionToken?: string | undefined;
  metadata?: {
    grantType?: OAuth2GrantType | undefined;
    provider?: string | undefined;
    issuer?: string | undefined;
    audience?: string | string[] | undefined;
  } | undefined;
  // Legacy properties for backward compatibility
  access_token?: string | undefined;
  token_type?: string | undefined;
}

export interface OAuth2TokenRequest {
  grant_type: OAuth2GrantType;
  code?: string | undefined;
  redirect_uri?: string | undefined;
  client_id?: string | undefined;
  client_secret?: string | undefined;
  scope?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  refresh_token?: string | undefined;
  code_verifier?: string | undefined;
  device_code?: string | undefined;
  assertion?: string | undefined;
}

export interface OAuth2RefreshRequest {
  grant_type: OAuth2GrantType;
  refresh_token: string;
  scope?: string | undefined;
  client_id?: string | undefined;
  client_secret?: string | undefined;
}

export interface OAuth2TokenExchange {
  grant_type: OAuth2GrantType;
  subject_token: string;
  subject_token_type: string;
  resource?: string | undefined;
  audience?: string | undefined;
  scope?: string | undefined;
  requested_token_type?: string | undefined;
  actor_token?: string | undefined;
  actor_token_type?: string | undefined;
}

export interface OAuth2IntrospectionResponse {
  active: boolean;
  scope?: string | undefined;
  client_id?: string | undefined;
  username?: string | undefined;
  token_type?: string | undefined;
  exp?: number | undefined;
  iat?: number | undefined;
  nbf?: number | undefined;
  sub?: string | undefined;
  aud?: string | string[] | undefined;
  iss?: string | undefined;
  jti?: string | undefined;
}

export interface PKCEChallenge {
  verifier: string;
  challenge: string;
  method: 'S256' | 'plain';
}

export interface OAuth2State {
  state: string;
  clientId: string;
  redirectUri: string;
  scope?: string | undefined;
  pkce?: PKCEChallenge | undefined;
  createdAt: Date;
  correlationId?: string | undefined;
}

export interface OAuth2Session {
  id: string;
  tokens: Map<string, OAuth2Token>;
  state: string;
  createdAt: Date;
  expiresAt?: Date | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface OAuth2ProviderMetadata {
  issuer: string;
  authorization_endpoint?: string | undefined;
  token_endpoint?: string | undefined;
  userinfo_endpoint?: string | undefined;
  jwks_uri?: string | undefined;
  registration_endpoint?: string | undefined;
  scopes_supported?: string[] | undefined;
  response_types_supported?: string[] | undefined;
  response_modes_supported?: string[] | undefined;
  grant_types_supported?: string[] | undefined;
  subject_types_supported?: string[] | undefined;
  id_token_signing_alg_values_supported?: string[] | undefined;
  token_endpoint_auth_methods_supported?: string[] | undefined;
  claims_supported?: string[] | undefined;
  code_challenge_methods_supported?: string[] | undefined;
  introspection_endpoint?: string | undefined;
  revocation_endpoint?: string | undefined;
  device_authorization_endpoint?: string | undefined;
  end_session_endpoint?: string | undefined;
  cachedAt?: Date | undefined;
}

export interface OAuth2DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string | undefined;
  expires_in: number;
  interval?: number | undefined;
}

export interface OAuth2Metrics {
  totalTokenRequests: number;
  successfulTokenRequests: number;
  failedTokenRequests: number;
  tokenRefreshes: number;
  authorizationRequests: number;
  introspectionRequests: number;
  revocationRequests: number;
  averageTokenRequestTime: number;
  grantTypeUsage: Map<OAuth2GrantType, number>;
  providerUsage: Map<string, number>;
  errors: Array<{
    timestamp: Date;
    error: string;
    code?: string | undefined;
    grantType?: OAuth2GrantType | undefined;
  }>;
  lastReset: Date;
}

export interface OAuth2Cache {
  token: OAuth2Token;
  cachedAt: Date;
}

export interface OAuth2SecurityPolicy {
  id: string;
  name: string;
  enabled: boolean;
  enforce: (config: OAuth2Config) => {
    allowed: boolean;
    reason?: string | undefined;
  };
}

export enum OAuth2ClientAssertionType {
  JWT_BEARER = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
  SAML2_BEARER = 'urn:ietf:params:oauth:client-assertion-type:saml2-bearer'
}

export interface OAuth2UserInfo {
  sub: string;
  name?: string | undefined;
  given_name?: string | undefined;
  family_name?: string | undefined;
  middle_name?: string | undefined;
  nickname?: string | undefined;
  preferred_username?: string | undefined;
  profile?: string | undefined;
  picture?: string | undefined;
  website?: string | undefined;
  email?: string | undefined;
  email_verified?: boolean | undefined;
  gender?: string | undefined;
  birthdate?: string | undefined;
  zoneinfo?: string | undefined;
  locale?: string | undefined;
  phone_number?: string | undefined;
  phone_number_verified?: boolean | undefined;
  address?: {
    formatted?: string | undefined;
    street_address?: string | undefined;
    locality?: string | undefined;
    region?: string | undefined;
    postal_code?: string | undefined;
    country?: string | undefined;
  } | undefined;
  updated_at?: number | undefined;
}

// Original interfaces continue...
export interface NTLMAuthConfig {
  username: string;
  password: string;
  domain?: string | undefined;
  workstation?: string | undefined;
  version?: 1 | 2 | undefined;
  flags?: NTLMFlags | undefined;
  type?: AuthType | undefined;
}

export interface NTLMFlags {
  negotiateUnicode?: boolean | undefined;
  negotiateOEM?: boolean | undefined;
  requestTarget?: boolean | undefined;
  negotiateSign?: boolean | undefined;
  negotiateSeal?: boolean | undefined;
  negotiateDatagram?: boolean | undefined;
  negotiateLanManagerKey?: boolean | undefined;
  negotiateNTLM?: boolean | undefined;
  negotiateNTLM2?: boolean | undefined;
  negotiateTargetInfo?: boolean | undefined;
  negotiate128?: boolean | undefined;
  negotiateKeyExchange?: boolean | undefined;
  negotiate56?: boolean | undefined;
}

export interface DigestAuthConfig {
  username: string;
  password: string;
  realm?: string | undefined;
  nonce?: string | undefined;
  uri?: string | undefined;
  algorithm?: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess' | undefined;
  qop?: 'auth' | 'auth-int' | undefined;
  nc?: string | undefined;
  cnonce?: string | undefined;
  opaque?: string | undefined;
  challenge?: string | undefined;
  type?: AuthType | undefined;
}

// AWS Authentication Types
export interface AWSAuthConfig {
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  sessionToken?: string | undefined;
  region?: AWSRegion | string | undefined;
  service?: string | undefined;
  roleArn?: string | undefined;
  roleSessionName?: string | undefined;
  externalId?: string | undefined;
  duration?: number | undefined;
  profile?: string | undefined;
  signatureVersion?: 'v2' | 'v4' | 's3' | 's3v4' | undefined;
  expiration?: Date | undefined;
  httpMethod?: string | undefined;
  type?: AuthType | undefined;
}

export type AWSRegion = 
  | 'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2'
  | 'ca-central-1'
  | 'eu-west-1' | 'eu-west-2' | 'eu-west-3' | 'eu-central-1' | 'eu-north-1' | 'eu-south-1'
  | 'ap-northeast-1' | 'ap-northeast-2' | 'ap-northeast-3'
  | 'ap-southeast-1' | 'ap-southeast-2' | 'ap-southeast-3'
  | 'ap-south-1' | 'ap-east-1'
  | 'sa-east-1'
  | 'me-south-1'
  | 'af-south-1'
  | 'cn-north-1' | 'cn-northwest-1'
  | 'us-gov-east-1' | 'us-gov-west-1';

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  expiration?: Date | undefined;
}

export interface AWSSignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer | undefined;
  signature: string;
  timestamp: string;
  credentials: {
    accessKeyId: string;
    scope?: string | undefined;
  };
}

export interface AWSAssumeRoleResponse {
  Credentials: {
    AccessKeyId: string;
    SecretAccessKey: string;
    SessionToken: string;
    Expiration: Date;
  };
  AssumedRoleUser: {
    AssumedRoleId: string;
    Arn: string;
  };
  PackedPolicySize?: number | undefined;
  SourceIdentity?: string | undefined;
}

export interface AWSCredentialProvider {
  name: string;
  getCredentials: (config?: any) => Promise<AWSCredentials | null>;
}

export interface AWSCanonicalRequest {
  request: string;
  hash: string;
  headers: Record<string, string>;
  signedHeaders: string;
  payloadHash: string;
}

export interface AWSRequestContext {
  credentials: AWSCredentials;
  service: string;
  region: string;
  signatureVersion: string;
  timestamp: Date;
  requestId: string;
}

export interface AWSSigningKey {
  key: Buffer;
  dateStamp: string;
  region: string;
  service: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AWSSignatureMetrics {
  totalSigningRequests: number;
  successfulSignings: number;
  failedSignings: number;
  credentialRefreshes: number;
  cacheHits: number;
  cacheMisses: number;
  averageSigningTime: number;
  signingsByService: Map<string, number>;
  signingsByRegion: Map<string, number>;
  errors: Array<{
    timestamp: Date;
    error: string;
    code?: string | undefined;
    service?: string | undefined;
    region?: string | undefined;
  }>;
  lastReset: Date;
}

export interface AWSCredentialCache {
  credentials: AWSCredentials;
  cachedAt: Date;
  expiration?: Date | undefined;
}

export interface AWSRegionalEndpoint {
  patterns?: RegExp[] | undefined;
  signatureVersion: string;
}

export interface AWSServiceEndpoint {
  service: string;
  region: AWSRegion | string;
  endpoint: string;
  protocols: string[];
  signatureVersion: string;
  global?: boolean | undefined;
  partition?: string | undefined;
  dualStack?: boolean | undefined;
  fips?: boolean | undefined;
}

export type AWSSigningAlgorithm = 'AWS4-HMAC-SHA256' | 'AWS4-HMAC-SHA384' | 'AWS4-HMAC-SHA512';

export interface AWSPresignedUrl {
  url: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

// Azure Authentication Types
export interface AzureAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret?: string | undefined;
  clientCertificate?: CertificateAuthConfig | undefined;
  resource?: string | undefined;
  scope?: string | string[] | undefined;
  authority?: string | undefined;
  managedIdentity?: AzureManagedIdentityConfig | undefined;
}

export interface AzureManagedIdentityConfig {
  type: 'SystemAssigned' | 'UserAssigned';
  clientId?: string | undefined;
  resourceId?: string | undefined;
  objectId?: string | undefined;
  miResId?: string | undefined;
}

// Hawk Authentication
export interface HawkAuthConfig {
  keyId: string;
  key: string;
  algorithm?: string | undefined;
  ext?: string | undefined;
  app?: string | undefined;
  dlg?: string | undefined;
  includePayloadHash?: boolean | undefined;
  type?: AuthType | undefined;
}

// JWT Authentication
export interface JWTAuthConfig {
  token?: string | undefined;
  privateKey?: string | undefined;
  claims?: any;
  algorithm?: string | undefined;
  keyId?: string | undefined;
  expiresIn?: number | undefined;
  headerName?: string | undefined;
  scheme?: string | undefined;
  type?: AuthType | undefined;
}

export interface CustomAuthConfig {
  handler: string | CustomAuthHandler | Function;
  config?: Record<string, any> | undefined;
  name?: string | undefined;
  parameters?: Record<string, any> | undefined;
  refreshHandler?: (params: any) => Promise<TokenRefreshResult>;
  challengeHandler?: (challenge: any, params: any) => Promise<any>;
  type?: AuthType | undefined;
}

export interface CustomAuthHandler {
  name: string;
  authenticate(request: AuthRequest): Promise<AuthResult>;
  refresh?(token: string): Promise<AuthResult>;
  validate?(token: string): Promise<boolean>;
}

export interface AuthRetryConfig {
  maxRetries?: number | undefined;
  retryDelay?: number | undefined;
  retryOnStatusCodes?: number[] | undefined;
  exponentialBackoff?: boolean | undefined;
  maxRetryDelay?: number | undefined;
}

export interface AuthCacheConfig {
  enabled?: boolean | undefined;
  ttl?: number | undefined;
  maxSize?: number | undefined;
  keyGenerator?: ((config: AuthTypeConfig) => string) | undefined;
}

export interface AuthProxyConfig {
  useProxy?: boolean | undefined;
  proxyAuth?: BasicAuthConfig | undefined;
  bypassForHosts?: string[] | undefined;
}

export interface AuthRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}

export interface AuthResult {
  headers?: Record<string, string> | undefined;
  params?: Record<string, string> | undefined;
  token?: TokenInfo | undefined;
  error?: AuthError | undefined;
}

export interface TokenInfo {
  accessToken: string;
  tokenType: string;
  expiresIn?: number | undefined;
  expiresAt?: Date | undefined;
  refreshToken?: string | undefined;
  idToken?: string | undefined;
  scope?: string | undefined;
  additionalProperties?: Record<string, any> | undefined;
}

export interface AuthError {
  code: string;
  message: string;
  details?: any;
  retryable?: boolean | undefined;
}

export interface AuthenticationContext {
  request: AuthRequest;
  credentials: AuthTypeConfig;
  metadata: AuthMetadata;
  session?: AuthSession | undefined;
}

export interface AuthMetadata {
  timestamp: Date;
  correlationId: string;
  attemptNumber: number;
  clientIp?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthSession {
  id: string;
  tokens: Map<string, TokenInfo>;
  nonces: Map<string, string>;
  challenges: Map<string, AuthChallenge>;
  state: AuthSessionState;
}

export interface AuthChallenge {
  type: string;
  realm?: string | undefined;
  nonce?: string | undefined;
  opaque?: string | undefined;
  algorithm?: string | undefined;
  qop?: string[] | undefined;
}

export type AuthSessionState = 
  | 'initializing'
  | 'authenticating'
  | 'authenticated'
  | 'refreshing'
  | 'expired'
  | 'failed';

export interface OAuth2TokenResponseRaw {
  access_token: string;
  token_type: string;
  expires_in?: number | undefined;
  refresh_token?: string | undefined;
  scope?: string | undefined;
  id_token?: string | undefined;
  [key: string]: any;
}

export interface OAuth2ErrorResponse {
  error: string;
  error_description?: string | undefined;
  error_uri?: string | undefined;
}

export interface SAMLAssertion {
  issuer: string;
  subject: string;
  audience: string;
  conditions: SAMLConditions;
  attributes: Record<string, string[]>;
  signature?: string | undefined;
}

export interface SAMLConditions {
  notBefore: Date;
  notOnOrAfter: Date;
  audienceRestrictions?: string[] | undefined;
}

export interface JWTClaims {
  iss?: string | undefined;
  sub?: string | undefined;
  aud?: string | string[] | undefined;
  exp?: number | undefined;
  nbf?: number | undefined;
  iat?: number | undefined;
  jti?: string | undefined;
  [key: string]: any;
}

export interface X509Certificate {
  subject: CertificateSubject;
  issuer: CertificateSubject;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  publicKey: string;
  signatureAlgorithm: string;
  fingerprint: string;
  extensions?: CertificateExtensions | undefined;
}

export interface CertificateSubject {
  commonName?: string | undefined;
  organizationName?: string | undefined;
  organizationalUnitName?: string | undefined;
  countryName?: string | undefined;
  stateOrProvinceName?: string | undefined;
  localityName?: string | undefined;
  emailAddress?: string | undefined;
}

export interface CertificateExtensions {
  keyUsage?: string[] | undefined;
  extendedKeyUsage?: string[] | undefined;
  subjectAlternativeName?: string[] | undefined;
  authorityKeyIdentifier?: string | undefined;
  subjectKeyIdentifier?: string | undefined;
}

export interface KerberosConfig {
  realm: string;
  kdc: string;
  principal: string;
  keytab?: string | undefined;
  password?: string | undefined;
  spn?: string | undefined;
  delegateCredential?: boolean | undefined;
}

export interface AuthenticationMetrics {
  totalRequests: number;
  successfulAuthentications: number;
  failedAuthentications: number;
  tokenRefreshes: number;
  averageAuthTime: number;
  authMethodBreakdown: Record<AuthenticationType, number>;
  errorBreakdown: Record<string, number>;
  // Extended properties
  totalAuthentications?: number | undefined;
  cacheHits?: number | undefined;
  cacheMisses?: number | undefined;
  authenticationsByType?: Map<AuthType, number> | undefined;
  errors?: any[] | undefined;
  lastReset?: Date | undefined;
}

export interface AuthenticationAuditLog {
  timestamp: Date;
  authType: AuthenticationType;
  username?: string | undefined;
  clientId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  success: boolean;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  duration: number;
  metadata?: Record<string, any> | undefined;
}

export interface SecurityPolicy {
  minPasswordLength?: number | undefined;
  requireUppercase?: boolean | undefined;
  requireLowercase?: boolean | undefined;
  requireNumbers?: boolean | undefined;
  requireSpecialChars?: boolean | undefined;
  maxPasswordAge?: number | undefined;
  passwordHistory?: number | undefined;
  accountLockoutThreshold?: number | undefined;
  accountLockoutDuration?: number | undefined;
  requireMFA?: boolean | undefined;
  allowedAuthMethods?: AuthenticationType[] | undefined;
  tokenLifetime?: number | undefined;
  refreshTokenLifetime?: number | undefined;
  sessionTimeout?: number | undefined;
  // Extended properties
  id?: string | undefined;
  name?: string | undefined;
  enabled?: boolean | undefined;
  config?: any;
}

export interface MFAConfig {
  type: 'totp' | 'sms' | 'email' | 'push' | 'biometric';
  issuer?: string | undefined;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512' | undefined;
  digits?: number | undefined;
  period?: number | undefined;
  window?: number | undefined;
}

export interface BiometricAuthConfig {
  type: 'fingerprint' | 'face' | 'iris' | 'voice';
  enrollmentData?: Buffer | undefined;
  threshold?: number | undefined;
  fallbackEnabled?: boolean | undefined;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean | undefined;
  skipFailedRequests?: boolean | undefined;
  keyGenerator?: ((context: AuthenticationContext) => string) | undefined;
}

export interface AuthenticationPlugin {
  name: string;
  version: string;
  initialize?(config: any): Promise<void>;
  beforeAuth?(context: AuthenticationContext): Promise<void>;
  afterAuth?(context: AuthenticationContext, result: AuthResult): Promise<void>;
  onError?(context: AuthenticationContext, error: Error): Promise<void>;
  destroy?(): Promise<void>;
}

export interface AuthenticationProviderRegistry {
  providers: Map<AuthenticationType, AuthenticationProvider>;
  register(type: AuthenticationType, provider: AuthenticationProvider): void;
  unregister(type: AuthenticationType): void;
  get(type: AuthenticationType): AuthenticationProvider | undefined;
}

export interface AuthenticationProvider {
  type: AuthenticationType;
  authenticate(config: AuthTypeConfig, request: AuthRequest): Promise<AuthResult>;
  refresh?(token: string, config: AuthTypeConfig): Promise<AuthResult>;
  revoke?(token: string, config: AuthTypeConfig): Promise<void>;
  validate?(token: string, config: AuthTypeConfig): Promise<boolean>;
  // Extended properties
  id?: string | undefined;
  name?: string | undefined;
  enabled?: boolean | undefined;
  lastUsed?: Date | undefined;
}

export interface TokenStore {
  save(key: string, token: TokenInfo): Promise<void>;
  get(key: string): Promise<TokenInfo | null>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface CredentialStore {
  save(id: string, credentials: Credentials): Promise<void>;
  get(id: string): Promise<Credentials | null>;
  delete(id: string): Promise<void>;
  list(): Promise<string[]>;
  encrypt(data: string): Promise<string>;
  decrypt(data: string): Promise<string>;
}

export interface Credentials {
  id: string;
  type: AuthenticationType;
  data: Record<string, any>;
  metadata?: CredentialMetadata | undefined;
}

export interface CredentialMetadata {
  created: Date;
  updated: Date;
  lastUsed?: Date | undefined;
  expiresAt?: Date | undefined;
  tags?: string[] | undefined;
  description?: string | undefined;
}

export interface AuthenticationMiddleware {
  (context: AuthenticationContext, next: () => Promise<void>): Promise<void>;
}

export interface AuthenticationInterceptor {
  request?(config: AuthRequest): Promise<AuthRequest>;
  response?(response: any, config: AuthRequest): Promise<any>;
  error?(error: Error, config: AuthRequest): Promise<any>;
}

export interface AuthenticationEvent {
  type: AuthenticationEventType;
  timestamp: Date;
  data: any;
  // Extended properties
  success?: boolean | undefined;
  duration?: number | undefined;
  error?: string | undefined;
  correlationId?: string | undefined;
  context?: RequestContext | undefined;
  authType?: AuthenticationType | undefined;
}

export type AuthenticationEventType = 
  | 'auth.started'
  | 'auth.completed'
  | 'auth.failed'
  | 'token.obtained'
  | 'token.refreshed'
  | 'token.expired'
  | 'token.revoked'
  | 'mfa.required'
  | 'mfa.completed'
  | 'session.created'
  | 'session.expired';

export interface AuthenticationEventEmitter {
  on(event: AuthenticationEventType, handler: (data: any) => void): void;
  off(event: AuthenticationEventType, handler: (data: any) => void): void;
  emit(event: AuthenticationEventType, data: any): void;
}

// Extended types for APIAuthenticationHandler
export interface AuthenticationResult {
  success: boolean;
  type: AuthType;
  headers: Record<string, string>;
  expiresAt?: Date | null;
  metadata?: any;
  agent?: any;
  cached?: boolean | undefined;
  requiresChallenge?: boolean | undefined;
  sessionId?: string | undefined;
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
  sessionId?: string | undefined;
  retryCount: number;
  maxRetries: number;
}

export interface RequestContext {
  correlationId?: string | undefined;
  sessionId?: string | undefined;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  requestUrl?: string | undefined;
}

export interface AuthenticationStrategy {
  authenticate: (request: any, authConfig: AuthConfig, options: AuthenticationOptions) => Promise<AuthenticationResult>;
  validate: (config: any) => Promise<boolean>;
  refresh: ((config: any) => Promise<TokenRefreshResult>) | null;
}

export interface ChallengeResponse {
  type: string;
  headers: Record<string, string>;
  sessionId?: string | undefined;
  metadata?: any;
}

export interface NonceCache {
  nonce: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthenticationState {
  authenticated: boolean;
  expiresAt?: Date | undefined;
  metadata?: any;
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

export interface RateLimitInfo {
  requests: number;
  windowStart: number;
  windowEnd: number;
}

export interface AuthenticationChallenge {
  type: string;
  headers: Record<string, string>;
  request: any;
}

// Type guards
export function isBasicAuth(config: AuthTypeConfig): config is BasicAuthConfig {
  return 'username' in config && 'password' in config && !('domain' in config);
}

export function isBearerAuth(config: AuthTypeConfig): config is BearerAuthConfig {
  return 'token' in config && !('grantType' in config);
}

export function isOAuth2Auth(config: AuthTypeConfig): config is OAuth2AuthConfig {
  return 'grantType' in config && 'clientId' in config;
}

export function isCertificateAuth(config: AuthTypeConfig): config is CertificateAuthConfig {
  return 'certPath' in config || 'certContent' in config;
}

export function isAWSAuth(config: AuthTypeConfig): config is AWSAuthConfig {
  return 'accessKeyId' in config && 'secretAccessKey' in config && 'region' in config;
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AuthConfigWithDefaults<T extends AuthTypeConfig> = T & {
  _defaults: Partial<T>;
};

// Proxy types for OAuth2Handler
export interface ProxySettings {
  server: string;
  username?: string | undefined;
  password?: string | undefined;
  bypass?: string[] | undefined;
  protocol?: string | undefined;
  agent?: any;
}

// OAuth2Error class
export class OAuth2Error extends Error {
  public code: string;
  
  constructor(message: string, code: string) {
    super(message);
    this.name = 'OAuth2Error';
    this.code = code;
    Object.setPrototypeOf(this, OAuth2Error.prototype);
  }
}