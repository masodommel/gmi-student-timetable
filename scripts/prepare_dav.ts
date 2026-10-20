import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDav, type DavDecoded } from '../src/dav/index.js';
import { classCalendar } from '../src/timetable/calendar.js';
import { compactJson } from './compact-json.js';
import { validDate } from '../src/timetable/core.js';
import { markOverlaps } from '../src/timetable/events.js';
import type { ClassRecord, LecturerRecord, Manifest, TimetableEvent } from '../src/timetable/types.js';

export interface PrepareDavOptions {
  filename: string;
  displayFilename?: string;
  revisionCode: string;
  revisionDate: string;
  destination: string;
  publishedAt?: string;
}

interface LecturerDataset {
  class: LecturerRecord;
  events: TimetableEvent[];
}

const GENERATED_FOLDERS = [
  ['data', /^\d+\.json$/],
  ['calendars', /^\d+\.ics$/],
  ['lecturers', /^[a-f0-9]+\.json$/],
] as const;

function readOptions(): PrepareDavOptions {
  const [filename, revisionCode, revisionDate, destination = 'public', displayFilename] = process.argv.slice(2);
  if (!filename || !/^[A-Z0-9]+$/.test(revisionCode || '') || !validDate(revisionDate))
    throw new Error(
      'Usage: npx tsx scripts/prepare_dav.ts input.dav R04D YYYY-MM-DD [public-directory] [display-filename]',
    );
  return { filename, displayFilename, revisionCode, revisionDate, destination };
}

function applyRevision(manifest: Manifest, options: PrepareDavOptions, sourceBytes: number): void {
  const labelDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(options.revisionDate + 'T12:00:00Z'));
  Object.assign(manifest, {
    title: 'GMI Student Timetable',
    sourceRevision: labelDate,
    revisionCode: options.revisionCode,
    sourceRevisionDate: options.revisionDate,
    sourceFilename: basename(options.displayFilename || options.filename),
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    sourceBytes,
  });
  delete manifest.filename;
}

function buildLecturerDatasets(events: TimetableEvent[]): LecturerDataset[] {
  const byLecturer = new Map<string, TimetableEvent[]>();
  for (const event of events) {
    if (!event.lecturer) continue;
    const lecturerEvents = byLecturer.get(event.lecturer) || [];
    lecturerEvents.push(event);
    byLecturer.set(event.lecturer, lecturerEvents);
  }
  return [...byLecturer]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, lecturerEvents]) => {
      lecturerEvents.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.start.localeCompare(b.start) ||
          a.subject.localeCompare(b.subject) ||
          a.id.localeCompare(b.id),
      );
      markOverlaps(lecturerEvents);
      const item: ClassRecord = {
        id: createHash('sha256').update(name).digest('hex').slice(0, 16),
        name,
        eventCount: lecturerEvents.length,
        firstDate: lecturerEvents[0].date,
        lastDate: lecturerEvents.at(-1)!.date,
      };
      return { class: item, events: lecturerEvents };
    });
}

async function clearGenerated(destination: string): Promise<void> {
  for (const [folder, pattern] of GENERATED_FOLDERS) {
    const directory = join(destination, folder);
    await mkdir(directory, { recursive: true });
    for (const file of await readdir(directory)) if (pattern.test(file)) await unlink(join(directory, file));
  }
}

async function writeGenerated(
  destination: string,
  result: DavDecoded,
  lecturerDatasets: LecturerDataset[],
  manifest: Manifest,
  revisionDate: string,
): Promise<void> {
  for (const dataset of Object.values(result.datasets)) {
    await writeFile(join(destination, 'data', dataset.class.id + '.json'), compactJson(dataset));
    await writeFile(
      join(destination, 'calendars', dataset.class.id + '.ics'),
      classCalendar(dataset.class, dataset.events, new Date(revisionDate + 'T00:00:00Z')),
    );
  }
  for (const dataset of lecturerDatasets)
    await writeFile(join(destination, 'lecturers', dataset.class.id + '.json'), compactJson(dataset));
  await writeFile(join(destination, 'data', 'manifest.json'), compactJson(manifest));
}

export async function prepareDav(options: PrepareDavOptions): Promise<void> {
  const input = await readFile(options.filename);
  const result = await decodeDav(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer,
    basename(options.filename),
  );
  const manifest = result.manifest;
  applyRevision(manifest, options, input.byteLength);
  const lecturerDatasets = buildLecturerDatasets(result.lecturerEvents);
  manifest.lecturers = lecturerDatasets.map((dataset) => dataset.class);
  manifest.counts = {
    classes: manifest.classes.length,
    studentEvents: result.total,
    allEvents: result.lecturerEvents.length,
    lecturerEvents: lecturerDatasets.reduce((count, dataset) => count + dataset.events.length, 0),
  };
  await clearGenerated(options.destination);
  await writeGenerated(options.destination, result, lecturerDatasets, manifest, options.revisionDate);
  console.log(
    JSON.stringify({
      sourceHash: manifest.sourceHash,
      revisionCode: options.revisionCode,
      revisionDate: options.revisionDate,
      ...manifest.counts,
    }),
  );
}

async function main(): Promise<void> {
  await prepareDav(readOptions());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
