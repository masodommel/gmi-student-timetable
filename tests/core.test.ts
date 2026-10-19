import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validDate,
  addDays,
  monday,
  localToday,
  clampWeek,
  filterEvents,
  shareUrl,
  calendarPath,
  escapeHtml,
} from '../src/timetable/core.js';

test('date validation rejects invalid dates and rolled dates', () => {
  const invalidDates = [null, '', '2026-02-30', '2026-13-01', '2026-1-02', '<script>'];
  for (const value of invalidDates) assert.equal(validDate(value), false);

  assert.equal(validDate('2026-10-12'), true);
});

test('week navigation survives month and year boundaries', () => {
  assert.equal(monday('2027-01-01'), '2026-12-28');
  assert.equal(monday('2026-10-18'), '2026-10-12');

  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(clampWeek('2028-01-01', '2026-01-01', '2027-01-31'), '2027-01-25');
});

test('today is based on Malaysia even when UTC is on the previous day', () => {
  assert.equal(localToday(new Date('2026-10-11T17:00:00Z')), '2026-10-12');
});

test('search stays within the displayed week and matches lecturer and room', () => {
  const entries = [
    { date: '2026-10-12', subject: 'Physics', lecturer: 'Nur Azmi', room: 'KT1', note: 'Lab' },
    { date: '2026-10-20', subject: 'Physics', lecturer: 'Nur Azmi', room: 'KT1', note: '' },
  ];

  assert.equal(filterEvents(entries, '2026-10-12', 'nur kt1').length, 1);
  assert.equal(filterEvents(entries, '2026-10-12', 'biology').length, 0);
});

test('share and calendar URLs work under a repository path', () => {
  assert.equal(
    shareUrl('https://example.com/gmi-student-timetable/?old=value', '123', '2026-10-12'),
    'https://example.com/gmi-student-timetable/?class=123&week=2026-10-12',
  );

  assert.equal(calendarPath('123'), './calendars/123.ics');
  assert.throws(() => calendarPath('../secret'));
});

test('recovered source labels cannot inject HTML', () => {
  assert.equal(escapeHtml('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
});
