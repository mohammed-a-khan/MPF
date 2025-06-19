// src/core/interactions/DragDropHandler.ts
import { Page, Locator } from 'playwright';
import { CSWebElement } from '../elements/CSWebElement';
import { 
  DragOptions, 
  DragStep, 
  Point, 
  DragPathType 
} from './types/interaction.types';
import { ActionLogger } from '../logging/ActionLogger';

export class DragDropHandler {
  private static instance: DragDropHandler;

  private constructor() {}

  static getInstance(): DragDropHandler {
    if (!DragDropHandler.instance) {
      DragDropHandler.instance = new DragDropHandler();
    }
    return DragDropHandler.instance;
  }

  async dragAndDrop(
    source: CSWebElement,
    target: CSWebElement,
    options?: DragOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting drag and drop: ${source.description} to ${target.description}`, { 
        sourceElement: source.description,
        targetElement: target.description,
        options 
      });
      
      const sourceBox = await source.getBoundingBox();
      const targetBox = await target.getBoundingBox();
      
      if (!sourceBox || !targetBox) {
        throw new Error('Unable to get bounding box for source or target element');
      }
      
      const sourcePoint = this.getPositionPoint(sourceBox, options?.sourcePosition || 'center');
      const targetPoint = this.getPositionPoint(targetBox, options?.targetPosition || 'center');
      
      // Check if we should use HTML5 drag or mouse drag
      const useHTML5 = await this.shouldUseHTML5Drag(source.page, sourcePoint);
      
      if (useHTML5) {
        await this.performHTML5Drag(source, target, sourcePoint, targetPoint, options);
      } else {
        await this.performMouseDrag(source.page, sourcePoint, targetPoint, options);
      }
      
      ActionLogger.logInfo(`Drag and drop completed: ${source.description} to ${target.description}`, {
        duration: Date.now() - startTime,
        method: useHTML5 ? 'HTML5' : 'mouse'
      });
    } catch (error) {
      ActionLogger.logError(`Drag and drop failed: ${source.description} to ${target.description}`, error as Error);
      throw error;
    }
  }

  async dragToPosition(
    source: CSWebElement,
    position: Point,
    options?: DragOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting drag to position: ${source.description}`, { 
        targetPosition: position,
        options 
      });
      
      const sourceBox = await source.getBoundingBox();
      if (!sourceBox) {
        throw new Error('Unable to get bounding box for source element');
      }
      
      const sourcePoint = this.getPositionPoint(sourceBox, options?.sourcePosition || 'center');
      await this.performMouseDrag(source.page, sourcePoint, position, options);
      
