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
      if (f && f.level !== 'ok') out.push({ id: 'fever', score: 100, icon: 'thermometer', title: f.title, why: f.text, urgent: f.level === 'urgent' });
    }

    // Hunger: how far into the usual feeding interval are we?
    var sinceFeed = ago(ctx.lastFeed);
    if (sinceFeed == null) {
      out.push({ id: 'hunger', score: 60, icon: 'bottle', title: 'Hungry?', why: 'No feed logged yet. Look for hunger cues: rooting, lip smacking, hands to mouth. Crying is a late hunger sign.' });
    } else {
      var ratio = sinceFeed / (feed.intervalH * 60);
      var s = Math.round(Math.min(95, ratio * 80));
      out.push({ id: 'hunger', score: s, icon: 'bottle', title: 'Hungry?', why: 'Last feed ' + fmtDur(sinceFeed) + ' ago — babies this age usually feed about every ' + fmtHours(feed.intervalH) + '.' + (ratio < 0.4 && days < 120 ? ' Short gaps can still be cluster feeding or a growth spurt.' : '') });
    }

    // Wind: crying soon after a feed.
    var sinceFeedEnd = ago(ctx.lastFeedEnd || ctx.lastFeed);
    if (sinceFeedEnd != null && sinceFeedEnd < 45) {
      out.push({ id: 'wind', score: 70 - Math.round(sinceFeedEnd), icon: 'baby', title: 'Needs a burp / gas?', why: 'Fed ' + fmtDur(sinceFeedEnd) + ' ago. Try burping upright on your shoulder, “bicycle legs”, or a gentle tummy massage.' });
    }

    // Diaper.
    var sinceDiaper = ago(ctx.lastDiaper);
    if (sinceDiaper == null) out.push({ id: 'diaper', score: 45, icon: 'diaper', title: 'Wet or dirty diaper?', why: 'No change logged yet — a quick check is easy to rule out.' });
    else out.push({ id: 'diaper', score: Math.round(Math.min(85, (sinceDiaper / 180) * 60)), icon: 'diaper', title: 'Wet or dirty diaper?', why: 'Last change ' + fmtDur(sinceDiaper) + ' ago.' });

    // Tiredness against the wake window.
    if (ctx.awakeSinceMs != null) {
      var awake = ctx.awakeSinceMs / MIN;
      var maxW = sleep.wake[1];
      var t = Math.round(Math.min(95, (awake / maxW) * 75));
      out.push({ id: 'tired', score: t, icon: 'moon', title: awake > maxW ? 'Overtired?' : 'Tired?', why: 'Awake for ' + fmtDur(awake) + ' — a typical wake window at this age is ' + sleep.wake[0] + '–' + sleep.wake[1] + ' minutes. Look for yawns, staring off, rubbing eyes, jerky movements.' });
    }

    // Evening fussiness / colic (peaks around 6 weeks, eases by 3–4 months).
    var hour = ctx.hour != null ? ctx.hour : new Date(now).getHours();
    if (days >= 14 && days < 120 && (hour >= 17 || hour < 1)) {
      out.push({ id: 'colic', score: days >= 28 && days < 70 ? 55 : 40, icon: 'cry', title: 'Evening fussiness / colic', why: 'Evening crying peaks around 6 weeks and usually eases by 3–4 months. The 5 S’s and white noise often help.' });
    }

    // Always-possible, lower-ranked reasons.
    out.push({ id: 'temp', score: 25, icon: 'thermometer', title: 'Too hot or too cold?', why: 'Feel the back of the neck or chest (hands and feet are often cool). Dress baby in one more layer than you’re wearing.' });
    out.push({ id: 'stim', score: 22, icon: 'sun', title: 'Overstimulated?', why: 'Too much noise, light or handling. Move somewhere dim and quiet and try white noise.' });
    out.push({ id: 'comfort', score: 20, icon: 'heart', title: 'Wants to be held', why: 'Sometimes babies just need closeness. Skin-to-skin or a carrier can settle them fast.' });
    if (days >= 120) out.push({ id: 'teeth', score: days >= 150 ? 30 : 18, icon: 'tooth', title: 'Teething?', why: 'Drooling, chewing, red cheeks. A cold (not frozen) teether or a clean finger on the gums can help.' });

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
    { id: 'cry',     icon: 'cry', q: 'Why is my baby crying?',                 tool: 'cry' },
    { id: 'sleep',   icon: 'moon', q: 'How can I help my baby sleep better?',   tool: 'sleep' },
    { id: 'enough',  icon: 'bottle', q: 'Is my baby eating enough?',              tool: 'enough' },
    { id: 'howmuch', icon: 'timer', q: 'How often and how much should my baby eat?', tool: 'howmuch' },
    { id: 'poop',    icon: 'poo', q: 'Is my baby’s poop normal?',              tool: 'poop' },
    { id: 'fever',   icon: 'thermometer', q: 'Does my baby have a fever? When do I call the doctor?', tool: 'fever' },
    { id: 'miles',   icon: 'star', q: 'When will my baby roll over, sit up, crawl and walk?', tool: 'milestones' },
    { id: 'spit',    icon: 'drop', q: 'Why does my baby spit up, get hiccups, or sound stuffy?', tool: 'spit' },
    { id: 'teeth',   icon: 'tooth', q: 'Is my baby teething? How can I help?',    tool: 'teeth' }
  ];

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
    fmtDur: fmtDur, fmtHours: fmtHours
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabyGuide = api;
})(this);
