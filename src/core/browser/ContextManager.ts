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

  static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  async createContext(browser: Browser, options?: ContextOptions): Promise<BrowserContext> {
    try {
      const contextId = this.generateContextId();
      ActionLogger.logInfo(`Creating browser context: ${contextId}`);
      
      const contextOptions = this.mergeWithDefaults(options);
      
      const playwrightOptions = this.convertToPlaywrightOptions(contextOptions);
      
      const context = await browser.newContext(playwrightOptions);
      
      this.contexts.set(contextId, context);
      this.contextOptions.set(contextId, contextOptions);
      
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

  async createScenarioContext(scenarioId: string): Promise<BrowserContext> {
    try {
      const browserManager = BrowserManager.getInstance();
      const browser = await browserManager.getBrowser();
      
      const options = this.getScenarioContextOptions(scenarioId);
      
      const context = await this.createContext(browser, options);
      
      this.contexts.set(`scenario-${scenarioId}`, context);
      
      return context;
    } catch (error) {
      ActionLogger.logError(`Failed to create context for scenario: ${scenarioId}`, error);
      throw error;
    }
  }

  getContext(contextId: string): BrowserContext {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context not found: ${contextId}`);
    }
    return context;
  }

  tryGetContext(contextId: string): BrowserContext | undefined {
    return this.contexts.get(contextId);
  }

  async closeContext(contextId: string): Promise<void> {
    try {
      const context = this.contexts.get(contextId);
      if (!context) {
        ActionLogger.logWarn(`Context not found for closing: ${contextId}`);
        return;
      }
      
      ActionLogger.logInfo(`Closing browser context: ${contextId}`);
      
      const pages = context.pages();
      for (const page of pages) {
        await page.close();
      }
      
      await context.close();
      
      this.contexts.delete(contextId);
      this.contextOptions.delete(contextId);
      
      ActionLogger.logInfo(`Browser context closed: ${contextId}`);
    } catch (error) {
      ActionLogger.logError(`Failed to close context: ${contextId}`, error);
      throw error;
    }
  }

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

  async applyContextOptions(context: BrowserContext, options: Partial<ContextOptions>): Promise<void> {
    try {
      if (options.viewport) {
        const pages = context.pages();
        for (const page of pages) {
          await page.setViewportSize(options.viewport);
        }
      }
      
      if (options.geolocation) {
        await context.setGeolocation(options.geolocation);
      }
      
      if (options.offline !== undefined) {
        await context.setOffline(options.offline);
      }
      
      if (options.extraHTTPHeaders) {
        await context.setExtraHTTPHeaders(options.extraHTTPHeaders);
      }
      
      ActionLogger.logInfo('Applied context options', options);
    } catch (error) {
      ActionLogger.logError('Failed to apply context options', error);
      throw error;
    }
  }

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

  async loadStorageState(contextId: string, path: string): Promise<void> {
    try {
      ActionLogger.logInfo(`Loading storage state for context: ${contextId}`);
      
      const options = this.contextOptions.get(contextId) || {};
      
      options.storageState = path;
      
      ActionLogger.logWarn('Storage state can only be set during context creation. Consider recreating the context.');
      
    } catch (error) {
      ActionLogger.logError('Failed to load storage state', error);
      throw error;
    }
  }

  getAllContexts(): Map<string, BrowserContext> {
    return new Map(this.contexts);
  }

  getContextCount(): number {
    return this.contexts.size;
  }

  async setHTTPCredentials(contextId: string, credentials: HTTPCredentials): Promise<void> {
    try {
      this.getContext(contextId);
      
      // Note: HTTP credentials can only be set during context creation
      ActionLogger.logWarn('HTTP credentials can only be set during context creation');
      
      const options = this.contextOptions.get(contextId);
      if (options) {
        options.httpCredentials = credentials;
      }
    } catch (error) {
      ActionLogger.logError('Failed to set HTTP credentials', error);
      throw error;
    }
  }

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

  private generateContextId(): string {
    return `context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private mergeWithDefaults(options?: ContextOptions): ContextOptions {
    const defaults: ContextOptions = {
      ignoreHTTPSErrors: ConfigurationManager.getBoolean('IGNORE_HTTPS_ERRORS', false),
      acceptDownloads: true,
      colorScheme: 'light',
      locale: ConfigurationManager.get('LOCALE', 'en-US'),
      timezone: ConfigurationManager.get('TIMEZONE', 'UTC')
    };
    
    const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
    console.log(`🔍 DEBUG: ContextManager.mergeWithDefaults - maximized mode: ${isMaximized}`);
    
    if (!isMaximized) {
      defaults.viewport = {
        width: ConfigurationManager.getInt('VIEWPORT_WIDTH', this.DEFAULT_VIEWPORT.width),
        height: ConfigurationManager.getInt('VIEWPORT_HEIGHT', this.DEFAULT_VIEWPORT.height)
      };
      console.log('🔍 DEBUG: ContextManager setting viewport:', defaults.viewport);
    } else {
      defaults.viewport = null;
      console.log('🔍 DEBUG: ContextManager - Setting viewport to null for maximized mode');
    }
    
    if (ConfigurationManager.getBoolean('PROXY_ENABLED')) {
      const proxyConfig = ProxyManager.getInstance().getContextProxy();
      if (proxyConfig) {
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

  private getScenarioContextOptions(_scenarioId: string): ContextOptions {
    return this.mergeWithDefaults();
  }

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

  private convertToPlaywrightOptions(options: ContextOptions): any {
    const playwrightOptions: Record<string, any> = {};
    
    Object.keys(options).forEach(key => {
      if (key !== 'storageState') {
        (playwrightOptions as any)[key] = (options as any)[key];
      }
    });
    
    if (options.storageState) {
      if (typeof options.storageState === 'string') {
        playwrightOptions['storageState'] = options.storageState;
      } else {
        playwrightOptions['storageState'] = {
          cookies: options.storageState.cookies || [],
          origins: options.storageState.origins || []
        };
      }
    }
    
    return playwrightOptions;
  }

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
