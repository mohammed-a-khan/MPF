// src/core/browser/BrowserManager.ts

import { chromium, firefox, webkit, Browser, BrowserContext } from 'playwright';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import { ProxyManager } from '../proxy/ProxyManager';
import { ActionLogger } from '../logging/ActionLogger';
import { 
  BrowserConfig, 
  BrowserHealth, 
  LaunchOptions,
  BrowserEventHandlers,
  ResourceStats 
} from './types/browser.types';

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private config: BrowserConfig | null = null;
  private isInitializing: boolean = false;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private defaultContext: BrowserContext | null = null;
  private health: BrowserHealth = {
    isResponsive: true,
    isHealthy: true,
    memoryUsage: 0,
    cpuUsage: 0,
    openPages: 0,
    lastCheck: new Date(),
    lastHealthCheck: new Date(),
    errors: [],
    crashes: 0,
    restarts: 0,
    responseTime: 0
  };
  private eventHandlers: BrowserEventHandlers = {};
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 60000;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔍 DEBUG: BrowserManager already initialized');
      return;
    }

    console.log('🔍 DEBUG: Initializing BrowserManager');
    await this.createBrowser();
    
    if (this.browser && !this.defaultContext) {
      console.log('🔍 DEBUG: Creating default browser context');
      
      const contextOptions: any = {
        ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false)
      };
      
      const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
      if (isMaximized) {
        contextOptions.viewport = null;
        console.log('🔍 DEBUG: Default context created with viewport=null for maximized mode');
      } else {
        const width = ConfigurationManager.getNumber('VIEWPORT_WIDTH', 1920);
        const height = ConfigurationManager.getNumber('VIEWPORT_HEIGHT', 1080);
        contextOptions.viewport = { width, height };
        console.log(`🔍 DEBUG: Default context created with viewport ${width}x${height}`);
      }
      
      this.defaultContext = await this.browser.newContext(contextOptions);
    }
    
    this.isInitialized = true;
  }

  private async createBrowser(): Promise<void> {
    console.log('🔍 DEBUG: Creating browser');
    
    const browserType = process.env.BROWSER || 'chromium';
    const options = this.buildLaunchOptions();
    
    console.log(`🔍 DEBUG: Launching ${browserType} with options:`, options);
    
    try {
      switch (browserType.toLowerCase()) {
        case 'firefox':
          this.browser = await firefox.launch(options);
          break;
        case 'webkit':
          this.browser = await webkit.launch(options);
          break;
        default:
          this.browser = await chromium.launch(options);
      }
      
      console.log('✅ Browser launched successfully');
      
    } catch (error) {
      console.error('❌ Failed to launch browser:', error);
      throw error;
    }
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.initialize();
    }
    
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    
    return this.browser;
  }

  getDefaultContext(): BrowserContext {
    if (!this.defaultContext) {
      throw new Error('Browser context not initialized. Call initialize() first.');
    }
    return this.defaultContext;
  }

  isHealthy(): boolean {
    return this.isInitialized && this.browser !== null;
  }

  async launchBrowser(browserType?: string): Promise<Browser> {
    try {
      const type = browserType || this.config?.browser || 'chromium';
      
      const launchOptions = this.buildLaunchOptions();
      
      switch (type) {
        case 'firefox':
          this.browser = await firefox.launch(launchOptions as any);
          break;
        case 'webkit':
          this.browser = await webkit.launch(launchOptions as any);
          break;
        case 'chromium':
        default:
          this.browser = await chromium.launch(launchOptions as any);
          break;
      }
      
      this.setupBrowserEventHandlers();
      
      const version = this.getBrowserVersion();
      
      return this.browser;
    } catch (error) {
      this.health.isHealthy = false;
      throw error;
    }
  }

  async getContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    
    const contexts = browser.contexts();
    if (contexts.length > 0 && contexts[0]) {
      return contexts[0];
    }
    
    const contextOptions: any = {
      ignoreHTTPSErrors: this.config?.ignoreHTTPSErrors || false
    };
    
    const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
    console.log(`🔍 DEBUG: Creating context - maximized mode: ${isMaximized}`);
    
    if (!isMaximized && this.config?.viewport) {
      contextOptions.viewport = this.config.viewport;
      console.log('🔍 DEBUG: Setting viewport:', this.config.viewport);
    } else if (isMaximized) {
      contextOptions.viewport = null;
      console.log('🔍 DEBUG: Setting viewport to null for maximized mode');
    } else {
      console.log('🔍 DEBUG: No viewport configuration - using browser default');
    }
    
    console.log('🔍 DEBUG: Context options:', JSON.stringify(contextOptions, null, 2));
    const context = await browser.newContext(contextOptions);
    
    return context;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.isInitialized = false;
  }

  async restartBrowser(): Promise<void> {
    await this.close();
    await this.launchBrowser();
    this.health.restarts++;
  }

  getBrowserVersion(): string {
    if (!this.browser) {
      return 'Unknown';
    }
    
    try {
      return this.browser.version();
    } catch (error) {
      return 'Unknown';
    }
  }

  private buildLaunchOptions(): LaunchOptions {
    const headless = ConfigurationManager.getBoolean('HEADLESS', false);
    
    console.log(`🔍 DEBUG: Building launch options - headless: ${headless}`);
    
    const browserArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    
    if (ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false) && !headless) {
      console.log('🔍 DEBUG: Browser maximized mode enabled');
      browserArgs.push('--start-maximized');
      browserArgs.push('--disable-blink-features=AutomationControlled');
    } else {
      const width = ConfigurationManager.getNumber('VIEWPORT_WIDTH', 1920);
      const height = ConfigurationManager.getNumber('VIEWPORT_HEIGHT', 1080);
      browserArgs.push(`--window-size=${width},${height}`);
    }
    
    const options: LaunchOptions = {
      headless: headless,
      args: browserArgs,
      ignoreDefaultArgs: ['--enable-automation'],
      timeout: 30000
    };
    
    console.log('🔍 DEBUG: Browser launch options:', JSON.stringify(options, null, 2));

    return options;
  }

  private loadConfigFromManager(): BrowserConfig {
    const config: any = {
      browser: (ConfigurationManager.get('BROWSER', 'chromium') as any),
      headless: ConfigurationManager.getBoolean('HEADLESS', false),
      slowMo: ConfigurationManager.getNumber('BROWSER_SLOW_MO', 0) || 0,
      timeout: ConfigurationManager.getNumber('TIMEOUT', 30000) || 30000,
      downloadsPath: ConfigurationManager.get('DOWNLOADS_PATH', './downloads'),
      ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false)
    };
    
    if (!ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false)) {
      config.viewport = {
        width: ConfigurationManager.getNumber('VIEWPORT_WIDTH', 1920) || 1920,
        height: ConfigurationManager.getNumber('VIEWPORT_HEIGHT', 1080) || 1080
      };
    }

    ActionLogger.logInfo('Browser configuration loaded:', config);

    return config;
  }

  private setupBrowserEventHandlers(): void {
    if (!this.browser) return;

    this.browser.on('disconnected', () => {
      this.health.isHealthy = false;
      if (this.eventHandlers.onDisconnected) {
        this.eventHandlers.onDisconnected();
      }
    });
  }

  private startHealthMonitoring(): void {
    ActionLogger.logInfo('🚫 Browser health monitoring disabled to prevent page flashing during tests');
    return;
    
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      this.health.isHealthy = false;
      return;
    }

    try {
      const contexts = this.browser.contexts();
      this.health.openPages = contexts.reduce((total, context) => total + context.pages().length, 0);
      this.health.isResponsive = true;
      this.health.isHealthy = true;
      this.health.lastHealthCheck = new Date();
    } catch (error) {
      this.health.isHealthy = false;
      this.health.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  getHealthStatus(): BrowserHealth {
    return { ...this.health };
  }

  setEventHandlers(handlers: BrowserEventHandlers): void {
    this.eventHandlers = { ...handlers };
  }

  async cleanup(): Promise<void> {
    await this.close();
  }

  async closeBrowser(): Promise<void> {
    await this.close();
  }
}
