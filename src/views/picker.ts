import { classCache, choices, lecturerCache, rememberClass, state, updateUrl } from '../state.js';
import { classDetails, searchClasses } from '../timetable/class-search.js';
import { clampWeek, escapeHtml as esc, localToday } from '../timetable/core.js';
import type { ClassDataset, ClassRecord, Manifest, SearchResult } from '../timetable/types.js';
import {
  bookmarkVersion,
  isBookmarked,
  syncBookmarkStars,
  toggleBookmark,
  type BookmarkKind,
} from '../ui/bookmarks.js';
import { delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { fetchJson } from '../ui/http.js';
import { idle, yieldToMain } from '../ui/scheduling.js';
import { classOptionRow } from './templates.js';
import { isAbort } from '../errors.js';
import { openDialog, render, renderModeChrome, toast } from './shell.js';

const FIRST_RESULT_BATCH = 8;
const RESULT_BATCH = 24;
const SKELETON_ROWS = 8;

let filtersManifest: Manifest | null = null;
let renderedManifest: Manifest | null = null;
let renderedKey = '';
let resultsGeneration = 0;
let modeRenderGeneration = 0;
let modeRenderTimer: number | undefined;
let pendingRender = false;

interface LecturerIndexEntry {
  name: string;
  result: SearchResult<ClassRecord>;
}

let lecturerIndexManifest: Manifest | null = null;
let lecturerIndex: LecturerIndexEntry[] = [];
let lecturerResults: SearchResult<ClassRecord>[] = [];
let allClassesManifest: Manifest | null = null;
let allClasses: SearchResult<ClassRecord>[] = [];

function lecturerSearchIndex(manifest: Manifest): LecturerIndexEntry[] {
  if (lecturerIndexManifest === manifest) return lecturerIndex;
  lecturerIndexManifest = manifest;
  lecturerIndex = (manifest.lecturers || []).map((item) => ({
    name: item.name.toLowerCase(),
    result: { ...item, fuzzy: false, score: 0 },
  }));
  lecturerResults = lecturerIndex.map((entry) => entry.result);
  return lecturerIndex;
}

function allClassResults(manifest: Manifest): SearchResult<ClassRecord>[] {
  if (allClassesManifest === manifest) return allClasses;
  allClassesManifest = manifest;
  allClasses = searchClasses(manifest.classes);
  return allClasses;
}

function collectResults(manifest: Manifest, kind: BookmarkKind): SearchResult<ClassRecord>[] {
  const query = elements.classSearch.value;
  const normalizedQuery = query.toLowerCase().trim();
  const words = normalizedQuery.split(/\s+/);
  const programme = elements.programmeFilter.value;
  const semester = elements.semesterFilter.value;
  const group = elements.groupFilter.value;
  let classes: SearchResult<ClassRecord>[];
  if (state.mode === 'lecturer') {
    const index = lecturerSearchIndex(manifest);
    classes = normalizedQuery
      ? index.filter((entry) => words.every((word) => entry.name.includes(word))).map((entry) => entry.result)
      : lecturerResults;
  } else {
    classes =
      normalizedQuery || programme || semester || group
        ? searchClasses(manifest.classes, query, { programme, semester, group })
        : allClassResults(manifest);
  }
  const marked = new Set(classes.filter((item) => isBookmarked(kind, item.name)).map((item) => item.name));
  if (!marked.size) return classes;
  return [...classes].sort((a, b) => Number(marked.has(b.name)) - Number(marked.has(a.name)));
}

let skeletonTemplate: HTMLTemplateElement | null = null;

function renderPickerSkeleton(): void {
  elements.classResults.setAttribute('aria-busy', 'true');
  elements.classResultCount.textContent = state.mode === 'lecturer' ? 'Loading lecturers…' : 'Loading classes…';
  if (!skeletonTemplate) {
    skeletonTemplate = document.createElement('template');
    skeletonTemplate.innerHTML = Array.from(
      { length: SKELETON_ROWS },
      () =>
        '<div class="class-option-row skeleton-row" aria-hidden="true"><div class="class-option skeleton-option"><span class="skeleton-copy"><span class="skeleton-line"></span><span class="skeleton-line short"></span></span></div></div>',
    ).join('');
  }
  elements.classResults.replaceChildren(skeletonTemplate.content.cloneNode(true));
}

function renderResultBatches(classes: SearchResult<ClassRecord>[], kind: BookmarkKind, generation: number): void {
  if (generation !== resultsGeneration) return;
  if (!classes.length) {
    elements.classResults.innerHTML =
      '<p class="picker-empty">No matching class. Try fewer words or clear the filters.</p>';
    elements.classResults.removeAttribute('aria-busy');
    return;
  }
  let index = 0;
  const append = (): void => {
    if (generation !== resultsGeneration) return;
    const end = Math.min(classes.length, index + (index === 0 ? FIRST_RESULT_BATCH : RESULT_BATCH));
    const fragment = document.createDocumentFragment();
    for (const item of classes.slice(index, end))
      fragment.append(classOptionRow(item, state.selected?.id === item.id, kind));
    syncBookmarkStars(fragment);
    if (index === 0) elements.classResults.replaceChildren(fragment);
    else elements.classResults.append(fragment);
    index = end;
    if (index < classes.length) idle(append);
    else elements.classResults.removeAttribute('aria-busy');
  };
  append();
}

function setResultCount(count: number): void {
  const noun = state.mode === 'lecturer' ? (count === 1 ? 'result' : 'results') : count === 1 ? 'class' : 'classes';
  elements.classResultCount.textContent = `${count} ${noun}`;
}

export function renderClassResults({ defer = false }: { defer?: boolean } = {}): number | null {
  const manifest = state.manifest;
  if (!manifest) return null;
  const key = [
    state.mode,
    elements.classSearch.value,
    elements.programmeFilter.value,
    elements.semesterFilter.value,
    elements.groupFilter.value,
    state.selected?.id ?? '',
    bookmarkVersion(),
  ].join('\u0000');
  if (renderedManifest === manifest && renderedKey === key) return null;
  renderedManifest = manifest;
  renderedKey = key;
  const generation = ++resultsGeneration;
  const kind: BookmarkKind = state.mode === 'lecturer' ? 'lecturer' : 'class';
  const run = (): void => {
    if (generation !== resultsGeneration) return;
    const classes = collectResults(manifest, kind);
    setResultCount(classes.length);
    renderResultBatches(classes, kind, generation);
  };
  if (!defer) {
    run();
    return generation;
  }
  renderPickerSkeleton();
  void (async () => {
    await yieldToMain();
    run();
  })();
  return generation;
}

function invalidateResults(): void {
  resultsGeneration += 1;
  renderedManifest = null;
  renderedKey = '';
}

function reorderBookmarkedRows(kind: BookmarkKind): void {
  const rows = [...elements.classResults.querySelectorAll<HTMLElement>('.class-option-row')];
  rows.sort((a, b) => {
    const aName = a.querySelector<HTMLElement>('[data-bookmark-name]')?.dataset.bookmarkName || '';
    const bName = b.querySelector<HTMLElement>('[data-bookmark-name]')?.dataset.bookmarkName || '';
    return Number(isBookmarked(kind, bName)) - Number(isBookmarked(kind, aName));
  });
  const fragment = document.createDocumentFragment();
  for (const row of rows) fragment.append(row);
  elements.classResults.append(fragment);
}

function prepareClassPicker(): void {
  const manifest = state.manifest;
  if (!manifest) return;
  elements.classDialogTitle.textContent = state.mode === 'lecturer' ? 'Find a Lecturer' : 'Find a Class';
  const search = elements.classSearch;
  search.placeholder = state.mode === 'lecturer' ? 'Search lecturers…' : 'Search classes…';
  search.setAttribute('aria-label', state.mode === 'lecturer' ? 'Search lecturers' : 'Search classes');
  elements.classFilters.hidden = state.mode === 'lecturer';
  search.value = '';
  if (filtersManifest !== manifest) {
    filtersManifest = manifest;
    const details = manifest.classes.map((item) => classDetails(item.name));
    const filters: Array<[HTMLSelectElement, string[], string]> = [
      [elements.programmeFilter, details.flatMap((item) => item.programmes), 'Program'],
      [elements.semesterFilter, details.map((item) => item.semester), 'Semester'],
      [elements.groupFilter, details.map((item) => item.group), 'Group'],
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
  }
  elements.programmeFilter.value = '';
  elements.semesterFilter.value = '';
  elements.groupFilter.value = '';
}

export function warmClassPicker(): void {
  if (!state.manifest || elements.classDialog.open) return;
  const manifest = state.manifest;
  idle(() => {
    if (state.manifest === manifest && !elements.classDialog.open) prepareClassPicker();
  });
}

export function openClassPicker(): void {
  if (!state.manifest) return;
  elements.classDialog.scrollTop = 0;
  elements.classResults.scrollTop = 0;
  prepareClassPicker();
  renderClassResults({ defer: true });
  openDialog(elements.classDialog);
  elements.classSearch.focus({ preventScroll: true });
}

const SWAP_CLASS = 'picker-swap';

function animatePickerSwap(mode: 'class' | 'lecturer'): void {
  const dialog = elements.classDialog;
  if (dialog.classList.contains(SWAP_CLASS)) return;
  dialog.dataset.pickerSwap = mode === 'lecturer' ? 'next' : 'previous';
  dialog.classList.add(SWAP_CLASS);
  window.setTimeout(() => dialog.classList.remove(SWAP_CLASS), 400);
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
  window.clearTimeout(modeRenderTimer);
  pendingRender = false;
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
    if (dataset.class.id === id && Array.isArray(dataset.events)) {
      cache.set(id, dataset);
      state.events = dataset.events;
      state.loading = false;
      render();
      if (pickerOpen) elements.main.focus();
      toast(`${selected.name} timetable loaded.`);
      return;
    }
  } catch (error) {
    if (isAbort(error)) return;
  }
  state.loading = false;
  state.error = 'We couldn’t load this class’s timetable. Check your connection and try again.';
  render();
}

function switchMode(mode: 'class' | 'lecturer', button: HTMLButtonElement): void {
  button.focus({ preventScroll: true });
  if (state.mode === mode) return;
  state.request?.abort();
  state.mode = mode;
  state.selected = null;
  state.events = [];
  state.loading = false;
  state.error = '';
  history.replaceState(null, '', location.pathname);
  elements.classDialog.scrollTop = 0;
  elements.classResults.scrollTop = 0;
  renderModeChrome({ dialogOnly: true });
  prepareClassPicker();
  renderClassResults({ defer: true });
  animatePickerSwap(mode);
  pendingRender = true;
  const generation = ++modeRenderGeneration;
  window.clearTimeout(modeRenderTimer);
  modeRenderTimer = window.setTimeout(() => {
    if (generation !== modeRenderGeneration || !pendingRender) return;
    idle(() => {
      if (generation !== modeRenderGeneration || !pendingRender) return;
      pendingRender = false;
      render();
    });
  }, 300);
}

export function initPicker(): void {
  on(elements.classButton, 'click', openClassPicker);
  on(elements.compactClassButton, 'click', openClassPicker);
  on(elements.classSearch, 'input', () => renderClassResults());
  on(elements.programmeFilter, 'change', () => renderClassResults());
  on(elements.semesterFilter, 'change', () => renderClassResults());
  on(elements.groupFilter, 'change', () => renderClassResults());
  on(elements.clearClassFilters, 'click', () => {
    elements.classSearch.value = '';
    elements.programmeFilter.value = '';
    elements.semesterFilter.value = '';
    elements.groupFilter.value = '';
    renderClassResults();
    elements.classSearch.focus();
  });
  on(elements.classDialog, 'close', () => {
    invalidateResults();
    window.clearTimeout(modeRenderTimer);
    if (!pendingRender) return;
    pendingRender = false;
    render();
  });
  delegate<HTMLElement>(elements.classResults, '[data-class-id]', 'click', (button) =>
    selectClass(button.dataset.classId || ''),
  );
  delegate<HTMLElement>(elements.classResults, '[data-bookmark-kind]', 'click', (button) => {
    const kind = button.dataset.bookmarkKind;
    if (kind !== 'class' && kind !== 'lecturer') return;
    const bookmarked = toggleBookmark(kind, button.dataset.bookmarkName || '');
    syncBookmarkStars(elements.classResults);
    reorderBookmarkedRows(kind);
    if (bookmarked) elements.classResults.scrollTo({ top: 0, behavior: 'smooth' });
  });
  for (const mode of ['class', 'lecturer'] as const)
    on(mode === 'class' ? elements.studentMode : elements.lecturerMode, 'click', () =>
      switchMode(mode, mode === 'class' ? elements.studentMode : elements.lecturerMode),
    );
}
