// src/core/ai/nlp/TokenAnalyzer.ts

import { ActionLogger } from '../../logging/ActionLogger';

export class TokenAnalyzer {
  private readonly stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for',
    'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
    'that', 'the', 'to', 'was', 'will', 'with', 'the', 'this',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'can', 'should'
  ]);
  
  private readonly contractions: Record<string, string> = {
    "can't": "cannot",
    "won't": "will not",
    "n't": " not",
    "'re": " are",
    "'ve": " have",
    "'ll": " will",
    "'d": " would",
    "'m": " am",
    "it's": "it is",
    "let's": "let us",
    "that's": "that is",
    "there's": "there is",
    "here's": "here is",
    "what's": "what is",
    "where's": "where is",
    "who's": "who is",
    "how's": "how is"
  };
  
  private readonly tokenPatterns = {
    word: /^[a-zA-Z]+$/,
    number: /^\d+(\.\d+)?$/,
    symbol: /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/,
    operator: /^(and|or|not|near|above|below|left|right)$/i,
    modifier: /^(very|extremely|slightly|somewhat|really)$/i
  };
  
  tokenize(text: string): Token[] {
    let processedText = this.expandContractions(text);
    
    const rawTokens = this.splitIntoTokens(processedText);
    
    const tokens: Token[] = [];
    
    for (let i = 0; i < rawTokens.length; i++) {
      const value = rawTokens[i];
      if (!value) continue;
      const token = this.createToken(value, i);
      
      if (token) {
        token.pos = this.tagPartOfSpeech(token, tokens);
        tokens.push(token);
      }
    }
    
    const finalTokens = this.processCompoundTokens(tokens);
    
    ActionLogger.logAIOperation('tokenization_complete', {
      inputLength: text.length,
      tokenCount: finalTokens.length
    });
    
    return finalTokens;
  }
  
  expandContractions(text: string): string {
    let expanded = text;
    
    for (const [contraction, expansion] of Object.entries(this.contractions)) {
      const regex = new RegExp(contraction.replace(/'/g, "'"), 'gi');
      expanded = expanded.replace(regex, expansion);
    }
    
    return expanded;
  }
  
  identifyTokenType(token: string): TokenType {
    const lowerToken = token.toLowerCase();
    
    if (this.tokenPatterns.word.test(token)) {
      if (this.tokenPatterns.operator.test(lowerToken)) {
        return 'operator';
      }
      if (this.tokenPatterns.modifier.test(lowerToken)) {
        return 'modifier';
      }
      return 'word';
    }
    
    if (this.tokenPatterns.number.test(token)) {
      return 'number';
    }
    
    if (this.tokenPatterns.symbol.test(token)) {
      return 'symbol';
    }
    
    return 'unknown';
  }
  
  removeStopWords(tokens: Token[]): Token[] {
    return tokens.filter(token => 
      token.type !== 'word' || 
      !this.stopWords.has(token.value.toLowerCase())
    );
  }
  
  stemToken(token: string): string {
    const lowerToken = token.toLowerCase();
    
    const suffixes = [
      { suffix: 'ing', minLength: 4 },
      { suffix: 'ed', minLength: 3 },
      { suffix: 'ly', minLength: 3 },
      { suffix: 'es', minLength: 3 },
      { suffix: 's', minLength: 2 }
    ];
    
    for (const { suffix, minLength } of suffixes) {
      if (lowerToken.endsWith(suffix) && lowerToken.length > minLength + suffix.length) {
        return lowerToken.slice(0, -suffix.length);
      }
    }
    
    return lowerToken;
  }
  
  isStopWord(word: string): boolean {
    return this.stopWords.has(word.toLowerCase());
  }
  
  private splitIntoTokens(text: string): string[] {
    const tokens: string[] = [];
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (char && /\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else if (char && /[.,!?;:()[\]{}'""]/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        if (char) {
          tokens.push(char);
        }
      } else if (char) {
        current += char;
      }
    }
    
    if (current) {
      tokens.push(current);
    }
    
    return tokens.filter(t => t.length > 0);
  }
  
  private createToken(value: string, position: number): Token | null {
    if (!value || value.trim().length === 0) {
      return null;
    }
    
    const type = this.identifyTokenType(value);
    const normalized = this.normalizeToken(value, type);
    
    return {
      value,
      type,
      position,
      normalized,
      stem: type === 'word' ? this.stemToken(value) : value,
      isStopWord: type === 'word' && this.isStopWord(value),
      pos: 'UNKNOWN'
    };
  }
  
  private normalizeToken(value: string, type: TokenType): string {
    switch (type) {
      case 'word':
      case 'operator':
      case 'modifier':
        return value.toLowerCase();
      case 'number':
        const num = parseFloat(value);
        return isNaN(num) ? value : num.toString();
      default:
        return value;
    }
  }
  
  private tagPartOfSpeech(token: Token, previousTokens: Token[]): PartOfSpeech {
    const value = token.value.toLowerCase();
    const prevToken = previousTokens[previousTokens.length - 1];
    
    if (['the', 'a', 'an', 'this', 'that', 'these', 'those'].includes(value)) {
      return 'DET';
    }
    
    if (['in', 'on', 'at', 'by', 'for', 'with', 'to', 'from', 'of', 'above', 'below', 'near'].includes(value)) {
      return 'PREP';
    }
    
    if (this.isVerb(value, prevToken)) {
      return 'VERB';
    }
    
    if (this.isAdjective(value, prevToken)) {
      return 'ADJ';
    }
    
    if (value.endsWith('ly') || ['very', 'really', 'quite', 'extremely'].includes(value)) {
      return 'ADV';
    }
    
    if (token.type === 'number') {
      return 'NUM';
    }
    
    if (token.type === 'word') {
      return 'NOUN';
    }
    
    return 'OTHER';
  }
  
  private isVerb(word: string, prevToken?: Token): boolean {
    const commonVerbs = [
      'click', 'press', 'type', 'enter', 'select', 'choose',
      'find', 'locate', 'search', 'navigate', 'go', 'open',
      'close', 'submit', 'save', 'cancel', 'delete', 'add',
      'remove', 'edit', 'update', 'create', 'is', 'are',
      'was', 'were', 'has', 'have', 'had', 'do', 'does'
    ];
    
    if (commonVerbs.includes(word)) {
      return true;
    }
    
    if (word.endsWith('ing') || word.endsWith('ed')) {
      return true;
    }
    
    if (prevToken && prevToken.value.toLowerCase() === 'to') {
      return true;
    }
    
    return false;
  }
  
  private isAdjective(word: string, prevToken?: Token): boolean {
    const commonAdjectives = [
      'red', 'blue', 'green', 'large', 'small', 'big', 'tiny',
      'first', 'last', 'second', 'third', 'primary', 'secondary',
      'main', 'new', 'old', 'active', 'inactive', 'enabled',
      'disabled', 'visible', 'hidden', 'selected', 'checked'
    ];
    
    if (commonAdjectives.includes(word)) {
      return true;
    }
    
    if (prevToken && ['the', 'a', 'an'].includes(prevToken.value.toLowerCase())) {
      return word.endsWith('ed') || word.endsWith('ing');
    }
    
    return false;
  }
  
  private processCompoundTokens(tokens: Token[]): Token[] {
    const processed: Token[] = [];
    let i = 0;
    
    while (i < tokens.length) {
      if (i < tokens.length - 1) {
        const currentToken = tokens[i];
        const nextToken = tokens[i + 1];
        if (currentToken && nextToken) {
          const compound = this.checkCompound(currentToken, nextToken);
          if (compound) {
            processed.push(compound);
            i += 2;
            continue;
          }
        }
      }
      
      const token = tokens[i];
      if (token) {
        processed.push(token);
      }
      i++;
    }
    
    return processed;
  }
  
  private checkCompound(token1: Token, token2: Token): Token | null {
    const combined = `${token1.value} ${token2.value}`.toLowerCase();
    
    const compounds = [
      'drop down', 'check box', 'radio button', 'text box',
      'combo box', 'submit button', 'cancel button', 'menu item',
      'navigation bar', 'status bar', 'tool bar', 'side bar'
    ];
    
    if (compounds.includes(combined)) {
      return {
        value: token1.value + '_' + token2.value,
        type: 'compound',
        position: token1.position,
        normalized: combined.replace(' ', '_'),
        stem: combined.replace(' ', '_'),
        isStopWord: false,
        pos: 'NOUN'
      };
    }
    
    return null;
  }
  
  analyzeTokenSequence(tokens: Token[]): TokenSequenceAnalysis {
    return {
      hasActionVerb: tokens.some(t => t.pos === 'VERB' && this.isActionVerb(t.value)),
      hasTargetNoun: tokens.some(t => t.pos === 'NOUN' && !t.isStopWord),
      hasModifier: tokens.some(t => t.type === 'modifier'),
      hasPosition: tokens.some(t => this.isPositionWord(t.value)),
      complexity: this.calculateComplexity(tokens)
    };
  }
  
  private isActionVerb(word: string): boolean {
    const actionVerbs = [
      'click', 'press', 'type', 'enter', 'select', 'choose',
      'tap', 'touch', 'swipe', 'drag', 'drop', 'scroll'
    ];
    
    return actionVerbs.includes(word.toLowerCase());
  }
  
  private isPositionWord(word: string): boolean {
    const positionWords = [
      'top', 'bottom', 'left', 'right', 'center', 'middle',
      'first', 'last', 'second', 'third', 'above', 'below',
      'next', 'previous', 'before', 'after'
    ];
    
    return positionWords.includes(word.toLowerCase());
  }
  
  private calculateComplexity(tokens: Token[]): number {
    let complexity = 0;
    
    complexity += Math.min(tokens.length / 10, 0.3);
    
    const meaningfulTokens = tokens.filter(t => !t.isStopWord);
    complexity += Math.min(meaningfulTokens.length / 5, 0.3);
    
    const compounds = tokens.filter(t => t.type === 'compound');
    complexity += compounds.length * 0.1;
    
    const operators = tokens.filter(t => t.type === 'operator');
    complexity += operators.length * 0.1;
    
    return Math.min(complexity, 1.0);
  }
}

export interface Token {
  value: string;
  type: TokenType;
  position: number;
  normalized: string;
  stem: string;
  isStopWord: boolean;
  pos: PartOfSpeech;
}

export type TokenType = 'word' | 'number' | 'symbol' | 'operator' | 'modifier' | 'compound' | 'unknown';

export type PartOfSpeech = 
  | 'NOUN'
  | 'VERB'
  | 'ADJ'
  | 'ADV'
  | 'PREP'
  | 'DET'
  | 'NUM'
  | 'OTHER'
  | 'UNKNOWN';

interface TokenSequenceAnalysis {
  hasActionVerb: boolean;
  hasTargetNoun: boolean;
  hasModifier: boolean;
  hasPosition: boolean;
  complexity: number;
}
