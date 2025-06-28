import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions } from '../../../src/bdd/decorators/CSBDDStepDef';
import { LoginPage } from '../pages/LoginPage';
import { NavigationPage } from '../pages/NavigationPage';
import { PageObject } from '../../../src/bdd/decorators/Page';
import { DataTable } from '../../../src/bdd/types/bdd.types';

@StepDefinitions
export class akhanLoginNavigationSteps extends CSBDDBaseStepDefinition {
    @PageObject(LoginPage)
    private loginPage!: LoginPage;

    @PageObject(NavigationPage)
    private navigationPage!: NavigationPage;

    constructor() {
        super();
    }

    @CSBDDStepDef('user is on the akhan login page')
    async navigateToLoginPage() {
        await this.loginPage.navigateTo();
    }

    @CSBDDStepDef('user enters username {string} and password {string}')
    async enterCredentials(username: string, password: string) {
        await this.loginPage.enterCredentials(username, password);
    }

    @CSBDDStepDef('user clicks on the Log On link')
    async clickLogOn() {
        await this.loginPage.clickLogOn();
    }

    @CSBDDStepDef('user should be logged in successfully')
    async verifyLogin() {
        await this.loginPage.verifyHomeHeader();
        await this.loginPage.verifyWelcomeMessage('login');
    }

    @CSBDDStepDef('user should see the akhan home page')
    async verifyHomePage() {
        await this.waitForURL(/.*\/index$/);
    }

    @CSBDDStepDef('user is logged in to akhan application with username {string} and password {string}')
    async loginToakhan(username: string, password: string) {
        await this.loginPage.navigateTo();
        await this.loginPage.enterCredentials(username, password);
        await this.loginPage.clickLogOn();
        await this.loginPage.verifyHomeHeader();
    }

    @CSBDDStepDef('user should see the following menu items')
    async verifyMenuItems(dataTable: DataTable) {
        // First verify all menu items are present
        await this.navigationPage.verifyAllMenuItems();

        const rows = dataTable.raw();
        const menuItems = rows.map(row => row[0]?.trim() || '').filter(Boolean);
        
        // Then verify each specific menu item from the data table
        for (const menuItem of menuItems) {
            await this.navigationPage.verifyMenuItem(menuItem);
        }
    }

    @CSBDDStepDef('user clicks on {string} menu item')
    async clickMenuItem(menuItem: string) {
        await this.navigationPage.clickMenuItem(menuItem);
    }

    @CSBDDStepDef('user should see the {string} page')
    async verifyHeader(expectedHeader: string) {
        await this.navigationPage.verifyHeader(expectedHeader);
    }
} 