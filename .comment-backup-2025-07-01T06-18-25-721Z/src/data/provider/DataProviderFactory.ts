// src/data/provider/DataProviderFactory.ts

import { DataSource, DataHandler } from '../types/data.types';
import { ExcelHandler } from '../handlers/ExcelHandler';
import { CSVHandler } from '../handlers/CSVHandler';
import { JSONHandler } from '../handlers/JSONHandler';
import { XMLHandler } from '../handlers/XMLHandler';
import { DatabaseHandler } from '../handlers/DatabaseHandler';
import { FileHandler } from '../handlers/FileHandler';
import { logger } from '../../core/utils/Logger';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Factory for creating appropriate data handlers
 * Implements factory pattern for data source abstraction
 */
export class DataProviderFactory {
    private handlers: Map<DataSource, new() => DataHandler>;
    private customHandlers: Map<string, new() => DataHandler> = new Map();
    
    constructor() {
        this.handlers = new Map<DataSource, new() => DataHandler>();
        this.handlers.set('excel', ExcelHandler);
        this.handlers.set('csv', CSVHandler);
        this.handlers.set('json', JSONHandler);
        this.handlers.set('xml', XMLHandler);
        this.handlers.set('database', DatabaseHandler);
        this.handlers.set('file', FileHandler);
        
        logger.debug('DataProviderFactory initialized with handlers:', Array.from(this.handlers.keys()));
    }

    /**
     * Create handler for specified data source type
     */
    createHandler(type: DataSource | string): DataHandler {
        ActionLogger.logInfo('Data provider operation: create_handler', { operation: 'data_provider_create_handler', type });
        
        // Check custom handlers first
        const CustomHandler = this.customHandlers.get(type);
        if (CustomHandler) {
            logger.debug(`Creating custom handler for type: ${type}`);
            return new CustomHandler();
        }
        
        // Check built-in handlers
        const Handler = this.handlers.get(type as DataSource);
        if (!Handler) {
            const availableTypes = [
                ...Array.from(this.handlers.keys()),
                ...Array.from(this.customHandlers.keys())
            ];
            
            throw new Error(
                `Unsupported data source type: ${type}\n` +
                `Available types: ${availableTypes.join(', ')}\n` +
                `To add custom handler, use registerHandler() method`
            );
        }
        
        logger.debug(`Creating ${type} handler`);
        return new Handler();
    }

    /**
     * Register custom data handler
     */
    registerHandler(type: string, handler: new() => DataHandler): void {
        if (this.handlers.has(type as DataSource)) {
            logger.warn(`Overriding built-in handler for type: ${type}`);
        }
        
        this.customHandlers.set(type, handler);
        logger.info(`Registered custom handler for type: ${type}`);
        
        ActionLogger.logInfo('Data provider operation: register_handler', { operation: 'data_provider_register_handler', type });
    }

    /**
     * Check if handler exists for type
     */
    hasHandler(type: string): boolean {
        return this.handlers.has(type as DataSource) || this.customHandlers.has(type);
    }

    /**
     * Get all available handler types
     */
    getAvailableTypes(): string[] {
        return [
            ...Array.from(this.handlers.keys()),
            ...Array.from(this.customHandlers.keys())
        ];
    }

    /**
     * Create multiple handlers for batch processing
     */
    createHandlers(types: (DataSource | string)[]): DataHandler[] {
        return types.map(type => this.createHandler(type));
    }

    /**
     * Get handler capabilities
     */
    getHandlerCapabilities(type: DataSource | string): string[] {
        const handler = this.createHandler(type);
        
        const capabilities: string[] = [];
        
        // Check method existence to determine capabilities
        if ('stream' in handler && typeof handler.stream === 'function') {
            capabilities.push('streaming');
        }
        
        if ('loadPartial' in handler && typeof handler.loadPartial === 'function') {
            capabilities.push('partial-loading');
        }
        
        if ('loadSchema' in handler && typeof handler.loadSchema === 'function') {
            capabilities.push('schema-detection');
        }
        
        if ('validate' in handler && typeof handler.validate === 'function') {
            capabilities.push('validation');
        }
        
        if ('transform' in handler && typeof handler.transform === 'function') {
            capabilities.push('transformation');
        }
        
        return capabilities;
    }

    /**
     * Clear all registered custom handlers
     */
    clearCustomHandlers(): void {
        this.customHandlers.clear();
        logger.info('Cleared all custom handlers');
    }

    /**
     * Get handler statistics
     */
    getStatistics(): Record<string, any> {
        return {
            builtInHandlers: this.handlers.size,
            customHandlers: this.customHandlers.size,
            totalHandlers: this.handlers.size + this.customHandlers.size,
            types: {
                builtIn: Array.from(this.handlers.keys()),
                custom: Array.from(this.customHandlers.keys())
            }
        };
    }
}