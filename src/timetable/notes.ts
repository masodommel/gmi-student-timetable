export function sourceSaysOnline(event: { note?: string | null; room?: string | null }): boolean {
  const note = String(event.note || '').trim();
  if (/\b(not online|no online|offline|cancelled|canceled)\b/i.test(note)) return false;
  return (
    /^online(?:\s+(?:replacement\s+)?class)?\s*(?:$|[-:(]|via\b|\d{1,2}\/\d{1,2}\b)/i.test(note) ||
    /\b(?:class|lesson)\s*(?::\s*online\b|\(\s*online(?:\s+class)?\s*\))/i.test(note)
  );
}
