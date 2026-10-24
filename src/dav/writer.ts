import { davConflictMessage, davFreeWeeks, davPlacementConflicts } from './conflicts.js';
import { decodeDav } from './reader.js';
import { memberAppendSplices, memberRemoveSplices } from './splice.js';
import type { DavCountTag, DavDecoded, DavEditor, DavLesson, DavSlot, DavStaff } from './types.js';

const cp1252 = new TextDecoder('windows-1252');
const cp1252Lookup = new Map(Array.from({ length: 256 }, (_, value) => [cp1252.decode(Uint8Array.of(value)), value]));
const UNLISTED = 0xffffffff;

export interface DavEdit {
  note: string;
  day: number;
  period: number;
  room?: string;
  lecturer?: string;
}

export interface DavAdd {
  classId: string;
  subjectId: string;
  day: number;
  period: number;
  span: number;
  weeks?: number[];
  lecturer?: string;
  room?: string;
  note?: string;
  /**
   * Collision handling for the clone: "keep" writes the lesson as requested (default, the hitherto
   * behavior), "error" aborts the add when any requested week overlaps another lesson, and
   * "drop-weeks" pulls colliding calendar weeks out of the clone's week mask.
   */
  conflictPolicy?: 'error' | 'drop-weeks' | 'keep';
}

