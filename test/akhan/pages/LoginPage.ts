import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';
import { Page } from '@playwright/test';

export class LoginPage extends CSBasePage {
    protected get pageUrl(): string {
        return process.env['APP_BASE_URL'] || 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
    }

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@id="login" or @name="username"]',
        description: 'Username input field'
    })
    private usernameInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//input[@id="passwd" or @name="password"]',
        description: 'Password input field'
    })
    private passwordInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//button[@type="submit" or @name="submit"]',
        description: 'Log On link'
    })
    private logOnLink!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//h1[text()="Home"]',
        description: 'Home header'
    })
    private homeHeader!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//p[text()="Welcome, "]/strong',
        description: 'Welcome message with username'
    })
    private welcomeMessage!: CSWebElement;

    protected async waitForPageLoad(): Promise<void> {
        await this.page.waitForLoadState('networkidle');
    }

    async enterUsername(username: string) {
        await this.usernameInput.fill(username);
    }

    async enterPassword(password: string) {
        await this.passwordInput.fill(password);
    }

    async clickLogOn() {
        await this.logOnLink.click();
    }

    async verifyHomeHeader() {
        await this.homeHeader.waitFor({ state: 'visible' });
    }

    async verifyWelcomeMessage(expectedUsername: string) {
        const welcomeLocator = await this.welcomeMessage.getLocator();
        const welcomeText = await welcomeLocator.textContent();
        if (welcomeText !== expectedUsername) {
            throw new Error(`Expected welcome message to contain ${expectedUsername} but found ${welcomeText}`);
        }
    }
} 