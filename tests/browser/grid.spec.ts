import { test, expect } from '@playwright/test';
import { makeDavFixture } from '../dav-fixture.js';
import { openSettings } from './qa-helpers.js';

const selectedUrl = '?class=99178435&week=2026-10-12';

test('desktop defaults to the grid view and persists the chosen view in a cookie', async ({ page }) => {
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.timetable-grid')).toBeVisible();
  await expect(page.locator('.grid-day')).toHaveCount(7);
  await expect(page.locator('#grid-view')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.grid-ruler span').first()).toContainText('08:00');
  await expect(page.locator('.grid-ruler span').last()).toContainText('22:00');
  await expect(page.locator('.grid-ruler span')).toHaveCount(15);
  await page.locator('#agenda-view').click();
  await expect(page.locator('.agenda-list')).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'gmi-view')?.value).toBe('agenda');
  await page.reload();
  await expect(page.locator('.agenda-list')).toBeVisible();
  await page.locator('#week-view').click();
  await expect(page.locator('.week-grid')).toBeVisible();
});

test('the class panel can be hidden and restored', async ({ page }) => {
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.rail')).toBeVisible();
  await page.locator('#rail-toggle').click();
  await expect(page.locator('.rail')).toBeHidden();
  await expect(page.locator('#rail-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.context().cookies()).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'gmi-rail', value: 'hidden' })]),
  );
  await page.reload();
  await expect(page.locator('.rail')).toBeHidden();
  await page.locator('#rail-toggle').click();
  await expect(page.locator('.rail')).toBeVisible();
  expect(await page.context().cookies()).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'gmi-rail', value: 'visible' })]),
  );
  await page.reload();
  await expect(page.locator('.rail')).toBeVisible();
  await expect(page.locator('.timetable-grid')).toBeVisible();
  await page.setViewportSize({ width: 820, height: 800 });
  await expect(page.locator('.rail')).toBeVisible();
  const narrowRail = (await page.locator('.rail').boundingBox())!;
  expect(narrowRail.width).toBeGreaterThan(140);
  expect(narrowRail.width).toBeLessThan(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rail')).toBeHidden();
  await expect(page.locator('#rail-open')).toBeVisible();
  await expect(page.locator('#rail-toggle')).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 810 });
  await expect(page.locator('#rail-open')).toBeHidden();
  await expect(page.locator('.rail')).toBeVisible();
});

test('grid cards reveal the lecturer and lesson note without being clipped', async ({ page }) => {
  await page.goto('./');
  await openSettings(page, 'Open timetable file');
  await page.locator('#file-input').setInputFiles({
    name: 'notes.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture({ exceptionRange: [1, 2] })),
  });
  await page.locator('[data-class-id="1"]').click();
  await page.locator('#week-date').fill('2026-07-06');
  await expect(page.locator('.timetable-grid')).toBeVisible();
  const card = page.locator('.grid-day').first().locator('.grid-lesson .lesson').first();
  await expect(card.locator('.lesson-meta').filter({ hasText: 'Example lecturer' })).toBeVisible();
  await expect(card.locator('.lesson-note')).toContainText('From the new file');
  const boxes = await page.evaluate(() => {
    const card = document.querySelector('.grid-lesson .lesson')!;
    const note = card.querySelector('.lesson-note')!;
    const cardBox = card.getBoundingClientRect();
    const noteBox = note.getBoundingClientRect();
    return { cardHeight: cardBox.height, noteBottom: noteBox.bottom - cardBox.top, noteHeight: noteBox.height };
  });
  expect(boxes.noteHeight).toBeGreaterThan(0);
  expect(boxes.noteBottom).toBeLessThanOrEqual(boxes.cardHeight + 1);
});

test('grid cards follow the time axis inside each day track', async ({ page }) => {
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.grid-lesson').first()).toBeVisible();
  const metrics = await page.evaluate(() => {
    for (const card of document.querySelectorAll<HTMLElement>('.grid-lesson')) {
      const track = card.parentElement as HTMLElement;
      if (card.offsetLeft < 0 || card.offsetLeft + card.offsetWidth > track.offsetWidth) return false;
    }
    return true;
  });
  expect(metrics).toBe(true);
  expect(await page.locator('.grid-lesson').count()).toBeGreaterThan(3);
  const rulerFit = await page.evaluate(() => {
    const ruler = document.querySelector<HTMLElement>('.grid-ruler')!;
    const last = ruler.lastElementChild as HTMLElement;
    return last.getBoundingClientRect().right <= ruler.getBoundingClientRect().right + 0.5;
  });
  expect(rulerFit).toBe(true);
});

test('the grid scrolls its tracks instead of overflowing the viewport on narrow windows', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 800 });
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.timetable-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('mobile keeps the agenda and never writes a view cookie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./' + selectedUrl);
  await expect(page.locator('.agenda-list')).toBeVisible();
  await expect(page.locator('.view-switch')).toBeHidden();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'gmi-view')).toBeUndefined();
});

