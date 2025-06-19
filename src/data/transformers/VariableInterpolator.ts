// src/data/transformers/VariableInterpolator.ts
import { VariableSource, InterpolationResult } from './variable-interpolator.types';
import { logger } from '../../core/utils/Logger';
import { CryptoUtils } from '../../core/utils/CryptoUtils';
import * as fs from 'fs/promises';
import * as path from 'path';

// Extended interpolation options for internal use
interface ExtendedInterpolationOptions {
    startDelimiter: string;
    endDelimiter: string;
    escapeCharacter: string;
    enableEnvironmentVars: boolean;
    enableSystemVars: boolean;
    enableCustomVars: boolean;
    enableExpressions: boolean;
    enableFunctions: boolean;
    enableFileReferences: boolean;
    throwOnMissing: boolean;
    cacheResults: boolean;
    maxRecursionDepth: number;
    timeout: number;
}

/**
 * Interpolate variables in data
 * Supports multiple variable sources and complex expressions
 */
export class VariableInterpolator {
    private readonly defaultOptions: ExtendedInterpolationOptions = {
        startDelimiter: '${',
        endDelimiter: '}',
        escapeCharacter: '\\',
        enableEnvironmentVars: true,
        enableSystemVars: true,
        enableCustomVars: true,
        enableExpressions: true,
        enableFunctions: true,
        enableFileReferences: true,
        throwOnMissing: false,
        cacheResults: true,
        maxRecursionDepth: 10,
        timeout: 5000
    };

    private variableSources: Map<string, VariableSource> = new Map();
    private customVariables: Map<string, any> = new Map();
    private cache: Map<string, any> = new Map();
    private functions: Map<string, Function> = new Map();

    constructor() {
        this.initializeBuiltInFunctions();
        this.initializeSystemVariables();
    }

