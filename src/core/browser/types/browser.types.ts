// src/core/browser/types/browser.types.ts
import { Browser, BrowserContext, Page, Cookie, ConsoleMessage, Dialog, Download, Request, Response, Frame } from 'playwright';

export interface BrowserConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  slowMo: number;
  timeout: number;
  viewport: {
    width: number;
    height: number;
  };
  downloadsPath: string;
  ignoreHTTPSErrors: boolean;
  tracesDir?: string;
  videosDir?: string;
  args?: string[];
  proxy?: ProxySettings;
}

export interface ContextOptions {
  viewport?: ViewportSize | null;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  permissions?: string[];
  geolocation?: Geolocation;
  httpCredentials?: HTTPCredentials;
  storageState?: string | StorageState;
  recordVideo?: { dir: string; size?: ViewportSize };
  recordHar?: { path: string; content?: 'embed' | 'attach' | 'omit' };
  proxy?: {
    server: string;
    username?: string;
    password?: string;
    bypass?: string;
  };
  offline?: boolean;
  colorScheme?: ColorScheme;
  reducedMotion?: ReducedMotion;
  forcedColors?: 'active' | 'none';
  acceptDownloads?: boolean;
  extraHTTPHeaders?: Record<string, string>;
  bypassCSP?: boolean;
  javaScriptEnabled?: boolean;
  serviceWorkers?: 'allow' | 'block';
  ignoreHTTPSErrors?: boolean;
  hasTouch?: boolean;
  isMobile?: boolean;
  deviceScaleFactor?: number;
  screen?: { width: number; height: number };
}

export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
  bypass?: string[];
  port?: number;
}

export interface Certificate {
  origin: string;
  certPath?: string;
  keyPath?: string;
  passphrase?: string;
  ca?: string | Buffer;
  caPath?: string;
  cert?: string | Buffer;
  key?: string | Buffer;
}

export interface Geolocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface HTTPCredentials {
  username: string;
  password: string;
}

export interface ResourceStats {
  memoryUsage: number;
  cpuUsage: number;
  openPages: number;
  openContexts: number;
  tempFiles?: number;
  downloadsSize?: number;
  cleanupDuration?: number;
  timestamp?: Date;
  activeDownloads?: number;
  networkConnections?: number;
  totalMemory?: number;
  externalMemory?: number;
  systemMemory?: number;
}

export interface BrowserEventHandlers {
  onDisconnected?: () => void | Promise<void>;
  onConnected?: () => void | Promise<void>;
  onContextCreated?: (context: BrowserContext) => void | Promise<void>;
  onContextDestroyed?: (context: BrowserContext) => void | Promise<void>;
  onPageCreated?: (page: Page) => void | Promise<void>;
  onPageClosed?: (page: Page) => void | Promise<void>;
  onCrashed?: () => void | Promise<void>;
}

export interface PageEventHandlers {
  onConsole?: (message: ConsoleMessage) => void | Promise<void>;
  onDialog?: (dialog: Dialog) => void | Promise<void>;
  onDownload?: (download: Download) => void | Promise<void>;
  onPageError?: (error: Error) => void | Promise<void>;
  onRequest?: (request: Request) => void | Promise<void>;
  onResponse?: (response: Response) => void | Promise<void>;
  onRequestFailed?: (request: Request) => void | Promise<void>;
  onFrameNavigated?: (frame: Frame) => void | Promise<void>;
  onFrameAttached?: (frame: Frame) => void | Promise<void>;
  onFrameDetached?: (frame: Frame) => void | Promise<void>;
  onPopup?: (page: Page) => void | Promise<void>;
  onClose?: () => void | Promise<void>;
}

export interface BrowserHealth {
  isResponsive: boolean;
  isHealthy: boolean;
  memoryUsage: number;
  cpuUsage: number;
  openPages: number;
  lastCheck: Date;
  lastHealthCheck: Date;
  errors: string[];
  crashes: number;
  restarts: number;
  responseTime: number;
}

export interface BrowserPoolOptions {
  size: number;
  maxUseCount?: number;
  healthCheckInterval?: number;
  recycleThreshold?: number;
}

