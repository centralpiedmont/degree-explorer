import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldForProgram, validateWorldMap } from '../world-map.js';
import { degreeLabel, shortLead, formatSalary, skillChips, learnNarrative, stripHtml } from '../derive.js';
import { loadTrack, tracksDir } from '../track.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const normCode = (c) => String(c || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

function buildCE(ce) {
  if (!ce || !(ce.categories && ce.categories.length)) return null; // self-hide on empty
  return {
    label: stripHtml(ce.label), short: stripHtml(ce.short), tagline: stripHtml(ce.tagline),
    tileDesc: 'Short courses and industry certifications',
    color: ce.color, text: ce.text, registerUrl: ce.registerUrl,
    photo: 'assets/photos/ce.jpg', qrFile: 'assets/qr/ce-register.png',
    categories: ce.categories.map((c) => ({
      name: stripHtml(c.name),
      courses: c.courses.map((x) => ({
        code: x.code, name: stripHtml(x.name), price: x.price || null, hours: x.hours || null,
        desc: x.desc ? stripHtml(x.desc) : '',
        qrFile: (x.courseId || x.url) ? `assets/qr/ce-${x.code}.png` : null,
      })),
    })),
  };
}

function buildQuiz(quiz, worldIds) {
  if (!quiz) return null;
  for (const q of quiz.questions) for (const a of q.answers) {
    if (!worldIds.has(a.world)) throw new Error(`quiz answer world not a real world: ${a.world}`);
    if (!quiz.archetypes[a.world]) throw new Error(`quiz answer world has no archetype: ${a.world}`);
  }
  return quiz;
}

export function buildKioskData(track, { sheets, careers, ce, quiz, admissions, courseDescs }) {
  const worlds = track.worlds;
  const descs = courseDescs || {};
  validateWorldMap(worlds, sheets.sheets.map((s) => s.id));
  const programs = {};
  for (const s of sheets.sheets) {
    const world = worldForProgram(worlds, s.id);
    const careerRows = (careers.programs[s.id] || []).map((c) => ({
      title: c.title, salaryText: formatSalary(c.medianUSD), soc: c.soc,
    }));
    const tint = track.tileTint[s.id] || { color: world.color, text: world.text };
    programs[s.id] = {
      id: s.id, world: world.id, tileColor: tint.color, tileText: tint.text,
      tileDesc: track.tileDesc[s.id] || '',
      name: stripHtml(s.programName),
      track: s.concentration ? stripHtml(s.concentration).replace(/ ?(Career Track|Concentration).*$/i, '') : '',
      degree: degreeLabel(s.title), code: s.code,
      totalHours: Number.isFinite(Number(s.totalHours)) ? Number(s.totalHours) : String(s.totalHours),
      semesters: s.planOfStudy.length,
      lead: shortLead(s.overview), learn: learnNarrative(s.overview), skills: skillChips(s.planOfStudy),
      specializations: (s.specializations || []).map((x) => ({ name: stripHtml(x.name), code: x.code })),
      careers: careerRows,
      planOfStudy: s.planOfStudy.map((t) => ({
        term: t.term, termCredits: t.termCredits, note: t.note ? stripHtml(t.note) : '',
        rows: t.rows.map((r) => {
          const info = descs[normCode(r.code)];
          return { code: r.code, name: stripHtml(r.name), credits: r.credits, desc: info ? info.desc : '' };
        }),
      })),
      heroFile: `assets/heroes/${s.hero || s.id + '.jpg'}`,
      qrFile: `assets/qr/${s.id}.png`,
      sheetUrl: `${track.pagesBase}/${s.id}.pdf`,
      admissions: (admissions && admissions[s.id]) || null,
      applyQrFile: (admissions && admissions[s.id] && admissions[s.id].applyUrl) ? `assets/qr/apply-${s.id}.png` : null,
    };
  }
  return {
    meta: { track: track.id, programCount: Object.keys(programs).length },
    copy: track.copy,
    features: track.features,
    worlds: worlds.map((w) => ({ id: w.id, name: w.name, desc: w.desc, color: w.color, text: w.text, programIds: w.programIds })),
    programs,
    infoSession: { url: track.infoSessionUrl, qrFile: 'assets/qr/info-session.png' },
    ce: buildCE(ce),
    quiz: buildQuiz(quiz, new Set(sheets.sheets.map((s) => worldForProgram(worlds, s.id).id))),
  };
}

function copyDir(from, to, exts) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, f.name), dst = path.join(to, f.name);
    if (f.isDirectory()) copyDir(src, dst, exts);
    else if (!exts || exts.test(f.name)) fs.copyFileSync(src, dst);
  }
}

function copyAssets(trackDir, outDir) {
  copyDir(path.join(trackDir, 'assets'), path.join(outDir, 'assets'), null); // heroes, qr, photos, fonts, fontawesome, logo
  // degree-sheet PDFs → dist/<id>/sheets/
  copyDir(path.join(trackDir, 'sheets'), path.join(outDir, 'sheets'), /\.pdf$/i);
  // shared front-end
  copyDir(path.join(__dirname, '..', 'public'), outDir, /\.(html|js|css)$/i);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];
  const track = await loadTrack(id);
  const trackDir = path.join(tracksDir, id);
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(trackDir, f), 'utf8'));
  const admPath = path.join(trackDir, 'admissions.json');
  const data = buildKioskData(track, {
    sheets: rd('sheets.json'), careers: rd('careers.json'), ce: rd('ce.json'),
    quiz: rd('quiz.json'), courseDescs: rd('course-descriptions.json'),
    admissions: fs.existsSync(admPath) ? rd('admissions.json') : null,
  });
  const outDir = path.join(repoRoot, 'dist', id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'kiosk-data.json'), JSON.stringify(data, null, 2));
  copyAssets(trackDir, outDir);
  // per-track <title> in index.html
  const idx = path.join(outDir, 'index.html');
  if (fs.existsSync(idx)) {
    fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/<title>.*<\/title>/, `<title>${track.title}</title>`));
  }
  console.log(`Built dist/${id} (${data.meta.programCount} programs).`);
}
