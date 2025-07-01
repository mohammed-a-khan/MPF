import { ValidationResult, JSONPathResult, JSONPathOptions } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * JSONPath validator with full JSONPath syntax support
 * Implements JSONPath specification for querying and validating JSON data
 */
export class JSONPathValidator {
    private static instance: JSONPathValidator;

    private constructor() {}

    public static getInstance(): JSONPathValidator {
        if (!JSONPathValidator.instance) {
            JSONPathValidator.instance = new JSONPathValidator();
        }
        return JSONPathValidator.instance;
    }

    /**
     * Validate JSONPath expression result
     */
    public async validatePath(
        data: any,
        path: string,
        expected: any,
        options: JSONPathOptions = {}
    ): Promise<ValidationResult> {
        const startTime = Date.now();

        try {
            ActionLogger.getInstance().debug('JSONPath validation started', {
                path,
                expectedType: typeof expected
            });

            // Extract value using JSONPath
            const result = this.query(data, path, options);

            // Handle different result scenarios
            let actual: any;
            let valid = false;
            let message = '';

            if (result.values.length === 0) {
                actual = undefined;
                message = `No match found for path: ${path}`;
            } else if (result.values.length === 1) {
                actual = result.values[0];
                valid = this.compareValues(actual, expected, options);
                message = valid 
                    ? `JSONPath validation passed`
                    : `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`;
            } else {
                actual = result.values;
                if (options.expectArray) {
                    valid = this.compareArrays(actual, expected, options);
                    message = valid
                        ? `JSONPath array validation passed`
                        : `Array mismatch - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
                } else {
                    message = `Multiple values found (${result.values.length}), expected single value`;
                }
            }

            const validationResult: ValidationResult = {
                valid,
                message,
                expected,
                actual,
                duration: Date.now() - startTime,
                metadata: {
                    path,
                    matchCount: result.values.length,
                    paths: result.paths
                }
            };

            ActionLogger.getInstance().debug('JSONPath validation completed', validationResult);
            return validationResult;

        } catch (error) {
            const validationResult: ValidationResult = {
                valid: false,
                message: `JSONPath validation error: ${(error as Error).message}`,
                errors: [{ message: (error as Error).message, path }],
                duration: Date.now() - startTime
            };

            ActionLogger.getInstance().logError(error as Error, 'JSONPath validation failed');
            return validationResult;
        }
    }

    /**
     * Extract value(s) using JSONPath
     */
    public extractValue(data: any, path: string, options: JSONPathOptions = {}): any {
        const result = this.query(data, path, options);
        
        if (result.values.length === 0) {
            return undefined;
        } else if (result.values.length === 1 && !options.alwaysReturnArray) {
            return result.values[0];
        } else {
            return result.values;
        }
    }

    /**
     * Query JSON data using JSONPath expression
     */
    public query(data: any, path: string, options: JSONPathOptions = {}): JSONPathResult {
        ActionLogger.logDebug(`Executing JSONPath query: ${path}`);

        // Validate path syntax
        if (!this.isValidPath(path)) {
            throw new Error(`Invalid JSONPath expression: ${path}`);
        }

        // Parse and execute JSONPath
        const tokens = this.tokenizePath(path);
        const context = {
            root: data,
            current: data,
            options
        };

        const results = this.executePath(tokens, context);

        return {
            values: results.map(r => r.value),
            paths: results.map(r => r.path)
        };
    }

    /**
     * Tokenize JSONPath expression
     */
    private tokenizePath(path: string): PathToken[] {
        const tokens: PathToken[] = [];
        let current = 0;

        while (current < path.length) {
            const char = path[current];

            if (char === '$') {
                tokens.push({ type: 'root', value: '$' });
                current++;
            } else if (char === '@') {
                tokens.push({ type: 'current', value: '@' });
                current++;
            } else if (char === '.') {
                if (path[current + 1] === '.') {
                    tokens.push({ type: 'recursive', value: '..' });
                    current += 2;
                } else {
                    current++; // Skip single dot
                }
            } else if (char === '[') {
                const endIndex = this.findMatchingBracket(path, current);
                const content = path.substring(current + 1, endIndex);
                tokens.push(this.parseBracketContent(content));
                current = endIndex + 1;
            } else if (char === '*') {
                tokens.push({ type: 'wildcard', value: '*' });
                current++;
            } else {
                // Property name
                const match = path.substring(current).match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
                const matchedProperty = match?.[1];
                if (match && matchedProperty) {
                    tokens.push({ type: 'property', value: matchedProperty });
                    current += matchedProperty.length;
                } else {
                    throw new Error(`Invalid character at position ${current}: ${char}`);
                }
            }
        }

        return tokens;
    }

    /**
     * Find matching closing bracket
     */
    private findMatchingBracket(path: string, start: number): number {
        let depth = 1;
        let inString = false;
        let escapeNext = false;

        for (let i = start + 1; i < path.length; i++) {
            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            const char = path[i];

            if (char === '\\') {
                escapeNext = true;
            } else if (char === '"' || char === "'") {
                inString = !inString;
            } else if (!inString) {
                if (char === '[') depth++;
                else if (char === ']') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
        }

        throw new Error('Unmatched bracket in JSONPath');
    }

    /**
     * Parse bracket content
     */
    private parseBracketContent(content: string): PathToken {
        content = content.trim();

        // Array index
        if (/^-?\d+$/.test(content)) {
            return { type: 'index', value: parseInt(content) };
        }

        // Array slice
        if (content.includes(':')) {
            const parts = content.split(':').map(p => p.trim());
            return {
                type: 'slice',
                value: {
                    start: parts[0] ? parseInt(parts[0]) : undefined,
                    end: parts[1] ? parseInt(parts[1]) : undefined,
                    step: parts[2] ? parseInt(parts[2]) : 1
                }
            };
        }

        // Multiple indices
        if (content.includes(',')) {
            const indices = content.split(',').map(i => {
                const trimmed = i.trim();
                if (/^-?\d+$/.test(trimmed)) {
                    return parseInt(trimmed);
                }
                return this.parsePropertyName(trimmed);
            });
            return { type: 'union', value: indices };
        }

        // Filter expression
        if (content.startsWith('?(') && content.endsWith(')')) {
            return {
                type: 'filter',
                value: this.parseFilterExpression(content.substring(2, content.length - 1))
            };
        }

        // Script expression
        if (content.startsWith('(') && content.endsWith(')')) {
            return {
                type: 'script',
                value: content.substring(1, content.length - 1)
            };
        }

        // Property name
        return { type: 'property', value: this.parsePropertyName(content) };
    }

    /**
     * Parse property name (handle quotes)
     */
    private parsePropertyName(name: string): string {
        if ((name.startsWith('"') && name.endsWith('"')) ||
            (name.startsWith("'") && name.endsWith("'"))) {
            return name.substring(1, name.length - 1);
        }
        return name;
    }

    /**
     * Parse filter expression
     */
    private parseFilterExpression(expr: string): FilterExpression {
        // Simple implementation - in production would use proper expression parser
        const match = expr.match(/^@\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(==|!=|<|>|<=|>=)\s*(.+)$/);
        
        if (match) {
            const property = match[1];
            const operator = match[2];
            const value = match[3];
            
            if (!property) {
                throw new Error('Invalid filter expression: missing property');
            }
            
            return {
                property,
                operator: operator as ComparisonOperator,
                value: this.parseFilterValue(value || '')
            };
        }

        // Handle existence check
        if (expr.match(/^@\.([a-zA-Z_$][a-zA-Z0-9_$]*)$/)) {
            return {
                property: expr.substring(2),
                operator: 'exists',
                value: null
            };
        }

        throw new Error(`Unsupported filter expression: ${expr}`);
    }

    /**
     * Parse filter value
     */
    private parseFilterValue(value: string): any {
        value = value.trim();

        // String
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.substring(1, value.length - 1);
        }

        // Number
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            return parseFloat(value);
        }

        // Boolean
        if (value === 'true') return true;
        if (value === 'false') return false;

        // Null
        if (value === 'null') return null;

        // Assume property reference
        return { type: 'reference', path: value };
    }

    /**
     * Execute JSONPath tokens
     */
    private executePath(tokens: PathToken[], context: QueryContext): QueryResult[] {
        let results: QueryResult[] = [{ value: context.root, path: '$' }];

        for (const token of tokens) {
            results = this.executeToken(token, results, context);
        }

        return results;
    }

    /**
     * Execute single token
     */
    private executeToken(
        token: PathToken,
        inputs: QueryResult[],
        context: QueryContext
    ): QueryResult[] {
        const results: QueryResult[] = [];

        for (const input of inputs) {
            switch (token.type) {
                case 'root':
                    results.push({ value: context.root, path: '$' });
                    break;

                case 'current':
                    results.push(input);
                    break;

                case 'property':
                    if (input.value && typeof input.value === 'object') {
                        const propValue = input.value[token.value];
                        if (propValue !== undefined) {
                            results.push({
                                value: propValue,
                                path: `${input.path}.${token.value}`
                            });
                        }
                    }
                    break;

                case 'wildcard':
                    if (input.value && typeof input.value === 'object') {
                        if (Array.isArray(input.value)) {
                            input.value.forEach((item, index) => {
                                results.push({
                                    value: item,
                                    path: `${input.path}[${index}]`
                                });
                            });
                        } else {
                            Object.entries(input.value).forEach(([key, value]) => {
                                results.push({
                                    value,
                                    path: `${input.path}.${key}`
                                });
                            });
                        }
                    }
                    break;

                case 'recursive':
                    results.push(...this.recursiveSearch(input.value, input.path));
                    break;

                case 'index':
                    if (Array.isArray(input.value)) {
                        const index = token.value < 0 
                            ? input.value.length + token.value 
                            : token.value;
                        
                        if (index >= 0 && index < input.value.length) {
                            results.push({
                                value: input.value[index],
                                path: `${input.path}[${index}]`
                            });
                        }
                    }
                    break;

                case 'slice':
                    if (Array.isArray(input.value)) {
                        const slice = token.value;
                        const start = slice.start ?? 0;
                        const end = slice.end ?? input.value.length;
                        const step = slice.step ?? 1;

                        for (let i = start; i < end && i < input.value.length; i += step) {
                            if (i >= 0) {
                                results.push({
                                    value: input.value[i],
                                    path: `${input.path}[${i}]`
                                });
                            }
                        }
                    }
                    break;

                case 'union':
                    for (const selector of token.value) {
                        if (typeof selector === 'number') {
                            // Array index
                            if (Array.isArray(input.value) && selector < input.value.length) {
                                results.push({
                                    value: input.value[selector],
                                    path: `${input.path}[${selector}]`
                                });
                            }
                        } else {
                            // Property name
                            if (input.value && typeof input.value === 'object') {
                                const propValue = input.value[selector];
                                if (propValue !== undefined) {
                                    results.push({
                                        value: propValue,
                                        path: `${input.path}.${selector}`
                                    });
                                }
                            }
                        }
                    }
                    break;

                case 'filter':
                    if (Array.isArray(input.value)) {
                        input.value.forEach((item, index) => {
                            if (this.evaluateFilter(item, token.value, context)) {
                                results.push({
                                    value: item,
                                    path: `${input.path}[${index}]`
                                });
                            }
                        });
                    }
                    break;

                case 'script':
                    // Script expressions not supported for security
                    throw new Error('Script expressions are not supported');
            }
        }

        return results;
    }

    /**
     * Recursive search
     */
    private recursiveSearch(value: any, basePath: string): QueryResult[] {
        const results: QueryResult[] = [];

        const search = (obj: any, path: string) => {
            results.push({ value: obj, path });

            if (obj && typeof obj === 'object') {
                if (Array.isArray(obj)) {
                    obj.forEach((item, index) => {
                        search(item, `${path}[${index}]`);
                    });
                } else {
                    Object.entries(obj).forEach(([key, val]) => {
                        search(val, `${path}.${key}`);
                    });
                }
            }
        };

        if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    search(item, `${basePath}[${index}]`);
                });
            } else {
                Object.entries(value).forEach(([key, val]) => {
                    search(val, `${basePath}.${key}`);
                });
            }
        }

        return results;
    }

    /**
     * Evaluate filter expression
     */
    private evaluateFilter(
        value: any,
        filter: FilterExpression,
        _context: QueryContext
    ): boolean {
        const propValue = value[filter.property];

        switch (filter.operator) {
            case 'exists':
                return propValue !== undefined;

            case '==':
                return propValue == filter.value;

            case '!=':
                return propValue != filter.value;

            case '<':
                return propValue < filter.value;

            case '>':
                return propValue > filter.value;

            case '<=':
                return propValue <= filter.value;

            case '>=':
                return propValue >= filter.value;

            default:
                return false;
        }
    }

    /**
     * Validate JSONPath syntax
     */
    private isValidPath(path: string): boolean {
        // Basic validation
        if (!path || typeof path !== 'string') {
            return false;
        }

        // Must start with $ or @
        if (!path.startsWith('$') && !path.startsWith('@')) {
            return false;
        }

        // Check for balanced brackets
        let bracketCount = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < path.length; i++) {
            const char = path[i];

            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && path[i - 1] !== '\\') {
                inString = false;
            } else if (!inString) {
                if (char === '[') bracketCount++;
                else if (char === ']') bracketCount--;
            }
        }

        return bracketCount === 0 && !inString;
    }

    /**
     * Compare values for validation
     */
    private compareValues(actual: any, expected: any, options: JSONPathOptions): boolean {
        if (options.compareFunction) {
            return options.compareFunction(actual, expected);
        }

        if (options.ignoreCase && typeof actual === 'string' && typeof expected === 'string') {
            return actual.toLowerCase() === expected.toLowerCase();
        }

        if (options.partialMatch && typeof actual === 'string' && typeof expected === 'string') {
            return actual.includes(expected);
        }

        if (options.regex && typeof expected === 'string' && typeof actual === 'string') {
            return new RegExp(expected).test(actual);
        }

        if (options.deepEqual) {
            return this.deepEqual(actual, expected);
        }

        return actual === expected;
    }

    /**
     * Compare arrays for validation
     */
    private compareArrays(actual: any[], expected: any, options: JSONPathOptions): boolean {
        if (!Array.isArray(expected)) {
            return false;
        }

        if (options.arrayContains) {
            return expected.every(exp => 
                actual.some(act => this.compareValues(act, exp, options))
            );
        }

        if (options.arrayExact) {
            if (actual.length !== expected.length) {
                return false;
            }
            return actual.every((act, index) => 
                this.compareValues(act, expected[index], options)
            );
        }

        // Default: check if arrays have same elements (any order)
        if (actual.length !== expected.length) {
            return false;
        }

        const actualCopy = [...actual];
        for (const exp of expected) {
            const index = actualCopy.findIndex(act => 
                this.compareValues(act, exp, options)
            );
            if (index === -1) {
                return false;
            }
            actualCopy.splice(index, 1);
        }

        return true;
    }

    /**
     * Deep equality check
     */
    private deepEqual(a: any, b: any): boolean {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;

            if (Array.isArray(a)) {
                if (a.length !== b.length) return false;
                return a.every((item, index) => this.deepEqual(item, b[index]));
            }

            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) return false;

            return keysA.every(key => 
                keysB.includes(key) && this.deepEqual(a[key], b[key])
            );
        }

        return false;
    }

    /**
     * Get all values matching a path
     */
    public queryAll(data: any, path: string, options: JSONPathOptions = {}): any[] {
        const result = this.query(data, path, options);
        return result.values;
    }

    /**
     * Check if path exists
     */
    public pathExists(data: any, path: string): boolean {
        const result = this.query(data, path, {});
        return result.values.length > 0;
    }

    /**
     * Count matches
     */
    public countMatches(data: any, path: string): number {
        const result = this.query(data, path, {});
        return result.values.length;
    }
}

// Type definitions for internal use
interface PathToken {
    type: 'root' | 'current' | 'property' | 'wildcard' | 'recursive' | 
          'index' | 'slice' | 'union' | 'filter' | 'script';
    value: any;
}

interface QueryContext {
    root: any;
    current: any;
    options: JSONPathOptions;
}

interface QueryResult {
    value: any;
    path: string;
}

interface FilterExpression {
    property: string;
    operator: ComparisonOperator;
    value: any;
}

type ComparisonOperator = '==' | '!=' | '<' | '>' | '<=' | '>=' | 'exists';