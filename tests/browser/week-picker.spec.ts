import { test, expect } from '@playwright/test';

test('week picker shows training weeks and special-week overlays', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('#week-open')).toBeVisible();
  await page.locator('#week-open').click();
  await expect(page.locator('#week-picker')).toBeVisible();
  const row = page.locator('.week-row', { has: page.locator('[data-date="2026-10-19"]') });
  await expect(row.locator('.week-number')).toHaveText('W15');
  await expect(page.locator('#week-picker-hint')).toHaveText('Selected: W15');
  await expect(row).not.toHaveClass(/week-row--/);
});

test('week picker shows SB/EX/RW overlays for special weeks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [week, label, cls] of [
    ['2026-08-31', 'SB', 'week-row--sb'],
    ['2026-11-16', 'RW', 'week-row--rw'],
    ['2026-11-23', 'EX', 'week-row--ex'],
  ] as const) {
    await page.goto(`./?class=99178435&week=${week}`);
    await expect(page.locator('#week-open')).toBeVisible();
    await page.locator('#week-open').click();
    await expect(page.locator('#week-picker')).toBeVisible();
    const row = page.locator('.week-row', { has: page.locator(`[data-date="${week}"]`) });
    await expect(row.locator('.week-number')).toHaveText(label);
    await expect(page.locator('#week-picker-hint')).toHaveText(`Selected: ${label}`);
    await expect(row).toHaveClass(new RegExp(cls));
    await page.keyboard.press('Escape');
  }
});

test('week picker falls back to ISO W for unconfigured weeks', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?class=99178435&week=2027-01-11');
  await expect(page.locator('#week-open')).toBeVisible();
  await page.locator('#week-open').click();
  await expect(page.locator('#week-picker')).toBeVisible();
  const row = page.locator('.week-row', { has: page.locator('[data-date="2027-01-11"]') });
  await expect(row.locator('.week-number')).toHaveText('W2');
  await expect(page.locator('#week-picker-hint')).toHaveText('Selected: W2');
});

test('header control sizes match at desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?class=99178435&week=2026-10-19');
  const logo = await page.locator('.wordmark-logo').evaluate((el) => el.getBoundingClientRect().height);
  const button = await page.locator('#rail-toggle').evaluate((el) => el.getBoundingClientRect().height);
  const label = await page.locator('.wordmark-label').evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(logo / 1.18 - button)).toBeLessThan(0.5);
  expect(Math.abs(label - button)).toBeLessThan(0.5);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.wordmark-label')).toBeHidden();
  const logoMobile = await page.locator('.wordmark-logo').evaluate((el) => el.getBoundingClientRect().height);
  const buttonMobile = await page.locator('#rail-open').evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(logoMobile / 1.18 - buttonMobile)).toBeLessThan(0.5);
});
