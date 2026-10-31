/* =========================================================
   Local dev server: serves the static site and mounts the
   /api/room function with in-memory storage — online rooms
   work on your own machine (open several browser windows)
   without Vercel or Redis.

     node scripts/dev.js            → http://localhost:3000
     PORT=8080 node scripts/dev.js
   ========================================================= */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var room = require('../api/room.js');

var ROOT = path.resolve(__dirname, '..');
var PORT = +process.env.PORT || 3000;
var TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8'
};

http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://local');
  if (url.pathname === '/api/room') return room(req, res);

  var file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT) || file.includes(path.sep + '.git')) { res.statusCode = 403; return res.end('Forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.statusCode = 301; res.setHeader('Location', url.pathname + '/' + url.search); return res.end(); }
    file = path.join(file, 'index.html');
  }
  fs.readFile(file, function (err, data) {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, function () {
  console.log('Digital Games running at http://localhost:' + PORT + '  (online rooms use in-memory storage)');
});
