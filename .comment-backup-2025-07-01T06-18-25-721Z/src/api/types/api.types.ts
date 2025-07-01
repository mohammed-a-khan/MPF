// src/api/types/api.types.ts
export interface RequestOptions {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  auth?: AuthConfig;
  proxy?: ProxyConfig;
  validateSSL?: boolean;
  encoding?: BufferEncoding;
  responseType?: 'json' | 'text' | 'buffer' | 'stream';
  maxRedirects?: number;
  compress?: boolean;
  cert?: CertificateConfig;
  keepAlive?: boolean;
  socketTimeout?: number;
  signal?: AbortSignal;
  // Additional properties for compatibility
  query?: Record<string, any>;
  form?: Record<string, any>;
  json?: any;
  followRedirects?: boolean;
  retryConfig?: RetryOptions;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT';

export interface Response {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: any;
  request: RequestInfo;
  duration: number;
  size: number;
  timestamp: Date;
}

export interface RequestInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

export interface AuthConfig {
  type: AuthType;
  credentials: any;
}

export type AuthType = 
  | 'basic' 
  | 'bearer' 
  | 'apikey' 
  | 'oauth2' 
  | 'certificate' 
  | 'ntlm' 
  | 'aws' 
  | 'digest'
  | 'hawk'
  | 'custom';

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

export interface BearerAuthCredentials {
  token: string;
}

export interface ApiKeyAuthCredentials {
  key: string;
  value: string;
  location: 'header' | 'query' | 'cookie';
}

export interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scope?: string;
  grantType?: 'client_credentials' | 'password' | 'authorization_code' | 'refresh_token';
  username?: string;
  password?: string;
  refreshToken?: string;
  authorizationCode?: string;
  redirectUri?: string;
}

export interface CertificateConfig {
  cert?: string | Buffer;
  key?: string | Buffer;
  ca?: string | Buffer | Array<string | Buffer>;
  passphrase?: string;
  pfx?: string | Buffer;
  rejectUnauthorized?: boolean;
}

export interface NTLMCredentials {
  username: string;
  password: string;
  domain: string;
  workstation?: string;
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}

export interface DigestAuthCredentials {
  username: string;
  password: string;
}

export interface HawkCredentials {
  id: string;
  key: string;
  algorithm?: 'sha256' | 'sha1';
}

export interface ProxyConfig {
  host: string;
  port: number;
  protocol?: 'http' | 'https' | 'socks5';
  auth?: {
    username: string;
    password: string;
  };
  bypass?: string[];
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  errors?: ValidationError[];
  warnings?: string[];
  expected?: any;
  actual?: any;
  duration?: number;
  metadata?: any;
}

export interface ValidationError {
  path?: string;
  expected?: any;
  actual?: any;
  message: string;
  type?: 'status' | 'header' | 'body' | 'schema' | 'jsonpath' | 'xpath' | 'custom';
  line?: number;
  column?: number;
}

export interface RetryOptions {
  maxRetries: number;
  delay: number;
  backoff?: 'linear' | 'exponential' | 'fibonacci';
  retryCondition?: (error: any, response?: Response) => boolean;
  onRetry?: (error: any, retryCount: number) => void;
}

export interface RequestTemplate {
  id: string;
  name: string;
  description?: string;
  request: Partial<RequestOptions>;
  variables?: Record<string, any>;
  validations?: ValidationConfig[];
}

export interface ValidationConfig {
  type: 'status' | 'header' | 'body' | 'schema' | 'jsonpath' | 'xpath' | 'regex' | 'custom';
  config: any;
}

export interface Schema {
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  items?: any;
  [key: string]: any;
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    headersSize: number;
    bodySize: number;
    postData?: {
      mimeType: string;
      text?: string;
      params?: Array<{ name: string; value: string }>;
    };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    content: {
      size: number;
      compression?: number;
      mimeType: string;
      text?: string;
      encoding?: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: any;
  timings: {
    blocked?: number;
    dns?: number;
    ssl?: number;
    connect?: number;
    send: number;
    wait: number;
    receive: number;
  };
  serverIPAddress?: string;
  connection?: string;
}

export interface ParsedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: any;
  contentType: string;
  encoding: string;
  size: number;
}

export interface ConnectionOptions {
  keepAlive: boolean;
  keepAliveMsecs: number;
  maxSockets: number;
  maxFreeSockets: number;
  timeout: number;
  socketTimeout: number;
}

export interface RequestError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
  port?: number;
  response?: Response;
  request?: RequestOptions;
}

export interface TemplateVariable {
  name: string;
  value: any;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  defaultValue?: any;
}

export interface MockCall {
  timestamp: Date;
  request: RequestInfo;
  response?: Response;
  error?: Error;
}

export interface PerformanceMetrics {
  dns?: number;
  tcp?: number;
  tls?: number;
  firstByte?: number;
  download?: number;
  total: number;
}

export interface StreamOptions {
  highWaterMark?: number;
  encoding?: BufferEncoding;
}

export interface MultipartFormData {
  fields: Record<string, string>;
  files: Array<{
    field: string;
    filename: string;
    data: Buffer | string;
    contentType?: string;
  }>;
}

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface WebSocketOptions {
  protocols?: string | string[];
  headers?: Record<string, string>;
  timeout?: number;
  perMessageDeflate?: boolean | object;
  maxPayload?: number;
}

export interface SSEOptions {
  reconnectInterval?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}

// Missing type definitions for API Context
export interface APIContextData {
  variables?: Record<string, any>;
  requests?: Record<string, Response>;
  currentRequest?: RequestOptions;
  currentResponse?: Response;
  metrics?: PerformanceMetrics;
  environment?: string;
  baseUrl: string;
  headers: Record<string, string>;
  globalHeaders?: Record<string, string>;
  configuration?: Record<string, any>;
  timeout: number;
  auth: AuthConfig | null;
  proxy: any;
  followRedirects: boolean;
  validateSSL: boolean;
  retryConfig: {
    enabled: boolean;
    maxAttempts: number;
    delay: number;
    backoff: string;
  };
}

