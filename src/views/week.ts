import { exceptionsFor, holidaysFor, state } from '../state.js';
import { addDays, escapeHtml as esc, formatDate, localToday, minutes } from '../timetable/core.js';
import type { TimetableEvent } from '../timetable/types.js';
import { elements } from '../ui/elements.js';
import { dayException, holidayBlock, lessonCard, summaryItem } from './templates.js';

export function renderWeek(events: TimetableEvent[]): string {
  const today = localToday();
  return `<div class="week-grid">${Array.from({ length: 7 }, (_, day) => {
    const date = addDays(state.week, day);
    const lessons = events.filter((event) => event.date === date);
    const exceptions = exceptionsFor(date);
    const holidays = holidaysFor(date);
    return `<section class="day-column ${day > 4 ? 'weekend' : ''}" aria-label="${esc(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}"><h2 class="day-heading ${date === today ? 'current' : ''}"><span>${formatDate(date, { weekday: 'short' }).toUpperCase()}</span><strong>${formatDate(date, { day: 'numeric' })}</strong></h2>${holidays.length ? `<div class="day-holiday" data-fill="true">${holidayBlock(holidays)}</div>` : exceptions.map(dayException).join('')}${holidays.length ? '' : lessons.length ? lessons.map(renderWeekCard).join('') : '<p class="no-day"><span></span>No classes</p>'}</section>`;
  }).join('')}</div>`;
}

function renderWeekCard(event: TimetableEvent): string {
  return lessonCard(event, {
    lecturerMode: state.mode === 'lecturer',
    className: state.selected?.name || '',
  });
}

export function renderDayStrip(events: TimetableEvent[]): void {
  elements.dayStrip.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(state.week, i);
    return `<button class="day-tab ${date === state.day ? 'active' : ''} ${date === localToday() ? 'today' : ''}" data-day="${date}" aria-label="${esc(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}" aria-pressed="${date === state.day}"><span>${formatDate(date, { weekday: 'short' })}</span><strong>${formatDate(date, { day: 'numeric' })}</strong><span class="day-marker" style="${events.some((event) => event.date === date) ? '' : 'visibility:hidden'}"></span></button>`;
  }).join('');
}

export function renderSummary(events: TimetableEvent[]): void {
  const hours = events.reduce((sum, event) => sum + minutes(event.end) - minutes(event.start), 0) / 60;
  const rooms = new Set(events.map((event) => event.room).filter(Boolean)).size;
  elements.summary.innerHTML = [
    { value: events.length, label: 'Lessons', icon: 'book' },
    { value: Number(hours.toFixed(1)), label: 'Hours', icon: 'clock' },
    { value: rooms, label: 'Rooms', icon: 'pin' },
  ]
    .map((item) => summaryItem(item.value, item.label, item.icon))
    .join('');
}
