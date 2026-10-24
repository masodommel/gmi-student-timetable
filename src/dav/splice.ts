// Byte-level splice helpers for the name-table record pools of a plan-clan .dav file:
// teachers/instructors, rooms, subjects and classes. Posts/clones/removes whole records verbatim,
// mirroring the in-place lesson splices of writer.ts for the safer clone-from-template strategy.

const UNLISTED = 0xffffffff;
const MAX_TOKEN = 5000;

interface NamedRecord {
  position: number;
  id: number;
  size: number;
}

interface PoolToken {
  offset: number;
  length: number;
  value: number;
}

interface PoolSpan {
  firstIndex: number;
  records: number;
  token: PoolToken;
}

export interface DavRecordSpan {
  start: number;
  end: number;
  tableTokenOffset: number;
  tableTokenLength: number;
  tableTokenValue: number;
}

const failure = (reason: string): Error => new Error(`${reason}. Reopen the timetable file before editing here.`);

// Name records look like [u32 id][0x02 0xFF 0x06 length text], exactly the pattern reader.ts's
// namedRecords scan looks for; re-scanning here keeps splice.ts free of reader.ts internals.
function scanNamedRecords(bytes: Uint8Array): NamedRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: NamedRecord[] = [];
  for (let marker = 4; marker < bytes.length - 4; marker++) {
    if (bytes[marker] !== 2 || bytes[marker + 1] !== 255 || bytes[marker + 2] !== 6) continue;
    const size = bytes[marker + 3];
    if (!size || marker + 4 + size > bytes.length) continue;
    const value = bytes.subarray(marker + 4, marker + 4 + size);
    if (value.some((byte) => byte < 32 || byte === 127)) continue;
    records.push({ position: marker - 4, id: view.getUint32(marker - 4, true), size });
  }
  return records;
}

// A pool's record count precedes its first record as a tagged integer, same encodings as
// reader.ts's countsBefore probes: [02 i8], [03 i16] and [04 i32].
function tokenBefore(bytes: Uint8Array, position: number, view: DataView): PoolToken | undefined {
  for (const [length, tag] of [
    [2, 2],
    [3, 3],
    [5, 4],
  ] as const) {
    if (position >= length && bytes[position - length] === tag) {
      const value =
        tag === 2
          ? view.getInt8(position - 1)
          : tag === 3
            ? view.getInt16(position - 2, true)
            : view.getInt32(position - 4, true);
      if (Number.isInteger(value) && value > 0 && value <= MAX_TOKEN)
        return { offset: position - length, length, value };
    }
  }
  return undefined;
}

// Pools tile the record run back to back: [token][records...] [token][records...], where the token
// value declares the record count. Verified against the 1.15 MB reference file: every record pool
// (classes 179, staff/instructors 250, rooms 574, subjects 671 and the post-name pattern/group
// pools) consumes the scan exactly this way, each with its own count token.
function mapPools(bytes: Uint8Array, records: NamedRecord[], view: DataView): PoolSpan[] {
  const pools: PoolSpan[] = [];
  let index = 0;
  while (index < records.length) {
    const token = tokenBefore(bytes, records[index].position, view);
    if (!token) {
      index++;
      continue;
    }
    if (index + token.value > records.length) throw failure('The record pool overruns the timetable file');
    pools.push({ firstIndex: index, records: token.value, token });
    index += token.value;
  }
  return pools;
}

// A pool's byte span ends where the next pool's count token begins; the record after the pool marks
// the boundary when unclaimed records sit between pools, and the file end when none follow.
function poolEnd(pools: PoolSpan[], poolIndex: number, records: NamedRecord[], bytes: Uint8Array): number {
  const pool = pools[poolIndex];
  const next = pools[poolIndex + 1];
  const afterLast = records[pool.firstIndex + pool.records];
  if (next && next.firstIndex === pool.firstIndex + pool.records) return next.token.offset;
  return afterLast?.position ?? bytes.length;
}

const poolByteRange = (
  bytes: Uint8Array,
  records: NamedRecord[],
  pools: PoolSpan[],
  poolIndex: number,
): [number, number] => [
  records[pools[poolIndex].firstIndex].position - pools[poolIndex].token.length,
  poolEnd(pools, poolIndex, records, bytes),
];

