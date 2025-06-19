import { TemplateOptions, TemplateContext, TemplateFunction } from '../types/api.types';
import { PlaceholderResolver } from './PlaceholderResolver';
import { TemplateCache } from './TemplateCache';
import { FileUtils } from '../../core/utils/FileUtils';
import { ActionLogger } from '../../core/logging/ActionLogger';

/**
 * Request template engine for processing dynamic request templates
 * Supports variables, functions, conditionals, and loops
 */
export class RequestTemplateEngine {
    private static instance: RequestTemplateEngine;
    private placeholderResolver: PlaceholderResolver;
    private templateCache: TemplateCache;
    private customFunctions: Map<string, TemplateFunction> = new Map();
    private globalContext: TemplateContext = {};

    private constructor() {
        this.placeholderResolver = PlaceholderResolver.getInstance();
        this.templateCache = TemplateCache.getInstance();
        this.registerBuiltInFunctions();
    }

    public static getInstance(): RequestTemplateEngine {
        if (!RequestTemplateEngine.instance) {
            RequestTemplateEngine.instance = new RequestTemplateEngine();
        }
        return RequestTemplateEngine.instance;
    }

    /**
     * Process template with given context
     */
    public async processTemplate(
        template: string,
        context: TemplateContext = {},
        options: TemplateOptions = {}
    ): Promise<string> {
        const startTime = Date.now();

        try {
            ActionLogger.getInstance().debug('Processing template', {
                templateLength: template.length,
                contextKeys: Object.keys(context)
            });

            // Merge contexts
            const fullContext = this.mergeContexts(this.globalContext, context);

            // Check cache if enabled
            const cacheKey = this.generateCacheKey(template, fullContext);
            if (options.useCache !== false) {
                const cached = this.templateCache.get(cacheKey);
                if (cached) {
                    ActionLogger.getInstance().debug(`Template retrieved from cache: ${cacheKey}`);
                    return cached;
                }
            }

            // Process template
            let result = template;

            // Process includes first
            result = await this.processIncludes(result, fullContext, options);

            // Process conditionals
            result = this.processConditionals(result, fullContext);

            // Process loops
            result = this.processLoops(result, fullContext);

            // Process functions
            result = await this.processFunctions(result, fullContext);

            // Process variables (placeholders)
            result = await this.placeholderResolver.resolve(result, fullContext);

            // Post-process
            if (options.trimWhitespace) {
                result = this.trimWhitespace(result);
            }

            if (options.format === 'json') {
                result = this.formatJSON(result);
            } else if (options.format === 'xml') {
                result = this.formatXML(result);
            }

            // Cache result if enabled
            if (options.useCache !== false) {
                this.templateCache.set(cacheKey, result, options.cacheTTL);
            }

            ActionLogger.getInstance().debug('Template processed successfully', {
                duration: Date.now() - startTime,
                resultLength: result.length
            });

            return result;

        } catch (error) {
            ActionLogger.getInstance().logError(error as Error, 'Template processing failed');
            throw new Error(`Template processing error: ${(error as Error).message}`);
        }
    }

    /**
     * Load and process template from file
     */
    public async loadTemplate(
        filePath: string,
        context: TemplateContext = {},
        options: TemplateOptions = {}
    ): Promise<string> {
        try {
            ActionLogger.getInstance().debug(`Loading template from: ${filePath}`);

            // Check cache for loaded template
            const cacheKey = `file:${filePath}`;
            let template = this.templateCache.get(cacheKey);

            if (!template) {
                const fileContent = await FileUtils.readFile(filePath);
                template = typeof fileContent === 'string' ? fileContent : fileContent.toString();
                this.templateCache.set(cacheKey, template, 300000); // Cache for 5 minutes
            }

            return await this.processTemplate(template, context, options);

        } catch (error) {
            throw new Error(`Failed to load template from ${filePath}: ${(error as Error).message}`);
        }
    }

