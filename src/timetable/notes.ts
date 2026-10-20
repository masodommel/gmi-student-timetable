export function sourceSaysOnline(event: { note?: string | null; room?: string | null }): boolean {
  const note = String(event.note || '').trim();
  if (/\b(not online|no online|offline|cancelled|canceled)\b/i.test(note)) return false;
  return (
    /^online(?:\s+class)?\s*$/i.test(note) ||
    /^online class\s*(?:[-:(]|via\b)/i.test(note) ||
    /\b(?:class|lesson)\s*:\s*online\b/i.test(note)
  );
}
