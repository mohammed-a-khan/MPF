import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';
import { PageRegistry } from '../../../src/core/pages/PageRegistry';
import { ActionLogger } from '../../../src/core/logging/ActionLogger';

/**
 * SauceDemo Login Page Object
 * Demonstrates comprehensive CS Framework page object implementation
 */
@PageRegistry.Page({
    name: 'SauceDemoLogin',
    description: 'SauceDemo application login page',
    tags: ['demo', 'authentication', 'ui'],
    aliases: ['login', 'signin'],
    url: 'https://www.saucedemo.com'
})
export class SauceDemoLoginPage extends CSBasePage {
    
    // Page URL implementation (required abstract property)
    protected get pageUrl(): string {
        return 'https://www.saucedemo.com';
    }

    // Element definitions using proper CS Framework decorators
    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'user-name',
        description: 'Username input field',
        required: true,
        waitForVisible: true,
        aiEnabled: true,
        aiDescription: 'Username or login input field for authentication'
    })
    usernameInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'password',
        description: 'Password input field',
        required: true,
        waitForVisible: true,
        aiEnabled: true,
        aiDescription: 'Password input field for authentication'
    })
    passwordInput!: CSWebElement;

    @CSGetElement({
        locatorType: 'id',
        locatorValue: 'login-button',
        description: 'Login submit button',
        required: true,
        waitForEnabled: true,
        aiEnabled: true,
        aiDescription: 'Login or submit button to authenticate user'
    })
    loginButton!: CSWebElement;

    @CSGetElement({
        locatorType: 'css',
        locatorValue: '[data-test="error"]',
        description: 'Error message container',
        required: false,
        waitForVisible: false,
        aiEnabled: true,
        aiDescription: 'Error message displayed when login fails'
    })
    errorMessage!: CSWebElement;

    @CSGetElement({
        locatorType: 'css',
        locatorValue: '.login_logo',
        description: 'Swag Labs logo',
        required: true,
        waitForVisible: true,
        aiEnabled: true,
        aiDescription: 'Application logo or branding element'
    })
    logo!: CSWebElement;

    @CSGetElement({
        locatorType: 'css',
        locatorValue: '.login_credentials',
        description: 'Accepted usernames list',
        required: false,
        waitForVisible: false
    })
    credentialsInfo!: CSWebElement;

    @CSGetElement({
        locatorType: 'css',
        locatorValue: '.login_password',
        description: 'Password information',
        required: false,
        waitForVisible: false
    })
    passwordInfo!: CSWebElement;

    // Required abstract method implementation
    protected async waitForPageLoad(): Promise<void> {
        try {
            // ELEMENT RESOLUTION FIX: Use actual page object elements instead of dynamic elements
            // Wait for the page to load and elements to be available
            await this.page.waitForLoadState('domcontentloaded');
            
            // Wait for the main login form elements using the actual page object elements
            await this.usernameInput.waitFor({ state: 'visible', timeout: 30000 });
            await this.passwordInput.waitFor({ state: 'visible', timeout: 30000 });
            await this.loginButton.waitFor({ state: 'visible', timeout: 30000 });
            
            // Additional wait for page stability
            await this.waitForPageStability();
            
            ActionLogger.logInfo('SauceDemo login page loaded successfully');
        } catch (error) {
            ActionLogger.logError('Failed to load SauceDemo login page', error instanceof Error ? error : new Error(String(error)));
            
            // Fallback: Try to check if we're on the right page
            const currentUrl = this.page.url();
            if (!currentUrl.includes('saucedemo.com')) {
                throw new Error(`Not on SauceDemo page. Current URL: ${currentUrl}`);
            }
            
            // If elements are still not found, provide helpful error message
            throw new Error(`SauceDemo login page elements not found. Current URL: ${currentUrl}. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Custom page initialization
    protected override async onPageReady(): Promise<void> {
        // Validate page loaded correctly
        const title = await this.getTitle();
        if (!title.toLowerCase().includes('swag labs')) {
            throw new Error(`Expected Swag Labs page, but got: ${title}`);
        }
        
        // Ensure login form is ready
        await this.validateLoginForm();
    }

    // Custom validation implementation
    protected override async customValidation(): Promise<void> {
        // Check logo is present
        if (!(await this.logo.isVisible())) {
            // Note: _validationErrors is handled by base class
            // Using logger instead for validation messages
            console.warn('Swag Labs logo not visible');
        }

        // Check login form elements are interactive
        if (!(await this.usernameInput.isEnabled())) {
            throw new Error('Username input is not enabled');
        }

        if (!(await this.passwordInput.isEnabled())) {
            throw new Error('Password input is not enabled');
        }

        if (!(await this.loginButton.isEnabled())) {
            throw new Error('Login button is not enabled');
        }
    }

    // Business logic methods
    
    /**
     * Perform login with credentials
     */
    async login(username: string, password: string): Promise<void> {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
        
        // Wait for navigation or error
        await this.page.waitForTimeout(1000);
    }

    /**
     * Get available usernames from the page
     */
    async getAvailableUsernames(): Promise<string[]> {
        try {
            const credentialsText = await this.credentialsInfo.getText();
            const usernames = credentialsText
                .split('\n')
                .filter(line => line.includes('username'))
                .map(line => {
                    const parts = line.split(':');
                    return parts.length > 0 ? parts[0]?.trim() ?? '' : '';
                })
                .filter(username => username && username !== 'Accepted usernames are');
            return usernames;
        } catch (error) {
            return ['standard_user', 'locked_out_user', 'problem_user', 'performance_glitch_user'];
        }
    }

    /**
     * Get password information
     */
    async getPasswordInfo(): Promise<string> {
        try {
            return await this.passwordInfo.getText();
        } catch (error) {
            return 'secret_sauce';
        }
    }

    /**
     * Check if error message is displayed
     */
    async hasErrorMessage(): Promise<boolean> {
        try {
            return await this.errorMessage.isVisible();
        } catch (error) {
            return false;
        }
    }

    /**
     * Get error message text
     */
    async getErrorMessage(): Promise<string> {
        if (await this.hasErrorMessage()) {
            return await this.errorMessage.getText();
        }
        return '';
    }

    /**
     * Clear login form
     */
    async clearForm(): Promise<void> {
        await this.usernameInput.clear();
        await this.passwordInput.clear();
    }

    /**
     * Validate login form is ready
     */
    private async validateLoginForm(): Promise<void> {
        // ELEMENT RESOLUTION FIX: Use actual page object elements instead of creating dynamic elements
        try {
            // Check if the page object elements are present and visible
            const usernameExists = await this.usernameInput.isPresent();
            const passwordExists = await this.passwordInput.isPresent();
            const loginButtonExists = await this.loginButton.isPresent();
            
            if (!usernameExists) {
                throw new Error('Login form element missing: Username input field');
            }
            
            if (!passwordExists) {
                throw new Error('Login form element missing: Password input field');
            }
            
            if (!loginButtonExists) {
                throw new Error('Login form element missing: Login button');
            }
            
            console.log('Login form validation completed successfully');
        } catch (error) {
            console.error('Login form validation failed:', error);
            throw new Error(`Login form validation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Check if on login page
     */
    async isOnLoginPage(): Promise<boolean> {
        try {
            const url = this.getURL();
            const hasLoginElements = await this.usernameInput.isPresent() && 
                                   await this.passwordInput.isPresent() && 
                                   await this.loginButton.isPresent();
            
            return url.includes('saucedemo.com') && hasLoginElements;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get page load metrics
     */
    getPageMetrics(): any {
        return this.getMetrics();
    }
} 