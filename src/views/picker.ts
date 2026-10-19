import { classCache, choices, lecturerCache, rememberClass, state, updateUrl } from '../state.js';
import { classDetails, searchClasses } from '../timetable/class-search.js';
import { clampWeek, escapeHtml as esc, localToday } from '../timetable/core.js';
import type { ClassDataset, ClassRecord, SearchResult } from '../timetable/types.js';
import { delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { fetchJson } from '../ui/http.js';
import { classOption } from './templates.js';
import { isAbort } from '../errors.js';
import { openDialog, render, toast } from './shell.js';

export function renderClassResults(): void {
  if (!state.manifest) return;
  const query = elements.classSearch.value;
  const classes: SearchResult<ClassRecord>[] =
    state.mode === 'lecturer'
      ? choices()
          .filter((item) =>
            query
              .toLowerCase()
              .trim()
              .split(/\s+/)
              .every((word) => item.name.toLowerCase().includes(word)),
          )
          .map((item) => ({ ...item, fuzzy: false, score: 0 }))
      : searchClasses(state.manifest.classes, query, {
          programme: elements.programmeFilter.value,
          semester: elements.semesterFilter.value,
          group: elements.groupFilter.value,
        });
  elements.classResultCount.textContent =
    state.mode === 'lecturer'
      ? `${classes.length} lecturer / resource timetables`
      : `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}${query.trim() ? ' matching your search' : ' available'}`;
  elements.classResults.innerHTML = classes.length
    ? classes.map((item) => classOption(item, state.selected?.id === item.id)).join('')
    : '<p class="picker-empty">No matching class. Try fewer words or clear the filters.</p>';
}

export function openClassPicker(): void {
  if (!state.manifest) return;
  elements.classDialogTitle.textContent = state.mode === 'lecturer' ? 'Find a lecturer' : 'Find your class';
  const search = elements.classSearch;
  search.placeholder = state.mode === 'lecturer' ? 'Search lecturer name…' : 'Try semester 3 dmch or dswe group 2…';
  search.setAttribute('aria-label', state.mode === 'lecturer' ? 'Search lecturers' : 'Search classes');
  elements.classFilters.hidden = state.mode === 'lecturer';
  search.value = '';
  const details = state.manifest.classes.map((item) => classDetails(item.name));
  const filters: Array<[HTMLSelectElement, string[], string]> = [
    [elements.programmeFilter, details.flatMap((item) => item.programmes), 'All programmes'],
    [elements.semesterFilter, details.map((item) => item.semester), 'All semesters'],
    [elements.groupFilter, details.map((item) => item.group), 'All groups'],
  ];
  for (const [select, values, label] of filters) {
    const prefix =
      select === elements.semesterFilter ? 'Semester ' : select === elements.groupFilter ? 'Group / team ' : '';
    select.innerHTML =
      `<option value="">${label}</option>` +
      [...new Set(values.filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((value) => `<option value="${esc(value)}">${prefix}${esc(value)}</option>`)
        .join('');
  }
  renderClassResults();
  openDialog(elements.classDialog);
  search.focus();
}

export async function selectClass(id: string, { preserveWeek = true }: { preserveWeek?: boolean } = {}): Promise<void> {
  const selected = choices().find((item) => item.id === id);
  const pickerOpen = elements.classDialog.open;
  const mode = state.mode;
  if (!selected || !state.manifest) return;
  const manifest = state.manifest;
  state.request?.abort();
  const controller = new AbortController();
  state.request = controller;
  state.selected = selected;
  state.loading = true;
  state.error = '';
  state.events = [];
  state.query = '';
  elements.subjectSearch.value = '';
  if (!preserveWeek) state.week = clampWeek(localToday(), manifest.planningStart, manifest.planningEnd);
  if (mode === 'class') rememberClass(id);
  updateUrl();
  elements.classDialog.close();
  render();
  try {
    const cache = mode === 'lecturer' ? lecturerCache : classCache;
    const dataset =
      cache.get(id) ||
      (await fetchJson<ClassDataset>(
        mode === 'lecturer' ? `./lecturers/${id}.json` : `./data/${id}.json`,
        controller.signal,
      ));
    if (controller.signal.aborted) return;
    if (dataset.class.id !== id || !Array.isArray(dataset.events)) throw new Error('Invalid class dataset');
    cache.set(id, dataset);
    state.events = dataset.events;
    state.loading = false;
    render();
    if (pickerOpen) elements.main.focus();
    toast(`${selected.name} timetable loaded.`);
  } catch (error) {
    if (isAbort(error)) return;
    state.loading = false;
    state.error = 'We couldn’t load this class’s timetable. Check your connection and try again.';
    render();
  }
}

export function initPicker(): void {
  on(elements.classButton, 'click', openClassPicker);
  on(elements.compactClassButton, 'click', openClassPicker);
  on(elements.classSearch, 'input', renderClassResults);
  on(elements.programmeFilter, 'change', renderClassResults);
  on(elements.semesterFilter, 'change', renderClassResults);
  on(elements.groupFilter, 'change', renderClassResults);
  on(elements.clearClassFilters, 'click', () => {
    elements.classSearch.value = '';
    elements.programmeFilter.value = '';
    elements.semesterFilter.value = '';
    elements.groupFilter.value = '';
    renderClassResults();
    elements.classSearch.focus();
  });
  delegate<HTMLElement>(elements.classResults, '[data-class-id]', 'click', (button) =>
    selectClass(button.dataset.classId || ''),
  );
  for (const mode of ['class', 'lecturer'] as const)
    on(mode === 'class' ? elements.studentMode : elements.lecturerMode, 'click', () => {
      state.request?.abort();
      state.mode = mode;
      state.selected = null;
      state.events = [];
      state.loading = false;
      state.error = '';
      history.replaceState(null, '', location.pathname);
      render();
      openClassPicker();
    });
}
