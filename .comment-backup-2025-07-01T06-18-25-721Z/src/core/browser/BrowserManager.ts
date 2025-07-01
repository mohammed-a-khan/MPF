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
   * Initialize browser manager with singleton protection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('🔍 DEBUG: BrowserManager already initialized');
      return;
    }

    console.log('🔍 DEBUG: Initializing BrowserManager');
    await this.createBrowser();
    
    // Create default context
    if (this.browser && !this.defaultContext) {
      console.log('🔍 DEBUG: Creating default browser context');
      
      // Build context options
      const contextOptions: any = {
        ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false)
      };
      
      // Handle maximized mode
      const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
      if (isMaximized) {
        contextOptions.viewport = null;
        console.log('🔍 DEBUG: Default context created with viewport=null for maximized mode');
      } else {
        // Use configured viewport if not maximized
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

  /**
   * Get current browser instance with validation
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.initialize();
    }
    
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    
    return this.browser;
  }

  /**
   * Get default browser context
   */
  getDefaultContext(): BrowserContext {
    if (!this.defaultContext) {
      throw new Error('Browser context not initialized. Call initialize() first.');
    }
    return this.defaultContext;
  }

  /**
   * Check if browser is healthy
   */
  isHealthy(): boolean {
    return this.isInitialized && this.browser !== null;
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
   * PERFORMANCE OPTIMIZED: Get or create browser context
   */
  async getContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    
    // Check if we have existing contexts
    const contexts = browser.contexts();
    if (contexts.length > 0 && contexts[0]) {
      // Return the first available context
      return contexts[0];
    }
    
    // Create new context with optimized settings
    const contextOptions: any = {
      ignoreHTTPSErrors: this.config?.ignoreHTTPSErrors || false
      // PERFORMANCE: video and HAR recording disabled by default
    };
    
    // Only set viewport if not in maximized mode
    const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
    console.log(`🔍 DEBUG: Creating context - maximized mode: ${isMaximized}`);
    
    if (!isMaximized && this.config?.viewport) {
      contextOptions.viewport = this.config.viewport;
      console.log('🔍 DEBUG: Setting viewport:', this.config.viewport);
    } else if (isMaximized) {
      // Explicitly set viewport to null for maximized mode
      contextOptions.viewport = null;
      console.log('🔍 DEBUG: Setting viewport to null for maximized mode');
    } else {
      console.log('🔍 DEBUG: No viewport configuration - using browser default');
    }
    
    console.log('🔍 DEBUG: Context options:', JSON.stringify(contextOptions, null, 2));
    const context = await browser.newContext(contextOptions);
    
    return context;
  }

  /**
   * PERFORMANCE OPTIMIZED: Close browser with proper cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.isInitialized = false;
  }

  /**
   * PERFORMANCE OPTIMIZED: Restart browser
   */
  async restartBrowser(): Promise<void> {
    await this.close();
    await this.launchBrowser();
    this.health.restarts++;
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
    // Load the headless configuration from ConfigurationManager
    const headless = ConfigurationManager.getBoolean('HEADLESS', false);
    
    console.log(`🔍 DEBUG: Building launch options - headless: ${headless}`);
    
    const browserArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    
    // Add maximization args based on configuration
    if (ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false) && !headless) {
      console.log('🔍 DEBUG: Browser maximized mode enabled');
      // For Chromium-based browsers, use start-maximized
      browserArgs.push('--start-maximized');
      // Also disable default viewport to use full window
      browserArgs.push('--disable-blink-features=AutomationControlled');
    } else {
      // If not maximized, use configured viewport size
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

  /**
   * Load configuration from ConfigurationManager
   */
  private loadConfigFromManager(): BrowserConfig {
    // Load configuration from environment files
    const config: any = {
      browser: (ConfigurationManager.get('BROWSER', 'chromium') as any),
      headless: ConfigurationManager.getBoolean('HEADLESS', false),
      slowMo: ConfigurationManager.getNumber('BROWSER_SLOW_MO', 0) || 0,
      timeout: ConfigurationManager.getNumber('TIMEOUT', 30000) || 30000,
      downloadsPath: ConfigurationManager.get('DOWNLOADS_PATH', './downloads'),
      ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false)
    };
    
    // Only set viewport if not in maximized mode
    if (!ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false)) {
      config.viewport = {
        width: ConfigurationManager.getNumber('VIEWPORT_WIDTH', 1920) || 1920,
        height: ConfigurationManager.getNumber('VIEWPORT_HEIGHT', 1080) || 1080
      };
    }

    // Log loaded configuration
    ActionLogger.logInfo('Browser configuration loaded:', config);

    return config;
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
    await this.close();
  }

  /**
   * Alias for close() method for backward compatibility
   */
  async closeBrowser(): Promise<void> {
    await this.close();
  }
}