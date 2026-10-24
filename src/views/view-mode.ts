import { media, state, VIEW_COOKIE, type View } from '../state.js';
import { readCookie, writeCookie } from '../ui/cookies.js';
import { readFlag } from '../ui/storage.js';

const VIEWS: View[] = ['grid', 'week', 'agenda'];

export function resolveStoredView(): View {
  const stored = readCookie(VIEW_COOKIE);
  if (VIEWS.includes(stored as View)) return stored as View;
  return readFlag('timetable-agenda-default') ? 'agenda' : 'grid';
}

export function storeView(view: View): void {
  if (media.matches) return;
  writeCookie(VIEW_COOKIE, view);
}

export function initViewMode(): void {
  state.view = resolveStoredView();
}
