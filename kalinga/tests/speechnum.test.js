/* Kalinga — speechnum.js tests.  node kalinga/tests/speechnum.test.js */
'use strict';
const assert = require('assert');
const N = require('../js/speechnum.js');
let count = 0;
function num(text, want) {
  const got = N.parse(text, 'number');
  try { assert.strictEqual(got, want); count++; } catch (e) { console.error('✗ number "' + text + '" →', got, 'numbers:', N.numbers(text)); throw e; }
}
function pair(text, want) {
  const got = N.parse(text, 'pair');
  try { assert.deepStrictEqual(got, want); count++; } catch (e) { console.error('✗ pair "' + text + '" →', got, 'numbers:', N.numbers(text)); throw e; }
}

// Digits (what most speech engines return)
num('185', 185);
num('sugar ko 185', 185);
num('185 mg/dL', 185);
num('185mg', 185);
num('185.', 185);
num('one-eighty-five', 185);
num('Sugar: 185!', 185);
num('36.5', 36.5);
num('36 point 5', 36.5);
num('7,2', 7.2);
num('1,850', 1850); // plausible() rejects it later
// English words
num('one hundred eighty five', 185);
num('one hundred and eighty-five', 185);
num('a hundred eighty five', 185);
num('one eighty-five', 185);
num('one eighty five', 185);
num('my sugar is one twenty', 120);
num('one fifteen', 115);
num('one ten', 110);
num('ninety eight', 98);
num('twenty one', 21);
num('five', 5);
num('two hundred', 200);
num('seven point two', 7.2);
num('ninety eight point six', 98.6);
// Tagalog / Taglish
num("isang daan walumpu't lima", 185);
num('isang daan at walumpu t lima', 185);
num('isang daan walumpung lima', 185);
num("sandaan walumpu't lima", 185);
num('dalawang daan', 200);
num('apat na raan', 400);
num("siyamnapu't walo", 98);
num('isang daan labinlima', 115);
num('isang daan labing-lima', 115);
num('labimpito', 17);
num('sampu', 10);
num("asukal ko ay isang daan at tatlumpu't dalawa", 132);
// Not one clear number
num('', null);
num('hello', null);
num('120 130', null);
num('one two three', null);

// Blood pressure pairs (optionally with pulse)
pair('130 over 80', { sys: 130, dia: 80 });
pair('130/80', { sys: 130, dia: 80 });
pair('one thirty over eighty', { sys: 130, dia: 80 });
pair('one forty over ninety', { sys: 140, dia: 90 });
pair('one ten over seventy', { sys: 110, dia: 70 });
pair('isang daan at tatlumpu over walumpu', { sys: 130, dia: 80 });
pair('130 over 80 pulse 72', { sys: 130, dia: 80, pulse: 72 });
pair('130', null);
pair('nothing here', null);
pair('1 2 3 4', null);

console.log('speechnum.test.js ok (' + count + ' phrases)');
