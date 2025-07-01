// src/data/validators/execution-flag.types.ts

import { TestData } from '../types/data.types';

export interface ExecutionFlagValidationResult {
    valid: boolean;
    executeRecords: TestData[];
    skipRecords: TestData[];
    scenarioRecords: TestData[];
    invalidRecords: Array<{
        record: TestData;
        reason: string;
        index: number;
    }>;
    groups: Map<string, TestData[]>;
    dependencies: Map<string, string[]>;
    executionOrder: TestData[];
    summary: {
        total: number;
        toExecute: number;
        toSkip: number;
        scenarios: number;
        invalid: number;
        groups: number;
    };
}

export interface ExtendedExecutionFlagOptions {
    flagColumn: string;
    executeValues: string[];
    skipValues: string[];
    scenarioValues: string[];
    caseInsensitive: boolean;
    trimValues: boolean;
    defaultFlag: string;
    validateDependencies: boolean;
    respectPriority: boolean;
    groupExecution: boolean;
    environment?: string;
    groupKeyFunction?: (record: TestData) => string | null;
}
