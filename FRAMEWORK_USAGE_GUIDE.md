# CS Framework Usage Guide - Eliminate Raw Playwright Calls

## Overview

The CS Framework provides comprehensive methods to eliminate the need for raw Playwright locator calls. This guide shows you how to use framework methods instead of direct `page.locator()`, `page.waitForSelector()`, and other raw Playwright calls.

## ❌ AVOID: Raw Playwright Calls

```typescript
// DON'T DO THIS - Raw Playwright calls
await page.locator('.button').click();
await page.waitForSelector('#username');
await expect(page.locator('.title')).toHaveText('Products');
const count = await page.locator('.items').count();
```

## ✅ USE: CS Framework Methods

```typescript
// DO THIS - Framework methods
await this.clickByCSS('.button');
await this.waitForId('username');
await this.expectCSS('.title', 'Products');
const count = await this.getElementCount('css', '.items');
```

## Framework Method Categories

### 1. Element Finding Methods

```typescript
// Create temporary elements for one-time operations
protected createElement(locatorType, locatorValue, description?): CSWebElement
protected findByCSS(selector, description?): CSWebElement
protected findByXPath(xpath, description?): CSWebElement
protected findById(id, description?): CSWebElement
protected findByTestId(testId, description?): CSWebElement
protected findByText(text, description?): CSWebElement
protected findByDataTest(value, description?): CSWebElement
protected findByAriaLabel(label, description?): CSWebElement
protected findByRole(role, description?): CSWebElement
```

### 2. Element Interaction Methods

```typescript
// Click operations
protected async clickElement(locatorType, locatorValue): Promise<void>
protected async clickByCSS(selector): Promise<void>
protected async clickById(id): Promise<void>
protected async clickByTestId(testId): Promise<void>
protected async clickByDataTest(value): Promise<void>

// Text input operations
protected async fillElement(locatorType, locatorValue, text): Promise<void>
protected async fillByCSS(selector, text): Promise<void>
protected async fillById(id, text): Promise<void>
protected async fillByTestId(testId, text): Promise<void>

// Other interactions
protected async hoverElement(locatorType, locatorValue): Promise<void>
protected async doubleClickElement(locatorType, locatorValue): Promise<void>
protected async rightClickElement(locatorType, locatorValue): Promise<void>
```

### 3. Wait Operations

```typescript
// Wait for element states
protected async waitForElementVisible(locatorType, locatorValue, timeout?): Promise<void>
protected async waitForElementHidden(locatorType, locatorValue, timeout?): Promise<void>
protected async waitForElementAttached(locatorType, locatorValue, timeout?): Promise<void>

// Convenience wait methods
protected async waitForCSS(selector, timeout?): Promise<void>
protected async waitForId(id, timeout?): Promise<void>
protected async waitForTestId(testId, timeout?): Promise<void>
protected async waitForDataTest(value, timeout?): Promise<void>
```

### 4. Element State Checking

```typescript
// Check element existence and state
protected async elementExists(locatorType, locatorValue): Promise<boolean>
protected async isElementVisible(locatorType, locatorValue): Promise<boolean>
protected async isElementEnabled(locatorType, locatorValue): Promise<boolean>

// Convenience check methods
protected async existsByCSS(selector): Promise<boolean>
protected async existsById(id): Promise<boolean>
protected async existsByTestId(testId): Promise<boolean>
protected async existsByDataTest(value): Promise<boolean>
```

### 5. Text and Attribute Operations

```typescript
// Get text content
protected async getElementText(locatorType, locatorValue): Promise<string>
protected async getTextByCSS(selector): Promise<string>
protected async getTextById(id): Promise<string>
protected async getTextByTestId(testId): Promise<string>
protected async getTextByDataTest(value): Promise<string>

// Get attributes
protected async getElementAttribute(locatorType, locatorValue, attributeName): Promise<string | null>
protected async getElementCSSProperty(locatorType, locatorValue, property): Promise<string>
```

### 6. Assertion Methods (with Playwright expect integration)

```typescript
// Framework assertions
protected async expectElementText(locatorType, locatorValue, expectedText): Promise<void>
protected async expectElementVisible(locatorType, locatorValue): Promise<void>
protected async expectElementCount(locatorType, locatorValue, count): Promise<void>

// Convenience assertion methods
protected async expectCSS(selector, expectedText): Promise<void>
protected async expectCSSVisible(selector): Promise<void>
protected async expectTestId(testId, expectedText): Promise<void>
protected async expectTestIdVisible(testId): Promise<void>
protected async expectDataTest(value, expectedText): Promise<void>
protected async expectDataTestVisible(value): Promise<void>
```

## CSWebElement Advanced Methods

For decorated elements, use these advanced methods:

