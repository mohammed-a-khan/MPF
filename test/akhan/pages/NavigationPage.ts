import { CSBasePage } from '../../../src/core/pages/CSBasePage';

export class NavigationPage extends CSBasePage {
    protected get pageUrl(): string {
        return '/web/index.php/dashboard/index';
    }

    protected async waitForPageLoad(): Promise<void> {
        // Wait for the navigation menu to be visible
        await this.page.waitForSelector('.oxd-main-menu', { state: 'visible' });
    }

    async verifyMenuItem(menuItem: string) {
        // Wait for the menu item to be visible
        await this.page.waitForSelector(`.oxd-main-menu-item span:text("${menuItem}")`, { state: 'visible' });
    }

    async clickMenuItem(menuItem: string) {
        // Wait for the menu item to be visible and clickable
        const menuItemLocator = this.page.locator(`.oxd-main-menu-item span:text("${menuItem}")`);
        await menuItemLocator.waitFor({ state: 'visible' });
        await menuItemLocator.click();
    }

    async verifyHeader(expectedHeader: string) {
        // Wait for the header to be visible
        await this.page.waitForSelector(`.oxd-topbar-header-breadcrumb h6:text("${expectedHeader}")`, { state: 'visible' });
    }

    async verifyAllMenuItems() {
        const menuItems = [
            'Admin',
            'PIM',
            'Leave',
            'Time',
            'Recruitment',
            'My Info',
            'Performance',
            'Dashboard',
            'Directory',
            'Maintenance',
            'Buzz'
        ];

        for (const menuItem of menuItems) {
            await this.verifyMenuItem(menuItem);
        }
    }

    async verifyNavigatedToPage(pageName: string): Promise<void> {
        // Wait for navigation to complete
        await this.waitForPageLoad();
        
        // Verify the header matches the page name
        await this.verifyHeader(pageName);
        
        // Additional verification that we're not on login page
        const currentUrl = this.getCurrentUrl();
        if (currentUrl.includes('auth/login')) {
            throw new Error(`Navigation failed - still on login page`);
        }
    }
} 