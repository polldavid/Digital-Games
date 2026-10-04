# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One design language on every OS. The web app is the base; it will be wrapped for the Google Play Store and the Apple App Store (Trusted Web Activity / Capacitor) and gain native capabilities — reliable local notifications with the app closed, haptics, and a widget or Live Activity for running timers — without adopting per-OS iOS or Material conventions.

## Users

Parents and caregivers of a baby in the first year, worldwide. The defining situation is a sleep-deprived parent holding the baby with one arm, using the phone with one thumb, often in the dark at 3 a.m., needing to log or check something in seconds. Secondary users, all served by the same app: a partner or sitter who needs a quick handover (24-hour summary, emergency card), and the pediatrician who receives the doctor summary or CSV export.

Their jobs: record feeds, diapers, sleep, pumping, medicine, temperature and growth; get reminded when the next thing is due; and get a straight answer to "is this normal?" when worried.

## Product Purpose

An all-in-one baby tracker for the first year: logging, timers, reminders, health records (prescriptions, visits, vaccines, documents), trends, and answers to the questions new parents search most. Success is a parent who logs reliably without effort, misses fewer feeds and doses, worries less because they can see the pattern, and can hand the pediatrician accurate data.

## Positioning

- **Answers from the baby's own log.** "Why is my baby crying?", "Is my baby eating enough?" and similar questions are answered against what was actually logged (time since last feed vs age interval, diaper counts by day of life, awake time vs wake window), not only with generic advice.
- **Private by design.** No account, no analytics, no ads; data stays on the device and works fully offline. Prescription OCR runs on the phone; the photo never leaves it.
- **Reminders that respect a sleeping baby.** Feed, diaper, tummy-time and vitamin D reminders hold while the sleep timer runs; no sound while the baby sleeps; quiet hours vibrate only.

## Operating Context

- One-handed, low-light, interrupted use; sessions are seconds long and often abandoned mid-way when the baby needs attention.
- Timers (breast, sleep, pump, tummy time) run for minutes to hours across a locked phone and app restarts.
- Multiple babies (twins, siblings) share one device; some entries are logged for more than one baby at once.
- Handover to partners and sitters is manual today: text summary, JSON backup/merge between phones.
- Pediatrician visits: the doctor summary, CSV export, questions-to-ask list, and photos of prescriptions, lab results and vaccine cards.

## Capabilities and Constraints

- Plain HTML/CSS/ES5 JavaScript, no build step, no framework, no runtime dependencies; served from GitHub Pages as a PWA. Must stay wrappable without a rewrite.
- Storage: `localStorage` for state, IndexedDB for photos. Units stored canonically (ml, °C, kg, cm, epoch ms) and converted for display.
- Only runtime network fetch: Tesseract.js from jsDelivr on the first prescription scan.
- Health guidance follows AAP, CDC, WHO, NHS, DOH and PIDSP material and is presented as general information with a "call your pediatrician" disclaimer.
- Vaccine schedules today: Philippines (DOH NIP + PPS/PIDSP) and US (CDC). The audience is global, so other countries' schedules are a known gap.
- Interface language: English only today. Localization is not yet decided.
- Web reminders are unreliable when the app is fully closed; native local notifications in the wrapped apps are the planned fix.
- **Business model: freemium.** The core tracker is free. Which features are paid is undecided; partner sync is the leading candidate and would need a backend and accounts, which must stay opt-in (see Product Principles).
- **Open:** whether "Baby Log" is the final store name.

## Brand Commitments

- Voice (inferred from the existing copy, not yet confirmed by the owner): plain, calm and direct, written for a tired parent; reassuring without being cute; urgent only when something is urgent ("Call your pediatrician"). Health copy cites its sources and never dramatizes.

## Evidence on Hand

- No users, reviews, testimonials, download counts, store listings or press exist yet. Do not fabricate any.
- Guidance sources are real and named in the code (`js/guide.js`): AAP, CDC, WHO, NHS, DOH, PIDSP.
- App icons: `icons/` (SVG, 192/512 PNG, maskable 512).

## Product Principles

1. **One thumb, three seconds.** The most common actions (start or stop a timer, log a feed or diaper) must be reachable and finishable with one hand, in the dark, in a few seconds. Save stays pinned at the bottom; tap targets are at least 44 px.
2. **The data stays with the parent.** No account is required, nothing leaves the device by default, and any sync or cloud feature is explicitly opt-in, including paid ones.
3. **Inform, never prescribe.** The app never suggests a medicine dose and never saves a scanned prescription without the parent confirming each line. Guidance is general information with a clear route to a pediatrician.
4. **Calm by default, loud only when it matters.** Respect sleep and night hours. Reserve alarm-level emphasis for genuinely urgent signals (newborn fever, dehydration signs, missed doses).
5. **Answer with their baby, not a textbook.** Prefer answers drawn from the parent's own log over generic tables.

## Accessibility & Inclusion

- Text meets WCAG AA contrast in both light and dark themes; dark mode must be fully usable at 3 a.m. without glare.
- Tap targets of at least 44 px; no horizontal scroll at 320 px width.
- Inferred from the operating context, not yet confirmed:
- Users are often exhausted, anxious and distracted: low cognitive load, forgiving inputs (edit and undo), and no destructive action without confirmation.
- Global audience: both metric and imperial units, and inclusive wording for any caregiver, not only "mom".
