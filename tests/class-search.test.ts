import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classDetails, near, normalizeClass, searchClasses } from '../src/timetable/class-search.js';
import type { ClassRecord, ClassSearchFilters, SearchResult } from '../src/timetable/types.js';
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

// Reference copy of the pre-optimisation search, kept to prove the faster version returns identical results.
function referenceNear(a: string, b: string): boolean {
  if (a.length < 3 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length)
    for (let i = 0; i < a.length - 1; i++) if (a.slice(0, i) + a[i + 1] + a[i] + a.slice(i + 2) === b) return true;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next: number[] = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = next;
  }
  return previous[b.length] <= 1;
}

function referenceSearch<T extends ClassRecord>(
  classes: T[],
  query = '',
  filters: ClassSearchFilters = {},
): SearchResult<T>[] {
  const normalized = normalizeClass(query);
  const semester = /\bsem (\d+)\b/.exec(normalized)?.[1];
  const group = /\bteam (\d+)\b/.exec(normalized)?.[1];
  const remaining = normalized
    .replace(/\b(?:sem|team) \d+\b/g, '')
    .split(' ')
    .filter(Boolean);
  const rows: SearchResult<T>[] = [];
  for (const item of classes) {
    const details = classDetails(item.name);
    if ((filters.semester && details.semester !== filters.semester) || (semester && details.semester !== semester))
      continue;
    if ((filters.group && details.group !== filters.group) || (group && details.group !== group)) continue;
    if (filters.programme && !details.programmes.includes(filters.programme)) continue;
    const words = details.text.split(' ');
    let fuzzy = false;
    if (
      !remaining.every((term) => {
        if (words.some((word) => (/^\d+$/.test(term) ? word === term : word.includes(term)))) return true;
        if (words.some((word) => referenceNear(term, word))) {
          fuzzy = true;
          return true;
        }
        return false;
      })
    )
      continue;
    const direct = normalized && details.text.replaceAll(' ', '').includes(normalized.replaceAll(' ', ''));
    rows.push({ ...item, fuzzy, score: (fuzzy ? 100 : 0) + (direct ? -10 : 0) + (item.eventCount ? 0 : 10) });
  }
  return rows.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

test('near matches the Levenshtein/transposition reference on every short string pair', () => {
  const alphabet = ['a', 'b', 'c'];
  const strings = [''];
  for (let length = 1; length <= 5; length += 1)
    for (const prefix of strings.filter((value) => value.length === length - 1))
      for (const char of alphabet) strings.push(prefix + char);
  for (const a of strings) for (const b of strings) assert.equal(near(a, b), referenceNear(a, b), `${a} vs ${b}`);
});

test('optimised search returns exactly the reference results for the published manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/data/manifest.json', import.meta.url), 'utf8')) as {
    classes: ClassRecord[];
  };
  const classes = manifest.classes;
  const queries = [
    '',
    ' ',
    'd',
    'dm',
    'dmch',
    'dmhc',
    'dcbs',
    'dcsb',
    'dswe',
    'dsew',
    'semester 3 dmch group 1',
    'semster 3 dmhc group 1',
    'sem3dmch1',
    'SEM-3 DMCH_1',
    'dmch semester3 team1',
    'sem 1',
    'sem 5 team 2',
    'grp 10',
    'section 2',
    '1',
    '10',
    '3 1',
    'gapp',
    'gufp',
    'gdvt',
    'belt',
    'mtm',
    'deng',
    'denq',
    'dkm',
    'xyz',
    'zzzz',
    'éclair',
    'dmch dcbs',
    'cbs 2',
    'dcbs10',
    'mech',
  ];
  const sample = [...new Set(classes.map((item) => item.name))].slice(0, 40);
  for (const name of sample) queries.push(name, name.toLowerCase().replace(/ /g, ''), name.slice(0, -1));
  const filters: ClassSearchFilters[] = [
    {},
    { programme: 'DCBS' },
    { semester: '3' },
    { group: '1' },
    { programme: 'DMCH', semester: '1', group: '2' },
  ];
  for (const query of queries)
    for (const filter of filters)
      assert.deepEqual(searchClasses(classes, query, filter), referenceSearch(classes, query, filter), query);
});
