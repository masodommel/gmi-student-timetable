import type { ClassDataset, Manifest, TimetableEvent } from '../timetable/types.js';

export interface DavSlot {
  offset: number;
  id: number;
  day: number;
  period: number;
  flag: number;
  room: number;
  lecturer: number;
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

export interface DavEditor {
  events: Record<string, DavEditorEvent>;
  periods: number[];
  duration: number;
  staff: DavStaff[];
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
