// src/data/validators/ExecutionFlagValidator.ts
import { TestData } from '../types/data.types';
import { ExecutionFlagValidationResult, ExtendedExecutionFlagOptions } from './execution-flag.types';
import { logger } from '../../core/utils/Logger';

/**
 * Validate execution flags in test data
 * Determines which test data records should be executed
 */
export class ExecutionFlagValidator {
    private readonly defaultOptions: ExtendedExecutionFlagOptions = {
        flagColumn: 'ExecutionFlag',
        executeValues: ['Y', 'Yes', 'TRUE', 'true', '1', 'Execute', 'Run'],
        skipValues: ['N', 'No', 'FALSE', 'false', '0', 'Skip', 'Ignore'],
        scenarioValues: ['S', 'Scenario', 'SCENARIO'],
        caseInsensitive: true,
        trimValues: true,
        defaultFlag: 'Y',
        validateDependencies: true,
        respectPriority: true,
        groupExecution: true
    };

    /**
     * Validate execution flags in test data
     */
    async validateExecutionFlags(
        data: TestData[],
        options?: Partial<ExtendedExecutionFlagOptions>
    ): Promise<ExecutionFlagValidationResult> {
        const opts = { ...this.defaultOptions, ...options };
        const results = {
            totalRecords: data.length,
            executeRecords: [] as TestData[],
            skipRecords: [] as TestData[],
            scenarioRecords: [] as TestData[],
            invalidRecords: [] as { record: TestData; reason: string; index: number }[],
            groups: new Map<string, TestData[]>(),
            dependencies: new Map<string, string[]>(),
            executionOrder: [] as TestData[]
        };

        try {
            // First pass: Categorize records by flag
            for (let index = 0; index < data.length; index++) {
                const record = data[index];
                if (!record) continue;
                
                const flag = this.getExecutionFlag(record, opts);
                const normalizedFlag = this.normalizeFlag(flag, opts);

                if (this.isExecuteFlag(normalizedFlag, opts)) {
                    results.executeRecords.push(record);
                } else if (this.isSkipFlag(normalizedFlag, opts)) {
                    results.skipRecords.push(record);
                } else if (this.isScenarioFlag(normalizedFlag, opts)) {
                    results.scenarioRecords.push(record);
                } else if (flag !== null && flag !== undefined) {
                    // Invalid flag
                    results.invalidRecords.push({
                        record,
                        reason: `Invalid execution flag: ${flag}`,
                        index
                    });
                }
            }

            // Process group execution
            if (opts.groupExecution) {
                this.processGroups(results.executeRecords, results, opts);
            }

            // Validate dependencies
            if (opts.validateDependencies) {
                await this.validateDependencies(results, opts);
            }

            // Determine execution order
            if (opts.respectPriority) {
                results.executionOrder = this.determineExecutionOrder(results.executeRecords, opts);
            } else {
                results.executionOrder = results.executeRecords;
            }

            // Process scenario records
            await this.processScenarioRecords(results, opts);

            logger.debug('Execution flag validation completed:', {
                total: results.totalRecords,
                execute: results.executeRecords.length,
                skip: results.skipRecords.length,
                scenario: results.scenarioRecords.length,
                invalid: results.invalidRecords.length
            });

            return {
                valid: results.invalidRecords.length === 0,
                executeRecords: results.executeRecords,
                skipRecords: results.skipRecords,
                scenarioRecords: results.scenarioRecords,
                invalidRecords: results.invalidRecords,
                groups: results.groups,
                dependencies: results.dependencies,
                executionOrder: results.executionOrder,
                summary: {
                    total: results.totalRecords,
                    toExecute: results.executeRecords.length,
                    toSkip: results.skipRecords.length,
                    scenarios: results.scenarioRecords.length,
                    invalid: results.invalidRecords.length,
                    groups: results.groups.size
                }
            };
        } catch (error) {
            logger.error('Execution flag validation failed:', error as Error);
            throw error;
        }
    }

    /**
     * Get execution flag from record
     */
    private getExecutionFlag(record: TestData, options: ExtendedExecutionFlagOptions): any {
        // Check multiple possible flag locations
        const flagLocations = [
            options.flagColumn,
            'executionFlag',
            'ExecutionFlag',
            'execution_flag',
            'EXECUTION_FLAG',
            'Execute',
            'execute',
            'Run',
            'run',
            'Flag',
            'flag'
        ];

        for (const location of flagLocations) {
            if (location && location in record) {
                return record[location];
            }
        }

        // Check nested properties
        if (options.flagColumn && options.flagColumn.includes('.')) {
            const value = this.getNestedValue(record, options.flagColumn);
            if (value !== undefined) {
                return value;
            }
        }

        // Return default flag if not found
        return options.defaultFlag || 'Y';
    }

