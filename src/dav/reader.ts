import { addDays, monday } from '../timetable/core.js';
import { markOverlaps } from '../timetable/events.js';
import type { ClassDataset, ClassRecord, Manifest, TimetableEvent } from '../timetable/types.js';
import type { DavCountTag, DavDecoded, DavEditorEvent, DavLesson, DavSlot } from './types.js';

const textDecoder = new TextDecoder('windows-1252');
const MAX_FILE = 20 * 1024 * 1024;

const failure = (): Error =>
  new Error(
    'This file uses a timetable layout we can’t read yet. Supported: compatible legacy .dav files with the V30 format.',
  );

function expect(condition: unknown): asserts condition {
  if (!condition) throw failure();
}

const reference = (value: number): number => (value === 0xffffffff ? -1 : value);

class Reader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  position: number;

  constructor(bytes: Uint8Array, position = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.position = position;
  }

  take(size: number): number {
    expect(Number.isInteger(size) && size >= 0 && this.position + size <= this.bytes.length);
    const start = this.position;
    this.position += size;
    return start;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  i8(): number {
    return this.view.getInt8(this.take(1));
  }

  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }

  i16(): number {
    return this.view.getInt16(this.take(2), true);
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  i32(): number {
    return this.view.getInt32(this.take(4), true);
  }

  f32(): number {
    const value = this.view.getFloat32(this.take(4), true);
    expect(Number.isFinite(value));
    return value;
  }

  f64(): number {
    const value = this.view.getFloat64(this.take(8), true);
    expect(Number.isFinite(value));
    return value;
  }

  mask(): bigint {
    return this.view.getBigUint64(this.take(8), true);
  }

  // Tagged values: integers, floats, booleans and length-prefixed strings.
  value(): number | string | boolean {
    const tag = this.u8();
    if (tag === 2) return this.i8();
    if (tag === 3) return this.i16();
    if (tag === 4) return this.i32();
    if (tag === 15) return this.f32();
    if (tag === 8 || tag === 9) return tag === 9;
    if (tag === 6) {
      const length = this.u8();
      const start = this.take(length);
      return textDecoder.decode(this.bytes.subarray(start, start + length));
    }
    throw failure();
  }

  text(): string {
    const value = this.value();
    expect(typeof value === 'string');
    return value;
  }

  flag(): boolean {
    const value = this.value();
    expect(typeof value === 'boolean');
    return value;
  }

  skipValue(): void {
    this.value();
  }

  count(maximum: number): number {
    const value = this.value();
    expect(typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum);
    return value;
  }
}

interface NamedRecord {
  position: number;
  id: number;
  name: string;
}

interface CalendarException {
  start: string;
  end: string;
  first: number;
  last: number;
  name: string;
}

interface Pattern {
  id: number;
  name: string;
  bits: number[];
}

interface Lesson {
  id: number;
  coupling: number;
  recordStart: number;
  recordEnd: number;
  terminator: 0 | 1;
  trailerCountOffset: number;
  noteOffset: number;
  noteEnd: number;
  maskOffset: number;
  classId: number;
  subject: number;
  note: string;
  bits: number[];
  slots: DavSlot[];
  slotStarts: number[];
}

interface Timetable {
  patterns: Pattern[];
  lessons: Lesson[];
  countTag: DavCountTag;
  insertPoint: number;
}

interface DictionaryEntry {
  category: string;
  name: string;
}

interface EventContext {
  hash: string;
  periods: number[];
  duration: number;
  dictionary: Record<number, DictionaryEntry>;
  exceptionMap: Map<string, string[]>;
}

// Excel serial day 1 is 1900-01-01; account for its fictitious leap day.
function dateSerial(value: number): string {
  expect(Number.isFinite(value) && value >= 32874 && value <= 73416);
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
}

// A 64-bit mask marks active weeks; cleared bit positions become week offsets.
function activeBits(mask: bigint): number[] {
  return [...mask.toString(2).padStart(64, '0')].reverse().flatMap((bit, offset) => (bit === '0' ? [offset] : []));
}

