import type { DavDecoded, DavEditor } from './dav/index.js';
import { localToday, monday, shareUrl } from './timetable/core.js';
import { markOverlaps } from './timetable/events.js';
import type { ClassDataset, ClassRecord, Manifest, TimetableEvent } from './timetable/types.js';
import { readStored, writeStored } from './ui/storage.js';

export type Mode = 'class' | 'lecturer';
export type View = 'week' | 'agenda';

export interface AppState {
  manifest: Manifest | null;
  selected: ClassRecord | null;
  events: TimetableEvent[];
  week: string;
  day: string;
  view: View;
  query: string;
  loading: boolean;
  error: string;
  lastCheckedAt: Date | null;
  lastCheckFailed: boolean;
  request: AbortController | null;
  localFile: boolean;
  generation: number;
  mode: Mode;
  davBuffer: ArrayBuffer | null;
  editor: DavEditor | null;
  editId: string | null;
}

export const CLASS_STORAGE_KEY = 'gmi-student-class';
export const SEEN_REVISION_STORAGE_KEY = 'timetable-seen-revision';

export const media = window.matchMedia('(max-width: 700px)');

export const state: AppState = {
  manifest: null,
  selected: null,
  events: [],
  week: monday(localToday()),
  day: localToday(),
  view: 'week',
  query: '',
  loading: false,
  error: '',
  lastCheckedAt: null,
  lastCheckFailed: false,
  request: null,
  localFile: false,
  generation: 0,
  mode: 'class',
  davBuffer: null,
  editor: null,
  editId: null,
};

export const classCache = new Map<string, ClassDataset>();
export const lecturerCache = new Map<string, ClassDataset>();

export const choices = (): ClassRecord[] =>
  state.mode === 'lecturer' ? state.manifest?.lecturers || [] : state.manifest?.classes || [];

export function exceptionsFor(date: string): string[] {
  return [...new Set((state.manifest?.exceptions || []).filter((item) => item.date === date).map((item) => item.name))];
}

export function installLocal(result: DavDecoded, buffer: ArrayBuffer): void {
  state.davBuffer = buffer;
  state.editor = result.editor;
  state.manifest = result.manifest;
  classCache.clear();
  lecturerCache.clear();
  for (const [id, dataset] of Object.entries(result.datasets)) classCache.set(id, dataset);
  for (const lecturer of result.manifest.lecturers) {
    const events = result.lecturerEvents.filter((event) => event.lecturer === lecturer.name);
    markOverlaps(events);
    events.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    Object.assign(lecturer, {
      eventCount: events.length,
      firstDate: events[0]?.date || null,
      lastDate: events.at(-1)?.date || null,
    });
    lecturerCache.set(lecturer.id, { class: lecturer, events });
  }
}

export function resetToProvided(): void {
  state.request?.abort();
  state.localFile = false;
  state.davBuffer = null;
  state.editor = null;
  state.mode = 'class';
  lecturerCache.clear();
  state.selected = null;
  state.manifest = null;
  state.events = [];
  state.loading = false;
  classCache.clear();
}

export function storedClassId(): string {
  return readStored(CLASS_STORAGE_KEY) || '';
}

export function rememberClass(id: string): void {
  if (state.localFile) return;
  writeStored(CLASS_STORAGE_KEY, id);
}

export function scheduleUrl(): URL | null {
  if (!state.selected) return null;
  const url = new URL(shareUrl(location.href, state.selected.id, state.week));
  if (state.mode === 'lecturer') {
    url.searchParams.delete('class');
    url.searchParams.set('lecturer', state.selected.id);
  }
  return url;
}

export function updateUrl(): void {
  if (state.localFile) {
    history.replaceState(null, '', location.pathname);
    return;
  }
  const url = scheduleUrl();
  if (url) history.replaceState(null, '', url);
}
