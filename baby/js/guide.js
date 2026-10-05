/* =========================================================
   Baby Log — guide.js
   The "knowledge" layer: age-based expectations, thresholds
   and the answers to the questions parents search most.
   Pure data + pure functions (no DOM), so it can be tested
   in Node and reused by the UI.

   Sources the numbers follow (general guidance, not medical
   advice): AAP / HealthyChildren.org, CDC "Learn the Signs.
   Act Early." milestones (2022 revision), NHS, WHO, and the
   National Sleep Foundation. Every screen that uses them
   tells parents to call their pediatrician when in doubt.
   ========================================================= */
(function (root) {
  'use strict';

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  /* ---------- Age helpers ---------- */

  // Age in whole days from an ISO birth date (yyyy-mm-dd) to `now`.
  function ageInDays(birth, now) {
    if (!birth) return null;
    var p = String(birth).split('-');
    var b = new Date(+p[0], +p[1] - 1, +p[2]);
    var n = new Date(now || Date.now());
    var today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.max(0, Math.round((today - b) / DAY));
  }

  function ageInMonths(days) { return days / 30.4375; }

  // "Day 3", "2 weeks, 4 days", "3 months, 1 week", "1 year, 2 months"
  function ageLabel(days) {
    if (days == null) return '';
    if (days < 14) return days === 0 ? 'Born today' : days === 1 ? '1 day old' : days + ' days old';
    var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
    if (days < 84) {
      var w = Math.floor(days / 7), d = days % 7;
      return plural(w, 'week') + (d ? ', ' + plural(d, 'day') : '');
    }
    var m = Math.floor(ageInMonths(days));
    if (m < 24) {
      var rest = Math.floor((days - m * 30.4375) / 7);
      return plural(m, 'month') + (rest ? ', ' + plural(rest, 'week') : '');
    }
    var y = Math.floor(m / 12), mm = m % 12;
    return plural(y, 'year') + (mm ? ', ' + plural(mm, 'month') : '');
  }

  // Pick the first band whose `upTo` (days, exclusive) is above the age.
  function band(table, days) {
    for (var i = 0; i < table.length; i++) if (days < table[i].upTo) return table[i];
    return table[table.length - 1];
  }

  /* ---------- Feeding ----------
     Breastfed newborns feed 8–12 times in 24h (every ~2–3h);
     formula-fed babies a little less often with more per feed.
     Bottle volumes are typical ranges, not targets. */
  var FEEDING = [
    { upTo: 7,   label: 'First week',  breast: [8, 12], formula: [8, 12], intervalH: 2.5, ml: [30, 60],   note: 'Tiny tummy — little and often. Expect cluster feeding.' },
    { upTo: 30,  label: '1–4 weeks',   breast: [8, 12], formula: [6, 8],  intervalH: 2.5, ml: [60, 90],   note: 'Feed on demand; wake to feed if it has been 4 hours (until back to birth weight).' },
    { upTo: 61,  label: '1–2 months',  breast: [7, 9],  formula: [6, 8],  intervalH: 3,   ml: [90, 120],  note: 'Growth spurts around 3 and 6 weeks often mean extra feeds for a few days.' },
    { upTo: 122, label: '2–4 months',  breast: [6, 8],  formula: [5, 7],  intervalH: 3.5, ml: [120, 180], note: 'Feeds get faster and more efficient — shorter feeds are normal.' },
    { upTo: 183, label: '4–6 months',  breast: [5, 7],  formula: [4, 6],  intervalH: 4,   ml: [120, 210], note: 'Watch for readiness for solids around 6 months: sitting with support, good head control, interest in food.' },
    { upTo: 274, label: '6–9 months',  breast: [4, 6],  formula: [3, 5],  intervalH: 4,   ml: [180, 240], note: 'Milk is still the main food; solids are for practice. Offer water sips with meals.' },
    { upTo: 366, label: '9–12 months', breast: [3, 5],  formula: [3, 4],  intervalH: 4.5, ml: [180, 240], note: 'Three meals a day plus milk feeds.' },
    { upTo: Infinity, label: '12 months +', breast: [2, 4], formula: [0, 3], intervalH: 5, ml: [0, 0], note: 'Whole cow’s milk can replace formula from 12 months (about 16–24 oz / 480–720 ml a day).' }
  ];

  function feedingFor(days, feedingType) {
    var b = band(FEEDING, days);
    var range = feedingType === 'formula' ? b.formula : b.breast;
    // Mixed feeders sit between the two.
    if (feedingType === 'mixed') range = [Math.min(b.breast[0], b.formula[0]), b.breast[1]];
    var interval = b.intervalH + (feedingType === 'formula' && days >= 7 ? 0.5 : 0);
    return { label: b.label, perDay: range, intervalH: interval, ml: b.ml, note: b.note };
  }

  /* ---------- Diapers: "is my baby getting enough?" ----------
     The classic day-of-life rule: wet diapers ≈ day number up
     to day 5, then 6+ a day. Dirty diapers: at least 3 a day
     from day 4 to ~6 weeks; after that, breastfed babies can
     go several days without pooping and still be fine. */
  function diapersFor(days) {
    var dayOfLife = days + 1;
    var wet = dayOfLife >= 5 ? 6 : Math.max(1, dayOfLife);
    var dirty, dirtyNote;
    if (dayOfLife <= 2) { dirty = 1; dirtyNote = 'Meconium — black, sticky and tar-like. Totally normal.'; }
    else if (dayOfLife <= 4) { dirty = 2; dirtyNote = 'Transitional — changing from black to green-brown.'; }
    else if (days < 42) { dirty = 3; dirtyNote = 'Mustard-yellow and seedy (breast milk) or tan and pasty (formula).'; }
    else { dirty = 0; dirtyNote = 'After 6 weeks some breastfed babies poop once a week. Soft poop is what matters, not how often.'; }
    return { wet: wet, dirty: dirty, dirtyNote: dirtyNote };
  }

  /* ---------- Sleep ----------
     Total sleep per 24h (NSF / AAP) and typical wake windows —
     how long a baby can comfortably stay awake between sleeps.
     Wake windows are rough guides; every baby is different. */
  var SLEEP = [
    { upTo: 28,  label: 'Newborn',     totalH: [14, 17], wake: [35, 60],   naps: '4–8',  note: 'Sleep comes in 2–4 hour pieces around the clock. Days and nights are mixed up — that is normal.' },
    { upTo: 84,  label: '1–3 months',  totalH: [14, 17], wake: [60, 90],   naps: '4–5',  note: 'The first longer night stretch (4–6h) often shows up now.' },
    { upTo: 122, label: '3–4 months',  totalH: [12, 16], wake: [75, 120],  naps: '3–4',  note: 'The “4-month sleep regression” is sleep maturing. A consistent bedtime routine helps.' },
    { upTo: 213, label: '4–7 months',  totalH: [12, 16], wake: [120, 180], naps: '3',    note: 'Many babies can sleep a 6–8 hour stretch at night by now.' },
    { upTo: 305, label: '7–10 months', totalH: [12, 16], wake: [150, 210], naps: '2–3',  note: 'Separation anxiety can cause night waking; keep the routine predictable.' },
    { upTo: 426, label: '10–14 months',totalH: [11, 14], wake: [180, 240], naps: '2',    note: 'Most babies drop to two naps.' },
    { upTo: Infinity, label: '14 months +', totalH: [11, 14], wake: [240, 360], naps: '1–2', note: 'The move to one nap usually happens between 14 and 18 months.' }
  ];

  function sleepFor(days) { return band(SLEEP, days); }

  /* ---------- Tummy time ----------
     Start from day one in short bursts; WHO recommends at least
     30 minutes a day spread out for babies who are not yet mobile. */
  function tummyGoalMin(days) {
    if (days < 30) return 10;
    if (days < 61) return 20;
    if (days < 213) return 30;
    return 0; // crawling babies get tummy time on their own
  }

  /* ---------- Fever ----------
     Always lean on the side of calling. Under 3 months, a rectal
     temperature of 38.0 °C / 100.4 °F or higher is an emergency. */
  function feverCheck(tempC, days) {
    if (tempC == null || isNaN(tempC)) return null;
    if (tempC < 35.5) return { level: 'urgent', title: 'Temperature is low', text: 'Below 35.5 °C / 96 °F can be a sign of illness in babies. Warm baby skin-to-skin, re-check, and call your doctor now.' };
    if (days < 91) {
      if (tempC >= 38) return { level: 'urgent', title: 'Fever in a baby under 3 months', text: 'A temperature of 38.0 °C / 100.4 °F or higher at this age needs a doctor right away — call your pediatrician now or go to the emergency department. Do not give fever medicine before speaking to a doctor.' };
    } else if (days < 183) {
      if (tempC >= 38.9) return { level: 'urgent', title: 'High fever', text: 'At 3–6 months, call your pediatrician for 38.9 °C / 102 °F or higher, or any fever with other symptoms.' };
      if (tempC >= 38) return { level: 'warn', title: 'Fever', text: 'Call your pediatrician to check in — at 3–6 months they want to hear about fevers, especially with fussiness, poor feeding, or fewer wet diapers.' };
    } else {
      if (tempC >= 40) return { level: 'urgent', title: 'Very high fever', text: '40 °C / 104 °F or higher — call your pediatrician now.' };
      if (tempC >= 38) return { level: 'warn', title: 'Fever', text: 'Watch how baby is acting more than the number. Call your doctor if the fever lasts over 24 hours (under age 2), or if baby is hard to wake, not drinking, or has fewer wet diapers.' };
    }
    if (tempC >= 37.5) return { level: 'ok', title: 'Slightly warm', text: 'Not a fever yet (fever is 38.0 °C / 100.4 °F). Remove a layer and re-check in 30 minutes.' };
    return { level: 'ok', title: 'Normal temperature', text: 'Normal is roughly 36.5–37.5 °C / 97.7–99.5 °F.' };
  }

  /* ---------- Poop colors ---------- */
  var POOP_COLORS = [
    { id: 'black',  label: 'Black',        hex: '#2b2522', level: 'info',   text: 'Normal as meconium in the first 1–3 days. After that, black poop should be checked by a doctor (it can mean digested blood). Iron supplements can also darken it.' },
    { id: 'green',  label: 'Green',        hex: '#5f7d32', level: 'ok',     text: 'Usually normal — common in formula-fed babies, during the meconium transition, or with a fast let-down.' },
    { id: 'yellow', label: 'Mustard',      hex: '#d9a822', level: 'ok',     text: 'Classic breastfed poop: mustard yellow, loose and seedy.' },
    { id: 'orange', label: 'Orange',       hex: '#d97a26', level: 'ok',     text: 'Normal — often from formula or foods.' },
    { id: 'brown',  label: 'Brown / tan',  hex: '#8a5a2b', level: 'ok',     text: 'Normal, especially for formula-fed babies and once solids start.' },
    { id: 'red',    label: 'Red streaks',  hex: '#b3261e', level: 'warn',   text: 'Can be from red foods, a small tear from constipation, or a milk-protein allergy. Call your pediatrician to rule out blood.' },
    { id: 'white',  label: 'White / grey', hex: '#d9d6cf', level: 'urgent', text: 'Chalky white, grey, or very pale poop can signal a liver problem. Call your pediatrician today.' }
  ];

  var POOP_TEXTURES = [
    { id: 'seedy',  label: 'Seedy / loose' },
    { id: 'soft',   label: 'Soft / pasty' },
    { id: 'watery', label: 'Watery',  hint: 'Lots of very watery poops can mean diarrhea — watch for fewer wet diapers (dehydration).' },
    { id: 'mucus',  label: 'Mucus',   hint: 'A little mucus is common (drool, colds). Lots of mucus, especially with blood, is worth a call.' },
    { id: 'hard',   label: 'Hard pellets', hint: 'Hard, pebble-like poop means constipation. Mention it to your pediatrician, especially before solids.' }
  ];

  function poopColor(id) {
    for (var i = 0; i < POOP_COLORS.length; i++) if (POOP_COLORS[i].id === id) return POOP_COLORS[i];
    return null;
  }

  // Black is only expected in the first few days of life.
  function poopCheck(colorId, days) {
    var c = poopColor(colorId);
    if (!c) return null;
    if (c.id === 'black') return days <= 4 ? { level: 'ok', text: 'Meconium — completely normal in the first days.' } : { level: 'warn', text: c.text };
    return { level: c.level, text: c.text };
  }

  /* ---------- Medicine presets ----------
     Only spacing rules — never doses. Dose is weight-based:
     always follow the label or your pediatrician. */
  var MEDICINES = [
    { id: 'acetaminophen', label: 'Acetaminophen (Tylenol / paracetamol)', intervalH: 4, maxPerDay: 5, minAgeDays: 0, warn: 'Under 3 months: only on a doctor’s advice. Dose by weight, not age.' },
    { id: 'ibuprofen',     label: 'Ibuprofen (Motrin / Advil / Nurofen)',  intervalH: 6, maxPerDay: 4, minAgeDays: 183, warn: 'Not for babies under 6 months unless a doctor says so.' },
    { id: 'vitd',          label: 'Vitamin D drops', intervalH: 24, maxPerDay: 1, minAgeDays: 0, warn: 'AAP: 400 IU a day for breastfed and partially breastfed babies, starting in the first days.' },
    { id: 'gas',           label: 'Gas drops (simethicone)', intervalH: 0, maxPerDay: 12, minAgeDays: 0, warn: 'Follow the label.' },
    { id: 'custom',        label: 'Other / prescription', intervalH: 0, maxPerDay: 0, minAgeDays: 0, warn: 'Use exactly as prescribed.' }
  ];

  function medicine(id) {
    for (var i = 0; i < MEDICINES.length; i++) if (MEDICINES[i].id === id) return MEDICINES[i];
    return MEDICINES[MEDICINES.length - 1];
  }

  /* ---------- Milestones (CDC 2022 — what most babies, 75%+, do by this age) ---------- */
  var MILESTONES = [
    { months: 2, items: ['Calms down when spoken to or picked up', 'Looks at your face', 'Smiles when you talk to or smile at them', 'Makes sounds other than crying', 'Holds head up during tummy time', 'Moves both arms and both legs', 'Opens hands briefly'] },
    { months: 4, items: ['Smiles on their own to get your attention', 'Chuckles (not yet a full laugh)', 'Makes cooing sounds like “oooo” and “aahh”', 'Turns head toward the sound of your voice', 'Holds head steady without support when held', 'Holds a toy when you put it in their hand', 'Brings hands to mouth', 'Pushes up onto elbows/forearms during tummy time'] },
    { months: 6, items: ['Knows familiar people', 'Laughs', 'Takes turns making sounds with you', 'Blows “raspberries”', 'Reaches to grab a toy they want', 'Rolls from tummy to back', 'Pushes up with straight arms during tummy time', 'Leans on hands to support themselves when sitting'] },
    { months: 9, items: ['Is shy, clingy or fearful around strangers', 'Smiles or laughs when you play peek-a-boo', 'Looks when you call their name', 'Makes lots of sounds like “mamamama” and “babababa”', 'Looks for objects when dropped out of sight', 'Gets to a sitting position by themselves', 'Moves things from one hand to the other', 'Sits without support'] },
    { months: 12, items: ['Plays games with you, like pat-a-cake', 'Waves “bye-bye”', 'Calls a parent “mama”, “dada” or another special name', 'Understands “no”', 'Puts something in a container', 'Pulls up to stand', 'Walks holding on to furniture', 'Picks things up between thumb and pointer finger'] },
    { months: 15, items: ['Copies other children while playing', 'Shows you an object they like', 'Tries to say one or two words besides “mama” or “dada”', 'Points to ask for something', 'Takes a few steps on their own', 'Uses fingers to feed themselves'] },
    { months: 18, items: ['Moves away from you, but looks to make sure you are close', 'Points to show you something interesting', 'Tries to say three or more words besides “mama” or “dada”', 'Follows one-step directions', 'Walks without holding on', 'Drinks from a cup without a lid', 'Tries to use a spoon'] },
    { months: 24, items: ['Notices when others are hurt or upset', 'Points to things in a book when you ask', 'Says at least two words together, like “more milk”', 'Points to at least two body parts', 'Kicks a ball', 'Runs', 'Eats with a spoon'] }
  ];

  /* ---------- Vaccination schedules ----------
     A checklist with due dates from the birth date — always confirm
     with your pediatrician, who may use different brands or timing.
     ph: Philippine DOH National Immunization Program (free at health
         centers) plus the extra vaccines the Philippine Pediatric
         Society / PIDSP recommend (usually private).
     us: CDC routine schedule (birth to 18 months).
     `at` is the recommended age in days. */
  var VACCINES = {
    ph: { label: 'Philippines (DOH + PPS/PIDSP)', items: [
      { key: 'bcg',    name: 'BCG',                         at: 0,   program: 'NIP', note: 'Tuberculosis — at birth' },
      { key: 'hepb0',  name: 'Hepatitis B (birth dose)',    at: 0,   program: 'NIP', note: 'Within 24 hours of birth' },
      { key: 'penta1', name: 'Pentavalent 1 (DTwP-HepB-Hib)', at: 42, program: 'NIP' },
      { key: 'opv1',   name: 'Oral polio (OPV) 1',          at: 42,  program: 'NIP' },
      { key: 'pcv1',   name: 'Pneumococcal (PCV) 1',        at: 42,  program: 'NIP' },
      { key: 'rota1',  name: 'Rotavirus 1',                 at: 42,  program: 'PPS' },
      { key: 'penta2', name: 'Pentavalent 2',               at: 70,  program: 'NIP' },
      { key: 'opv2',   name: 'Oral polio (OPV) 2',          at: 70,  program: 'NIP' },
      { key: 'pcv2',   name: 'Pneumococcal (PCV) 2',        at: 70,  program: 'NIP' },
      { key: 'rota2',  name: 'Rotavirus 2',                 at: 70,  program: 'PPS' },
      { key: 'penta3', name: 'Pentavalent 3',               at: 98,  program: 'NIP' },
      { key: 'opv3',   name: 'Oral polio (OPV) 3',          at: 98,  program: 'NIP' },
      { key: 'ipv1',   name: 'Inactivated polio (IPV) 1',   at: 98,  program: 'NIP' },
      { key: 'pcv3',   name: 'Pneumococcal (PCV) 3',        at: 98,  program: 'NIP' },
      { key: 'rota3',  name: 'Rotavirus 3 (RotaTeq only)',  at: 98,  program: 'PPS', note: 'Only if your baby gets the 3-dose brand' },
      { key: 'flu1',   name: 'Influenza 1',                 at: 183, program: 'PPS', note: 'From 6 months; 2 doses 4 weeks apart the first year, then yearly' },
      { key: 'flu2',   name: 'Influenza 2',                 at: 211, program: 'PPS' },
      { key: 'mmr1',   name: 'Measles (MR/MMR) 1',          at: 274, program: 'NIP' },
      { key: 'ipv2',   name: 'Inactivated polio (IPV) 2',   at: 274, program: 'NIP' },
      { key: 'je1',    name: 'Japanese encephalitis',       at: 274, program: 'PPS', note: 'From 9 months' },
      { key: 'mmr2',   name: 'Measles (MMR) 2',             at: 365, program: 'NIP' },
      { key: 'var1',   name: 'Varicella (chickenpox) 1',    at: 365, program: 'PPS' },
      { key: 'hepa1',  name: 'Hepatitis A 1',               at: 365, program: 'PPS' },
      { key: 'hepa2',  name: 'Hepatitis A 2',               at: 548, program: 'PPS', note: 'At least 6 months after the first' }
    ] },
    us: { label: 'United States (CDC)', items: [
      { key: 'hepb1',  name: 'Hepatitis B 1',               at: 0 },
      { key: 'hepb2',  name: 'Hepatitis B 2',               at: 30,  note: '1–2 months' },
      { key: 'dtap1',  name: 'DTaP 1',                      at: 61 },
      { key: 'hib1',   name: 'Hib 1',                       at: 61 },
      { key: 'ipv1',   name: 'Polio (IPV) 1',               at: 61 },
      { key: 'pcv1',   name: 'Pneumococcal (PCV) 1',        at: 61 },
      { key: 'rv1',    name: 'Rotavirus 1',                 at: 61 },
      { key: 'dtap2',  name: 'DTaP 2',                      at: 122 },
      { key: 'hib2',   name: 'Hib 2',                       at: 122 },
      { key: 'ipv2',   name: 'Polio (IPV) 2',               at: 122 },
      { key: 'pcv2',   name: 'Pneumococcal (PCV) 2',        at: 122 },
      { key: 'rv2',    name: 'Rotavirus 2',                 at: 122 },
      { key: 'dtap3',  name: 'DTaP 3',                      at: 183 },
      { key: 'pcv3',   name: 'Pneumococcal (PCV) 3',        at: 183 },
      { key: 'rv3',    name: 'Rotavirus 3 (brand-dependent)', at: 183 },
      { key: 'hepb3',  name: 'Hepatitis B 3',               at: 183, note: '6–18 months' },
      { key: 'ipv3',   name: 'Polio (IPV) 3',               at: 183, note: '6–18 months' },
      { key: 'flu1',   name: 'Influenza (yearly)',          at: 183, note: 'From 6 months; 2 doses the first season' },
      { key: 'mmr1',   name: 'MMR 1',                       at: 365, note: '12–15 months' },
      { key: 'var1',   name: 'Varicella 1',                 at: 365, note: '12–15 months' },
      { key: 'hepa1',  name: 'Hepatitis A 1',               at: 365, note: '12–23 months' },
      { key: 'hib4',   name: 'Hib booster',                 at: 365, note: '12–15 months' },
      { key: 'pcv4',   name: 'Pneumococcal (PCV) 4',        at: 365, note: '12–15 months' },
      { key: 'dtap4',  name: 'DTaP 4',                      at: 456, note: '15–18 months' },
      { key: 'hepa2',  name: 'Hepatitis A 2',               at: 548, note: '6 months after the first' }
    ] }
  };

  // Each vaccine with its due date and status ('given' | 'overdue' | 'due' (within 14 days) | 'upcoming').
  function vaccinePlan(scheduleId, birth, given, now) {
    var sch = VACCINES[scheduleId];
    if (!sch || !birth) return [];
    var p = String(birth).split('-'), b = new Date(+p[0], +p[1] - 1, +p[2]).getTime();
    now = now || Date.now();
    given = given || {};
    return sch.items.map(function (v) {
      var due = b + v.at * DAY, g = given[v.key];
      var status = g ? 'given' : due < now - DAY ? 'overdue' : due - now <= 14 * DAY ? 'due' : 'upcoming';
      return { key: v.key, name: v.name, at: v.at, due: due, program: v.program || '', note: v.note || '', given: g || null, status: status };
    });
  }

  /* ---------- "Why is my baby crying?" ----------
     Combine the log with age norms and rank the likely reasons.
     `ctx` = { days, now, lastFeed, lastFeedEnd, lastDiaper,
               awakeSinceMs (null if asleep or unknown),
               lastTemp ({tempC, time}), hour, feedingType } */
  function cryReasons(ctx) {
    var now = ctx.now || Date.now();
    var days = ctx.days || 0;
    var feed = feedingFor(days, ctx.feedingType);
    var sleep = sleepFor(days);
    var out = [];
    var ago = function (t) { return t ? (now - t) / MIN : null; };

    // Fever — always first if it applies.
    if (ctx.lastTemp && now - ctx.lastTemp.time < 6 * HOUR) {
      var f = feverCheck(ctx.lastTemp.tempC, days);
      if (f && f.level !== 'ok') out.push({ id: 'fever', score: 100, icon: '🌡️', title: f.title, why: f.text, urgent: f.level === 'urgent' });
    }

    // Hunger: how far into the usual feeding interval are we?
    var sinceFeed = ago(ctx.lastFeed);
    if (sinceFeed == null) {
      out.push({ id: 'hunger', score: 60, icon: '🍼', title: 'Hungry?', why: 'No feed logged yet. Look for hunger cues: rooting, lip smacking, hands to mouth. Crying is a late hunger sign.' });
    } else {
      var ratio = sinceFeed / (feed.intervalH * 60);
      var s = Math.round(Math.min(95, ratio * 80));
      out.push({ id: 'hunger', score: s, icon: '🍼', title: 'Hungry?', why: 'Last feed ' + fmtDur(sinceFeed) + ' ago — babies this age usually feed about every ' + fmtHours(feed.intervalH) + '.' + (ratio < 0.4 && days < 120 ? ' Short gaps can still be cluster feeding or a growth spurt.' : '') });
    }

    // Wind: crying soon after a feed.
    var sinceFeedEnd = ago(ctx.lastFeedEnd || ctx.lastFeed);
    if (sinceFeedEnd != null && sinceFeedEnd < 45) {
      out.push({ id: 'wind', score: 70 - Math.round(sinceFeedEnd), icon: '🫧', title: 'Needs a burp / gas?', why: 'Fed ' + fmtDur(sinceFeedEnd) + ' ago. Try burping upright on your shoulder, “bicycle legs”, or a gentle tummy massage.' });
    }

    // Diaper.
    var sinceDiaper = ago(ctx.lastDiaper);
    if (sinceDiaper == null) out.push({ id: 'diaper', score: 45, icon: '🧷', title: 'Wet or dirty diaper?', why: 'No change logged yet — a quick check is easy to rule out.' });
    else out.push({ id: 'diaper', score: Math.round(Math.min(85, (sinceDiaper / 180) * 60)), icon: '🧷', title: 'Wet or dirty diaper?', why: 'Last change ' + fmtDur(sinceDiaper) + ' ago.' });

    // Tiredness against the wake window.
    if (ctx.awakeSinceMs != null) {
      var awake = ctx.awakeSinceMs / MIN;
      var maxW = sleep.wake[1];
      var t = Math.round(Math.min(95, (awake / maxW) * 75));
      out.push({ id: 'tired', score: t, icon: '😴', title: awake > maxW ? 'Overtired?' : 'Tired?', why: 'Awake for ' + fmtDur(awake) + ' — a typical wake window at this age is ' + sleep.wake[0] + '–' + sleep.wake[1] + ' minutes. Look for yawns, staring off, rubbing eyes, jerky movements.' });
    }

    // Evening fussiness / colic (peaks around 6 weeks, eases by 3–4 months).
    var hour = ctx.hour != null ? ctx.hour : new Date(now).getHours();
    if (days >= 14 && days < 120 && (hour >= 17 || hour < 1)) {
      out.push({ id: 'colic', score: days >= 28 && days < 70 ? 55 : 40, icon: '🌆', title: 'Evening fussiness / colic', why: 'Evening crying peaks around 6 weeks and usually eases by 3–4 months. The 5 S’s and white noise often help.' });
    }

    // Always-possible, lower-ranked reasons.
    out.push({ id: 'temp', score: 25, icon: '🧣', title: 'Too hot or too cold?', why: 'Feel the back of the neck or chest (hands and feet are often cool). Dress baby in one more layer than you’re wearing.' });
    out.push({ id: 'stim', score: 22, icon: '🔆', title: 'Overstimulated?', why: 'Too much noise, light or handling. Move somewhere dim and quiet and try white noise.' });
    out.push({ id: 'comfort', score: 20, icon: '🤗', title: 'Wants to be held', why: 'Sometimes babies just need closeness. Skin-to-skin or a carrier can settle them fast.' });
    if (days >= 120) out.push({ id: 'teeth', score: days >= 150 ? 30 : 18, icon: '🦷', title: 'Teething?', why: 'Drooling, chewing, red cheeks. A cold (not frozen) teether or a clean finger on the gums can help.' });

    out.sort(function (a, b) { return (b.urgent ? 1000 : 0) + b.score - ((a.urgent ? 1000 : 0) + a.score); });
    return out;
  }

  // Red flags that mean "stop troubleshooting and call".
  var CRY_RED_FLAGS = [
    'Fever of 38 °C / 100.4 °F or higher in a baby under 3 months',
    'Crying that is high-pitched, weak, or moaning — or baby is unusually floppy or hard to wake',
    'Inconsolable crying for more than 2–3 hours',
    'Refusing feeds, or fewer wet diapers than usual',
    'Green or forceful (projectile) vomiting, or blood in poop',
    'Trouble breathing, bluish lips, or a bulging soft spot',
    'You feel something is wrong — trust that instinct'
  ];

  /* ---------- Sleep suggestion ----------
     Given when baby woke up, when is the next nap likely? */
  function nextNap(days, wokeAt, now) {
    if (!wokeAt) return null;
    var s = sleepFor(days);
    var from = wokeAt + s.wake[0] * MIN, to = wokeAt + s.wake[1] * MIN;
    var n = now || Date.now();
    var state = n < from ? 'early' : n <= to ? 'window' : 'over';
    return { from: from, to: to, state: state, wake: s.wake };
  }

  /* ---------- Formatting ---------- */
  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    if (h < 24) return h + 'h' + (m ? ' ' + m + 'm' : '');
    var d = Math.floor(h / 24), hh = h % 24;
    return d + 'd' + (hh ? ' ' + hh + 'h' : '');
  }

  function fmtHours(h) {
    var whole = Math.floor(h), half = h - whole >= 0.5;
    return whole + (half ? '½' : '') + ' hours';
  }

  /* ---------- Answers to the most-searched baby questions ----------
     Each one points at the tool in the app that answers it for
     *your* baby, plus a short evidence-based summary. */
  var QUESTIONS = [
    { id: 'cry',     icon: '😭', q: 'Why is my baby crying?',                 tool: 'cry' },
    { id: 'sleep',   icon: '🌙', q: 'How can I help my baby sleep better?',   tool: 'sleep' },
    { id: 'enough',  icon: '🍼', q: 'Is my baby eating enough?',              tool: 'enough' },
    { id: 'howmuch', icon: '⏱️', q: 'How often and how much should my baby eat?', tool: 'howmuch' },
    { id: 'poop',    icon: '💩', q: 'Is my baby’s poop normal?',              tool: 'poop' },
    { id: 'fever',   icon: '🌡️', q: 'Does my baby have a fever? When do I call the doctor?', tool: 'fever' },
    { id: 'miles',   icon: '⭐', q: 'When will my baby roll over, sit up, crawl and walk?', tool: 'milestones' },
    { id: 'spit',    icon: '🤧', q: 'Why does my baby spit up, get hiccups, or sound stuffy?', tool: 'spit' },
    { id: 'teeth',   icon: '🦷', q: 'Is my baby teething? How can I help?',    tool: 'teeth' }
  ];

  /* ---------- Growth percentiles (WHO Child Growth Standards, 0–24 months) ----------
     L, M, S by completed month for boys (m) and girls (f), from the WHO tables
     as published by CDC/NCHS (WHO-*-for-age-Percentiles.csv). Ages between
     months are interpolated. Same charts pediatricians use for under-2s.
     wfa = weight (kg), lfa = length (cm), hcfa = head circumference (cm). */
  var WHO_GROWTH = {
    wfa: {
      m: [[0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.197, 5.5675, 0.12385], [0.1738, 6.3762, 0.11727], [0.1553, 7.0023, 0.11316], [0.1395, 7.5105, 0.1108], [0.1257, 7.934, 0.10958], [0.1134, 8.297, 0.10902], [0.1021, 8.6151, 0.10882], [0.0917, 8.9014, 0.10881], [0.082, 9.1649, 0.10891], [0.073, 9.4122, 0.10906], [0.0644, 9.6479, 0.10925], [0.0563, 9.8749, 0.10949], [0.0487, 10.0953, 0.10976], [0.0413, 10.3108, 0.11007], [0.0343, 10.5228, 0.11041], [0.0275, 10.7319, 0.11079], [0.0211, 10.9385, 0.11119], [0.0148, 11.143, 0.11164], [0.0087, 11.3462, 0.11211], [0.0029, 11.5486, 0.11261], [-0.0028, 11.7504, 0.11314], [-0.0083, 11.9514, 0.11369], [-0.0137, 12.1515, 0.11426]],
      f: [[0.3809, 3.2322, 0.14171], [0.1714, 4.1873, 0.13724], [0.0962, 5.1282, 0.13], [0.0402, 5.8458, 0.12619], [-0.005, 6.4237, 0.12402], [-0.043, 6.8985, 0.12274], [-0.0756, 7.297, 0.12204], [-0.1039, 7.6422, 0.12178], [-0.1288, 7.9487, 0.12181], [-0.1507, 8.2254, 0.12199], [-0.17, 8.48, 0.12223], [-0.1872, 8.7192, 0.12247], [-0.2024, 8.9481, 0.12268], [-0.2158, 9.1699, 0.12283], [-0.2278, 9.387, 0.12294], [-0.2384, 9.6008, 0.12299], [-0.2478, 9.8124, 0.12303], [-0.2562, 10.0226, 0.12306], [-0.2637, 10.2315, 0.12309], [-0.2703, 10.4393, 0.12315], [-0.2762, 10.6464, 0.12323], [-0.2815, 10.8534, 0.12335], [-0.2862, 11.0608, 0.1235], [-0.2903, 11.2688, 0.12369], [-0.2941, 11.4775, 0.1239]]
    },
    lfa: {
      m: [[1, 49.8842, 0.03795], [1, 54.7244, 0.03557], [1, 58.4249, 0.03424], [1, 61.4292, 0.03328], [1, 63.886, 0.03257], [1, 65.9026, 0.03204], [1, 67.6236, 0.03165], [1, 69.1645, 0.03139], [1, 70.5994, 0.03124], [1, 71.9687, 0.03117], [1, 73.2812, 0.03118], [1, 74.5388, 0.03125], [1, 75.7488, 0.03137], [1, 76.9186, 0.03154], [1, 78.0497, 0.03174], [1, 79.1458, 0.03197], [1, 80.2113, 0.03222], [1, 81.2487, 0.0325], [1, 82.2587, 0.03279], [1, 83.2418, 0.0331], [1, 84.1996, 0.03342], [1, 85.1348, 0.03376], [1, 86.0477, 0.0341], [1, 86.941, 0.03445], [1, 87.8161, 0.03479]],
      f: [[1, 49.1477, 0.0379], [1, 53.6872, 0.0364], [1, 57.0673, 0.03568], [1, 59.8029, 0.0352], [1, 62.0899, 0.03486], [1, 64.0301, 0.03463], [1, 65.7311, 0.03448], [1, 67.2873, 0.03441], [1, 68.7498, 0.0344], [1, 70.1435, 0.03444], [1, 71.4818, 0.03452], [1, 72.771, 0.03464], [1, 74.015, 0.03479], [1, 75.2176, 0.03496], [1, 76.3817, 0.03514], [1, 77.5099, 0.03534], [1, 78.6055, 0.03555], [1, 79.671, 0.03576], [1, 80.7079, 0.03598], [1, 81.7182, 0.0362], [1, 82.7036, 0.03643], [1, 83.6654, 0.03666], [1, 84.604, 0.03688], [1, 85.5202, 0.03711], [1, 86.4153, 0.03734]]
    },
    hcfa: {
      m: [[1, 34.4618, 0.03686], [1, 37.2759, 0.03133], [1, 39.1285, 0.02997], [1, 40.5135, 0.02918], [1, 41.6317, 0.02868], [1, 42.5576, 0.02837], [1, 43.3306, 0.02817], [1, 43.9803, 0.02804], [1, 44.53, 0.02796], [1, 44.9998, 0.02792], [1, 45.4051, 0.0279], [1, 45.7573, 0.02789], [1, 46.0661, 0.02789], [1, 46.3395, 0.02789], [1, 46.5844, 0.02791], [1, 46.806, 0.02792], [1, 47.0088, 0.02795], [1, 47.1962, 0.02797], [1, 47.3711, 0.028], [1, 47.5357, 0.02803], [1, 47.6919, 0.02806], [1, 47.8408, 0.0281], [1, 47.9833, 0.02813], [1, 48.1201, 0.02817], [1, 48.2515, 0.02821]],
      f: [[1, 33.8787, 0.03496], [1, 36.5463, 0.0321], [1, 38.2521, 0.03168], [1, 39.5328, 0.0314], [1, 40.5817, 0.03119], [1, 41.459, 0.03102], [1, 42.1995, 0.03087], [1, 42.829, 0.03075], [1, 43.3671, 0.03063], [1, 43.83, 0.03053], [1, 44.2319, 0.03044], [1, 44.5844, 0.03035], [1, 44.8965, 0.03027], [1, 45.1752, 0.03019], [1, 45.4265, 0.03012], [1, 45.6551, 0.03006], [1, 45.865, 0.02999], [1, 46.0598, 0.02993], [1, 46.2424, 0.02987], [1, 46.4152, 0.02982], [1, 46.5801, 0.02977], [1, 46.7384, 0.02972], [1, 46.8913, 0.02967], [1, 47.0391, 0.02962], [1, 47.1822, 0.02957]]
    }
  };
  var MONTH_DAYS = 365.25 / 12;

  function growthLMS(kind, sex, days) {
    var t = WHO_GROWTH[kind] && WHO_GROWTH[kind][sex];
    if (!t || days == null || days < 0) return null;
    var m = days / MONTH_DAYS;
    if (m > 24) return null;
    var i = Math.min(23, Math.floor(m)), f = m - i, a = t[i], b = t[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  function lmsValue(lms, z) { return lms[0] ? lms[1] * Math.pow(1 + lms[0] * lms[2] * z, 1 / lms[0]) : lms[1] * Math.exp(lms[2] * z); }
  // z-score, with WHO's restricted extrapolation beyond ±3 SD for skewed (weight) charts.
  function growthZ(kind, sex, days, x) {
    var lms = growthLMS(kind, sex, days);
    if (!lms || !(x > 0)) return null;
    var L = lms[0], M = lms[1], S = lms[2];
    var z = L ? (Math.pow(x / M, L) - 1) / (L * S) : Math.log(x / M) / S;
    if (kind === 'wfa' && z > 3) { var p3 = lmsValue(lms, 3); z = 3 + (x - p3) / (p3 - lmsValue(lms, 2)); }
    if (kind === 'wfa' && z < -3) { var n3 = lmsValue(lms, -3); z = -3 + (x - n3) / (lmsValue(lms, -2) - n3); }
    return z;
  }
  function normalCdf(z) {
    var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function ordinal(n) { var v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  // { z, pct, label: '48th', level: 'ok' | 'check' } or null (no sex, too old, no value).
  function growthPercentile(kind, sex, days, x) {
    var z = growthZ(kind, sex, days, x);
    if (z == null) return null;
    var pct = normalCdf(z) * 100;
    var label = pct < 1 ? 'below 1st' : pct > 99 ? 'above 99th' : ordinal(Math.round(pct));
    return { z: z, pct: pct, label: label, level: pct < 3 || pct > 97 ? 'check' : 'ok' };
  }
  // The measurement at a given percentile, for drawing the reference curves.
  function growthAt(kind, sex, days, pct) {
    var lms = growthLMS(kind, sex, days);
    if (!lms) return null;
    // Invert the normal CDF by bisection — only a handful of curves are drawn.
    var lo = -5, hi = 5, p = pct / 100;
    for (var i = 0; i < 40; i++) { var mid = (lo + hi) / 2; if (normalCdf(mid) < p) lo = mid; else hi = mid; }
    return lmsValue(lms, (lo + hi) / 2);
  }
  // The main lines on a growth chart. Crossing two of them is worth a word with the pediatrician.
  var GROWTH_LINES = [2, 10, 25, 50, 75, 90, 98];
  function linesCrossed(p1, p2) {
    var lo = Math.min(p1, p2), hi = Math.max(p1, p2);
    return GROWTH_LINES.filter(function (l) { return l > lo && l < hi; }).length;
  }

  var api = {
    MIN: MIN, HOUR: HOUR, DAY: DAY,
    ageInDays: ageInDays, ageInMonths: ageInMonths, ageLabel: ageLabel,
    FEEDING: FEEDING, feedingFor: feedingFor,
    diapersFor: diapersFor,
    SLEEP: SLEEP, sleepFor: sleepFor, nextNap: nextNap,
    tummyGoalMin: tummyGoalMin,
    feverCheck: feverCheck,
    POOP_COLORS: POOP_COLORS, POOP_TEXTURES: POOP_TEXTURES, poopColor: poopColor, poopCheck: poopCheck,
    MEDICINES: MEDICINES, medicine: medicine,
    MILESTONES: MILESTONES,
    cryReasons: cryReasons, CRY_RED_FLAGS: CRY_RED_FLAGS,
    QUESTIONS: QUESTIONS,
    VACCINES: VACCINES, vaccinePlan: vaccinePlan,
    WHO_GROWTH: WHO_GROWTH, growthLMS: growthLMS, growthZ: growthZ, growthPercentile: growthPercentile, growthAt: growthAt, linesCrossed: linesCrossed, normalCdf: normalCdf,
    fmtDur: fmtDur, fmtHours: fmtHours
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabyGuide = api;
})(this);
