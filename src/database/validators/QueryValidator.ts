// src/database/validators/QueryValidator.ts

import { ValidationResult } from '../types/database.types';
import { ActionLogger } from '../../core/logging/ActionLogger';

export class QueryValidator {
    private readonly dangerousKeywords = [
        'DROP', 'TRUNCATE', 'DELETE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'
    ];
    
    private readonly sqlInjectionPatterns = [
        /(\b(union|select|insert|update|delete|from|where)\b.*\b(union|select|insert|update|delete|from|where)\b)/gi,
        /(\b(or|and)\b\s*\d+\s*=\s*\d+)/gi,
        /(--|\#|\/\*|\*\/)/g,
        /(\b(exec|execute|xp_|sp_)\b)/gi,
        /(;|\||&|`|\$\()/g,
        /(\b(waitfor|delay|benchmark|sleep)\b)/gi
    ];

    /**
     * Validate query syntax
     */
    validateSyntax(query: string, databaseType: string): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('querySyntax', databaseType, query, true, { queryLength: query.length });

        let passed = true;
        const issues: string[] = [];

        // Basic validation
        if (!query || query.trim().length === 0) {
            passed = false;
            issues.push('Query is empty');
        }

        // Check for balanced parentheses
        const parenthesesBalance = this.checkParenthesesBalance(query);
        if (!parenthesesBalance.balanced) {
            passed = false;
            issues.push(`Unbalanced parentheses: ${parenthesesBalance.message}`);
        }

        // Check for balanced quotes
        const quotesBalance = this.checkQuotesBalance(query);
        if (!quotesBalance.balanced) {
            passed = false;
            issues.push(`Unbalanced quotes: ${quotesBalance.message}`);
        }

        // Database-specific syntax validation
        const syntaxValidation = this.validateDatabaseSpecificSyntax(query, databaseType);
        if (!syntaxValidation.valid) {
            passed = false;
            issues.push(...syntaxValidation.issues);
        }

        // Check for common syntax errors
        const commonErrors = this.checkCommonSyntaxErrors(query);
        if (commonErrors.length > 0) {
            passed = false;
            issues.push(...commonErrors);
        }

        const details = {
            query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
            databaseType,
            issues,
            queryLength: query.length
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Query Syntax Validation',
            message: passed ? 
                'Query syntax is valid' : 
                `Query syntax validation failed: ${issues.join('; ')}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('querySyntax', databaseType, query, false, details);
        }

        return validationResult;
    }

    /**
     * Validate query is safe (no dangerous operations)
     */
    validateSafety(query: string, allowDangerous: boolean = false): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('querySafety', 'safety', query, true, { allowDangerous });

        let passed = true;
        const issues: string[] = [];
        const foundDangerous: string[] = [];

        if (!allowDangerous) {
            // Check for dangerous keywords
            const upperQuery = query.toUpperCase();
            for (const keyword of this.dangerousKeywords) {
                const regex = new RegExp(`\\b${keyword}\\b`, 'g');
                if (regex.test(upperQuery)) {
                    passed = false;
                    foundDangerous.push(keyword);
                }
            }

            if (foundDangerous.length > 0) {
                issues.push(`Dangerous operations detected: ${foundDangerous.join(', ')}`);
            }
        }

        // Check for SQL injection patterns
        const injectionCheck = this.checkSQLInjection(query);
        if (!injectionCheck.safe) {
            passed = false;
            issues.push(`Potential SQL injection detected: ${injectionCheck.pattern}`);
        }

        const details = {
            allowDangerous,
            foundDangerous,
            injectionPatterns: injectionCheck.matches,
            issues
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Query Safety Validation',
            message: passed ? 
                'Query is safe to execute' : 
                `Query safety validation failed: ${issues.join('; ')}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('querySafety', 'safety', query, false, details);
        }

        return validationResult;
    }

    /**
     * Validate query parameters
     */
    validateParameters(query: string, params: any[]): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('queryParameters', 'parameters', params, true, { paramCount: params.length });

        let passed = true;
        const issues: string[] = [];

        // Count parameter placeholders in query
        const placeholderCount = this.countParameterPlaceholders(query);
        
        // Check parameter count matches
        if (placeholderCount !== params.length) {
            passed = false;
            issues.push(`Parameter count mismatch. Expected: ${placeholderCount}, Provided: ${params.length}`);
        }

        // Validate parameter values
        params.forEach((param, index) => {
            // Check for potential injection in parameters
            if (typeof param === 'string') {
                const paramInjection = this.checkParameterInjection(param);
                if (!paramInjection.safe) {
                    passed = false;
                    issues.push(`Parameter ${index + 1} contains suspicious content: ${paramInjection.reason}`);
                }
            }

            // Check for null/undefined when not allowed
            if (param === undefined) {
                passed = false;
                issues.push(`Parameter ${index + 1} is undefined`);
            }
        });

        const details = {
            expectedParams: placeholderCount,
            providedParams: params.length,
            parameterTypes: params.map(p => typeof p),
            issues
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Query Parameters Validation',
            message: passed ? 
                'Query parameters are valid' : 
                `Query parameters validation failed: ${issues.join('; ')}`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('queryParameters', 'parameters', params, false, details);
        }

        return validationResult;
    }

    /**
     * Validate query performance (basic checks)
     */
    validatePerformance(query: string): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('queryPerformance', 'performance', query, true, {});

        let passed = true;
        const warnings: string[] = [];
        const suggestions: string[] = [];

        const upperQuery = query.toUpperCase();

        // Check for SELECT *
        if (/SELECT\s+\*/.test(upperQuery)) {
            warnings.push('SELECT * detected - consider specifying columns');
        }

        // Check for missing WHERE clause in UPDATE/DELETE
        if (/UPDATE\s+\w+\s+SET/.test(upperQuery) && !/WHERE/i.test(upperQuery)) {
            passed = false;
            warnings.push('UPDATE without WHERE clause - will affect all rows');
        }

        if (/DELETE\s+FROM\s+\w+(?!\s+WHERE)/i.test(upperQuery)) {
            passed = false;
            warnings.push('DELETE without WHERE clause - will delete all rows');
        }

        // Check for LIKE with leading wildcard
        if (/LIKE\s+['"]%/.test(upperQuery)) {
            warnings.push('LIKE with leading wildcard - may cause full table scan');
            suggestions.push('Consider using full-text search or indexing strategy');
        }

        // Check for NOT IN with subquery
        if (/NOT\s+IN\s*\(SELECT/i.test(upperQuery)) {
            warnings.push('NOT IN with subquery - consider using NOT EXISTS');
            suggestions.push('NOT EXISTS often performs better than NOT IN');
        }

        // Check for multiple JOINs
        const joinCount = (upperQuery.match(/\bJOIN\b/g) || []).length;
        if (joinCount > 5) {
            warnings.push(`Query contains ${joinCount} JOINs - may impact performance`);
            suggestions.push('Consider breaking into smaller queries or using materialized views');
        }

        // Check for OR in WHERE clause
        if (/WHERE.*\bOR\b/i.test(upperQuery)) {
            warnings.push('OR condition in WHERE clause - may prevent index usage');
            suggestions.push('Consider using UNION or restructuring the query');
        }

        // Check for functions in WHERE clause
        if (/WHERE.*\b(UPPER|LOWER|SUBSTRING|DATEPART|YEAR|MONTH|DAY)\s*\(/i.test(upperQuery)) {
            warnings.push('Function in WHERE clause - may prevent index usage');
            suggestions.push('Consider using computed columns or functional indexes');
        }

        const details = {
            warnings,
            suggestions,
            joinCount,
            hasSelectStar: /SELECT\s+\*/.test(upperQuery),
            hasWhereClause: /WHERE/i.test(upperQuery)
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Query Performance Validation',
            message: passed ? 
                (warnings.length > 0 ? `Query validated with ${warnings.length} warnings` : 'Query performance checks passed') : 
                'Query has critical performance issues',
            details,
            duration: Date.now() - startTime
        };

        if (!passed || warnings.length > 0) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('queryPerformance', 'performance', query, passed, details);
        }

        return validationResult;
    }

    /**
     * Validate query complexity
     */
    validateComplexity(query: string, maxComplexity: number = 100): ValidationResult {
        const startTime = Date.now();
        const actionLogger = ActionLogger.getInstance();
        actionLogger.logValidation('queryComplexity', 'complexity', query, true, { maxComplexity });

        const complexity = this.calculateQueryComplexity(query);
        const passed = complexity <= maxComplexity;

        const details = {
            complexity,
            maxComplexity,
            components: {
                joins: (query.match(/\bJOIN\b/gi) || []).length,
                subqueries: (query.match(/\(SELECT/gi) || []).length,
                unions: (query.match(/\bUNION\b/gi) || []).length,
                conditions: (query.match(/\b(AND|OR)\b/gi) || []).length,
                aggregates: (query.match(/\b(COUNT|SUM|AVG|MAX|MIN|GROUP BY|HAVING)\b/gi) || []).length,
                ctes: (query.match(/WITH\s+\w+\s+AS/gi) || []).length
            }
        };

        const validationResult: ValidationResult = {
            passed,
            ruleName: 'Query Complexity Validation',
            message: passed ? 
                `Query complexity (${complexity}) is within limit (${maxComplexity})` : 
                `Query complexity (${complexity}) exceeds limit (${maxComplexity})`,
            details,
            duration: Date.now() - startTime
        };

        if (!passed) {
            const actionLogger = ActionLogger.getInstance();
            actionLogger.logValidation('queryComplexity', 'complexity', query, false, details);
        }

        return validationResult;
    }

    // Private helper methods

    private checkParenthesesBalance(query: string): { balanced: boolean; message?: string } {
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            const prevChar = i > 0 ? query[i - 1] : '';

            // Handle string literals
            if ((char === "'" || char === '"') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
                continue;
            }

            // Skip characters inside strings
            if (inString) continue;

            // Count parentheses
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth < 0) {
                    return { 
                        balanced: false, 
                        message: `Unexpected closing parenthesis at position ${i}` 
                    };
                }
            }
        }

        if (depth !== 0) {
            return { 
                balanced: false, 
                message: `Unclosed parentheses: ${depth} opening parentheses without matching closing` 
            };
        }

        return { balanced: true };
    }

    private checkQuotesBalance(query: string): { balanced: boolean; message?: string } {
        const quoteTypes = ["'", '"', '`'];
        const quoteCounts: Record<string, number> = {};
        let currentQuote = '';
        let escaped = false;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            if (!char) continue; // Skip if char is undefined
            
            const prevChar = i > 0 ? query[i - 1] : '';

            // Handle escape sequences
            if (prevChar === '\\' && !escaped) {
                escaped = true;
                continue;
            }
            escaped = false;

            // Handle quotes
            if (quoteTypes.includes(char)) {
                if (!currentQuote) {
                    currentQuote = char;
                    quoteCounts[char] = (quoteCounts[char] || 0) + 1;
                } else if (char === currentQuote && !escaped) {
                    currentQuote = '';
                    if (quoteCounts[char] !== undefined) {
                        quoteCounts[char]++;
                    }
                }
            }
        }

        // Check if we're still inside a quote
        if (currentQuote) {
            return { 
                balanced: false, 
                message: `Unclosed ${currentQuote} quote` 
            };
        }

        // Check if all quotes are balanced
        for (const [quote, count] of Object.entries(quoteCounts)) {
            if (count % 2 !== 0) {
                return { 
                    balanced: false, 
                    message: `Unbalanced ${quote} quotes: ${count} occurrences` 
                };
            }
        }

        return { balanced: true };
    }

