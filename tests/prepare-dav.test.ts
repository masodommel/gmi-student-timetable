import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareDav } from '../scripts/prepare_dav.js';
import { makeDavFixture } from './dav-fixture.js';
import type { Manifest } from '../src/timetable/types.js';

async function generatedJsonFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await generatedJsonFiles(path)));
    else if (entry.name.endsWith('.json')) files.push(path);
  }
  return files;
}

test('prepareDav records source metadata in the manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gmi-prepare-'));
  try {
    const fixture = makeDavFixture();
    const filename = join(root, 'source.dav');
    await writeFile(filename, fixture);
    const destination = join(root, 'public');
    await prepareDav({
      filename,
      displayFilename: 'TT_R04D_15102026.dav',
      revisionCode: 'R04D',
      revisionDate: '2026-10-15',
      destination,
      publishedAt: '2026-10-15T12:00:00.000Z',
    });
    const manifest = JSON.parse(await readFile(join(destination, 'data', 'manifest.json'), 'utf8')) as Manifest;
    assert.equal(manifest.revisionCode, 'R04D');
    assert.equal(manifest.sourceRevisionDate, '2026-10-15');
    assert.equal(manifest.sourceRevision, '15 October 2026');
    assert.equal(manifest.sourceFilename, 'TT_R04D_15102026.dav');
    assert.equal(manifest.publishedAt, '2026-10-15T12:00:00.000Z');
    assert.equal(manifest.sourceBytes, fixture.byteLength);
    assert.equal(manifest.sourceHash, createHash('sha256').update(fixture).digest('hex'));
    assert.equal(manifest.filename, undefined);
    const generated = await generatedJsonFiles(destination);
    assert.ok(generated.length > 2);
    for (const file of generated) {
      const raw = await readFile(file, 'utf8');
      assert.equal(raw, JSON.stringify(JSON.parse(raw)), `${file} is not whitespace-free`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
