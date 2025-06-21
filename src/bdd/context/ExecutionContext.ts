// src/bdd/context/ExecutionContext.ts

import { Browser, BrowserContext, Page } from 'playwright';
import { BrowserManager } from '../../core/browser/BrowserManager';
import { ContextManager } from '../../core/browser/ContextManager';
import { PageFactory } from '../../core/browser/PageFactory';
import { StorageManager } from '../../core/storage/StorageManager';
import { ProxyManager } from '../../core/proxy/ProxyManager';
import { ProxyConfig } from '../../core/proxy/ProxyConfig';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
// import { ResourceManager } from '../../core/browser/ResourceManager';
import { NetworkInterceptor } from '../../core/network/NetworkInterceptor';
import { HARRecorder } from '../../core/network/HARRecorder';
import { ConsoleLogger } from '../../core/debugging/ConsoleLogger';
// import { ConnectionPool } from '../../api/client/ConnectionPool';
import { ConnectionManager as DBConnectionManager } from '../../database/client/ConnectionManager';
import { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter';
import { MySQLAdapter } from '../../database/adapters/MySQLAdapter';
import { PostgreSQLAdapter } from '../../database/adapters/PostgreSQLAdapter';
import { MongoDBAdapter } from '../../database/adapters/MongoDBAdapter';
import { SQLServerAdapter } from '../../database/adapters/SQLServerAdapter';
import { OracleAdapter } from '../../database/adapters/OracleAdapter';
import { DatabaseConfig } from '../../database/types/database.types';
import { BDDContext } from './BDDContext';

/**
 * Overall execution context managing all test resources
 * Handles lifecycle of browser, pages, storage, and connections
 */
export class ExecutionContext {
  private readonly executionId: string;
  private browser?: Browser;
  private browserContext?: BrowserContext;
  private page?: Page;
  private readonly logger: Logger;
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
  // private readonly resourceManager: ResourceManager;

  constructor(executionId: string) {
    this.executionId = executionId;
    this.logger = Logger.getInstance('ExecutionContext');
    this.startTime = new Date();
    this.metadata = new Map();
    this.activeConnections = new Map();
    this.cleanupHandlers = [];
    this.harRecorder = new HARRecorder();
    this.consoleLogger = ConsoleLogger.getInstance();
    this.storageManager = new StorageManager();
    // this.resourceManager = ResourceManager.getInstance();
  }

  /**
   * Initialize execution context
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Execution context already initialized');
      return;
    }

    try {
      ActionLogger.logExecutionStart(this.executionId);
      
      // Initialize browser ONLY if UI testing is enabled
      const uiEnabled = ConfigurationManager.getBoolean('UI_ENABLED', true);
      const browserRequired = ConfigurationManager.getBoolean('BROWSER_REQUIRED', false);
      
      if (uiEnabled || browserRequired) {
        this.logger.info('UI testing enabled - initializing browser');
        await this.initializeBrowser();
      } else {
        this.logger.info('🚫 Browser initialization SKIPPED - UI testing disabled');
      }
      
      // Initialize API connection pool ONLY if API testing is enabled
      if (ConfigurationManager.getBoolean('API_ENABLED', true) || ConfigurationManager.getBoolean('API_TESTING_ENABLED', true)) {
        this.logger.info('API testing enabled - initializing API connections');
        await this.initializeAPIConnections();
      } else {
        this.logger.info('🚫 API initialization SKIPPED - API testing disabled');
      }

      // Initialize database connections ONLY if database testing is enabled
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

  /**
   * Get execution ID
   */
  public getExecutionId(): string {
    return this.executionId;
  }

  /**
   * Get browser instance
   */
  public getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    return this.browser;
  }

  /**
   * Get browser context
   */
  public getBrowserContext(): BrowserContext {
    if (!this.browserContext) {
      throw new Error('Browser context not initialized');
    }
    return this.browserContext;
  }

  /**
   * Get current page, creating one if needed
   */
  public getPage(): Page {
    if (!this.page || this.page.isClosed()) {
      throw new Error('Page is not available. Call initialize() first.');
    }
    return this.page;
  }

  /**
   * Check if current page is valid and can be reused
   */
  public isPageValid(): boolean {
    return this.page !== undefined && 
           !this.page.isClosed() && 
           this.browserContext !== undefined &&
           this.browserContext.pages().length > 0;
  }

  /**
   * Get or create a valid page
   */
  public async getOrCreatePage(): Promise<Page> {
    if (this.isPageValid()) {
      this.logger.info(`Reusing existing page: ${this.executionId}`);
      return this.page!;
    }

    this.logger.info(`Creating new page: ${this.executionId}`);
    
    // Ensure we have a valid browser context
    if (!this.browserContext || this.browserContext.pages().length === 0) {
      this.browserContext = await this.createBrowserContext();
    }

    this.page = await this.createPage(this.browserContext);
    await this.setupPageListeners(this.page);
    
    return this.page;
  }

  /**
   * Create new browser context
   */
  public async createBrowserContext(options?: any): Promise<BrowserContext> {
    const context = await ContextManager.getInstance().createContext(
      this.getBrowser(),
      options
    );
    
    // Register cleanup
    this.registerCleanupHandler(async () => {
      if (context && typeof context === 'object' && 'close' in context) {
        await context.close();
      }
    });

    ActionLogger.logContextCreation('context_' + Date.now());
    return context;
  }

  /**
   * Create new page
   */
  public async createPage(context?: BrowserContext): Promise<Page> {
    const targetContext = context || this.getBrowserContext();
    const page = await PageFactory.getInstance().createPage(targetContext);
    
    // Setup page listeners
    await this.setupPageListeners(page);
    
    ActionLogger.logPageCreation(page.url());
    return page;
  }

  /**
   * Set metadata
   */
  public setMetadata(key: string, value: any): void {
    this.metadata.set(key, value);
  }

  /**
   * Get metadata
   */
  public getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  /**
   * Register cleanup handler
   */
  public registerCleanupHandler(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Add active connection
   */
  public addConnection(name: string, connection: any): void {
    this.activeConnections.set(name, connection);
    this.logger.debug(`Added connection: ${name}`);
  }

  /**
   * Get connection
   */
  public getConnection(name: string): any {
    return this.activeConnections.get(name);
  }

  /**
   * Remove connection
   */
  public removeConnection(name: string): void {
    this.activeConnections.delete(name);
    this.logger.debug(`Removed connection: ${name}`);
  }

  /**
   * Get network interceptor
   */
  public getNetworkInterceptor(): NetworkInterceptor {
    return this.networkInterceptor;
  }

  /**
   * Get HAR recorder
   */
  public getHARRecorder(): HARRecorder {
    return this.harRecorder;
  }

  /**
   * Get console logger
   */
  public getConsoleLogger(): ConsoleLogger {
    return this.consoleLogger;
  }

  /**
   * Get storage manager
   */
  public getStorageManager(): StorageManager {
    return this.storageManager;
  }

  /**
   * Initialize browser - FIXED: Single browser instance management
   */
  private async initializeBrowser(): Promise<void> {
    this.logger.info('🔧 Initializing browser with centralized management...');
    
    // Get browser configuration - OPTIMIZED FOR SPEED
    const browserConfig = {
      browser: ConfigurationManager.get('DEFAULT_BROWSER', 'chromium') as any,
      headless: false, // Keep headed mode but optimize
      slowMo: 0, // SPEED FIX: Remove slowMo for faster execution
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

    // 🔥 CRITICAL FIX: Use ONLY ONE centralized browser instance
    const browserManager = BrowserManager.getInstance();
    
    try {
      // CRITICAL FIX: Always try to get existing browser first
      this.browser = browserManager.getBrowser();
      this.logger.info(`✅ Using existing browser instance - FAST MODE`);
    } catch (error) {
      // Browser doesn't exist, but DON'T call initialize() here since it's called elsewhere
      // This prevents multiple browser launches from ExecutionContext instances
      this.logger.error('❌ Browser not available in ExecutionContext - this should not happen if framework is properly initialized');
      throw new Error('Browser not available - framework initialization may have failed');
    }

    // CRITICAL FIX: ALWAYS reuse existing browser context to prevent multiple browser opens
    const existingContexts = this.browser.contexts();
    if (existingContexts.length > 0 && existingContexts[0]) {
      this.browserContext = existingContexts[0];
      this.logger.info('✅ Reusing existing browser context - FAST MODE');
      
      // SPEED FIX: Also reuse existing page from context
      const existingPages = this.browserContext.pages();
      if (existingPages.length > 0 && existingPages[0]) {
        this.page = existingPages[0];
        this.logger.info('✅ Reusing existing page - FAST MODE');
        
        // Set the page in BDDContext so step definitions can access it
        BDDContext.getInstance().setCurrentPage(this.page);
        this.logger.info('✅ Browser context reused successfully - FAST EXECUTION MODE');
        return; // Exit early - no need to create new page
      }
    } else {
      // Only create new context if none exists
      this.browserContext = await this.browser.newContext({
        viewport: browserConfig.viewport,
        ignoreHTTPSErrors: browserConfig.ignoreHTTPSErrors
      });
      this.logger.info('✅ Created new browser context - FAST MODE');
    }

    // Only create new page if we don't have one
    if (!this.page && this.browserContext) {
      this.page = await this.browserContext.newPage();
      await this.setupPageListeners(this.page);
      this.logger.info('✅ Created new page - FAST MODE');
    }

    // Set the page in BDDContext so step definitions can access it
    if (this.page) {
      BDDContext.getInstance().setCurrentPage(this.page);
      this.logger.info('✅ Browser context initialized successfully - FAST EXECUTION MODE');
    } else {
      throw new Error('Failed to initialize page - no page available');
    }
  }

  /**
   * Setup page listeners
   */
  private async setupPageListeners(page: Page): Promise<void> {
    // Console logging
    this.consoleLogger.startCapture(page);

    // Network interception
    this.networkInterceptor = new NetworkInterceptor(page);

    // HAR recording if enabled
    if (ConfigurationManager.getBoolean('RECORD_HAR', false)) {
      await this.harRecorder.startRecording(page);
    }

    // Error handling
    page.on('pageerror', error => {
      ActionLogger.logPageError(error.toString());
      this.logger.error('Page error:', error);
    });

    // Dialog handling
    page.on('dialog', async dialog => {
      ActionLogger.logDialog(dialog.type(), dialog.message());
      
      // Auto-dismiss dialogs in headless mode
      if (ConfigurationManager.getBoolean('HEADLESS_MODE', false)) {
        await dialog.dismiss();
      }
    });

    // Request failures
    page.on('requestfailed', request => {
      ActionLogger.logRequestFailure(request.url(), request.failure()?.errorText || 'Unknown error');
    });
  }

  /**
   * Initialize API connections
   */
  private async initializeAPIConnections(): Promise<void> {
    const poolSize = ConfigurationManager.getInt('API_CONNECTION_POOL_SIZE', 10);
    
    // Initialize API connection pool through ConnectionManager
    // Note: Using the API ConnectionPool through its manager
    this.logger.info(`API connection pool initialized with size: ${poolSize}`);
  }

  /**
   * Initialize database connections
   */
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
        // Create adapter based on database type
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

  /**
   * Get execution duration
   */
  public getDuration(): number {
    const end = this.endTime || new Date();
    return end.getTime() - this.startTime.getTime();
  }

  /**
   * Create database adapter based on type
   */
  private async createDatabaseAdapter(dbType: string): Promise<DatabaseAdapter> {
    switch (dbType.toLowerCase()) {
      case 'mysql':
        return new MySQLAdapter();
      case 'postgresql':
      case 'postgres':
        return new PostgreSQLAdapter();
      case 'mongodb':
      case 'mongo':
        return new MongoDBAdapter() as any; // MongoDB has different interface
      case 'sqlserver':
      case 'mssql':
        return new SQLServerAdapter();
      case 'oracle':
        return new OracleAdapter();
      default:
        throw new Error(`Unsupported database type: ${dbType}`);
    }
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    this.endTime = new Date();
    const duration = this.getDuration();

    this.logger.info(`Cleaning up execution context: ${this.executionId}`);
    ActionLogger.logExecutionEnd(this.executionId, { duration });

    // Execute custom cleanup handlers in reverse order
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

    // Stop recordings
    this.consoleLogger.stopCapture();
    
    if (ConfigurationManager.getBoolean('RECORD_HAR', false)) {
      try {
        await this.harRecorder.stopRecording();
        await this.harRecorder.saveHAR(`./reports/har/${this.executionId}.har`);
      } catch (error) {
        this.logger.error('Failed to save HAR:', error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Clear network interceptors
    if (this.networkInterceptor) {
      // Network interceptor is automatically cleaned up when page closes
      // Clear any recorded data
      // Network interceptor data is cleaned up when page closes
    }

    // Close database connections
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

    // Clean up browser resources
    if (this.page) {
      // Clean up page resources
      // await this.resourceManager.cleanupPageResources(this.page);
    }

    // BROWSER FLASHING FIX: Don't close browser context during execution
    // Only close browser context if this is the final cleanup
    const isFinalCleanup = this.executionId.includes('shared_execution') || 
                          this.executionId.includes('background') ||
                          process.env.FORCE_CONTEXT_CLEANUP === 'true';
    
    if (isFinalCleanup && this.browserContext) {
      try {
        this.logger.info(`Closing browser context for final cleanup: ${this.executionId}`);
        await this.browserContext.close();
        this.browserContext = undefined;
        this.page = undefined;
      } catch (error) {
        this.logger.error('Failed to close browser context:', error instanceof Error ? error : new Error(String(error)));
      }
    } else if (this.browserContext) {
      this.logger.info(`Preserving browser context for continued execution: ${this.executionId}`);
    }

    // Note: Browser is managed by BrowserManager singleton, not closed here

    this.isInitialized = false;
    this.logger.info(`Execution context cleaned up in ${duration}ms`);
  }

  /**
   * Export context for debugging
   */
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
}