// Counts precede their record as a tagged integer, so probe the known encodings.
// Revisions may encode two integers before one probe window, so collect every candidate.
function countsBefore(bytes: Uint8Array, position: number, maximum: number): number[] {
  const counts: number[] = [];
  for (const [length, tag] of [
    [2, 2],
    [3, 3],
    [5, 4],
  ]) {
    if (position >= length && bytes[position - length] === tag) {
      const reader = new Reader(bytes, position - length);
      try {
        const count = reader.count(maximum);
        if (count > 0 && reader.position === position) counts.push(count);
      } catch {}
    }
  }
  return counts;
}

// Named records look like [u32 id][0x02 0xFF 0x06 length text] in the name table.
function namedRecords(bytes: Uint8Array): NamedRecord[] {
  const result: NamedRecord[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let marker = 4; marker < bytes.length - 4; marker++) {
    if (bytes[marker] !== 2 || bytes[marker + 1] !== 255 || bytes[marker + 2] !== 6) continue;
    const size = bytes[marker + 3];
    if (!size || marker + 4 + size > bytes.length) continue;
    const value = bytes.subarray(marker + 4, marker + 4 + size);
    if (value.some((byte) => byte < 32 || byte === 127)) continue;
    result.push({ position: marker - 4, id: view.getUint32(marker - 4, true), name: textDecoder.decode(value) });
  }
  return result;
}

// Calendar records hold a date float pair, two range markers and a kind byte before the name text.
function calendarSection(
  bytes: Uint8Array,
  firstName: number,
): { classes: number; exceptions: CalendarException[]; start: number } {
  for (let position = 4; position < firstName; position++) {
    if (bytes[position + 25] !== 6) continue;
    const [count] = countsBefore(bytes, position, 2000);
    if (!count) continue;
    try {
      const reader = new Reader(bytes, position);
      const exceptions: CalendarException[] = [];
      for (let index = 0; index < count; index++) {
        const start = dateSerial(reader.f64()),
          end = dateSerial(reader.f64());
        expect(start <= end);
        const first = reader.i32(),
          last = reader.i32();
        // Range markers are -1 when absent, else a bounded period or clock value.
        // Both -1 marks an all-day exception.
        expect(first >= -1 && first <= 2359 && last >= -1 && last <= 2359);
        const kind = reader.u8();
        expect(kind <= 10);
        const name = reader.text();
        exceptions.push({ start, end, first, last, name: name.trim() });
      }
      reader.take(8);
      const classes = reader.count(5000);
      expect(classes > 0 && reader.position === firstName);
      return { classes, exceptions, start: position };
    } catch {}
  }
  throw failure();
}

function periodsSection(bytes: Uint8Array, before: number, duration: number): { title: string; periods: number[] } {
  for (let position = 64; position < before; position++) {
    if (bytes[position] !== 6) continue;
    try {
      const reader = new Reader(bytes, position);
      const title = reader.text();
      expect(title.length >= 3);
      reader.text();
      reader.flag();
      const count = reader.count(48);
      expect(count > 0);
      const periods: number[] = [];
      for (let index = 0; index < count; index++) {
        const start = reader.u16();
        const flags = reader.take(8);
        expect(bytes.subarray(flags, flags + 8).every((value) => value === 0));
        expect(start + duration <= 1440 && (!index || start > periods[index - 1]));
        periods.push(start);
      }
      expect(reader.position < before);
      return { title, periods };
    } catch {}
  }
  throw failure();
}

