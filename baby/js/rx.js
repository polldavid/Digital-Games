/* =========================================================
   Baby Log — rx.js
   Turns the text of a prescription into draft medicine
   entries: name, strength, dose, how often, for how long.
   Pure functions, no DOM — the parent always checks and
   edits the draft before anything is saved.

   It understands common prescription shorthand (OD, BID,
   TID, QID, q6h, PRN, "x 7 days", "Sig:") and maps a few
   brand names used in the Philippines and elsewhere to the
   generic medicine.
   ========================================================= */
(function (root) {
  'use strict';

  // Generic names and common brands -> display name.
  var DRUGS = [
    ['paracetamol', 'Paracetamol'], ['acetaminophen', 'Paracetamol'], ['tempra', 'Paracetamol (Tempra)'], ['biogesic', 'Paracetamol (Biogesic)'],
    ['calpol', 'Paracetamol (Calpol)'], ['tylenol', 'Paracetamol (Tylenol)'], ['ibuprofen', 'Ibuprofen'], ['dolan', 'Ibuprofen (Dolan)'],
    ['advil', 'Ibuprofen (Advil)'], ['motrin', 'Ibuprofen (Motrin)'], ['nurofen', 'Ibuprofen (Nurofen)'],
    ['co-amoxiclav', 'Co-amoxiclav'], ['coamoxiclav', 'Co-amoxiclav'], ['augmentin', 'Co-amoxiclav (Augmentin)'], ['amoxicillin', 'Amoxicillin'],
    ['amoxil', 'Amoxicillin (Amoxil)'], ['himox', 'Amoxicillin (Himox)'], ['cefuroxime', 'Cefuroxime'], ['cefixime', 'Cefixime'],
    ['cefalexin', 'Cefalexin'], ['cephalexin', 'Cefalexin'], ['azithromycin', 'Azithromycin'], ['zithromax', 'Azithromycin (Zithromax)'],
    ['clarithromycin', 'Clarithromycin'], ['cotrimoxazole', 'Co-trimoxazole'], ['co-trimoxazole', 'Co-trimoxazole'], ['metronidazole', 'Metronidazole'],
    ['cetirizine', 'Cetirizine'], ['virlix', 'Cetirizine (Virlix)'], ['loratadine', 'Loratadine'], ['salbutamol', 'Salbutamol'], ['ventolin', 'Salbutamol (Ventolin)'],
    ['budesonide', 'Budesonide'], ['prednisolone', 'Prednisolone'], ['nystatin', 'Nystatin'], ['miconazole', 'Miconazole'],
    ['mupirocin', 'Mupirocin'], ['hydrocortisone', 'Hydrocortisone'], ['simethicone', 'Simethicone'], ['restime', 'Simethicone (Restime)'],
    ['lactulose', 'Lactulose'], ['domperidone', 'Domperidone'], ['oral rehydration', 'Oral rehydration salts'], ['ors', 'Oral rehydration salts'],
    ['zinc', 'Zinc'], ['ferrous', 'Iron (ferrous)'], ['iron', 'Iron'], ['vitamin d', 'Vitamin D'], ['cholecalciferol', 'Vitamin D'],
    ['ascorbic acid', 'Vitamin C'], ['vitamin c', 'Vitamin C'], ['ceelin', 'Vitamin C (Ceelin)'], ['multivitamin', 'Multivitamins'],
    ['tiki-tiki', 'Multivitamins (Tiki-Tiki)'], ['tiki tiki', 'Multivitamins (Tiki-Tiki)'], ['nutrilin', 'Multivitamins (Nutrilin)'],
    ['probiotic', 'Probiotic'], ['erceflora', 'Probiotic (Erceflora)'], ['saline', 'Saline nasal drops'], ['salinase', 'Saline nasal drops (Salinase)']
  ];

  var FREQ = [
    // [regex, interval hours, times per day]
    [/\b(q\.?\s?4\s?h|every\s*4\s*(hours|hrs?))\b/i, 4, 6],
    [/\b(q\.?\s?6\s?h|every\s*6\s*(hours|hrs?))\b/i, 6, 4],
    [/\b(q\.?\s?8\s?h|every\s*8\s*(hours|hrs?))\b/i, 8, 3],
    [/\b(q\.?\s?12\s?h|every\s*12\s*(hours|hrs?))\b/i, 12, 2],
    [/\b(q\.?\s?24\s?h|every\s*24\s*(hours|hrs?))\b/i, 24, 1],
    [/\bq\.?i\.?d\.?\b|\b4\s?x\s?(a|per|\/)?\s?day\b|\bfour times (a|per) day\b/i, 6, 4],
    [/\bt\.?i\.?d\.?\b|\b3\s?x\s?(a|per|\/)?\s?day\b|\bthree times (a|per) day\b|\bthrice\b/i, 8, 3],
    [/\bb\.?i\.?d\.?\b|\b2\s?x\s?(a|per|\/)?\s?day\b|\btwice\b/i, 12, 2],
    [/\bo\.?d\.?\b|\bonce (a )?(day|daily)\b|\b1\s?x\s?(a|per|\/)?\s?day\b|\bdaily\b|\bq\.?d\.?\b/i, 24, 1]
  ];

  function findDrug(line) {
    var l = line.toLowerCase();
    for (var i = 0; i < DRUGS.length; i++) {
      var k = DRUGS[i][0];
      var re = new RegExp('(^|[^a-z])' + k.replace(/[-\s]/g, '[-\\s]?') + '([^a-z]|$)');
      if (re.test(l)) return DRUGS[i][1];
    }
    return null;
  }

  function parseDetails(text) {
    var out = {};
    var st = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|iu)\s*(?:\/|per|in)\s*(\d+(?:\.\d+)?)?\s*(ml|cc|tab)/i.exec(text) ||
             /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|iu)\b/i.exec(text);
    if (st) out.strength = st[0].replace(/\s+/g, '').replace(/cc$/i, 'ml');
    // Dose: prefer what follows "Sig", "give", "take".
    var doseRe = /(\d+(?:\.\d+)?|½|1\/2)\s*(ml|mL|cc|drops?|gtts?|tabs?|tablets?|sachets?|puffs?)\b/g, m, dose = null;
    var sig = /(sig\.?|give|take|dose)\s*[:\-]?\s*(.*)$/i.exec(text);
    var hay = sig ? sig[2] : text;
    while ((m = doseRe.exec(hay))) {
      // Skip the "5ml" in a strength like "250mg/5ml".
      if (/\/\s*$/.test(hay.slice(0, m.index))) continue;
      dose = m[1].replace('½', '0.5').replace('1/2', '0.5') + ' ' + m[2].toLowerCase().replace(/^cc$/, 'ml').replace(/^gtts?$/, 'drops');
      break;
    }
    if (dose) out.dose = dose;
    for (var i = 0; i < FREQ.length; i++) if (FREQ[i][0].test(text)) { out.intervalH = FREQ[i][1]; out.timesPerDay = FREQ[i][2]; break; }
    var everyRange = /every\s*(\d+)\s*(?:-|to)\s*(\d+)\s*(hours|hrs?)/i.exec(text);
    if (everyRange) { out.intervalH = +everyRange[1]; out.timesPerDay = Math.floor(24 / +everyRange[1]); }
    if (/\bp\.?r\.?n\.?\b|as needed|if needed|when needed|for fever|for pain/i.test(text)) out.prn = true;
    var dur = /(?:for|x|×)\s*(\d+)\s*(days?|d\b|weeks?|wks?)/i.exec(text) || /\b(\d+)\s*\/\s*7\b/.exec(text);
    if (dur) out.durationDays = /^w/i.test(dur[2] || '') ? +dur[1] * 7 : +dur[1];
    return out;
  }

  // Undo common OCR slips inside doses and strengths: "5" read as "S",
  // "0" as "O", "1" as "l" or "I" (e.g. "250mg/SmL", "1O0 mg", "l.2 mL").
  function fixOcr(t) {
    return String(t || '')
      .replace(/\/\s*S\s*(m[lL])\b/g, '/5$1')
      .replace(/(\d)[oO](?=\d|\s*(mg|mcg|ml|mL)\b)/g, '$10')
      .replace(/(^|[\s(:])[lI](?=\.\d)/g, '$11')
      .replace(/(\d)\s*rn[lL]\b/g, '$1 ml');
  }

  // Split the text into medicine blocks: a block starts at a line naming a
  // known medicine (or an "Rx"/numbered line with a strength) and collects
  // the instruction lines under it.
  function parse(text) {
    var lines = fixOcr(text).split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var meds = [], cur = null;
    lines.forEach(function (line) {
      var drug = findDrug(line);
      var looksLikeItem = /^(\d+[.)]|#\s?\d|rx\b)/i.test(line) && /\d\s*(mg|mcg|iu|ml)/i.test(line);
      if (drug || (looksLikeItem && !cur)) {
        if (cur) meds.push(cur);
        cur = { name: drug || line.replace(/^(\d+[.)]|#\s?\d+|rx\b[:.]?)\s*/i, '').split(/\s\d/)[0].trim(), lines: [line] };
      } else if (cur) {
        cur.lines.push(line);
      }
    });
    if (cur) meds.push(cur);
    return meds.map(function (m) {
      var joined = m.lines.join(' ');
      var d = parseDetails(joined);
      d.name = m.name;
      d.instructions = m.lines.slice(1).join(' ').slice(0, 160);
      d.source = joined;
      return d;
    });
  }

  // "Every 8 hours for 7 days" style summary for the confirm screen.
  function describe(m) {
    var parts = [];
    if (m.dose) parts.push(m.dose);
    if (m.intervalH) parts.push(m.intervalH >= 24 ? 'once a day' : 'every ' + m.intervalH + ' hours');
    if (m.prn) parts.push('as needed');
    if (m.durationDays) parts.push('for ' + m.durationDays + ' day' + (m.durationDays === 1 ? '' : 's'));
    return parts.join(' · ');
  }

  var api = { fixOcr: fixOcr, parse: parse, parseDetails: parseDetails, findDrug: findDrug, describe: describe, DRUGS: DRUGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabyRx = api;
})(this);
