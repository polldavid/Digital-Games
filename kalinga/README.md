# Kalinga

Medicine reminders, vitals and checkups for elderly parents, with a caregiver
who is told within minutes when something is off. Sibling of Alaga (`../baby/`).
Private by design and condition-neutral: diabetes, hypertension, arthritis and
the rest are all just entries in `js/conditions.js`.

- Spec: `docs/superpowers/specs/2026-10-09-kalinga-design.md`
- Phase 1 roadmap: `docs/superpowers/plans/2026-10-09-kalinga-phase1-roadmap.md`

## Tests

    node kalinga/tests/run.js     # every unit test + browser-globals check

Pure Node, nothing to install. Each `tests/<module>.test.js` can also run alone.

## Modules (`js/`, load in this order)

| File | Global | What |
|---|---|---|
| schedule.js | KalingaSchedule | due times, slots, re-rings, as-needed limits |
| stock.js | KalingaStock | days left, low stock, dose arithmetic |
| scale.js | KalingaScale | sliding-scale chart lookup (never calculates a dose) |
| vitals.js | KalingaVitals | vital/symptom types, verdicts, danger cards |
| conditions.js | KalingaConditions | common senior conditions → suggestions |
| speechnum.js | KalingaSpeech | spoken numbers (EN/Tagalog/Taglish) |
| store.js | KalingaStore | state, tombstones, change log, domain rules |

Not published on GitHub Pages (`_config.yml` excludes `kalinga/`). It will deploy to
https://kalinga-app.pages.dev (plan 1B).
