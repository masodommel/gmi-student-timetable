import { isAbort } from '../errors.js';
import { media, scheduleUrl, state } from '../state.js';
import { classCalendar } from '../timetable/calendar.js';
import { calendarPath } from '../timetable/core.js';
import { $, delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { exportDialog, shareDialog } from './templates.js';
import { openDialog, toast } from './shell.js';

let exportBlobUrl: string | null = null;

export function releaseExportBlob(): void {
  if (!exportBlobUrl) return;
  URL.revokeObjectURL(exportBlobUrl);
  exportBlobUrl = null;
}

export function openExport(): void {
  if (!state.selected || state.loading || state.error || !state.selected.eventCount) return;
  const selected = state.selected;
  releaseExportBlob();
  let downloadPath = '';
  if (!state.localFile && state.mode === 'class') downloadPath = calendarPath(selected.id);
  if (state.localFile || state.mode === 'lecturer') {
    exportBlobUrl = URL.createObjectURL(
      new Blob([classCalendar(selected, state.events)], { type: 'text/calendar;charset=utf-8' }),
    );
    downloadPath = exportBlobUrl;
  }
  elements.exportContent.innerHTML = exportDialog(selected, {
    downloadPath,
    lecturerMode: state.mode === 'lecturer',
    week: state.week,
  });
  openDialog(elements.exportDialog);
}

export async function shareWeek(): Promise<void> {
  if (!state.selected) return;
  const selected = state.selected;
  const url = scheduleUrl()?.href;
  if (!url) return;
  try {
    if (media.matches && navigator.share) {
      await navigator.share({ title: selected.name + ' timetable', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Class and week link copied.');
  } catch (error) {
    if (isAbort(error)) return;
    elements.lessonContent.innerHTML = shareDialog(url);
    openDialog(elements.lessonDialog);
    $<HTMLInputElement>('#share-link').select();
  }
}

export function initExport(): void {
  elements.exportTriggers.forEach((button) => on(button, 'click', openExport));
  on(elements.shareButton, 'click', shareWeek);
  delegate<HTMLElement>(elements.exportContent, '#calendar-download', 'click', () =>
    toast('Calendar download started. Import the file in your calendar app.'),
  );
}
