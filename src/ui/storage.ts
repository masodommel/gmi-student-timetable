export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be disabled */
  }
}

export function readFlag(key: string): boolean {
  return readStored(key) === 'true';
}

export function writeFlag(key: string, value: boolean): void {
  writeStored(key, String(value));
}