export interface BrowserPoolConfig {
  minSize: number;
  maxSize: number;
  acquisitionTimeout: number;
  idleTimeout: number;
  evictionInterval: number;
  testOnAcquire: boolean;
  testOnReturn: boolean;
  recycleAfterUses: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PooledBrowser {
  browser: Browser;
  id: string;
  useCount: number;
  usageCount: number;
  createdAt: Date;
  lastUsedAt: Date;
  isHealthy: boolean;
  isAvailable: boolean;
}

export interface PageEvent {
  type: 'console' | 'pageerror' | 'request' | 'response' | 'dialog' | 'download' | 'popup' | 'framenavigated';
  timestamp: Date;
  data: any;
}

export interface StorageState {
  cookies?: Cookie[];
  origins?: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

export interface ResourceCleanupOptions {
  clearStorage?: boolean;
  clearCookies?: boolean;
  clearCache?: boolean;
  clearPermissions?: boolean;
  closePopups?: boolean;
  clearDownloads?: boolean;
  clearTempFiles?: boolean;
}

export interface AuthenticationOptions {
  httpCredentials?: HTTPCredentials;
  bearerToken?: string;
  apiKey?: {
    key: string;
    headerName?: string;
  };
  certificates?: Certificate[];
  authStateFile?: string;
  oauth2?: OAuth2Options;
}

export interface OAuth2Options {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scope?: string;
  grantType?: 'client_credentials' | 'authorization_code';
}

export interface MFAOptions {
  inputSelector?: string;
  submitSelector?: string;
  waitForNavigation?: boolean;
  timeout?: number;
}

export interface EmulationOptions {
  device?: string;
  viewport?: ViewportSize;
  userAgent?: string;
  locale?: string;
  timezone?: string;
  geolocation?: Geolocation;
  permissions?: string[];
  colorScheme?: ColorScheme;
  reducedMotion?: ReducedMotion;
  media?: MediaType;
  offline?: boolean;
  hasTouch?: boolean;
  isMobile?: boolean;
  deviceScaleFactor?: number;
  defaultBrowserType?: string;
}

export interface DeviceDescriptor {
  viewport: ViewportSize;
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  defaultBrowserType?: string;
}

export interface NetworkConditions {
  download: number;
  upload: number;
  latency: number;
  offline?: boolean;
}

export type ColorScheme = 'light' | 'dark' | 'no-preference';
export type ReducedMotion = 'reduce' | 'no-preference';
export type MediaType = 'screen' | 'print';

export interface ContextPool {
  contexts: Map<string, BrowserContext>;
  maxContexts: number;
  contextTimeout: number;
}

export interface PagePool {
  pages: Map<string, Page>;
  maxPages: number;
  pageTimeout: number;
}

export interface LaunchOptions {
  executablePath?: string;
  channel?: string;
  args?: string[];
  ignoreDefaultArgs?: boolean | string[];
  handleSIGINT?: boolean;
  handleSIGTERM?: boolean;
  handleSIGHUP?: boolean;
  timeout?: number;
  env?: Record<string, string | number | boolean>;
  headless?: boolean;
  devtools?: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
    bypass?: string;
  };
  downloadsPath?: string;
  slowMo?: number;
  chromiumSandbox?: boolean;
  firefoxUserPrefs?: Record<string, any>;
  tracesDir?: string;
}

export interface WaitOptions {
  timeout?: number;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  strict?: boolean;
}

export interface ScreenshotOptions {
  path?: string;
  type?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
  clip?: BoundingBox;
  omitBackground?: boolean;
  animations?: 'disabled' | 'allow';
  caret?: 'hide' | 'initial';
  scale?: 'css' | 'device';
  mask?: Array<{ selector: string }>;
}

export interface PDFOptions {
  path?: string;
  scale?: number;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  landscape?: boolean;
  pageRanges?: string;
  format?: string;
  width?: string | number;
  height?: string | number;
  margin?: {
    top?: string | number;
    right?: string | number;
    bottom?: string | number;
    left?: string | number;
  };
  preferCSSPageSize?: boolean;
  outline?: boolean;
  tagged?: boolean;
}