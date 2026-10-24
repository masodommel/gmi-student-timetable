import { openDialog } from '../views/shell.js';
import { readCookie, writeCookie } from './cookies.js';
import { elements } from './elements.js';

const RAIL_COOKIE = 'gmi-rail';

function railHidden(): boolean {
  return readCookie(RAIL_COOKIE) === 'hidden';
}

function applyRailPreference(): void {
  const collapsed = railHidden();
  document.documentElement.dataset.rail = collapsed ? 'hidden' : 'visible';
  const label = collapsed ? 'Show the class panel' : 'Hide the class panel';
  elements.railToggle.setAttribute('aria-pressed', String(collapsed));
  elements.railToggle.setAttribute('aria-label', label);
  elements.railToggle.title = label;
}

export function initRail(): void {
  applyRailPreference();
  elements.railToggle.addEventListener('click', () => {
    writeCookie(RAIL_COOKIE, railHidden() ? 'visible' : 'hidden');
    applyRailPreference();
  });
}

const SETTINGS_OPTIONS = [
  [elements.accessibilityButton, elements.accessibilityDialog],
  [elements.qualityButton, elements.aboutDialog],
  [elements.openFileButton, elements.fileDialog],
] as Array<[HTMLButtonElement, HTMLDialogElement]>;

const returnToSettings = new Set<HTMLDialogElement>();

export function initSettings(): void {
  elements.settingsButton.addEventListener('click', () => openDialog(elements.settingsDialog));
  for (const [option, target] of SETTINGS_OPTIONS)
    option.addEventListener('click', () => {
      if (!elements.settingsDialog.open) return;
      returnToSettings.add(target);
      elements.settingsDialog.close();
    });
  for (const [, target] of SETTINGS_OPTIONS)
    target.addEventListener('close', () => {
      if (!returnToSettings.delete(target)) return;
      elements.settingsButton.focus();
    });
}
