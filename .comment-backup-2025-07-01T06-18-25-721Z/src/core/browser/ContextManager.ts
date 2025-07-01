// src/core/browser/ContextManager.ts

import { Browser, BrowserContext, Page } from 'playwright';
import { BrowserManager } from './BrowserManager';
import { ProxyManager } from '../proxy/ProxyManager';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import { ActionLogger } from '../logging/ActionLogger';
import { 
  ContextOptions, 
  HTTPCredentials,
  Geolocation 
} from './types/browser.types';

export class ContextManager {
  private static instance: ContextManager;
  private contexts: Map<string, BrowserContext> = new Map();
  private contextOptions: Map<string, ContextOptions> = new Map();
  private readonly DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  /**
   * Create a new browser context
   */
  async createContext(browser: Browser, options?: ContextOptions): Promise<BrowserContext> {
    try {
      const contextId = this.generateContextId();
      ActionLogger.logInfo(`Creating browser context: ${contextId}`);
      
      // Merge with default options
      const contextOptions = this.mergeWithDefaults(options);
      
      // Convert to Playwright's expected format
      const playwrightOptions = this.convertToPlaywrightOptions(contextOptions);
      
      // Create context
      const context = await browser.newContext(playwrightOptions);
      
      // Store context and options
      this.contexts.set(contextId, context);
      this.contextOptions.set(contextId, contextOptions);
      
      // Setup context event handlers
      this.setupContextEventHandlers(context, contextId);
      
      ActionLogger.logInfo(`Browser context created: ${contextId}`, {
        viewport: contextOptions.viewport,
        userAgent: contextOptions.userAgent,
        locale: contextOptions.locale
      });
      
      return context;
    } catch (error) {
      ActionLogger.logError('Failed to create browser context', error);
      throw error;
    }
  }

  /**
   * Create context for a specific scenario
   */
  async createScenarioContext(scenarioId: string): Promise<BrowserContext> {
    try {
      const browserManager = BrowserManager.getInstance();
      const browser = await browserManager.getBrowser();
      
      // Get scenario-specific options
      const options = this.getScenarioContextOptions(scenarioId);
      
      // Create context
      const context = await this.createContext(browser, options);
      
      // Map scenario ID to context
      this.contexts.set(`scenario-${scenarioId}`, context);
      
      return context;
    } catch (error) {
      ActionLogger.logError(`Failed to create context for scenario: ${scenarioId}`, error);
      throw error;
    }
  }

