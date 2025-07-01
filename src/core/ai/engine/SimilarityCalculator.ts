// src/core/ai/engine/SimilarityCalculator.ts

import { ActionLogger } from '../../logging/ActionLogger';
import {
  ElementFeatures,
  TextFeatures,
  VisualFeatures,
  StructuralFeatures,
  SemanticFeatures,
  ContextFeatures,
  SimilarityWeights
} from '../types/ai.types';

export class SimilarityCalculator {
  private readonly defaultWeights: SimilarityWeights = {
    text: 0.35,
    structure: 0.25,
    visual: 0.20,
    semantic: 0.10,
    context: 0.10
  };

  private readonly textSubWeights = {
    content: 0.40,
    visibleText: 0.30,
    ariaLabel: 0.15,
    placeholder: 0.10,
    value: 0.05
  };

  private readonly structuralSubWeights = {
    tagName: 0.30,
    attributes: 0.25,
    classList: 0.20,
    hierarchy: 0.15,
    interactive: 0.10
  };

  private readonly visualSubWeights = {
    position: 0.25,
    size: 0.20,
    visibility: 0.20,
    style: 0.20,
    zIndex: 0.15
  };

  calculate(
    features1: ElementFeatures,
    features2: ElementFeatures,
    customWeights?: Partial<SimilarityWeights>
  ): number {
    const weights = { ...this.defaultWeights, ...customWeights };
    
    const textSimilarity = this.calculateTextSimilarity(features1.text, features2.text);
    const structuralSimilarity = this.calculateStructuralSimilarity(
      features1.structural,
      features2.structural
    );
    const visualSimilarity = this.calculateVisualSimilarity(
      features1.visual,
      features2.visual
    );
    const semanticSimilarity = this.calculateSemanticSimilarity(
      features1.semantic,
      features2.semantic
    );
    const contextSimilarity = this.calculateContextSimilarity(
      features1.context,
      features2.context
    );

    const totalScore = 
      textSimilarity * weights.text +
      structuralSimilarity * weights.structure +
      visualSimilarity * weights.visual +
      semanticSimilarity * weights.semantic +
      contextSimilarity * weights.context;

    ActionLogger.logDebug('Similarity calculated', {
      operation: 'similarity_calculated',
      scores: {
        text: textSimilarity,
        structural: structuralSimilarity,
        visual: visualSimilarity,
        semantic: semanticSimilarity,
        context: contextSimilarity,
        total: totalScore
      }
    });

    return Math.min(totalScore, 1.0);
  }

  quickCalculate(features1: ElementFeatures, features2: ElementFeatures): number {
    const textSim = this.quickTextSimilarity(features1.text, features2.text);
    const tagSim = features1.structural.tagName === features2.structural.tagName ? 1 : 0;
    const visibleSim = features1.visual.isVisible === features2.visual.isVisible ? 1 : 0;
    
    return (textSim * 0.5 + tagSim * 0.3 + visibleSim * 0.2);
  }

  calculateSimilarity(text1: string, text2: string): number {
    return this.stringSimilarity(text1, text2);
  }

