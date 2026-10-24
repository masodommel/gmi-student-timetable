import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { decodeDav } from '../src/dav/index.js';
import {
  cloneRecordSplice,
  deleteRecordSplice,
  locateMemberList,
  locateRecordSpan,
  memberAppendSplices,
  memberRemoveSplices,
} from '../src/dav/splice.js';
import type { DavLesson } from '../src/dav/types.js';

// Splice ground truth was verified against this 1.15 MB reference plan; tests skip when it's absent.
const REFERENCE_DAV = 'C:/Users/sharp/Desktop/GMI Schedules/DAVINCI/2025/TT JULY 2025_R04J_03082025.dav';
const hasReference = existsSync(REFERENCE_DAV);

const asBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const loadReference = async (): Promise<Uint8Array> => new Uint8Array(asBuffer(await readFile(REFERENCE_DAV)));

const u32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

// Fake pool layout mirroring the verified format: [count token][records back to back], every record
// being [u32 id][02 FF][06 length name][inert filler] with the filler's 0xCC bytes unscannable.
const named = (id: number, name: string, filler: number): Uint8Array =>
  concat(
    u32(id),
    Uint8Array.from([2, 255, 6, name.length]),
    Uint8Array.from(name, (char) => char.charCodeAt(0)),
    new Uint8Array(filler).fill(0xcc),
  );

// [aa bb] [03 02 00] record A spans 5..26 and record B spans 26..44.
const synthetic = concat(
  Uint8Array.from([0xaa, 0xbb]),
  Uint8Array.from([3, 2, 0]),
  named(101, 'A', 12),
  named(202, 'BB', 8),
);

test('locateRecordSpan delimits record spans with their pool count token', () => {
  assert.deepEqual(locateRecordSpan(synthetic, 101), {
    start: 5,
    end: 26,
    tableTokenOffset: 2,
    tableTokenLength: 3,
    tableTokenValue: 2,
  });
  assert.deepEqual(locateRecordSpan(synthetic, 202), {
    start: 26,
    end: 44,
    tableTokenOffset: 2,
    tableTokenLength: 3,
    tableTokenValue: 2,
  });
  assert.throws(() => locateRecordSpan(synthetic, 999), /not part/);
});

test('cloneRecordSplice copies the source record verbatim and renumbers its leading id', () => {
  const cloned = cloneRecordSplice(synthetic, 101, 303);
  assert.equal(cloned.length, synthetic.length + 21);
  assert.deepEqual(cloned.subarray(0, 2), Uint8Array.from([0xaa, 0xbb]));
  assert.deepEqual(cloned.subarray(2, 5), Uint8Array.from([3, 3, 0]));
  assert.deepEqual(cloned.subarray(5, 26), synthetic.subarray(5, 26));
  assert.deepEqual(cloned.subarray(26, 47), concat(u32(303), synthetic.subarray(9, 26)));
  assert.deepEqual(cloned.subarray(47), synthetic.subarray(26));
  assert.deepEqual(locateRecordSpan(cloned, 303), {
    start: 26,
    end: 47,
    tableTokenOffset: 2,
    tableTokenLength: 3,
    tableTokenValue: 3,
  });
});

test('deleteRecordSplice removes the record span and decrements the pool token', () => {
  const deleted = deleteRecordSplice(synthetic, 202);
  assert.equal(deleted.length, synthetic.length - 18);
  assert.deepEqual(deleted, concat(synthetic.subarray(0, 2), Uint8Array.from([3, 1, 0]), synthetic.subarray(5, 26)));
  assert.deepEqual(deleted.subarray(2, 5), Uint8Array.from([3, 1, 0]));
});

test('the last remaining record of a pool refuses deletion', () => {
  const thinned = deleteRecordSplice(synthetic, 101);
  assert.deepEqual(thinned, concat(synthetic.subarray(0, 2), Uint8Array.from([3, 1, 0]), named(202, 'BB', 8)));
  assert.throws(() => deleteRecordSplice(thinned, 202), /at least one record/);
});

test('ids that collide with any existing record pool entry are rejected', () => {
  assert.throws(() => cloneRecordSplice(synthetic, 101, 202), /already taken/);
  assert.throws(() => cloneRecordSplice(synthetic, 101, 0xffffffff), /not a usable record id/);
  assert.throws(() => cloneRecordSplice(synthetic, 101, 101), /already belongs to the source record/);
});

