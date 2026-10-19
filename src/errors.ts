export function abortError(message: string): Error {
  return Object.assign(new Error(message), { name: 'AbortError' });
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
