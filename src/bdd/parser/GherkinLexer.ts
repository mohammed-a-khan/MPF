import { Token, TokenType, ParseError } from '../types/bdd.types';
import { Logger } from '../../core/utils/Logger';

export class GherkinLexer {
  private readonly keywords: Map<string, TokenType>;
  private readonly languageKeywords: Map<string, Map<string, TokenType>>;
  private readonly commentPrefix: string = '#';
  private readonly tagPrefix: string = '@';
  private readonly tableDelimiter: string = '|';
  private readonly docStringDelimiter: string = '"""';
  private readonly docStringDelimiterAlt: string = '```';
  
  constructor() {
    this.keywords = new Map([
      ['Feature:', TokenType.FeatureLine],
      ['Background:', TokenType.BackgroundLine],
      ['Scenario:', TokenType.ScenarioLine],
      ['Scenario Outline:', TokenType.ScenarioOutlineLine],
      ['Scenario Template:', TokenType.ScenarioOutlineLine],
      ['Examples:', TokenType.ExamplesLine],
      ['Scenarios:', TokenType.ExamplesLine],
      ['Given', TokenType.StepLine],
      ['When', TokenType.StepLine],
      ['Then', TokenType.StepLine],
      ['And', TokenType.StepLine],
      ['But', TokenType.StepLine],
      ['*', TokenType.StepLine]
    ]);
    
    this.languageKeywords = new Map();
    this.initializeLanguages();
  }
  
  tokenize(content: string, filePath: string): Token[] {
    const lines = content.split('\n');
    const tokens: Token[] = [];
    let currentLine = 0;
    let inDocString = false;
    let docStringIndent = 0;
    let docStringDelimiter = '';
    let docStringLines: string[] = [];
    let docStringStartLine = 0;
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      currentLine = lineIndex + 1;
      const line = lines[lineIndex];
      if (line === undefined) continue;
      const trimmedLine = line.trim();
      
      if (trimmedLine === '' && !inDocString) {
        continue;
      }
      
      if (inDocString) {
        if (trimmedLine === docStringDelimiter) {
          tokens.push({
            type: TokenType.DocStringSeparator,
            value: docStringLines.join('\n'),
            line: docStringStartLine,
            column: docStringIndent,
            indent: docStringIndent
          });
          
          inDocString = false;
          docStringLines = [];
          continue;
        } else {
          docStringLines.push(line || '');
          continue;
        }
      }
      
      if (trimmedLine === this.docStringDelimiter || trimmedLine === this.docStringDelimiterAlt) {
        inDocString = true;
        docStringDelimiter = trimmedLine;
        docStringIndent = this.getIndent(line || '');
        docStringStartLine = currentLine;
        docStringLines = [];
        continue;
      }
      
      if (trimmedLine.startsWith(this.commentPrefix)) {
        tokens.push({
          type: TokenType.Comment,
          value: trimmedLine.substring(1).trim(),
          line: currentLine,
          column: (line?.indexOf(this.commentPrefix) ?? -1) + 1,
          indent: this.getIndent(line || '')
        });
        continue;
      }
      
      if (trimmedLine.startsWith(this.tagPrefix)) {
        const tags = this.parseTags(trimmedLine);
        tags.forEach(tag => {
          tokens.push({
            type: TokenType.TagLine,
            value: tag,
            line: currentLine,
            column: (line?.indexOf(tag) ?? -1) + 1,
            indent: this.getIndent(line || '')
          });
        });
        continue;
      }
      
      if (trimmedLine.startsWith(this.tableDelimiter) && trimmedLine.endsWith(this.tableDelimiter)) {
        const cells = this.parseTableRow(trimmedLine);
        tokens.push({
          type: TokenType.TableRow,
          value: cells.join('|'),
          line: currentLine,
          column: (line?.indexOf(this.tableDelimiter) ?? -1) + 1,
          indent: this.getIndent(line || '')
        });
        continue;
      }
      
      if (trimmedLine.startsWith('# language:')) {
        const language = trimmedLine.substring('# language:'.length).trim();
        this.setLanguage(language);
        tokens.push({
          type: TokenType.Comment,
          value: `language: ${language}`,
          line: currentLine,
          column: 1,
          indent: 0
        });
        continue;
      }
      
      const keywordToken = this.parseKeywordLine(line || '', currentLine, filePath);
      if (keywordToken) {
        tokens.push(keywordToken);
      } else if (trimmedLine !== '') {
        tokens.push({
          type: TokenType.Comment,
          value: trimmedLine,
          line: currentLine,
          column: (line?.indexOf(trimmedLine.charAt(0)) ?? -1) + 1,
          indent: this.getIndent(line || '')
        });
      }
    }
    
