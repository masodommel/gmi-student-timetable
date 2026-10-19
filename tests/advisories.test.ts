import test from 'node:test';
import assert from 'node:assert/strict';
import { hazeActive, needsModeCheck, sourceSaysOnline } from '../src/timetable/advisories.js';
test('haze precaution expires and only flags upcoming lessons inside its window', () => {
  assert.equal(hazeActive('2026-10-17'), false);
  assert.equal(hazeActive('2026-10-18'), true);
  assert.equal(hazeActive('2026-10-25'), true);
  assert.equal(hazeActive('2026-10-26'), false);
  assert.equal(needsModeCheck({ date: '2026-10-19' }, '2026-10-18'), true);
  assert.equal(needsModeCheck({ date: '2026-10-17' }, '2026-10-18'), false);
  assert.equal(needsModeCheck({ date: '2026-10-26' }, '2026-10-18'), false);
});
test('online labels need explicit source notes and never follow haze or missing rooms', () => {
  const onlineNotes = ['Online Class', 'ONLINE CLASS via Teams', 'Class: online', 'Online'];
  for (const note of onlineNotes) assert.equal(sourceSaysOnline({ note }), true, note);

  const offlineNotes = [
    '',
    'not online',
    'No online class',
    'Online class cancelled',
    'Discuss online safety',
    'Offline class',
    'Online class not held',
    'Online class preparation',
  ];
  for (const note of offlineNotes) assert.equal(sourceSaysOnline({ note }), false, note);

  assert.equal(sourceSaysOnline({ room: 'Online' }), false);
});
