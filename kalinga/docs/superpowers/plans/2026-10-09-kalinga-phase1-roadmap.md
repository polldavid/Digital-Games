# Kalinga Phase 1 — Roadmap

**Spec:** `../specs/2026-10-09-kalinga-design.md`. This file splits Phase 1 (Daily care) into four plans. Each plan produces software that works on its own. Each later plan is written in detail **after the previous one lands**, so it builds on real code instead of guesses.

| Plan | Delivers | Works on its own because… | Status |
|---|---|---|---|
| **1A Core logic** | `kalinga/js/` pure modules + tests: schedule, stock, scale, vitals, speechnum, conditions, store | Fully unit-tested, no UI needed | Detailed plan: `2026-10-09-kalinga-1a-core-logic.md` |
| **1B Web app (one phone)** | Elder mode + caregiver mode on a single device, at kalinga-app.pages.dev | A caregiver can set up a parent's phone and the elder can use it while the app is open | To be planned after 1A |
| **1C Android app + real alarms** | Capacitor shell, `KalingaAlarm` native plugin, voice clips, alarm-reliability checklist (Oppo/Redmi) | **The parents' trial week starts here**: alarms ring with the app closed, and setup happens on their phones behind the PIN | To be planned after 1B |
| **1D Care circle + caregiver alerts** | Pairing, end-to-end encrypted sync (Worker `kalinga-sync` + D1 + R2), FCM push, deadline cron, key rotation | Caregiver sees both parents and gets alerts from anywhere | To be planned after 1C |

## 1B — Web app, one phone (outline)

- `kalinga/index.html`, `css/`, `sw.js`, and `i18n.js` (Taglish default plus English; turns 1A's error codes into words). UI modules follow Alaga's split: `ui.js` helpers, `views.js`, `forms.js`, `app.js` wiring, `data-action` delegation, `App.h.patch()`. Text sizes use `calc(N * var(--u))`, with elder screens at **≥24pt** and **≥64px** targets.
- **First run:** "Who uses this phone?" offers elder (pick or create a profile) or caregiver. Caregiver screens on an elder phone are behind a **PIN**.
- **Caregiver:**
  - Elder profiles, and conditions picked from `KalingaConditions`, with each suggestion ticked or unticked.
  - The medicine form: photo, purpose, form, apply-to, dose, as-needed limits, stock, insulin fixed or sliding-scale chart editor with the doctor-confirmation tick, and schedules.
  - Vital and symptom setup, the dashboard (timeline + pinned vitals + low stock), history charts and the change log.
- **Elder:**
  - The ≤4-tile home and the full-screen dose card (pill photos, purpose, "Nainom ko na" / "Mamaya" / "Hindi ko iinumin").
  - Logging: the "Sukatin" picker, voice entry via the Web Speech API → `KalingaSpeech` → `plausible` → spoken read-back ✓/✗ (keypad after two ✗), face-scale check-ins with an optional photo, and danger cards.
  - TTS 🔊 on every screen.
- **Supporting pieces:**
  - In-page reminder loop (15 s poll, as in Alaga) while the app is open.
  - Photos in IndexedDB (copy Alaga's `files.js`).
  - Local JSON backup/restore.
- **Deploy:** `deploy/build-site.js` → `npx wrangler pages deploy dist --project-name kalinga-app --branch main` (ask before deploying).
- **Tests:** a Playwright smoke test at phone size covering the elder flow (dose card → taken → stock drops; voice "one eighty five" → read-back → saved) and the caregiver flow (sliding-scale chart refused until confirmed). No horizontal scroll at 320px, and the layout survives 2× text.

## 1C — Android app + real alarms (outline)

- `kalinga/native/` Capacitor shell (copy of Alaga's setup, JDK 21 at `C:\Users\Poll David\.jdks\jdk-21.0.12.1+1`, SDK `C:\Android\Sdk`).
- **`KalingaAlarmPlugin.java`:**
  - Schedules alarms with `AlarmManager.setAlarmClock`.
  - When an alarm fires, a foreground service plays the voice clip (or TTS) and opens a full-screen `AlarmActivity` over the lock screen with the dose card.
  - Reschedules after `BOOT_COMPLETED` and on time or timezone changes.
  - Reports exact-alarm, full-screen-intent, notification and battery-optimization status.
- **JS side:**
  - `native.js` schedules the next 48 h of `rings()` for every slot.
  - Answering the alarm calls `recordDose` and cancels the remaining re-rings.
- **Voice clips:** the caregiver records them per slot or per med (MediaRecorder) and they're stored as files.
- **Alarm-reliability checklist:**
  - Deep links to the ColorOS and HyperOS autostart and battery pages, with brand screenshots.
  - A 2-minute locked-screen test alarm with a pass/fail result.
  - A weekly self-check.
- **Real-device matrix on the parents' Oppo and Redmi:** locked, after a reboot, after 24 h idle, with battery saver on, after a swipe-away, and with the largest font.
- **Then the trial week:** run alongside the parents' current routine.

## 1D — Care circle + caregiver alerts (outline)

- **Sync:** `kalinga/js/sync.js`, adapted from Alaga's `baby/js/sync.js` (AES-GCM, HKDF from one circle secret, hashed record names, server sequence ordering). Differences:
  - Records carry their own `deleted` tombstone, so **no deletion is ever inferred** from a missing record. The hold-back logic is no longer needed.
  - Per-phone `device` is never synced.
- **Server:** `kalinga/server/` Worker `kalinga-sync`, adapted from `baby/server/worker.js`:
  - D1 tables `circles`, `records`, `records_history` (30 days), `devices` (FCM tokens), `deadlines` (circle, elder, slot, dueAt + cutoff, cleared).
  - An R2 bucket for encrypted photos and voice clips.
  - A Cron Trigger **every minute** that sends FCM data messages for expired deadlines.
  - `POST /v1/alert` relays encrypted event alerts.
  - The FCM service-account key is a Worker secret.
- **Pairing:** a QR code / link `#join=<secret>` (the fragment never reaches the server), plus a printable recovery code at circle creation.
- **Alert handling on phones:**
  - The caregiver phone gets FCM data messages and shows a local notification with the elder's name and the details, looked up locally.
  - A late confirmation sends a follow-up ("taken 8:12, phone was offline").
- **Removing a device** switches the circle to a new key, and the remaining devices re-encrypt and re-upload.
- **Tests:** in-memory fake server (as in `baby/tests/sync.test.js`) for sync, tombstones, the generation guard and key rotation. Worker tests stub FCM, and **tests never call the live server**.

## Phases 2 and 3

Planned after the Phase 1 trial week passes (see spec §7).
