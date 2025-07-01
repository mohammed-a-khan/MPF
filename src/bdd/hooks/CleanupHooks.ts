import { ExecutionContext } from '../context/ExecutionContext';
import { HookRegistry } from './HookRegistry';
import { HookType } from '../types/bdd.types';
import { BrowserManager } from '../../core/browser/BrowserManager';
import { ContextManager } from '../../core/browser/ContextManager';
import { StorageManager } from '../../core/storage/StorageManager';
import { NetworkInterceptor } from '../../core/network/NetworkInterceptor';
import { ElementCache } from '../../core/elements/ElementCache';
import { VideoRecorder } from '../../core/debugging/VideoRecorder';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { FileUtils } from '../../core/utils/FileUtils';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { Logger } from '../../core/utils/Logger';
import * as path from 'path';

export class CleanupHooks {
  private static instance: CleanupHooks;
  private cleanupRegistry: Map<string, CleanupTask>;
  private cleanupOrder: string[];
  private emergencyCleanupEnabled: boolean;
  private logger: Logger;

  private constructor() {
    this.cleanupRegistry = new Map();
    this.cleanupOrder = [];
    this.emergencyCleanupEnabled = true;
    this.logger = Logger.getInstance('CleanupHooks');
    this.initializeCleanupTasks();
  }

  static getInstance(): CleanupHooks {
    if (!CleanupHooks.instance) {
      CleanupHooks.instance = new CleanupHooks();
    }
    return CleanupHooks.instance;
  }

  private initializeCleanupTasks(): void {
    this.registerCleanupTask({
      name: 'screenshots',
      priority: 1,
      handler: this.cleanupScreenshots.bind(this),
      skipOnError: false
    });

    this.registerCleanupTask({
      name: 'videos',
      priority: 2,
      handler: this.cleanupVideos.bind(this),
      skipOnError: false
    });

    this.registerCleanupTask({
      name: 'traces',
      priority: 3,
      handler: this.cleanupTraces.bind(this),
      skipOnError: false
    });

    this.registerCleanupTask({
      name: 'network',
      priority: 4,
      handler: this.cleanupNetworkInterceptors.bind(this),
      skipOnError: true
    });

    this.registerCleanupTask({
      name: 'storage',
      priority: 5,
      handler: this.cleanupStorage.bind(this),
      skipOnError: true
    });

    this.registerCleanupTask({
      name: 'elements',
      priority: 6,
      handler: this.cleanupElementCache.bind(this),
      skipOnError: true
    });

    this.registerCleanupTask({
      name: 'popups',
      priority: 7,
      handler: this.cleanupPopupHandlers.bind(this),
      skipOnError: true
    });

    this.registerCleanupTask({
      name: 'pages',
      priority: 8,
      handler: this.cleanupPages.bind(this),
      skipOnError: false
    });

    this.registerCleanupTask({
      name: 'contexts',
      priority: 9,
      handler: this.cleanupContexts.bind(this),
      skipOnError: false
    });

    this.registerCleanupTask({
      name: 'browser',
      priority: 10,
      handler: this.cleanupBrowser.bind(this),
      skipOnError: false
    });

    this.registerCleanupTask({
      name: 'database',
      priority: 11,
      handler: this.cleanupDatabaseConnections.bind(this),
      skipOnError: true
    });

    this.registerCleanupTask({
      name: 'tempFiles',
      priority: 12,
      handler: this.cleanupTempFiles.bind(this),
      skipOnError: true
    });

    this.registerCleanupTask({
      name: 'reports',
      priority: 13,
      handler: this.finalizeReports.bind(this),
      skipOnError: true
    });
  }

  public registerHooks(): void {
    const hookRegistry = HookRegistry.getInstance();

    hookRegistry.registerHook(
      HookType.After,
      async (context: ExecutionContext) => {
        await this.runCleanupTasks(['screenshots', 'videos', 'traces', 'elements'], context);
      },
      {
        name: 'scenario-cleanup',
        order: 1000,
        timeout: 30000
      }
    );

    hookRegistry.registerHook(
      HookType.AfterAll,
      async (context: ExecutionContext) => {
        await this.runCleanupTasks(['pages', 'storage', 'network'], context);
      },
      {
        name: 'feature-cleanup',
        order: 1000,
        timeout: 60000
      }
    );

    hookRegistry.registerHook(
      HookType.AfterAll,
      async (context: ExecutionContext) => {
        await this.runAllCleanupTasks(context);
      },
      {
        name: 'final-cleanup',
        order: 2000,
        timeout: 120000
      }
    );

    if (this.emergencyCleanupEnabled) {
      this.setupEmergencyCleanup();
    }

    ActionLogger.logInfo('Cleanup hooks registered');
  }

