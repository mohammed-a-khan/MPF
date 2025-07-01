// src/data/transformers/DataMerger.ts
import { MergeOptions } from '../types/data.types';
import { ExtendedMergeOptions, MergeResult, MergeStrategy, ConflictResolution } from './merger.types';
import { logger } from '../../core/utils/Logger';

export class DataMerger {
    private readonly defaultOptions: ExtendedMergeOptions = {
        strategy: 'deep',
        conflictResolution: 'override',
        arrayMerge: 'concat',
        preserveOrder: true,
        removeDuplicates: true,
        ignoreNull: true,
        ignoreEmpty: false,
        customMergers: new Map(),
        keyMappings: new Map(),
        transformers: new Map(),
        validators: new Map()
    };

    async merge(
        sources: any[],
        options?: Partial<MergeOptions>
    ): Promise<MergeResult> {
        const opts = { ...this.defaultOptions, ...options } as ExtendedMergeOptions;
        const startTime = Date.now();
        const conflicts: Array<{ path: string; values: any[]; resolved: any }> = [];
        const metadata = {
            sourceCount: sources.length,
            mergedPaths: new Set<string>(),
            transformedPaths: new Set<string>(),
            validationErrors: [] as string[]
        };

        try {
            const validSources = this.filterValidSources(sources, opts);
            
            if (validSources.length === 0) {
                return {
                    success: true,
                    result: opts.strategy === 'array' ? [] : {},
                    conflicts: [],
                    metadata: {
                        sourceCount: 0,
                        mergedProperties: 0,
                        executionTime: Date.now() - startTime
                    } as any
                };
            }

            let result = validSources[0];
            for (let i = 1; i < validSources.length; i++) {
                result = await this.mergeTwoValues(
                    result,
                    validSources[i],
                    '',
                    opts,
                    conflicts,
                    metadata
                );
            }

            if (opts.validators && opts.validators.size > 0) {
                await this.validateMergedData(result, opts, metadata);
            }

            logger.debug('Data merge completed:', {
                sourceCount: sources.length,
                conflictCount: conflicts.length,
                executionTime: Date.now() - startTime
            });

            return {
                success: metadata.validationErrors.length === 0,
                result,
                conflicts,
                metadata: {
                    sourceCount: validSources.length,
                    mergedProperties: metadata.mergedPaths.size,
                    transformedProperties: metadata.transformedPaths.size,
                    validationErrors: metadata.validationErrors,
                    executionTime: Date.now() - startTime
                } as any
            };
        } catch (error) {
            logger.error('Data merge failed:', error as Error);
            throw error;
        }
    }

    async mergeWith(
        source1: any,
        source2: any,
        strategy: MergeStrategy,
        options?: Partial<MergeOptions>
    ): Promise<any> {
        const mergeResult = await this.merge(
            [source1, source2],
            { ...options, strategy: strategy as any }
        );
        return mergeResult.result;
    }

    registerCustomMerger(
        path: string,
        merger: (values: any[], path: string) => any
    ): void {
        if (this.defaultOptions.customMergers) {
            this.defaultOptions.customMergers.set(path, merger);
        }
        logger.debug(`Registered custom merger for path: ${path}`);
    }

    registerKeyMapping(fromKey: string, toKey: string): void {
        if (this.defaultOptions.keyMappings) {
            this.defaultOptions.keyMappings.set(fromKey, toKey);
        }
        logger.debug(`Registered key mapping: ${fromKey} -> ${toKey}`);
    }

    private filterValidSources(sources: any[], options: ExtendedMergeOptions): any[] {
        return sources.filter(source => {
            if (source === null || source === undefined) {
                return !options.ignoreNull;
            }
            
            if (options.ignoreEmpty) {
                if (Array.isArray(source) && source.length === 0) {
                    return false;
                }
                if (typeof source === 'object' && Object.keys(source).length === 0) {
                    return false;
                }
                if (typeof source === 'string' && source.trim() === '') {
                    return false;
                }
            }

            return true;
        });
    }

