import { test, expect } from '@playwright/test';
import { makeDavFixture } from '../dav-fixture.js';
test('latest revision is visible, acknowledged per source, and local files stay distinct', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('#latest-timetable')).toContainText('R04D · 15 Oct 2026');
  await expect(page.locator('#revision-new-dot')).toBeVisible();
  await page.locator('#latest-timetable').click();
  await expect(page.locator('#about-source-description')).toContainText('TT JULYSEPT 2026_R04D_15102026.dav');
  await page.keyboard.press('Escape');
  await expect(page.locator('#revision-new-dot')).toBeHidden();
  await page.reload();
  await expect(page.locator('#latest-timetable')).toBeVisible();
  await expect(page.locator('#revision-new-dot')).toBeHidden();
  await page.evaluate(() => localStorage.setItem('timetable-seen-revision', 'older-hash'));
  await page.reload();
  await expect(page.locator('#revision-new-dot')).toBeVisible();
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  await page.locator('#file-input').setInputFiles({
    name: 'personal.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture()),
  });
  await expect(page.locator('#class-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#latest-timetable')).toHaveText('Local file loaded');
  await expect(page.locator('#revision-new-dot')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('timetable-seen-revision'))).toBe('older-hash');
  await page.getByRole('button', { name: 'Use provided timetable', exact: true }).click();
  await expect(page.locator('#latest-timetable')).toContainText('R04D');
  await expect(page.locator('#revision-new-dot')).toBeVisible();
});