test('pool hints disambiguate record ids shared by two pools', () => {
  const twin = concat(Uint8Array.from([3, 1, 0]), named(7, 'C', 4), Uint8Array.from([3, 1, 0]), named(7, 'D', 4));
  assert.throws(() => locateRecordSpan(twin, 7), /more than one record pool/);
  assert.deepEqual(locateRecordSpan(twin, 7, 3), {
    start: 3,
    end: 16,
    tableTokenOffset: 0,
    tableTokenLength: 3,
    tableTokenValue: 1,
  });
  assert.deepEqual(locateRecordSpan(twin, 7, 19), {
    start: 19,
    end: 32,
    tableTokenOffset: 16,
    tableTokenLength: 3,
    tableTokenValue: 1,
  });
  // The hint steers the clone into the hinted pool without touching the other pool's bytes.
  const cloned = cloneRecordSplice(twin, 7, 8, 3);
  assert.deepEqual(cloned.subarray(16, 29), named(8, 'C', 4));
  assert.deepEqual(cloned.subarray(29), twin.subarray(16));
});

test(
  'teacher record clones renumber into the staff pool and keep the source byte-exact',
  { skip: !hasReference },
  async () => {
    const bytes = await loadReference();
    const original = await decodeDav(asBuffer(bytes), 'reference.dav');
    const teacher = original.editor.staff[0];
    const id = Number(teacher.id);
    // Verified staff pool facts: records back to back behind [03] count token 250 at file offset 41788.
    const span = locateRecordSpan(bytes, id);
    assert.deepEqual(span, {
      start: 92649,
      end: 92987,
      tableTokenOffset: 41788,
      tableTokenLength: 3,
      tableTokenValue: 250,
    });
    assert.equal(span.tableTokenValue, original.editor.staff.length);
    const { spliced, newId } = ((): { spliced: Uint8Array; newId: number } => {
      for (
        let newId = Math.max(...original.editor.staff.map((entry) => Number(entry.id))) + 1;
        newId < 0xffffffff;
        newId++
      ) {
        try {
          return { spliced: cloneRecordSplice(bytes, id, newId), newId };
        } catch (error) {
          assert.match(String(error), /already taken/);
        }
      }
      throw new Error('No free record id beyond the staff pool.');
    })();
    assert.equal(spliced.length, bytes.length + (span.end - span.start));
    assert.deepEqual(spliced.subarray(0, span.tableTokenOffset), bytes.subarray(0, span.tableTokenOffset));
    assert.deepEqual(
      spliced.subarray(span.tableTokenOffset, span.tableTokenOffset + span.tableTokenLength),
      Uint8Array.from([3, 251, 0]),
    );
    assert.deepEqual(
      spliced.subarray(span.tableTokenOffset + span.tableTokenLength, span.end),
      bytes.subarray(span.tableTokenOffset + span.tableTokenLength, span.end),
    );
    const inserted = spliced.subarray(span.end, span.end + (span.end - span.start));
    assert.deepEqual(inserted.subarray(0, 4), u32(newId));
    assert.deepEqual(inserted.subarray(4), squash(bytes.subarray(span.start + 4, span.end), id, newId));
    const decoded = await decodeDav(asBuffer(spliced), 'reference.dav');
    assert.equal(decoded.editor.staff.length, original.editor.staff.length + 1);
    const fresh = decoded.editor.staff.find((entry) => entry.id === String(newId));
    assert.ok(fresh);
    assert.equal(fresh.name, teacher.name);
    assert.deepEqual(
      decoded.editor.staff.filter((entry) => entry.id !== String(newId)),
      original.editor.staff,
    );
    assert.equal(decoded.total, original.total);
    assert.throws(() => cloneRecordSplice(bytes, id, Number(original.editor.staff[1].id)), /already taken/);
    assert.throws(() => cloneRecordSplice(bytes, id, Number(original.editor.subjects[0].id)), /already taken/);
  },
);

