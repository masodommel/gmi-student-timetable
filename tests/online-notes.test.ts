import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceSaysOnline } from '../src/timetable/notes.js';
test('online labels need explicit source notes and never follow missing rooms', () => {
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
