import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectLatestSource } from '../scripts/publish_latest_source.js';

interface AddSourceOptions {
  originalName: string;
  messageDate: string;
  content: string;
  sidecar?: Record<string, unknown>;
}

async function createDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'gmi-sources-'));
}

async function addSource(directory: string, options: AddSourceOptions): Promise<{ filename: string; hash: string }> {
  const bytes = Buffer.from(options.content);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const filename = `${hash.slice(0, 16)}.dav`;
  await writeFile(join(directory, filename), bytes);
  await writeFile(
    join(directory, `${hash.slice(0, 16)}.json`),
    JSON.stringify({
      originalName: options.originalName,
      messageDate: options.messageDate,
      subject: 'Timetables & Rescheduling',
      sha256: hash,
      bytes: bytes.byteLength,
      ...options.sidecar,
    }),
  );
  return { filename, hash };
}

test('missing sources directory produces no candidates', async () => {
  const root = await createDirectory();
  try {
    const result = await selectLatestSource({ sources: join(root, 'absent'), manifest: {} });
    assert.equal(result.latest, undefined);
    assert.deepEqual(result.invalid, []);
    assert.deepEqual(result.skipped, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('newest revision date wins even when its email is older', async () => {
  const root = await createDirectory();
  try {
    await addSource(root, {
      originalName: 'TT_R04D_15102026.dav',
      messageDate: '2026-10-20T00:00:00.000Z',
      content: 'revision four',
    });
    await addSource(root, {
      originalName: 'TT_R05A_16102026.dav',
      messageDate: '2026-10-01T00:00:00.000Z',
      content: 'revision five',
    });
    const result = await selectLatestSource({
      sources: root,
      manifest: { sourceRevisionDate: '2026-10-14' },
    });
    assert.equal(result.latest?.code, 'R05A');
    assert.equal(result.latest?.date, '2026-10-16');
    assert.equal(result.latest?.sidecar.originalName, 'TT_R05A_16102026.dav');
    assert.equal(result.invalid.length, 0);
    assert.equal(result.skipped.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('later email breaks ties between equal revision dates', async () => {
  const root = await createDirectory();
  try {
    await addSource(root, {
      originalName: 'TT_R01A_16102026.dav',
      messageDate: '2026-10-16T02:00:00.000Z',
      content: 'first upload',
    });
    await addSource(root, {
      originalName: 'TT_R01B_16102026.dav',
      messageDate: '2026-10-17T02:00:00.000Z',
      content: 'second upload',
    });
    const result = await selectLatestSource({ sources: root, manifest: {} });
    assert.equal(result.latest?.code, 'R01B');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('falls back to the email date in Kuala Lumpur time', async () => {
  const root = await createDirectory();
  try {
    await addSource(root, {
      originalName: 'timetable.dav',
      messageDate: '2026-10-15T18:30:00.000Z',
      content: 'fallback naming',
    });
    const result = await selectLatestSource({ sources: root, manifest: {} });
    assert.equal(result.latest?.code, 'AUTO');
    assert.equal(result.latest?.date, '2026-10-16');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects sources whose sidecar hash or size does not match', async () => {
  const root = await createDirectory();
  try {
    await addSource(root, {
      originalName: 'TT_R04D_15102026.dav',
      messageDate: '2026-10-15T00:00:00.000Z',
      content: 'hash mismatch',
      sidecar: { sha256: '0'.repeat(64) },
    });
    await addSource(root, {
      originalName: 'TT_R05A_16102026.dav',
      messageDate: '2026-10-16T00:00:00.000Z',
      content: 'size mismatch',
      sidecar: { bytes: 3 },
    });
    const result = await selectLatestSource({ sources: root, manifest: {} });
    assert.equal(result.latest, undefined);
    assert.equal(result.invalid.length, 2);
    assert.match(result.invalid[0].reason, /sha256 or byte size/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports missing sidecars', async () => {
  const root = await createDirectory();
  try {
    const bytes = Buffer.from('no sidecar');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(root, `${hash.slice(0, 16)}.dav`), bytes);
    const result = await selectLatestSource({ sources: root, manifest: {} });
    assert.equal(result.latest, undefined);
    assert.equal(result.invalid[0]?.reason, 'missing or invalid sidecar');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports invalid sidecar fields', async () => {
  const root = await createDirectory();
  try {
    await addSource(root, {
      originalName: 'notes.txt',
      messageDate: '2026-10-15T00:00:00.000Z',
      content: 'invalid name',
    });
    const result = await selectLatestSource({ sources: root, manifest: {} });
    assert.equal(result.latest, undefined);
    assert.equal(result.invalid[0]?.reason, 'invalid sidecar fields');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ignores sources whose hash is already published', async () => {
  const root = await createDirectory();
  try {
    const added = await addSource(root, {
      originalName: 'TT_R04D_15102026.dav',
      messageDate: '2026-10-15T00:00:00.000Z',
      content: 'already published',
    });
    const result = await selectLatestSource({ sources: root, manifest: { sourceHash: added.hash } });
    assert.equal(result.latest, undefined);
    assert.equal(result.invalid.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rollback guard skips older revisions but force overrides it', async () => {
  const root = await createDirectory();
  try {
    await addSource(root, {
      originalName: 'TT_R03C_14102026.dav',
      messageDate: '2026-10-14T00:00:00.000Z',
      content: 'older revision',
    });
    const manifest = { sourceRevisionDate: '2026-10-15' };
    const guarded = await selectLatestSource({ sources: root, manifest });
    assert.equal(guarded.latest, undefined);
    assert.equal(guarded.skipped.length, 1);
    const forced = await selectLatestSource({ sources: root, manifest, force: true });
    assert.equal(forced.latest?.code, 'R03C');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
