// src/core/elements/CSWebElement.ts
import { Page, Locator, Download, ElementHandle } from 'playwright';
import { 
    ClickOptions, 
    TypeOptions, 
    AssertOptions,
    ElementState,
    ActionRecord,
    WaitOptions,
    ScreenshotOptions,
    BoundingBox,
    CSGetElementOptions
} from './types/element.types';
import { ElementResolver } from './ElementResolver';
import { ElementActionLogger } from './ElementActionLogger';
import { SelfHealingEngine } from '../ai/healing/SelfHealingEngine';
import { ActionLogger } from '../logging/ActionLogger';
import { ConfigurationManager } from '../configuration/ConfigurationManager';
import { expect } from '@playwright/test';

export interface ElementConfig {
    locatorType: 'css' | 'xpath' | 'id' | 'text' | 'role' | 'testid' | 'label' | 'placeholder' | 'alt' | 'title';
    locatorValue: string;
    description: string;
    waitForVisible: boolean;
    waitForEnabled: boolean;
    waitTimeout: number;
    required: boolean;
    aiEnabled: boolean;
    aiDescription: string;
    aiConfidenceThreshold: number;
    fallbacks: Array<{ locatorType: 'css' | 'xpath' | 'id' | 'text' | 'role' | 'testid' | 'label' | 'placeholder' | 'alt' | 'title', value: string }>;
}

export class CSWebElement {
    // Public properties for backward compatibility
    public page: Page;
    public options: CSGetElementOptions;
    public description: string;
    
    // Internal properties
    protected locator: Locator | null;
    private _config: ElementConfig;
    private actionHistory: ActionRecord[] = [];
    private lastResolvedAt: Date | null;
    private cacheValidityMs = 5000; // Cache valid for 5 seconds
    private readonly elementId: string;

