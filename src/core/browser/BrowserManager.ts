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
  private isInitializing: boolean = false; // CRITICAL FIX: Prevent concurrent initialization
  private isInitialized: boolean = false; // CRITICAL FIX: Track initialization state
  private initializationPromise: Promise<void> | null = null; // PERFORMANCE FIX: Reuse initialization promise
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
  private readonly HEALTH_CHECK_INTERVAL = 60000; // PERFORMANCE: Reduced to 60 seconds

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * PERFORMANCE OPTIMIZED: Initialize browser manager with singleton protection
   */
  async initialize(config?: BrowserConfig): Promise<void> {
    // CRITICAL FIX: Prevent multiple concurrent initializations
    if (this.isInitialized) {
      return; // Already initialized
    }
    
    if (this.isInitializing && this.initializationPromise) {
      // Wait for ongoing initialization to complete
      return this.initializationPromise;
    }

    // Start initialization
    this.isInitializing = true;
    this.initializationPromise = this.performInitialization(config);
    
    try {
      await this.initializationPromise;
      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * PERFORMANCE OPTIMIZED: Actual initialization logic
   */
  private async performInitialization(config?: BrowserConfig): Promise<void> {
    try {
      // Use provided config or load from ConfigurationManager
      this.config = config || this.loadConfigFromManager();
      
      // Launch browser ONLY if not already launched
      if (!this.browser || !this.browser.isConnected()) {
        await this.launchBrowser();
      }
      
      // Start health monitoring (less frequent for performance)
      this.startHealthMonitoring();
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * PERFORMANCE OPTIMIZED: Launch browser with better error handling
   */
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
      
      // Setup browser event handlers
      this.setupBrowserEventHandlers();
      
      // Get browser version (synchronous method)
      const version = this.getBrowserVersion();
      
      return this.browser;
    } catch (error) {
      this.health.isHealthy = false;
      throw error;
    }
  }

  /**
   * PERFORMANCE OPTIMIZED: Get current browser instance with validation
   */
  getBrowser(): Browser {
    if (!this.browser || !this.browser.isConnected()) {
      throw new Error('Browser is not initialized or has been disconnected. Call initialize() first.');
    }
    return this.browser;
  }

  /**
   * PERFORMANCE OPTIMIZED: Get or create browser context
   */
  async getContext(): Promise<BrowserContext> {
    const browser = this.getBrowser();
    
    // Check if we have existing contexts
    const contexts = browser.contexts();
    if (contexts.length > 0) {
      // Return the first available context
      return contexts[0];
    }
    
    // Create new context with optimized settings
    const context = await browser.newContext({
      viewport: this.config?.viewport || { width: 1280, height: 720 },
      ignoreHTTPSErrors: this.config?.ignoreHTTPSErrors || false,
      // PERFORMANCE: Disable unnecessary features for speed
      recordVideo: undefined, // Disable video recording by default
      recordHar: undefined,   // Disable HAR recording by default
    });
    
    return context;
  }

  /**
   * PERFORMANCE OPTIMIZED: Close browser with proper cleanup
   */
  async closeBrowser(): Promise<void> {
    try {
      if (this.browser && this.browser.isConnected()) {
        // Close all contexts first
        const contexts = this.browser.contexts();
        await Promise.all(contexts.map(context => context.close().catch(() => {})));
        
        // Close browser
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      // Ignore errors during cleanup
    } finally {
      this.stopHealthMonitoring();
      this.isInitialized = false;
      this.initializationPromise = null;
    }
  }

  /**
   * PERFORMANCE OPTIMIZED: Restart browser
   */
  async restartBrowser(): Promise<void> {
    await this.closeBrowser();
    await this.launchBrowser();
    this.health.restarts++;
  }

  /**
   * Check if browser is healthy
   */
  isHealthy(): boolean {
    if (!this.browser || !this.browser.isConnected()) {
      return false;
    }
    return this.health.isHealthy;
  }

  /**
   * Get browser version
   */
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

  /**
   * PERFORMANCE OPTIMIZED: Build launch options
   */
  private buildLaunchOptions(): LaunchOptions {
    const options: LaunchOptions = {
      headless: this.config?.headless ?? true,
      slowMo: this.config?.slowMo ?? 0,
      timeout: this.config?.timeout ?? 30000,
      args: [
        // PERFORMANCE: Optimized Chrome args for speed
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        // Memory optimizations
        '--memory-pressure-off',
        '--max_old_space_size=4096'
      ]
    };

    // Add proxy configuration if available
    const proxyManager = ProxyManager.getInstance();
    if (proxyManager.isEnabled()) {
      const proxyConfig = proxyManager.getProxyConfig();
      if (proxyConfig && proxyConfig.servers && proxyConfig.servers.length > 0) {
        const firstProxy = proxyConfig.servers[0];
        options.proxy = {
          server: `${firstProxy.protocol}://${firstProxy.host}:${firstProxy.port}`,
          username: firstProxy.auth?.username,
          password: firstProxy.auth?.password
        };
      }
    }

    return options;
  }

  /**
   * Load configuration from ConfigurationManager
   */
  private loadConfigFromManager(): BrowserConfig {
    return {
      browser: (ConfigurationManager.get('BROWSER_TYPE', 'chromium') as any),
      headless: ConfigurationManager.getBoolean('BROWSER_HEADLESS', true), // Default to headless for performance
      slowMo: ConfigurationManager.getNumber('BROWSER_SLOW_MO', 0),
      timeout: ConfigurationManager.getNumber('BROWSER_TIMEOUT', 30000),
      viewport: {
        width: ConfigurationManager.getNumber('VIEWPORT_WIDTH', 1280),
        height: ConfigurationManager.getNumber('VIEWPORT_HEIGHT', 720)
      },
      downloadsPath: ConfigurationManager.get('DOWNLOADS_PATH', './downloads'),
      ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false)
    };
  }

  /**
   * Setup browser event handlers
   */
  private setupBrowserEventHandlers(): void {
    if (!this.browser) return;

    this.browser.on('disconnected', () => {
      this.health.isHealthy = false;
      if (this.eventHandlers.onDisconnected) {
        this.eventHandlers.onDisconnected();
      }
    });
  }

  /**
   * PERFORMANCE OPTIMIZED: Start health monitoring with reduced frequency
   * BROWSER FLASHING FIX: Disable health monitoring during test execution
   */
  private startHealthMonitoring(): void {
    // BROWSER FLASHING FIX: Disable health monitoring to prevent any potential page creation
    // Health monitoring can interfere with test execution and cause browser flashing
    ActionLogger.logInfo('🚫 Browser health monitoring disabled to prevent page flashing during tests');
    return;
    
    // OLD HEALTH MONITORING CODE - DISABLED TO PREVENT BROWSER FLASHING
    // if (this.healthCheckInterval) {
    //   return; // Already monitoring
    // }
    // this.healthCheckInterval = setInterval(async () => {
    //   try {
    //     await this.performHealthCheck();
    //   } catch (error) {
    //     // Ignore health check errors
    //   }
    // }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * PERFORMANCE OPTIMIZED: Perform health check
   */
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

  /**
   * Get health status
   */
  getHealthStatus(): BrowserHealth {
    return { ...this.health };
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: BrowserEventHandlers): void {
    this.eventHandlers = { ...handlers };
  }

  /**
   * PERFORMANCE OPTIMIZED: Cleanup method
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();
  }
}