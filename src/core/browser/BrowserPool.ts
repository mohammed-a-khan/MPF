// src/core/browser/BrowserPool.ts

import { Browser } from 'playwright';
import { BrowserManager } from './BrowserManager';
import { ActionLogger } from '../logging/ActionLogger';
import { 
  BrowserConfig, 
  BrowserPoolConfig, 
  PooledBrowser, 
  BrowserHealth 
} from './types/browser.types';

export class BrowserPool {
  private static instance: BrowserPool;
  private pool: PooledBrowser[] = [];
  private available: PooledBrowser[] = [];
  private inUse: Map<string, PooledBrowser> = new Map();
  private config: BrowserPoolConfig;
  private browserConfig: BrowserConfig | null = null;
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_CONFIG: BrowserPoolConfig = {
    minSize: 1,
    maxSize: 4,
    acquisitionTimeout: 30000,
    idleTimeout: 300000, // 5 minutes
    evictionInterval: 60000, // 1 minute
    testOnAcquire: true,
    testOnReturn: true,
    recycleAfterUses: 50
  };
  private readonly DEFAULT_BROWSER_CONFIG: BrowserConfig = {
    browser: 'chromium',
    headless: true,
    slowMo: 0,
    timeout: 30000,
    viewport: { width: 1920, height: 1080 },
    downloadsPath: './downloads',
    ignoreHTTPSErrors: false,
    tracesDir: './traces',
    videosDir: './videos'
  };

  private constructor() {
    this.config = this.DEFAULT_CONFIG;
    this.browserConfig = this.DEFAULT_BROWSER_CONFIG;
  }

  /**
   * Get singleton instance - DISABLED TO PREVENT MULTIPLE BROWSER INSTANCES
   */
  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  /**
   * Initialize browser pool
   */
  async initialize(poolSize: number, config: BrowserConfig): Promise<void> {
    if (this.isInitialized) {
      ActionLogger.logWarn('Browser pool already initialized');
      return;
    }

    try {
      ActionLogger.logInfo(`Initializing browser pool with size: ${poolSize}`);
      
      this.browserConfig = config;
      this.config.maxSize = poolSize;
      this.config.minSize = Math.min(1, poolSize);
      
      // Create initial browsers
      await this.createInitialBrowsers();
      
      // Start cleanup interval
      this.startCleanupInterval();
      
      this.isInitialized = true;
      ActionLogger.logInfo('Browser pool initialized successfully');
    } catch (error) {
      ActionLogger.logError('Failed to initialize browser pool', error);
      throw error;
    }
  }

