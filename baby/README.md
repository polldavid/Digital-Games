# Baby Log 🍼

An all-in-one newborn tracker for the first year — built for one-handed use at
3 a.m. Plain HTML/CSS/JS like the rest of this repo: no build step, no
dependencies, no server. It installs to the home screen and works offline.

**Open it:** https://polldavid.github.io/Digital-Games/baby/

## What it tracks

| | |
| --- | --- |
| 🍼 **Feeds** | Breast timer with Left/Right switching, pause and "start on this side next"; bottles (breast milk or formula, ml or oz); solids with first-try and reaction tracking |
| 🧷 **Diapers** | Wet / dirty / both, poop colour and texture with instant "normal or call the doctor" feedback, rash |
| 😴 **Sleep** | One-tap sleep timer, or log past sleeps; wake windows and the next nap window |
| 🧴 **Pumping** | Left/right amounts, duration, milk-storage times |
| 🤸 **Tummy time** | Timer and a daily goal that grows with age |
| 💊 **Medicine** | Spacing between doses, max per 24h, "next dose allowed at…", age warnings. **Never suggests doses.** |
| 🌡️ **Temperature** | Age-aware fever check (under 3 months, 38 °C / 100.4 °F = call now) |
| 📏 **Growth** | Weight, length, head; % change from birth weight |
| 🛁 ⭐ 📝 | Baths, milestones (CDC checklist), notes |

## Reminders

Next feed (auto-interval from age, or your own), diaper check, nap window,
next medicine dose, daily vitamin D, daily tummy time, plus your own
reminders (once, daily, or every N hours — e.g. antibiotics every 8h). Each
shows as an in-app banner with **Log / Snooze / Dismiss**, a soft chime,
vibration, and a phone notification if allowed.

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

- **Today dashboard:** live timers, last feed / diaper / sleep tiles, next
  side, "is baby getting enough?" checks, upcoming reminders, today's log.
- **Trends:** daily rhythm map (sleep blocks and feeds per day), sleep, feeds,
  diapers, bottle and pumping charts with the normal range shaded, growth
  chart, and a table view.
- **Twins and siblings:** multiple babies, quick switching; reminders cover
  every baby.
- **Share & sync by hand:** a text summary of the last 24h for a partner or
  sitter; JSON backup/import (merges, never overwrites) to move logs between
  phones; CSV export for the pediatrician.
- **Units:** ml/oz, °C/°F, kg·cm/lb·in (US locales default to imperial).
- **Private:** no account, no analytics, no network calls; everything lives in
  `localStorage` on the device.

## Files

```
baby/
├── index.html             # shell: welcome, tabs, bottom sheet
├── manifest.webmanifest   # install to home screen
├── sw.js                  # offline cache + notification taps
├── icons/                 # app icons (SVG + PNG, maskable)
├── css/styles.css
└── js/
    ├── guide.js   # age norms, thresholds, milestones, cry ranking — pure, no DOM
    ├── store.js   # state, persistence, queries, timers, reminder engine — no DOM
    ├── sound.js   # white/pink/brown noise, shush, heartbeat, chime (Web Audio)
    ├── ui.js      # helpers: formatting, units, sheet, toasts, tooltips
    ├── forms.js   # one logging form per entry type (add + edit)
    ├── views.js   # Today, History, Trends
    ├── help.js    # Answers topics + sleep-sounds player
    └── app.js     # boot, actions, notifications, settings, import/export
```

`guide.js` and `store.js` have no DOM dependencies and load in Node
(`require('./js/store.js')`), so the maths and the reminder engine can be
tested without a browser.

If you change any cached file, bump `VERSION` in `sw.js` so installed copies
update.

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
