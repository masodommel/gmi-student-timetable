# GMI Student Timetable

A responsive student timetable with class selection and class-only calendar export. Students can use the weekly planner on desktop, the day agenda on mobile, or download their timetable into their own calendar app.

[Open the student app](https://lollllz.github.io/gmi-student-timetable/)

## Student features

- Search and choose a class; remember it on the current device.
- Browse a week, choose a date, and search subjects, rooms, lecturers or notes.
- Open lesson details and identify overlapping entries or calendar-exception dates.
- Share a URL containing the class and selected week.
- Download a class-only `.ics` file, with import guidance for Google Calendar, Apple Calendar and Outlook.
- Open a compatible legacy DaVinci `.dav` file on the device, choose its class, and export a class-only calendar without uploading the file.
- Responsive layouts, keyboard-accessible dialogs and retry/empty/loading states.

No student login or backend is required. Data is loaded one class at a time. The deployment does not publish the original binary or forensic raw-field exports.

## Opening a timetable file

Use **Open timetable file** to select a legacy `.dav` file (compatible V30 layouts, up to 20 MB). The browser reads it in a worker, replaces the class list with the file’s classes, and generates class-only calendar downloads locally. **Use provided timetable** switches back to the published schedule.

Files are kept in memory and are not uploaded or saved by the site. Reopen the file after refreshing. Local-file class/week links are not shareable; export the class calendar instead. A failed or cancelled import leaves the previous schedule intact.

The browser reader discovers counted calendar, dictionary, week-pattern, group and lesson sections; it does not depend on the original file’s fixed offsets or class counts. It validates record boundaries, parent IDs, period layouts, repeated slot counts and EOF. Week references anchor dates. Unsupported structures are rejected rather than guessed. Unplaced slots and unknown flagged slots are omitted from dated entries. Newer `.daVinci` XML/ZIP formats are not supported by this importer.

This is still a reconstruction: native holiday/override behavior and other undocumented rules remain unverified.

## Timetable status

The current schedule was reconstructed from `TT JULYSEPT 2026_R04D_15102026.dav`, revision R04D dated 15 October 2026. There are 178 class records, 166 with dated entries, and 23,203 student entries. The source planning range is January 2026 through January 2027.

This is **not an official live timetable**. Some original rules remain unverified. Exception overlaps and simultaneous entries are retained and labelled. Students should confirm changes with their lecturer. Exports are tentative snapshots and do not automatically update. Resource activities without a class are excluded from student datasets. Classes without entries remain searchable but have no enabled export.

All event times use `Asia/Kuala_Lumpur` (UTC+8). Each calendar contains the full dated schedule of the selected class, rather than only the currently displayed week. Import into a separate calendar to make later replacement easier; repeated imports can create duplicates.

## Local development

Requires Node.js 22+ and Python 3 for data checks. The app, tests and Node tooling are written in TypeScript. `npm test` typechecks the app and tooling first; `npm run build` compiles the browser modules with `tsc` and copies the static assets into `dist/`.

```sh
npm ci
npm run dev
```

Open the local URL printed by the server. All asset/data paths are relative, including when served under `/gmi-student-timetable/`.

```sh
npm test
npm run build
```

Browser checks:

```sh
npx playwright install chromium
npm run test:e2e
```

To use an already installed Chrome for browser checks:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

## Updating recovered data

The app builds using the checked-in generated datasets. To regenerate them, supply the separate recovery output folder containing `recovered-data.json` and `reconstructed-occurrences.csv`:

```sh
python3 scripts/prepare_data.py --source /path/to/dav-recovery
npm test
npm run build
```

The data generator produces a JSON file and `.ics` calendar for each class. It verifies that every dated class label maps to a known class. Event UIDs remain stable for a given source, lesson, date and slot group.

## GitHub Pages

The `Publish student timetable` workflow checks the datasets and date/search logic, builds `dist/`, and deploys it to GitHub Pages on pushes to `main`. The repository’s Pages setting uses GitHub Actions.

## Verification

- Every class calendar is checked against its class JSON: counts, dates, start/end times, unique UIDs, timezone, tentative status, UTF-8 line folding and date bounds.
- Unit checks cover Malaysia’s date boundary, week navigation, search, shared links, safe calendar paths and HTML escaping.
- Browser checks cover class selection, calendar download content, lesson details, search, empty weeks, saved selections, request retry, desktop weekly columns and mobile widths down to 320px.
- Import checks use synthetic files with different counts, names and start times; test malformed/oversized inputs; verify local-only processing, cancellation and restore; and compare all 23,203 reference-file entries with the published datasets locally.

Calendar imports themselves have not been exercised in the user’s calendar account. Import instructions link to official vendor guides within the app.

## Lecturer timetable viewing

Choose **By lecturer**, then search a lecturer name. The view combines that name's entries across classes and includes resource/activity entries without a class. Class names appear on cards and in calendar descriptions. Lecturer calendars are generated locally from the selected dataset; provided-source lecturer/week links can be shared. Names are grouped by the recovered display label, so identical staff labels cannot be distinguished as separate people. The current reference has 246 nonempty lecturer/resource labels with 26,453 dated entries; these are source records, not counts of people.

## Accessibility

**Accessibility** opens preferences for larger text, high contrast, reduced motion and an agenda default. Preferences persist on the current device. System reduced-motion preferences and forced-colour modes are respected. Controls have visible focus indicators, dialogs use native keyboard/focus handling, mobile day selection retains focus after rendering, and concise status updates replace announcements of the whole timetable. Lesson names include date, class and warning status. Contrast for muted/empty-state text and links has been improved.

Automated axe WCAG A/AA checks cover the planner, lesson and accessibility dialogs, and the narrow-phone class picker with larger text and high contrast. Passing these checks is not a full WCAG conformance claim or a substitute for assistive-technology testing.

## Experimental DAV editing and export

Open your original compatible `.dav` file first. **Export DAV** downloads its complete contents, including nonstudent activities and unknown fields. Without edits the downloaded bytes are identical to the opened file. The original binary is not distributed through this site.

Open a lesson and choose **Edit recurring lesson** to change its notes, weekday or starting clock period. Placement changes move that displayed block in every active week of its parent lesson. Notes affect the parent lesson and all its blocks. The full block must fit consecutive existing periods; linked/coupled lesson blocks cannot be moved independently. Notes must fit the legacy short-string limit of 255 Windows-1252 characters. Room, lecturer, subject, recurrence masks, lesson creation/deletion, holidays and linked-group editing remain outside this editor.

The writer patches only decoded weekday/period bytes and the tagged note string in the original buffer. All other source bytes are retained. Each edit is decoded again before becoming active. Tests reverse edits and require byte-for-byte restoration of the original synthetic file. A downloaded edit can be reopened in this site's importer. Native DaVinci acceptance and scheduling behavior have not been tested: verify an exported copy in the original application before distributing it. Edits stay on-device, disappear after refreshing unless exported, and never change the provided public timetable.

The attachment received on 14 October 2026 has the same SHA-256 as the previously published source (`0e65e7d9144b4054d9c41d31b4fb7ddb2dfeadd13b1b58eb593b9894a0496b25`). It was revalidated; no newer timetable revision was inferred from the upload date.


## Publishing a new DAV revision

Decode a new compatible source, generate all class/lecturer datasets and calendars, and record its explicit revision and date:

```sh
npx tsx scripts/prepare_dav.ts '/path/to/timetable.dav' R04D 2026-10-15
DAV_REFERENCE_FILE='/path/to/timetable.dav' npm test
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
npm run build
```

The generator validates the complete source through the browser reader before replacing generated files, removes obsolete generated datasets, and includes the source filename, SHA-256, revision date/code and counts in the manifest. It does not publish the original DAV or editing metadata. The older Python recovery-data generator remains specific to the original R03Y investigation; use the DAV generator for current revisions.

A small revision pill identifies the latest provided timetable. Its New dot is remembered separately from class selection and clears when source details are opened. A future source hash shows the dot again. Local imports display “Local file loaded” and do not acknowledge the provided revision. The dot indicates a revision new to this browser, not an automatic background update or an official approval status. Calendar snapshots already imported into other apps do not update automatically.

## Haze precautions and class delivery

A maintained Kajang haze reminder is configured in `advisories.js`. The initial notice runs from 18 through 25 October 2026 (Kuala Lumpur dates) and then disappears unless its window is deliberately updated. It provides a respiratory-protection reminder linked to Malaysian Ministry of Health guidance, an official APIMS link, and a prompt to check lecturer messages or GMI announcements before campus travel. The precaution itself does not assert a live API reading or an official GMI class-change notice; the separate air-quality card provides dated DOE station snapshots.

Upcoming lessons within the active window receive “Confirm class delivery” prompts. “Online · source note” labels require explicit wording in the timetable note; haze alone, an absent room or a room named Online never confirms online teaching. Negated/cancelled online notes are excluded. Lesson details explain that source notes still need current confirmation. Neither the DAV nor calendar exports are changed by these UI reminders.

The reminder can be collapsed and reopened; the preference is stored per advisory ID on the current device. Updating the advisory ID presents a revised notice again. Review the dates and guidance links when extending the window; do not extend it as evidence of current air quality or a campus closure. The date window is re-evaluated when the tab becomes visible again.

Guidance reviewed on 18 October 2026:
- Ministry of Health: https://www.moh.gov.my/teras/info-kesihatan/jerebu/artikel-dan-panduan-pengguna-berkaitan-jerebu/usage-of-personal-protection-during-haze
- Department of Environment APIMS: https://eqms.doe.gov.my/APIMS/main

## Latest air quality

The air-quality card displays Malaysian API/IPU readings from DOE's public APIMS map feed, with a named Putrajaya reference station and optional Cheras reference. These are regional stations, not measurements at GMI's campus or a claim to be the nearest sensor. The value, category and observation time are separate from the time our snapshot was fetched. Class delivery is never inferred from air quality.

A server-side step retrieves `https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm`, the feed used by the official public portal. The source restricts browser cross-origin access, so GitHub Pages serves a small same-origin JSON snapshot. The existing Pages workflow refreshes it on deployment and at minute 17 of each hour. Scheduled runs can be delayed; the UI always evaluates the age of the observation. No API key, tracking or browser location access is required.

The source's `RECORD_DT` is a Malaysian wall-clock string without an offset; the official public client parses this string locally. Our normaliser explicitly applies `+08:00` so visitors in other time zones see the same instant. Only the configured station IDs, names, integer API values, matching API categories and timestamps are published. Unknown, inconsistent or implausibly future readings are rejected. No operator contact fields or full feed archives are published.

Readings older than three hours show “Outdated reading” and remain labelled as last-known information. After 24 hours the number is hidden as unavailable. Source/network failures preserve the last successfully retrieved observation without resetting its timestamp. A station request failure is independent of timetable loading. Browser refresh retrieves the latest published snapshot; it cannot force a new DOE observation. Open tabs check snapshots about every 15 minutes while visible and re-evaluate freshness each minute without repeating unchanged screen-reader announcements.

```sh
npm run update:air
npm run build
```

Attribution and full official readings: https://eqms.doe.gov.my/APIMS/main


## Compact campus updates

Air quality and haze precautions share a collapsed-by-default Air & campus updates strip. The summary shows the selected station, reading/category, observation time, stale/unavailable status and a short active haze reminder. Tap or use Enter/Space on the summary to reveal guidance, attribution, station selection and refresh controls. The section starts closed on each page load so the timetable remains the primary view; background reading refresh continues while it is closed.
