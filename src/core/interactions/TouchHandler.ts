// src/core/interactions/TouchHandler.ts
import { Page } from 'playwright';
import { CSWebElement } from '../elements/CSWebElement';
import { Point, TouchOptions } from './types/interaction.types';
import { ActionLogger } from '../logging/ActionLogger';

export class TouchHandler {
  private static instance: TouchHandler;

  constructor() {}

  static getInstance(): TouchHandler {
    if (!TouchHandler.instance) {
      TouchHandler.instance = new TouchHandler();
    }
    return TouchHandler.instance;
  }

  async tap(element: CSWebElement, options?: TouchOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('touch_tap', { element: element.description, options });
    
    const locator = await element.getLocator();
    const tapOptions: Parameters<typeof locator.tap>[0] = {};
    if (options?.force !== undefined) {
      tapOptions.force = options.force;
    }
    if (options?.timeout !== undefined) {
      tapOptions.timeout = options.timeout;
    }
    if (options?.position !== undefined) {
      tapOptions.position = options.position;
    }
    await locator.tap(tapOptions);
  }

  async doubleTap(element: CSWebElement, options?: TouchOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('touch_double_tap', { element: element.description, options });
    
    const locator = await element.getLocator();
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Element ${element.description} is not visible`);
    }
    
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    
    const page = element.page;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(100);
    await page.touchscreen.tap(x, y);
  }

  async longPress(element: CSWebElement, duration: number = 500, options?: TouchOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('touch_long_press', { element: element.description, duration, options });
    
    const locator = await element.getLocator();
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Element ${element.description} is not visible`);
    }
    
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    
    const page = element.page;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(duration);
  }

  async swipe(
    page: Page,
    startPoint: Point,
    endPoint: Point,
    options?: TouchOptions
  ): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('touch_swipe', { startPoint, endPoint, options });
    
    const steps = options?.steps || 10;
    const duration = options?.duration || 250;
    
    const deltaX = (endPoint.x - startPoint.x) / steps;
    const deltaY = (endPoint.y - startPoint.y) / steps;
    const stepDelay = duration / steps;
    
    await page.touchscreen.tap(startPoint.x, startPoint.y);
    
    for (let i = 1; i <= steps; i++) {
      const x = startPoint.x + (deltaX * i);
      const y = startPoint.y + (deltaY * i);
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(stepDelay);
    }
  }

  async pinch(
    element: CSWebElement,
    scale: number,
    options?: TouchOptions
  ): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('touch_pinch', { element: element.description, scale, options });
    
    const locator = await element.getLocator();
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Element ${element.description} is not visible`);
    }
    
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    const page = element.page;
    const distance = Math.min(box.width, box.height) * 0.4;
    
    if (scale < 1) {
      await this.simulatePinch(page, centerX, centerY, distance, distance * scale);
    } else {
      await this.simulatePinch(page, centerX, centerY, distance * (1 / scale), distance);
    }
  }

  private async simulatePinch(
    page: Page,
    centerX: number,
    centerY: number,
    startDistance: number,
    endDistance: number
  ): Promise<void> {
    const steps = 10;
    const deltaDistance = (endDistance - startDistance) / steps;
    
    for (let i = 0; i <= steps; i++) {
      const currentDistance = startDistance + (deltaDistance * i);
      
      const x1 = centerX - currentDistance / 2;
      const x2 = centerX + currentDistance / 2;
      
      await page.touchscreen.tap(x1, centerY);
      await page.touchscreen.tap(x2, centerY);
      await page.waitForTimeout(20);
    }
  }

  async rotate(
    element: CSWebElement,
    degrees: number,
    options?: TouchOptions
  ): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('touch_rotate', { element: element.description, degrees, options });
    
    const locator = await element.getLocator();
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Element ${element.description} is not visible`);
    }
    
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const radius = Math.min(box.width, box.height) * 0.3;
    
    const page = element.page;
    const steps = 20;
    const angleStep = (degrees * Math.PI / 180) / steps;
    
    for (let i = 0; i <= steps; i++) {
      const angle = angleStep * i;
      
      const x1 = centerX + radius * Math.cos(angle);
      const y1 = centerY + radius * Math.sin(angle);
      const x2 = centerX - radius * Math.cos(angle);
      const y2 = centerY - radius * Math.sin(angle);
      
      await page.touchscreen.tap(x1, y1);
      await page.touchscreen.tap(x2, y2);
      await page.waitForTimeout(10);
    }
  }
}
