// src/core/elements/ElementActionLogger.ts
import { CSWebElement } from './CSWebElement';
import { ActionRecord, ElementAction } from './types/element.types';
import { ActionLogger } from '../logging/ActionLogger';
import * as path from 'path';
import * as fs from 'fs/promises';

interface ActionReport {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  averageDuration: number;
  slowestActions: ActionRecord[];
  mostFailedElements: Array<{
    element: string;
    failures: number;
  }>;
  timeline: Timeline;
}

interface Timeline {
  startTime: Date;
  endTime: Date;
  duration: number;
  actions: TimelineEntry[];
}

interface TimelineEntry {
  timestamp: Date;
  action: string;
  element: string;
  duration: number;
  success: boolean;
  gap: number;
}

interface ElementMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  totalDuration: number;
  averageDuration: number;
  lastAction: ActionRecord | null;
  firstSeen: Date;
  lastSeen: Date;
}

export class ElementActionLogger {
  private static instance: ElementActionLogger;
  private actionHistory: Map<string, ActionRecord[]> = new Map();
  private elementMetrics: Map<string, ElementMetrics> = new Map();
  private screenshotPath: string;
  private readonly maxHistorySize = 10000;
  private sessionStartTime: Date;

  private constructor() {
    this.screenshotPath = path.join(process.cwd(), 'screenshots', 'elements');
    this.sessionStartTime = new Date();
    this.ensureScreenshotDirectory();
  }

  static getInstance(): ElementActionLogger {
    if (!ElementActionLogger.instance) {
      ElementActionLogger.instance = new ElementActionLogger();
    }
    return ElementActionLogger.instance;
  }

  private async ensureScreenshotDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.screenshotPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  logAction(action: ActionRecord): void {
    const elementId = action.elementDescription;
    if (!this.actionHistory.has(elementId)) {
      this.actionHistory.set(elementId, []);
    }
    
    const history = this.actionHistory.get(elementId)!;
    history.push(action);
    
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    
    this.updateMetrics(action);
    
    const message = `[${action.action}] ${action.elementDescription} - ${action.success ? 'SUCCESS' : 'FAILED'}`;
    
    if (action.success) {
      ActionLogger.logDebug(message, {
        duration: action.duration,
        parameters: action.parameters
      });
    } else {
      ActionLogger.logError(message, new Error(action.error || 'Unknown error'));
    }
  }

  logError(action: ElementAction, error: Error): void {
    const baseRecord = this.createActionRecord(action);
    const errorRecord: ActionRecord = {
      ...baseRecord,
      success: false,
      error: error.message
    };
    
    if (error.stack) {
      errorRecord.stackTrace = error.stack;
    }
    
    this.logAction(errorRecord);
  }

