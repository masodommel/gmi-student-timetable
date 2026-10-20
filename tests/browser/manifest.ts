import { readFile } from 'node:fs/promises';
import type { Manifest } from '../../src/timetable/types.js';

export async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(new URL('../../public/data/manifest.json', import.meta.url), 'utf8')) as Manifest;
}

export function revisionLabel(manifest: Manifest): string {
  if (!manifest.sourceRevisionDate) return manifest.sourceRevision;
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(manifest.sourceRevisionDate + 'T12:00:00Z'));
  return `${manifest.revisionCode || 'Latest'} · ${date}`;
}
