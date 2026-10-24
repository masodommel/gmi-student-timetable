import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { decodeDav } from '../src/dav/index.js';
import { classCalendar } from '../src/timetable/calendar.js';
import { addDays } from '../src/timetable/core.js';
import { makeDavFixture } from './dav-fixture.js';
import type { TimetableEvent } from '../src/timetable/types.js';

// Splice ground truth for the reference flow was verified against this 1.15 MB plan (see
// dav-splice.test.ts); these end-to-end tests skip when the local file is absent.
const REFERENCE_DAV = 'C:/Users/sharp/Desktop/GMI Schedules/DAVINCI/2025/TT JULY 2025_R04J_03082025.dav';
const hasReference = existsSync(REFERENCE_DAV);

test('dynamic V30 reader handles different counts, names and period starts', async () => {
  for (const [name, start] of [
    ['CLASS A', 480],
    ['A much longer class name', 540],
  ] as const) {
    const result = await decodeDav(makeDavFixture({ className: name, periodStart: start }).buffer, 'new.dav');
    assert.equal(result.manifest.classes.length, 2);
    assert.equal(result.manifest.classes[0].name, name);
    assert.equal(result.total, 1);
    const event = result.datasets['1'].events[0];
    assert.equal(event.date, '2026-07-06');
    assert.equal(event.start, start === 480 ? '08:00' : '09:00');
    assert.equal(event.subject, 'Mathematics');
    assert.equal(result.datasets['2'].events.length, 0);
  }
});
test('slots covering several periods produce events that span the whole placement', async () => {
  const result = await decodeDav(makeDavFixture({ span: 2 }).buffer);
  assert.equal(result.total, 1);
  const event = result.datasets['1'].events[0];
  assert.equal(event.date, '2026-07-06');
  assert.equal(event.start, '08:00');
  assert.equal(event.end, '10:00');
});
test('unplaced slots with a period span stay omitted but keep the trailing count', async () => {
  const result = await decodeDav(makeDavFixture({ unplacedSpan: 4 }).buffer);
  assert.equal(result.total, 1);
  assert.equal(result.omitted, 1);
  const event = result.datasets['1'].events[0];
  assert.equal(event.date, '2026-07-06');
  assert.equal(event.start, '08:00');
  assert.equal(event.end, '09:00');
});
test('multi-period slots end after their full span and trailing tags accept note strings', async () => {
  const spans = await decodeDav(makeDavFixture({ periods: 5, span: 4 }).buffer);
  assert.equal(spans.total, 1);
  assert.equal(spans.datasets['1'].events[0].start, '08:00');
  assert.equal(spans.datasets['1'].events[0].end, '12:00');
  const note = await decodeDav(makeDavFixture({ trailingNote: 'Imported from an older file' }).buffer);
  assert.equal(note.total, 1);
  assert.equal(note.datasets['1'].events[0].note, 'From the new file');
});
test('calendar exceptions carry the all-day holiday flag from their range markers', async () => {
  const allDay = await decodeDav(makeDavFixture().buffer);
  assert.deepEqual(allDay.manifest.exceptions, [{ date: '2026-07-06', name: 'Campus holiday', allDay: true }]);
  assert.equal(allDay.datasets['1'].events[0].exception, 'Campus holiday');
  const partial = await decodeDav(makeDavFixture({ exceptionRange: [1, 2] }).buffer);
  assert.deepEqual(partial.manifest.exceptions, [{ date: '2026-07-06', name: 'Campus holiday', allDay: false }]);
});
test('local calendar export preserves timezone, class isolation and safe escaping', async () => {
  const result = await decodeDav(makeDavFixture({ subject: 'Math; Lab, A' }).buffer);
  const calendar = classCalendar(result.datasets['1'].class, result.datasets['1'].events);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(calendar.includes('Math\\; Lab\\, A'));
  assert.ok(calendar.includes('DTSTART;TZID=Asia/Kuala_Lumpur:20260706T080000'));
  assert.ok(!calendar.includes('CLASS B'));
  assert.ok(calendar.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75));
});
test('high-bit record IDs resolve and midnight ends use the next calendar day', async () => {
  const result = await decodeDav(makeDavFixture({ classId: 2147483649 }).buffer);
  assert.equal(result.datasets['2147483649'].events.length, 1);
  const event: TimetableEvent = { ...result.datasets['2147483649'].events[0], start: '23:00', end: '24:00' };
  const calendar = classCalendar(result.datasets['2147483649'].class, [event]);
  assert.ok(calendar.includes('DTEND;TZID=Asia/Kuala_Lumpur:20260707T000000'));
});
test('unsupported, truncated and oversized files are rejected', async () => {
  await assert.rejects(decodeDav(new TextEncoder().encode('<daVinci/>').buffer), /layout/);
  const fixture = makeDavFixture();
  await assert.rejects(decodeDav(fixture.slice(0, fixture.length - 1).buffer), /layout/);
  await assert.rejects(decodeDav(new ArrayBuffer(20 * 1024 * 1024 + 1)), /20 MB/);
});
test(
  'browser decoder agrees with every published class event in the reference file',
  { skip: !process.env.DAV_REFERENCE_FILE },
  async () => {
    const source = await readFile(process.env.DAV_REFERENCE_FILE!);
    const result = await decodeDav(
      source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer,
    );
    const published = JSON.parse(await readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'));
    assert.equal(result.manifest.sourceHash, published.sourceHash);
    assert.equal(result.total, published.counts.studentEvents);
    assert.equal(result.lecturerEvents.length, published.counts.allEvents);
    for (const lecturer of result.manifest.lecturers) {
      const manifest = JSON.parse(await readFile(new URL('../public/data/manifest.json', import.meta.url), 'utf8'));
      const record = manifest.lecturers.find((item: { name: string }) => item.name === lecturer.name);
      if (!record) continue;
      const expected = JSON.parse(
        await readFile(new URL(`../public/lecturers/${record.id}.json`, import.meta.url), 'utf8'),
      );
      const rows = (events: TimetableEvent[]) =>
        events.map(({ id, overlap, ...event }) => JSON.stringify(event)).sort();
      assert.deepEqual(
        rows(result.lecturerEvents.filter((e) => e.lecturer === lecturer.name)),
        rows(expected.events),
        lecturer.name,
      );
    }
    assert.equal(result.manifest.classes.length, published.counts.classes);
    const canonical = (events: TimetableEvent[]) => events.map(({ id, ...event }) => JSON.stringify(event)).sort();
    for (const item of result.manifest.classes) {
      const expected = JSON.parse(await readFile(new URL(`../public/data/${item.id}.json`, import.meta.url), 'utf8'));
      const actualRows = canonical(result.datasets[item.id].events),
        expectedRows = canonical(expected.events);
      assert.equal(actualRows.length, expectedRows.length, item.name);
      const mismatch = actualRows.findIndex((row, index) => row !== expectedRows[index]);
      if (mismatch !== -1) assert.equal(actualRows[mismatch], expectedRows[mismatch], item.name);
    }
  },
);

test('DAV export preserves all bytes without edits and patches recurring placement and notes losslessly', async () => {
  const { editDav, davDownload } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  assert.deepEqual(new Uint8Array(await davDownload(original.buffer).arrayBuffer()), original);
  const event = result.datasets['1'].events[0];
  const changed = await editDav(original.buffer, result.editor, event.id, { note: 'Edited note', day: 2, period: 2 });
  assert.equal(changed.decoded.datasets['1'].events[0].date, '2026-07-07');
  assert.equal(changed.decoded.datasets['1'].events[0].start, '09:00');
  assert.equal(changed.decoded.datasets['1'].events[0].note, 'Edited note');
  assert.equal(changed.decoded.manifest.classes.length, 2);
  const current = changed.decoded.datasets['1'].events[0];
  const restored = await editDav(changed.buffer, changed.decoded.editor, current.id, {
    note: 'From the new file',
    day: 1,
    period: 1,
  });
  assert.deepEqual(new Uint8Array(restored.buffer), original);
  await assert.rejects(
    editDav(original.buffer, result.editor, event.id, { note: 'Unsupported 🦄', day: 1, period: 1 }),
    /Windows-1252/,
  );
  await assert.rejects(editDav(original.buffer, result.editor, event.id, { note: '', day: 1, period: 3 }), /fits/);
});

test('span slots move within the period grid and patch notes losslessly', async () => {
  const { editDav, davDownload } = await import('../src/dav/index.js');
  const original = makeDavFixture({ span: 2 });
  const result = await decodeDav(original.buffer);
  const event = result.datasets['1'].events[0];
  await assert.rejects(editDav(original.buffer, result.editor, event.id, { note: 'Moved', day: 2, period: 2 }), /fits/);
  const changed = await editDav(original.buffer, result.editor, event.id, { note: 'Moved', day: 2, period: 1 });
  assert.equal(changed.decoded.datasets['1'].events[0].date, '2026-07-07');
  assert.equal(changed.decoded.datasets['1'].events[0].end, '10:00');
  const current = changed.decoded.datasets['1'].events[0];
  const restored = await editDav(changed.buffer, changed.decoded.editor, current.id, {
    note: 'From the new file',
    day: 1,
    period: 1,
  });
  assert.deepEqual(new Uint8Array(await davDownload(restored.buffer).arrayBuffer()), original);
});

test('fixture decode exposes the rooms dictionary on the editor', async () => {
  const result = await decodeDav(makeDavFixture().buffer);
  assert.deepEqual(result.editor.rooms, [{ id: '4', name: 'Room 1' }]);
  assert.equal(result.editor.lessonCountTag.encoding, 2);
  assert.equal(result.editor.lessonCountTag.value, 1);
  assert.ok(result.editor.lessonInsertPoint > result.editor.lessons['8'].recordStart);
});

test('addLesson clones the template record mid-table and deleteLesson restores the original bytes', async () => {
  const { addLesson, deleteLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  const added = await addLesson(original.buffer, result.editor, {
    classId: '1',
    subjectId: '5',
    day: 3,
    period: 2,
    span: 1,
    lecturer: '3',
    room: '4',
    note: 'Freshly booked',
  });
  const newId = Math.max(...Object.values(added.decoded.editor.lessons).map((record) => record.lessonId));
  assert.ok(newId > 8);
  assert.equal(Object.keys(added.decoded.editor.lessons).length, 2);
  assert.equal(added.decoded.total, 2);
  assert.equal(added.decoded.datasets['1'].events.length, 2);
  const record = added.decoded.editor.lessons[String(newId)];
  assert.equal(record.coupling, -1);
  assert.equal(record.classId, 1);
  assert.equal(record.subjectRef, 5);
  assert.equal(record.slots.length, 1);
  assert.equal(record.slots[0].id, newId + 1);
  // Growth = the spliced clone record plus one 4-byte member row per owner registry
  // (class 1, subject 5, lecturer 3, room 4) — the registration writes addLesson performs.
  assert.equal(added.buffer.byteLength - original.buffer.byteLength, record.recordEnd - record.recordStart + 4 * 4);
  // daVinciLook skips records appended behind the last lesson; the clone must sit mid-table. The
  // registration rows shift positions, so compare against the template's end in the added file.
  assert.equal(record.recordStart, added.decoded.editor.lessons['8'].recordEnd);
  const event = added.decoded.datasets['1'].events.find(
    (entry) => added.decoded.editor.events[entry.id]?.lessonId === newId,
  );
  assert.ok(event);
  assert.equal(event.date, '2026-07-08');
  assert.equal(event.start, '09:00');
  assert.equal(event.end, '10:00');
  assert.equal(event.subject, 'Mathematics');
  assert.equal(event.room, 'Room 1');
  assert.equal(event.lecturer, 'Example lecturer');
  assert.equal(event.note, 'Freshly booked');
  const restored = await deleteLesson(added.buffer, added.decoded.editor, newId);
  assert.equal(restored.decoded.total, 1);
  assert.deepEqual(new Uint8Array(restored.buffer), original);
});

test('new lesson ids skip stale coupling references so added lessons delete cleanly', async () => {
  const { addLesson, deleteLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture({ extraLesson: { coupling: 13 } });
  const result = await decodeDav(original.buffer);
  assert.equal(result.editor.lessonCountTag.value, 2);
  const added = await addLesson(original.buffer, result.editor, {
    classId: '1',
    subjectId: '5',
    day: 2,
    period: 1,
    span: 1,
    note: 'Skip reserved ids',
  });
  const newId = Math.max(...Object.values(added.decoded.editor.lessons).map((record) => record.lessonId));
  assert.equal(newId, 14);
  assert.equal(added.decoded.editor.lessons['14'].slots[0].id, 15);
  const restored = await deleteLesson(added.buffer, added.decoded.editor, newId);
  assert.equal(restored.decoded.total, 2);
  assert.deepEqual(new Uint8Array(restored.buffer), original);
});

test('addLesson falls back to a template with unplaced slots and renumbers every slot id', async () => {
  const { addLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture({ unplacedSpan: 4 });
  const result = await decodeDav(original.buffer);
  const added = await addLesson(original.buffer, result.editor, {
    classId: '1',
    subjectId: '5',
    day: 1,
    period: 1,
    span: 2,
    note: 'Fallback',
  });
  const newId = Math.max(...Object.values(added.decoded.editor.lessons).map((record) => record.lessonId));
  assert.equal(added.decoded.total, 2);
  assert.equal(added.decoded.omitted, 2);
  const record = added.decoded.editor.lessons[String(newId)];
  assert.equal(record.slots.length, 2);
  const placedSlot = record.slots[0],
    unplacedSlot = record.slots[1];
  assert.deepEqual([placedSlot.day, placedSlot.period, placedSlot.span, placedSlot.id], [1, 1, 2, newId + 1]);
  assert.deepEqual([unplacedSlot.day, unplacedSlot.period, unplacedSlot.span, unplacedSlot.id], [0, 0, 4, newId + 2]);
  const event = added.decoded.datasets['1'].events.find(
    (entry) => added.decoded.editor.events[entry.id]?.lessonId === newId,
  );
  assert.equal(event?.date, '2026-07-06');
  assert.equal(event?.end, '10:00');
});

test('addLesson inherits the template week mask unless explicit calendar weeks are requested', async () => {
  const { addLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  // The fixture names its pattern CW28 over cleared bit 28 in the planning year 2026, so the anchor
  // Monday sits one week before 2026-01-04 and cleared bits follow the ISO week number.
  assert.equal(result.editor.weekAnchor, '2025-12-22');
  assert.equal(result.editor.weekAnchorBase, -1);
  const template = result.editor.lessons['8'];
  assert.deepEqual(template.bits, [28 - 1 - result.editor.weekAnchorBase]);
  const added = await addLesson(original.buffer, result.editor, {
    classId: '1',
    subjectId: '5',
    day: 3,
    period: 2,
    span: 1,
    note: 'Same weeks as the template',
  });
  const newId = Math.max(...Object.values(added.decoded.editor.lessons).map((record) => record.lessonId));
  assert.deepEqual(added.decoded.editor.lessons[String(newId)].bits, template.bits);
  assert.equal(added.decoded.total, 2);
  const event = added.decoded.datasets['1'].events.find(
    (entry) => added.decoded.editor.events[entry.id]?.lessonId === newId,
  );
  assert.equal(event?.date, '2026-07-08');
});

test('addLesson with explicit calendar weeks rewrites the clone week mask to the requested weeks', async () => {
  const { addLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  const week = 29;
  const bit = week - 1 - result.editor.weekAnchorBase;
  const added = await addLesson(original.buffer, result.editor, {
    classId: '1',
    subjectId: '5',
    day: 1,
    period: 1,
    span: 1,
    note: 'Single week repeat',
    weeks: [week],
  });
  const newId = Math.max(...Object.values(added.decoded.editor.lessons).map((record) => record.lessonId));
  assert.deepEqual(added.decoded.editor.lessons[String(newId)].bits, [bit]);
  const event = added.decoded.datasets['1'].events.find(
    (entry) => added.decoded.editor.events[entry.id]?.lessonId === newId,
  );
  assert.ok(event);
  assert.equal(event.date, addDays(result.editor.weekAnchor, bit * 7));
  assert.equal(event.date, '2026-07-13');
  assert.equal(event.start, '08:00');
  assert.equal(event.end, '09:00');
  assert.equal(added.decoded.total, 2);
  // The template lesson keeps repeating in its own week untouched.
  assert.deepEqual(added.decoded.editor.lessons['8'].bits, [28 - 1 - result.editor.weekAnchorBase]);
  const templateEvent = added.decoded.datasets['1'].events.find(
    (entry) => added.decoded.editor.events[entry.id]?.lessonId === 8,
  );
  assert.equal(templateEvent?.date, '2026-07-06');
});

test('addLesson rejects week lists outside the planning window or with unusable entries', async () => {
  const { addLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  const request = { classId: '1', subjectId: '5', day: 3, period: 2, span: 1 };
  await assert.rejects(addLesson(original.buffer, result.editor, { ...request, weeks: [] }), /between 1 and 53/);
  await assert.rejects(addLesson(original.buffer, result.editor, { ...request, weeks: [54] }), /between 1 and 53/);
  await assert.rejects(addLesson(original.buffer, result.editor, { ...request, weeks: [1.5] }), /between 1 and 53/);
  await assert.rejects(addLesson(original.buffer, result.editor, { ...request, weeks: [28, 28] }), /only once/);
  // Shifting the pattern's cleared mask bit skews the CW-to-bit mapping, so some weeks demand bit
  // offsets beyond 0..63 even though their numbers look valid.
  const early = makeDavFixture({ weekMaskBit: 0 });
  const earlyResult = await decodeDav(early.buffer);
  await assert.rejects(addLesson(early.buffer, earlyResult.editor, { ...request, weeks: [1] }), /planning window/);
  const late = makeDavFixture({ weekMaskBit: 63 });
  const lateResult = await decodeDav(late.buffer);
  await assert.rejects(addLesson(late.buffer, lateResult.editor, { ...request, weeks: [53] }), /planning window/);
});

test('deleteLesson removes a pre-existing lesson and keeps the survivors byte-exactly', async () => {
  const { deleteLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture({ extraLesson: {} });
  const result = await decodeDav(original.buffer);
  assert.equal(result.total, 2);
  assert.equal(Object.keys(result.editor.lessons).length, 2);
  const first = await deleteLesson(original.buffer, result.editor, 8);
  assert.equal(first.decoded.total, 1);
  assert.equal(first.decoded.datasets['1'].events[0].date, '2026-07-07');
  const second = await deleteLesson(original.buffer, result.editor, 11);
  assert.equal(second.decoded.total, 1);
  assert.equal(second.decoded.datasets['1'].events[0].date, '2026-07-06');
  assert.deepEqual(new Uint8Array(second.buffer), makeDavFixture());
});

test('editDav reassigns slot rooms and lecturers and clears them to unlisted', async () => {
  const { editDav } = await import('../src/dav/index.js');
  const original = makeDavFixture({
    extraRoom: { id: 15, name: 'Room 2' },
    extraLecturer: { id: 16, name: 'Second lecturer' },
  });
  const result = await decodeDav(original.buffer);
  assert.equal(result.editor.rooms.length, 2);
  const event = result.datasets['1'].events[0];
  const changed = await editDav(original.buffer, result.editor, event.id, {
    note: event.note,
    day: 1,
    period: 1,
    room: '15',
    lecturer: '16',
  });
  const changedEvent = changed.decoded.datasets['1'].events[0];
  assert.equal(changed.decoded.editor.events[changedEvent.id]!.slots[0].room, 15);
  assert.equal(changed.decoded.editor.events[changedEvent.id]!.slots[0].lecturer, 16);
  assert.equal(changedEvent.room, 'Room 2');
  assert.equal(changedEvent.lecturer, 'Second lecturer');
  assert.equal(changedEvent.date, '2026-07-06');
  const cleared = await editDav(changed.buffer, changed.decoded.editor, changedEvent.id, {
    note: changedEvent.note,
    day: 1,
    period: 1,
    room: '',
    lecturer: '',
  });
  const clearedEvent = cleared.decoded.datasets['1'].events[0];
  assert.equal(cleared.decoded.editor.events[clearedEvent.id]!.slots[0].room, -1);
  assert.equal(cleared.decoded.editor.events[clearedEvent.id]!.slots[0].lecturer, -1);
  assert.equal(clearedEvent.room, '');
  assert.equal(clearedEvent.lecturer, '');
  await assert.rejects(
    editDav(original.buffer, result.editor, event.id, {
      note: event.note,
      day: 1,
      period: 1,
      room: '999',
    }),
    /Choose a room/,
  );
  await assert.rejects(
    editDav(original.buffer, result.editor, event.id, {
      note: event.note,
      day: 1,
      period: 1,
      lecturer: '999',
    }),
    /Choose a lecturer/,
  );
});

test('linked lessons keep room and note edits but refuse moves', async () => {
  const { editDav } = await import('../src/dav/index.js');
  const original = makeDavFixture({
    extraLesson: { coupling: 8 },
    extraRoom: { id: 15, name: 'Room 2' },
    extraLecturer: { id: 16, name: 'Second lecturer' },
  });
  const result = await decodeDav(original.buffer);
  const linked = Object.entries(result.editor.events).find(([, record]) => record.lessonId === 11)![0];
  const changed = await editDav(original.buffer, result.editor, linked, {
    note: result.editor.events[linked].note,
    day: 2,
    period: 1,
    room: '15',
    lecturer: '16',
  });
  const changedLinked = Object.entries(changed.decoded.editor.events).find(([, record]) => record.lessonId === 11)![0];
  const moved = changed.decoded.editor.events[changedLinked]!;
  assert.equal(moved.slots[0].room, 15);
  assert.equal(moved.slots[0].lecturer, 16);
  assert.equal(moved.slots[0].day, 2);
  await assert.rejects(
    editDav(original.buffer, result.editor, linked, {
      note: result.editor.events[linked].note,
      day: 1,
      period: 1,
      room: '15',
      lecturer: '16',
    }),
    /moved together/,
  );
});

test('addLesson and deleteLesson guard against impossible requests', async () => {
  const { addLesson, deleteLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  await assert.rejects(
    addLesson(original.buffer, result.editor, { classId: '1', subjectId: '999', day: 3, period: 2, span: 1 }),
    /subject is not part/,
  );
  await assert.rejects(
    addLesson(original.buffer, result.editor, { classId: '999', subjectId: '5', day: 3, period: 2, span: 1 }),
    /class is not part/,
  );
  await assert.rejects(
    addLesson(original.buffer, result.editor, {
      classId: '1',
      subjectId: '5',
      day: 1,
      period: 1,
      span: 1,
      room: '999',
    }),
    /Choose a room/,
  );
  await assert.rejects(
    addLesson(original.buffer, result.editor, {
      classId: '1',
      subjectId: '5',
      day: 1,
      period: 1,
      span: 1,
      lecturer: '999',
    }),
    /Choose a lecturer/,
  );
  await assert.rejects(
    addLesson(original.buffer, result.editor, { classId: '1', subjectId: '5', day: 0, period: 2, span: 1 }),
    /weekday/,
  );
  await assert.rejects(
    addLesson(original.buffer, result.editor, { classId: '1', subjectId: '5', day: 1, period: 3, span: 1 }),
    /fits/,
  );
  const gapped = makeDavFixture({ periodBreak: 15 });
  const gapResult = await decodeDav(gapped.buffer);
  await assert.rejects(
    addLesson(gapped.buffer, gapResult.editor, { classId: '1', subjectId: '5', day: 1, period: 1, span: 2 }),
    /consecutive/,
  );
  await assert.rejects(deleteLesson(original.buffer, result.editor, 999), /not part/);
  await assert.rejects(deleteLesson(original.buffer, result.editor, 8), /at least one lesson/);
  const coupled = makeDavFixture({ extraLesson: { coupling: 8 } });
  const coupledResult = await decodeDav(coupled.buffer);
  await assert.rejects(deleteLesson(coupled.buffer, coupledResult.editor, 11), /linked group/);
  await assert.rejects(deleteLesson(coupled.buffer, coupledResult.editor, 8), /Other lessons link/);
});

test('addLesson conflict policies: refuse, drop colliding weeks, or keep the template bits', async () => {
  const { addLesson } = await import('../src/dav/index.js');
  const original = makeDavFixture();
  const result = await decodeDav(original.buffer);
  // The template sits at day 1 period 1 in class 1, so the same slot always collides.
  const request = { classId: '1', subjectId: '5', day: 1, period: 1, span: 1, note: 'Over the template' };
  await assert.rejects(addLesson(original.buffer, result.editor, { ...request, conflictPolicy: 'error' }), /collide/);
  await assert.rejects(
    addLesson(original.buffer, result.editor, { ...request, conflictPolicy: 'drop-weeks' }),
    /Every chosen calendar week/,
  );
  const dropped = await addLesson(original.buffer, result.editor, {
    ...request,
    weeks: [28, 29],
    conflictPolicy: 'drop-weeks',
  });
  const droppedId = Math.max(...Object.values(dropped.decoded.editor.lessons).map((record) => record.lessonId));
  assert.deepEqual(dropped.decoded.editor.lessons[String(droppedId)].bits, [29 - 1 - result.editor.weekAnchorBase]);
  // Keeping the policy drops nothing out of the mask; the collision stays exactly as requested.
  const kept = await addLesson(original.buffer, result.editor, {
    ...request,
    conflictPolicy: 'keep',
  });
  const keptId = Math.max(...Object.values(kept.decoded.editor.lessons).map((record) => record.lessonId));
  assert.deepEqual(kept.decoded.editor.lessons[String(keptId)].bits, [28 - 1 - result.editor.weekAnchorBase]);
  // Registration in the owner member arrays accompanies every successful add.
  const list = (await import('../src/dav/index.js')).locateMemberList(new Uint8Array(kept.buffer), 1);
  assert.ok(list);
  assert.equal(list.count, 1);
  const view = new DataView(kept.buffer);
  assert.equal(view.getUint32(list.arrayEnd - 4, true), keptId);
});

test(
  'addLesson registers the clone in every owner member array on the reference file',
  { skip: !hasReference },
  async () => {
    const { addLesson, davConflictMessage, davPlacementConflicts, deleteLesson, locateMemberList } =
      await import('../src/dav/index.js');
    const raw = await readFile(REFERENCE_DAV);
    const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const originalBytes = new Uint8Array(bytes);
    const decoded = await decodeDav(bytes, 'reference.dav');
    const editor = decoded.editor;
    const bit = (week: number) => week - 1 - editor.weekAnchorBase;
    const weeks = [30, 31, 32, 33, 34, 35, 41, 42, 46];
    const request = {
      classId: '98273235',
      subjectId: '36506311',
      day: 3,
      period: 2,
      span: 2,
      lecturer: '38005632',
      weeks,
      note: 'INSERT PROBE P1',
    };
    // The Wednesday-33 'Student/Staff Activity' lessons collide with the clone placement.
    const placements = davPlacementConflicts(editor, {
      classId: 98273235,
      day: 3,
      period: 2,
      span: 2,
      lecturer: 38005632,
      weeks: weeks.map(bit),
    });
    assert.ok(placements.some((entry) => entry.scope === 'class' && entry.cw === 33 && /activ/i.test(entry.subject)));
    await assert.rejects(addLesson(bytes, editor, { ...request, conflictPolicy: 'error' }), /collide/);
    const dropped = await addLesson(bytes, editor, { ...request, conflictPolicy: 'drop-weeks' });
    const droppedId = Math.max(...Object.values(dropped.decoded.editor.lessons).map((record) => record.lessonId));
    const droppedBits = dropped.decoded.editor.lessons[String(droppedId)].bits;
    // The class-owned colliding weeks (Wednesday-33 and Wednesday-41 Activity cells) are sacrificed;
    // lecturer double bookings never shrink the mask.
    assert.deepEqual(
      droppedBits,
      weeks.map(bit).filter((value) => value !== bit(33) && value !== bit(41)),
    );
    // Without protection the clone keeps the full mask and registers everywhere.
    const kept = await addLesson(bytes, editor, request);
    const keptId = Math.max(...Object.values(kept.decoded.editor.lessons).map((record) => record.lessonId));
    assert.deepEqual(kept.decoded.editor.lessons[String(keptId)].bits, weeks.map(bit));
    const keptBytes = new Uint8Array(kept.buffer);
    const arrays = {
      class: locateMemberList(keptBytes, 98273235),
      subject: locateMemberList(keptBytes, 36506311),
      staff: locateMemberList(keptBytes, 38005632),
    };
    const counts = { class: 25, subject: 48, staff: 35 };
    for (const role of ['class', 'subject', 'staff'] as const) {
      const list = arrays[role];
      assert.ok(list, `${role} member list survives the clone splice`);
      assert.equal(list.count, counts[role]);
      const view = new DataView(kept.buffer);
      assert.equal(view.getUint32(list.arrayEnd - 4, true), keptId);
    }
    assert.ok(davConflictMessage(placements).includes('CW 33'));
    const restored = await deleteLesson(kept.buffer, kept.decoded.editor, keptId);
    assert.deepEqual(new Uint8Array(restored.buffer), originalBytes);
  },
);
