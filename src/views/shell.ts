import { media, SEEN_REVISION_STORAGE_KEY, state } from '../state.js';
import { hazeActive, hazeAdvisory } from '../timetable/advisories.js';
import { formatDate, monday, weekLabel } from '../timetable/core.js';
import { closest, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { icon } from '../ui/icons.js';
import { readStored, writeStored } from '../ui/storage.js';
import { renderSchedule } from './schedule.js';

let toastTimer: number | undefined;

export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon);
  });
}

export function toast(message: string): void {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 5000);
}

export function openDialog(dialog: HTMLDialogElement): void {
  if (!dialog.open) dialog.showModal();
}

export function render(): void {
  renderHazeAdvisory();
  const focusedDay = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.day : undefined;
  if (focusedDay)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-day="${focusedDay}"]`)?.focus());
  renderShell();
  renderSchedule();
}

export function renderHazeAdvisory(): void {
  elements.hazeAdvisory.hidden = !hazeActive();
  elements.hazeBrief.hidden = !hazeActive();
  const collapsed = readStored(hazeAdvisory.id + '-collapsed') === 'true';
  elements.hazeDetails.hidden = collapsed;
  elements.hazeToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.hazeToggle.textContent = collapsed ? 'Show haze reminder' : 'Hide haze reminder';
  elements.hazeAirLink.href = hazeAdvisory.airQualityUrl;
  elements.hazeHealthLink.href = hazeAdvisory.healthUrl;
}

function renderShell(): void {
  const manifest = state.manifest;
  const ready = Boolean(manifest);
  const selected = state.selected;
  const usable = Boolean(selected && !state.loading && !state.error);
  elements.studentMode.setAttribute('aria-pressed', String(state.mode === 'class'));
  elements.studentMode.disabled = elements.lecturerMode.disabled = !ready;
  elements.lecturerMode.setAttribute('aria-pressed', String(state.mode === 'lecturer'));
  elements.davExport.disabled = !state.davBuffer;
  elements.davHint.textContent = state.davBuffer
    ? 'Local edits affect recurring lessons. Export DAV saves the full file; verify it in DaVinci.'
    : 'To edit and export a DAV, open your original file. Downloads preserve the full timetable.';
  elements.className.textContent = selected?.name || 'Let’s get you started';
  elements.compactClassName.textContent =
    selected?.name || (state.mode === 'lecturer' ? 'Choose a lecturer' : 'Choose your class');
  elements.mobileClassName.textContent = selected?.name || '';
  elements.mobileExportLabel.textContent = state.mode === 'lecturer' ? 'LECTURER CALENDAR' : 'YOUR CLASS CALENDAR';
  elements.classButtonHint.textContent =
    state.mode === 'lecturer' ? 'Lecturer timetable' : selected ? 'Your timetable' : 'Choose your class';
  elements.compactClassButtonHint.textContent = state.mode === 'lecturer' ? 'LECTURER' : 'YOUR CLASS';
  elements.classDialogFootnote.textContent =
    state.mode === 'lecturer'
      ? 'Lecturer calendars include all classes and resource activities listed in this source.'
      : 'Class calendars contain only that class’s entries.';
  elements.classButton.disabled = elements.compactClassButton.disabled = !ready;
  const shareButton = elements.shareButton;
  shareButton.disabled = !usable || state.localFile;
  shareButton.title = state.localFile
    ? 'Your local file cannot be shared through a website link. Export its class calendar instead.'
    : 'Share this class and week';
  elements.fileSourceLabel.textContent = state.localFile
    ? `On this device: ${manifest?.filename || ''}`
    : 'Using the provided timetable';
  elements.restoreSource.hidden = !state.localFile;
  const notice = elements.latestTimetable;
  notice.hidden = !manifest;
  if (manifest) {
    const label = state.localFile
      ? 'Local file loaded'
      : `${manifest.revisionCode || 'Latest'} · ${manifest.sourceRevisionDate ? formatDate(manifest.sourceRevisionDate, { day: 'numeric', month: 'short', year: 'numeric' }) : manifest.sourceRevision}`;
    const unread = !state.localFile && readStored(SEEN_REVISION_STORAGE_KEY) !== manifest.sourceHash;
    elements.latestTimetableLabel.textContent = label;
    elements.revisionNewDot.hidden = !unread;
    notice.setAttribute(
      'aria-label',
      `${unread ? 'New timetable loaded. ' : ''}${label}. View timetable source details`,
    );
    notice.title = state.localFile
      ? manifest.filename || ''
      : `Latest provided timetable: ${manifest.sourceFilename || manifest.sourceRevision}`;
  }
  elements.revision.textContent = state.localFile
    ? 'Source · your local file'
    : `Source revision · ${manifest?.sourceRevision || 'loading'}`;
  elements.aboutSourceDescription.textContent = state.localFile
    ? `You’re viewing ${manifest?.filename || ''}, read locally on this device. The planning range is ${manifest?.planningStart || ''} through ${manifest?.planningEnd || ''}.`
    : manifest
      ? `Latest provided timetable: ${manifest.sourceFilename || manifest.title}. Revision ${manifest.revisionCode || ''}, dated ${manifest.sourceRevision}. Planning range: ${manifest.planningStart} through ${manifest.planningEnd}. Calendar downloads are snapshots; replace an older imported calendar to use this revision.`
      : 'Loading timetable source details…';
  elements.classDialogDescription.textContent =
    state.mode === 'lecturer'
      ? 'Search a lecturer or resource name to see entries across all classes. Source resource names may include activities.'
      : state.localFile
        ? 'Choose your class from this file. Reopen the file after refreshing the page.'
        : 'Choose your exact class or team. We’ll remember it on this device.';
  elements.exportTriggers.forEach((button) => {
    button.disabled = !usable || !selected?.eventCount;
  });
  elements.mobileExport.hidden = !selected;
  elements.summary.hidden = !usable;
  elements.subbar.hidden = !usable;
  elements.dayStrip.hidden = !usable;
  elements.weekLabel.textContent = ready ? weekLabel(state.week) : 'Loading schedule…';
  elements.weekDate.disabled = !ready;
  elements.weekDate.value = state.week;
  if (manifest) {
    elements.weekDate.min = manifest.planningStart;
    elements.weekDate.max = manifest.planningEnd;
    elements.previousWeek.disabled = state.week <= monday(manifest.planningStart);
    elements.nextWeek.disabled = state.week >= monday(manifest.planningEnd);
    elements.todayButton.disabled = false;
  }
  elements.weekView.classList.toggle('active', state.view === 'week');
  elements.agendaView.classList.toggle('active', state.view === 'agenda');
  elements.weekView.setAttribute('aria-pressed', String(state.view === 'week'));
  elements.agendaView.setAttribute('aria-pressed', String(state.view === 'agenda'));
  elements.greeting.textContent =
    state.mode === 'lecturer'
      ? 'LECTURER TIMETABLE · ALL CLASSES'
      : selected
        ? 'YOUR CLASS. YOUR SCHEDULE.'
        : 'YOUR STUDENT PLANNER';
  elements.headingDescription.textContent = selected
    ? `${selected.name} · Times in Kuala Lumpur`
    : 'Less searching. More time for what’s next.';
}

export function initShell(): void {
  on(elements.qualityButton, 'click', () => openDialog(elements.aboutDialog));
  on(elements.aboutButton, 'click', () => openDialog(elements.aboutDialog));
  on(elements.latestTimetable, 'click', () => {
    if (!state.localFile && state.manifest?.sourceHash)
      writeStored(SEEN_REVISION_STORAGE_KEY, state.manifest.sourceHash);
    render();
    openDialog(elements.aboutDialog);
  });
  on(elements.hazeToggle, 'click', () => {
    const collapsed = !elements.hazeDetails.hidden;
    writeStored(hazeAdvisory.id + '-collapsed', String(collapsed));
    elements.hazeDetails.hidden = collapsed;
    elements.hazeToggle.setAttribute('aria-expanded', String(!collapsed));
    elements.hazeToggle.textContent = collapsed ? 'Show haze reminder' : 'Hide haze reminder';
  });
  elements.closeButtons.forEach((button) =>
    on(button, 'click', () => closest<HTMLDialogElement>(button, 'dialog')?.close()),
  );
  elements.dialogs.forEach((dialog) =>
    on<HTMLDialogElement, MouseEvent>(dialog, 'click', (event) => {
      if (event.target !== dialog) return;
      const rectangle = dialog.getBoundingClientRect();
      if (
        event.clientX < rectangle.left ||
        event.clientX > rectangle.right ||
        event.clientY < rectangle.top ||
        event.clientY > rectangle.bottom
      )
        dialog.close();
    }),
  );
  media.addEventListener('change', render);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
}
