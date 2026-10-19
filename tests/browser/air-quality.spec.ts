import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const now = '2026-10-18T14:30:00Z';
function snapshot(date = '2026-10-18T14:00:00Z') {
  return {
    schemaVersion: 1,
    fetchedAt: now,
    stations: [
      { id: 'CA17W', value: 156, category: 'Unhealthy', observedAt: date },
      { id: 'CA16W', value: 155, category: 'Unhealthy', observedAt: date },
    ],
  };
}
test('latest station reading, timestamp, station selection and refresh failure are accessible', async ({ page }) => {
  await page.clock.setFixedTime(new Date(now));
  let fail = false;
  await page.route('**/data/air-quality.json', (route) => (fail ? route.abort() : route.fulfill({ json: snapshot() })));
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('#campus-conditions')).not.toHaveAttribute('open', '');
  await expect(page.locator('#air-brief')).toContainText('156');
  await page.locator('#conditions-toggle').click();
  await expect(page.locator('#air-result')).toContainText('156');
  await expect(page.locator('#air-result')).toContainText('22:00 MYT');
  await expect(page.locator('#air-location-note')).toContainText('not a campus measurement');
  await page.locator('#air-station').selectOption('CA16W');
  await expect(page.locator('#air-result')).toContainText('155');
  fail = true;
  await page.getByRole('button', { name: 'Refresh reading' }).click();
  await expect(page.locator('#air-result')).toContainText('Refresh failed');
  await expect(page.locator('#air-result')).toContainText('22:00 MYT');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('air-mobile.png'), fullPage: true });
});
test('stale and missing readings are explicit and timetable stays usable', async ({ page }) => {
  await page.clock.setFixedTime(new Date(now));
  let data = snapshot('2026-10-18T09:00:00Z');
  await page.route('**/data/air-quality.json', (route) => route.fulfill({ json: data }));
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('#air-brief')).toContainText('Outdated');
  await page.locator('#conditions-toggle').click();
  await expect(page.locator('#air-result')).toContainText('Outdated reading');
  data = snapshot('2026-10-16T14:00:00Z');
  await page.getByRole('button', { name: 'Refresh reading' }).click();
  await expect(page.locator('#air-result')).toContainText('Reading unavailable');
  await expect(page.locator('#air-result')).not.toContainText('156');
  await expect(page.locator('.lesson').first()).toBeVisible();
});
