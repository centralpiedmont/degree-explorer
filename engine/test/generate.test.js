// engine/test/generate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadTrack, tracksDir } from '../track.js';
import { buildKioskData } from '../build/generate.js';

async function dataFor(id) {
  const t = await loadTrack(id);
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(tracksDir, id, f), 'utf8'));
  const admPath = path.join(tracksDir, id, 'admissions.json');
  return buildKioskData(t, {
    sheets: rd('sheets.json'), careers: rd('careers.json'), ce: rd('ce.json'),
    quiz: rd('quiz.json'), courseDescs: rd('course-descriptions.json'),
    admissions: fs.existsSync(admPath) ? rd('admissions.json') : null,
  });
}

test('tech build: 14 programs, monorepo sheetUrl, copy+features present', async () => {
  const d = await dataFor('tech');
  assert.equal(d.meta.programCount, 14);
  const p = Object.values(d.programs)[0];
  assert.match(p.sheetUrl, /degree-explorer\/tech\/sheets\/.*\.pdf$/);
  assert.equal(d.copy.topbarLabel, 'Information Technology');
  assert.equal(d.features.admissions, false);
});

test('health build: admissions present on programs that have it', async () => {
  const d = await dataFor('health');
  assert.equal(d.meta.programCount, 16);
  assert.equal(d.features.admissions, true);
  const withАdm = Object.values(d.programs).filter((p) => p.admissions);
  assert.ok(withАdm.length > 0, 'expected some programs to carry admissions');
});

test('business build: 6 programs, monorepo sheetUrl', async () => {
  const d = await dataFor('business');
  assert.equal(d.meta.programCount, 6);
  assert.match(Object.values(d.programs)[0].sheetUrl, /degree-explorer\/business\/sheets\//);
});
