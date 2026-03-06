import { test, expect } from '@playwright/test';

test('google title test', async ({ page }) => {
  await page.goto('https://google.com');
  await expect(page).toHaveTitle(/Google/);
});