/* =========================================================
   Baby Log — files.js
   Photos (prescriptions, lab results, vaccine cards) live in
   IndexedDB: localStorage only holds a few MB. Images are
   shrunk to ~1600 px JPEG before saving, which keeps
   prescriptions readable at a fraction of the size.
   ========================================================= */
(function (root) {
  'use strict';

  var DB = 'babylog-files', STORE = 'photos', dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('This browser can’t store photos.')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function put(id, blob) { return tx('readwrite', function (st) { st.put(blob, id); }).then(function () { return id; }); }
  function get(id) { return tx('readonly', function (st) { return st.get(id); }); }
  function remove(id) { forget(id); return tx('readwrite', function (st) { st.delete(id); }); }
  // Release the decoded image held for a deleted photo.
  function forget(id) { if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } }
  function keys() { return tx('readonly', function (st) { return st.getAllKeys(); }); }

  // Shrink a photo from the camera or gallery to a JPEG Blob.
  function compress(file, maxSide, quality) {
    maxSide = maxSide || 1600; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Couldn’t read that photo.')); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Couldn’t open that photo.')); };
      img.src = url;
    });
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function fromBase64(b64, type) {
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || 'image/jpeg' });
  }

  // Object URLs for <img>, cached per photo id.
  var urls = {};
  function url(id) {
    if (urls[id]) return Promise.resolve(urls[id]);
    return get(id).then(function (b) { if (!b) return null; urls[id] = URL.createObjectURL(b); return urls[id]; });
  }

  // Fill every <img data-photo="id"> on the page.
  function hydrate(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('img[data-photo]:not([src])'), function (img) {
      url(img.getAttribute('data-photo')).then(function (u) { if (u) img.src = u; else img.alt = 'Photo not on this device'; }).catch(function () {});
    });
  }

  // Backups carry photos as base64 so they move between phones.
  function exportAll(ids) {
    var out = {};
    return Promise.all(ids.map(function (id) {
      return get(id).then(function (b) { if (b) return toBase64(b).then(function (s) { out[id] = s; }); });
    })).then(function () { return out; });
  }
  function importAll(map) {
    return Promise.all(Object.keys(map || {}).map(function (id) { return put(id, fromBase64(map[id])); }));
  }

  root.BabyFiles = { put: put, get: get, remove: remove, keys: keys, compress: compress, toBase64: toBase64, url: url, hydrate: hydrate, exportAll: exportAll, importAll: importAll };
})(this);
