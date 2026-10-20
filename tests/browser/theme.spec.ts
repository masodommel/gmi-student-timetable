import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ colorScheme: 'light' });

test('theme toggle switches the theme and saves only a theme cookie', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('.lesson').first()).toBeVisible();
  const html = page.locator('html');
  const toggle = page.locator('#theme-toggle');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.wordmark-logo')).toBeVisible();
  await expect(page.locator('.wordmark > strong')).toHaveCount(0);
  await expect(page.locator('.timezone')).toHaveCount(0);
  await expect(page.locator('#quality-button')).toHaveAttribute('aria-label', 'Timetable information and status');
  await expect(page.locator('#quality-button')).not.toContainText('Timetable info');
  await expect(page.locator('#quality-button .icon')).toHaveCount(1);
  await expect(page.locator('#accessibility-button')).toHaveAttribute('aria-label', 'Accessibility preferences');
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe(
    'rgb(240, 239, 240)',
  );
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.wordmark-logo')).toBeVisible();
  expect(await page.locator('.wordmark-logo').evaluate((image: HTMLImageElement) => image.naturalWidth > 0)).toBe(true);
  expect(await page.locator('.wordmark-logo').evaluate((image) => getComputedStyle(image).filter)).not.toContain(
    'invert',
  );
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor)).toBe('rgb(36, 36, 36)');
  expect(await page.locator('.planner').evaluate((planner) => getComputedStyle(planner).backgroundColor)).toBe(
    'rgb(46, 46, 46)',
  );
  expect(await page.locator('.topbar').evaluate((topbar) => getComputedStyle(topbar).backgroundColor)).toBe(
    'rgb(31, 31, 31)',
  );
  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).toEqual(['gmi-theme']);
  expect(cookies[0].value).toBe('dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.wordmark-logo')).toBeVisible();
});

test('theme cookie overrides the system preference', async ({ page }) => {
  await page.context().addCookies([{ name: 'gmi-theme', value: 'dark', url: 'http://127.0.0.1:4173/' }]);
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('captures light and dark theme screenshots for review', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('theme-light.png'), fullPage: true });
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: test.info().outputPath('theme-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-export')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('theme-dark-mobile.png'), fullPage: true });
});

test('dark theme meets automated WCAG A/AA checks', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([]);
});
