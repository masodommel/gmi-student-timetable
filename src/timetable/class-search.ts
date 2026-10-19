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
export function classDetails(name: string): ClassDetails {
  const text = normalizeClass(name);
  const semester = /\bsem (\d+)\b/.exec(text)?.[1] || '';
  const programmes = [...new Set(name.toUpperCase().match(/\b(?:D[A-Z]{3}|GAPP|GUFP|GDVT|BELT|MTM)\b/g) || [])];
  const group = /\bteam (\d+)\b/.exec(text)?.[1] || (semester ? / (\d+)$/.exec(text)?.[1] || '' : '');
  return { text, semester, programmes, group: text === `sem ${semester}` ? '' : group };
}
function near(a: string, b: string): boolean {
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
export function searchClasses<T extends ClassRecord>(
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
        if (words.some((word) => near(term, word))) {
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
