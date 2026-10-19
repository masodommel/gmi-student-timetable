import type { TimetableEvent } from './types.js';

export function markOverlaps(events: TimetableEvent[]): void {
  const days = new Map<string, TimetableEvent[]>();
  for (const event of events) {
    const day = days.get(event.date) || [];
    day.push(event);
    days.set(event.date, day);
  }
  for (const day of days.values())
    for (const event of day)
      event.overlap = day.some((other) => other.id !== event.id && event.start < other.end && other.start < event.end);
}
