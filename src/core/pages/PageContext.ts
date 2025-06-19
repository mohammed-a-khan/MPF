import { Page } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { PageState, PageMetrics, ContextData } from './types/page.types';

/**
 * PageContext - Store page-specific context and metrics
 * Manages state, metrics, and data sharing within a page
 */
export class PageContext {
    private data: Map<string, any> = new Map();
    private metrics!: PageMetrics;
    private history: Array<{ action: string; timestamp: Date; data?: any }> = [];
    readonly pageUrl: string;
    readonly createdAt: Date;
    private page: Page;

    constructor(page: Page) {
        this.page = page;
        this.pageUrl = page.url();
        this.createdAt = new Date();
        
        this.initializeMetrics();
    }

    /**
     * Set context data
     */
    set(key: string, value: any): void {
        const previousValue = this.data.get(key);
        this.data.set(key, value);
        
        this.recordHistory('set', { 
            key, 
            previousValue: previousValue !== undefined ? '<exists>' : '<undefined>',
            newValue: typeof value === 'object' ? '<object>' : value 
        });
        
        ActionLogger.logPageOperation('context_set', this.constructor.name, { key });
    }

    /**
     * Get context data
     */
    get<T>(key: string, defaultValue?: T): T {
        const value = this.data.get(key);
        
        this.recordHistory('get', { 
            key, 
            found: value !== undefined 
        });
        
        return value !== undefined ? value : defaultValue as T;
    }

    /**
     * Get required context data
     */
    getRequired<T>(key: string): T {
        const value = this.data.get(key);
        
        if (value === undefined) {
            throw new Error(`Required context key '${key}' not found`);
        }
        
        return value;
    }

    /**
     * Check if context has key
     */
    has(key: string): boolean {
        return this.data.has(key);
    }

    /**
     * Delete context data
     */
    delete(key: string): boolean {
        const result = this.data.delete(key);
        
        if (result) {
            this.recordHistory('delete', { key });
        }
        
        return result;
    }

    /**
     * Clear all context data
     */
    clear(): void {
        const size = this.data.size;
        this.data.clear();
        
        this.recordHistory('clear', { clearedItems: size });
        
        ActionLogger.logPageOperation('context_clear', this.constructor.name, { items: size });
    }

    /**
     * Get all context data
     */
    getAll(): ContextData {
        return Object.fromEntries(this.data);
    }

    /**
     * Set multiple values
     */
    setMultiple(data: ContextData): void {
        Object.entries(data).forEach(([key, value]) => {
            this.set(key, value);
        });
    }

