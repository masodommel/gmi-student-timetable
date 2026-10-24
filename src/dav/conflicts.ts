// Cell-collision detection for the lesson table, verified against daVinciLook: the app renders one
// lesson per owner cell, so a splice overlapping an already active lesson in the same calendar week
// either loses the cell (hidden clone, the insert-probe "P1" fallback) or collides visibly in the
// owner grid (the "Student/Staff Activity" Wednesday-33 collision that defeats the cloned cell).
import { addDays } from '../timetable/core.js';
import type { DavEditor, DavLesson, DavSlot } from './types.js';

export type DavConflictScope = 'class' | 'lecturer' | 'room';

export interface DavPlacement {
  classId: number;
  day: number;
  period: number;
  span: number;
  lecturer?: number | null;
  room?: number | null;
  weeks: number[];
  excludeLessonId?: number;
}

export interface DavConflict {
  scope: DavConflictScope;
  /** 0-based week-bit index, matching DavLesson.bits entries and the raw 64-bit week mask. */
  weekIndex: number;
  /** Calendar week number inside the planning window. */
  cw: number;
  /** ISO date the collision week's placement lands on (needs the placement's weekday). */
  date: string;
  day: number;
  period: number;
  span: number;
  lessonId: number;
  subject: string;
}

const UNLISTED = 0xffffffff;

const unlisted = (value: number | null | undefined): boolean =>
  value === null || value === undefined || value < 1 || value >= UNLISTED;

// Same placement rule writer.ts applies: unplaced slots never render and never collide.
const placed = (slot: DavSlot): boolean => slot.day >= 1 && slot.day <= 7 && slot.period >= 1 && !slot.flag;

const overlaps = (placement: DavPlacement, slot: DavSlot): boolean =>
  slot.day === placement.day &&
  slot.period <= placement.period + placement.span - 1 &&
  placement.period <= slot.period + slot.span - 1;

const conflict = (
  editor: DavEditor,
  scope: DavConflictScope,
  lesson: DavLesson,
  placement: DavPlacement,
  weekIndex: number,
): DavConflict => ({
  scope,
  weekIndex,
  cw: weekIndex + 1 + editor.weekAnchorBase,
  date: addDays(editor.weekAnchor, weekIndex * 7 + placement.day - 1),
  day: placement.day,
  period: placement.period,
  span: placement.span,
  lessonId: lesson.lessonId,
  subject:
    editor.subjects.find((entry) => Number(entry.id) === lesson.subjectRef)?.name ??
    (lesson.subjectRef > 0 && lesson.subjectRef < UNLISTED ? `subject ${lesson.subjectRef}` : 'unlisted subject'),
});

export function davPlacementConflicts(editor: DavEditor, placement: DavPlacement): DavConflict[] {
  const wanted = new Set(placement.weeks);
  const conflicts: DavConflict[] = [];
  const seen = new Set<string>();
  for (const lesson of Object.values(editor.lessons)) {
    if (placement.excludeLessonId !== undefined && lesson.lessonId === placement.excludeLessonId) continue;
    const shared = lesson.bits.filter((bit) => wanted.has(bit));
    if (!shared.length) continue;
    for (const slot of lesson.slots) {
      if (!placed(slot) || !overlaps(placement, slot)) continue;
      const scopes: DavConflictScope[] = [];
      if (lesson.classId === placement.classId) scopes.push('class');
      const lecturer = placement.lecturer ?? null;
      if (!unlisted(lecturer) && !unlisted(slot.lecturer) && slot.lecturer === lecturer) scopes.push('lecturer');
      const room = placement.room ?? null;
      if (!unlisted(room) && !unlisted(slot.room) && slot.room === room) scopes.push('room');
      for (const scope of scopes)
        for (const weekIndex of shared) {
          const key = `${scope}|${weekIndex}|${lesson.lessonId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          conflicts.push(conflict(editor, scope, lesson, placement, weekIndex));
        }
    }
  }
  return conflicts.sort(
    (a, b) =>
      a.weekIndex - b.weekIndex ||
      a.day - b.day ||
      a.period - b.period ||
      a.scope.localeCompare(b.scope) ||
      a.lessonId - b.lessonId,
  );
}

// Weeks inside placement.weeks without a collision. Restrict to a single scope (e.g. "class") to
// mirror the app's render precedence: class-grid collisions resolve to one visible lesson while
// lecturer and room double-bookings render side by side in the owner views.
export function davFreeWeeks(editor: DavEditor, placement: DavPlacement, scope?: DavConflictScope): number[] {
  const busy = new Set(
    davPlacementConflicts(editor, placement)
      .filter((entry) => scope === undefined || entry.scope === scope)
      .map((entry) => entry.weekIndex),
  );
  return [...new Set(placement.weeks.filter((week) => !busy.has(week)))];
}

export function davLessonConflicts(editor: DavEditor, lessonId: number): DavConflict[] {
  const lesson = editor.lessons[String(lessonId)];
  if (!lesson) throw new Error('This lesson is not part of the timetable file. Reopen the lesson before editing.');
  const conflicts: DavConflict[] = [],
    seen = new Set<string>();
  for (const slot of lesson.slots) {
    if (!placed(slot)) continue;
    for (const entry of davPlacementConflicts(editor, {
      classId: lesson.classId,
      day: slot.day,
      period: slot.period,
      span: slot.span,
      lecturer: slot.lecturer,
      room: slot.room,
      weeks: lesson.bits,
      excludeLessonId: lesson.lessonId,
    })) {
      const key = `${entry.scope}|${entry.weekIndex}|${entry.lessonId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push(entry);
    }
  }
  return conflicts;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SCOPE_LABEL: Record<DavConflictScope, string> = {
  class: 'the same class as',
  lecturer: 'the lecturer booked for',
  room: 'the room booked for',
};

export function davConflictMessage(conflicts: DavConflict[]): string {
  return conflicts
    .map((entry) => {
      const cells = entry.span > 1 ? `${entry.period}-${entry.period + entry.span - 1}` : `${entry.period}`;
      return `${WEEKDAYS[entry.day - 1] ?? `Day ${entry.day}`} ${entry.date} (CW ${entry.cw}) periods ${cells}: ${
        SCOPE_LABEL[entry.scope]
      } "${entry.subject}" (lesson ${entry.lessonId})`;
    })
    .join('; ');
}