    if (inDocString) {
      throw new ParseError(
        `Unclosed doc string starting at line ${docStringStartLine}`,
        docStringStartLine,
        1,
        filePath
      );
    }
    
    return tokens;
  }
  
  private parseKeywordLine(line: string, lineNumber: number, _filePath: string): Token | null {
    const trimmedLine = line.trim();
    const indent = this.getIndent(line);
    
    const keywordsArray = Array.from(this.keywords.entries());
    for (const [keyword, tokenType] of keywordsArray) {
      if (trimmedLine.startsWith(keyword)) {
        const value = trimmedLine.substring(keyword.length).trim();
        
        const token: Token = {
          type: tokenType,
          value: value,
          line: lineNumber,
          column: line.indexOf(keyword) + 1,
          indent: indent
        };
        
        if (tokenType === TokenType.StepLine) {
          (token as any).keyword = keyword.trim();
        }
        
        return token;
      }
    }
    
    const stepKeywords = ['Given', 'When', 'Then', 'And', 'But', '*'];
    for (const keyword of stepKeywords) {
      if (trimmedLine.startsWith(keyword + ' ')) {
        const value = trimmedLine.substring(keyword.length + 1).trim();
        const tokenType = this.keywords.get(keyword) || TokenType.Comment;
        
        return {
          type: tokenType,
          value: value,
          line: lineNumber,
          column: line.indexOf(keyword) + 1,
          indent: indent
        };
      }
    }
    
    return null;
  }
  
  private parseTags(line: string): string[] {
    const tags: string[] = [];
    const tagPattern = /@[a-zA-Z0-9_-]+(?:[-:][a-zA-Z0-9_-]+)*(?:\([^)]*\))?/g;
    let match;
    
    while ((match = tagPattern.exec(line)) !== null) {
      tags.push(match[0]);
    }
    
    return tags;
  }
  
  private parseTableRow(line: string): string[] {
    const cells: string[] = [];
    const parts = line.split(this.tableDelimiter);
    
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part !== undefined) {
        cells.push(part.trim());
      }
    }
    
    return cells;
  }
  
  private getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    const firstGroup = match?.[1];
    return firstGroup ? firstGroup.length : 0;
  }
  
  private setLanguage(language: string): void {
    const currentLanguage = language;
    if (this.languageKeywords.has(language)) {
      const langKeywords = this.languageKeywords.get(language)!;
      langKeywords.forEach((tokenType, keyword) => {
        this.keywords.set(keyword, tokenType);
      });
      
      Logger.getInstance().debug(`Lexer language set to: ${currentLanguage}`);
    } else {
      Logger.getInstance().warn(`Unsupported language: ${language}. Using English.`);
    }
  }
  
  private initializeLanguages(): void {
    
    const spanish = new Map([
      ['Característica:', TokenType.FeatureLine],
      ['Antecedentes:', TokenType.BackgroundLine],
      ['Escenario:', TokenType.ScenarioLine],
      ['Esquema del escenario:', TokenType.ScenarioOutlineLine],
      ['Ejemplos:', TokenType.ExamplesLine],
      ['Dado', TokenType.StepLine],
      ['Cuando', TokenType.StepLine],
      ['Entonces', TokenType.StepLine],
      ['Y', TokenType.StepLine],
      ['Pero', TokenType.StepLine]
    ]);
    this.languageKeywords.set('es', spanish);
    
    const french = new Map([
      ['Fonctionnalité:', TokenType.FeatureLine],
      ['Contexte:', TokenType.BackgroundLine],
      ['Scénario:', TokenType.ScenarioLine],
      ['Plan du scénario:', TokenType.ScenarioOutlineLine],
      ['Exemples:', TokenType.ExamplesLine],
      ['Étant donné', TokenType.StepLine],
      ['Quand', TokenType.StepLine],
      ['Alors', TokenType.StepLine],
      ['Et', TokenType.StepLine],
      ['Mais', TokenType.StepLine]
    ]);
    this.languageKeywords.set('fr', french);
    
    const german = new Map([
      ['Funktionalität:', TokenType.FeatureLine],
      ['Hintergrund:', TokenType.BackgroundLine],
      ['Szenario:', TokenType.ScenarioLine],
      ['Szenariogrundriss:', TokenType.ScenarioOutlineLine],
      ['Beispiele:', TokenType.ExamplesLine],
      ['Gegeben', TokenType.StepLine],
      ['Wenn', TokenType.StepLine],
      ['Dann', TokenType.StepLine],
      ['Und', TokenType.StepLine],
      ['Aber', TokenType.StepLine]
    ]);
    this.languageKeywords.set('de', german);
  }
  
  analyzeTokens(tokens: Token[]): {
    features: number;
    scenarios: number;
    steps: number;
    tags: Set<string>;
    hasBackground: boolean;
    hasExamples: boolean;
  } {
    const analysis = {
      features: 0,
      scenarios: 0,
      steps: 0,
      tags: new Set<string>(),
      hasBackground: false,
      hasExamples: false
    };
    
    tokens.forEach(token => {
      switch (token.type) {
        case TokenType.FeatureLine:
          analysis.features++;
          break;
        case TokenType.ScenarioLine:
        case TokenType.ScenarioOutlineLine:
          analysis.scenarios++;
          break;
        case TokenType.StepLine:
          analysis.steps++;
          break;
        case TokenType.TagLine:
          analysis.tags.add(token.value);
          break;
        case TokenType.BackgroundLine:
          analysis.hasBackground = true;
          break;
        case TokenType.ExamplesLine:
          analysis.hasExamples = true;
          break;
      }
    });
    
    return analysis;
  }
  
  validateTokenSequence(tokens: Token[]): ParseError[] {
    const errors: ParseError[] = [];
    let expectingScenario = false;
    let inScenario = false;
    let inBackground = false;
    
    tokens.forEach((token, index) => {
      switch (token.type) {
        case TokenType.FeatureLine:
          if (index > 0 && tokens.slice(0, index).some(t => 
            t.type === TokenType.FeatureLine && t.type !== TokenType.Comment && t.type !== TokenType.TagLine
          )) {
            errors.push(new ParseError(
              'Multiple Feature declarations found',
              token.line,
              token.column
            ));
          }
          expectingScenario = true;
          break;
          
        case TokenType.BackgroundLine:
          if (!expectingScenario) {
            errors.push(new ParseError(
              'Background must appear after Feature',
              token.line,
              token.column
            ));
          }
          if (inScenario) {
            errors.push(new ParseError(
              'Background must appear before any Scenario',
              token.line,
              token.column
            ));
          }
          inBackground = true;
          break;
          
        case TokenType.ScenarioLine:
        case TokenType.ScenarioOutlineLine:
          if (!expectingScenario) {
            errors.push(new ParseError(
              'Scenario must appear after Feature',
              token.line,
              token.column
            ));
          }
          inScenario = true;
          inBackground = false;
          break;
          
        case TokenType.ExamplesLine:
          if (!inScenario) {
            errors.push(new ParseError(
              'Examples must appear within a Scenario Outline',
              token.line,
              token.column
            ));
          }
          break;
          
        case TokenType.StepLine:
          if (!inScenario && !inBackground) {
            errors.push(new ParseError(
              'Step must appear within a Scenario or Background',
              token.line,
              token.column
            ));
          }
          break;
      }
    });
    
    return errors;
  }
}