function parseTimetable(bytes: Uint8Array, position: number, patternCount: number, periods: number[]): Timetable {
  const reader = new Reader(bytes, position);
  const patterns: Pattern[] = [];
  for (let index = 0; index < patternCount; index++) {
    const id = reader.u32();
    expect(reader.value() === -1);
    const name = reader.text();
    reader.text();
    const mask = reader.mask();
    for (let field = 0; field < 4; field++) reader.f32();
    patterns.push({ id, name, bits: activeBits(mask) });
  }
  const groups = reader.count(5000);
  for (let group = 0; group < groups; group++) {
    reader.u32();
    expect(reader.value() === -1);
    reader.text();
    reader.text();
    reader.take(reader.count(10000) * 24);
  }
  const countTag = reader.position;
  const lessonCount = reader.count(30000);
  const countWidth = reader.position - countTag - 1;
  expect(
    lessonCount > 0 && [2, 3, 4].includes(bytes[countTag]) && [1, 2, 4].includes(countWidth) && reader.value() === 0,
  );
  const countCell: DavCountTag = {
    position: countTag,
    width: countWidth,
    value: lessonCount,
    encoding: bytes[countTag] as 2 | 3 | 4,
  };
  const lessons: Lesson[] = [],
    lessonIds = new Set<number>(),
    slotIds = new Set<number>();
  for (let index = 0; index < lessonCount; index++) {
    const recordStart = reader.position;
    const id = reader.u32();
    expect(!lessonIds.has(id));
    lessonIds.add(id);
    const refs = Array.from({ length: 4 }, () => reference(reader.u32()));
    const count = reader.count(1000),
      slots: DavSlot[] = [],
      slotStarts: number[] = [];
    for (let slotIndex = 0; slotIndex < count; slotIndex++) {
      const slotStart = reader.position;
      const slotId = reader.u32();
      expect(!slotIds.has(slotId));
      slotIds.add(slotId);
      expect(slotIds.size <= 150000 && reader.u32() === id);
      // 18-byte slot layout: day, start period, seven zero bytes, periods covered, seven zero bytes, flag.
      const rawStart = reader.take(18),
        layout = bytes.subarray(rawStart, rawStart + 18),
        span = layout[9];
      expect(
        layout[0] <= 7 &&
          layout[1] <= periods.length &&
          layout.subarray(2, 9).every((value) => value === 0) &&
          span >= 1 &&
          (layout[0] === 0 || layout[1] === 0 || layout[1] + span - 1 <= periods.length) &&
          layout.subarray(10, 17).every((value) => value === 0),
      );
      expect(reader.value() === 0 && reader.value() === 0);
      const roomOffset = reader.position;
      const room = reference(reader.u32());
      const lecturerOffset = reader.position;
      const lecturer = reference(reader.u32());
      reader.i32();
      slots.push({
        offset: rawStart,
        id: slotId,
        day: layout[0],
        period: layout[1],
        span,
        flag: layout[17],
        room,
        lecturer,
        roomOffset,
        lecturerOffset,
      });
      slotStarts.push(slotStart);
    }
    reader.i32();
    const maskStart = reader.position;
    const mask = reader.mask();
    reader.skipValue();
    reader.skipValue();
    const noteOffset = reader.position;
    const note = reader.text();
    const noteEnd = reader.position;
    const subject = reference(reader.u32());
    reader.i32();
    reader.skipValue();
    reader.skipValue();
    reader.u8();
    reader.text();
    reader.text();
    for (let field = 0; field < 8; field++) reader.skipValue();
    // Some revisions close a lesson with a raw 4-byte status marker instead of empty text.
    const status = reader.bytes[reader.position] === 4;
    if (status) {
      const marker = reader.take(4);
      expect(bytes[marker + 1] === 0 && bytes[marker + 2] === 2 && bytes[marker + 3] === 0);
    } else {
      reader.text();
      reader.skipValue();
    }
    const layout = reader.take(11);
    // The trailer count totals the periods the slots cover, not the slot records.
    expect(reader.view.getUint32(layout + 3, true) === slots.reduce((total, slot) => total + slot.span, 0));
    expect(reader.value() === 1 && reader.value() === 6 && typeof reader.value() === 'string' && reader.value() === 0);
    lessons.push({
      id,
      coupling: refs[0],
      recordStart,
      recordEnd: reader.position,
      terminator: status ? 0 : 1,
      trailerCountOffset: layout + 3,
      noteOffset,
      noteEnd,
      maskOffset: maskStart,
      classId: refs[1],
      subject,
      note,
      bits: activeBits(mask),
      slots,
      slotStarts,
    });
  }
  const insertPoint = reader.position;
  for (let field = 0; field < 3; field++) reader.skipValue();
  const reasons = reader.count(100);
  for (let reason = 0; reason < reasons; reason++) reader.text();
  reader.take(40);
  for (let field = 0; field < 4; field++) reader.skipValue();
  expect(reader.position === bytes.length);
  return { patterns, lessons, countTag: countCell, insertPoint };
}

