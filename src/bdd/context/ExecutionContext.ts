// src/bdd/context/ExecutionContext.ts

import { Browser, BrowserContext, Page } from '@playwright/test';
import { BrowserManager } from '../../core/browser/BrowserManager';
import { ContextManager } from '../../core/browser/ContextManager';
import { PageFactory } from '../../core/browser/PageFactory';
import { StorageManager } from '../../core/storage/StorageManager';
import { ProxyManager } from '../../core/proxy/ProxyManager';
import { ProxyConfig } from '../../core/proxy/ProxyConfig';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { BDDContext } from './BDDContext';
import { NetworkInterceptor } from '../../core/network/NetworkInterceptor';
import { HARRecorder } from '../../core/network/HARRecorder';
import { ConsoleLogger } from '../../core/debugging/ConsoleLogger';
import { ConnectionManager as DBConnectionManager } from '../../database/client/ConnectionManager';
import { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter';
import { MySQLAdapter } from '../../database/adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '../../database/adapters/PostgreSQLAdapter';
import { MongoDBAdapter } from '../../database/adapters/MongoDBAdapter';
import { SQLServerAdapter } from '../../database/adapters/SQLServerAdapter';
import { OracleAdapter } from '../../database/adapters/OracleAdapter';
import { DatabaseConfig } from '../../database/types/database.types';

export class ExecutionContext {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private logger: Logger;
  private readonly id: string;
  private readonly browserManager: BrowserManager;
  private readonly executionId: string;
  private readonly startTime: Date;
  private endTime?: Date;
  private readonly metadata: Map<string, any>;
  private readonly activeConnections: Map<string, any>;
  private readonly cleanupHandlers: Array<() => Promise<void>>;
  private isInitialized: boolean = false;
  private networkInterceptor!: NetworkInterceptor;
  private readonly harRecorder: HARRecorder;
  private readonly consoleLogger: ConsoleLogger;
  private readonly storageManager: StorageManager;
  public readonly options: { hookTimeout?: number } = { hookTimeout: 5000 };

  constructor(executionId: string) {
    this.executionId = executionId;
    this.id = this.executionId;
    this.logger = Logger.getInstance('ExecutionContext');
    this.startTime = new Date();
    this.metadata = new Map();
    this.activeConnections = new Map();
    this.cleanupHandlers = [];
    this.harRecorder = new HARRecorder();
    this.consoleLogger = ConsoleLogger.getInstance();
    this.storageManager = new StorageManager();
    this.browserManager = BrowserManager.getInstance();
    console.log('🔍 DEBUG: ExecutionContext constructor called');
  }

  public async initialize(): Promise<void> {
    console.log('🔍 DEBUG: Initializing ExecutionContext');
    
    if (this.isInitialized) {
      this.logger.warn('Execution context already initialized');
      return;
    }

    try {
      ActionLogger.logExecutionStart(this.executionId);
      
      if (!this.browserManager.isHealthy()) {
        await this.browserManager.initialize();
      }
      
      this.browser = await this.browserManager.getBrowser();
      
      if (this.executionId.startsWith('scenario-')) {
        this.logger.info('Creating new browser context for scenario execution');
        this.context = await this.createBrowserContext();
      } else {
        this.context = this.browserManager.getDefaultContext();
      }
      
      if (this.isPageValid()) {
        this.logger.info('Reusing existing page for execution context');
      } else {
        this.page = await this.getOrCreatePage();
      }
      
      this.logger.info('Execution context initialized successfully');
      
      if (ConfigurationManager.getBoolean('API_ENABLED', true) || ConfigurationManager.getBoolean('API_TESTING_ENABLED', true)) {
        this.logger.info('API testing enabled - initializing API connections');
        await this.initializeAPIConnections();
      } else {
        this.logger.info('🚫 API initialization SKIPPED - API testing disabled');
      }

      if (ConfigurationManager.getBoolean('DATABASE_ENABLED', false) || ConfigurationManager.getBoolean('DATABASE_TESTING_ENABLED', false)) {
        this.logger.info('Database testing enabled - initializing database connections');
        await this.initializeDatabaseConnections();
      } else {
        this.logger.info('🚫 Database initialization SKIPPED - Database testing disabled');
      }

      this.isInitialized = true;
      this.logger.info(`Execution context initialized: ${this.executionId}`);
      
    } catch (error) {
      this.logger.error('Failed to initialize execution context', error instanceof Error ? error : new Error(String(error)));
      await this.cleanup();
      throw error;
    }
  }

  public getExecutionId(): string {
    return this.executionId;
  }

  public getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    return this.browser;
  }

  public getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }
    return this.context;
  }

  public getPage(): Page {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    return this.page;
  }

  public isPageValid(): boolean {
    return this.page !== null && 
           this.page !== undefined &&
           !this.page.isClosed() && 
           this.context !== null &&
           this.context !== undefined &&
           this.context.pages().length > 0;
  }

  public async getOrCreatePage(): Promise<Page> {
    if (this.isPageValid()) {
      this.logger.info(`Reusing existing page: ${this.executionId}`);
      
      await this.ensurePageMaximized(this.page!);
      
      await BDDContext.getInstance().setCurrentPage(this.page!);
      BDDContext.getInstance().setCurrentBrowserContext(this.context!);
      return this.page!;
    }

    if (this.context && this.context.pages().length > 0) {
      const existingPages = this.context.pages();
      for (const page of existingPages) {
        if (!page.isClosed()) {
          this.logger.info(`Reusing existing page from context: ${this.executionId}`);
          this.page = page;
          
          await this.ensurePageMaximized(this.page);
          
          await this.setupPageListeners(this.page);
          await BDDContext.getInstance().setCurrentPage(this.page);
          BDDContext.getInstance().setCurrentBrowserContext(this.context);
          return this.page;
        }
      }
    }

    this.logger.info(`Creating new page: ${this.executionId}`);
    
    if (!this.context) {
      this.context = await this.createBrowserContext();
    }

    const existingPages = this.context.pages();
    for (const page of existingPages) {
      if (!page.isClosed() && page.url() === 'about:blank') {
        this.logger.info(`Closing unused about:blank page`);
        await page.close();
      }
    }

    this.page = await this.createPage(this.context);
    await this.setupPageListeners(this.page);
    
    return this.page;
  }

  public async createBrowserContext(options?: any): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    
    console.log('🔍 DEBUG: Creating browser context in ExecutionContext');
    console.log('🔍 DEBUG: BROWSER_MAXIMIZED =', process.env.BROWSER_MAXIMIZED);
    
    const contextOptions: any = {
      ignoreHTTPSErrors: true
    };
    
    const ConfigurationManager = require('../../core/configuration/ConfigurationManager').ConfigurationManager;
    const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
    console.log('🔍 DEBUG: Browser maximized mode (from ConfigurationManager):', isMaximized);
    
    if (!isMaximized) {
      contextOptions.viewport = { width: 1920, height: 1080 };
      console.log('🔍 DEBUG: Setting viewport to 1920x1080');
    } else {
      contextOptions.viewport = null;
      console.log('🔍 DEBUG: Setting viewport to null for maximized mode');
    }
    
    console.log('🔍 DEBUG: Context options:', JSON.stringify(contextOptions, null, 2));
    const context = await this.browser.newContext(contextOptions);
    
    this.registerCleanupHandler(async () => {
      if (context && typeof context === 'object' && 'close' in context) {
        await context.close();
      }
    });

    ActionLogger.logContextCreation('context_' + Date.now());
    return context;
  }

  public async createPage(context?: BrowserContext): Promise<Page> {
    const targetContext = context || this.getContext();
    const page = await PageFactory.getInstance().createPage(targetContext);
    
    await this.setupPageListeners(page);
    
    await BDDContext.getInstance().setCurrentPage(page);
    
    BDDContext.getInstance().setCurrentBrowserContext(targetContext);
    
    ActionLogger.logPageCreation(page.url());
    return page;
  }

  public setMetadata(key: string, value: any): void {
    this.metadata.set(key, value);
  }

  public getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  public registerCleanupHandler(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }

  public addConnection(name: string, connection: any): void {
    this.activeConnections.set(name, connection);
    this.logger.debug(`Added connection: ${name}`);
  }

  public getConnection(name: string): any {
    return this.activeConnections.get(name);
  }

  public removeConnection(name: string): void {
    this.activeConnections.delete(name);
    this.logger.debug(`Removed connection: ${name}`);
  }

  public getNetworkInterceptor(): NetworkInterceptor {
    return this.networkInterceptor;
  }

  public getHARRecorder(): HARRecorder {
    return this.harRecorder;
  }

  public getConsoleLogger(): ConsoleLogger {
    return this.consoleLogger;
  }

  public getStorageManager(): StorageManager {
    return this.storageManager;
  }

  private async initializeAPIConnections(): Promise<void> {
    const poolSize = ConfigurationManager.getInt('API_CONNECTION_POOL_SIZE', 10);
    
    // Note: Using the API ConnectionPool through its manager
    this.logger.info(`API connection pool initialized with size: ${poolSize}`);
  }

  private async initializeDatabaseConnections(): Promise<void> {
    const dbType = ConfigurationManager.get('DB_TYPE');
    
    if (dbType) {
      const config: DatabaseConfig = {
        type: dbType as DatabaseConfig['type'],
        host: ConfigurationManager.get('DB_HOST', 'localhost'),
        port: ConfigurationManager.getInt('DB_PORT'),
        database: ConfigurationManager.get('DB_NAME', ''),
        username: ConfigurationManager.get('DB_USERNAME'),
        password: ConfigurationManager.get('DB_PASSWORD'),
        connectionPoolSize: ConfigurationManager.getInt('DB_CONNECTION_POOL_SIZE', 5)
      };

      try {
        const adapter = await this.createDatabaseAdapter(dbType);
        const dbManager = new DBConnectionManager(adapter);
        const connection = await dbManager.connect(config);
        this.addConnection('default_db', connection);
        this.logger.info(`Database connection established: ${dbType}`);
      } catch (error) {
        this.logger.warn(`Failed to establish database connection: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  public getDuration(): number {
    const end = this.endTime || new Date();
    return end.getTime() - this.startTime.getTime();
  }

  private async createDatabaseAdapter(dbType: string): Promise<DatabaseAdapter> {
    switch (dbType.toLowerCase()) {
      case 'mysql':
        return new MySQLAdapter();
      case 'postgresql':
      case 'postgres':
        return new PostgreSQLAdapter();
      case 'mongodb':
      case 'mongo':
        return new MongoDBAdapter() as any;
      case 'sqlserver':
      case 'mssql':
        return new SQLServerAdapter();
      case 'oracle':
        return new OracleAdapter();
      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }
  }

  private async setupPageListeners(page: Page): Promise<void> {
    this.consoleLogger.startCapture(page);

    this.networkInterceptor = new NetworkInterceptor(page);

    if (ConfigurationManager.getBoolean('RECORD_HAR', false)) {
      await this.harRecorder.startRecording(page);
    }

    page.on('pageerror', error => {
      const errorMessage = error.toString();
      if (errorMessage.includes('unsafe-eval') || 
          errorMessage.includes('Content Security Policy') ||
          errorMessage.includes('CSP') ||
          errorMessage.includes('EvalError')) {
        this.logger.debug('CSP restriction detected (expected on auth pages):', { error: errorMessage });
      } else {
        ActionLogger.logPageError(errorMessage);
        this.logger.error('Page error:', error);
      }
    });

    page.on('dialog', async dialog => {
      ActionLogger.logDialog(dialog.type(), dialog.message());
      
      if (ConfigurationManager.getBoolean('HEADLESS', false)) {
        await dialog.dismiss();
      }
    });

    page.on('requestfailed', request => {
      ActionLogger.logRequestFailure(request.url(), request.failure()?.errorText || 'Unknown error');
    });
  }

  private async ensurePageMaximized(page: Page): Promise<void> {
    const ConfigurationManager = require('../../core/configuration/ConfigurationManager').ConfigurationManager;
    const isMaximized = ConfigurationManager.getBoolean('BROWSER_MAXIMIZED', false);
    const isHeadless = ConfigurationManager.getBoolean('HEADLESS', false);
    
    if (isMaximized && !isHeadless) {
      try {
        const currentViewport = page.viewportSize();
        
        const screenSize = await page.evaluate(() => {
          return {
            width: window.screen.width,
            height: window.screen.height,
            availWidth: window.screen.availWidth,
            availHeight: window.screen.availHeight
          };
        });
        
        if (currentViewport && 
            Math.abs(currentViewport.width - screenSize.availWidth) < 10 && 
            Math.abs(currentViewport.height - screenSize.availHeight) < 10) {
          this.logger.debug(`Page already maximized: ${currentViewport.width}x${currentViewport.height}`);
          return;
        }
        
        await page.setViewportSize({
          width: screenSize.availWidth,
          height: screenSize.availHeight
        });
        
        this.logger.info(`Page maximized to ${screenSize.availWidth}x${screenSize.availHeight}`);
      } catch (error) {
        this.logger.warn('Failed to maximize page', error as Error);
      }
    }
  }

  public async cleanup(): Promise<void> {
    this.endTime = new Date();
    const duration = this.getDuration();

    this.logger.info(`Cleaning up execution context: ${this.executionId}`);
    ActionLogger.logExecutionEnd(this.executionId, { duration });

    for (let i = this.cleanupHandlers.length - 1; i >= 0; i--) {
      try {
        const handler = this.cleanupHandlers[i];
        if (handler) {
          await handler();
        }
      } catch (error) {
        this.logger.error(`Cleanup handler ${i} failed:`, error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.consoleLogger.stopCapture();
    
    if (ConfigurationManager.getBoolean('RECORD_HAR', false)) {
      try {
        await this.harRecorder.stopRecording();
        await this.harRecorder.saveHAR(`./reports/har/${this.executionId}.har`);
      } catch (error) {
        this.logger.error('Failed to save HAR:', error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (this.networkInterceptor) {
    }

    for (const [name, connection] of this.activeConnections) {
      try {
        if (connection && typeof connection.close === 'function') {
          await connection.close();
        }
      } catch (error) {
        this.logger.error(`Failed to close connection ${name}:`, error instanceof Error ? error : new Error(String(error)));
      }
    }
    this.activeConnections.clear();

    if (this.page) {
    }

    const shouldCloseContext = this.executionId.includes('shared_execution') || 
                              this.executionId.includes('background') ||
                              this.executionId.startsWith('scenario-') ||
                              process.env.FORCE_CONTEXT_CLEANUP === 'true';
    
    if (shouldCloseContext && this.context) {
      try {
        this.logger.info(`Closing browser context: ${this.executionId}`);
        await this.context.close();
        this.context = null;
        this.page = null;
      } catch (error) {
        this.logger.error('Failed to close browser context:', error instanceof Error ? error : new Error(String(error)));
      }
    } else if (this.context) {
      this.logger.info(`Preserving browser context for continued execution: ${this.executionId}`);
    }

    // Note: Browser is managed by BrowserManager singleton, not closed here

    this.isInitialized = false;
    this.logger.info(`Execution context cleaned up in ${duration}ms`);
  }

  public export(): any {
    return {
      executionId: this.executionId,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      duration: this.getDuration(),
      isInitialized: this.isInitialized,
      metadata: Object.fromEntries(this.metadata),
      activeConnections: Array.from(this.activeConnections.keys()),
      cleanupHandlers: this.cleanupHandlers.length,
      browser: {
        isConnected: this.browser?.isConnected() || false,
        contexts: this.browser?.contexts().length || 0
      }
    };
  }

  async close(): Promise<void> {
    console.log('🔍 DEBUG: Closing ExecutionContext');
    
    if (this.page) {
      await this.page.close();
      this.page = null;
      console.log('✅ Page closed');
    }
    
    if (this.context) {
      await this.context.close();
      this.context = null;
      console.log('✅ Browser context closed');
    }
  }
}
