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

  static getInstance(): PageFactory {
    if (!PageFactory.instance) {
      PageFactory.instance = new PageFactory();
    }
    return PageFactory.instance;
  }

  async createPage(context: BrowserContext): Promise<Page> {
    try {
      const pageId = this.generatePageId();
      ActionLogger.logInfo(`Creating new page: ${pageId}`);
      
      const page = await context.newPage();
      
      this.pages.set(pageId, page);
      
      let isMaximized = false;
      let isHeadless = false;
      
      try {
        const ConfigurationManager = require('../configuration/ConfigurationManager').ConfigurationManager;
        isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
        isHeadless = ConfigurationManager.getBoolean('HEADLESS', false);
      } catch (error) {
        isMaximized = process.env['BROWSER_MAXIMIZED'] === 'true';
        isHeadless = process.env['HEADLESS'] === 'true';
      }
      
      console.log(`🔍 DEBUG PageFactory: BROWSER_MAXIMIZED=${isMaximized}, HEADLESS=${isHeadless}`);
      ActionLogger.logInfo(`PageFactory: BROWSER_MAXIMIZED=${isMaximized}, HEADLESS=${isHeadless}`);
      
      if (isMaximized && !isHeadless) {
        console.log('🔍 DEBUG PageFactory: Attempting to maximize browser...');
        try {
          const screenSize = await page.evaluate(() => {
            return {
              width: window.screen.width,
              height: window.screen.height,
              availWidth: window.screen.availWidth,
              availHeight: window.screen.availHeight
            };
          });
          
          console.log(`🔍 DEBUG PageFactory: Screen size detected - ${screenSize.availWidth}x${screenSize.availHeight}`);
          
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
      
      this.registerPageEvents(page, pageId);
      
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

  async createPageForScenario(scenarioId: string): Promise<Page> {
    try {
      const contextManager = ContextManager.getInstance();
      let context: BrowserContext;
      
      try {
        context = contextManager.getContext(`scenario-${scenarioId}`);
      } catch {
        context = await contextManager.createScenarioContext(scenarioId);
      }
      
      const page = await this.createPage(context);
      
      this.pages.set(`scenario-${scenarioId}`, page);
      
      return page;
    } catch (error) {
      ActionLogger.logError(`Failed to create page for scenario: ${scenarioId}`, error);
      throw error;
    }
  }

  assignPageToElement(page: Page, element: any): void {
    if (element && typeof element === 'object') {
      element.page = page;
    }
  }

  getPageForScenario(scenarioId: string): Page {
    const page = this.pages.get(`scenario-${scenarioId}`);
    if (!page) {
      throw new Error(`Page not found for scenario: ${scenarioId}`);
    }
    return page;
  }

  getPage(pageId: string): Page {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }
    return page;
  }

  getPageByKey(key: string): Page | undefined {
    return this.pages.get(key);
  }

  async closePage(page: Page): Promise<void> {
    try {
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
      
      await page.close();
      
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

  setPageEventHandlers(pageId: string, handlers: PageEventHandlers): void {
    this.pageEventHandlers.set(pageId, handlers);
    
    const page = this.pages.get(pageId);
    if (page) {
      this.applyEventHandlers(page, pageId);
    }
  }

  async handleDialog(pageId: string, handler: (dialog: Dialog) => Promise<void>): Promise<void> {
    this.dialogHandlers.set(pageId, handler);
  }

  getDownloads(pageId: string): Download[] {
    return this.downloadTrackers.get(pageId) || [];
  }

  getAllPages(): Map<string, Page> {
    return new Map(this.pages);
  }

  getPageCount(): number {
    return this.pages.size;
  }

  private registerPageEvents(page: Page, pageId: string): void {
    ConsoleLogger.getInstance().startCapture(page, pageId);
    
    page.on('console', async (msg: ConsoleMessage) => {
      await ActionLogger.getInstance().logBrowserConsole(msg.type(), msg.text());
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onConsole) {
        handlers.onConsole(msg);
      }
    });
    
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
    
    page.on('request', (request: Request) => {
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
    
    page.on('response', (response: Response) => {
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
    
    page.on('dialog', async (dialog: Dialog) => {
      ActionLogger.logDialog(dialog.type(), dialog.message());
      
      const handler = this.dialogHandlers.get(pageId);
      if (handler) {
        await handler(dialog);
      } else {
        await dialog.dismiss();
      }
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onDialog) {
        handlers.onDialog(dialog);
      }
    });
    
    page.on('download', (download: Download) => {
      ActionLogger.logInfo('Download started', {
        url: download.url(),
        suggestedFilename: download.suggestedFilename()
      });
      
      const downloads = this.downloadTrackers.get(pageId) || [];
      downloads.push(download);
      this.downloadTrackers.set(pageId, downloads);
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onDownload) {
        handlers.onDownload(download);
      }
    });
    
    page.on('popup', (popup: Page) => {
      ActionLogger.logInfo('Popup opened', { url: popup.url() });
      
      const handlers = this.pageEventHandlers.get(pageId);
      if (handlers?.onPopup) {
        handlers.onPopup(popup);
      }
    });
    
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

  private setupPageListeners(page: Page, pageId: string): void {
    page.on('load', () => {
      ActionLogger.logInfo(`Page loaded: ${pageId}`, { url: page.url() });
    });
    
    page.on('domcontentloaded', () => {
      ActionLogger.logDebug(`DOM content loaded: ${pageId}`, { url: page.url() });
    });
    
    page.on('crash', () => {
      ActionLogger.logError(`Page crashed: ${pageId}`);
    });
    
    page.on('close', () => {
      ActionLogger.logInfo(`Page closed: ${pageId}`);
      this.pages.delete(pageId);
      this.pageEventHandlers.delete(pageId);
      this.dialogHandlers.delete(pageId);
      this.downloadTrackers.delete(pageId);
    });
  }

  private applyEventHandlers(page: Page, pageId: string): void {
    const handlers = this.pageEventHandlers.get(pageId);
    if (!handlers) return;
    
    // Note: These handlers are already set up in registerPageEvents
    
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

  private generatePageId(): string {
    return `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

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
