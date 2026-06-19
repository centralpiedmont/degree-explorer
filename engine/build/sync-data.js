import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const SRC = process.env.DE_SOURCE_ROOT || path.join(repoRoot, '..', 'AdvisingAndCareerDay');
const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];

const MAP = {
  tech:     { sheets: 'degree-sheets/build/sheets.json',          pdfs: 'cpcc-it-degree-sheets/sheets' },
  business: { sheets: 'degree-sheets/build/sheets-business.json', pdfs: 'cpcc-it-degree-sheets/business' },
  health:   { sheets: 'degree-sheets/build/sheets-health.json',   pdfs: 'degree-sheets/kiosk-health/public/sheets' },
  hospitality: { sheets: 'degree-sheets/build/sheets-hospitality.json', pdfs: 'degree-sheets/kiosk-hospitality/public/sheets' },
};
const m = MAP[id];
if (!m) throw new Error('usage: node engine/build/sync-data.js --track=tech|business|health|hospitality');

fs.copyFileSync(path.join(SRC, m.sheets), path.join(repoRoot, 'tracks', id, 'sheets.json'));
const pdfSrc = path.join(SRC, m.pdfs), pdfDst = path.join(repoRoot, 'tracks', id, 'sheets');
fs.mkdirSync(pdfDst, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(pdfSrc)) if (f.endsWith('.pdf')) { fs.copyFileSync(path.join(pdfSrc, f), path.join(pdfDst, f)); n++; }
console.log(`Synced ${id}: sheets.json + ${n} PDFs from ${SRC}. Re-run npm run build:${id} and verify.`);
