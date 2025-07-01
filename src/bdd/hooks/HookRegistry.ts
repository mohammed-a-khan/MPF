// src/bdd/hooks/HookRegistry.ts

import { Hook, HookType, HookFn } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { TagParser } from '../parser/TagParser';

export interface HookOptions {
  name?: string;
  order?: number;
  timeout?: number;
  tags?: string[];
  alwaysRun?: boolean;
  file?: string;
  line?: number;
}

interface ExtendedHook extends Hook {
  id: string;
  condition?: (() => boolean) | undefined;
  metadata?: {
    file: string;
    line: number;
  } | undefined;
}

export class HookRegistry {
  private static instance: HookRegistry;
  private readonly hooks: Map<HookType, ExtendedHook[]>;
  private readonly logger: Logger;
  private readonly tagParser: TagParser;
  private isLocked: boolean = false;

  private constructor() {
    this.hooks = new Map();
    this.logger = Logger.getInstance('HookRegistry');
    this.tagParser = TagParser.getInstance();
    this.initializeHookTypes();
  }

  public static getInstance(): HookRegistry {
    if (!HookRegistry.instance) {
      HookRegistry.instance = new HookRegistry();
    }
    return HookRegistry.instance;
  }

  private initializeHookTypes(): void {
    const hookTypes: HookType[] = [
      HookType.Before,
      HookType.After,
      HookType.BeforeStep,
      HookType.AfterStep,
      HookType.BeforeAll,
      HookType.AfterAll
    ];

    hookTypes.forEach(type => {
      this.hooks.set(type, []);
    });
  }

  public registerHook(
    type: HookType,
    implementation: HookFn,
    options?: HookOptions
  ): void {
    if (this.isLocked && type !== HookType.BeforeAll && type !== HookType.AfterAll) {
      throw new Error('HookRegistry is locked. Cannot register new hooks after test execution has started.');
    }

    const hook: ExtendedHook = {
      id: this.generateHookId(type, options?.name),
      type,
      implementation,
      name: options?.name || implementation.name || 'anonymous',
      condition: undefined,
      metadata: {
        file: options?.file || 'unknown',
        line: options?.line || 0
      }
    };

    if (options?.tags) {
      hook.tags = options.tags;
    }
    if (options?.order !== undefined) {
      hook.order = options.order;
    }
    if (options?.timeout !== undefined) {
      hook.timeout = options.timeout;
    }
    if (options?.alwaysRun !== undefined) {
      hook.alwaysRun = options.alwaysRun;
    }

    const hooksOfType = this.hooks.get(type) || [];
    hooksOfType.push(hook);

    hooksOfType.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    this.hooks.set(type, hooksOfType);

    ActionLogger.logDebug(`Registered ${type} hook: ${hook.name} (order: ${hook.order})`);
    this.logger.debug(`Registered ${type} hook: ${hook.name} (order: ${hook.order})`);
  }

