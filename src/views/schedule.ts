import { media, state } from '../state.js';
import { addDays, escapeHtml as esc, filterEvents, formatDate, weekLabel } from '../timetable/core.js';
import { elements } from '../ui/elements.js';
import { statePanel } from './templates.js';
import { renderAgenda } from './agenda.js';
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
    schedule.innerHTML = statePanel(
      'Your timetable starts here',
      state.mode === 'lecturer'
        ? 'Choose a lecturer to see lessons across all classes and export their calendar.'
        : 'Pick your class to see your week. Or download its calendar and use the calendar app you already love.',
      'choose-class',
      state.mode === 'lecturer' ? 'Find a lecturer' : 'Find my class',
    );
    return;
  }
  const allWeek = filterEvents(state.events, state.week);
  const events = filterEvents(state.events, state.week, state.query);
  renderSummary(allWeek);
  renderDayStrip(events);
  elements.scheduleContext.textContent = `${events.length} ${events.length === 1 ? 'entry' : 'entries'} · ${media.matches ? formatDate(state.day, { weekday: 'long', day: 'numeric', month: 'short' }) : weekLabel(state.week)}${state.query ? ' matching your search' : ' on your schedule'}`;
  if (!events.length && !media.matches) {
    const next = state.events.find((event) => event.date > addDays(state.week, 6));
    schedule.innerHTML = statePanel(
      state.query ? 'Nothing matches that search' : 'No classes listed this week',
      state.query
        ? 'Try a different subject, room or lecturer.'
        : next
          ? `Your next scheduled entry is ${esc(formatDate(next.date, { day: 'numeric', month: 'long' }))}.`
          : selected.eventCount
            ? 'There are no more dated entries in this source. You can view an earlier week or download the full class calendar.'
            : 'This class has no dated entries in the recovered source. Choose another class or check with your lecturer.',
      state.query ? 'clear-search' : next ? 'next-scheduled' : 'choose-class',
      state.query ? 'Clear search' : next ? 'Go to next class' : 'Choose another class',
    );
    return;
  }
  schedule.innerHTML = media.matches || state.view === 'agenda' ? renderAgenda(events) : renderWeek(events);
}
