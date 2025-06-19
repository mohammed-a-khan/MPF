import { APIContext } from './APIContext';
import { APIContextData } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Manages multiple API contexts for parallel API testing
 * Supports context switching, sharing, and lifecycle management
 */
export class APIContextManager {
    private static instance: APIContextManager;
    private contexts: Map<string, APIContext> = new Map();
    private currentContextName: string = 'default';
    private sharedData: Map<string, any> = new Map();

    private constructor() {
        // Create default context
        this.createContext('default');
    }

    public static getInstance(): APIContextManager {
        if (!APIContextManager.instance) {
            APIContextManager.instance = new APIContextManager();
        }
        return APIContextManager.instance;
    }

    /**
     * Create new API context
     */
    public createContext(name: string, initialData?: Partial<APIContextData>): APIContext {
        if (this.contexts.has(name)) {
            throw new Error(`Context '${name}' already exists`);
        }

        const context = new APIContext(name, initialData);
        this.contexts.set(name, context);

        ActionLogger.getInstance().info(`API context created: ${name}`);
        return context;
    }

    /**
     * Get context by name
     */
    public getContext(name?: string): APIContext {
        const contextName = name || this.currentContextName;
        const context = this.contexts.get(contextName);

        if (!context) {
            throw new Error(`Context '${contextName}' not found`);
        }

        return context;
    }

    /**
     * Get current context
     */
    public getCurrentContext(): APIContext {
        return this.getContext(this.currentContextName);
    }

    /**
     * Switch to different context
     */
    public switchContext(name: string): void {
        if (!this.contexts.has(name)) {
            throw new Error(`Context '${name}' not found`);
        }

        const previousContext = this.currentContextName;
        this.currentContextName = name;

        ActionLogger.getInstance().info(`Switched from context '${previousContext}' to '${name}'`);
    }

    /**
     * Delete context
     */
    public deleteContext(name: string): void {
        if (name === 'default') {
            throw new Error('Cannot delete default context');
        }

        if (name === this.currentContextName) {
            this.switchContext('default');
        }

        this.contexts.delete(name);
        ActionLogger.getInstance().info(`API context deleted: ${name}`);
    }

    /**
     * Check if context exists
     */
    public hasContext(name: string): boolean {
        return this.contexts.has(name);
    }

    /**
     * Get all context names
     */
    public getContextNames(): string[] {
        return Array.from(this.contexts.keys());
    }

    /**
     * Clone existing context
     */
    public cloneContext(sourceName: string, targetName: string): APIContext {
        const sourceContext = this.getContext(sourceName);
        const clonedContext = sourceContext.clone(targetName);
        
        this.contexts.set(targetName, clonedContext);
        ActionLogger.getInstance().info(`Context '${sourceName}' cloned to '${targetName}'`);
        
        return clonedContext;
    }

    /**
     * Merge contexts
     */
    public mergeContexts(sourceName: string, targetName: string, overwrite: boolean = false): void {
        const source = this.getContext(sourceName);
        const target = this.getContext(targetName);

        const sourceState = source.getCurrentState();
        const targetState = target.getCurrentState();

        // Merge headers
        if (overwrite) {
            target.setHeaders(sourceState.headers);
        } else {
            target.setHeaders({ ...targetState.headers, ...sourceState.headers });
        }

        // Merge variables
        const sourceVars = source.getVariables();
        for (const [name, value] of Object.entries(sourceVars)) {
            if (overwrite || !target.getVariable(name)) {
                target.setVariable(name, value);
            }
        }

        // Copy auth if target doesn't have one or overwrite is true
        if (overwrite || !target.getAuth()) {
            target.setAuth(sourceState.auth);
        }

        ActionLogger.getInstance().info(`Context '${sourceName}' merged into '${targetName}'`);
    }

    /**
     * Reset all contexts
     */
    public resetAll(): void {
        for (const context of this.contexts.values()) {
            context.reset();
        }
        this.sharedData.clear();
        ActionLogger.getInstance().info('All API contexts reset');
    }

    /**
     * Reset specific context
     */
    public resetContext(name: string): void {
        const context = this.getContext(name);
        context.reset();
        ActionLogger.getInstance().info(`API context reset: ${name}`);
    }

