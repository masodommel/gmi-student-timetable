import { addDays, monday, validDate } from './core.js';

export type WeekKind = 'tw' | 'sb' | 'ex' | 'rw';

export interface WeekInfo {
  label: string;
  kind: WeekKind;
}

interface TrainingBlock {
  start: string;
  weekCount: number;
}

interface SpecialBlock {
  start: string;
  weekCount: number;
  kind: Exclude<WeekKind, 'tw'>;
}

export interface AcademicSession {
  training: TrainingBlock[];
  special: SpecialBlock[];
}

export const ACADEMIC_SESSIONS: AcademicSession[] = [
  {
    training: [
      { start: '2026-01-12', weekCount: 10 },
      { start: '2026-03-30', weekCount: 8 },
    ],
    special: [
      { start: '2025-12-29', weekCount: 2, kind: 'sb' },
      { start: '2026-03-23', weekCount: 1, kind: 'sb' },
      { start: '2026-05-25', weekCount: 1, kind: 'rw' },
      { start: '2026-06-01', weekCount: 2, kind: 'ex' },
      { start: '2026-06-15', weekCount: 3, kind: 'sb' },
    ],
  },
  {
    training: [
      { start: '2026-07-06', weekCount: 8 },
      { start: '2026-09-07', weekCount: 10 },
    ],
    special: [
      { start: '2026-08-31', weekCount: 1, kind: 'sb' },
      { start: '2026-11-16', weekCount: 1, kind: 'rw' },
      { start: '2026-11-23', weekCount: 2, kind: 'ex' },
      { start: '2026-12-07', weekCount: 5, kind: 'sb' },
    ],
  },
];

const TRAINING_WEEKS = 18;
const weeks = new Map<string, WeekInfo>();

function assertMonday(date: string): void {
  if (!validDate(date) || monday(date) !== date) {
    throw new Error(`Academic calendar start must be a Monday: ${date}`);
  }
}

for (const session of ACADEMIC_SESSIONS) {
  let nextTrainingWeek = 1;
  let previousEnd = '';
  for (const block of session.training) {
    assertMonday(block.start);
    if (!Number.isInteger(block.weekCount) || block.weekCount < 1) {
      throw new Error(`Invalid training week count: ${block.weekCount}`);
    }
    if (previousEnd && block.start <= previousEnd) {
      throw new Error(`Training blocks must be chronological: ${block.start}`);
    }
    if (nextTrainingWeek + block.weekCount - 1 > TRAINING_WEEKS) {
      throw new Error(`Session exceeds ${TRAINING_WEEKS} training weeks`);
    }
    for (let index = 0; index < block.weekCount; index += 1) {
      const start = addDays(block.start, index * 7);
      if (weeks.has(start)) throw new Error(`Duplicate academic week: ${start}`);
      weeks.set(start, { label: `W${nextTrainingWeek}`, kind: 'tw' });
      nextTrainingWeek += 1;
    }
    previousEnd = addDays(block.start, (block.weekCount - 1) * 7);
  }
  if (nextTrainingWeek !== TRAINING_WEEKS + 1) {
    throw new Error(`Session must define exactly ${TRAINING_WEEKS} training weeks`);
  }
  for (const block of session.special) {
    assertMonday(block.start);
    if (!Number.isInteger(block.weekCount) || block.weekCount < 1) {
      throw new Error(`Invalid special week count: ${block.weekCount}`);
    }
    for (let index = 0; index < block.weekCount; index += 1) {
      const start = addDays(block.start, index * 7);
      if (weeks.has(start)) throw new Error(`Duplicate academic week: ${start}`);
      weeks.set(start, { label: block.kind.toUpperCase(), kind: block.kind });
    }
  }
}

export function academicWeekFor(date: string): WeekInfo | null {
  return validDate(date) ? (weeks.get(monday(date)) ?? null) : null;
}
