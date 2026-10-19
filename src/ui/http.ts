export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-cache', signal });
  if (!response.ok) throw new Error(`Schedule request failed (${response.status})`);
  return (await response.json()) as T;
}
