import { localToday } from './core.js';

export interface HazeAdvisory {
  id: string;
  starts: string;
  ends: string;
  airQualityUrl: string;
  healthUrl: string;
}

export const hazeAdvisory: Readonly<HazeAdvisory> = Object.freeze({
  id: 'kajang-haze-2026-10-18',
  starts: '2026-10-18',
  ends: '2026-10-25',
  airQualityUrl: 'https://eqms.doe.gov.my/APIMS/main',
  healthUrl:
    'https://www.moh.gov.my/teras/info-kesihatan/jerebu/artikel-dan-panduan-pengguna-berkaitan-jerebu/usage-of-personal-protection-during-haze',
});
export function hazeActive(today: string = localToday()): boolean {
  return today >= hazeAdvisory.starts && today <= hazeAdvisory.ends;
}
export function needsModeCheck(event: { date: string }, today: string = localToday()): boolean {
  return hazeActive(today) && event.date >= today && event.date <= hazeAdvisory.ends;
}
export function sourceSaysOnline(event: { note?: string | null; room?: string | null }): boolean {
  const note = String(event.note || '').trim();
  if (/\b(not online|no online|offline|cancelled|canceled)\b/i.test(note)) return false;
  return (
    /^online(?:\s+class)?\s*$/i.test(note) ||
    /^online class\s*(?:[-:(]|via\b)/i.test(note) ||
    /\b(?:class|lesson)\s*:\s*online\b/i.test(note)
  );
}
