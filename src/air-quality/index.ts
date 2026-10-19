import { validDate } from '../timetable/core.js';
import type { AirCategory, AirReading, AirSnapshot, AirStationConfig, AirStationReading } from './types.js';

export const AIR_SOURCE = 'https://eqms.doe.gov.my/APIMS/main';
export const AIR_FEED = 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm';
export const AIR_STATIONS: readonly AirStationConfig[] = Object.freeze([
  { id: 'CA17W', name: 'Putrajaya, W.P. PUTRAJAYA' },
  { id: 'CA16W', name: 'Cheras, W.P. KUALA LUMPUR' },
]);
export function apiCategory(value: unknown): AirCategory | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000) return null;
  return value <= 50
    ? 'Good'
    : value <= 100
      ? 'Moderate'
      : value <= 200
        ? 'Unhealthy'
        : value <= 300
          ? 'Very Unhealthy'
          : 'Hazardous';
}
export function sourceTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))
    return null;
  if (!validDate(value.slice(0, 10))) return null;
  const date = new Date(/[Z]|[+-]\d{2}:\d{2}$/.test(value) ? value : value + '+08:00');
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
interface AirFeedRow {
  STATION_ID?: unknown;
  STATION_LOCATION?: unknown;
  API?: unknown;
  CLASS?: unknown;
  RECORD_DT?: unknown;
}
function isFeedRow(row: unknown): row is AirFeedRow {
  return typeof row === 'object' && row !== null;
}
function emptyReading(station: AirStationConfig): AirStationReading {
  return { id: station.id, name: station.name, value: null, category: null, observedAt: null };
}
export function normaliseAir(payload: unknown, now: Date = new Date()): AirSnapshot {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('Unexpected DOE station response');
  const stations = AIR_STATIONS.map((station) => {
    const rows = data.filter((row): row is AirFeedRow => isFeedRow(row) && row.STATION_ID === station.id);
    if (rows.length !== 1) return emptyReading(station);
    const row = rows[0],
      value = typeof row.API === 'number' ? row.API : null,
      observedAt = sourceTime(row.RECORD_DT),
      category = apiCategory(value);
    if (
      !String(row.STATION_LOCATION).startsWith(station.name.split(',')[0]) ||
      category !== row.CLASS ||
      !observedAt ||
      Date.parse(observedAt) > now.getTime() + 15 * 60000
    )
      return emptyReading(station);
    return { id: station.id, name: station.name, value: category ? value : null, category, observedAt };
  });
  return { schemaVersion: 1, fetchedAt: now.toISOString(), stations };
}
function stationRow(snapshot: unknown, id: string): AirStationReading | undefined {
  if (typeof snapshot !== 'object' || snapshot === null) return undefined;
  const candidate = snapshot as { schemaVersion?: unknown; stations?: unknown };
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.stations)) return undefined;
  return candidate.stations.find(
    (row): row is AirStationReading => typeof row === 'object' && row !== null && (row as AirStationReading).id === id,
  );
}
export function readingState(snapshot: unknown, id: string, now: Date = new Date()): AirReading {
  const station = AIR_STATIONS.find((s) => s.id === id),
    row = stationRow(snapshot, id);
  const fetchedAt = (snapshot as { fetchedAt?: unknown } | null)?.fetchedAt;
  if (
    !station ||
    !row ||
    typeof row.value !== 'number' ||
    !row.observedAt ||
    row.category === null ||
    apiCategory(row.value) !== row.category ||
    typeof fetchedAt !== 'string'
  )
    return { status: 'unavailable', station };
  const time = Date.parse(row.observedAt),
    fetched = Date.parse(fetchedAt),
    age = now.getTime() - time;
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(fetched) ||
    age < -15 * 60000 ||
    time > fetched + 15 * 60000 ||
    fetched > now.getTime() + 15 * 60000 ||
    age > 24 * 3600000
  )
    return { status: 'unavailable', station };
  return {
    status: age > 3 * 3600000 ? 'stale' : 'fresh',
    station,
    value: row.value,
    category: row.category,
    observedAt: row.observedAt,
  };
}
const longTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const shortTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function airTime(value: string): string {
  return longTimeFormat.format(new Date(value)) + ' MYT';
}

export function airTimeShort(value: string): string {
  return shortTimeFormat.format(new Date(value)) + ' MYT';
}
