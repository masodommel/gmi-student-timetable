import { decodeDav } from './reader.js';
import type { DavDecoded, DavEditor } from './types.js';

const cp1252 = new TextDecoder('windows-1252');
const cp1252Lookup = new Map(Array.from({ length: 256 }, (_, value) => [cp1252.decode(Uint8Array.of(value)), value]));

export interface DavEdit {
  note: string;
  day: number;
  period: number;
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

export async function editDav(
  buffer: ArrayBuffer,
  editor: DavEditor,
  eventId: string,
  { note, day, period }: DavEdit,
): Promise<{ buffer: ArrayBuffer; decoded: DavDecoded }> {
  const record = editor.events[eventId];
  if (!record) throw new Error('This entry cannot be edited.');
  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > 7 ||
    !Number.isInteger(period) ||
    period < 1 ||
    period + record.slots.length - 1 > editor.periods.length
  )
    throw new Error('Choose a weekday and a start period that fits the whole lesson.');
  const moved = record.slots.some((slot, index) => slot.day !== day || slot.period !== period + index);
  if (moved && record.coupling !== -1)
    throw new Error('Linked lessons must be moved together in DaVinci. You can edit the notes here.');
  for (let index = 1; index < record.slots.length; index++)
    if (editor.periods[period + index - 1] !== editor.periods[period + index - 2] + editor.duration)
      throw new Error('This lesson needs consecutive clock periods.');
  const bytes = new Uint8Array(buffer.slice(0));
  // Each slot stores its weekday and period in the first two bytes.
  for (const [index, slot] of record.slots.entries()) {
    if (bytes[slot.offset] !== slot.day || bytes[slot.offset + 1] !== slot.period)
      throw new Error('The source changed. Reopen the lesson before editing.');
    bytes[slot.offset] = day;
    bytes[slot.offset + 1] = period + index;
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

export function davDownload(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], { type: 'application/octet-stream' });
}
