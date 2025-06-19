// src/steps/ui/AdvancedInteractionSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { CSWebElement } from '../../core/elements/CSWebElement';
import { CSGetElementOptions } from '../../core/elements/types/element.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { DragDropHandler } from '../../core/interactions/DragDropHandler';
import { MouseHandler } from '../../core/interactions/MouseHandler';
import { TouchHandler } from '../../core/interactions/TouchHandler';
import { KeyboardHandler } from '../../core/interactions/KeyboardHandler';
import { Point } from '../../core/interactions/types/interaction.types';

export class AdvancedInteractionSteps extends CSBDDBaseStepDefinition {
    private dragDropHandler: DragDropHandler;
    private mouseHandler: MouseHandler;
    private touchHandler: TouchHandler;
    private keyboardHandler: KeyboardHandler;

    constructor() {
        super();
        this.dragDropHandler = DragDropHandler.getInstance();
        this.mouseHandler = MouseHandler.getInstance();
        this.touchHandler = TouchHandler.getInstance();
        this.keyboardHandler = KeyboardHandler.getInstance();
    }

    @CSBDDStepDef('user drags {string} to {string}')
    @CSBDDStepDef('I drag {string} to {string}')
    @CSBDDStepDef('user drags and drops {string} on {string}')
    async dragAndDrop(sourceDescription: string, targetDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('drag_and_drop', { 
            source: sourceDescription,
            target: targetDescription 
        });
        
        try {
            const sourceElement = await this.findElement(sourceDescription);
            const targetElement = await this.findElement(targetDescription);
            
            await this.dragDropHandler.dragAndDrop(sourceElement, targetElement, {
                steps: ConfigurationManager.getInt('DRAG_STEPS', 10),
                delay: ConfigurationManager.getInt('DRAG_DELAY', 0)
            });
            
            await actionLogger.logAction('drag_and_drop_completed', { 
                source: sourceDescription,
                target: targetDescription,
                success: true 
            });
        } catch (error) {
            await await actionLogger.logError(error as Error, { 
                source: sourceDescription,
                target: targetDescription 
            });
            throw new Error(`Failed to drag "${sourceDescription}" to "${targetDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user drags {string} by offset {int},{int}')
    @CSBDDStepDef('I drag {string} by {int} pixels horizontally and {int} pixels vertically')
    async dragByOffset(elementDescription: string, offsetX: number, offsetY: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('drag_by_offset', { 
            element: elementDescription,
            offsetX,
            offsetY 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            
            await this.dragDropHandler.dragByOffset(element, offsetX, offsetY);
            
            await actionLogger.logAction('drag_by_offset_completed', { 
                element: elementDescription,
                offset: { x: offsetX, y: offsetY },
                success: true
            });
        } catch (error) {
            await await actionLogger.logError(error as Error, { element: elementDescription });
            throw new Error(`Failed to drag "${elementDescription}" by offset: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user triple clicks {string}')
    @CSBDDStepDef('I triple click {string}')
    async tripleClick(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('triple_click', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.tripleClick();
            
            await actionLogger.logAction('triple_click_completed', { element: elementDescription, success: true });
        } catch (error) {
            await await actionLogger.logError(error as Error, { element: elementDescription });
            throw new Error(`Failed to triple click "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clicks {string} while holding {string}')
    @CSBDDStepDef('I click {string} with {string} key pressed')
    async clickWithModifier(elementDescription: string, modifier: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('click_with_modifier', { 
            element: elementDescription,
            modifier 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const modifiers = this.parseModifiers(modifier);
            
            await element.click({ modifiers });
            
            await actionLogger.logAction('click_with_modifier_completed', { 
                element: elementDescription,
                modifiers 
            });
        } catch (error) {
            await await actionLogger.logError(error as Error, { element: elementDescription });
            throw new Error(`Failed to click "${elementDescription}" with ${modifier}: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user performs mouse wheel on {string} with delta {int},{int}')
    @CSBDDStepDef('I scroll mouse wheel on {string} by {int} horizontally and {int} vertically')
    async mouseWheel(elementDescription: string, deltaX: number, deltaY: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('mouse_wheel', { 
            element: elementDescription,
            deltaX,
            deltaY 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.mouseWheel(deltaX, deltaY);
            
            await actionLogger.logAction('mouse_wheel_completed', { 
                element: elementDescription,
                delta: { x: deltaX, y: deltaY }
            });
        } catch (error) {
            await await actionLogger.logError(error as Error, { element: elementDescription });
            throw new Error(`Failed to perform mouse wheel on "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user swipes {string} {string}')
    @CSBDDStepDef('I swipe {string} in {string} direction')
    async swipe(elementDescription: string, direction: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Swipe', { 
            element: elementDescription,
            direction 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const swipeDirection = direction.toLowerCase() as 'up' | 'down' | 'left' | 'right';
            const distance = ConfigurationManager.getInt('SWIPE_DISTANCE', 100);
            
            const box = await element.getBoundingBox();
            if (!box) {
                throw new Error(`Element ${elementDescription} is not visible`);
            }
            
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            
            let endPoint: Point;
            switch (swipeDirection) {
                case 'up':
                    endPoint = { x: centerX, y: centerY - distance };
                    break;
                case 'down':
                    endPoint = { x: centerX, y: centerY + distance };
                    break;
                case 'left':
                    endPoint = { x: centerX - distance, y: centerY };
                    break;
                case 'right':
                    endPoint = { x: centerX + distance, y: centerY };
                    break;
            }
            
            await this.touchHandler.swipe(this.page, { x: centerX, y: centerY }, endPoint);
            
            await actionLogger.logAction('Swipe completed', { 
                element: elementDescription,
                direction: swipeDirection,
                distance 
            });
        } catch (error) {
            await actionLogger.logError('Swipe failed', error as Error);
            throw new Error(`Failed to swipe "${elementDescription}" ${direction}: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user pinches {string} with scale {float}')
    @CSBDDStepDef('I pinch {string} to {float} scale')
    async pinch(elementDescription: string, scale: number): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Pinch', { 
            element: elementDescription,
            scale 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.pinch(scale);
           
           await actionLogger.logAction('Pinch completed', { 
               element: elementDescription,
               scale 
           });
       } catch (error) {
           await actionLogger.logError('Pinch failed', error as Error);
           throw new Error(`Failed to pinch "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user taps {string}')
   @CSBDDStepDef('I tap {string}')
   async tap(elementDescription: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Tap', { element: elementDescription });
       
       try {
           const element = await this.findElement(elementDescription);
           await element.tap();
           
           await actionLogger.logAction('Tap completed', { element: elementDescription });
       } catch (error) {
           await actionLogger.logError('Tap failed', error as Error);
           throw new Error(`Failed to tap "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user double taps {string}')
   @CSBDDStepDef('I double tap {string}')
   async doubleTap(elementDescription: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Double tap', { element: elementDescription });
       
       try {
           const element = await this.findElement(elementDescription);
           await this.touchHandler.doubleTap(element);
           
           await actionLogger.logAction('Double tap completed', { element: elementDescription });
       } catch (error) {
           await actionLogger.logError('Double tap failed', error as Error);
           throw new Error(`Failed to double tap "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user long presses {string} for {int} milliseconds')
   @CSBDDStepDef('I long press {string} for {int} ms')
   async longPress(elementDescription: string, duration: number): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Long press', { 
           element: elementDescription,
           duration 
       });
       
       try {
           const element = await this.findElement(elementDescription);
           await this.touchHandler.longPress(element, duration);
           
           await actionLogger.logAction('Long press completed', { 
               element: elementDescription,
               duration 
           });
       } catch (error) {
           await actionLogger.logError('Long press failed', error as Error);
           throw new Error(`Failed to long press "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user rotates {string} by {int} degrees')
   @CSBDDStepDef('I rotate {string} {int} degrees')
   async rotate(elementDescription: string, degrees: number): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Rotate', { 
           element: elementDescription,
           degrees 
       });
       
       try {
           const element = await this.findElement(elementDescription);
           await this.touchHandler.rotate(element, degrees);
           
           await actionLogger.logAction('Rotate completed', { 
               element: elementDescription,
               degrees 
           });
       } catch (error) {
           await actionLogger.logError('Rotate failed', error as Error);
           throw new Error(`Failed to rotate "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user scrolls {string} to top')
   @CSBDDStepDef('I scroll {string} to the top')
   async scrollToTop(elementDescription: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Scroll to top', { element: elementDescription });
       
       try {
           const element = await this.findElement(elementDescription);
           await this.page.evaluate((el) => {
               (el as HTMLElement).scrollTop = 0;
           }, await element.elementHandle());
           
           await actionLogger.logAction('Scrolled to top', { element: elementDescription });
       } catch (error) {
           await actionLogger.logError('Scroll to top failed', error as Error);
           throw new Error(`Failed to scroll "${elementDescription}" to top: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user scrolls {string} to bottom')
   @CSBDDStepDef('I scroll {string} to the bottom')
   async scrollToBottom(elementDescription: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Scroll to bottom', { element: elementDescription });
       
       try {
           const element = await this.findElement(elementDescription);
           await this.page.evaluate((el) => {
               const htmlElement = el as HTMLElement;
               htmlElement.scrollTop = htmlElement.scrollHeight;
           }, await element.elementHandle());
           
           await actionLogger.logAction('Scrolled to bottom', { element: elementDescription });
       } catch (error) {
           await actionLogger.logError('Scroll to bottom failed', error as Error);
           throw new Error(`Failed to scroll "${elementDescription}" to bottom: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user scrolls page by {int} pixels')
   @CSBDDStepDef('I scroll the page by {int} pixels')
   async scrollPageBy(pixels: number): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Scroll page by pixels', { pixels });
       
       try {
           await this.page.evaluate((scrollAmount) => {
               window.scrollBy(0, scrollAmount);
           }, pixels);
           
           // Wait for scroll to complete
           await this.page.waitForTimeout(ConfigurationManager.getInt('SCROLL_DELAY', 300));
           
           await actionLogger.logAction('Page scrolled', { pixels });
       } catch (error) {
           await actionLogger.logError('Page scroll failed', error as Error);
           throw new Error(`Failed to scroll page by ${pixels} pixels: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user draws on {string} from {int},{int} to {int},{int}')
   @CSBDDStepDef('I draw on {string} from point {int},{int} to point {int},{int}')
   async drawOnCanvas(elementDescription: string, startX: number, startY: number, endX: number, endY: number): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Draw on canvas', { 
           element: elementDescription,
           start: { x: startX, y: startY },
           end: { x: endX, y: endY }
       });
       
       try {
           const element = await this.findElement(elementDescription);
           const box = await element.getBoundingBox();
           
           if (!box) {
               throw new Error('Element bounding box not found');
           }
           
           const absoluteStartX = box.x + startX;
           const absoluteStartY = box.y + startY;
           const absoluteEndX = box.x + endX;
           const absoluteEndY = box.y + endY;
           
           // Create path for drawing
           const path = await this.mouseHandler.createMousePath(
               { x: absoluteStartX, y: absoluteStartY },
               { x: absoluteEndX, y: absoluteEndY },
               ConfigurationManager.getInt('DRAW_STEPS', 20)
           );
           
           await this.mouseHandler.drawOnCanvas(this.page, path);
           
           await actionLogger.logAction('Drawing completed', { 
               element: elementDescription,
               pathLength: path.length 
           });
       } catch (error) {
           await actionLogger.logError('Drawing failed', error as Error);
           throw new Error(`Failed to draw on "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user performs key combination {string}')
   @CSBDDStepDef('I press key combination {string}')
   async pressKeyCombo(keyCombo: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Press key combination', { keyCombo });
       
       try {
           await this.keyboardHandler.pressKeyCombo(this.page, keyCombo);
           
           await actionLogger.logAction('Key combination pressed', { keyCombo });
       } catch (error) {
           await actionLogger.logError('Key combination failed', error as Error);
           throw new Error(`Failed to press key combination "${keyCombo}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user types naturally {string} in {string}')
   @CSBDDStepDef('I type {string} naturally in {string}')
   async typeNaturally(text: string, elementDescription: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Type naturally', { 
           text: this.maskSensitiveData(text),
           element: elementDescription 
       });
       
       try {
           const element = await this.findElement(elementDescription);
           await this.keyboardHandler.typeNaturally(element, text);
           
           await actionLogger.logAction('Natural typing completed', { 
               element: elementDescription,
               textLength: text.length 
           });
       } catch (error) {
           await actionLogger.logError('Natural typing failed', error as Error);
           throw new Error(`Failed to type naturally in "${elementDescription}": ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user selects all')
   @CSBDDStepDef('I select all')
   async selectAll(): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Select all');
       
       try {
           await this.keyboardHandler.selectAll(this.page);
           
           await actionLogger.logAction('Select all completed');
       } catch (error) {
           await actionLogger.logError('Select all failed', error as Error);
           throw new Error(`Failed to select all: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user copies selection')
   @CSBDDStepDef('I copy')
   async copy(): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Copy');
       
       try {
           await this.keyboardHandler.copy(this.page);
           
           await actionLogger.logAction('Copy completed');
       } catch (error) {
           await actionLogger.logError('Copy failed', error as Error);
           throw new Error(`Failed to copy: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user pastes')
   @CSBDDStepDef('I paste')
   async paste(): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Paste');
       
       try {
           await this.keyboardHandler.paste(this.page);
           
           await actionLogger.logAction('Paste completed');
       } catch (error) {
           await actionLogger.logError('Paste failed', error as Error);
           throw new Error(`Failed to paste: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user cuts selection')
   @CSBDDStepDef('I cut')
   async cut(): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Cut');
       
       try {
           await this.keyboardHandler.cut(this.page);
           
           await actionLogger.logAction('Cut completed');
       } catch (error) {
           await actionLogger.logError('Cut failed', error as Error);
           throw new Error(`Failed to cut: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user performs undo')
   @CSBDDStepDef('I undo')
   async undo(): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Undo');
       
       try {
           await this.keyboardHandler.undo(this.page);
           
           await actionLogger.logAction('Undo completed');
       } catch (error) {
           await actionLogger.logError('Undo failed', error as Error);
           throw new Error(`Failed to undo: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user performs redo')
   @CSBDDStepDef('I redo')
   async redo(): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Redo');
       
       try {
           await this.keyboardHandler.redo(this.page);
           
           await actionLogger.logAction('Redo completed');
       } catch (error) {
           await actionLogger.logError('Redo failed', error as Error);
           throw new Error(`Failed to redo: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user simulates human-like mouse movement from {string} to {string}')
   @CSBDDStepDef('I move mouse naturally from {string} to {string}')
   async humanMouseMove(fromElement: string, toElement: string): Promise<void> {
       const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('Human-like mouse movement', { 
           from: fromElement,
           to: toElement 
       });
       
       try {
           const fromEl = await this.findElement(fromElement);
           const toEl = await this.findElement(toElement);
           
           const fromBox = await fromEl.getBoundingBox();
           const toBox = await toEl.getBoundingBox();
           
           if (!fromBox || !toBox) {
               throw new Error('Element bounding box not found');
           }
           
           await this.mouseHandler.simulateHumanMovement(
               this.page,
               { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height / 2 },
               { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height / 2 }
           );
           
           await actionLogger.logAction('Human-like mouse movement completed');
       } catch (error) {
           await actionLogger.logError('Human mouse movement failed', error as Error);
           throw new Error(`Failed to move mouse naturally: ${(error as Error).message}`);
       }
   }

   private async findElement(description: string): Promise<CSWebElement> {
       const storedElement = this.context.retrieve<CSWebElement>(`element_${description}`);
       if (storedElement) {
           return storedElement;
       }

       const options: CSGetElementOptions = {
           description,
           locatorType: 'text',
           locatorValue: description,
           aiEnabled: ConfigurationManager.getBoolean('AI_ENABLED', true),
           aiDescription: description,
           waitForVisible: ConfigurationManager.getBoolean('AUTO_WAIT_VISIBLE', true)
       };

       const element = new CSWebElement();
       element.page = this.page;
       element.options = options;
       element.description = description;

       return element;
   }

   private parseModifiers(modifierString: string): Array<'Alt' | 'Control' | 'Meta' | 'Shift'> {
       const modifiers: Array<'Alt' | 'Control' | 'Meta' | 'Shift'> = [];
       const lowerModifier = modifierString.toLowerCase();
       
       if (lowerModifier.includes('alt')) modifiers.push('Alt');
       if (lowerModifier.includes('ctrl') || lowerModifier.includes('control')) modifiers.push('Control');
       if (lowerModifier.includes('cmd') || lowerModifier.includes('meta') || lowerModifier.includes('command')) modifiers.push('Meta');
       if (lowerModifier.includes('shift')) modifiers.push('Shift');
       
       return modifiers;
   }

   private maskSensitiveData(text: string): string {
       const sensitivePatterns = ConfigurationManager.getArray('SENSITIVE_DATA_PATTERNS');
       let maskedText = text;
       
       for (const pattern of sensitivePatterns) {
           const regex = new RegExp(pattern, 'gi');
           maskedText = maskedText.replace(regex, '***');
       }
       
       return maskedText;
   }
}