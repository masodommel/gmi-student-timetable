# Changelog

## 24 October 2026 - Split stylesheet into source files

- Split `styles.css` into ordered files under `styles/`, concatenated and minified into a single `dist/styles.css` at build time.
- Consolidated duplicated accessibility and dark-theme overrides, merged repeated breakpoint blocks, and moved feature rules next to their components.
- Updated the Cloudflare production watch path to `styles/**`.

## 22 October 2026 - Responsive class panel and settings menu

- The class panel now scales with the screen: its width is fluid between roughly 190px and 236px on laptops, tightens further on 700–1000px tablets (where it stays visible again), and it is replaced below 700px by the compact in-page class row.
- Dropped the centred 1560px page cap: the class panel hugs the viewport's left edge and the schedule stretches toward the right with a comfortable margin instead of floating in dead space on wide monitors, and collapsing the panel now animates it sliding closed instead of snapping shut.
- The class-panel toggle is now a hamburger at the very left of the header (toggle | logo | "Student timetable" label on desktop), using the same menu icon as the phone scaffold, so the main menu button sits in the same spot on every screen size.
- The three header icons (accessibility, info and file upload) are consolidated into one **Settings** gear that opens a panel with those three options on every screen size, so phones can reach the accessibility preferences, the revision/status panel and the file importer from the same button.
- Added a **Open the class panel** handle next to the GMI logo on phones as scaffolding for a future mobile drawer for the class panel; it does not change behaviour yet.
- The class panel (the sidebar with the calendar export) can also be hidden and restored to free screen width on laptops. The choice is stored in a `gmi-rail` cookie for up to one year and applied before first paint.
- The grid ruler stayed fixed to 08:00–22:00.
- Grid lesson cards now show the lecturer and lesson note again; day rows grow to the tallest card so nothing is clipped on shorter laptop screens.

## 21 October 2026 - Grid view and holiday display

- Added a desktop-only **Grid** view: days are rows on the y-axis, time flows along the x-axis, and lesson cards sit on the hour ruler with overlapping entries sharing the row. It joins the existing week columns and agenda in the view switch (Grid · Week · Agenda).
- The grid is the default view on desktop. The last chosen view is remembered in a `gmi-view` cookie for up to one year, written only on desktop; mobile stays on the day agenda.
- The "Prefer agenda view" accessibility preference still applies agenda on load, but only until a cookie exists; unchecked it falls back to the cookie or the grid default.
- All-day holidays from the DaVinci calendar section overwrite the day as in DaVinci: a full-day rose band replaces that date's lessons and chips in all three views, matching the DaVinci fill. Partial-day exceptions keep the compact chip with the day's lessons visible around it.
- The DAV reader now keeps the exception range markers and publishes an `allDay` flag per date; legacy manifests without the flag default to all-day until the next publish.
- A week with only holidays (and no lessons) renders the holiday bands instead of the empty-state panel, and an empty week in the grid keeps the day rows with the empty state inside the grid instead of resizing the page.
- Added Playwright coverage for the grid default, cookie persistence, mobile guarding and holiday rendering in all three views, plus DAV reader tests for the `allDay` flag.

## 20 October 2026 - Automated DAV sync

- Added an automated timetable pipeline: Gmail to Apps Script every 15 minutes, then the private `masodommel/gmi-student-timetable-sources` archive (`sources/<hash16>.dav` plus `.json` sidecars), the private `notify.yml` `repository_dispatch`, and the public Pages workflow.
- Added the public `.github/workflows/pages.yml` flow to pre-bake the newest source, run tests, commit derived `public/` data, build and deploy the fork at https://masodommel.github.io/gmi-student-timetable/. Raw DAV files remain private; the public repository and site publish derived data only.
- Added `.github/workflows/apps-script.yml` and documented the required secrets (`SOURCE_REPO_TOKEN`, `CLASPRC_JSON`, optional `COMMIT_TOKEN`, private `SITE_DISPATCH_TOKEN`) and Apps Script properties (`GITHUB_TOKEN`, `REPO_OWNER`, `REPO_NAME`, `REPO_BRANCH`).
- Hardened source selection: revision date wins over email time, equal dates use the later email, the rollback guard can be overridden with the manual `force` input, and missing or corrupt sidecars are skipped with warnings. `--strict` makes invalid sources fail an audit.
- Replaced the Apps Script unread cursor with `TimetableSynced` and `TimetableFailed` labels, added a script lock, verified `409`/`422` responses by reading the existing file, and separated transient from permanent failures.
- Public runs now check out `main` to avoid stale event SHAs, skip the private checkout and pre-bake on code pushes, apply `COMMIT_TOKEN` only to the final push, reject raw DAV files in the repository, `public/` and `dist/`, and summarize source selection in the job summary. Source-triggered runs skip tests, build and deploy when nothing changed.
- The private notify workflow adds a 6-hour catch-up schedule, `Content-Type: application/json` and curl retries.
- Added source-selection and `prepareDav` metadata tests.
- Added upstream and fork links to the info panel.
- The page now checks for a newly published revision every 15 minutes while open, and the info panel shows the last checked time.
- Updated the README deployment, repository and live app URLs.

