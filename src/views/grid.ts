import { addDays, escapeHtml as esc, formatDate, localToday, minutes } from '../timetable/core.js';
import { exceptionsFor, holidaysFor, state } from '../state.js';
import type { TimetableEvent } from '../timetable/types.js';
import { dayException, holidayBlock, lessonCard } from './templates.js';

const HOUR = 60;
const AXIS_START = 8 * HOUR;
const AXIS_END = 22 * HOUR;
const AXIS_HOURS = (AXIS_END - AXIS_START) / HOUR;
const INSET = 10;

interface Placement {
  left: number;
  width: number;
}

export function renderGrid(events: TimetableEvent[], emptyPanel = ''): string {
  const noDay = !emptyPanel;
  const ruler = Array.from(
    { length: AXIS_HOURS + 1 },
    (_, hour) =>
      `<span style="left:${((hour / AXIS_HOURS) * 100).toFixed(4)}%"${
        hour ? ' class="tick"' : ''
      }>${clock(AXIS_START + hour * HOUR)}</span>`,
  ).join('');
  const lines = Array.from(
    { length: AXIS_HOURS + 1 },
    (_, hour) => `<i style="left:${((hour / AXIS_HOURS) * 100).toFixed(4)}%"></i>`,
  ).join('');
  return `<div class="timetable-grid${emptyPanel ? ' grid-week-empty' : ''}"><div class="grid-times" aria-hidden="true"><span class="grid-corner"></span><div class="grid-ruler">${ruler}</div></div>${Array.from(
    { length: 7 },
    (_, day) => gridDay(addDays(state.week, day), day, events, lines, noDay),
  ).join('')}${emptyPanel ? `<div class="grid-empty">${emptyPanel}</div>` : ''}</div>`;
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / HOUR) % 24).padStart(2, '0')}:${String(minute % HOUR).padStart(2, '0')}`;
}

export function measureGridTracks(): void {
  const tracks = [...document.querySelectorAll<HTMLElement>('.timetable-grid .grid-day-track')];
  if (!tracks.length) return;
  for (const track of tracks) track.style.minHeight = '';
  for (const track of tracks) {
    const needed = Math.max(
      0,
      ...[...track.querySelectorAll<HTMLElement>('.grid-lesson .lesson')].map((card) => card.scrollHeight),
    );
    if (needed > track.clientHeight - INSET) track.style.minHeight = `${needed + INSET}px`;
  }
}

export function initGrid(): void {
  window.addEventListener('resize', () => {
    if (document.querySelector('.timetable-grid')) measureGridTracks();
  });
}

function gridDay(date: string, weekday: number, events: TimetableEvent[], lines: string, noDay: boolean): string {
  const today = localToday();
  const holidays = holidaysFor(date);
  const lessons = holidays.length ? [] : events.filter((event) => event.date === date);
  const exceptions = holidays.length ? [] : exceptionsFor(date);
  const placements = layoutDay(lessons);
  const cards = lessons
    .map((event) => {
      const placement = placements.get(event.id)!;
      return `<div class="grid-lesson" style="left:${placement.left.toFixed(3)}%;width:${placement.width.toFixed(3)}%">${lessonCard(
        event,
        {
          lecturerMode: state.mode === 'lecturer',
          className: state.selected?.name || '',
        },
      )}</div>`;
    })
    .join('');
  return `<section class="grid-day ${weekday > 4 ? 'weekend' : ''}" aria-label="${esc(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}"><h2 class="grid-day-heading ${date === today ? 'current' : ''}"><span>${formatDate(date, { weekday: 'short' }).toUpperCase()}</span><strong>${formatDate(date, { day: 'numeric' })}</strong></h2><div class="grid-day-track">${lines}${holidays.length ? `<div class="grid-holiday">${holidayBlock(holidays)}</div>` : `${exceptions.map(dayException).join('')}${cards || (noDay ? '<p class="no-day"><span></span>No classes</p>' : '')}`}</div></section>`;
}

function layoutDay(lessons: TimetableEvent[]): Map<string, Placement> {
  const span = AXIS_END - AXIS_START;
  const placements = new Map<string, Placement>();
  const sorted = [...lessons].sort(
    (a, b) =>
      minutes(a.start) - minutes(b.start) ||
      minutes(a.end) - minutes(a.start) - (minutes(b.end) - minutes(b.start)) ||
      a.id.localeCompare(b.id),
  );
  const clusters: TimetableEvent[][] = [];
  for (const event of sorted) {
    const cluster = clusters.at(-1);
    if (cluster && minutes(event.start) < Math.max(...cluster.map((item) => minutes(item.end)))) cluster.push(event);
    else clusters.push([event]);
  }
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const columns = new Map<string, number>();
    for (const event of cluster) {
      const start = minutes(event.start);
      let column = columnEnds.findIndex((end) => end <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(minutes(event.end));
      } else columnEnds[column] = minutes(event.end);
      columns.set(event.id, column);
    }
    const cols = Math.max(columnEnds.length, 1);
    for (const event of cluster) {
      const start = minutes(event.start);
      const slot = ((minutes(event.end) - start) / span) * 100;
      const width = slot / cols;
      const left = ((start - AXIS_START) / span) * 100 + columns.get(event.id)! * width;
      placements.set(event.id, { left, width });
    }
  }
  return placements;
}