```typescript
// Collection operations
async getAllElements(): Promise<CSWebElement[]>
async getNthElement(index: number): Promise<CSWebElement>
async getFirstElement(): Promise<CSWebElement>
async getLastElement(): Promise<CSWebElement>

// Filtering
async filterByText(text: string): Promise<CSWebElement>
async filterByLocator(filterLocator: string): Promise<CSWebElement>

// Hierarchy navigation
async getParent(): Promise<CSWebElement>
async findChild(selector: string): Promise<CSWebElement>
async findChildren(selector: string): Promise<CSWebElement[]>
async getNextSibling(): Promise<CSWebElement>
async getPreviousSibling(): Promise<CSWebElement>

// Advanced waiting
async waitForText(text: string, timeout?: number): Promise<void>
async waitForAttribute(attributeName: string, expectedValue: string, timeout?: number): Promise<void>
async waitForCount(expectedCount: number, timeout?: number): Promise<void>

// JavaScript execution
async evaluate<T>(script: string, ...args: any[]): Promise<T>
async evaluateAll<T>(script: string, ...args: any[]): Promise<T[]>

// CSS and class operations
async hasClass(className: string): Promise<boolean>
async getClassNames(): Promise<string[]>
async getComputedStyle(): Promise<CSSStyleDeclaration>
```

## Migration Examples

### Example 1: Step Definition Updates

**❌ Before (Raw Playwright):**
```typescript
@CSBDDStepDef('I should see the products page')
async verifyProductsPage(): Promise<void> {
    const page = BDDContext.getCurrentPage();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.title')).toHaveText('Products');
    await expect(page.locator('.inventory_list')).toBeVisible();
}
```

**✅ After (Framework Methods):**
```typescript
@CSBDDStepDef('I should see the products page')
async verifyProductsPage(): Promise<void> {
    await this.waitForLoadState('networkidle');
    await this.expectCSS('.title', 'Products');
    await this.expectCSSVisible('.inventory_list');
}
```

### Example 2: Page Object Updates

**❌ Before (Raw Playwright):**
```typescript
private async validateLoginForm(): Promise<void> {
    const usernameExists = await this.page.locator('#user-name').count() > 0;
    const passwordExists = await this.page.locator('#password').count() > 0;
    const loginButtonExists = await this.page.locator('#login-button').count() > 0;
    
    if (!usernameExists || !passwordExists || !loginButtonExists) {
        throw new Error('Login form elements missing');
    }
}
```

**✅ After (Framework Methods):**
```typescript
private async validateLoginForm(): Promise<void> {
    const usernameExists = await this.existsById('user-name');
    const passwordExists = await this.existsById('password');
    const loginButtonExists = await this.existsById('login-button');
    
    if (!usernameExists || !passwordExists || !loginButtonExists) {
        throw new Error('Login form elements missing');
    }
}
```

### Example 3: Collection Operations

**❌ Before (Raw Playwright):**
```typescript
const cartItems = page.locator('.cart_item');
const actualCount = await cartItems.count();
const firstItem = cartItems.first();
await firstItem.click();
```

**✅ After (Framework Methods):**
```typescript
const cartItemsElement = this.findByCSS('.cart_item');
const actualCount = await cartItemsElement.getCount();
const firstItem = await cartItemsElement.getFirstElement();
await firstItem.click();
```

### Example 4: Advanced Element Operations

**❌ Before (Raw Playwright):**
```typescript
const addButtonSelector = `[data-test="add-to-cart-${productTestId}"]`;
await page.locator(addButtonSelector).click();
await page.locator(`[data-test="remove-${productTestId}"]`).waitFor({
    state: 'visible',
    timeout: 5000
});
```

**✅ After (Framework Methods):**
```typescript
await this.clickByDataTest(`add-to-cart-${productTestId}`);
await this.waitForDataTest(`remove-${productTestId}`, 5000);
```

## Best Practices

### 1. Use Page Object Methods
Always extend `CSBasePage` and use the protected framework methods:

```typescript
export class MyPage extends CSBasePage {
    protected async performAction(): Promise<void> {
        // Use framework methods
        await this.clickByCSS('.button');
        await this.waitForCSS('.result');
        await this.expectCSS('.message', 'Success');
    }
}
```

### 2. Use Decorated Elements for Repeated Operations
For elements you use frequently, use `@CSGetElement` decorators:

```typescript
@CSGetElement({
    locatorType: 'id',
    locatorValue: 'submit-button',
    description: 'Submit button'
})
submitButton!: CSWebElement;

// Then use the element directly
await this.submitButton.click();
await this.submitButton.waitFor({ state: 'visible' });
```

### 3. Use Framework Methods for One-time Operations
For one-time operations, use the framework helper methods:

```typescript
// Instead of creating a decorated element, use framework methods
await this.clickById('one-time-button');
await this.expectCSSVisible('.temporary-message');
```

### 4. Chain Operations Using Element References
For complex operations on the same element, get a reference:

```typescript
const productElement = this.findByDataTest(`product-${productId}`);
await productElement.hover();
await productElement.click();
await productElement.waitForAttribute('class', 'selected');
```

## Summary

By using these framework methods, you get:

- ✅ **Consistent API**: All operations use the same pattern
- ✅ **Better Logging**: All actions are automatically logged
- ✅ **Error Handling**: Built-in retry logic and error handling
- ✅ **Type Safety**: Full TypeScript support
- ✅ **Caching**: Element resolution caching for performance
- ✅ **AI Integration**: AI-powered element healing
- ✅ **Maintainability**: Easy to update and maintain

**Remember**: Never use raw `page.locator()`, `page.waitForSelector()`, or `page.click()` calls. Always use the framework methods provided by `CSBasePage` and `CSWebElement`. 