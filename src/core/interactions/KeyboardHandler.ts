// src/core/interactions/KeyboardHandler.ts
import { Page } from 'playwright';
import { CSWebElement } from '../elements/CSWebElement';
import { KeyboardOptions } from './types/interaction.types';
import { ActionLogger } from '../logging/ActionLogger';

export class KeyboardHandler {
  private static instance: KeyboardHandler;

  constructor() {}

  static getInstance(): KeyboardHandler {
    if (!KeyboardHandler.instance) {
      KeyboardHandler.instance = new KeyboardHandler();
    }
    return KeyboardHandler.instance;
  }

  async type(page: Page, text: string, options?: KeyboardOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_type', { textLength: text.length, options });
    
    await page.keyboard.type(text, options?.delay !== undefined ? {
      delay: options.delay
    } : {});
  }

  async press(page: Page, key: string, options?: KeyboardOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_press', { key, options });
    
    await page.keyboard.press(key, options?.delay !== undefined ? {
      delay: options.delay
    } : {});
  }

  async down(page: Page, key: string): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_down', { key });
    
    await page.keyboard.down(key);
  }

  async up(page: Page, key: string): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_up', { key });
    
    await page.keyboard.up(key);
  }

  async insertText(page: Page, text: string): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_insert_text', { textLength: text.length });
    
    await page.keyboard.insertText(text);
  }

  async typeInElement(element: CSWebElement, text: string, options?: KeyboardOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_type_in_element', { 
      element: element.description, 
      textLength: text.length, 
      options 
    });
    
    const locator = await element.getLocator();
    await locator.fill(text);
    
    if (options?.delay) {
      // Simulate typing with delay
      await locator.clear();
      await locator.type(text, { delay: options.delay });
    }
  }

  async pressSequence(page: Page, keys: string[], options?: KeyboardOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_press_sequence', { keys, options });
    
    for (const key of keys) {
      await page.keyboard.press(key, options?.delay !== undefined ? {
        delay: options.delay
      } : {});
      
      if (options?.sequenceDelay) {
        await page.waitForTimeout(options.sequenceDelay);
      }
    }
  }

  async selectAll(page: Page): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_select_all', {});
    
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+a`);
  }

  async copy(page: Page): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_copy', {});
    
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+c`);
  }

  async paste(page: Page): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_paste', {});
    
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+v`);
  }

  async cut(page: Page): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_cut', {});
    
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+x`);
  }

  async undo(page: Page): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_undo', {});
    
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+z`);
  }

  async redo(page: Page): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_redo', {});
    
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    if (process.platform === 'darwin') {
      await page.keyboard.press(`${modifier}+Shift+z`);
    } else {
      await page.keyboard.press(`${modifier}+y`);
    }
  }

  async pressKeyCombo(page: Page, keyCombo: string, options?: KeyboardOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_key_combo', { keyCombo, options });
    
    await page.keyboard.press(keyCombo, options?.delay !== undefined ? {
      delay: options.delay
    } : {});
  }

  async typeNaturally(element: CSWebElement, text: string, options?: KeyboardOptions): Promise<void> {
    const actionLogger = ActionLogger.getInstance();
    await actionLogger.logAction('keyboard_type_naturally', { 
      element: element.description, 
      textLength: text.length, 
      options 
    });
    
    const locator = await element.getLocator();
    await locator.focus();
    
    // Simulate natural typing with random delays
    for (const char of text) {
      await element.page.keyboard.type(char);
      const delay = options?.delay || Math.random() * 100 + 50; // Random delay between 50-150ms
      await element.page.waitForTimeout(delay);
    }
  }
}