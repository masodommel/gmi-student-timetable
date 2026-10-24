import { holidaysFor, media, state } from '../state.js';
import { addDays, escapeHtml as esc, filterEvents, formatDate } from '../timetable/core.js';
import type { TimetableEvent } from '../timetable/types.js';
import { elements } from '../ui/elements.js';
import { choicePanel, statePanel } from './templates.js';
import { renderAgenda } from './agenda.js';
import { renderGrid, measureGridTracks } from './grid.js';
import { renderDayStrip, renderSummary, renderWeek } from './week.js';

export function renderSchedule(): void {
  const schedule = elements.schedule;
  const ready = Boolean(state.manifest);
  const selected = state.selected;
  schedule.setAttribute('aria-busy', state.loading || !ready ? 'true' : 'false');
  if (state.error) {
    schedule.setAttribute('aria-busy', 'false');
    schedule.innerHTML = statePanel('Let’s try that again', esc(state.error), 'retry', 'Retry', 'info');
    return;
  }
  if (state.loading || !ready) {
    schedule.innerHTML = `<div class="state-panel"><span class="loading-spinner"></span><h2>${selected ? 'Loading your class' : 'Getting your planner ready'}</h2><p>${selected ? 'Just your timetable, nothing else.' : 'Loading the available classes…'}</p></div>`;
    return;
  }
  if (!selected) {
    schedule.innerHTML = choicePanel('choose-class', state.mode === 'lecturer' ? 'Find a lecturer' : 'Find my class');
    return;
  }
  const allWeek = filterEvents(state.events, state.week);
  const events = filterEvents(state.events, state.week, state.query);
  const holidayWeek = Array.from({ length: 7 }, (_, day) => holidaysFor(addDays(state.week, day))).flat().length > 0;
  renderSummary(allWeek);
  renderDayStrip(events);
  const emptyPanel = emptyPanelFor(events, holidayWeek);
  if (emptyPanel && state.view !== 'grid') {
    schedule.innerHTML = emptyPanel;
    return;
  }
  schedule.innerHTML =
    media.matches || state.view === 'agenda'
      ? renderAgenda(events)
      : state.view === 'grid'
        ? renderGrid(events, emptyPanel)
        : renderWeek(events);
  if (state.view === 'grid') measureGridTracks();
}

function emptyPanelFor(events: TimetableEvent[], holidayWeek: boolean): string {
  if (events.length || media.matches || (!state.query && holidayWeek)) return '';
  const next = state.events.find((event) => event.date > addDays(state.week, 6))?.date;
  return statePanel(
    state.query ? 'Nothing matches that search' : 'No classes listed this week',
    state.query
      ? 'Try a different subject, room or lecturer.'
      : next
        ? `Your next scheduled entry is ${esc(formatDate(next, { day: 'numeric', month: 'long' }))}.`
        : state.selected?.eventCount
          ? 'There are no more dated entries in this source. You can view an earlier week or download the full class calendar.'
          : 'This class has no dated entries in the recovered source. Choose another class or check with your lecturer.',
    state.query ? 'clear-search' : next ? 'next-scheduled' : 'choose-class',
    state.query ? 'Clear search' : next ? 'Go to next class' : 'Choose another class',
  );
}
