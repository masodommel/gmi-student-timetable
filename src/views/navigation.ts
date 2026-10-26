import { addDays, clampWeek, localToday, validDate } from '../timetable/core.js';
import { media, state, updateUrl, type View } from '../state.js';
import { delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { storeView } from './view-mode.js';
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
  let swipeStart: { x: number; y: number } | null = null;
  const stepDay = (offset: number): void => {
    if (!state.manifest) return;
    const date = addDays(state.day, offset);
    if (date < state.manifest.planningStart || date > state.manifest.planningEnd) return;
    setWeek(date, date);
  };
  const pointerActivated = new WeakSet<HTMLButtonElement>();
  const feedbackTimers = new WeakMap<HTMLButtonElement, number>();
  const pulseWeekStep = (button: HTMLButtonElement): void => {
    if (!media.matches) return;
    clearTimeout(feedbackTimers.get(button));
    button.classList.remove('week-step-tap');
    void button.offsetWidth;
    button.classList.add('week-step-tap');
    feedbackTimers.set(
      button,
      window.setTimeout(() => {
        button.classList.remove('week-step-tap');
        feedbackTimers.delete(button);
      }, 320),
    );
  };
  const clearPointerFocus = (button: HTMLButtonElement, event: MouseEvent): void => {
    if (event.detail === 0 && !pointerActivated.has(button)) return;
    pointerActivated.delete(button);
    requestAnimationFrame(() => button.blur());
  };
  for (const [button, offset] of [
    [elements.previousWeek, -7],
    [elements.nextWeek, 7],
  ] as const) {
    on(button, 'pointerdown', () => pointerActivated.add(button), { passive: true });
    on<HTMLButtonElement, MouseEvent>(button, 'click', (event) => {
      pulseWeekStep(button);
      setWeek(addDays(state.week, offset));
      clearPointerFocus(button, event);
    });
  }
  on(elements.todayButton, 'click', () => setWeek(localToday()));
  on(elements.weekDate, 'change', () => setWeek(elements.weekDate.value));
  const setView = (view: View): void => {
    state.view = view;
    storeView(view);
    render();
  };
  on(elements.gridView, 'click', () => setView('grid'));
  on(elements.weekView, 'click', () => setView('week'));
  on(elements.agendaView, 'click', () => setView('agenda'));
  on(elements.subjectSearch, 'input', () => {
    state.query = elements.subjectSearch.value;
    render();
  });
  on<HTMLElement, TouchEvent>(
    elements.schedule,
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
  on<HTMLElement, TouchEvent>(
    elements.schedule,
    'touchend',
    (event) => {
      const start = swipeStart;
      swipeStart = null;
      if (!media.matches || !start) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const x = touch.clientX - start.x;
      const y = touch.clientY - start.y;
      if (Math.abs(x) < 48 || Math.abs(x) <= Math.abs(y)) return;
      stepDay(x > 0 ? -1 : 1);
    },
    { passive: true },
  );
  on(elements.schedule, 'touchcancel', () => {
    swipeStart = null;
  });
  delegate<HTMLElement>(elements.dayStrip, '[data-day]', 'click', (button) => {
    state.day = button.dataset.day || state.day;
    render();
  });
}
