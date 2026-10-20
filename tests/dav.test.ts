import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeDav } from '../src/dav/index.js';
import { classCalendar } from '../src/timetable/calendar.js';
import { makeDavFixture } from './dav-fixture.js';
import type { TimetableEvent } from '../src/timetable/types.js';

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
