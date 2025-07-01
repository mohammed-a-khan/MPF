// src/core/ai/nlp/NaturalLanguageProcessor.ts

import { TokenAnalyzer } from './TokenAnalyzer';
import { SentenceParser } from './SentenceParser';
import { KeywordExtractor } from './KeywordExtractor';
import { IntentClassifier } from './IntentClassifier';
import { ActionLogger } from '../../logging/ActionLogger';
import { NLPResult, UIPattern } from '../types/ai.types';

interface ElementDescriptionAnalysis {
  mainSubject: string;
  modifiers: string[];
  attributes: Record<string, string>;
  relationships: ElementRelationship[];
  confidence: number;
}

interface ElementRelationship {
  type: string;
  target: string;
}

export class NaturalLanguageProcessor {
  private readonly tokenAnalyzer: TokenAnalyzer;
  private readonly sentenceParser: SentenceParser;
  private readonly keywordExtractor: KeywordExtractor;
  private readonly intentClassifier: IntentClassifier;
  
  constructor() {
    this.tokenAnalyzer = new TokenAnalyzer();
    this.sentenceParser = new SentenceParser();
    this.keywordExtractor = KeywordExtractor.getInstance();
    this.intentClassifier = IntentClassifier.getInstance();
  }
  
  async processDescription(description: string): Promise<NLPResult> {
    const startTime = Date.now();
    
    try {
      const tokens = this.tokenAnalyzer.tokenize(description);
      
      const parseTree = this.sentenceParser.parseSentence(tokens);
      
      const keywords = await this.keywordExtractor.extractKeywords(description);
      
      const intent = await this.intentClassifier.classifyIntent(description);
      const actionType = this.intentClassifier.identifyAction(intent);
      const targetType = this.intentClassifier.identifyTarget(intent);
      
      const mappedIntent = this.mapActionTypeToNLPIntent(actionType);
      const result: NLPResult = {
        intent: mappedIntent,
        elementType: this.identifyElementType(description, parseTree),
        keywords: keywords.map(k => k.word),
        exactText: this.extractExactText(description),
        semanticTokens: this.extractSemanticTokens(tokens),
        expectedRoles: this.identifyExpectedRoles(targetType),
        expectsInteractive: this.isInteractiveIntent(actionType),
        expectsVisible: true,
        formElement: this.isFormElement(targetType),
        expectedPosition: this.extractPosition(description),
        positionKeywords: this.extractPositionKeywords(description),
        parentContext: this.extractParentContext(description),
        siblingContext: this.extractSiblingContext(description),
        formContext: this.hasFormContext(description),
        pattern: this.identifyUIPattern(description, targetType)
      };
      
      const duration = Date.now() - startTime;
      ActionLogger.logAIOperation('nlp_processing_complete', {
        description,
        intent: result.intent,
        elementType: result.elementType,
        keywords: result.keywords,
        duration
      });
      
      return result;
      
    } catch (error) {
      ActionLogger.logError('NLP processing failed', error);
      throw error;
    }
  }
  
  quickProcess(description: string): NLPResult {
    const keywords = description.toLowerCase().split(/\s+/);
    
    return {
      intent: 'click',
      keywords,
      expectsInteractive: true,
      expectsVisible: true
    };
  }
  
  private identifyElementType(description: string, _parseTree: any): string | undefined {
    const lowerDesc = description.toLowerCase();
    
    const elementTypes: Record<string, string[]> = {
      button: ['button', 'btn', 'submit', 'click'],
      link: ['link', 'hyperlink', 'anchor'],
      input: ['input', 'field', 'textbox', 'text box'],
      dropdown: ['dropdown', 'select', 'combobox', 'combo box'],
      checkbox: ['checkbox', 'check box', 'check'],
      radio: ['radio', 'radio button', 'option'],
      image: ['image', 'img', 'picture', 'photo'],
      text: ['text', 'label', 'heading', 'title'],
      table: ['table', 'grid', 'data table'],
      list: ['list', 'menu', 'items']
    };
    
    for (const [type, patterns] of Object.entries(elementTypes)) {
      for (const pattern of patterns) {
        if (lowerDesc.includes(pattern)) {
          return type;
        }
      }
    }
    
    if (lowerDesc.includes('click') || lowerDesc.includes('press')) {
      return 'button';
    }
    
    if (lowerDesc.includes('type') || lowerDesc.includes('enter')) {
      return 'input';
    }
    
    if (lowerDesc.includes('select') || lowerDesc.includes('choose')) {
      return 'dropdown';
    }
    
    return undefined;
  }
  