      ActionLogger.logInfo(`Drag to position completed: ${source.description}`, {
        duration: Date.now() - startTime,
        endPosition: position
      });
    } catch (error) {
      ActionLogger.logError(`Drag to position failed: ${source.description}`, error as Error);
      throw error;
    }
  }

  async dragByOffset(
    source: CSWebElement,
    offsetX: number,
    offsetY: number,
    options?: DragOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting drag by offset: ${source.description}`, { 
        offset: { x: offsetX, y: offsetY },
        options 
      });
      
      const sourceBox = await source.getBoundingBox();
      if (!sourceBox) {
        throw new Error('Unable to get bounding box for source element');
      }
      
      const sourcePoint = this.getPositionPoint(sourceBox, options?.sourcePosition || 'center');
      const targetPoint = {
        x: sourcePoint.x + offsetX,
        y: sourcePoint.y + offsetY
      };
      
      await this.performMouseDrag(source.page, sourcePoint, targetPoint, options);
      
      ActionLogger.logInfo(`Drag by offset completed: ${source.description}`, {
        duration: Date.now() - startTime,
        offset: { x: offsetX, y: offsetY }
      });
    } catch (error) {
      ActionLogger.logError(`Drag by offset failed: ${source.description}`, error as Error);
      throw error;
    }
  }

  async performDragWithSteps(
    source: CSWebElement,
    steps: DragStep[],
    options?: DragOptions
  ): Promise<void> {
    const startTime = Date.now();
    const page = source.page;
    
    try {
      ActionLogger.logInfo(`Starting drag with custom steps: ${source.description}`, { 
        stepCount: steps.length,
        options 
      });
      
      // Apply modifiers if specified
      if (options?.modifiers) {
        for (const modifier of options.modifiers) {
          await page.keyboard.down(modifier);
        }
      }
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) continue;
        
        switch (step.action) {
          case 'down':
            await page.mouse.down();
            break;
          case 'up':
            await page.mouse.up();
            break;
          case 'move':
            await page.mouse.move(step.x || 0, step.y || 0, {
              steps: options?.smooth ? 10 : 1
            });
            break;
          case 'pause':
            await page.waitForTimeout(step.delay || 100);
            break;
          default:
            // Default is move
            await page.mouse.move(step.x || 0, step.y || 0, {
              steps: options?.smooth ? 10 : 1
            });
        }
        
        if (step.delay && step.action !== 'pause') {
          await page.waitForTimeout(step.delay);
        }
      }
      
      // Release modifiers
      if (options?.modifiers) {
        for (const modifier of options.modifiers.reverse()) {
          await page.keyboard.up(modifier);
        }
      }
      
      ActionLogger.logInfo(`Drag with steps completed: ${source.description}`, {
        duration: Date.now() - startTime,
        stepsExecuted: steps.length
      });
    } catch (error) {
      ActionLogger.logError('Drag with steps failed', error as Error);
      throw error;
    }
  }

  async performCustomDrag(
    source: CSWebElement,
    path: Point[],
    options?: DragOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (path.length < 2) {
        throw new Error('Path must contain at least 2 points');
      }
      
      ActionLogger.logInfo(`Starting custom drag: ${source.description}`, { 
        pathPoints: path.length,
        options 
      });
      
      const steps: DragStep[] = [];
      const firstPoint = path[0];
      const lastPoint = path[path.length - 1];
      
      if (!firstPoint || !lastPoint) {
        throw new Error('Invalid path points');
      }
      
      // Mouse down at first point
      steps.push({
        x: firstPoint.x,
        y: firstPoint.y,
        action: 'move'
      });
      steps.push({
        x: firstPoint.x,
        y: firstPoint.y,
        action: 'down'
      });
      
      // Move through all points
      for (let i = 1; i < path.length; i++) {
        const point = path[i];
        if (!point) continue;
        
        const step: DragStep = {
          x: point.x,
          y: point.y,
          action: 'move'
        };
        
        if (options?.delay !== undefined) {
          step.delay = options.delay;
        }
        
        steps.push(step);
      }
      
      // Mouse up at last point
      steps.push({
        x: lastPoint.x,
        y: lastPoint.y,
        action: 'up'
      });
      
      await this.performDragWithSteps(source, steps, options);
      
      ActionLogger.logInfo(`Custom drag completed: ${source.description}`, {
        duration: Date.now() - startTime,
        pathLength: path.length
      });
    } catch (error) {
      ActionLogger.logError('Custom drag failed', error as Error);
      throw error;
    }
  }

  async createDragPath(
    source: CSWebElement,
    target: CSWebElement,
    pathType: DragPathType = 'straight'
  ): Promise<Point[]> {
    const sourceBox = await source.getBoundingBox();
    const targetBox = await target.getBoundingBox();
    
    if (!sourceBox || !targetBox) {
      throw new Error('Unable to get bounding box for source or target element');
    }
    
    const startPoint = this.getPositionPoint(sourceBox, 'center');
    const endPoint = this.getPositionPoint(targetBox, 'center');
    
    switch (pathType) {
      case 'straight':
        return this.createStraightPath(startPoint, endPoint);
      case 'arc':
        return this.createArcPath(startPoint, endPoint);
      case 'zigzag':
        return this.createZigzagPath(startPoint, endPoint);
      default:
        return this.createStraightPath(startPoint, endPoint);
    }
  }

  private async performMouseDrag(
    page: Page,
    startPoint: Point,
    endPoint: Point,
    options?: DragOptions
  ): Promise<void> {
    await page.mouse.move(startPoint.x, startPoint.y);
    await page.mouse.down();
    
    if (options?.delay) {
      await page.waitForTimeout(options.delay);
    }
    
    if (options?.smooth) {
      const steps = options.steps || 10;
      for (let i = 1; i <= steps; i++) {
        const x = startPoint.x + (endPoint.x - startPoint.x) * (i / steps);
        const y = startPoint.y + (endPoint.y - startPoint.y) * (i / steps);
        await page.mouse.move(x, y);
        if (options.delay) {
          await page.waitForTimeout(options.delay / steps);
        }
      }
    } else {
      await page.mouse.move(endPoint.x, endPoint.y);
    }
    
    await page.mouse.up();
  }

  private async performHTML5Drag(
    source: CSWebElement,
    target: CSWebElement,
    sourcePoint: Point,
    targetPoint: Point,
    _options?: DragOptions
  ): Promise<void> {
    // Get locators for source and target
    const sourceLocator = await this.getElementLocator(source);
    const targetLocator = await this.getElementLocator(target);
    
    // Perform HTML5 drag and drop using page evaluation
    await source.page.evaluate(
      async ({ srcSelector, tgtSelector, srcPoint, tgtPoint }) => {
        const sourceEl = document.querySelector(srcSelector);
        const targetEl = document.querySelector(tgtSelector);
        
        if (!sourceEl || !targetEl) {
          throw new Error('Could not find source or target element');
        }
        
        // Create drag events
        const dataTransfer = new DataTransfer();
        
        const dragStartEvent = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: srcPoint.x,
          clientY: srcPoint.y
        });
        sourceEl.dispatchEvent(dragStartEvent);
        
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtPoint.x,
          clientY: tgtPoint.y
        });
        targetEl.dispatchEvent(dragOverEvent);
        
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtPoint.x,
          clientY: tgtPoint.y
        });
        targetEl.dispatchEvent(dropEvent);
        
        const dragEndEvent = new DragEvent('dragend', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: tgtPoint.x,
          clientY: tgtPoint.y
        });
        sourceEl.dispatchEvent(dragEndEvent);
      },
      {
        srcSelector: await this.getSelectorForLocator(sourceLocator),
        tgtSelector: await this.getSelectorForLocator(targetLocator),
        srcPoint: sourcePoint,
        tgtPoint: targetPoint
      }
    );
  }

  private async getElementLocator(element: CSWebElement): Promise<Locator> {
    // Since resolve is private, we need to use a different approach
    // We'll create a new locator based on the element's options
    const options = element.options;
    const page = element.page;
    
    switch (options.locatorType) {
      case 'css':
        return page.locator(options.locatorValue);
      case 'xpath':
        return page.locator(`xpath=${options.locatorValue}`);
      case 'text':
        return page.getByText(options.locatorValue);
      case 'testid':
        return page.getByTestId(options.locatorValue);
      default:
        return page.locator(options.locatorValue);
    }
  }

  private async getSelectorForLocator(locator: Locator): Promise<string> {
    // Get a unique selector for the locator
    // This is a simplified approach - in production you might want more sophisticated logic
    try {
      const handle = await locator.elementHandle();
      if (handle) {
        const selector = await handle.evaluate((el) => {
          // Try to get a unique selector
          if (el.id) return `#${el.id}`;
          if (el.className) return `.${el.className.split(' ')[0]}`;
          return el.tagName.toLowerCase();
        });
        await handle.dispose();
        return selector;
      }
    } catch {
      // Fallback to a generic selector
    }
    return '*';
  }

  private async shouldUseHTML5Drag(page: Page, point: Point): Promise<boolean> {
    return await page.evaluate((p) => {
      const element = document.elementFromPoint(p.x, p.y);
      if (!element) return false;
      
      // Check if element or its parents have draggable attribute
      let current: Element | null = element;
      while (current) {
        if (current.hasAttribute('draggable') && current.getAttribute('draggable') === 'true') {
          return true;
        }
        current = current.parentElement;
      }
      
      // Check for common drag-enabled elements
      const tagName = element.tagName.toLowerCase();
      return tagName === 'img' || tagName === 'a';
    }, point);
  }

  private getPositionPoint(
    box: { x: number; y: number; width: number; height: number },
    position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | Point
  ): Point {
    if (typeof position === 'object') {
      return position;
    }
    
    switch (position) {
      case 'center':
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2
        };
      case 'top-left':
        return {
          x: box.x,
          y: box.y
        };
      case 'top-right':
        return {
          x: box.x + box.width,
          y: box.y
        };
      case 'bottom-left':
        return {
          x: box.x,
          y: box.y + box.height
        };
      case 'bottom-right':
        return {
          x: box.x + box.width,
          y: box.y + box.height
        };
    }
  }

  private createStraightPath(start: Point, end: Point, steps: number = 10): Point[] {
    const path: Point[] = [];
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      });
    }
    
    return path;
  }

  private createArcPath(start: Point, end: Point, steps: number = 20): Point[] {
    const path: Point[] = [];
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)) / 2;
    
    for (let i = 0; i <= steps; i++) {
      const angle = Math.PI * (i / steps);
      const x = midX + radius * Math.cos(angle);
      const y = midY - radius * Math.sin(angle) / 2;
      path.push({ x, y });
    }
    
    return path;
  }

  private createZigzagPath(start: Point, end: Point, steps: number = 10): Point[] {
    const path: Point[] = [];
    const amplitude = 50;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const baseX = start.x + (end.x - start.x) * t;
      const baseY = start.y + (end.y - start.y) * t;
      const offset = amplitude * Math.sin(t * Math.PI * 4) * (1 - t);
      
      path.push({
        x: baseX + offset,
        y: baseY
      });
    }
    
    return path;
  }

  async simulateDragHover(
    source: CSWebElement,
    hoverTargets: CSWebElement[],
    _options?: DragOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      ActionLogger.logInfo(`Starting drag hover simulation: ${source.description}`, { 
        hoverTargetCount: hoverTargets.length 
      });
      
      const sourceBox = await source.getBoundingBox();
      if (!sourceBox) {
        throw new Error('Unable to get bounding box for source element');
      }
      
      const sourcePoint = this.getPositionPoint(sourceBox, 'center');
      const hoverPoints: Point[] = [sourcePoint];
      
      // Get hover points for all targets
      for (const target of hoverTargets) {
        const targetBox = await target.getBoundingBox();
        if (targetBox) {
          hoverPoints.push(this.getPositionPoint(targetBox, 'center'));
        }
      }
      
      // Add return to source
      hoverPoints.push(sourcePoint);
      
      // Create hover path
      const path: Point[] = [];
      for (let i = 0; i < hoverPoints.length - 1; i++) {
        const start = hoverPoints[i];
        const end = hoverPoints[i + 1];
        if (start && end) {
          const segment = this.createStraightPath(start, end, 5);
          path.push(...segment);
        }
      }
      
      // Perform drag along path
      await this.performCustomDrag(source, path);
      
      ActionLogger.logInfo(`Drag hover simulation completed: ${source.description}`, {
        duration: Date.now() - startTime,
        targetsHovered: hoverTargets.length
      });
    } catch (error) {
      ActionLogger.logError('Drag hover simulation failed', error as Error);
      throw error;
    }
  }
}