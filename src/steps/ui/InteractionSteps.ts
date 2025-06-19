// src/steps/ui/InteractionSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { CSWebElement } from '../../core/elements/CSWebElement';
import { CSGetElementOptions } from '../../core/elements/types/element.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { DataTable } from '../../bdd/types/bdd.types';

export class InteractionSteps extends CSBDDBaseStepDefinition {
    
    @CSBDDStepDef('user clicks {string}')
    @CSBDDStepDef('I click {string}')
    @CSBDDStepDef('user clicks on {string}')
    async clickElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('click_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.click();
            
            // Wait for any navigation or changes
            await this.waitForStability();
            
            await actionLogger.logAction('element_clicked', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'click', element: elementDescription });
            throw new Error(`Failed to click "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user double clicks {string}')
    @CSBDDStepDef('I double click {string}')
    async doubleClickElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('double_click_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.doubleClick();
            
            await this.waitForStability();
            
            await actionLogger.logAction('element_double_clicked', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'double_click', element: elementDescription });
            throw new Error(`Failed to double click "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user right clicks {string}')
    @CSBDDStepDef('I right click {string}')
    async rightClickElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('right_click_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.rightClick();
            
            await this.waitForStability();
            
            await actionLogger.logAction('element_right_clicked', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'right_click', element: elementDescription });
            throw new Error(`Failed to right click "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user types {string} in {string}')
    @CSBDDStepDef('I type {string} in {string}')
    @CSBDDStepDef('user enters {string} in {string}')
    async typeInElement(text: string, elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('type_in_element', { 
            text: this.maskSensitiveData(text), 
            element: elementDescription 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            
            // Clear existing text first if configured
            if (ConfigurationManager.getBoolean('CLEAR_BEFORE_TYPE', true)) {
                await element.clear();
            }
            
            await element.type(text, {
                delay: ConfigurationManager.getInt('TYPE_DELAY', 0)
            });
            
            await actionLogger.logAction('text_typed', { 
                element: elementDescription,
                textLength: text.length,
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'type', element: elementDescription });
            throw new Error(`Failed to type in "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user fills {string} with {string}')
    @CSBDDStepDef('I fill {string} with {string}')
    async fillElement(elementDescription: string, text: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('fill_element', { 
            element: elementDescription,
            text: this.maskSensitiveData(text)
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.fill(text);
            
            await actionLogger.logAction('element_filled', { 
                element: elementDescription,
                textLength: text.length,
                success: true
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'fill', element: elementDescription });
            throw new Error(`Failed to fill "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user clears {string}')
    @CSBDDStepDef('I clear {string}')
    async clearElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('clear_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.clear();
            
            await actionLogger.logAction('element_cleared', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'clear', element: elementDescription });
            throw new Error(`Failed to clear "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user selects {string} from {string}')
    @CSBDDStepDef('I select {string} from {string}')
    @CSBDDStepDef('user chooses {string} from {string}')
    async selectOption(optionValue: string, elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('select_option', { 
            option: optionValue,
            element: elementDescription 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.selectOption(optionValue);
            
            await actionLogger.logAction('option_selected', { 
                option: optionValue,
                element: elementDescription,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'select', element: elementDescription, option: optionValue });
            throw new Error(`Failed to select "${optionValue}" from "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user selects multiple options from {string}:')
    @CSBDDStepDef('I select multiple options from {string}:')
    async selectMultipleOptions(elementDescription: string, dataTable: DataTable): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('select_multiple_options', { 
            element: elementDescription,
            optionCount: dataTable.raw().length 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const options = dataTable.raw().map(row => row[0]).filter((opt): opt is string => opt !== undefined);
            
            await element.selectOption(options);
            
            await actionLogger.logAction('multiple_options_selected', { 
                element: elementDescription,
                options,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'multi_select', element: elementDescription });
            throw new Error(`Failed to select multiple options from "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user checks {string}')
    @CSBDDStepDef('I check {string}')
    async checkElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('check_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            
            // Only check if not already checked
            if (!await element.isChecked()) {
                await element.check();
                await actionLogger.logAction('element_checked', { element: elementDescription, success: true });
            } else {
                await actionLogger.logAction('element_already_checked', { element: elementDescription, info: true });
            }
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'check', element: elementDescription });
            throw new Error(`Failed to check "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user unchecks {string}')
    @CSBDDStepDef('I uncheck {string}')
    async uncheckElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('uncheck_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            
            // Only uncheck if already checked
            if (await element.isChecked()) {
                await element.uncheck();
                await actionLogger.logAction('element_unchecked', { element: elementDescription, success: true });
            } else {
                await actionLogger.logAction('element_already_unchecked', { element: elementDescription, info: true });
            }
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'uncheck', element: elementDescription });
            throw new Error(`Failed to uncheck "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user hovers over {string}')
    @CSBDDStepDef('I hover over {string}')
    @CSBDDStepDef('user moves mouse over {string}')
    async hoverElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('hover_over_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.hover();
            
            // Wait for any hover effects
            await this.page.waitForTimeout(ConfigurationManager.getInt('HOVER_DELAY', 100));
            
            await actionLogger.logAction('element_hovered', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'hover', element: elementDescription });
            throw new Error(`Failed to hover over "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user focuses on {string}')
    @CSBDDStepDef('I focus on {string}')
    async focusElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('focus_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.focus();
            
            await actionLogger.logAction('element_focused', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'focus', element: elementDescription });
            throw new Error(`Failed to focus "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user blurs {string}')
    @CSBDDStepDef('I blur {string}')
    async blurElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('blur_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.blur();
            
            await actionLogger.logAction('element_blurred', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'blur', element: elementDescription });
            throw new Error(`Failed to blur "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user presses {string} key')
    @CSBDDStepDef('I press {string} key')
    @CSBDDStepDef('user presses {string}')
    async pressKey(key: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('press_key', { key });
        
        try {
            await this.page.keyboard.press(key);
            
            await actionLogger.logAction('key_pressed', { key, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'press_key', key });
            throw new Error(`Failed to press key "${key}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user presses {string} key in {string}')
    @CSBDDStepDef('I press {string} key in {string}')
    async pressKeyInElement(key: string, elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('press_key_in_element', { key, element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.press(key);
            
            await actionLogger.logAction('key_pressed_in_element', { key, element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'press_key_in_element', key, element: elementDescription });
            throw new Error(`Failed to press "${key}" in "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('I upload file {string} to {string}')
    async uploadFile(filePath: string, elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('upload_file', { 
            file: filePath,
            element: elementDescription 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            
            // Resolve file path relative to test data directory if not absolute
            const resolvedPath = this.resolveFilePath(filePath);
            
            await element.upload(resolvedPath);
            
            await actionLogger.logAction('file_uploaded', { 
                file: resolvedPath,
                element: elementDescription,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'upload', element: elementDescription, file: filePath });
            throw new Error(`Failed to upload file to "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user uploads multiple files to {string}:')
    @CSBDDStepDef('I upload multiple files to {string}:')
    async uploadMultipleFiles(elementDescription: string, dataTable: DataTable): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('upload_multiple_files', { 
            element: elementDescription,
            fileCount: dataTable.raw().length 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const filePaths = dataTable.raw().map(row => this.resolveFilePath(row[0] || ''));
            
            await element.upload(filePaths);
            
            await actionLogger.logAction('multiple_files_uploaded', { 
                element: elementDescription,
                files: filePaths,
                success: true 
            });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'multi_upload', element: elementDescription });
            throw new Error(`Failed to upload multiple files to "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user scrolls to {string}')
    @CSBDDStepDef('I scroll to {string}')
    async scrollToElement(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('scroll_to_element', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.scrollIntoView();
            
            // Wait for scroll animation
            await this.page.waitForTimeout(ConfigurationManager.getInt('SCROLL_DELAY', 300));
            
            await actionLogger.logAction('scrolled_to_element', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'scroll', element: elementDescription });
            throw new Error(`Failed to scroll to "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user selects all text in {string}')
    @CSBDDStepDef('I select all text in {string}')
    async selectAllText(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('select_all_text', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.selectText();
            
            await actionLogger.logAction('text_selected', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'select_text', element: elementDescription });
            throw new Error(`Failed to select text in "${elementDescription}": ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user waits for {string} to be visible')
    @CSBDDStepDef('I wait for {string} to be visible')
    async waitForVisible(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('wait_for_element_visible', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.waitFor({ 
                state: 'visible',
                timeout: ConfigurationManager.getInt('ELEMENT_TIMEOUT', 30000)
            });
            
            await actionLogger.logAction('element_is_visible', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'wait_for_visible', element: elementDescription });
            throw new Error(`Element "${elementDescription}" did not become visible: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user waits for {string} to be hidden')
    @CSBDDStepDef('I wait for {string} to be hidden')
    async waitForHidden(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('wait_for_element_hidden', { element: elementDescription });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.waitFor({ 
                state: 'hidden',
                timeout: ConfigurationManager.getInt('ELEMENT_TIMEOUT', 30000)
            });
            
            await actionLogger.logAction('element_is_hidden', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'wait_for_hidden', element: elementDescription });
            throw new Error(`Element "${elementDescription}" did not become hidden: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('user waits for {string} to be enabled')
    @CSBDDStepDef('I wait for {string} to be enabled')
    async waitForEnabled(elementDescription: string): Promise<void> {
        const actionLogger = ActionLogger.getInstance();
        await actionLogger.logAction('wait_for_element_enabled', { element: elementDescription });
        
        try {
            const timeout = ConfigurationManager.getInt('ELEMENT_TIMEOUT', 30000);
            const element = await this.findElement(elementDescription);
            
            await this.page.waitForFunction(
                async (el) => {
                    const element = el as any;
                    return await element.isEnabled();
                },
                element,
                { timeout }
            );
            
            await actionLogger.logAction('element_is_enabled', { element: elementDescription, success: true });
        } catch (error) {
            await actionLogger.logError(error as Error, { action: 'wait_for_enabled', element: elementDescription });
            throw new Error(`Element "${elementDescription}" did not become enabled: ${(error as Error).message}`);
        }
    }

    private async findElement(description: string): Promise<CSWebElement> {
        // Check if it's a stored element reference
        const storedElement = this.context.retrieve<CSWebElement>(`element_${description}`);
        if (storedElement) {
            return storedElement;
        }

        // Create element with AI-enabled options
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

    private async waitForStability(): Promise<void> {
        const stabilityDelay = ConfigurationManager.getInt('POST_ACTION_DELAY', 100);
        if (stabilityDelay > 0) {
            await this.page.waitForTimeout(stabilityDelay);
        }
    }

    private maskSensitiveData(text: string): string {
        const sensitivePatterns = ConfigurationManager.getArray('SENSITIVE_DATA_PATTERNS') || [];
        let maskedText = text;
        
        for (const pattern of sensitivePatterns) {
            const regex = new RegExp(pattern, 'gi');
            maskedText = maskedText.replace(regex, '***');
        }
        
        return maskedText;
    }

    private resolveFilePath(filePath: string): string {
        const path = require('path');
        
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const testDataDir = ConfigurationManager.get('TEST_DATA_DIR', './test-data');
        return path.resolve(testDataDir, filePath);
    }
}