// CWnn names refer to ISO weeks; 4 January always lies in ISO week 1.
function weekAnchor(patterns: Pattern[], start: string): string {
  const explicit: string[] = [],
    generic: string[] = [];
  for (const pattern of patterns) {
    const match = /^CW(\d+)(?: (\d{4}))?$/.exec(pattern.name.trim());
    if (!match || pattern.bits.length !== 1 || Number(match[1]) < 1 || Number(match[1]) > 53) continue;
    const year = match[2] || start.slice(0, 4);
    const anchor = addDays(monday(`${year}-01-04`), (Number(match[1]) - 1 - pattern.bits[0]) * 7);
    (match[2] ? explicit : generic).push(anchor);
  }
  const choices = explicit.length ? explicit : generic;
  if (!choices.length)
    throw new Error('This file has no recognised calendar-week reference. We can’t safely assign lesson dates yet.');
  const counts = new Map<string, number>();
  for (const choice of choices) counts.set(choice, (counts.get(choice) || 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  expect(ranked.length === 1 || ranked[0][1] > ranked[1][1]);
  return ranked[0][0];
}

const clock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function readDictionary(
  bytes: Uint8Array,
  names: NamedRecord[],
  classCount: number,
): { dictionary: Record<number, DictionaryEntry>; classRecords: ClassRecord[]; nameIndex: number } {
  const dictionary: Record<number, DictionaryEntry> = {};
  const classRecords: ClassRecord[] = [];
  let nameIndex = 0;
  for (const [category, initial] of [
    ['classes', classCount],
    ['staff', 0],
    ['rooms', 0],
    ['subjects', 0],
  ] as const) {
    const count = initial || countsBefore(bytes, names[nameIndex]?.position || 0, 5000)[0] || 0;
    expect(count > 0 && nameIndex + count <= names.length);
    const ids = new Set<number>();
    for (const record of names.slice(nameIndex, nameIndex + count)) {
      expect(!ids.has(record.id) && !dictionary[record.id]);
      ids.add(record.id);
      dictionary[record.id] = { category, name: record.name.trim() };
      if (category === 'classes') classRecords.push({ id: String(record.id), name: record.name.trim() });
    }
    nameIndex += count;
  }
  return { dictionary, classRecords, nameIndex };
}

function findTimetable(bytes: Uint8Array, records: NamedRecord[], periods: number[]): Timetable {
  for (const record of records) {
    for (const count of [...new Set(countsBefore(bytes, record.position, 10000))]) {
      try {
        return parseTimetable(bytes, record.position, count, periods);
      } catch {}
    }
  }
  throw failure();
}

function createDatasets(classRecords: ClassRecord[]): Record<string, ClassDataset> {
  const datasets: Record<string, ClassDataset> = {};
  for (const item of classRecords) datasets[item.id] = { class: item, events: [] };
  return datasets;
}

function buildExceptions(calendar: { exceptions: CalendarException[] }): {
  exceptions: Manifest['exceptions'];
  exceptionMap: Map<string, string[]>;
} {
  const exceptions: Manifest['exceptions'] = [];
  const exceptionMap = new Map<string, string[]>();
  for (const exception of calendar.exceptions) {
    expect(Date.parse(exception.end) - Date.parse(exception.start) <= 86400000 * 900);
    const allDay = exception.first === -1 && exception.last === -1;
    for (let date = exception.start; date <= exception.end; date = addDays(date, 1)) {
      exceptions.push({ date, name: exception.name || 'Calendar exception', allDay });
      const current = exceptionMap.get(date) || [];
      current.push(exception.name || 'Unlabelled exception');
      exceptionMap.set(date, current);
    }
  }
  return { exceptions, exceptionMap };
}

function groupSlots(slots: DavSlot[]): { groups: DavSlot[][]; omitted: number } {
  const grouped = new Map<string, DavSlot[]>();
  let omitted = 0;
  for (const slot of slots) {
    if (!slot.day || !slot.period || slot.flag) {
      omitted++;
      continue;
    }
    const key = `${slot.day}/${slot.lecturer}/${slot.room}`;
    const group = grouped.get(key) || [];
    group.push(slot);
    grouped.set(key, group);
  }
  return { groups: [...grouped.values()], omitted };
}

function buildBlocks(slots: DavSlot[], periods: number[], duration: number): DavSlot[][] {
  const blocks: DavSlot[][] = [];
  for (const slot of slots) {
    const previous = blocks.at(-1)?.at(-1);
    if (
      previous &&
      slot.period === previous.period + previous.span &&
      periods[slot.period - 1] === periods[previous.period - 2 + previous.span] + duration
    )
      blocks.at(-1)!.push(slot);
    else blocks.push([slot]);
  }
  return blocks;
}

function buildEvent(
  lesson: Lesson,
  date: string,
  block: DavSlot[],
  subjectName: string,
  context: EventContext,
): TimetableEvent {
  const first = block[0];
  const last = block.at(-1)!;
  return {
    id: `${context.hash.slice(0, 24)}-${lesson.id}-${date.replaceAll('-', '')}-${block.map((slot) => slot.id).join('.')}`,
    date,
    start: clock(context.periods[first.period - 1]),
    end: clock(context.periods[last.period + last.span - 2] + context.duration),
    subject: subjectName,
    lecturer: context.dictionary[first.lecturer]?.category === 'staff' ? context.dictionary[first.lecturer].name : '',
    room: context.dictionary[first.room]?.category === 'rooms' ? context.dictionary[first.room].name : '',
    note: lesson.note.trim(),
    exception: (context.exceptionMap.get(date) || []).join('; '),
    overlap: false,
  };
}

export async function decodeDav(buffer: ArrayBuffer, filename = 'Timetable.dav'): Promise<DavDecoded> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > MAX_FILE) throw new Error('Choose a timetable file smaller than 20 MB.');
  // File signature: 0x03 followed by the ASCII text "V30".
  expect(bytes.length > 200 && bytes[0] === 3 && bytes[1] === 86 && bytes[2] === 51 && bytes[3] === 48);
  const names = namedRecords(bytes);
  expect(names.length > 4);
  const calendar = calendarSection(bytes, names[0].position);
  const { dictionary, classRecords, nameIndex } = readDictionary(bytes, names, calendar.classes);
  // Header name at byte 50; the planning dates follow its record seven bytes later.
  const header = new Reader(bytes, 50);
  header.text();
  const dates = new Reader(bytes, header.position + 7);
  const planningStart = dateSerial(dates.f64()),
    planningEnd = dateSerial(dates.f64());
  expect(planningStart <= planningEnd && Date.parse(planningEnd) - Date.parse(planningStart) <= 86400000 * 900);
  // The per-period duration in minutes is stored in the file header.
  const duration = new DataView(buffer).getUint32(11, true);
  expect(duration >= 1 && duration <= 240);
  const { title, periods } = periodsSection(bytes, calendar.start, duration);
  const timetable = findTimetable(bytes, names.slice(nameIndex), periods);
  const anchor = weekAnchor(timetable.patterns, planningStart);
  // The cleared bit of ISO week W sits at offset (W - 1) - kb, where kb is the count of weeks between
  // the Monday of 4 January in the planning year and the Monday anchor derived from CW names.
  const planYear = planningStart.slice(0, 4);
  const weekAnchorBase = (Date.parse(monday(anchor)) - Date.parse(monday(`${planYear}-01-04`))) / 604800000;
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const { exceptions, exceptionMap } = buildExceptions(calendar);
  const datasets = createDatasets(classRecords);
  const context: EventContext = { hash, periods, duration, dictionary, exceptionMap };
  let total = 0,
    omitted = 0;
  const lecturerEvents: TimetableEvent[] = [],
    editorEvents: Record<string, DavEditorEvent> = {};
  for (const lesson of timetable.lessons) {
    const target = datasets[String(lesson.classId)],
      subject = dictionary[lesson.subject];
    if (subject?.category !== 'subjects') continue;
    const grouped = groupSlots(lesson.slots);
    omitted += grouped.omitted;
    for (const slots of grouped.groups) {
      slots.sort((a, b) => a.period - b.period || a.id - b.id);
      const blocks = buildBlocks(slots, periods, duration);
      for (const bit of lesson.bits) {
        const date = addDays(anchor, bit * 7 + slots[0].day - 1);
        if (date < planningStart || date > planningEnd) continue;
        for (const block of blocks) {
          expect(lecturerEvents.length < 200000);
          const entry = buildEvent(lesson, date, block, subject.name, context);
          editorEvents[entry.id] = {
            lessonId: lesson.id,
            coupling: lesson.coupling,
            noteOffset: lesson.noteOffset,
            noteEnd: lesson.noteEnd,
            note: lesson.note,
            slots: block,
          };
          lecturerEvents.push({ ...entry, className: target?.class.name || 'Resource / activity' });
          if (target) {
            target.events.push(entry);
            total++;
          }
        }
      }
    }
  }
  for (const dataset of Object.values(datasets)) {
    dataset.events.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.subject.localeCompare(b.subject) ||
        a.id.localeCompare(b.id),
    );
    markOverlaps(dataset.events);
    Object.assign(dataset.class, {
      eventCount: dataset.events.length,
      firstDate: dataset.events[0]?.date || null,
      lastDate: dataset.events.at(-1)?.date || null,
    });
  }
  const classes = classRecords.sort((a, b) => a.name.localeCompare(b.name));
  const lecturers = [...new Set(lecturerEvents.map((event) => event.lecturer).filter(Boolean))]
    .sort()
    .map((name, index) => ({ id: String(index + 1), name }));
  const manifest: Manifest = {
    sourceHash: hash,
    lecturers,
    title,
    timezone: 'Asia/Kuala_Lumpur',
    sourceRevision: 'Your local file',
    filename,
    planningStart,
    planningEnd,
    reconstructed: true,
    classes,
    exceptions,
  };
  const editorLessons: Record<string, DavLesson> = {};
  for (const lesson of timetable.lessons) {
    editorLessons[String(lesson.id)] = {
      lessonId: lesson.id,
      coupling: lesson.coupling,
      classId: lesson.classId,
      subjectRef: lesson.subject,
      recordStart: lesson.recordStart,
      recordEnd: lesson.recordEnd,
      terminator: lesson.terminator,
      trailerCountOffset: lesson.trailerCountOffset,
      noteOffset: lesson.noteOffset,
      noteEnd: lesson.noteEnd,
      maskOffset: lesson.maskOffset,
      bits: lesson.bits,
      slotStarts: lesson.slotStarts,
      slots: lesson.slots,
    };
  }
  return {
    editor: {
      events: editorEvents,
      periods,
      duration,
      staff: Object.entries(dictionary)
        .filter(([, entry]) => entry.category === 'staff')
        .map(([id, entry]) => ({ id, name: entry.name })),
      rooms: Object.entries(dictionary)
        .filter(([, entry]) => entry.category === 'rooms')
        .map(([id, entry]) => ({ id, name: entry.name })),
      subjects: Object.entries(dictionary)
        .filter(([, entry]) => entry.category === 'subjects')
        .map(([id, entry]) => ({ id, name: entry.name })),
      lessons: editorLessons,
      lessonCountTag: timetable.countTag,
      lessonInsertPoint: timetable.insertPoint,
      weekAnchor: anchor,
      weekAnchorBase,
    },
    lecturerEvents,
    manifest,
    datasets,
    omitted,
    total,
  };
}
