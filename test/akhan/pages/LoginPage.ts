import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';

export class LoginPage extends CSBasePage {
    protected get pageUrl(): string {
        return process.env['APP_BASE_URL'] || 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
    }

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@name="username"]',
        description: 'Username input field'
    })
    private usernameInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@name="password"]',
        description: 'Password input field'
    })
    private passwordInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//button[@type="submit"]',
        description: 'Log On link'
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
        await this.waitForLoadState('networkidle');
    }

    async navigate(): Promise<void> {
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
        await this.logOnLink.click();
        
        // Wait for navigation to complete (handles NetScaler redirects)
        await this.page.waitForLoadState('networkidle', { timeout: 60000 });
        
        // Additional wait to ensure page is stable after redirects
        await this.page.waitForTimeout(3000);
    }

    async verifyHomeHeader(): Promise<void> {
        // Wait for navigation to complete after login
        await this.waitForURL('**/dashboard/**', { timeout: 30000 });
        
        // Wait for page to be fully loaded
        await this.waitForLoadState('networkidle');
        
        // Now verify the header is visible
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
        // Wait for navigation to complete after login
        await this.waitForURL('**/dashboard/**', { timeout: 30000 });
        
        // Wait for page to be fully loaded
        await this.waitForLoadState('networkidle');
        
        // Verify dashboard header is visible
        await this.homeHeader.waitFor({ state: 'visible' });
    }

    async verifyHomePage(): Promise<void> {
        // Same as verifyHomeHeader
        await this.verifyHomeHeader();
    }
} 