    /**
     * Get nested value from object
     */
    private getNestedValue(obj: any, path: string): any {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }

        return current;
    }

    /**
     * Normalize flag value
     */
    private normalizeFlag(flag: any, options: ExtendedExecutionFlagOptions): string {
        if (flag === null || flag === undefined) {
            return options.defaultFlag || 'Y';
        }

        let normalized = String(flag);

        if (options.trimValues) {
            normalized = normalized.trim();
        }

        if (options.caseInsensitive) {
            normalized = normalized.toUpperCase();
        }

        return normalized;
    }

    /**
     * Check if flag indicates execution
     */
    private isExecuteFlag(flag: string, options: ExtendedExecutionFlagOptions): boolean {
        const compareFlag = options.caseInsensitive ? flag.toUpperCase() : flag;
        const executeValues = options.caseInsensitive 
            ? (options.executeValues || []).map(v => v.toUpperCase())
            : (options.executeValues || []);

        return executeValues.includes(compareFlag);
    }

    /**
     * Check if flag indicates skip
     */
    private isSkipFlag(flag: string, options: ExtendedExecutionFlagOptions): boolean {
        const compareFlag = options.caseInsensitive ? flag.toUpperCase() : flag;
        const skipValues = options.caseInsensitive 
            ? (options.skipValues || []).map(v => v.toUpperCase())
            : (options.skipValues || []);

        return skipValues.includes(compareFlag);
    }

    /**
     * Check if flag indicates scenario
     */
    private isScenarioFlag(flag: string, options: ExtendedExecutionFlagOptions): boolean {
        const compareFlag = options.caseInsensitive ? flag.toUpperCase() : flag;
        const scenarioValues = options.caseInsensitive 
            ? (options.scenarioValues || []).map(v => v.toUpperCase())
            : (options.scenarioValues || []);

        return scenarioValues.includes(compareFlag);
    }

    /**
     * Process groups of test data
     */
    private processGroups(
        records: TestData[],
        results: any,
        options: ExtendedExecutionFlagOptions
    ): void {
        // Group by common attributes
        const groupFields = ['TestGroup', 'Group', 'Suite', 'Module', 'Category'];

        for (const record of records) {
            let groupKey: string | null = null;

            // Find group key
            for (const field of groupFields) {
                if (record[field]) {
                    groupKey = `${field}:${record[field]}`;
                    break;
                }
            }

            // Custom group key function
            if (!groupKey && options.groupKeyFunction) {
                groupKey = options.groupKeyFunction(record);
            }

            if (groupKey) {
                if (!results.groups.has(groupKey)) {
                    results.groups.set(groupKey, []);
                }
                const group = results.groups.get(groupKey);
                if (group) {
                    group.push(record);
                }
            }
        }
    }

    /**
     * Validate dependencies between test data
     */
    private async validateDependencies(results: any, _options: ExtendedExecutionFlagOptions): Promise<void> {
        const dependencyFields = ['DependsOn', 'Dependency', 'Prerequisites', 'Requires'];
        const idFields = ['TestID', 'ID', 'TestCaseID', 'CaseID', 'Identifier'];

        // Build ID map
        const idMap = new Map<string, TestData>();
        for (const record of [...results.executeRecords, ...results.skipRecords]) {
            for (const idField of idFields) {
                if (record[idField]) {
                    idMap.set(String(record[idField]), record);
                    break;
                }
            }
        }

        // Check dependencies
        for (const record of results.executeRecords) {
            const dependencies: string[] = [];

            // Find dependencies
            for (const depField of dependencyFields) {
                if (record[depField]) {
                    const deps = Array.isArray(record[depField]) 
                        ? record[depField] 
                        : String(record[depField]).split(/[,;|]/).map((d: string) => d.trim());
                    
                    dependencies.push(...deps);
                    break;
                }
            }

            // Validate each dependency
            for (const dep of dependencies) {
                if (dep) {
                    const depRecord = idMap.get(dep);
                    
                    if (!depRecord) {
                        results.invalidRecords.push({
                            record,
                            reason: `Dependency not found: ${dep}`,
                            index: results.executeRecords.indexOf(record)
                        });
                    } else if (results.skipRecords.includes(depRecord)) {
                        results.invalidRecords.push({
                            record,
                            reason: `Depends on skipped test: ${dep}`,
                            index: results.executeRecords.indexOf(record)
                        });
                    }
                }
            }

            // Store valid dependencies
            if (dependencies.length > 0) {
                const recordId = this.getRecordId(record, idFields);
                if (recordId) {
                    results.dependencies.set(recordId, dependencies);
                }
            }
        }
    }

    /**
     * Get record ID
     */
    private getRecordId(record: TestData, idFields: string[]): string | null {
        for (const field of idFields) {
            if (record[field]) {
                return String(record[field]);
            }
        }
        return null;
    }

    /**
     * Determine execution order based on dependencies and priority
     */
    private determineExecutionOrder(records: TestData[], options: ExtendedExecutionFlagOptions): TestData[] {
        const priorityFields = ['Priority', 'Order', 'Sequence', 'ExecutionOrder'];
        const idFields = ['TestID', 'ID', 'TestCaseID', 'CaseID', 'Identifier'];

        // Sort by priority first
        const sorted = [...records].sort((a, b) => {
            // Get priorities
            let priorityA = Infinity;
            let priorityB = Infinity;

            for (const field of priorityFields) {
                if (a[field] !== undefined) {
                    priorityA = Number(a[field]);
                    break;
                }
            }

            for (const field of priorityFields) {
                if (b[field] !== undefined) {
                    priorityB = Number(b[field]);
                    break;
                }
            }

            return priorityA - priorityB;
        });

        // If no dependencies, return sorted by priority
        if (!options.validateDependencies) {
            return sorted;
        }

        // Topological sort for dependencies
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const result: TestData[] = [];
        const recordMap = new Map<string, TestData>();

        // Build record map
        for (const record of sorted) {
            const id = this.getRecordId(record, idFields);
            if (id) {
                recordMap.set(id, record);
            }
        }

        // DFS visit function
        const visit = (id: string): void => {
            if (visited.has(id)) return;
            
            if (visiting.has(id)) {
                logger.warn(`Circular dependency detected involving: ${id}`);
                return;
            }

            visiting.add(id);

            // Visit dependencies first
            const record = recordMap.get(id);
            if (record) {
                const dependencies = this.getRecordDependencies(record);
                for (const dep of dependencies) {
                    if (recordMap.has(dep)) {
                        visit(dep);
                    }
                }
            }

            visiting.delete(id);
            visited.add(id);

            if (record) {
                result.push(record);
            }
        };

        // Visit all records
        for (const [id] of recordMap) {
            visit(id);
        }

        // Add any records without IDs at the end
        for (const record of sorted) {
            if (!result.includes(record)) {
                result.push(record);
            }
        }

        return result;
    }

    /**
     * Get record dependencies
     */
    private getRecordDependencies(record: TestData): string[] {
        const dependencyFields = ['DependsOn', 'Dependency', 'Prerequisites', 'Requires'];
        
        for (const field of dependencyFields) {
            if (record[field]) {
                if (Array.isArray(record[field])) {
                    return record[field].map(d => String(d));
                } else {
                    return String(record[field]).split(/[,;|]/).map((d: string) => d.trim()).filter(Boolean);
                }
            }
        }

        return [];
    }

    /**
     * Process scenario records
     */
    private async processScenarioRecords(results: any, _options: ExtendedExecutionFlagOptions): Promise<void> {
        // Scenario records are special - they define test scenarios
        // that may include multiple test steps
        
        for (const scenarioRecord of results.scenarioRecords) {
            // Check if scenario has steps defined
            const stepsField = this.findStepsField(scenarioRecord);
            
            if (stepsField && scenarioRecord[stepsField]) {
                const steps = Array.isArray(scenarioRecord[stepsField]) 
                    ? scenarioRecord[stepsField]
                    : [scenarioRecord[stepsField]];

                // Validate all steps exist
                const validSteps = steps.every((stepId: any) => {
                    return results.executeRecords.some((record: TestData) => {
                        const id = this.getRecordId(record, ['TestID', 'ID', 'StepID']);
                        return id === String(stepId);
                    });
                });

                if (!validSteps) {
                    results.invalidRecords.push({
                        record: scenarioRecord,
                        reason: 'Scenario contains invalid or skipped steps',
                        index: results.scenarioRecords.indexOf(scenarioRecord)
                    });
                }
            }
        }
    }

    /**
     * Find steps field in record
     */
    private findStepsField(record: TestData): string | null {
        const stepsFields = ['Steps', 'TestSteps', 'ScenarioSteps', 'StepIDs'];
        
        for (const field of stepsFields) {
            if (field in record) {
                return field;
            }
        }

        return null;
    }

    /**
     * Filter records by execution flag
     */
    filterByExecutionFlag(
        data: TestData[],
        flag: 'execute' | 'skip' | 'scenario',
        options?: Partial<ExtendedExecutionFlagOptions>
    ): TestData[] {
        const opts = { ...this.defaultOptions, ...options };
        const filtered: TestData[] = [];

        for (const record of data) {
            const recordFlag = this.getExecutionFlag(record, opts);
            const normalizedFlag = this.normalizeFlag(recordFlag, opts);

            switch (flag) {
                case 'execute':
                    if (this.isExecuteFlag(normalizedFlag, opts)) {
                        filtered.push(record);
                    }
                    break;
                case 'skip':
                    if (this.isSkipFlag(normalizedFlag, opts)) {
                        filtered.push(record);
                    }
                    break;
                case 'scenario':
                    if (this.isScenarioFlag(normalizedFlag, opts)) {
                        filtered.push(record);
                    }
                    break;
            }
        }

        return filtered;
    }

    /**
     * Update execution flags
     */
    updateExecutionFlags(
        data: TestData[],
        updates: Array<{ condition: (record: TestData) => boolean; flag: string }>,
        options?: Partial<ExtendedExecutionFlagOptions>
    ): TestData[] {
        const opts = { ...this.defaultOptions, ...options };
        const updated = [...data];

        for (const record of updated) {
            for (const update of updates) {
                if (update.condition(record)) {
                    record[opts.flagColumn || 'ExecutionFlag'] = update.flag;
                    break;
                }
            }
        }

        return updated;
    }

    /**
     * Generate execution report
     */
    generateExecutionReport(
        result: ExecutionFlagValidationResult,
        format: 'summary' | 'detailed' = 'summary'
    ): string {
        if (format === 'summary') {
            return this.generateSummaryReport(result);
        } else {
            return this.generateDetailedReport(result);
        }
    }

    /**
     * Generate summary report
     */
    private generateSummaryReport(result: ExecutionFlagValidationResult): string {
        const lines = [
            '=== Execution Flag Validation Summary ===',
            '',
            `Total Records: ${result.summary.total}`,
            `Records to Execute: ${result.summary.toExecute}`,
            `Records to Skip: ${result.summary.toSkip}`,
            `Scenario Records: ${result.summary.scenarios}`,
            `Invalid Records: ${result.summary.invalid}`,
            `Execution Groups: ${result.summary.groups}`,
            '',
            `Validation Status: ${result.valid ? 'PASSED' : 'FAILED'}`
        ];

        if (!result.valid && result.invalidRecords.length > 0) {
            lines.push('', 'Invalid Records:');
            for (const invalid of result.invalidRecords.slice(0, 5)) {
                lines.push(`  - Record ${invalid.index}: ${invalid.reason}`);
            }
            if (result.invalidRecords.length > 5) {
                lines.push(`  ... and ${result.invalidRecords.length - 5} more`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Generate detailed report
     */
    private generateDetailedReport(result: ExecutionFlagValidationResult): string {
        const lines = [
            '=== Execution Flag Validation Detailed Report ===',
            '',
            '## Summary',
            `- Total Records: ${result.summary.total}`,
            `- Records to Execute: ${result.summary.toExecute}`,
            `- Records to Skip: ${result.summary.toSkip}`,
            `- Scenario Records: ${result.summary.scenarios}`,
            `- Invalid Records: ${result.summary.invalid}`,
            `- Execution Groups: ${result.summary.groups}`,
            `- Validation Status: ${result.valid ? 'PASSED' : 'FAILED'}`,
            ''
        ];

        // Execution order
        if (result.executionOrder.length > 0) {
            lines.push('## Execution Order');
            for (let i = 0; i < Math.min(10, result.executionOrder.length); i++) {
                const record = result.executionOrder[i];
                if (!record) continue;
                const id = this.getRecordId(record, ['TestID', 'ID', 'Name']);
                lines.push(`${i + 1}. ${id || 'Unknown'}`);
            }
            if (result.executionOrder.length > 10) {
                lines.push(`... and ${result.executionOrder.length - 10} more`);
            }
            lines.push('');
        }

        // Groups
        if (result.groups.size > 0) {
            lines.push('## Execution Groups');
            for (const [group, records] of result.groups) {
                lines.push(`- ${group}: ${records.length} records`);
            }
            lines.push('');
        }

        // Dependencies
        if (result.dependencies.size > 0) {
            lines.push('## Dependencies');
            for (const [id, deps] of result.dependencies) {
                lines.push(`- ${id} depends on: ${deps.join(', ')}`);
            }
            lines.push('');
        }

        // Invalid records
        if (result.invalidRecords.length > 0) {
            lines.push('## Invalid Records');
            for (const invalid of result.invalidRecords) {
                const id = this.getRecordId(invalid.record, ['TestID', 'ID', 'Name']);
                lines.push(`- Record ${invalid.index} (${id || 'Unknown'}): ${invalid.reason}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}