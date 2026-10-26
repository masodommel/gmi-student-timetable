import { escapeHtml as esc } from '../timetable/core.js';
import { readCookie, writeCookie } from './cookies.js';
import { icon } from './icons.js';

export type BookmarkKind = 'class' | 'lecturer';

interface Bookmark {
  kind: BookmarkKind;
  name: string;
}

const BOOKMARK_COOKIE = 'gmi-bookmarks';
const MAX_BOOKMARKS = 40;

let cache: Bookmark[] | null = null;
let version = 0;

function load(): Bookmark[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(readCookie(BOOKMARK_COOKIE) || '[]');
    cache = Array.isArray(parsed)
      ? parsed
          .filter((item): item is Bookmark =>
            Boolean(
              item &&
              typeof item === 'object' &&
              (item as Bookmark).kind &&
              ((item as Bookmark).kind === 'class' || (item as Bookmark).kind === 'lecturer') &&
              typeof (item as Bookmark).name === 'string' &&
              (item as Bookmark).name,
            ),
          )
          .slice(-MAX_BOOKMARKS)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function matches(item: Bookmark, kind: BookmarkKind, name: string): boolean {
  return item.kind === kind && item.name === name;
}

export function isBookmarked(kind: BookmarkKind, name: string): boolean {
  return Boolean(name) && load().some((item) => matches(item, kind, name));
}

export function toggleBookmark(kind: BookmarkKind, name: string): boolean {
  if (!name) return false;
  const current = load();
  const active = current.some((item) => matches(item, kind, name));
  const next = active
    ? current.filter((item) => !matches(item, kind, name))
    : [...current, { kind, name }].slice(-MAX_BOOKMARKS);
  cache = next;
  version += 1;
  writeCookie(BOOKMARK_COOKIE, JSON.stringify(next));
  return !active;
}

export function bookmarkVersion(): number {
  return version;
}

function bookmarkLabel(kind: BookmarkKind, name: string, active: boolean): string {
  return `${active ? 'Remove bookmark for' : 'Bookmark'} ${kind} ${name}`;
}

export function bookmarkButton(kind: BookmarkKind, name: string): string {
  const active = isBookmarked(kind, name);
  const label = bookmarkLabel(kind, name, active);
  return `<button type="button" class="bookmark-star${active ? ' active' : ''}" data-bookmark-kind="${kind}" data-bookmark-name="${esc(name)}" aria-pressed="${active}" aria-label="${esc(label)}" title="${esc(label)}">${icon('star')}</button>`;
}

export function syncBookmarkStars(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-bookmark-kind]').forEach((button) => {
    const kind = button.dataset.bookmarkKind;
    const name = button.dataset.bookmarkName || '';
    if (kind !== 'class' && kind !== 'lecturer') return;
    const active = isBookmarked(kind, name);
    const label = bookmarkLabel(kind, name, active);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}