export interface APIVariable {
  name: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'bigint' | 'symbol' | 'undefined' | 'function';
  scope?: 'global' | 'local' | 'test';
  readonly?: boolean;
  description?: string;
  created?: Date;
  metadata?: any;
}

export interface APIResponse extends Response {
  alias?: string;
  data?: any;
  parsedBody?: any;
  validation?: ValidationResult;
}

// Missing type definitions for Chain Context
export interface ChainStep {
  id?: string;
  name: string;
  type: 'request' | 'validation' | 'extraction' | 'delay' | 'script' | 'transformation' | 'conditional' | 'loop';
  config?: any;
  enabled?: boolean;
  index?: number;
  retryOnFailure?: boolean;
  continueOnFailure?: boolean;
  dependencies?: string[];
  // Additional properties for request steps
  request?: Partial<RequestOptions>;
  responseAlias?: string;
  extractors?: Array<{
    variable: string;
    path: string;
  }> | undefined;
  validations?: Array<{
    path: string;
    expected: any;
    message?: string;
  }> | undefined;
  // Properties for transformation steps
  transformer?: ((data: any, variables: Map<string, any>) => any) | undefined;
  resultVariable?: string | undefined;
  // Properties for delay steps
  delay?: number | undefined;
  // Properties for conditional steps
  condition?: ((variables: Map<string, any>) => boolean) | undefined;
  thenSteps?: ChainStep[] | undefined;
  elseSteps?: ChainStep[] | undefined;
  // Properties for loop steps
  items?: (any[] | ((variables: Map<string, any>) => any[])) | undefined;
  loopSteps?: ChainStep[] | undefined;
  itemVariable?: string | undefined;
}

export interface ChainResult {
  stepId: string;
  stepName?: string;
  success: boolean;
  data?: any;
  error?: Error;
  duration: number;
  timestamp?: Date;
  retryCount?: number;
}

// Missing type definitions for Template System
export interface TemplateContext {
  [key: string]: any;
}

export interface PlaceholderOptions {
  throwOnError?: boolean;
  keepUnresolved?: boolean;
  defaultValue?: string;
  useCache?: boolean;
  strictComparison?: boolean;
  convertNumbers?: boolean;
  nullValue?: string;
  undefinedValue?: string;
  stringifyObjects?: boolean;
  jsonIndent?: number;
}

export interface CustomResolver {
  (context: TemplateContext, args: string[]): any;
}

export interface TemplateOptions {
  useCache?: boolean;
  cacheTTL?: number;
  trimWhitespace?: boolean;
  format?: 'json' | 'xml';
  ignoreIncludeErrors?: boolean;
}

export interface TemplateFunction {
  (args: any[], context: TemplateContext): Promise<any>;
}

// Missing type definitions for Cache
export interface CacheEntry {
  key: string;
  value: string;
  size: number;
  ttl: number;
  created: number;
  lastAccessed: number;
  hitCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  memoryUsage: number;
  size?: number;
  hitRate?: number;
}

export interface CacheOptions {
  maxSize?: number;
  maxMemory?: number;
  defaultTTL?: number;
  cleanupInterval?: number;
}

// Missing type definitions for XML Validation
export interface XMLValidationOptions {
  namespaces?: Record<string, string>;
  expectMultiple?: boolean;
  strictComparison?: boolean;
  convertNumbers?: boolean;
}

export interface XMLNode {
  nodeName: string;
  nodeValue?: string;
  nodeType: number;
  textContent?: string;
  attributes?: Record<string, string>;
  children?: XMLNode[];
}

export interface XPathResult {
  nodes: XMLNode[];
  nodeTypes: string[];
}

export interface JSONPathResult {
  values: any[];
  paths: string[];
}

export interface JSONPathOptions {
  autoCreate?: boolean;
  parent?: any;
  wrap?: boolean;
  resultType?: 'value' | 'path' | 'pointer' | 'all';
  expectArray?: boolean;
  alwaysReturnArray?: boolean;
  compareFunction?: (actual: any, expected: any) => boolean;
  ignoreCase?: boolean;
  partialMatch?: boolean;
  regex?: boolean;
  deepEqual?: boolean;
  arrayContains?: boolean;
  arrayExact?: boolean;
}

// Missing type definitions for Schema Validation
export interface SchemaValidationError {
  path: string;
  message: string;
  expected?: any;
  actual?: any;
  schemaPath?: string;
  keyword?: string;
  params?: Record<string, any>;
  data?: any;
}

export type SchemaFormat = 'draft-04' | 'draft-06' | 'draft-07' | 'draft-2019-09' | 'draft-2020-12';

export interface SchemaValidatorOptions {
  allErrors?: boolean;
  verbose?: boolean;
  strict?: boolean;
  strictSchema?: boolean;
  strictNumbers?: boolean;
  strictTypes?: boolean;
  strictTuples?: boolean;
  allowUnionTypes?: boolean;
  allowMatchingProperties?: boolean;
  validateFormats?: boolean;
  addUsedSchema?: boolean;
  removeAdditional?: boolean | 'all' | 'failing';
  useDefaults?: boolean | 'empty';
  coerceTypes?: boolean | 'array';
  schemaId?: 'auto' | '$id' | 'id';
  loadSchema?: (uri: string) => Promise<Schema>;
  passContext?: boolean;
  ownProperties?: boolean;
  multipleOfPrecision?: number;
  discriminator?: boolean;
  unicodeRegExp?: boolean;
  int32range?: boolean;
}