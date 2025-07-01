// src/core/ai/nlp/KeywordExtractor.ts
import { ActionLogger } from '../../logging/ActionLogger';
import { Keyword, KeywordType } from '../types/ai.types';

interface KeywordWeight {
  weight: number;
  frequency: number;
  position: number;
  context: string[];
}

interface KeywordDatabase {
  elementTypes: Set<string>;
  actions: Set<string>;
  attributes: Set<string>;
  modifiers: Set<string>;
  positions: Set<string>;
}

export class KeywordExtractor {
  private static instance: KeywordExtractor;
  private keywordDatabase: KeywordDatabase;
  private documentFrequency: Map<string, number>;
  private totalDocuments: number = 0;
  
  private readonly elementPatterns = new Map<string, RegExp>([
    ['button', /\b(button|btn|click|submit|save|cancel|close|ok)\b/i],
    ['input', /\b(input|field|text|textbox|search|email|password|username)\b/i],
    ['link', /\b(link|href|anchor|navigate|go\s+to)\b/i],
    ['dropdown', /\b(dropdown|select|combo|list|menu|option)\b/i],
    ['checkbox', /\b(checkbox|check|tick|mark|toggle)\b/i],
    ['radio', /\b(radio|option|choice|select\s+one)\b/i],
    ['tab', /\b(tab|panel|section|view)\b/i],
    ['modal', /\b(modal|popup|dialog|overlay|window)\b/i],
    ['table', /\b(table|grid|row|column|cell)\b/i],
    ['image', /\b(image|img|picture|photo|icon)\b/i],
    ['video', /\b(video|player|media|watch)\b/i],
    ['form', /\b(form|submit|fill|complete)\b/i]
  ]);

  private readonly actionPatterns = new Map<string, RegExp>([
    ['click', /\b(click|tap|press|push|hit)\b/i],
    ['type', /\b(type|enter|input|fill|write|insert)\b/i],
    ['select', /\b(select|choose|pick|opt|set)\b/i],
    ['hover', /\b(hover|mouse\s+over|point|float)\b/i],
    ['scroll', /\b(scroll|swipe|move|navigate)\b/i],
    ['wait', /\b(wait|pause|delay|load|appear)\b/i],
    ['validate', /\b(validate|verify|check|assert|ensure|should)\b/i],
    ['drag', /\b(drag|drop|move|pull|push)\b/i],
    ['upload', /\b(upload|attach|browse|file)\b/i],
    ['download', /\b(download|save|export|get)\b/i]
  ]);

  private readonly attributePatterns = new Map<string, RegExp>([
    ['visible', /\b(visible|shown|displayed|appear)\b/i],
    ['enabled', /\b(enabled|active|clickable|available)\b/i],
    ['disabled', /\b(disabled|inactive|locked|unavailable)\b/i],
    ['required', /\b(required|mandatory|must|necessary)\b/i],
    ['optional', /\b(optional|can|may|possible)\b/i],
    ['readonly', /\b(readonly|read\s+only|locked|uneditable)\b/i],
    ['selected', /\b(selected|chosen|picked|highlighted)\b/i],
    ['checked', /\b(checked|ticked|marked|on)\b/i],
    ['unchecked', /\b(unchecked|unticked|unmarked|off)\b/i]
  ]);

  private readonly positionPatterns = new Map<string, RegExp>([
    ['top', /\b(top|upper|above|over)\b/i],
    ['bottom', /\b(bottom|lower|below|under)\b/i],
    ['left', /\b(left|start|beginning)\b/i],
    ['right', /\b(right|end|ending)\b/i],
    ['center', /\b(center|middle|central)\b/i],
    ['first', /\b(first|1st|initial|beginning)\b/i],
    ['last', /\b(last|final|end)\b/i],
    ['next', /\b(next|following|after)\b/i],
    ['previous', /\b(previous|prev|before|prior)\b/i]
  ]);

  private readonly modifierPatterns = new Map<string, RegExp>([
    ['red', /\b(red|danger|error|alert)\b/i],
    ['green', /\b(green|success|ok|good)\b/i],
    ['blue', /\b(blue|info|information|primary)\b/i],
    ['yellow', /\b(yellow|warning|caution)\b/i],
    ['large', /\b(large|big|huge|major)\b/i],
    ['small', /\b(small|tiny|minor|little)\b/i],
    ['new', /\b(new|create|add|plus)\b/i],
    ['old', /\b(old|existing|current)\b/i],
    ['main', /\b(main|primary|principal|major)\b/i],
    ['secondary', /\b(secondary|alternate|backup)\b/i]
  ]);

