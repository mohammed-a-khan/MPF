// src/core/ai/nlp/SentenceParser.ts

import { Token } from './TokenAnalyzer';
import { ActionLogger } from '../../logging/ActionLogger';

export class SentenceParser {
  parseSentence(tokens: Token[]): ParseTree {
    try {
      // Build parse tree
      const tree = this.buildParseTree(tokens);
      
      // Extract components
      tree.subject = this.identifySubject(tokens, tree);
      tree.action = this.identifyAction(tokens, tree);
      tree.object = this.identifyObject(tokens, tree);
      tree.modifiers = this.extractModifiers(tokens, tree);
      
      ActionLogger.logAIOperation('sentence_parsed', {
        tokenCount: tokens.length,
        hasSubject: !!tree.subject,
        hasAction: !!tree.action,
        hasObject: !!tree.object
      });
      
      return tree;
      
    } catch (error) {
      ActionLogger.logError('Sentence parsing failed', error);
      return this.createEmptyTree();
    }
  }
  
  identifySubject(tokens: Token[], _tree?: ParseTree): string {
    // In UI descriptions, subject is often implicit (user)
    // Look for explicit subjects
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (token) {
        // Check for pronouns that indicate subject
        if (['i', 'user', 'we'].includes(token.value.toLowerCase())) {
          return token.value;
        }
        
        // First noun before a verb is often the subject
        if (token.pos === 'NOUN') {
          const nextVerb = tokens.slice(i + 1).find(t => t.pos === 'VERB');
          if (nextVerb) {
            return token.value;
          }
        }
      }
    }
    