test(
  'subject record clones renumber into the subject pool and keep the source byte-exact',
  { skip: !hasReference },
  async () => {
    const bytes = await loadReference();
    const original = await decodeDav(asBuffer(bytes), 'reference.dav');
    const subject = original.editor.subjects[0];
    const id = Number(subject.id);
    // Verified subject pool facts: records back to back behind [03] count token 671 at file offset 146065.
    const span = locateRecordSpan(bytes, id);
    assert.deepEqual(span, {
      start: 204680,
      end: 204795,
      tableTokenOffset: 146065,
      tableTokenLength: 3,
      tableTokenValue: 671,
    });
    assert.equal(span.tableTokenValue, original.editor.subjects.length);
    const { spliced, newId } = ((): { spliced: Uint8Array; newId: number } => {
      for (
        let newId = Math.max(...original.editor.subjects.map((entry) => Number(entry.id))) + 1;
        newId < 0xffffffff;
        newId++
      ) {
        try {
          return { spliced: cloneRecordSplice(bytes, id, newId), newId };
        } catch (error) {
          assert.match(String(error), /already taken/);
        }
      }
      throw new Error('No free record id beyond the subject pool.');
    })();
    assert.equal(spliced.length, bytes.length + (span.end - span.start));
    assert.deepEqual(spliced.subarray(0, span.tableTokenOffset), bytes.subarray(0, span.tableTokenOffset));
    assert.deepEqual(
      spliced.subarray(span.tableTokenOffset, span.tableTokenOffset + span.tableTokenLength),
      Uint8Array.from([3, 0xa0, 2]),
    );
    assert.deepEqual(
      spliced.subarray(span.tableTokenOffset + span.tableTokenLength, span.end),
      bytes.subarray(span.tableTokenOffset + span.tableTokenLength, span.end),
    );
    const inserted = spliced.subarray(span.end, span.end + (span.end - span.start));
    assert.deepEqual(inserted.subarray(0, 4), u32(newId));
    assert.deepEqual(inserted.subarray(4), squash(bytes.subarray(span.start + 4, span.end), id, newId));
    const decoded = await decodeDav(asBuffer(spliced), 'reference.dav');
    assert.equal(decoded.editor.subjects.length, original.editor.subjects.length + 1);
    const fresh = decoded.editor.subjects.find((entry) => entry.id === String(newId));
    assert.ok(fresh);
    assert.equal(fresh.name, subject.name);
    assert.deepEqual(
      decoded.editor.subjects.filter((entry) => entry.id !== String(newId)),
      original.editor.subjects,
    );
    assert.equal(decoded.total, original.total);
    assert.throws(() => cloneRecordSplice(bytes, id, Number(original.editor.subjects[1].id)), /already taken/);
  },
);

test(
  'deleting a teacher record decrements the staff pool token and keeps the layout',
  { skip: !hasReference },
  async () => {
    const bytes = await loadReference();
    const original = await decodeDav(asBuffer(bytes), 'reference.dav');
    const teacher = original.editor.staff[0];
    const id = Number(teacher.id);
    const span = locateRecordSpan(bytes, id);
    const spliced = deleteRecordSplice(bytes, id);
    assert.equal(spliced.length, bytes.length - (span.end - span.start));
    assert.deepEqual(spliced.subarray(0, span.tableTokenOffset), bytes.subarray(0, span.tableTokenOffset));
    assert.deepEqual(
      spliced.subarray(span.tableTokenOffset, span.tableTokenOffset + span.tableTokenLength),
      Uint8Array.from([3, 249, 0]),
    );
    assert.deepEqual(
      spliced.subarray(span.tableTokenOffset + span.tableTokenLength),
      concat(bytes.subarray(span.tableTokenOffset + span.tableTokenLength, span.start), bytes.subarray(span.end)),
    );
    const decoded = await decodeDav(asBuffer(spliced), 'reference.dav');
    assert.equal(decoded.editor.staff.length, original.editor.staff.length - 1);
    assert.ok(!decoded.editor.staff.some((entry) => entry.id === String(id)));
    assert.deepEqual(
      decoded.editor.staff,
      original.editor.staff.filter((entry) => entry.id !== String(id)),
    );
    assert.equal(decoded.total, original.total);
  },
);

