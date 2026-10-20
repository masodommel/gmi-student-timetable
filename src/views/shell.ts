import { media, SEEN_REVISION_STORAGE_KEY, state } from '../state.js';
import { formatDate, monday, TIMEZONE, weekLabel } from '../timetable/core.js';
import { closest, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { icon } from '../ui/icons.js';
import { readStored, writeStored } from '../ui/storage.js';
import { renderSchedule } from './schedule.js';

let toastTimer: number | undefined;

function formatTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : 'pending';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

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
  const focusedDay = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.day : undefined;
  if (focusedDay)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-day="${focusedDay}"]`)?.focus());
  renderShell();
  renderSchedule();
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
  elements.davExport.hidden = !state.davBuffer;
  elements.davHint.hidden = !state.davBuffer;
  const modeLabel = state.mode === 'lecturer' ? 'Lecturer' : 'Class';
  elements.className.textContent = modeLabel;
  elements.compactClassName.textContent = modeLabel;
  elements.classButton.dataset.mode = state.mode;
  elements.compactClassButton.dataset.mode = state.mode;
  elements.mobileClassName.textContent = selected?.name || '';
  elements.mobileExportLabel.textContent = state.mode === 'lecturer' ? 'LECTURER CALENDAR' : 'YOUR CLASS CALENDAR';
  elements.classButton.disabled = elements.compactClassButton.disabled = !ready;
  const shareButton = elements.shareButton;
  shareButton.disabled = !usable || state.localFile;
  shareButton.title = state.localFile
    ? 'Your local file cannot be shared through a website link. Export its class calendar instead.'
    : 'Share this class and week';
  elements.fileSourceLabel.textContent = state.localFile ? manifest?.filename || '' : '';
  elements.fileSourceLabel.hidden = !state.localFile;
  elements.restoreSource.hidden = !state.localFile;
  const notices: Array<[HTMLButtonElement, HTMLElement, HTMLElement]> = [
    [elements.latestTimetable, elements.latestTimetableLabel, elements.revisionNewDot],
    [elements.mobileRevision, elements.mobileRevisionLabel, elements.mobileRevisionDot],
  ];
  for (const [notice, label, dot] of notices) {
    notice.hidden = !manifest;
    if (manifest) {
      const message = state.localFile
        ? 'Local file loaded'
        : `${manifest.revisionCode || 'Latest'} · ${manifest.sourceRevisionDate ? formatDate(manifest.sourceRevisionDate, { day: 'numeric', month: 'short', year: 'numeric' }) : manifest.sourceRevision}`;
      const unread = !state.localFile && readStored(SEEN_REVISION_STORAGE_KEY) !== manifest.sourceHash;
      label.textContent = message;
      dot.hidden = !unread;
      notice.setAttribute(
        'aria-label',
        `${unread ? 'New timetable loaded. ' : ''}${message}. View timetable source details`,
      );
      notice.title = state.localFile
        ? manifest.filename || ''
        : `Latest provided timetable: ${manifest.sourceFilename || manifest.sourceRevision}`;
    }
  }
  const publishedAt = manifest?.publishedAt;
  elements.aboutSourceDescription.textContent = state.localFile
    ? `You’re viewing ${manifest?.filename || ''}, read locally on this device. The planning range is ${manifest?.planningStart || ''} through ${manifest?.planningEnd || ''}.`
    : manifest
      ? `Source: ${manifest.sourceFilename || manifest.title}. Revision ${manifest.revisionCode || 'unknown'}, dated ${manifest.sourceRevisionDate ? formatDate(manifest.sourceRevisionDate, { day: 'numeric', month: 'short', year: 'numeric' }) : manifest.sourceRevision}. Planning range ${manifest.planningStart}–${manifest.planningEnd}.${publishedAt ? ` Published ${formatTimestamp(publishedAt)}.` : ''} Calendar downloads are snapshots, replace earlier imports to use this revision.`
      : 'Loading timetable source details…';
  const lastChecked = state.lastCheckedAt ? formatTimestamp(state.lastCheckedAt) : 'pending';
  elements.aboutSyncDescription.textContent = `The sync service checks the GMI timetable inbox every 15 minutes, and this page checks while open. Last checked: ${lastChecked}.${state.lastCheckFailed ? ' The last check could not reach the server.' : ''}`;
  elements.classDialogDescription.textContent =
    state.mode === 'lecturer'
      ? 'Search by lecturer or resource name.'
      : state.localFile
        ? 'Choose a class from this file.'
        : 'Search by class, programme or group.';
  elements.exportTriggers.forEach((button) => {
    button.disabled = !usable || !selected?.eventCount;
  });
  elements.mobileExport.hidden = !selected;
  elements.summary.hidden = !usable;
  elements.dayStrip.hidden = !usable;
  elements.weekLabel.textContent = ready ? weekLabel(state.week) : 'Loading schedule…';
  elements.weekDate.disabled = !ready;
  elements.weekOpen.disabled = !ready;
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
}

export function initShell(): void {
  on(elements.qualityButton, 'click', () => openDialog(elements.aboutDialog));
  on(elements.aboutButton, 'click', () => openDialog(elements.aboutDialog));
  on(elements.privacyButton, 'click', () => openDialog(elements.privacyDialog));
  for (const notice of [elements.latestTimetable, elements.mobileRevision])
    on(notice, 'click', () => {
      if (!state.localFile && state.manifest?.sourceHash)
        writeStored(SEEN_REVISION_STORAGE_KEY, state.manifest.sourceHash);
      render();
      openDialog(elements.aboutDialog);
    });
  elements.closeButtons.forEach((button) =>
    on(button, 'click', () => closest<HTMLDialogElement>(button, 'dialog')?.close()),
  );
  elements.dialogs.forEach((dialog) =>
    on<HTMLDialogElement, MouseEvent>(dialog, 'click', (event) => {
      if (event.target !== dialog) {
        if (!(dialog === elements.lessonDialog && media.matches)) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('button, a, input, textarea, select, summary, label')) return;
        dialog.close();
        return;
      }
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
}
