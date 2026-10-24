import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_SESSIONS, academicWeekFor } from '../src/timetable/academic-calendar.js';

test('training weeks total exactly 18 per session', () => {
  for (const session of ACADEMIC_SESSIONS) {
    const total = session.training.reduce((sum, block) => sum + block.weekCount, 0);
    assert.equal(total, 18);
  }
});

test('academic week labels match the 2026 calendar', () => {
  const cases: Array<[string, string]> = [
    ['2026-01-12', 'W1'],
    ['2026-03-16', 'W10'],
    ['2026-03-23', 'SB'],
    ['2026-03-30', 'W11'],
    ['2026-05-18', 'W18'],
    ['2026-05-25', 'RW'],
    ['2026-06-01', 'EX'],
    ['2026-06-15', 'SB'],
    ['2026-07-06', 'W1'],
    ['2026-08-24', 'W8'],
    ['2026-08-31', 'SB'],
    ['2026-09-07', 'W9'],
    ['2026-10-19', 'W15'],
    ['2026-11-09', 'W18'],
    ['2026-11-16', 'RW'],
    ['2026-11-23', 'EX'],
    ['2026-12-07', 'SB'],
    ['2027-01-04', 'SB'],
  ];
  for (const [date, label] of cases) {
    assert.equal(academicWeekFor(date)?.label, label, `${date} should be ${label}`);
  }
});

test('unconfigured and invalid dates return null', () => {
  assert.equal(academicWeekFor('2027-01-11'), null);
  assert.equal(academicWeekFor('2026-02-30'), null);
  assert.equal(academicWeekFor(''), null);
});

test('mid-week dates normalize to their Monday', () => {
  assert.equal(academicWeekFor('2026-10-21')?.label, 'W15');
});

test('no training week exceeds W18', () => {
  assert.equal(academicWeekFor('2026-05-25')?.label, 'RW');
});