  calculateTextSimilarity(text1: TextFeatures, text2: TextFeatures): number {
    const scores: Record<string, number> = {};

    scores['content'] = this.stringSimilarity(text1.content, text2.content);
    
    scores['visibleText'] = this.stringSimilarity(text1.visibleText, text2.visibleText);
    
    if (text1.ariaLabel && text2.ariaLabel) {
      scores['ariaLabel'] = this.stringSimilarity(text1.ariaLabel, text2.ariaLabel);
    } else if (!text1.ariaLabel && !text2.ariaLabel) {
      scores['ariaLabel'] = 1;
    } else {
      scores['ariaLabel'] = 0;
    }
    
    if (text1.placeholder && text2.placeholder) {
      scores['placeholder'] = this.stringSimilarity(text1.placeholder, text2.placeholder);
    } else if (!text1.placeholder && !text2.placeholder) {
      scores['placeholder'] = 1;
    } else {
      scores['placeholder'] = 0;
    }
    
    if (text1.value && text2.value) {
      scores['value'] = this.stringSimilarity(text1.value, text2.value);
    } else if (!text1.value && !text2.value) {
      scores['value'] = 1;
    } else {
      scores['value'] = 0;
    }

    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [key, weight] of Object.entries(this.textSubWeights)) {
      if (key in scores && scores[key] !== undefined) {
        totalScore += scores[key] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private calculateStructuralSimilarity(
    struct1: StructuralFeatures,
    struct2: StructuralFeatures
  ): number {
    const scores: Record<string, number> = {};

    scores['tagName'] = struct1.tagName === struct2.tagName ? 1 : 0;

    scores['attributes'] = this.attributesSimilarity(struct1.attributes, struct2.attributes);

    scores['classList'] = this.arraysSimilarity(struct1.classList, struct2.classList);

    scores['hierarchy'] = this.hierarchySimilarity(struct1, struct2);

    scores['interactive'] = struct1.isInteractive === struct2.isInteractive ? 1 : 0;

    if (struct1.formElement && struct2.formElement) {
      scores['formElement'] = struct1.inputType === struct2.inputType ? 1 : 0.5;
    } else {
      scores['formElement'] = struct1.formElement === struct2.formElement ? 1 : 0;
    }

    if (struct1.role && struct2.role) {
      scores['role'] = struct1.role === struct2.role ? 1 : 0;
    } else {
      scores['role'] = 0.5;
    }

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(this.structuralSubWeights)) {
      if (key in scores && scores[key] !== undefined) {
        totalScore += scores[key] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private calculateVisualSimilarity(
    visual1: VisualFeatures,
    visual2: VisualFeatures
  ): number {
    const scores: Record<string, number> = {};

    scores['visibility'] = visual1.isVisible === visual2.isVisible ? 1 : 0;
    if (!visual1.isVisible || !visual2.isVisible) {
      return scores['visibility'] * 0.2;
    }

    scores['position'] = this.positionSimilarity(
      visual1.boundingBox,
      visual2.boundingBox
    );

    scores['size'] = this.sizeSimilarity(
      visual1.boundingBox,
      visual2.boundingBox
    );

    scores['style'] = this.styleSimilarity(visual1, visual2);

    const zDiff = Math.abs(visual1.zIndex - visual2.zIndex);
    scores['zIndex'] = Math.max(0, 1 - zDiff / 100);

    scores['viewport'] = visual1.inViewport === visual2.inViewport ? 1 : 0.5;

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(this.visualSubWeights)) {
      if (key in scores && scores[key] !== undefined) {
        totalScore += scores[key] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private calculateSemanticSimilarity(
    semantic1: SemanticFeatures,
    semantic2: SemanticFeatures
  ): number {
    let score = 0;
    let factors = 0;

    if (semantic1.role === semantic2.role) {
      score += 1;
    }
    factors++;

    if (semantic1.isLandmark === semantic2.isLandmark) {
      score += 1;
    }
    factors++;

    if (semantic1.headingLevel === semantic2.headingLevel) {
      score += 1;
    } else if (semantic1.headingLevel > 0 && semantic2.headingLevel > 0) {
      score += 0.5;
    }
    factors++;

    if (semantic1.listItem === semantic2.listItem) {
      score += 1;
    }
    factors++;

    if (semantic1.tableCell === semantic2.tableCell) {
      score += 1;
    }
    factors++;

    if (semantic1.semanticType === semantic2.semanticType) {
      score += 1;
    }
    factors++;

    if (semantic1.isRequired === semantic2.isRequired) {
      score += 0.5;
    }
    factors += 0.5;

    if (semantic1.isInvalid === semantic2.isInvalid) {
      score += 0.5;
    }
    factors += 0.5;

    return factors > 0 ? score / factors : 0;
  }

  private calculateContextSimilarity(
    context1: ContextFeatures,
    context2: ContextFeatures
  ): number {
    let score = 0;
    let factors = 0;

    if (context1.parentTag === context2.parentTag) {
      score += 1;
    }
    factors++;

    if (context1.parentText && context2.parentText) {
      score += this.stringSimilarity(context1.parentText, context2.parentText);
    } else {
      score += 0.5;
    }
    factors++;

    score += this.stringArraySimilarity(context1.siblingTexts, context2.siblingTexts);
    factors++;

    if (context1.nearbyHeading && context2.nearbyHeading) {
      score += this.stringSimilarity(context1.nearbyHeading, context2.nearbyHeading);
    } else if (!context1.nearbyHeading && !context2.nearbyHeading) {
      score += 1;
    } else {
      score += 0.3;
    }
    factors++;

    if (context1.labelText && context2.labelText) {
      score += this.stringSimilarity(context1.labelText, context2.labelText);
    } else if (!context1.labelText && !context2.labelText) {
      score += 1;
    } else {
      score += 0;
    }
    factors++;

    if (context1.formId === context2.formId) {
      score += 1;
    } else if (context1.formId && context2.formId) {
      score += 0.3;
    }
    factors++;

    if (context1.tableHeaders.length > 0 || context2.tableHeaders.length > 0) {
      score += this.stringArraySimilarity(context1.tableHeaders, context2.tableHeaders);
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  private stringSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    if (s1.includes(s2) || s2.includes(s1)) {
      const longer = s1.length > s2.length ? s1 : s2;
      const shorter = s1.length > s2.length ? s2 : s1;
      return shorter.length / longer.length;
    }

    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    
    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const jaccard = intersection.size / union.size;

    if (s1.length < 20 && s2.length < 20) {
      const levenshtein = this.normalizedLevenshteinDistance(s1, s2);
      return (jaccard + levenshtein) / 2;
    }

    return jaccard;
  }

  private normalizedLevenshteinDistance(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    if (str1.length === 0) return str2.length;
    if (str2.length === 0) return str1.length;

    const getValue = (i: number, j: number, map: Map<string, number>): number => {
      return map.get(`${i},${j}`) ?? 0;
    };

    const setValue = (i: number, j: number, value: number, map: Map<string, number>): void => {
      map.set(`${i},${j}`, value);
    };

    const matrix = new Map<string, number>();

    for (let j = 0; j <= str1.length; j++) {
      setValue(0, j, j, matrix);
    }

    for (let i = 0; i <= str2.length; i++) {
      setValue(i, 0, i, matrix);
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          setValue(i, j, getValue(i - 1, j - 1, matrix), matrix);
        } else {
          const deletion = getValue(i - 1, j, matrix) + 1;
          const insertion = getValue(i, j - 1, matrix) + 1;
          const substitution = getValue(i - 1, j - 1, matrix) + 1;
          
          setValue(i, j, Math.min(deletion, insertion, substitution), matrix);
        }
      }
    }

    return getValue(str2.length, str1.length, matrix);
  }

  private attributesSimilarity(
    attrs1: Record<string, string>,
    attrs2: Record<string, string>
  ): number {
    const keys1 = new Set(Object.keys(attrs1));
    const keys2 = new Set(Object.keys(attrs2));
    
    if (keys1.size === 0 && keys2.size === 0) return 1;
    if (keys1.size === 0 || keys2.size === 0) return 0;

    const commonKeys = new Set([...keys1].filter(k => keys2.has(k)));
    let matchScore = 0;

    for (const key of commonKeys) {
      if (attrs1[key] === attrs2[key]) {
        matchScore += 1;
      } else {
        const val1 = attrs1[key] ?? '';
        const val2 = attrs2[key] ?? '';
        matchScore += this.stringSimilarity(val1, val2) * 0.5;
      }
    }

    const keyJaccard = commonKeys.size / new Set([...keys1, ...keys2]).size;
    
    const valueSimilarity = commonKeys.size > 0 ? matchScore / commonKeys.size : 0;
    
    return (keyJaccard + valueSimilarity) / 2;
  }

  private arraysSimilarity(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1;
    if (arr1.length === 0 || arr2.length === 0) return 0;

    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private hierarchySimilarity(struct1: StructuralFeatures, struct2: StructuralFeatures): number {
    const depthDiff = Math.abs(struct1.depth - struct2.depth);
    const depthScore = Math.max(0, 1 - depthDiff / 10);

    if (struct1.path && struct2.path) {
      const pathScore = this.pathSimilarity(struct1.path, struct2.path);
      return (depthScore + pathScore) / 2;
    }

    return depthScore;
  }

  private pathSimilarity(path1: string[], path2: string[]): number {
    let commonPrefix = 0;
    const minLength = Math.min(path1.length, path2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (path1[i] === path2[i]) {
        commonPrefix++;
      } else {
        break;
      }
    }

    const maxLength = Math.max(path1.length, path2.length);
    return commonPrefix / maxLength;
  }

  private positionSimilarity(box1: DOMRect, box2: DOMRect): number {
    const center1 = {
      x: box1.x + box1.width / 2,
      y: box1.y + box1.height / 2
    };
    
    const center2 = {
      x: box2.x + box2.width / 2,
      y: box2.y + box2.height / 2
    };

    const distance = Math.sqrt(
      Math.pow(center1.x - center2.x, 2) + 
      Math.pow(center1.y - center2.y, 2)
    );

    const maxDistance = Math.sqrt(1920 * 1920 + 1080 * 1080);
    return Math.max(0, 1 - distance / maxDistance);
  }

  private sizeSimilarity(box1: DOMRect, box2: DOMRect): number {
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    
    if (area1 === 0 && area2 === 0) return 1;
    if (area1 === 0 || area2 === 0) return 0;
    
    const ratio = Math.min(area1, area2) / Math.max(area1, area2);
    
    const aspectRatio1 = box1.width / box1.height;
    const aspectRatio2 = box2.width / box2.height;
    const aspectSimilarity = Math.min(aspectRatio1, aspectRatio2) / 
                            Math.max(aspectRatio1, aspectRatio2);
    
    return (ratio + aspectSimilarity) / 2;
  }

  private styleSimilarity(visual1: VisualFeatures, visual2: VisualFeatures): number {
    let score = 0;
    let factors = 0;

    if (visual1.fontSize === visual2.fontSize) {
      score += 1;
    } else {
      const size1 = parseInt(visual1.fontSize) || 16;
      const size2 = parseInt(visual2.fontSize) || 16;
      const ratio = Math.min(size1, size2) / Math.max(size1, size2);
      score += ratio;
    }
    factors++;

    if (visual1.fontWeight === visual2.fontWeight) {
      score += 1;
    } else {
      const weight1 = this.parseFontWeight(visual1.fontWeight);
      const weight2 = this.parseFontWeight(visual2.fontWeight);
      const diff = Math.abs(weight1 - weight2);
      score += Math.max(0, 1 - diff / 900);
    }
    factors++;

    if (visual1.color === visual2.color) {
      score += 1;
    } else {
      score += 0.5;
    }
    factors++;

    if (visual1.backgroundColor === visual2.backgroundColor) {
      score += 1;
    } else {
      score += 0.5;
    }
    factors++;

    if (visual1.display === visual2.display) {
      score += 0.5;
    }
    factors += 0.5;

    if (visual1.position === visual2.position) {
      score += 0.5;
    }
    factors += 0.5;

    return factors > 0 ? score / factors : 0;
  }

  private parseFontWeight(weight: string): number {
    const weightMap: Record<string, number> = {
      'normal': 400,
      'bold': 700,
      'lighter': 300,
      'bolder': 800
    };
    
    return weightMap[weight] || parseInt(weight) || 400;
  }

  private quickTextSimilarity(text1: TextFeatures, text2: TextFeatures): number {
    const t1 = (text1.content || text1.visibleText || '').toLowerCase().trim();
    const t2 = (text2.content || text2.visibleText || '').toLowerCase().trim();
    
    if (t1 === t2) return 1;
    if (!t1 || !t2) return 0;
    
    if (t1.includes(t2) || t2.includes(t1)) {
      return Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
    }
    
    return 0;
  }

  private stringArraySimilarity(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1;
    if (arr1.length === 0 || arr2.length === 0) return 0;

    let totalSimilarity = 0;
    const compared = Math.max(arr1.length, arr2.length);

    for (const str1 of arr1) {
      let bestMatch = 0;
      for (const str2 of arr2) {
        const similarity = this.stringSimilarity(str1, str2);
        bestMatch = Math.max(bestMatch, similarity);
      }
      totalSimilarity += bestMatch;
    }

    for (const str2 of arr2) {
      let bestMatch = 0;
      for (const str1 of arr1) {
        const similarity = this.stringSimilarity(str1, str2);
        bestMatch = Math.max(bestMatch, similarity);
      }
      totalSimilarity += bestMatch;
    }

    return totalSimilarity / (compared * 2);
  }

  analyzeFeatureDifferences(
    features1: ElementFeatures,
    features2: ElementFeatures
  ): FeatureDifferences {
    return {
      text: this.analyzeTextDifferences(features1.text, features2.text),
      structural: this.analyzeStructuralDifferences(
        features1.structural,
        features2.structural
      ),
      visual: this.analyzeVisualDifferences(features1.visual, features2.visual),
      semantic: this.analyzeSemanticDifferences(
        features1.semantic,
        features2.semantic
      ),
      context: this.analyzeContextDifferences(features1.context, features2.context),
      overallSimilarity: this.calculate(features1, features2)
    };
  }

  private analyzeTextDifferences(text1: TextFeatures, text2: TextFeatures): any {
    return {
      contentMatch: text1.content === text2.content,
      contentSimilarity: this.stringSimilarity(text1.content, text2.content),
      visibleTextMatch: text1.visibleText === text2.visibleText,
      ariaLabelMatch: text1.ariaLabel === text2.ariaLabel,
      lengthDifference: Math.abs(text1.length - text2.length),
      wordCountDifference: Math.abs(text1.words - text2.words)
    };
  }

  private analyzeStructuralDifferences(
    struct1: StructuralFeatures,
    struct2: StructuralFeatures
  ): any {
    return {
      sameTag: struct1.tagName === struct2.tagName,
      attributeOverlap: this.attributesSimilarity(struct1.attributes, struct2.attributes),
      classOverlap: this.arraysSimilarity(struct1.classList, struct2.classList),
      depthDifference: Math.abs(struct1.depth - struct2.depth),
      sameInteractiveState: struct1.isInteractive === struct2.isInteractive,
      sameFormElement: struct1.formElement === struct2.formElement
    };
  }

  private analyzeVisualDifferences(visual1: VisualFeatures, visual2: VisualFeatures): any {
    const posDiff = Math.sqrt(
      Math.pow(visual1.boundingBox.x - visual2.boundingBox.x, 2) +
      Math.pow(visual1.boundingBox.y - visual2.boundingBox.y, 2)
    );

    return {
      sameVisibility: visual1.isVisible === visual2.isVisible,
      positionDifference: posDiff,
      sizeDifference: {
        width: Math.abs(visual1.boundingBox.width - visual2.boundingBox.width),
        height: Math.abs(visual1.boundingBox.height - visual2.boundingBox.height)
      },
      zIndexDifference: Math.abs(visual1.zIndex - visual2.zIndex),
      sameColors: visual1.color === visual2.color && 
                  visual1.backgroundColor === visual2.backgroundColor
    };
  }

  private analyzeSemanticDifferences(
    semantic1: SemanticFeatures,
    semantic2: SemanticFeatures
  ): any {
    return {
      sameRole: semantic1.role === semantic2.role,
      sameLandmarkStatus: semantic1.isLandmark === semantic2.isLandmark,
      headingLevelDifference: Math.abs(semantic1.headingLevel - semantic2.headingLevel),
      sameListContext: semantic1.listItem === semantic2.listItem,
      sameTableContext: semantic1.tableCell === semantic2.tableCell
    };
  }

  private analyzeContextDifferences(
    context1: ContextFeatures,
    context2: ContextFeatures
  ): any {
    return {
      sameParentTag: context1.parentTag === context2.parentTag,
      parentTextSimilarity: this.stringSimilarity(
        context1.parentText,
        context2.parentText
      ),
      siblingOverlap: this.stringArraySimilarity(
        context1.siblingTexts,
        context2.siblingTexts
      ),
      sameLabelText: context1.labelText === context2.labelText,
      sameFormContext: context1.formId === context2.formId
    };
  }
}

interface FeatureDifferences {
  text: any;
  structural: any;
  visual: any;
  semantic: any;
  context: any;
  overallSimilarity: number;
}
