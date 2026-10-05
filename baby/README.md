# Baby Log 🍼

An all-in-one newborn tracker for the first year — built for one-handed use at
3 a.m. Plain HTML/CSS/JS like the rest of this repo: no build step, no
dependencies, no server. It installs to the home screen and works offline.

**Open it:** https://polldavid.github.io/Digital-Games/baby/

## What it tracks

| | |
| --- | --- |
| 🍼 **Feeds** | Breast timer with Left/Right switching, pause and "start on this side next"; bottles (breast milk or formula, ml or oz; ± 1 ml / 0.1 oz with a +5 ml / +0.5 oz jump); solids with first-try and reaction tracking |
| 🧷 **Diapers** | Wet / dirty / both, poop colour and texture with instant "normal or call the doctor" feedback, rash |
| 😴 **Sleep** | One-tap sleep timer, or log past sleeps; wake windows and the next nap window |
| 🧴 **Pumping** | Tap-to-start timer with independent Left and Right sides (run both at once for a double pump, or one at a time), then enter each side's amount; milk-storage times |
| 🤸 **Tummy time** | Timer and a daily goal that grows with age |
| 💊 **Medicine** | Spacing between doses, max per 24h, "next dose allowed at…", age warnings. **Never suggests doses.** |
| 🌡️ **Temperature** | Age-aware fever check (under 3 months, 38 °C / 100.4 °F = call now) |
| 📏 **Growth** | Weight, length, head; % change from birth weight |
| 🛁 ⭐ 📝 | Baths, milestones (CDC checklist), notes |

## Health records

The **Health** tab keeps the medical side in one place:

- **Scan a prescription.** Take a photo (or pick one from the gallery). The
  photo is cleaned up on the phone (grayscale, contrast stretch, enlarged) and
  read with the free, open-source Tesseract OCR engine (Tesseract.js, loaded
  on first use, then cached) — no account, no API key, and the photo never
  leaves the phone. The text is turned into draft entries — medicine,
  strength, dose, how often (understands OD, BID, TID, QID, q6h, PRN,
  "x 7 days"…, and fixes common OCR slips like "SmL" → "5mL") and for how
  long. A second "try reading it another way" pass uses a black-and-white
  image and single-block layout. The parent checks and edits every line
  before anything is saved; the photo is kept with the record either way.
  Printed prescriptions read well; handwriting usually needs some typing.
- **Medicines.** Each prescription is a course with dose reminders until it
  ends, a dose counter ("4 of 21"), and **Give dose**, which logs the dose to
  History. Stop or delete any time.
- **Visits.** Appointments with type, doctor, clinic and questions to ask;
  reminders the evening before and 2 hours before; afterwards, what the doctor
  said, measurements, and booking the next visit.
- **Vaccines.** A checklist with due dates from the birthday — the Philippine
  schedule (DOH National Immunization Program + PPS/PIDSP additions) or the US
  CDC schedule — with given dates, overdue/due-soon flags and a reminder on
  due dates. Editable, and other vaccines can be added.
- **Calendar.** Month view of visits, vaccines due/given and medicine courses.
- **Profile, emergency info, documents.** Blood type, allergies, conditions,
  pediatrician and phone, PhilHealth/insurance number; a shareable emergency
  card for a sitter or the ER; photos of lab results or the vaccine card.
- **Summary for the doctor.** Last 7 days of feeds, diapers and sleep, weight,
  fevers, flagged diapers, medicines, vaccines due, and your questions — one
  tap to share.

Photos are stored in IndexedDB (compressed to ~1600 px JPEG) and included in
JSON backups.

## Reminders

Next feed (auto-interval from age, or your own), diaper check, nap window,
next medicine dose, daily vitamin D, daily tummy time, plus your own
reminders (once, daily, or every N hours — e.g. antibiotics every 8h). Each
shows as an in-app banner with **Log / Snooze / Dismiss**, a soft chime,
vibration, and a phone notification if allowed.

Reminders respect a sleeping baby: while the sleep timer runs, feed, diaper,
tummy-time and vitamin D reminders wait until the baby wakes. The one
exception follows newborn guidance: babies under 2 weeks get a "time to wake
for a feed" nudge at about 4 hours. No sound ever plays while a baby is asleep,
and **Quiet at night** (on by default) makes 10 pm – 7 am alerts vibrate-only.

> Web apps can only fire reminders while they're open or in the background —
> phones may pause a fully closed web app. The app says so in Settings.
> Reliable closed-app alerts need native local notifications (see *App
> stores* below).

## Answers — the questions parents search most

Research into what new parents google most (sleep, feeding, crying, poop,
fever and milestones lead every list; feeding questions alone are ~40% of
searches) shaped the **Answers** tab. Where possible each answer uses the
baby's own log, not just general advice:

