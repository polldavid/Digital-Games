# Kalinga — Design Spec

**Date:** 2026-10-09
**Status:** draft for review
**Sibling of:** Alaga (`baby/`). It reuses Alaga's stack, sync and conventions; see the repo `CLAUDE.md`.

## 1. Purpose

Kalinga helps elderly people take their medicines on time, track whatever vitals and symptoms matter for their conditions, keep stock and prescriptions in order, and stay on top of checkups. It also lets an adult child or other caregiver see what's happening and be told within minutes when something goes wrong.

**Condition-neutral by design.** Seniors usually live with several conditions at once: hypertension, diabetes, arthritis and inflammation, high cholesterol, heart disease, after-stroke care and so on. Nothing in the app is built around one disease. Conditions are data (§4.7) that *suggest* what to track and when to alert, and the caregiver can change all of it. Insulin is the only medication with special handling, because its dose can depend on a reading.

**First users:** the developer's parents.
- Both are about 65.
- Both have several conditions, including diabetes (they track their sugar regularly), hypertension and foot inflammation, each with its own medicines.
- Each has their own Android phone: one an Oppo, one a Redmi.
- They can do basic phone tasks. Dad had a stroke, has poor eyesight and struggles to read.

**Then:** a public release for Filipino families (Google Play). It's private and has no ads, the same positioning as Alaga.

**Success looks like:**
- The parents take their meds on time without a phone call from family.
- The caregiver knows within minutes when a dose wasn't confirmed or a reading is dangerous.
- Checkups go faster because meds, readings and documents are in one place.

## 2. Roles and the care circle

- **Care circle:** one family. It contains **elders** (each with a profile and usually their own phone) and **caregivers** (any number; one caregiver can watch several elders).
- Every member shares one **circle key** (encryption). A new phone joins by scanning a QR code shown on an existing member's phone, the same model as Alaga's partner sync. There are no email or password accounts.
- When the circle is created, the app shows a **recovery code** to print or save. If every phone is lost and there's no code, the data can't be recovered, and the app says so plainly.
- **One app, two modes:**
  - **Elder mode:** a simplified, locked-down interface on the elder's phone.
  - **Caregiver mode:** full setup and monitoring.
  - Caregiver screens on an elder's phone are behind a **PIN**.

## 3. Elder mode

### 3.1 Accessibility rules (apply to every elder screen)
- Text is at least 24pt, high-contrast, and follows the phone's text size (the Alaga `--u` rule, surviving 2× scaling).
- Every screen has a 🔊 button that reads it aloud (TTS).
- Photos come first and text last. Every medicine shows its **pill photo**.
- Every tap target is at least 64px.
- Elders get no settings and no editing.

### 3.2 Home screen
At most four huge tiles:
- **Next dose:** pill photos plus the time and slot name, e.g. "8:00 — Umaga".
- **Sukatin / Log:** opens logging for the vitals and symptoms the caregiver turned on for this elder.
  - **One tracked item:** the tile goes straight to it, e.g. "Sugar".
  - **Several:** the tile opens a picker of big picture buttons, e.g. sugar 🩸, BP 💓, "Paa ko" 🦶.
  - **Order:** the items due now, by their log reminders, come first.
- **Documents:** Phase 2.
- **SOS:** Phase 3.

A tile is hidden until its phase ships.

### 3.3 Dose alarm
1. A full-screen alarm shows over the lock screen with sound and vibration.
2. The voice clip plays: the family recording if there is one, otherwise TTS of the med name and dose. It repeats until someone acts.
3. Meds due in the same slot are grouped. Each med shows:
   - its photo;
   - a plain-language amount ("1 tableta", "½ tableta", "10 units", "ipahid sa paa" for "apply to the feet");
   - its **purpose** in plain words ("para sa altapresyon", "para sa sugar", "para sa pamamaga ng paa"), so the elder knows what each pill is for.