  private extractExactText(description: string): string | undefined {
    const singleQuoteMatch = description.match(/'([^']+)'/);
    if (singleQuoteMatch) return singleQuoteMatch[1];
    
    const doubleQuoteMatch = description.match(/"([^"]+)"/);
    if (doubleQuoteMatch) return doubleQuoteMatch[1];
    
    const patterns = [
      /text\s+["']?([^"']+)["']?/i,
      /labeled\s+["']?([^"']+)["']?/i,
      /named\s+["']?([^"']+)["']?/i,
      /with\s+text\s+["']?([^"']+)["']?/i,
      /containing\s+["']?([^"']+)["']?/i
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    
    return undefined;
  }
  
  private extractSemanticTokens(tokens: any[]): string[] {
    return tokens
      .filter(token => 
        token.type === 'word' && 
        token.value.length > 2 &&
        !this.tokenAnalyzer.isStopWord(token.value)
      )
      .map(token => token.value.toLowerCase());
  }
  
  private identifyExpectedRoles(targetType: string): string[] {
    const roleMap: Record<string, string[]> = {
      button: ['button'],
      link: ['link'],
      input: ['textbox', 'searchbox'],
      dropdown: ['combobox', 'listbox'],
      checkbox: ['checkbox'],
      radio: ['radio'],
      navigation: ['navigation'],
      menu: ['menu', 'menubar', 'menuitem']
    };
    
    return roleMap[targetType] || [];
  }
  
  private mapActionTypeToNLPIntent(actionType: string): 'click' | 'type' | 'select' | 'check' | 'navigate' | 'validate' {
    const mapping: Record<string, 'click' | 'type' | 'select' | 'check' | 'navigate' | 'validate'> = {
      'click': 'click',
      'type': 'type',
      'select': 'select',
      'check': 'check',
      'uncheck': 'check',
      'navigate': 'navigate',
      'assert': 'validate',
      'assertVisible': 'validate',
      'assertText': 'validate',
      'assertEnabled': 'validate',
      'assertDisabled': 'validate',
      'assertExists': 'validate',
      'assertNotExists': 'validate',
      'assertContains': 'validate',
      'assertCount': 'validate'
    };
    
    return mapping[actionType] || 'click';
  }
  
  private isInteractiveIntent(actionType: string): boolean {
    const interactiveActions = ['click', 'type', 'select', 'check', 'navigate'];
    return interactiveActions.includes(actionType);
  }
  
  private isFormElement(targetType: string): boolean {
    const formElements = ['input', 'dropdown', 'checkbox', 'radio', 'textarea'];
    return formElements.includes(targetType);
  }
  
  private extractPosition(description: string): string | undefined {
    const lowerDesc = description.toLowerCase();
    
    const positions = ['top', 'bottom', 'left', 'right', 'center', 'middle'];
    for (const position of positions) {
      if (lowerDesc.includes(position)) {
        return position;
      }
    }
    
    if (lowerDesc.match(/first|1st/)) return 'first';
    if (lowerDesc.match(/second|2nd/)) return 'second';
    if (lowerDesc.match(/third|3rd/)) return 'third';
    if (lowerDesc.match(/last/)) return 'last';
    
    return undefined;
  }
  
  private extractPositionKeywords(description: string): string[] {
    const keywords: string[] = [];
    const lowerDesc = description.toLowerCase();
    
    const positionWords = [
      'top', 'bottom', 'left', 'right', 'center', 'middle',
      'above', 'below', 'next to', 'near', 'beside',
      'first', 'last', 'second', 'third'
    ];
    
    for (const word of positionWords) {
      if (lowerDesc.includes(word)) {
        keywords.push(word);
      }
    }
    
    return keywords;
  }
  
  private extractParentContext(description: string): string | undefined {
    const patterns = [
      /in\s+the\s+(\w+)/i,
      /inside\s+(\w+)/i,
      /within\s+(\w+)/i,
      /under\s+(\w+)/i
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) return match[1];
    }
    
    return undefined;
  }
  
  private extractSiblingContext(description: string): string | undefined {
    const patterns = [
      /next\s+to\s+["']?([^"']+)["']?/i,
      /beside\s+["']?([^"']+)["']?/i,
      /after\s+["']?([^"']+)["']?/i,
      /before\s+["']?([^"']+)["']?/i
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    
    return undefined;
  }
  
  private hasFormContext(description: string): boolean {
    const formKeywords = ['form', 'login', 'signup', 'register', 'submit'];
    const lowerDesc = description.toLowerCase();
    
    return formKeywords.some(keyword => lowerDesc.includes(keyword));
  }
  
  private identifyUIPattern(description: string, targetType: string): UIPattern | undefined {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('primary') && targetType === 'button') {
      return {
        name: 'primary-button',
        tags: ['button'],
        attributes: ['class*=primary'],
        weight: 1.2
      };
    }
    
    if (lowerDesc.includes('cancel') || lowerDesc.includes('close')) {
      return {
        name: 'cancel-button',
        tags: ['button', 'a'],
        attributes: ['class*=cancel', 'class*=close'],
        weight: 1.1
      };
    }
    
    if (lowerDesc.includes('navigation') || lowerDesc.includes('menu')) {
      return {
        name: 'navigation',
        tags: ['nav', 'ul', 'div'],
        attributes: ['role=navigation', 'class*=nav'],
        weight: 1.0
      };
    }
    
    if (lowerDesc.includes('search')) {
      return {
        name: 'search-input',
        tags: ['input'],
        attributes: ['type=search', 'placeholder*=search'],
        weight: 1.1
      };
    }
    
    return undefined;
  }
  
  async analyzeElementDescription(description: string): Promise<ElementDescriptionAnalysis> {
    const tokens = this.tokenAnalyzer.tokenize(description);
    const keywords = await this.keywordExtractor.extractKeywords(description);
    
    return {
      mainSubject: this.extractMainSubject(tokens),
      modifiers: this.extractModifiers(tokens),
      attributes: this.extractAttributes(description),
      relationships: this.extractRelationships(description),
      confidence: this.calculateDescriptionConfidence(description, keywords)
    };
  }
  
  private extractMainSubject(tokens: any[]): string {
    const nouns = tokens.filter(t => t.pos === 'NOUN');
    if (nouns.length > 0) {
      return nouns[nouns.length - 1].value;
    }
    
    const significantWords = tokens.filter(t => 
      t.type === 'word' && 
      t.value.length > 3 &&
      !this.tokenAnalyzer.isStopWord(t.value)
    );
    
    return significantWords.length > 0 ? significantWords[0].value : '';
  }
  
  private extractModifiers(tokens: any[]): string[] {
    return tokens
      .filter(t => t.pos === 'ADJ' || t.pos === 'ADV')
      .map(t => t.value);
  }
  
  private extractAttributes(description: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    
    const colorMatch = description.match(/(red|blue|green|yellow|black|white|gray|grey)/i);
    if (colorMatch && colorMatch[1]) {
      attributes['color'] = colorMatch[1].toLowerCase();
    }
    
    const sizeMatch = description.match(/(large|big|small|tiny|huge)/i);
    if (sizeMatch && sizeMatch[1]) {
      attributes['size'] = sizeMatch[1].toLowerCase();
    }
    
    const stateMatch = description.match(/(enabled|disabled|active|inactive|selected)/i);
    if (stateMatch && stateMatch[1]) {
      attributes['state'] = stateMatch[1].toLowerCase();
    }
    
    return attributes;
  }
  
  private extractRelationships(description: string): ElementRelationship[] {
    const relationships: ElementRelationship[] = [];
    
    const patterns = [
      { pattern: /above\s+(.+)/i, type: 'above' },
      { pattern: /below\s+(.+)/i, type: 'below' },
      { pattern: /left\s+of\s+(.+)/i, type: 'leftOf' },
      { pattern: /right\s+of\s+(.+)/i, type: 'rightOf' },
      { pattern: /next\s+to\s+(.+)/i, type: 'near' },
      { pattern: /inside\s+(.+)/i, type: 'inside' },
      { pattern: /within\s+(.+)/i, type: 'within' }
    ];
    
    for (const { pattern, type } of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        relationships.push({
          type,
          target: match[1].trim()
        });
      }
    }
    
    return relationships;
  }
  
  private calculateDescriptionConfidence(description: string, keywords: {word: string; score: number}[]): number {
    let confidence = 0.5;
    
    if (this.identifyElementType(description, {}) !== undefined) {
      confidence += 0.2;
    }
    
    if (this.extractExactText(description) !== undefined) {
      confidence += 0.2;
    }
    
    const highValueKeywords = keywords.filter(k => (k.score ?? 0) > 0.7);
    confidence += Math.min(highValueKeywords.length * 0.05, 0.1);
    
    return Math.min(confidence, 1.0);
  }
}

interface ElementDescriptionAnalysis {
  mainSubject: string;
  modifiers: string[];
  attributes: Record<string, string>;
  relationships: ElementRelationship[];
  confidence: number;
}

interface ElementRelationship {
  type: string;
  target: string;
}
