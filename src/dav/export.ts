import { state } from '../state.js';
import { on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { toast } from '../views/shell.js';
import { davDownload } from './writer.js';

export function initDavExport(): void {
  on(elements.davExport, 'click', () => {
    if (!state.davBuffer) return;
    const url = URL.createObjectURL(davDownload(state.davBuffer));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'edited-' + (state.manifest?.filename || 'Timetable.dav');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('DAV downloaded. Verify this experimental export in DaVinci before distributing.');
  });
}
