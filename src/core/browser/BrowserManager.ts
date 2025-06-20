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
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

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
   * Initialize browser manager with configuration - SINGLETON PROTECTED
   */
  async initialize(config?: BrowserConfig): Promise<void> {
    // CRITICAL FIX: Prevent multiple concurrent initializations
    if (this.isInitialized) {
      ActionLogger.logInfo('✅ Browser Manager already initialized - skipping duplicate initialization');
      return;
    }
    
    if (this.isInitializing) {
      ActionLogger.logInfo('⏳ Browser Manager initialization in progress - waiting...');
      // Wait for current initialization to complete
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;
    
    try {
      ActionLogger.logInfo('🚀 Initializing Browser Manager (singleton protection active)');
      
      // Use provided config or load from ConfigurationManager
      this.config = config || this.loadConfigFromManager();
      
      // Launch browser ONLY if not already launched
      if (!this.browser || !this.browser.isConnected()) {
        await this.launchBrowser();
      }
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.isInitialized = true;
      ActionLogger.logInfo('✅ Browser Manager initialized successfully (singleton)');
    } catch (error) {
      ActionLogger.logError('❌ Failed to initialize Browser Manager', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Launch browser based on configuration
   */
  async launchBrowser(browserType?: string): Promise<Browser> {
    try {
      const type = browserType || this.config?.browser || 'chromium';
      ActionLogger.logInfo(`Launching ${type} browser`);
      
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
      
      // Get browser version (no await needed - method is now synchronous)
      const version = this.getBrowserVersion();
      ActionLogger.logInfo(`Browser launched successfully: ${type} ${version}`);
      
      return this.browser;
    } catch (error) {
      ActionLogger.logError('Failed to launch browser', error);
      this.health.isHealthy = false;
      throw error;
    }
  }

  /**
   * Get current browser instance
   */
  getBrowser(): Browser {
    if (!this.browser || !this.browser.isConnected()) {
      throw new Error('Browser is not initialized or has been disconnected');
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<void> {
    try {
      if (this.browser && this.browser.isConnected()) {
        ActionLogger.logInfo('Closing browser');
        
        // Close all contexts first
        const contexts = this.browser.contexts();
        for (const context of contexts) {
          await context.close();
        }
        
        // Close browser
        await this.browser.close();
        this.browser = null;
        
        ActionLogger.logInfo('Browser closed successfully');
      }
    } catch (error) {
      ActionLogger.logError('Error closing browser', error);
      throw error;
    } finally {
      this.stopHealthMonitoring();
    }
  }

  /**
   * Restart browser
   */
  async restartBrowser(): Promise<void> {
    ActionLogger.logInfo('Restarting browser');
    
    await this.closeBrowser();
    await this.launchBrowser();
    
    this.health.restarts++;
    ActionLogger.logInfo('Browser restarted successfully');
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
      // CRITICAL FIX: Get version directly from browser without creating context
      // This prevents a browser window from flashing during initialization
      const version = this.browser.version();
      return version;
    } catch (error) {
      ActionLogger.logError('Failed to get browser version', error);
      return 'Unknown';
    }
  }

  /**
   * Take browser screenshot
   */
  async takeScreenshot(path: string): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    
    const contexts = this.browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser context available for screenshot');
    }
    
    const context = contexts[0];
    if (!context) {
      throw new Error('Context is undefined');
    }
    
    const pages = context.pages();
    if (pages.length === 0) {
      throw new Error('No pages available for screenshot');
    }
    
    const page = pages[0];
    if (!page) {
      throw new Error('Page is undefined');
    }
    
    await page.screenshot({ path, fullPage: true });
    ActionLogger.logInfo(`Screenshot saved to: ${path}`);
  }

  /**
   * Get resource usage statistics
   */
  async getResourceStats(): Promise<ResourceStats> {
    const contexts = this.browser?.contexts() || [];
    let totalPages = 0;
    let activeDownloads = 0;
    
    for (const context of contexts) {
      totalPages += context.pages().length;
    }
    
    return {
      memoryUsage: this.health.memoryUsage,
      cpuUsage: 0, // Would need OS-level monitoring
      openPages: totalPages,
      openContexts: contexts.length,
      activeDownloads
    };
  }

  /**
   * Get browser health status
   */
  getHealthStatus(): BrowserHealth {
    return { ...this.health };
  }

  /**
   * Force garbage collection
   */
  async forceGarbageCollection(): Promise<void> {
    if (!this.browser) return;
    
    try {
      const contexts = this.browser.contexts();
      for (const context of contexts) {
        const pages = context.pages();
        for (const page of pages) {
          await page.evaluate(() => {
            if (typeof (window as any).gc === 'function') {
              (window as any).gc();
            }
          });
        }
      }
      ActionLogger.logInfo('Garbage collection completed');
    } catch (error) {
      ActionLogger.logError('Failed to force garbage collection', error);
    }
  }

  /**
   * Set browser event handlers
   */
  setEventHandlers(handlers: BrowserEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Build launch options
   */
  private buildLaunchOptions(): LaunchOptions {
    const options: LaunchOptions = {
      headless: this.config?.headless ?? false, // DEFAULT TO HEADED MODE FOR VISIBILITY
      downloadsPath: this.config?.downloadsPath || './downloads',
      args: this.config?.args || []
    };
    
    if (this.config?.slowMo !== undefined) {
      options.slowMo = this.config.slowMo;
    }
    
    if (this.config?.timeout !== undefined) {
      options.timeout = this.config.timeout;
    }
    
    // Add common args
    options.args!.push(
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    );
    
    // Configure proxy if enabled
    if (ConfigurationManager.getBoolean('PROXY_ENABLED')) {
      const proxyManager = ProxyManager.getInstance();
      const proxyConfig = proxyManager.getBrowserProxy();
      if (proxyConfig) {
        // Convert ProxySettings to LaunchOptions proxy format
        const proxy: {
          server: string;
          username?: string;
          password?: string;
          bypass?: string;
        } = {
          server: proxyConfig.server
        };
        
        if (proxyConfig.username !== undefined) {
          proxy.username = proxyConfig.username;
        }
        
        if (proxyConfig.password !== undefined) {
          proxy.password = proxyConfig.password;
        }
        
        if (proxyConfig.bypass !== undefined) {
          proxy.bypass = proxyConfig.bypass.join(',');
        }
        
        options.proxy = proxy;
      }
    }
    
    // Note: tracesDir is not part of Playwright's LaunchOptions
    // It should be handled separately when creating traces
    
    // Ignore HTTPS errors if configured
    if (this.config?.ignoreHTTPSErrors) {
      options.args!.push('--ignore-certificate-errors');
    }
    
    return options;
  }

  /**
   * Load configuration from ConfigurationManager
   */
  private loadConfigFromManager(): BrowserConfig {
    return {
      browser: ConfigurationManager.get('DEFAULT_BROWSER', 'chromium') as any,
      headless: false, // FORCE HEADED MODE FOR VISIBILITY
      slowMo: ConfigurationManager.getInt('BROWSER_SLOWMO', 1000), // Default slowMo for visibility
      timeout: ConfigurationManager.getInt('DEFAULT_TIMEOUT', 30000),
      viewport: {
        width: ConfigurationManager.getInt('VIEWPORT_WIDTH', 1920),
        height: ConfigurationManager.getInt('VIEWPORT_HEIGHT', 1080)
      },
      downloadsPath: ConfigurationManager.get('DOWNLOADS_PATH', './downloads'),
      ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false),
      tracesDir: ConfigurationManager.get('TRACES_DIR', './traces'),
      videosDir: ConfigurationManager.get('VIDEOS_DIR', './videos')
    };
  }

  /**
   * Setup browser event handlers
   */
  private setupBrowserEventHandlers(): void {
    if (!this.browser) return;
    
    this.browser.on('disconnected', () => {
      ActionLogger.logWarn('Browser disconnected');
      this.health.isHealthy = false;
      this.health.crashes++;
      
      if (this.eventHandlers.onDisconnected) {
        this.eventHandlers.onDisconnected();
      }
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // CRITICAL FIX: Disable periodic health monitoring to prevent about:blank page creation
    // Periodic health checks were causing browser pages to flash every 30 seconds
    ActionLogger.logInfo('🚫 Health monitoring disabled to prevent browser page flashing');
    
    // OLD CODE THAT CAUSED PERIODIC about:blank PAGES - PERMANENTLY DISABLED
    // this.healthCheckInterval = setInterval(async () => {
    //   await this.performHealthCheck();
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
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!this.browser || !this.browser.isConnected()) {
        this.health.isHealthy = false;
        return;
      }
      
      // CRITICAL FIX: Disable health check page creation to prevent about:blank flashing
      // Simple connectivity check without creating pages
      this.health.isHealthy = true;
      this.health.responseTime = Date.now() - startTime;
      this.health.lastHealthCheck = new Date();
      
      // Get memory usage if possible
      if (process.memoryUsage) {
        this.health.memoryUsage = process.memoryUsage().heapUsed;
      }
      
      // OLD CODE THAT CAUSED about:blank PAGES - PERMANENTLY DISABLED
      // const context = await this.browser.newContext();
      // const page = await context.newPage();
      // await page.goto('about:blank');
      // await context.close();
      
    } catch (error) {
      ActionLogger.logError('Health check failed', error);
      this.health.isHealthy = false;
      
      // Consider restarting if unhealthy
      if (this.health.crashes > 3) {
        ActionLogger.logWarn('Too many crashes, considering browser restart');
      }
    }
  }


  /**
   * Get or create a browser context
   */
  async getContext(): Promise<BrowserContext> {
    if (!this.browser) {
      await this.launchBrowser();
    }
    
    if (!this.browser) {
      throw new Error('Failed to launch browser');
    }
    
    // Create a new context
    const context = await this.browser.newContext();
    
    ActionLogger.logInfo('Created new browser context');
    
    return context;
  }



  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();
    BrowserManager.instance = null as any;
  }
}