4. Buttons:
   - **"Nainom ko na"** (huge, green) marks every med in the group taken. Tapping a pill photo first unchecks it, for partial doses.
   - **"Mamaya"** snoozes 10 minutes.
   - **"Hindi ko iinumin"** skips the dose and alerts the caregiver immediately.
5. Taking a dose lowers that med's stock.
6. If nobody acts, the alarm rings again at +10 and +20 minutes (the defaults). At +30 the dose is marked **unconfirmed** and the server alerts the caregiver (§6.3).

### 3.4 Insulin
- **Fixed dose:** the alarm shows "Insulin — N units" and the pen photo. Confirming lowers the pen or vial units and the needle count.
- **Sliding scale:**
  1. The alarm first asks for a sugar reading, or uses one logged in the last 30 minutes.
  2. It shows *"Ayon sa chart ng doktor mo: 185 → 6 units"* with the matching chart row highlighted.
  3. The elder confirms the units, or adjusts them if their doctor told them otherwise. The actual units are recorded.
- **Safety rule: the app never calculates, suggests or changes a dose.** It only looks up the chart the caregiver entered.

### 3.5 Logging vitals and symptoms
1. **Voice:** the elder taps the mic and says the value in English, Tagalog or Taglish.
   - Single values: "one eighty-five", "isang daan walumpu't lima", "185".
   - Paired values for blood pressure: "one thirty over eighty", "130 over 80", "isang daan tatlumpu over walumpu".
2. **Read-back:** the app answers *"185 — tama ba?"* with big ✓ and ✗ buttons. After two ✗ in a row it offers the keypad.
3. **Keypad:** always available as an alternative.
4. **Context:** each vital type defines its own context options, e.g. before or after a meal for sugar, resting for BP. The context is guessed from the time of day and can be changed.
5. **Plain-language result:** shown and spoken, e.g. "Normal" or "Medyo mataas".
6. **Danger cards:** any vital can carry danger levels with a big, spoken instruction card, and the caregiver is alerted. The condition library supplies defaults, and the caregiver can edit them. Examples:
   - Sugar below 70 mg/dL: "Kumain ng matamis (15g) at tumawag".
   - BP at or above 180/120: "Magpahinga ng 5 minuto at sukatin ulit — kung mataas pa rin, tumawag".
7. **Symptom check-ins:** for conditions measured by how the elder feels, such as foot pain or swelling, joint pain, dizziness or breathlessness.
   - The prompt is plain and spoken, e.g. *"Kumusta ang paa mo ngayon?"*
   - The elder answers with a **5-face scale** (😀 → 😣), no numbers to read.
   - An optional photo can be added, e.g. of the swelling, to compare over time.
   - The caregiver sets an alert when the answer is "worse" N days in a row.
8. **Meter-photo OCR** (Phase 3, optional): the elder photographs the glucometer or BP monitor screen, the app reads the numbers, and the same read-back confirms them. This reuses Alaga's Tesseract approach.

### 3.6 Alarm reliability setup (Oppo / ColorOS, Redmi / HyperOS-MIUI)
The caregiver runs a one-time checklist on each elder's phone. Each step has a button that deep-links to the right settings page, plus a brand-specific screenshot.
1. Notifications, exact alarms (`SCHEDULE_EXACT_ALARM`) and full-screen intents allowed.
2. Autostart on, battery set to "No restrictions", and the app locked in the recent-apps screen.
3. **Test alarm:** it rings 2 minutes later with the screen locked, and the phone reports to the caregiver whether it rang.

The app re-checks these permissions weekly and alerts the caregiver if a system update turned one off.

## 4. Caregiver mode

### 4.1 Dashboard
One card per elder showing:
- Today's dose timeline (✓ taken, ✗ missed or skipped, ? unconfirmed, ⏳ upcoming).
- The latest value of each **pinned** vital or symptom (the caregiver picks up to three, e.g. sugar, BP, foot pain), each with a 7-day sparkline.
- Stock warnings.
- The next checkup.

