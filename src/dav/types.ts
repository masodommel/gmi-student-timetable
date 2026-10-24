import type { ClassDataset, Manifest, TimetableEvent } from '../timetable/types.js';

export interface DavSlot {
  offset: number;
  id: number;
  day: number;
  period: number;
  span: number;
  flag: number;
  room: number;
  lecturer: number;
  roomOffset: number;
  lecturerOffset: number;
}

export interface DavEditorEvent {
  lessonId: number;
  coupling: number;
  noteOffset: number;
  noteEnd: number;
  note: string;
  slots: DavSlot[];
}

export interface DavStaff {
  id: string;
  name: string;
}

export interface DavLesson {
  lessonId: number;
  coupling: number;
  classId: number;
  subjectRef: number;
  recordStart: number;
  recordEnd: number;
  terminator: 0 | 1;
  trailerCountOffset: number;
  noteOffset: number;
  noteEnd: number;
  maskOffset: number;
  bits: number[];
  slotStarts: number[];
  slots: DavSlot[];
}

export interface DavCountTag {
  position: number;
  width: number;
  value: number;
  encoding: 2 | 3 | 4;
}

export interface DavEditor {
  events: Record<string, DavEditorEvent>;
  periods: number[];
  duration: number;
  staff: DavStaff[];
  rooms: DavStaff[];
  subjects: DavStaff[];
  lessons: Record<string, DavLesson>;
  lessonCountTag: DavCountTag;
  lessonInsertPoint: number;
  weekAnchor: string;
  weekAnchorBase: number;
}

export interface DavDecoded {
  editor: DavEditor;
  lecturerEvents: TimetableEvent[];
  manifest: Manifest;
  datasets: Record<string, ClassDataset>;
  omitted: number;
  total: number;
}

export interface DavImportRequest {
  buffer: ArrayBuffer;
  filename: string;
}

export type DavImportResponse = { ok: true; result: DavDecoded } | { ok: false; error: string };
