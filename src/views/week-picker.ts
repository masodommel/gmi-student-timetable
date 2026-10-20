import { addDays, escapeHtml as esc, formatDate, localToday, monday, validDate, weekLabel } from '../timetable/core.js';
import { state } from '../state.js';
import { delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { openDialog } from './shell.js';
import { setWeek } from './navigation.js';

let anchorMonth = '';

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
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
  elements.weekDays.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const outside = date.slice(0, 7) !== anchorMonth;
    const disabled = !manifest || date < manifest.planningStart || date > manifest.planningEnd;
    const selected = date >= state.week && date <= weekEnd;
    const classes = `week-day${outside ? ' outside' : ''}${selected ? ' selected' : ''}${date === today ? ' today' : ''}`;
    return `<button type="button" class="${classes}" data-date="${date}"${disabled ? ' disabled' : ''}${selected ? ' aria-current="date"' : ''} aria-label="${esc(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${selected ? ', current week' : ''}">${date.slice(8)}</button>`;
  }).join('');
  elements.weekJumpToday.disabled = Boolean(
    manifest && (today < manifest.planningStart || today > manifest.planningEnd),
  );
  elements.weekPickerHint.textContent = `Selected: ${weekLabel(state.week)}`;
}

export function openWeekPicker(): void {
  if (!state.manifest) return;
  anchorMonth = state.day.slice(0, 7);
  renderMonths();
  elements.weekPicker.scrollTop = 0;
  openDialog(elements.weekPicker);
}

export function initWeekPicker(): void {
  on(elements.weekOpen, 'click', openWeekPicker);
  on(elements.weekMonthPrev, 'click', () => {
    anchorMonth = shiftMonth(anchorMonth, -1);
    renderMonths();
  });
  on(elements.weekMonthNext, 'click', () => {
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
