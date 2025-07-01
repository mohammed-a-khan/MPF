// src/bdd/decorators/ParameterTypeRegistry.ts

import { 
  ParameterTypeDefinition, 
  ParameterTypeOptions 
} from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Registry for custom parameter types used in step definitions
 * Provides type transformation and validation for step parameters
 */
export class ParameterTypeRegistry {
  private static instance: ParameterTypeRegistry;
  private readonly parameterTypes: Map<string, ParameterTypeDefinition>;
  private readonly transformCache: Map<string, any>;
  private readonly logger: Logger;
  private readonly builtInTypes: Map<string, ParameterTypeDefinition>;

  private constructor() {
    this.parameterTypes = new Map();
    this.transformCache = new Map();
    this.logger = Logger.getInstance('ParameterTypeRegistry');
    this.builtInTypes = new Map();
    this.registerBuiltInTypes();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ParameterTypeRegistry {
    if (!ParameterTypeRegistry.instance) {
      ParameterTypeRegistry.instance = new ParameterTypeRegistry();
    }
    return ParameterTypeRegistry.instance;
  }

  /**
   * Register built-in parameter types
   */
  private registerBuiltInTypes(): void {
    // String type
    this.registerBuiltIn('string', {
      name: 'string',
      regexp: /"([^"]*)"|'([^']*)'/,
      transformer: (s: string) => s,
      useForSnippets: true,
      preferForRegexpMatch: true
    });

    // Integer type
    this.registerBuiltIn('int', {
      name: 'int',
      regexp: /(-?\d+)/,
      transformer: (s: string) => {
        const num = parseInt(s, 10);
        if (isNaN(num)) {
          throw new Error(`Cannot convert "${s}" to integer`);
        }
        return num;
      },
      useForSnippets: true,
      preferForRegexpMatch: true
    });

    // Float type
    this.registerBuiltIn('float', {
      name: 'float',
      regexp: /(-?\d*\.?\d+)/,
      transformer: (s: string) => {
        const num = parseFloat(s);
        if (isNaN(num)) {
          throw new Error(`Cannot convert "${s}" to float`);
        }
        return num;
      },
      useForSnippets: true,
      preferForRegexpMatch: true
    });

    // Word type
    this.registerBuiltIn('word', {
      name: 'word',
      regexp: /(\w+)/,
      transformer: (s: string) => s,
      useForSnippets: false,
      preferForRegexpMatch: false
    });

    // Any type
    this.registerBuiltIn('any', {
      name: 'any',
      regexp: /(.*)/,
      transformer: (s: string) => s,
      useForSnippets: false,
      preferForRegexpMatch: false
    });

    // Boolean type
    this.registerBuiltIn('boolean', {
      name: 'boolean',
      regexp: /(true|false|yes|no|on|off)/i,
      transformer: (s: string) => {
        return ['true', 'yes', 'on'].includes(s.toLowerCase());
      },
      useForSnippets: true,
      preferForRegexpMatch: true
    });

    // Date type
    this.registerBuiltIn('date', {
      name: 'date',
      regexp: /(\d{4}-\d{2}-\d{2})/,
      transformer: (s: string) => {
        const date = new Date(s);
        if (isNaN(date.getTime())) {
          throw new Error(`Cannot convert "${s}" to date`);
        }
        return date;
      },
      useForSnippets: true,
      preferForRegexpMatch: true
    });

