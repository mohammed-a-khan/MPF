// src/steps/ui/ValidationSteps.ts
import { CSBDDStepDef } from '../../bdd/decorators/CSBDDStepDef';
import { CSBDDBaseStepDefinition } from '../../bdd/base/CSBDDBaseStepDefinition';
import { CSWebElement } from '../../core/elements/CSWebElement';
import { CSGetElementOptions, AssertOptions } from '../../core/elements/types/element.types';
import { ActionLogger } from '../../core/logging/ActionLogger';
import { ConfigurationManager } from '../../core/configuration/ConfigurationManager';
import { DataTable } from '../../bdd/types/bdd.types';

export class ValidationSteps extends CSBDDBaseStepDefinition {
    
    @CSBDDStepDef('{string} should be visible')
    @CSBDDStepDef('{string} is visible')
    @CSBDDStepDef('the {string} should be visible')
    async assertElementVisible(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element visible', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertVisible();
            
            ActionLogger.logInfo('Element is visible', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('Visibility assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is not visible: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('{string} should not be visible')
    @CSBDDStepDef('{string} is not visible')
    @CSBDDStepDef('{string} should be hidden')
    async assertElementNotVisible(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element not visible', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertHidden();
            
            ActionLogger.logInfo('Element is not visible', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('Hidden assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is visible when it should not be: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('{string} should be enabled')
    @CSBDDStepDef('{string} is enabled')
    async assertElementEnabled(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element enabled', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertEnabled();
            
            ActionLogger.logInfo('Element is enabled', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('Enabled assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is not enabled: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('{string} should be disabled')
    @CSBDDStepDef('{string} is disabled')
    async assertElementDisabled(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element disabled', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertDisabled();
            
            ActionLogger.logInfo('Element is disabled', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('Disabled assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is not disabled: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('{string} should have text {string}')
    @CSBDDStepDef('{string} text should be {string}')
    @CSBDDStepDef('the text of {string} should be {string}')
    async assertElementText(elementDescription: string, expectedText: string): Promise<void> {
        ActionLogger.logInfo('Assert element text', { 
            element: elementDescription,
            expectedText,
            type: 'validation_step' 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const options = this.getAssertOptions();
            
            await element.assertText(expectedText, options);
            
            ActionLogger.logInfo('Text assertion passed', { 
                element: elementDescription,
                expectedText,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualText = await this.getElementText(elementDescription);
            ActionLogger.logError('Text assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" text mismatch. Expected: "${expectedText}", Actual: "${actualText}"`);
        }
    }

    @CSBDDStepDef('{string} should contain text {string}')
    @CSBDDStepDef('{string} text should contain {string}')
    @CSBDDStepDef('the text of {string} should contain {string}')
    async assertElementContainsText(elementDescription: string, expectedText: string): Promise<void> {
        ActionLogger.logInfo('Assert element contains text', { 
            element: elementDescription,
            expectedText,
            type: 'validation_step' 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const options = this.getAssertOptions();
            
            await element.assertTextContains(expectedText, options);
            
            ActionLogger.logInfo('Contains text assertion passed', { 
                element: elementDescription,
                expectedText,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualText = await this.getElementText(elementDescription);
            ActionLogger.logError('Contains text assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" does not contain text "${expectedText}". Actual: "${actualText}"`);
        }
    }

    @CSBDDStepDef('{string} should have value {string}')
    @CSBDDStepDef('{string} value should be {string}')
    @CSBDDStepDef('the value of {string} should be {string}')
    async assertElementValue(elementDescription: string, expectedValue: string): Promise<void> {
        ActionLogger.logInfo('Assert element value', { 
            element: elementDescription,
            expectedValue,
            type: 'validation_step' 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            const options = this.getAssertOptions();
            
            await element.assertValue(expectedValue, options);
            
            ActionLogger.logInfo('Value assertion passed', { 
                element: elementDescription,
                expectedValue,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualValue = await this.getElementValue(elementDescription);
            ActionLogger.logError('Value assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" value mismatch. Expected: "${expectedValue}", Actual: "${actualValue}"`);
        }
    }

    @CSBDDStepDef('{string} should be checked')
    @CSBDDStepDef('{string} is checked')
    async assertElementChecked(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element checked', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertChecked();
            
            ActionLogger.logInfo('Element is checked', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('Checked assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is not checked: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('{string} should not be checked')
    @CSBDDStepDef('{string} is not checked')
    @CSBDDStepDef('{string} should be unchecked')
    async assertElementNotChecked(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element not checked', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertUnchecked();
            
            ActionLogger.logInfo('Element is not checked', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('Unchecked assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is checked when it should not be: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('{string} should have attribute {string} with value {string}')
    @CSBDDStepDef('attribute {string} of {string} should be {string}')
    async assertElementAttribute(elementDescription: string, attributeName: string, expectedValue: string): Promise<void> {
        ActionLogger.logInfo('Assert element attribute', { 
            element: elementDescription,
            attribute: attributeName,
            expectedValue,
            type: 'validation_step' 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertAttribute(attributeName, expectedValue, this.getAssertOptions());
            
            ActionLogger.logInfo('Attribute assertion passed', { 
                element: elementDescription,
                attribute: attributeName,
                expectedValue,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualValue = await this.getElementAttribute(elementDescription, attributeName);
            ActionLogger.logError('Attribute assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" attribute "${attributeName}" mismatch. Expected: "${expectedValue}", Actual: "${actualValue ?? 'null'}"`);
        }
    }

    @CSBDDStepDef('{string} should have CSS property {string} with value {string}')
    @CSBDDStepDef('CSS property {string} of {string} should be {string}')
    async assertElementCSSProperty(elementDescription: string, propertyName: string, expectedValue: string): Promise<void> {
        ActionLogger.logInfo('Assert element CSS property', { 
            element: elementDescription,
            property: propertyName,
            expectedValue,
            type: 'validation_step' 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertCSSProperty(propertyName, expectedValue, this.getAssertOptions());
            
            ActionLogger.logInfo('CSS property assertion passed', { 
                element: elementDescription,
                property: propertyName,
                expectedValue,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualValue = await this.getElementCSSProperty(elementDescription, propertyName);
            ActionLogger.logError('CSS property assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" CSS property "${propertyName}" mismatch. Expected: "${expectedValue}", Actual: "${actualValue}"`);
        }
    }

    @CSBDDStepDef('page title should be {string}')
    @CSBDDStepDef('the page title should be {string}')
    async assertPageTitle(expectedTitle: string): Promise<void> {
        ActionLogger.logInfo('Assert page title', { expectedTitle, type: 'validation_step' });
        
        try {
            const actualTitle = await this.page.title();
            
            if (actualTitle !== expectedTitle) {
                throw new Error(`Title mismatch`);
            }
            
            ActionLogger.logInfo('Page title assertion passed', { 
                expectedTitle,
                actualTitle,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualTitle = await this.page.title();
            ActionLogger.logError('Page title assertion failed', error as Error);
            throw new Error(`Page title mismatch. Expected: "${expectedTitle}", Actual: "${actualTitle}"`);
        }
    }

    @CSBDDStepDef('page title should contain {string}')
    @CSBDDStepDef('the page title should contain {string}')
    async assertPageTitleContains(expectedText: string): Promise<void> {
        ActionLogger.logInfo('Assert page title contains', { expectedText, type: 'validation_step' });
        
        try {
            const actualTitle = await this.page.title();
            
            if (!actualTitle.includes(expectedText)) {
                throw new Error(`Title does not contain expected text`);
            }
            
            ActionLogger.logInfo('Page title contains assertion passed', { 
                expectedText,
                actualTitle,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualTitle = await this.page.title();
            ActionLogger.logError('Page title contains assertion failed', error as Error);
            throw new Error(`Page title does not contain "${expectedText}". Actual: "${actualTitle}"`);
        }
    }

    @CSBDDStepDef('page URL should be {string}')
    @CSBDDStepDef('the page URL should be {string}')
    async assertPageURL(expectedURL: string): Promise<void> {
        ActionLogger.logInfo('Assert page URL', { expectedURL, type: 'validation_step' });
        
        try {
            const actualURL = this.page.url();
            const resolvedExpectedURL = this.resolveUrl(expectedURL);
            
            if (actualURL !== resolvedExpectedURL) {
                throw new Error(`URL mismatch`);
            }
            
            ActionLogger.logInfo('Page URL assertion passed', { 
                expectedURL: resolvedExpectedURL,
                actualURL,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualURL = this.page.url();
            ActionLogger.logError('Page URL assertion failed', error as Error);
            throw new Error(`Page URL mismatch. Expected: "${expectedURL}", Actual: "${actualURL}"`);
        }
    }

    @CSBDDStepDef('page URL should contain {string}')
    @CSBDDStepDef('the page URL should contain {string}')
    async assertPageURLContains(expectedText: string): Promise<void> {
        ActionLogger.logInfo('Assert page URL contains', { expectedText, type: 'validation_step' });
        
        try {
            const actualURL = this.page.url();
            
            if (!actualURL.includes(expectedText)) {
                throw new Error(`URL does not contain expected text`);
            }
            
            ActionLogger.logInfo('Page URL contains assertion passed', { 
                expectedText,
                actualURL,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualURL = this.page.url();
            ActionLogger.logError('Page URL contains assertion failed', error as Error);
            throw new Error(`Page URL does not contain "${expectedText}". Actual: "${actualURL}"`);
        }
    }

    @CSBDDStepDef('{string} should have {int} items')
    @CSBDDStepDef('the count of {string} should be {int}')
    async assertElementCount(elementDescription: string, expectedCount: number): Promise<void> {
        ActionLogger.logInfo('Assert element count', { 
            element: elementDescription,
            expectedCount,
            type: 'validation_step' 
        });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertCount(expectedCount);
            
            ActionLogger.logInfo('Count assertion passed', { 
                element: elementDescription,
                expectedCount,
                type: 'validation_success' 
            });
        } catch (error) {
            const actualCount = await this.getElementCount(elementDescription);
            ActionLogger.logError('Count assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" count mismatch. Expected: ${expectedCount}, Actual: ${actualCount}`);
        }
    }

    @CSBDDStepDef('{string} should be in viewport')
    @CSBDDStepDef('{string} is in viewport')
    async assertElementInViewport(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Assert element in viewport', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.assertInViewport();
            
            ActionLogger.logInfo('Element is in viewport', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logError('In viewport assertion failed', error as Error);
            throw new Error(`Element "${elementDescription}" is not in viewport: ${(error as Error).message}`);
        }
    }

    @CSBDDStepDef('I perform soft assertion that {string} should be visible')
    @CSBDDStepDef('soft assert {string} is visible')
    async softAssertElementVisible(elementDescription: string): Promise<void> {
        ActionLogger.logInfo('Soft assert element visible', { element: elementDescription, type: 'validation_step' });
        
        try {
            const element = await this.findElement(elementDescription);
            await element.softAssertVisible();
            
            ActionLogger.logInfo('Soft assertion: Element is visible', { element: elementDescription, type: 'validation_success' });
        } catch (error) {
            ActionLogger.logWarn('Soft assertion failed', { 
                element: elementDescription,
                error: (error as Error).message 
            });
            this.context.addSoftAssertionFailure(
                `Visibility assertion failed for element "${elementDescription}": ${(error as Error).message}`
            );
        }
    }

    @CSBDDStepDef('I verify all elements exist:')
    @CSBDDStepDef('the following elements should exist:')
    async verifyMultipleElementsExist(dataTable: DataTable): Promise<void> {
        ActionLogger.logInfo('Verify multiple elements exist', { 
            elementCount: dataTable.raw().length,
            type: 'validation_step' 
        });
        
        const failures: string[] = [];
        
        for (const row of dataTable.raw()) {
            const elementDescription = row[0];
            
            if (!elementDescription) {
                continue;
            }
            
            try {
                const element = await this.findElement(elementDescription);
                const exists = await element.isPresent();
                
                if (!exists) {
                    failures.push(`${elementDescription} - not found`);
                } else {
                    ActionLogger.logInfo(`Element found: ${elementDescription}`, { type: 'validation_success' });
                }
            } catch (error) {
                failures.push(`${elementDescription} - ${(error as Error).message}`);
            }
        }
        
        if (failures.length > 0) {
            ActionLogger.logError('Some elements not found', new Error('Multiple elements missing'));
            throw new Error(`Elements not found:\n${failures.join('\n')}`);
        }
        
        ActionLogger.logInfo('All elements exist', { type: 'validation_success' });
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
            waitForVisible: false
        };

        const element = new CSWebElement();
        element.page = this.page;
        element.options = options;
        element.description = description;

        return element;
    }

    private getAssertOptions(): AssertOptions {
        return {
            timeout: ConfigurationManager.getInt('ASSERTION_TIMEOUT', 5000),
            soft: false,
            screenshot: ConfigurationManager.getBoolean('SCREENSHOT_ON_ASSERTION_FAILURE', true)
        };
    }

    private async getElementText(elementDescription: string): Promise<string> {
        try {
            const element = await this.findElement(elementDescription);
            return await element.getText();
        } catch {
            return '<unable to get text>';
        }
    }

    private async getElementValue(elementDescription: string): Promise<string> {
        try {
            const element = await this.findElement(elementDescription);
            return await element.getValue();
        } catch {
            return '<unable to get value>';
        }
    }

    private async getElementAttribute(elementDescription: string, attributeName: string): Promise<string | null> {
        try {
            const element = await this.findElement(elementDescription);
            return await element.getAttribute(attributeName);
        } catch {
            return null;
        }
    }

    private async getElementCSSProperty(elementDescription: string, propertyName: string): Promise<string> {
        try {
            const element = await this.findElement(elementDescription);
            return await element.getCSSProperty(propertyName);
        } catch {
            return '<unable to get CSS property>';
        }
    }

    private async getElementCount(elementDescription: string): Promise<number> {
        try {
            const element = await this.findElement(elementDescription);
            return await element.getCount();
        } catch {
            return -1;
        }
    }

    private resolveUrl(url: string): string {
        const baseUrl = ConfigurationManager.get('BASE_URL', '');
        
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        if (url.startsWith('/')) {
            return `${baseUrl}${url}`;
        }
        
        return `${baseUrl}/${url}`;
    }

    @CSBDDStepDef('the test case should be {string} with description {string}')
    async assertTestCase(testCase: string, description: string): Promise<void> {
        ActionLogger.logInfo('Assert test case', { testCase, description, type: 'validation_step' });
        
        console.log(`✅ Test case ${testCase} with description "${description}" is being executed`);
        
        ActionLogger.logInfo('Test case assertion passed', { testCase, description, type: 'validation_success' });
    }
}
