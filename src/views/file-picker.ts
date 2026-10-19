import { clampWeek, localToday } from '../timetable/core.js';
import { startDavImport, type DavImportJob } from '../dav/index.js';
import { isAbort } from '../errors.js';
import { classCache, installLocal, resetToProvided, state, updateUrl } from '../state.js';
import { on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { initialize } from './bootstrap.js';
import { releaseExportBlob } from './export.js';
import { openClassPicker, selectClass } from './picker.js';
import { openDialog, render, toast } from './shell.js';

let activeImport: DavImportJob | null = null;
let importSequence = 0;

export function openFilePicker(): void {
  elements.fileInput.value = '';
  elements.fileError.hidden = true;
  elements.fileProgress.hidden = true;
  openDialog(elements.fileDialog);
}

export async function importFile(file: File | undefined): Promise<void> {
  if (!file) return;
  const sequence = ++importSequence;
  elements.fileError.hidden = true;
  if (file.size > 20 * 1024 * 1024) {
    elements.fileError.textContent = 'Choose a timetable file smaller than 20 MB.';
    elements.fileError.hidden = false;
    return;
  }
  elements.fileProgress.hidden = false;
  elements.fileProgress.textContent = `Reading ${file.name} on your device…`;
  elements.fileInput.disabled = true;
  try {
    const buffer = await file.arrayBuffer();
    const retainedBuffer = buffer.slice(0);
    if (sequence !== importSequence || !elements.fileDialog.open) return;
    const job = startDavImport(buffer, file.name);
    activeImport = job;
    const result = await job.promise;
    activeImport = null;
    if (sequence !== importSequence || !elements.fileDialog.open) return;
    state.generation++;
    state.request?.abort();
    const previousId = state.selected?.id;
    state.localFile = true;
    installLocal(result, retainedBuffer);
    state.selected = null;
    state.events = [];
    state.error = '';
    state.loading = false;
    state.query = '';
    elements.subjectSearch.value = '';

    state.week = clampWeek(localToday(), result.manifest.planningStart, result.manifest.planningEnd);
    state.day = state.week;
    updateUrl();
    render();
    elements.fileDialog.close();
    if (previousId && classCache.has(previousId)) await selectClass(previousId);
    toast(
      `${result.manifest.classes.length} classes loaded from your file.${result.omitted ? ' Unplaced or unverified slots were excluded from dated entries.' : ''}`,
    );
    openClassPicker();
  } catch (error) {
    if (isAbort(error) || sequence !== importSequence) return;
    elements.fileError.textContent = error instanceof Error ? error.message : 'This file could not be read.';
    elements.fileError.hidden = false;
  } finally {
    if (sequence === importSequence) {
      activeImport = null;
      elements.fileInput.disabled = false;
      elements.fileProgress.hidden = true;
    }
  }
}

export async function restoreProvidedSchedule(): Promise<void> {
  resetToProvided();
  releaseExportBlob();
  await initialize();
  toast('The provided timetable is active again.');
}

export function initFilePicker(): void {
  on(elements.openFileButton, 'click', openFilePicker);
  on(elements.fileInput, 'change', () => importFile(elements.fileInput.files?.[0]));
  on(elements.restoreSource, 'click', restoreProvidedSchedule);
  elements.fileDialog.addEventListener('close', () => {
    activeImport?.cancel();
    activeImport = null;
    importSequence++;
    elements.fileInput.disabled = false;
    elements.fileProgress.hidden = true;
  });
}
