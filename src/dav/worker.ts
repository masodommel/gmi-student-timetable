import { decodeDav } from './reader.js';
import type { DavImportRequest, DavImportResponse } from './types.js';

interface WorkerScope {
  onmessage: ((event: MessageEvent<DavImportRequest>) => void) | null;
  postMessage(message: DavImportResponse): void;
}
const scope = self as unknown as WorkerScope;
scope.onmessage = async (event) => {
  try {
    scope.postMessage({ ok: true, result: await decodeDav(event.data.buffer, event.data.filename) });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : 'This file could not be read.' });
  }
};
