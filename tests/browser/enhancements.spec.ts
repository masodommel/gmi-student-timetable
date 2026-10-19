import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeDavFixture } from '../dav-fixture.js';
import { decodeDav } from '../../src/dav/index.js';

test('lecturer timetable includes multiple classes and exports its own calendar and share URL', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await page.getByRole('button', { name: 'By lecturer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find a lecturer' })).toBeVisible();
  await page.locator('#class-search').fill('AZIZ');
  await expect(page.locator('.class-option').first()).toBeVisible();
  await page.locator('.class-option').first().click();
  await expect(page).toHaveURL(/lecturer=/);
  await expect(page.locator('.lesson').first()).toBeVisible();
  await page.locator('.rail .export-trigger').click();
  await expect(page.locator('#calendar-download')).toHaveAttribute('href', /^blob:/);
  const download = page.waitForEvent('download');
  await page.locator('#calendar-download').click();
  const text = await readFile(await (await download).path(), 'utf8');
  expect(text).toContain('Class:');
  expect(text).toContain('STATUS:TENTATIVE');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#lecturer-mode')).toHaveAttribute('aria-pressed', 'true');
});
test('accessibility preferences persist, dialogs return focus and mobile layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./?class=99178435&week=2026-10-12');
  await page.getByRole('button', { name: 'Accessibility', exact: true }).click();
  for (const id of ['large-text', 'high-contrast', 'reduce-motion', 'agenda-default'])
    await page.locator('#' + id).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#accessibility-button')).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await expect(page.locator('#agenda-view')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const label = (await page.locator('#week-label').boundingBox())!,
    next = (await page.locator('#next-week').boundingBox())!;
  expect(label.x + label.width).toBeLessThanOrEqual(next.x);
  await page.locator('[data-day="2026-10-13"]').click();
  await expect(page.locator('[data-day="2026-10-13"]')).toBeFocused();
});
test('local lesson editing exports a reparsable full DAV and stays on device', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  const fixture = makeDavFixture();
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'edit.dav', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture) });
  await page.locator('[data-class-id="1"]').click();
  await page.locator('#week-date').fill('2026-07-06');
  await page.locator('.lesson').first().click();
  await page.getByRole('button', { name: 'Edit recurring lesson', exact: true }).click();
  await page.locator('#edit-day').selectOption('2');
  await page.locator('#edit-period').selectOption('2');
  await page.locator('#edit-note').fill('Revised locally');
  await page.getByRole('button', { name: 'Apply to local timetable' }).click();
  await expect(page.locator('.lesson').first()).toContainText('Revised locally');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export DAV', exact: true }).click();
  const bytes = await readFile(await (await download).path());
  const decoded = await decodeDav(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  expect(decoded.datasets['1'].events[0].date).toBe('2026-07-07');
  expect(decoded.datasets['1'].events[0].start).toBe('09:00');
  expect(decoded.datasets['2'].events).toHaveLength(0);
});
