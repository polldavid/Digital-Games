/* Kalinga — colour contrast, both themes, read straight from css/kalinga.css.
   Targets: WCAG 2.2 AA everywhere (text 4.5:1, controls and state 3:1, 1.4.11),
   and AAA 7:1 for body and secondary text, because the users are older adults
   (dad has low vision). Fails the build if a colour change breaks a pair.
     node kalinga/tests/contrast.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'kalinga.css'), 'utf8');
function tokens(start) {
  const end = css.indexOf('}', start), out = {};
  css.slice(start, end).replace(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g, (m, k, v) => { out[k] = v; });
  return out;
}
const light = tokens(css.lastIndexOf(':root', css.indexOf('--bg:')));
const night = Object.assign({}, light, tokens(css.indexOf(':root[data-theme="dark"]')));

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// [foreground, background, minimum, what]  ('#xxxxxx' = a literal colour)
const PAIRS = [
  // body and secondary text: AAA
  ['text', 'bg', 7, 'body text'], ['text', 'card', 7, 'body text on cards'], ['text', 'due-bg', 7, 'due tile label'], ['text', 'info-bg', 7, 'notes'],
  ['text-dim', 'bg', 7, 'secondary text'], ['text-dim', 'card', 7, 'secondary text on cards'], ['text-dim', 'card-2', 7, 'secondary on boxes'], ['text-dim', 'due-bg', 7, 'due tile subtitle'],
  ['brand', 'bg', 7, 'links'], ['brand', 'card', 7, 'links on cards'], ['on-brand', 'brand', 7, 'primary buttons'], ['brand-2', 'brand-soft', 7, 'soft buttons'],
  ['#ffffff', 'alarm', 7, 'ringing dose card header'], ['#ffffff', 'danger', 6, 'danger cards (large bold text)'],
  // hints and status words: at least AA (status words are also bold and paired with icons)
  ['text-faint', 'bg', 5.5, 'hints'], ['text-faint', 'card', 5.5, 'hints on cards'], ['text-faint', 'card-2', 5.5, 'hints on boxes'],
  ['due', 'due-bg', 6, 'due status'], ['ok', 'ok-bg', 6, 'taken status'], ['bad', 'bad-bg', 6, 'alert status'], ['bad', 'bg', 6, 'errors'],
  ['toast-fg', 'toast-bg', 7, 'toasts'], ['toast-link', 'toast-bg', 7, 'toast buttons'], ['on-ok', 'ok', 4.5, 'tick on the "taking" circle'],
  // controls and states: 3:1 (WCAG 1.4.11)
  ['line-strong', 'card', 3, 'input / button borders on cards'], ['line-strong', 'bg', 3, 'input / button borders on the page'], ['line-strong', 'card-2', 3, 'borders in boxes'],
  ['ok-line', 'card', 3, 'dose card "taking" border'], ['due-line', 'due-bg', 3, 'due tile border'], ['bad-line', 'card', 3, 'not-confirmed border'],
  ['focus', 'bg', 3, 'focus ring'], ['focus', 'card', 3, 'focus ring on cards'], ['brand', 'card', 3, 'checkboxes, selected chips']
];

const fails = [];
for (const [name, p] of [['light', light], ['night', night]]) {
  for (const [fg, bg, min, what] of PAIRS) {
    const a = fg[0] === '#' ? fg : p[fg], b = bg[0] === '#' ? bg : p[bg];
    assert.ok(a && b, name + ': missing token ' + (a ? bg : fg));
    const r = ratio(a, b);
    if (r < min) fails.push(name + ': ' + what + ' (' + fg + ' on ' + bg + ') is ' + r.toFixed(2) + ':1, needs ' + min + ':1');
  }
}
assert.deepStrictEqual(fails, [], 'contrast');
console.log('contrast.test.js ok (' + PAIRS.length * 2 + ' pairs)');
