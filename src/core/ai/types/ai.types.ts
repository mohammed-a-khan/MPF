// src/core/ai/types/ai.types.ts

import { Locator, ElementHandle, Page } from 'playwright';

export interface AIConfig {
  enabled: boolean;
  confidenceThreshold: number;
  maxCandidates: number;
  cacheTimeout: number;
  enableVisualRecognition: boolean;
  enableNLP: boolean;
  enableSelfHealing: boolean;
  trainingDataPath?: string;
}

export interface AIIdentificationResult {
  locator: Locator;
  confidence: number;
  method: 'exact' | 'nlp' | 'visual' | 'pattern' | 'healing';
  alternatives: Array<{
    locator: Locator;
    confidence: number;
  }>;
}

export interface ElementFeatures {
  text: TextFeatures;
  visual: VisualFeatures;
  structural: StructuralFeatures;
  semantic: SemanticFeatures;
  context: ContextFeatures;
  timestamp: number;
}

export interface TextFeatures {
  content: string;
  visibleText: string;
  length: number;
  words: number;
  ariaLabel?: string;
  title?: string;
  placeholder?: string;
  value?: string;
  alt?: string;
  textSources?: string[];
  hasNumbers?: boolean;
  hasUppercase?: boolean;
  hasSpecialChars?: boolean;
  language?: string;
}

export interface VisualFeatures {
  isVisible: boolean;
  boundingBox: DOMRect;
  inViewport: boolean;
  zIndex: number;
  opacity: number;
  backgroundColor: string;
  color: string;
  fontSize: string;
  fontWeight: string;
  hasHighContrast: boolean;
  hasAnimation: boolean;
  borderStyle?: string;
  boxShadow?: string;
  cursor?: string;
  display?: string;
  position?: string;
  visualWeight?: number;
}

export interface StructuralFeatures {
  tagName: string;
  attributes: Record<string, string>;
  classList: string[];
  id: string;
  isInteractive: boolean;
  hasChildren: boolean;
  childCount: number;
  depth: number;
  path?: string[];
  role?: string | null;
  formElement: boolean;
  inputType?: string;
  href?: string;
  src?: string;
  disabled?: boolean;
  readOnly?: boolean;
  checked?: boolean;
  selected?: boolean;
  siblingCount?: number;
  siblingIndex?: number;
  isFirstChild?: boolean;
  isLastChild?: boolean;
}

export interface SemanticFeatures {
  role: string;
  ariaLabel?: string | null;
  ariaDescribedBy?: string | null;
  ariaLabelledBy?: string | null;
  isLandmark: boolean;
  headingLevel: number;
  listItem: boolean;
  listContainer?: boolean;
  tableCell: boolean;
  tableRow?: boolean;
  table?: boolean;
  semanticType?: string;
  isRequired?: boolean;
  isInvalid?: boolean;
  describedByElements?: string[];
}

export interface ContextFeatures {
  parentTag: string;
  parentText: string;
  siblingTexts: string[];
  nearbyHeading: string;
  labelText: string;
  formId: string;
  tableHeaders: string[];
  nearestLandmark?: {
    role: string;
    id: string;
  } | null;
  precedingText?: string;
  followingText?: string;
}

export interface DOMAnalysis {
  hierarchy: ElementInfo;
  forms: FormInfo[];
  tables: TableInfo[];
  navigation: NavigationInfo[];
  metrics: DOMMetrics;
  title: string;
  url: string;
  timestamp: number;
}

export interface ElementInfo {
  tagName: string;
  id: string;
  className: string;
  attributes: Record<string, string>;
  text: string;
  directText: string;
  visible: boolean;
  inViewport: boolean;
  interactive: boolean;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
  styles: {
    display: string;
    position: string;
    zIndex: string;
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    cursor: string;
  };
  ariaAttributes: Record<string, string>;
  depth: number;
  path: string[];
  xpath: string;
  children: ElementInfo[];
}

export interface FormInfo {
  name: string;
  id: string;
  action: string;
  method: string;
  fields: Array<{
    name: string;
    type: string;
    id: string;
    required: boolean;
  }>;
}

export interface TableInfo {
  id: string;
  className: string;
  rows: number;
  columns: number;
  headers: string[];
}

export interface NavigationInfo {
  id: string;
  className: string;
  links: Array<{
    text: string;
    href: string;
    active: boolean;
  }>;
}

export interface DOMMetrics {
  totalElements: number;
  visibleElements: number;
  interactableElements: number;
  forms: number;
  tables: number;
  images: number;
  links: number;
  maxDepth: number;
  averageDepth: number;
}

export interface ElementCandidate {
  element: ElementHandle;
  locator: Locator;
  selector: string;
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
  isInteractive: boolean;
  relevance: number;
  allText: string;
  page: Page;
}

export interface ScoredElement {
  element: ElementHandle;
  locator: Locator;
  score: number;
  breakdown: ScoreBreakdown;
  features: ElementFeatures;
}

export interface ScoreBreakdown {
  textScore: number;
  structureScore: number;
  visualScore: number;
  patternScore: number;
  positionScore?: number;
  contextScore?: number;
  trainingBoost?: number;
}

