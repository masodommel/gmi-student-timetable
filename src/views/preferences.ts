import { state } from '../state.js';
import { on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { readFlag, writeFlag } from '../ui/storage.js';
import { openDialog, render } from './shell.js';

export function applyPreferences(): void {
  for (const { id, input } of elements.preferenceInputs)
    if (id !== 'agenda-default') document.documentElement.classList.toggle(id, input.checked);
}

export function initPreferences(): void {
  for (const { id, input } of elements.preferenceInputs) {
    input.checked = readFlag('timetable-' + id);
    on(input, 'change', () => {
      writeFlag('timetable-' + id, input.checked);
      if (id === 'agenda-default') state.view = input.checked ? 'agenda' : 'week';
      applyPreferences();
      render();
    });
  }
  applyPreferences();
  const agendaDefault = elements.preferenceInputs.find(({ id }) => id === 'agenda-default');
  if (agendaDefault?.input.checked) state.view = 'agenda';
  on(elements.accessibilityButton, 'click', () => openDialog(elements.accessibilityDialog));
}
