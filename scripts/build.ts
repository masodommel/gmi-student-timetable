import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript')), 'tsc.js');
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const publicDirectory = new URL('public/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { stdio: 'inherit' });
for (const name of ['index.html', 'styles.css']) await cp(new URL(name, root), new URL(name, dist));
for (const name of await readdir(publicDirectory))
  await cp(new URL(name, publicDirectory), new URL(name, dist), { recursive: true });
console.log('Built static student timetable in dist/.');
