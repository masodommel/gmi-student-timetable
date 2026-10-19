import { choices, state, storedClassId } from '../state.js';
import { addDays, clampWeek, localToday, validDate } from '../timetable/core.js';
import type { Manifest } from '../timetable/types.js';
import { fetchJson } from '../ui/http.js';
import { selectClass } from './picker.js';
import { render } from './shell.js';

export async function initialize(): Promise<void> {
  const generation = ++state.generation;
  state.error = '';
  render();
  try {
    const manifest = await fetchJson<Manifest>('./data/manifest.json');
    if (generation !== state.generation) return;
    state.manifest = manifest;
    const query = new URLSearchParams(location.search);
    const date = query.get('week');
    state.week = clampWeek(validDate(date) ? date : localToday(), manifest.planningStart, manifest.planningEnd);
    const today = localToday();
    state.day = today >= state.week && today <= addDays(state.week, 6) ? today : state.week;
    state.mode = query.has('lecturer') ? 'lecturer' : 'class';
    const id = query.get(state.mode) || (state.mode === 'class' ? storedClassId() : '');
    if (choices().some((item) => item.id === id)) await selectClass(id);
    else render();
  } catch {
    if (generation !== state.generation) return;
    state.error = 'We couldn’t load the class list. Check your connection and try again.';
    render();
  }
}
