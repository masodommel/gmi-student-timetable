export interface ClassRecord {
  id: string;
  name: string;
  eventCount?: number;
  firstDate?: string | null;
  lastDate?: string | null;
}

export type LecturerRecord = ClassRecord;

export interface TimetableEvent {
  id: string;
  date: string;
  start: string;
  end: string;
  subject: string;
  lecturer: string;
  room: string;
  note: string;
  exception: string;
  overlap: boolean;
  className?: string;
}

export interface SearchableEvent {
  date: string;
  subject: string;
  lecturer: string;
  room: string;
  note: string;
}

export interface CalendarException {
  date: string;
  name: string;
}

export interface ManifestCounts {
  classes: number;
  studentEvents: number;
  allEvents: number;
  lecturerEvents: number;
}

export interface Manifest {
  sourceHash: string;
  title: string;
  timezone: string;
  sourceRevision: string;
  sourceRevisionDate?: string;
  revisionCode?: string;
  sourceFilename?: string;
  publishedAt?: string;
  planningStart: string;
  planningEnd: string;
  reconstructed: boolean;
  lecturers: LecturerRecord[];
  classes: ClassRecord[];
  exceptions: CalendarException[];
  counts?: ManifestCounts;
  sourceBytes?: number;
  filename?: string;
}

export interface ClassDataset {
  class: ClassRecord;
  events: TimetableEvent[];
}

export interface ClassDetails {
  text: string;
  semester: string;
  programmes: string[];
  group: string;
}

export interface ClassSearchFilters {
  programme?: string;
  semester?: string;
  group?: string;
}

export type SearchResult<T> = T & { fuzzy: boolean; score: number };
