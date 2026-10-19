import test from 'node:test';
import assert from 'node:assert/strict';
import { searchClasses } from '../src/timetable/class-search.js';
const classRecords = [
  'SEM 3 - DMCH 1',
  'SEM 3 - DMCH 2',
  'SEM 1 - DMCH 1',
  'SEM 3 - DCBS 1',
  'SEM 3 - DCBS 10',
  'SEM 3 - DCBS 2',
].map((name, index) => ({ id: String(index), name, eventCount: 1 }));

const names = (rows: Array<{ name: string }>): string[] => rows.map((row) => row.name);

test('compact codes, flexible order and semester wording find the same class', () => {
  const queries = ['semester 3 dmch group 1', 'sem3dmch1', 'dmch semester3 team1', 'SEM-3 DMCH_1'];
  for (const query of queries) assert.equal(searchClasses(classRecords, query)[0].name, classRecords[0].name);
});

test('small typos are labelled and exact matches rank first', () => {
  assert.equal(searchClasses(classRecords, 'semster 3 dmhc group 1')[0].fuzzy, true);
  assert.equal(searchClasses(classRecords, 'dcbs')[0].fuzzy, false);
});

test('group filters never confuse group 1 with group 10 and sort naturally', () => {
  const filtered = searchClasses(classRecords, '', { programme: 'DCBS', semester: '3', group: '1' });
  assert.deepEqual(names(filtered), ['SEM 3 - DCBS 1']);

  const dcbs = searchClasses(classRecords, 'dcbs');
  assert.deepEqual(names(dcbs), ['SEM 3 - DCBS 1', 'SEM 3 - DCBS 2', 'SEM 3 - DCBS 10']);
});
