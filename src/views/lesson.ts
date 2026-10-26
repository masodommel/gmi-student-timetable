import { addDays } from '../timetable/core.js';
import { sourceSaysOnline } from '../timetable/notes.js';
import { addLesson, deleteLesson, editDav } from '../dav/index.js';
import { installLocal, state } from '../state.js';
import { syncBookmarkStars, toggleBookmark } from '../ui/bookmarks.js';
import { closest, delegate, on } from '../ui/dom.js';
import { elements } from '../ui/elements.js';
import {
  addLessonButton,
  addNamedOptions,
  addSpanOptions,
  deleteLessonButton,
  editDayOptions,
  editLessonButton,
  editPeriodOptions,
  lessonDetails,
  onlineNoteNotice,
} from './templates.js';
import { initialize } from './bootstrap.js';
import { setWeek } from './navigation.js';
import { openClassPicker, selectClass } from './picker.js';
import { openDialog, render, toast } from './shell.js';

let deleteArmedLesson = -1;
let deleteArmTimer: number | undefined;

function resetDeleteButton(button: HTMLElement): void {
  clearTimeout(deleteArmTimer);
  deleteArmedLesson = -1;
  button.textContent = 'Delete lesson';
  button.classList.remove('danger');
}

function showLessonError(message: string): void {
  const line = elements.lessonContent.querySelector<HTMLElement>('#lesson-error');
  if (line) {
    line.textContent = message;
    line.hidden = false;
  }
}

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
  const editor = state.editor;
  const record = editor?.events[id];
  if (state.davBuffer && record) {
    elements.lessonContent.insertAdjacentHTML('beforeend', editLessonButton(id));
    if (state.mode === 'class') elements.lessonContent.insertAdjacentHTML('beforeend', addLessonButton(id));
    const lesson = editor?.lessons[String(record.lessonId)];
    if (lesson && lesson.coupling === -1)
      elements.lessonContent.insertAdjacentHTML('beforeend', deleteLessonButton(lesson.lessonId));
  }
  openDialog(elements.lessonDialog);
}

function openAddLesson(id: string): void {
  const event = state.events.find((item) => item.id === id);
  const editor = state.editor;
  const record = editor?.events[id];
  const lesson = editor?.lessons[String(record?.lessonId ?? -1)];
  const slot = record?.slots[0];
  if (!event || !editor || !record || !slot) return;
  elements.addTitle.textContent = `Add a new lesson to ${event.className || state.selected?.name || ''}`;
  elements.addSubject.innerHTML = addNamedOptions(editor.subjects, 'None');
  elements.addSubject.value =
    lesson && editor.subjects.some((item) => item.id === String(lesson.subjectRef)) ? String(lesson.subjectRef) : '';
  elements.addDay.innerHTML = editDayOptions();
  elements.addDay.value = String(slot.day);
  elements.addPeriod.innerHTML = editPeriodOptions(editor.periods);
  elements.addPeriod.value = String(slot.period);
  elements.addSpan.innerHTML = addSpanOptions(
    Math.max(
      8,
      record.slots.reduce((sum, item) => sum + item.span, 0),
    ),
  );
  elements.addSpan.value = String(record.slots.reduce((sum, item) => sum + item.span, 0));
  elements.addLecturer.innerHTML = addNamedOptions(editor.staff, 'Not listed');
  elements.addLecturer.value = editor.staff.some((item) => item.id === String(slot.lecturer))
    ? String(slot.lecturer)
    : '';
  elements.addRoom.innerHTML = addNamedOptions(editor.rooms, 'Not listed');
  elements.addRoom.value = editor.rooms.some((item) => item.id === String(slot.room)) ? String(slot.room) : '';
  elements.addNote.value = record.note;
  elements.addError.hidden = true;
  openDialog(elements.addDialog);
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
  delegate<HTMLElement>(elements.lessonContent, '[data-add-lesson]', 'click', (button) =>
    openAddLesson(button.dataset.addLesson || ''),
  );
  delegate<HTMLElement>(elements.lessonContent, '[data-bookmark-kind]', 'click', (button) => {
    const kind = button.dataset.bookmarkKind;
    if (kind !== 'class' && kind !== 'lecturer') return;
    toggleBookmark(kind, button.dataset.bookmarkName || '');
    syncBookmarkStars(elements.lessonContent);
  });
  delegate<HTMLButtonElement>(elements.lessonContent, '[data-delete-lesson]', 'click', async (button) => {
    const lessonId = Number(button.dataset.deleteLesson);
    if (!Number.isInteger(lessonId)) return;
    if (deleteArmedLesson !== lessonId) {
      clearTimeout(deleteArmTimer);
      deleteArmedLesson = lessonId;
      button.textContent = 'Confirm delete';
      button.classList.add('danger');
      deleteArmTimer = window.setTimeout(() => resetDeleteButton(button), 4000);
      return;
    }
    resetDeleteButton(button);
    const selected = state.selected?.id;
    const week = state.week;
    const filename = state.manifest?.filename;
    const buffer = state.davBuffer;
    const editor = state.editor;
    const errorLine = elements.lessonContent.querySelector<HTMLElement>('#lesson-error');
    if (!selected || !filename || !buffer || !editor) return;
    if (errorLine) errorLine.hidden = true;
    button.disabled = true;
    try {
      const result = await deleteLesson(buffer, editor, lessonId);
      result.decoded.manifest.filename = filename;
      installLocal(result.decoded, result.buffer);
      elements.lessonDialog.close();
      await selectClass(selected);
      setWeek(week);
      elements.main.focus();
      toast('Lesson deleted locally. Export DAV to save your changes.');
    } catch (error) {
      showLessonError(error instanceof Error ? error.message : 'This lesson could not be deleted.');
    } finally {
      button.disabled = false;
    }
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
  on(elements.addForm, 'submit', async (event) => {
    event.preventDefault();
    if (!state.selected || !state.manifest || !state.editor || !state.davBuffer) return;
    const selected = state.selected.id;
    const week = state.week;
    const filename = state.manifest.filename;
    const buffer = state.davBuffer;
    const editor = state.editor;
    elements.saveAdd.disabled = true;
    elements.addError.hidden = true;
    try {
      // A staff select always reports a value; '' means "Not listed", which the writer stores as unlisted.
      // Colliding slots abort with the clashing lesson, slot and week instead of writing a
      // half-hidden clone, unless the operator ticks "keep weeks" in the conflict box.
      const result = await addLesson(buffer, editor, {
        classId: selected,
        subjectId: elements.addSubject.value,
        day: Number(elements.addDay.value),
        period: Number(elements.addPeriod.value),
        span: Number(elements.addSpan.value),
        lecturer: elements.addLecturer.value,
        room: elements.addRoom.value,
        note: elements.addNote.value,
        conflictPolicy: elements.addKeepCells.checked ? 'keep' : 'error',
      });
      result.decoded.manifest.filename = filename;
      installLocal(result.decoded, result.buffer);
      elements.addDialog.close();
      elements.lessonDialog.close();
      await selectClass(selected);
      setWeek(week);
      elements.main.focus();
      toast('Lesson added locally. Export DAV to save your changes.');
    } catch (error) {
      elements.addError.textContent = error instanceof Error ? error.message : 'This lesson could not be added.';
      elements.addError.hidden = false;
    } finally {
      elements.saveAdd.disabled = false;
    }
  });
}