    /**
     * Process includes in template
     */
    private async processIncludes(
        template: string,
        context: TemplateContext,
        options: TemplateOptions
    ): Promise<string> {
        const includePattern = /\{\{\s*include\s+['"]([^'"]+)['"]\s*\}\}/g;
        const matches = Array.from(template.matchAll(includePattern));

        for (const match of matches) {
            const [fullMatch, filePath] = match;
            
            try {
                const includedContent = await this.loadTemplate(filePath || '', context, {
                    ...options,
                    useCache: true // Always cache includes
                });
                
                template = template.replace(fullMatch, includedContent);
            } catch (error) {
                ActionLogger.getInstance().warn(`Failed to include template: ${filePath}`, { error: (error as Error).message });
                if (!options.ignoreIncludeErrors) {
                    throw error;
                }
                template = template.replace(fullMatch, `<!-- Include error: ${filePath} -->`);
            }
        }

        return template;
    }

    /**
     * Process conditional blocks
     */
    private processConditionals(template: string, context: TemplateContext): string {
        // Process if-else blocks
        const ifPattern = /\{\{\s*#if\s+(.+?)\s*\}\}([\s\S]*?)(?:\{\{\s*#else\s*\}\}([\s\S]*?))?\{\{\s*\/if\s*\}\}/g;

        return template.replace(ifPattern, (match, condition, ifContent, elseContent = '') => {
            try {
                const result = this.evaluateCondition(condition, context);
                return result ? ifContent : elseContent;
            } catch (error) {
                ActionLogger.getInstance().warn(`Failed to evaluate condition: ${condition}`, { error: (error as Error).message });
                return match; // Return original if evaluation fails
            }
        });
    }

    /**
     * Process loops
     */
    private processLoops(template: string, context: TemplateContext): string {
        // Process for-each loops
        const forEachPattern = /\{\{\s*#each\s+(\w+)\s+in\s+(.+?)\s*\}\}([\s\S]*?)\{\{\s*\/each\s*\}\}/g;

        return template.replace(forEachPattern, (match, itemName, arrayExpression, loopContent) => {
            try {
                const array = this.evaluateExpression(arrayExpression, context);
                
                if (!Array.isArray(array)) {
                    throw new Error(`Expression '${arrayExpression}' is not an array`);
                }

                return array.map((item, index) => {
                    const loopContext = {
                        ...context,
                        [itemName]: item,
                        [`${itemName}Index`]: index,
                        [`${itemName}Count`]: array.length,
                        [`${itemName}First`]: index === 0,
                        [`${itemName}Last`]: index === array.length - 1
                    };

                    // Process nested templates
                    let result = loopContent;
                    result = this.processConditionals(result, loopContext);
                    result = this.processLoops(result, loopContext); // Allow nested loops
                    result = this.placeholderResolver.resolve(result, loopContext);
                    
                    return result;
                }).join('');

            } catch (error) {
                ActionLogger.getInstance().warn(`Failed to process loop: ${arrayExpression}`, { error: (error as Error).message });
                return match; // Return original if processing fails
            }
        });
    }

    /**
     * Process function calls
     */
    private async processFunctions(template: string, context: TemplateContext): Promise<string> {
        // Process function calls: {{functionName(arg1, arg2)}}
        const functionPattern = /\{\{\s*(\w+)\s*\((.*?)\)\s*\}\}/g;

        const matches = Array.from(template.matchAll(functionPattern));
        
        for (const match of matches) {
            const [fullMatch, functionName, argsString] = match;
            
            try {
                const args = this.parseArguments(argsString || '', context);
                const result = await this.executeFunction(functionName || '', args, context);
                template = template.replace(fullMatch, String(result));
            } catch (error) {
                ActionLogger.getInstance().warn(`Failed to execute function: ${functionName}`, { error: (error as Error).message });
                template = template.replace(fullMatch, `{{ERROR: ${functionName}}}`);
            }
        }

        return template;
    }

    /**
     * Parse function arguments
     */
    private parseArguments(argsString: string, context: TemplateContext): any[] {
        if (!argsString.trim()) return [];

        const args: any[] = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        let depth = 0;

        for (let i = 0; i < argsString.length; i++) {
            const char = argsString[i];

            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
                current += char;
            } else if (inString && char === stringChar && argsString[i - 1] !== '\\') {
                inString = false;
                current += char;
            } else if (!inString && char === '(') {
                depth++;
                current += char;
            } else if (!inString && char === ')') {
                depth--;
                current += char;
            } else if (!inString && char === ',' && depth === 0) {
                args.push(this.evaluateArgument(current.trim(), context));
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(this.evaluateArgument(current.trim(), context));
        }

        return args;
    }

    /**
     * Evaluate single argument
     */
    private evaluateArgument(arg: string, context: TemplateContext): any {
        // String literal
        if ((arg.startsWith('"') && arg.endsWith('"')) || 
            (arg.startsWith("'") && arg.endsWith("'"))) {
            return arg.slice(1, -1).replace(/\\(.)/g, '$1');
        }

        // Number literal
        if (/^-?\d+(\.\d+)?$/.test(arg)) {
            return parseFloat(arg);
        }

        // Boolean literal
        if (arg === 'true') return true;
        if (arg === 'false') return false;

        // Null literal
        if (arg === 'null') return null;

        // Variable reference
        return this.evaluateExpression(arg, context);
    }

    /**
     * Execute template function
     */
    private async executeFunction(
        name: string, 
        args: any[], 
        context: TemplateContext
    ): Promise<any> {
        const func = this.customFunctions.get(name);
        
        if (!func) {
            throw new Error(`Unknown function: ${name}`);
        }

        return await func(args, context);
    }

    /**
     * Evaluate condition expression
     */
    private evaluateCondition(condition: string, context: TemplateContext): boolean {
        try {
            // Parse condition
            const tokens = this.tokenizeExpression(condition);
            return this.evaluateTokens(tokens, context) as boolean;
        } catch (error) {
            throw new Error(`Invalid condition: ${condition} - ${(error as Error).message}`);
        }
    }

    /**
     * Evaluate expression
     */
    private evaluateExpression(expression: string, context: TemplateContext): any {
        // Handle dot notation for nested properties
        const parts = expression.split('.');
        let value: any = context;

        for (const part of parts) {
            // Handle array indexing
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
                const [, prop, index] = arrayMatch;
                if (prop && value && typeof value === 'object') {
                    value = value[prop];
                    if (Array.isArray(value) && index) {
                        value = value[parseInt(index)];
                    } else {
                        return undefined;
                    }
                } else {
                    return undefined;
                }
            } else {
                value = value[part];
            }

            if (value === undefined || value === null) {
                return value;
            }
        }

        return value;
    }

    /**
     * Tokenize expression for evaluation
     */
    private tokenizeExpression(expression: string): Token[] {
        const tokens: Token[] = [];
        let current = 0;

        while (current < expression.length) {
            // Skip whitespace
            const char = expression[current];
            if (char && /\s/.test(char)) {
                current++;
                continue;
            }

            // Operators
            if (expression.substring(current, current + 2) === '==') {
                tokens.push({ type: 'EQUALS', value: '==' });
                current += 2;
            } else if (expression.substring(current, current + 2) === '!=') {
                tokens.push({ type: 'NOT_EQUALS', value: '!=' });
                current += 2;
            } else if (expression.substring(current, current + 2) === '<=') {
                tokens.push({ type: 'LTE', value: '<=' });
                current += 2;
            } else if (expression.substring(current, current + 2) === '>=') {
                tokens.push({ type: 'GTE', value: '>=' });
                current += 2;
            } else if (expression.substring(current, current + 2) === '&&') {
                tokens.push({ type: 'AND', value: '&&' });
                current += 2;
            } else if (expression.substring(current, current + 2) === '||') {
                tokens.push({ type: 'OR', value: '||' });
                current += 2;
            } else if (expression[current] === '<') {
                tokens.push({ type: 'LT', value: '<' });
                current++;
            } else if (expression[current] === '>') {
                tokens.push({ type: 'GT', value: '>' });
                current++;
            } else if (expression[current] === '!') {
                tokens.push({ type: 'NOT', value: '!' });
                current++;
            } else if (expression[current] === '(') {
                tokens.push({ type: 'LPAREN', value: '(' });
                current++;
            } else if (expression[current] === ')') {
                tokens.push({ type: 'RPAREN', value: ')' });
                current++;
            } else if (expression[current] === '"' || expression[current] === "'") {
                // String literal
                const quote = expression[current];
                let value = '';
                current++;
                while (current < expression.length && expression[current] !== quote) {
                    if (expression[current] === '\\' && current + 1 < expression.length) {
                        current++;
                        value += expression[current];
                    } else {
                        value += expression[current];
                    }
                    current++;
                }
                current++; // Skip closing quote
                tokens.push({ type: 'STRING', value });
            } else if (char && /\d/.test(char)) {
                // Number literal
                let value = '';
                while (current < expression.length) {
                    const nextChar = expression[current];
                    if (!nextChar || !/[\d.]/.test(nextChar)) break;
                    value += nextChar;
                    current++;
                }
                tokens.push({ type: 'NUMBER', value });
            } else if (char && /[a-zA-Z_$]/.test(char)) {
                // Identifier
                let value = '';
                while (current < expression.length) {
                    const nextChar = expression[current];
                    if (!nextChar || !/[a-zA-Z0-9_$.]/.test(nextChar)) break;
                    value += nextChar;
                    current++;
                }
                
                // Check for boolean literals
                if (value === 'true' || value === 'false') {
                    tokens.push({ type: 'BOOLEAN', value });
                } else if (value === 'null') {
                    tokens.push({ type: 'NULL', value });
                } else {
                    tokens.push({ type: 'IDENTIFIER', value });
                }
            } else {
                throw new Error(`Unexpected character: ${expression[current]}`);
            }
        }

        return tokens;
    }

    /**
     * Evaluate tokenized expression
     */
    private evaluateTokens(tokens: Token[], context: TemplateContext): any {
        let position = 0;

        const parseExpression = (): any => {
            return parseOr();
        };

        const parseOr = (): any => {
            let left = parseAnd();

            while (position < tokens.length) {
                const token = tokens[position];
                if (!token || token.type !== 'OR') break;
                position++; // Skip ||
                const right = parseAnd();
                left = left || right;
            }

            return left;
        };

        const parseAnd = (): any => {
            let left = parseEquality();

            while (position < tokens.length) {
                const token = tokens[position];
                if (!token || token.type !== 'AND') break;
                position++; // Skip &&
                const right = parseEquality();
                left = left && right;
            }

            return left;
        };

        const parseEquality = (): any => {
            let left = parseRelational();

            while (position < tokens.length) {
                const op = tokens[position];
                if (op && (op.type === 'EQUALS' || op.type === 'NOT_EQUALS')) {
                    position++;
                    const right = parseRelational();
                    if (op.type === 'EQUALS') {
                        left = left == right;
                    } else {
                        left = left != right;
                    }
                } else {
                    break;
                }
            }

            return left;
        };

        const parseRelational = (): any => {
            let left = parseUnary();

            while (position < tokens.length) {
                const op = tokens[position];
                if (op && (op.type === 'LT' || op.type === 'GT' || op.type === 'LTE' || op.type === 'GTE')) {
                    position++;
                    const right = parseUnary();
                    switch (op.type) {
                        case 'LT': left = left < right; break;
                        case 'GT': left = left > right; break;
                        case 'LTE': left = left <= right; break;
                        case 'GTE': left = left >= right; break;
                    }
                } else {
                    break;
                }
            }

            return left;
        };

        const parseUnary = (): any => {
            const token = tokens[position];
            if (position < tokens.length && token && token.type === 'NOT') {
                position++; // Skip !
                return !parseUnary();
            }

            return parsePrimary();
        };

        const parsePrimary = (): any => {
            if (position >= tokens.length) {
                throw new Error('Unexpected end of expression');
            }

            const token = tokens[position];
            if (!token) {
                throw new Error('Unexpected end of expression');
            }

            if (token.type === 'LPAREN') {
                position++; // Skip (
                const value = parseExpression();
                const closeToken = tokens[position];
                if (position >= tokens.length || !closeToken || closeToken.type !== 'RPAREN') {
                    throw new Error('Expected closing parenthesis');
                }
                position++; // Skip )
                return value;
            }

            position++;

            switch (token.type) {
                case 'STRING':
                    return token.value;
                case 'NUMBER':
                    return parseFloat(token.value);
                case 'BOOLEAN':
                    return token.value === 'true';
                case 'NULL':
                    return null;
                case 'IDENTIFIER':
                    return this.evaluateExpression(token.value, context);
                default:
                    throw new Error(`Unexpected token type: ${token.type}`);
            }
        };

        const result = parseExpression();

        const remainingToken = tokens[position];
        if (position < tokens.length && remainingToken) {
            throw new Error(`Unexpected token: ${remainingToken.value}`);
        }

        return result;
    }

    /**
     * Register built-in template functions
     */
    private registerBuiltInFunctions(): void {
        // Random functions
        this.registerFunction('random', async (args) => {
            const min = args[0] || 0;
            const max = args[1] || 1;
            return Math.floor(Math.random() * (max - min + 1)) + min;
        });

        this.registerFunction('randomFloat', async (args) => {
            const min = args[0] || 0;
            const max = args[1] || 1;
            const decimals = args[2] || 2;
            const value = Math.random() * (max - min) + min;
            return parseFloat(value.toFixed(decimals));
        });

        this.registerFunction('randomString', async (args) => {
            const length = args[0] || 10;
            const charset = args[1] || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += charset.charAt(Math.floor(Math.random() * charset.length));
            }
            return result;
        });

        this.registerFunction('uuid', async () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        });

        // Date functions
        this.registerFunction('now', async () => {
            return new Date().toISOString();
        });

        this.registerFunction('date', async (args) => {
            const format = args[0] || 'YYYY-MM-DD';
            const date = args[1] ? new Date(args[1]) : new Date();
            return this.formatDate(date, format);
        });

        this.registerFunction('timestamp', async () => {
            return Date.now();
        });

        this.registerFunction('dateAdd', async (args) => {
            const date = new Date(args[0] || new Date());
            const amount = args[1] || 0;
            const unit = args[2] || 'days';

            switch (unit) {
                case 'years': date.setFullYear(date.getFullYear() + amount); break;
                case 'months': date.setMonth(date.getMonth() + amount); break;
                case 'days': date.setDate(date.getDate() + amount); break;
                case 'hours': date.setHours(date.getHours() + amount); break;
                case 'minutes': date.setMinutes(date.getMinutes() + amount); break;
                case 'seconds': date.setSeconds(date.getSeconds() + amount); break;
            }

            return date.toISOString();
        });

        // String functions
        this.registerFunction('upper', async (args) => {
            return String(args[0] || '').toUpperCase();
        });

        this.registerFunction('lower', async (args) => {
            return String(args[0] || '').toLowerCase();
        });

        this.registerFunction('trim', async (args) => {
            return String(args[0] || '').trim();
        });

        this.registerFunction('replace', async (args) => {
            const str = String(args[0] || '');
            const search = String(args[1] || '');
            const replace = String(args[2] || '');
            return str.split(search).join(replace);
        });

        this.registerFunction('substring', async (args) => {
            const str = String(args[0] || '');
            const start = args[1] || 0;
            const end = args[2];
            return end !== undefined ? str.substring(start, end) : str.substring(start);
        });

        this.registerFunction('length', async (args) => {
            const value = args[0];
            if (typeof value === 'string') return value.length;
            if (Array.isArray(value)) return value.length;
            if (value && typeof value === 'object') return Object.keys(value).length;
            return 0;
        });

        this.registerFunction('concat', async (args) => {
            return args.join('');
        });

        // Math functions
        this.registerFunction('add', async (args) => {
            return args.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        });

        this.registerFunction('subtract', async (args) => {
            if (args.length === 0) return 0;
            const first = parseFloat(args[0]) || 0;
            return args.slice(1).reduce((diff, val) => diff - (parseFloat(val) || 0), first);
        });

        this.registerFunction('multiply', async (args) => {
            return args.reduce((product, val) => product * (parseFloat(val) || 0), 1);
        });

        this.registerFunction('divide', async (args) => {
            if (args.length < 2) return 0;
            const dividend = parseFloat(args[0]) || 0;
            const divisor = parseFloat(args[1]) || 1;
            return dividend / divisor;
        });

        this.registerFunction('round', async (args) => {
            const value = parseFloat(args[0]) || 0;
            const decimals = args[1] || 0;
            return parseFloat(value.toFixed(decimals));
        });

        this.registerFunction('floor', async (args) => {
            return Math.floor(parseFloat(args[0]) || 0);
        });

        this.registerFunction('ceil', async (args) => {
            return Math.ceil(parseFloat(args[0]) || 0);
        });

        this.registerFunction('abs', async (args) => {
            return Math.abs(parseFloat(args[0]) || 0);
        });

        this.registerFunction('min', async (args) => {
            return Math.min(...args.map(v => parseFloat(v) || 0));
        });

        this.registerFunction('max', async (args) => {
            return Math.max(...args.map(v => parseFloat(v) || 0));
        });

        // Array functions
        this.registerFunction('join', async (args) => {
            const array = args[0];
            const separator = args[1] || ',';
            return Array.isArray(array) ? array.join(separator) : '';
        });

        this.registerFunction('split', async (args) => {
            const str = String(args[0] || '');
            const separator = args[1] || ',';
            return str.split(separator);
        });

        this.registerFunction('first', async (args) => {
            const array = args[0];
            return Array.isArray(array) ? array[0] : undefined;
        });

        this.registerFunction('last', async (args) => {
            const array = args[0];
            return Array.isArray(array) ? array[array.length - 1] : undefined;
        });

        this.registerFunction('slice', async (args) => {
            const array = args[0];
            const start = args[1] || 0;
            const end = args[2];
            return Array.isArray(array) ? array.slice(start, end) : [];
        });

        // Type conversion
        this.registerFunction('toString', async (args) => {
            return String(args[0] || '');
        });

        this.registerFunction('toNumber', async (args) => {
            return parseFloat(args[0]) || 0;
        });

        this.registerFunction('toBoolean', async (args) => {
            const value = args[0];
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') {
                return value.toLowerCase() === 'true' || value === '1';
            }
            return Boolean(value);
        });

        this.registerFunction('toJSON', async (args) => {
            return JSON.stringify(args[0]);
        });

        this.registerFunction('parseJSON', async (args) => {
            try {
                return JSON.parse(args[0]);
            } catch {
                return null;
            }
        });

        // Encoding functions
        this.registerFunction('base64Encode', async (args) => {
            return Buffer.from(String(args[0] || '')).toString('base64');
        });

        this.registerFunction('base64Decode', async (args) => {
            return Buffer.from(String(args[0] || ''), 'base64').toString('utf8');
        });

        this.registerFunction('urlEncode', async (args) => {
            return encodeURIComponent(String(args[0] || ''));
        });

        this.registerFunction('urlDecode', async (args) => {
            return decodeURIComponent(String(args[0] || ''));
        });

        this.registerFunction('htmlEscape', async (args) => {
            const str = String(args[0] || '');
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        });

        // Conditional functions
        this.registerFunction('if', async (args) => {
            const condition = args[0];
            const trueValue = args[1];
            const falseValue = args[2];
            return condition ? trueValue : falseValue;
        });

        this.registerFunction('default', async (args) => {
            for (const arg of args) {
                if (arg !== null && arg !== undefined && arg !== '') {
                    return arg;
                }
            }
            return '';
        });

        this.registerFunction('coalesce', async (args) => {
            for (const arg of args) {
                if (arg !== null && arg !== undefined) {
                    return arg;
                }
            }
            return null;
        });

        // Hash functions
        this.registerFunction('md5', async (args) => {
            const crypto = require('crypto');
            return crypto.createHash('md5').update(String(args[0] || '')).digest('hex');
        });

        this.registerFunction('sha1', async (args) => {
            const crypto = require('crypto');
            return crypto.createHash('sha1').update(String(args[0] || '')).digest('hex');
        });

        this.registerFunction('sha256', async (args) => {
            const crypto = require('crypto');
            return crypto.createHash('sha256').update(String(args[0] || '')).digest('hex');
        });

        // Environment function
        this.registerFunction('env', async (args, context) => {
            const key = args[0];
            const defaultValue = args[1];
            return process.env[key] || context[key] || defaultValue || '';
        });
    }

