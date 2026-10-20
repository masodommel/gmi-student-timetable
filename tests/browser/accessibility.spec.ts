import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('student timetable and dialogs meet automated WCAG A/AA checks', async ({ page }) => {
  test.slow();
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('.lesson').first()).toBeVisible();
  const audit = async () => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    ).toEqual([]);
  };
  await audit();
  await page.screenshot({ path: test.info().outputPath('desktop.png'), fullPage: true });
  await page.locator('.lesson').first().click();
  await audit();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Accessibility preferences', exact: true }).click();
  await audit();
  await page.locator('#high-contrast').check();
  await page.locator('#large-text').check();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 740 });
  await audit();
  await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true });
  await page.locator('#compact-class-button').click();
  await audit();
});
