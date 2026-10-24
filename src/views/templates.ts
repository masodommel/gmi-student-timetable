import { escapeHtml as esc, formatDate } from '../timetable/core.js';
import { sourceSaysOnline } from '../timetable/notes.js';
import type { DavStaff } from '../dav/index.js';
import type { ClassRecord, SearchResult, TimetableEvent } from '../timetable/types.js';
import { icon } from '../ui/icons.js';

export function statePanel(
  title: string,
  description: string,
  action?: string,
  actionLabel?: string,
  fallbackImage = 'calendar',
): string {
  const image = action === 'class' ? 'palette' : fallbackImage;
  return `<div class="state-panel"><div class="state-illustration">${icon(image)}</div><h2>${title}</h2><p>${description}</p>${action ? `<button class="button primary" data-action="${action}">${actionLabel}${icon('chevron')}</button>` : ''}</div>`;
}

export function summaryItem(value: number | string, label: string, symbol: string): string {
  return `<div class="summary-item"><span class="summary-icon">${icon(symbol)}</span><span class="summary-copy"><strong>${value}</strong><span class="summary-label">${label}</span></span></div>`;
}

export function choicePanel(action: string, label: string): string {
  return `<div class="state-panel choice-panel"><button class="button primary" data-action="${action}">${label}${icon('chevron')}</button></div>`;
}

export function dayException(name: string): string {
  return `<span class="day-exception">${esc(name)}</span>`;
}

export function holidayBlock(names: string[]): string {
  return `<div class="holiday-block"><span class="badge amber">Holiday</span><strong>${esc(names.join(' · '))}</strong></div>`;
}

export interface LessonCardOptions {
  lecturerMode: boolean;
  className: string;
}

export function lessonCard(event: TimetableEvent, options: LessonCardOptions): string {
  const tone = event.subject.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  const online = sourceSaysOnline(event);
  return `<button class="lesson ${tone === 1 ? 'alt' : tone === 2 ? 'warm' : ''}" data-event-id="${event.id}" aria-label="${esc(event.subject)}, ${esc(event.start)} to ${esc(event.end)}, ${esc(event.room || 'room not listed')}, ${esc(event.date)}, ${esc(event.className || options.className)}${event.exception ? ' calendar exception' : ''}${event.overlap ? ' overlapping entry' : ''}${online ? ', online source note' : ''}"><span class="lesson-time">${icon('clock')}${esc(event.start)} – ${esc(event.end)}${online ? '<span class="badge mode-badge">Online</span>' : ''}</span><h3>${esc(event.subject)}</h3>${options.lecturerMode ? `<span class="lesson-meta">${esc(event.className)}</span>` : ''}<span class="lesson-meta">${icon('pin')}<span>${esc(event.room || 'Room not listed')}</span></span>${event.lecturer ? `<span class="lesson-meta">${icon('person')}<span>${esc(event.lecturer)}</span></span>` : ''}${event.note ? `<p class="lesson-note">${esc(event.note)}</p>` : ''}${event.exception ? '<span class="badge amber">Calendar exception</span>' : ''}${event.overlap ? '<span class="badge amber">Overlapping entry</span>' : ''}</button>`;
}

export function classOption(item: SearchResult<ClassRecord>, selected: boolean): string {
  return `<button class="class-option ${selected ? 'selected' : ''}" data-class-id="${item.id}" ${selected ? 'aria-current="true"' : ''}><span><strong>${esc(item.name)}</strong><small>${item.fuzzy ? 'Close match · ' : ''}${item.eventCount ? `${item.eventCount} entries` : 'No entries'}</small></span>${icon(selected ? 'check' : 'chevron')}</button>`;
}

export function detailRow(symbol: string, label: string, value: unknown): string {
  return `<div class="detail-row">${icon(symbol)}<div><small>${label}</small><strong>${esc(value)}</strong></div></div>`;
}

export function lessonDetails(event: TimetableEvent, className: string): string {
  return `<p class="lesson-title-date">${formatDate(event.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h2 id="lesson-dialog-title">${esc(event.subject)}</h2><p class="lesson-class">${esc(event.className || className)}</p>${detailRow('clock', 'TIME · KUALA LUMPUR', `${event.start} – ${event.end}`)}${detailRow('pin', 'ROOM', event.room || 'Not listed in source')}${detailRow('person', 'LECTURER', event.lecturer || 'Not listed in source')}${event.note ? detailRow('info', 'NOTES', event.note) : ''}<div class="lesson-flags">${event.exception ? `<span class="badge amber">${esc(event.exception)} — calendar exception</span>` : ''}${event.overlap ? '<span class="badge amber">Overlaps another class entry. Check with your lecturer.</span>' : ''}</div>`;
}