    private async mergeTwoValues(
        value1: any,
        value2: any,
        path: string,
        options: ExtendedMergeOptions,
        conflicts: Array<{ path: string; values: any[]; resolved: any }>,
        metadata: any
    ): Promise<any> {
        const customMerger = options.customMergers?.get(path);
        if (customMerger) {
            const result = customMerger([value1, value2], path);
            metadata.mergedPaths.add(path);
            return result;
        }

        if (value1 === null || value1 === undefined) {
            return value2;
        }
        if (value2 === null || value2 === undefined) {
            return value1;
        }

        const type1 = Array.isArray(value1) ? 'array' : typeof value1;
        const type2 = Array.isArray(value2) ? 'array' : typeof value2;

        if (type1 !== type2) {
            return this.resolveConflict(
                path,
                [value1, value2],
                options.conflictResolution || 'override',
                conflicts
            );
        }

        switch (type1) {
            case 'object':
                return this.mergeObjects(value1, value2, path, options, conflicts, metadata);
            
            case 'array':
                return this.mergeArrays(value1, value2, path, options, conflicts, metadata);
            
            default:
                if (value1 !== value2) {
                    return this.resolveConflict(
                        path,
                        [value1, value2],
                        options.conflictResolution || 'override',
                        conflicts
                    );
                }
                return value1;
        }
    }

