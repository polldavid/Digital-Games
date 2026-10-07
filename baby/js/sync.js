/* =========================================================
   Alaga — sync.js
   Partner sync: two (or more) phones share one log.

   No DOM. The log is split into records — one per baby, entry,
   reminder, running timer and health item — and after every save
   the records that changed since the last sync are pushed. Nothing
   else in the app has to know about sync: editing, deleting and
   timers all show up as changed (or missing) records.

   Private by design: everything is encrypted on the phone
   (AES-GCM) with a key that only travels in the pairing link's
   #fragment, which browsers never send to a server. The server
   (server/worker.js) stores opaque blobs under hashed names.
   There is no account: whoever has the key is in the family.

   Conflicts: the server numbers every write, and records are
   applied in that order, so the last edit to reach the server
   wins — no phone clocks involved. A local edit that hasn't been
   pushed yet is never overwritten; it goes up next and wins.

   Not shared: settings, which baby is showing, dismissed and
   snoozed reminders (all per phone), and photos (too big for v1;
   the record syncs and the photo stays on the phone that took it).
   ========================================================= */
(function (root) {
  'use strict';

  var S = root.BabyStore || (typeof require !== 'undefined' ? require('./store.js') : null);
  var META_KEY = 'dg-babylog-sync';
  // The sync server (server/worker.js). Settable for local testing:
  // localStorage['dg-babylog-sync-url'] = 'http://localhost:8787'
  var SERVER = 'https://babylog-sync.polldavid18.workers.dev';
  var PUSH_BATCH = 100, POLL_MS = 10000;
  // More unexplained deletions than this in one go are held back and the parent asked.
  var HOLD_OVER = 3;

  /* ---------- Records ---------- */
  var LISTS = { ha: 'appointments', hr: 'rx', hd: 'docs' };

  // Everything shared, keyed 'kind:id'. Values are the live objects.
  function records(st) {
    var out = {};
    st.babies.forEach(function (b) { out['b:' + b.id] = b; });
    st.events.forEach(function (e) { out['e:' + e.id] = e; });
    st.custom.forEach(function (r) { out['c:' + r.id] = r; });
    (st.milk || []).forEach(function (m) { out['m:' + m.id] = m; });
    Object.keys(st.timers || {}).forEach(function (bid) {
      var T = st.timers[bid] || {};
      Object.keys(T).forEach(function (k) { if (T[k]) out['t:' + bid + ':' + k] = T[k]; });
    });
    Object.keys(st.health || {}).forEach(function (bid) {
      var H = st.health[bid];
      if (!H) return;
      if (H.profile && Object.keys(H.profile).length) out['hp:' + bid] = H.profile;
      if (H.vaccines && (H.vaccines.schedule || Object.keys(H.vaccines.given || {}).length || (H.vaccines.custom || []).length)) out['hv:' + bid] = H.vaccines;
      Object.keys(LISTS).forEach(function (p) { (H[LISTS[p]] || []).forEach(function (x) { out[p + ':' + bid + ':' + x.id] = x; }); });
    });
    return out;
  }

  // Small, fast string hash (cyrb53) — only used to spot changes.
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0) || 1; // never 0: 0 marks a deleted record
  }

  // What changed since the last sync. known: key -> hash last synced (0 = deleted).
  function changes(st, known) {
    var cur = records(st), out = [];
    Object.keys(cur).forEach(function (k) {
      var j = JSON.stringify(cur[k]), hh = hash(j);
      if (known[k] !== hh) out.push({ k: k, j: j, h: hh });
    });
    Object.keys(known).forEach(function (k) { if (known[k] && !cur[k]) out.push({ k: k, j: null, h: 0 }); });
    return out;
  }

  function upsert(list, id, d) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) { if (d) list[i] = d; else list.splice(i, 1); return; }
    }
    if (d) list.push(d);
  }

  // Write one record into the state (d = null deletes it).
  function put(st, k, d) {
    var p = k.split(':'), kind = p[0];
    if (kind === 'b') return upsert(st.babies, p[1], d);
    if (kind === 'e') return upsert(st.events, p[1], d);
    if (kind === 'c') return upsert(st.custom, p[1], d);
    if (kind === 'm') return upsert(st.milk = st.milk || [], p[1], d);
    if (kind === 't') {
      var T = st.timers[p[1]] = st.timers[p[1]] || {};
      if (d) T[p[2]] = d; else delete T[p[2]];
      return;
    }
    var H = st.health[p[1]] = st.health[p[1]] || {};
    if (kind === 'hp') H.profile = d || {};
    else if (kind === 'hv') H.vaccines = d || { schedule: '', given: {}, custom: [] };
    else if (LISTS[kind]) upsert(H[LISTS[kind]] = H[LISTS[kind]] || [], p[2], d);
  }

  /* Both partners set up the same baby before pairing: fold this phone's
     copy (fromId) into the shared one (toId). Entries keep their ids, so
     nothing is duplicated; profile fields already on the shared baby win. */
  function mergeBaby(st, fromId, toId) {
    if (fromId === toId) return;
    st.events.forEach(function (e) { if (e.baby === fromId) e.baby = toId; });
    st.custom.forEach(function (r) { if (r.baby === fromId) r.baby = toId; });
    var tf = st.timers[fromId] || {}, tt = st.timers[toId] = st.timers[toId] || {};
    Object.keys(tf).forEach(function (k) { if (!tt[k]) tt[k] = tf[k]; });
    delete st.timers[fromId];
    var hf = st.health[fromId];
    if (hf) {
      var ht = st.health[toId] = st.health[toId] || {};
      ht.profile = Object.assign({}, hf.profile || {}, ht.profile || {});
      Object.keys(LISTS).forEach(function (p) { var n = LISTS[p]; ht[n] = (ht[n] || []).concat((hf[n] || []).filter(function (x) { return !(ht[n] || []).some(function (y) { return y.id === x.id; }); })); });
      if (hf.vaccines) {
        var vt = ht.vaccines = ht.vaccines || { schedule: '', given: {}, custom: [] };
        vt.schedule = vt.schedule || hf.vaccines.schedule || '';
        vt.given = Object.assign({}, hf.vaccines.given || {}, vt.given || {});
        vt.custom = (vt.custom || []).concat((hf.vaccines.custom || []).filter(function (x) { return !(vt.custom || []).some(function (y) { return y.id === x.id; }); }));
      }
      delete st.health[fromId];
    }
    var from = null, to = null;
    st.babies.forEach(function (b) { if (b.id === fromId) from = b; if (b.id === toId) to = b; });
    if (from && to) {
      to.milestones = Object.assign({}, from.milestones || {}, to.milestones || {});
      if (!to.birthWeightKg && from.birthWeightKg) to.birthWeightKg = from.birthWeightKg;
    }
    st.babies = st.babies.filter(function (b) { return b.id !== fromId; });
    if (st.activeBaby === fromId) st.activeBaby = toId;
  }

  /* ---------- Crypto (WebCrypto: browsers and Node 19+) ---------- */
  var subtle = root.crypto && root.crypto.subtle ? root.crypto.subtle : (typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto.subtle : null);
  var rand = function (n) { var a = new Uint8Array(n); (root.crypto || globalThis.crypto).getRandomValues(a); return a; };

  function b64u(bytes) {
    var s = '', a = new Uint8Array(bytes);
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    var s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function hex(bytes) { return Array.prototype.map.call(new Uint8Array(bytes), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  var enc = new TextEncoder(), dec = new TextDecoder();

  function newSecret() { return b64u(rand(32)); }
  function validSecret(s) { return typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s); }
  // Accepts the code itself or a whole pairing link.
  function parseSecret(text) {
    text = String(text || '').trim();
    var m = text.match(/join=([A-Za-z0-9_-]{43})/) || text.match(/^([A-Za-z0-9_-]{43})$/);
    return m ? m[1] : null;
  }

  // Everything comes from the one secret: family id, server password, keys.
  function deriveKeys(secret) {
    return subtle.importKey('raw', unb64u(secret), 'HKDF', false, ['deriveBits', 'deriveKey']).then(function (base) {
      var info = function (s) { return { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('baby-log-sync-v1'), info: enc.encode(s) }; };
      return Promise.all([
        subtle.deriveBits(info('family'), base, 128),
        subtle.deriveBits(info('auth'), base, 256),
        subtle.deriveKey(info('enc'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
        subtle.deriveKey(info('names'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign'])
      ]);
    }).then(function (r) { return { family: hex(r[0]), token: b64u(r[1]), aes: r[2], mac: r[3] }; });
  }

  // The server sees a hashed name, never 'e:<entry id>'.
  function nameOf(keys, k) { return subtle.sign('HMAC', keys.mac, enc.encode(k)).then(function (sig) { return b64u(new Uint8Array(sig).slice(0, 16)); }); }

  function seal(keys, obj) {
    var iv = rand(12);
    return subtle.encrypt({ name: 'AES-GCM', iv: iv }, keys.aes, enc.encode(JSON.stringify(obj))).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0); out.set(new Uint8Array(ct), 12);
      return b64u(out);
    });
  }
  function open(keys, blob) {
    var a = unb64u(blob);
    return subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, keys.aes, a.slice(12)).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  }

  // The sync server (also receives the anonymous usage count, ping.js).
  function serverUrl(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    try { var o = storage && storage.getItem('dg-babylog-sync-url'); if (o) return o.replace(/\/+$/, ''); } catch (e) {}
    return SERVER;
  }

  /* ---------- Client ----------
     meta (saved per phone): { secret, device, after, afterK, known: {key: hash},
     joining, lastOk, error }. While `joining`, the phone only pulls, so the
     parent can match up babies before anything of theirs is uploaded. */
  function Client(opts) {
    opts = opts || {};
    var St = opts.store || S;
    var storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var meta = null, keys = null, keysFor = null, busy = null, again = false, timer = null, poll = null;
    var self = { onApplied: null, onStatus: null };

    function server() { return opts.server || serverUrl(storage); }
    function loadMeta() {
      if (meta) return meta;
      try { meta = JSON.parse(storage.getItem(META_KEY) || 'null'); } catch (e) { meta = null; }
      return meta;
    }
    function saveMeta() { try { if (meta) storage.setItem(META_KEY, JSON.stringify(meta)); else storage.removeItem(META_KEY); } catch (e) {} }
    function status(patch) {
      if (!meta) return;
      for (var k in patch) meta[k] = patch[k];
      saveMeta();
      if (self.onStatus) self.onStatus(meta);
    }
    function getKeys() {
      if (keys && keysFor === meta.secret) return Promise.resolve(keys);
      return deriveKeys(meta.secret).then(function (k) { keys = k; keysFor = meta.secret; return k; });
    }
    function call(method, path, body) {
      return fetchFn(server() + path, {
        method: method,
        headers: { 'Authorization': 'Bearer ' + keys.family + '.' + keys.token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (res) {
        if (res.status === 403) throw new Error('This sharing code no longer works. Set up sharing again.');
        if (res.status === 410) { var e = new Error('The shared log was deleted from another phone, so sharing is off here. This phone keeps its log.'); e.gone = true; throw e; }
        if (!res.ok) throw new Error('The sync server answered ' + res.status + '.');
        return res.json();
      });
    }

    function push() {
      var st = St.get(), ch = changes(st, meta.known);
      /* A deletion is pushed only when the parent made it (the store counts
         those), or a few at a time. Many records missing at once that nobody
         deleted means this phone lost part of its saved log: pushing that would
         delete them on every phone. They stay on the server; the parent is asked. */
      var budget = St.takeDeleteBudget ? St.takeDeleteBudget() : 0, allow = meta.allowHeld || [];
      var gone = ch.filter(function (c) { return !c.j && !/^t:/.test(c.k) && allow.indexOf(c.k) < 0; });
      if (gone.length - budget > HOLD_OVER) {
        var keys0 = gone.map(function (c) { return c.k; }).sort(), before = (meta.held || []).join();
        meta.held = keys0;
        ch = ch.filter(function (c) { return keys0.indexOf(c.k) < 0; });
        saveMeta();
        if (before !== keys0.join() && self.onHeld) self.onHeld(keys0.length);
      } else if (meta.held || meta.allowHeld) { meta.held = null; meta.allowHeld = null; saveMeta(); }
      if (!ch.length) return Promise.resolve(0);
      // New entries say which phone logged them ("by Sam's phone").
      var stamped = false;
      ch.forEach(function (c) {
        if (c.k.charAt(0) === 'e' && c.j && meta.known[c.k] === undefined) {
          var e = St.findEvent(c.k.slice(2));
          if (e && !e.by && meta.device) { e.by = meta.device; c.j = JSON.stringify(e); c.h = hash(c.j); stamped = true; }
        }
      });
      if (stamped) St.saveSoon();
      var sent = 0, chain = Promise.resolve();
      for (var i = 0; i < ch.length; i += PUSH_BATCH) (function (part) {
        chain = chain.then(function () {
          return Promise.all(part.map(function (c) {
            return Promise.all([nameOf(keys, c.k), seal(keys, { k: c.k, d: c.j ? JSON.parse(c.j) : null, by: meta.device || '', u: Date.now() })])
              .then(function (r) { return { k: r[0], b: r[1] }; });
          })).then(function (rows) { return call('POST', '/v1/push', { rows: rows }); }).then(function () {
            part.forEach(function (c) { meta.known[c.k] = c.h; });
            sent += part.length;
            saveMeta();
          });
        });
      })(ch.slice(i, i + PUSH_BATCH));
      return chain.then(function () { return sent; });
    }

    function pull() {
      var applied = 0;
      function page() {
        return call('GET', '/v1/pull?after=' + (meta.after || 0) + '&k=' + encodeURIComponent(meta.afterK || '')).then(function (res) {
          return Promise.all(res.rows.map(function (r) { return open(keys, r.b).catch(function () { return null; }); })).then(function (recs) {
            var st = St.get(), cur = records(st);
            var now = function (k) { return cur[k] ? hash(JSON.stringify(cur[k])) : 0; };
            recs.forEach(function (rec, i) {
              var row = res.rows[i];
              meta.after = row.s; meta.afterK = row.k;
              if (!rec || typeof rec.k !== 'string') return;
              var known = meta.known[rec.k], here = now(rec.k);
              // An edit made here and not pushed yet wins: keep it.
              if (known !== undefined && here !== known) return;
              var hh = rec.d ? hash(JSON.stringify(rec.d)) : 0;
              if (here === hh) { meta.known[rec.k] = hh; return; } // already have exactly this
              put(st, rec.k, rec.d);
              if (rec.d) cur[rec.k] = rec.d; else delete cur[rec.k];
              meta.known[rec.k] = hh;
              applied++;
            });
            saveMeta();
            return res.more ? page() : null;
          });
        });
      }
      return page().then(function () {
        if (applied) { St.touch(); St.save(); }
        return applied;
      });
    }

    // One round: send what changed here, then fetch what changed elsewhere.
    function cycle() {
      if (!loadMeta() || !meta.secret) return Promise.resolve(null);
      // A copy of the app that isn't the current one (another tab saved since) never syncs.
      if (St.paused) return Promise.resolve(null);
      if (St.isCurrent && !St.isCurrent()) { if (St.onConflict) St.onConflict(); return Promise.resolve(null); }
      if (busy) { again = true; return busy; }
      var res = { sent: 0, applied: 0 };
      busy = getKeys().then(function () {
        return meta.joining ? 0 : push();
      }).then(function (n) { res.sent = n; return pull(); }).then(function (n) {
        res.applied = n;
        status({ lastOk: Date.now(), error: '' });
        if (n && self.onApplied) self.onApplied(n);
        return res;
      }, function (e) {
        status({ error: (e && e.message) || 'offline' });
        if (e && e.gone) { var msg = e.message; self.leave(); if (self.onGone) self.onGone(msg); }
        return null;
      }).then(function (r) {
        busy = null;
        if (again) { again = false; soon(); }
        return r;
      });
      return busy;
    }

    function soon(ms) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; cycle(); }, ms == null ? 1200 : ms);
    }

    self.cycle = cycle;
    self.soon = soon;
    self.meta = function () { return loadMeta(); };
    self.on = function () { return !!(loadMeta() && meta.secret); };
    self.device = function () { return loadMeta() ? meta.device : ''; };
    self.setDevice = function (name) { if (loadMeta()) status({ device: String(name || '').slice(0, 30) }); };
    self.link = function (base) { return loadMeta() ? base + '#join=' + meta.secret : ''; };
    self.secret = function () { return loadMeta() ? meta.secret : ''; };
    // Start a new shared log from this phone (everything here is uploaded).
    self.create = function (device) {
      if (St.takeDeleteBudget) St.takeDeleteBudget();
      meta = { secret: newSecret(), device: device || '', after: 0, afterK: '', known: {}, joining: false, lastOk: 0, error: '' };
      saveMeta();
      return cycle();
    };
    // Join with a partner's code. Pulls only, until finishJoin().
    self.join = function (secret, device) {
      if (St.takeDeleteBudget) St.takeDeleteBudget();
      meta = { secret: secret, device: device || '', after: 0, afterK: '', known: {}, joining: true, lastOk: 0, error: '' };
      saveMeta();
      return cycle();
    };
    // Held deletions: bring the records back from the server (default), or delete them everywhere.
    self.held = function () { return loadMeta() && meta.held ? meta.held.length : 0; };
    self.restoreHeld = function () {
      if (!loadMeta() || !meta.held) return Promise.resolve(null);
      meta.held.forEach(function (k) { delete meta.known[k]; });
      meta.held = null; meta.after = 0; meta.afterK = '';
      saveMeta();
      return cycle();
    };
    self.deleteHeld = function () {
      if (!loadMeta() || !meta.held) return Promise.resolve(null);
      meta.allowHeld = meta.held; meta.held = null;
      saveMeta();
      return cycle();
    };
    // Earlier versions of records (the server keeps 30 days), newest first.
    self.history = function (days) {
      if (!loadMeta()) return Promise.resolve([]);
      return getKeys().then(function () { return call('GET', '/v1/history?since=' + (Date.now() - (days || 30) * 864e5)); }).then(function (res) {
        return Promise.all((res.rows || []).map(function (r) { return open(keys, r.b).then(function (rec) { rec.replaced = r.t; return rec; }, function () { return null; }); }));
      }).then(function (list) { return list.filter(Boolean); });
    };
    self.finishJoin = function () { if (loadMeta()) { meta.joining = false; saveMeta(); } return cycle(); };
    // Babies on this phone that aren't in the shared log (yet).
    self.localOnlyBabies = function () {
      if (!loadMeta()) return [];
      return St.get().babies.filter(function (b) { return meta.known['b:' + b.id] === undefined; });
    };
    self.sharedBabies = function () {
      if (!loadMeta()) return [];
      return St.get().babies.filter(function (b) { return meta.known['b:' + b.id] !== undefined; });
    };
    // Stop sharing on this phone. The log stays here; the partner keeps theirs.
    self.leave = function () { meta = null; keys = null; saveMeta(); self.stop(); };
    // Erase the shared copy from the server (every phone stops syncing; their own logs stay).
    self.destroy = function () {
      if (!loadMeta()) return Promise.resolve(false);
      return getKeys().then(function () { return call('DELETE', '/v1/family'); }).then(function () { self.leave(); return true; });
    };
    // Poll while the app is open.
    self.start = function () {
      if (poll || !self.on()) return;
      poll = setInterval(function () { if (typeof document === 'undefined' || !document.hidden) cycle(); }, POLL_MS);
      soon(300);
    };
    self.stop = function () { if (poll) clearInterval(poll); poll = null; if (timer) clearTimeout(timer); timer = null; };
    return self;
  }

  var api = {
    records: records, changes: changes, put: put, hash: hash, mergeBaby: mergeBaby,
    newSecret: newSecret, validSecret: validSecret, parseSecret: parseSecret,
    deriveKeys: deriveKeys, seal: seal, open: open, nameOf: nameOf,
    Client: Client, serverUrl: serverUrl
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabySync = api;
})(this);