// Re-ids the record body the way cloneRecordSplice does: every u32 that equals the old id becomes
// the new id (verified to be exactly the leading id for staff and subject record bodies).
const squash = (body: Uint8Array, sourceId: number, newId: number): Uint8Array => {
  const output = body.slice();
  const view = new DataView(output.buffer);
  for (let offset = 0; offset + 4 <= output.length; offset++) {
    if (view.getUint32(offset, true) === sourceId) {
      view.setUint32(offset, newId, true);
      offset += 3;
    }
  }
  return output;
};

// Registry-style record with the probe-verified member layout: [u32 id][02 FF][06 name][06 '']
// [06 ''][f64][4B color][tagged count][u32 ..count]. Counts below 128 use the [02] token, above
// the [03] i16 token.
const registryRecord = (id: number, name: string, members: number[] = []): Uint8Array =>
  concat(
    u32(id),
    Uint8Array.from([2, 255, 6, name.length]),
    Uint8Array.from(name, (char) => char.charCodeAt(0)),
    Uint8Array.from([6, 0]),
    Uint8Array.from([6, 0]),
    new Uint8Array(12), // f64 + color
    members.length > 127
      ? Uint8Array.from([3, members.length & 255, members.length >> 8])
      : Uint8Array.from([2, members.length]),
    ...members.map(u32),
  );

// [aa bb] [03 02 00] record 101 spans 3..40 with members [11,22] and record 202 spans 40..66.
const memberPool = concat(
  Uint8Array.from([0xaa, 0xbb]),
  Uint8Array.from([3, 2, 0]),
  registryRecord(101, 'A', [11, 22]),
  registryRecord(202, 'B', []),
);

const applySlices = (bytes: Uint8Array, slices: { start: number; end: number; replace: Uint8Array }[]): Uint8Array => {
  let output = bytes;
  for (const slice of [...slices].sort((a, b) => b.start - a.start))
    output = concat(output.subarray(0, slice.start), slice.replace, output.subarray(slice.end));
  return output;
};

const memberIds = (bytes: Uint8Array, recordId: number): number[] | undefined => {
  const list = locateMemberList(bytes, recordId);
  if (!list) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: list.count }, (_, index) => view.getUint32(list.arrayStart + 4 * index, true));
};

test('locateMemberList parses the member array tail of registry records', () => {
  const list = locateMemberList(memberPool, 101);
  assert.ok(list);
  assert.equal(list.recordId, 101);
  assert.equal(list.count, 2);
  assert.equal(list.tokenLength, 2);
  assert.equal(list.tokenOffset + list.tokenLength, list.arrayStart);
  assert.deepEqual(memberIds(memberPool, 101), [11, 22]);
  const empty = locateMemberList(memberPool, 202);
  assert.ok(empty);
  assert.equal(empty.recordId, 202);
  assert.equal(empty.count, 0);
  assert.equal(empty.arrayStart, empty.arrayEnd);
  assert.equal(empty.tokenOffset + empty.tokenLength, empty.arrayStart);
  assert.equal(locateMemberList(memberPool, 999), undefined);
  // Plain named records carry no member list.
  assert.equal(locateMemberList(synthetic, 101), undefined);
});

test('memberAppendSplices registers a lesson id and memberRemoveSplices drops it again', () => {
  assert.deepEqual(memberIds(memberPool, 101), [11, 22]);
  const appended = applySlices(memberPool, memberAppendSplices(memberPool, 101, 34));
  assert.deepEqual(memberIds(appended, 101), [11, 22, 34]);
  assert.deepEqual(memberIds(appended, 202), []);
  assert.throws(() => memberAppendSplices(appended, 101, 34), /already listed/);
  const removed = applySlices(appended, memberRemoveSplices(appended, 101, 34));
  assert.deepEqual(memberIds(removed, 101), [11, 22]);
});

test('member counts widen from the i8 token to the i16 token past 127 entries', () => {
  const long = concat(
    Uint8Array.from([3, 1, 0]),
    registryRecord(
      303,
      'C',
      Array.from({ length: 127 }, (_, index) => 100000 + index),
    ),
  );
  const appended = applySlices(long, memberAppendSplices(long, 303, 34));
  const list = locateMemberList(appended, 303);
  assert.ok(list);
  assert.equal(list.tokenLength, 3);
  assert.equal(list.count, 128);
  const view = new DataView(appended.buffer, appended.byteOffset, appended.byteLength);
  assert.equal(view.getUint32(list.arrayEnd - 4, true), 34);
  const trimmed = applySlices(appended, memberRemoveSplices(appended, 303, 34));
  assert.equal(locateMemberList(trimmed, 303)?.count, 127);
  assert.equal(locateMemberList(trimmed, 303)?.tokenLength, 3);
});

