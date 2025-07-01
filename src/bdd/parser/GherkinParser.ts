import { Token, TokenType, Feature, Scenario, Step, Examples, DataTable, DocString } from '../types/bdd.types';
import { ParseError } from '../types/bdd.types';

export class GherkinParser {
  private tokens: Token[] = [];
  private currentIndex: number = 0;
  private filePath: string = '';
  
  parse(tokens: Token[], filePath: string): Feature {
    this.tokens = tokens;
    this.currentIndex = 0;
    this.filePath = filePath;
    
    try {
      return this.parseFeature();
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }
      
      const token = this.currentToken();
      throw new ParseError(
        error instanceof Error ? error.message : 'Unknown parse error',
        token?.line || 0,
        token?.column || 0,
        this.filePath
      );
    }
  }
  
  private parseFeature(): Feature {
    const featureTags = this.parseTags();
    
    const featureToken = this.expectToken(TokenType.FeatureLine);
    if (!featureToken) {
      throw new ParseError(
        'Expected Feature declaration',
        1,
        1,
        this.filePath
      );
    }
    
    const feature: Feature = {
      name: featureToken.value,
      description: this.parseDescription(),
      tags: featureTags,
      scenarios: [],
      language: this.findLanguage(),
      uri: this.filePath
    };
    
    while (!this.isAtEnd()) {
      const token = this.currentToken();
      
      if (!token) {
        break;
      }
      
      switch (token.type) {
        case TokenType.BackgroundLine:
          if (feature.background) {
            throw new ParseError(
              'Multiple Background sections are not allowed',
              token.line,
              token.column,
              this.filePath
            );
          }
          feature.background = this.parseBackground();
          break;
          
        case TokenType.ScenarioLine:
        case TokenType.ScenarioOutlineLine:
          const scenario = this.parseScenarioWithBacktrack();
          feature.scenarios.push(scenario);
          break;
          
        case TokenType.TagLine:
          this.advance();
          break;
          
        case TokenType.Comment:
          this.advance();
          break;
          
        default:
          this.advance();
      }
    }
    
    if (feature.scenarios.length === 0) {
      throw new ParseError(
        'Feature must have at least one Scenario',
        featureToken.line,
        featureToken.column,
        this.filePath
      );
    }
    
    
    return feature;
  }
  
  private parseBackground(): Scenario {
    const backgroundToken = this.advance();
    
    const background: Scenario = {
      type: 'background',
      name: backgroundToken.value || 'Background',
      description: this.parseDescription(),
      tags: [],
      steps: []
    };
    
    if (backgroundToken.line !== undefined) {
      background.line = backgroundToken.line;
    }
    
    while (!this.isAtEnd()) {
      const token = this.currentToken();
      
      if (!token) {
        break;
      }
      
      if (token.type === TokenType.ScenarioLine || 
          token.type === TokenType.ScenarioOutlineLine ||
          token.type === TokenType.TagLine) {
        break;
      }
      
      if (this.isStepToken(token.type)) {
        const step = this.parseStep();
        background.steps.push(step);
      } else if (token.type === TokenType.Comment || token.type === TokenType.Empty) {
        this.advance();
      } else {
        break;
      }
    }
    
    if (background.steps.length === 0) {
      throw new ParseError(
        'Background must have at least one step',
        backgroundToken.line,
        backgroundToken.column,
        this.filePath
      );
    }
    
    return background;
  }
  
  private parseScenarioWithBacktrack(): Scenario {
    let tagStartIndex = this.currentIndex;
    
    while (tagStartIndex > 0) {
      const prevToken = this.tokens[tagStartIndex - 1];
      if (prevToken && prevToken.type === TokenType.TagLine) {
        tagStartIndex--;
      } else {
        break;
      }
    }
    
    const savedIndex = this.currentIndex;
    this.currentIndex = tagStartIndex;
    
    const scenario = this.parseScenario();
    
    return scenario;
  }
  
  private parseScenario(): Scenario {
    const scenarioTags = this.parseTags();
    
    const scenarioToken = this.advance();
    const isOutline = scenarioToken.type === TokenType.ScenarioOutlineLine;
    
    console.log(`[GherkinParser] Creating scenario "${scenarioToken.value}" with tags:`, scenarioTags);
    
    const scenario: Scenario = {
      type: isOutline ? 'scenario_outline' : 'scenario',
      name: scenarioToken.value,
      description: this.parseDescription(),
      tags: scenarioTags,
      steps: []
    };
    
    if (scenarioToken.line !== undefined) {
      scenario.line = scenarioToken.line;
    }
    
    if (isOutline) {
      scenario.examples = [];
    }
    
    while (!this.isAtEnd()) {
      const token = this.currentToken();
      
      if (!token) {
        break;
      }
      
      if (token.type === TokenType.ScenarioLine || 
          token.type === TokenType.ScenarioOutlineLine ||
          token.type === TokenType.TagLine ||
          token.type === TokenType.ExamplesLine) {
        break;
      }
      
      if (this.isStepToken(token.type)) {
        const step = this.parseStep();
        scenario.steps.push(step);
      } else if (token.type === TokenType.Comment || token.type === TokenType.Empty) {
        this.advance();
      } else {
        break;
      }
    }
    
    if (isOutline && scenario.examples) {
      while (!this.isAtEnd()) {
        const token = this.currentToken();
        
        if (!token || token.type !== TokenType.ExamplesLine) {
          break;
        }
        
        const examples = this.parseExamples();
        scenario.examples.push(examples);
      }
      
      const hasDataProvider = scenario.tags.some(tag => 
        tag.startsWith('@DataProvider') || tag.includes('DataProvider(')
      );
      
      if (scenario.examples.length === 0 && !hasDataProvider) {
        throw new ParseError(
          'Scenario Outline must have at least one Examples section or @DataProvider tag',
          scenarioToken.line,
          scenarioToken.column,
          this.filePath
        );
      }
    }
    
    if (scenario.steps.length === 0) {
      throw new ParseError(
        'Scenario must have at least one step',
        scenarioToken.line,
        scenarioToken.column,
        this.filePath
      );
    }
    
    return scenario;
  }
  
  private parseStep(): Step {
    const stepToken = this.advance();
    
    const step: Step = {
      keyword: this.getStepKeyword(stepToken),
      text: stepToken.value,
      line: stepToken.line
    };
    
    const nextToken = this.currentToken();
    
    if (nextToken) {
      if (nextToken.type === TokenType.TableRow) {
        step.dataTable = this.parseDataTable();
      } else if (nextToken.type === TokenType.DocStringSeparator) {
        step.docString = this.parseDocString();
      }
    }
    
    return step;
  }
  
  private parseDataTable(): DataTable {
    const rows: string[][] = [];
    const firstRowToken = this.currentToken();
    
    while (!this.isAtEnd() && this.currentToken()?.type === TokenType.TableRow) {
      const token = this.advance();
      const cells = this.parseTableCells(token.value);
      rows.push(cells);
    }
    
    if (rows.length === 0) {
      throw new ParseError(
        'Data table must have at least one row',
        firstRowToken?.line || 0,
        firstRowToken?.column || 0,
        this.filePath
      );
    }
    
    return {
      rows: rows,
      hashes: () => {
        if (rows.length === 0) return [];
        const headers = rows[0];
        if (!headers) return [];
        return rows.slice(1).map(row => {
          const hash: Record<string, string> = {};
          headers.forEach((header, index) => {
            hash[header] = row[index] || '';
          });
          return hash;
        });
      },
      raw: () => rows,
      rowsHash: () => {
        const hash: Record<string, string> = {};
        rows.forEach(row => {
          if (row.length >= 2 && row[0] !== undefined && row[1] !== undefined) {
            hash[row[0]] = row[1];
          }
        });
        return hash;
      },
      rowsWithoutHeader: () => rows.slice(1)
    };
  }
  
  private parseTableCells(value: string): string[] {
    if (typeof value === 'string') {
      return value.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
    }
    return [];
  }
  
  private parseDocString(): DocString {
    const docStringToken = this.advance();
    
    let contentType: string | undefined;
    const firstLine = docStringToken.value.split('\n')[0];
    if (firstLine && !firstLine.includes('\n')) {
      contentType = firstLine;
      docStringToken.value = docStringToken.value.substring(firstLine.length).trimStart();
    }
    
    const docString: DocString = {
      content: docStringToken.value,
      line: docStringToken.line
    };
    
    if (contentType) {
      docString.contentType = contentType;
    }
    
    return docString;
  }
  
  private parseExamples(): Examples {
    const examplesToken = this.advance();
    
    const examples: Examples = {
      name: examplesToken.value || 'Examples',
      description: '',
      tags: [],
      header: [],
      rows: []
    };
    
    if (examplesToken.line !== undefined) {
      examples.line = examplesToken.line;
    }
    
    while (!this.isAtEnd() && this.currentToken()?.type === TokenType.Empty) {
      this.advance();
    }
    
    const tableToken = this.currentToken();
    
    if (!tableToken || tableToken.type !== TokenType.TableRow) {
      throw new ParseError(
        'Examples must have a table',
        examplesToken.line,
        examplesToken.column,
        this.filePath
      );
    }
    
    const headerToken = this.advance();
    examples.header = this.parseTableCells(headerToken.value);
    
    while (!this.isAtEnd() && this.currentToken()?.type === TokenType.TableRow) {
      const rowToken = this.advance();
      const cells = this.parseTableCells(rowToken.value);
      
      if (cells.length !== examples.header.length) {
        throw new ParseError(
          `Row has ${cells.length} cells but expected ${examples.header.length}`,
          rowToken.line,
          rowToken.column,
          this.filePath
        );
      }
      
      examples.rows.push(cells);
    }
    
    if (examples.rows.length === 0) {
      throw new ParseError(
        'Examples table must have at least one data row',
        examplesToken.line,
        examplesToken.column,
        this.filePath
      );
    }
    
    return examples;
  }
  
  private parseTags(): string[] {
    const tags: string[] = [];
    
    while (!this.isAtEnd() && this.currentToken()?.type === TokenType.TagLine) {
      const token = this.advance();
      tags.push(token.value);
    }
    
    if (tags.length > 0) {
      console.log('[GherkinParser] Parsed tags:', tags);
    }
    
    return tags;
  }
  
  private parseDescription(): string {
    const descriptionLines: string[] = [];
    
    while (!this.isAtEnd()) {
      const token = this.currentToken();
      
      if (!token) {
        break;
      }
      
      if (this.isKeywordToken(token)) {
        break;
      }
      
      if (token.type !== TokenType.Empty && token.type !== TokenType.Comment) {
        descriptionLines.push(token.value);
      }
      this.advance();
    }
    
    return descriptionLines.join('\n').trim();
  }
  
  private findLanguage(): string {
    for (const token of this.tokens) {
      if (token.type === TokenType.Comment && token.value.includes('language:')) {
        const match = token.value.match(/language:\s*(\w+)/i);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
    return 'en';
  }
  
  private isStepToken(type: TokenType): boolean {
    return type === TokenType.StepLine;
  }
  
  private isKeywordToken(token: Token): boolean {
    return [
      TokenType.FeatureLine,
      TokenType.BackgroundLine,
      TokenType.ScenarioLine,
      TokenType.ScenarioOutlineLine,
      TokenType.ExamplesLine,
      TokenType.StepLine
    ].includes(token.type);
  }
  
  private getStepKeyword(token: Token): string {
    if ('keyword' in token && typeof token.keyword === 'string') {
      return token.keyword;
    }
    
    const value = token.value.toLowerCase();
    if (value.startsWith('given')) return 'Given';
    if (value.startsWith('when')) return 'When';
    if (value.startsWith('then')) return 'Then';
    if (value.startsWith('and')) return 'And';
    if (value.startsWith('but')) return 'But';
    
    return 'Given';
  }
  
  private currentToken(): Token | null {
    if (this.currentIndex >= this.tokens.length) {
      return null;
    }
    return this.tokens[this.currentIndex] || null;
  }
  
  private peekToken(offset: number = 1): Token | null {
    const index = this.currentIndex + offset;
    if (index >= this.tokens.length) {
      return null;
    }
    return this.tokens[index] || null;
  }
  
  private advance(): Token {
    const token = this.currentToken();
    if (!token) {
      throw new ParseError(
        'Unexpected end of file',
        0,
        0,
        this.filePath
      );
    }
    this.currentIndex++;
    return token;
  }
  
  private expectToken(_type: TokenType): Token | null {
    while (!this.isAtEnd()) {
      const token = this.currentToken();
      if (!token) {
        return null;
      }
      
      if (token.type === _type) {
        return token;
      }
      
      if (token.type === TokenType.Comment || 
          token.type === TokenType.Empty) {
        this.advance();
      } else {
        return null;
      }
    }
    return null;
  }
  
  private isAtEnd(): boolean {
    return this.currentIndex >= this.tokens.length;
  }
}
