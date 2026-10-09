/* Makes tests/fixtures/sample-eprescription.pdf: a MADE-UP prescription
   (fictional patient, clinic and doctor) in the layout of the Maxicare
   e-prescription PDFs, locked with the password "sample123".
     node kalinga/tests/fixtures/make-sample-rx.js
   Needs Playwright (npm i --no-save playwright) and Python with pypdf. */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const MEDS = [
  ['Metformin 500mg Tablet', '500mg', '270', 'Take 1 Tablet 3 times daily for 90 days'],
  ['<b>Sylimarin</b> (Legalon)', '.', '270', 'Take 1 tablet 3 times daily for 90 days'],
  ['Losartan 50mg Tablet', '50mg', '90', 'Take 1 Tablet Once every morning for 90 days'],
  ['Gliclazide 60 mg MR tablet (Diamicron MR)', '60mg', '90', 'Take 1 Tablet Once daily At Noon for 90 days'],
  ['<b>Sitagliptin</b> (Januvia)', '50mg', '180', 'Take 1 tablet 2 times daily After Meals for 90 days'],
  ['<b>Rosuvastatin + Ezetimibe</b> (Rozour)', '20mg/10mg', '90', 'Take 1 tablet Once daily At Night for 90 days'],
  ['Antacid Suspension 10mL Suspension1', '10mL', '30', 'Take 1 Suspension 3 times daily After Meals as needed'],
  ['Esomeprazole 40mg Tablet', '40mg', '14', 'Take 1 Tablet Once daily Before Breakfast for 14 days'],
  ['Mystery Drug', '10mg', '20', 'Use as directed']
];
const html = `<html><body style="font-family:sans-serif;font-size:13px;margin:30px">
<h2 style="color:#3157a6">Sample Clinic</h2><p>PRIMARY CARE CENTER - SAMPLE</p><h3>E-Prescription</h3>
<p><b>Transaction Reference</b>: 00000000</p><p><b>Date/Time</b>: 2026-OCT-06</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><td><b>Patient Name</b>: Juana Dela Cruz</td><td><b>Contact No</b>: 0000000000</td></tr></table>
<h3>Rx</h3>
${MEDS.map((m) => `<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%;margin:12px 0"><tr><td colspan="2">${m[0].startsWith('<') ? m[0] : '<b>' + m[0] + '</b>'}<br>${m[1]}</td></tr><tr><td style="width:30%;text-align:center">${m[2]}</td><td>${m[3]}</td></tr></table>`).join('')}
<p>Certified By:</p><p>Doctor Name: Sample Doctor, MD</p></body></html>`;

(async () => {
  const out = path.join(__dirname, 'sample-eprescription.pdf'), plain = out + '.plain.pdf';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: plain, format: 'A4' });
  await browser.close();
  execFileSync('python', ['-c', [
    'import sys; from pypdf import PdfReader, PdfWriter',
    'r = PdfReader(sys.argv[1]); w = PdfWriter()',
    '[w.add_page(p) for p in r.pages]',
    "w.encrypt(user_password='sample123', owner_password='sample-owner', algorithm='RC4-128')",
    "w.write(open(sys.argv[2], 'wb'))"
  ].join('\n'), plain, out]);
  fs.unlinkSync(plain);
  console.log('wrote', out);
})();