test('mobile week arrows show tap feedback without leaving a sticky highlight', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./' + selectedUrl);
  const nextWeek = page.locator('#next-week');
  const before = await nextWeek.evaluate((button) => getComputedStyle(button).backgroundColor);
  const feedback = await nextWeek.evaluate(async (element) => {
    const button = element as HTMLButtonElement;
    button.click();
    await new Promise(requestAnimationFrame);
    return {
      className: button.className,
      background: getComputedStyle(button).backgroundColor,
      animations: button.getAnimations().map((item) => (item as CSSAnimation).animationName),
    };
  });
  expect(feedback.className).toContain('week-step-tap');
  expect(feedback.background).not.toBe(before);
  expect(feedback.animations).toContain('week-step-tap');
  await expect(nextWeek).not.toHaveClass(/week-step-tap/);
  await expect(nextWeek).toHaveCSS('background-color', before);
});

test('week view aligns the first class card with the holiday card', async ({ page }) => {
  await page.goto('./?class=112094645&week=2026-10-26');
  await page.locator('#week-view').click();
  const holiday = (await page.locator('.day-holiday .holiday-block').boundingBox())!;
  const firstCard = (await page.locator('.day-column').nth(1).locator('.lesson').first().boundingBox())!;
  expect(Math.abs(holiday.y - firstCard.y)).toBeLessThan(1);
});

test('all-day holidays overwrite the lessons in the grid, week and agenda views', async ({ page }) => {
  await page.goto('./');
  await openSettings(page, 'Open timetable file');
  await page.locator('#file-input').setInputFiles({
    name: 'holiday.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture()),
  });
  await page.locator('[data-class-id="1"]').click();
  await page.locator('#week-date').fill('2026-07-06');
  const monday = page.locator('.grid-day').first();
  await expect(monday.locator('.grid-holiday')).toContainText('Campus holiday');
  await expect(monday.locator('.grid-lesson')).toHaveCount(0);
  await page.locator('#week-view').click();
  const column = page.locator('.day-column').first();
  await expect(column.locator('.day-holiday')).toContainText('Campus holiday');
  await expect(column.locator('.day-holiday')).toHaveAttribute('data-fill', 'true');
  await expect(column.locator('.lesson')).toHaveCount(0);
  await page.locator('#agenda-view').click();
  const agendaDay = page.locator('.agenda-day').first();
  await expect(agendaDay.locator('.holiday-block')).toContainText('Campus holiday');
  await expect(agendaDay.locator('.agenda-events')).toHaveCount(0);
});

test('partial-day exceptions keep the compact chip rendering', async ({ page }) => {
  await page.goto('./');
  await openSettings(page, 'Open timetable file');
  await page.locator('#file-input').setInputFiles({
    name: 'assembly.dav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(makeDavFixture({ exceptionRange: [1, 2] })),
  });
  await page.locator('[data-class-id="1"]').click();
  await page.locator('#week-date').fill('2026-07-06');
  await expect(page.locator('.grid-holiday')).toHaveCount(0);
  await expect(page.locator('.day-exception')).toContainText('Campus holiday');
  await page.locator('.grid-lesson .lesson').first().click();
  await expect(page.locator('#lesson-dialog')).toBeVisible();
  await expect(page.locator('#lesson-content')).toContainText('KUALA LUMPUR');
});

test('published holiday weeks show holiday rows even without lessons', async ({ page }) => {
  await page.goto('./?class=99178435&week=2026-12-21');
  await expect(page.locator('.grid-holiday').filter({ hasText: 'Christmas Day' })).toHaveCount(2);
  await page.locator('#week-view').click();
  await expect(page.locator('.day-holiday').filter({ hasText: 'Christmas Day' })).toHaveCount(2);
  await page.locator('#agenda-view').click();
  await expect(page.locator('.holiday-block').filter({ hasText: 'Christmas Day' })).toHaveCount(2);
});

test('an empty week keeps the grid and holds the empty state inside it', async ({ page }) => {
  await page.goto('./?class=99178435&week=2027-01-25');
  await expect(page.locator('.timetable-grid')).toBeVisible();
  await expect(page.locator('.grid-day')).toHaveCount(7);
  await expect(page.locator('.grid-day .lesson')).toHaveCount(0);
  await expect(page.locator('.grid-empty .state-panel')).toContainText('No classes listed this week');
  const blurred = await page.evaluate(
    () => getComputedStyle(document.querySelector('.grid-week-empty .grid-day')!).filter,
  );
  expect(blurred).toContain('blur');
  const panel = (await page.locator('.grid-empty .state-panel').boundingBox())!;
  const grid = (await page.locator('.timetable-grid').boundingBox())!;
  expect(Math.abs(panel.x + panel.width / 2 - (grid.x + grid.width / 2))).toBeLessThan(2);
  await page.getByRole('button', { name: 'Choose another class' }).click();
  await expect(page.locator('#class-dialog')).toBeVisible();
});
