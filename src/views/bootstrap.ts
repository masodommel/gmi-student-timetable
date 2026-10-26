import { choices, state, storedClassId } from '../state.js';
import { addDays, clampWeek, localToday, validDate } from '../timetable/core.js';
import type { Manifest } from '../timetable/types.js';
import { fetchJson } from '../ui/http.js';
import { selectClass, warmClassPicker } from './picker.js';
import { render } from './shell.js';

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000;
let autoRefreshTimer: number | null = null;

export async function initialize(): Promise<void> {
  const generation = ++state.generation;
  state.error = '';
  render();
  try {
    const manifest = await fetchJson<Manifest>('./data/manifest.json');
    if (generation !== state.generation) return;
    state.manifest = manifest;
    state.lastCheckedAt = new Date();
    state.lastCheckFailed = false;
    const query = new URLSearchParams(location.search);
    const date = query.get('week');
    state.week = clampWeek(validDate(date) ? date : localToday(), manifest.planningStart, manifest.planningEnd);
    const today = localToday();
    state.day = today >= state.week && today <= addDays(state.week, 6) ? today : state.week;
    state.mode = query.has('lecturer') ? 'lecturer' : 'class';
    const id = query.get(state.mode) || (state.mode === 'class' ? storedClassId() : '');
    if (choices().some((item) => item.id === id)) await selectClass(id);
    else render();
    warmClassPicker();
  } catch {
    if (generation !== state.generation) return;
    state.lastCheckedAt = new Date();
    state.lastCheckFailed = true;
    state.error = 'We couldn’t load the class list. Check your connection and try again.';
    render();
  }
}

async function checkForRevision(): Promise<void> {
  try {
    const manifest = await fetchJson<Manifest>(`./data/manifest.json?check=${Date.now()}`);
    state.lastCheckedAt = new Date();
    state.lastCheckFailed = false;
    if (manifest.sourceHash !== state.manifest?.sourceHash && !state.localFile) {
      await initialize();
      return;
    }
    render();
  } catch {
    state.lastCheckedAt = new Date();
    state.lastCheckFailed = true;
    render();
  }
}

export function startAutoRefresh(): void {
  if (autoRefreshTimer !== null) return;
  autoRefreshTimer = window.setInterval(() => void checkForRevision(), AUTO_REFRESH_INTERVAL);
}