## 20 October 2026 - Calagopus-inspired redesign

- Rebuilt both themes around a neutral Calagopus/Mantine palette: `#f0eff0` light canvas, `#242424` dark canvas, `#2e2e2e` surfaces, `#424242` borders and blue accents. Muted dark text uses `#b8b8b8` for WCAG AA contrast.
- Replaced the CSS wordmark with the transparent `gmi-logo.png` in both themes. The blue logo is no longer recoloured; dark mode adds a wide, slowly pulsing white glow for contrast, disabled when reduced motion is requested.
- Removed the hero copy and header timezone, moved Share week into the planner toolbar, replaced the text actions with icon-only accessibility, blue info and upload buttons, and condensed the summary strip.
- Replaced the class search trigger with **Browse**, a green Class cube or red Lecturer cube, and a compact mode label. The picker now opens with **Find a Class** or **Find a Lecturer** and two condensed mode buttons.
- Removed the visible “Week of” label, changed “This week” to **Today**, and kept the compact date range on one responsive line. Mobile users can swipe the schedule right for the next date or left for the previous date.
- On mobile, moved the source revision into the Browse bar with the book icon at the left. On desktop, gave the date range a fixed width so the week arrows no longer move, and centred the **Today** label.
- Added a bottom cookie notice and an in-app privacy policy covering the theme cookie, local preferences, on-device file processing and external links.
- Removed the campus conditions, haze precautions and air-quality UI, data, refresh script, workflow schedule and related tests. Explicit “Online · source note” labels remain.
- Updated the light/dark screenshots, theme assertions and accessibility selectors for the new header, summary, picker and palette.

## 20 October 2026 - Dark mode

- Added a sun/moon toggle in the header that switches between the light and dark theme.
- The dark theme uses the five-colour brand palette and follows the system colour preference until a choice is made.
- The chosen theme is saved in a `gmi-theme` cookie; no other preference is stored in cookies.
- A small `theme-boot` script applies the theme before first paint to avoid a flash of the wrong colours.
- The dark theme replaces the CSS wordmark with the supplied transparent `gmi-logo.png`; the mark is centered, enlarged and recoloured with an `invert`/`hue-rotate` filter instead of a light plate.
- The topbar uses the deepest surface `#181A1B`; the page canvas and controls use `--color-dark` (`#141243`) so inputs and view switches no longer render as near-black patches.
- Lesson cards use palette-alpha tints in dark mode; the brown "warm" tone, empty-day marker and focus outlines were brought back onto the brand palette.
- Raised the smallest text sizes (7-8px labels now 9-10px) and released the campus-updates chevron as an SVG icon.
- Added Playwright coverage for toggling, cookie-only persistence, reload, dark-theme accessibility and light/dark review screenshots.

## 20 October 2026 - TypeScript migration

- Rewrote the browser modules, unit tests, browser tests and Node scripts in TypeScript with `strict` enabled; the Python data checks are unchanged.
- Kept the plain-`tsc` static build: `npm run build` emits the same module-per-file layout into `dist/` without a bundler.
- Added `tsx` for running TypeScript Node scripts; `npm test` now typechecks the app and tooling before running the data checks and unit tests.
- Added `npm run typecheck` and `npm run update:air`; the Pages workflow now refreshes air quality through the npm script.
- No timetable data, calendar output, DAV parsing/editing behavior or browser rendering changed.

## 20 October 2026 - Fork Creation Date

- Start of masodommel/gmi-student-timetable fork :3

## 18 October 2026 - Compact campus updates

- Replaced the initially expanded haze and air-quality panels with one collapsed Air & campus updates strip, giving the timetable substantially more space.
- Kept the reference station, API/category, observation time and stale/unavailable status visible in the compact summary, with a short active haze reminder.
- Moved guidance, source links, station selection and refresh controls into the expandable content. It starts collapsed on each page load and supports native keyboard activation.
- Validation: all 20 browser workflows passed, including compact height at 320px, keyboard expansion, accessibility and existing timetable/export flows.


## 18 October 2026 - Latest official station air-quality readings

- Added a regional reference card with Putrajaya/Cheras station selection, Malaysian API/IPU value and category, observation time in MYT and DOE/APIMS attribution.
- Added hourly server-side snapshots via the existing Pages workflow, with no exposed keys or per-user requests to DOE. Snapshot refresh is independent of timetable loading and class delivery decisions.
- Added loading, refresh-failure, outdated (>3 hours) and unavailable (>24 hours) states. Last-known observation timestamps are preserved on upstream failure. Future/null/inconsistent data is rejected.
- Normalised the official feed's offset-free Malaysian timestamps explicitly to UTC+8 and published only an allowlist of station fields.
- Added unit and browser coverage for timestamp conversion, invalid data, freshness, station selection, failed refresh, phone layout and accessibility. No timetable data or calendar/DAV exports changed.


