import { addDays, formatDate, localToday } from '../timetable/core.js';
import { icon } from '../ui/icons.js';
import { media, exceptionsFor, state } from '../state.js';
import type { TimetableEvent } from '../timetable/types.js';
import { dayException, lessonCard } from './templates.js';

export function renderAgenda(events: TimetableEvent[]): string {
  const dates = media.matches ? [state.day] : Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
  return `<div class="agenda-list">${dates
    .map((date) => {
      const lessons = events.filter((event) => event.date === date);
      const exceptions = exceptionsFor(date);
      if (!lessons.length && !exceptions.length && !media.matches) return '';
      return `<section class="agenda-day"><div class="agenda-day-heading"><h2>${formatDate(date, { weekday: 'long' })}<span>${formatDate(date, { day: 'numeric', month: 'long' })}</span></h2>${date === localToday() ? '<span class="badge">Today</span>' : ''}</div>${exceptions.map(dayException).join('')}${lessons.length ? `<div class="agenda-events">${lessons.map(renderAgendaCard).join('')}</div>` : `<div class="state-panel"><div class="state-illustration">${icon('calendar')}</div><h2>${state.query ? 'No matching lessons' : 'A little breathing room'}</h2><p>${state.query ? 'Try a different subject, room or lecturer.' : 'No class entries are listed for this day. Choose another day above.'}</p>${state.query ? '<button class="button secondary" data-action="clear-search">Clear search</button>' : ''}</div>`}</section>`;
    })
    .join('')}</div>`;
}

function renderAgendaCard(event: TimetableEvent): string {
  return lessonCard(event, {
    lecturerMode: state.mode === 'lecturer',
    className: state.selected?.name || '',
  });
}
