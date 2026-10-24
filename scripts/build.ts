import { build } from 'esbuild';
import { minify } from 'csso';
import htmlnano from 'htmlnano';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript')), 'tsc.js');
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const publicDirectory = new URL('public/', root);
const stylesDirectory = new URL('styles/', root);

const REQUIRED_ASSETS = ['index.html', 'app.js', 'worker.js', 'theme-boot.js', 'styles.css', 'gmi-logo.avif'];

async function copyPublic(source: URL, destination: URL): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = new URL(entry.name + (entry.isDirectory() ? '/' : ''), source);
    const to = new URL(entry.name + (entry.isDirectory() ? '/' : ''), destination);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyPublic(from, to);
    } else if (!entry.name.endsWith('.dav') && entry.name !== 'gmi-logo.png') {
      await cp(from, to);
    }
  }
}

async function walk(directory: URL): Promise<URL[]> {
  const files: URL[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) files.push(...(await walk(url)));
    else files.push(url);
  }
  return files;
}

async function bytes(url: URL): Promise<number> {
  return (await stat(url)).size;
}

async function sourceStyles(): Promise<string> {
  const names = (await readdir(stylesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => entry.name)
    .sort();
  assert.ok(names.length > 0, 'No source styles found');
  assert.ok(
    names.every((name) => /^\d{2}-.+\.css$/.test(name)),
    'Style files must use the NN-name.css order',
  );
  const contents = await Promise.all(names.map((name) => readFile(new URL(name, stylesDirectory), 'utf8')));
  return contents.join('\n');
}

async function verify(): Promise<void> {
  for (const name of REQUIRED_ASSETS) await assert.doesNotReject(bytes(new URL(name, dist)), `Missing dist/${name}`);

  const files = await walk(dist);
  for (const file of files) {
    const name = file.pathname;
    assert(!name.endsWith('.dav'), `Raw DAV found in dist: ${name}`);
    assert(!/\/gmi-logo[^/]*\.png$/i.test(name), `PNG logo found in dist: ${name}`);
    assert(!name.endsWith('.ts'), `TypeScript source found in dist: ${name}`);
    if (name.endsWith('.json')) {
      const raw = await readFile(file, 'utf8');
      assert.equal(raw, JSON.stringify(JSON.parse(raw)), `JSON is not whitespace-free: ${name}`);
    }
  }

  const total = (await Promise.all(files.map(bytes))).reduce((sum, size) => sum + size, 0);
  const keySizes = await Promise.all(
    REQUIRED_ASSETS.map(async (name) => `${name}=${(await bytes(new URL(name, dist))).toLocaleString('en-US')} B`),
  );
  console.log(`Built ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MiB in dist/.`);
  console.log(`Key assets: ${keySizes.join(', ')}`);
}

export async function buildSite(): Promise<void> {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--noEmit'], { stdio: 'inherit' });

  await Promise.all([
    build({
      entryPoints: ['src/app.ts'],
      outfile: 'dist/app.js',
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      legalComments: 'none',
    }),
    build({
      entryPoints: ['src/dav/worker.ts'],
      outfile: 'dist/worker.js',
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      legalComments: 'none',
    }),
    build({
      entryPoints: ['src/theme-boot.ts'],
      outfile: 'dist/theme-boot.js',
      bundle: true,
      minify: true,
      format: 'iife',
      target: 'es2022',
      platform: 'browser',
      legalComments: 'none',
    }),
  ]);

  const css = await sourceStyles();
  await writeFile(new URL('styles.css', dist), minify(css, { restructure: true }).css);

  const html = await readFile(new URL('index.html', root), 'utf8');
  const result = await htmlnano.process(
    html,
    {
      collapseWhitespace: 'conservative',
      removeComments: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: false,
      minifyCss: false,
      minifyJs: false,
      minifySvg: false,
    },
    htmlnano.presets.safe,
  );
  await writeFile(new URL('index.html', dist), result.html);

  await copyPublic(publicDirectory, dist);
  await writeFile(new URL('.nojekyll', dist), '');

  await verify();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await buildSite();
