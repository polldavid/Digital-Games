# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static-site hub ("Digital Games") of phone-first web apps, deployed with **GitHub Pages from `main`**: pushing to `main` publishes to https://polldavid.github.io/Digital-Games/. Each app lives in its own folder with its own `index.html` and shows up as a card on the root `index.html`:

- `friends/`, `getchurched/` — pass-and-play party games (`js/game.js` state machine + a word/question bank file)
- `flip7/` — card-game scorer (`js/rules.js` pure scoring maths, `js/app.js` UI + persistence)
- `baby/` — source of **Alaga** (formerly Baby Log), a newborn tracker PWA, by far the largest app; most work happens here (see below and `baby/README.md`). It is **not** published on GitHub Pages (`_config.yml` excludes it); it's built by `baby/deploy/build-site.js` and deployed to Cloudflare Pages (https://alaga.pages.dev). `moved/` serves a "moved" page + kill-switch service worker at the old `/baby/` address.

There is **no build step, no bundler, no framework, and no runtime npm dependencies**. Everything is plain HTML/CSS and ES5-style vanilla JS (`var`, IIFEs, string-concatenated HTML). Keep it that way. `.gitignore` excludes `package.json` and `node_modules/`, so dev-only packages (Playwright) are installed with `--no-save` and never committed.

## Commands

```bash
# Serve locally (service worker and notifications need http://, not file://)
python3 -m http.server 8000          # then open http://localhost:8000/baby/

# Baby Log unit tests — pure Node, no install. Stops at the first failing assert.
node baby/tests/unit.test.js

# Baby Log browser smoke test (Playwright/Chromium at iPhone size; serves the repo itself)
npm i --no-save playwright && npx playwright install chromium   # one-time
node baby/tests/e2e.smoke.js           # HEADED=1 to watch

# Quick syntax check of every Baby Log module
for f in baby/js/*.js; do node --check "$f"; done
```

The tests are plain scripts, not a framework — there is no per-test filter; to focus on one area, run the script and read the step that fails (the smoke test prints a `•` line per step).

## Shared conventions across apps

- **All links and asset paths are relative** (apps are served from a subfolder on Pages).
- **Theming**: `theme.css` + `theme.js` at the root provide the light/dark toggle (`<button data-theme-toggle>`), persisted in `localStorage['dg-theme']`. Every page also has a tiny inline `<head>` script that sets `data-theme` before first paint. Each app's stylesheet defines its **dark palette on `:root`** and overrides tokens under `:root[data-theme="light"]` — style through the CSS custom properties, never hard-coded colors.
- `localStorage` keys are namespaced per app (`dg-theme`, `flip7-game-v1`, `dg-babylog-v1`).
- Adding an app: new folder with its own `index.html`, then copy an `<a class="game" href="./folder/">` card in the root `index.html` and add a row to the README table.

## Baby Log architecture (`baby/`)

**Script load order matters** (see `baby/index.html`): each file attaches a global, and later files read earlier ones.

| Layer | Files → global | Notes |
|---|---|---|
| Pure logic (no DOM) | `guide.js` → `BabyGuide`, `store.js` → `BabyStore`, `rx.js` → `BabyRx` | Dual-export: `module.exports` under Node, globals in the browser — this is what `tests/unit.test.js` requires. Keep them DOM-free. |
| Browser services | `sound.js` → `BabySound` (Web Audio white noise + chime), `files.js` → `BabyFiles` (photos in IndexedDB) | |
| Platform | `native.js` → `BabyNative` (loads after `health.js`, before `app.js`) | Everything that differs in the Capacitor app-store shell: scheduled local notifications, file save/share, text share, a Preferences copy of the state. Each function feature-detects its plugin and falls back to the web behaviour, so the PWA is unchanged. Route new platform-specific code through here, not `app.js`. |
| UI | `ui.js` (creates `window.BabyApp`, helpers on `App.h`), `forms.js` → `BabyForms`, `views.js` → `BabyViews`, `help.js` → `BabyHelp`, `health.js` → `BabyHealth` | Render functions return HTML strings. |
| Wiring | `app.js` | Boot, the `ACTIONS` map, submit/change handlers, reminder loop, settings view, import/export. |

**State** (`store.js`): one object in `localStorage['dg-babylog-v1']`:
`babies[]`, `activeBaby`, `events[]` (`{id, baby, type, time, end, data}`, kept sorted by `time`), `timers[babyId]` (running sleep/breast/pump/tummy timers stored as start timestamps, so they survive reloads and a locked phone), `custom[]` reminders, `fired`/`snoozed` reminder bookkeeping, `health[babyId]` (profile, appointments, `rx` prescriptions, vaccines, docs), and `settings`.
- Units are stored canonically — **ml, °C, kg, cm, epoch ms** — and converted only for display (`App.h.vol/temp/weight/len` and their `*FromDisplay` inverses).
- `normalize()` rebuilds `settings` **only from the keys in `defaults().settings`** — a new setting must be added to `defaults()` or it is silently dropped on the next load.
- Photos are not in `localStorage`: records hold a `photoId`, the JPEG lives in IndexedDB (`files.js`), and JSON backups embed photos as base64 (`app.js` export/import).
- `save()` returns `false` and calls `S.onSaveError` when storage is full/blocked (the app shows a persistent "Not saved" banner); `commit()` uses `S.saveSoon()` (after paint, ≤120 ms) and `S.flush()` runs on `pagehide`/hidden. `events({from, to})` binary-searches the sorted list — keep `events[]` sorted (`addEvent`/`updateEvent`/import already do).

