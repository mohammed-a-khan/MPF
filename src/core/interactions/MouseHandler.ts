// src/core/interactions/MouseHandler.ts
import { Page } from 'playwright';
import { CSWebElement } from '../elements/CSWebElement';
import { Point, MouseOptions } from './types/interaction.types';
import { ActionLogger } from '../logging/ActionLogger';

export class MouseHandler {
  private static instance: MouseHandler;

  constructor() {}

  static getInstance(): MouseHandler {
    if (!MouseHandler.instance) {
      MouseHandler.instance = new MouseHandler();
    }
    return MouseHandler.instance;
  }

  async moveTo(page: Page, x: number, y: number, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_move', { x, y, options });
    
    await page.mouse.move(x, y, {
      steps: options?.steps || 10
    });
  }

  async click(page: Page, x: number, y: number, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_click', { x, y, options });
    
    const clickOptions: Parameters<typeof page.mouse.click>[2] = {
      button: options?.button || 'left',
      clickCount: options?.clickCount || 1
    };
    if (options?.delay !== undefined) {
      clickOptions.delay = options.delay;
    }
    await page.mouse.click(x, y, clickOptions);
  }

  async doubleClick(page: Page, x: number, y: number, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_double_click', { x, y, options });
    
    const clickOptions: Parameters<typeof page.mouse.dblclick>[2] = {
      button: options?.button || 'left'
    };
    if (options?.delay !== undefined) {
      clickOptions.delay = options.delay;
    }
    await page.mouse.dblclick(x, y, clickOptions);
  }

  async rightClick(page: Page, x: number, y: number, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_right_click', { x, y, options });
    
    const clickOptions: Parameters<typeof page.mouse.click>[2] = {
      button: 'right' as const
    };
    if (options?.delay !== undefined) {
      clickOptions.delay = options.delay;
    }
    await page.mouse.click(x, y, clickOptions);
  }

  async hover(element: CSWebElement, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_hover', { element: element.description, options });
    
    const locator = await element.getLocator();
    const hoverOptions: Parameters<typeof locator.hover>[0] = {};
    if (options?.force !== undefined) {
      hoverOptions.force = options.force;
    }
    if (options?.timeout !== undefined) {
      hoverOptions.timeout = options.timeout;
    }
    if (options?.position !== undefined) {
      hoverOptions.position = options.position;
    }
    await locator.hover(hoverOptions);
  }

  async wheel(page: Page, deltaX: number, deltaY: number): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_wheel', { deltaX, deltaY });
    
    await page.mouse.wheel(deltaX, deltaY);
  }

  async down(page: Page, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_down', { options });
    
    await page.mouse.down({
      button: options?.button || 'left'
    });
  }

  async up(page: Page, options?: MouseOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_up', { options });
    
    await page.mouse.up({
      button: options?.button || 'left'
    });
  }

  async createMousePath(start: Point, end: Point, steps: number): Promise<Point[]> {
    const path: Point[] = [];
    const deltaX = (end.x - start.x) / steps;
    const deltaY = (end.y - start.y) / steps;
    
    for (let i = 0; i <= steps; i++) {
      path.push({
        x: start.x + deltaX * i,
        y: start.y + deltaY * i
      });
    }
    
    return path;
  }

  async drawOnCanvas(page: Page, path: Point[]): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_draw_on_canvas', { pathLength: path.length });
    
    if (path.length === 0) return;
    
    const firstPoint = path[0];
    if (!firstPoint) return;
    
    await page.mouse.move(firstPoint.x, firstPoint.y);
    await page.mouse.down();
    
    for (let i = 1; i < path.length; i++) {
      const point = path[i];
      if (!point) continue;
      await page.mouse.move(point.x, point.y, { steps: 1 });
    }
    
    await page.mouse.up();
  }

  async simulateHumanMovement(page: Page, start: Point, end: Point): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('mouse_human_movement', { start, end });
    
    const steps = 30;
    const path: Point[] = [];
    
    const controlPoint1 = {
      x: start.x + (end.x - start.x) * 0.25 + (Math.random() - 0.5) * 50,
      y: start.y + (end.y - start.y) * 0.25 + (Math.random() - 0.5) * 50
    };
    
    const controlPoint2 = {
      x: start.x + (end.x - start.x) * 0.75 + (Math.random() - 0.5) * 50,
      y: start.y + (end.y - start.y) * 0.75 + (Math.random() - 0.5) * 50
    };
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      
      const x = mt3 * start.x + 3 * mt2 * t * controlPoint1.x + 3 * mt * t2 * controlPoint2.x + t3 * end.x;
      const y = mt3 * start.y + 3 * mt2 * t * controlPoint1.y + 3 * mt * t2 * controlPoint2.y + t3 * end.y;
      
      path.push({ x, y });
    }
    
    for (let i = 1; i < path.length; i++) {
      const speed = Math.random() * 0.5 + 0.5;
      const point = path[i];
      if (!point) continue;
      await page.mouse.move(point.x, point.y, { steps: Math.ceil(3 * speed) });
      
      if (Math.random() < 0.1) {
        await page.waitForTimeout(Math.random() * 50 + 10);
      }
    }
  }
}
