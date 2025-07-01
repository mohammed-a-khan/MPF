// src/core/elements/decorators/ElementMetadata.ts
import { CSGetElementOptions, ElementMetadataExport } from '../types/element.types';
import { ActionLogger } from '../../logging/ActionLogger';

export class ElementMetadata {
  private static metadata: Map<string, Map<string, CSGetElementOptions>> = new Map();
  private static readonly version = '1.0.0';

  static store(className: string, propertyName: string, options: CSGetElementOptions): void {
    if (!this.metadata.has(className)) {
      this.metadata.set(className, new Map());
    }
    
    const classMetadata = this.metadata.get(className)!;
    classMetadata.set(propertyName, options);
    
    ActionLogger.logDebug(`Element metadata stored: ${className}.${propertyName}`);
  }

  static get(className: string, propertyName: string): CSGetElementOptions | undefined {
    const classMetadata = this.metadata.get(className);
    if (!classMetadata) {
      return undefined;
    }
    
    return classMetadata.get(propertyName);
  }

  static getAll(className: string): Map<string, CSGetElementOptions> {
    return this.metadata.get(className) || new Map();
  }

  static getAllElements(): Map<string, Map<string, CSGetElementOptions>> {
    return new Map(this.metadata);
  }

  static clear(): void {
    this.metadata.clear();
    ActionLogger.logDebug('Element metadata cleared');
  }

  static export(): ElementMetadataExport {
    const elements: Array<{
      className: string;
      propertyName: string;
      options: CSGetElementOptions;
    }> = [];
    
    for (const [className, classMetadata] of this.metadata) {
      for (const [propertyName, options] of classMetadata) {
        elements.push({
          className,
          propertyName,
          options
        });
      }
    }
    
    return {
      timestamp: new Date(),
      version: this.version,
      elements
    };
  }

  static import(data: ElementMetadataExport): void {
    if (data.version !== this.version) {
      ActionLogger.logWarn(`Element metadata version mismatch. Expected ${this.version}, got ${data.version}`);
    }
    
    this.clear();
    
    for (const element of data.elements) {
      this.store(element.className, element.propertyName, element.options);
    }
    
    ActionLogger.logInfo(`Imported ${data.elements.length} element definitions`);
  }

  static generateReport(): string {
    const report: any = {
      version: this.version,
      timestamp: new Date().toISOString(),
      summary: {
        totalClasses: this.metadata.size,
        totalElements: Array.from(this.metadata.values()).reduce((sum, map) => sum + map.size, 0)
      },
      classes: []
    };
    
    for (const [className, classMetadata] of this.metadata) {
      const classReport = {
        name: className,
        elementCount: classMetadata.size,
        elements: [] as any[]
      };
      
      for (const [propertyName, options] of classMetadata) {
        classReport.elements.push({
          property: propertyName,
          description: options.description,
          locatorType: options.locatorType,
          locatorValue: options.locatorValue,
          features: {
            aiEnabled: options.aiEnabled || false,
            hasFallbacks: !!options.fallbacks,
            hasLayoutSelectors: !!(options.leftOf || options.rightOf || options.above || options.below || options.near),
            hasFilters: !!(options.hasText || options.hasNotText || options.has || options.hasNot),
            waitOptions: !!(options.waitForVisible || options.waitForEnabled)
          }
        });
      }
      
      report.classes.push(classReport);
    }
    
    return JSON.stringify(report, null, 2);
  }

  static validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [className, classMetadata] of this.metadata) {
      const propertyNames = new Set<string>();
      const locatorValues = new Map<string, string[]>();
      
      for (const [propertyName, options] of classMetadata) {
        if (propertyNames.has(propertyName)) {
          errors.push(`Duplicate property name '${propertyName}' in class '${className}'`);
        }
        propertyNames.add(propertyName);
        
        const locatorKey = `${options.locatorType}::${options.locatorValue}`;
        if (!locatorValues.has(locatorKey)) {
          locatorValues.set(locatorKey, []);
        }
        locatorValues.get(locatorKey)!.push(propertyName);
      }
      
      for (const [locatorKey, properties] of locatorValues) {
        if (properties.length > 1) {
          errors.push(
            `Duplicate locator '${locatorKey}' in class '${className}' ` +
            `used by properties: ${properties.join(', ')}`
          );
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static getStatistics(): any {
    const stats = {
      totalClasses: this.metadata.size,
      totalElements: 0,
      locatorTypeDistribution: new Map<string, number>(),
      featuresUsage: {
        aiEnabled: 0,
        fallbacks: 0,
        layoutSelectors: 0,
        filters: 0,
        waitOptions: 0
      },
      averageElementsPerClass: 0
    };
    
    for (const classMetadata of this.metadata.values()) {
      stats.totalElements += classMetadata.size;
      
      for (const options of classMetadata.values()) {
        const count = stats.locatorTypeDistribution.get(options.locatorType) || 0;
        stats.locatorTypeDistribution.set(options.locatorType, count + 1);
        
        if (options.aiEnabled) stats.featuresUsage.aiEnabled++;
        if (options.fallbacks) stats.featuresUsage.fallbacks++;
        if (options.leftOf || options.rightOf || options.above || options.below || options.near) {
          stats.featuresUsage.layoutSelectors++;
        }
        if (options.hasText || options.hasNotText || options.has || options.hasNot) {
          stats.featuresUsage.filters++;
        }
        if (options.waitForVisible || options.waitForEnabled) {
          stats.featuresUsage.waitOptions++;
        }
      }
    }
    
    stats.averageElementsPerClass = stats.totalClasses > 0 
      ? Math.round(stats.totalElements / stats.totalClasses * 10) / 10 
      : 0;
    
    return {
      ...stats,
      locatorTypeDistribution: Object.fromEntries(stats.locatorTypeDistribution)
    };
  }

  static findElementsByLocator(locatorType: string, locatorValue: string): Array<{
    className: string;
    propertyName: string;
    options: CSGetElementOptions;
  }> {
    const results: Array<{
      className: string;
      propertyName: string;
      options: CSGetElementOptions;
    }> = [];
    
    for (const [className, classMetadata] of this.metadata) {
      for (const [propertyName, options] of classMetadata) {
        if (options.locatorType === locatorType && options.locatorValue === locatorValue) {
          results.push({ className, propertyName, options });
        }
      }
    }
    
    return results;
  }

  static findElementsByDescription(searchText: string): Array<{
    className: string;
    propertyName: string;
    options: CSGetElementOptions;
  }> {
    const results: Array<{
      className: string;
      propertyName: string;
      options: CSGetElementOptions;
    }> = [];
    
    const searchLower = searchText.toLowerCase();
    
    for (const [className, classMetadata] of this.metadata) {
      for (const [propertyName, options] of classMetadata) {
        if (options.description.toLowerCase().includes(searchLower)) {
          results.push({ className, propertyName, options });
        }
      }
    }
    
    return results;
  }
}
