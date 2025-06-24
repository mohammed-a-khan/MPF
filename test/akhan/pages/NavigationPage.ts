import { Page } from '@playwright/test';

export class NavigationPage {
    private page: Page;

    constructor() {
        this.page = null as any;
    }

    async initialize(page: Page) {
        this.page = page;
    }

    async verifyMenuItem(menuItem: string) {
        await this.page.waitForSelector(`.oxd-main-menu-item span:text("${menuItem}")`, { state: 'visible' });
    }

    async clickMenuItem(menuItem: string) {
        await this.page.click(`.oxd-main-menu-item span:text("${menuItem}")`);
    }

    async verifyHeader(expectedHeader: string) {
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

    async waitForPageLoad() {
        await this.page.waitForLoadState('networkidle');
    }
} 