  /**
   * Get context by ID
   */
  getContext(contextId: string): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    return context;
  }

  /**
   * Try to get context by ID (returns undefined if not found)
   */
  tryGetContext(contextId: string): BrowserContext | undefined {
    return this.contexts.get(contextId);
  }

  /**
   * Close a specific context
   */
  async closeContext(contextId: string): Promise<void> {
    try {
      const context = this.contexts.get(contextId);
      if (!context) {
        ActionLogger.logWarn(`Context not found for closing: ${contextId}`);
        return;
      }
      
      ActionLogger.logInfo(`Closing browser context: ${contextId}`);
      
      // Close all pages in context first
      const pages = context.pages();
      for (const page of pages) {
        await page.close();
      }
      
      // Close context
      await context.close();
      
      // Remove from maps
      this.contexts.delete(contextId);
      this.contextOptions.delete(contextId);
      
      ActionLogger.logInfo(`Browser context closed: ${contextId}`);
    } catch (error) {
      ActionLogger.logError(`Failed to close context: ${contextId}`, error);
      throw error;
    }
  }

  /**
   * Close all contexts
   */
  async closeAllContexts(): Promise<void> {
    ActionLogger.logInfo('Closing all browser contexts');
    
    const closePromises: Promise<void>[] = [];
    
    this.contexts.forEach((_, contextId) => {
      closePromises.push(this.closeContext(contextId));
    });
    
    await Promise.all(closePromises);
    
    this.contexts.clear();
    this.contextOptions.clear();
    
    ActionLogger.logInfo('All browser contexts closed');
  }

  /**
   * Apply additional options to existing context
   */
  async applyContextOptions(context: BrowserContext, options: Partial<ContextOptions>): Promise<void> {
    try {
      // Apply viewport
      if (options.viewport) {
        const pages = context.pages();
        for (const page of pages) {
          await page.setViewportSize(options.viewport);
        }
      }
      
      // Apply geolocation
      if (options.geolocation) {
        await context.setGeolocation(options.geolocation);
      }
      
      // Apply offline mode
      if (options.offline !== undefined) {
        await context.setOffline(options.offline);
      }
      
      // Apply extra HTTP headers
      if (options.extraHTTPHeaders) {
        await context.setExtraHTTPHeaders(options.extraHTTPHeaders);
      }
      
      ActionLogger.logInfo('Applied context options', options);
    } catch (error) {
      ActionLogger.logError('Failed to apply context options', error);
      throw error;
    }
  }

  /**
   * Save storage state
   */
  async saveStorageState(contextId: string, path: string): Promise<void> {
    try {
      const context = this.getContext(contextId);
      
      ActionLogger.logInfo(`Saving storage state for context: ${contextId}`);
      
      await context.storageState({ path });
      
      ActionLogger.logInfo(`Storage state saved to: ${path}`);
    } catch (error) {
      ActionLogger.logError('Failed to save storage state', error);
      throw error;
    }
  }

  /**
   * Load storage state
   */
  async loadStorageState(contextId: string, path: string): Promise<void> {
    try {
      ActionLogger.logInfo(`Loading storage state for context: ${contextId}`);
      
      // Get current context options
      const options = this.contextOptions.get(contextId) || {};
      
      // Update storage state
      options.storageState = path;
      
      // Context needs to be recreated with storage state
      ActionLogger.logWarn('Storage state can only be set during context creation. Consider recreating the context.');
      
    } catch (error) {
      ActionLogger.logError('Failed to load storage state', error);
      throw error;
    }
  }

  /**
   * Get all active contexts
   */
  getAllContexts(): Map<string, BrowserContext> {
    return new Map(this.contexts);
  }

  /**
   * Get context count
   */
  getContextCount(): number {
    return this.contexts.size;
  }

  /**
   * Set HTTP credentials for context
   */
  async setHTTPCredentials(contextId: string, credentials: HTTPCredentials): Promise<void> {
    try {
      this.getContext(contextId); // Verify context exists
      
      // Note: HTTP credentials can only be set during context creation
      // This is a limitation of Playwright
      ActionLogger.logWarn('HTTP credentials can only be set during context creation');
      
      // Store for future reference
      const options = this.contextOptions.get(contextId);
      if (options) {
        options.httpCredentials = credentials;
      }
    } catch (error) {
      ActionLogger.logError('Failed to set HTTP credentials', error);
      throw error;
    }
  }

  /**
   * Set geolocation for context
   */
  async setGeolocation(contextId: string, geolocation: Geolocation): Promise<void> {
    try {
      const context = this.getContext(contextId);
      
      await context.setGeolocation(geolocation);
      
      ActionLogger.logInfo(`Geolocation set for context: ${contextId}`, geolocation);
    } catch (error) {
      ActionLogger.logError('Failed to set geolocation', error);
      throw error;
    }
  }

  /**
   * Grant permissions
   */
  async grantPermissions(contextId: string, permissions: string[]): Promise<void> {
    try {
      const context = this.getContext(contextId);
      
      await context.grantPermissions(permissions);
      
      ActionLogger.logInfo(`Permissions granted for context: ${contextId}`, permissions);
    } catch (error) {
      ActionLogger.logError('Failed to grant permissions', error);
      throw error;
    }
  }

  /**
   * Clear permissions
   */
  async clearPermissions(contextId: string): Promise<void> {
    try {
      const context = this.getContext(contextId);
      
      await context.clearPermissions();
      
      ActionLogger.logInfo(`Permissions cleared for context: ${contextId}`);
    } catch (error) {
      ActionLogger.logError('Failed to clear permissions', error);
      throw error;
    }
  }

  /**
   * Generate unique context ID
   */
  private generateContextId(): string {
    return `context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Merge with default options
   */
  private mergeWithDefaults(options?: ContextOptions): ContextOptions {
    const defaults: ContextOptions = {
      ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false),
      acceptDownloads: true,
      colorScheme: 'light',
      locale: ConfigurationManager.get('LOCALE', 'en-US'),
      timezone: ConfigurationManager.get('TIMEZONE', 'UTC')
    };
    
    // Only set viewport if not in maximized mode
    const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
    console.log(`🔍 DEBUG: ContextManager.mergeWithDefaults - maximized mode: ${isMaximized}`);
    
    if (!isMaximized) {
      defaults.viewport = {
        width: ConfigurationManager.getInt('VIEWPORT_WIDTH', this.DEFAULT_VIEWPORT.width),
        height: ConfigurationManager.getInt('VIEWPORT_HEIGHT', this.DEFAULT_VIEWPORT.height)
      };
      console.log('🔍 DEBUG: ContextManager setting viewport:', defaults.viewport);
    } else {
      // Explicitly set viewport to null for maximized mode
      defaults.viewport = null;
      console.log('🔍 DEBUG: ContextManager - Setting viewport to null for maximized mode');
    }
    
    // Apply proxy if enabled
    if (ConfigurationManager.getBoolean('PROXY_ENABLED')) {
      const proxyConfig = ProxyManager.getInstance().getContextProxy();
      if (proxyConfig) {
        // Convert ProxySettings to ContextOptions proxy format
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
        
        defaults.proxy = proxy;
      }
    }
    
    return { ...defaults, ...options };
  }

  /**
   * Get scenario-specific context options
   */
  private getScenarioContextOptions(_scenarioId: string): ContextOptions {
    // This could be extended to load scenario-specific options
    // For now, return default options
    // In the future, scenarioId can be used to load specific configurations
    return this.mergeWithDefaults();
  }

  /**
   * Setup context event handlers
   */
  private setupContextEventHandlers(context: BrowserContext, contextId: string): void {
    context.on('page', (page: Page) => {
      ActionLogger.logInfo(`New page created in context: ${contextId}`, {
        url: page.url()
      });
    });
    
    context.on('close', () => {
      ActionLogger.logInfo(`Context closed: ${contextId}`);
      this.contexts.delete(contextId);
      this.contextOptions.delete(contextId);
    });
  }

  /**
   * Convert ContextOptions to Playwright's BrowserContextOptions
   */
  private convertToPlaywrightOptions(options: ContextOptions): any {
    // Create a new object to avoid mutating the original
    const playwrightOptions: Record<string, any> = {};
    
    // Copy all properties except those that need special handling
    Object.keys(options).forEach(key => {
      if (key !== 'storageState') {
        (playwrightOptions as any)[key] = (options as any)[key];
      }
    });
    
    // Handle storageState conversion
    if (options.storageState) {
      if (typeof options.storageState === 'string') {
        // If it's a string (file path), pass it as-is
        playwrightOptions['storageState'] = options.storageState;
      } else {
        // If it's an object, ensure required properties are present
        playwrightOptions['storageState'] = {
          cookies: options.storageState.cookies || [],
          origins: options.storageState.origins || []
        };
      }
    }
    
    return playwrightOptions;
  }

  /**
   * Get context statistics
   */
  getStatistics(): any {
    const stats: any = {
      totalContexts: this.contexts.size,
      contexts: []
    };
    
    this.contexts.forEach((context, id) => {
      const pages = context.pages();
      stats.contexts.push({
        id,
        pageCount: pages.length,
        options: this.contextOptions.get(id)
      });
    });
    
    return stats;
  }
}