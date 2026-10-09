# Kalinga 1B — Web App (one phone) Implementation Plan

> Built autonomously at the user's request ("build everything in auto mode… I would like to see and test the web app and give feedback"). The 1A core (`kalinga/js/*.js` pure modules) is the domain layer; this plan adds the screens on top. Native execution, with a fresh whole-branch review at the end.

**Goal:** A phone-first PWA at https://kalinga-app.pages.dev. The caregiver sets up a parent's phone (profile, conditions, medicines, vitals). The parent then uses elder mode: big tiles, a full-screen dose card, and logging by voice, keypad or faces. Everything works on one phone, with reminders while the app is open or recently backgrounded.

**Spec:** `../specs/2026-10-09-kalinga-design.md` (§2, §3, §4.1–4.4, §4.7–4.8, §6.5). Roadmap: `2026-10-09-kalinga-phase1-roadmap.md`.

## Global Constraints

- ES5 vanilla JS, no framework, no build step, no runtime npm deps (repo `CLAUDE.md`). Rendering uses HTML strings, `data-action` delegation and `patch()`.
- Domain rules live only in the 1A modules. The UI never computes doses, never invents limits, and never edits `stock.count` except through `recordDose` or `setStockCount`.
- Sliding-scale charts are saved only via `saveMed(med, by, { confirmChart: true })`, after the caregiver ticks the doctor-instructions box.
- Elder screens:
  - Text at least `calc(24 * var(--u))` and tap targets at least 64px.
  - Photo first, text last.
  - A 🔊 button reads the screen aloud.
  - No settings reachable without the PIN.
- Taglish is the default language and English the toggle. 1A error codes are translated in `i18n.js`.
- Every voice reading is read back ("185 — tama ba?") and needs ✓ before saving. After two ✗ the keypad opens. `KalingaVitals.plausible` gates every value.
- Light theme by default (legibility for elders), with dark available. Colors come only from CSS tokens.
- Data stays on the phone (localStorage + IndexedDB for photos and voice clips). No network calls except the deploy itself.

## Files

| File | Responsibility |
|---|---|
| `kalinga/index.html` | Shell: welcome, app (header, views, tab bar), sheet, confirm dialog, dose overlay, toasts |
| `kalinga/css/kalinga.css` | Tokens (light/dark), caregiver UI, elder UI (large), dose overlay |
| `kalinga/js/i18n.js` | `KalingaI18n.t(key, vars)`, Taglish/English strings, error-code messages |
| `kalinga/js/files.js` | IndexedDB blobs (photos, voice clips) — Alaga's `files.js`, Kalinga DB name |
| `kalinga/js/ui.js` | `KalingaApp` + `App.h` helpers (DOM, esc, format, toast, ask, sheet, patch, fieldError) |
| `kalinga/js/voice.js` | Text-to-speech, voice-clip record/play, speech recognition for readings |
| `kalinga/js/reminders.js` | In-page alarm engine: ring times, snooze, fired keys (per device), notifications, chime |
| `kalinga/js/elder.js` | Elder mode: home tiles, dose card, reading flow (voice/keypad/faces → read-back → verdict/danger) |
| `kalinga/js/care.js` | Caregiver mode: dashboard, profile + conditions, medicine form (insulin charts), vitals setup, history, change log |
| `kalinga/js/app.js` | Boot, first run, mode switching + PIN, settings, backup/restore, action delegation, commit/render |
| `kalinga/sw.js`, `manifest.webmanifest`, `icons/`, `privacy.html` | PWA shell, offline cache, notification click |
| `kalinga/deploy/build-site.js` | Builds `kalinga/deploy/dist` for Cloudflare Pages (project `kalinga-app`) |
| `kalinga/tests/e2e.smoke.js` | Playwright phone-size walk-through of both modes |

## Tasks

1. **Shell, styles, i18n, files, ui helpers.** The page loads with no errors, the welcome screen shows, and the light/dark tokens work.
2. **First run + caregiver profile + conditions picker.** Creating "Papa" with diabetes, hypertension and inflammation creates conditions plus the ticked vital types.
3. **Medicine form.** Tablet, cream, as-needed, fixed insulin and sliding-scale insulin (chart editor, confirm box), schedule, stock, photo, voice clip, and errors shown inline (translated codes).
4. **Caregiver dashboard + history + change log.** Shows the timeline statuses, pinned vitals with sparklines, low stock, and a 7-day adherence figure.
5. **Elder mode + PIN.** The home tiles, today list and 🔊 button.
6. **Dose card + reminder engine.** Ring at the due time and the re-rings, Nainom ko na / Mamaya / Hindi ko iinumin, takenEarlier handling, the sliding-scale flow (reading → chart row → confirm units), notifications while hidden.
7. **Reading flow.** Voice → read-back ✓/✗ → keypad fallback, BP pairs, face scale + photo, context chips, verdict / danger cards.
8. **Settings + backup/restore + privacy page + PWA (sw, manifest, icons).**
9. **e2e smoke test + deploy build.** Covers the full flow at 360px and checks for no horizontal scroll at 320px. Then deploy to `kalinga-app` (user-authorized).
10. **Fresh whole-branch review → fix pass → merge.**