    /**
     * Merge data into context
     */
    merge(data: ContextData): void {
        Object.entries(data).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Deep merge for objects
                const existing = this.get(key);
                if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
                    this.set(key, { ...existing, ...value });
                } else {
                    this.set(key, value);
                }
            } else {
                this.set(key, value);
            }
        });
    }

    /**
     * Record a metric
     */
    recordMetric(name: string, value: number): void {
        if (!this.metrics.customMetrics[name]) {
            this.metrics.customMetrics[name] = [];
        }
        
        this.metrics.customMetrics[name].push({
            value,
            timestamp: new Date()
        });
        
        this.recordHistory('metric', { name, value });
    }

    /**
     * Record an action
     */
    recordAction(action: string, duration: number, details?: any): void {
        this.metrics.actions.push({
            action,
            duration,
            timestamp: new Date(),
            details
        });
        
        this.recordHistory('action', { action, duration });
        
        ActionLogger.logInfo('context_action', { action, duration });
    }

    /**
     * Record an error
     */
    recordError(error: string | Error, context?: any): void {
        const errorMessage = error instanceof Error ? error.message : error;
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        const errorEntry: {
            error: string;
            stack?: string;
            context?: any;
            timestamp: Date;
        } = {
            error: errorMessage,
            timestamp: new Date()
        };
        
        if (errorStack !== undefined) {
            errorEntry.stack = errorStack;
        }
        
        if (context !== undefined) {
            errorEntry.context = context;
        }
        
        this.metrics.errors.push(errorEntry);
        
        this.recordHistory('error', { error: errorMessage });
        
        logger.error('PageContext: Error recorded', error as Error);
    }

    /**
     * Increment screenshot counter
     */
    incrementScreenshots(): void {
        this.metrics.screenshots++;
    }

    /**
     * Increment API call counter
     */
    incrementAPICalls(details?: { url?: string; method?: string; status?: number }): void {
        this.metrics.apiCalls++;
        
        if (details) {
            if (!this.metrics.apiCallDetails) {
                this.metrics.apiCallDetails = [];
            }
            
            this.metrics.apiCallDetails.push({
                ...details,
                timestamp: new Date()
            });
        }
    }

    /**
     * Get metrics
     */
    getMetrics(): PageMetrics {
        return {
            ...this.metrics,
            loadTime: this.metrics.loadTime || 0,
            totalActions: this.metrics.actions.length,
            totalErrors: this.metrics.errors.length,
            averageActionDuration: this.calculateAverageActionDuration()
        };
    }

    /**
     * Get action history
     */
    getHistory(): Array<{ action: string; timestamp: Date; data?: any }> {
        return [...this.history];
    }

    /**
     * Save current state
     */
    saveState(): PageState {
        return {
            url: this.pageUrl,
            data: new Map(this.data),
            metrics: { ...this.metrics },
            timestamp: new Date()
        };
    }

    /**
     * Restore state
     */
    restoreState(state: PageState): void {
        this.data = new Map(state.data);
        this.metrics = { ...state.metrics };
        
        this.recordHistory('restore', { 
            originalTimestamp: state.timestamp 
        });
        
        ActionLogger.logInfo('context_restore', {
            dataSize: this.data.size
        });
    }

    /**
     * Create a checkpoint
     */
    createCheckpoint(name: string): void {
        const checkpoint = {
            name,
            state: this.saveState(),
            timestamp: new Date()
        };
        
        this.set(`__checkpoint_${name}`, checkpoint);
        
        this.recordHistory('checkpoint', { name });
    }

    /**
     * Restore from checkpoint
     */
    restoreCheckpoint(name: string): void {
        const checkpoint = this.get(`__checkpoint_${name}`);
        
        if (!checkpoint) {
            throw new Error(`Checkpoint '${name}' not found`);
        }
        
        const checkpointData = checkpoint as { state: PageState; name: string; timestamp: Date };
        this.restoreState(checkpointData.state);
        
        this.recordHistory('restore_checkpoint', { name });
    }

    /**
     * Execute with temporary context
     */
    async withTemporaryContext<T>(
        temporaryData: ContextData,
        action: () => Promise<T>
    ): Promise<T> {
        // Save current state
        const savedState = this.saveState();
        
        try {
            // Apply temporary data
            this.setMultiple(temporaryData);
            
            // Execute action
            return await action();
        } finally {
            // Restore original state
            this.restoreState(savedState);
        }
    }

    /**
     * Get context size (for monitoring)
     */
    getSize(): { items: number; approximateBytes: number } {
        let approximateBytes = 0;
        
        this.data.forEach((value, key) => {
            // Rough estimation
            approximateBytes += key.length * 2; // Unicode
            approximateBytes += JSON.stringify(value).length * 2;
        });
        
        return {
            items: this.data.size,
            approximateBytes
        };
    }

    /**
     * Export context for debugging
     */
    export(): any {
        return {
            url: this.pageUrl,
            createdAt: this.createdAt,
            data: Object.fromEntries(this.data),
            metrics: this.getMetrics(),
            historySize: this.history.length,
            currentUrl: this.page.url()
        };
    }

    // Private methods

    private initializeMetrics(): void {
        this.metrics = {
            loadTime: 0,
            actions: [],
            errors: [],
            screenshots: 0,
            apiCalls: 0,
            customMetrics: {},
            startTime: Date.now()
        };
    }

    private recordHistory(action: string, data?: any): void {
        this.history.push({
            action,
            timestamp: new Date(),
            data
        });
        
        // Limit history size to prevent memory issues
        if (this.history.length > 1000) {
            this.history.shift();
        }
    }

    private calculateAverageActionDuration(): number {
        if (this.metrics.actions.length === 0) {
            return 0;
        }
        
        const totalDuration = this.metrics.actions.reduce(
            (sum, action) => sum + action.duration, 
            0
        );
        
        return totalDuration / this.metrics.actions.length;
    }
}