function encodeText(value: string): Uint8Array {
  const chars = [...value];
  if (chars.length > 255 || chars.some((char) => !cp1252Lookup.has(char)))
    throw new Error('DAV notes support up to 255 Windows-1252 characters.');
  return Uint8Array.from([6, chars.length, ...chars.map((char) => cp1252Lookup.get(char) as number)]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface Patch {
  start: number;
  end: number;
  replace: Uint8Array;
}

function applyPatches(bytes: Uint8Array, patches: Patch[]): Uint8Array {
  const sorted = [...patches].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 0; index < sorted.length; index++) {
    const patch = sorted[index];
    if (patch.start < 0 || patch.end > bytes.length || patch.start > patch.end)
      throw new Error('This entry cannot be edited in this file. Reopen the lesson before editing.');
    if (index > 0 && patch.start < sorted[index - 1].end)
      throw new Error('This entry cannot be edited in this file. Reopen the lesson before editing.');
  }
  const total =
    bytes.length + sorted.reduce((sum, patch) => sum + (patch.replace.length - (patch.end - patch.start)), 0);
  const output = new Uint8Array(total);
  let from = 0,
    to = 0;
  for (const patch of sorted) {
    output.set(bytes.subarray(from, patch.start), to);
    to += patch.start - from;
    output.set(patch.replace, to);
    to += patch.replace.length;
    from = patch.end;
  }
  output.set(bytes.subarray(from), to);
  return output;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function rewriteCount(tag: DavCountTag, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647)
    throw new Error('The lesson count cannot be rewritten safely.');
  let encoding = tag.encoding,
    width = tag.width;
  if (value > (encoding === 2 ? 127 : 32767)) {
    [encoding, width] = encoding === 2 ? [3, 2] : [4, 4];
    if (value > 32767) [encoding, width] = [4, 4];
  }
  const bytes = new Uint8Array(1 + width);
  bytes[0] = encoding;
  if (width === 1) bytes[1] = value & 0xff;
  else if (width === 2) new DataView(bytes.buffer).setInt16(1, value, true);
  else new DataView(bytes.buffer).setInt32(1, value, true);
  return bytes;
}

function staffValue(id: string | undefined, list: DavStaff[], label: string): number | null {
  if (id === undefined) return null;
  if (id === '') return UNLISTED;
  const value = Number(id);
  if (!Number.isInteger(value) || value < 1 || value >= UNLISTED || !list.some((entry) => entry.id === id))
    throw new Error(`Choose a ${label} that exists in the timetable file.`);
  return value;
}

function placed(slot: DavSlot): boolean {
  return slot.day >= 1 && slot.day <= 7 && slot.period >= 1 && !slot.flag;
}

function selectTemplate(editor: DavEditor, span: number): DavLesson {
  const decodable = new Set(Object.values(editor.events).map((entry) => entry.lessonId));
  const records = [...Object.values(editor.lessons)].sort((a, b) => a.recordStart - b.recordStart);
  const fresh = records.filter(
    (record) =>
      record.coupling === -1 &&
      record.terminator === 1 &&
      decodable.has(record.lessonId) &&
      record.slots.length === 1 &&
      placed(record.slots[0]),
  );
  const relaxed = records.filter(
    (record) => record.coupling === -1 && decodable.has(record.lessonId) && record.slots.filter(placed).length === 1,
  );
  const pick = (candidates: DavLesson[]): DavLesson | undefined => {
    const matching = candidates.filter((record) => record.slots.some((slot) => slot.span === span));
    return matching.at(-1) ?? candidates.at(-1);
  };
  const template = pick(fresh) ?? pick(relaxed);
  if (!template)
    throw new Error(
      'This file has no repeating lesson that can be cloned into a new one. Add a repeating lesson in DaVinci first.',
    );
  return template;
}

function encodeWeekMask(editor: DavEditor, weeks: number[]): Uint8Array {
  if (!Array.isArray(weeks) || !weeks.length || weeks.some((week) => !Number.isInteger(week) || week < 1 || week > 53))
    throw new Error('Choose whole calendar weeks between 1 and 53.');
  if (new Set(weeks).size !== weeks.length) throw new Error('Choose every calendar week only once.');
  return encodeBitsMask(weeks.map((week) => week - 1 - editor.weekAnchorBase));
}

// Every repeating calendar week is a cleared bit inside the 64-bit week mask (bit index =
// calendar week - 1 - weekAnchorBase, the mapping reader.ts decodes with).
function encodeBitsMask(bits: number[]): Uint8Array {
  let mask = (1n << 64n) - 1n;
  for (const bit of bits) {
    if (!Number.isInteger(bit) || bit < 0 || bit > 63)
      throw new Error('Choose weeks that fit inside the timetable planning window.');
    mask &= ~(1n << BigInt(bit));
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, mask, true);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

interface CloneSpec {
  lessonId: number;
  slotIds: number[];
  classId: number;
  subjectId: number;
  day: number;
  period: number;
  span: number;
  spanSum: number;
  room: number | null;
  lecturer: number | null;
  note: Uint8Array;
  mask?: Uint8Array;
}

function cloneRecord(bytes: Uint8Array, template: DavLesson, spec: CloneSpec): Uint8Array {
  const placedIndex = template.slots.findIndex(placed);
  if (placedIndex < 0 || template.noteEnd >= template.trailerCountOffset)
    throw new Error(
      'This file has no repeating lesson that can be cloned into a new one. Add a repeating lesson in DaVinci first.',
    );
  const slot = template.slots[placedIndex];
  const prefix: Patch[] = [
    { start: template.recordStart, end: template.recordStart + 4, replace: u32(spec.lessonId) },
    { start: template.recordStart + 4, end: template.recordStart + 8, replace: u32(UNLISTED) },
    { start: template.recordStart + 8, end: template.recordStart + 12, replace: u32(spec.classId) },
  ];
  template.slots.forEach((_, index) => {
    const slotStart = template.slotStarts[index];
    prefix.push({ start: slotStart, end: slotStart + 4, replace: u32(spec.slotIds[index]) });
    prefix.push({ start: slotStart + 4, end: slotStart + 8, replace: u32(spec.lessonId) });
  });
  const layout = bytes.slice(slot.offset, slot.offset + 18);
  layout[0] = spec.day;
  layout[1] = spec.period;
  layout[9] = spec.span;
  prefix.push({ start: slot.offset, end: slot.offset + 18, replace: layout });
  if (spec.room !== null) prefix.push({ start: slot.roomOffset, end: slot.roomOffset + 4, replace: u32(spec.room) });
  if (spec.lecturer !== null)
    prefix.push({ start: slot.lecturerOffset, end: slot.lecturerOffset + 4, replace: u32(spec.lecturer) });
  if (spec.mask) prefix.push({ start: template.maskOffset, end: template.maskOffset + 8, replace: spec.mask });
  const suffix: Patch[] = [
    { start: template.noteEnd, end: template.noteEnd + 4, replace: u32(spec.subjectId) },
    { start: template.trailerCountOffset, end: template.trailerCountOffset + 4, replace: u32(spec.spanSum) },
  ];
  const prefixBytes = applyPatches(
    bytes.slice(template.recordStart, template.noteOffset),
    prefix.map(({ start, end, replace }) => ({
      start: start - template.recordStart,
      end: end - template.recordStart,
      replace,
    })),
  );
  const suffixBytes = applyPatches(
    bytes.slice(template.noteEnd, template.recordEnd),
    suffix.map(({ start, end, replace }) => ({
      start: start - template.noteEnd,
      end: end - template.noteEnd,
      replace,
    })),
  );
  return concatBytes(prefixBytes, spec.note, suffixBytes);
}

function countPatch(tag: DavCountTag, value: number): Patch {
  const start = tag.position;
  const bytes = rewriteCount(tag, value);
  return { start, end: start + 1 + tag.width, replace: bytes };
}

export async function editDav(
  buffer: ArrayBuffer,
  editor: DavEditor,
  eventId: string,
  { note, day, period, room, lecturer }: DavEdit,
): Promise<{ buffer: ArrayBuffer; decoded: DavDecoded }> {
  const record = editor.events[eventId];
  if (!record) throw new Error('This entry cannot be edited.');
  const slots = record.slots,
    covered = slots.reduce((sum, slot) => sum + slot.span, 0);
  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > 7 ||
    !Number.isInteger(period) ||
    period < 1 ||
    period + covered - 1 > editor.periods.length
  )
    throw new Error('Choose a weekday and a start period that fits the whole lesson.');
  let offset = 0;
  const starts = slots.map((slot) => {
    const start = period + offset;
    offset += slot.span;
    return start;
  });
  if (slots.some((slot, index) => slot.day !== day || slot.period !== starts[index]) && record.coupling !== -1)
    throw new Error(
      'Linked lessons must be moved together in DaVinci. You can change the room, lecturer and notes here.',
    );
  for (let index = 1; index < covered; index++)
    if (editor.periods[period + index - 1] !== editor.periods[period + index - 2] + editor.duration)
      throw new Error('This lesson needs consecutive clock periods.');
  const roomValue = staffValue(room, editor.rooms, 'room');
  const lecturerValue = staffValue(lecturer, editor.staff, 'lecturer');
  const bytes = new Uint8Array(buffer.slice(0));
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  for (const slot of slots)
    if (
      bytes[slot.offset] !== slot.day ||
      bytes[slot.offset + 1] !== slot.period ||
      (roomValue !== null && view.getUint32(slot.roomOffset, true) !== (slot.room === -1 ? UNLISTED : slot.room)) ||
      (lecturerValue !== null &&
        view.getUint32(slot.lecturerOffset, true) !== (slot.lecturer === -1 ? UNLISTED : slot.lecturer))
    )
      throw new Error('The source changed. Reopen the lesson before editing.');
  // Each slot stores its weekday and period in the first two bytes.
  for (const [index, slot] of slots.entries()) {
    bytes[slot.offset] = day;
    bytes[slot.offset + 1] = starts[index];
    if (roomValue !== null) view.setUint32(slot.roomOffset, roomValue, true);
    if (lecturerValue !== null) view.setUint32(slot.lecturerOffset, lecturerValue, true);
  }
  const encoded = encodeText(note);
  const output = new Uint8Array(bytes.length - (record.noteEnd - record.noteOffset) + encoded.length);
  output.set(bytes.subarray(0, record.noteOffset));
  output.set(encoded, record.noteOffset);
  output.set(bytes.subarray(record.noteEnd), record.noteOffset + encoded.length);
  const edited = toArrayBuffer(output);
  const decoded = await decodeDav(edited);
  return { buffer: edited, decoded };
}

export async function addLesson(
  buffer: ArrayBuffer,
  editor: DavEditor,
  add: DavAdd,
): Promise<{ buffer: ArrayBuffer; decoded: DavDecoded }> {
  const classId = Number(add.classId),
    subjectId = Number(add.subjectId);
  if (!Number.isInteger(classId) || classId < 1 || classId >= UNLISTED)
    throw new Error('Choose a class that exists in the timetable file.');
  if (!Number.isInteger(subjectId) || subjectId < 1 || subjectId >= UNLISTED)
    throw new Error('Choose a subject that exists in the timetable file.');
  if (
    !Number.isInteger(add.day) ||
    add.day < 1 ||
    add.day > 7 ||
    !Number.isInteger(add.period) ||
    add.period < 1 ||
    !Number.isInteger(add.span) ||
    add.span < 1 ||
    add.period + add.span - 1 > editor.periods.length
  )
    throw new Error('Choose a weekday and a start period that fits the whole lesson.');
  for (let index = 1; index < add.span; index++)
    if (editor.periods[add.period + index - 1] !== editor.periods[add.period + index - 2] + editor.duration)
      throw new Error('This lesson needs consecutive clock periods.');
  // An explicit week list replaces the template's week mask; without it the clone repeats whenever the
  // template does.
  let mask = add.weeks === undefined ? undefined : encodeWeekMask(editor, add.weeks);
  const roomValue = staffValue(add.room, editor.rooms, 'room');
  const lecturerValue = staffValue(add.lecturer, editor.staff, 'lecturer');
  const template = selectTemplate(editor, add.span);
  const [lessonId] = nextIds(editor, 0, 1);
  // 0-based week-bit indices of the clone's repeating weeks: the requested calendar weeks or the
  // template's own bits. Colliding weeks shrink the mask for the "drop-weeks" policy.
  const requestedBits =
    add.weeks === undefined ? template.bits.slice() : add.weeks.map((week) => week - 1 - editor.weekAnchorBase);
  const placement = {
    classId,
    day: add.day,
    period: add.period,
    span: add.span,
    lecturer: lecturerValue,
    room: roomValue,
    weeks: requestedBits,
  };
  // daVinciLook resolves a grid cell to exactly one lesson: a class collision lets the other lesson
  // win the cell, hiding the clone (the app-verified Wednesday-33 "Student/Staff Activity" case).
  // Owner-level double bookings (lecturer, room) render side by side in daVinci and stay non-fatal.
  const conflictPolicy = add.conflictPolicy ?? 'keep';
  const collisions = davPlacementConflicts(editor, placement).filter((entry) => entry.scope === 'class');
  if (collisions.length && conflictPolicy !== 'keep') {
    if (conflictPolicy === 'drop-weeks') {
      const freeBits = davFreeWeeks(editor, placement, 'class');
      if (!freeBits.length)
        throw new Error(
          `Every chosen calendar week already carries a lesson at this slot. ${davConflictMessage(collisions)}`,
        );
      mask = encodeBitsMask(freeBits);
    } else throw new Error(`The lesson would collide with an existing one. ${davConflictMessage(collisions)}`);
  }
  const bytes = new Uint8Array(buffer.slice(0));
  const record = cloneRecord(bytes, template, {
    lessonId,
    slotIds: nextIds(editor, lessonId + 1, template.slots.length),
    classId,
    subjectId,
    day: add.day,
    period: add.period,
    span: add.span,
    spanSum: add.span + template.slots.filter((slot) => !placed(slot)).reduce((sum, slot) => sum + slot.span, 0),
    room: roomValue,
    lecturer: lecturerValue,
    note: encodeText(add.note ?? ''),
    mask,
  });
  // daVinciLook renders a lesson only when its id is listed in the member array of every owning
  // registry record (class, subject, lecturer, room) — the probe battery proved unregistered clones
  // stay hidden, so the clone splices registering rows here, together with the lesson record.
  const registrations: Array<{ role: 'class' | 'subject' | 'lecturer' | 'room'; id: number }> = [
    { role: 'class', id: classId },
    { role: 'subject', id: subjectId },
  ];
  if (lecturerValue !== null && lecturerValue < UNLISTED) registrations.push({ role: 'lecturer', id: lecturerValue });
  if (roomValue !== null && roomValue < UNLISTED) registrations.push({ role: 'room', id: roomValue });
  const registrationRows = registrations.flatMap(({ role, id }) => {
    try {
      return memberAppendSplices(bytes, id, lessonId);
    } catch {
      throw new Error(`The chosen ${role} is not part of this timetable file.`);
    }
  });
  const output = applyPatches(bytes, [
    countPatch(editor.lessonCountTag, editor.lessonCountTag.value + 1),
    // daVinciLook only renders lessons that live inside the lesson table run: records appended
    // behind the last existing one are ignored, so the clone is spliced right after its template.
    { start: template.recordEnd, end: template.recordEnd, replace: record },
    ...registrationRows,
  ]);
  const edited = toArrayBuffer(output);
  const decoded = await decodeDav(edited);
  if (!decoded.datasets[String(classId)]) throw new Error('The chosen class is not part of this timetable file.');
  const rows = decoded.lecturerEvents.filter((row) => decoded.editor.events[row.id]?.lessonId === lessonId);
  if (!rows.length) throw new Error('The chosen subject is not part of this timetable file.');
  return { buffer: edited, decoded };
}

function nextIds(editor: DavEditor, start: number, count: number): number[] {
  // Lesson ids, slot ids and coupling references share the id space; stale couplings may point past
  // every record, so new ids must skip anything referenced anywhere.
  let max = 0;
  const taken = new Set<number>();
  for (const record of Object.values(editor.lessons)) {
    if (record.lessonId > max) max = record.lessonId;
    for (const slot of record.slots) if (slot.id > max) max = slot.id;
  }
  for (const record of Object.values(editor.lessons)) {
    taken.add(record.lessonId);
    if (record.coupling !== -1) taken.add(record.coupling);
    for (const slot of record.slots) taken.add(slot.id);
  }
  const ids: number[] = [];
  let id = Math.max(start, max + 1);
  while (ids.length < count) {
    if (!taken.has(id)) ids.push(id);
    id++;
  }
  return ids;
}

export async function deleteLesson(
  buffer: ArrayBuffer,
  editor: DavEditor,
  lessonId: number,
): Promise<{ buffer: ArrayBuffer; decoded: DavDecoded }> {
  const record = editor.lessons[String(lessonId)];
  if (!record) throw new Error('This lesson is not part of the timetable file. Reopen it before deleting.');
  if (editor.lessonCountTag.value < 2) throw new Error('The timetable always needs at least one lesson.');
  if (record.coupling !== -1)
    throw new Error('This lesson belongs to a linked group. Remove it in DaVinci before editing here.');
  if (Object.values(editor.lessons).some((other) => other.coupling === record.lessonId))
    throw new Error('Other lessons link to this one. Remove the whole coupling in DaVinci first.');
  const bytes = new Uint8Array(buffer.slice(0));
  // The member arrays of the owning registries (class, subject, lecturers, rooms) keep the lesson id
  // registered; delete those rows with the record so no stale id survives, while registries whose
  // arrays never held it (legacy files) remove gracefully.
  const owners = new Set<number>([record.classId]);
  if (Number.isInteger(record.subjectRef) && record.subjectRef >= 1 && record.subjectRef < UNLISTED)
    owners.add(record.subjectRef);
  for (const slot of record.slots) {
    if (slot.lecturer >= 1 && slot.lecturer < UNLISTED) owners.add(slot.lecturer);
    if (slot.room >= 1 && slot.room < UNLISTED) owners.add(slot.room);
  }
  const output = applyPatches(bytes, [
    countPatch(editor.lessonCountTag, editor.lessonCountTag.value - 1),
    { start: record.recordStart, end: record.recordEnd, replace: new Uint8Array(0) },
    ...[...owners].flatMap((owner) => memberRemoveSplices(bytes, owner, record.lessonId)),
  ]);
  const edited = toArrayBuffer(output);
  const decoded = await decodeDav(edited);
  return { buffer: edited, decoded };
}

export function davDownload(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], { type: 'application/octet-stream' });
}
