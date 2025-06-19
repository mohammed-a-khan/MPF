import { Page, Dialog } from 'playwright';
import { logger } from '../utils/Logger';
import { ActionLogger } from '../logging/ActionLogger';
import { 
    PopupInfo, 
    DialogHandler, 
    DialogType, 
    DialogAction,
    PopupOptions 
} from './types/page.types';

/**
 * PopupHandler - Complete popup window management
 * Handles popup windows, dialogs, and window switching
 */
export class PopupHandler {
    private popups: Map<string, PopupInfo> = new Map();
    private mainPage: Page;
    private currentPage: Page;
    private popupCounter: number = 0;
    private dialogHandlers: Map<string, DialogHandler> = new Map();
    private options: PopupOptions;

    constructor(mainPage: Page, options: PopupOptions = {}) {
        this.mainPage = mainPage;
        this.currentPage = mainPage;
        this.options = {
            autoSwitch: true,
            closeOnNavigation: false,
            trackDialogs: true,
            maxPopups: 10,
            ...options
        };
        
        this.setupEventHandlers();
    }

    /**
     * Wait for a popup to open
     */
    async waitForPopup(
        action: () => Promise<void>,
        options?: { timeout?: number; url?: string | RegExp }
    ): Promise<Page> {
        try {
            const timeout = options?.timeout || 30000;
            
            // Set up popup promise before action
            const popupPromise = new Promise<Page>((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error('Timeout waiting for popup'));
                }, timeout);
                
                const handler = (page: Page) => {
                    const url = page.url();
                    const matchesUrl = !options?.url || 
                        (typeof options.url === 'string' ? url.includes(options.url) : options.url.test(url));
                    
                    if (matchesUrl) {
                        clearTimeout(timer);
                        this.mainPage.context().off('page', handler);
                        resolve(page);
                    }
                };
                
                this.mainPage.context().on('page', handler);
            });
            
            // Perform action that should trigger popup
            await action();
            
            // Wait for popup
            const popup = await popupPromise;
            
            // Register popup
            const popupId = this.registerPopup(popup);
            
            // Auto-switch if enabled
            if (this.options.autoSwitch) {
                this.currentPage = popup;
                await popup.bringToFront();
            }
            
            ActionLogger.logPageOperation('popup_opened', popupId, {
                url: popup.url(),
                autoSwitched: this.options.autoSwitch
            });
            
            return popup;
        } catch (error) {
            logger.error('PopupHandler: Failed to wait for popup', error as Error);
            throw error;
        }
    }

    /**
     * Switch to a specific popup
     */
    async switchToPopup(identifier: number | string | Page): Promise<Page> {
        try {
            let popup: Page | undefined;
            let popupId: string | undefined;
            
            if (typeof identifier === 'object' && 'url' in identifier) {
                // Find by page instance
                const entry = Array.from(this.popups.entries())
                    .find(([_, info]) => info.page === identifier);
                
                if (entry) {
                    popupId = entry[0];
                    popup = entry[1].page;
                }
            } else if (typeof identifier === 'number') {
                // Find by index
                const popupArray = Array.from(this.popups.values());
                if (identifier >= 0 && identifier < popupArray.length) {
                    const info = popupArray[identifier];
                    popup = info!.page;
                    popupId = Array.from(this.popups.entries())
                        .find(([_, i]) => i === info)?.[0];
                }
            } else {
                // Find by ID
                const info = this.popups.get(identifier);
                if (info) {
                    popup = info.page;
                    popupId = identifier;
                }
            }
            
            if (!popup || !popupId) {
                throw new Error(`Popup '${identifier}' not found`);
            }
            
            // Check if popup is still open
            if (popup.isClosed()) {
                this.popups.delete(popupId);
                throw new Error(`Popup '${identifier}' is closed`);
            }
            
            this.currentPage = popup;
            await popup.bringToFront();
            
            ActionLogger.logPageOperation('popup_switch', popupId, {
                url: popup.url()
            });
            
            return popup;
        } catch (error) {
            logger.error('PopupHandler: Failed to switch to popup', error as Error);
            throw error;
        }
    }

    /**
     * Switch to main window
     */
    async switchToMainWindow(): Promise<Page> {
        try {
            this.currentPage = this.mainPage;
            await this.mainPage.bringToFront();
            
            ActionLogger.logPageOperation('popup_switch_main', 'PopupHandler', {
                url: this.mainPage.url()
            });
            
            return this.mainPage;
        } catch (error) {
            logger.error('PopupHandler: Failed to switch to main window', error as Error);
            throw error;
        }
    }

    /**
     * Close a popup
     */
    async closePopup(page: Page): Promise<void> {
        try {
            const popupId = this.getPopupId(page);
            
            if (!popupId) {
                throw new Error('Popup not found in registry');
            }
            
            await page.close();
            this.popups.delete(popupId);
            
            // Switch to main if closing current
            if (this.currentPage === page) {
                await this.switchToMainWindow();
            }
            
            ActionLogger.logPageOperation('popup_close', popupId);
        } catch (error) {
            logger.error('PopupHandler: Failed to close popup', error as Error);
            throw error;
        }
    }

    /**
     * Close all popups
     */
    async closeAllPopups(): Promise<void> {
        try {
            const popupCount = this.popups.size;
            
            for (const [_id, info] of this.popups) {
                if (!info.page.isClosed()) {
                    await info.page.close();
                }
            }
            
            this.popups.clear();
            this.currentPage = this.mainPage;
            
            ActionLogger.logPageOperation('popup_close_all', 'PopupHandler', {
                count: popupCount
            });
        } catch (error) {
            logger.error('PopupHandler: Failed to close all popups', error as Error);
            throw error;
        }
    }

    /**
     * Get current page
     */
    getCurrentPage(): Page {
        return this.currentPage;
    }

    /**
     * Get all popups
     */
    getPopups(): Page[] {
        return Array.from(this.popups.values())
            .filter(info => !info.page.isClosed())
            .map(info => info.page);
    }

    /**
     * Get popup count
     */
    getPopupCount(): number {
        return this.popups.size;
    }

    /**
     * Get popup info
     */
    getPopupInfo(page: Page): PopupInfo | undefined {
        const entry = Array.from(this.popups.entries())
            .find(([_, info]) => info.page === page);
        
        return entry?.[1];
    }

    /**
     * Find popup by URL
     */
    findPopupByUrl(url: string | RegExp): Page | undefined {
        for (const info of this.popups.values()) {
            const pageUrl = info.page.url();
            
            if (typeof url === 'string') {
                if (pageUrl.includes(url)) {
                    return info.page;
                }
            } else {
                if (url.test(pageUrl)) {
                    return info.page;
                }
            }
        }
        
        return undefined;
    }

    /**
     * Find popup by title
     */
    async findPopupByTitle(title: string | RegExp): Promise<Page | undefined> {
        for (const info of this.popups.values()) {
            try {
                const pageTitle = await info.page.title();
                
                if (typeof title === 'string') {
                    if (pageTitle.includes(title)) {
                        return info.page;
                    }
                } else {
                    if (title.test(pageTitle)) {
                        return info.page;
                    }
                }
            } catch {
                // Page might be closed
            }
        }
        
        return undefined;
    }

    /**
     * Handle dialog (alert, confirm, prompt)
     */
    async handleDialog(
        type: DialogType,
        action: DialogAction,
        text?: string
    ): Promise<void> {
        const handlerId = `${type}_${Date.now()}`;
        
        const handler: DialogHandler = {
            type,
            action,
            text: text || '',
            handled: false
        };
        
        this.dialogHandlers.set(handlerId, handler);
        
        // Set up one-time handler
        this.currentPage.once('dialog', async (dialog) => {
            await this.handleDialogEvent(dialog, handler);
            handler.handled = true;
        });
        
        ActionLogger.logPageOperation('popup_dialog_handler_set', handlerId, {
            type,
            action
        });
    }

    /**
     * Set up persistent dialog handler
     */
    setPersistentDialogHandler(
        handler: (dialog: Dialog) => Promise<void>
    ): () => void {
        const pages = [this.mainPage, ...this.getPopups()];
        
        pages.forEach(page => {
            page.on('dialog', handler);
        });
        
        // Return cleanup function
        return () => {
            pages.forEach(page => {
                page.off('dialog', handler);
            });
        };
    }

    /**
     * Wait for dialog
     */
    async waitForDialog(
        options?: { timeout?: number; type?: DialogType }
    ): Promise<Dialog> {
        const timeout = options?.timeout || 30000;
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.currentPage.off('dialog', handler);
                reject(new Error('Dialog timeout'));
            }, timeout);
            
            const handler = (dialog: Dialog) => {
                if (!options?.type || dialog.type() === options.type) {
                    clearTimeout(timer);
                    this.currentPage.off('dialog', handler);
                    resolve(dialog);
                }
            };
            
            this.currentPage.on('dialog', handler);
        });
    }

    /**
     * Execute in popup context
     */
    async executeInPopup<T>(
        identifier: number | string | Page,
        action: (page: Page) => Promise<T>
    ): Promise<T> {
        const previousPage = this.currentPage;
        
        try {
            const popup = await this.switchToPopup(identifier);
            return await action(popup);
        } finally {
            // Restore previous page
            if (previousPage === this.mainPage) {
                await this.switchToMainWindow();
            } else {
                await this.switchToPopup(previousPage);
            }
        }
    }

    /**
     * Get popup statistics
     */
    getStats(): any {
        return {
            totalPopups: this.popups.size,
            currentPage: this.currentPage === this.mainPage ? 'main' : 'popup',
            popups: Array.from(this.popups.entries()).map(([id, info]) => ({
                id,
                url: info.page.url(),
                opened: info.openedAt,
                isClosed: info.page.isClosed()
            }))
        };
    }

    // Private methods

    private setupEventHandlers(): void {
        // Monitor popup creation
        this.mainPage.context().on('page', (page: Page) => {
            // Only register if not already tracked
            if (!this.isPopupRegistered(page)) {
                this.registerPopup(page);
            }
        });
        
        // Set up dialog handler if enabled
        if (this.options.trackDialogs) {
            this.mainPage.on('dialog', (dialog) => {
                this.handleUnexpectedDialog(dialog);
            });
        }
    }

    private registerPopup(page: Page): string {
        // Check max popups limit
        if (this.popups.size >= this.options.maxPopups!) {
            logger.warn(`PopupHandler: Maximum popup limit (${this.options.maxPopups}) reached`);
        }
        
        const popupId = `popup_${++this.popupCounter}`;
        
        const info: PopupInfo = {
            id: popupId,
            page,
            openedAt: new Date(),
            parentPage: this.currentPage
        };
        
        this.popups.set(popupId, info);
        
        // Set up event handlers for popup
        this.setupPopupHandlers(page, popupId);
        
        return popupId;
    }

    private setupPopupHandlers(popup: Page, popupId: string): void {
        // Monitor popup close
        popup.on('close', () => {
            this.popups.delete(popupId);
            
            if (this.currentPage === popup) {
                this.currentPage = this.mainPage;
            }
            
            ActionLogger.logPageOperation('popup_auto_closed', popupId);
        });
        
        // Monitor navigation if closeOnNavigation is enabled
        if (this.options.closeOnNavigation) {
            popup.on('load', () => {
                const info = this.popups.get(popupId);
                if (info && info.openedAt.getTime() < Date.now() - 1000) {
                    // Only close if popup has been open for more than 1 second
                    popup.close().catch(() => {});
                }
            });
        }
        
        // Set up dialog handler for popup
        if (this.options.trackDialogs) {
            popup.on('dialog', (dialog) => {
                this.handleUnexpectedDialog(dialog);
            });
        }
    }

    private isPopupRegistered(page: Page): boolean {
        return Array.from(this.popups.values()).some(info => info.page === page);
    }

    private getPopupId(page: Page): string | undefined {
        return Array.from(this.popups.entries())
            .find(([_, info]) => info.page === page)?.[0];
    }

    private async handleDialogEvent(dialog: Dialog, handler: DialogHandler): Promise<void> {
        try {
            if (handler.action === 'accept') {
                await dialog.accept(handler.text);
            } else {
                await dialog.dismiss();
            }
            
            ActionLogger.logPageOperation('popup_dialog_handled', 'PopupHandler', {
                type: dialog.type(),
                message: dialog.message(),
                action: handler.action
            });
        } catch (error) {
            logger.error('PopupHandler: Failed to handle dialog', error as Error);
        }
    }

    private async handleUnexpectedDialog(dialog: Dialog): Promise<void> {
        logger.warn(`PopupHandler: Unexpected ${dialog.type()} dialog: ${dialog.message()}`);
        
        // Default action: dismiss
        await dialog.dismiss();
        
        ActionLogger.logPageOperation('popup_unexpected_dialog', 'PopupHandler', {
            type: dialog.type(),
            message: dialog.message()
        });
    }
}