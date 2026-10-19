import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const classId = '99178435';
const expectedClass = JSON.parse(
  await readFile(new URL(`../../public/data/${classId}.json`, import.meta.url), 'utf8'),
).class;
const selectedUrl = `?class=${classId}&week=2026-10-12`;
const qa = fileURLToPath(new URL('../../../../work/student-qa/', import.meta.url));

test('student chooses a class, browses lessons, and downloads only its calendar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?week=2026-10-12');
  await page.getByRole('button', { name: 'Find my class' }).click();
  await page.getByRole('searchbox', { name: 'Search classes' }).fill('SEM 3 DMCH 1');
  await page.locator(`[data-class-id="${classId}"]`).click();
  await expect(page.locator('#class-name')).toHaveText('SEM 3 - DMCH 1');
  await expect(page.locator('.week-grid')).toBeVisible();
  await expect(page.locator('.lesson').first()).toBeVisible();
  await page.locator('.lesson').first().click();
  await expect(page.locator('#lesson-dialog')).toBeVisible();
  await expect(page.locator('#lesson-content')).toContainText('KUALA LUMPUR');
  await page.keyboard.press('Escape');
  await expect(page.locator('#lesson-dialog')).not.toBeVisible();
  await page.locator('.rail .export-trigger').click();
  await expect(page.locator('#export-content')).toContainText(`${expectedClass.eventCount} entries`);
  const downloaded = page.waitForEvent('download');
  await page.locator('#calendar-download').click();
  const download = await downloaded;
  const calendar = await readFile(await download.path(), 'utf8');
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(expectedClass.eventCount);
  expect(calendar).toContain('X-WR-CALNAME:SEM 3 - DMCH 1');
  expect(calendar).toContain('TZID:Asia/Kuala_Lumpur');
  expect(calendar).not.toContain('SEM 3 - DMCH 2');
  expect(errors).toEqual([]);
});

test('shared class/week links, search, reload persistence and empty weeks work', async ({ page }) => {
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.week-grid')).toBeVisible();
  await page.locator('#subject-search').fill('ESP 2052');
  await expect(page.locator('.lesson')).toHaveCount(1);
  await page.locator('#subject-search').fill('not-a-real-subject');
  await expect(page.getByText('Nothing matches that search')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.locator('#agenda-view').click();
  await expect(page.locator('.agenda-list')).toBeVisible();
  await page.locator('#week-date').fill('2027-01-25');
  await expect(page.getByText('No classes listed this week')).toBeVisible();
  await page.goto('./?week=2026-10-12');
  await expect(page.locator('#class-name')).toHaveText('SEM 3 - DMCH 1');
  await expect(page.locator('.lesson').first()).toBeVisible();
});

test('mobile adapts to day agenda and keeps calendar export reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.agenda-list')).toBeVisible();
  await page.locator('[data-day="2026-10-12"]').click();
  await expect(page.locator('.agenda-events .lesson').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.mobile-export .export-trigger')).toBeVisible();
  await page.locator('.mobile-export .export-trigger').click();
  await expect(page.locator('#calendar-download')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await mkdir(qa, { recursive: true });
  await page.screenshot({ path: qa + 'mobile.png', fullPage: true });
});

test('failed schedule requests offer retry rather than a blank planner', async ({ page }) => {
  let fail = true;
  await page.route(`**/data/${classId}.json`, (route) =>
    fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue(),
  );
  await page.goto('./' + selectedUrl);
  await expect(page.getByText('Let’s try that again')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.lesson').first()).toBeVisible();
});

test('desktop weekly columns and narrow phone layout stay within the viewport', async ({ page }) => {
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.day-column')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir(qa, { recursive: true });
  await page.screenshot({ path: qa + 'desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator('.agenda-list')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