interface RecordContext {
  records: NamedRecord[];
  pools: PoolSpan[];
  recordIndex: number;
  poolIndex: number;
}

// Locate the record whose u32 LE id matches inside a record pool. `poolHint` is an optional byte
// offset inside the expected pool, needed whenever the same id value exists in two pools.
function locateContext(bytes: Uint8Array, recordId: number, poolHint?: number): RecordContext {
  if (!Number.isInteger(recordId) || recordId < 1 || recordId >= UNLISTED)
    throw failure(`The record id ${recordId} is not a usable record id`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = scanNamedRecords(bytes);
  const pools = mapPools(bytes, records, view);
  const inside = records.flatMap((record, index) =>
    record.id === recordId
      ? [pools.findIndex((pool) => index >= pool.firstIndex && index < pool.firstIndex + pool.records)]
      : [],
  );
  const found = inside.filter((poolIndex) => poolIndex >= 0);
  const hinted =
    poolHint === undefined
      ? found
      : found.filter((poolIndex) => {
          const [start, end] = poolByteRange(bytes, records, pools, poolIndex);
          return poolHint >= start && poolHint < end;
        });
  if (!found.length) throw failure(`The record with id ${recordId} is not part of the timetable file`);
  if (poolHint !== undefined && !hinted.length)
    throw failure(`The pool hint offset does not sit inside the pool holding the record with id ${recordId}`);
  if (hinted.length > 1)
    throw failure(
      `The record id ${recordId} appears in more than one record pool; pass a pool hint offset from the expected pool`,
    );
  return { records, pools, recordIndex: firstIndex(records, recordId, pools, hinted[0]), poolIndex: hinted[0] };
}

const firstIndex = (records: NamedRecord[], recordId: number, pools: PoolSpan[], poolIndex: number): number =>
  records.findIndex(
    (record, index) =>
      record.id === recordId &&
      index >= pools[poolIndex].firstIndex &&
      index < pools[poolIndex].firstIndex + pools[poolIndex].records,
  );

function recordSpan(bytes: Uint8Array, context: RecordContext): DavRecordSpan {
  const { records, pools, recordIndex, poolIndex } = context;
  const pool = pools[poolIndex];
  const inPool = recordIndex - pool.firstIndex;
  let end: number;
  if (inPool + 1 < pool.records) end = records[recordIndex + 1].position;
  else end = poolEnd(pools, poolIndex, records, bytes);
  return {
    start: records[recordIndex].position,
    end,
    tableTokenOffset: pool.token.offset,
    tableTokenLength: pool.token.length,
    tableTokenValue: pool.token.value,
  };
}

export function locateRecordSpan(bytes: Uint8Array, recordId: number, poolHint?: number): DavRecordSpan {
  return recordSpan(bytes, locateContext(bytes, recordId, poolHint));
}

// Tagged integers re-encode like writer.ts's rewriteCount: widening from i8 to i16 to i32 when the
// count outgrows the token, keeping the original encoding otherwise.
function encodeToken(length: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647)
    throw failure(`The record count cannot become ${value}`);
  let width = length === 2 ? 1 : length === 3 ? 2 : 4;
  if (value > (width === 1 ? 127 : 32767)) width = width === 1 ? 2 : 4;
  const output = new Uint8Array(1 + width);
  output[0] = width === 1 ? 2 : width === 2 ? 3 : 4;
  if (width === 1) output[1] = value & 0xff;
  else if (width === 2) new DataView(output.buffer).setInt16(1, value, true);
  else new DataView(output.buffer).setInt32(1, value, true);
  return output;
}

interface Splice {
  start: number;
  end: number;
  replace: Uint8Array;
}