test('member splices tolerate absent ids, arrays and records', () => {
  assert.deepEqual(memberRemoveSplices(memberPool, 101, 999), []); // id not listed
  assert.deepEqual(memberRemoveSplices(synthetic, 101, 11), []); // plain record, no member array
  assert.deepEqual(memberRemoveSplices(memberPool, 999, 11), []); // record absent
  assert.throws(() => memberAppendSplices(synthetic, 101, 34), /carries no lesson member list/);
  assert.throws(() => memberAppendSplices(memberPool, 101, 0), /not a usable lesson id/);
});

test(
  'reference member arrays hold exactly the ids every owner view renders and round-trip',
  { skip: !hasReference },
  async () => {
    const bytes = await loadReference();
    const original = await decodeDav(asBuffer(bytes), 'reference.dav');
    // The M3 probe trio: class SEM 3 - DCPT 1, subject ESP 2052, lecturer Fazleen with array sizes
    // 24, 47 and 34 locked by the app-verified insert-probe battery.
    const classId = 98273235,
      subjectId = 36506311,
      staffId = 38005632;
    const idsFor = (match: (lesson: DavLesson) => boolean) =>
      new Set(
        Object.values(original.editor.lessons)
          .filter(match)
          .map((lesson) => lesson.lessonId),
      );
    const refs = {
      class: idsFor((lesson) => lesson.classId === classId),
      subject: idsFor((lesson) => lesson.subjectRef === subjectId),
      staff: idsFor((lesson) => lesson.slots.some((slot) => slot.lecturer === staffId)),
    };
    const counts = { class: 24, subject: 47, staff: 34 };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const arraysAt = (
      recordId: number,
    ): { list: NonNullable<ReturnType<typeof locateMemberList>>; ids: Set<number> } | undefined => {
      const list = locateMemberList(bytes, recordId);
      if (!list) return undefined;
      let ids: number[] = [];
      for (let index = 0; index < list.count; index++) ids.push(view.getUint32(list.arrayStart + 4 * index, true));
      return { list, ids: new Set(ids) };
    };
    for (const [role, recordId] of [
      ['class', classId],
      ['subject', subjectId],
      ['staff', staffId],
    ] as const) {
      const found = arraysAt(recordId);
      assert.ok(found, `${role} record ${recordId} carries a member list`);
      assert.equal(found.list.count, counts[role]);
      assert.ok(
        [...refs[role]].every((id) => found.ids.has(id)),
        `${role} member list covers its referenced lessons`,
      );
      // Staff and room arrays may additionally list legacy ids of undecodable lessons; the class and
      // subject lists match the decode exactly.
      if (role !== 'staff') assert.deepEqual(found.ids, refs[role]);
    }
    // Rooms carry parallel member lists: every used room's array matches its referenced lessons.
    const roomRefs = new Map<number, Set<number>>();
    for (const lesson of Object.values(original.editor.lessons))
      for (const slot of lesson.slots)
        if (slot.room >= 1 && slot.room < 0xffffffff) {
          const set = roomRefs.get(slot.room) ?? new Set<number>();
          set.add(lesson.lessonId);
          roomRefs.set(slot.room, set);
        }
    assert.ok(roomRefs.size > 0);
    for (const [roomId, expected] of roomRefs) {
      const found = arraysAt(roomId);
      assert.ok(found, `room record ${roomId} carries a member list`);
      assert.ok(
        [...expected].every((id) => found.ids.has(id)),
        `room ${roomId} member list covers its lessons`,
      );
    }
    const appended = applySlices(bytes, memberAppendSplices(bytes, subjectId, 104152394));
    assert.deepEqual(memberIds(appended, subjectId)?.at(-1), 104152394);
    const trimmed = applySlices(appended, memberRemoveSplices(appended, subjectId, 104152394));
    assert.deepEqual(trimmed, bytes);
  },
);
