import { TemplateContext, PlaceholderOptions, CustomResolver } from '../types/api.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Resolve template placeholders with support for nested properties,
 * transformations, default values, and custom resolvers
 */
export class PlaceholderResolver {
    private static instance: PlaceholderResolver;
    private customResolvers: Map<string, CustomResolver> = new Map();
    private transformers: Map<string, (value: any, args?: any) => any> = new Map();
    private resolverCache: Map<string, any> = new Map();

    private constructor() {
        this.registerBuiltInTransformers();
    }

    public static getInstance(): PlaceholderResolver {
        if (!PlaceholderResolver.instance) {
            PlaceholderResolver.instance = new PlaceholderResolver();
        }
        return PlaceholderResolver.instance;
    }

    /**
     * Resolve all placeholders in template
     */
    public resolve(
        template: string,
        context: TemplateContext,
        options: PlaceholderOptions = {}
    ): string {
        try {
            // Pattern matches: {{variable}}, {{variable|transformer}}, {{variable|transformer:arg}}, {{variable|default:value}}
            const placeholderPattern = /\{\{([^}]+)\}\}/g;
            
            return template.replace(placeholderPattern, (match, expression) => {
                try {
                    return this.resolvePlaceholder(expression.trim(), context, options);
                } catch (error) {
                    ActionLogger.getInstance().warn(`Failed to resolve placeholder: ${expression}`, { error: (error as Error).message });
                    
                    if (options.throwOnError) {
                        throw error;
                    }
                    
                    return options.keepUnresolved ? match : options.defaultValue || '';
                }
            });
        } catch (error) {
            ActionLogger.getInstance().logError(error as Error, 'Placeholder resolution failed');
            throw error;
        }
    }

    /**
     * Resolve single placeholder expression
     */
    private resolvePlaceholder(
        expression: string,
        context: TemplateContext,
        options: PlaceholderOptions
    ): string {
        // Check cache if enabled
        const cacheKey = `${expression}:${JSON.stringify(context)}`;
        if (options.useCache && this.resolverCache.has(cacheKey)) {
            return this.resolverCache.get(cacheKey);
        }

        // Parse expression
        const parts = this.parseExpression(expression);
        let value: any;

        // Check for custom resolver
        if (parts.path.startsWith('@')) {
            const resolverName = parts.path.substring(1);
            const resolver = this.customResolvers.get(resolverName);
            
            if (resolver) {
                value = resolver(context, parts.args);
            } else {
                throw new Error(`Unknown custom resolver: ${resolverName}`);
            }
        } else {
            // Standard property resolution
            value = this.resolveProperty(parts.path, context);
        }

        // Apply transformers
        for (const transformer of parts.transformers) {
            value = this.applyTransformer(value, transformer.name, transformer.args);
        }

        // Handle default value
        if ((value === undefined || value === null || value === '') && parts.defaultValue !== undefined) {
            value = parts.defaultValue;
        }

        // Convert to string
        const result = this.valueToString(value, options);

        // Cache result if enabled
        if (options.useCache) {
            this.resolverCache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * Parse placeholder expression
     */
    private parseExpression(expression: string): ParsedExpression {
        const parts: ParsedExpression = {
            path: '',
            transformers: [],
            args: []
        };

        // Split by pipe for transformers
        const segments = this.splitByPipe(expression);
        
        // First segment is the variable path
        const firstSegment = segments[0]?.trim() || '';
        
        // Check if path has arguments (for custom resolvers)
        const argMatch = firstSegment.match(/^([^(]+)\(([^)]*)\)$/);
        if (argMatch && argMatch[1] && argMatch[2] !== undefined) {
            parts.path = argMatch[1].trim();
            parts.args = this.parseArguments(argMatch[2]);
        } else {
            parts.path = firstSegment;
        }

        // Process remaining segments as transformers or default
        for (let i = 1; i < segments.length; i++) {
            const segment = segments[i]?.trim() || '';
            
            if (segment.startsWith('default:')) {
                parts.defaultValue = segment.substring(8);
            } else {
                const colonIndex = segment.indexOf(':');
                if (colonIndex > 0) {
                    parts.transformers.push({
                        name: segment.substring(0, colonIndex),
                        args: segment.substring(colonIndex + 1)
                    });
                } else {
                    parts.transformers.push({
                        name: segment,
                        args: ''
                    });
                }
            }
        }

        return parts;
    }

    /**
     * Split expression by pipe, respecting quotes
     */
    private splitByPipe(expression: string): string[] {
        const segments: string[] = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        let escapeNext = false;

        for (let i = 0; i < expression.length; i++) {
            const char = expression[i];

            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                current += char;
            } else if (char === '|' && !inQuotes) {
                segments.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        if (current) {
            segments.push(current);
        }

        return segments;
    }

    /**
     * Parse function arguments
     */
    private parseArguments(argsString: string): string[] {
        if (!argsString.trim()) return [];

        const args: string[] = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        let depth = 0;

        for (let i = 0; i < argsString.length; i++) {
            const char = argsString[i];

            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
            } else if (inQuotes && char === quoteChar && argsString[i - 1] !== '\\') {
                inQuotes = false;
            } else if (!inQuotes && char === '(') {
                depth++;
            } else if (!inQuotes && char === ')') {
                depth--;
            } else if (!inQuotes && char === ',' && depth === 0) {
                args.push(current.trim());
                current = '';
                continue;
            }

            current += char;
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }

    /**
     * Resolve property from context
     */
    private resolveProperty(path: string, context: TemplateContext): any {
        // Handle array notation
        const arrayPattern = /^(.+?)\[(\d+)\](.*)$/;
        const match = path.match(arrayPattern);
        
        if (match && match[1] && match[2]) {
            const [, basePath, indexStr, remainingPath] = match;
            const index = parseInt(indexStr || '0');
            const baseValue = this.resolveProperty(basePath, context);
            
            if (Array.isArray(baseValue) && index >= 0 && index < baseValue.length) {
                const arrayValue = baseValue[index];
                if (remainingPath) {
                    // Continue resolving remaining path
                    return this.resolveProperty(remainingPath.substring(1), arrayValue);
                }
                return arrayValue;
            }
            return undefined;
        }

        // Handle dot notation
        const parts = path.split('.');
        let value: any = context;

        for (const part of parts) {
            if (value === null || value === undefined) {
                return undefined;
            }

            // Handle computed property access
            if (part.includes('[') && part.includes(']')) {
                const propMatch = part.match(/^(\w+)\[['"]([^'"]+)['"]\]$/);
                if (propMatch && propMatch[1] && propMatch[2]) {
                    const [, prop, key] = propMatch;
                    if (value && typeof value === 'object') {
                        value = value[prop];
                        if (value && typeof value === 'object') {
                            value = value[key];
                        }
                    }
                } else if (value && typeof value === 'object') {
                    value = value[part];
                }
            } else if (value && typeof value === 'object') {
                value = value[part];
            }
        }

        return value;
    }

    /**
     * Apply transformer to value
     */
    private applyTransformer(value: any, transformerName: string, args: string): any {
        const transformer = this.transformers.get(transformerName);
        
        if (!transformer) {
            throw new Error(`Unknown transformer: ${transformerName}`);
        }

        try {
            return transformer(value, args);
        } catch (error) {
            throw new Error(`Transformer '${transformerName}' failed: ${(error as Error).message}`);
        }
    }

    /**
     * Convert value to string
     */
    private valueToString(value: any, options: PlaceholderOptions): string {
        if (value === null) {
            return options.nullValue || 'null';
        }

        if (value === undefined) {
            return options.undefinedValue || '';
        }

        if (typeof value === 'object') {
            if (options.stringifyObjects) {
                return JSON.stringify(value, null, options.jsonIndent);
            }
            return value.toString();
        }

        return String(value);
    }

    /**
     * Register built-in transformers
     */
    private registerBuiltInTransformers(): void {
        // String transformers
        this.registerTransformer('upper', (value, _args) => {
            return String(value || '').toUpperCase();
        });

        this.registerTransformer('lower', (value, _args) => {
            return String(value || '').toLowerCase();
        });

        this.registerTransformer('capitalize', (value, _args) => {
            const str = String(value || '');
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        });

        this.registerTransformer('camelCase', (value, _args) => {
            return String(value || '')
                .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
        });

        this.registerTransformer('snakeCase', (value, _args) => {
            return String(value || '')
                .replace(/([A-Z])/g, '_$1')
                .replace(/[-\s]+/g, '_')
                .toLowerCase()
                .replace(/^_/, '');
        });

        this.registerTransformer('kebabCase', (value, _args) => {
            return String(value || '')
                .replace(/([A-Z])/g, '-$1')
                .replace(/[\s_]+/g, '-')
                .toLowerCase()
                .replace(/^-/, '');
        });

        this.registerTransformer('trim', (value, _args) => {
            return String(value || '').trim();
        });

        this.registerTransformer('ltrim', (value, _args) => {
            return String(value || '').trimStart();
        });

        this.registerTransformer('rtrim', (value, _args) => {
            return String(value || '').trimEnd();
        });

        this.registerTransformer('pad', (value, args) => {
            if (!args) return String(value || '');
            const [lengthStr, padChar = ' '] = args.split(',');
            const length = parseInt(lengthStr || '0') || 0;
            return String(value || '').padEnd(length, padChar);
        });

        this.registerTransformer('padLeft', (value, args) => {
            if (!args) return String(value || '');
            const [lengthStr, padChar = ' '] = args.split(',');
            const length = parseInt(lengthStr || '0') || 0;
            return String(value || '').padStart(length, padChar);
        });

        this.registerTransformer('truncate', (value, args) => {
            const length = parseInt(args || '50') || 50;
            const str = String(value || '');
            return str.length > length ? str.substring(0, length) + '...' : str;
        });

        this.registerTransformer('replace', (value, args) => {
            if (!args) return String(value || '');
            const [search, replace = ''] = args.split(',').map(s => s.trim());
            return String(value || '').split(search || '').join(replace);
        });

        this.registerTransformer('substring', (value, args) => {
            if (!args) return String(value || '');
            const [start, end] = args.split(',').map(n => parseInt(n.trim()));
            return String(value || '').substring(start || 0, end);
        });

        this.registerTransformer('split', (value, args) => {
            const separator = args || ',';
            return String(value || '').split(separator);
        });

        // Number transformers
        this.registerTransformer('int', (value, _args) => {
            return parseInt(value) || 0;
        });

        this.registerTransformer('float', (value, _args) => {
            return parseFloat(value) || 0;
        });

        this.registerTransformer('round', (value, args) => {
            const decimals = parseInt(args || '0') || 0;
            const num = parseFloat(value) || 0;
            return parseFloat(num.toFixed(decimals));
        });

        this.registerTransformer('floor', (value, _args) => {
            return Math.floor(parseFloat(value) || 0);
        });

        this.registerTransformer('ceil', (value, _args) => {
            return Math.ceil(parseFloat(value) || 0);
        });

        this.registerTransformer('abs', (value, _args) => {
            return Math.abs(parseFloat(value) || 0);
        });

        this.registerTransformer('formatNumber', (value, args) => {
            if (!args) {
                const num = parseFloat(value) || 0;
                return num.toFixed(2);
            }
            const [decimals = '2', thousandsSep = ',', decimalSep = '.'] = args.split(',');
            const num = parseFloat(value) || 0;
            const parts = num.toFixed(parseInt(decimals)).split('.');
            if (parts[0]) {
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
            }
            return parts.join(decimalSep);
        });

        // Date transformers
        this.registerTransformer('date', (value, args) => {
            const format = args || 'YYYY-MM-DD';
            const date = value ? new Date(value) : new Date();
            return this.formatDate(date, format);
        });

        this.registerTransformer('timestamp', (value, _args) => {
            const date = value ? new Date(value) : new Date();
            return date.getTime();
        });

        this.registerTransformer('ago', (value, _args) => {
            const date = new Date(value);
            const now = new Date();
            const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

            if (seconds < 60) return `${seconds} seconds ago`;
            if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
            if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
            return `${Math.floor(seconds / 86400)} days ago`;
        });

        // Array transformers
        this.registerTransformer('join', (value, args) => {
            const separator = args || ',';
            return Array.isArray(value) ? value.join(separator) : String(value || '');
        });

        this.registerTransformer('first', (value, _args) => {
            return Array.isArray(value) ? value[0] : value;
        });

        this.registerTransformer('last', (value, _args) => {
            return Array.isArray(value) ? value[value.length - 1] : value;
        });

        this.registerTransformer('reverse', (value, _args) => {
            if (Array.isArray(value)) return value.slice().reverse();
            if (typeof value === 'string') return value.split('').reverse().join('');
            return value;
        });

        this.registerTransformer('sort', (value, args) => {
            if (!Array.isArray(value)) return value;
            
            const direction = args || 'asc';
            const sorted = value.slice().sort();
            
            return direction === 'desc' ? sorted.reverse() : sorted;
        });

        this.registerTransformer('unique', (value, _args) => {
            return Array.isArray(value) ? [...new Set(value)] : value;
        });

        this.registerTransformer('count', (value, _args) => {
            if (Array.isArray(value)) return value.length;
            if (typeof value === 'string') return value.length;
            if (value && typeof value === 'object') return Object.keys(value).length;
            return 0;
        });

        // Boolean transformers
        this.registerTransformer('bool', (value, _args) => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') {
                return value.toLowerCase() === 'true' || value === '1';
            }
            return Boolean(value);
        });

        this.registerTransformer('not', (value, _args) => {
            return !value;
        });

        // Encoding transformers
        this.registerTransformer('base64', (value, _args) => {
            return Buffer.from(String(value || '')).toString('base64');
        });

        this.registerTransformer('base64decode', (value, _args) => {
            return Buffer.from(String(value || ''), 'base64').toString('utf8');
        });

        this.registerTransformer('url', (value, _args) => {
            return encodeURIComponent(String(value || ''));
        });

        this.registerTransformer('urldecode', (value, _args) => {
            return decodeURIComponent(String(value || ''));
        });

        this.registerTransformer('html', (value, _args) => {
            const str = String(value || '');
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        });

        this.registerTransformer('json', (value, _args) => {
            return JSON.stringify(value);
        });

        this.registerTransformer('jsonparse', (value, _args) => {
            try {
                return JSON.parse(String(value || '{}'));
            } catch {
                return value;
            }
        });

        // Hash transformers
        this.registerTransformer('md5', (value, _args) => {
            const crypto = require('crypto');
            return crypto.createHash('md5').update(String(value || '')).digest('hex');
        });

        this.registerTransformer('sha1', (value, _args) => {
            const crypto = require('crypto');
            return crypto.createHash('sha1').update(String(value || '')).digest('hex');
        });

        this.registerTransformer('sha256', (value, _args) => {
            const crypto = require('crypto');
            return crypto.createHash('sha256').update(String(value || '')).digest('hex');
        });

        // Type checking transformers
        this.registerTransformer('type', (value, _args) => {
            if (value === null) return 'null';
            if (Array.isArray(value)) return 'array';
            return typeof value;
        });

        this.registerTransformer('isEmpty', (value, _args) => {
            if (value === null || value === undefined) return true;
            if (typeof value === 'string') return value.length === 0;
            if (Array.isArray(value)) return value.length === 0;
            if (typeof value === 'object') return Object.keys(value).length === 0;
            return false;
        });

        // Object transformers
        this.registerTransformer('keys', (value, _args) => {
            return value && typeof value === 'object' ? Object.keys(value) : [];
        });

        this.registerTransformer('values', (value, _args) => {
            return value && typeof value === 'object' ? Object.values(value) : [];
        });

        this.registerTransformer('entries', (value, _args) => {
            return value && typeof value === 'object' ? Object.entries(value) : [];
        });
    }

    /**
     * Register custom transformer
     */
    public registerTransformer(name: string, transformer: (value: any, args?: string) => any): void {
        this.transformers.set(name, transformer);
        ActionLogger.getInstance().debug(`Registered transformer: ${name}`);
    }

    /**
     * Register custom resolver
     */
    public registerCustomResolver(name: string, resolver: CustomResolver): void {
        this.customResolvers.set(name, resolver);
        ActionLogger.getInstance().debug(`Registered custom resolver: @${name}`);
    }

    /**
     * Format date helper
     */
    private formatDate(date: Date, format: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        return format
            .replace('YYYY', String(year))
            .replace('YY', String(year).slice(-2))
            .replace('MM', month)
            .replace('M', String(date.getMonth() + 1))
            .replace('MMM', monthNames[date.getMonth()] || 'Jan')
            .replace('DD', day)
            .replace('D', String(date.getDate()))
            .replace('DDD', dayNames[date.getDay()] || 'Sun')
            .replace('HH', hours)
            .replace('H', String(date.getHours()))
            .replace('hh', String(date.getHours() % 12 || 12).padStart(2, '0'))
            .replace('h', String(date.getHours() % 12 || 12))
            .replace('mm', minutes)
            .replace('m', String(date.getMinutes()))
            .replace('ss', seconds)
            .replace('s', String(date.getSeconds()))
            .replace('SSS', milliseconds)
            .replace('A', date.getHours() >= 12 ? 'PM' : 'AM')
            .replace('a', date.getHours() >= 12 ? 'pm' : 'am');
    }

    /**
     * Clear resolver cache
     */
    public clearCache(): void {
        this.resolverCache.clear();
        ActionLogger.getInstance().debug('Placeholder resolver cache cleared');
    }

    /**
     * Get transformer names
     */
    public getTransformerNames(): string[] {
        return Array.from(this.transformers.keys());
    }

    /**
     * Get custom resolver names
     */
    public getCustomResolverNames(): string[] {
        return Array.from(this.customResolvers.keys());
    }
}

// Type definitions
interface ParsedExpression {
    path: string;
    transformers: Array<{ name: string; args: string }>;
    defaultValue?: string | undefined;
    args: string[];
}