import { escapeHtml as esc } from '../timetable/core.js';
import { $ } from '../ui/dom.js';
import { readStored, writeStored } from '../ui/storage.js';
import { AIR_SOURCE, AIR_STATIONS, airTime, airTimeShort, readingState } from './index.js';
import type { AirSnapshot } from './types.js';

function isSnapshot(value: unknown): value is AirSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as AirSnapshot).schemaVersion === 1 &&
    Array.isArray((value as AirSnapshot).stations)
  );
}

export function initAirQuality(): void {
  const region = $<HTMLElement>('#air-quality');
  const result = $<HTMLElement>('#air-result');
  const select = $<HTMLSelectElement>('#air-station');
  const refresh = $<HTMLButtonElement>('#air-refresh');
  const brief = $<HTMLElement>('#air-brief');
  const setBrief = (text: string) => {
    if (brief.textContent !== text) brief.textContent = text;
  };
  const show = (html: string) => {
    if (result.innerHTML !== html) result.innerHTML = html;
  };
  let snapshot: AirSnapshot | null = null;
  let loading = false;
  let lastAttempt = 0;
  let error = false;
  select.innerHTML = AIR_STATIONS.map((station) => `<option value="${station.id}">${esc(station.name)}</option>`).join(
    '',
  );
  const saved = readStored('air-reference-station');
  if (saved && AIR_STATIONS.some((station) => station.id === saved)) select.value = saved;
  $<HTMLAnchorElement>('#air-source').href = AIR_SOURCE;

  function render(): void {
    region.setAttribute('aria-busy', String(loading));
    refresh.disabled = loading;
    const reading = readingState(snapshot, select.value);
    result.dataset.state = reading.status;
    const name = reading.station?.name.split(',')[0] || 'Reference station';
    if (reading.status === 'unavailable') setBrief(`${name} · Air reading unavailable`);
    else {
      const time = airTimeShort(reading.observedAt);
      setBrief(
        `${name} · API ${reading.value} ${reading.category}${reading.status === 'stale' ? ' · Outdated' : ''} · ${time}`,
      );
    }
    if (loading && !snapshot) {
      setBrief('Loading air quality…');
      show('<p>Loading latest station reading…</p>');
      return;
    }
    if (reading.status === 'unavailable') {
      show(
        '<p><strong>Reading unavailable</strong></p><p>No recent verified reading is available here. Check the official APIMS source.</p>',
      );
      return;
    }
    show(
      `<p class="air-value"><strong>${reading.value}</strong><span>API / IPU · ${esc(reading.category)}</span></p><p><strong>${reading.status === 'stale' ? 'Outdated reading' : 'Latest available reading'}</strong> · ${esc(airTime(reading.observedAt))}</p>${reading.status === 'stale' ? '<p>Older than 3 hours. This is a last-known reading, not current conditions.</p>' : ''}${error ? '<p>Refresh failed; showing the last retrieved reading with its original timestamp.</p>' : ''}`,
    );
  }

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    lastAttempt = Date.now();
    render();
    try {
      const response = await fetch('./data/air-quality.json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      const candidate: unknown = response.ok ? await response.json() : null;
      if (isSnapshot(candidate)) {
        snapshot = candidate;
        error = false;
      } else error = true;
    } catch {
      error = true;
    } finally {
      loading = false;
      render();
    }
  }

  function refreshWhenVisible(): void {
    if (document.hidden) return;
    render();
    if (Date.now() - lastAttempt >= 15 * 60000) void load();
  }

  select.addEventListener('change', () => {
    writeStored('air-reference-station', select.value);
    render();
  });
  refresh.addEventListener('click', load);
  setInterval(refreshWhenVisible, 60000);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  void load();
}
