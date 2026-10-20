import { addDays } from '../timetable/core.js';
import { sourceSaysOnline } from '../timetable/notes.js';
import { editDav } from '../dav/index.js';
import { installLocal, state } from '../state.js';
import { closest, delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import { editDayOptions, editLessonButton, editPeriodOptions, lessonDetails, onlineNoteNotice } from './templates.js';
import { initialize } from './bootstrap.js';
import { setWeek } from './navigation.js';
import { openClassPicker, selectClass } from './picker.js';
import { openDialog, render, toast } from './shell.js';

export function openLesson(id: string): void {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  elements.lessonContent.innerHTML = lessonDetails(event, state.selected?.name || '');
  if (sourceSaysOnline(event)) {
    elements.lessonContent.insertAdjacentHTML(
      'beforeend',
      onlineNoteNotice(
        'The timetable note says online. Confirm the latest arrangements and meeting link with your lecturer.',
      ),
    );
  }
  if (state.davBuffer && state.editor?.events[id])
    elements.lessonContent.insertAdjacentHTML('beforeend', editLessonButton(id));
  openDialog(elements.lessonDialog);
}

export function initLesson(): void {
  on(elements.schedule, 'click', (event) => {
    const lesson = closest<HTMLElement>(event.target, '[data-event-id]');
    if (lesson) return openLesson(lesson.dataset.eventId || '');
    const action = closest<HTMLElement>(event.target, '[data-action]')?.dataset.action;
    if (action === 'choose-class') openClassPicker();
    else if (action === 'retry') state.selected && state.manifest ? selectClass(state.selected.id) : initialize();
    else if (action === 'clear-search') {
      state.query = '';
      elements.subjectSearch.value = '';
      render();
      elements.subjectSearch.focus();
    } else if (action === 'next-scheduled') {
      const next = state.events.find((item) => item.date > addDays(state.week, 6));
      if (next) setWeek(next.date, next.date);
    }
  });
  delegate<HTMLElement>(elements.lessonContent, '[data-edit-id]', 'click', (button) => {
    const id = button.dataset.editId;
    if (!id || !state.editor) return;
    state.editId = id;
    const record = state.editor.events[id];
    if (!record) return;
    elements.editNote.value = record.note;
    elements.editDay.innerHTML = editDayOptions();
    elements.editDay.value = String(record.slots[0].day);
    elements.editPeriod.innerHTML = editPeriodOptions(state.editor.periods);
    elements.editPeriod.value = String(record.slots[0].period);
    elements.editError.hidden = true;
    openDialog(elements.editDialog);
  });
  on(elements.editForm, 'submit', async (event) => {
    event.preventDefault();
    if (!state.selected || !state.manifest || !state.editor || !state.davBuffer || !state.editId) return;
    const selected = state.selected.id;
    const week = state.week;
    const filename = state.manifest.filename;
    const buffer = state.davBuffer;
    const editor = state.editor;
    const editId = state.editId;
    elements.saveEdit.disabled = true;
    elements.editError.hidden = true;
    try {
      const result = await editDav(buffer, editor, editId, {
        note: elements.editNote.value,
        day: Number(elements.editDay.value),
        period: Number(elements.editPeriod.value),
      });
      result.decoded.manifest.filename = filename;
      installLocal(result.decoded, result.buffer);
      elements.editDialog.close();
      elements.lessonDialog.close();
      await selectClass(selected);
      setWeek(week);
      elements.main.focus();
      toast('Recurring lesson updated locally. Export DAV to save your changes.');
    } catch (error) {
      elements.editError.textContent = error instanceof Error ? error.message : 'This edit could not be applied.';
      elements.editError.hidden = false;
    } finally {
      elements.saveEdit.disabled = false;
    }
  });
}