| Question | What the app does |
| --- | --- |
| Why is my baby crying? | Ranks likely causes from the log — time since last feed vs age interval, last diaper, awake time vs wake window, recent fever, evening colic — with one-tap fixes, the 5 S's, white noise and red flags |
| How can I help my baby sleep? | Age norms, the current nap window, longest stretch, safe-sleep ABCs, sleep sounds |
| Is my baby eating enough? | Last 24 hours vs expected feeds, wet and dirty diapers (day-of-life rule), sleep, tummy time |
| How often and how much? | Age table, highlighted for your baby; formula estimate from logged weight |
| Is this poop normal? | Colour guide with normal/check/urgent flags; flags concerning diapers you logged |
| Fever — when do I call? | Age-specific thresholds, a quick checker, how to take a temperature |
| When will baby roll / sit / walk? | CDC milestone checklist you can tick off (saved to history) |
| Spit-up, hiccups, stuffy nose · Teething | Short answers with "call the doctor if…" lists |

All guidance follows AAP, CDC, WHO and NHS material and is shown as general
information with a clear "not medical advice — call your pediatrician"
disclaimer.

## Also

- **Today dashboard:** live timers, one-tap log buttons the parent chooses and
  orders (Settings → Today screen, or More → Choose which buttons show; the
  rest stay under *More* — including **Scan Rx**, **Visit** and **Crying?**), last feed / diaper / sleep tiles, next side, "is baby getting
  enough?" checks, upcoming reminders, today's log.
- **Made for one tired thumb:** Save is pinned to the bottom of every form,
  sheets close with a swipe down or the phone's Back button, tap targets are
  at least 44 px, and text meets WCAG AA contrast in light and dark mode.
- **Install tip:** iPhone users get a one-time "Add to Home Screen" tip (needed
  there for notifications, and it stops Safari clearing the logs); Android
  gets an Install button.
- **Trends** (inside History): daily rhythm map (sleep blocks and feeds per day), sleep, feeds,
  diapers, bottle and pumping charts with the normal range shaded, growth
  chart, and a table view.
- **Twins and siblings:** multiple babies, quick switching, and "also log
  for…" on feeds, diapers, sleep, tummy time, baths and notes; reminders cover
  every baby.
- **Share & sync by hand:** a text summary of the last 24h for a partner or
  sitter; JSON backup/import (merges, never overwrites) to move logs between
  phones; CSV export for the pediatrician.
- **Units:** ml/oz, °C/°F, kg·cm/lb·in — chosen at setup (the default follows
  the phone's time zone, so a US-English phone in Manila still gets ml and °C),
  changeable in Settings, or by tapping the unit on the bottle and
  temperature screens.
- **Private:** no account, no analytics; everything lives in `localStorage` on
  the device. The only network request is the text reader (Tesseract.js, pinned
  with a subresource-integrity hash) fetched the first time a prescription is
  scanned — the photo itself never leaves the phone.

## Files

```
baby/
├── index.html             # shell: welcome, tabs, bottom sheet
├── manifest.webmanifest   # install to home screen
├── sw.js                  # offline cache + notification taps
├── DESIGN.md              # the visual system (Isotype day, sky-chart night) — read before UI work
├── icons/                 # app icons (SVG + PNG, maskable) + pictos.svg (55 drawn pictograms, inlined in index.html)
├── fonts/                 # Jost (self-hosted, SIL OFL) — works offline and in the store builds
├── css/styles.css
└── js/
    ├── guide.js   # age norms, thresholds, milestones, vaccine schedules, cry ranking — pure, no DOM
    ├── rx.js      # prescription text → draft medicines (shorthand, brands) — pure, no DOM
    ├── files.js   # photo storage (IndexedDB) and compression
    ├── store.js   # state, persistence, queries, timers, reminder engine — no DOM
    ├── sound.js   # white/pink/brown noise, shush, heartbeat, chime (Web Audio)
    ├── ui.js      # helpers: formatting, units, pictograms (ic/icon/tone), sheet, confirm dialog, field errors, toasts, tooltips
    ├── forms.js   # one logging form per entry type (add + edit)
    ├── views.js   # Today, History, Trends
    ├── help.js    # Answers topics + sleep-sounds player
    ├── health.js  # Health tab: visits, prescriptions + scanning, vaccines, records
    ├── native.js  # web ↔ app-store differences: notifications, files, share, durable storage
    └── app.js     # boot, actions, notifications, settings, import/export
```

`guide.js` and `store.js` have no DOM dependencies and load in Node
(`require('./js/store.js')`), so the maths and the reminder engine can be
tested without a browser.

If you change any cached file, bump `VERSION` in `sw.js` so installed copies
update.

## Tests

```bash
node baby/tests/unit.test.js        # pure logic: guide.js, store.js, rx.js — no install needed
npm i --no-save playwright && npx playwright install chromium   # one-time
node baby/tests/e2e.smoke.js        # main flows in Chromium at iPhone size (HEADED=1 to watch)
```

## App stores (later)

The web version is built to be wrapped without a rewrite:

- **Google Play:** a Trusted Web Activity (e.g. Bubblewrap) can ship the PWA
  as-is.
- **iOS App Store:** wrap with Capacitor and add native value Apple expects —
  local notifications (reliable reminders with the app closed), a
  Live Activity / widget for running timers, and HealthKit if wanted.
- **Before charging for it:** partner sync needs a backend and accounts;
  storage is isolated in `store.js` so a sync layer can sit behind the same
  API. You'll also need a privacy policy, since this is baby health data.