    private async mergeObjects(
        obj1: Record<string, any>,
        obj2: Record<string, any>,
        basePath: string,
        options: ExtendedMergeOptions,
        conflicts: Array<{ path: string; values: any[]; resolved: any }>,
        metadata: any
    ): Promise<Record<string, any>> {
        const result: Record<string, any> = {};

        const allKeys = new Set([
            ...Object.keys(obj1),
            ...Object.keys(obj2)
        ]);

        const mappedObj2: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj2)) {
            const mappedKey = options.keyMappings?.get(key) || key;
            mappedObj2[mappedKey] = value;
        }

        for (const key of Array.from(allKeys)) {
            const path = basePath ? `${basePath}.${key}` : key;
            const value1 = obj1[key];
            const value2 = mappedObj2[key] ?? obj2[key];

            if (value1 !== undefined && value2 !== undefined) {
                result[key] = await this.mergeTwoValues(
                    value1,
                    value2,
                    path,
                    options,
                    conflicts,
                    metadata
                );
            } else if (value1 !== undefined) {
                result[key] = value1;
            } else if (value2 !== undefined) {
                result[key] = value2;
            }

            const transformer = options.transformers?.get(path);
            if (transformer && result[key] !== undefined) {
                result[key] = await transformer(result[key], path);
                metadata.transformedPaths.add(path);
            }

            metadata.mergedPaths.add(path);
        }

        return result;
    }

    private async mergeArrays(
        arr1: any[],
        arr2: any[],
        path: string,
        options: ExtendedMergeOptions,
        conflicts: Array<{ path: string; values: any[]; resolved: any }>,
        metadata: any
    ): Promise<any[]> {
        let result: any[];

        switch (options.arrayMerge) {
            case 'concat':
                result = [...arr1, ...arr2];
                break;

            case 'union':
                result = this.arrayUnion(arr1, arr2);
                break;

            case 'intersection':
                result = this.arrayIntersection(arr1, arr2);
                break;

            case 'override':
                result = arr2;
                break;

            case 'combine':
                result = await this.combineArrays(arr1, arr2, path, options, conflicts, metadata);
                break;

            case 'zip':
                result = this.zipArrays(arr1, arr2);
                break;

            default:
                result = [...arr1, ...arr2];
        }

        if (options.removeDuplicates && options.arrayMerge !== 'intersection') {
            result = this.removeDuplicates(result);
        }

        if (options.preserveOrder && options.arrayMerge === 'union') {
            result = this.preserveOriginalOrder(result, arr1, arr2);
        }

        metadata.mergedPaths.add(path);
        return result;
    }

    private arrayUnion(arr1: any[], arr2: any[]): any[] {
        const result = [...arr1];
        
        for (const item of arr2) {
            if (!this.arrayContains(result, item)) {
                result.push(item);
            }
        }

        return result;
    }

    private arrayIntersection(arr1: any[], arr2: any[]): any[] {
        return arr1.filter(item => this.arrayContains(arr2, item));
    }

    private async combineArrays(
        arr1: any[],
        arr2: any[],
        basePath: string,
        options: ExtendedMergeOptions,
        conflicts: Array<{ path: string; values: any[]; resolved: any }>,
        metadata: any
    ): Promise<any[]> {
        const maxLength = Math.max(arr1.length, arr2.length);
        const result: any[] = [];

        for (let i = 0; i < maxLength; i++) {
            const path = `${basePath}[${i}]`;
            
            if (i < arr1.length && i < arr2.length) {
                result.push(
                    await this.mergeTwoValues(
                        arr1[i],
                        arr2[i],
                        path,
                        options,
                        conflicts,
                        metadata
                    )
                );
            } else if (i < arr1.length) {
                result.push(arr1[i]);
            } else {
                result.push(arr2[i]);
            }
        }

        return result;
    }

    private zipArrays(arr1: any[], arr2: any[]): any[] {
        const maxLength = Math.max(arr1.length, arr2.length);
        const result: any[] = [];

        for (let i = 0; i < maxLength; i++) {
            const pair: any[] = [];
            
            if (i < arr1.length) pair.push(arr1[i]);
            if (i < arr2.length) pair.push(arr2[i]);
            
            result.push(pair);
        }

        return result;
    }

    private arrayContains(arr: any[], item: any): boolean {
        return arr.some(element => this.deepEqual(element, item));
    }

    private deepEqual(obj1: any, obj2: any): boolean {
        if (obj1 === obj2) return true;
        
        if (obj1 === null || obj2 === null) return false;
        if (obj1 === undefined || obj2 === undefined) return false;
        
        if (typeof obj1 !== typeof obj2) return false;

        if (typeof obj1 === 'object') {
            if (Array.isArray(obj1) && Array.isArray(obj2)) {
                if (obj1.length !== obj2.length) return false;
                
                for (let i = 0; i < obj1.length; i++) {
                    if (!this.deepEqual(obj1[i], obj2[i])) return false;
                }
                
                return true;
            }

            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);
            
            if (keys1.length !== keys2.length) return false;
            
            for (const key of keys1) {
                if (!keys2.includes(key)) return false;
                if (!this.deepEqual(obj1[key], obj2[key])) return false;
            }
            
            return true;
        }

        return false;
    }

    private removeDuplicates(arr: any[]): any[] {
        const result: any[] = [];
        const seen = new Set<string>();

        for (const item of arr) {
            const key = this.getItemKey(item);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(item);
            }
        }

        return result;
    }

    private getItemKey(item: any): string {
        if (item === null) return 'null';
        if (item === undefined) return 'undefined';
        
        if (typeof item === 'object') {
            if ('id' in item) return `id:${item.id}`;
            if ('_id' in item) return `_id:${item._id}`;
            if ('key' in item) return `key:${item.key}`;
            
            return JSON.stringify(item);
        }

        return String(item);
    }

    private preserveOriginalOrder(merged: any[], arr1: any[], arr2: any[]): any[] {
        const result: any[] = [];
        const used = new Set<number>();

        for (const item of arr1) {
            const index = merged.findIndex((m, i) => !used.has(i) && this.deepEqual(m, item));
            if (index !== -1) {
                result.push(merged[index]);
                used.add(index);
            }
        }

        for (const item of arr2) {
            const index = merged.findIndex((m, i) => !used.has(i) && this.deepEqual(m, item));
            if (index !== -1) {
                result.push(merged[index]);
                used.add(index);
            }
        }

        return result;
    }

    private resolveConflict(
        path: string,
        values: any[],
        resolution: ConflictResolution,
        conflicts: Array<{ path: string; values: any[]; resolved: any }>
    ): any {
        let resolved: any;

        switch (resolution) {
            case 'override':
                resolved = values[values.length - 1];
                break;

            case 'preserve':
                resolved = values[0];
                break;

            case 'error':
                throw new Error(`Merge conflict at path "${path}": ${JSON.stringify(values)}`);

            case 'array':
                resolved = values;
                break;

            case 'concat':
                resolved = values.map(v => String(v)).join('');
                break;

            case 'sum':
                resolved = values.reduce((sum, val) => {
                    const num = Number(val);
                    return isNaN(num) ? sum : sum + num;
                }, 0);
                break;

            case 'average':
                const numbers = values.map(v => Number(v)).filter(n => !isNaN(n));
                resolved = numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
                break;

            case 'min':
                resolved = values.reduce((min, val) => val < min ? val : min);
                break;

            case 'max':
                resolved = values.reduce((max, val) => val > max ? val : max);
                break;

            case 'custom':
                const customResolver = this.defaultOptions.customMergers?.get(`conflict:${path}`);
                if (customResolver) {
                    resolved = customResolver(values, path);
                } else {
                    resolved = values[values.length - 1];
                }
                break;

            default:
                resolved = values[values.length - 1];
        }

        conflicts.push({ path, values, resolved });
        return resolved;
    }

    private async validateMergedData(
        data: any,
        options: ExtendedMergeOptions,
        metadata: any
    ): Promise<void> {
        for (const [path, validator] of Array.from(options.validators || new Map())) {
            try {
                const value = this.getValueByPath(data, path);
                const isValid = await validator(value, path);
                
                if (!isValid) {
                    metadata.validationErrors.push(`Validation failed for path: ${path}`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                metadata.validationErrors.push(`Validation error at ${path}: ${errorMessage}`);
            }
        }
    }

    private getValueByPath(obj: any, path: string): any {
        if (!path) return obj;

        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }

            const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
            if (arrayMatch) {
                const fieldName = arrayMatch[1];
                const index = arrayMatch[2];
                if (fieldName && index) {
                    current = current[fieldName];
                    if (Array.isArray(current)) {
                        current = current[parseInt(index)];
                    } else {
                        return undefined;
                    }
                } else {
                    return undefined;
                }
            } else {
                current = current[part];
            }
        }

        return current;
    }

    async createMergePlan(
        sources: any[],
        options?: Partial<MergeOptions>
    ): Promise<{
        operations: Array<{
            path: string;
            action: 'add' | 'update' | 'conflict' | 'transform';
            values: any[];
            resolution?: any;
        }>;
        conflicts: Array<{
            path: string;
            values: any[];
            suggestedResolution: any;
        }>;
    }> {
        const opts = { ...this.defaultOptions, ...options } as ExtendedMergeOptions;
        const operations: any[] = [];
        const conflicts: any[] = [];

        await this.analyzeMerge(sources, '', opts, operations, conflicts);

        return { operations, conflicts };
    }

    private async analyzeMerge(
        sources: any[],
        basePath: string,
        options: ExtendedMergeOptions,
        operations: any[],
        conflicts: any[]
    ): Promise<void> {
        const allPaths = new Set<string>();
        
        for (const source of sources) {
            this.collectPaths(source, basePath, allPaths);
        }

        for (const path of Array.from(allPaths)) {
            const values = sources.map(s => this.getValueByPath(s, path)).filter(v => v !== undefined);
            
            if (values.length === 0) continue;

            if (values.length === 1) {
                operations.push({
                    path,
                    action: 'add',
                    values
                });
            } else {
                const firstValue = JSON.stringify(values[0]);
                const allEqual = values.every(v => JSON.stringify(v) === firstValue);

                if (allEqual) {
                    operations.push({
                        path,
                        action: 'update',
                        values: [values[0]]
                    });
                } else {
                    const resolution = this.suggestResolution(values, options.conflictResolution || 'override');
                    
                    operations.push({
                        path,
                        action: 'conflict',
                        values,
                        resolution
                    });

                    conflicts.push({
                        path,
                        values,
                        suggestedResolution: resolution
                    });
                }
            }

            if (options.transformers?.has(path)) {
                operations.push({
                    path,
                    action: 'transform',
                    values: []
                });
            }
        }
    }

    private collectPaths(obj: any, basePath: string, paths: Set<string>): void {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            if (basePath) paths.add(basePath);
            return;
        }

        if (Array.isArray(obj)) {
            paths.add(basePath);
            obj.forEach((item, index) => {
                this.collectPaths(item, `${basePath}[${index}]`, paths);
            });
        } else {
            if (basePath) paths.add(basePath);
            
            for (const [key, value] of Object.entries(obj)) {
                const path = basePath ? `${basePath}.${key}` : key;
                this.collectPaths(value, path, paths);
            }
        }
    }

    private suggestResolution(values: any[], strategy: ConflictResolution): any {
        switch (strategy) {
            case 'override':
                return values[values.length - 1];
            case 'preserve':
                return values[0];
            case 'array':
                return values;
            case 'concat':
                return values.map(v => String(v)).join('');
            case 'sum':
                return values.reduce((sum, val) => {
                    const num = Number(val);
                    return isNaN(num) ? sum : sum + num;
                }, 0);
            case 'average':
                const numbers = values.map(v => Number(v)).filter(n => !isNaN(n));
                return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
            case 'min':
                return values.reduce((min, val) => val < min ? val : min);
            case 'max':
                return values.reduce((max, val) => val > max ? val : max);
            default:
                return values[values.length - 1];
        }
    }

    async mergeWithValidation(
        sources: any[],
        schema: Record<string, any>,
        options?: Partial<MergeOptions>
    ): Promise<MergeResult> {
        const validators = new Map<string, (value: any, path: string) => boolean>();
        
        for (const [path, rules] of Object.entries(schema)) {
            validators.set(path, (value: any) => this.validateValue(value, rules));
        }

        return this.merge(sources, {
            ...options
        } as any);
    }

    private validateValue(value: any, rules: any): boolean {
        if (rules.required && (value === null || value === undefined)) {
            return false;
        }

        if (rules.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== rules.type) {
                return false;
            }
        }

        if (rules.min !== undefined) {
            if (typeof value === 'number' && value < rules.min) return false;
            if (typeof value === 'string' && value.length < rules.min) return false;
            if (Array.isArray(value) && value.length < rules.min) return false;
        }

        if (rules.max !== undefined) {
            if (typeof value === 'number' && value > rules.max) return false;
            if (typeof value === 'string' && value.length > rules.max) return false;
            if (Array.isArray(value) && value.length > rules.max) return false;
        }

        if (rules.pattern && typeof value === 'string') {
            const regex = new RegExp(rules.pattern);
            if (!regex.test(value)) return false;
        }

        if (rules.enum && !rules.enum.includes(value)) {
            return false;
        }

        if (rules.custom && typeof rules.custom === 'function') {
            return rules.custom(value);
        }

        return true;
    }

    static createConfigMerger(): DataMerger {
        const merger = new DataMerger();
        
        merger.registerCustomMerger('database.connectionPool', (values: any[]) => {
            return values.reduce((result, value) => ({
                min: Math.max(result.min || 0, value.min || 0),
                max: Math.max(result.max || 10, value.max || 10),
                idle: Math.min(result.idle || 10000, value.idle || 10000)
            }), {} as any);
        });

        merger.registerCustomMerger('api.headers', (values: any[]) => {
            return Object.assign({}, ...values);
        });

        merger.registerCustomMerger('features.enabled', (values: any[]) => {
            return values.some(v => v === true);
        });

        return merger;
    }

    static createTableMerger(): DataMerger {
        const merger = new DataMerger();
        
        merger.defaultOptions.arrayMerge = 'combine';
        merger.defaultOptions.conflictResolution = 'override';
        merger.defaultOptions.preserveOrder = true;
        
        merger.registerCustomMerger('rows', (values: any[][]) => {
            const idMap = new Map<string, any>();
            
            for (const rows of values) {
                for (const row of rows) {
                    const id = row.id || row._id || row.key;
                    if (id) {
                        const existing = idMap.get(id);
                        if (existing) {
                            idMap.set(id, { ...existing, ...row });
                        } else {
                            idMap.set(id, row);
                        }
                    }
                }
            }
            
            return Array.from(idMap.values());
        });

        return merger;
    }
}
