import { elements } from './elements.js';
import { icon } from './icons.js';

export type Theme = 'light' | 'dark';

const THEME_COOKIE = 'gmi-theme';
const COOKIE_MAX_AGE = 31536000;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(): Theme {
  const stored = readCookie(THEME_COOKIE);
  return stored === 'dark' || stored === 'light' ? stored : systemTheme();
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  elements.themeColorMeta.content = theme === 'dark' ? '#1f1f1f' : '#ffffff';
}

function renderToggle(theme: Theme): void {
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  elements.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  elements.themeToggle.setAttribute('aria-label', label);
  elements.themeToggle.title = label;
  elements.themeIcon.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
}

export function toggleTheme(): void {
  const theme: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  writeCookie(THEME_COOKIE, theme);
  applyTheme(theme);
  renderToggle(theme);
  elements.themeToggle.classList.remove('theme-switching');
  void elements.themeToggle.offsetWidth;
  elements.themeToggle.classList.add('theme-switching');
}

export function initTheme(): void {
  const theme = resolveTheme();
  applyTheme(theme);
  renderToggle(theme);
  elements.themeToggle.addEventListener('click', toggleTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readCookie(THEME_COOKIE) !== null) return;
    const next = systemTheme();
    applyTheme(next);
    renderToggle(next);
  });
}
