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
    // Skip initial comments and tags
    const featureTags = this.parseTags();
    
    // Find Feature token
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
    
    // Parse feature content
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
          // Don't call parseScenario here - it expects to parse tags first
          // Instead, we need to rewind if there are tags before this scenario
          const scenario = this.parseScenarioWithBacktrack();
          feature.scenarios.push(scenario);
          break;
          
        case TokenType.TagLine:
          // Skip orphaned tags
          this.advance();
          break;
          
        case TokenType.Comment:
          this.advance(); // Skip comments
          break;
          
        default:
          this.advance(); // Skip unknown tokens
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
    const backgroundToken = this.advance(); // Consume BACKGROUND token
    
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
    
    // Parse steps until we hit a scenario or end
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
    // Look back to find any tags that precede this scenario
    let tagStartIndex = this.currentIndex;
    
    // Backtrack to find the first tag
    while (tagStartIndex > 0) {
      const prevToken = this.tokens[tagStartIndex - 1];
      if (prevToken && prevToken.type === TokenType.TagLine) {
        tagStartIndex--;
      } else {
        break;
      }
    }
    
    // Save current position and reset to tag start
    const savedIndex = this.currentIndex;
    this.currentIndex = tagStartIndex;
    
    // Now parse the scenario normally (including its tags)
    const scenario = this.parseScenario();
    
    return scenario;
  }
  
  private parseScenario(): Scenario {
    // Parse scenario tags
    const scenarioTags = this.parseTags();
    
    const scenarioToken = this.advance(); // Consume SCENARIO or SCENARIO_OUTLINE
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
    
    // Parse steps
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
    
    // Parse examples for scenario outline
    if (isOutline && scenario.examples) {
      while (!this.isAtEnd()) {
        const token = this.currentToken();
        
        if (!token || token.type !== TokenType.ExamplesLine) {
          break;
        }
        
        const examples = this.parseExamples();
        scenario.examples.push(examples);
      }
      
      // Check if scenario has @DataProvider tag
      const hasDataProvider = scenario.tags.some(tag => 
        tag.startsWith('@DataProvider') || tag.includes('DataProvider(')
      );
      
      // Only require Examples if there's no @DataProvider
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
    
    // Check for data table or doc string
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
      // Parse table row value - it's a pipe-separated string
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
      // If it's a pipe-separated string, split it
      return value.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
    }
    // If it's already an array (shouldn't happen with our TokenType), return empty array
    return [];
  }
  
  private parseDocString(): DocString {
    const docStringToken = this.advance();
    
    // Extract content type if present
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
    const examplesToken = this.advance(); // Consume EXAMPLES token
    
    const examples: Examples = {
      name: examplesToken.value || 'Examples',
      description: '', // Don't parse description here as it would consume table tokens
      tags: [], // Tags would have been parsed before the Examples keyword
      header: [],
      rows: []
    };
    
    if (examplesToken.line !== undefined) {
      examples.line = examplesToken.line;
    }
    
    // Skip empty lines before the table
    while (!this.isAtEnd() && this.currentToken()?.type === TokenType.Empty) {
      this.advance();
    }
    
    // Parse the table
    const tableToken = this.currentToken();
    
    if (!tableToken || tableToken.type !== TokenType.TableRow) {
      throw new ParseError(
        'Examples must have a table',
        examplesToken.line,
        examplesToken.column,
        this.filePath
      );
    }
    
    // First row is headers
    const headerToken = this.advance();
    examples.header = this.parseTableCells(headerToken.value);
    
    // Remaining rows are data
    while (!this.isAtEnd() && this.currentToken()?.type === TokenType.TableRow) {
      const rowToken = this.advance();
      const cells = this.parseTableCells(rowToken.value);
      
      // Validate row has same number of cells as headers
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
      
      // Stop if we hit a keyword
      if (this.isKeywordToken(token)) {
        break;
      }
      
      // Only collect non-empty text tokens
      if (token.type !== TokenType.Empty && token.type !== TokenType.Comment) {
        descriptionLines.push(token.value);
      }
      this.advance();
    }
    
    return descriptionLines.join('\n').trim();
  }
  
  private findLanguage(): string {
    // Language is typically defined in a comment at the beginning
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
    // Extract keyword from token if available
    if ('keyword' in token && typeof token.keyword === 'string') {
      return token.keyword;
    }
    
    // Try to determine from the token value
    const value = token.value.toLowerCase();
    if (value.startsWith('given')) return 'Given';
    if (value.startsWith('when')) return 'When';
    if (value.startsWith('then')) return 'Then';
    if (value.startsWith('and')) return 'And';
    if (value.startsWith('but')) return 'But';
    
    return 'Given'; // Default fallback
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
      
      // Skip comments and empty lines
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