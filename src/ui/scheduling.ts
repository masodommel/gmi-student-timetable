interface SchedulerYield {
  yield?: () => Promise<void>;
}

export function yieldToMain(): Promise<void> {
  const scheduler = (window as Window & { scheduler?: SchedulerYield }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function idle(callback: () => void): void {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(callback, { timeout: 500 });
  else window.setTimeout(callback, 16);
}
