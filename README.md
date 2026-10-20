# GMI Student Timetable

A responsive student timetable with class and lecturer views, lesson details, and class-only calendar export. Browse the weekly planner on desktop or the day agenda on mobile, then download your schedule as an `.ics` file.

- Live app: https://masodommel.github.io/gmi-student-timetable/
- Repository: https://github.com/masodommel/gmi-student-timetable

## Fork and credits

This repository is a fork of [lollllz/gmi-student-timetable](https://github.com/lollllz/gmi-student-timetable).

The original concept, timetable data recovery, DAV reading/writing, calendar generation, accessibility work, tests and original interface were created by [@lollllz](https://github.com/lollllz). This fork builds on that work with a refreshed UI. Please direct credit for the original implementation upstream.

- Original project: https://github.com/lollllz/gmi-student-timetable
- Original live app: https://lollllz.github.io/gmi-student-timetable/

## Features

- Search and select a class or lecturer; your choice is remembered on the device.
- Week planner and mobile day agenda with subject, room, lecturer and notes search.
- Lesson details, overlap/exception warnings, and online-class reminders.
- Shareable links for the selected class, lecturer and week.
- Class-only `.ics` export with import guidance for Google Calendar, Apple Calendar and Outlook.
- Local import of compatible legacy `.dav` timetable files, plus experimental DAV editing/export.
- Light and dark themes, accessibility preferences, and responsive layouts down to 320px.
- No student login, backend or uploads; timetable files stay in the browser.

The published schedule is a reconstruction, **not an official live timetable**. Confirm changes with your lecturer. All event times use `Asia/Kuala_Lumpur` (UTC+8).

## Automated timetable sync

Timetable updates flow from Gmail to the public site without manual data commits:

1. A Google Apps Script checks Gmail every 15 minutes for new `.dav` attachments.
2. It commits each new source to the private `masodommel/gmi-student-timetable-sources` repository as `sources/<hash16>.dav`, with a `sources/<hash16>.json` sidecar containing the original filename, message date, full SHA-256 and byte size.
3. Successful threads receive a `TimetableSynced` label. Permanent failures receive `TimetableFailed`; transient failures stay unlabelled and retry on the next run.
4. The private repository's `.github/workflows/notify.yml` workflow sends a `repository_dispatch` to the public `masodommel/gmi-student-timetable` repository. It also runs every 6 hours as a catch-up.
5. The public `pages.yml` workflow checks out the private archive, pre-bakes the newest source, runs the tests, commits the derived `public/` data, builds, and deploys GitHub Pages.

Source selection uses the revision date in the original filename first, then the email time, so a late-arriving older email cannot replace a newer revision. The workflow skips an already-published hash, refuses to roll back to an older revision unless manually forced, and skips corrupt or incomplete sources with a warning. Public `push` runs test, build and deploy the checked-in data without needing the private archive.

Raw DAV files stay in the private repository. The public repository and site publish derived data only; the original binary is never committed or served publicly. The workflow fails if a `.dav` is tracked publicly or appears in `public/` or `dist/`.

Workflows:

- `.github/workflows/pages.yml` (public): pre-bake, test, commit derived data, build and deploy Pages.
- `.github/workflows/apps-script.yml` (public): push `apps-script/` changes with clasp.
- `.github/workflows/notify.yml` (private): dispatch the public workflow on a new source, manually, or every 6 hours.

Secrets and properties:

- Public repository: `SOURCE_REPO_TOKEN` (read the private sources), `CLASPRC_JSON` (clasp credentials), optional `COMMIT_TOKEN` (write data commits when branch protection blocks `GITHUB_TOKEN`).
- Private repository: `SITE_DISPATCH_TOKEN` (dispatch the public workflow).
- Apps Script properties: `GITHUB_TOKEN` (write the private sources), `REPO_OWNER`, `REPO_NAME`, `REPO_BRANCH`.

Manual operations:

- Republish an older source: run **Publish student timetable** from Actions with `force` enabled.
- Audit the archive: run `npx tsx scripts/publish_latest_source.ts --sources .sources/sources --strict`.
- Retry a quarantined email: remove its `TimetableFailed` label. Deduplication prevents duplicate commits.

While the page is open, it checks for a newly published revision every 15 minutes and shows the last checked time in the info panel.

## Local development

Requires Node.js 22+ and Python 3 for data checks.

```sh
npm ci
npm run dev
```

```sh
npm test        # formatting, typecheck, data checks and unit tests
npm run build   # compile TypeScript and copy static assets into dist/
```

Browser checks:

```sh
npx playwright install chromium
npm run test:e2e
```

Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome instead.

## Data and deployment

Generated class and lecturer datasets are checked in under `public/`. Normal updates are automated: the Pages workflow selects the newest source from the private archive, regenerates derived data, tests it, commits `public/`, builds `dist/` and deploys GitHub Pages. Pushes to `main` still deploy through the same workflow.

To regenerate manually from a compatible `.dav` source, run:

```sh
npx tsx scripts/prepare_dav.ts '/path/to/timetable.dav' <revision> <date>
npm run build
```

Raw DAV files remain in the private repository; the original binary is never published.

## License

[MIT](LICENSE), Copyright (c) 2026 lollllz.