  async logScreenshot(element: CSWebElement, screenshot: Buffer): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${element.description.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.png`;
      const filePath = path.join(this.screenshotPath, fileName);
      
      await fs.writeFile(filePath, screenshot);
      
      ActionLogger.logDebug(`Screenshot saved: ${fileName}`);
      
      const elementId = element.description;
      const history = this.actionHistory.get(elementId);
      if (history && history.length > 0) {
        const lastAction = history[history.length - 1];
        if (lastAction) {
          lastAction.screenshot = filePath;
        }
      }
    } catch (error) {
      ActionLogger.logError('Failed to save screenshot', error as Error);
    }
  }

  getActionHistory(elementId: string): ActionRecord[] {
    return this.actionHistory.get(elementId) || [];
  }

  getAllActions(): ActionRecord[] {
    const allActions: ActionRecord[] = [];
    for (const actions of this.actionHistory.values()) {
      allActions.push(...actions);
    }
    return allActions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getFailedActions(): ActionRecord[] {
    return this.getAllActions().filter(action => !action.success);
  }

  clearHistory(): void {
    this.actionHistory.clear();
    this.elementMetrics.clear();
    this.sessionStartTime = new Date();
  }

  exportToReport(): ActionReport {
    const allActions = this.getAllActions();
    const failedActions = allActions.filter(a => !a.success);
    const successfulActions = allActions.filter(a => a.success);
    
    const totalDuration = successfulActions.reduce((sum, action) => sum + action.duration, 0);
    const averageDuration = successfulActions.length > 0 ? totalDuration / successfulActions.length : 0;
    
    const slowestActions = [...successfulActions]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    
    const failureCount = new Map<string, number>();
    for (const action of failedActions) {
      const count = failureCount.get(action.elementDescription) || 0;
      failureCount.set(action.elementDescription, count + 1);
    }
    
    const mostFailedElements = Array.from(failureCount.entries())
      .map(([element, failures]) => ({ element, failures }))
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 10);
    
    const timeline = this.generateTimeline();
    
    return {
      totalActions: allActions.length,
      successfulActions: successfulActions.length,
      failedActions: failedActions.length,
      averageDuration: Math.round(averageDuration),
      slowestActions,
      mostFailedElements,
      timeline
    };
  }

  generateTimeline(): Timeline {
    const allActions = this.getAllActions();
    if (allActions.length === 0) {
      return {
        startTime: this.sessionStartTime,
        endTime: new Date(),
        duration: 0,
        actions: []
      };
    }
    
    const firstAction = allActions[0];
    const lastAction = allActions[allActions.length - 1];
    
    if (!firstAction || !lastAction) {
      return {
        startTime: this.sessionStartTime,
        endTime: new Date(),
        duration: 0,
        actions: []
      };
    }
    
    const startTime = firstAction.timestamp;
    const endTime = lastAction.timestamp;
    const duration = endTime.getTime() - startTime.getTime();
    
    const timelineEntries: TimelineEntry[] = [];
    let previousTimestamp = startTime;
    
    for (const action of allActions) {
      const gap = action.timestamp.getTime() - previousTimestamp.getTime();
      
      timelineEntries.push({
        timestamp: action.timestamp,
        action: action.action,
        element: action.elementDescription,
        duration: action.duration,
        success: action.success,
        gap: gap > 1000 ? gap : 0
      });
      
      previousTimestamp = action.timestamp;
    }
    
    return {
      startTime,
      endTime,
      duration,
      actions: timelineEntries
    };
  }

  private updateMetrics(action: ActionRecord): void {
    const elementId = action.elementDescription;
    
    if (!this.elementMetrics.has(elementId)) {
      this.elementMetrics.set(elementId, {
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
        totalDuration: 0,
        averageDuration: 0,
        lastAction: null as ActionRecord | null,
        firstSeen: action.timestamp,
        lastSeen: action.timestamp
      });
    }
    
    const metrics = this.elementMetrics.get(elementId)!;
    metrics.totalActions++;
    
    if (action.success) {
      metrics.successfulActions++;
      metrics.totalDuration += action.duration;
      metrics.averageDuration = metrics.totalDuration / metrics.successfulActions;
    } else {
      metrics.failedActions++;
    }
    
    metrics.lastAction = action;
    metrics.lastSeen = action.timestamp;
  }

  private createActionRecord(action: ElementAction): ActionRecord {
    return {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: action.timestamp,
      elementDescription: action.element,
      elementLocator: '',
      action: action.name,
      parameters: action.parameters,
      duration: 0,
      success: true
    };
  }

  getElementMetrics(elementId: string): ElementMetrics | undefined {
    return this.elementMetrics.get(elementId);
  }

  private calculateAverageDurationsByAction(): Map<string, number> {
    const actionDurations = new Map<string, { total: number; count: number }>();
    
    for (const actions of this.actionHistory.values()) {
      for (const action of actions) {
        if (action.success) {
          const current = actionDurations.get(action.action) || { total: 0, count: 0 };
          current.total += action.duration;
          current.count++;
          actionDurations.set(action.action, current);
        }
      }
    }
    
    const averages = new Map<string, number>();
    for (const [action, data] of actionDurations) {
      averages.set(action, Math.round(data.total / data.count));
    }
    
    return averages;
  }

  getAllElementMetrics(): Map<string, ElementMetrics> {
    return new Map(this.elementMetrics);
  }

  async generateDetailedReport(): Promise<string> {
    const report = this.exportToReport();
    const metrics = Array.from(this.elementMetrics.entries());
    
    const detailedReport = {
      summary: {
        sessionStart: this.sessionStartTime,
        sessionDuration: Date.now() - this.sessionStartTime.getTime(),
        totalElements: metrics.length,
        totalActions: report.totalActions,
        successRate: report.totalActions > 0 
          ? Math.round((report.successfulActions / report.totalActions) * 100) 
          : 0,
        averageActionDuration: report.averageDuration
      },
      timeline: report.timeline,
      elementDetails: metrics.map(([element, metric]) => ({
        element,
        metrics: metric,
        successRate: metric.totalActions > 0
          ? Math.round((metric.successfulActions / metric.totalActions) * 100)
          : 0,
        recentActions: this.getActionHistory(element).slice(-5)
      })),
      failures: {
        total: report.failedActions,
        byElement: report.mostFailedElements,
        recent: this.getFailedActions().slice(-10)
      },
      performance: {
        slowestActions: report.slowestActions,
        averageDurations: Object.fromEntries(this.calculateAverageDurationsByAction())
      }
    };
    
    return JSON.stringify(detailedReport, null, 2);
  }


  dispose(): void {
    this.clearHistory();
  }
}