  private constructor() {
    this.keywordDatabase = {
      elementTypes: new Set([
        'button', 'input', 'link', 'dropdown', 'checkbox', 'radio',
        'tab', 'modal', 'table', 'image', 'video', 'form', 'label',
        'menu', 'list', 'item', 'header', 'footer', 'sidebar',
        'navigation', 'breadcrumb', 'pagination', 'card', 'badge',
        'tooltip', 'notification', 'alert', 'progress', 'spinner'
      ]),
      actions: new Set([
        'click', 'type', 'select', 'hover', 'scroll', 'wait',
        'validate', 'drag', 'drop', 'upload', 'download', 'clear',
        'focus', 'blur', 'submit', 'cancel', 'open', 'close',
        'expand', 'collapse', 'toggle', 'refresh', 'navigate'
      ]),
      attributes: new Set([
        'visible', 'enabled', 'disabled', 'required', 'optional',
        'readonly', 'selected', 'checked', 'unchecked', 'hidden',
        'active', 'inactive', 'valid', 'invalid', 'empty', 'filled'
      ]),
      modifiers: new Set([
        'red', 'green', 'blue', 'yellow', 'primary', 'secondary',
        'large', 'small', 'new', 'old', 'main', 'first', 'last',
        'next', 'previous', 'current', 'default', 'custom'
      ]),
      positions: new Set([
        'top', 'bottom', 'left', 'right', 'center', 'first',
        'last', 'next', 'previous', 'above', 'below', 'beside',
        'near', 'far', 'inside', 'outside', 'between'
      ])
    };

    this.documentFrequency = new Map();
    this.initializeFrequencies();
  }

  public static getInstance(): KeywordExtractor {
    if (!KeywordExtractor.instance) {
      KeywordExtractor.instance = new KeywordExtractor();
    }
    return KeywordExtractor.instance;
  }

  private initializeFrequencies(): void {
    const commonTerms = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'are',
      'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'should', 'could', 'may',
      'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ];

    commonTerms.forEach(term => {
      this.documentFrequency.set(term, 0.9);
    });

    this.keywordDatabase.elementTypes.forEach(type => {
      this.documentFrequency.set(type, 0.3);
    });

    this.keywordDatabase.actions.forEach(action => {
      this.documentFrequency.set(action, 0.25);
    });

    this.keywordDatabase.attributes.forEach(attr => {
      this.documentFrequency.set(attr, 0.35);
    });

    this.totalDocuments = 1000;
  }

  public async extractKeywords(text: string): Promise<Keyword[]> {
    const startTime = Date.now();
    ActionLogger.logAIOperation('keyword-extraction start', { textLength: text.length });

    try {
      const normalizedText = this.normalizeText(text);
      
      const candidates = this.extractCandidates(normalizedText);
      
      const weightedKeywords = this.calculateKeywordWeights(candidates, normalizedText);
      
      const keywords = this.createKeywords(weightedKeywords, text);
      
      const rankedKeywords = this.rankKeywords(keywords);
      
      ActionLogger.logAIOperation('keyword-extraction complete', {
        duration: Date.now() - startTime,
        keywordCount: rankedKeywords.length
      });

      return rankedKeywords;
    } catch (error) {
      ActionLogger.logError('Keyword extraction failed', error as Error);
      throw error;
    }
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractCandidates(text: string): Map<string, number> {
    const candidates = new Map<string, number>();
    const words = text.split(/\s+/);
    
    words.forEach((word, _index) => {
      if (this.isValidCandidate(word)) {
        candidates.set(word, (candidates.get(word) || 0) + 1);
      }
    });

    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      const word1 = words[i];
      const word2 = words[i + 1];
      if (word1 && word2 && this.isValidBigram(word1, word2)) {
        candidates.set(bigram, (candidates.get(bigram) || 0) + 1);
      }
    }

    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const word1 = words[i];
      const word2 = words[i + 1];
      const word3 = words[i + 2];
      if (word1 && word2 && word3 && this.isValidTrigram(word1, word2, word3)) {
        candidates.set(trigram, (candidates.get(trigram) || 0) + 1);
      }
    }

