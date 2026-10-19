import { addDays, clampWeek, localToday, validDate } from '../timetable/core.js';
import { state, updateUrl } from '../state.js';
import { delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { render } from './shell.js';

export function setWeek(date: string, preferredDay?: string): void {
  if (!state.manifest || !validDate(date)) return;
  const previousDayOffset = Math.max(
    0,
    Math.min(6, Math.round((Date.parse(state.day) - Date.parse(state.week)) / 86400000)),
  );
  state.week = clampWeek(date, state.manifest.planningStart, state.manifest.planningEnd);
  const today = localToday();
  state.day =
    preferredDay ??
    (today >= state.week && today <= addDays(state.week, 6) ? today : addDays(state.week, previousDayOffset));
  updateUrl();
  render();
}

export function initNavigation(): void {
  on(elements.previousWeek, 'click', () => setWeek(addDays(state.week, -7)));
  on(elements.nextWeek, 'click', () => setWeek(addDays(state.week, 7)));
  on(elements.todayButton, 'click', () => setWeek(localToday()));
  on(elements.weekDate, 'change', () => setWeek(elements.weekDate.value));
  on(elements.weekView, 'click', () => {
    state.view = 'week';
    render();
  });
  on(elements.agendaView, 'click', () => {
    state.view = 'agenda';
    render();
  });
  on(elements.subjectSearch, 'input', () => {
    state.query = elements.subjectSearch.value;
    render();
  });
  delegate<HTMLElement>(elements.dayStrip, '[data-day]', 'click', (button) => {
    state.day = button.dataset.day || state.day;
    render();
  });
}