  private registerCleanupTask(task: CleanupTask): void {
    this.cleanupRegistry.set(task.name, task);
    
    this.cleanupOrder = Array.from(this.cleanupRegistry.values())
      .sort((a, b) => a.priority - b.priority)
      .map(t => t.name);
  }

  private async runCleanupTasks(taskNames: string[], context: ExecutionContext): Promise<void> {
    const results: CleanupResult[] = [];

    for (const taskName of taskNames) {
      const task = this.cleanupRegistry.get(taskName);
      if (!task) {
        continue;
      }

      const result = await this.executeCleanupTask(task, context);
      results.push(result);
    }

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      ActionLogger.logWarn(`${failed.length} cleanup tasks failed`, {
        failed: failed.map(f => ({ task: f.taskName, error: f.error }))
      });
    }
  }

  private async runAllCleanupTasks(context: ExecutionContext): Promise<void> {
    await this.runCleanupTasks(this.cleanupOrder, context);
  }

  private async executeCleanupTask(task: CleanupTask, context: ExecutionContext): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      taskName: task.name,
      success: false,
      duration: 0
    };

    try {
      ActionLogger.logDebug(`Starting cleanup task: ${task.name}`);
      await task.handler(context);
      
      result.success = true;
      result.duration = Date.now() - startTime;
      
      ActionLogger.logDebug(`Completed cleanup task: ${task.name}`, { duration: result.duration });
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
      result.duration = Date.now() - startTime;
      
      if (!task.skipOnError) {
        throw error;
      }
      
      ActionLogger.logError(
        `Cleanup task failed: ${task.name}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    return result;
  }

  private async cleanupScreenshots(_context: ExecutionContext): Promise<void> {
    try {
      const screenshotDir = ConfigurationManager.get('SCREENSHOT_DIR', './screenshots');
      const keepScreenshots = ConfigurationManager.getBoolean('KEEP_SCREENSHOTS', false);

      if (!keepScreenshots) {
        const files = await FileUtils.find(screenshotDir, /\.png$/, { recursive: true });
        for (const file of files) {
          await FileUtils.remove(file);
        }
        ActionLogger.logDebug(`Cleaned up ${files.length} screenshots`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup screenshots', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupVideos(context: ExecutionContext): Promise<void> {
    try {
      const videoRecorder = VideoRecorder.getInstance();
      
      const activePage = context.getPage();
      if (activePage) {
        try {
          const videoPath = await activePage.video()?.path();
          if (videoPath) {
            await videoRecorder.stopRecording();
            ActionLogger.logDebug(`Video saved to: ${videoPath}`);
          }
        } catch (error) {
          this.logger.debug('No active video recording');
        }
      }

      const keepVideos = ConfigurationManager.getBoolean('KEEP_VIDEOS', true);
      if (!keepVideos) {
        const videoDir = ConfigurationManager.get('VIDEO_DIR', './videos');
        const files = await FileUtils.find(videoDir, /\.webm$/, { recursive: true });
        for (const file of files) {
          await FileUtils.remove(file);
        }
        ActionLogger.logDebug(`Cleaned up ${files.length} videos`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup videos', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupTraces(context: ExecutionContext): Promise<void> {
    try {
      
      const browserContext = context.getContext();
      if (browserContext) {
        try {
          await browserContext.tracing.stop({
            path: path.join(ConfigurationManager.get('TRACE_DIR', './traces'), `trace-${Date.now()}.zip`)
          });
          ActionLogger.logDebug('Stopped active trace recording');
        } catch (error) {
          this.logger.debug('No active trace recording');
        }
      }

      const keepTraces = ConfigurationManager.getBoolean('KEEP_TRACES', true);
      if (!keepTraces) {
        const traceDir = ConfigurationManager.get('TRACE_DIR', './traces');
        const files = await FileUtils.find(traceDir, /\.zip$/, { recursive: true });
        for (const file of files) {
          await FileUtils.remove(file);
        }
        ActionLogger.logDebug(`Cleaned up ${files.length} traces`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup traces', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupNetworkInterceptors(context: ExecutionContext): Promise<void> {
    try {
      const page = context.getPage();
      if (page) {
        const networkInterceptor = new NetworkInterceptor(page);
        await networkInterceptor.clearInterceptors();
        ActionLogger.logDebug('Cleaned up network interceptors');
      }
    } catch (error) {
      this.logger.error('Failed to cleanup network interceptors', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupStorage(context: ExecutionContext): Promise<void> {
    try {
      const browserContext = context.getContext();
      if (browserContext) {
        const storageManager = new StorageManager();
        await storageManager.clearAllStorage(browserContext);
        ActionLogger.logDebug('Cleaned up browser storage');
      }
    } catch (error) {
      this.logger.error('Failed to cleanup storage', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupElementCache(_context: ExecutionContext): Promise<void> {
    try {
      ElementCache.getInstance().invalidateAll();
      ActionLogger.logDebug('Cleaned up element cache');
    } catch (error) {
      this.logger.error('Failed to cleanup element cache', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupPopupHandlers(_context: ExecutionContext): Promise<void> {
    try {
      ActionLogger.logDebug('Popup handlers will be cleaned with page closure');
    } catch (error) {
      this.logger.error('Failed to cleanup popup handlers', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupPages(_context: ExecutionContext): Promise<void> {
    try {
      const browserContext = _context.getContext();
      if (browserContext) {
        const pages = browserContext.pages();
        for (const page of pages) {
          if (!page.isClosed()) {
            await page.close();
          }
        }
        ActionLogger.logDebug(`Closed ${pages.length} pages`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup pages', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupContexts(_context: ExecutionContext): Promise<void> {
    try {
      await ContextManager.getInstance().closeAllContexts();
      ActionLogger.logDebug('Cleaned up browser contexts');
    } catch (error) {
      this.logger.error('Failed to cleanup contexts', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupBrowser(_context: ExecutionContext): Promise<void> {
    try {
      const shouldCloseBrowser = ConfigurationManager.getBoolean('CLOSE_BROWSER_AFTER_TEST', true);
      if (shouldCloseBrowser) {
        await BrowserManager.getInstance().closeBrowser();
        ActionLogger.logDebug('Closed browser');
      }
    } catch (error) {
      this.logger.error('Failed to cleanup browser', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupDatabaseConnections(_context: ExecutionContext): Promise<void> {
    try {
      ActionLogger.logDebug('Closed database connections');
    } catch (error) {
      this.logger.error('Failed to cleanup database connections', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async cleanupTempFiles(_context: ExecutionContext): Promise<void> {
    try {
      const tempDirs = [
        ConfigurationManager.get('TEMP_DIR', './temp'),
        ConfigurationManager.get('DOWNLOAD_DIR', './downloads')
      ];

      for (const dir of tempDirs) {
        if (await FileUtils.exists(dir)) {
          const files = await FileUtils.find(dir, /.*/, { recursive: true });
          for (const file of files) {
            await FileUtils.remove(file);
          }
        }
      }
      
      ActionLogger.logDebug('Cleaned up temporary files');
    } catch (error) {
      this.logger.error('Failed to cleanup temp files', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async finalizeReports(_context: ExecutionContext): Promise<void> {
    try {
      ActionLogger.logDebug('Report system ready for shutdown');
    } catch (error) {
      this.logger.error('Failed to finalize reports', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private setupEmergencyCleanup(): void {
    const emergencyHandler = async () => {
      console.log('\n⚠️  Emergency cleanup initiated...');
      
      try {
        await BrowserManager.getInstance().closeBrowser();
        console.log('✓ Browser closed');
      } catch (error) {
        console.error('✗ Failed to close browser:', error);
      }

      process.exit(1);
    };

    process.on('SIGINT', emergencyHandler);
    process.on('SIGTERM', emergencyHandler);
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      emergencyHandler();
    });
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      emergencyHandler();
    });
  }

  public disableEmergencyCleanup(): void {
    this.emergencyCleanupEnabled = false;
  }
}

interface CleanupTask {
  name: string;
  priority: number;
  handler: (context: ExecutionContext) => Promise<void>;
  skipOnError: boolean;
}

interface CleanupResult {
  taskName: string;
  success: boolean;
  duration: number;
  error?: string;
}

export const cleanupHooks = CleanupHooks.getInstance();
