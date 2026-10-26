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

test('bookmarked classes move to the top of the next rendered picker', async ({ page }) => {
  const openPicker = async (): Promise<void> => {
    await page.locator('#class-button').click();
    await page.locator('#class-search').fill('DSWE');
    await expect(page.locator('#class-results')).not.toHaveAttribute('aria-busy', 'true');
  };
  await page.goto('./?class=99178435&week=2026-10-12');
  await openPicker();
  const rows = page.locator('.class-option-row');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(1);
  const target = rows.last();
  const name = await target.locator('.class-option strong').textContent();
  await target.locator('.bookmark-star').click();
  await expect(target.locator('.bookmark-star')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.last().locator('.class-option strong')).toHaveText(name || '');
  await page.keyboard.press('Escape');
  await openPicker();
  await expect(rows.first().locator('.class-option strong')).toHaveText(name || '');
  await expect(rows.first().locator('.bookmark-star')).toHaveAttribute('aria-pressed', 'true');
  await rows.first().locator('.bookmark-star').click();
  await page.keyboard.press('Escape');
  await openPicker();
  await expect(rows.last().locator('.class-option strong')).toHaveText(name || '');
  await expect(rows.last().locator('.bookmark-star')).toHaveAttribute('aria-pressed', 'false');
  await rows.last().locator('.bookmark-star').hover();
  expect(
    await rows
      .last()
      .locator('.bookmark-star')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
});

test('saved bookmarks prewarm into the first picker result', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await page.evaluate(() => {
    document.cookie = `gmi-bookmarks=${encodeURIComponent(
      JSON.stringify([{ kind: 'class', name: 'SEM 1 - DSWE 8' }]),
    )}; path=/`;
  });
  await page.reload();
  await page.locator('#class-button').click();
  await page.locator('#class-search').fill('DSWE');
  await expect(page.locator('#class-results')).not.toHaveAttribute('aria-busy', 'true');
  const first = page.locator('.class-option-row').first();
  await expect(first.locator('.class-option strong')).toHaveText('SEM 1 - DSWE 8');
  await expect(first.locator('.bookmark-star')).toHaveAttribute('aria-pressed', 'true');
});

test('mobile bookmark stars use a larger tap target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await page.locator('#compact-class-button').click();
  await expect(page.locator('#class-results')).not.toHaveAttribute('aria-busy', 'true');
  const star = page.locator('.class-option-row .bookmark-star').first();
  await expect(star).toHaveCSS('width', '36px');
  await expect(star).toHaveCSS('height', '36px');
  await expect(star.locator('.icon')).toHaveCSS('width', '19px');
});

test('lesson details bookmark toggles in place and keeps its hover state', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-19');
  await page.locator('.lesson').first().click();
  const star = page.locator('.lesson-class-row .bookmark-star').first();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.hover();
  expect(await star.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.locator('.lesson').first().click();
  await expect(page.locator('.lesson-class-row .bookmark-star').first()).toHaveAttribute('aria-pressed', 'true');
});
