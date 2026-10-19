import { test, expect } from '@playwright/test';
test('campus updates start small and expand only when requested', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T14:30:00Z'));
  await page.route('**/data/air-quality.json', (r) =>
    r.fulfill({
      json: {
        schemaVersion: 1,
        fetchedAt: '2026-10-18T14:30:00Z',
        stations: [{ id: 'CA17W', value: 156, category: 'Unhealthy', observedAt: '2026-10-18T14:00:00Z' }],
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('#air-brief')).toContainText('API 156 Unhealthy');
  await expect(page.locator('#haze-brief')).toBeVisible();
  await expect(page.locator('#air-quality')).toBeHidden();
  await expect(page.locator('#haze-advisory')).toBeHidden();
  expect((await page.locator('#campus-conditions').boundingBox())!.height).toBeLessThan(150);
  await page.locator('#conditions-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#air-quality')).toBeVisible();
  await page.locator('#conditions-toggle').click();
  await expect(page.locator('#air-quality')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('compact-mobile.png'), fullPage: true });
});