  /**
   * Acquire a browser from the pool
   */
  async acquireBrowser(): Promise<Browser> {
    const startTime = Date.now();
    const timeout = this.config.acquisitionTimeout;
    
    while (Date.now() - startTime < timeout) {
      // Check if we have available browsers
      if (this.available.length > 0) {
        const pooledBrowser = this.available.shift()!;
        
        // Test browser health if configured
        if (this.config.testOnAcquire) {
          const isHealthy = await this.testBrowserHealth(pooledBrowser);
          if (!isHealthy) {
            await this.recycleBrowser(pooledBrowser);
            continue;
          }
        }
        
        // Mark as in use
        pooledBrowser.isAvailable = false;
        pooledBrowser.lastUsedAt = new Date();
        pooledBrowser.usageCount++;
        this.inUse.set(pooledBrowser.id, pooledBrowser);
        
        ActionLogger.logInfo(`Browser acquired from pool: ${pooledBrowser.id}`);
        return pooledBrowser.browser;
      }
      
      // Try to create new browser if under max size
      if (this.pool.length < this.config.maxSize) {
        const newBrowser = await this.createBrowser();
        if (newBrowser) {
          newBrowser.isAvailable = false;
          newBrowser.lastUsedAt = new Date();
          newBrowser.usageCount++;
          this.inUse.set(newBrowser.id, newBrowser);
          
          ActionLogger.logInfo(`New browser created and acquired: ${newBrowser.id}`);
          return newBrowser.browser;
        }
      }
      
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Failed to acquire browser within ${timeout}ms`);
  }

  /**
   * Release browser back to pool
   */
  releaseBrowser(browser: Browser): void {
    // Find the pooled browser
    let pooledBrowser: PooledBrowser | undefined;
    
    // Iterate through the map to find the browser
    this.inUse.forEach((pb, id) => {
      if (!pooledBrowser && pb.browser === browser) {
        pooledBrowser = pb;
        this.inUse.delete(id);
      }
    });
    
    if (!pooledBrowser) {
      ActionLogger.logWarn('Attempted to release unknown browser');
      return;
    }
    
    // Check if browser should be recycled
    if (pooledBrowser.usageCount >= this.config.recycleAfterUses) {
      ActionLogger.logInfo(`Browser ${pooledBrowser.id} reached usage limit, recycling`);
      this.recycleBrowser(pooledBrowser).catch(error => {
        ActionLogger.logError('Failed to recycle browser', error);
      });
      return;
    }
    
    // Test browser health if configured
    if (this.config.testOnReturn && pooledBrowser) {
      const browserToTest = pooledBrowser; // Capture in closure
      this.testBrowserHealth(browserToTest).then(isHealthy => {
        if (isHealthy) {
          browserToTest.isAvailable = true;
          this.available.push(browserToTest);
          ActionLogger.logInfo(`Browser ${browserToTest.id} released back to pool`);
        } else {
          this.recycleBrowser(browserToTest).catch(error => {
            ActionLogger.logError('Failed to recycle unhealthy browser', error);
          });
        }
      });
    } else if (pooledBrowser) {
      pooledBrowser.isAvailable = true;
      this.available.push(pooledBrowser);
      ActionLogger.logInfo(`Browser ${pooledBrowser.id} released back to pool`);
    }
  }

  /**
   * Get number of available browsers
   */
  getAvailableCount(): number {
    return this.available.length;
  }

  /**
   * Get number of active browsers
   */
  getActiveCount(): number {
    return this.inUse.size;
  }

  /**
   * Get total pool size
   */
  getTotalCount(): number {
    return this.pool.length;
  }

  /**
   * Drain pool - close all browsers
   */
  async drainPool(): Promise<void> {
    ActionLogger.logInfo('Draining browser pool');
    
    // Stop cleanup interval
    this.stopCleanupInterval();
    
    // Wait for all browsers to be released
    const timeout = 30000;
    const startTime = Date.now();
    
    while (this.inUse.size > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.inUse.size > 0) {
      ActionLogger.logWarn(`Force closing ${this.inUse.size} browsers still in use`);
    }
    
    // Close all browsers
    const closePromises = this.pool.map(async pooledBrowser => {
      try {
        if (pooledBrowser.browser.isConnected()) {
          await pooledBrowser.browser.close();
        }
      } catch (error) {
        ActionLogger.logError(`Failed to close browser ${pooledBrowser.id}`, error);
      }
    });
    
    await Promise.all(closePromises);
    
    // Clear pool
    this.pool = [];
    this.available = [];
    this.inUse.clear();
    this.isInitialized = false;
    
    ActionLogger.logInfo('Browser pool drained successfully');
  }

  /**
   * Perform health check on all browsers
   */
  async healthCheck(): Promise<BrowserHealth[]> {
    const healthStatuses: BrowserHealth[] = [];
    
    for (const pooledBrowser of this.pool) {
      const health = await this.getBrowserHealth(pooledBrowser);
      healthStatuses.push(health);
    }
    
    return healthStatuses;
  }

  /**
   * Create initial browsers for pool
   */
  private async createInitialBrowsers(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < this.config.minSize; i++) {
      promises.push(this.createBrowser().then(browser => {
        if (browser) {
          this.available.push(browser);
        }
      }));
    }
    
    await Promise.all(promises);
  }

  /**
   * Create a new browser
   */
  private async createBrowser(): Promise<PooledBrowser | null> {
    try {
      if (!this.browserConfig) {
        throw new Error('Browser config not initialized');
      }
      
      const browserManager = BrowserManager.getInstance();
      await browserManager.initialize(this.browserConfig);
      const browser = await browserManager.launchBrowser();
      
      const pooledBrowser: PooledBrowser = {
        id: `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        browser,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        useCount: 0,
        usageCount: 0,
        isHealthy: true,
        isAvailable: true
      };
      
      this.pool.push(pooledBrowser);
      ActionLogger.logInfo(`Created new browser in pool: ${pooledBrowser.id}`);
      
      return pooledBrowser;
    } catch (error) {
      ActionLogger.logError('Failed to create browser', error);
      return null;
    }
  }

  /**
   * Recycle a browser
   */
  private async recycleBrowser(pooledBrowser: PooledBrowser): Promise<void> {
    try {
      // Close the old browser
      if (pooledBrowser.browser.isConnected()) {
        await pooledBrowser.browser.close();
      }
      
      // Remove from pool
      this.pool = this.pool.filter(pb => pb.id !== pooledBrowser.id);
      this.available = this.available.filter(pb => pb.id !== pooledBrowser.id);
      
      // Create replacement if pool is below minimum
      if (this.pool.length < this.config.minSize) {
        const newBrowser = await this.createBrowser();
        if (newBrowser) {
          this.available.push(newBrowser);
        }
      }
      
      ActionLogger.logInfo(`Browser ${pooledBrowser.id} recycled`);
    } catch (error) {
      ActionLogger.logError(`Failed to recycle browser ${pooledBrowser.id}`, error);
    }
  }

  /**
   * Test browser health
   */
  private async testBrowserHealth(pooledBrowser: PooledBrowser): Promise<boolean> {
    try {
      if (!pooledBrowser.browser.isConnected()) {
        return false;
      }
      
      // Try to create a context and page
      const context = await pooledBrowser.browser.newContext();
      const page = await context.newPage();
      await page.goto('about:blank');
      await context.close();
      
      pooledBrowser.isHealthy = true;
      return true;
    } catch (error) {
      ActionLogger.logError(`Browser ${pooledBrowser.id} health check failed`, error);
      pooledBrowser.isHealthy = false;
      return false;
    }
  }

  /**
   * Get browser health status
   */
  private async getBrowserHealth(pooledBrowser: PooledBrowser): Promise<BrowserHealth> {
    const isHealthy = await this.testBrowserHealth(pooledBrowser);
    
    return {
      isResponsive: isHealthy,
      isHealthy,
      memoryUsage: 0, // Would need OS-level monitoring
      cpuUsage: 0, // Would need OS-level monitoring
      openPages: 0, // Would need to track per browser
      lastCheck: new Date(),
      lastHealthCheck: new Date(),
      errors: [],
      crashes: 0, // Would need to track this
      restarts: 0, // Would need to track this
      responseTime: 0 // Would need to measure
    };
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.evictionInterval);
  }

  /**
   * Stop cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Perform cleanup of idle browsers
   */
  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const idleTimeout = this.config.idleTimeout;
    
    // Check for idle browsers
    const idleBrowsers = this.available.filter(pb => {
      const idleTime = now - pb.lastUsedAt.getTime();
      return idleTime > idleTimeout && this.pool.length > this.config.minSize;
    });
    
    // Remove idle browsers
    for (const idleBrowser of idleBrowsers) {
      ActionLogger.logInfo(`Removing idle browser: ${idleBrowser.id}`);
      await this.recycleBrowser(idleBrowser);
    }
    
    // Ensure minimum pool size
    while (this.pool.length < this.config.minSize) {
      const newBrowser = await this.createBrowser();
      if (newBrowser) {
        this.available.push(newBrowser);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStatistics(): any {
    return {
      total: this.pool.length,
      available: this.available.length,
      inUse: this.inUse.size,
      config: this.config,
      browsers: this.pool.map(pb => ({
        id: pb.id,
        createdAt: pb.createdAt,
        lastUsedAt: pb.lastUsedAt,
        usageCount: pb.usageCount,
        isHealthy: pb.isHealthy,
        isAvailable: pb.isAvailable
      }))
    };
  }

  /**
   * Cleanup and shutdown the browser pool
   */
  async cleanup(): Promise<void> {
    try {
      ActionLogger.logInfo('Cleaning up browser pool...');
      
      // Stop cleanup interval
      this.stopCleanupInterval();
      
      // Close all browsers
      const allBrowsers = [...this.pool];
      
      for (const pooledBrowser of allBrowsers) {
        try {
          ActionLogger.logInfo(`Closing browser: ${pooledBrowser.id}`);
          await pooledBrowser.browser.close();
        } catch (error) {
          ActionLogger.logError(`Failed to close browser ${pooledBrowser.id}`, error);
        }
      }
      
      // Clear collections
      this.pool.length = 0;
      this.available.length = 0;
      this.inUse.clear();
      
      this.isInitialized = false;
      ActionLogger.logInfo('Browser pool cleanup completed');
    } catch (error) {
      ActionLogger.logError('Browser pool cleanup failed', error);
      throw error;
    }
  }
}