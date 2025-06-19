// src/data/transformers/merger.types.ts

import { TestData } from '../types/data.types';

/**
 * Extended merge options for internal use
 */
export interface ExtendedMergeOptions {
    strategy: MergeStrategy;
    key?: string | string[];
    keepOriginal?: boolean;
    resolveConflicts?: ConflictResolution;
    conflictResolver?: (original: TestData, updated: TestData) => TestData;
    conflictResolution?: ConflictResolution;
    arrayMerge?: 'concat' | 'replace' | 'merge' | 'unique' | 'union' | 'intersection' | 'override' | 'combine' | 'zip';
    preserveOrder?: boolean;
    removeDuplicates?: boolean;
    ignoreNull?: boolean;
    ignoreEmpty?: boolean;
    customMergers?: Map<string, (values: any[], path: string) => any>;
    keyMappings?: Map<string, string>;
    transformers?: Map<string, (value: any, path: string) => any>;
    validators?: Map<string, (value: any, path: string) => boolean>;
}

/**
 * Merge result
 */
export interface MergeResult {
    success: boolean;
    result: any;
    conflicts: Array<{
        path: string;
        values: any[];
        resolved: any;
    }>;
    metadata: {
        sourceCount: number;
        mergedPaths?: Set<string>;
        transformedPaths?: Set<string>;
        validationErrors?: string[];
        mergedProperties?: number;
        transformedProperties?: number;
        executionTime?: number;
        duration?: number;
        strategy?: string;
        conflictCount?: number;
    };
}

/**
 * Merge strategy type
 */
export type MergeStrategy = 'append' | 'merge' | 'replace' | 'join' | 'deep' | 'array';

/**
 * Conflict resolution type
 */
export type ConflictResolution = 'original' | 'new' | 'custom' | 'override' | 'preserve' | 'error' | 'array' | 'concat' | 'sum' | 'average' | 'min' | 'max';