// Same patch application writer.ts uses to splice byte ranges with overlap checks.
function applySplices(bytes: Uint8Array, splices: Splice[]): Uint8Array {
  const sorted = [...splices].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 0; index < sorted.length; index++) {
    if (sorted[index].start < 0 || sorted[index].end > bytes.length || sorted[index].start > sorted[index].end)
      throw failure('The record span does not fit this timetable file');
    if (index > 0 && sorted[index].start < sorted[index - 1].end)
      throw failure('The record span overlaps another edit');
  }
  const total =
    bytes.length + sorted.reduce((sum, splice) => sum + (splice.replace.length - (splice.end - splice.start)), 0);
  const output = new Uint8Array(total);
  let from = 0,
    to = 0;
  for (const splice of sorted) {
    output.set(bytes.subarray(from, splice.start), to);
    to += splice.start - from;
    output.set(splice.replace, to);
    to += splice.replace.length;
    from = splice.end;
  }
  output.set(bytes.subarray(from), to);
  return output;
}

// Copies the source record's byte span verbatim and patches every u32 LE occurrence of the source id
// inside the copy. For the verified staff/instructor and subject record bodies the only occurrence is
// the leading record id: across the whole reference file no teacher or subject span carries another
// u32 equal to its record id, and none carries the id+n sub-entry family the lesson table uses.
export function cloneRecordSplice(bytes: Uint8Array, sourceId: number, newId: number, poolHint?: number): Uint8Array {
  if (!Number.isInteger(newId) || newId < 1 || newId >= UNLISTED)
    throw failure(`The new record id ${newId} is not a usable record id`);
  if (newId === sourceId) throw failure(`The record id ${newId} already belongs to the source record`);
  const context = locateContext(bytes, sourceId, poolHint);
  if (context.records.some((record) => record.id === newId))
    throw failure(`The record id ${newId} is already taken in this timetable file`);
  const span = recordSpan(bytes, context);
  const copy = bytes.slice(span.start, span.end);
  const view = new DataView(copy.buffer);
  for (let offset = 0; offset + 4 <= copy.length; offset++) {
    if (view.getUint32(offset, true) === sourceId) {
      view.setUint32(offset, newId, true);
      offset += 3;
    }
  }
  return applySplices(bytes, [
    {
      start: span.tableTokenOffset,
      end: span.tableTokenOffset + span.tableTokenLength,
      replace: encodeToken(span.tableTokenLength, span.tableTokenValue + 1),
    },
    // daVinciLook renders records inside their pool run, so the clone splices right after its source.
    { start: span.end, end: span.end, replace: copy },
  ]);
}

// Removes the record's byte span and decrements the pool's count token; the token always exists for
// the verified record pools (classes, staff, rooms, subjects), so no further bookkeeping is needed.
export function deleteRecordSplice(bytes: Uint8Array, targetId: number, poolHint?: number): Uint8Array {
  const context = locateContext(bytes, targetId, poolHint);
  const span = recordSpan(bytes, context);
  if (span.tableTokenValue <= 1) throw failure('A record pool needs to keep at least one record');
  return applySplices(bytes, [
    {
      start: span.tableTokenOffset,
      end: span.tableTokenOffset + span.tableTokenLength,
      replace: encodeToken(span.tableTokenLength, span.tableTokenValue - 1),
    },
    { start: span.start, end: span.end, replace: new Uint8Array(0) },
  ]);
}

export interface DavMemberList {
  recordId: number;
  recordStart: number;
  recordEnd: number;
  tokenOffset: number;
  tokenLength: number;
  count: number;
  arrayStart: number;
  arrayEnd: number;
}

export interface DavSplice {
  start: number;
  end: number;
  replace: Uint8Array;
}

