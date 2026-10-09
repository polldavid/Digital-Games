/* =========================================================
   Alaga — guide.js
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
    { upTo: 730, label: '12–24 months', breast: [2, 4], formula: [0, 3], intervalH: 5, ml: [0, 0], note: 'Three meals and one or two snacks a day. Whole cow’s milk can replace formula from 12 months (about 16–24 oz / 480–720 ml a day).' },
    { upTo: Infinity, label: '2 years +', breast: [0, 3], formula: [0, 0], intervalH: 5, ml: [0, 0], note: 'Three meals and one or two snacks a day. About 2 cups (16–20 oz / 480–600 ml) of milk a day is plenty, and water for thirst.' }
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
     Wake windows are rough guides; every baby is different. From 3 years
     naps are optional, so there are no wake windows (wake: null). */
  var SLEEP = [
    { upTo: 28,  label: 'Newborn',     totalH: [14, 17], wake: [35, 60],   naps: '4–8',  note: 'Sleep comes in 2–4 hour pieces around the clock. Days and nights are mixed up — that is normal.' },
    { upTo: 84,  label: '1–3 months',  totalH: [14, 17], wake: [60, 90],   naps: '4–5',  note: 'The first longer night stretch (4–6h) often shows up now.' },
    { upTo: 122, label: '3–4 months',  totalH: [12, 16], wake: [75, 120],  naps: '3–4',  note: 'The “4-month sleep regression” is sleep maturing. A consistent bedtime routine helps.' },
    { upTo: 213, label: '4–7 months',  totalH: [12, 16], wake: [120, 180], naps: '3',    note: 'Many babies can sleep a 6–8 hour stretch at night by now.' },
    { upTo: 305, label: '7–10 months', totalH: [12, 16], wake: [150, 210], naps: '2–3',  note: 'Separation anxiety can cause night waking; keep the routine predictable.' },
    { upTo: 426, label: '10–14 months',totalH: [11, 14], wake: [180, 240], naps: '2',    note: 'Most babies drop to two naps.' },
    { upTo: 548, label: '14–18 months', totalH: [11, 14], wake: [240, 360], naps: '1–2', note: 'The move to one nap usually happens between 14 and 18 months.' },
    { upTo: 1096, label: '18 months–3 years', totalH: [11, 14], wake: [300, 360], naps: '1', note: 'One afternoon nap of 1–3 hours is typical. A steady bedtime routine (bath, brush teeth, book, bed) helps more than anything.' },
    { upTo: 2192, label: '3–5 years', totalH: [10, 13], wake: null, naps: '0–1', note: 'Many children drop their nap between 3 and 5. A quiet rest time still helps; aim for 10–13 hours in 24 hours, counting any nap.' },
    { upTo: Infinity, label: '6 years +', totalH: [9, 12], wake: null, naps: '0', note: 'School-age children need 9–12 hours of sleep a night.' }
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
    } else if (days < 730) {
      if (tempC >= 40) return { level: 'urgent', title: 'Very high fever', text: '40 °C / 104 °F or higher — call your pediatrician now.' };
      if (tempC >= 38) return { level: 'warn', title: 'Fever', text: 'Watch how baby is acting more than the number. Call your doctor if the fever lasts over 24 hours (under age 2), or if baby is hard to wake, not drinking, or has fewer wet diapers.' };
    } else {
      if (tempC >= 40) return { level: 'urgent', title: 'Very high fever', text: '40 °C / 104 °F or higher — call your pediatrician now.' };
      if (tempC >= 38) return { level: 'warn', title: 'Fever', text: 'Watch how your child is acting more than the number: fever itself helps fight infection. Call your doctor if it lasts more than 3 days, or if your child is hard to wake, not drinking, peeing much less, or seems very unwell.' };
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
    { months: 24, items: ['Notices when others are hurt or upset', 'Points to things in a book when you ask', 'Says at least two words together, like “more milk”', 'Points to at least two body parts', 'Kicks a ball', 'Runs', 'Eats with a spoon'] },
    { months: 30, items: ['Plays next to other children and sometimes plays with them', 'Shows you what they can do by saying “Look at me!”', 'Follows simple routines when told, like helping pick up toys', 'Says about 50 words', 'Says two or more words together, with one action word, like “Doggie run”', 'Names things in a book when you point and ask', 'Says words like “I”, “me” or “we”', 'Uses things to pretend, like feeding a block to a doll', 'Follows two-step instructions, like “Put the toy down and close the door”', 'Knows at least one colour', 'Uses hands to twist things, like doorknobs or lids', 'Takes some clothes off by themselves', 'Jumps off the ground with both feet', 'Turns book pages one at a time'] },
    { months: 36, items: ['Calms down within 10 minutes after you leave, like at a childcare drop-off', 'Notices other children and joins them to play', 'Talks with you in conversation with at least two back-and-forth exchanges', 'Asks “who”, “what”, “where” or “why” questions', 'Says what is happening in a picture or book when asked', 'Says their first name when asked', 'Talks well enough for others to understand most of the time', 'Draws a circle when you show how', 'Avoids touching hot objects, like a stove, when you warn them', 'Strings items together, like large beads or macaroni', 'Puts on some clothes by themselves, like loose pants or a jacket', 'Uses a fork'] },
    { months: 48, items: ['Pretends to be something else during play (teacher, superhero, dog)', 'Asks to go play with children if none are around', 'Comforts others who are hurt or sad', 'Avoids danger, like not jumping from tall heights at the playground', 'Likes to be a “helper”', 'Changes behaviour based on where they are (church, library, playground)', 'Says sentences with four or more words', 'Says some words from a song, story or nursery rhyme', 'Talks about at least one thing that happened during the day', 'Answers simple questions like “What is a coat for?”', 'Names a few colours of items', 'Tells what comes next in a well-known story', 'Draws a person with three or more body parts', 'Catches a large ball most of the time', 'Serves themselves food or pours water, with an adult watching', 'Unbuttons some buttons', 'Holds a crayon or pencil between fingers and thumb (not a fist)'] },
    { months: 60, items: ['Follows rules or takes turns when playing games with other children', 'Sings, dances or acts for you', 'Does simple chores at home, like matching socks or clearing the table', 'Tells a story they heard or made up, with at least two events', 'Answers simple questions about a book or story after you read it', 'Keeps a conversation going with more than three back-and-forth exchanges', 'Uses or recognises simple rhymes (bat–cat, ball–tall)', 'Counts to 10', 'Names some numbers between 1 and 5 when you point to them', 'Uses words about time, like “yesterday”, “tomorrow”, “morning” or “night”', 'Pays attention for 5 to 10 minutes during activities', 'Writes some letters in their name', 'Names some letters when you point to them', 'Buttons some buttons', 'Hops on one foot'] }
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
    if (ctx.awakeSinceMs != null && sleep.wake) {
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
    var s = sleepFor(days);
    if (!wokeAt || !s.wake) return null;
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
  // `from`/`to`: the ages in days a question is shown for (Answers lists what fits the child).
  var QUESTIONS = [
    { id: 'cry',     icon: '😭', q: 'Why is my baby crying?',                 tool: 'cry', to: 548 },
    { id: 'tantrum', icon: '😤', q: 'Tantrums and big feelings: what helps?', tool: 'tantrum', from: 365 },
    { id: 'sick',    icon: '🤒', q: 'Colds, coughs, vomiting: when to see the doctor?', tool: 'sick', from: 183 },
    { id: 'sleep',   icon: '🌙', q: 'How can I help my baby sleep better?',   tool: 'sleep', to: 365 },
    { id: 'sleepk',  icon: '🌙', q: 'How can I help my child sleep better?',  tool: 'sleep', from: 365 },
    { id: 'enough',  icon: '🍼', q: 'Is my baby eating enough?',              tool: 'enough', to: 365 },
    { id: 'howmuch', icon: '⏱️', q: 'How often and how much should my baby eat?', tool: 'howmuch', to: 548 },
    { id: 'eating',  icon: '🍽️', q: 'Picky eating: is my child eating enough?', tool: 'eating', from: 365 },
    { id: 'poop',    icon: '💩', q: 'Is my baby’s poop normal?',              tool: 'poop', to: 730 },
    { id: 'potty',   icon: '🚽', q: 'When and how do we start potty training?', tool: 'potty', from: 548 },
    { id: 'fever',   icon: '🌡️', q: 'Does my baby have a fever? When do I call the doctor?', tool: 'fever', to: 365 },
    { id: 'feverk',  icon: '🌡️', q: 'Fever: when do I call the doctor?',     tool: 'fever', from: 365 },
    { id: 'miles',   icon: '⭐', q: 'When will my baby roll over, sit up, crawl and walk?', tool: 'milestones', to: 365 },
    { id: 'milesk',  icon: '⭐', q: 'What should my child be doing by now?',  tool: 'milestones', from: 365 },
    { id: 'spit',    icon: '🤧', q: 'Why does my baby spit up, get hiccups, or sound stuffy?', tool: 'spit', to: 365 },
    { id: 'teeth',   icon: '🦷', q: 'Is my baby teething? How can I help?',    tool: 'teeth', from: 91, to: 1096 }
  ];
  function questionsFor(days) { return QUESTIONS.filter(function (q) { return (q.from == null || days >= q.from) && (q.to == null || days < q.to); }); }

  /* ---------- Life stage ----------
     baby (under 1), toddler (1 to 3) or child (3 and up). Picks the Today
     buttons and sections a parent starts with; they can change them. */
  function stage(days) { return days < 365 ? 'baby' : days < 1096 ? 'toddler' : 'child'; }

  /* ---------- Bottle pace ----------
     A paced bottle feed usually takes about 10–20 minutes. Much longer
     (or well under 1 ml a minute) often means the nipple flow is too slow,
     or baby is too sleepy or tired to feed well; a full bottle in a few
     minutes can mean it's too fast (gulping, coughing, spit-up). */
  function bottlePace(ml, ms) {
    if (!ml || !ms || ms < MIN) return null;
    var min = ms / MIN, rate = ml / min;
    return { min: min, rate: rate, level: min > 30 || (min >= 15 && rate < 1) ? 'slow' : min < 5 && ml >= 30 ? 'fast' : 'ok' };
  }

  /* ---------- Milk storage (CDC "Proper Storage and Preparation of Breast
     Milk" and "How to Prepare and Store Powdered Infant Formula") ----------
     Breast milk, fresh: room (up to 25 °C / 77 °F) 4 h; fridge 4 days;
       freezer best within 6 months, OK up to 12; insulated cooler 1 day.
     Brought to room temperature or warmed after chilling: use within 2 h.
     Thawed: fridge 24 h (from thawing), room 1–2 h; never refreeze.
     Leftover after a feed: within 2 h of the feed ending.
     Formula, prepared: room 2 h (1 h once a feed starts); fridge 24 h if
       chilled within 2 h of making it; never frozen; leftover: throw out.
     m: { kind: 'breast'|'formula', where: 'room'|'fridge'|'freezer'|'cooler',
          madeAt, since, chilled, thawedAt, leftoverAt, feedStartAt, cap } */
  var MILK_WHERE = { room: 'Room temp', fridge: 'Fridge', freezer: 'Freezer', cooler: 'Cooler bag' };
  function milkExpiry(m) {
    var at, best = null, rule;
    if (m.kind === 'formula') {
      if (m.leftoverAt) { at = m.leftoverAt; rule = 'Formula baby has drunk from can’t be kept — throw out what’s left.'; }
      else if (m.where === 'fridge') { at = m.madeAt + DAY; rule = 'Prepared formula keeps 24 hours in the fridge.'; }
      else if (m.chilled) { at = m.since + 2 * HOUR; rule = 'Out of the fridge: use within 2 hours (1 hour once the feed starts).'; }
      else { at = m.madeAt + 2 * HOUR; rule = 'Prepared formula: use within 2 hours at room temperature (1 hour once the feed starts), or put it in the fridge.'; }
      if (m.feedStartAt && !m.leftoverAt) at = Math.min(at, m.feedStartAt + HOUR);
    } else if (m.leftoverAt) { at = m.leftoverAt + 2 * HOUR; rule = 'Leftover breast milk: use within 2 hours after the feed ended, then throw it out.'; }
    else if (m.thawedAt) {
      if (m.where === 'fridge') { at = m.thawedAt + DAY; rule = 'Thawed breast milk: use within 24 hours in the fridge (counted from thawing). Never refreeze it.'; }
      else { at = Math.max(m.thawedAt, m.since || 0) + 2 * HOUR; rule = 'Thawed breast milk at room temperature: use within 1–2 hours. Never refreeze it.'; }
    } else if (m.where === 'freezer') { at = m.madeAt + 365 * DAY; best = m.madeAt + 183 * DAY; rule = 'Frozen breast milk: best within 6 months of pumping, OK up to 12.'; }
    else if (m.where === 'fridge') { at = m.madeAt + 4 * DAY; rule = 'Fresh breast milk keeps up to 4 days in the fridge (from when it was pumped).'; }
    else if (m.where === 'cooler') { at = (m.since || m.madeAt) + DAY; rule = 'In an insulated cooler with ice packs: up to 1 day — then fridge or freezer.'; }
    else if (m.chilled) { at = m.since + 2 * HOUR; rule = 'Chilled breast milk brought to room temperature or warmed: use within 2 hours.'; }
    else { at = m.madeAt + 4 * HOUR; rule = 'Fresh breast milk: up to 4 hours at room temperature (up to 25 °C / 77 °F). In a hotter room, chill or use it sooner.'; }
    if (m.cap && m.cap < at) at = m.cap;
    return { at: at, best: best, rule: rule };
  }
  // Where it can go next. Thawed milk is never refrozen; formula is never frozen.
  function milkMoves(m) {
    if (m.leftoverAt) return [];
    if (m.kind === 'formula') return m.where === 'room' && !m.chilled && !m.feedStartAt ? ['fridge'] : m.where === 'fridge' ? ['room'] : [];
    if (m.thawedAt) return m.where === 'fridge' ? ['room'] : [];
    if (m.where === 'freezer') return ['thawFridge', 'thawRoom'];
    return ['room', 'fridge', 'freezer', 'cooler'].filter(function (w) { return w !== m.where; });
  }

  /* ---------- Growth percentiles (WHO Child Growth Standards, 0–5 years) ----------
     L, M, S by completed month for boys (m) and girls (f). Birth to 24 months
     from the WHO tables as published by CDC/NCHS (WHO-*-for-age-Percentiles.csv);
     25 to 60 months from WHO's own day-by-day tables (the anthro package's
     weianthro, lenanthro and hcanthro), read at each month's exact age, which
     reproduces WHO's monthly tables. Ages between months are interpolated.
     wfa = weight (kg), lfa = length (cm), hcfa = head circumference (cm). */
  var WHO_GROWTH = {
    wfa: {
      m: [[0.3487, 3.3464, 0.14602], [0.2297, 4.4709, 0.13395], [0.197, 5.5675, 0.12385], [0.1738, 6.3762, 0.11727], [0.1553, 7.0023, 0.11316], [0.1395, 7.5105, 0.1108], [0.1257, 7.934, 0.10958], [0.1134, 8.297, 0.10902], [0.1021, 8.6151, 0.10882], [0.0917, 8.9014, 0.10881], [0.082, 9.1649, 0.10891], [0.073, 9.4122, 0.10906], [0.0644, 9.6479, 0.10925], [0.0563, 9.8749, 0.10949], [0.0487, 10.0953, 0.10976], [0.0413, 10.3108, 0.11007], [0.0343, 10.5228, 0.11041], [0.0275, 10.7319, 0.11079], [0.0211, 10.9385, 0.11119], [0.0148, 11.143, 0.11164], [0.0087, 11.3462, 0.11211], [0.0029, 11.5486, 0.11261], [-0.0028, 11.7504, 0.11314], [-0.0083, 11.9514, 0.11369], [-0.0137, 12.1515, 0.11426], [-0.01889, 12.35019, 0.11485], [-0.02397, 12.5466, 0.11544], [-0.02888, 12.74012, 0.11604], [-0.03375, 12.93035, 0.11664], [-0.03847, 13.11689, 0.11722], [-0.04311, 13.30004, 0.11781], [-0.04761, 13.47982, 0.11839], [-0.052, 13.6567, 0.11896], [-0.05639, 13.83095, 0.11953], [-0.06067, 14.0031, 0.12008], [-0.06483, 14.17365, 0.12063], [-0.06888, 14.3429, 0.12116], [-0.07292, 14.51125, 0.12168], [-0.07686, 14.67904, 0.1222], [-0.08081, 14.84654, 0.12271], [-0.08455, 15.01395, 0.12322], [-0.08829, 15.18126, 0.12373], [-0.09204, 15.34856, 0.12425], [-0.09568, 15.51577, 0.12478], [-0.09925, 15.68287, 0.12532], [-0.10277, 15.84968, 0.12586], [-0.10631, 16.01629, 0.12642], [-0.10976, 16.18269, 0.127], [-0.1131, 16.3489, 0.12759], [-0.11644, 16.51501, 0.12819], [-0.11979, 16.68111, 0.12881], [-0.12303, 16.84712, 0.12943], [-0.12627, 17.01315, 0.13006], [-0.12942, 17.17923, 0.13068], [-0.13256, 17.34524, 0.13132], [-0.13561, 17.51104, 0.13196], [-0.13875, 17.67675, 0.13261], [-0.14169, 17.84216, 0.13325], [-0.14474, 18.00732, 0.1339], [-0.14768, 18.17219, 0.13454], [-0.15063, 18.33655, 0.13518]],
      f: [[0.3809, 3.2322, 0.14171], [0.1714, 4.1873, 0.13724], [0.0962, 5.1282, 0.13], [0.0402, 5.8458, 0.12619], [-0.005, 6.4237, 0.12402], [-0.043, 6.8985, 0.12274], [-0.0756, 7.297, 0.12204], [-0.1039, 7.6422, 0.12178], [-0.1288, 7.9487, 0.12181], [-0.1507, 8.2254, 0.12199], [-0.17, 8.48, 0.12223], [-0.1872, 8.7192, 0.12247], [-0.2024, 8.9481, 0.12268], [-0.2158, 9.1699, 0.12283], [-0.2278, 9.387, 0.12294], [-0.2384, 9.6008, 0.12299], [-0.2478, 9.8124, 0.12303], [-0.2562, 10.0226, 0.12306], [-0.2637, 10.2315, 0.12309], [-0.2703, 10.4393, 0.12315], [-0.2762, 10.6464, 0.12323], [-0.2815, 10.8534, 0.12335], [-0.2862, 11.0608, 0.1235], [-0.2903, 11.2688, 0.12369], [-0.2941, 11.4775, 0.1239], [-0.29749, 11.68637, 0.12414], [-0.30054, 11.89475, 0.12441], [-0.30328, 12.10154, 0.12472], [-0.30573, 12.30588, 0.12506], [-0.308, 12.50727, 0.12545], [-0.3101, 12.7055, 0.12587], [-0.312, 12.90054, 0.12633], [-0.3138, 13.093, 0.12683], [-0.3155, 13.28366, 0.12737], [-0.3171, 13.47312, 0.12794], [-0.31863, 13.66184, 0.12855], [-0.3201, 13.85025, 0.1292], [-0.3216, 14.03846, 0.12987], [-0.32296, 14.22648, 0.13059], [-0.32431, 14.41399, 0.13134], [-0.3257, 14.601, 0.13212], [-0.327, 14.78732, 0.13294], [-0.32834, 14.97269, 0.13376], [-0.3296, 15.15728, 0.1346], [-0.33093, 15.341, 0.13545], [-0.3322, 15.52402, 0.1363], [-0.33351, 15.70635, 0.13715], [-0.3348, 15.88822, 0.138], [-0.3361, 16.0697, 0.13884], [-0.3374, 16.25108, 0.13968], [-0.3387, 16.43225, 0.14051], [-0.34003, 16.61328, 0.14133], [-0.34137, 16.7942, 0.14213], [-0.3427, 16.97481, 0.14293], [-0.344, 17.15509, 0.14371], [-0.34531, 17.33476, 0.14448], [-0.34665, 17.51365, 0.14525], [-0.3479, 17.69163, 0.146], [-0.34924, 17.86857, 0.14675], [-0.3505, 18.04451, 0.14749], [-0.3518, 18.21933, 0.14822]]
    },
    lfa: {
      m: [[1, 49.8842, 0.03795], [1, 54.7244, 0.03557], [1, 58.4249, 0.03424], [1, 61.4292, 0.03328], [1, 63.886, 0.03257], [1, 65.9026, 0.03204], [1, 67.6236, 0.03165], [1, 69.1645, 0.03139], [1, 70.5994, 0.03124], [1, 71.9687, 0.03117], [1, 73.2812, 0.03118], [1, 74.5388, 0.03125], [1, 75.7488, 0.03137], [1, 76.9186, 0.03154], [1, 78.0497, 0.03174], [1, 79.1458, 0.03197], [1, 80.2113, 0.03222], [1, 81.2487, 0.0325], [1, 82.2587, 0.03279], [1, 83.2418, 0.0331], [1, 84.1996, 0.03342], [1, 85.1348, 0.03376], [1, 86.0477, 0.0341], [1, 86.941, 0.03445], [1, 87.8161, 0.03479]],
      f: [[1, 49.1477, 0.0379], [1, 53.6872, 0.0364], [1, 57.0673, 0.03568], [1, 59.8029, 0.0352], [1, 62.0899, 0.03486], [1, 64.0301, 0.03463], [1, 65.7311, 0.03448], [1, 67.2873, 0.03441], [1, 68.7498, 0.0344], [1, 70.1435, 0.03444], [1, 71.4818, 0.03452], [1, 72.771, 0.03464], [1, 74.015, 0.03479], [1, 75.2176, 0.03496], [1, 76.3817, 0.03514], [1, 77.5099, 0.03534], [1, 78.6055, 0.03555], [1, 79.671, 0.03576], [1, 80.7079, 0.03598], [1, 81.7182, 0.0362], [1, 82.7036, 0.03643], [1, 83.6654, 0.03666], [1, 84.604, 0.03688], [1, 85.5202, 0.03711], [1, 86.4153, 0.03734]]
    },
    hcfa: {
      m: [[1, 34.4618, 0.03686], [1, 37.2759, 0.03133], [1, 39.1285, 0.02997], [1, 40.5135, 0.02918], [1, 41.6317, 0.02868], [1, 42.5576, 0.02837], [1, 43.3306, 0.02817], [1, 43.9803, 0.02804], [1, 44.53, 0.02796], [1, 44.9998, 0.02792], [1, 45.4051, 0.0279], [1, 45.7573, 0.02789], [1, 46.0661, 0.02789], [1, 46.3395, 0.02789], [1, 46.5844, 0.02791], [1, 46.806, 0.02792], [1, 47.0088, 0.02795], [1, 47.1962, 0.02797], [1, 47.3711, 0.028], [1, 47.5357, 0.02803], [1, 47.6919, 0.02806], [1, 47.8408, 0.0281], [1, 47.9833, 0.02813], [1, 48.1201, 0.02817], [1, 48.2515, 0.02821], [1, 48.37774, 0.02825], [1, 48.49886, 0.0283], [1, 48.61509, 0.02834], [1, 48.7264, 0.02838], [1, 48.83304, 0.02843], [1, 48.93511, 0.02847], [1, 49.03274, 0.02851], [1, 49.126, 0.02855], [1, 49.21527, 0.02859], [1, 49.30075, 0.02863], [1, 49.38261, 0.02867], [1, 49.46125, 0.02871], [1, 49.53667, 0.02875], [1, 49.60924, 0.02878], [1, 49.67914, 0.02882], [1, 49.7465, 0.02886], [1, 49.81157, 0.02889], [1, 49.87449, 0.02893], [1, 49.93534, 0.02896], [1, 49.99428, 0.02899], [1, 50.05124, 0.02903], [1, 50.10641, 0.02906], [1, 50.15981, 0.02909], [1, 50.2115, 0.02912], [1, 50.26174, 0.02915], [1, 50.3105, 0.02918], [1, 50.3578, 0.02921], [1, 50.40393, 0.02924], [1, 50.44878, 0.02927], [1, 50.49258, 0.0293], [1, 50.53539, 0.02932], [1, 50.57725, 0.02935], [1, 50.61832, 0.02938], [1, 50.65869, 0.0294], [1, 50.69836, 0.02943], [1, 50.73753, 0.02945]],
      f: [[1, 33.8787, 0.03496], [1, 36.5463, 0.0321], [1, 38.2521, 0.03168], [1, 39.5328, 0.0314], [1, 40.5817, 0.03119], [1, 41.459, 0.03102], [1, 42.1995, 0.03087], [1, 42.829, 0.03075], [1, 43.3671, 0.03063], [1, 43.83, 0.03053], [1, 44.2319, 0.03044], [1, 44.5844, 0.03035], [1, 44.8965, 0.03027], [1, 45.1752, 0.03019], [1, 45.4265, 0.03012], [1, 45.6551, 0.03006], [1, 45.865, 0.02999], [1, 46.0598, 0.02993], [1, 46.2424, 0.02987], [1, 46.4152, 0.02982], [1, 46.5801, 0.02977], [1, 46.7384, 0.02972], [1, 46.8913, 0.02967], [1, 47.0391, 0.02962], [1, 47.1822, 0.02957], [1, 47.32042, 0.02953], [1, 47.45361, 0.02949], [1, 47.58173, 0.02945], [1, 47.70448, 0.02941], [1, 47.82191, 0.02937], [1, 47.93405, 0.02933], [1, 48.04101, 0.02929], [1, 48.1432, 0.02926], [1, 48.24086, 0.02922], [1, 48.33432, 0.02919], [1, 48.42391, 0.02916], [1, 48.50992, 0.02912], [1, 48.59261, 0.02909], [1, 48.67222, 0.02906], [1, 48.74886, 0.02903], [1, 48.8228, 0.029], [1, 48.89406, 0.02897], [1, 48.96292, 0.02894], [1, 49.02939, 0.02891], [1, 49.09373, 0.02888], [1, 49.15597, 0.02886], [1, 49.21644, 0.02883], [1, 49.27507, 0.0288], [1, 49.3321, 0.02878], [1, 49.38769, 0.02875], [1, 49.44188, 0.02873], [1, 49.49473, 0.0287], [1, 49.5464, 0.02868], [1, 49.59692, 0.02866], [1, 49.6464, 0.02863], [1, 49.6947, 0.02861], [1, 49.7421, 0.02859], [1, 49.78851, 0.02856], [1, 49.83406, 0.02854], [1, 49.87884, 0.02852], [1, 49.92285, 0.0285]]
    }
  };
  // Standing height from 24 to 60 months (index 0 = 24 months). WHO measures children lying
  // down until 2 and standing after, which reads about 0.7 cm shorter.
  var WHO_HEIGHT = {
    m: [[1, 87.1161, 0.03507], [1, 87.97197, 0.03542], [1, 88.80653, 0.03576], [1, 89.61975, 0.0361], [1, 90.412, 0.03642], [1, 91.18279, 0.03674], [1, 91.93274, 0.03704], [1, 92.66313, 0.03733], [1, 93.3753, 0.03761], [1, 94.07109, 0.03787], [1, 94.75312, 0.03812], [1, 95.42361, 0.03836], [1, 96.08352, 0.03858], [1, 96.73377, 0.03879], [1, 97.37486, 0.039], [1, 98.00729, 0.03919], [1, 98.63105, 0.03937], [1, 99.24585, 0.03954], [1, 99.85152, 0.0397], [1, 100.44854, 0.03986], [1, 101.0374, 0.04002], [1, 101.61866, 0.04017], [1, 102.19334, 0.04031], [1, 102.76246, 0.04045], [1, 103.3273, 0.04059], [1, 103.88865, 0.04073], [1, 104.44731, 0.04086], [1, 105.00412, 0.041], [1, 105.55955, 0.04113], [1, 106.11381, 0.04126], [1, 106.66681, 0.04139], [1, 107.21874, 0.04152], [1, 107.76975, 0.04165], [1, 108.31977, 0.04177], [1, 108.86885, 0.0419], [1, 109.41692, 0.04202], [1, 109.96377, 0.04214]],
    f: [[1, 85.7154, 0.03764], [1, 86.59043, 0.03786], [1, 87.44622, 0.03808], [1, 88.283, 0.0383], [1, 89.10043, 0.03851], [1, 89.89911, 0.03872], [1, 90.67968, 0.03893], [1, 91.44305, 0.03913], [1, 92.1906, 0.03933], [1, 92.92391, 0.03952], [1, 93.64437, 0.03971], [1, 94.35322, 0.03989], [1, 95.0515, 0.04007], [1, 95.73982, 0.04024], [1, 96.41871, 0.04041], [1, 97.08846, 0.04057], [1, 97.7493, 0.04074], [1, 98.40147, 0.04089], [1, 99.04478, 0.04105], [1, 99.67952, 0.0412], [1, 100.30582, 0.04135], [1, 100.92379, 0.0415], [1, 101.53369, 0.04164], [1, 102.13598, 0.04179], [1, 102.7312, 0.04193], [1, 103.31974, 0.04206], [1, 103.90211, 0.0422], [1, 104.47858, 0.04233], [1, 105.04942, 0.04247], [1, 105.61487, 0.04259], [1, 106.17484, 0.04272], [1, 106.72953, 0.04285], [1, 107.2788, 0.04297], [1, 107.82269, 0.0431], [1, 108.3613, 0.04322], [1, 108.89482, 0.04335], [1, 109.42322, 0.04346]]
  };
  var MONTH_DAYS = 365.25 / 12;

  function growthLMS(kind, sex, days) {
    var t = WHO_GROWTH[kind] && WHO_GROWTH[kind][sex];
    if (!t || days == null || days < 0) return null;
    var m = days / MONTH_DAYS;
    if (m > 60) return null;
    if (kind === 'lfa' && m >= 24) { t = WHO_HEIGHT[sex]; m -= 24; }
    var i = Math.min(t.length - 2, Math.floor(m)), f = m - i, a = t[i], b = t[i + 1];
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
    QUESTIONS: QUESTIONS, questionsFor: questionsFor, stage: stage,
    VACCINES: VACCINES, vaccinePlan: vaccinePlan,
    bottlePace: bottlePace, MILK_WHERE: MILK_WHERE, milkExpiry: milkExpiry, milkMoves: milkMoves,
    WHO_GROWTH: WHO_GROWTH, WHO_HEIGHT: WHO_HEIGHT, growthLMS: growthLMS, growthZ: growthZ, growthPercentile: growthPercentile, growthAt: growthAt, linesCrossed: linesCrossed, normalCdf: normalCdf,
    fmtDur: fmtDur, fmtHours: fmtHours
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabyGuide = api;
})(this);
