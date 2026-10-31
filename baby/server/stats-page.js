// The private usage page served at /stats. It holds no data itself: it asks for
// the stats key (kept in this browser only) and reads /v1/stats with it.
export const STATS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Alaga usage</title>
<style>
  :root { color-scheme: light; --surface: #fcfcfb; --card: #ffffff; --line: #e6e5e0; --grid: #ecebe6;
    --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #6f6e69; --series-1: #2a78d6; --focus: #2a78d6; }
  @media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { color-scheme: dark; --surface: #1a1a19; --card: #232322;
    --line: #3a3a37; --grid: #2f2f2d; --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #a3a29a; --series-1: #3987e5; --focus: #3987e5; } }
  :root[data-theme="dark"] { color-scheme: dark; --surface: #1a1a19; --card: #232322; --line: #3a3a37; --grid: #2f2f2d;
    --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #a3a29a; --series-1: #3987e5; --focus: #3987e5; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface); color: var(--text-primary); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: var(--text-secondary); margin: 0 0 20px; font-size: 14px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .tile .k { color: var(--text-secondary); font-size: 13px; }
  .tile .v { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .tile .h { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 15px; margin: 0 0 2px; }
  .card .note { color: var(--text-secondary); font-size: 13px; margin: 0 0 10px; }
  .chart { position: relative; }
  .chart svg { display: block; width: 100%; height: auto; }
  .tip { position: absolute; pointer-events: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 13px;
    box-shadow: 0 4px 14px rgba(0,0,0,.12); white-space: nowrap; transform: translate(-50%, -100%); }
  .tip b { font-variant-numeric: tabular-nums; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); }
  th { color: var(--text-secondary); font-weight: 600; font-size: 12px; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  details summary { cursor: pointer; color: var(--text-secondary); font-size: 14px; }
  form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  input { flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text-primary); font: inherit; }
  button { padding: 10px 16px; border: 0; border-radius: 8px; background: var(--series-1); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .muted { color: var(--text-muted); }
</style>
</head>
<body>
<main>
  <h1>Alaga usage</h1>
  <p class="sub" id="sub">Anonymous daily counts — no IDs, nothing about anyone's baby.</p>
  <div id="out"></div>
</main>
<script>
(function () {
  var out = document.getElementById('out');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getKey() {
    var m = /key=([^&]+)/.exec(location.hash);
    if (m) { try { localStorage.setItem('alaga-stats-key', decodeURIComponent(m[1])); } catch (e) {} history.replaceState(null, '', location.pathname); }
    try { return localStorage.getItem('alaga-stats-key') || ''; } catch (e) { return ''; }
  }
  function askKey(msg) {
    out.innerHTML = '<div class="card"><h2>Enter the stats key</h2><p class="note">' + esc(msg || 'It is kept in this browser only.') + '</p>' +
      '<form id="f"><input id="k" type="password" autocomplete="off" placeholder="Stats key" aria-label="Stats key"><button>Show stats</button></form></div>';
    document.getElementById('f').onsubmit = function (e) { e.preventDefault(); try { localStorage.setItem('alaga-stats-key', document.getElementById('k').value.trim()); } catch (x) {} load(); };
  }
  function load() {
    var key = getKey();
    if (!key) return askKey();
    out.innerHTML = '<p class="muted">Loading…</p>';
    fetch('/v1/stats', { headers: { Authorization: 'Bearer ' + key } }).then(function (r) {
      if (r.status === 401) { try { localStorage.removeItem('alaga-stats-key'); } catch (e) {} askKey('That key did not work.'); return null; }
      return r.json();
    }).then(function (d) { if (d) render(d); }).catch(function () { out.innerHTML = '<p>Could not load the stats. Check the connection and reload.</p>'; });
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function sum(rows, k) { return rows.reduce(function (a, r) { return a + (+r[k] || 0); }, 0); }
  function fmtDay(s) { var d = new Date(s + 'T00:00:00Z'); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); }

  function render(d) {
    var byDay = {}; d.daily.forEach(function (r) { byDay[r.day] = r; });
    var now = Date.now(), today = iso(now);
    var days = []; for (var i = 29; i >= 0; i--) { var k = iso(now - i * 864e5); days.push(byDay[k] || { day: k, active: 0, installs: 0, week_new: 0, month_new: 0, sharing: 0 }); }
    var dow = (new Date().getUTCDay() + 6) % 7, weekStart = iso(now - dow * 864e5), monthStart = today.slice(0, 8) + '01';
    var t = byDay[today] || { active: 0 };
    var week = sum(d.daily.filter(function (r) { return r.day >= weekStart; }), 'week_new');
    var month = sum(d.daily.filter(function (r) { return r.day >= monthStart; }), 'month_new');
    var inst30 = sum(days, 'installs');
    var fam = d.sharedLogs || { total: 0, active7: 0 };
    var tile = function (k, v, h) { return '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="h">' + h + '</div></div>'; };
    var html = '<div class="kpis">' +
      tile('Used today', +t.active || 0, 'phones, so far (UTC day)') +
      tile('This week', week, 'different phones since Monday') +
      tile('This month', month, 'different phones since the 1st') +
      tile('New installs', inst30, 'last 30 days') +
      tile('Shared logs', (+fam.active7 || 0) + ' <span class="muted" style="font-size:16px">/ ' + (+fam.total || 0) + '</span>', 'with a change in 7 days / all') +
      '</div>';
    html += '<div class="card"><h2>Phones using Alaga each day</h2><p class="note">Last 30 days (UTC). Hover a bar for the day’s numbers.</p><div class="chart" id="chart"></div>' +
      '<details style="margin-top:10px"><summary>Show as a table</summary><table><thead><tr><th>Day</th><th class="n">Used</th><th class="n">New installs</th><th class="n">Sharing on</th></tr></thead><tbody>' +
      days.slice().reverse().map(function (r) { return '<tr><td>' + fmtDay(r.day) + '</td><td class="n">' + (+r.active || 0) + '</td><td class="n">' + (+r.installs || 0) + '</td><td class="n">' + (+r.sharing || 0) + '</td></tr>'; }).join('') +
      '</tbody></table></details></div>';
    var table = function (title, rows, label, fmt) {
      return '<div class="card"><h2>' + title + '</h2><p class="note">Last 90 days. “Phone-days” = one phone using Alaga on one day.</p><table><thead><tr><th>' + label + '</th><th class="n">Phone-days</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (r) { return '<tr><td>' + esc(fmt(r)) + '</td><td class="n">' + (+r.active || 0) + '</td></tr>'; }).join('') : '<tr><td colspan="2" class="muted">No data yet</td></tr>') + '</tbody></table></div>';
    };
    var PL = { 'web': 'Web browser', 'web-app': 'Web, installed', 'ios-web': 'iPhone, Safari', 'ios-home': 'iPhone, Home Screen', 'android-app': 'Android app', 'other': 'Other' };
    html += '<div class="grid2">' + table('By platform', d.platforms, 'Platform', function (r) { return PL[r.platform] || r.platform; }) +
      table('By country', d.countries, 'Country', function (r) { return r.country === 'XX' ? 'Unknown' : r.country; }) +
      table('By app version', d.versions, 'Version', function (r) { return r.version ? 'v' + r.version : 'unknown'; }) + '</div>';
    out.innerHTML = html;
    document.getElementById('sub').textContent = 'Anonymous daily counts — no IDs, nothing about anyone’s baby. Updated ' + new Date(d.generated).toLocaleString() + '.';
    drawChart(document.getElementById('chart'), days);
  }

  function drawChart(el, days) {
    var W = 860, H = 240, L = 36, R = 8, T = 12, B = 28;
    var max = Math.max(4, Math.max.apply(null, days.map(function (r) { return +r.active || 0; })));
    var step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
    if (top / step > 5) step = step * 2; top = Math.ceil(max / step) * step;
    var bw = (W - L - R) / days.length, gap = Math.max(2, bw * 0.25);
    var y = function (v) { return T + (H - T - B) * (1 - v / top); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Phones using Alaga each day, last 30 days">';
    for (var v = 0; v <= top; v += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)"/>' +
      '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--text-muted)">' + v + '</text>';
    days.forEach(function (r, i) {
      var x = L + i * bw + gap / 2, w = bw - gap, val = +r.active || 0, yy = y(val), h = (H - B) - yy, rad = Math.min(4, w / 2, h);
      if (val > 0) s += '<path d="M' + x + ' ' + (H - B) + 'V' + (yy + rad) + 'q0 -' + rad + ' ' + rad + ' -' + rad + 'H' + (x + w - rad) + 'q' + rad + ' 0 ' + rad + ' ' + rad + 'V' + (H - B) + 'Z" fill="var(--series-1)"/>';
      s += '<rect class="hit" data-i="' + i + '" x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent" tabindex="0"/>';
      if (i % 5 === 4 || i === days.length - 1) s += '<text x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">' + fmtDay(r.day) + '</text>';
    });
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/></svg><div class="tip" hidden></div>';
    el.innerHTML = s;
    var tip = el.querySelector('.tip'), svg = el.querySelector('svg');
    var show = function (t) {
      var r = days[+t.getAttribute('data-i')], box = t.getBoundingClientRect(), host = el.getBoundingClientRect();
      tip.innerHTML = fmtDay(r.day) + ': <b>' + (+r.active || 0) + '</b> phones · ' + (+r.installs || 0) + ' new';
      tip.style.left = (box.left - host.left + box.width / 2) + 'px'; tip.style.top = (box.top - host.top + 8) + 'px'; tip.hidden = false;
    };
    svg.addEventListener('mouseover', function (e) { if (e.target.classList.contains('hit')) show(e.target); });
    svg.addEventListener('focusin', function (e) { if (e.target.classList.contains('hit')) show(e.target); });
    svg.addEventListener('mouseleave', function () { tip.hidden = true; });
  }
  load();
})();
</script>
</body>
</html>`;