// Registry records (classes, staff, rooms, subjects) end in a lesson-id member list, the render
// gate daVinciLook applies per owner view — probe-verified on the reference file: every class,
// subject, staff and room record parses as
//   [u32 id][02 FF][06 len name][06 len s2][f64][4-byte color][01/02/03/04 count][u32 ..count]
// with counts 176/176 classes, 283/283 subjects, 219/219 staff, 215/215 rooms matching the whole
// corpus of referenced lesson ids. Clones stay invisible in every owner view until their lesson id
// is registered in each owning record's array (the app-verified insert-probe battery: probe P1 with
// no rows and member-class with only the class row never render; the three-row splice does).
export function locateMemberList(bytes: Uint8Array, recordId: number, poolHint?: number): DavMemberList | undefined {
  if (!Number.isInteger(recordId) || recordId < 1 || recordId >= UNLISTED) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let start: number, end: number;
  try {
    const span = recordSpan(bytes, locateContext(bytes, recordId, poolHint));
    start = span.start;
    end = span.end;
  } catch {
    return undefined;
  }
  if (view.getUint32(start, true) !== recordId) return undefined;
  if (bytes[start + 4] !== 2 || bytes[start + 5] !== 255 || bytes[start + 6] !== 6) return undefined;
  let cursor = start + 8 + bytes[start + 7]; // [u32 id][02 FF][06 len name]
  if (cursor + 2 > end || bytes[cursor] !== 6) return undefined; // [06 len short name]
  cursor += 2 + bytes[cursor + 1];
  if (cursor + 2 > end || bytes[cursor] !== 6) return undefined; // [06 len second string]
  cursor += 2 + bytes[cursor + 1];
  if (cursor + 12 > end) return undefined;
  cursor += 8; // [f64 date]
  cursor += 4; // [4-byte color]
  const width = { 2: 2, 3: 3, 4: 5 }[bytes[cursor] as 2 | 3 | 4];
  if (width === undefined || cursor + width > end) return undefined;
  const rawCount =
    width === 2
      ? view.getInt8(cursor + 1)
      : width === 3
        ? view.getInt16(cursor + 1, true)
        : view.getInt32(cursor + 1, true);
  if (rawCount < 0 || rawCount > MAX_TOKEN) return undefined;
  const arrayStart = cursor + width,
    arrayEnd = arrayStart + 4 * rawCount;
  if (arrayEnd > end) return undefined;
  return {
    recordId,
    recordStart: start,
    recordEnd: end,
    tokenOffset: cursor,
    tokenLength: width,
    count: rawCount,
    arrayStart,
    arrayEnd,
  };
}

const memberOffset = (bytes: Uint8Array, list: DavMemberList, memberId: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = list.arrayStart; offset + 4 <= list.arrayEnd; offset += 4)
    if (view.getUint32(offset, true) === memberId) return offset;
  return -1;
};

const u32Bytes = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
};

// Registers a lesson id in the record's member array: rewrites the array count (widening the token
// like rewriteCount does when the count outgrows it) and splices the id right behind the array,
// where the app-verified reference splice put it. Member arrays hold no duplicate ids (probed), so
// a duplicate registration fails loudly instead of writing a corrupt count.
export function memberAppendSplices(
  bytes: Uint8Array,
  recordId: number,
  memberId: number,
  poolHint?: number,
): DavSplice[] {
  if (!Number.isInteger(memberId) || memberId < 1 || memberId >= UNLISTED)
    throw failure(`The member id ${memberId} is not a usable lesson id`);
  const list = locateMemberList(bytes, recordId, poolHint);
  if (!list) throw failure(`The record with id ${recordId} carries no lesson member list`);
  if (memberOffset(bytes, list, memberId) >= 0)
    throw failure(`The lesson id ${memberId} is already listed in the member array of the record with id ${recordId}`);
  if (list.count + 1 > MAX_TOKEN) throw failure(`The member list of record ${recordId} cannot hold more entries`);
  return [
    {
      start: list.tokenOffset,
      end: list.tokenOffset + list.tokenLength,
      replace: encodeToken(list.tokenLength, list.count + 1),
    },
    { start: list.arrayEnd, end: list.arrayEnd, replace: u32Bytes(memberId) },
  ];
}

// Drops a single lesson id from the record's member array and decrements the count. Missing
// records, unlocatable arrays and ids that were never listed stay silent so legacy registries
// without the row delete gracefully; structural scan errors still propagate.
export function memberRemoveSplices(
  bytes: Uint8Array,
  recordId: number,
  memberId: number,
  poolHint?: number,
): DavSplice[] {
  const list = locateMemberList(bytes, recordId, poolHint);
  if (!list) return [];
  const hit = memberOffset(bytes, list, memberId);
  if (hit < 0) return [];
  return [
    {
      start: list.tokenOffset,
      end: list.tokenOffset + list.tokenLength,
      replace: encodeToken(list.tokenLength, list.count - 1),
    },
    { start: hit, end: hit + 4, replace: new Uint8Array(0) },
  ];
}
