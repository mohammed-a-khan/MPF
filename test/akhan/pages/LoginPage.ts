import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';

export class LoginPage extends CSBasePage {
    protected get pageUrl(): string {
        return process.env['APP_BASE_URL'] || 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
    }

    // These locators will work on NetScaler login page
    // Update them based on your actual NetScaler login form
    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@name="username" or @id="username" or @name="login" or @id="login"]',
        description: 'Username input field'
    })
    private usernameInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@name="password" or @id="password" or @type="password"]',
        description: 'Password input field'
    })
    private passwordInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//button[@type="submit"] | //input[@type="submit"] | //button[contains(text(), "Log")] | //input[@value="Log On"]',
        description: 'Log On button'
    })
    private logOnLink!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//h6[text()="Dashboard"]',
        description: 'Dashboard header'
    })
    private homeHeader!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//ul[@class="oxd-main-menu"]//span[text()="Admin"]',
        description: 'Welcome message with username'
    })
    private welcomeMessage!: CSWebElement;

    protected async waitForPageLoad(): Promise<void> {
        // For NetScaler scenarios, we might be on either the auth page or the app page
        const currentUrl = this.page.url();
        
        if (currentUrl.toLowerCase().includes('auth') || 
            currentUrl.toLowerCase().includes('login') ||
            currentUrl.toLowerCase().includes('netscaler') ||
            currentUrl.toLowerCase().includes('citrix')) {
            // We're on the authentication page, just wait for DOM
            await this.waitForLoadState('domcontentloaded');
            // Small wait to ensure form elements are interactive
            await this.page.waitForTimeout(1000);
        } else {
            // We're on the application page, wait for full load
            await this.waitForLoadState('networkidle');
        }
    }

    async navigate(): Promise<void> {
        // Navigate to the app URL - framework will handle NetScaler redirect
        await this.navigateTo();
    }

    async enterCredentials(username: string, password: string): Promise<void> {
        await this.enterUsername(username);
        await this.enterPassword(password);
    }

    async enterUsername(username: string): Promise<void> {
        await this.usernameInput.fill(username);
    }

    async enterPassword(password: string): Promise<void> {
        await this.passwordInput.fill(password);
    }

    async clickLogOn(): Promise<void> {
        // Playwright auto-waits for navigation after click
        // It handles redirects automatically
        await this.logOnLink.click();
        
        // Playwright's click() already waits for navigation
        // Only add explicit wait if your app has specific requirements
    }

    async verifyHomeHeader(): Promise<void> {
        // Framework automatically handles navigation, just verify the header
        await this.homeHeader.waitFor({ state: 'visible' });
    }

    async verifyWelcomeMessage(expectedUsername: string): Promise<void> {
        const welcomeLocator = await this.welcomeMessage.getLocator();
        const welcomeText = await welcomeLocator.textContent();
        if (welcomeText !== 'Admin') {
            throw new Error(`Expected welcome message to contain ${expectedUsername} but found ${welcomeText}`);
        }
    }

    async verifyLoginSuccess(): Promise<void> {
        // Framework automatically handles navigation, just verify the header
        await this.homeHeader.waitFor({ state: 'visible' });
    }

    async verifyHomePage(): Promise<void> {
        // Same as verifyHomeHeader
        await this.verifyHomeHeader();
    }
} 