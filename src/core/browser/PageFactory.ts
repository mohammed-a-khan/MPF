// src/core/browser/PageFactory.ts

import { BrowserContext, Page, ConsoleMessage, Dialog, Download, Request, Response, Frame } from 'playwright';
import { ContextManager } from './ContextManager';
import { ActionLogger } from '../logging/ActionLogger';
import { ConsoleLogger } from '../debugging/ConsoleLogger';
import { PageEventHandlers } from './types/browser.types';

export class PageFactory {
  private static instance: PageFactory;
  private pages: Map<string, Page> = new Map();
  private pageEventHandlers: Map<string, PageEventHandlers> = new Map();
  private dialogHandlers: Map<string, (dialog: Dialog) => Promise<void>> = new Map();
  private downloadTrackers: Map<string, Download[]> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): PageFactory {
    if (!PageFactory.instance) {
      PageFactory.instance = new PageFactory();
    }
    return PageFactory.instance;
  }

  /**
   * Create a new page
   */
  async createPage(context: BrowserContext): Promise<Page> {
    try {
      const pageId = this.generatePageId();
      ActionLogger.logInfo(`Creating new page: ${pageId}`);
      
      // Create page
      const page = await context.newPage();
      
      // Store page
      this.pages.set(pageId, page);
      
      // Maximize browser if configured
      // Check both ConfigurationManager and process.env as fallback
      let isMaximized = false;
      let isHeadless = false;
      
      try {
        const ConfigurationManager = require('../configuration/ConfigurationManager').ConfigurationManager;
        isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
        isHeadless = ConfigurationManager.getBoolean('HEADLESS', false);
      } catch (error) {
        // Fallback to process.env if ConfigurationManager is not available
        isMaximized = process.env['BROWSER_MAXIMIZED'] === 'true';
        isHeadless = process.env['HEADLESS'] === 'true';
      }
      
      console.log(`🔍 DEBUG PageFactory: BROWSER_MAXIMIZED=${isMaximized}, HEADLESS=${isHeadless}`);
      ActionLogger.logInfo(`PageFactory: BROWSER_MAXIMIZED=${isMaximized}, HEADLESS=${isHeadless}`);
      
      if (isMaximized && !isHeadless) {
        console.log('🔍 DEBUG PageFactory: Attempting to maximize browser...');
        try {
          // Cross-browser solution: Set viewport to screen size
          const screenSize = await page.evaluate(() => {
            return {
              width: window.screen.width,
              height: window.screen.height,
              availWidth: window.screen.availWidth,
              availHeight: window.screen.availHeight
            };
          });
          
          console.log(`🔍 DEBUG PageFactory: Screen size detected - ${screenSize.availWidth}x${screenSize.availHeight}`);
          
          // Use available dimensions to account for taskbar/dock
          await page.setViewportSize({
            width: screenSize.availWidth,
            height: screenSize.availHeight
          });
          
          console.log(`🔍 DEBUG PageFactory: Browser maximized to ${screenSize.availWidth}x${screenSize.availHeight}`);
          ActionLogger.logInfo(`Page maximized to ${screenSize.availWidth}x${screenSize.availHeight}`);
        } catch (error) {
          console.log('🔍 DEBUG PageFactory: Browser maximization failed', error);
          ActionLogger.logWarn('Browser maximization failed', error as Error);
        }
      } else {
        console.log(`🔍 DEBUG PageFactory: Skipping maximization - maximized=${isMaximized}, headless=${isHeadless}`);
      }
      
      // Register default event handlers
      this.registerPageEvents(page, pageId);
      
      // Setup page listeners
      this.setupPageListeners(page, pageId);
      
      ActionLogger.logInfo(`Page created: ${pageId}`, {
        url: page.url()
      });
      
      return page;
    } catch (error) {
      ActionLogger.logError('Failed to create page', error);
      throw error;
    }
  }

  /**
   * Create page for a specific scenario
   */
  async createPageForScenario(scenarioId: string): Promise<Page> {
    try {
      // Get or create context for scenario
      const contextManager = ContextManager.getInstance();
      let context: BrowserContext;
      
      try {
        context = contextManager.getContext(`scenario-${scenarioId}`);
      } catch {
        // Create new context if not exists
        context = await contextManager.createScenarioContext(scenarioId);
      }
      
      // Create page
      const page = await this.createPage(context);
      
      // Map scenario to page
      this.pages.set(`scenario-${scenarioId}`, page);
      
      return page;
    } catch (error) {
      ActionLogger.logError(`Failed to create page for scenario: ${scenarioId}`, error);
      throw error;
    }
  }

  /**
   * Assign page to element (for element framework integration)
   */
  assignPageToElement(page: Page, element: any): void {
    // This will be used by CSWebElement
    if (element && typeof element === 'object') {
      element.page = page;
    }
  }

  /**
   * Get page for scenario
   */
  getPageForScenario(scenarioId: string): Page {
    const page = this.pages.get(`scenario-${scenarioId}`);
    if (!page) {
      throw new Error(`Page not found for scenario: ${scenarioId}`);
    }
    return page;
  }

  /**
   * Get page by ID
   */
  getPage(pageId: string): Page {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }
    return page;
  }

  /**
   * Get page by key (alias for getPage)
   */
  getPageByKey(key: string): Page | undefined {
    return this.pages.get(key);
  }

  /**
   * Close a specific page
   */
  async closePage(page: Page): Promise<void> {
    try {
      // Find page ID
      let pageId: string | undefined;
      this.pages.forEach((p, id) => {
        if (p === page && !pageId) {
          pageId = id;
        }
      });
      
      if (!pageId) {
        ActionLogger.logWarn('Attempted to close unknown page');
        return;
      }
      
      ActionLogger.logInfo(`Closing page: ${pageId}`);
      
      // Close page
      await page.close();
      
      // Clean up
      this.pages.delete(pageId);
      this.pageEventHandlers.delete(pageId);
      this.dialogHandlers.delete(pageId);
      this.downloadTrackers.delete(pageId);
      
      ActionLogger.logInfo(`Page closed: ${pageId}`);
    } catch (error) {
      ActionLogger.logError('Failed to close page', error);
      throw error;
    }
  }

  /**
   * Close all pages
   */
  async closeAllPages(): Promise<void> {
    ActionLogger.logInfo('Closing all pages');
    
    const closePromises: Promise<void>[] = [];
    
    this.pages.forEach((page) => {
      closePromises.push(this.closePage(page));
    });
    
    await Promise.all(closePromises);
    
    this.pages.clear();
    this.pageEventHandlers.clear();
    this.dialogHandlers.clear();
    this.downloadTrackers.clear();
    
    ActionLogger.logInfo('All pages closed');
  }

  /**
   * Set event handlers for a page
   */
  setPageEventHandlers(pageId: string, handlers: PageEventHandlers): void {
    this.pageEventHandlers.set(pageId, handlers);
    
    // Apply handlers to existing page if available
    const page = this.pages.get(pageId);
    if (page) {
      this.applyEventHandlers(page, pageId);
    }
  }

  /**
   * Handle dialog for page
   */
  async handleDialog(pageId: string, handler: (dialog: Dialog) => Promise<void>): Promise<void> {
    this.dialogHandlers.set(pageId, handler);
  }

  /**
   * Get downloads for page
   */
  getDownloads(pageId: string): Download[] {
    return this.downloadTrackers.get(pageId) || [];
  }

  /**
   * Get all active pages
   */
  getAllPages(): Map<string, Page> {
    return new Map(this.pages);
  }

  /**
   * Get page count
   */
  getPageCount(): number {
    return this.pages.size;
  }

  /**
   * Register page events
   */
  private registerPageEvents(page: Page, pageId: string): void {
    // Start console capture for this page
    ConsoleLogger.getInstance().startCapture(page, pageId);
    
    // Console messages
    page.on('console', async (msg: ConsoleMessage) => {
      // ConsoleLogger handles console messages internally through startCapture
      await ActionLogger.getInstance().logBrowserConsole(msg.type(), msg.text());
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onConsole) {
        handlers.onConsole(msg);
      }
    });
    
    // Page errors
    page.on('pageerror', (error: Error) => {
      ActionLogger.logPageError(error.message, { 
        stack: error.stack,
        name: error.name 
      });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onPageError) {
        handlers.onPageError(error);
      }
    });
    
    // Network requests
    page.on('request', (request: Request) => {
      // NetworkCollector handles requests through collectForScenario
      ActionLogger.logInfo('Network request', {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onRequest) {
        handlers.onRequest(request);
      }
    });
    
    // Network responses
    page.on('response', (response: Response) => {
      // NetworkCollector handles responses through collectForScenario
      ActionLogger.logInfo('Network response', {
        url: response.url(),
        status: response.status(),
        statusText: response.statusText()
      });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onResponse) {
        handlers.onResponse(response);
      }
    });
    
    // Dialogs
    page.on('dialog', async (dialog: Dialog) => {
      ActionLogger.logDialog(dialog.type(), dialog.message());
      
      const handler = this.dialogHandlers.get(pageId);
      if (handler) {
        await handler(dialog);
      } else {
        // Default: dismiss dialog
        await dialog.dismiss();
      }
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onDialog) {
        handlers.onDialog(dialog);
      }
    });
    
    // Downloads
    page.on('download', (download: Download) => {
      ActionLogger.logInfo('Download started', {
        url: download.url(),
        suggestedFilename: download.suggestedFilename()
      });
      
      // Track download
      const downloads = this.downloadTrackers.get(pageId) || [];
      downloads.push(download);
      this.downloadTrackers.set(pageId, downloads);
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onDownload) {
        handlers.onDownload(download);
      }
    });
    
    // Popups
    page.on('popup', (popup: Page) => {
      ActionLogger.logInfo('Popup opened', { url: popup.url() });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onPopup) {
        handlers.onPopup(popup);
      }
    });
    
    // Frame events
    page.on('frameattached', (frame: Frame) => {
      ActionLogger.logInfo('Frame attached', {
        name: frame.name(),
        url: frame.url()
      });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onFrameAttached) {
        handlers.onFrameAttached(frame);
      }
    });
    
    page.on('framedetached', (frame: Frame) => {
      ActionLogger.logInfo('Frame detached', {
        name: frame.name(),
        url: frame.url()
      });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onFrameDetached) {
        handlers.onFrameDetached(frame);
      }
    });
  }

  /**
   * Setup additional page listeners
   */
  private setupPageListeners(page: Page, pageId: string): void {
    // Page navigation
    page.on('load', () => {
      ActionLogger.logInfo(`Page loaded: ${pageId}`, { url: page.url() });
    });
    
    page.on('domcontentloaded', () => {
      ActionLogger.logDebug(`DOM content loaded: ${pageId}`, { url: page.url() });
    });
    
    // Page crash
    page.on('crash', () => {
      ActionLogger.logError(`Page crashed: ${pageId}`);
    });
    
    // Page close
    page.on('close', () => {
      ActionLogger.logInfo(`Page closed: ${pageId}`);
      this.pages.delete(pageId);
      this.pageEventHandlers.delete(pageId);
      this.dialogHandlers.delete(pageId);
      this.downloadTrackers.delete(pageId);
    });
  }

  /**
   * Apply event handlers to page
   */
  private applyEventHandlers(page: Page, pageId: string): void {
    const handlers = this.pageEventHandlers.get(pageId);
    if (!handlers) return;
    
    // Apply custom handlers in addition to default ones
    // Note: These handlers are already set up in registerPageEvents
    // This method can be used to update handlers dynamically
    
    // Verify page is still valid
    if (!page.isClosed()) {
      ActionLogger.logInfo(`Event handlers applied for page: ${pageId}`, {
        hasConsoleHandler: !!handlers.onConsole,
        hasDialogHandler: !!handlers.onDialog,
        hasDownloadHandler: !!handlers.onDownload,
        hasPageErrorHandler: !!handlers.onPageError,
        hasRequestHandler: !!handlers.onRequest,
        hasResponseHandler: !!handlers.onResponse,
        hasPopupHandler: !!handlers.onPopup
      });
    }
  }

  /**
   * Generate unique page ID
   */
  private generatePageId(): string {
    return `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get page statistics
   */
  getStatistics(): any {
    const stats: any = {
      totalPages: this.pages.size,
      pages: []
    };
    
    this.pages.forEach((page, id) => {
      stats.pages.push({
        id,
        url: page.url(),
        title: page.title()
      });
    });
    
    return stats;
  }
}