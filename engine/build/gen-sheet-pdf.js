// engine/build/gen-sheet-pdf.js
// OPT-IN authoring tool (NOT part of `npm run build`). Renders a track's sheets.json
// into clean, CPCC-branded one-page degree-sheet PDFs under tracks/<id>/sheets/.
//
// Most tracks vendor professionally-designed PDFs from the AdvisingAndCareerDay
// authoring repo (see sync-data.js). This generator exists for tracks whose program
// data was sourced directly from the CPCC catalog and have no authored PDFs yet
// (e.g. hospitality). Output is functional, not a replacement for the print design.
//
//   node engine/build/gen-sheet-pdf.js --track=hospitality
//
// Requires Google Chrome (headless). Override the binary with CHROME_BIN.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTrack, tracksDir } from '../track.js';
import { degreeLabel, stripHtml } from '../derive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function sheetHtml(track, s) {
  const degree = degreeLabel(s.title);
  const overview = stripHtml(s.overview);
  const terms = s.planOfStudy.map((t) => `
    <table class="term">
      <thead><tr><th colspan="3">${esc(t.term)} <span>${esc(t.termCredits)} credits</span></th></tr></thead>
      <tbody>
        ${t.rows.map((r) => `<tr><td class="code">${esc(r.code)}</td><td class="nm">${esc(r.name)}</td><td class="cr">${esc(r.credits)}</td></tr>`).join('')}
        ${t.note ? `<tr><td class="note" colspan="3">${esc(t.note)}</td></tr>` : ''}
      </tbody>
    </table>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #3A3B3E; }
    .sheet { width: 8.5in; min-height: 11in; padding: 0 0 0.5in; }
    .band { background: #005D83; color: #fff; padding: 0.5in 0.6in 0.34in; border-bottom: 8px solid #B4A269; }
    .band .eyebrow { font-size: 11pt; letter-spacing: .12em; text-transform: uppercase; color: #cfe3ec; }
    .band h1 { font-size: 27pt; font-weight: 800; line-height: 1.04; margin-top: 4px; }
    .band .meta { margin-top: 12px; font-size: 11pt; display: flex; gap: 22px; flex-wrap: wrap; }
    .band .meta b { color: #fff; } .band .meta span { color: #cfe3ec; }
    .body { padding: 0.28in 0.6in 0; }
    .lead { font-size: 11pt; line-height: 1.4; color: #3A3B3E; }
    h2 { color: #005D83; font-size: 12pt; text-transform: uppercase; letter-spacing: .06em;
         margin: 0.2in 0 0.1in; border-bottom: 2px solid #B4A269; padding-bottom: 4px; }
    .terms { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 26px; }
    table.term { width: 100%; border-collapse: collapse; break-inside: avoid; }
    table.term th { background: #54565A; color: #fff; text-align: left; font-size: 10.5pt;
      padding: 5px 8px; font-weight: 700; }
    table.term th span { float: right; font-weight: 600; color: #e7e7e4; }
    table.term td { font-size: 9.7pt; padding: 3px 8px; border-bottom: 1px solid #e7e7e4; vertical-align: top; }
    td.code { color: #005D83; font-weight: 700; white-space: nowrap; width: 1.1in; }
    td.cr { text-align: right; color: #54565A; width: 0.5in; }
    td.note { font-style: italic; color: #6E6E68; font-size: 8.8pt; border-bottom: 0; }
    .foot { margin: 0.3in 0.6in 0; padding-top: 0.16in; border-top: 2px solid #B4A269;
      display: flex; justify-content: space-between; font-size: 9.5pt; color: #54565A; }
    .foot b { color: #005D83; }
  </style></head><body>
    <div class="sheet">
      <div class="band">
        <div class="eyebrow">Central Piedmont &middot; ${esc(track.copy.topbarLabel)}</div>
        <h1>${esc(s.programName)}</h1>
        <div class="meta">
          <span><b>${esc(degree)}</b> Award</span>
          <span><b>${esc(s.totalHours)}</b> Credit hours</span>
          <span><b>${esc(s.code)}</b> Program code</span>
          <span><b>${esc(s.planOfStudy.length)}</b> Semesters</span>
        </div>
      </div>
      <div class="body">
        <p class="lead">${esc(overview)}</p>
        <h2>Plan of Study</h2>
        <div class="terms">${terms}</div>
      </div>
      <div class="foot"><span><b>Central Piedmont Community College</b> &middot; ${esc(s.site)}</span><span>Powering a stronger future.</span></div>
    </div>
  </body></html>`;
}

const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];
if (!id) throw new Error('usage: node engine/build/gen-sheet-pdf.js --track=<id>');
const track = await loadTrack(id);
const trackDir = path.join(tracksDir, id);
const sheets = JSON.parse(fs.readFileSync(path.join(trackDir, 'sheets.json'), 'utf8'));
const outDir = path.join(trackDir, 'sheets');
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'de-pdf-'));

for (const s of sheets.sheets) {
  const htmlPath = path.join(tmp, `${s.id}.html`);
  fs.writeFileSync(htmlPath, sheetHtml(track, s));
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-pdf-header-footer', '--no-sandbox',
    `--print-to-pdf=${path.join(outDir, `${s.id}.pdf`)}`,
    `file://${htmlPath}`,
  ], { stdio: 'ignore' });
  console.log(`  wrote ${id}/sheets/${s.id}.pdf`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Generated ${sheets.sheets.length} degree-sheet PDFs for ${id}.`);
