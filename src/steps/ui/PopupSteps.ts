// src/steps/ui/PopupSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { PopupHandler } from '../../core/pages/PopupHandler';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { CSWebElement } from '../../core/elements/CSWebElement';
import { CSGetElementOptions } from '../../core/elements/types/element.types';

export class PopupSteps extends CSBDDBaseStepDefinition {
   private popupHandler: PopupHandler | null = null;

   private getPopupHandler(): PopupHandler {
       if (!this.popupHandler) {
           this.popupHandler = new PopupHandler(this.page);
       }
       return this.popupHandler;
   }

   @CSBDDStepDef('user clicks {string} which opens popup')
   @CSBDDStepDef('I click {string} that opens a new window')
   async clickElementThatOpensPopup(elementDescription: string): Promise<void> {
       ActionLogger.logInfo('Click element that opens popup', { element: elementDescription, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const element = await this.findElement(elementDescription);
           
           const popup = await handler.waitForPopup(async () => {
               await element.click();
           });
           
           this.context.store('lastPopup', popup, 'scenario');
           
           ActionLogger.logInfo('Clicked element and popup opened', { 
               element: elementDescription,
               popupUrl: popup.url(),
               popupCount: handler.getPopupCount(),
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Click with popup failed', error as Error);
           throw new Error(`Failed to click "${elementDescription}" and wait for popup: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user switches to popup window')
   @CSBDDStepDef('I switch to the popup')
   @CSBDDStepDef('user focuses on popup window')
   async switchToPopup(): Promise<void> {
       ActionLogger.logInfo('Switch to popup window', { type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const popups = handler.getPopups();
           
           if (popups.length === 0) {
               throw new Error('No popup windows found');
           }
           
           const popup = await handler.switchToPopup(popups.length - 1);
           
           this.context.setCurrentPage(popup);
           this.context.store('currentPage', popup, 'scenario');
           
           ActionLogger.logInfo('Switched to popup', { 
               url: popup.url(),
               title: await popup.title(),
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Switch to popup failed', error as Error);
           throw new Error(`Failed to switch to popup: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user switches to popup window {int}')
   @CSBDDStepDef('I switch to popup number {int}')
   async switchToPopupByIndex(popupIndex: number): Promise<void> {
       ActionLogger.logInfo('Switch to popup by index', { popupIndex, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const popup = await handler.switchToPopup(popupIndex - 1);
           
           this.context.setCurrentPage(popup);
           this.context.store('currentPage', popup, 'scenario');
           
           ActionLogger.logInfo('Switched to popup', { 
               popupIndex,
               url: popup.url(),
               title: await popup.title(),
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Switch to popup by index failed', error as Error);
           throw new Error(`Failed to switch to popup ${popupIndex}: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user switches to main window')
   @CSBDDStepDef('I switch back to main window')
   @CSBDDStepDef('user returns to parent window')
   async switchToMainWindow(): Promise<void> {
       ActionLogger.logInfo('Switch to main window', { type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const mainWindow = await handler.switchToMainWindow();
           
           this.context.setCurrentPage(mainWindow);
           this.context.store('currentPage', mainWindow, 'scenario');
           
           ActionLogger.logInfo('Switched to main window', { 
               url: mainWindow.url(),
               title: await mainWindow.title(),
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Switch to main window failed', error as Error);
           throw new Error(`Failed to switch to main window: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user closes current popup')
   @CSBDDStepDef('I close the popup')
   @CSBDDStepDef('user closes current window')
   async closeCurrentPopup(): Promise<void> {
       ActionLogger.logInfo('Close current popup', { type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const currentPage = handler.getCurrentPage();
           
           await handler.closePopup(currentPage);
           
           const mainWindow = await handler.switchToMainWindow();
           this.context.setCurrentPage(mainWindow);
           this.context.store('currentPage', mainWindow, 'scenario');
           
           ActionLogger.logInfo('Popup closed', { 
               remainingPopups: handler.getPopupCount(),
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Close popup failed', error as Error);
           throw new Error(`Failed to close popup: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user closes all popups')
   @CSBDDStepDef('I close all popup windows')
   async closeAllPopups(): Promise<void> {
       ActionLogger.logInfo('Close all popups', { type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const popupCount = handler.getPopupCount();
           
           await handler.closeAllPopups();
           
           const currentPage = handler.getCurrentPage();
           this.context.setCurrentPage(currentPage);
           this.context.store('currentPage', currentPage, 'scenario');
           
           ActionLogger.logInfo('All popups closed', { 
               closedCount: popupCount,
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Close all popups failed', error as Error);
           throw new Error(`Failed to close all popups: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user handles alert dialog with {string}')
   @CSBDDStepDef('I {string} the alert')
   async handleAlert(action: string): Promise<void> {
       ActionLogger.logInfo('Handle alert dialog', { action, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const dialogAction = action.toLowerCase() === 'accept' ? 'accept' : 'dismiss';
           
           await handler.handleDialog('alert', dialogAction);
           
           this.context.store('dialogHandled', true, 'scenario');
           
           ActionLogger.logInfo('Alert handler registered', { action: dialogAction, type: 'popup_success' });
       } catch (error) {
           ActionLogger.logError('Handle alert failed', error as Error);
           throw new Error(`Failed to handle alert: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user handles confirm dialog with {string}')
   @CSBDDStepDef('I {string} the confirmation')
   async handleConfirm(action: string): Promise<void> {
       ActionLogger.logInfo('Handle confirm dialog', { action, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const dialogAction = action.toLowerCase() === 'accept' ? 'accept' : 'dismiss';
           
           await handler.handleDialog('confirm', dialogAction);
           
           this.context.store('dialogHandled', true, 'scenario');
           
           ActionLogger.logInfo('Confirm handler registered', { action: dialogAction, type: 'popup_success' });
       } catch (error) {
           ActionLogger.logError('Handle confirm failed', error as Error);
           throw new Error(`Failed to handle confirm dialog: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user handles prompt dialog with {string} and enters {string}')
   @CSBDDStepDef('I {string} the prompt with text {string}')
   async handlePrompt(action: string, text: string): Promise<void> {
       ActionLogger.logInfo('Handle prompt dialog', { action, text, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const dialogAction = action.toLowerCase() === 'accept' ? 'accept' : 'dismiss';
           
           await handler.handleDialog('prompt', dialogAction, text);
           
           this.context.store('dialogHandled', true, 'scenario');
           
           ActionLogger.logInfo('Prompt handler registered', { 
               action: dialogAction,
               text: text,
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Handle prompt failed', error as Error);
           throw new Error(`Failed to handle prompt dialog: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('the number of popup windows should be {int}')
   @CSBDDStepDef('there should be {int} popup windows')
   async assertPopupCount(expectedCount: number): Promise<void> {
       ActionLogger.logInfo('Assert popup count', { expectedCount, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const actualCount = handler.getPopupCount();
           
           if (actualCount !== expectedCount) {
               throw new Error(`Popup count mismatch. Expected: ${expectedCount}, Actual: ${actualCount}`);
           }
           
           ActionLogger.logInfo('Popup count assertion passed', { 
               expectedCount,
               actualCount,
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Popup count assertion failed', error as Error);
           throw error;
       }
   }

   @CSBDDStepDef('popup window should have title {string}')
   @CSBDDStepDef('the popup title should be {string}')
   async assertPopupTitle(expectedTitle: string): Promise<void> {
       ActionLogger.logInfo('Assert popup title', { expectedTitle, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const currentPage = handler.getCurrentPage();
           const actualTitle = await currentPage.title();
           
           if (actualTitle !== expectedTitle) {
               throw new Error(`Popup title mismatch. Expected: "${expectedTitle}", Actual: "${actualTitle}"`);
           }
           
           ActionLogger.logInfo('Popup title assertion passed', { 
               expectedTitle,
               actualTitle,
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Popup title assertion failed', error as Error);
           throw error;
       }
   }

   @CSBDDStepDef('popup window URL should contain {string}')
   @CSBDDStepDef('the popup URL should contain {string}')
   async assertPopupURLContains(expectedText: string): Promise<void> {
       ActionLogger.logInfo('Assert popup URL contains', { expectedText, type: 'popup_step' });
       
       try {
           const handler = this.getPopupHandler();
           const currentPage = handler.getCurrentPage();
           const actualURL = currentPage.url();
           
           if (!actualURL.includes(expectedText)) {
               throw new Error(`Popup URL does not contain "${expectedText}". Actual: "${actualURL}"`);
           }
           
           ActionLogger.logInfo('Popup URL assertion passed', { 
               expectedText,
               actualURL,
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Popup URL assertion failed', error as Error);
           throw error;
       }
   }

   @CSBDDStepDef('user waits for popup to open')
   @CSBDDStepDef('I wait for a new window')
   async waitForPopup(): Promise<void> {
       ActionLogger.logInfo('Wait for popup to open', { type: 'popup_step' });
       
       try {
           const timeout = ConfigurationManager.getInt('POPUP_TIMEOUT', 10000);
           
           const popupPromise = this.page.context().waitForEvent('page', { timeout });
           const popup = await popupPromise;
           
           this.context.store('lastPopup', popup, 'scenario');
           
           ActionLogger.logInfo('Popup opened', { 
               url: popup.url(),
               title: await popup.title(),
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Wait for popup failed', error as Error);
           throw new Error(`No popup opened within timeout: ${(error as Error).message}`);
       }
   }

   @CSBDDStepDef('user opens link {string} in new window')
   @CSBDDStepDef('I open {string} in a new window')
   async openLinkInNewWindow(elementDescription: string): Promise<void> {
       ActionLogger.logInfo('Open link in new window', { element: elementDescription, type: 'popup_step' });
       
       try {
           const element = await this.findElement(elementDescription);
           
           const href = await element.getAttribute('href');
           if (!href) {
               throw new Error('Element does not have href attribute');
           }
           
           const newPage = await this.context.getCurrentBrowserContext().newPage();
           await newPage.goto(href);
           
           const handler = this.getPopupHandler();
           handler.getPopups().push(newPage);
           
           ActionLogger.logInfo('Link opened in new window', { 
               element: elementDescription,
               url: href,
               type: 'popup_success'
           });
       } catch (error) {
           ActionLogger.logError('Open link in new window failed', error as Error);
           throw new Error(`Failed to open "${elementDescription}" in new window: ${(error as Error).message}`);
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

   async cleanup(): Promise<void> {
       if (this.popupHandler) {
           try {
               await this.popupHandler.closeAllPopups();
           } catch (error) {
               ActionLogger.logWarn('Popup cleanup failed', { error: (error as Error).message });
           }
       }
   }
}
