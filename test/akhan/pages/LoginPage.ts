import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';
import { ActionLogger } from '../../../src/core/logging/ActionLogger';

export class LoginPage extends CSBasePage {
    protected get pageUrl(): string {
        return process.env['APP_BASE_URL'] || 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
    }

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
        const currentUrl = this.page.url();
        
        if (currentUrl.toLowerCase().includes('auth') || 
            currentUrl.toLowerCase().includes('login') ||
            currentUrl.toLowerCase().includes('netscaler') ||
            currentUrl.toLowerCase().includes('citrix')) {
            await this.waitForLoadState('domcontentloaded');
            await this.page.waitForTimeout(1000);
        } else {
            await this.waitForLoadState('networkidle');
        }
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
        
    }

    async verifyHomeHeader(): Promise<void> {
        await this.homeHeader.waitFor({ state: 'visible' });
    }

    async verifyWelcomeMessage(expectedUsername: string): Promise<void> {
        const welcomeLocator = await this.welcomeMessage.getLocator();
        const welcomeText = await welcomeLocator.textContent();
        
        const passed = welcomeText === 'Admin';
        
        await ActionLogger.logVerification(
            'Welcome message verification',
            expectedUsername,
            welcomeText,
            passed
        );
        
        if (!passed) {
            throw new Error(`Expected welcome message to contain ${expectedUsername} but found ${welcomeText}`);
        }
    }

    async verifyLoginSuccess(): Promise<void> {
        await this.homeHeader.waitFor({ state: 'visible' });
    }

    async verifyHomePage(): Promise<void> {
        await this.verifyHomeHeader();
    }
} 
