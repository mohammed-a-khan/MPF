import { Logger } from '../../core/utils/Logger';

interface TagExpression {
  type: 'and' | 'or' | 'not' | 'tag';
  value?: string;
  left?: TagExpression;
  right?: TagExpression;
  operand?: TagExpression;
}

export class TagParser {
  private static instance: TagParser;
  private readonly tagPattern = /^@[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?$/;
  private readonly operatorPrecedence = {
    'or': 1,
    'and': 2,
    'not': 3
  };
  
  private constructor() {}
  
  static getInstance(): TagParser {
    if (!TagParser.instance) {
      TagParser.instance = new TagParser();
    }
    return TagParser.instance;
  }
  
  parseTags(tagLine: string): string[] {
    const tags: string[] = [];
    
    if (!tagLine || tagLine.trim() === '') {
      return tags;
    }
    
    const parts = tagLine.trim().split(/\s+/);
    
    for (const part of parts) {
      if (this.isValidTag(part)) {
        tags.push(part);
      } else if (part.startsWith('@')) {
        Logger.getInstance().warn(`Invalid tag format: ${part}. Tags must match pattern ${this.tagPattern}`);
      }
    }
    
    return tags;
  }
  
  evaluateTagExpression(expression: string, scenarioTags: string[]): boolean {
    if (!expression || expression.trim() === '') {
      return true;
    }
    
    try {
      const ast = this.parseExpression(expression);
      return this.evaluateAST(ast, scenarioTags);
    } catch (error) {
      Logger.getInstance().error(`Error evaluating tag expression "${expression}": ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Invalid tag expression: ${expression}`);
    }
  }
  
  parseExpression(expression: string): TagExpression {
    const tokens = this.tokenize(expression);
    const postfix = this.infixToPostfix(tokens);
    return this.buildAST(postfix);
  }
  
  private tokenize(expression: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inParentheses = 0;
    
    for (let i = 0; i < expression.length; i++) {
      const char = expression[i];
      
      if (char === '(') {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        tokens.push('(');
        inParentheses++;
      } else if (char === ')') {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        tokens.push(')');
        inParentheses--;
        if (inParentheses < 0) {
          throw new Error('Unmatched closing parenthesis');
        }
      } else if (char === ' ' && inParentheses === 0) {
        if (current.trim()) {
          const trimmed = current.trim();
          if (this.isOperator(trimmed)) {
            tokens.push(trimmed.toLowerCase());
          } else {
            tokens.push(trimmed);
          }
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      const trimmed = current.trim();
      if (this.isOperator(trimmed)) {
        tokens.push(trimmed.toLowerCase());
      } else {
        tokens.push(trimmed);
      }
    }
    
    if (inParentheses !== 0) {
      throw new Error('Unmatched opening parenthesis');
    }
    
    return this.normalizeTokens(tokens);
  }
  
  private normalizeTokens(tokens: string[]): string[] {
    const normalized: string[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (!token) continue;
      
      if (token === 'not') {
        normalized.push(token);
      } 
      else if (token === 'and' || token === 'or') {
        normalized.push(token);
      }
      else if (token === '(' || token === ')') {
        normalized.push(token);
      }
      else if (token.startsWith('@')) {
        if (!this.isValidTag(token)) {
          throw new Error(`Invalid tag format: ${token}`);
        }
        normalized.push(token);
      }
      else if (!this.isOperator(token)) {
        const tag = token.startsWith('@') ? token : `@${token}`;
        if (!this.isValidTag(tag)) {
          throw new Error(`Invalid tag format: ${tag}`);
        }
        normalized.push(tag);
      }
    }
    
    return normalized;
  }
  
  private infixToPostfix(tokens: string[]): string[] {
    const output: string[] = [];
    const operators: string[] = [];
    
    for (const token of tokens) {
      if (token === '(') {
        operators.push(token);
      } else if (token === ')') {
        while (operators.length > 0 && operators[operators.length - 1] !== '(') {
          output.push(operators.pop()!);
        }
        if (operators.length === 0) {
          throw new Error('Mismatched parentheses');
        }
        operators.pop();
      } else if (this.isOperator(token)) {
        while (
          operators.length > 0 &&
          operators[operators.length - 1] !== '(' &&
          this.getPrecedence(operators[operators.length - 1] || '') >= this.getPrecedence(token)
        ) {
          output.push(operators.pop()!);
        }
        operators.push(token);
      } else {
        output.push(token);
      }
    }
    
    while (operators.length > 0) {
      const op = operators.pop()!;
      if (op === '(' || op === ')') {
        throw new Error('Mismatched parentheses');
      }
      output.push(op);
    }
    
    return output;
  }
  
  private buildAST(postfix: string[]): TagExpression {
    const stack: TagExpression[] = [];
    
    for (const token of postfix) {
      if (this.isOperator(token)) {
        if (token === 'not') {
          if (stack.length < 1) {
            throw new Error('Invalid expression: not enough operands for NOT operator');
          }
          const operand = stack.pop()!;
          stack.push({
            type: 'not',
            operand: operand
          });
        } else if (token === 'and' || token === 'or') {
          if (stack.length < 2) {
            throw new Error(`Invalid expression: not enough operands for ${token.toUpperCase()} operator`);
          }
          const right = stack.pop()!;
          const left = stack.pop()!;
          stack.push({
            type: token as 'and' | 'or',
            left: left,
            right: right
          });
        }
      } else {
        stack.push({
          type: 'tag',
          value: token
        });
      }
    }
    
    if (stack.length !== 1) {
      throw new Error('Invalid expression: incomplete expression');
    }
    
    const result = stack[0];
    if (!result) {
      throw new Error('Invalid expression: empty expression');
    }
    return result;
  }
  
  private evaluateAST(ast: TagExpression, scenarioTags: string[]): boolean {
    switch (ast.type) {
      case 'tag':
        return scenarioTags.includes(ast.value!);
        
      case 'not':
        return !this.evaluateAST(ast.operand!, scenarioTags);
        
      case 'and':
        return this.evaluateAST(ast.left!, scenarioTags) && 
               this.evaluateAST(ast.right!, scenarioTags);
        
      case 'or':
        return this.evaluateAST(ast.left!, scenarioTags) || 
               this.evaluateAST(ast.right!, scenarioTags);
        
      default:
        throw new Error(`Unknown AST node type: ${ast.type}`);
    }
  }
  
  private isOperator(token: string): boolean {
    return ['and', 'or', 'not'].includes(token.toLowerCase());
  }
  
  private getPrecedence(operator: string): number {
    const op = operator.toLowerCase() as keyof typeof this.operatorPrecedence;
    return this.operatorPrecedence[op] || 0;
  }
  
  private isValidTag(tag: string): boolean {
    return this.tagPattern.test(tag);
  }
  
  validateTagExpression(expression: string): { valid: boolean; error?: string } {
    try {
      this.parseExpression(expression);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  
  getAllTagsFromExpression(expression: string): string[] {
    const tags = new Set<string>();
    
    try {
      const ast = this.parseExpression(expression);
      this.collectTags(ast, tags);
    } catch (error) {
      Logger.getInstance().warn(`Failed to extract tags from expression: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return Array.from(tags);
  }
  
  private collectTags(ast: TagExpression, tags: Set<string>): void {
    switch (ast.type) {
      case 'tag':
        if (ast.value) {
          tags.add(ast.value);
        }
        break;
        
      case 'not':
        if (ast.operand) {
          this.collectTags(ast.operand, tags);
        }
        break;
        
      case 'and':
      case 'or':
        if (ast.left) {
          this.collectTags(ast.left, tags);
        }
        if (ast.right) {
          this.collectTags(ast.right, tags);
        }
        break;
    }
  }
  
  simplifyExpression(expression: string): string {
    try {
      const ast = this.parseExpression(expression);
      return this.astToString(ast);
    } catch (error) {
      return expression;
    }
  }
  
  private astToString(ast: TagExpression): string {
    switch (ast.type) {
      case 'tag':
        return ast.value || '';
        
      case 'not':
        return `not ${this.astToString(ast.operand!)}`;
        
      case 'and':
        return `(${this.astToString(ast.left!)} and ${this.astToString(ast.right!)})`;
        
      case 'or':
        return `(${this.astToString(ast.left!)} or ${this.astToString(ast.right!)})`;
        
      default:
        return '';
    }
  }
  
  combineTagExpressions(expressions: string[]): string {
    if (expressions.length === 0) {
      return '';
    }
    
    if (expressions.length === 1) {
      return expressions[0] || '';
    }
    
    return expressions.map(expr => `(${expr})`).join(' or ');
  }
  
  negateExpression(expression: string): string {
    if (!expression || expression.trim() === '') {
      return '';
    }
    
    try {
      const ast = this.parseExpression(expression);
      const negated = this.negateAST(ast);
      return this.astToString(negated);
    } catch (error) {
      return `not (${expression})`;
    }
  }
  
  private negateAST(ast: TagExpression): TagExpression {
    switch (ast.type) {
      case 'tag':
        return {
          type: 'not',
          operand: ast
        };
        
      case 'not':
        return ast.operand!;
        
      case 'and':
        return {
          type: 'or',
          left: this.negateAST(ast.left!),
          right: this.negateAST(ast.right!)
        };
        
      case 'or':
        return {
          type: 'and',
          left: this.negateAST(ast.left!),
          right: this.negateAST(ast.right!)
        };
        
      default:
        return ast;
    }
  }

  parseAnnotations(lines: string[]): { tags: string[]; metadata: Record<string, any> } {
    const tags: string[] = [];
    const metadata: Record<string, any> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('@DataSource:')) {
        const dataSourceMatch = trimmedLine.match(/@DataSource:(\w+)=(.+)/);
        if (dataSourceMatch) {
          metadata['dataSource'] = {
            type: dataSourceMatch[1],
            source: dataSourceMatch[2]
          };
        }
      } else if (trimmedLine.startsWith('@TestCase:')) {
        metadata['testCase'] = trimmedLine.replace('@TestCase:', '');
      } else if (trimmedLine.startsWith('@Priority:')) {
        metadata['priority'] = trimmedLine.replace('@Priority:', '');
      } else if (trimmedLine.startsWith('@Author:')) {
        metadata['author'] = trimmedLine.replace('@Author:', '');
      } else if (trimmedLine.startsWith('@Environment:')) {
        metadata['environment'] = trimmedLine.replace('@Environment:', '');
      } else if (trimmedLine.startsWith('@')) {
        const parsedTags = this.parseTags(trimmedLine);
        tags.push(...parsedTags);
      }
    }

    return { tags, metadata };
  }
}

export const tagParser = TagParser.getInstance();