    /**
     * Register custom function
     */
    public registerFunction(name: string, func: TemplateFunction): void {
        this.customFunctions.set(name, func);
        ActionLogger.getInstance().debug(`Registered template function: ${name}`);
    }

    /**
     * Set global context
     */
    public setGlobalContext(context: TemplateContext): void {
        this.globalContext = { ...this.globalContext, ...context };
    }

    /**
     * Clear global context
     */
    public clearGlobalContext(): void {
        this.globalContext = {};
    }

    /**
     * Merge contexts
     */
    private mergeContexts(...contexts: TemplateContext[]): TemplateContext {
        return contexts.reduce((merged, context) => ({ ...merged, ...context }), {});
    }

    /**
     * Generate cache key
     */
    private generateCacheKey(template: string, context: TemplateContext): string {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5');
        hash.update(template);
        hash.update(JSON.stringify(context));
        return hash.digest('hex');
    }

    /**
     * Format date
     */
    private formatDate(date: Date, format: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

        return format
            .replace('YYYY', String(year))
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds)
            .replace('SSS', milliseconds);
    }

    /**
     * Trim whitespace from template
     */
    private trimWhitespace(template: string): string {
        // Remove leading/trailing whitespace from lines
        return template
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
    }

    /**
     * Format JSON string
     */
    private formatJSON(template: string): string {
        try {
            const json = JSON.parse(template);
            return JSON.stringify(json, null, 2);
        } catch {
            return template;
        }
    }

    /**
     * Format XML string
     */
    private formatXML(template: string): string {
        // Simple XML formatting
        let formatted = '';
        let indent = 0;
        
        template.split(/>\s*</).forEach(node => {
            if (node.match(/^\/\w/)) indent--; // Closing tag
            formatted += '\t'.repeat(Math.max(0, indent)) + '<' + node + '>\n';
            if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith("?")) indent++; // Opening tag
        });
        
        return formatted.substring(1, formatted.length - 2);
    }

    /**
     * Clear all caches
     */
    public clearCache(): void {
        this.templateCache.clear();
        this.placeholderResolver.clearCache();
    }

    /**
     * Get function names
     */
    public getFunctionNames(): string[] {
        return Array.from(this.customFunctions.keys());
    }
}

// Type definitions
interface Token {
    type: string;
    value: string;
}