  public getHooks(type: HookType, tags?: string[]): Hook[] {
    const allHooks = this.hooks.get(type) || [];

    const filteredHooks = allHooks.filter(hook => {
      if (!hook.tags) {
        return true;
      }

      if (!tags || tags.length === 0) {
        return false;
      }

      try {
        return this.tagParser.evaluateTagExpression(hook.tags.join(' '), tags);
      } catch (error) {
        this.logger.warn(`Invalid tag expression in hook "${hook.name}": ${hook.tags?.join(' ')}`);
        return false;
      }
    });

    const conditionalHooks = filteredHooks.filter(hook => {
      if (!hook.condition) {
        return true;
      }

      try {
        return hook.condition();
      } catch (error) {
        this.logger.warn(`Hook condition failed for "${hook.name}": ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    });

    return conditionalHooks.map(hook => {
      const result: Hook = {
        type: hook.type,
        name: hook.name,
        implementation: hook.implementation
      };
      
      if (hook.order !== undefined) {
        result.order = hook.order;
      }
      if (hook.timeout !== undefined) {
        result.timeout = hook.timeout;
      }
      if (hook.alwaysRun !== undefined) {
        result.alwaysRun = hook.alwaysRun;
      }
      if (hook.tags) {
        result.tags = hook.tags;
      }
      
      return result;
    });
  }

  public getAllHooks(type: HookType): Hook[] {
    return this.getHooks(type);
  }

  public removeHook(type: HookType, hookId: string): boolean {
    const hooksOfType = this.hooks.get(type);
    if (!hooksOfType) {
      return false;
    }

    const initialLength = hooksOfType.length;
    const filteredHooks = hooksOfType.filter(hook => hook.id !== hookId);
    
    if (filteredHooks.length < initialLength) {
      this.hooks.set(type, filteredHooks);
      this.logger.debug(`Removed hook: ${hookId}`);
      return true;
    }
    
    return false;
  }

  public removeAllHooks(_type?: HookType): void {
    if (_type) {
      this.hooks.set(_type, []);
      this.logger.debug(`Removed all ${_type} hooks`);
    } else {
      this.hooks.clear();
      this.initializeHookTypes();
      this.logger.debug('Removed all hooks');
    }
  }

  public hasHook(type: HookType, hookId: string): boolean {
    const hooksOfType = this.hooks.get(type) || [];
    return hooksOfType.some(hook => hook.id === hookId);
  }

  public getHookCount(type?: HookType): number {
    if (type) {
      return (this.hooks.get(type) || []).length;
    }
    
    return Array.from(this.hooks.values()).reduce((total, hooks) => total + hooks.length, 0);
  }

  public lock(): void {
    this.isLocked = true;
    this.logger.debug('HookRegistry locked');
  }

  public unlock(): void {
    this.isLocked = false;
    this.logger.debug('HookRegistry unlocked');
  }

  public isRegistryLocked(): boolean {
    return this.isLocked;
  }


  public getAllRegisteredHooks(): Map<HookType, Hook[]> {
    const result = new Map<HookType, Hook[]>();
    
    this.hooks.forEach((hooks, type) => {
      result.set(type, hooks.map(hook => {
        const hookResult: Hook = {
          type: hook.type,
          name: hook.name,
          implementation: hook.implementation
        };
        
        if (hook.order !== undefined) {
          hookResult.order = hook.order;
        }
        if (hook.timeout !== undefined) {
          hookResult.timeout = hook.timeout;
        }
        if (hook.alwaysRun !== undefined) {
          hookResult.alwaysRun = hook.alwaysRun;
        }
        if (hook.tags) {
          hookResult.tags = hook.tags;
        }
        
        return hookResult;
      }));
    });
    
    return result;
  }

  public getStatistics(): HookRegistryStatistics {
    const stats: HookRegistryStatistics = {
      totalHooks: 0,
      hooksByType: {},
      averageHooksPerType: 0,
      isLocked: this.isLocked
    };

    this.hooks.forEach((hooks, type) => {
      stats.hooksByType[type] = hooks.length;
      stats.totalHooks += hooks.length;
    });

    const typeCount = Object.keys(stats.hooksByType).length;
    stats.averageHooksPerType = typeCount > 0 ? stats.totalHooks / typeCount : 0;

    return stats;
  }

  public validateHooks(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    this.hooks.forEach((hooks, type) => {
      const names = hooks.map(h => h.name);
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      
      if (duplicates.length > 0) {
        warnings.push(`Duplicate hook names found for type ${type}: ${duplicates.join(', ')}`);
      }

      hooks.forEach(hook => {
        if (!hook.name || hook.name.trim() === '') {
          errors.push(`Hook of type ${type} has empty or missing name`);
        }

        if (hook.timeout && hook.timeout <= 0) {
          errors.push(`Hook ${hook.name} has invalid timeout: ${hook.timeout}`);
        }

        if (hook.order && hook.order < 0) {
          warnings.push(`Hook ${hook.name} has negative order: ${hook.order}`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  public export(): any {
    return {
      hooks: Object.fromEntries(
        Array.from(this.hooks.entries()).map(([type, hooks]) => [
          type,
          hooks.map(hook => ({
            id: hook.id,
            name: hook.name,
            type: hook.type,
            order: hook.order,
            tags: hook.tags,
            timeout: hook.timeout,
            alwaysRun: hook.alwaysRun,
            hasCondition: !!hook.condition,
            metadata: hook.metadata
          }))
        ])
      ),
      isLocked: this.isLocked,
      statistics: this.getStatistics()
    };
  }

  private generateHookId(type: HookType, name?: string): string {
    const timestamp = Date.now();
    const hookName = name || 'anonymous';
    return `${type}_${hookName}_${timestamp}`;
  }

  public reset(): void {
    this.hooks.clear();
    this.initializeHookTypes();
    this.isLocked = false;
    this.logger.debug('HookRegistry reset');
  }
}

interface HookRegistryStatistics {
  totalHooks: number;
  hooksByType: Record<string, number>;
  averageHooksPerType: number;
  isLocked: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const hookRegistry = HookRegistry.getInstance();