export type IntentType = 'action' | 'navigation' | 'assertion' | 'extraction' | 'modification' | 'interaction' | 'validation' | 'wait' | 'data' | 'unknown';
export type ActionType = 'click' | 'type' | 'select' | 'check' | 'uncheck' | 'hover' | 'focus' | 'blur' | 'clear' | 'upload' | 'download' | 'drag' | 'drop' | 'scroll' | 'wait' | 'press' | 'navigate' | 'submit' | 'cancel' | 'open' | 'close' | 'toggle' | 'refresh' | 'rightclick' | 'doubleclick' | 'assert' | 'assertExists' | 'assertNotExists' | 'assertVisible' | 'assertNotVisible' | 'assertEnabled' | 'assertDisabled' | 'assertSelected' | 'assertText' | 'assertValue' | 'assertTitle' | 'assertContains' | 'assertCount' | 'get' | 'set' | 'read' | 'write' | 'extract' | 'waitUntil' | 'waitTime' | 'waitVisible' | 'waitHidden' | 'waitEnabled' | 'waitReady' | 'waitCondition' | 'go' | 'back' | 'forward' | 'reload' | 'capture' | 'switch' | 'store' | 'use' | 'unknown';
export type TargetType = 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'radio' | 'text' | 'image' | 'element' | 'page' | 'frame' | 'window' | 'tab' | 'time';

export interface Intent {
  type: IntentType;
  action: ActionType;
  target?: TargetType | undefined;
  value?: string | undefined;
  confidence: IntentConfidence;
  parameters?: Record<string, any> | undefined;
  modifiers?: string[] | undefined;
  position?: string | undefined;
  context?: string | undefined;
}

export interface IntentConfidence {
  overall: number;
  action: number;
  target: number;
  parameters?: number;
}

export type TokenType = 'word' | 'number' | 'symbol' | 'punctuation' | 'whitespace';

export interface Token {
  text: string;
  type: TokenType;
  position: number;
  length: number;
  isKeyword?: boolean;
  isAction?: boolean;
  isTarget?: boolean;
  isModifier?: boolean;
  lemma?: string;
  partOfSpeech?: string;
}

export type KeywordType = 'element' | 'action' | 'attribute' | 'modifier' | 'identifier' | 'position' | 'value';

export interface Keyword {
  word: string;
  type: KeywordType;
  score: number;
  position: number;
  context?: string | string[];
  confidence?: number;
  weight?: number;
  frequency?: number;
  source?: string;
}

export interface NLPResult {
  intent: 'click' | 'type' | 'select' | 'check' | 'navigate' | 'validate';
  elementType?: string | undefined;
  keywords: string[];
  exactText?: string | undefined;
  semanticTokens?: string[] | undefined;
  expectedRoles?: string[] | undefined;
  expectsInteractive?: boolean | undefined;
  expectsVisible?: boolean | undefined;
  formElement?: boolean | undefined;
  expectedPosition?: string | undefined;
  positionKeywords?: string[] | undefined;
  parentContext?: string | undefined;
  siblingContext?: string | undefined;
  formContext?: boolean | undefined;
  pattern?: UIPattern | undefined;
}

export interface UIPattern {
  name: string;
  tags: string[];
  attributes: string[];
  weight: number;
  structure?: {
    parent?: string;
    children?: string[];
  };
}

export interface SemanticMap {
  structure: any;
  landmarks: Array<{
    role: string;
    id: string;
    className: string;
    selector: string;
  }>;
}

export interface TrainingData {
  id: string;
  description: string;
  features: ElementFeatures;
  locator: string;
  timestamp: Date;
  success: boolean;
  url: string;
  elementType: string;
}

export interface IdentificationCache {
  locator: Locator;
  confidence: number;
  timestamp: number;
}

export interface HealingResult {
  success: boolean;
  newLocator?: Locator;
  strategy: string;
  confidence: number;
  alternativeLocators?: Array<{
    locator: Locator;
    confidence: number;
  }>;
}

export interface HealingStrategy {
  name: string;
  priority: number;
  apply(element: any, context: HealingContext): Promise<HealingResult>;
}

export interface HealingContext {
  originalLocator: string;
  lastKnownFeatures?: ElementFeatures;
  page: Page;
  description: string;
}

export interface HealingRecord {
  elementId: string;
  timestamp: Date;
  strategy: string;
  success: boolean;
  oldLocator: string;
  newLocator?: string;
  confidence?: number;
}

export interface HealingStats {
  totalAttempts: number;
  successfulHeals: number;
  failedHeals: number;
  byStrategy: Record<string, {
    attempts: number;
    successes: number;
    averageConfidence: number;
  }>;
  fragileElements: Array<{
    description: string;
    healCount: number;
    lastHealed: Date;
  }>;
}

export interface VisualData {
  pixels: Uint8Array;
  width: number;
  height: number;
  colors: ColorHistogram;
  edges: EdgeMap;
}

export interface ColorHistogram {
  dominant: string[];
  distribution: Record<string, number>;
}

export interface EdgeMap {
  horizontal: number[][];
  vertical: number[][];
}

export interface SimilarityWeights {
  text: number;
  structure: number;
  visual: number;
  semantic: number;
  context: number;
}

export interface AIError extends Error {
  code: 'AI_IDENTIFICATION_FAILED' | 'AI_CONFIDENCE_TOO_LOW' | 'AI_NO_CANDIDATES' | 'AI_HEALING_FAILED';
  details?: any;
}
