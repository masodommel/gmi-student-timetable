import { addDays } from './core.js';
import type { TimetableEvent } from './types.js';

const encoder = new TextEncoder();
const escape = (value: unknown) =>
  String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function fold(line: string): string[] {
  const lines: string[] = [];
  let part = '';
  for (const character of line) {
    if (encoder.encode(part + character).length > 75) {
      lines.push(part);
      part = ' ';
    }
    part += character;
  }
  return [...lines, part];
}
export function classCalendar(selected: { name: string }, events: TimetableEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Student Timetable//Class Calendar//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:' + escape(selected.name),
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kuala_Lumpur',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:MYT',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const event of events) {
    const date = event.date.replaceAll('-', '');
    const endDate = event.end === '24:00' ? addDays(event.date, 1).replaceAll('-', '') : date;
    const endTime = event.end === '24:00' ? '0000' : event.end.replace(':', '');
    let description = 'Reconstructed timetable. Confirm changes with your lecturer.\nClass: ' + selected.name;
    for (const [label, value] of [
      ['Class', event.className],
      ['Lecturer', event.lecturer],
      ['Notes', event.note],
      ['Calendar exception', event.exception],
    ] as const)
      if (value) description += `\n${label}: ${value}`;
    if (event.overlap) description += '\nOverlapping class entry: check with lecturer.';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + event.id + '@student-timetable.local',
      'DTSTAMP:' + stamp,
      'DTSTART;TZID=Asia/Kuala_Lumpur:' + date + 'T' + event.start.replace(':', '') + '00',
      'DTEND;TZID=Asia/Kuala_Lumpur:' + endDate + 'T' + endTime + '00',
      'SUMMARY:' + escape(selected.name + ' - ' + event.subject),
      'LOCATION:' + escape(event.room),
      'DESCRIPTION:' + escape(description),
      'STATUS:TENTATIVE',
      'END:VEVENT',
    );
  }
  return [...lines, 'END:VCALENDAR'].flatMap(fold).join('\r\n') + '\r\n';
}
