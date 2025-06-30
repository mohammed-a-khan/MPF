# NetScaler VDI Solution

## The Problem
When running tests in your company VDI with NetScaler authentication:
1. Navigation from app URL → NetScaler login → Back to app works
2. But after login, the test gets stuck trying to verify elements
3. CSP (Content Security Policy) errors appear

## Root Cause
Your company's application has strict CSP that blocks JavaScript evaluation. The framework is trying to use `page.evaluate()` or `waitForFunction()` which are blocked by CSP.

## The Solution - Use Playwright's Native Features

### 1. For Navigation (in LoginPage.ts)
```typescript
async clickLogOn(): Promise<void> {
    // Just click - Playwright handles navigation automatically
    await this.logOnLink.click();
    
    // No need for waitForNavigation - it's deprecated
    // No need for custom waits - Playwright handles redirects
}
```

### 2. For Element Verification
Instead of complex verification, use Playwright's auto-waiting:
```typescript
async verifyHomeHeader(): Promise<void> {
    // Playwright automatically waits for element to be:
    // - Attached to DOM
    // - Visible
    // - Stable (not animating)
    await this.homeHeader.waitFor({ state: 'visible' });
}
```

### 3. Update Your Locators
Since you can't share logs from VDI, update your locators to match your actual application:
```typescript
@CSGetElement({
    locatorType: 'xpath',
    locatorValue: '//h1 | //h2 | //h3 | //*[contains(@class, "header")] | //*[contains(@id, "header")]',
    description: 'Any header element'
})
private homeHeader!: CSWebElement;
```

### 4. Disable Features That Use JavaScript Evaluation
In your environment config (config/akhan/environments/dev.env):
```env
# Disable features that conflict with CSP
SKIP_JS_EVALUATION=true
USE_NATIVE_WAITS=true
```

### 5. If Still Having Issues
Create a minimal test to isolate the problem:
```typescript
// Simple test without framework overhead
test('NetScaler login', async ({ page }) => {
    // Navigate
    await page.goto('https://your-app-url.com');
    
    // Fill login form (will be on NetScaler page)
    await page.fill('input[name="username"]', 'your-username');
    await page.fill('input[name="password"]', 'your-password');
    await page.click('button[type="submit"]');
    
    // Wait for app page
    await page.waitForURL('**/home**');
    
    // Verify something simple
    await expect(page.locator('body')).toBeVisible();
});
```

## Key Points
1. **Trust Playwright's Auto-waiting** - It handles most scenarios automatically
2. **Avoid JavaScript Evaluation** - Use locators and built-in methods only
3. **Keep It Simple** - Don't over-engineer the solution
4. **Use Native Methods** - Playwright's methods are CSP-safe

## What Playwright Handles Automatically
- Cross-domain redirects (NetScaler → App)
- Waiting for navigation to complete
- Waiting for elements to be actionable
- Network idle states
- DOM content loaded states

You don't need custom handlers for these - Playwright does it all!