    return candidates;
  }

  private isValidCandidate(word: string): boolean {
    if (word.length < 3) return false;
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'are'
    ]);
    
    if (stopWords.has(word)) return false;
    
    if (this.isDomainKeyword(word)) return true;
    
    if (this.matchesAnyPattern(word)) return true;
    
    if (/\d/.test(word) || /^[a-z]+[-_][a-z]+$/i.test(word)) return true;
    
    return true;
  }

  private isValidBigram(word1: string, word2: string): boolean {
    const validBigrams = new Set([
      'sign in', 'sign up', 'log in', 'log out',
      'save button', 'cancel button', 'submit button',
      'text field', 'input field', 'search box',
      'drop down', 'check box', 'radio button',
      'error message', 'success message', 'warning message',
      'main menu', 'side bar', 'nav bar',
      'first name', 'last name', 'email address',
      'phone number', 'user name', 'pass word'
    ]);

    const bigram = `${word1} ${word2}`;
    if (validBigrams.has(bigram)) return true;

    if (this.keywordDatabase.elementTypes.has(word2) && 
        (this.keywordDatabase.modifiers.has(word1) || this.keywordDatabase.positions.has(word1))) {
      return true;
    }

    if (this.keywordDatabase.actions.has(word1) && this.keywordDatabase.elementTypes.has(word2)) {
      return true;
    }

    return false;
  }

  private isValidTrigram(word1: string, word2: string, word3: string): boolean {
    const validTrigrams = new Set([
      'create new account', 'forgot your password',
      'remember my credentials', 'terms and conditions',
      'save and continue', 'save and close'
    ]);

    const trigram = `${word1} ${word2} ${word3}`;
    return validTrigrams.has(trigram);
  }

  private isDomainKeyword(word: string): boolean {
    return this.keywordDatabase.elementTypes.has(word) ||
           this.keywordDatabase.actions.has(word) ||
           this.keywordDatabase.attributes.has(word) ||
           this.keywordDatabase.modifiers.has(word) ||
           this.keywordDatabase.positions.has(word);
  }

  private matchesAnyPattern(word: string): boolean {
    const elementPatternsArray = Array.from(this.elementPatterns.values());
    for (const pattern of elementPatternsArray) {
      if (pattern.test(word)) return true;
    }
    const actionPatternsArray = Array.from(this.actionPatterns.values());
    for (const pattern of actionPatternsArray) {
      if (pattern.test(word)) return true;
    }
    const attributePatternsArray = Array.from(this.attributePatterns.values());
    for (const pattern of attributePatternsArray) {
      if (pattern.test(word)) return true;
    }
    const positionPatternsArray = Array.from(this.positionPatterns.values());
    for (const pattern of positionPatternsArray) {
      if (pattern.test(word)) return true;
    }
    const modifierPatternsArray = Array.from(this.modifierPatterns.values());
    for (const pattern of modifierPatternsArray) {
      if (pattern.test(word)) return true;
    }
    return false;
  }

  private calculateKeywordWeights(
    candidates: Map<string, number>,
    normalizedText: string
  ): Map<string, KeywordWeight> {
    const weights = new Map<string, KeywordWeight>();
    const words = normalizedText.split(/\s+/);
    
    candidates.forEach((frequency, keyword) => {
      const weight = this.calculateWeight(keyword, frequency, words, normalizedText);
      weights.set(keyword, weight);
    });

    return weights;
  }

  private calculateWeight(
    keyword: string,
    frequency: number,
    words: string[],
    text: string
  ): KeywordWeight {
    const tf = frequency / words.length;
    const idf = Math.log(this.totalDocuments / (1 + (this.documentFrequency.get(keyword) || 0.1)));
    const tfidf = tf * idf;

    const firstOccurrence = text.indexOf(keyword);
    const positionWeight = 1 - (firstOccurrence / text.length) * 0.3;

    let domainWeight = 1;
    if (this.keywordDatabase.elementTypes.has(keyword)) domainWeight = 2.5;
    else if (this.keywordDatabase.actions.has(keyword)) domainWeight = 2.3;
    else if (this.keywordDatabase.attributes.has(keyword)) domainWeight = 2.0;
    else if (this.keywordDatabase.positions.has(keyword)) domainWeight = 1.8;
    else if (this.keywordDatabase.modifiers.has(keyword)) domainWeight = 1.5;

    const patternWeight = this.getPatternWeight(keyword);

    const lengthWeight = keyword.split(' ').length > 1 ? 1.3 : 1;

    const finalWeight = (tfidf * 0.3 + 
                        positionWeight * 0.2 + 
                        domainWeight * 0.3 + 
                        patternWeight * 0.15 + 
                        lengthWeight * 0.05) * frequency;

    const context = this.extractContext(keyword, text);

    return {
      weight: finalWeight,
      frequency,
      position: firstOccurrence,
      context
    };
  }

  private getPatternWeight(keyword: string): number {
    let maxWeight = 1;

    const checkPatterns = (patterns: Map<string, RegExp>, weight: number) => {
      const patternsArray = Array.from(patterns.values());
      for (const pattern of patternsArray) {
        if (pattern.test(keyword)) {
          maxWeight = Math.max(maxWeight, weight);
        }
      }
    };

    checkPatterns(this.elementPatterns, 2.2);
    checkPatterns(this.actionPatterns, 2.0);
    checkPatterns(this.attributePatterns, 1.8);
    checkPatterns(this.positionPatterns, 1.6);
    checkPatterns(this.modifierPatterns, 1.4);

    return maxWeight;
  }

  private extractContext(keyword: string, text: string): string[] {
    const context: string[] = [];
    const keywordIndex = text.indexOf(keyword);
    
    if (keywordIndex === -1) return context;

    const words = text.split(/\s+/);
    const keywordWords = keyword.split(/\s+/);
    
    let wordIndex = -1;
    for (let i = 0; i < words.length; i++) {
      if (words.slice(i, i + keywordWords.length).join(' ') === keyword) {
        wordIndex = i;
        break;
      }
    }

    if (wordIndex !== -1) {
      const start = Math.max(0, wordIndex - 2);
      const end = Math.min(words.length, wordIndex + keywordWords.length + 2);
      
      for (let i = start; i < wordIndex; i++) {
        const word = words[i];
        if (word) {
          context.push(word);
        }
      }
      
      for (let i = wordIndex + keywordWords.length; i < end; i++) {
        const word = words[i];
        if (word) {
          context.push(word);
        }
      }
    }

    return context;
  }

  private createKeywords(
    weightedKeywords: Map<string, KeywordWeight>,
    _originalText: string
  ): Keyword[] {
    const keywords: Keyword[] = [];

    weightedKeywords.forEach((weightInfo, keyword) => {
      const type = this.identifyKeywordType(keyword);
      
      keywords.push({
        word: keyword,
        type,
        score: weightInfo.weight,
        weight: weightInfo.weight,
        frequency: weightInfo.frequency,
        position: weightInfo.position,
        context: weightInfo.context,
        confidence: Math.min(weightInfo.weight / 10, 1),
        source: 'extracted'
      });
    });

    return keywords;
  }

  private identifyKeywordType(keyword: string): KeywordType {
    if (this.keywordDatabase.elementTypes.has(keyword) || 
        this.matchesElementPattern(keyword)) {
      return 'element';
    }
    
    if (this.keywordDatabase.actions.has(keyword) || 
        this.matchesActionPattern(keyword)) {
      return 'action';
    }
    
    if (this.keywordDatabase.attributes.has(keyword) || 
        this.matchesAttributePattern(keyword)) {
      return 'attribute';
    }
    
    if (this.keywordDatabase.positions.has(keyword) || 
        this.matchesPositionPattern(keyword)) {
      return 'position';
    }
    
    if (this.keywordDatabase.modifiers.has(keyword) || 
        this.matchesModifierPattern(keyword)) {
      return 'modifier';
    }

    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(keyword) && keyword.length > 3) {
      return 'identifier';
    }

    return 'value';
  }

  private matchesElementPattern(keyword: string): boolean {
    const patternsArray = Array.from(this.elementPatterns.values());
    for (const pattern of patternsArray) {
      if (pattern.test(keyword)) return true;
    }
    return false;
  }

  private matchesActionPattern(keyword: string): boolean {
    const patternsArray = Array.from(this.actionPatterns.values());
    for (const pattern of patternsArray) {
      if (pattern.test(keyword)) return true;
    }
    return false;
  }

  private matchesAttributePattern(keyword: string): boolean {
    const patternsArray = Array.from(this.attributePatterns.values());
    for (const pattern of patternsArray) {
      if (pattern.test(keyword)) return true;
    }
    return false;
  }

  private matchesPositionPattern(keyword: string): boolean {
    const patternsArray = Array.from(this.positionPatterns.values());
    for (const pattern of patternsArray) {
      if (pattern.test(keyword)) return true;
    }
    return false;
  }

  private matchesModifierPattern(keyword: string): boolean {
    const patternsArray = Array.from(this.modifierPatterns.values());
    for (const pattern of patternsArray) {
      if (pattern.test(keyword)) return true;
    }
    return false;
  }

  public rankKeywords(keywords: Keyword[]): Keyword[] {
    const ranked = keywords.sort((a, b) => {
      const weightA = a.weight ?? a.score ?? 0;
      const weightB = b.weight ?? b.score ?? 0;
      return weightB - weightA;
    });
    
    const diversified = this.diversifyKeywords(ranked);
    
    const maxKeywords = Math.min(20, Math.ceil(keywords.length * 0.4));
    
    return diversified.slice(0, maxKeywords);
  }

  private diversifyKeywords(keywords: Keyword[]): Keyword[] {
    const diversified: Keyword[] = [];
    const typeCount = new Map<KeywordType, number>();
    const maxPerType = 3;

    for (const keyword of keywords) {
      const count = typeCount.get(keyword.type) || 0;
      const keywordWeight = keyword.weight ?? keyword.score ?? 0;
      const firstKeyword = keywords[0];
      const firstWeight = firstKeyword ? (firstKeyword.weight ?? firstKeyword.score ?? 0) : 0;
      
      if (count < maxPerType || keywordWeight > firstWeight * 0.7) {
        diversified.push(keyword);
        typeCount.set(keyword.type, count + 1);
      }
    }

    for (const keyword of keywords) {
      if (!diversified.includes(keyword) && diversified.length < 20) {
        diversified.push(keyword);
      }
    }

    return diversified;
  }

  public identifyElementKeywords(text: string): string[] {
    const keywords = this.extractKeywordsSync(text);
    return keywords
      .filter(k => k.type === 'element')
      .map(k => k.word);
  }

  public extractActionKeywords(text: string): string[] {
    const keywords = this.extractKeywordsSync(text);
    return keywords
      .filter(k => k.type === 'action')
      .map(k => k.word);
  }

  private extractKeywordsSync(text: string): Keyword[] {
    const normalizedText = this.normalizeText(text);
    const candidates = this.extractCandidates(normalizedText);
    const weightedKeywords = this.calculateKeywordWeights(candidates, normalizedText);
    const keywords = this.createKeywords(weightedKeywords, text);
    return this.rankKeywords(keywords);
  }

  public getKeywordWeight(keyword: string): number {
    const normalizedKeyword = keyword.toLowerCase();
    
    if (this.keywordDatabase.elementTypes.has(normalizedKeyword)) return 2.5;
    if (this.keywordDatabase.actions.has(normalizedKeyword)) return 2.3;
    if (this.keywordDatabase.attributes.has(normalizedKeyword)) return 2.0;
    if (this.keywordDatabase.positions.has(normalizedKeyword)) return 1.8;
    if (this.keywordDatabase.modifiers.has(normalizedKeyword)) return 1.5;
    
    return this.getPatternWeight(normalizedKeyword);
  }

  public updateKeywordFrequency(keyword: string, documentCount: number): void {
    const current = this.documentFrequency.get(keyword.toLowerCase()) || 0;
    this.documentFrequency.set(keyword.toLowerCase(), current + documentCount);
    this.totalDocuments += documentCount;
  }

  public addDomainKeyword(keyword: string, type: KeywordType): void {
    const normalizedKeyword = keyword.toLowerCase();
    
    switch (type) {
      case 'element':
        this.keywordDatabase.elementTypes.add(normalizedKeyword);
        break;
      case 'action':
        this.keywordDatabase.actions.add(normalizedKeyword);
        break;
      case 'attribute':
        this.keywordDatabase.attributes.add(normalizedKeyword);
        break;
      case 'position':
        this.keywordDatabase.positions.add(normalizedKeyword);
        break;
      case 'modifier':
        this.keywordDatabase.modifiers.add(normalizedKeyword);
        break;
    }
    
    this.documentFrequency.set(normalizedKeyword, 0.3);
  }

  public exportKeywordDatabase(): any {
    return {
      elementTypes: Array.from(this.keywordDatabase.elementTypes),
      actions: Array.from(this.keywordDatabase.actions),
      attributes: Array.from(this.keywordDatabase.attributes),
      modifiers: Array.from(this.keywordDatabase.modifiers),
      positions: Array.from(this.keywordDatabase.positions),
      documentFrequency: Array.from(this.documentFrequency.entries()),
      totalDocuments: this.totalDocuments
    };
  }

  public importKeywordDatabase(data: any): void {
    if (data.elementTypes) {
      this.keywordDatabase.elementTypes = new Set(data.elementTypes);
    }
    if (data.actions) {
      this.keywordDatabase.actions = new Set(data.actions);
    }
    if (data.attributes) {
      this.keywordDatabase.attributes = new Set(data.attributes);
    }
    if (data.modifiers) {
      this.keywordDatabase.modifiers = new Set(data.modifiers);
    }
    if (data.positions) {
      this.keywordDatabase.positions = new Set(data.positions);
    }
    if (data.documentFrequency) {
      this.documentFrequency = new Map(data.documentFrequency);
    }
    if (data.totalDocuments) {
      this.totalDocuments = data.totalDocuments;
    }
  }
}
