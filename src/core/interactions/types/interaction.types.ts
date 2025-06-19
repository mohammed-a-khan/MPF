// src/core/interactions/types/interaction.types.ts
export interface DragOptions {
  sourcePosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | Point;
  targetPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | Point;
  steps?: number;
  delay?: number;
  smooth?: boolean;
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
}

export interface DragStep {
  x: number;
  y: number;
  delay?: number;
  action?: 'move' | 'pause' | 'down' | 'up';
}

export interface MouseMoveOptions {
  steps?: number;
  delay?: number;
  smooth?: boolean;
}

export interface MouseClickOptions {
  button?: MouseButton;
  clickCount?: number;
  delay?: number;
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
}

export interface Point {
  x: number;
  y: number;
}

export interface Touch {
  x: number;
  y: number;
  id?: number;
  pressure?: number;
  radiusX?: number;
  radiusY?: number;
}

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';
export type MouseButton = 'left' | 'right' | 'middle';
export type Modifier = 'Alt' | 'Control' | 'Meta' | 'Shift';

export interface KeyboardOptions {
  delay?: number;
  natural?: boolean;
  pressDelay?: number;
  releaseDelay?: number;
  sequenceDelay?: number;
}

export interface MouseOptions {
  button?: MouseButton;
  clickCount?: number;
  delay?: number;
  force?: boolean;
  timeout?: number;
  position?: Point;
  steps?: number;
}

export interface TouchOptions {
  force?: boolean;
  timeout?: number;
  position?: Point;
  duration?: number;
  steps?: number;
}

export interface FileUploadOptions {
  acceptTypes?: string[];
  maxSize?: number;
  validateContent?: boolean;
  simulateDragDrop?: boolean;
}

export interface DownloadOptions {
  timeout?: number;
  savePath?: string;
  waitForComplete?: boolean;
  validateSize?: number;
}

export interface SwipeOptions {
  duration?: number;
  steps?: number;
  pressure?: number;
  smooth?: boolean;
}

export interface PinchOptions {
  duration?: number;
  center?: Point;
  steps?: number;
}

export interface RotateOptions {
  duration?: number;
  center?: Point;
  steps?: number;
}

export interface ScrollOptions {
  behavior?: 'auto' | 'smooth';
  block?: 'center' | 'end' | 'nearest' | 'start';
  inline?: 'center' | 'end' | 'nearest' | 'start';
}

export interface GestureSequence {
  type: 'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'pinch' | 'rotate';
  options?: any;
  delay?: number;
}

export interface DragPath {
  points: Point[];
  duration?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export type DragPathType = 'straight' | 'arc' | 'zigzag';

export interface MousePath {
  start: Point;
  end: Point;
  controlPoints?: Point[];
  duration?: number;
}