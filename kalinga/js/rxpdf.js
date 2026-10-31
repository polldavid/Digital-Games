/* =========================================================
   Kalinga — rxpdf.js
   Reads an e-prescription PDF on the phone and returns its text
   as rows (one string per table row) for KalingaRxImport.parse().

   - pdf.js 3.11.174 is loaded the first time it's needed, from
     cdnjs, pinned by hash: the page script with SRI, the worker by
     checking its SHA-384 before it runs (a worker can't carry SRI).
     The PDF itself never leaves the phone; the password is only
     given to pdf.js and is never stored.
   - read(file, password) -> Promise<{ lines: [string] }>
     rejects with err.code: 'password' (one is needed),
     'wrong-password', 'not-pdf', 'offline' (pdf.js couldn't load).
   ========================================================= */
(function () {
  'use strict';

  var BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var LIB_SRI = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
  var WORKER_SRI = 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2';
  var loading = null;

  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }

  function load() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      if (window.pdfjsLib) { resolve(); return; }
      var s = document.createElement('script');
      s.src = BASE + 'pdf.min.js';
      s.integrity = LIB_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(fail('offline')); };
      document.head.appendChild(s);
    }).then(function () {
      return fetch(BASE + 'pdf.worker.min.js', { mode: 'cors', credentials: 'omit' });
    }).then(function (r) {
      if (!r.ok) throw fail('offline');
      return r.arrayBuffer();
    }).then(function (buf) {
      return crypto.subtle.digest('SHA-384', buf).then(function (h) {
        if ('sha384-' + b64(h) !== WORKER_SRI) throw fail('offline');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
        return window.pdfjsLib;
      });
    });
    loading.catch(function () { loading = null; }); // try again next time
    return loading.catch(function (e) { throw e && e.code ? e : fail('offline'); });
  }

  // Text items -> rows: items on the same line (y within 3 units) joined left to right.
  function rowsOf(content) {
    var rows = [];
    content.items.forEach(function (it) {
      if (!it.str || !it.str.trim()) return;
      var y = it.transform[5], x = it.transform[4], row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 3) { row = rows[i]; break; }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, s: it.str });
    });
    return rows.sort(function (a, b) { return b.y - a.y; }).map(function (r) {
      return r.parts.sort(function (a, b) { return a.x - b.x; }).map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' ').trim();
    });
  }

  function read(file, password) {
    return load().then(function (lib) {
      return file.arrayBuffer().then(function (data) {
        return lib.getDocument({ data: new Uint8Array(data), password: password || '', isEvalSupported: false }).promise;
      });
    }).then(function (doc) {
      var lines = [], p = Promise.resolve();
      for (var n = 1; n <= doc.numPages; n++) (function (n) {
        p = p.then(function () { return doc.getPage(n); }).then(function (page) { return page.getTextContent(); }).then(function (c) { lines = lines.concat(rowsOf(c)); });
      })(n);
      return p.then(function () { doc.destroy(); return { lines: lines }; });
    }).catch(function (e) {
      if (e && e.code && /^(password|wrong-password|not-pdf|offline)$/.test(e.code)) throw e;
      if (e && e.name === 'PasswordException') throw fail(e.code === 2 ? 'wrong-password' : 'password');
      if (e && (e.name === 'InvalidPDFException' || e.name === 'FormatError')) throw fail('not-pdf');
      throw fail('not-pdf');
    });
  }

  window.KalingaRxPdf = { read: read, rowsOf: rowsOf };
})();
