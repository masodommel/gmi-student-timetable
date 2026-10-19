import { readFile, writeFile } from 'node:fs/promises';
import { AIR_FEED, normaliseAir } from '../src/air-quality/index.js';
import type { AirSnapshot } from '../src/air-quality/types.js';

interface StoredSnapshot {
  schemaVersion: number;
  fetchedAt: string | null;
  stations: unknown[];
}

type DatedSnapshot = StoredSnapshot & { fetchedAt: string };

const TARGET = new URL('../public/data/air-quality.json', import.meta.url);
const PREVIOUS_URL = 'https://lollllz.github.io/gmi-student-timetable/data/air-quality.json';

async function get(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function hasReading(snapshot: AirSnapshot): boolean {
  return snapshot.stations.some((station) => station.value !== null);
}

async function fetchLiveSnapshot(): Promise<StoredSnapshot> {
  const snapshot = normaliseAir(await get(AIR_FEED));
  if (!hasReading(snapshot)) throw new Error('No valid reference readings');
  console.log('Retrieved DOE readings for ' + snapshot.stations.length + ' reference stations.');
  return snapshot;
}

async function readLocalSnapshot(): Promise<StoredSnapshot | null> {
  try {
    return JSON.parse(await readFile(TARGET, 'utf8')) as StoredSnapshot;
  } catch {
    return null;
  }
}

async function readDeployedSnapshot(): Promise<StoredSnapshot | null> {
  try {
    return (await get(PREVIOUS_URL)) as StoredSnapshot;
  } catch {
    return null;
  }
}

function isDatedSnapshot(value: unknown): value is DatedSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as StoredSnapshot;
  return (
    snapshot.schemaVersion === 1 &&
    Array.isArray(snapshot.stations) &&
    typeof snapshot.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(snapshot.fetchedAt))
  );
}

function newestSnapshot(snapshots: Array<StoredSnapshot | null>): StoredSnapshot {
  return (
    snapshots.filter(isDatedSnapshot).sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0] || {
      schemaVersion: 1,
      fetchedAt: null,
      stations: [],
    }
  );
}

async function fallbackSnapshot(): Promise<StoredSnapshot> {
  const local = await readLocalSnapshot();
  const deployed = await readDeployedSnapshot();
  return newestSnapshot([local, deployed]);
}

async function main(): Promise<void> {
  let snapshot: StoredSnapshot;
  try {
    snapshot = await fetchLiveSnapshot();
  } catch (error) {
    console.warn(
      'DOE refresh unavailable: ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Preserving last known timestamps.',
    );
    snapshot = await fallbackSnapshot();
  }
  await writeFile(TARGET, JSON.stringify(snapshot) + '\n');
}

await main();
