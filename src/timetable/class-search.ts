import type { ClassDetails, ClassRecord, ClassSearchFilters, SearchResult } from './types.js';

export function normalizeClass(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\b(?:semester|semster|semesters)\b/g, 'sem')
    .replace(/\b(?:group|grp|section)\b/g, 'team')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
const detailsCache = new Map<string, ClassDetails>();

export function classDetails(name: string): ClassDetails {
  const cached = detailsCache.get(name);
  if (cached) return cached;
  const text = normalizeClass(name);
  const semester = /\bsem (\d+)\b/.exec(text)?.[1] || '';
  const programmes = [...new Set(name.toUpperCase().match(/\b(?:D[A-Z]{3}|GAPP|GUFP|GDVT|BELT|MTM)\b/g) || [])];
  const group = /\bteam (\d+)\b/.exec(text)?.[1] || (semester ? / (\d+)$/.exec(text)?.[1] || '' : '');
  const details = { text, semester, programmes, group: text === `sem ${semester}` ? '' : group };
  detailsCache.set(name, details);
  return details;
}
interface SearchEntry {
  details: ClassDetails;
  words: string[];
  compact: string;
}

const searchCache = new Map<string, SearchEntry>();
const collator = new Intl.Collator(undefined, { numeric: true });
const DIGITS = /^\d+$/;

function searchEntry(name: string): SearchEntry {
  const cached = searchCache.get(name);
  if (cached) return cached;
  const details = classDetails(name);
  const entry = { details, words: details.text.split(' '), compact: details.text.replaceAll(' ', '') };
  searchCache.set(name, entry);
  return entry;
}

function sameFrom(a: string, i: number, b: string, j: number): boolean {
  if (a.length - i !== b.length - j) return false;
  for (; i < a.length; i++, j++) if (a.charCodeAt(i) !== b.charCodeAt(j)) return false;
  return true;
}

/** True when `b` is within one edit (insert, delete, substitute or adjacent swap) of `a`, for terms of 3+ chars. */
export function near(a: string, b: string): boolean {
  if (a.length < 3 || Math.abs(a.length - b.length) > 1) return false;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && long.charCodeAt(i) === short.charCodeAt(i)) i++;
  if (i === short.length) return true;
  if (long.length !== short.length) return sameFrom(long, i + 1, short, i);
  if (sameFrom(a, i + 1, b, i + 1)) return true;
  return (
    i + 1 < a.length &&
    a.charCodeAt(i) === b.charCodeAt(i + 1) &&
    a.charCodeAt(i + 1) === b.charCodeAt(i) &&
    sameFrom(a, i + 2, b, i + 2)
  );
}
export function searchClasses<T extends ClassRecord>(
  classes: T[],
  query = '',
  filters: ClassSearchFilters = {},
): SearchResult<T>[] {
  const normalized = normalizeClass(query);
  const semester = /\bsem (\d+)\b/.exec(normalized)?.[1];
  const group = /\bteam (\d+)\b/.exec(normalized)?.[1];
  const terms = normalized
    .replace(/\b(?:sem|team) \d+\b/g, '')
    .split(' ')
    .filter(Boolean)
    .map((term) => ({ term, numeric: DIGITS.test(term) }));
  const compactQuery = normalized.replaceAll(' ', '');
  const rows: SearchResult<T>[] = [];
  for (const item of classes) {
    const { details, words, compact } = searchEntry(item.name);
    if ((filters.semester && details.semester !== filters.semester) || (semester && details.semester !== semester))
      continue;
    if ((filters.group && details.group !== filters.group) || (group && details.group !== group)) continue;
    if (filters.programme && !details.programmes.includes(filters.programme)) continue;
    let fuzzy = false;
    let matched = true;
    for (const { term, numeric } of terms) {
      let found = false;
      for (const word of words)
        if (numeric ? word === term : word.includes(term)) {
          found = true;
          break;
        }
      if (found) continue;
      for (const word of words)
        if (near(term, word)) {
          found = fuzzy = true;
          break;
        }
      if (!found) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const direct = normalized && compact.includes(compactQuery);
    rows.push({ ...item, fuzzy, score: (fuzzy ? 100 : 0) + (direct ? -10 : 0) + (item.eventCount ? 0 : 10) });
  }
  return rows.sort((a, b) => a.score - b.score || collator.compare(a.name, b.name));
}
