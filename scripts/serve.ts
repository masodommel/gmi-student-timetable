import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.svg': 'image/svg+xml',
};
createServer(async (request, response) => {
  const notFound = (): void => {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  };
  try {
    let path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (path.startsWith('/gmi-student-timetable/')) path = path.slice('/gmi-student-timetable'.length);
    const file = resolve(root, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) return notFound();
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(content);
  } catch {
    notFound();
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/gmi-student-timetable/`));
