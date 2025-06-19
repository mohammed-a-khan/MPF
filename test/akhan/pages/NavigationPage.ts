import { CSBasePage } from '../../../src/core/pages/CSBasePage';
import { CSGetElement } from '../../../src/core/elements/decorators/CSGetElement';
import { CSWebElement } from '../../../src/core/elements/CSWebElement';

export class NavigationPage extends CSBasePage {
    pageUrl = '';

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//div[@id="abcdNavigatorBody"]',
        description: 'Navigation menu container'
    })
    private navigationMenu!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//span[text()="System Admin"]',
        description: 'System Admin menu item'
    })
    private systemAdminMenuItem!: CSWebElement;

    @CSGetElement({
        locatorType: 'xpath',
        locatorValue: '//span[text()="Add files"]',
        description: 'Add files text for File Upload page'
    })
    private addFilesText!: CSWebElement;

    private readonly menuItems = [
        'Home', 'ESSS/Series', 'Reference Interests', 'Interest History',
        'External Interests', 'Version Information', 'File Upload'
    ];

    private getMenuItem(menuItem: string): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//div[@id="abcdNavigatorBody"]//a[text()="${menuItem}"]`,
            description: `Menu item: ${menuItem}`
        });
    }

    private getHeader(expectedHeader: string): CSWebElement {
        return new CSWebElement(this.page, {
            locatorType: 'xpath',
            locatorValue: `//h1[text()="${expectedHeader}"]`,
            description: `Page header: ${expectedHeader}`
        });
    }

    async verifyMenuItem(menuItem: string) {
        if (menuItem === 'System Admin') {
            await this.systemAdminMenuItem.waitFor({ state: 'visible' });
        } else {
            const menuItemElement = this.getMenuItem(menuItem);
            await menuItemElement.waitFor({ state: 'visible' });
        }
    }

    async clickMenuItem(menuItem: string) {
        if (menuItem === 'System Admin') {
            await this.systemAdminMenuItem.click();
        } else {
            const menuItemElement = this.getMenuItem(menuItem);
            await menuItemElement.click();
        }
    }

    async verifyHeader(expectedHeader: string) {
        if (expectedHeader === 'File Upload') {
            await this.addFilesText.waitFor({ state: 'visible' });
        } else {
            const headerElement = this.getHeader(expectedHeader);
            await headerElement.waitFor({ state: 'visible' });
        }
    }

    async verifyAllMenuItems() {
        // First verify the navigation menu container is present
        await this.navigationMenu.waitFor({ state: 'visible' });
        
        // Then verify all menu items
        for (const menuItem of this.menuItems) {
            await this.verifyMenuItem(menuItem);
        }
        await this.systemAdminMenuItem.waitFor({ state: 'visible' });
    }

    async waitForPageLoad() {
        await this.page.waitForLoadState('networkidle');
    }
} 