The detail view adds charts for each vital and the adherence rate ("94% this month").

### 4.2 Medication setup
- **Basics:**
  - Name, photo (camera), strength, dose amount and unit, with/without food.
  - **Purpose** in plain words, optionally linked to one of the elder's conditions.
  - **Form:** tablet, capsule, insulin pen, insulin vial, liquid, eye or ear drops, inhaler, cream or ointment, patch, injection (non-insulin), or other.
  - For creams and patches, **where to apply** ("sa paa", "sa tuhod").
- **As-needed limits** (e.g. pain relievers): the minimum gap between doses and the maximum per day, both copied from the label or prescription. The elder's log button refuses another dose before the gap is over, with a spoken explanation. The same rule as Alaga's medicine spacing; the app never invents limits.
- **Schedule:**
  - Fixed times on every day, on specific weekdays, or every N days.
  - Optional start and end dates.
  - Or **as needed**: no alarm, just a log button for the elder.
- **Stock:** current count, package size, and the low-stock alert level (default 7 days of supply left, computed from the schedule).
- **Insulin:**
  - Mode is fixed or sliding scale.
  - Pen or vial capacity in units.
  - Needles tracked as their own stock item.
  - **Sliding-scale chart editor:** rows of "from–to mg/dL → units". An insulin can have one or more charts, each tied to a reading context (any, before meal, bedtime). The lookup uses the chart that matches the reading's context. A chart with gaps or overlapping rows can't be saved. It also can't be saved until the caregiver ticks *"I copied this from the doctor's written instructions"*.
- **Voice clip:** record one per time slot or per medicine. Without one, the app uses TTS.

### 4.3 Vitals and symptoms setup (per elder)
- **Nothing is on by default.** What's tracked comes from the elder's conditions (§4.7) plus anything the caregiver adds.
- **Built-in vitals:**
  - Blood sugar: mg/dL (default) or mmol/L.
  - Blood pressure, with pulse.
  - Weight, heart rate, temperature, SpO₂.
- **Built-in symptoms** (5-face scale, optional photo): pain (at a chosen body part), swelling, dizziness, breathlessness, sleep quality, mood.
- **Custom:** any number or face-scale item with its own name, unit and range.
- **Per item:**
  - Low and high alert levels, plus optional danger levels with an instruction card (§3.5).
  - Optional log reminders, e.g. BP every morning, sugar before breakfast, "check your feet" in the evening.

### 4.4 Alert settings (per elder)
- **Re-ring interval and unconfirmed cutoff:** default +10 / +20 / +30 minutes.
- **Which alerts push to which caregivers:** unconfirmed dose, skipped dose, low or high vital, low stock, alarm settings broken.

### 4.5 Phase 2 screens
- **Checkups:** doctor, clinic, date and time, repeat rule, and prep notes. Prep notes can set their own reminder, e.g. "fasting 8 hours" triggers a reminder at 10 PM the night before. The elder also gets the checkup alarm.
- **Vault:** photos of prescriptions, lab results and other documents, each tagged with type, date and doctor. Viewable offline on the elder's phone (Documents tile, which reads each item's title aloud).
- **Refill list:** built automatically from low stock. Each med shows its usual pharmacy, last price, a reminder to bring the senior/PWD booklet, and a warning when the linked prescription has expired. Logging a purchase raises the stock count.

### 4.6 Phase 3 screens
- **Emergency card:** conditions, meds, allergies, blood type and emergency contacts. Shown as an optional persistent lock-screen notification, and the app guides the caregiver to also fill in Android's built-in Emergency Information. Phone-call SOS buttons on the elder's home screen.
- **Doctor-visit summary:** for a chosen period, the current meds, adherence, vital readings with charts, and missed doses. Exported as a PDF or shared.
- **Meter-photo OCR** (§3.5).
- **Play Store listing.**

