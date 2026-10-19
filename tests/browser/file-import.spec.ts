import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeDavFixture } from '../dav-fixture.js';

test('a local DAV file replaces the schedule and exports only its selected class without uploading', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Find my class' }).waitFor();
  const requests: { method: string; url: string; body: string | null }[] = [];
  page.on('request', (request) =>
    requests.push({ method: request.method(), url: request.url(), body: request.postData() }),
  );
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  await page.locator('#file-input').setInputFiles({
    name: 'new-semester.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture()),
  });
  await expect(page.locator('#class-dialog')).toBeVisible();
  await expect(page.locator('.class-option')).toHaveCount(2);
  await page.locator('[data-class-id="1"]').click();
  await expect(page.locator('#file-source-label')).toContainText('new-semester.dav');
  await page.locator('#week-date').fill('2026-07-06');
  await expect(page.locator('.lesson').first()).toContainText('Mathematics');
  await expect(page.locator('#share-button')).toBeDisabled();
  await page.locator('.rail .export-trigger').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#calendar-download').click();
  const calendar = await readFile(await (await downloaded).path(), 'utf8');
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(calendar).toContain('CLASS A - Mathematics');
  expect(calendar).not.toContain('CLASS B');
  expect(requests.every((request) => request.method === 'GET' && !request.body)).toBe(true);
  expect(requests.some((request) => request.url.endsWith('/data/1.json'))).toBe(false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Use provided timetable', exact: true }).click();
  await expect(page.locator('#file-source-label')).toHaveText('Using the provided timetable');
  await page.getByRole('button', { name: 'Find my class' }).click();
  await expect(page.locator('.class-option')).toHaveCount(178);
});

test('an unsupported file keeps the existing timetable and offers a clear error', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-10-12');
  await expect(page.locator('.lesson').first()).toBeVisible();
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  await page.locator('#file-input').setInputFiles({
    name: 'unsupported.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a timetable'),
  });
  await expect(page.locator('#file-error')).toContainText('layout');
  await page.keyboard.press('Escape');
  await expect(page.locator('#class-name')).toHaveText('SEM 3 - DMCH 1');
  await expect(page.locator('.lesson').first()).toBeVisible();
});

test('file import and local class calendars work on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'phone.dav', mimeType: 'application/octet-stream', buffer: Buffer.from(makeDavFixture()) });
  await expect(page.locator('#class-dialog')).toBeVisible();
  await page.locator('[data-class-id="1"]').click();
  await page.locator('#week-date').fill('2026-07-06');
  await page.locator('[data-day="2026-07-06"]').click();
  await expect(page.locator('.lesson').first()).toContainText('Mathematics');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.mobile-export .export-trigger').click();
  await expect(page.locator('#calendar-download')).toBeVisible();
});

test('cancelling a file import does not interfere with the next file', async ({ page }) => {
  let delay = true;
  await page.route('**/dav/worker.js', async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await route.continue();
    } catch {}
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  await page.locator('#file-input').setInputFiles({
    name: 'cancelled.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture()),
  });
  await expect(page.locator('#file-progress')).toBeVisible();
  await page.keyboard.press('Escape');
  delay = false;
  await page.getByRole('button', { name: 'Open timetable file' }).click();
  await page.locator('#file-input').setInputFiles({
    name: 'replacement.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture({ className: 'REPLACEMENT CLASS' })),
  });
  await expect(page.locator('#class-dialog')).toBeVisible();
  await expect(page.locator('#class-results')).toContainText('REPLACEMENT CLASS');
});
