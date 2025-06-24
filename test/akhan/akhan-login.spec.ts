import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { NavigationPage } from './pages/NavigationPage';

test.describe('AKHAN Login and Navigation', () => {
  let loginPage: LoginPage;
  let navigationPage: NavigationPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage();
    navigationPage = new NavigationPage();
    await loginPage.initialize(page);
    await navigationPage.initialize(page);
  });

  test('Standard user login', async ({ page }) => {
    await test.step('Navigate to login page', async () => {
      await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login', { waitUntil: 'networkidle' });
    });

    await test.step('Enter credentials', async () => {
      await page.fill('input[name="username"]', 'Admin');
      await page.fill('input[name="password"]', 'admin123');
    });

    await test.step('Click login', async () => {
      await page.click('button[type="submit"]');
    });

    await test.step('Verify login', async () => {
      await page.waitForURL(/dashboard|home|main/);
      expect(page.url()).not.toContain('login');
    });
  });

  test('Verify menu items', async ({ page }) => {
    await test.step('Login to application', async () => {
      await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login', { waitUntil: 'networkidle' });
      await page.fill('input[name="username"]', 'Admin');
      await page.fill('input[name="password"]', 'admin123');
      await page.click('button[type="submit"]');
      await page.waitForURL(/dashboard|home|main/);
    });

    await test.step('Verify menu items', async () => {
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

      for (const item of menuItems) {
        const menuItem = page.locator('.oxd-main-menu-item', { hasText: item });
        await expect(menuItem).toBeVisible();
      }
    });
  });
}); 