    /**
     * Interpolate variables in a string
     */
    async interpolate(
        input: string,
        context?: Record<string, any>,
        options?: Partial<ExtendedInterpolationOptions>
    ): Promise<InterpolationResult> {
        const opts = { ...this.defaultOptions, ...options };
        const startTime = Date.now();
        const interpolated: string[] = [];
        const missing: string[] = [];
        const errors: string[] = [];

        try {
            const result = await this.interpolateString(
                input,
                context || {},
                opts,
                0,
                interpolated,
                missing,
                errors
            );

            const executionTime = Date.now() - startTime;
            
            // Check timeout
            if (executionTime > opts.timeout!) {
                throw new Error(`Interpolation timeout exceeded: ${executionTime}ms > ${opts.timeout}ms`);
            }

            logger.debug('Variable interpolation completed:', {
                inputLength: input.length,
                variableCount: interpolated.length,
                executionTime
            });

            return {
                success: missing.length === 0 && errors.length === 0,
                result,
                interpolatedVariables: interpolated,
                missingVariables: missing,
                errors,
                executionTime
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown interpolation error';
            logger.error('Variable interpolation failed:', error as Error);

            if (opts.throwOnMissing) {
                throw error;
            }

            return {
                success: false,
                result: input,
                interpolatedVariables: interpolated,
                missingVariables: missing,
                errors: [...errors, errorMessage],
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Interpolate variables in an object
     */
    async interpolateObject(
        obj: Record<string, any>,
        context?: Record<string, any>,
        options?: Partial<ExtendedInterpolationOptions>
    ): Promise<Record<string, any>> {
        const result: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                const interpolation = await this.interpolate(value, context, options);
                result[key] = interpolation.result;
            } else if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    result[key] = await this.interpolateArray(value, context, options);
                } else {
                    result[key] = await this.interpolateObject(value, context, options);
                }
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Interpolate variables in an array
     */
    async interpolateArray(
        arr: any[],
        context?: Record<string, any>,
        options?: Partial<ExtendedInterpolationOptions>
    ): Promise<any[]> {
        const result: any[] = [];

        for (const item of arr) {
            if (typeof item === 'string') {
                const interpolation = await this.interpolate(item, context, options);
                result.push(interpolation.result);
            } else if (typeof item === 'object' && item !== null) {
                if (Array.isArray(item)) {
                    result.push(await this.interpolateArray(item, context, options));
                } else {
                    result.push(await this.interpolateObject(item, context, options));
                }
            } else {
                result.push(item);
            }
        }

        return result;
    }

    /**
     * Register custom variable source
     */
    registerVariableSource(name: string, source: VariableSource): void {
        this.variableSources.set(name, source);
        logger.debug(`Registered variable source: ${name}`);
    }

    /**
     * Set custom variables
     */
    setVariables(variables: Record<string, any>): void {
        for (const [key, value] of Object.entries(variables)) {
            this.customVariables.set(key, value);
        }
    }

    /**
     * Register custom function
     */
    registerFunction(name: string, fn: Function): void {
        this.functions.set(name, fn);
        logger.debug(`Registered function: ${name}`);
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Interpolate string recursively
     */
    private async interpolateString(
        input: string,
        context: Record<string, any>,
        options: ExtendedInterpolationOptions,
        depth: number,
        interpolated: string[],
        missing: string[],
        errors: string[]
    ): Promise<string> {
        // Check recursion depth
        if (depth > options.maxRecursionDepth!) {
            throw new Error(`Maximum recursion depth exceeded: ${depth}`);
        }

        let lastIndex = 0;
        const parts: string[] = [];

        // Find all variables
        const regex = new RegExp(
            `${this.escapeRegex(options.startDelimiter!)}([^${this.escapeRegex(options.endDelimiter!)}]+)${this.escapeRegex(options.endDelimiter!)}`,
            'g'
        );

        let match;
        while ((match = regex.exec(input)) !== null) {
            // Add text before variable
            parts.push(input.substring(lastIndex, match.index));

            const variableExpression = match[1];
            const variableStart = match.index;

            // Check if escaped
            if (variableStart > 0 && input[variableStart - 1] === options.escapeCharacter!) {
                parts.push(match[0]);
            } else {
                try {
                    // Resolve variable
                    const value = await this.resolveVariable(
                        variableExpression || '',
                        context,
                        options
                    );

                    if (value !== undefined) {
                        // Convert to string
                        const stringValue = this.valueToString(value);
                        
                        // Check if result contains more variables
                        if (this.containsVariables(stringValue, options)) {
                            parts.push(
                                await this.interpolateString(
                                    stringValue,
                                    context,
                                    options,
                                    depth + 1,
                                    interpolated,
                                    missing,
                                    errors
                                )
                            );
                        } else {
                            parts.push(stringValue);
                        }
                        
                        interpolated.push(variableExpression || '');
                    } else {
                        missing.push(variableExpression || '');
                        if (options.throwOnMissing) {
                            throw new Error(`Variable not found: ${variableExpression || 'undefined'}`);
                        }
                        parts.push(match[0]); // Keep original
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`${variableExpression || 'undefined'}: ${errorMessage}`);
                    parts.push(match[0]); // Keep original
                }
            }

            lastIndex = regex.lastIndex;
        }

        // Add remaining text
        parts.push(input.substring(lastIndex));

        return parts.join('');
    }

    /**
     * Resolve variable value
     */
    private async resolveVariable(
        expression: string,
        context: Record<string, any>,
        options: ExtendedInterpolationOptions
    ): Promise<any> {
        // Check cache
        const cacheKey = `${expression}:${JSON.stringify(context)}`;
        if (options.cacheResults && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let value: any;

        // Parse expression
        const { variable, filters, fallback } = this.parseExpression(expression);

        // Try different sources
        if (variable.startsWith('env.') && options.enableEnvironmentVars) {
            value = await this.resolveEnvironmentVariable(variable.substring(4));
        } else if (variable.startsWith('sys.') && options.enableSystemVars) {
            value = await this.resolveSystemVariable(variable.substring(4));
        } else if (variable.startsWith('file.') && options.enableFileReferences) {
            value = await this.resolveFileVariable(variable.substring(5));
        } else if (variable.startsWith('fn.') && options.enableFunctions) {
            value = await this.resolveFunctionCall(variable.substring(3), context);
        } else {
            // Try context first
            value = this.resolveFromObject(variable, context);

            // Try custom variables
            if (value === undefined && options.enableCustomVars) {
                value = this.resolveFromObject(variable, Object.fromEntries(this.customVariables));
            }

            // Try variable sources
            if (value === undefined) {
                for (const [, source] of this.variableSources) {
                    if (source.resolve) {
                        const sourceValue = await source.resolve(variable);
                        if (sourceValue !== undefined) {
                            value = sourceValue;
                            break;
                        }
                    }
                }
            }
        }

        // Apply fallback
        if (value === undefined && fallback !== undefined) {
            value = fallback;
        }

        // Apply filters
        if (value !== undefined && filters.length > 0) {
            value = await this.applyFilters(value, filters, context);
        }

        // Cache result
        if (options.cacheResults && value !== undefined) {
            this.cache.set(cacheKey, value);
        }

        return value;
    }

    /**
     * Parse variable expression
     */
    private parseExpression(expression: string): {
        variable: string;
        filters: string[];
        fallback?: string;
    } {
        // Check for fallback
        const fallbackMatch = expression.match(/^(.+?)\s*\|\|\s*(.+)$/);
        let mainExpression = expression;
        let fallback: string | undefined;

        if (fallbackMatch && fallbackMatch[1] && fallbackMatch[2]) {
            mainExpression = fallbackMatch[1].trim();
            fallback = fallbackMatch[2].trim();
            // Remove quotes from fallback
            if ((fallback.startsWith('"') && fallback.endsWith('"')) ||
                (fallback.startsWith("'") && fallback.endsWith("'"))) {
                fallback = fallback.slice(1, -1);
            }
        }

        // Check for filters
        const parts = mainExpression.split('|').map(p => p.trim());
        const variable = parts[0];
        const filters = parts.slice(1);

        const result: { variable: string; filters: string[]; fallback?: string } = { 
            variable: variable || '', 
            filters 
        };
        if (fallback !== undefined) {
            result.fallback = fallback;
        }
        return result;
    }

    /**
     * Resolve from object using dot notation
     */
    private resolveFromObject(path: string, obj: Record<string, any>): any {
        const parts = path.split('.');
        let current: any = obj;

        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }

            // Handle array index
            const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
            if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
                current = current[arrayMatch[1]];
                if (Array.isArray(current)) {
                    current = current[parseInt(arrayMatch[2])];
                } else {
                    return undefined;
                }
            } else {
                current = current[part];
            }
        }

        return current;
    }

    /**
     * Resolve environment variable
     */
    private async resolveEnvironmentVariable(name: string): Promise<any> {
        return process.env[name];
    }

    /**
     * Resolve system variable
     */
    private async resolveSystemVariable(name: string): Promise<any> {
        const systemVars: Record<string, any> = {
            timestamp: Date.now(),
            date: new Date().toISOString().split('T')[0],
            time: new Date().toTimeString().split(' ')[0],
            datetime: new Date().toISOString(),
            random: Math.random(),
            uuid: CryptoUtils.randomUUID(),
            pid: process.pid,
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            cwd: process.cwd(),
            user: process.env['USER'] || process.env['USERNAME'],
            hostname: process.env['HOSTNAME'] || process.env['COMPUTERNAME']
        };

        return systemVars[name];
    }

    /**
     * Resolve file variable
     */
    private async resolveFileVariable(filePath: string): Promise<any> {
        try {
            const resolvedPath = path.resolve(filePath);
            const content = await fs.readFile(resolvedPath, 'utf-8');
            
            // Try to parse as JSON
            try {
                return JSON.parse(content);
            } catch {
                return content;
            }
        } catch (error) {
            logger.error(`Failed to read file: ${filePath}`, error as Error);
            return undefined;
        }
    }

    /**
     * Resolve function call
     */
    private async resolveFunctionCall(expression: string, context: Record<string, any>): Promise<any> {
        const match = expression.match(/^(\w+)\((.*)\)$/);
        if (!match) {
            throw new Error(`Invalid function call: ${expression}`);
        }

        const functionName = match[1] || '';
        const argsString = match[2] || '';

        const fn = this.functions.get(functionName);
        if (!fn) {
            throw new Error(`Function not found: ${functionName}`);
        }

        // Parse arguments
        const args = this.parseFunctionArguments(argsString, context);

        // Execute function
        return await fn(...args);
    }

    /**
     * Parse function arguments
     */
    private parseFunctionArguments(argsString: string, context: Record<string, any>): any[] {
        if (!argsString.trim()) {
            return [];
        }

        const args: any[] = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        let depth = 0;

        for (let i = 0; i < argsString.length; i++) {
            const char = argsString[i];

            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (inQuotes && char === quoteChar && argsString[i - 1] !== '\\') {
                inQuotes = false;
                current += char;
            } else if (!inQuotes && char === '(') {
                depth++;
                current += char;
            } else if (!inQuotes && char === ')') {
                depth--;
                current += char;
            } else if (!inQuotes && depth === 0 && char === ',') {
                args.push(this.parseArgument(current.trim(), context));
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(this.parseArgument(current.trim(), context));
        }

        return args;
    }

    /**
     * Parse single argument
     */
    private parseArgument(arg: string, context: Record<string, any>): any {
        // String literal
        if ((arg.startsWith('"') && arg.endsWith('"')) ||
            (arg.startsWith("'") && arg.endsWith("'"))) {
            return arg.slice(1, -1);
        }

        // Number
        if (/^-?\d+(\.\d+)?$/.test(arg)) {
            return parseFloat(arg);
        }

        // Boolean
        if (arg === 'true') return true;
        if (arg === 'false') return false;

        // Null
        if (arg === 'null') return null;

        // Variable reference
        return this.resolveFromObject(arg, context);
    }

    /**
     * Apply filters to value
     */
    private async applyFilters(value: any, filters: string[], context: Record<string, any>): Promise<any> {
        let result = value;

        for (const filter of filters) {
            const parts = filter.split(':').map(s => s.trim());
            const filterName = parts[0] || '';
            const args = parts.slice(1);
            result = await this.applyFilter(result, filterName, args, context);
        }

        return result;
    }

    /**
     * Apply single filter
     */
    private async applyFilter(
        value: any,
        filterName: string,
        args: string[],
        _context: Record<string, any>
    ): Promise<any> {
        switch (filterName) {
            // String filters
            case 'upper':
                return String(value).toUpperCase();
            case 'lower':
                return String(value).toLowerCase();
            case 'trim':
                return String(value).trim();
            case 'capitalize':
                return String(value).charAt(0).toUpperCase() + String(value).slice(1);
            case 'replace':
                return String(value).replace(args[0] || '', args[1] || '');
            case 'substring':
                if (args[1]) {
                    return String(value).substring(parseInt(args[0] || '0'), parseInt(args[1]));
                } else {
                    return String(value).substring(parseInt(args[0] || '0'));
                }
            case 'padStart':
                return String(value).padStart(parseInt(args[0] || '0'), args[1] || ' ');
            case 'padEnd':
                return String(value).padEnd(parseInt(args[0] || '0'), args[1] || ' ');

            // Number filters
            case 'round':
                return Math.round(Number(value));
            case 'floor':
                return Math.floor(Number(value));
            case 'ceil':
                return Math.ceil(Number(value));
            case 'abs':
                return Math.abs(Number(value));
            case 'toFixed':
                return Number(value).toFixed(parseInt(args[0] || '2'));

            // Date filters
            case 'date':
                return new Date(value).toLocaleDateString();
            case 'time':
                return new Date(value).toLocaleTimeString();
            case 'iso':
                return new Date(value).toISOString();
            case 'timestamp':
                return new Date(value).getTime();

            // Array filters
            case 'join':
                return Array.isArray(value) ? value.join(args[0] || ',') : value;
            case 'first':
                return Array.isArray(value) ? value[0] : value;
            case 'last':
                return Array.isArray(value) ? value[value.length - 1] : value;
            case 'length':
                return Array.isArray(value) ? value.length : String(value).length;

            // JSON filters
            case 'json':
                return JSON.stringify(value);
            case 'pretty':
                return JSON.stringify(value, null, 2);

            // Custom filter
            default:
                const customFilter = this.functions.get(`filter_${filterName}`);
                if (customFilter) {
                    return await customFilter(value, ...args);
                }
                throw new Error(`Unknown filter: ${filterName}`);
        }
    }

    /**
     * Check if string contains variables
     */
    private containsVariables(str: string, options: ExtendedInterpolationOptions): boolean {
        const regex = new RegExp(
            `${this.escapeRegex(options.startDelimiter!)}[^${this.escapeRegex(options.endDelimiter!)}]+${this.escapeRegex(options.endDelimiter!)}`
        );
        return regex.test(str);
    }

    /**
     * Convert value to string
     */
    private valueToString(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    }

    /**
     * Escape regex special characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Initialize built-in functions
     */
    private initializeBuiltInFunctions(): void {
        // Math functions
        this.functions.set('add', (a: number, b: number) => a + b);
        this.functions.set('subtract', (a: number, b: number) => a - b);
        this.functions.set('multiply', (a: number, b: number) => a * b);
        this.functions.set('divide', (a: number, b: number) => a / b);
        this.functions.set('mod', (a: number, b: number) => a % b);
        this.functions.set('pow', (a: number, b: number) => Math.pow(a, b));
        this.functions.set('sqrt', (n: number) => Math.sqrt(n));
        this.functions.set('random', (min = 0, max = 1) => Math.random() * (max - min) + min);

        // String functions
        this.functions.set('concat', (...args: any[]) => args.join(''));
        this.functions.set('format', (template: string, ...args: any[]) => {
            return template.replace(/{(\d+)}/g, (match, index) => args[index] || match);
        });

        // Date functions
        this.functions.set('now', () => new Date());
        this.functions.set('today', () => new Date().toISOString().split('T')[0]);
        this.functions.set('addDays', (date: Date | string, days: number) => {
            const d = new Date(date);
            d.setDate(d.getDate() + days);
            return d;
        });

        // Utility functions
        this.functions.set('uuid', () => CryptoUtils.randomUUID());
        this.functions.set('hash', (value: string, algorithm = 'sha256') => 
            CryptoUtils.hash(value, { algorithm })
        );
        this.functions.set('encode', (value: string, encoding = 'base64') => 
            Buffer.from(value).toString(encoding as BufferEncoding)
        );
        this.functions.set('decode', (value: string, encoding = 'base64') => 
            Buffer.from(value, encoding as BufferEncoding).toString()
        );
    }

    /**
     * Initialize system variables
     */
    private initializeSystemVariables(): void {
        // Register system variable source
        this.registerVariableSource('system', {
            name: 'system',
            resolve: async (variable: string) => {
                return this.resolveSystemVariable(variable);
            }
        });

        // Register environment variable source
        this.registerVariableSource('env', {
            name: 'environment',
            resolve: async (variable: string) => {
                return process.env[variable];
            }
        });
    }
}