    /**
     * Set shared data accessible by all contexts
     */
    public setSharedData(key: string, value: any): void {
        this.sharedData.set(key, value);
        ActionLogger.getInstance().debug(`Shared data set: ${key}`);
    }

    /**
     * Get shared data
     */
    public getSharedData(key: string): any {
        return this.sharedData.get(key);
    }

    /**
     * Clear shared data
     */
    public clearSharedData(): void {
        this.sharedData.clear();
        ActionLogger.getInstance().debug('Shared data cleared');
    }

    /**
     * Execute with temporary context
     */
    public async executeWithContext<T>(
        contextName: string,
        action: (context: APIContext) => Promise<T>
    ): Promise<T> {
        const previousContext = this.currentContextName;
        
        try {
            this.switchContext(contextName);
            const context = this.getCurrentContext();
            return await action(context);
        } finally {
            this.switchContext(previousContext);
        }
    }

    /**
     * Create temporary context for execution
     */
    public async executeWithTempContext<T>(
        initialData: Partial<APIContextData>,
        action: (context: APIContext) => Promise<T>
    ): Promise<T> {
        const tempName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            const context = this.createContext(tempName, initialData);
            return await action(context);
        } finally {
            this.deleteContext(tempName);
        }
    }

    /**
     * Get all contexts summary
     */
    public getAllContextsSummary(): any[] {
        return Array.from(this.contexts.entries()).map(([name, context]) => ({
            ...context.getSummary(),
            isCurrent: name === this.currentContextName
        }));
    }

    /**
     * Export all contexts
     */
    public exportAll(): any {
        const exports: any = {
            currentContext: this.currentContextName,
            contexts: {},
            sharedData: {}
        };

        for (const [name, context] of this.contexts) {
            exports.contexts[name] = context.export();
        }

        for (const [key, value] of this.sharedData) {
            exports.sharedData[key] = value;
        }

        return exports;
    }

    /**
     * Import contexts
     */
    public importAll(data: any): void {
        if (data.contexts) {
            for (const [name, contextData] of Object.entries(data.contexts)) {
                if (!this.hasContext(name)) {
                    this.createContext(name);
                }
                const context = this.getContext(name);
                context.import(contextData);
            }
        }

        if (data.sharedData) {
            for (const [key, value] of Object.entries(data.sharedData)) {
                this.setSharedData(key, value);
            }
        }

        if (data.currentContext && this.hasContext(data.currentContext)) {
            this.switchContext(data.currentContext);
        }

        ActionLogger.getInstance().info('Contexts imported successfully');
    }

    /**
     * Clear all contexts except default
     */
    public clearAll(): void {
        const contextsToDelete = Array.from(this.contexts.keys()).filter(name => name !== 'default');
        
        for (const name of contextsToDelete) {
            this.deleteContext(name);
        }

        this.getContext('default').reset();
        this.clearSharedData();
        this.currentContextName = 'default';

        ActionLogger.getInstance().info('All contexts cleared');
    }

    /**
     * Get metrics
     */
    public getMetrics(): any {
        const metrics = {
            totalContexts: this.contexts.size,
            totalResponses: 0,
            totalVariables: 0,
            totalRequests: 0
        };

        for (const context of this.contexts.values()) {
            const summary = context.getSummary();
            metrics.totalResponses += summary.responseCount;
            metrics.totalVariables += summary.variableCount;
            metrics.totalRequests += summary.requestHistoryCount;
        }

        return metrics;
    }

    /**
     * Find contexts by criteria
     */
    public findContexts(predicate: (context: APIContext) => boolean): APIContext[] {
        const results: APIContext[] = [];
        
        for (const context of this.contexts.values()) {
            if (predicate(context)) {
                results.push(context);
            }
        }
        
        return results;
    }

    /**
     * Apply operation to all contexts
     */
    public applyToAll(operation: (context: APIContext) => void): void {
        for (const context of this.contexts.values()) {
            operation(context);
        }
    }

    /**
     * Create context from another context's state
     */
    public createFromContext(sourceName: string, newName: string, modifications?: Partial<APIContextData>): APIContext {
        const source = this.getContext(sourceName);
        const sourceState = source.getCurrentState();
        
        const initialData = {
            ...sourceState,
            ...modifications
        };
        
        return this.createContext(newName, initialData);
    }
}