## 18 October 2026 - Haze precautions and class delivery reminders

- Added a collapsible Kajang haze precaution with a mask/respirator reminder, official MOH guidance and an APIMS link. It does not display an unverified air-quality reading or claim institutional approval.
- Prompted users to check lecturer messages or GMI announcements because classes may change delivery mode. Upcoming lessons in the active window show “Confirm class delivery”; only explicit source notes produce an “Online · source note” label.
- Added explanatory lesson details, accessible toggle state and saved collapse preferences. The initial reminder expires after 25 October 2026 to avoid a stale indefinite notice.
- Left timetable data, DAV files and calendar exports unchanged.
- Validation: 17 reference-enabled unit tests and 17 browser workflows passed, including haze expiry, ambiguous/negated online wording, collapse persistence, narrow-phone layout and automated accessibility checks.


## 15 October 2026 - R04D timetable and revision notification

- Replaced the provided schedule with `TT JULYSEPT 2026_R04D_15102026.dav`, revision R04D dated 15 October 2026 (2,264,770 bytes).
- Source SHA-256: `c03eccde201485bf286172202bfc96ab16210d4730e7a2daaf5ee9aa072c8174`.
- Regenerated 178 class datasets/calendars: 23,203 student entries, a net increase of ten. The full reconstruction contains 27,252 dated blocks; lecturer/resource datasets contain 26,453 entries across 246 display labels.
- Compared schedules excluding source-specific event IDs and derived overlap flags: 144 class schedules differ, with 564 added/changed and 554 removed/changed student blocks. These are block comparisons, not counts of individual administrative edits.
- Added a small `R04D · 15 Oct 2026` indicator. Its New dot clears when source details are opened, remains acknowledged after refresh, and returns for a different source hash. Local file imports are labelled separately.
- Added a current-revision DAV data generator with explicit filename/hash/revision/date/count metadata, regenerated calendar snapshots, and removal of obsolete generated datasets.
- Updated revision information and browser tests so calendar checks follow the loaded dataset rather than a previous fixed event count.
- Validation: complete structural decoding through EOF, class/lecturer parity with the supplied DAV, dataset/calendar checks and browser/accessibility workflows. Native DaVinci holiday/override semantics remain unverified; no new byte-round-trip or native application verification is claimed for R04D.


## 14 October 2026 - Accessibility, lecturer timetables and DAV editing

Implemented and deployed in commit `d8c7cba3754140384368b714fd8108e6d18fc9d3`.

### Accessibility

- Added saved preferences for larger text, high contrast, reduced motion and an agenda default.
- Improved keyboard focus, mobile day selection focus retention, form labels and lesson accessible names.
- Replaced whole-timetable live announcements with concise status updates.
- Improved contrast for muted text, empty states, links and active mobile day labels.
- Added forced-colour support and fixed date-label overlap on narrow phones.

### Lecturer timetables

- Added a By lecturer picker with name search.
- Combined entries across classes and resource activities, with class/activity labels on lesson cards and calendar descriptions.
- Added lecturer-specific calendar downloads and provided-source lecturer/week links.
- Generated and checked 246 lecturer/resource datasets covering 26,443 dated entries. These are source labels and entries, not verified counts of individual people or users.

### Local DAV editing and export

- Retained the opened source buffer locally and added full-file DAV download.
- Added recurring lesson note edits and weekday/start-period changes for unlinked lesson blocks.
- Preserved unknown source bytes; edits patch decoded placement bytes and the tagged note string, then decode the result again.
- Kept coupled lesson placement changes blocked, required consecutive existing periods, and enforced the 255-character Windows-1252 note limit.
- Confirmed unchanged exports are byte-identical and reversing tested edits restores the original synthetic file byte-for-byte.
- Local edits do not update the public schedule and must be exported before refresh to retain them.

### Source verification

The attachment received on 14 October has the same SHA-256 as the existing timetable:

`0e65e7d9144b4054d9c41d31b4fb7ddb2dfeadd13b1b58eb593b9894a0496b25`

It passed source recovery validation. The website retains the original revision date because no newer timetable content was found.

### Validation

- Source recovery: complete 2,133,554-byte round-trip and 27,242 reconstructed calendar checks passed.
- Fifteen unit/reference tests passed with no skips, including all published student entries and lecturer datasets against browser decoding.
- Fourteen browser workflows passed locally, including automated axe checks on the selected planner/dialog states.
- Four enhancement/accessibility workflows passed against the deployed GitHub Pages site.
- GitHub Pages deployment succeeded: https://github.com/lollllz/gmi-student-timetable/actions/runs/38515955570

### Known limits

Native DaVinci acceptance and scheduling behavior of edited files remain unverified. DAV editing/export is experimental. Room, lecturer, subject, recurrence-mask, holiday, linked-group and lesson creation/deletion editing are unsupported. Calendar downloads remain tentative snapshots. Automated accessibility checks are not a full WCAG conformance claim or a replacement for assistive-technology testing.
