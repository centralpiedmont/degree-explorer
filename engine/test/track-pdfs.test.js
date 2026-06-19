import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TRACK_IDS, tracksDir } from '../track.js';

const EXPECT = { tech: 14, business: 6, health: 16 };

for (const id of TRACK_IDS) {
  test(`${id}: one degree-sheet PDF per program`, () => {
    const sheets = JSON.parse(fs.readFileSync(path.join(tracksDir, id, 'sheets.json'), 'utf8'));
    const dir = path.join(tracksDir, id, 'sheets');
    const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'));
    assert.equal(pdfs.length, EXPECT[id], `${id} pdf count`);
    for (const s of sheets.sheets) {
      assert.ok(fs.existsSync(path.join(dir, `${s.id}.pdf`)), `${id} missing ${s.id}.pdf`);
    }
  });
}
