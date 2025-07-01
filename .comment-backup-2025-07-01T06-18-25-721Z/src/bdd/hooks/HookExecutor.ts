import { 
  Hook, 
  HookType, 
  HookResult,
  BeforeHookFn,
  AfterHookFn,
  BeforeStepHookFn,
  AfterStepHookFn,
  StepStatus,
  Step
} from '../types/bdd.types';
import { HookRegistry } from './HookRegistry';
import { ExecutionContext } from '../context/ExecutionContext';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { BDDContext } from '../context/BDDContext';

/**
 * Simple timer utility for measuring execution duration
 */
class Timer {
  private startTime: number = 0;

  start(): void {
    this.startTime = Date.now();
  }

  stop(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Hook execution statistics
 */
interface HookExecutionStats {
  hookId: string;
  executions: number;
  totalDuration: number;
  averageDuration: number;
  successCount: number;
  failureCount: number;
  lastExecution: Date;
}

/**
 * Executes registered hooks at appropriate lifecycle points
 * Handles hook ordering, filtering, error handling, and timeouts
 */
export class HookExecutor {
  private static instance: HookExecutor;
  private hookRegistry: HookRegistry;
  private executionStats: Map<string, HookExecutionStats>;
  private currentlyExecuting: Set<string>;
  private hooks: Map<HookType, Hook[]>;

  private constructor() {
    this.hookRegistry = HookRegistry.getInstance();
    this.executionStats = new Map();
    this.currentlyExecuting = new Set();
    this.hooks = new Map();
    
    // Initialize with enum values
    const hookTypes = [
      HookType.Before,
      HookType.After,
      HookType.BeforeStep,
      HookType.AfterStep,
      HookType.BeforeAll,
      HookType.AfterAll
    ] as const;
    
    hookTypes.forEach(type => {
      this.hooks.set(type, []);
    });
  }

  static getInstance(): HookExecutor {
    if (!HookExecutor.instance) {
      HookExecutor.instance = new HookExecutor();
    }
    return HookExecutor.instance;
  }

  registerHook(type: HookType, hook: Hook): void {
    const hooks = this.hooks.get(type) || [];
    hooks.push(hook);
    this.hooks.set(type, hooks);
  }

  /**
   * Execute all before hooks
   */
  async executeBeforeHooks(context: ExecutionContext): Promise<HookResult[]> {
    ActionLogger.logDebug('Executing before hooks');
    return this.executeHooksOfType(HookType.Before, context);
  }

  /**
   * Execute all after hooks
   */
  async executeAfterHooks(context: ExecutionContext): Promise<HookResult[]> {
    ActionLogger.logDebug('Executing after hooks');
    return this.executeHooksOfType(HookType.After, context);
  }

  /**
   * Execute all before step hooks
   */
  async executeBeforeStepHooks(context: ExecutionContext): Promise<HookResult[]> {
    ActionLogger.logDebug('Executing before step hooks');
    return this.executeHooksOfType(HookType.BeforeStep, context);
  }

  /**
   * Execute all after step hooks
   */
  async executeAfterStepHooks(context: ExecutionContext): Promise<HookResult[]> {
    ActionLogger.logDebug('Executing after step hooks');
    return this.executeHooksOfType(HookType.AfterStep, context);
  }

  /**
   * Get hooks of specific type filtered by tags
   */
  async getHooks(type: HookType, tags?: string[]): Promise<Hook[]> {
    return this.hookRegistry.getHooks(type, tags);
  }

  /**
   * Execute hooks of specific type
   */
  private async executeHooksOfType(type: HookType, context: ExecutionContext): Promise<HookResult[]> {
    const hooks = this.getApplicableHooks(type, context);
    const results: HookResult[] = [];

    if (hooks.length === 0) {
      ActionLogger.logDebug(`No hooks registered for type: ${type}`);
      return results;
    }

    ActionLogger.logDebug(`Found ${hooks.length} ${type} hooks to execute`);

    for (const hook of hooks) {
      const result = await this.executeHook(hook, context);
      results.push(result);

      // Stop execution if hook failed and not set to always run
      if (result.status === StepStatus.FAILED && !this.shouldContinueAfterFailure(type, hook)) {
        ActionLogger.logWarn(`Stopping ${type} hook execution due to failure in: ${hook.name}`);
        break;
      }
    }

    return results;
  }

  /**
   * Get applicable hooks based on type and context
   */
  private getApplicableHooks(type: HookType, context: ExecutionContext): Hook[] {
    const allHooks = this.hooks.get(type) || [];
    
    // Filter by tags
    const filteredHooks = allHooks.filter((hook: Hook) => 
      this.isHookApplicable(hook, context)
    );

    // Sort by order
    return filteredHooks.sort((a: Hook, b: Hook) => (a.order || 100) - (b.order || 100));
  }

  /**
   * Check if hook is applicable based on tags
   */
  private isHookApplicable(hook: Hook, _context: ExecutionContext): boolean {
    // If hook has no tags, it applies to everything
    if (!hook.tags || hook.tags.length === 0) {
      return true;
    }

    // Get tags from BDD context since ExecutionContext doesn't have scenario/feature directly
    const scenarioTags: string[] = [];
    const featureTags: string[] = [];
    
    try {
      const bddContext = BDDContext.getInstance();
      const scenarioContext = bddContext.getScenarioContext();
      const featureContext = bddContext.getFeatureContext();
      
      if (scenarioContext) {
        const scenario = scenarioContext.getScenario();
        scenarioTags.push(...(scenario?.tags || []));
      }
      
      if (featureContext) {
        const feature = featureContext.getFeature();
        featureTags.push(...(feature?.tags || []));
      }
    } catch (error) {
      // BDD context might not be available
    }
    
    const allTags = [...scenarioTags, ...featureTags];

    // Check if any hook tag matches any scenario/feature tag
    return hook.tags.some(hookTag => {
      // Handle tag expressions (simple implementation)
      if (hookTag.startsWith('not ')) {
        const tag = hookTag.substring(4);
        return !allTags.includes(tag);
      }
      return allTags.includes(hookTag);
    });
  }

  /**
   * Execute a single hook with timeout and error handling
   */
  private async executeHook(hook: Hook, context: ExecutionContext): Promise<HookResult> {
    const timer = new Timer();
    timer.start();

    try {
      // Execute hook with timeout
      await this.executeWithTimeout(
        async () => await this.invokeHookFunction(hook, context),
        hook.timeout || 30000,
        hook.name
      );

      const duration = timer.stop();
      this.updateExecutionStats(hook.name, true, duration);

      return {
        hook,
        status: StepStatus.PASSED,
        duration,
        timestamp: new Date()
      };
    } catch (error) {
      const duration = timer.stop();
      this.updateExecutionStats(hook.name, false, duration);

      // Store error in context metadata for after hooks
      if (hook.type === HookType.Before || hook.type === HookType.BeforeStep) {
        context.setMetadata('hookError', error);
      }

      return {
        hook,
        status: StepStatus.FAILED,
        duration,
        error: error as Error,
        timestamp: new Date()
      };
    }
  }

  /**
   * Execute hook function based on type
   */
  private async invokeHookFunction(hook: Hook, context: ExecutionContext): Promise<void> {
    switch (hook.type) {
      case HookType.Before:
        await (hook.fn as BeforeHookFn)(context);
        break;

      case HookType.After:
        await (hook.fn as AfterHookFn)(context);
        break;

      case HookType.BeforeStep:
      case HookType.AfterStep:
        const currentStep = context.getMetadata('currentStep') as Step;
        if (!currentStep) {
          throw new Error(`No current step found for ${hook.type} hook`);
        }

        if (hook.type === HookType.BeforeStep) {
          await (hook.fn as BeforeStepHookFn)(context, currentStep);
        } else {
          await (hook.fn as AfterStepHookFn)(context, currentStep);
        }
        break;

      default:
        throw new Error(`Unknown hook type: ${hook.type}`);
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    name: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Hook ${name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Determine if execution should continue after hook failure
   */
  private shouldContinueAfterFailure(type: HookType, hook: Hook): boolean {
    // Always continue for cleanup hooks (After/AfterStep)
    if (type === HookType.After || type === HookType.AfterStep) {
      return true;
    }

    // Continue if hook is marked to always run
    return hook.alwaysRun === true;
  }

  /**
   * Update execution statistics
   */
  private updateExecutionStats(hookId: string, success: boolean, duration: number): void {
    const stats = this.executionStats.get(hookId) || {
      hookId,
      executions: 0,
      totalDuration: 0,
      averageDuration: 0,
      successCount: 0,
      failureCount: 0,
      lastExecution: new Date()
    };

    stats.executions++;
    stats.totalDuration += duration;
    stats.averageDuration = stats.totalDuration / stats.executions;
    stats.lastExecution = new Date();

    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }

    this.executionStats.set(hookId, stats);
  }

  /**
   * Get execution statistics for all hooks
   */
  getExecutionStatistics(): Map<string, HookExecutionStats> {
    return new Map(this.executionStats);
  }

  /**
   * Clear execution statistics
   */
  clearStatistics(): void {
    this.executionStats.clear();
  }

  /**
   * Get currently executing hooks
   */
  getCurrentlyExecuting(): Set<string> {
    return new Set(this.currentlyExecuting);
  }

  /**
   * Cancel all pending hook executions
   */
  cancelPendingExecutions(): void {
    this.currentlyExecuting.clear();
    ActionLogger.logWarn('All pending hook executions cancelled');
  }

  /**
   * Validate hook configuration
   */
  validateHookConfiguration(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const allHooks = this.hookRegistry.getAllHooks(HookType.Before);
      
      // Check for duplicate hook names within same type
      const hooksByType = new Map<HookType, Hook[]>();
      
      for (const hook of allHooks) {
        if (!hooksByType.has(hook.type)) {
          hooksByType.set(hook.type, []);
        }
        hooksByType.get(hook.type)!.push(hook);
      }

      hooksByType.forEach((hooks, type) => {
        const names = hooks.map(h => h.name);
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        
        if (duplicates.length > 0) {
          warnings.push(`Duplicate hook names found for type ${type}: ${duplicates.join(', ')}`);
        }

        // Check for hooks with very high timeout values
        hooks.forEach(hook => {
          if (hook.timeout && hook.timeout > 300000) { // 5 minutes
            warnings.push(`Hook ${hook.name} has very high timeout: ${hook.timeout}ms`);
          }
        });
      });

    } catch (error) {
      errors.push(`Failed to validate hook configuration: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate execution report
   */
  generateExecutionReport(): HookExecutionReport {
    const stats = Array.from(this.executionStats.values());
    const totalExecutions = stats.reduce((sum, stat) => sum + stat.executions, 0);
    const totalSuccesses = stats.reduce((sum, stat) => sum + stat.successCount, 0);
    const averageDuration = stats.reduce((sum, stat) => sum + stat.averageDuration, 0) / (stats.length || 1);

    return {
      totalHooks: stats.length,
      totalExecutions,
      successRate: totalExecutions > 0 ? (totalSuccesses / totalExecutions) * 100 : 0,
      averageExecutionTime: averageDuration,
      hooks: stats.map(stat => ({
        name: stat.hookId,
        executions: stat.executions,
        successRate: stat.executions > 0 ? (stat.successCount / stat.executions) * 100 : 0,
        averageDuration: stat.averageDuration,
        lastExecution: stat.lastExecution
      }))
    };
  }

  async executeHooks(type: HookType, context: ExecutionContext, data?: any): Promise<void> {
    const hookTimeout = context.getMetadata('hookTimeout') || 5000;
    const step: Step = {
      keyword: type,
      text: `${type} hook execution`,
      line: 0,
      metadata: {
        timeout: hookTimeout
      }
    };
    await this.executeHooksOfType(type, context);
  }

  clearHooks(): void {
    this.hooks.clear();
    const hookTypes = [
      HookType.Before,
      HookType.After,
      HookType.BeforeStep,
      HookType.AfterStep,
      HookType.BeforeAll,
      HookType.AfterAll
    ] as const;
    
    hookTypes.forEach(type => {
      this.hooks.set(type, []);
    });
  }
}

/**
 * Validation result interface
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Hook execution report interface
 */
interface HookExecutionReport {
  totalHooks: number;
  totalExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  hooks: Array<{
    name: string;
    executions: number;
    successRate: number;
    averageDuration: number;
    lastExecution: Date;
  }>;
}

// Export singleton instance
export const hookExecutor = HookExecutor.getInstance();