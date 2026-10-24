import { addDays, escapeHtml as esc, formatDate, localToday, monday, validDate } from '../timetable/core.js';
import { academicWeekFor } from '../timetable/academic-calendar.js';
import { media, state } from '../state.js';
import { delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { openDialog } from './shell.js';
import { setWeek } from './navigation.js';

let anchorMonth = '';
let monthMotion: 'next' | 'previous' | '' = '';

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoWeekNumber(date: string): number {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(value.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((value.getTime() - firstThursday.getTime()) / 604800000);
}

function renderMonths(): void {
  const manifest = state.manifest;
  const first = `${anchorMonth}-01`;
  const gridStart = monday(first);
  const weekEnd = addDays(state.week, 6);
  const today = localToday();
  elements.weekPickerTitle.textContent = formatDate(first, { month: 'long', year: 'numeric' });
  elements.weekMonthPrev.disabled = !manifest || `${shiftMonth(anchorMonth, -1)}-01` < manifest.planningStart;
  elements.weekMonthNext.disabled = !manifest || `${shiftMonth(anchorMonth, 1)}-01` > manifest.planningEnd;
  const rows = Array.from({ length: 6 }, (_, rowIndex) => {
    const rowStart = addDays(gridStart, rowIndex * 7);
    const info = academicWeekFor(rowStart);
    const label = info?.label ?? `W${isoWeekNumber(rowStart)}`;
    const kindClass = info && info.kind !== 'tw' ? ` week-row--${info.kind}` : '';
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(rowStart, dayIndex);
      const outside = date.slice(0, 7) !== anchorMonth;
      const disabled = !manifest || date < manifest.planningStart || date > manifest.planningEnd;
      const selected = date >= state.week && date <= weekEnd;
      const classes = `week-day${outside ? ' outside' : ''}${selected ? ' selected' : ''}${date === today ? ' today' : ''}`;
      return `<button type="button" class="${classes}" data-date="${date}"${disabled ? ' disabled' : ''}${selected ? ' aria-current="date"' : ''} aria-label="${esc(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${selected ? ', current week' : ''}">${date.slice(8)}</button>`;
    }).join('');
    return `<div class="week-row${kindClass}"><span class="week-number" aria-hidden="true">${esc(label)}</span>${days}</div>`;
  }).join('');
  elements.weekDays.innerHTML = rows;
  elements.weekDays.classList.remove('month-slide-next', 'month-slide-previous');
  if (monthMotion) {
    void elements.weekDays.offsetWidth;
    elements.weekDays.classList.add(`month-slide-${monthMotion}`);
    monthMotion = '';
  }
  elements.weekJumpToday.disabled = Boolean(
    manifest && (today < manifest.planningStart || today > manifest.planningEnd),
  );
  const selectedWeek = academicWeekFor(state.week);
  elements.weekPickerHint.textContent = `Selected: ${selectedWeek?.label ?? `W${isoWeekNumber(state.week)}`}`;
}

export function openWeekPicker(): void {
  if (!state.manifest) return;
  monthMotion = '';
  anchorMonth = state.day.slice(0, 7);
  renderMonths();
  elements.weekPicker.scrollTop = 0;
  openDialog(elements.weekPicker);
}

export function initWeekPicker(): void {
  const canShiftMonth = (delta: number): boolean => {
    if (!state.manifest) return false;
    const first = `${shiftMonth(anchorMonth, delta)}-01`;
    return delta < 0 ? first >= state.manifest.planningStart : first <= state.manifest.planningEnd;
  };
  let swipeStart: { x: number; y: number } | null = null;
  on<HTMLDialogElement, TouchEvent>(
    elements.weekPicker,
    'touchstart',
    (event) => {
      if (!media.matches || event.touches.length !== 1) {
        swipeStart = null;
        return;
      }
      swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    },
    { passive: true },
  );
  on<HTMLDialogElement, TouchEvent>(
    elements.weekPicker,
    'touchend',
    (event) => {
      const start = swipeStart;
      swipeStart = null;
      if (!media.matches || !start) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
      const delta = dx > 0 ? 1 : -1;
      if (!canShiftMonth(delta)) return;
      monthMotion = delta > 0 ? 'next' : 'previous';
      anchorMonth = shiftMonth(anchorMonth, delta);
      renderMonths();
    },
    { passive: true },
  );
  on(elements.weekPicker, 'touchcancel', () => {
    swipeStart = null;
  });
  on(elements.weekOpen, 'click', openWeekPicker);
  on(elements.weekDays, 'animationend', () => {
    elements.weekDays.classList.remove('month-slide-next', 'month-slide-previous');
  });
  on(elements.weekMonthPrev, 'click', () => {
    monthMotion = 'previous';
    anchorMonth = shiftMonth(anchorMonth, -1);
    renderMonths();
  });
  on(elements.weekMonthNext, 'click', () => {
    monthMotion = 'next';
    anchorMonth = shiftMonth(anchorMonth, 1);
    renderMonths();
  });
  on(elements.weekJumpToday, 'click', () => {
    setWeek(localToday());
    elements.weekPicker.close();
  });
  delegate<HTMLElement>(elements.weekDays, '[data-date]', 'click', (button) => {
    const date = button.dataset.date || '';
    if (!validDate(date)) return;
    setWeek(date, date);
    elements.weekPicker.close();
  });
}
