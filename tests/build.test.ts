import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else found.push(path);
  }
  return found;
}

test('build emits minified assets and compact JSON without private sources', async () => {
  await buildSite();
  for (const name of ['index.html', 'app.js', 'worker.js', 'theme-boot.js', 'styles.css', 'gmi-logo.avif'])
    await stat(join(dist, name));
  await assert.rejects(stat(join(dist, 'gmi-logo.png')));
  assert.match(await readFile(join(dist, 'index.html'), 'utf8'), /\.\/gmi-logo\.avif/);
  for (const file of await files(dist)) {
    assert.ok(!file.endsWith('.dav'), `${file} is a raw DAV`);
    assert.ok(!file.endsWith('.ts'), `${file} is TypeScript source`);
    assert.ok(!/gmi-logo[^/\\]*\.png$/i.test(file), `${file} is a PNG logo`);
    if (file.endsWith('.json')) {
      const raw = await readFile(file, 'utf8');
      assert.equal(raw, JSON.stringify(JSON.parse(raw)), `${file} is not whitespace-free`);
    }
  }
});