    private validateDatabaseSpecificSyntax(query: string, databaseType: string): { valid: boolean; issues: string[] } {
        const issues: string[] = [];
        const upperQuery = query.toUpperCase();

        switch (databaseType.toLowerCase()) {
            case 'sqlserver':
                // SQL Server specific validations
                if (/\bLIMIT\b/i.test(query)) {
                    issues.push('LIMIT is not supported in SQL Server. Use TOP or OFFSET-FETCH');
                }
                if (/\b(BOOLEAN|BOOL)\b/i.test(query)) {
                    issues.push('BOOLEAN type is not supported in SQL Server. Use BIT');
                }
                if (/\bAUTO_INCREMENT\b/i.test(query)) {
                    issues.push('AUTO_INCREMENT is not supported in SQL Server. Use IDENTITY');
                }
                if (/\bIFNULL\b/i.test(query)) {
                    issues.push('IFNULL is not supported in SQL Server. Use ISNULL or COALESCE');
                }
                break;

            case 'mysql':
                // MySQL specific validations
                if (/\bTOP\s+\d+/i.test(query)) {
                    issues.push('TOP is not supported in MySQL. Use LIMIT');
                }
                if (/\bIDENTITY/i.test(query)) {
                    issues.push('IDENTITY is not supported in MySQL. Use AUTO_INCREMENT');
                }
                if (/\bGETDATE\s*\(\)/i.test(query)) {
                    issues.push('GETDATE() is not supported in MySQL. Use NOW() or CURRENT_TIMESTAMP');
                }
                if (/\[\w+\]/g.test(query)) {
                    issues.push('Square brackets for identifiers are not supported in MySQL. Use backticks');
                }
                break;

            case 'postgresql':
                // PostgreSQL specific validations
                if (/\bTOP\s+\d+/i.test(query)) {
                    issues.push('TOP is not supported in PostgreSQL. Use LIMIT');
                }
                if (/\bIDENTITY/i.test(query)) {
                    issues.push('IDENTITY is not supported in PostgreSQL. Use SERIAL or GENERATED');
                }
                if (/\bGETDATE\s*\(\)/i.test(query)) {
                    issues.push('GETDATE() is not supported in PostgreSQL. Use NOW() or CURRENT_TIMESTAMP');
                }
                if (/\bNVARCHAR/i.test(query)) {
                    issues.push('NVARCHAR is not needed in PostgreSQL. Use VARCHAR');
                }
                if (/`\w+`/g.test(query)) {
                    issues.push('Backticks for identifiers are not supported in PostgreSQL. Use double quotes');
                }
                break;

            case 'oracle':
                // Oracle specific validations
                if (/\bLIMIT\b/i.test(query)) {
                    issues.push('LIMIT is not supported in Oracle. Use ROWNUM or FETCH FIRST');
                }
                if (/\bAUTO_INCREMENT\b/i.test(query)) {
                    issues.push('AUTO_INCREMENT is not supported in Oracle. Use sequences');
                }
                if (/\bIDENTITY/i.test(query)) {
                    issues.push('IDENTITY is not supported in Oracle. Use sequences or GENERATED');
                }
                if (/\bTINYINT|MEDIUMINT/i.test(query)) {
                    issues.push('TINYINT/MEDIUMINT are not supported in Oracle. Use NUMBER');
                }
                if (upperQuery.includes('DUAL') && !upperQuery.includes('FROM DUAL')) {
                    issues.push('SELECT without FROM DUAL is not valid in Oracle');
                }
                break;

            case 'mongodb':
                // MongoDB validations (checking for SQL in NoSQL context)
                if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i.test(query)) {
                    issues.push('SQL syntax detected. MongoDB uses different query syntax');
                }
                break;

            case 'redis':
                // Redis validations
                if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i.test(query)) {
                    issues.push('SQL syntax detected. Redis uses command-based syntax');
                }
                break;
        }

        return { valid: issues.length === 0, issues };
    }

    private checkCommonSyntaxErrors(query: string): string[] {
        const errors: string[] = [];

        // Check for multiple consecutive spaces (might indicate missing operator)
        if (/\s{3,}/.test(query)) {
            errors.push('Multiple consecutive spaces detected - possible missing operator');
        }

        // Check for missing FROM in SELECT
        if (/SELECT\s+[\w\s,]+\s+WHERE/i.test(query) && !/FROM/i.test(query)) {
            errors.push('SELECT with WHERE but no FROM clause');
        }

        // Check for comma before FROM
        if (/,\s*FROM/i.test(query)) {
            errors.push('Trailing comma before FROM clause');
        }

        // Check for missing comma in column list
        if (/SELECT.*\w\s+\w+\s+FROM/i.test(query)) {
            const selectPart = query.match(/SELECT\s+(.*?)\s+FROM/i)?.[1];
            if (selectPart && !selectPart.includes('AS') && !selectPart.includes('*')) {
                errors.push('Possible missing comma in SELECT column list');
            }
        }

        // Check for UPDATE with SET but no equals
        if (/UPDATE.*SET\s+\w+\s+\w+/i.test(query) && !/UPDATE.*SET\s+\w+\s*=/i.test(query)) {
            errors.push('UPDATE SET without equals sign');
        }

        // Check for INSERT with mismatched parentheses
        const insertMatch = query.match(/INSERT\s+INTO.*VALUES\s*\((.*?)\)/i);
        if (insertMatch && insertMatch[1]) {
            const valuesPart = insertMatch[1];
            const openParens = (valuesPart.match(/\(/g) || []).length;
            const closeParens = (valuesPart.match(/\)/g) || []).length;
            if (openParens !== closeParens) {
                errors.push('Mismatched parentheses in INSERT VALUES');
            }
        }

        // Check for invalid operators
        if (/\b(=<|=>)\b/.test(query)) {
            errors.push('Invalid comparison operator (use <= or >=)');
        }

        // Check for missing quotes around string literals
        if (/=\s*[a-zA-Z]+(?![a-zA-Z0-9_\(\)])/.test(query) && 
            !/=\s*(TRUE|FALSE|NULL|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP)/i.test(query)) {
            errors.push('Possible missing quotes around string literal');
        }

        // Check for semicolon in the middle of query
        const semicolonPos = query.indexOf(';');
        if (semicolonPos > -1 && semicolonPos < query.length - 1) {
            const afterSemicolon = query.substring(semicolonPos + 1).trim();
            if (afterSemicolon.length > 0) {
                errors.push('Multiple statements detected - semicolon found in middle of query');
            }
        }

        return errors;
    }

    private checkSQLInjection(query: string): { safe: boolean; pattern?: string; matches: string[] } {
        const matches: string[] = [];

        for (const pattern of this.sqlInjectionPatterns) {
            const match = query.match(pattern);
            if (match) {
                matches.push(match[0]);
            }
        }

        // Additional checks for common injection techniques
        
        // Check for tautologies
        if (/\b\d+\s*=\s*\d+\b/.test(query)) {
            const tautology = query.match(/\b(\d+)\s*=\s*(\d+)\b/);
            if (tautology && tautology[1] === tautology[2]) {
                matches.push(`Tautology detected: ${tautology[0]}`);
            }
        }

        // Check for stacked queries
        if (/;\s*(DROP|CREATE|ALTER|EXEC)/i.test(query)) {
            matches.push('Stacked query attempt detected');
        }

        // Check for out-of-band techniques
        if (/\b(UTL_HTTP|DBMS_LDAP|UTL_SMTP|xp_cmdshell|xp_dirtree)\b/i.test(query)) {
            matches.push('Out-of-band SQL injection technique detected');
        }

        // Check for time-based injection
        if (/\b(SLEEP|WAITFOR\s+DELAY|BENCHMARK|pg_sleep)\b/i.test(query)) {
            matches.push('Time-based SQL injection technique detected');
        }

        // Check for union-based injection
        const unionMatch = query.match(/UNION\s+(ALL\s+)?SELECT/i);
        if (unionMatch) {
            // Check if the UNION SELECT has same number of columns
            const beforeUnion = query.substring(0, query.indexOf(unionMatch[0]));
            const afterUnion = query.substring(query.indexOf(unionMatch[0]));
            
            const beforeColumns = (beforeUnion.match(/SELECT\s+(.*?)\s+FROM/i)?.[1]?.split(',') || []).length;
            const afterColumns = (afterUnion.match(/SELECT\s+(.*?)\s+FROM/i)?.[1]?.split(',') || []).length;
            
            if (beforeColumns !== afterColumns && beforeColumns > 0 && afterColumns > 0) {
                matches.push('UNION with mismatched column count - possible injection');
            }
        }

        const result: { safe: boolean; pattern?: string; matches: string[] } = { 
            safe: matches.length === 0, 
            matches 
        };
        
        if (matches.length > 0 && matches[0]) {
            result.pattern = matches[0];
        }
        
        return result;
    }

    private checkParameterInjection(param: string): { safe: boolean; reason?: string } {
        // Check for SQL keywords in parameters
        const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|AND|OR)\b/i;
        if (sqlKeywords.test(param)) {
            return { safe: false, reason: 'SQL keywords detected in parameter' };
        }

        // Check for comment sequences
        if (/(--)|(\/\*)|(\*\/)|(#)/.test(param)) {
            return { safe: false, reason: 'SQL comment sequence detected in parameter' };
        }

        // Check for suspicious character sequences
        if (/[;`]/.test(param)) {
            return { safe: false, reason: 'Suspicious characters detected in parameter' };
        }

        // Check for encoded characters that might be injection attempts
        if (/%27|%22|%3B|%2D%2D/.test(param)) {
            return { safe: false, reason: 'URL-encoded SQL characters detected' };
        }

        // Check for hex encoding
        if (/0x[0-9a-fA-F]+/.test(param) && param.length > 10) {
            return { safe: false, reason: 'Hex-encoded data detected - possible injection' };
        }

        return { safe: true };
    }

    private countParameterPlaceholders(query: string): number {
        // Count different parameter placeholder styles
        let count = 0;

        // Question mark placeholders (?, used by MySQL, PostgreSQL)
        const questionMarks = query.match(/\?/g);
        if (questionMarks) {
            count = questionMarks.length;
        }

        // Numbered placeholders ($1, $2, etc., used by PostgreSQL)
        const numberedParams = query.match(/\$\d+/g);
        if (numberedParams) {
            const uniqueNumbers = new Set(numberedParams);
            count = Math.max(count, uniqueNumbers.size);
        }

        // Named placeholders (@param, :param, used by SQL Server, Oracle)
        const namedParams = query.match(/[@:]\w+/g);
        if (namedParams) {
            const uniqueNames = new Set(namedParams);
            count = Math.max(count, uniqueNames.size);
        }

        // MongoDB style placeholders
        const mongoParams = query.match(/\$\d+|\$\w+/g);
        if (mongoParams) {
            const uniqueMongo = new Set(mongoParams);
            count = Math.max(count, uniqueMongo.size);
        }

        return count;
    }

    private calculateQueryComplexity(query: string): number {
        let complexity = 0;

        // Base complexity by query length
        complexity += Math.floor(query.length / 100);

        // Add complexity for various SQL constructs
        const complexityFactors = [
            { pattern: /\bJOIN\b/gi, weight: 5 },
            { pattern: /\bLEFT\s+JOIN\b/gi, weight: 6 },
            { pattern: /\bRIGHT\s+JOIN\b/gi, weight: 6 },
            { pattern: /\bFULL\s+OUTER\s+JOIN\b/gi, weight: 8 },
            { pattern: /\bCROSS\s+JOIN\b/gi, weight: 7 },
            { pattern: /\(SELECT/gi, weight: 10 }, // Subqueries
            { pattern: /\bUNION\b/gi, weight: 8 },
            { pattern: /\bINTERSECT\b/gi, weight: 8 },
            { pattern: /\bEXCEPT\b/gi, weight: 8 },
            { pattern: /\bGROUP\s+BY\b/gi, weight: 5 },
            { pattern: /\bHAVING\b/gi, weight: 5 },
            { pattern: /\bORDER\s+BY\b/gi, weight: 3 },
            { pattern: /\bDISTINCT\b/gi, weight: 4 },
            { pattern: /\bCASE\s+WHEN\b/gi, weight: 4 },
            { pattern: /\bEXISTS\b/gi, weight: 6 },
            { pattern: /\bNOT\s+EXISTS\b/gi, weight: 7 },
            { pattern: /WITH\s+\w+\s+AS\s*\(/gi, weight: 10 }, // CTEs
            { pattern: /\bPARTITION\s+BY\b/gi, weight: 6 },
            { pattern: /\bROW_NUMBER\s*\(\)/gi, weight: 5 },
            { pattern: /\bRANK\s*\(\)/gi, weight: 5 },
            { pattern: /\bDENSE_RANK\s*\(\)/gi, weight: 5 },
            { pattern: /\b(AND|OR)\b/gi, weight: 1 },
            { pattern: /\bIN\s*\(SELECT/gi, weight: 8 },
            { pattern: /\bCURSOR\b/gi, weight: 15 },
            { pattern: /\bWHILE\b/gi, weight: 12 },
            { pattern: /\bBEGIN\s+TRANSACTION\b/gi, weight: 10 }
        ];

        for (const factor of complexityFactors) {
            const matches = query.match(factor.pattern);
            if (matches) {
                complexity += matches.length * factor.weight;
            }
        }

        // Add complexity for nested parentheses depth
        let maxDepth = 0;
        let currentDepth = 0;
        for (const char of query) {
            if (char === '(') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (char === ')') {
                currentDepth--;
            }
        }
        complexity += maxDepth * 3;

        // Add complexity for number of tables referenced
        const tableReferences = query.match(/\b(FROM|JOIN)\s+(\w+\.)?(\w+)/gi);
        if (tableReferences) {
            complexity += tableReferences.length * 2;
        }

        // Add complexity for aggregate functions
        const aggregates = query.match(/\b(COUNT|SUM|AVG|MAX|MIN|STDDEV|VARIANCE)\s*\(/gi);
        if (aggregates) {
            complexity += aggregates.length * 3;
        }

        // Add complexity for window functions
        const windowFunctions = query.match(/\bOVER\s*\(/gi);
        if (windowFunctions) {
            complexity += windowFunctions.length * 6;
        }

        return complexity;
    }
}