export function onlineNoteNotice(message: string): string {
  return `<div class="lesson-mode-notice"><strong>Online · source note</strong><p>${message}</p></div>`;
}

export function editLessonButton(id: string): string {
  return `<button id="edit-lesson" class="button secondary" data-edit-id="${esc(id)}">Edit recurring lesson</button>`;
}

export function addLessonButton(id: string): string {
  return `<button id="add-lesson" class="button secondary" data-add-lesson="${esc(id)}">Add a lesson like this</button>`;
}

export function deleteLessonButton(lessonId: number): string {
  return `<button id="delete-lesson" class="button secondary" data-delete-lesson="${lessonId}">Delete lesson</button><p id="lesson-error" role="alert" hidden></p>`;
}

export function shareDialog(url: string): string {
  return `<h2 id="lesson-dialog-title">Share this week</h2><p class="dialog-description">Copy this link to share the selected class and week.</p><label class="search-field"><input id="share-link" type="text" aria-label="Class and week link" value="${esc(url)}" readonly></label>`;
}

export function editDayOptions(): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map((name, i) => `<option value="${i + 1}">${name}</option>`)
    .join('');
}

export function editPeriodOptions(periods: number[]): string {
  return periods
    .map(
      (start, i) =>
        `<option value="${i + 1}">${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')} (period ${i + 1})</option>`,
    )
    .join('');
}

export function addSpanOptions(periods: number): string {
  return Array.from({ length: Math.max(0, periods) }, (_, i) => i + 1)
    .map((count) => `<option value="${count}">${count} period${count === 1 ? '' : 's'} long</option>`)
    .join('');
}

export function addNamedOptions(list: DavStaff[], emptyLabel: string): string {
  return [
    `<option value="">${esc(emptyLabel)}</option>`,
    ...[...list]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`),
  ].join('');
}

export function exportDialog(
  selected: ClassRecord,
  options: { downloadPath: string; lecturerMode: boolean; week: string },
): string {
  return `<p class="dialog-description">Keep your class timetable in the calendar app you already use.</p><div class="export-class"><strong>${esc(selected.name)}</strong><p>${selected.eventCount} entries · ${formatDate(selected.firstDate || options.week, { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatDate(selected.lastDate || options.week, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div><a id="calendar-download" class="button primary full download-link" href="${options.downloadPath}" download="GMI-${selected.id}.ics">${icon('download')}Download ${options.lecturerMode ? 'lecturer' : 'my class'} calendar (.ics)</a><div class="export-notice">${icon('info')}<span>${options.lecturerMode ? 'This lecturer’s full schedule across classes and resource activities is included.' : 'Only this class’s full schedule is included.'} Times use Kuala Lumpur (UTC+8), and entries are marked tentative. Check changes with your lecturer.</span></div><p class="calendar-import-label">HOW TO ADD THE FILE</p><details open><summary>Google Calendar</summary><p>On a computer, open Google Calendar → Settings → Import &amp; export. Select the downloaded .ics file, choose a calendar, then Import.</p><a href="https://support.google.com/calendar/answer/37118?hl=en" target="_blank" rel="noopener">Google’s import guide ${icon('external')}</a></details><details><summary>Apple Calendar</summary><p>On a Mac, open Calendar → File → Import. Choose the downloaded .ics file, select a calendar, then confirm. Device import options may vary.</p><a href="https://support.apple.com/guide/calendar/icl1023/mac" target="_blank" rel="noopener">Apple’s import guide ${icon('external')}</a></details><details><summary>Outlook</summary><p>In Outlook on the web, choose Add calendar → Upload from file. Select the .ics file and your destination calendar, then Import.</p><a href="https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web" target="_blank" rel="noopener">Outlook’s import guide ${icon('external')}</a></details><p class="export-footnote">This download is a snapshot; it won’t update automatically. Import into a separate class calendar so you can replace it when a new schedule is published. Importing repeatedly may create duplicates.</p>`;
}