    // Default subject for UI actions
    return 'user';
  }
  
  identifyAction(tokens: Token[], _tree?: ParseTree): string {
    // Find the main action verb
    const verbs = tokens.filter(t => t.pos === 'VERB');
    
    if (verbs.length === 0) {
      // Try to infer action from context
      return this.inferAction(tokens);
    }
    
    // Prioritize action verbs
    const actionVerbs = ['click', 'press', 'type', 'select', 'enter', 'navigate', 'find'];
    
    for (const verb of verbs) {
      if (actionVerbs.includes(verb.value.toLowerCase())) {
        return verb.value;
      }
    }
    
    // Return first verb
    const firstVerb = verbs[0];
    return firstVerb ? firstVerb.value : 'interact';
  }
  
  identifyObject(tokens: Token[], tree?: ParseTree): string {
    // Find what the action is performed on
    const actionIndex = tokens.findIndex(t => t.value === tree?.action);
    
    if (actionIndex >= 0) {
      // Look for nouns after the action
      const afterAction = tokens.slice(actionIndex + 1);
      const objectNoun = afterAction.find(t => 
        t.pos === 'NOUN' && !t.isStopWord
      );
      
      if (objectNoun) {
        // Include modifiers before the noun
        const objectIndex = tokens.indexOf(objectNoun);
        const modifiers = this.getModifiersBeforeNoun(tokens, objectIndex);
        
        if (modifiers.length > 0) {
          return [...modifiers, objectNoun.value].join(' ');
        }
        
        return objectNoun.value;
      }
    }
    
    // Look for any significant noun
    const nouns = tokens.filter(t => t.pos === 'NOUN' && !t.isStopWord);
    if (nouns.length > 0) {
      const lastNoun = nouns[nouns.length - 1];
      return lastNoun ? lastNoun.value : ''; // Last noun is often the target
    }
    
    return '';
  }
  
  extractModifiers(tokens: Token[], _tree?: ParseTree): Modifier[] {
    const modifiers: Modifier[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (token && (token.type === 'modifier' || token.pos === 'ADJ' || token.pos === 'ADV')) {
        const modifier: Modifier = {
          value: token.value,
          type: this.getModifierType(token),
          target: this.findModifierTarget(tokens, i)
        };
        
        modifiers.push(modifier);
      }
    }
    
    return modifiers;
  }
  
  private buildParseTree(tokens: Token[]): ParseTree {
    const tree: ParseTree = {
      type: 'sentence',
      tokens,
      children: [],
      subject: '',
      action: '',
      object: '',
      modifiers: []
    };
    
    // Build basic structure
    let currentPhrase: ParseNode | null = null;
    
    for (const token of tokens) {
      if (this.isPhraseStart(token)) {
        if (currentPhrase) {
          tree.children.push(currentPhrase);
        }
        currentPhrase = this.createPhraseNode(token);
      } else if (currentPhrase) {
        currentPhrase.tokens.push(token);
      }
    }
    
    if (currentPhrase) {
      tree.children.push(currentPhrase);
    }
    
    return tree;
  }
  
  private isPhraseStart(token: Token): boolean {
    return token.pos === 'DET' || token.pos === 'PREP' || 
           token.type === 'operator' || 
           (token.pos === 'VERB' && !token.isStopWord);
  }
  
  private createPhraseNode(token: Token): ParseNode {
    let type: PhraseType = 'unknown';
    
    if (token.pos === 'DET') type = 'noun-phrase';
    else if (token.pos === 'PREP') type = 'prep-phrase';
    else if (token.pos === 'VERB') type = 'verb-phrase';
    else if (token.type === 'operator') type = 'operator-phrase';
    
    return {
      type,
      tokens: [token],
      children: []
    };
  }
  
  private inferAction(tokens: Token[]): string {
    // Infer action from context when no verb is present
    const tokenValues = tokens.map(t => t.value.toLowerCase());
    
    if (tokenValues.some(v => v.includes('button'))) {
      return 'click';
    }
    
    if (tokenValues.some(v => ['input', 'field', 'text'].includes(v))) {
      return 'type';
    }
    
    if (tokenValues.some(v => ['dropdown', 'select', 'list'].includes(v))) {
      return 'select';
    }
    
    if (tokenValues.some(v => ['checkbox', 'check'].includes(v))) {
      return 'check';
    }
    
    return 'interact';
  }
  
  private getModifiersBeforeNoun(tokens: Token[], nounIndex: number): string[] {
    const modifiers: string[] = [];
    
    for (let i = nounIndex - 1; i >= 0; i--) {
      const token = tokens[i];
      
      if (token) {
        if (token.pos === 'ADJ' || token.type === 'modifier') {
          modifiers.unshift(token.value);
        } else if (token.pos === 'DET') {
          // Skip determiners
          continue;
        } else {
          // Stop at non-modifier
          break;
        }
      }
    }
    
    return modifiers;
  }
  
  private getModifierType(token: Token): ModifierType {
    const value = token.value.toLowerCase();
    
    if (['red', 'blue', 'green', 'yellow', 'black', 'white'].includes(value)) {
      return 'color';
    }
    
    if (['large', 'small', 'big', 'tiny', 'huge'].includes(value)) {
      return 'size';
    }
    
    if (['first', 'last', 'second', 'third'].includes(value)) {
      return 'position';
    }
    
    if (['enabled', 'disabled', 'active', 'inactive'].includes(value)) {
      return 'state';
    }
    
    return 'general';
  }
  
  private findModifierTarget(tokens: Token[], modifierIndex: number): string {
    // Find what the modifier is modifying
    for (let i = modifierIndex + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token && token.pos === 'NOUN') {
        return token.value;
      }
    }
    
    // Look backwards if not found forward
    for (let i = modifierIndex - 1; i >= 0; i--) {
      const token = tokens[i];
      if (token && token.pos === 'NOUN') {
        return token.value;
      }
    }
    
    return '';
  }
  
  private createEmptyTree(): ParseTree {
    return {
      type: 'sentence',
      tokens: [],
      children: [],
      subject: '',
      action: '',
      object: '',
      modifiers: []
    };
  }
  
  analyzeStructure(tree: ParseTree): StructureAnalysis {
    return {
      isImperative: !tree.subject || tree.subject === 'user',
      hasExplicitTarget: !!tree.object,
      complexity: this.calculateTreeComplexity(tree),
      phraseCount: tree.children.length,
      modifierCount: tree.modifiers.length
    };
  }
  
  private calculateTreeComplexity(tree: ParseTree): number {
    let complexity = 0;
    
    // Base complexity on token count
    complexity += Math.min(tree.tokens.length / 20, 0.3);
    
    // Add for phrases
    complexity += Math.min(tree.children.length * 0.1, 0.3);
    
    // Add for modifiers
    complexity += Math.min(tree.modifiers.length * 0.1, 0.2);
    
    // Add for nested structures
    const maxDepth = this.getMaxDepth(tree);
    complexity += Math.min(maxDepth * 0.1, 0.2);
    
    return Math.min(complexity, 1.0);
  }
  
  private getMaxDepth(node: ParseNode, currentDepth: number = 0): number {
    if (node.children.length === 0) {
      return currentDepth;
    }
    
    const childDepths = node.children.map(child => 
      this.getMaxDepth(child, currentDepth + 1)
    );
    
    return Math.max(...childDepths);
  }
}

export interface ParseTree extends ParseNode {
  type: 'sentence';
  subject: string;
  action: string;
  object: string;
  modifiers: Modifier[];
}

export interface ParseNode {
  type: PhraseType;
  tokens: Token[];
  children: ParseNode[];
}

export type PhraseType = 
  | 'sentence'
  | 'noun-phrase' 
  | 'verb-phrase' 
  | 'prep-phrase' 
  | 'operator-phrase'
  | 'unknown';

export interface Modifier {
  value: string;
  type: ModifierType;
  target: string;
}

export type ModifierType = 'color' | 'size' | 'position' | 'state' | 'general';

interface StructureAnalysis {
  isImperative: boolean;
  hasExplicitTarget: boolean;
  complexity: number;
  phraseCount: number;
  modifierCount: number;
}