    // Support both new constructor with parameters and legacy no-parameter constructor
    constructor(page?: Page, partialConfig?: Partial<ElementConfig> & Pick<ElementConfig, 'locatorType' | 'locatorValue' | 'description'>) {
        // Initialize with defaults for backward compatibility
        this.page = page || (null as any);
        this.elementId = `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (partialConfig) {
            // New style constructor
            this._config = {
                locatorType: partialConfig.locatorType,
                locatorValue: partialConfig.locatorValue,
                description: partialConfig.description,
                waitForVisible: partialConfig.waitForVisible ?? false,
                waitForEnabled: partialConfig.waitForEnabled ?? false,
                waitTimeout: partialConfig.waitTimeout ?? parseInt(ConfigurationManager.get('ELEMENT_TIMEOUT', '30000')),
                required: partialConfig.required ?? false,
                aiEnabled: partialConfig.aiEnabled ?? false,
                aiDescription: partialConfig.aiDescription ?? partialConfig.description,
                aiConfidenceThreshold: partialConfig.aiConfidenceThreshold ?? 0.8,
                fallbacks: partialConfig.fallbacks ?? []
            };
            
            // Sync public properties with config
            this.description = this._config.description;
            this.options = {
                locatorType: this._config.locatorType as any,
                locatorValue: this._config.locatorValue,
                description: this._config.description,
                waitForVisible: this._config.waitForVisible,
                waitForEnabled: this._config.waitForEnabled,
                waitTimeout: this._config.waitTimeout,
                required: this._config.required,
                aiEnabled: this._config.aiEnabled,
                aiDescription: this._config.aiDescription,
                aiConfidenceThreshold: this._config.aiConfidenceThreshold,
                fallbacks: this._config.fallbacks as any
            };
        } else {
            // Legacy style constructor - initialize with defaults
            this.description = '';
            this.options = {
                locatorType: 'css',
                locatorValue: '',
                description: '',
                waitForVisible: false,
                waitForEnabled: false,
                waitTimeout: parseInt(ConfigurationManager.get('ELEMENT_TIMEOUT', '30000')),
                required: false,
                aiEnabled: false,
                aiDescription: '',
                aiConfidenceThreshold: 0.8,
                fallbacks: []
            };
            
            // Create config from options (will be synced when options are set)
            this._config = {
                locatorType: 'css',
                locatorValue: '',
                description: '',
                waitForVisible: false,
                waitForEnabled: false,
                waitTimeout: parseInt(ConfigurationManager.get('ELEMENT_TIMEOUT', '30000')),
                required: false,
                aiEnabled: false,
                aiDescription: '',
                aiConfidenceThreshold: 0.8,
                fallbacks: []
            };
        }
        
        this.locator = null;
        this.lastResolvedAt = null;
        
        // Create locator if we have the necessary info
        if (this.page && this.options.locatorValue) {
            this.locator = this.createLocator();
        }
    }

    // Getter for config to maintain backward compatibility
    get config(): ElementConfig {
        this.syncConfigFromOptions();
        return this._config;
    }

    // Sync config when options are updated (for backward compatibility)
    private syncConfigFromOptions(): void {
        if (this.options) {
            this.description = this.options.description;
            this._config.locatorType = this.options.locatorType;
            this._config.locatorValue = this.options.locatorValue;
            this._config.description = this.options.description;
            this._config.waitForVisible = this.options.waitForVisible ?? false;
            this._config.waitForEnabled = this.options.waitForEnabled ?? false;
            this._config.waitTimeout = this.options.waitTimeout ?? 30000;
            this._config.required = this.options.required ?? false;
            this._config.aiEnabled = this.options.aiEnabled ?? false;
            this._config.aiDescription = this.options.aiDescription ?? this.options.description;
            this._config.aiConfidenceThreshold = this.options.aiConfidenceThreshold ?? 0.8;
            this._config.fallbacks = (this.options.fallbacks || []).map(f => ({ 
                locatorType: f.locatorType as any, 
                value: f.value 
            }));
            
            // Recreate locator with new values
            if (this.page && this.options.locatorValue) {
                this.locator = this.createLocator();
            }
        }
    }

    private createLocator(): Locator {
        if (!this.page) {
            throw new Error('Page is not initialized');
        }
        
        const locatorType = this.options?.locatorType || 'css';
        const locatorValue = this.options?.locatorValue || '';
        
        switch (locatorType) {
            case 'xpath':
                return this.page.locator(`xpath=${locatorValue}`);
            case 'css':
                return this.page.locator(locatorValue);
            case 'id':
                return this.page.locator(`#${locatorValue}`);
            case 'text':
                return this.page.getByText(locatorValue);
            case 'role':
                return this.page.getByRole(locatorValue as any);
            case 'testid':
                return this.page.getByTestId(locatorValue);
            case 'label':
                return this.page.getByLabel(locatorValue);
            case 'placeholder':
                return this.page.getByPlaceholder(locatorValue);
            case 'alt':
                return this.page.getByAltText(locatorValue);
            case 'title':
                return this.page.getByTitle(locatorValue);
            default:
                // Fallback to CSS for unknown types
                return this.page.locator(locatorValue);
        }
    }

    private async resolve(): Promise<Locator> {
        const startTime = Date.now();
        
        // Ensure config is synced with options (for backward compatibility)
        this.syncConfigFromOptions();
        
        try {
            // Check cache first
            if (this.locator && this.isCacheValid()) {
                return this.locator;
            }
            
            // Try resolution
            const resolvedLocator = await ElementResolver.getInstance().resolve(this);
            this.locator = resolvedLocator;
            this.lastResolvedAt = new Date();
            
            // Log success
            ActionLogger.logInfo(`Element resolved successfully: ${this.description}`, {
                duration: Date.now() - startTime,
                locator: `${this._config.locatorType}=${this._config.locatorValue}`
            });
            
            return resolvedLocator;
        } catch (error) {
            // Try AI healing if enabled
            if (this._config.aiEnabled) {
                try {
                    ActionLogger.logInfo(`Attempting AI healing for element: ${this.description}`);
                    const healedLocator = await SelfHealingEngine.getInstance().heal(this);
                    this.locator = healedLocator;
                    this.lastResolvedAt = new Date();
                    return healedLocator;
                } catch (healingError) {
                    ActionLogger.logError('AI healing failed', healingError as Error);
                }
            }
            
            // Log failure
            ActionLogger.logError(`Element resolution failed: ${this.description}`, error as Error);
            throw error;
        }
    }

    private isCacheValid(): boolean {
        if (!this.lastResolvedAt) return false;
        return Date.now() - this.lastResolvedAt.getTime() < this.cacheValidityMs;
    }

    async getLocator(): Promise<Locator> {
        return await this.resolve();
    }

    async elementHandle(): Promise<ElementHandle | null> {
        const locator = await this.resolve();
        return await locator.elementHandle();
    }

    private async logAction(action: string, parameters: any[] = [], status: 'success' | 'failure' = 'success', error?: Error): Promise<void> {
        const record: Omit<ActionRecord, 'error' | 'stackTrace' | 'success'> = {
            id: `${this.elementId}_${Date.now()}`,
            timestamp: new Date(),
            elementDescription: this.description,
            elementLocator: `${this._config.locatorType}=${this._config.locatorValue}`,
            action,
            parameters,
            duration: 0
        };

        const finalRecord: ActionRecord = {
            ...record,
            success: status === 'success',
            error: error?.message || '',
            stackTrace: error?.stack || ''
        };

        this.actionHistory.push(finalRecord);
        await this.clearActionHistory();
    }

    private async captureElementState(): Promise<ElementState> {
        try {
            const locator = await this.resolve();
            const element = await locator.elementHandle();
            
            if (!element) {
                return {
                    visible: false,
                    enabled: false,
                    text: '',
                    value: '',
                    attributes: {},
                    boundingBox: null
                };
            }

            const state = await element.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                const styles = window.getComputedStyle(el);
                
                return {
                    visible: rect.width > 0 && rect.height > 0 && styles.display !== 'none' && styles.visibility !== 'hidden',
                    enabled: !(el as any).disabled,
                    text: el.textContent || '',
                    value: (el as any).value || '',
                    attributes: Array.from(el.attributes).reduce((acc, attr) => {
                        acc[attr.name] = attr.value;
                        return acc;
                    }, {} as Record<string, string>),
                    boundingBox: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    },
                    classList: Array.from(el.classList),
                    tagName: el.tagName.toLowerCase()
                };
            });

            return state;
        } catch (error) {
            return {
                visible: false,
                enabled: false,
                text: '',
                value: '',
                attributes: {},
                boundingBox: null
            };
        }
    }

    // Basic Interaction Methods

    async click(options?: ClickOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            
            if (this._config.waitForVisible) {
                const waitOptions: { state: 'visible'; timeout?: number } = { state: 'visible' };
                if (this._config.waitTimeout !== undefined) {
                    waitOptions.timeout = this._config.waitTimeout;
                }
                await locator.waitFor(waitOptions);
            }
            if (this._config.waitForEnabled) {
                // Wait for element to be enabled
                const waitOptions: { state: 'visible'; timeout?: number } = { state: 'visible' };
                if (this._config.waitTimeout !== undefined) {
                    waitOptions.timeout = this._config.waitTimeout;
                }
                await locator.waitFor(waitOptions);
                
                const functionOptions: { timeout?: number } = {};
                if (this._config.waitTimeout !== undefined) {
                    functionOptions.timeout = this._config.waitTimeout;
                }
                
                await this.page.waitForFunction(
                    (selector) => {
                        const element = document.querySelector(selector);
                        return element && !(element as any).disabled;
                    },
                    this.getSelectorString(),
                    functionOptions
                );
            }

            await locator.click(options);
            
            await this.logAction('click', [options], 'success');
            ActionLogger.logInfo(`Element clicked: ${this.description}`, { 
                action: 'click',
                duration: Date.now() - startTime,
                options 
            });
        } catch (error) {
            await this.logAction('click', [options], 'failure', error as Error);
            throw error;
        }
    }

    async doubleClick(options?: ClickOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.dblclick(options);
            
            await this.logAction('doubleClick', [options], 'success');
            ActionLogger.logInfo(`Element double-clicked: ${this.description}`, { 
                action: 'doubleClick',
                duration: Date.now() - startTime,
                options 
            });
        } catch (error) {
            await this.logAction('doubleClick', [options], 'failure', error as Error);
            throw error;
        }
    }

    async rightClick(options?: ClickOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.click({ ...options, button: 'right' });
            
            await this.logAction('rightClick', [options], 'success');
            ActionLogger.logInfo(`Element right-clicked: ${this.description}`, { 
                action: 'rightClick',
                duration: Date.now() - startTime,
                options 
            });
        } catch (error) {
            await this.logAction('rightClick', [options], 'failure', error as Error);
            throw error;
        }
    }

    async tripleClick(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.click({ clickCount: 3 });
            
            await this.logAction('tripleClick', [], 'success');
            ActionLogger.logInfo(`Element triple-clicked: ${this.description}`, { 
                action: 'tripleClick',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('tripleClick', [], 'failure', error as Error);
            throw error;
        }
    }

    async type(text: string, options?: TypeOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.type(text, options);
            
            await this.logAction('type', [text.length > 20 ? text.substring(0, 20) + '...' : text, options], 'success');
            ActionLogger.logInfo(`Text typed into element: ${this.description}`, { 
                action: 'type',
                duration: Date.now() - startTime,
                characters: text.length,
                options 
            });
        } catch (error) {
            await this.logAction('type', [text, options], 'failure', error as Error);
            throw error;
        }
    }

    async fill(text: string): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.fill(text);
            
            await this.logAction('fill', [text.length > 20 ? text.substring(0, 20) + '...' : text], 'success');
            ActionLogger.logInfo(`Element filled: ${this.description}`, { 
                action: 'fill',
                duration: Date.now() - startTime,
                characters: text.length 
            });
        } catch (error) {
            await this.logAction('fill', [text], 'failure', error as Error);
            throw error;
        }
    }

    async clear(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.clear();
            
            await this.logAction('clear', [], 'success');
            ActionLogger.logInfo(`Element cleared: ${this.description}`, { 
                action: 'clear',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('clear', [], 'failure', error as Error);
            throw error;
        }
    }

    async press(key: string): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.press(key);
            
            await this.logAction('press', [key], 'success');
            ActionLogger.logInfo(`Key pressed on element: ${this.description}`, { 
                action: 'press',
                duration: Date.now() - startTime,
                key 
            });
        } catch (error) {
            await this.logAction('press', [key], 'failure', error as Error);
            throw error;
        }
    }

    async selectOption(value: string | string[]): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.selectOption(value);
            
            await this.logAction('selectOption', [value], 'success');
            ActionLogger.logInfo(`Option selected in element: ${this.description}`, { 
                action: 'selectOption',
                duration: Date.now() - startTime,
                value 
            });
        } catch (error) {
            await this.logAction('selectOption', [value], 'failure', error as Error);
            throw error;
        }
    }

    async selectText(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.selectText();
            
            await this.logAction('selectText', [], 'success');
            ActionLogger.logInfo(`Text selected in element: ${this.description}`, { 
                action: 'selectText',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('selectText', [], 'failure', error as Error);
            throw error;
        }
    }

    async check(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.check();
            
            await this.logAction('check', [], 'success');
            ActionLogger.logInfo(`Element checked: ${this.description}`, { 
                action: 'check',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('check', [], 'failure', error as Error);
            throw error;
        }
    }

    async uncheck(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.uncheck();
            
            await this.logAction('uncheck', [], 'success');
            ActionLogger.logInfo(`Element unchecked: ${this.description}`, { 
                action: 'uncheck',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('uncheck', [], 'failure', error as Error);
            throw error;
        }
    }

    async hover(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.hover();
            
            await this.logAction('hover', [], 'success');
            ActionLogger.logInfo(`Element hovered: ${this.description}`, { 
                action: 'hover',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('hover', [], 'failure', error as Error);
            throw error;
        }
    }

    async focus(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.focus();
            
            await this.logAction('focus', [], 'success');
            ActionLogger.logInfo(`Element focused: ${this.description}`, { 
                action: 'focus',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('focus', [], 'failure', error as Error);
            throw error;
        }
    }

    async blur(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.blur();
            
            await this.logAction('blur', [], 'success');
            ActionLogger.logInfo(`Element blurred: ${this.description}`, { 
                action: 'blur',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('blur', [], 'failure', error as Error);
            throw error;
        }
    }

    async scrollIntoView(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.scrollIntoViewIfNeeded();
            
            await this.logAction('scrollIntoView', [], 'success');
            ActionLogger.logInfo(`Element scrolled into view: ${this.description}`, { 
                action: 'scrollIntoView',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('scrollIntoView', [], 'failure', error as Error);
            throw error;
        }
    }

    async waitFor(options?: WaitOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            
            // Create waitFor options with proper state
            const waitOptions: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number } = {};
            
            if (options?.state) {
                waitOptions.state = options.state;
            }
            if (options?.timeout !== undefined) {
                waitOptions.timeout = options.timeout;
            }
            
            await locator.waitFor(waitOptions);
            
            await this.logAction('waitFor', [options], 'success');
            ActionLogger.logInfo(`Waited for element: ${this.description}`, { 
                action: 'waitFor',
                duration: Date.now() - startTime,
                state: options?.state 
            });
        } catch (error) {
            await this.logAction('waitFor', [options], 'failure', error as Error);
            throw error;
        }
    }

    // Advanced Interaction Methods

    async dragTo(target: CSWebElement): Promise<void> {
        const startTime = Date.now();
        try {
            const sourceLocator = await this.resolve();
            const targetLocator = await target.resolve();
            
            await sourceLocator.dragTo(targetLocator);
            
            await this.logAction('dragTo', [target.description], 'success');
            ActionLogger.logInfo(`Element dragged to target: ${this.description}`, { 
                action: 'dragTo',
                duration: Date.now() - startTime,
                target: target.description 
            });
        } catch (error) {
            await this.logAction('dragTo', [target.description], 'failure', error as Error);
            throw error;
        }
    }

    async dragToPosition(x: number, y: number): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            const box = await locator.boundingBox();
            
            if (!box) {
                throw new Error('Element has no bounding box');
            }

            await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await this.page.mouse.down();
            await this.page.mouse.move(x, y);
            await this.page.mouse.up();
            
            await this.logAction('dragToPosition', [x, y], 'success');
            ActionLogger.logInfo(`Element dragged to position: ${this.description}`, { 
                action: 'dragToPosition',
                duration: Date.now() - startTime,
                position: { x, y } 
            });
        } catch (error) {
            await this.logAction('dragToPosition', [x, y], 'failure', error as Error);
            throw error;
        }
    }

    async dragByOffset(offsetX: number, offsetY: number): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            const box = await locator.boundingBox();
            
            if (!box) {
                throw new Error('Element has no bounding box');
            }

            const startX = box.x + box.width / 2;
            const startY = box.y + box.height / 2;
            
            await this.page.mouse.move(startX, startY);
            await this.page.mouse.down();
            await this.page.mouse.move(startX + offsetX, startY + offsetY);
            await this.page.mouse.up();
            
            await this.logAction('dragByOffset', [offsetX, offsetY], 'success');
            ActionLogger.logInfo(`Element dragged by offset: ${this.description}`, { 
                action: 'dragByOffset',
                duration: Date.now() - startTime,
                offset: { x: offsetX, y: offsetY } 
            });
        } catch (error) {
            await this.logAction('dragByOffset', [offsetX, offsetY], 'failure', error as Error);
            throw error;
        }
    }

    async upload(files: string | string[]): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.setInputFiles(files);
            
            const fileList = Array.isArray(files) ? files : [files];
            await this.logAction('upload', [fileList], 'success');
            ActionLogger.logInfo(`Files uploaded to element: ${this.description}`, { 
                action: 'upload',
                duration: Date.now() - startTime,
                files: fileList.length 
            });
        } catch (error) {
            await this.logAction('upload', [files], 'failure', error as Error);
            throw error;
        }
    }

    async download(action: () => Promise<void>): Promise<Download> {
        const startTime = Date.now();
        try {
            const downloadPromise = this.page.waitForEvent('download');
            await action();
            const download = await downloadPromise;
            
            await this.logAction('download', [], 'success');
            ActionLogger.logInfo(`Download initiated from element: ${this.description}`, { 
                action: 'download',
                duration: Date.now() - startTime,
                url: download.url() 
            });
            
            return download;
        } catch (error) {
            await this.logAction('download', [], 'failure', error as Error);
            throw error;
        }
    }

    async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            const screenshot = await locator.screenshot(options);
            
            await this.logAction('screenshot', [options?.path], 'success');
            ActionLogger.logInfo(`Screenshot taken of element: ${this.description}`, { 
                action: 'screenshot',
                duration: Date.now() - startTime,
                path: options?.path 
            });
            
            if (options?.path) {
                ElementActionLogger.getInstance().logScreenshot(this, screenshot);
            }
            
            return screenshot;
        } catch (error) {
            await this.logAction('screenshot', [options?.path], 'failure', error as Error);
            throw error;
        }
    }

    async mouseWheel(deltaX: number, deltaY: number): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            const box = await locator.boundingBox();
            
            if (!box) {
                throw new Error('Element has no bounding box');
            }

            await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await this.page.mouse.wheel(deltaX, deltaY);
            
            await this.logAction('mouseWheel', [deltaX, deltaY], 'success');
            ActionLogger.logInfo(`Mouse wheel scrolled on element: ${this.description}`, { 
                action: 'mouseWheel',
                duration: Date.now() - startTime,
                delta: { x: deltaX, y: deltaY } 
            });
        } catch (error) {
            await this.logAction('mouseWheel', [deltaX, deltaY], 'failure', error as Error);
            throw error;
        }
    }

    async pinch(scale: number): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            const box = await locator.boundingBox();
            
            if (!box) {
                throw new Error('Element has no bounding box');
            }

            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const distance = 100;
            
            // Simulate pinch gesture
            await this.page.touchscreen.tap(centerX - distance / 2, centerY);
            await this.page.touchscreen.tap(centerX + distance / 2, centerY);
            
            const newDistance = distance * scale;
            await this.page.evaluate(({ cx, cy, d2 }) => {
                const touchEvent = new TouchEvent('touchmove', {
                    touches: [
                        new Touch({ identifier: 1, target: document.body, clientX: cx - d2 / 2, clientY: cy }),
                        new Touch({ identifier: 2, target: document.body, clientX: cx + d2 / 2, clientY: cy })
                    ]
                });
                document.dispatchEvent(touchEvent);
            }, { cx: centerX, cy: centerY, d2: newDistance });
            
            await this.logAction('pinch', [scale], 'success');
            ActionLogger.logInfo(`Pinch gesture performed on element: ${this.description}`, { 
                action: 'pinch',
                duration: Date.now() - startTime,
                scale 
            });
        } catch (error) {
            await this.logAction('pinch', [scale], 'failure', error as Error);
            throw error;
        }
    }

    async tap(): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            await locator.tap();
            
            await this.logAction('tap', [], 'success');
            ActionLogger.logInfo(`Element tapped: ${this.description}`, { 
                action: 'tap',
                duration: Date.now() - startTime 
            });
        } catch (error) {
            await this.logAction('tap', [], 'failure', error as Error);
            throw error;
        }
    }

    async swipe(direction: 'up' | 'down' | 'left' | 'right', distance: number = 100): Promise<void> {
        const startTime = Date.now();
        try {
            const locator = await this.resolve();
            const box = await locator.boundingBox();
            
            if (!box) {
                throw new Error('Element has no bounding box');
            }

            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            
            let endX = centerX;
            let endY = centerY;
            
            switch (direction) {
                case 'up':
                    endY = centerY - distance;
                    break;
                case 'down':
                    endY = centerY + distance;
                    break;
                case 'left':
                    endX = centerX - distance;
                    break;
                case 'right':
                    endX = centerX + distance;
                    break;
            }
            
            await this.page.touchscreen.tap(centerX, centerY);
            await this.page.waitForTimeout(100);
            
            // Simulate swipe motion
            const steps = 10;
            for (let i = 1; i <= steps; i++) {
                const x = centerX + (endX - centerX) * (i / steps);
                const y = centerY + (endY - centerY) * (i / steps);
                await this.page.evaluate(({ px, py }) => {
                    const touchEvent = new TouchEvent('touchmove', {
                        touches: [new Touch({ identifier: 1, target: document.body, clientX: px, clientY: py })]
                    });
                    document.dispatchEvent(touchEvent);
                }, { px: x, py: y });
                await this.page.waitForTimeout(10);
            }
            
            await this.page.evaluate(() => {
                document.dispatchEvent(new TouchEvent('touchend'));
            });
            
            await this.logAction('swipe', [direction, distance], 'success');
            ActionLogger.logInfo(`Swipe performed on element: ${this.description}`, { 
                action: 'swipe',
                duration: Date.now() - startTime,
                direction,
                distance 
            });
        } catch (error) {
            await this.logAction('swipe', [direction, distance], 'failure', error as Error);
            throw error;
        }
    }

    // Validation Methods

    async isVisible(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.isVisible();
        } catch {
            return false;
        }
    }

    async isHidden(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.isHidden();
        } catch {
            return true;
        }
    }

    async isEnabled(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.isEnabled();
        } catch {
            return false;
        }
    }

    async isDisabled(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.isDisabled();
        } catch {
            return true;
        }
    }

    async isChecked(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.isChecked();
        } catch (error) {
            return false;
        }
    }

    async isEditable(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.isEditable();
        } catch (error) {
            return false;
        }
    }

    async isPresent(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            return await locator.count() > 0;
        } catch (error) {
            return false;
        }
    }

    async isInViewport(): Promise<boolean> {
        try {
            const locator = await this.resolve();
            const box = await locator.boundingBox();
            if (!box) return false;
            
            // Check if element is in viewport by evaluating in the browser
            return await locator.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            });
        } catch (error) {
            return false;
        }
    }

    async getText(): Promise<string> {
        try {
            const locator = await this.resolve();
            return await locator.textContent() || '';
        } catch {
            return '';
        }
    }

    async getInnerText(): Promise<string> {
        try {
            const locator = await this.resolve();
            return await locator.innerText();
        } catch (error) {
            await this.logAction('getInnerText', [], 'failure', error as Error);
            throw error;
        }
    }

    async getValue(): Promise<string> {
        try {
            const locator = await this.resolve();
            return await locator.inputValue();
        } catch {
            return '';
        }
    }

    async getAttribute(name: string): Promise<string | null> {
        try {
            const locator = await this.resolve();
            return await locator.getAttribute(name);
        } catch {
            return null;
        }
    }

    async getCSSProperty(property: string): Promise<string> {
        try {
            const locator = await this.resolve();
            return await locator.evaluate((el, prop) => {
                return window.getComputedStyle(el).getPropertyValue(prop);
            }, property);
        } catch (error) {
            await this.logAction('getCSSProperty', [property], 'failure', error as Error);
            throw error;
        }
    }

    async getCount(): Promise<number> {
        try {
            const locator = await this.resolve();
            return await locator.count();
        } catch (error) {
            await this.logAction('getCount', [], 'failure', error as Error);
            throw error;
        }
    }

    async getBoundingBox(): Promise<BoundingBox | null> {
        try {
            const locator = await this.resolve();
            return await locator.boundingBox();
        } catch (error) {
            await this.logAction('getBoundingBox', [], 'failure', error as Error);
            throw error;
        }
    }

    // Assertion Methods

    async assertText(expected: string, options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const actual = await this.getText();
            
            if (actual !== expected) {
                const error = new Error(`Text assertion failed. Expected: "${expected}", Actual: "${actual}"`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertText', [expected, options], 'success');
            ActionLogger.logInfo(`Text assertion passed for element: ${this.description}`, { 
                action: 'assertText',
                duration: Date.now() - startTime,
                expected,
                actual,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertText', [expected, options], 'failure', error as Error);
            ActionLogger.logError(`Text assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertTextContains(expected: string, options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const actual = await this.getText();
            
            if (!actual.includes(expected)) {
                const error = new Error(`Text contains assertion failed. Expected to contain: "${expected}", Actual: "${actual}"`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertTextContains', [expected, options], 'success');
            ActionLogger.logInfo(`Text contains assertion passed for element: ${this.description}`, { 
                action: 'assertTextContains',
                duration: Date.now() - startTime,
                expected,
                actual,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertTextContains', [expected, options], 'failure', error as Error);
            ActionLogger.logError(`Text contains assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertValue(expected: string, options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const actual = await this.getValue();
            
            if (actual !== expected) {
                const error = new Error(`Value assertion failed. Expected: "${expected}", Actual: "${actual}"`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertValue', [expected, options], 'success');
            ActionLogger.logInfo(`Value assertion passed for element: ${this.description}`, { 
                action: 'assertValue',
                duration: Date.now() - startTime,
                expected,
                actual,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertValue', [expected, options], 'failure', error as Error);
            ActionLogger.logError(`Value assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertAttribute(name: string, expected: string, options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const actual = await this.getAttribute(name);
            
            if (actual !== expected) {
                const error = new Error(`Attribute assertion failed. Attribute: "${name}", Expected: "${expected}", Actual: "${actual}"`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertAttribute', [name, expected, options], 'success');
            ActionLogger.logInfo(`Attribute assertion passed for element: ${this.description}`, { 
                action: 'assertAttribute',
                duration: Date.now() - startTime,
                attribute: name,
                expected,
                actual,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertAttribute', [name, expected, options], 'failure', error as Error);
            ActionLogger.logError(`Attribute assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertCSSProperty(property: string, expected: string, options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const actual = await this.getCSSProperty(property);
            
            if (actual !== expected) {
                const error = new Error(`CSS property assertion failed. Property: "${property}", Expected: "${expected}", Actual: "${actual}"`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertCSSProperty', [property, expected, options], 'success');
            ActionLogger.logInfo(`CSS property assertion passed for element: ${this.description}`, { 
                action: 'assertCSSProperty',
                duration: Date.now() - startTime,
                property,
                expected,
                actual,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertCSSProperty', [property, expected, options], 'failure', error as Error);
            ActionLogger.logError(`CSS property assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertVisible(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const isVisible = await this.isVisible();
            
            if (!isVisible) {
                const error = new Error(`Element visibility assertion failed. Expected element to be visible: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.page.screenshot({ path: `assertion-failure-${Date.now()}.png`, fullPage: true });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertVisible', [options], 'success');
            ActionLogger.logInfo(`Visibility assertion passed for element: ${this.description}`, { 
                action: 'assertVisible',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertVisible', [options], 'failure', error as Error);
            ActionLogger.logError(`Visibility assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertHidden(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const isHidden = await this.isHidden();
            
            if (!isHidden) {
                const error = new Error(`Element hidden assertion failed. Expected element to be hidden: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertHidden', [options], 'success');
            ActionLogger.logInfo(`Hidden assertion passed for element: ${this.description}`, { 
                action: 'assertHidden',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertHidden', [options], 'failure', error as Error);
            ActionLogger.logError(`Hidden assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertEnabled(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const isEnabled = await this.isEnabled();
            
            if (!isEnabled) {
                const error = new Error(`Element enabled assertion failed. Expected element to be enabled: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertEnabled', [options], 'success');
            ActionLogger.logInfo(`Enabled assertion passed for element: ${this.description}`, { 
                action: 'assertEnabled',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertEnabled', [options], 'failure', error as Error);
            ActionLogger.logError(`Enabled assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertDisabled(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const isDisabled = await this.isDisabled();
            
            if (!isDisabled) {
                const error = new Error(`Element disabled assertion failed. Expected element to be disabled: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertDisabled', [options], 'success');
            ActionLogger.logInfo(`Disabled assertion passed for element: ${this.description}`, { 
                action: 'assertDisabled',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertDisabled', [options], 'failure', error as Error);
            ActionLogger.logError(`Disabled assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertChecked(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const isChecked = await this.isChecked();
            
            if (!isChecked) {
                const error = new Error(`Element checked assertion failed. Expected element to be checked: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertChecked', [options], 'success');
            ActionLogger.logInfo(`Checked assertion passed for element: ${this.description}`, { 
                action: 'assertChecked',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertChecked', [options], 'failure', error as Error);
            ActionLogger.logError(`Checked assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertUnchecked(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const isChecked = await this.isChecked();
            
            if (isChecked) {
                const error = new Error(`Element unchecked assertion failed. Expected element to be unchecked: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.screenshot({ path: `assertion-failure-${Date.now()}.png` });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertUnchecked', [options], 'success');
            ActionLogger.logInfo(`Unchecked assertion passed for element: ${this.description}`, { 
                action: 'assertUnchecked',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertUnchecked', [options], 'failure', error as Error);
            ActionLogger.logError(`Unchecked assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertCount(expected: number, options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const actual = await this.getCount();
            
            if (actual !== expected) {
                const error = new Error(`Element count assertion failed. Expected: ${expected}, Actual: ${actual}`);
                
                if (options?.screenshot) {
                    await this.page.screenshot({ path: `assertion-failure-${Date.now()}.png`, fullPage: true });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertCount', [expected, options], 'success');
            ActionLogger.logInfo(`Count assertion passed for element: ${this.description}`, { 
                action: 'assertCount',
                duration: Date.now() - startTime,
                expected,
                actual,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertCount', [expected, options], 'failure', error as Error);
            ActionLogger.logError(`Count assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    async assertInViewport(options?: AssertOptions): Promise<void> {
        const startTime = Date.now();
        try {
            const inViewport = await this.isInViewport();
            
            if (!inViewport) {
                const error = new Error(`Element in viewport assertion failed. Expected element to be in viewport: ${this.description}`);
                
                if (options?.screenshot) {
                    await this.page.screenshot({ path: `assertion-failure-${Date.now()}.png`, fullPage: true });
                }
                
                if (!options?.soft) {
                    throw error;
                } else {
                    ActionLogger.logWarn(`Soft assertion failed: ${error.message}`);
                }
            }
            
            await this.logAction('assertInViewport', [options], 'success');
            ActionLogger.logInfo(`In viewport assertion passed for element: ${this.description}`, { 
                action: 'assertInViewport',
                duration: Date.now() - startTime,
                success: true 
            });
        } catch (error) {
            await this.logAction('assertInViewport', [options], 'failure', error as Error);
            ActionLogger.logError(`In viewport assertion failed for element: ${this.description}`, error as Error);
            throw error;
        }
    }

    // Soft assertion variants
    async softAssertText(expected: string): Promise<void> {
        await this.assertText(expected, { soft: true });
    }

    async softAssertTextContains(expected: string): Promise<void> {
        await this.assertTextContains(expected, { soft: true });
    }

    async softAssertValue(expected: string): Promise<void> {
        await this.assertValue(expected, { soft: true });
    }

    async softAssertAttribute(name: string, expected: string): Promise<void> {
        await this.assertAttribute(name, expected, { soft: true });
    }

    async softAssertCSSProperty(property: string, expected: string): Promise<void> {
        await this.assertCSSProperty(property, expected, { soft: true });
    }

    async softAssertVisible(): Promise<void> {
        await this.assertVisible({ soft: true });
    }

    async softAssertHidden(): Promise<void> {
        await this.assertHidden({ soft: true });
    }

    async softAssertEnabled(): Promise<void> {
        await this.assertEnabled({ soft: true });
    }

    async softAssertDisabled(): Promise<void> {
        await this.assertDisabled({ soft: true });
    }

    async softAssertChecked(): Promise<void> {
        await this.assertChecked({ soft: true });
    }

    async softAssertUnchecked(): Promise<void> {
        await this.assertUnchecked({ soft: true });
    }

    async softAssertCount(expected: number): Promise<void> {
        await this.assertCount(expected, { soft: true });
    }

    async softAssertInViewport(): Promise<void> {
        await this.assertInViewport({ soft: true });
    }

    // Helper methods
    
    invalidateCache(): void {
        this.lastResolvedAt = null;
        this.locator = null;
    }

    getActionHistory(): ActionRecord[] {
        return [...this.actionHistory];
    }

    getLastAction(): ActionRecord | null {
        return this.actionHistory.length > 0 ? (this.actionHistory[this.actionHistory.length - 1] || null) : null;
    }

    getElementId(): string {
        return this.elementId;
    }

    async getElementState(): Promise<ElementState> {
        return await this.captureElementState();
    }

    private async clearActionHistory(): Promise<void> {
        // Keep only last 50 actions to prevent memory issues
        if (this.actionHistory.length > 50) {
            this.actionHistory = this.actionHistory.slice(-50);
        }
    }

    private getSelectorString(): string {
        switch (this._config.locatorType) {
            case 'css':
                return this._config.locatorValue;
            case 'xpath':
                return this._config.locatorValue;
            case 'id':
                return `#${this._config.locatorValue}`;
            case 'testid':
                return `[data-testid="${this._config.locatorValue}"]`;
            default:
                return this._config.locatorValue;
        }
    }

    static createDynamic(
        page: Page, 
        configOrLocatorType: ElementConfig | string, 
        locatorValue?: string, 
        description?: string,
        options: Partial<Omit<ElementConfig, 'locatorType' | 'locatorValue' | 'description'>> = {}
    ): CSWebElement {
        if (typeof configOrLocatorType === 'object') {
            // Called with config object
            return new CSWebElement(page, configOrLocatorType);
        } else {
            // Called with individual parameters
            return new CSWebElement(page, {
                locatorType: configOrLocatorType as any,
                locatorValue: locatorValue!,
                description: description!,
                waitForVisible: true,
                waitForEnabled: true,
                waitTimeout: 30000,
                required: true,
                aiEnabled: false,
                aiDescription: '',
                aiConfidenceThreshold: 0.8,
                fallbacks: [],
                ...options
            });
        }
    }

    // ============================================================================
    // COLLECTION AND ADVANCED METHODS - For working with multiple elements
    // ============================================================================

    /**
     * Get all matching elements as CSWebElement array
     * Use this instead of page.locator().all()
     */
    async getAllElements(): Promise<CSWebElement[]> {
        try {
            const locator = await this.resolve();
            const count = await locator.count();
            const elements: CSWebElement[] = [];

            for (let i = 0; i < count; i++) {
                const elementConfig = {
                    ...this._config,
                    description: `${this._config.description} [${i}]`
                };
                const element = CSWebElement.createDynamic(this.page, elementConfig);
                // Set the nth locator for this element
                (element as any).locator = locator.nth(i);
                elements.push(element);
            }

            await this.logAction('get_all_elements', [], 'success');
            return elements;
        } catch (error) {
            await this.logAction('get_all_elements', [], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get element at specific index
     * Use this instead of page.locator().nth()
     */
    async getNthElement(index: number): Promise<CSWebElement> {
        try {
            const locator = await this.resolve();
            const elementConfig = {
                ...this._config,
                description: `${this._config.description} [${index}]`
            };
            const element = CSWebElement.createDynamic(this.page, elementConfig);
            (element as any).locator = locator.nth(index);

            await this.logAction('get_nth_element', [index], 'success');
            return element;
        } catch (error) {
            await this.logAction('get_nth_element', [index], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get first element from collection
     * Use this instead of page.locator().first()
     */
    async getFirstElement(): Promise<CSWebElement> {
        return this.getNthElement(0);
    }

    /**
     * Get last element from collection
     * Use this instead of page.locator().last()
     */
    async getLastElement(): Promise<CSWebElement> {
        try {
            const locator = await this.resolve();
            const elementConfig = {
                ...this._config,
                description: `${this._config.description} [last]`
            };
            const element = CSWebElement.createDynamic(this.page, elementConfig);
            (element as any).locator = locator.last();

            await this.logAction('get_last_element', [], 'success');
            return element;
        } catch (error) {
            await this.logAction('get_last_element', [], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Filter elements by text content
     */
    async filterByText(text: string): Promise<CSWebElement> {
        try {
            const locator = await this.resolve();
            const elementConfig = {
                ...this._config,
                description: `${this._config.description} with text "${text}"`
            };
            const element = CSWebElement.createDynamic(this.page, elementConfig);
            (element as any).locator = locator.filter({ hasText: text });

            await this.logAction('filter_by_text', [text], 'success');
            return element;
        } catch (error) {
            await this.logAction('filter_by_text', [text], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Filter elements by another locator
     */
    async filterByLocator(filterLocator: string): Promise<CSWebElement> {
        try {
            const locator = await this.resolve();
            const elementConfig = {
                ...this._config,
                description: `${this._config.description} filtered by "${filterLocator}"`
            };
            const element = CSWebElement.createDynamic(this.page, elementConfig);
            (element as any).locator = locator.filter({ has: this.page.locator(filterLocator) });

            await this.logAction('filter_by_locator', [filterLocator], 'success');
            return element;
        } catch (error) {
            await this.logAction('filter_by_locator', [filterLocator], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get parent element
     * Use this instead of page.locator().locator('..')
     */
    async getParent(): Promise<CSWebElement> {
        try {
            const locator = await this.resolve();
            const elementConfig: ElementConfig = {
                ...this._config,
                locatorType: 'xpath' as const,
                locatorValue: '..',
                description: `Parent of ${this._config.description}`
            };
            const element = CSWebElement.createDynamic(this.page, elementConfig);
            (element as any).locator = locator.locator('..');

            await this.logAction('get_parent', [], 'success');
            return element;
        } catch (error) {
            await this.logAction('get_parent', [], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Find child element by selector
     */
    async findChild(selector: string, description?: string): Promise<CSWebElement> {
        try {
            const locator = await this.resolve();
            const elementConfig: ElementConfig = {
                ...this._config,
                locatorType: 'css' as const,
                locatorValue: selector,
                description: description || `Child "${selector}" of ${this._config.description}`
            };
            const element = CSWebElement.createDynamic(this.page, elementConfig);
            (element as any).locator = locator.locator(selector);

            await this.logAction('find_child', [selector], 'success');
            return element;
        } catch (error) {
            await this.logAction('find_child', [selector], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Find all child elements by selector
     */
    async findChildren(selector: string, description?: string): Promise<CSWebElement[]> {
        try {
            const locator = await this.resolve();
            const childLocator = locator.locator(selector);
            const count = await childLocator.count();
            const elements: CSWebElement[] = [];

            for (let i = 0; i < count; i++) {
                const elementConfig: ElementConfig = {
                    locatorType: 'css' as const,
                    locatorValue: selector,
                    description: description || `Child "${selector}" [${i}] of ${this._config.description}`,
                    waitForVisible: false,
                    waitForEnabled: false,
                    waitTimeout: 30000,
                    required: false,
                    aiEnabled: false,
                    aiDescription: '',
                    aiConfidenceThreshold: 0.8,
                    fallbacks: []
                };
                const element = CSWebElement.createDynamic(this.page, elementConfig);
                (element as any).locator = childLocator.nth(i);
                elements.push(element);
            }

            await this.logAction('find_children', [selector], 'success');
            return elements;
        } catch (error) {
            await this.logAction('find_children', [selector], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get sibling element by index offset
     */
    async getSibling(offset: number): Promise<CSWebElement> {
        try {
            const parent = await this.getParent();
            const siblings = await parent.findChildren(this.getSelectorString());
            const currentIndex = await this.getSiblingIndex();
            const targetIndex = currentIndex + offset;

            if (targetIndex < 0 || targetIndex >= siblings.length) {
                throw new Error(`Sibling at offset ${offset} does not exist`);
            }

            const sibling = siblings[targetIndex];
            if (!sibling) {
                throw new Error(`Sibling at offset ${offset} does not exist`);
            }

            return sibling;
        } catch (error) {
            await this.logAction('get_sibling', [offset], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get next sibling element
     */
    async getNextSibling(): Promise<CSWebElement> {
        return this.getSibling(1);
    }

    /**
     * Get previous sibling element
     */
    async getPreviousSibling(): Promise<CSWebElement> {
        return this.getSibling(-1);
    }

    /**
     * Get element's index among siblings
     */
    private async getSiblingIndex(): Promise<number> {
        try {
            const parent = await this.getParent();
            const siblings = await parent.findChildren(this.getSelectorString());
            const currentElement = await this.elementHandle();

            for (let i = 0; i < siblings.length; i++) {
                const sibling = siblings[i];
                if (sibling) {
                    const siblingElement = await sibling.elementHandle();
                    if (currentElement === siblingElement) {
                        return i;
                    }
                }
            }

            throw new Error('Could not determine sibling index');
        } catch (error) {
            throw new Error(`Failed to get sibling index: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Wait for element to contain specific text
     */
    async waitForText(text: string, timeout: number = 30000): Promise<void> {
        try {
            const locator = await this.resolve();
            await locator.waitFor({
                state: 'visible',
                timeout
            });

            // Wait for the text to appear using expect
            await expect(locator).toContainText(text, { timeout });

            await this.logAction('wait_for_text', [text, timeout], 'success');
        } catch (error) {
            await this.logAction('wait_for_text', [text, timeout], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Wait for element to have specific attribute value
     */
    async waitForAttribute(attributeName: string, expectedValue: string, timeout: number = 30000): Promise<void> {
        try {
            const locator = await this.resolve();
            await locator.waitFor({
                state: 'attached',
                timeout
            });

            // Wait for the attribute value using expect
            await expect(locator).toHaveAttribute(attributeName, expectedValue, { timeout });

            await this.logAction('wait_for_attribute', [attributeName, expectedValue, timeout], 'success');
        } catch (error) {
            await this.logAction('wait_for_attribute', [attributeName, expectedValue, timeout], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Wait for element count to match expected value
     */
    async waitForCount(expectedCount: number, timeout: number = 30000): Promise<void> {
        try {
            const locator = await this.resolve();
            
            // Wait for the count using expect
            await expect(locator).toHaveCount(expectedCount, { timeout });

            await this.logAction('wait_for_count', [expectedCount, timeout], 'success');
        } catch (error) {
            await this.logAction('wait_for_count', [expectedCount, timeout], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Execute JavaScript on the element
     */
    async evaluate<T>(script: string | ((element: Element, ...args: any[]) => T), ...args: any[]): Promise<T> {
        try {
            const locator = await this.resolve();
            const result = await locator.evaluate(script as any, ...args);

            await this.logAction('evaluate', [script, ...args], 'success');
            return result as T;
        } catch (error) {
            await this.logAction('evaluate', [script, ...args], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Execute JavaScript on all matching elements
     */
    async evaluateAll<T>(script: string | ((element: Element, ...args: any[]) => T), ...args: any[]): Promise<T[]> {
        try {
            const locator = await this.resolve();
            const result = await locator.evaluateAll(script as any, args);

            await this.logAction('evaluate_all', [script, ...args], 'success');
            return result as T[];
        } catch (error) {
            await this.logAction('evaluate_all', [script, ...args], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get element's computed style
     */
    async getComputedStyle(): Promise<CSSStyleDeclaration> {
        try {
            const style = await this.evaluate('() => window.getComputedStyle(this)');

            await this.logAction('get_computed_style', [], 'success');
            return style as CSSStyleDeclaration;
        } catch (error) {
            await this.logAction('get_computed_style', [], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Check if element has specific class
     */
    async hasClass(className: string): Promise<boolean> {
        try {
            const hasClass = await this.evaluate('(element, cls) => element.classList.contains(cls)', className);

            await this.logAction('has_class', [className], 'success');
            return hasClass as boolean;
        } catch (error) {
            await this.logAction('has_class', [className], 'failure', error as Error);
            throw error;
        }
    }

    /**
     * Get all class names of the element
     */
    async getClassNames(): Promise<string[]> {
        try {
            const classNames = await this.evaluate('(element) => Array.from(element.classList)');

            await this.logAction('get_class_names', [], 'success');
            return classNames as string[];
        } catch (error) {
            await this.logAction('get_class_names', [], 'failure', error as Error);
            throw error;
        }
    }
}