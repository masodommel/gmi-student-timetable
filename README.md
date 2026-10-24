
# GMI Student Timetable

A responsive student timetable with class and lecturer views, lesson details, and class-only calendar export. Browse the weekly planner on desktop or the day agenda on mobile, then download your schedule as an `.ics` file.

- Live app: https://gmi-student-timetable.pages.dev/
- Repository: https://github.com/masodommel/gmi-student-timetable

GitHub Pages serves a redirect to the production app by default. The `dev` branch can publish an unindexed development live page once `PAGES_MODE=dev` is set, so its URL is intentionally omitted here until then.

## Tech stack

The frontend is framework-free TypeScript with build-time-only dependencies. HTML, CSS and browser JavaScript are bundled and minified for a small static site.

**Frontend**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![esbuild](https://img.shields.io/badge/esbuild-FFCF00?style=flat-square&logo=esbuild&logoColor=black)
![Web Worker](https://img.shields.io/badge/Web%20Worker-323330?style=flat-square&logo=javascript&logoColor=white)
![Web Crypto](https://img.shields.io/badge/Web%20Crypto-005A9C?style=flat-square&logo=javascript&logoColor=white)
![AVIF](https://img.shields.io/badge/AVIF-0B6E99?style=flat-square)

**Build and test**

![Node.js 22](https://img.shields.io/badge/Node.js%2022-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![npm](https://img.shields.io/badge/npm-CB3837?style=flat-square&logo=npm&logoColor=white)
![Sharp](https://img.shields.io/badge/Sharp-99CC00?style=flat-square)
![CSso](https://img.shields.io/badge/CSso-3C99DC?style=flat-square)
![htmlnano](https://img.shields.io/badge/htmlnano-E34F26?style=flat-square)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?style=flat-square&logo=prettier&logoColor=black)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![node:test](https://img.shields.io/badge/node%3Atest-4B5563?style=flat-square&logo=nodedotjs&logoColor=white)
![Python 3](https://img.shields.io/badge/Python%203-3776AB?style=flat-square&logo=python&logoColor=white)

**Automation and hosting**

![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)
![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=flat-square&logo=googleappsscript&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-181717?style=flat-square&logo=github&logoColor=white)

## Fork and credits

This repository is a fork of [lollllz/gmi-student-timetable](https://github.com/lollllz/gmi-student-timetable).

The original concept, timetable data recovery, DAV reading/writing, calendar generation, accessibility work, tests and original interface were created by [@lollllz](https://github.com/lollllz). This fork builds on that work with a refreshed UI. Please direct credit for the original implementation upstream.

- Original project: https://github.com/lollllz/gmi-student-timetable
- Original live app: https://lollllz.github.io/gmi-student-timetable/

## Features

- Search and select a class or lecturer, your choice is remembered on the device.
- Week planner and mobile day agenda with subject, room, lecturer and notes search.
- Lesson details, overlap/exception warnings, and online-class reminders.
- Shareable links for the selected class, lecturer and week.
- Class-only `.ics` export with import guidance for Google Calendar, Apple Calendar and Outlook.
- Local import of compatible legacy `.dav` timetable files, plus experimental DAV editing/export.
- Light and dark themes, accessibility preferences, and responsive layouts down to 320px.
- No student login, backend or uploads, your timetable files stay in the browser.

The published schedule is a reconstruction, **not an official live timetable**. Confirm changes with your lecturer. All event times use `Asia/Kuala_Lumpur` (UTC+8).

## Automated timetable sync

Timetable updates flow from Gmail to the public site without manual data commits:

1. A Google Apps Script checks Gmail every 15 minutes for new `.dav` attachments.
2. It commits each new source to the private `masodommel/gmi-student-timetable-sources` repository as `sources/<hash16>.dav`, with a `sources/<hash16>.json` sidecar containing the original filename, message date, full SHA-256 and byte size.
3. Successful threads receive a `TimetableSynced` label. Permanent failures receive `TimetableFailed`, and transient failures stay unlabeled and retry on the next run.
4. The private repository's `.github/workflows/notify.yml` workflow sends a `repository_dispatch` to the public `masodommel/gmi-student-timetable` repository. It also runs every 6 hours as a catch-up.
5. The public `pages.yml` workflow checks out the private archive, pre-bakes the newest source, runs the tests, commits the derived `public/` data, builds, and updates the GitHub Pages redirect while dev mode is disabled. Cloudflare Pages builds the same `main` tree when a watched production path changes.

Source selection uses the revision date in the original filename first, then the email time, so a late-arriving older email cannot replace a newer revision. The workflow skips an already-published hash, refuses to roll back to an older revision unless manually forced, and skips corrupt or incomplete sources with a warning. Public `push` runs tests and builds from the checked-in data without needing the private archive.

The derived-data commit uses `[skip actions]` so it does not start another GitHub Actions run. Cloudflare Pages still builds it because `public/**` is a production watch path.

Raw DAV files stay in the private repository. The public repository and site publish derived data only, the original binary is never committed or served publicly. The workflow fails if a `.dav` is tracked publicly or appears in `public/` or `dist/`.

Workflows:

- `.github/workflows/pages.yml` (public): pre-bake, test, commit derived data, build, and publish the GitHub Pages redirect unless `PAGES_MODE=dev`.
- `.github/workflows/dev-pages.yml` (`dev`): test, build, mark the output unindexed, and publish the development live page when `PAGES_MODE=dev`.
- `.github/workflows/apps-script.yml` (public): push `apps-script/` changes with clasp.
- `.github/workflows/notify.yml` (private): dispatch the public workflow on a new source, manually, or every 6 hours.

Secrets and properties:

- Public repository: `SOURCE_REPO_TOKEN` (read the private sources), `CLASPRC_JSON` (clasp credentials), optional `COMMIT_TOKEN` (write data commits when branch protection blocks `GITHUB_TOKEN`).
- Private repository: `SITE_DISPATCH_TOKEN` (dispatch the public workflow).
- Apps Script properties: `GITHUB_TOKEN` (write the private sources), `REPO_OWNER`, `REPO_NAME`, `REPO_BRANCH`.

Manual operations:

- Republish an older source: run **Build and publish timetable** from Actions with `force` enabled.
- Audit the archive: run `npx tsx scripts/publish_latest_source.ts --sources .sources/sources --strict`.
- Retry a quarantined email: remove its `TimetableFailed` label. Deduplication prevents duplicate commits.

While the page is open, it checks for a newly published revision every 15 minutes and shows the last checked time in the info panel.

## Deployment

### Cloudflare Pages (production)

- Production site: https://gmi-student-timetable.pages.dev/
- Production branch: `main`. There is no generated deployment branch and no force-push deployment step.
- Build command: `npm run build`. Build output directory: `dist`. Root directory: repository root. Node version: 22 (`NODE_VERSION=22`).
- Automatic deployments are enabled for `main` only, and preview deployments are disabled. Pushes to development branches do not consume Cloudflare builds.
- Production builds run only when one of these include paths changes:

```text
index.html
styles/**
package.json
package-lock.json
tsconfig.json
tsconfig.node.json
src/**
public/**
scripts/**
```

- A new timetable source produces one derived-data commit under `public/`, which triggers one production build. Large code changes under `src/`, `scripts/` or the root build files also trigger one build.
- Pushes that only touch `.github/`, `tests/`, `README.md`, `design/`, `apps-script/` or `github-pages/` do not trigger Cloudflare. The dev live page covers those changes without consuming Cloudflare builds.
- Cloudflare's free plan allows 500 builds per month. This path filter and the disabled preview deployments keep production well below that limit.
- Keep Cloudflare's `[skip ci]` build-skipping behavior disabled so the `[skip actions]` derived-data commit still builds.
- Cloudflare Pages compresses HTML, CSS, JavaScript and JSON with Brotli or Gzip at the edge.

### GitHub Pages (redirect or dev live page)

- GitHub Pages runs in redirect mode by default. Its URL is intentionally omitted from this README so it is not mistaken for the production site.
- It serves a small redirect page to Cloudflare Pages and preserves the query string and hash, keeping existing links working.
- `PAGES_MODE` stays unset or set to `redirect` for redirect mode. Set it to `dev` under **Settings → Secrets and variables → Actions → Variables** to publish the development live page from the `dev` branch.
- Create it as a repository variable, not a secret. GitHub reserves the `GITHUB_` prefix for built-in names, which is why the variable is not called `GITHUB_PAGES_MODE`.
- The dev workflow runs tests and builds on every `dev` push, writes a disallow-all `robots.txt`, injects a `noindex` meta tag, and deploys only while `PAGES_MODE=dev`.
- The `main` workflow continues to test and build in dev mode but skips its Pages job, so `main` pushes cannot overwrite the dev site.
- To refresh dev timetable data manually, copy only the generated datasets from `main`:

```sh
git switch dev
git fetch origin
git checkout origin/main -- public/data public/calendars public/lecturers
git commit -m "sync dev timetable data from main"
git push origin dev
```

This keeps the dev branch's AVIF logo and other dev-specific assets in place, and never copies DAV sources.

The build uses esbuild for browser JavaScript, CSso for CSS and htmlnano for HTML. Generated JSON is whitespace-free and schema-compatible. The logo is a lossless AVIF served from `public/gmi-logo.avif`.


### Deployment size

Measured `dist/` deployment output (the `public/` datasets plus the bundled app shell) with per-file Node `zlib` compression: gzip level 9 and Brotli quality 11. Measured on **Wednesday, 21 October 2026, 14:19 (UTC+8)** against the `dist/` tree of 645 files at that revision.

| Content | Raw | gzip | Brotli |
| :--- | ---: | ---: | ---: |
| Whole site (645 files) | 24,386,952 B (23.26 MiB) | 1,494,845 B (1.43 MiB) | 1,074,023 B (1.02 MiB) |
| App shell (`index.html`, `app.js`, `worker.js`, `theme-boot.js`, `styles.css`,<br>`gmi-logo.avif`, `_headers`, `.nojekyll`) | 140,985 B (0.13 MiB) | 55,077 B (0.05 MiB) | 50,291 B (0.05 MiB) |
| `calendars/` (195 class `.ics`) | 10,908,994 B (10.40 MiB) | 573,440 B (0.55 MiB) | 397,346 B (0.38 MiB) |
| `data/` (196 class `.json` + `manifest.json`) | 5,889,643 B (5.62 MiB) | 408,427 B (0.39 MiB) | 296,710 B (0.28 MiB) |
| `lecturers/` (246 lecturer `.json`) | 7,447,330 B (7.10 MiB) | 457,901 B (0.44 MiB) | 329,676 B (0.31 MiB) |

These are whole-directory totals. A visitor downloads far less. A first page load transfers the compressed app shell (~50–55 KB) plus `manifest.json` and one class or lecturer dataset, `.ics` exports, lecturer pages and further class data are fetched on demand. Cloudflare Pages serves Brotli at the edge where available (about **1.0 MiB** for the entire site), falling back to gzip otherwise. GitHub Pages serves gzip only (~1.4 MiB), and hosts either the redirect page or the unindexed dev build. Sizes vary slightly between revisions as timetable data changes.

## Local development

Requires Node.js 22+ and Python 3 for data checks.

```sh
npm ci
npm run dev
```

```sh
npm test        # formatting, typecheck, data checks and unit tests
npm run build   # typecheck, bundle and minify assets into dist/
```

The local server runs at `http://127.0.0.1:4173/` and still accepts legacy `/gmi-student-timetable/` paths.

Browser checks:

```sh
npx playwright install chromium
npm run test:e2e
```

Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome instead.

## How the `.dav` timetable is reconstructed

`src/dav/reader.ts` decodes a compatible legacy V30 file into the published schedule. The binary itself is never republished, and only the derived data is committed.

1. The decoder validates the `0x03` `V30` signature, the 20 MB limit and the little-endian tagged-value stream.
2. It locates the calendar section and the class/staff/room/subject dictionary, reads the planning range from the header, and reads the period duration plus clock start times.
3. It parses timetable patterns, lessons and slots. A 64-bit mask selects each lesson's week offsets, `CWnn` pattern names anchor weeks to ISO dates (4 January is always week 1), and each slot stores the weekday, period, room and lecturer.
4. Each lesson is expanded across its active weeks, grouped by day/lecturer/room and merged into consecutive-period blocks. IDs are mapped to names, calendar exceptions are applied, and start/end times are emitted in `Asia/Kuala_Lumpur`.
5. `scripts/prepare_dav.ts` writes compact class and lecturer JSON, the manifest and class-only `.ics` files. Local editing patches only the selected slot bytes and note text in a copy, re-decodes the result, and preserves every other byte on export.

## Data and deployment

Generated class and lecturer datasets are checked in under `public/`. Normal updates are automated: the workflow selects the newest source from the private archive, regenerates derived data, tests it, commits `public/` and builds. Cloudflare Pages rebuilds when a watched production path changes. GitHub Pages refreshes the redirect by default, and builds the unindexed dev live page from a separate `dev` branch when dev mode is enabled.

To regenerate manually from a compatible `.dav` source, run:

```sh
npx tsx scripts/prepare_dav.ts '/path/to/timetable.dav' <revision> <date>
npm run build
```

To regenerate the lossless AVIF logo from `design/gmi-logo.png`:

```sh
npm run optimize:logo
```

Raw DAV files remain in the private repository, and the original binary is never published.

## License

[MIT](LICENSE), Copyright (c) 2026 lollllz.