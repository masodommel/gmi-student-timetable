import { test, expect } from '@playwright/test';
test('students find classes without exact labels or typing at all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Find my class' }).click();
  await expect(page.getByRole('heading', { name: 'Find a Class' })).toBeVisible();
  await expect(page.locator('#programme-filter option').first()).toHaveText('Program');
  await expect(page.locator('#semester-filter option').first()).toHaveText('Semester');
  await expect(page.locator('#group-filter option').first()).toHaveText('Group');
  await expect(page.getByRole('button', { name: 'Class', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#class-search').fill('semester3 dmch group1');
  await expect(page.locator('.class-option')).toHaveCount(1);
  await expect(page.locator('.class-option')).toContainText('SEM 3 - DMCH 1');
  await expect(page.locator('#clear-class-filters')).toBeHidden();
  await page.locator('#class-search').fill('');
  await page.locator('#programme-filter').selectOption('DCBS');
  await page.locator('#semester-filter').selectOption('3');
  await page.locator('#group-filter').selectOption('1');
  await expect(page.locator('.class-option')).toHaveCount(1);
  await expect(page.locator('.class-option')).toContainText('SEM 3 - DCBS 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bookmarked classes move to the top of the picker', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await page.locator('#class-button').click();
  await page.locator('#class-search').fill('DSWE');
  const rows = page.locator('.class-option-row');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);
  const target = rows.last();
  const name = await target.locator('.class-option strong').textContent();
  await target.locator('.bookmark-star').click();
  await expect(rows.first().locator('.class-option strong')).toHaveText(name || '');
  await expect(rows.first().locator('.bookmark-star')).toHaveAttribute('aria-pressed', 'true');
});
