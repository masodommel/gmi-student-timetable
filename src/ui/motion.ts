const PREWARM_ANIMATIONS = [
  'month-slide-next',
  'month-slide-previous',
  'day-pill-in',
  'week-step-tap',
  'notice-in',
  'toast-in',
  'mobile-export-in',
  'picker-swap-in',
  'theme-toggle-switch',
  'theme-icon-switch',
] as const;

let warmed = false;

export function prewarmAnimations(): void {
  if (warmed) return;
  warmed = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const run = (): void => {
    const sandbox = document.createElement('div');
    sandbox.className = 'motion-prewarm';
    sandbox.setAttribute('aria-hidden', 'true');
    sandbox.innerHTML = PREWARM_ANIMATIONS.map((name) => `<i data-motion-prewarm="${name}"></i>`).join('');
    document.body.append(sandbox);
    for (const element of sandbox.children) void (element as HTMLElement).offsetWidth;
    window.setTimeout(() => sandbox.remove(), 650);
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1500 });
  else run();
}