    // Time type
    this.registerBuiltIn('time', {
      name: 'time',
      regexp: /(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i,
      transformer: (s: string) => {
        // Simple time parsing - can be enhanced
        return s;
      },
      useForSnippets: true,
      preferForRegexpMatch: true
    });

    // List type
    this.registerBuiltIn('list', {
      name: 'list',
      regexp: /([^,]+(?:,\s*[^,]+)*)/,
      transformer: (s: string) => {
        return s.split(',').map(item => item.trim());
      },
      useForSnippets: true,
      preferForRegexpMatch: false
    });

    // JSON type
    this.registerBuiltIn('json', {
      name: 'json',
      regexp: /(\{.*\}|\[.*\])/,
      transformer: (s: string) => {
        try {
          return JSON.parse(s);
        } catch (error) {
          throw new Error(`Cannot parse JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      useForSnippets: false,
      preferForRegexpMatch: true
    });
  }

  /**
   * Register built-in type
   */
  private registerBuiltIn(name: string, definition: ParameterTypeDefinition): void {
    this.builtInTypes.set(name, definition);
    this.parameterTypes.set(name, definition);
  }

  /**
   * Define a custom parameter type
   */
  public defineParameterType(options: ParameterTypeOptions): void {
    if (!options.name) {
      throw new Error('Parameter type name is required');
    }

    if (this.builtInTypes.has(options.name)) {
      throw new Error(`Cannot override built-in parameter type: ${options.name}`);
    }

    const definition: ParameterTypeDefinition = {
      name: options.name,
      regexp: this.normalizeRegexp(options.regexp),
      transformer: options.transformer || ((s: string) => s),
      useForSnippets: options.useForSnippets ?? true,
      preferForRegexpMatch: options.preferForRegexpMatch ?? true
    };
    
    // Only add type property if it's defined
    if (options.type !== undefined) {
      definition.type = options.type;
    }

    this.parameterTypes.set(options.name, definition);
    
    ActionLogger.logInfo(`Parameter type registered: ${options.name}`);
    this.logger.debug(`Registered parameter type: ${options.name}`);
  }

  /**
   * Get parameter type definition
   */
  public getParameterType(name: string): ParameterTypeDefinition | undefined {
    return this.parameterTypes.get(name);
  }

  /**
   * Transform value using parameter type
   */
  public transform(value: string, typeName: string): any {
    const cacheKey = `${typeName}:${value}`;
    
    // Check cache
    if (this.transformCache.has(cacheKey)) {
      return this.transformCache.get(cacheKey);
    }

    const parameterType = this.parameterTypes.get(typeName);
    if (!parameterType) {
      throw new Error(`Unknown parameter type: ${typeName}`);
    }

    try {
      const transformed = parameterType.transformer(value);
      
      // Cache successful transformation
      this.transformCache.set(cacheKey, transformed);
      
      return transformed;
    } catch (error) {
      throw new Error(
        `Failed to transform "${value}" to ${typeName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Transform multiple values
   */
  public transformAll(values: string[], types: string[]): any[] {
    if (values.length !== types.length) {
      throw new Error(
        `Value count (${values.length}) does not match type count (${types.length})`
      );
    }

    return values.map((value, index) => {
      const typeIndex = types[index];
      if (!typeIndex) {
        throw new Error(`Missing type for value at index ${index}`);
      }
      return this.transform(value, typeIndex);
    });
  }

  /**
   * Detect parameter type from value
   */
  public detectType(value: string): string | null {
    // Check each parameter type
    const entries = Array.from(this.parameterTypes.entries());
    for (const [name, definition] of entries) {
      if (definition.preferForRegexpMatch && definition.regexp.test(value)) {
        return name;
      }
    }

    // Default to string if no match
    return 'string';
  }

  /**
   * Get all parameter types
   */
  public getAllParameterTypes(): ParameterTypeDefinition[] {
    return Array.from(this.parameterTypes.values());
  }

  /**
   * Get parameter types for snippets
   */
  public getSnippetParameterTypes(): ParameterTypeDefinition[] {
    return this.getAllParameterTypes().filter(pt => pt.useForSnippets);
  }

  /**
   * Generate type pattern for step definition
   */
  public generateTypePattern(typeName: string): string {
    const parameterType = this.parameterTypes.get(typeName);
    if (!parameterType) {
      throw new Error(`Unknown parameter type: ${typeName}`);
    }

    return `{${typeName}}`;
  }

  /**
   * Create regexp for parameter type in context
   */
  public createRegexpForType(typeName: string): RegExp {
    const parameterType = this.parameterTypes.get(typeName);
    if (!parameterType) {
      throw new Error(`Unknown parameter type: ${typeName}`);
    }

    return parameterType.regexp;
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.transformCache.clear();
    this.logger.debug('Transform cache cleared');
  }

  /**
   * Reset to built-in types only
   */
  public reset(): void {
    this.parameterTypes.clear();
    this.transformCache.clear();
    
    // Re-register built-in types
    const builtInEntries = Array.from(this.builtInTypes.entries());
    for (const [name, definition] of builtInEntries) {
      this.parameterTypes.set(name, definition);
    }
    
    this.logger.info('ParameterTypeRegistry reset to built-in types');
  }

  /**
   * Normalize regexp
   */
  private normalizeRegexp(regexp: RegExp | string | string[]): RegExp {
    if (regexp instanceof RegExp) {
      return regexp;
    }

    if (Array.isArray(regexp)) {
      // Create alternation
      const pattern = regexp.map(r => `(?:${r})`).join('|');
      return new RegExp(pattern);
    }

    return new RegExp(regexp);
  }

  /**
   * Export registry for debugging
   */
  public export(): any {
    return {
      builtInTypes: Array.from(this.builtInTypes.keys()),
      customTypes: Array.from(this.parameterTypes.entries())
        .filter(([name]) => !this.builtInTypes.has(name))
        .map(([name, def]) => ({
          name,
          regexp: def.regexp.source,
          useForSnippets: def.useForSnippets,
          preferForRegexpMatch: def.preferForRegexpMatch
        })),
      cacheSize: this.transformCache.size
    };
  }
}

// Export singleton instance
export const parameterTypeRegistry = ParameterTypeRegistry.getInstance();