/* =========================================================
   Baby Log — share.js
   The partner-sync screens: set up sharing, invite a phone
   (QR code + link), join with a code, match up babies when
   both phones already had one, and the status in Settings.
   The sync itself lives in sync.js.
   ========================================================= */
(function () {
  'use strict';

  var S = window.BabyStore, Sync = window.BabySync, App = window.BabyApp, h = App.h, N = window.BabyNative;
  var $ = h.$, esc = h.esc;
  var client = Sync.Client();
  var QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  var QR_SRI = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';

  function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

  // Re-render with what arrived, without wiping a form the parent is filling in.
  var dirty = false;
  function refresh() {
    var a = document.activeElement;
    if (App.ui.sheet || (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) { dirty = true; return; }
    dirty = false;
    var y = window.scrollY; App.render(); window.scrollTo(0, y);
    N.syncReminders();
  }

  /* ---------- Settings section ---------- */
  function ago(t) { return t ? '<span data-ago="' + t + '">' + h.ago(t, Date.now()) + '</span>' : 'not yet'; }
  function statusLine() {
    var m = client.meta();
    if (!m) return '';
    if (m.joining) return 'Joining…';
    if (m.error) return (navigator.onLine === false ? 'Offline — changes are saved here and will sync when you’re back online.' : m.error) + (m.lastOk ? ' Last synced ' + ago(m.lastOk) + '.' : '');
    return 'Synced ' + ago(m.lastOk) + '.';
  }
  function settingsSection(row) {
    var html = '<div class="section-title" id="set-share"><h2>Share with a partner</h2></div><div class="card">';
    if (!client.on()) {
      html += row('Share this log', 'Both phones see the same log, live — feeds, diapers, sleep, timers and health records. Encrypted on this phone; no account.', '<button class="btn btn--sm btn--primary" data-action="share-setup">Set up</button>') +
        row('Join a partner’s log', 'Your partner already shares? Use their code or QR.', '<button class="btn btn--sm" data-action="share-join">Join</button>');
    } else {
      var m = client.meta();
      html += row('Sharing is on', statusLine(), '<button class="btn btn--sm" data-action="share-now">Sync now</button>') +
        row('This phone', esc(m.device || 'Unnamed') + ' — shown next to what you log.', '<button class="btn btn--sm" data-action="share-rename">Rename</button>') +
        row('Add a phone', 'Show the QR code or send the link to your partner, a grandparent or a sitter.', '<button class="btn btn--sm btn--primary" data-action="share-invite">Invite</button>') +
        row('Stop sharing on this phone', 'The log stays here; other phones keep theirs.', '<button class="btn btn--sm btn--danger" data-action="share-leave">Stop</button>') +
        '<p class="faint" style="margin-top:10px">Shared: babies, entries, running timers, reminders you created and health records. Each phone keeps its own settings and alerts. Photos stay on the phone that took them.</p>';
    }
    return html + '</div>';
  }

  /* ---------- Sheets ---------- */
  function nameField(val) {
    return '<label class="field"><span class="field__label">Name for this phone</span><input class="input" name="device" required maxlength="30" value="' + esc(val || '') + '" placeholder="e.g. Sam’s phone" autocomplete="off" />' +
      '<span class="field__hint">Shown next to what you log, so you both know who did the 3 a.m. feed.</span></label>';
  }

  function setupSheet() {
    h.openSheet({
      title: 'Share with a partner',
      html: '<form class="form" id="share-setup-form" autocomplete="off">' +
        '<p>Everything on this phone becomes a shared log. Your partner scans a QR code (or opens a link) and sees the same feeds, diapers, sleep and timers within seconds.</p>' +
        nameField('') +
        '<div class="note note--ok"><div class="note__t">Private</div>Entries are encrypted on this phone before they’re sent. The key is only in the QR code or link — not even the sync server can read your log. No account, no email.</div>' +
        '<div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" type="submit">Start sharing</button></div></form>',
      mount: function (body) {
        body.querySelector('form').addEventListener('submit', function (e) {
          e.preventDefault();
          var name = e.target.elements.device.value.trim();
          if (!name) return;
          var btn = e.target.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Uploading…';
          S.flush();
          client.create(name).then(function (r) {
            if (!r) { client.leave(); btn.disabled = false; btn.textContent = 'Start sharing'; h.toast('Couldn’t reach the sync server. Check your connection and try again.'); return; }
            client.start();
            inviteSheet(true);
          });
        });
      }
    });
  }

  function inviteSheet(fresh) {
    var link = client.link(appUrl());
    h.openSheet({
      title: fresh ? 'Sharing is on ✓' : 'Invite a phone',
      html: '<p>On your partner’s phone, scan this with the camera — or send them the link.</p>' +
        '<div class="qr" id="share-qr" aria-label="QR code with the sharing link"><span class="faint">Making the QR code…</span></div>' +
        '<div class="btn-row"><button class="btn btn--primary btn--lg" data-action="share-send">Send link</button><button class="btn btn--lg" data-action="share-copy">Copy code</button></div>' +
        '<p class="faint" style="margin-top:12px">Using Baby Log from the Home Screen or the app? Opening the link may start Safari or Chrome instead — then tap <b>Settings → Join</b> in the app and paste the code.</p>' +
        '<div class="note note--warn" style="margin-top:12px"><div class="note__t">Treat it like a house key</div>Anyone with this link or code can see and change the log. Only send it to people you trust.</div>',
      mount: function () {
        loadQR().then(function () {
          var el = $('#share-qr'); if (!el) return;
          var q = window.qrcode(0, 'M'); q.addData(link); q.make();
          el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
        }).catch(function () { var el = $('#share-qr'); if (el) el.innerHTML = '<span class="faint">QR code needs an internet connection — use Send link instead.</span>'; });
      }
    });
  }

  var qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (qrLoading) return qrLoading;
    qrLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = QR; s.integrity = QR_SRI; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = function () { s.remove(); qrLoading = null; reject(new Error('qr')); };
      document.head.appendChild(s);
    });
    return qrLoading;
  }

  function joinSheet(secret) {
    var hasLog = S.get().babies.length > 0;
    h.openSheet({
      title: 'Join a partner’s log',
      html: '<form class="form" id="share-join-form" autocomplete="off">' +
        (secret ? '<div class="note note--ok"><div class="note__t">Sharing code received ✓</div>From the link you opened.</div>' :
          '<label class="field"><span class="field__label">Sharing code or link</span><input class="input" name="code" required autocapitalize="off" spellcheck="false" placeholder="Paste it here" />' +
          '<span class="field__hint">On your partner’s phone: Settings → Share with a partner → Invite → Copy code.</span></label>') +
        nameField('') +
        (hasLog ? '<p class="faint">This phone already has a log. Next, you’ll choose how to combine it with the shared one — nothing is uploaded until then.</p>' : '') +
        '<div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" type="submit">Join</button></div></form>',
      mount: function (body) {
        body.querySelector('form').addEventListener('submit', function (e) {
          e.preventDefault();
          var f = e.target, code = secret || Sync.parseSecret(f.elements.code.value), name = f.elements.device.value.trim();
          if (!code) { h.fieldError(f, 'code', 'That doesn’t look like a sharing code. Copy it again from your partner’s phone.'); return; }
          if (!name) return;
          var btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Joining…';
          S.flush();
          client.join(code, name).then(function (r) {
            if (!r) { var err = (client.meta() || {}).error; client.leave(); btn.disabled = false; btn.textContent = 'Join'; h.toast(err || 'Couldn’t reach the sync server. Check your connection and try again.'); return; }
            if (!client.sharedBabies().length) { client.leave(); btn.disabled = false; btn.textContent = 'Join'; h.toast('That shared log is empty. Check the code, or ask your partner to open Baby Log once so it uploads.'); return; }
            afterPull();
          });
        });
      }
    });
  }

  // Joined and pulled: if this phone had babies of its own, match them up.
  function afterPull() {
    var mine = client.localOnlyBabies(), shared = client.sharedBabies();
    if (!mine.length) return finish();
    h.openSheet({
      title: 'Combine the logs',
      html: function () {
        return '<form class="form" id="share-match-form">' +
          '<p>This phone already has its own log. For each baby here, choose who it is in the shared log. Entries are combined — nothing is lost.</p>' +
          mine.map(function (b) {
            return '<label class="field"><span class="field__label">' + esc((b.emoji || '👶') + ' ' + b.name) + ' on this phone (born ' + esc(b.birth) + ')</span><select class="input" name="m-' + b.id + '">' +
              shared.map(function (x) { var match = x.name.toLowerCase() === b.name.toLowerCase() || x.birth === b.birth; return '<option value="' + x.id + '"' + (match ? ' selected' : '') + '>Same baby as ' + esc(x.name) + ' (shared)</option>'; }).join('') +
              '<option value="new"' + (shared.some(function (x) { return x.name.toLowerCase() === b.name.toLowerCase() || x.birth === b.birth; }) ? '' : ' selected') + '>A different baby — add to the shared log</option>' +
              '<option value="drop">Don’t share — remove from this phone</option></select></label>';
          }).join('') +
          '<div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" type="submit">Combine</button></div></form>';
      },
      mount: function (body) {
        body.querySelector('form').addEventListener('submit', function (e) {
          e.preventDefault();
          var f = e.target, st = S.get(), drops = [];
          mine.forEach(function (b) {
            var v = f.elements['m-' + b.id].value;
            if (v === 'drop') drops.push(b);
            else if (v !== 'new') Sync.mergeBaby(st, b.id, v);
          });
          var go = function () { drops.forEach(function (b) { S.removeBaby(b.id); }); S.touch(); S.save(); finish(); };
          if (drops.length) h.ask({ title: 'Remove ' + drops.map(function (b) { return b.name; }).join(' and ') + ' from this phone?', text: 'Their entries on this phone are deleted. Export a backup first if you might want them.', ok: 'Remove', danger: true }, go);
          else go();
        });
      }
    });
  }

  function finish() {
    var st = S.get();
    if (!S.baby(st.activeBaby)) st.activeBaby = st.babies[0] ? st.babies[0].id : null;
    client.finishJoin().then(function () {
      client.start();
      h.closeSheet();
      App.ui.view = 'today';
      App.render();
      N.syncReminders();
      h.toast('You’re sharing with ' + othersLabel() + ' ✓');
    });
  }
  function othersLabel() {
    var names = {};
    S.get().events.forEach(function (e) { if (e.by && e.by !== client.device()) names[e.by] = 1; });
    var n = Object.keys(names);
    return n.length ? n.slice(0, 2).join(' and ') : 'your partner';
  }

  function renameSheet() {
    h.openSheet({
      title: 'Name this phone',
      html: '<form class="form" autocomplete="off">' + nameField(client.device()) + '<div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" type="submit">Save</button></div></form>',
      mount: function (body) {
        body.querySelector('form').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = e.target.elements.device.value.trim();
          if (v) { client.setDevice(v); h.closeSheet(); App.render(); }
        });
      }
    });
  }

  /* ---------- Actions ---------- */
  var ACTIONS = {
    'share-setup': setupSheet,
    'share-join': function () { joinSheet(null); },
    'share-invite': function () { inviteSheet(false); },
    'share-rename': renameSheet,
    'share-now': function () { client.cycle().then(function (r) { App.render(); h.toast(r ? 'Up to date ✓' : 'Couldn’t sync — ' + ((client.meta() || {}).error || 'check your connection')); }); },
    'share-send': function () {
      var link = client.link(appUrl());
      N.shareText('Join our Baby Log so we both see feeds, diapers and sleep: ' + link, 'Baby Log').then(function (how) { if (how === 'copied') h.toast('Link copied ✓'); }).catch(function () { h.toast('Couldn’t open sharing — use Copy code instead.'); });
    },
    'share-copy': function () {
      var code = client.secret();
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { h.toast('Code copied ✓'); }).catch(function () { prompt('Copy this code:', code); });
    },
    'share-leave': function () {
      h.ask({ title: 'Stop sharing on this phone?', text: 'This phone keeps the log as it is now, but stops getting your partner’s entries. Other phones keep sharing. To share again, join with a new invite.', ok: 'Stop sharing', danger: true }, function () {
        client.leave(); App.render(); h.toast('Sharing stopped on this phone');
      });
    }
  };
  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-action^="share-"]');
    if (!n || n.disabled || !ACTIONS[n.getAttribute('data-action')]) return;
    e.preventDefault();
    ACTIONS[n.getAttribute('data-action')](n);
  });

  /* ---------- Boot ---------- */
  function init() {
    client.onApplied = refresh;
    client.onStatus = function () { var t = $('#syncchip'); if (t) paintChip(t); };
    S.onSave(function () { if (client.on() && !client.meta().joining) client.soon(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && client.on()) client.soon(0); });
    window.addEventListener('online', function () { if (client.on()) client.soon(0); });
    // Catch up on anything that arrived while a sheet or input was in use.
    setInterval(function () { if (dirty) refresh(); }, 2000);
    var chip = $('#syncchip');
    if (chip) paintChip(chip);
    // A joining phone that was closed mid-way resumes matching babies.
    if (client.on() && client.meta().joining) client.cycle().then(function (r) { if (r) afterPull(); });
    else client.start();
    checkLink();
    // The link can also arrive while the app is already open in this tab.
    window.addEventListener('hashchange', checkLink);
  }

  // Opened from a pairing link: #join=<code>. Drop it from the address bar right away.
  function checkLink() {
    var code = Sync.parseSecret(location.hash);
    if (!code) return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    if (client.on() && client.secret() === code) h.toast('This phone is already sharing this log ✓');
    else if (client.on()) h.toast('This phone already shares a log. Stop sharing in Settings first, then open the link again.');
    else joinSheet(code);
  }

  function paintChip(el) {
    var m = client.meta();
    el.hidden = !m;
    if (!m) return;
    var bad = !!m.error && !m.joining;
    el.classList.toggle('iconbtn--warn', bad);
    el.setAttribute('aria-label', bad ? 'Not synced — ' + m.error : 'Sharing on — synced');
    el.title = bad ? 'Not synced' : 'Synced';
  }

  // Who logged an entry, if it wasn't this phone.
  function byline(e) { return e && e.by && client.on() && e.by !== client.device() ? e.by : ''; }

  window.BabyShare = { init: init, settingsSection: settingsSection, byline: byline, client: client, joinSheet: joinSheet };
})();
