// src/core/ai/nlp/IntentClassifier.ts
import { ActionLogger } from '../../logging/ActionLogger';
import { Intent, IntentType, ActionType, TargetType } from '../types/ai.types';
import { KeywordExtractor } from './KeywordExtractor';

interface IntentPattern {
  pattern: RegExp;
  intent: IntentType;
  action: ActionType;
  confidence: number;
}

interface IntentFeatures {
  hasImperativeVerb: boolean;
  hasQuestionWord: boolean;
  hasModalVerb: boolean;
  hasNegation: boolean;
  verbPosition: number;
  sentenceType: 'declarative' | 'interrogative' | 'imperative' | 'exclamatory';
  actionKeywords: string[];
  targetKeywords: string[];
}

export class IntentClassifier {
  private static instance: IntentClassifier;
  private keywordExtractor: KeywordExtractor;
  
  // Intent patterns ordered by priority
  private readonly intentPatterns: IntentPattern[] = [
    // Interaction intents
    { pattern: /^(click|tap|press|push|hit)\s+(?:on\s+)?(.+)$/i, intent: 'interaction', action: 'click', confidence: 0.95 },
    { pattern: /^(type|enter|input|fill|write)\s+['"]?(.+?)['"]?\s+(?:in(?:to)?|on)\s+(.+)$/i, intent: 'interaction', action: 'type', confidence: 0.95 },
    { pattern: /^(select|choose|pick)\s+['"]?(.+?)['"]?\s+(?:from|in)\s+(.+)$/i, intent: 'interaction', action: 'select', confidence: 0.95 },
    { pattern: /^(check|tick|mark)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'check', confidence: 0.9 },
    { pattern: /^(uncheck|untick|unmark)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'uncheck', confidence: 0.9 },
    { pattern: /^(hover|mouse\s*over)\s+(?:on\s+)?(.+)$/i, intent: 'interaction', action: 'hover', confidence: 0.9 },
    { pattern: /^(scroll)\s+(?:to|into|down|up)\s+(.+)$/i, intent: 'interaction', action: 'scroll', confidence: 0.9 },
    { pattern: /^(drag|move)\s+(.+?)\s+(?:to|into|onto)\s+(.+)$/i, intent: 'interaction', action: 'drag', confidence: 0.9 },
    { pattern: /^(upload|attach)\s+(?:file\s+)?['"]?(.+?)['"]?$/i, intent: 'interaction', action: 'upload', confidence: 0.9 },
    { pattern: /^(download|save|export)\s+(.+)$/i, intent: 'interaction', action: 'download', confidence: 0.9 },
    { pattern: /^(clear|empty|delete)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'clear', confidence: 0.9 },
    { pattern: /^(focus|activate)\s+(?:on\s+)?(.+)$/i, intent: 'interaction', action: 'focus', confidence: 0.85 },
    { pattern: /^(blur|unfocus)\s+(?:from\s+)?(.+)$/i, intent: 'interaction', action: 'blur', confidence: 0.85 },
    { pattern: /^(submit|send)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'submit', confidence: 0.9 },
    { pattern: /^(cancel|close|dismiss)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'cancel', confidence: 0.9 },
    { pattern: /^(open|show|display)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'open', confidence: 0.9 },
    { pattern: /^(close|hide)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'close', confidence: 0.9 },
    { pattern: /^(expand|collapse|toggle)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'toggle', confidence: 0.85 },
    { pattern: /^(refresh|reload)\s+(?:the\s+)?(.+)$/i, intent: 'interaction', action: 'refresh', confidence: 0.9 },
    { pattern: /^(right\s*click|context\s*click)\s+(?:on\s+)?(.+)$/i, intent: 'interaction', action: 'rightclick', confidence: 0.95 },
    { pattern: /^(double\s*click|dbl\s*click)\s+(?:on\s+)?(.+)$/i, intent: 'interaction', action: 'doubleclick', confidence: 0.95 },
    
    // Validation intents
    { pattern: /^(?:verify|check|ensure|validate|assert|confirm)\s+(?:that\s+)?(.+?)\s+(?:is|are|has|have|should\s+be|equals?|contains?)\s+(.+)$/i, intent: 'validation', action: 'assert', confidence: 0.95 },
    { pattern: /^(.+?)\s+should\s+(?:be\s+)?(.+)$/i, intent: 'validation', action: 'assert', confidence: 0.9 },
    { pattern: /^(.+?)\s+(?:is|are)\s+(?:visible|displayed|shown)$/i, intent: 'validation', action: 'assertVisible', confidence: 0.95 },
    { pattern: /^(.+?)\s+(?:is|are)\s+(?:not\s+)?(?:visible|displayed|shown)$/i, intent: 'validation', action: 'assertNotVisible', confidence: 0.95 },
    { pattern: /^(.+?)\s+(?:is|are)\s+(?:enabled|clickable|active)$/i, intent: 'validation', action: 'assertEnabled', confidence: 0.95 },
    { pattern: /^(.+?)\s+(?:is|are)\s+(?:disabled|not\s+clickable|inactive)$/i, intent: 'validation', action: 'assertDisabled', confidence: 0.95 },
    { pattern: /^(.+?)\s+(?:has|have)\s+(?:text|value|content)\s+['"]?(.+?)['"]?$/i, intent: 'validation', action: 'assertText', confidence: 0.95 },
    { pattern: /^(.+?)\s+(?:contains?)\s+['"]?(.+?)['"]?$/i, intent: 'validation', action: 'assertContains', confidence: 0.9 },
    { pattern: /^count\s+(?:of\s+)?(.+?)\s+(?:is|equals?|should\s+be)\s+(\d+)$/i, intent: 'validation', action: 'assertCount', confidence: 0.9 },
    { pattern: /^(.+?)\s+(?:exists?|is\s+present)$/i, intent: 'validation', action: 'assertExists', confidence: 0.9 },
    { pattern: /^(.+?)\s+(?:does\s+not\s+exist|is\s+not\s+present|is\s+absent)$/i, intent: 'validation', action: 'assertNotExists', confidence: 0.9 },
    
    // Navigation intents
    { pattern: /^(?:go|navigate|browse)\s+(?:to\s+)?(.+)$/i, intent: 'navigation', action: 'navigate', confidence: 0.95 },
    { pattern: /^(?:visit|open)\s+(?:the\s+)?(.+?)\s+(?:page|url|link)$/i, intent: 'navigation', action: 'navigate', confidence: 0.95 },
    { pattern: /^(?:go\s+)?back$/i, intent: 'navigation', action: 'back', confidence: 0.95 },
    { pattern: /^(?:go\s+)?forward$/i, intent: 'navigation', action: 'forward', confidence: 0.95 },
    { pattern: /^refresh(?:\s+the\s+page)?$/i, intent: 'navigation', action: 'refresh', confidence: 0.95 },
    { pattern: /^switch\s+to\s+(.+?)\s+(?:tab|window|frame)$/i, intent: 'navigation', action: 'switch', confidence: 0.9 },
    
    // Wait intents
    { pattern: /^wait\s+(?:for\s+)?(.+?)\s+(?:to\s+be\s+)?(?:visible|appear|show)$/i, intent: 'wait', action: 'waitVisible', confidence: 0.95 },
    { pattern: /^wait\s+(?:for\s+)?(.+?)\s+(?:to\s+)?(?:disappear|hide|be\s+hidden)$/i, intent: 'wait', action: 'waitHidden', confidence: 0.95 },
    { pattern: /^wait\s+(?:for\s+)?(.+?)\s+(?:to\s+be\s+)?(?:enabled|clickable)$/i, intent: 'wait', action: 'waitEnabled', confidence: 0.95 },
    { pattern: /^wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|secs?|ms|milliseconds?)$/i, intent: 'wait', action: 'waitTime', confidence: 0.95 },
    { pattern: /^wait\s+(?:for\s+)?(.+?)\s+(?:to\s+)?(?:load|be\s+ready)$/i, intent: 'wait', action: 'waitReady', confidence: 0.9 },
    { pattern: /^wait\s+until\s+(.+)$/i, intent: 'wait', action: 'waitCondition', confidence: 0.85 },
    
    // Data intents
    { pattern: /^(?:get|extract|read)\s+(.+?)\s+(?:from\s+)?(.+)$/i, intent: 'data', action: 'get', confidence: 0.9 },
    { pattern: /^(?:save|store)\s+(.+?)\s+(?:as|to)\s+(.+)$/i, intent: 'data', action: 'store', confidence: 0.9 },
    { pattern: /^(?:use|apply)\s+(.+?)\s+(?:from\s+)?(.+)$/i, intent: 'data', action: 'use', confidence: 0.85 }
  ];

  // Action verb mappings
  private readonly actionVerbs = new Map<string, ActionType>([
    ['click', 'click'], ['tap', 'click'], ['press', 'click'], ['push', 'click'], ['hit', 'click'],
    ['type', 'type'], ['enter', 'type'], ['input', 'type'], ['fill', 'type'], ['write', 'type'],
    ['select', 'select'], ['choose', 'select'], ['pick', 'select'], ['opt', 'select'],
    ['check', 'check'], ['tick', 'check'], ['mark', 'check'],
    ['uncheck', 'uncheck'], ['untick', 'uncheck'], ['unmark', 'uncheck'],
    ['hover', 'hover'], ['mouseover', 'hover'], ['mouse over', 'hover'],
    ['scroll', 'scroll'], ['swipe', 'scroll'],
    ['drag', 'drag'], ['drop', 'drag'], ['move', 'drag'],
    ['upload', 'upload'], ['attach', 'upload'], ['browse', 'upload'],
    ['download', 'download'], ['save', 'download'], ['export', 'download'],
    ['wait', 'wait'], ['pause', 'wait'], ['delay', 'wait'],
    ['verify', 'assert'], ['validate', 'assert'], ['check', 'assert'], ['ensure', 'assert'],
    ['assert', 'assert'], ['confirm', 'assert'], ['test', 'assert'],
    ['navigate', 'navigate'], ['go', 'navigate'], ['visit', 'navigate'], ['browse', 'navigate'],
    ['clear', 'clear'], ['empty', 'clear'], ['delete', 'clear'], ['remove', 'clear']
  ]);

  // Question words for detecting interrogative sentences
  private readonly questionWords = new Set([
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
    'can', 'could', 'will', 'would', 'should', 'shall', 'may', 'might'
  ]);

  // Modal verbs
  private readonly modalVerbs = new Set([
    'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would'
  ]);

  // Imperative verb indicators
  private readonly imperativeVerbs = new Set([
    'click', 'type', 'enter', 'select', 'check', 'uncheck', 'hover', 'scroll',
    'drag', 'drop', 'upload', 'download', 'wait', 'verify', 'validate', 'navigate',
    'go', 'visit', 'clear', 'submit', 'cancel', 'open', 'close', 'focus', 'blur'
  ]);

  private constructor() {
    this.keywordExtractor = KeywordExtractor.getInstance();
  }

  public static getInstance(): IntentClassifier {
    if (!IntentClassifier.instance) {
      IntentClassifier.instance = new IntentClassifier();
    }
    return IntentClassifier.instance;
  }

  public async classifyIntent(text: string): Promise<Intent> {
    const startTime = Date.now();
    ActionLogger.logAIOperation('intent-classification start', { text });

    try {
      // Normalize text
      const normalizedText = this.normalizeText(text);
      
      // Extract features
      const features = await this.extractFeatures(normalizedText);
      
      // Try pattern matching first
      const patternMatch = this.matchPatterns(normalizedText);
      if (patternMatch) {
        const intent = this.createIntentFromPattern(patternMatch, normalizedText, features);
        
        ActionLogger.logAIOperation('intent-classification complete', {
          duration: Date.now() - startTime,
          method: 'pattern',
          intent: intent.type
        });
        
        return intent;
      }
      
      // Fall back to feature-based classification
      const intent = await this.classifyByFeatures(normalizedText, features);
      
      ActionLogger.logAIOperation('intent-classification complete', {
        duration: Date.now() - startTime,
        method: 'features',
        intent: intent.type
      });
      
      return intent;
    } catch (error) {
      ActionLogger.logError('Intent classification failed', error as Error);
      throw error;
    }
  }

  private normalizeText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['"]/g, '"') // Normalize quotes
      .replace(/\s*\.\s*$/, ''); // Remove trailing period
  }

  private async extractFeatures(text: string): Promise<IntentFeatures> {
    const words = text.toLowerCase().split(/\s+/);
    const firstWord = words[0];
    
    // Extract keywords
    const keywords = await this.keywordExtractor.extractKeywords(text);
    const actionKeywords = keywords.filter(k => k.type === 'action').map(k => k.word);
    const targetKeywords = keywords.filter(k => k.type === 'element' || k.type === 'identifier').map(k => k.word);
    
    // Detect sentence type
    let sentenceType: IntentFeatures['sentenceType'] = 'declarative';
    if (text.endsWith('?') || (firstWord && this.questionWords.has(firstWord))) {
      sentenceType = 'interrogative';
    } else if ((firstWord && this.imperativeVerbs.has(firstWord)) || this.isImperativeStructure(words)) {
      sentenceType = 'imperative';
    } else if (text.endsWith('!')) {
      sentenceType = 'exclamatory';
    }
    
    // Find verb position
    let verbPosition = -1;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word && (this.actionVerbs.has(word) || this.isVerb(word))) {
        verbPosition = i;
        break;
      }
    }
    
    return {
      hasImperativeVerb: firstWord ? this.imperativeVerbs.has(firstWord) : false,
      hasQuestionWord: firstWord ? this.questionWords.has(firstWord) : false,
      hasModalVerb: words.some(w => w && this.modalVerbs.has(w)),
      hasNegation: words.some(w => w && ['not', 'no', 'never', 'none', "don't", "doesn't", "didn't", "won't", "wouldn't", "shouldn't", "can't", "couldn't"].includes(w)),
      verbPosition,
      sentenceType,
      actionKeywords,
      targetKeywords
    };
  }

  private isImperativeStructure(words: string[]): boolean {
    // Check if sentence starts with a verb
    const firstWord = words[0];
    return firstWord ? (this.actionVerbs.has(firstWord) || this.imperativeVerbs.has(firstWord)) : false;
  }

  private isVerb(word: string): boolean {
    // Simple verb detection based on common patterns
    const verbEndings = ['ing', 'ed', 'es', 's'];
    const commonVerbs = new Set([
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'done',
      'go', 'goes', 'went', 'gone', 'make', 'makes', 'made'
    ]);
    
    if (commonVerbs.has(word)) return true;
    
    // Check verb endings
    for (const ending of verbEndings) {
      if (word.endsWith(ending) && word.length > ending.length + 2) {
        return true;
      }
    }
    
    return false;
  }

  private matchPatterns(text: string): { pattern: IntentPattern; matches: RegExpMatchArray } | null {
    for (const pattern of this.intentPatterns) {
      const matches = text.match(pattern.pattern);
      if (matches) {
        return { pattern, matches };
      }
    }
    return null;
  }

  private createIntentFromPattern(
    patternMatch: { pattern: IntentPattern; matches: RegExpMatchArray },
    _text: string,
    features: IntentFeatures
  ): Intent {
    const { pattern, matches } = patternMatch;
    
    // Extract parameters from regex groups
    const parameters: string[] = [];
    for (let i = 1; i < matches.length; i++) {
      const match = matches[i];
      if (match !== undefined) {
        parameters.push(match.trim());
      }
    }
    
    // Determine target
    let target: TargetType = 'element';
    if (pattern.intent === 'navigation') {
      target = 'page';
    } else if (pattern.intent === 'wait' && pattern.action === 'waitTime') {
      target = 'time';
    } else if (parameters.length > 0) {
      const lastParam = parameters[parameters.length - 1];
      if (lastParam) {
        target = this.identifyTargetType(lastParam, features);
      }
    }
    
    const intent: Intent = {
      type: pattern.intent,
      action: pattern.action,
      target,
      confidence: {
        overall: pattern.confidence,
        action: pattern.confidence,
        target: pattern.confidence,
        parameters: pattern.confidence
      }
    };
    
    if (parameters.length > 0) {
      intent.value = parameters[0];
    }
    
    if (parameters.length > 0) {
      intent.parameters = { values: parameters };
    }
    
    return intent;
  }

  private async classifyByFeatures(text: string, features: IntentFeatures): Promise<Intent> {
    // Determine intent type based on features
    let intentType: IntentType = 'unknown';
    let action: ActionType = 'unknown';
    let confidence = 0.5;
    
    // Check for validation patterns
    if (this.isValidationIntent(text, features)) {
      intentType = 'validation';
      action = this.extractValidationAction(text, features);
      confidence = 0.8;
    }
    // Check for interaction patterns
    else if (features.hasImperativeVerb || features.sentenceType === 'imperative') {
      intentType = 'interaction';
      action = this.extractInteractionAction(text, features);
      confidence = 0.85;
    }
    // Check for navigation patterns
    else if (this.isNavigationIntent(text, features)) {
      intentType = 'navigation';
      action = 'navigate';
      confidence = 0.75;
    }
    // Check for wait patterns
    else if (this.isWaitIntent(text, features)) {
      intentType = 'wait';
      action = 'wait';
      confidence = 0.75;
    }
    // Check for data patterns
    else if (this.isDataIntent(text, features)) {
      intentType = 'data';
      action = this.extractDataAction(text, features);
      confidence = 0.7;
    }
    
    // Extract parameters
    const parameters = await this.extractParameters(text, intentType, action, features);
    
    // Determine target
    const target = this.determineTarget(text, intentType, features, parameters);
    
    const intent: Intent = {
      type: intentType,
      action,
      target,
      confidence: {
        overall: confidence,
        action: confidence,
        target: confidence,
        parameters: confidence
      }
    };
    
    if (parameters.length > 0) {
      intent.value = parameters[0];
    }
    
    if (parameters.length > 0) {
      intent.parameters = { values: parameters };
    }
    
    return intent;
  }

  private isValidationIntent(text: string, _features: IntentFeatures): boolean {
    const validationKeywords = [
      'should', 'must', 'verify', 'validate', 'check', 'ensure',
      'assert', 'confirm', 'test', 'expect', 'is', 'are', 'has',
      'have', 'equals', 'contains', 'matches'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    return words.some(w => validationKeywords.includes(w)) || 
           text.includes('should be') || 
           text.includes('should have');
  }

  private isNavigationIntent(text: string, _features: IntentFeatures): boolean {
    const navigationKeywords = [
      'navigate', 'go', 'visit', 'browse', 'open', 'load',
      'redirect', 'forward', 'back', 'refresh', 'reload'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    return words.some(w => navigationKeywords.includes(w)) ||
           text.includes('go to') ||
           text.includes('navigate to');
  }

  private isWaitIntent(text: string, _features: IntentFeatures): boolean {
    const waitKeywords = [
      'wait', 'pause', 'delay', 'hold', 'timeout', 'until'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    return words.some(w => waitKeywords.includes(w));
  }

  private isDataIntent(text: string, _features: IntentFeatures): boolean {
    const dataKeywords = [
      'get', 'extract', 'read', 'save', 'store', 'use',
      'apply', 'retrieve', 'fetch', 'load', 'export'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    return words.some(w => dataKeywords.includes(w));
  }

  private extractValidationAction(text: string, _features: IntentFeatures): ActionType {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('visible') || lowerText.includes('displayed')) {
      return lowerText.includes('not') ? 'assertNotVisible' : 'assertVisible';
    }
    if (lowerText.includes('enabled') || lowerText.includes('clickable')) {
      return 'assertEnabled';
    }
    if (lowerText.includes('disabled')) {
      return 'assertDisabled';
    }
    if (lowerText.includes('contains')) {
      return 'assertContains';
    }
    if (lowerText.includes('count') || lowerText.includes('number')) {
      return 'assertCount';
    }
    if (lowerText.includes('exist') || lowerText.includes('present')) {
      return lowerText.includes('not') ? 'assertNotExists' : 'assertExists';
    }
    if (lowerText.includes('text') || lowerText.includes('value')) {
      return 'assertText';
    }
    
    return 'assert';
  }

  private extractInteractionAction(text: string, features: IntentFeatures): ActionType {
    // Check action keywords first
    if (features.actionKeywords.length > 0) {
      const firstAction = features.actionKeywords[0];
      if (firstAction) {
        const mappedAction = this.actionVerbs.get(firstAction);
        if (mappedAction) {
          return mappedAction;
        }
      }
    }
    
    // Check first word
    const words = text.toLowerCase().split(/\s+/);
    const firstWord = words[0];
    if (firstWord) {
      const mappedAction = this.actionVerbs.get(firstWord);
      if (mappedAction) {
        return mappedAction;
      }
    }
    
    // Default to click for imperative sentences
    return 'click';
  }

  private extractDataAction(text: string, _features: IntentFeatures): ActionType {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('get') || lowerText.includes('extract') || lowerText.includes('read')) {
      return 'get';
    }
    if (lowerText.includes('save') || lowerText.includes('store')) {
      return 'store';
    }
    if (lowerText.includes('use') || lowerText.includes('apply')) {
      return 'use';
    }
    
    return 'get';
  }

  private async extractParameters(
    text: string,
    intentType: IntentType,
    action: ActionType,
    features: IntentFeatures
  ): Promise<string[]> {
    const parameters: string[] = [];
    
    // Extract quoted strings first
    const quotedStrings = text.match(/["']([^"']+)["']/g);
    if (quotedStrings) {
      quotedStrings.forEach(quoted => {
        parameters.push(quoted.replace(/["']/g, ''));
      });
    }
    
    // Extract based on intent type
    switch (intentType) {
      case 'interaction':
        if (action === 'type' && parameters.length === 0) {
          // Extract text to type (everything after "type" and before "in/into")
          const typeMatch = text.match(/type\s+(.+?)\s+(?:in|into)/i);
          if (typeMatch && typeMatch[1]) {
            parameters.push(typeMatch[1]);
          }
        }
        
        // Extract target element
        if (features.targetKeywords.length > 0) {
          parameters.push(...features.targetKeywords);
        }
        break;
        
      case 'validation':
        // Extract expected value
        const shouldMatch = text.match(/should\s+(?:be|have|contain)\s+(.+)$/i);
        if (shouldMatch && shouldMatch[1]) {
          parameters.push(shouldMatch[1]);
        }
        break;
        
      case 'navigation':
        // Extract URL or page name
        const navMatch = text.match(/(?:to|visit|open)\s+(.+?)(?:\s+page)?$/i);
        if (navMatch && navMatch[1]) {
          parameters.push(navMatch[1]);
        }
        break;
        
      case 'wait':
        // Extract wait duration
        const timeMatch = text.match(/(\d+)\s*(?:seconds?|secs?|ms|milliseconds?)/i);
        if (timeMatch && timeMatch[1]) {
          parameters.push(timeMatch[1]);
        }
        break;
    }
    
    return parameters;
  }

  private determineTarget(
    text: string,
    intentType: IntentType,
    _features: IntentFeatures,
    _parameters: string[]
  ): TargetType {
    switch (intentType) {
      case 'navigation':
        return 'page';
        
      case 'wait':
        if (text.match(/\d+\s*(?:seconds?|secs?|ms)/i)) {
          return 'time';
        }
        return 'element';
        
      case 'validation':
        if (text.toLowerCase().includes('page')) {
          return 'page';
        }
        if (text.toLowerCase().includes('window') || text.toLowerCase().includes('dialog')) {
          return 'window';
        }
        return 'element';
        
      case 'interaction':
        if (text.toLowerCase().includes('frame') || text.toLowerCase().includes('iframe')) {
          return 'frame';
        }
        if (text.toLowerCase().includes('window') || text.toLowerCase().includes('popup')) {
          return 'window';
        }
        return 'element';
        
      default:
        return 'element';
    }
  }

  private identifyTargetType(target: string, _features: IntentFeatures): TargetType {
    const lowerTarget = target.toLowerCase();
    
    if (lowerTarget.includes('page') || lowerTarget.includes('url')) {
      return 'page';
    }
    if (lowerTarget.includes('window') || lowerTarget.includes('popup') || lowerTarget.includes('dialog')) {
      return 'window';
    }
    if (lowerTarget.includes('frame') || lowerTarget.includes('iframe')) {
      return 'frame';
    }
    if (lowerTarget.includes('tab')) {
      return 'tab';
    }
    
    return 'element';
  }

  public identifyAction(intent: Intent): ActionType {
    return intent.action;
  }

  public identifyTarget(intent: Intent): TargetType {
    return intent.target || 'element';
  }

  public mapToFrameworkAction(intent: Intent): string {
    // Map intent to actual framework step definition pattern
    const mapping: Record<string, string> = {
      'click': 'user clicks {string}',
      'type': 'user types {string} in {string}',
      'select': 'user selects {string} from {string}',
      'check': 'user checks {string}',
      'uncheck': 'user unchecks {string}',
      'hover': 'user hovers over {string}',
      'scroll': 'user scrolls to {string}',
      'drag': 'user drags {string} to {string}',
      'navigate': 'user navigates to {string}',
      'assertVisible': '{string} should be visible',
      'assertText': '{string} should have text {string}',
      'wait': 'user waits for {string}'
    };
    
    return mapping[intent.action] || 'unknown step';
  }

  public async getIntentConfidence(text: string): Promise<number> {
    try {
      const intent = await this.classifyIntent(text);
      return intent.confidence.overall;
    } catch {
      return 0;
    }
  }

  public addCustomPattern(pattern: RegExp, intent: IntentType, action: ActionType, confidence: number = 0.9): void {
    this.intentPatterns.push({ pattern, intent, action, confidence });
    
    // Sort by confidence to prioritize higher confidence patterns
    this.intentPatterns.sort((a, b) => b.confidence - a.confidence);
  }

  public removeCustomPattern(pattern: RegExp): boolean {
    const index = this.intentPatterns.findIndex(p => p.pattern.source === pattern.source);
    if (index !== -1) {
      this.intentPatterns.splice(index, 1);
      return true;
    }
    return false;
  }

  public exportPatterns(): any {
    return this.intentPatterns.map(p => ({
      pattern: p.pattern.source,
      flags: p.pattern.flags,
      intent: p.intent,
      action: p.action,
      confidence: p.confidence
    }));
  }

  public importPatterns(patterns: any[]): void {
    patterns.forEach(p => {
      const pattern = new RegExp(p.pattern, p.flags);
      this.addCustomPattern(pattern, p.intent, p.action, p.confidence);
    });
  }

  public async analyzeIntentAmbiguity(text: string): Promise<Array<{intent: IntentType, action: ActionType, confidence: number, reason: string}>> {
    const normalizedText = this.normalizeText(text);
    const features = await this.extractFeatures(normalizedText);
    const results: Array<{intent: IntentType, action: ActionType, confidence: number, reason: string}> = [];
    
    // Check all patterns
    for (const pattern of this.intentPatterns) {
      const matches = normalizedText.match(pattern.pattern);
      if (matches) {
        results.push({
          intent: pattern.intent,
          action: pattern.action,
          confidence: pattern.confidence,
          reason: 'pattern_match'
        });
      }
    }
    
    // Add feature-based classifications
    if (this.isValidationIntent(normalizedText, features)) {
      results.push({
        intent: 'validation',
        action: this.extractValidationAction(normalizedText, features),
        confidence: 0.7,
        reason: 'feature_match'
      });
    }
    
    if (features.hasImperativeVerb) {
     results.push({
       intent: 'interaction',
       action: this.extractInteractionAction(normalizedText, features),
       confidence: 0.75,
       reason: 'imperative_verb'
     });
   }
   
   if (this.isNavigationIntent(normalizedText, features)) {
     results.push({
       intent: 'navigation',
       action: 'navigate',
       confidence: 0.65,
       reason: 'navigation_keywords'
     });
   }
   
   if (this.isWaitIntent(normalizedText, features)) {
     results.push({
       intent: 'wait',
       action: 'wait',
       confidence: 0.65,
       reason: 'wait_keywords'
     });
   }
   
   // Sort by confidence
   results.sort((a, b) => b.confidence - a.confidence);
   
   return results;
 }
}