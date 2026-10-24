interface ExtraLessonOptions {
  classId?: number;
  subjectId?: number;
  day?: number;
  period?: number;
  span?: number;
  coupling?: number;
  lecturerId?: number;
  roomId?: number;
  note?: string;
}

interface NamedExtra {
  id: number;
  name: string;
}

interface FixtureOptions {
  className?: string;
  classId?: number;
  periodStart?: number;
  subject?: string;
  periods?: number;
  span?: number;
  unplacedSpan?: number;
  trailingNote?: string;
  exceptionRange?: [number, number];
  extraLesson?: ExtraLessonOptions;
  periodBreak?: number;
  extraRoom?: NamedExtra;
  extraLecturer?: NamedExtra;
  weekMaskBit?: number;
}

export function makeDavFixture({
  className = 'CLASS A',
  classId = 1,
  periodStart = 480,
  subject = 'Mathematics',
  periods = 2,
  span = 1,
  unplacedSpan = 0,
  trailingNote = '',
  exceptionRange = [-1, -1],
  extraLesson,
  periodBreak = 0,
  extraRoom,
  extraLecturer,
  weekMaskBit = 28,
}: FixtureOptions = {}): Uint8Array<ArrayBuffer> {
  const pieces: Uint8Array<ArrayBuffer>[] = [];
  const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => Uint8Array.from(values);
  type Setter = 'setUint32' | 'setInt32' | 'setFloat64' | 'setFloat32' | 'setUint16' | 'setBigUint64';
  const raw = (method: Setter, size: number, value: number | bigint): Uint8Array<ArrayBuffer> => {
    const buffer = new ArrayBuffer(size);
    (
      new DataView(buffer)[method] as unknown as (
        offset: number,
        value: number | bigint,
        littleEndian?: boolean,
      ) => void
    )(0, value, true);
    return new Uint8Array(buffer);
  };
  const u32 = (value: number) => raw('setUint32', 4, value);
  const i32 = (value: number) => raw('setInt32', 4, value);
  const f64 = (value: number) => raw('setFloat64', 8, value);
  const f32 = (value: number) => raw('setFloat32', 4, value);
  const taggedInt8 = (value: number) => bytes(2, value & 255);
  const text = (value: string) => {
    const payload = new TextEncoder().encode(value);
    return Uint8Array.from([6, payload.length, ...payload]);
  };
  const append = (...values: Uint8Array<ArrayBuffer>[]) => {
    pieces.push(...values);
  };
  const namedRecord = (id: number, name: string): Uint8Array<ArrayBuffer>[] => [u32(id), taggedInt8(-1), text(name)];
  // Class/staff/room/subject records end in a lesson-id member list, the layout the reference file
  // uses: [u32 id][02 FF][06 name][06 ''][06 ''][f64][4B color][tagged count][u32 ..count].
  const registryRecord = (id: number, name: string, members: number[] = []): Uint8Array<ArrayBuffer>[] => [
    u32(id),
    taggedInt8(-1),
    text(name),
    text(''),
    text(''),
    f64(45872.7),
    bytes(0, 0, 0, 0),
    taggedInt8(members.length),
    ...members.map(u32),
  ];

  // 50-byte header: 0x03 "V30" signature, 60-minute periods, then the title and planning dates.
  const header = new Uint8Array(50);
  header.set(bytes(3, 86, 51, 48));
  new DataView(header.buffer).setUint32(11, 60, true);
  append(header, text('Campus'), new Uint8Array(7), f64(46023), f64(46418), new Uint8Array(16));
  append(text('New semester'), text(''), bytes(9), taggedInt8(periods));
  for (let index = 0; index < periods; index++)
    append(raw('setUint16', 2, periodStart + index * 60 + (index ? periodBreak : 0)), new Uint8Array(8));
  append(
    taggedInt8(1),
    f64(46209),
    f64(46209),
    i32(exceptionRange[0]),
    i32(exceptionRange[1]),
    bytes(3),
    text('Campus holiday'),
    new Uint8Array(8),
  );

  // Name table: two classes, one lecturer, one room and one subject, each with an empty member list.
  append(taggedInt8(2), ...registryRecord(classId, className), ...registryRecord(2, 'CLASS B'));
  append(taggedInt8(extraLecturer ? 2 : 1), ...registryRecord(3, 'Example lecturer'));
  if (extraLecturer) append(...registryRecord(extraLecturer.id, extraLecturer.name));
  append(taggedInt8(extraRoom ? 2 : 1), ...registryRecord(4, 'Room 1'));
  if (extraRoom) append(...registryRecord(extraRoom.id, extraRoom.name));
  append(taggedInt8(1), ...registryRecord(5, subject));

  // A single calendar-week pattern covering ISO week 28 only. Shifting the cleared mask bit moves the
  // CW-to-bit mapping; covered events keep landing on the Monday of calendar week 28.
  const mask = raw('setBigUint64', 8, ((1n << 64n) - 1n) ^ (1n << BigInt(weekMaskBit)));
  append(taggedInt8(1), ...namedRecord(6, 'CW28'), text(''), mask, f32(1), f32(60), f32(1), f32(1));
  append(taggedInt8(1), ...namedRecord(7, 'Group container'), text(''), taggedInt8(1), u32(10), new Uint8Array(20));

  // One lesson with one slot on Monday, period 1 (optional period span and unplaced span slot).
  append(
    taggedInt8(extraLesson ? 2 : 1),
    taggedInt8(0),
    u32(8),
    i32(-1),
    i32(classId),
    i32(3),
    i32(4),
    taggedInt8(unplacedSpan ? 2 : 1),
  );
  const slot = new Uint8Array(18);
  slot[0] = 1;
  slot[1] = 1;
  slot[9] = span;
  append(u32(9), u32(8), slot, taggedInt8(0), taggedInt8(0), i32(4), i32(3), i32(-1));
  if (unplacedSpan) {
    const extra = new Uint8Array(18);
    extra[9] = unplacedSpan;
    append(u32(10), u32(8), extra, taggedInt8(0), taggedInt8(0), i32(-1), i32(-1), i32(-1));
  }
  append(i32(6), mask, taggedInt8(0), taggedInt8(0), text('From the new file'), i32(5), i32(0));
  append(taggedInt8(0), taggedInt8(0), bytes(0), text('Example lecturer'), text('Room 1'));
  for (let index = 0; index < 4; index++) append(taggedInt8(0));
  for (const value of [1, 60, 1, 60]) append(bytes(15), f32(value));
  append(
    text(''),
    taggedInt8(0),
    bytes(0, 0, 127),
    u32(span + unplacedSpan),
    u32(0),
    taggedInt8(1),
    taggedInt8(6),
    text(trailingNote),
    taggedInt8(0),
  );

  if (extraLesson) {
    const {
      classId: extraClass = classId,
      subjectId: extraSubject = 5,
      day: extraDay = 2,
      period: extraPeriod = 1,
      span: extraSpan = 1,
      coupling: extraCoupling = -1,
      lecturerId: extraLecturer = 3,
      roomId: extraRoom = 4,
      note: extraNote = '',
    } = extraLesson;
    const extraSlot = new Uint8Array(18);
    extraSlot[0] = extraDay;
    extraSlot[1] = extraPeriod;
    extraSlot[9] = extraSpan;
    append(
      u32(11),
      i32(extraCoupling),
      i32(extraClass),
      i32(3),
      i32(4),
      taggedInt8(1),
      u32(12),
      u32(11),
      extraSlot,
      taggedInt8(0),
      taggedInt8(0),
      i32(extraRoom),
      i32(extraLecturer),
      i32(-1),
      i32(6),
      mask,
      taggedInt8(0),
      taggedInt8(0),
      text(extraNote),
      i32(extraSubject),
      i32(0),
    );
    append(taggedInt8(0), taggedInt8(0), bytes(0), text('Example lecturer'), text('Room 1'));
    for (let index = 0; index < 4; index++) append(taggedInt8(0));
    for (const value of [1, 60, 1, 60]) append(bytes(15), f32(value));
    append(
      text(''),
      taggedInt8(0),
      bytes(0, 0, 127),
      u32(extraSpan),
      u32(0),
      taggedInt8(1),
      taggedInt8(6),
      text(''),
      taggedInt8(0),
    );
  }

  // Trailer fields the reader consumes before checking the end offset.
  append(taggedInt8(0), taggedInt8(0), taggedInt8(0), taggedInt8(1), text('Absent'), new Uint8Array(40));
  for (let index = 0; index < 4; index++) append(taggedInt8(0));

  const result = new Uint8Array(pieces.reduce((size, piece) => size + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    result.set(piece, offset);
    offset += piece.length;
  }
  return result;
}
