import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDav } from './prepare_dav.js';
import { validDate } from '../src/timetable/core.js';

export interface Sidecar {
  originalName: string;
  messageDate: string;
  subject: string;
  sha256: string;
  bytes: number;
}

export interface PublishedManifest {
  sourceHash?: string;
  sourceRevisionDate?: string;
}

export interface Candidate {
  path: string;
  hash: string;
  code: string;
  date: string;
  messageTime: number;
  sidecar: Sidecar;
}

export interface InvalidSource {
  filename: string;
  reason: string;
}

export interface SkippedSource {
  filename: string;
  reason: string;
}

export interface SelectionResult {
  latest?: Candidate;
  invalid: InvalidSource[];
  skipped: SkippedSource[];
}

export interface SelectOptions {
  sources: string;
  manifest: PublishedManifest;
  force?: boolean;
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function output(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function kualaLumpurDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function revision(name: string, messageDate: string): { code: string; date: string } {
  const match = /_R([A-Z0-9]+)_(\d{8})\.dav$/i.exec(name);
  if (match) {
    const code = `R${match[1].toUpperCase()}`;
    const raw = match[2];
    const date = `${raw.slice(4, 8)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`;
    if (validDate(date)) return { code, date };
  }
  return { code: 'AUTO', date: kualaLumpurDate(messageDate) };
}

function isSidecar(value: unknown): value is Sidecar {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.originalName === 'string' &&
    /\.dav$/i.test(record.originalName) &&
    typeof record.messageDate === 'string' &&
    !Number.isNaN(Date.parse(record.messageDate)) &&
    typeof record.subject === 'string' &&
    typeof record.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(record.sha256) &&
    typeof record.bytes === 'number' &&
    Number.isInteger(record.bytes) &&
    record.bytes >= 0
  );
}

export async function selectLatestSource(options: SelectOptions): Promise<SelectionResult> {
  const sources = resolve(options.sources);
  let filenames: string[];

  try {
    filenames = await readdir(sources);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { invalid: [], skipped: [] };
    throw error;
  }

  const invalid: InvalidSource[] = [];
  const skipped: SkippedSource[] = [];
  const candidates: Candidate[] = [];

  for (const filename of filenames) {
    if (!filename.toLowerCase().endsWith('.dav')) continue;

    const path = resolve(sources, filename);
    const sidecarPath = resolve(sources, filename.slice(0, -4) + '.json');
    let raw: unknown;

    try {
      raw = JSON.parse(await readFile(sidecarPath, 'utf8'));
    } catch {
      invalid.push({ filename, reason: 'missing or invalid sidecar' });
      continue;
    }

    if (!isSidecar(raw)) {
      invalid.push({ filename, reason: 'invalid sidecar fields' });
      continue;
    }

    let bytes: Buffer;

    try {
      bytes = await readFile(path);
    } catch {
      invalid.push({ filename, reason: 'unreadable source file' });
      continue;
    }

    const hash = createHash('sha256').update(bytes).digest('hex');

    if (raw.sha256.toLowerCase() !== hash || raw.bytes !== bytes.byteLength) {
      invalid.push({ filename, reason: 'sidecar sha256 or byte size does not match' });
      continue;
    }

    if (hash === options.manifest.sourceHash) continue;

    const parsed = revision(raw.originalName, raw.messageDate);

    if (!options.force && options.manifest.sourceRevisionDate && parsed.date < options.manifest.sourceRevisionDate) {
      skipped.push({ filename, reason: `${parsed.date} is older than ${options.manifest.sourceRevisionDate}` });
      continue;
    }

    candidates.push({
      path,
      hash,
      code: parsed.code,
      date: parsed.date,
      messageTime: Date.parse(raw.messageDate),
      sidecar: raw,
    });
  }

  candidates.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.messageTime - a.messageTime ||
      b.sidecar.originalName.localeCompare(a.sidecar.originalName),
  );

  return { latest: candidates[0], invalid, skipped };
}

async function main(): Promise<void> {
  const sources = resolve(argument('sources', 'sources'));
  const destination = resolve(argument('destination', 'public'));
  const force = process.argv.includes('--force');
  const strict = process.argv.includes('--strict');
  const manifest = JSON.parse(await readFile(resolve(destination, 'data/manifest.json'), 'utf8')) as PublishedManifest;
  const { latest, invalid, skipped } = await selectLatestSource({ sources, manifest, force });

  for (const item of skipped) console.warn(`Skipping ${item.filename}: ${item.reason}.`);
  for (const item of invalid) console.warn(`::warning::Skipping ${item.filename}: ${item.reason}.`);
  output('invalid', String(invalid.length));

  if (strict && invalid.length) throw new Error(`${invalid.length} invalid source(s) found.`);

  if (!latest) {
    output('changed', 'false');
    console.log('No unpublished source found.');
    return;
  }

  await prepareDav({
    filename: latest.path,
    displayFilename: latest.sidecar.originalName,
    revisionCode: latest.code,
    revisionDate: latest.date,
    destination,
  });

  output('changed', 'true');
  output('revision', latest.code);
  output('filename', latest.sidecar.originalName);
  console.log(`Published ${latest.sidecar.originalName} (${latest.code}, ${latest.date}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
