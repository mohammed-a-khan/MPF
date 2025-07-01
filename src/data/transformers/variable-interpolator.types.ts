// src/data/transformers/variable-interpolator.types.ts

import { TestData } from '../types/data.types';

export interface InterpolationOptions {
    prefix?: string;
    suffix?: string;
    maxDepth?: number;
    throwOnMissing?: boolean;
    cacheResults?: boolean;
    customResolvers?: Map<string, (name: string, context: any) => any>;
    filters?: Map<string, (value: any, ...args: any[]) => any>;
    escapeHtml?: boolean;
    preserveUnmatched?: boolean;
}

export interface VariableSource {
    type?: 'env' | 'context' | 'random' | 'date' | 'custom';
    name: string;
    value?: any;
    resolver?: (name: string, context: any) => any;
    resolve?: (variable: string) => Promise<any>;
}

export interface InterpolationResult {
    success: boolean;
    result: any;
    interpolatedVariables: string[];
    missingVariables: string[];
    errors: string[];
    executionTime: number;
    value?: any;
    interpolated?: boolean;
    variables?: Array<{
        name: string;
        value: any;
        source: string;
    }>;
}

export interface VariableMetadata {
    name: string;
    source: string;
    resolvedValue: any;
    filters: string[];
    fallback?: string;
}

export interface ParsedVariable {
    variable: string;
    filters: string[];
    fallback?: string;
}

export interface InterpolationContext extends Record<string, any> {
    env: NodeJS.ProcessEnv;
    testData?: TestData;
    scenario?: {
        name: string;
        tags: string[];
        feature: string;
        line: number;
    };
    browser?: {
        name: string;
        version: string;
        platform: string;
    };
    timestamp?: number;
    iteration?: number;
}
