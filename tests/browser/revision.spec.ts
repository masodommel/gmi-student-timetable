import { test, expect } from '@playwright/test';
import { makeDavFixture } from '../dav-fixture.js';
import { readManifest, revisionLabel } from './manifest.js';
import { openSettings } from './qa-helpers.js';
test('latest revision is visible, acknowledged per source, and local files stay distinct', async ({ page }) => {
  const manifest = await readManifest();
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('#latest-timetable')).toContainText(revisionLabel(manifest));
  await expect(page.locator('#revision-new-dot')).toBeVisible();
  await page.locator('#latest-timetable').click();
  await expect(page.locator('#about-source-description')).toContainText(manifest.sourceFilename!);
  const siteRepository = page.locator('#about-dialog a[href="https://github.com/masodommel/gmi-student-timetable"]');
  const upstreamProject = page.locator('#about-dialog a[href="https://github.com/lollllz/gmi-student-timetable"]');
  const otherProject = page.locator('#about-dialog a[href="https://www.sovereignmc.net/"]');
  await expect(siteRepository).toContainText('This site’s repository');
  await expect(upstreamProject).toContainText('Upstream project');
  await expect(otherProject).toContainText('My Other Project');
  await expect(siteRepository).toHaveAttribute('target', '_blank');
  await expect(siteRepository).toHaveAttribute('rel', 'noopener');
  await expect(upstreamProject).toHaveAttribute('target', '_blank');
  await expect(upstreamProject).toHaveAttribute('rel', 'noopener');
  await expect(otherProject).toHaveAttribute('target', '_blank');
  await expect(otherProject).toHaveAttribute('rel', 'noopener');
  await expect(page.locator('#about-sync-description')).toContainText(
    'The sync service checks the GMI timetable inbox every 15 minutes, and this page checks while open.',
  );
  await expect(page.locator('#about-sync-description')).toContainText('Last checked:');
  await page.keyboard.press('Escape');
  await expect(page.locator('#revision-new-dot')).toBeHidden();
  await page.reload();
  await expect(page.locator('#latest-timetable')).toBeVisible();
  await expect(page.locator('#revision-new-dot')).toBeHidden();
  await page.evaluate(() => localStorage.setItem('timetable-seen-revision', 'older-hash'));
  await page.reload();
  await expect(page.locator('#revision-new-dot')).toBeVisible();
  await openSettings(page, 'Open timetable file');
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
  await expect(page.locator('#latest-timetable')).toContainText(manifest.revisionCode!);
  await expect(page.locator('#revision-new-dot')).toBeVisible();
});
