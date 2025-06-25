import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions } from '../../../src/bdd/decorators/CSBDDStepDef';
import { Page } from '../../../src/bdd/decorators/Page';
import { LoginPage } from '../pages/LoginPage';
import { NavigationPage } from '../pages/NavigationPage';
import { Page as PlaywrightPage } from 'playwright';
import { DataTable } from '../../../src/bdd/types/bdd.types';

// Add debug logging to see if decorators are executing
console.log('🔍 DEBUG: akhan-login-navigation.steps.ts file loaded');

@StepDefinitions
export class AKHANLoginNavigationSteps extends CSBDDBaseStepDefinition {
    @Page(LoginPage)
    private loginPage!: LoginPage;
    
    @Page(NavigationPage)
    private navigationPage!: NavigationPage;
    
    constructor() {
        super();
        console.log('🔍 DEBUG: AKHANLoginNavigationSteps constructor called');
    }

    private assertPageDefined(page: PlaywrightPage | undefined): asserts page is PlaywrightPage {
        if (!page) {
            throw new Error('Page is not initialized. Make sure browser context is properly set up.');
        }
    }

    @CSBDDStepDef('I am on the AKHAN login page')
    async navigateToLoginPage() {
        console.log('🌐 Step: I am on the AKHAN login page');
        await this.loginPage.navigateTo();
        console.log('✅ Successfully navigated to AKHAN login page');
    }

    @CSBDDStepDef('I enter username {string} and password {string}')
    async enterCredentials(username: string, password: string) {
        console.log(`📝 Step: I enter username "${username}" and password "${password}"`);
        await this.loginPage.enterCredentials(username, password);
        console.log('✅ Credentials entered successfully');
    }

    @CSBDDStepDef('I click on the Log On link')
    async clickLogOn() {
        console.log('🔐 Step: I click on the Log On link');
        await this.loginPage.clickLogOn();
        console.log('✅ Log On button clicked');
    }

    @CSBDDStepDef('I should be logged in successfully')
    async verifyLoginSuccess() {
        console.log('🔍 Step: I should be logged in successfully');
        await this.loginPage.verifyLoginSuccess();
        console.log('✅ Login successful - reached dashboard');
    }

    @CSBDDStepDef('I should see the AKHAN home page')
    async verifyHomePage() {
        console.log('🏠 Step: I should see the AKHAN home page');
        await this.loginPage.verifyHomePage();
        console.log('✅ Successfully on AKHAN home page');
    }

    @CSBDDStepDef('I am logged in to AKHAN application')
    async verifyLoggedIn() {
        console.log('🔄 Step: I am logged in to AKHAN application');
        await this.loginPage.verifyLoginSuccess();
        console.log('✅ Already logged in to AKHAN application');
    }

    @CSBDDStepDef('I should see the following menu items')
    async verifyMenuItems(dataTable: DataTable) {
        console.log('📋 Step: I should see the following menu items');
        
        // Get menu items from data table
        const rows = dataTable.raw();
        const menuItems = rows.map(row => row[0]?.trim() || '').filter(Boolean);
        
        console.log('Expected menu items:', menuItems);
        
        // Use navigationPage to verify menu items
        await this.navigationPage.verifyAllMenuItems();
        
        console.log('✅ Menu items verification completed');
    }

    @CSBDDStepDef('I click on {string} menu item')
    async clickMenuItem(menuItem: string) {
        console.log(`🖱️ Step: I click on "${menuItem}" menu item`);
        
        // For scenario outlines, the placeholder is already replaced with the actual value
        // No need to remove angle brackets
        try {
            await this.navigationPage.clickMenuItem(menuItem);
            console.log(`✅ Clicked on menu item: ${menuItem}`);
        } catch (error) {
            console.error(`❌ Failed to click menu item "${menuItem}":`, error);
            throw error;
        }
    }

    @CSBDDStepDef('I should see the {string} header of type {string}')
    async verifyHeader(expectedHeader: string, headerType: string) {
        await this.navigationPage.verifyHeader(expectedHeader);
    }

    @CSBDDStepDef('I should be navigated to {string} page')
    async verifyNavigatedToPage(pageName: string) {
        // For scenario outlines, the placeholder is already replaced with the actual value
        // No need to remove angle brackets
        await this.navigationPage.verifyNavigatedToPage(pageName);
    }
}

console.log('🔍 DEBUG: akhan-login-navigation.steps.ts file processed completely'); 