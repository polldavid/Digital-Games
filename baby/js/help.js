/* =========================================================
   Alaga — help.js
   "Answers": the questions parents search for most, each
   answered with the baby's own log wherever possible, plus
   the sleep-sounds player.
   ========================================================= */
(function () {
  'use strict';

  var G = window.BabyGuide, S = window.BabyStore, Snd = window.BabySound, App = window.BabyApp, h = App.h;
  var esc = h.esc, MIN = h.MIN, HOUR = h.HOUR, DAY = h.DAY;

  function days() { return S.ageDays(Date.now()); }
  function name() { var b = S.baby(); return esc(b ? b.name : 'Baby'); }
  function list(items) { return '<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'; }

  /* ---------- Sleep sounds ---------- */
  function soundPlayer() {
    var cur = Snd.playing(), ends = Snd.endsAt();
    return '<div class="card card--flat"><div class="card__title">🎶 Sleep sounds</div>' +
      '<p class="faint" style="margin-bottom:10px">Steady noise mimics the womb and masks household sounds. Keep the phone well away from the cot and the volume low (under 50 dB — about a quiet shower).</p>' +
      '<div class="sounds">' + Object.keys(Snd.SOUNDS).map(function (k) {
        var s = Snd.SOUNDS[k];
        return '<button type="button" class="sound" data-action="sound" data-sound="' + k + '" aria-pressed="' + (cur === k) + '"><span>' + s.icon + '</span><span>' + s.label + '</span></button>';
      }).join('') + '</div>' +
      '<div class="field__row" style="margin-top:12px;align-items:end">' +
      '<label class="field"><span class="field__label">Turn off after</span><select class="input" id="sound-timer">' +
      [[0, 'Keep playing'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (App.ui.soundMin || 0) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="field__label">Volume</span><input type="range" min="0.05" max="1" step="0.05" value="' + (App.ui.soundVol || 0.5) + '" id="sound-vol" /></label></div>' +
      (cur ? '<p class="faint" style="margin-top:8px">Playing ' + esc(Snd.SOUNDS[cur].label.toLowerCase()) + (ends ? ' · stops <span data-until="' + ends + '">' + h.until(ends) + '</span>' : '') + '. Keep this screen open — most phones stop web audio when it is locked for long.</p><button type="button" class="btn btn--block" data-action="sound-stop" style="margin-top:8px">⏹ Stop</button>' : '') +
      '</div>';
  }

  /* ---------- Topics ---------- */
  var TOPICS = {};

  TOPICS.cry = {
    title: 'Why is my baby crying?',
    html: function () {
      var now = Date.now(), b = S.baby(), lf = S.lastFeedAnchor(), ld = S.last('diaper'), lt = S.last('temp');
      var lastFeedEv = lf && lf.event;
      var reasons = G.cryReasons({
        days: days(), now: now, feedingType: b.feeding,
        lastFeed: lf && !lf.live ? lf.time : (lf && lf.live ? now : null),
        lastFeedEnd: lastFeedEv ? (lastFeedEv.end || lastFeedEv.time) : (lf && lf.live ? now : null),
        lastDiaper: ld ? ld.time : null,
        awakeSinceMs: S.isAsleep() ? null : (S.awakeSince(now) ? now - S.awakeSince(now) : null),
        lastTemp: lt ? { tempC: lt.data.tempC, time: lt.time } : null
      });
      var top = reasons[0];
      var html = '<p class="lead">Ranked from ' + name() + '’s log right now. Work down the list — most crying has a simple fix.</p>';
      html += '<div class="reasons">' + reasons.slice(0, 7).map(function (r, i) {
        var act = { hunger: ['log', 'feed', 'Log a feed'], diaper: ['log', 'diaper', 'Log a change'], tired: ['sleep-toggle', 'sleep', 'Start sleep timer'], fever: ['log', 'temp', 'Re-check temperature'], wind: null, colic: ['sound', 'shush', 'Play shush'], stim: ['sound', 'white', 'Play white noise'] }[r.id];
        return '<div class="reason' + (r.urgent ? ' reason--urgent' : i === 0 ? ' reason--top' : '') + '"><span class="reason__icon">' + r.icon + '</span>' +
          '<span class="reason__t">' + esc(r.title) + (i === 0 && !r.urgent ? '<span class="status status--info">Most likely</span>' : r.urgent ? '<span class="status status--urgent">⚠ Call now</span>' : '') + '</span>' +
          '<span class="reason__why">' + esc(r.why) + (act ? ' <button type="button" class="btn btn--link btn--sm" data-action="' + act[0] + '" data-type="' + act[1] + '" data-sound="' + act[1] + '">' + act[2] + ' →</button>' : '') + '</span>' +
          '<div class="reason__meter" aria-hidden="true"><i style="width:' + Math.min(100, r.score) + '%"></i></div></div>';
      }).join('') + '</div>';
      html += '<div class="prose"><h3>Still crying? Try the 5 S’s</h3>' + list([
        '<strong>Swaddle</strong> — snug arms, loose hips. Stop once baby shows signs of rolling.',
        '<strong>Side or stomach hold</strong> — in your arms only; always back to sleep.',
        '<strong>Shush</strong> — loud, steady, close to the ear (try the player below).',
        '<strong>Swing</strong> — small, rhythmic jiggles, head supported.',
        '<strong>Suck</strong> — a pacifier or clean finger.'
      ]) + '</div>';
      html += soundPlayer();
      html += '<div class="note note--urgent"><div class="note__t">Call your doctor right away if…</div>' + list(G.CRY_RED_FLAGS.map(esc)) + '</div>';
      html += h.note('info', 'It’s OK to step away', 'If you feel frustrated, put baby down safely on their back in the crib and take a few minutes to breathe. Crying won’t hurt them — shaking can. Ask someone to take over if you can.');
      return html;
    }
  };

  TOPICS.sleep = {
    title: 'Helping your baby sleep',
    html: function () {
      var now = Date.now(), d = days(), sl = G.sleepFor(d), s = S.last24(now);
      var woke = S.awakeSince(now), nap = woke ? G.nextNap(d, woke, now) : null;
      var sleeps = S.events({ type: 'sleep', from: now - 7 * DAY }).filter(function (e) { return e.end; });
      var longest = sleeps.reduce(function (m, e) { return Math.max(m, e.end - e.time); }, 0);
      var who = d >= 365 ? 'children' : 'babies', naps = sl.naps === '1' ? 'one nap' : sl.naps === '0' ? 'no naps' : 'about ' + sl.naps + ' naps';
      var html = '<p class="lead">At ' + esc(G.ageLabel(d).toLowerCase()) + ' (' + esc(sl.label.toLowerCase()) + '), ' + who + ' usually need <strong>' + sl.totalH[0] + '–' + sl.totalH[1] + ' hours</strong> of sleep in 24 hours, with ' + naps +
        (sl.wake ? ', and can stay happily awake for <strong>' + (sl.wake[0] >= 120 ? G.fmtHours(sl.wake[0] / 60).replace(' hours', '') + '–' + G.fmtHours(sl.wake[1] / 60) : sl.wake[0] + '–' + sl.wake[1] + ' minutes') + '</strong> at a time.' : '.') + '</p>';
      var status = S.isAsleep() ? h.note('ok', name() + ' is asleep', 'Sleeping since ' + h.fmtTime(S.timers().sleep.start) + '.')
        : nap ? h.note(nap.state === 'over' ? 'warn' : 'ok', nap.state === 'early' ? 'Next nap window: ' + h.fmtTime(nap.from) + '–' + h.fmtTime(nap.to) : nap.state === 'window' ? 'In the nap window now' : 'Past the wake window — may be overtired',
          'Awake since ' + h.fmtTime(woke) + '. Start winding down (dim lights, quiet, swaddle or sleep sack) a little before the window opens.')
        : !sl.wake ? '' : h.note('info', 'Log a sleep to get nap times', 'Once Alaga knows when ' + name() + ' last woke up, it predicts the next nap window and can remind you.');
      html += status;
      html += '<div class="stats">' + '<div class="stat"><div class="stat__v">' + h.hoursStr(s.sleepMs) + '</div><div class="stat__k">Sleep, last 24h</div></div>' +
        '<div class="stat"><div class="stat__v">' + (longest ? h.durMs(longest) : '—') + '</div><div class="stat__k">Longest, 7 days</div></div>' +
        '<div class="stat"><div class="stat__v">' + sl.naps + '</div><div class="stat__k">Typical naps</div></div></div>';
      html += '<div class="prose"><p>' + esc(sl.note) + '</p>' +
        (d >= 365 ? kidSleep() : '<h3>Safe sleep — the ABCs</h3>' + list(['<strong>Alone</strong> — own sleep space, nothing in it: no pillows, bumpers, blankets or toys.', '<strong>Back</strong> — every sleep, naps included.', '<strong>Crib</strong> — a firm, flat mattress with a fitted sheet, in your room for at least the first 6 months.', 'Avoid overheating, smoke exposure, and sleeping with baby on a sofa or armchair.']) +
        '<h3>What helps</h3>' + list([
          '<strong>Follow wake windows</strong>, not the clock — an overtired baby fights sleep harder.',
          '<strong>Light by day, dark at night.</strong> Bright daylight and normal noise for daytime feeds; dim, quiet, boring night feeds.',
          '<strong>A short, repeatable bedtime routine</strong> (bath, feed, sleep sack, song) from around 6–8 weeks.',
          '<strong>Put down drowsy but awake</strong> sometimes, so baby practises falling asleep in the crib.',
          '<strong>White noise</strong> through the whole sleep, at low volume.',
          '<strong>“Sleeping through”</strong> usually means a 6–8 hour stretch, and often arrives between 3 and 6 months. Night feeds before then are normal and needed.'
        ])) + '</div>';
      html += soundPlayer();
      return html;
    }
  };

  function kidSleep() {
    return '<h3>What helps</h3>' + list([
      '<strong>The same bedtime and wake-up time</strong> every day, weekends too.',
      '<strong>A calm 20–30 minute routine</strong>: bath, brush teeth, book, bed, in the same order every night.',
      '<strong>No screens for an hour before bed</strong>, and none in the bedroom.',
      '<strong>Short, boring check-ins</strong> if they call out or get up: walk them back to bed calmly.',
      '<strong>Moving to a bed</strong> is usually between 18 months and 3½ years, often when they start climbing out of the crib.',
      '<strong>Nightmares and night fears</strong> are common from about 3. Comfort them briefly; a dim night light can help.'
    ]) + h.note('warn', 'Mention it to your pediatrician', 'Loud snoring most nights, pauses in breathing, or very restless sleep with daytime tiredness or behaviour problems.');
  }

  TOPICS.enough = {
    title: 'Is my baby eating enough?',
    html: function () {
      var now = Date.now(), d = days(), b = S.baby();
      return '<p class="lead">What goes in must come out — diapers are the best everyday sign. Here’s ' + name() + '’s last 24 hours against what’s expected at ' + esc(G.ageLabel(d).toLowerCase()) + ':</p>' +
        '<div class="card card--flat">' + window.BabyViews.checks(now, d) + '</div>' +
        '<div class="prose"><h3>Signs baby is getting enough</h3>' + list([
          '<strong>Wet diapers:</strong> one per day of life until day 5, then <strong>6 or more</strong> heavy wet diapers a day, with pale-yellow pee.',
          '<strong>Poop:</strong> 3+ yellow poops a day from day 4 until about 6 weeks (breastfed babies may then poop much less).',
          '<strong>Weight:</strong> back to birth weight by 10–14 days, then gaining about 150–200 g (5–7 oz) a week for the first 3 months.',
          '<strong>Behaviour:</strong> you hear swallowing during feeds, and baby seems content and relaxed afterwards (hands open, not clenched).'
        ]) +
        '<h3>Call your pediatrician or a lactation consultant if</h3>' + list(['Fewer wet diapers than expected, dark pee, or orange “brick dust” crystals after day 3', 'Baby is very sleepy and hard to wake for feeds', 'No poop for 24h in the first weeks', 'Yellowing skin or eyes that’s spreading', 'Feeding is painful or you’re worried about latch']) + '</div>' +
        (b.birthWeightKg ? '' : '<p class="faint">Add a birth weight in Settings and log weights to track weight regained.</p>');
    }
  };

  TOPICS.howmuch = {
    title: 'How often & how much?',
    html: function () {
      var d = days(), b = S.baby(), f = G.feedingFor(d, b.feeding);
      var lw = S.last('growth', function (e) { return e.data.weightKg; });
      var html = '<p class="lead">At ' + esc(G.ageLabel(d).toLowerCase()) + ', expect about <strong>' + f.perDay[0] + '–' + f.perDay[1] + ' feeds</strong> a day — roughly every <strong>' + G.fmtHours(f.intervalH) + '</strong>' + (f.ml[1] ? ', with bottles of <strong>' + h.volToDisplay(f.ml[0]) + '–' + h.vol(f.ml[1]) + '</strong>' : '') + '. ' + esc(f.note) + '</p>';
      if (lw && d < 183 && b.feeding !== 'breast') {
        var per = lw.data.weightKg * 150, cap = 960;
        html += h.note('info', 'Formula rule of thumb for ' + name(), 'About 150 ml per kg (2½ oz per lb) a day → roughly ' + h.vol(Math.min(per, cap)) + ' in 24 hours at ' + h.weight(lw.data.weightKg) + '. Most babies shouldn’t need more than about ' + h.vol(cap) + ' a day. Let baby lead — this is a guide, not a target.');
      }
      html += '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Table (scrolls sideways)"><table class="tbl"><thead><tr><th>Age</th><th class="num">Breast feeds</th><th class="num">Formula feeds</th><th class="num">Bottle size</th></tr></thead><tbody>' +
        G.FEEDING.map(function (row) {
          var hl = row === G.FEEDING.filter(function (r) { return d < r.upTo; })[0];
          return '<tr' + (hl ? ' class="tbl__hl"' : '') + '><td>' + row.label + '</td><td class="num">' + row.breast[0] + '–' + row.breast[1] + '</td><td class="num">' + row.formula[0] + '–' + row.formula[1] + '</td><td class="num">' + (row.ml[1] ? h.volToDisplay(row.ml[0]) + '–' + h.vol(row.ml[1]) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      html += '<div class="prose"><h3>Hunger cues — feed before the crying</h3>' + list(['<strong>Early:</strong> stirring, mouth opening, turning head, rooting', '<strong>Mid:</strong> stretching, more movement, hand to mouth', '<strong>Late:</strong> crying, agitated — calm baby first, then feed']) +
        '<h3>Full cues</h3>' + list(['Slowing down, pushing the nipple or bottle away', 'Turning away, relaxed open hands, falling asleep']) +
        '<p>Newborns should be woken to feed if it’s been about 4 hours, until they’re back to birth weight. Alaga’s feed reminder uses ' + name() + '’s age (change it in Settings).</p></div>';
      return html;
    }
  };

  TOPICS.poop = {
    title: 'Is my baby’s poop normal?',
    html: function () {
      var d = days(), dia = G.diapersFor(d);
      var recent = S.events({ type: 'diaper', from: Date.now() - 3 * DAY }).filter(function (e) { return e.data.color; });
      var flagged = recent.filter(function (e) { var c = G.poopCheck(e.data.color, S.ageDays(e.time)); return c && (c.level === 'warn' || c.level === 'urgent'); });
      var html = '<p class="lead">Baby poop changes a lot in the first weeks. Right now (' + esc(G.ageLabel(d).toLowerCase()) + '): <strong>' + esc(dia.dirtyNote) + '</strong></p>';
      if (flagged.length) html += h.note('warn', 'You logged ' + h.plural(flagged.length, 'diaper') + ' worth checking', 'In the last 3 days: ' + flagged.map(function (e) { return G.poopColor(e.data.color).label + ' (' + h.dayLabel(e.time) + ' ' + h.fmtTime(e.time) + ')'; }).join(', ') + '. See the guide below and call your pediatrician if unsure.');
      html += '<div class="rows">' + G.POOP_COLORS.map(function (c) {
        var lvl = c.id === 'black' && d <= 4 ? 'ok' : c.id === 'black' ? 'warn' : c.level;
        return '<div class="row"><span class="row__icon" style="background:' + c.hex + '"></span><div class="row__main"><div class="row__t">' + esc(c.label) + ' ' + h.statusPill(lvl === 'info' ? 'info' : lvl, lvl === 'ok' ? 'Normal' : lvl === 'urgent' ? 'Call today' : 'Check') + '</div><div class="muted small" style="white-space:normal">' + esc(c.text) + '</div></div></div>';
      }).join('') + '</div>';
      html += '<div class="prose"><h3>How often?</h3>' + list(['<strong>Days 1–2:</strong> at least 1 (meconium)', '<strong>Day 4 to 6 weeks:</strong> 3 or more a day is typical', '<strong>After 6 weeks:</strong> breastfed babies may go up to a week; formula-fed babies usually 1–2 a day', '<strong>Straining and going red</strong> is normal (“grunting baby”) if what comes out is soft']) +
        '<h3>Constipation or diarrhea?</h3>' + list(['Hard, pebble-like poops = constipation. Mention it to your pediatrician, especially before solids.', 'Sudden, very watery, frequent poops = diarrhea. Watch for dehydration: fewer wet diapers, dry mouth, no tears, sunken soft spot.']) + '</div>';
      return html;
    }
  };

  TOPICS.fever = {
    title: 'Fever: when to call',
    html: function () {
      var d = days(), lt = S.last('temp');
      var html = '<p class="lead">A fever is a temperature of <strong>38.0 °C / 100.4 °F or higher</strong>. What to do depends a lot on age — ' + name() + ' is ' + esc(G.ageLabel(d).toLowerCase()) + (d >= 14 ? ' old' : '') + '.</p>';
      if (d < 91) html += h.note('urgent', 'Under 3 months: any fever is an emergency', 'Call your pediatrician right away or go to the emergency department for 38.0 °C / 100.4 °F or higher, even if baby seems fine. Don’t give fever medicine first.');
      if (lt) { var f = G.feverCheck(lt.data.tempC, S.ageDays(lt.time)); html += h.note(f.level, 'Last reading: ' + h.temp(lt.data.tempC) + ' · ' + h.ago(lt.time), f.text); }
      html += '<div class="card card--flat"><div class="card__title">Quick check</div><div class="stepper"><button type="button" class="btn" data-action="step" data-target="qtemp" data-step="-0.1" aria-label="Lower">−</button><div class="stepper__v"><input class="stepper__input" id="qtemp" name="qtemp" type="number" step="0.1" inputmode="decimal" value="' + h.tempToDisplay(37.0) + '" aria-label="Temperature" /><small>' + h.tempUnit() + '</small></div><button type="button" class="btn" data-action="step" data-target="qtemp" data-step="0.1" aria-label="Higher">+</button></div><div id="qtemp-out" style="margin-top:10px"></div>' +
        '<button type="button" class="btn btn--block" data-action="log" data-type="temp" style="margin-top:10px">Log a temperature</button></div>';
      html += '<div class="prose"><h3>Call your doctor (any age) if your child</h3>' + list(['Is hard to wake, unusually floppy, or inconsolable', 'Has trouble breathing, or a rash that doesn’t fade when you press a glass on it', 'Refuses feeds or has far fewer wet diapers', 'Has a seizure — call emergency services', 'Has a fever for more than 24 hours (under 2 years) or more than 3 days (2 years and older), or keeps getting worse']) +
        '<h3>Taking a temperature</h3>' + list(['<strong>Rectal</strong> is the most accurate under 3 months (a little petroleum jelly, ½–1 inch in).', '<strong>Armpit</strong> is fine for screening but reads lower; confirm a high reading rectally.', '<strong>Forehead / ear</strong> thermometers are less reliable in young babies (ear not under 6 months).', 'Don’t bundle up a feverish baby — light layers help them cool down.']) + '</div>';
      return html;
    },
    mount: function (body) {
      var inp = body.querySelector('#qtemp'), out = body.querySelector('#qtemp-out');
      var sync = function () { var f = G.feverCheck(h.tempFromDisplay(inp.value), days()); out.innerHTML = f ? h.note(f.level, f.title, f.text) : ''; };
      inp.addEventListener('input', sync); inp.addEventListener('stepped', sync); sync();
    }
  };

  function msAge(m) { return m < 24 ? m + ' months' : m % 12 ? Math.floor(m / 12) + '½ years' : m / 12 + ' years'; }

  TOPICS.milestones = {
    title: 'Milestones',
    html: function () {
      var d = days(), m = G.ageInMonths(d), b = S.baby(), got = b.milestones || {};
      var html = '<p class="lead">From the CDC’s checklist — things <strong>most</strong> children (3 in 4) do by each age. Tick them off as ' + name() + ' gets there. Every child has their own pace; premature babies follow their adjusted age.</p>';
      var nextIdx = 0;
      for (var i = 0; i < G.MILESTONES.length; i++) if (G.MILESTONES[i].months >= m) { nextIdx = i; break; } else nextIdx = i;
      G.MILESTONES.forEach(function (g, i) {
        var done = g.items.filter(function (_, j) { return got[g.months + ':' + j]; }).length;
        var open = i === nextIdx || (i === nextIdx - 1 && done < g.items.length);
        html += '<details class="card card--flat ms-group"' + (open ? ' open' : '') + '><summary class="ms-group__h"><span>By ' + msAge(g.months) + (i === nextIdx ? ' · <span class="faint">coming up</span>' : '') + '</span><span class="faint">' + done + ' / ' + g.items.length + '</span></summary>' +
          g.items.map(function (it, j) { var k = g.months + ':' + j; return '<label class="check-line"><input type="checkbox" data-action-change="ms-toggle" data-key="' + k + '"' + (got[k] ? ' checked' : '') + ' /> ' + esc(it) + '</label>'; }).join('') + '</details>';
      });
      html += h.note('info', 'Act early', 'If ' + name() + ' isn’t doing some of these by the age listed, or loses skills they had, talk to your pediatrician. Checking early is always worth it.');
      return html;
    }
  };

  TOPICS.spit = {
    title: 'Spit-up, hiccups & stuffy noses',
    html: function () {
      return '<div class="prose"><h3>Spit-up</h3><p>Very common — more than half of babies spit up daily, peaking around 4 months and usually gone by 12 months. A “happy spitter” who’s growing well needs no treatment.</p>' +
        list(['Keep feeds smaller and burp halfway through', 'Hold upright for 20–30 minutes after feeds', 'Avoid tight waistbands and bouncing straight after a feed', 'Never put baby to sleep on their tummy or side to reduce spit-up — back is still safest']) +
        '<div class="note note--warn"><div class="note__t">Call your pediatrician for</div>' + list(['Forceful, projectile vomiting (especially at 2–8 weeks)', 'Green or yellow bile, or blood', 'Poor weight gain, refusing feeds, or fewer wet diapers', 'Arching and screaming with most feeds']) + '</div>' +
        '<h3>Hiccups</h3><p>Normal and harmless — they bother parents more than babies. A burp, a pause, or a pacifier can help. No need for water or startling tricks.</p>' +
        '<h3>Stuffy nose</h3>' + list(['Babies breathe through their noses and often sound snuffly — that’s normal if they feed well', 'Saline drops, then gentle suction with a bulb or nasal aspirator, before feeds and sleep', 'A cool-mist humidifier in the room', 'No cold medicines under 4 years (FDA/AAP)']) +
        '<div class="note note--urgent"><div class="note__t">Get help now for</div>' + list(['Fast breathing, ribs pulling in, grunting or flaring nostrils', 'Bluish lips', 'Fever in a baby under 3 months']) + '</div></div>';
    }
  };

  TOPICS.teeth = {
    title: 'Teething',
    html: function () {
      var d = days();
      return '<p class="lead">' + (d < 120 ? 'Most babies get their first tooth between 6 and 12 months, so at ' + esc(G.ageLabel(d).toLowerCase()) + ' fussiness is more likely something else — try the crying helper.' : 'First teeth usually arrive between 6 and 12 months — the bottom front two first.') + '</p>' +
        '<div class="prose"><h3>Signs</h3>' + list(['Drooling and chewing on everything', 'Swollen, tender gums; irritability', 'Slightly raised temperature — but teething does <strong>not</strong> cause a true fever (38 °C / 100.4 °F+), diarrhea or rash. If those happen, look for another cause.']) +
        '<h3>What helps</h3>' + list(['Rubbing gums with a clean finger', 'A chilled (not frozen) teething ring', 'Wipe drool often to prevent rash', 'Ask your pediatrician about pain relief for bad nights']) +
        '<h3>What to avoid</h3>' + list(['Teething gels with benzocaine or lidocaine (FDA warning)', 'Amber or teething necklaces and bracelets — strangling and choking risk', 'Homeopathic teething tablets']) +
        '<h3>Caring for new teeth</h3><p>Brush twice a day from the first tooth with a smear of fluoride toothpaste the size of a grain of rice, and book a first dental visit by age 1.</p></div>';
    }
  };

  TOPICS.tantrum = {
    title: 'Tantrums and big feelings',
    html: function () {
      return '<p class="lead">Tantrums are a normal part of being 1 to 4: big feelings and not yet the words to explain them. They usually peak between 2 and 3 and ease as talking gets easier.</p>' +
        '<div class="prose"><h3>Fewer meltdowns</h3>' + list([
          '<strong>Keep routines</strong> for meals, naps and bedtime. Hungry or tired children melt down faster.',
          '<strong>Offer small choices</strong> (“the red cup or the blue cup?”) so they feel some control.',
          '<strong>Warn before changes</strong>: “Five more minutes, then we go home.”',
          '<strong>Notice the good moments</strong> and say so: “You waited so nicely.”'
        ]) +
        '<h3>During a tantrum</h3>' + list([
          'Stay calm and close, and keep them safe. Move them away from anything that could hurt.',
          'Name the feeling: “You’re angry that the park is finished.”',
          'Don’t give in to what started it: that teaches that tantrums work.',
          'It’s fine to ignore the screaming (not the child) while they’re safe.',
          'Never hit or shake a child, and try not to shout back.'
        ]) +
        '<h3>Afterwards</h3>' + list(['A hug and move on; no long lecture.', 'Later, in a calm moment, talk about feelings with simple words.']) + '</div>' +
        '<div class="note note--warn"><div class="note__t">Talk to your pediatrician if</div>' + list([
          'Tantrums often last more than 15 minutes, or happen several times a day, past age 4',
          'Your child hurts themselves or others, or holds their breath until they faint',
          'They come with trouble sleeping, talking, or playing with other children',
          'You feel you can’t cope'
        ]) + '</div>' +
        h.note('info', 'It’s OK to step away', 'When your child is somewhere safe, take a minute to breathe. Big feelings are hard for parents too.');
    }
  };

  TOPICS.sick = {
    title: 'Colds, coughs and tummy bugs',
    html: function () {
      var now = Date.now(), d = days(), lt = S.last('temp');
      var meds = S.events({ type: 'med', from: now - 2 * DAY });
      var html = '<p class="lead">Young children catch 6–8 colds a year, more in daycare or school. Most get better on their own in 7–10 days.</p>';
      if (lt && now - lt.time < 3 * DAY) { var f = G.feverCheck(lt.data.tempC, S.ageDays(lt.time)); html += h.note(f.level, 'Last temperature: ' + h.temp(lt.data.tempC) + ' · ' + h.ago(lt.time), f.text); }
      if (meds.length) html += h.note('info', 'Medicine in the last 2 days', meds.slice(-6).map(function (e) { return esc(e.data.name || 'Medicine') + ' at ' + h.fmtTime(e.time) + ' (' + h.dayLabel(e.time) + ')'; }).join(' · '));
      html += '<div class="btn-row"><button type="button" class="btn btn--sm" data-action="log" data-type="temp">🌡️ Log temperature</button><button type="button" class="btn btn--sm" data-action="log" data-type="med">💊 Log medicine</button></div>';
      html += '<div class="prose"><h3>Colds and coughs</h3>' + list([
        'Plenty of fluids and rest. Saline drops and gentle suction help a stuffy nose.',
        d >= 365 ? 'A small spoonful of honey can ease a night cough (only from age 1; never for babies).' : 'No honey before age 1.',
        'Cough and cold medicines aren’t recommended for young children; ask your pediatrician before giving any.',
        'Fever medicine is for comfort, not to bring the number down. Dose by weight, exactly as the label or your doctor says.'
      ]) +
        '<h3>Vomiting and diarrhea</h3>' + list([
          'The main risk is dehydration. Give small sips often of oral rehydration solution (ORS, such as Oresol).',
          'Go back to normal food once the vomiting settles; no need to wait.',
          'Watch the pee: much less than usual, or none in 8 hours, means they need more fluid and a doctor’s check.'
        ]) + '</div>';
      html += '<div class="note note--urgent"><div class="note__t">Get help now for</div>' + list([
        'Fast or hard breathing, ribs pulling in with each breath, or bluish lips',
        'No pee in 8 hours, no tears, a very dry mouth, or very sleepy and hard to wake',
        'Green vomit, blood in vomit or poop, or a swollen, very painful tummy',
        'A stiff neck, a rash that doesn’t fade when you press a glass on it, or a seizure'
      ]) + '</div>';
      html += '<div class="note note--warn"><div class="note__t">See your doctor if</div>' + list([
        'A fever lasts more than ' + (d < 730 ? '24 hours' : '3 days'),
        'Ear pain, or a cough that lasts more than 3 weeks',
        'Getting worse after a few days instead of better',
        'Vomiting or diarrhea that lasts more than a day or two'
      ]) + '</div>';
      return html;
    }
  };

  TOPICS.eating = {
    title: 'Picky eating',
    html: function () {
      var now = Date.now(), meals = S.events({ type: 'feed', from: S.startOfDay(now) - 6 * DAY }).filter(function (e) { return e.data.kind === 'solids'; });
      var foods = {}; meals.forEach(function (e) { if (e.data.food) foods[e.data.food.toLowerCase()] = 1; });
      var html = '<p class="lead">Toddlers grow more slowly than babies, so their appetite drops, often around the first birthday. Picky eating is normal and usually passes.</p>';
      if (meals.length) html += '<div class="stats"><div class="stat"><div class="stat__v">' + Math.round(meals.length / 7 * 10) / 10 + '</div><div class="stat__k">Meals a day, last 7 days</div></div><div class="stat"><div class="stat__v">' + Object.keys(foods).length + '</div><div class="stat__k">Different foods</div></div></div>';
      else html += h.note('info', 'Log meals to see the week', 'Tap Meal on Today. Writing what they ate shows how varied the week was.');
      html += '<div class="prose"><h3>What helps</h3>' + list([
        '<strong>You decide what, when and where; ' + name() + ' decides whether and how much.</strong> Pressure usually backfires.',
        'Three meals and one or two snacks at regular times, at the table, without screens.',
        'Offer new foods again and again: it can take 10–15 tries before a food is accepted.',
        'Put one food they already like on the plate next to anything new.',
        'Small portions, about a quarter of an adult’s. They can ask for more.',
        'About 2 cups (480 ml) of milk a day is plenty, and keep juice to a small cup or none: both fill a small tummy.',
        'Don’t use food as a reward or a bribe.'
      ]) +
        '<h3>Avoid choking</h3>' + list(['Cut grapes and cherry tomatoes into quarters, and sausages lengthwise.', 'No whole nuts, popcorn or hard sweets before age 4.', 'Always sitting down to eat, with an adult nearby.']) + '</div>' +
        '<div class="note note--warn"><div class="note__t">Talk to your pediatrician if</div>' + list([
          'Weight drops, or the growth chart crosses lines downward',
          'Very few foods are accepted, or whole food groups are refused',
          'Gagging, choking or vomiting with meals, or every meal is a battle'
        ]) + '</div>' +
        '<button type="button" class="btn btn--block" data-action="go" data-view="log">📈 See the growth chart (History → Trends)</button>';
      return html;
    }
  };

  TOPICS.potty = {
    title: 'Potty training',
    html: function () {
      var now = Date.now(), wk = S.events({ type: 'diaper', from: now - 7 * DAY }).filter(function (e) { return e.data.where; });
      var hits = wk.filter(function (e) { return e.data.where === 'potty' && (e.data.wet || e.data.dirty); }).length, acc = wk.filter(function (e) { return e.data.where === 'accident'; }).length;
      var html = '<p class="lead">Most children are ready between 18 months and 3 years, and many are dry in the daytime around 2½ to 3. Staying dry at night can take until 5 or later.</p>';
      if (wk.length) html += '<div class="stats"><div class="stat"><div class="stat__v">' + hits + '</div><div class="stat__k">On the potty, 7 days</div></div><div class="stat"><div class="stat__v">' + acc + '</div><div class="stat__k">Accidents</div></div><div class="stat"><div class="stat__v">' + (wk.length - hits - acc) + '</div><div class="stat__k">Tries, nothing</div></div></div>';
      html += '<button type="button" class="btn btn--block" data-action="log" data-type="potty">🚽 Log a potty trip</button>';
      html += '<div class="prose"><h3>Signs of readiness</h3>' + list([
        'Stays dry for 2 hours, or wakes up dry from a nap',
        'Tells you, or shows you, when they’re peeing or pooping',
        'Can walk to the potty, sit down, and pull pants down and up',
        'Follows simple instructions and is curious (copies you, wants “big kid” underwear)'
      ]) +
        '<h3>Getting started</h3>' + list([
          'Put a potty where they play, and let them sit on it dressed at first.',
          'Regular tries: after waking, after meals, and before bath and bed.',
          'Praise trying, not just success. Stay calm and matter-of-fact about accidents.',
          'Easy clothes; move to underwear in the daytime when they’re mostly dry.',
          'Teach wiping front to back and washing hands every time.'
        ]) + '</div>' +
        h.note('info', 'Setbacks are normal', 'A new baby, a move, starting school or being sick can bring accidents back. If it turns into a battle, take a break for a few weeks.') +
        '<div class="note note--warn"><div class="note__t">Talk to your pediatrician if</div>' + list([
          'There’s no interest or readiness by about 3½',
          'Peeing or pooping hurts, or poop is hard and dry (constipation makes training harder)',
          'They were dry for months and the accidents start again'
        ]) + '</div>';
      return html;
    }
  };

  function open(id) {
    var T = TOPICS[id];
    if (!T) return;
    h.openSheet({ kind: 'topic', topic: id, title: T.title, html: function () { return '<div class="form">' + T.html() + '<p class="disclaimer">General guidance from AAP, CDC, WHO and NHS — not a diagnosis. When in doubt, call your pediatrician.</p></div>'; }, mount: T.mount });
  }

  function view() {
    var b = S.baby();
    return '<h1 class="h1">Answers</h1><p class="lead">The questions parents search for most at ' + esc(G.ageLabel(days()).toLowerCase()) + ' — answered with ' + esc(b.name) + '’s own log wherever we can.</p>' +
      '<div class="qcards">' + G.questionsFor(days()).map(function (q) {
        return '<button class="qcard" data-action="help" data-topic="' + q.tool + '"><span class="qcard__icon">' + q.icon + '</span><span class="qcard__q">' + esc(q.q) + '</span><span class="qcard__go">›</span></button>';
      }).join('') + '</div>' +
      '<div class="section-title"><h2>Sleep sounds</h2></div>' + soundPlayer().replace('card card--flat', 'card') +
      '<p class="disclaimer">Alaga offers general information based on guidance from the AAP, CDC, WHO and NHS. It isn’t medical advice and can’t diagnose anything. If you’re worried about your baby, call your pediatrician — or emergency services in an emergency.</p>';
  }

  window.BabyHelp = { open: open, view: view, soundPlayer: soundPlayer, TOPICS: TOPICS };
})();