### 4.7 Conditions library
- The caregiver adds the elder's conditions from a list of common senior conditions, or types a custom one.
- **Common conditions in the list:** hypertension, type 2 diabetes, high cholesterol, arthritis / gout / joint or foot inflammation, heart disease, after stroke, chronic kidney disease, asthma / COPD, thyroid disorders, osteoporosis, and memory problems / dementia.
- **Picking a condition offers suggestions,** each one ticked or unticked by the caregiver. Nothing is applied silently.
  - **Vitals and symptoms to track:** e.g. hypertension suggests BP every morning; foot inflammation suggests "Paa ko" pain and swelling check-ins with photos.
  - **Default alert and danger levels**, taken from mainstream guidance (DOH, AHA, ADA, NHS) and labelled as general information.
  - **Routine checkups and labs to schedule** (Phase 2): e.g. HbA1c every 3 months for diabetes, lipid panel yearly for cholesterol, kidney function for CKD, eye and foot exams for diabetes.
  - **A purpose label to link medicines to.**
- **Where it lives:** the library is a static data file (`conditions.js`, like Alaga's `guide.js`), so new conditions need no code.
- **Display:** conditions also feed the emergency card and the doctor-visit summary.

### 4.8 Change log
Every edit records who made it, when, and what changed, e.g. "Ate changed Mama's Losartan to 2× a day". Visible to caregivers.

## 5. Data model

All records are stored and synced encrypted. Units are canonical: mg/dL, kg, °C, mmHg, epoch ms, Asia/Manila by default (zone stored per circle).

| Record | Key fields |
|---|---|
| Circle | id, members[], key version, settings |
| Member | id, role (elder / caregiver), name, device ids, FCM tokens |
| Condition | id, elderId, libraryKey or custom name, since, notes |
| ElderProfile | memberId, photo, allergies, blood type, contacts[], doctors[], thresholds, alert settings |
| Medication | id, elderId, name, purpose, conditionId, form, applyTo, strength, dose {amount, unit}, food rule, prn {minGapMin, maxPerDay}, photoId, voiceId, stock {count, packSize, lowDays}, insulin {mode, unitsPerPen, needleStockId, chart[]}, prescriptionDocId, pharmacyId, active |
| Schedule | id, medicationId, rule (times[], weekdays[], everyNDays, start, end, prn) |
| DoseEvent | id, elderId, medicationId, slotKey, dueAt, status (taken / skipped / unconfirmed / snoozed), actedAt, units, by |
| VitalType | id, elderId, kind (number / pair / face-scale), name, unit, bodyPart, low, high, danger[] {level, cardText}, contexts[], logReminders[], pinned, conditionId |
| Reading | id, elderId, vitalTypeId, value (number, {sys, dia, pulse} or 1–5 face), context, photoId, at, source (voice / keypad / tap / ocr) |
| Checkup *(P2)* | id, elderId, doctor, clinic, at, repeat, prep[] |
| Document *(P2)* | id, elderId, type, date, doctor, fileIds[], expiresAt |
| Pharmacy, Purchase *(P2)* | pharmacy name and branch; purchase {medicationId, qty, price, discount, at} |
| ChangeLog | id, recordId, by, at, summary |

## 6. Architecture

### 6.1 Client
- A new folder `kalinga/` in the Digital-Games repo, following `CLAUDE.md`: plain HTML, CSS and ES5 vanilla JS, no framework and no runtime npm dependencies.
- **Pure-logic modules** are dual-export (Node and browser) and have no DOM access:
  - `schedule.js`: next due times, slot grouping, every-N-days logic, end dates.
  - `stock.js`: decrements, days-left, low-stock check.
  - `scale.js`: sliding-scale validation and lookup.
  - `vitals.js`: thresholds, danger levels, plain-language verdicts, context guess, "worse N days in a row".
  - `conditions.js`: the static conditions library and its suggestions.
  - `speechnum.js`: parsing English, Tagalog and Taglish numbers, including BP pairs ("X over Y").
  - `store.js`: state, normalisation and the change log.
- **Shared with Alaga:** the sync client, photo storage (`files.js`, IndexedDB) and OCR helpers are reused. They are copied first; any extraction into a shared module is a separate, later change.
- **Platform layer** `native.js` (feature-detected, with a web fallback):
  - **A custom Capacitor Android plugin** `KalingaAlarm`:
    - Schedules alarms with `AlarmManager.setAlarmClock`.
    - On fire, a foreground service plays the voice clip and opens a full-screen activity over the lock screen.
    - Reschedules after reboot (`BOOT_COMPLETED`).
    - Reports the permission and autostart status for the setup checklist.
  - FCM registration and data-message handling.
  - TTS, speech recognition and the camera.
- **Hosting:** a PWA build on Cloudflare Pages (`kalinga.pages.dev`), plus the Capacitor Android app (`com.kalinga.app` or similar; final ID decided at Play listing time). `kalinga/` is added to `_config.yml` `exclude` so GitHub Pages never publishes it.

### 6.2 Sync (reuses Alaga's protocol and its 2026-10-07 lessons)
- Records are encrypted on the device with the circle key (AES-GCM) before upload. The Worker and D1 store only ciphertext plus id, record type and updatedAt.
- **Deletes are explicit tombstones.** Nothing is ever inferred from a missing record.
- The server keeps 30 days of record history.
- One active copy of the app per device (generation guard).
- **Files** (photos, voice clips, documents) are encrypted on the device and stored in Cloudflare R2 under random IDs. Devices cache them locally, so they work offline.
- **Removing a device** switches the circle to a new key. The remaining devices re-encrypt and re-upload.
- **Server:** a new Cloudflare Worker (`kalinga-sync`) with its own D1 database and R2 bucket, on the same Cloudflare account as Alaga.

### 6.3 Alerts
- Each device registers its FCM token with the Worker.
- **Unconfirmed doses:**
  - The elder's device uploads **deadlines** only: circleId, elderId, slotId, dueAt + cutoff. No med names or doses leave the phone in readable form.
  - Confirming a dose clears its deadline.
  - A Worker **Cron Trigger runs every minute**, finds expired deadlines and sends an FCM data message (elderId and alert type) to that circle's caregivers.
  - The caregiver's app looks up the elder's name and the dose details locally and shows "Walang kumpirmasyon: Papa, 8:00 meds".
  - This also covers a dead or offline elder phone.
- **Event alerts** (skipped dose, low or high vital, low stock, broken alarm settings): the elder's device sends an encrypted payload through the Worker to the caregivers, and the caregiver's app decrypts it and shows the notification.
- **Late confirmation:** a confirmation that arrives after an "unconfirmed" alert triggers a follow-up: "Update: taken 8:12 (phone was offline)".
- **Metadata the server can see:** circle and elder IDs, device tokens, deadline times and alert type. It never sees names, meds or values.

### 6.4 Failure handling

| Case | Behaviour |
|---|---|
| Elder phone offline | Alarms still ring (they're local), and actions are queued and synced later. The caregiver is told "unconfirmed", not "missed", followed by an update. |
| Elder phone dead or off | The server deadline fires and the caregiver is alerted. |
| OEM kills the alarm, or a permission is revoked | The weekly self-check alerts the caregiver, and the setup checklist re-runs. |
| Voice misheard | The read-back catches it. After two ✗ the keypad is offered. Nothing is saved unconfirmed. |
| Sliding-scale reading outside the chart | The app shows "Wala sa chart — tawagan ang doktor/pamilya" ("not in the chart — call the doctor or family"), suggests no units, and alerts the caregiver. |
| Storage full or blocked | The Alaga-style persistent "Not saved" banner. |
| Lost or stolen device | A caregiver removes it, and the circle switches to a new key. |

### 6.5 Medical safety and privacy
- An "aid, not medical advice" notice is shown at setup and on the privacy page.
- The app never suggests or changes doses (the same rule as Alaga). The sliding scale is a lookup only, behind the caregiver's confirmation.
- No ads and no third-party analytics. An optional anonymous daily ping, opt-out, the same as Alaga, never sent from tests.

## 7. Phasing

| Phase | Scope | Exit criterion |
|---|---|---|
| **1 – Daily care** | Care circle and pairing, elder and caregiver modes, conditions library (track and alert suggestions; checkup suggestions come in Phase 2), meds (all forms, insulin modes, as-needed limits), alarms with voice and purpose labels, stock, configurable vitals and symptom check-ins with voice read-back and danger cards, dashboard and history, push alerts (deadline cron and event alerts), alarm-reliability setup and weekly check, change log, PWA + Android APK | Parents use it for 1 week **alongside** their current routine with zero missed alarms on both phones |
| **2 – Records** | Checkups and prep reminders, document vault, refill list with pharmacy, price, discount and prescription expiry, purchases | Parents' current prescriptions and the latest lab results are in the vault |
| **3 – Safety and visits** | Emergency card and SOS, doctor-visit summary PDF, meter-photo OCR, Play Store listing | Public listing live |

Each phase gets its own implementation plan.

## 8. Testing

- **Unit tests** (plain Node scripts, as in Alaga):
  - Schedule engine: weekdays, every N days, end dates, slot grouping, Asia/Manila.
  - Sliding scale: boundaries, gaps and overlaps refused, out-of-range values.
  - `speechnum`: the EN, TL and Taglish number corpus, BP pairs, plus rejection of non-numbers.
  - Conditions library: every entry's suggestions are valid vital types and levels.
  - As-needed gap and max-per-day enforcement.
  - Stock and days-left, vitals thresholds, danger levels and verdicts, the face-scale "worse N days" rule, alert decisions, normalisation, the change log.
  - Sync merge, tombstones, the generation guard, crypto round-trip, key switching.
- **Worker tests:** deadline cron, alert fan-out, late-confirmation follow-up. FCM is stubbed and tests **never** call the live server.
- **Browser smoke test** (Playwright): elder flow (alarm → taken → stock drops; voice → read-back → saved) and caregiver flow (set up an insulin sliding scale → lookup shown on the alarm). No horizontal scroll at 320px, and the layout survives 2× text.
- **Real-device matrix** (no emulator on the dev machine), on the Oppo and the Redmi:
  - Alarm while locked, after a reboot, after 24 hours idle, with battery saver on, and after the app is swiped away.
  - Maximum system font, a deadline alert while the phone is in airplane mode, and the TTS fallback.

## 9. Cost

- **Family scale:** ₱0. Cloudflare Workers, D1, R2 and Cron fit the free plan, FCM is free, and the APK is sideloaded.
- **Public:**
  - Google Play account $25 one-time (shared with Alaga).
  - Workers Paid $5/mo once traffic passes roughly 100k requests a day (about 1.5–2k daily users across both apps).
  - R2 at about $0.015 per GB-month beyond 10 GB.
  - Recheck current Cloudflare and Firebase limits before the public launch.

## 10. Out of scope (for now)

- An iPhone app (needs a Mac and $99/yr). The PWA works on iPhone for caregivers, but with weaker alarms.
- Dose calculation of any kind.
- Integrations with pharmacies, labs or glucometers (Bluetooth).
- Regional languages (Bisaya, Ilocano), doctor or clinic accounts, and telemedicine.

## 11. Open items

- **App name:** "Kalinga" is the working name. Check Play Store and domain availability before the listing.
- **Android application ID:** decided at Phase 3.
- **Sliding-scale charts:** check the multi-chart model (§4.2) against the parents' actual doctor charts during Phase 1.
