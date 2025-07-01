// src/core/browser/ResourceManager.ts
import { BrowserContext, Page } from 'playwright';
import { ContextManager } from './ContextManager';
import { PageFactory } from './PageFactory';
import { ResourceStats } from './types/browser.types';
import { ActionLogger } from '../logging/ActionLogger';
import { FileUtils } from '../utils/FileUtils';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

export class ResourceManager {
  private static instance: ResourceManager;
  private readonly downloadsPath: string;
  private readonly tempPath: string;
  private readonly maxMemoryUsage: number;
  private cleanupInterval?: NodeJS.Timer;
  private resourceTracking: Map<string, {
    type: 'page' | 'context' | 'download' | 'temp';
    created: Date;
    size?: number;
  }> = new Map();

  private constructor() {
    this.downloadsPath = path.join(process.cwd(), 'downloads');
    this.tempPath = path.join(process.cwd(), 'temp');
    this.maxMemoryUsage = 2 * 1024 * 1024 * 1024;
    this.ensureDirectories();
    this.startMonitoring();
  }

  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
    }
    return ResourceManager.instance;
  }

  private async ensureDirectories(): Promise<void> {
    await FileUtils.ensureDir(this.downloadsPath);
    await FileUtils.ensureDir(this.tempPath);
  }

  private startMonitoring(): void {
    this.cleanupInterval = setInterval(async () => {
      const stats = await this.getResourceUsage();
      if (stats.memoryUsage > this.maxMemoryUsage * 0.8) {
        ActionLogger.logWarn('High memory usage detected, triggering cleanup');
        await this.forceGarbageCollection();
      }
    }, 30000);
  }

  async cleanupScenarioResources(scenarioId: string): Promise<void> {
    const startTime = Date.now();
    ActionLogger.logInfo('Resource cleanup operation', { operation: 'cleanup', type: 'scenario', scenarioId });

    try {
      const pageFactory = PageFactory.getInstance();
      const contextManager = ContextManager.getInstance();
      
      const pages = await this.getScenarioPages(scenarioId);
      for (const page of pages) {
        await this.closeAllPopups(page);
      }

      const contexts = await this.getScenarioContexts(scenarioId);
      for (const context of contexts) {
        if (process.env['CLEAR_STORAGE_AFTER_SCENARIO'] === 'true') {
          await this.clearStorage(context);
        }
      }

      for (const page of pages) {
        await pageFactory.closePage(page);
        this.resourceTracking.delete(`page_${scenarioId}_${page.url()}`);
      }

      await contextManager.closeAllContexts();
      for (const _ of contexts) {
        this.resourceTracking.delete(`context_${scenarioId}`);
      }

      await this.cleanupScenarioDownloads(scenarioId);

      await this.clearScenarioTempFiles(scenarioId);

      if (global.gc) {
        global.gc();
      }
      
      const duration = Date.now() - startTime;
      ActionLogger.logDebug(`Scenario cleanup completed in ${duration}ms`);
    } catch (error) {
      ActionLogger.logError('Failed to cleanup scenario resources', error);
      throw error;
    }
  }

  async forceCleanup(): Promise<void> {
    ActionLogger.logWarn('Forcing cleanup of all resources');
    
    try {
      const pageFactory = PageFactory.getInstance();
      await pageFactory.closeAllPages();
      
      const contextManager = ContextManager.getInstance();
      await contextManager.closeAllContexts();
      
      await this.cleanupDownloads();
      
      await this.clearTempFiles();
      
      this.resourceTracking.clear();
      
      await this.forceGarbageCollection();
      
      ActionLogger.logInfo('Force cleanup completed');
    } catch (error) {
      ActionLogger.logError('Failed to force cleanup', error);
      throw error;
    }
  }

  async closeAllPopups(page: Page): Promise<void> {
    try {
      const context = page.context();
      const pages = context.pages();
      
      for (const p of pages) {
        if (p !== page && !p.isClosed()) {
          await p.close();
          ActionLogger.logInfo('Resource operation', { operation: 'closed', type: 'popup', url: p.url() });
        }
      }
    } catch (error) {
      ActionLogger.logError('Failed to close popups', error as Error);
    }
  }

  async clearStorage(context: BrowserContext): Promise<void> {
    try {
      await context.clearCookies();
      
      await context.clearPermissions();
      
      const pages = context.pages();
      for (const page of pages) {
        if (!page.isClosed()) {
          await page.evaluate(() => {
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch (e) {
            }
          });
        }
      }
      
      ActionLogger.logInfo('Resource operation', { operation: 'cleared', type: 'storage', pageCount: context.pages().length });
    } catch (error) {
      ActionLogger.logError('Failed to clear storage', error as Error);
    }
  }

  async cleanupDownloads(): Promise<void> {
    try {
      const files = await fs.readdir(this.downloadsPath);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.downloadsPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          this.resourceTracking.delete(`download_${file}`);
          ActionLogger.logInfo('Resource operation', { operation: 'deleted', type: 'download', file });
        }
      }
    } catch (error) {
      ActionLogger.logError('Failed to cleanup downloads', error as Error);
    }
  }

  private async cleanupScenarioDownloads(scenarioId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.downloadsPath);
      const scenarioFiles = files.filter(f => f.includes(scenarioId));
      
      for (const file of scenarioFiles) {
        const filePath = path.join(this.downloadsPath, file);
        await fs.unlink(filePath);
        this.resourceTracking.delete(`download_${file}`);
      }
      
      if (scenarioFiles.length > 0) {
        ActionLogger.logInfo('Resource operation', { operation: 'cleaned', type: 'downloads', fileCount: scenarioFiles.length });
      }
    } catch (error) {
      ActionLogger.logError('Failed to cleanup scenario downloads', error as Error);
    }
  }

  async clearTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempPath);
      
      for (const file of files) {
        const filePath = path.join(this.tempPath, file);
        await fs.unlink(filePath);
        this.resourceTracking.delete(`temp_${file}`);
      }
      
      ActionLogger.logInfo('Resource operation', { operation: 'cleared', type: 'temp', fileCount: files.length });
    } catch (error) {
      ActionLogger.logError('Failed to clear temp files', error as Error);
    }
  }

  private async clearScenarioTempFiles(scenarioId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.tempPath);
      const scenarioFiles = files.filter(f => f.includes(scenarioId));
      
      for (const file of scenarioFiles) {
        const filePath = path.join(this.tempPath, file);
        await fs.unlink(filePath);
        this.resourceTracking.delete(`temp_${file}`);
      }
    } catch (error) {
      ActionLogger.logError('Failed to clear scenario temp files', error as Error);
    }
  }

  async getResourceUsage(): Promise<ResourceStats> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    let openPages = 0;
    let openContexts = 0;
    
    for (const [, resource] of this.resourceTracking) {
      if (resource.type === 'page') openPages++;
      if (resource.type === 'context') openContexts++;
    }

    return {
      memoryUsage: memUsage.heapUsed,
      cpuUsage: cpuUsage.user + cpuUsage.system,
      openPages,
      openContexts,
      totalMemory: memUsage.heapTotal,
      externalMemory: memUsage.external,
      systemMemory: os.totalmem() - os.freemem(),
      tempFiles: 0,
      downloadsSize: 0,
      cleanupDuration: 0,
      timestamp: new Date(),
      activeDownloads: 0,
      networkConnections: 0
    };
  }

  async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = before - after;
      
      ActionLogger.logInfo('Resource operation', { operation: 'gc', type: 'memory', freedMB: Math.round(freed / 1024 / 1024) });
    } else {
      ActionLogger.logWarn('Garbage collection not available. Run with --expose-gc flag');
    }
  }

  trackResource(id: string, type: 'page' | 'context' | 'download' | 'temp', size?: number): void {
    this.resourceTracking.set(id, {
      type,
      created: new Date(),
      ...(size !== undefined && { size })
    });
  }

  private async getScenarioPages(scenarioId: string): Promise<Page[]> {
    const pages: Page[] = [];
    const pageFactory = PageFactory.getInstance();
    
    for (const [key, resource] of this.resourceTracking) {
      if (resource.type === 'page' && key.includes(scenarioId)) {
        const page = pageFactory.getPageByKey(key);
        if (page && !page.isClosed()) {
          pages.push(page);
        }
      }
    }
    
    return pages;
  }

  private async getScenarioContexts(scenarioId: string): Promise<BrowserContext[]> {
    const contexts: BrowserContext[] = [];
    const contextManager = ContextManager.getInstance();
    
    for (const [key, resource] of this.resourceTracking) {
      if (resource.type === 'context' && key.includes(scenarioId)) {
        const context = contextManager.tryGetContext(key);
        if (context) {
          contexts.push(context);
        }
      }
    }
    
    return contexts;
  }

  async generateResourceReport(): Promise<string> {
    const stats = await this.getResourceUsage();
    const report = {
      timestamp: new Date().toISOString(),
      memory: {
        used: `${Math.round(stats.memoryUsage / 1024 / 1024)}MB`,
        total: `${Math.round((stats.totalMemory ?? 0) / 1024 / 1024)}MB`,
        external: `${Math.round((stats.externalMemory ?? 0) / 1024 / 1024)}MB`,
        system: `${Math.round((stats.systemMemory ?? 0) / 1024 / 1024)}MB`
      },
      resources: {
        openPages: stats.openPages,
        openContexts: stats.openContexts,
        trackedResources: this.resourceTracking.size
      },
      breakdown: this.getResourceBreakdown()
    };
    
    return JSON.stringify(report, null, 2);
  }

  private getResourceBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {
      pages: 0,
      contexts: 0,
      downloads: 0,
      temps: 0
    };
    
    for (const resource of this.resourceTracking.values()) {
      const key = resource.type + 's';
      if (breakdown[key] !== undefined) {
        breakdown[key]++;
      }
    }
    
    return breakdown;
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval as unknown as number);
    }
    this.resourceTracking.clear();
  }
}
