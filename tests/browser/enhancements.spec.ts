import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeDavFixture } from '../dav-fixture.js';
import { decodeDav } from '../../src/dav/index.js';
import { readManifest, revisionLabel } from './manifest.js';
import { openSettings } from './qa-helpers.js';

test('lecturer timetable includes multiple classes and exports its own calendar and share URL', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await page.locator('#class-button').click();
  await page.locator('#lecturer-mode').click();
  await expect(page.getByRole('heading', { name: 'Find a Lecturer' })).toBeVisible();
  await expect(page.locator('#class-button')).toHaveAttribute('data-mode', 'lecturer');
  await expect(page.locator('#class-name')).toHaveText('Lecturer');
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
test('mobile source status sits inside the browse bar without the book icon', async ({ page }) => {
  const manifest = await readManifest();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('#mobile-revision-label')).toHaveText(revisionLabel(manifest));
  const browse = (await page.locator('#compact-class-button').boundingBox())!;
  const revision = (await page.locator('#mobile-revision').boundingBox())!;
  expect(revision.y).toBeGreaterThanOrEqual(browse.y);
  expect(revision.y + revision.height).toBeLessThanOrEqual(browse.y + browse.height);
  await expect(page.locator('.mobile-source-group')).toHaveCSS('display', 'flex');
});
test('desktop date area keeps the week controls fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('.lesson').first()).toBeVisible();
  const position = async () => ({
    previous: (await page.locator('#previous-week').boundingBox())!,
    date: (await page.locator('#week-label').boundingBox())!,
    next: (await page.locator('#next-week').boundingBox())!,
    today: (await page.locator('#today-button').boundingBox())!,
  });
  const before = await position();
  expect(before.date.width).toBe(190);
  expect(before.date.x).toBeGreaterThanOrEqual(before.previous.x + before.previous.width);
  expect(before.date.x + before.date.width).toBeLessThanOrEqual(before.next.x);
  await page.locator('#next-week').click();
  await expect(page.locator('#week-label')).toHaveText('26 Oct – 1 Nov 2026');
  const after = await position();
  expect(after.previous.x).toBe(before.previous.x);
  expect(after.next.x).toBe(before.next.x);
  expect(after.today.x).toBe(before.today.x);
  expect(after.date.width).toBe(before.date.width);
});
test('cookie notice opens the privacy policy', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('.site-footer')).toContainText('Cookie notice.');
  await page.locator('#privacy-button').click();
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.locator('#privacy-dialog')).toContainText('gmi-theme');
  await page.keyboard.press('Escape');
  await expect(page.locator('#privacy-dialog')).not.toBeVisible();
});
test('week date stays between its arrows and mobile swipes step through days', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./?class=99178435&week=2026-10-19');
  await expect(page.locator('.agenda-list')).toBeVisible();
  await page.locator('[data-day="2026-10-20"]').click();
  await expect(page.locator('#today-button')).toHaveText('Today');
  await expect(page.locator('#week-label')).toHaveText('19 – 25 Oct 2026');
  const label = (await page.locator('#week-label').boundingBox())!,
    previous = (await page.locator('#previous-week').boundingBox())!,
    next = (await page.locator('#next-week').boundingBox())!;
  expect(label.x).toBeGreaterThanOrEqual(previous.x + previous.width);
  expect(label.x + label.width).toBeLessThanOrEqual(next.x);
  const fit = await page.locator('#week-label').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clipped: element.scrollWidth > element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      fontSize: Number.parseFloat(style.fontSize),
      height: element.getBoundingClientRect().height,
    };
  });
  expect(fit.clipped).toBe(false);
  expect(fit.height).toBeLessThanOrEqual(fit.fontSize * 1.6);
  const swipe = (from: number, to: number) =>
    page.evaluate(
      ({ from, to }) => {
        const target = document.querySelector('#schedule')!;
        const touch = (x: number) =>
          new Touch({
            identifier: 1,
            target,
            clientX: x,
            clientY: 320,
            pageX: x,
            pageY: 320,
            screenX: x,
            screenY: 320,
            radiusX: 1,
            radiusY: 1,
            rotationAngle: 0,
            force: 1,
          });
        const start = touch(from);
        const end = touch(to);
        target.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [start],
            targetTouches: [start],
            changedTouches: [start],
          }),
        );
        target.dispatchEvent(
          new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [end],
          }),
        );
      },
      { from, to },
    );
  await swipe(100, 220);
  await expect(page.locator('[data-day="2026-10-19"]')).toHaveAttribute('aria-pressed', 'true');
  await swipe(220, 100);
  await expect(page.locator('[data-day="2026-10-20"]')).toHaveAttribute('aria-pressed', 'true');
});

test('accessibility preferences persist, dialogs return focus and mobile layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./?class=99178435&week=2026-10-12');
  await openSettings(page, 'Accessibility preferences');
  for (const id of ['large-text', 'high-contrast', 'reduce-motion', 'agenda-default'])
    await page.locator('#' + id).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-button')).toBeFocused();
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
  await openSettings(page, 'Open timetable file');
  const fixture = makeDavFixture({ exceptionRange: [1, 2] });
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
