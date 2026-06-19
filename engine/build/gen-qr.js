import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { loadTrack, tracksDir } from '../track.js';

const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];
const track = await loadTrack(id);
const trackDir = path.join(tracksDir, id);
const rd = (f) => JSON.parse(fs.readFileSync(path.join(trackDir, f), 'utf8'));

const sheets = rd('sheets.json');
const outDir = path.join(trackDir, 'assets', 'qr');
fs.mkdirSync(outDir, { recursive: true });
const opts = { errorCorrectionLevel: 'M', margin: 3, width: 600, color: { dark: '#000000', light: '#FFFFFF' } };

const manifest = [];
for (const s of sheets.sheets) {
  const url = `${track.pagesBase}/${s.id}.pdf`;
  await QRCode.toFile(path.join(outDir, `${s.id}.png`), url, opts);
  manifest.push({ id: s.id, type: 'degree-sheet', url });
}
await QRCode.toFile(path.join(outDir, 'info-session.png'), track.infoSessionUrl, opts);
manifest.push({ id: 'info-session', type: 'info-session', url: track.infoSessionUrl });

// admissions apply QRs (health)
const admPath = path.join(trackDir, 'admissions.json');
if (fs.existsSync(admPath)) {
  const adm = rd('admissions.json');
  for (const [pid, a] of Object.entries(adm)) {
    if (a && a.applyUrl) {
      await QRCode.toFile(path.join(outDir, `apply-${pid}.png`), a.applyUrl, opts);
      manifest.push({ id: `apply-${pid}`, type: 'apply', url: a.applyUrl });
    }
  }
}

// Continuing Education QRs (tech/business have catalogs; health is empty → skipped)
const ce = rd('ce.json');
if (ce && ce.registerUrl) {
  await QRCode.toFile(path.join(outDir, 'ce-register.png'), ce.registerUrl, opts);
  manifest.push({ id: 'ce-register', type: 'ce-register', url: ce.registerUrl });
}
const COURSE_BASE = 'https://continuinged.cpcc.edu/search/publicCourseSearchDetails.do?method=load&courseId=';
for (const cat of (ce.categories || [])) for (const c of cat.courses) {
  const url = c.url || (c.courseId ? COURSE_BASE + c.courseId : null);
  if (!url) continue;
  await QRCode.toFile(path.join(outDir, `ce-${c.code}.png`), url, opts);
  manifest.push({ id: `ce-${c.code}`, type: 'ce-course', url });
}

fs.writeFileSync(path.join(outDir, 'qr-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Generated ${manifest.length} QR codes for ${id}.`);