**Reminders**: `BabyStore.reminders(now, babyId)` derives every reminder (feed interval from age, diaper, nap window, medicine spacing, prescription doses, appointments, vaccines due, custom) with a stable `key`. `due()` returns those past due and not yet fired; `markFired()` records `key@at` so each fires once (a snooze moves `at`). `app.js` polls every 15 s and on `visibilitychange`, shows the in-app banner, chime, vibration and (if permitted) a notification via the service worker. Feed/diaper/tummy/vitamin-D reminders are held while the baby's sleep timer runs, and no sound plays while a baby sleeps or during quiet night hours.

**Rendering & events** (all in `app.js` / `ui.js`):
- `App.render()` rebuilds the active tab with `App.h.patch()`, which replaces only the top-level blocks whose HTML changed (focus, open `<details>` and loaded photos survive); `App.commit()` = sync alerts → render → re-render the open sheet → `saveSoon()` → native reminder sync. After mutating `BabyStore.get()`, call `commit()`.
- Destructive actions confirm with `App.h.ask({title, text, ok, danger}, onYes)` (a `<dialog>`), never `window.confirm()`. Validation errors go through `App.h.fieldError(form, name, msg)` (inline, `aria-invalid`, focus); FORMS `parse()` returns `{ field, error }`.
- Tabs keep one history entry above a root `{babyView:'today', root:true}` state, so Android Back goes tab → Today → out; sheets push their own entry. When closing a sheet and then navigating, wrap the navigation in `App.h.afterHistory(fn)`.
- Event delegation only: elements carry `data-action="name"` (dispatched to `ACTIONS[name]` in `app.js`), `data-action-change` for change events, and `data-setting="key"` for settings inputs. Forms are handled in `onSubmit` by `id`: `#sheet-form` goes through the `FORMS` registry in `forms.js` (each type has `html(ev, preset)`, `parse(form)`, optional `mount(body)`), and Health forms go through `saveHealthForm`.
- Bottom sheets: `App.h.openSheet({title, html: fn, mount})`. The `html` function is re-run on every `commit()`, which discards un-saved typing — when a change must keep the user's input, update the DOM in place instead (see `doc-photo`, `unit-toggle`).
- Live clocks update every second via attributes `data-ago`, `data-elapsed`, `data-since`, `data-until`, `data-breast`, `data-pump` (handled by `tick()` in `ui.js`), not by re-rendering.
- The sticky Save bar (`.sheet-save`) must be a direct child of the form to stick; wrappers around it use `display: contents` (`[data-panel-save]`).
- Every interactive element should keep a ≥44px tap target; the smoke test checks there is no horizontal scroll at 320px.
- **Text size follows the phone**: write every `font-size` as `calc(N * var(--u))` (N = the old px value), never raw px. `--u` is 1px at default and grows with iOS Dynamic Type / browser text size (cap 2×); inputs use `max(16px, …)` so iOS doesn't zoom. Android WebViews also scale text on their own, so new layouts must survive 2× text: use min-heights, wrapping rows and `auto-fit` grids, not fixed heights. Emoji inside fixed circles use `min(var(--u), 1.2px)`.
- **Phones and tablets**: `App.h.regions()` wraps each view into `.pane--lead` (blocks before the first `.section-title`) and `.pane--groups` (one `section.group` per title + its cards); `patch()` patches inside `[data-region]` wrappers. On ≥768px Today shows the two panes side by side, Health/Settings flow groups into two columns, Trends grids its charts, and sheets become centred panels. ≥1000px wide (or a phone in landscape) swaps the bottom tab bar for a left rail. New views get this for free if they use `section-title` + card blocks.

**Service worker** (`baby/sw.js`): caches the app shell for offline use. Scripts and stylesheets are loaded with a version query (`js/app.js?v=14`): **whenever any cached file changes, bump `V` in `sw.js` and every `?v=` in `index.html` together** (`tests/unit.test.js` fails if they differ), and add new files to `VERSIONED`/`FILES`. Without this a fresh `index.html` gets paired with stale cached CSS/JS — from the service worker or GitHub Pages' 10-minute HTTP cache — and the page breaks (giant icons, old layout).

**External code at runtime**: only Tesseract.js 7.0.0 (prescription OCR), lazy-loaded from jsDelivr on the first scan with an SRI hash (`TESSERACT_SRI` in `health.js` — update it if the version changes); the photo is pre-processed in `health.js` (`enhance()`) and the text parsed by `rx.js`. Nothing else is fetched; all data stays on the device.

**Product rules the code relies on**:
- Health guidance in `guide.js` (feeding/sleep/diaper norms, fever thresholds, vaccine schedules for PH and US, milestones) follows AAP/CDC/WHO/NHS/DOH/PIDSP material; screens present it as general information with a "call your pediatrician" disclaimer.
- The app **never suggests medicine doses** — it only records what was given and enforces spacing/max-per-day that the parent or prescription supplies.
- Scanned prescriptions are **never saved without the parent confirming** the drafted lines.
