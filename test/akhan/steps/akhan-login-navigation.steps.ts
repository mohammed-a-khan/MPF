import { CSBDDBaseStepDefinition } from '../../../src/bdd/base/CSBDDBaseStepDefinition';
import { CSBDDStepDef, StepDefinitions } from '../../../src/bdd/decorators/CSBDDStepDef';
import { LoginPage } from '../pages/LoginPage';
import { NavigationPage } from '../pages/NavigationPage';

@StepDefinitions
export class AKHANLoginNavigationSteps extends CSBDDBaseStepDefinition {
    private loginPage!: LoginPage;
    private navigationPage!: NavigationPage;

    constructor() {
        super();
    }

    async before() {
        this.loginPage = new LoginPage();
        this.navigationPage = new NavigationPage();
        await this.loginPage.initialize(this.page);
        await this.navigationPage.initialize(this.page);
    }

    @CSBDDStepDef('user is on the AKHAN login page')
    async navigateToLoginPage() {
        await this.loginPage.navigateTo();
        await this.loginPage.waitForPageLoad();
    }

    @CSBDDStepDef('user enters username "{string}" and password "{string}"')
    async enterCredentials(username: string, password: string) {
        await this.loginPage.enterUsername(username);
        await this.loginPage.enterPassword(password);
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

    @CSBDDStepDef('user should see the AKHAN home page')
    async verifyHomePage() {
        await this.page.waitForURL(/.*\/home$/);
    }

    @CSBDDStepDef('user should see the following menu items')
    async verifyMenuItems(dataTable: string[]) {
        // First verify all menu items are present
        await this.navigationPage.verifyAllMenuItems();
        
        // Then verify each specific menu item from the data table
        for (const menuItem of dataTable) {
            await this.navigationPage.verifyMenuItem(menuItem);
        }
    }

    @CSBDDStepDef('user clicks on "{string}" menu item')
    async clickMenuItem(menuItem: string) {
        await this.navigationPage.clickMenuItem(menuItem);
    }

    @CSBDDStepDef('user should see the "{string}" page')
    async verifyHeader(expectedHeader: string) {
        await this.navigationPage.verifyHeader(expectedHeader);
    }
} 