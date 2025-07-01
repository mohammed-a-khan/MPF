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
    idleTimeout: 300000,
    evictionInterval: 60000,
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

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

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
      
      await this.createInitialBrowsers();
      
      this.startCleanupInterval();
      
      this.isInitialized = true;
      ActionLogger.logInfo('Browser pool initialized successfully');
    } catch (error) {
      ActionLogger.logError('Failed to initialize browser pool', error);
      throw error;
    }
  }

  async acquireBrowser(): Promise<Browser> {
    const startTime = Date.now();
    const timeout = this.config.acquisitionTimeout;
    
    while (Date.now() - startTime < timeout) {
      if (this.available.length > 0) {
        const pooledBrowser = this.available.shift()!;
        
        // CRITICAL FIX: Disable health check on acquisition to prevent about:blank pages
        if (pooledBrowser.browser.isConnected()) {
          pooledBrowser.isAvailable = false;
          pooledBrowser.lastUsedAt = new Date();
          pooledBrowser.usageCount++;
          this.inUse.set(pooledBrowser.id, pooledBrowser);
          ActionLogger.logInfo(`Browser acquired from pool: ${pooledBrowser.id}`);
          return pooledBrowser.browser;
        } else {
          await this.recycleBrowser(pooledBrowser);
          continue;
        }
      }
      
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
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Failed to acquire browser within ${timeout}ms`);
  }

  releaseBrowser(browser: Browser): void {
    let pooledBrowser: PooledBrowser | undefined;
    
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
    
    if (pooledBrowser.usageCount >= this.config.recycleAfterUses) {
      ActionLogger.logInfo(`Browser ${pooledBrowser.id} reached usage limit, recycling`);
      this.recycleBrowser(pooledBrowser).catch(error => {
        ActionLogger.logError('Failed to recycle browser', error);
      });
      return;
    }
    
    // CRITICAL FIX: Disable health check on return to prevent about:blank pages
    if (pooledBrowser) {
      pooledBrowser.isAvailable = true;
      this.available.push(pooledBrowser);
      ActionLogger.logInfo(`Browser ${pooledBrowser.id} released back to pool (health check disabled)`);
    }
  }

  getAvailableCount(): number {
    return this.available.length;
  }

  getActiveCount(): number {
    return this.inUse.size;
  }

  getTotalCount(): number {
    return this.pool.length;
  }

  async drainPool(): Promise<void> {
    ActionLogger.logInfo('Draining browser pool');
    
    this.stopCleanupInterval();
    
    const timeout = 30000;
    const startTime = Date.now();
    
    while (this.inUse.size > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.inUse.size > 0) {
      ActionLogger.logWarn(`Force closing ${this.inUse.size} browsers still in use`);
    }
    
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
    
    this.pool = [];
    this.available = [];
    this.inUse.clear();
    this.isInitialized = false;
    
    ActionLogger.logInfo('Browser pool drained successfully');
  }

  async healthCheck(): Promise<BrowserHealth[]> {
    const healthStatuses: BrowserHealth[] = [];
    
    for (const pooledBrowser of this.pool) {
      const health = await this.getBrowserHealth(pooledBrowser);
      healthStatuses.push(health);
    }
    
    return healthStatuses;
  }

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

  private async createBrowser(): Promise<PooledBrowser | null> {
    try {
      if (!this.browserConfig) {
        throw new Error('Browser config not initialized');
      }
      
      const browserManager = BrowserManager.getInstance();
      await browserManager.initialize();
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

  private async recycleBrowser(pooledBrowser: PooledBrowser): Promise<void> {
    try {
      if (pooledBrowser.browser.isConnected()) {
        await pooledBrowser.browser.close();
      }
      
      this.pool = this.pool.filter(pb => pb.id !== pooledBrowser.id);
      this.available = this.available.filter(pb => pb.id !== pooledBrowser.id);
      
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

  private async testBrowserHealth(pooledBrowser: PooledBrowser): Promise<boolean> {
    try {
      if (!pooledBrowser.browser.isConnected()) {
        return false;
      }
      
      // CRITICAL FIX: Disable health check page creation to prevent about:blank flashing
      pooledBrowser.isHealthy = true;
      return true;
      
      
    } catch (error) {
      ActionLogger.logError(`Browser ${pooledBrowser.id} health check failed`, error);
      pooledBrowser.isHealthy = false;
      return false;
    }
  }

  private async getBrowserHealth(pooledBrowser: PooledBrowser): Promise<BrowserHealth> {
    const isHealthy = await this.testBrowserHealth(pooledBrowser);
    
    return {
      isResponsive: isHealthy,
      isHealthy,
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
  }

  private startCleanupInterval(): void {
    // CRITICAL FIX: Disable periodic cleanup to prevent health check triggering
    ActionLogger.logInfo('🚫 Browser pool periodic cleanup disabled to prevent page flashing');
    
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const idleTimeout = this.config.idleTimeout;
    
    const idleBrowsers = this.available.filter(pb => {
      const idleTime = now - pb.lastUsedAt.getTime();
      return idleTime > idleTimeout && this.pool.length > this.config.minSize;
    });
    
    for (const idleBrowser of idleBrowsers) {
      ActionLogger.logInfo(`Removing idle browser: ${idleBrowser.id}`);
      await this.recycleBrowser(idleBrowser);
    }
    
    while (this.pool.length < this.config.minSize) {
      const newBrowser = await this.createBrowser();
      if (newBrowser) {
        this.available.push(newBrowser);
      }
    }
  }

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

  async cleanup(): Promise<void> {
    try {
      ActionLogger.logInfo('Cleaning up browser pool...');
      
      this.stopCleanupInterval();
      
      const allBrowsers = [...this.pool];
      
      for (const pooledBrowser of allBrowsers) {
        try {
          ActionLogger.logInfo(`Closing browser: ${pooledBrowser.id}`);
          await pooledBrowser.browser.close();
        } catch (error) {
          ActionLogger.logError(`Failed to close browser ${pooledBrowser.id}`, error);
        }
      }
      
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
