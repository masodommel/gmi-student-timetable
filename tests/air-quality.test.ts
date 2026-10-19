import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseAir, sourceTime, readingState, airTime, apiCategory } from '../src/air-quality/index.js';
const now = new Date('2026-10-18T14:30:00Z');
const row = {
  STATION_ID: 'CA17W',
  STATION_LOCATION: 'Putrajaya, W.P. PUTRAJAYA',
  API: 156,
  CLASS: 'Unhealthy',
  RECORD_DT: '2026-10-18T22:00:00',
  OP_PHONE: 'must not be published',
};
const readingAt = (snapshot: unknown, time: Date) => readingState(snapshot, 'CA17W', time);

test('DOE wall-clock timestamps use Malaysia time and snapshots whitelist data', () => {
  assert.equal(sourceTime(row.RECORD_DT), '2026-10-18T14:00:00.000Z');
  assert.equal(sourceTime('2026-10-18T14:00:00Z'), '2026-10-18T14:00:00.000Z');
  assert.equal(sourceTime('2026-02-30T22:00:00'), null);

  const snapshot = normaliseAir({ data: [row] }, now);
  assert.equal(JSON.stringify(snapshot).includes('OP_PHONE'), false);

  const reading = readingState(snapshot, 'CA17W', now);
  assert.equal(reading.status, 'fresh');
  if (reading.status === 'fresh' || reading.status === 'stale') assert.equal(reading.value, 156);
  assert.equal(readingState(snapshot, 'CA16W', now).status, 'unavailable');
  assert.match(airTime(snapshot.stations[0].observedAt!), /22:00 MYT/);
});

test('old, null, future and inconsistent readings never look current', () => {
  const snapshot = normaliseAir({ data: [row] }, now);
  assert.equal(readingAt(snapshot, new Date('2026-10-18T18:00:00Z')).status, 'stale');
  assert.equal(readingAt(snapshot, new Date('2026-10-19T15:00:00Z')).status, 'unavailable');

  const badRows = [{ API: null }, { API: -1 }, { API: '156' }, { CLASS: 'Good' }, { RECORD_DT: '2026-10-19T22:00:00' }];
  for (const bad of badRows)
    assert.equal(readingState(normaliseAir({ data: [{ ...row, ...bad }] }, now), 'CA17W', now).status, 'unavailable');
  assert.equal(readingState({ schemaVersion: 1, stations: {} }, 'CA17W', now).status, 'unavailable');

  const categories = [
    [0, 'Good'],
    [50, 'Good'],
    [51, 'Moderate'],
    [100, 'Moderate'],
    [101, 'Unhealthy'],
    [200, 'Unhealthy'],
    [201, 'Very Unhealthy'],
    [300, 'Very Unhealthy'],
    [301, 'Hazardous'],
  ] as const;
  for (const [value, category] of categories) assert.equal(apiCategory(value), category);
});
