import { test, expect } from '@playwright/test';
test('students find classes without exact labels or typing at all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Find my class' }).click();
  await page.locator('#class-search').fill('semester3 dmch group1');
  await expect(page.locator('.class-option')).toHaveCount(1);
  await expect(page.locator('.class-option')).toContainText('SEM 3 - DMCH 1');
  await page.locator('#clear-class-filters').click();
  await page.locator('#programme-filter').selectOption('DCBS');
  await page.locator('#semester-filter').selectOption('3');
  await page.locator('#group-filter').selectOption('1');
  await expect(page.locator('.class-option')).toHaveCount(1);
  await expect(page.locator('.class-option')).toContainText('SEM 3 - DCBS 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
