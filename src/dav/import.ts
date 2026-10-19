import { abortError } from '../errors.js';
import type { DavDecoded, DavImportResponse } from './types.js';

export interface DavImportJob {
  promise: Promise<DavDecoded>;
  cancel: () => void;
}

export function startDavImport(buffer: ArrayBuffer, filename: string): DavImportJob {
  let cancel = () => {};
  const promise = new Promise<DavDecoded>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    let settled = false;
    const stop = () => worker.terminate();
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
      reject(new Error('This file took too long to decode. Try a smaller compatible .dav file.'));
    }, 20000);
    cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stop();
      reject(abortError('File import cancelled'));
    };
    worker.onmessage = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stop();
      const response = event.data as DavImportResponse;
      response.ok ? resolve(response.result) : reject(new Error(response.error));
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stop();
      reject(new Error('The timetable reader could not start. Refresh the page and try again.'));
    };
    worker.postMessage({ buffer, filename }, [buffer]);
  });
  return { promise, cancel };
}
