// engine/test/track-data.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadTrack, TRACK_IDS, tracksDir } from '../track.js';
import { validateWorldMap } from '../world-map.js';

const readJson = (id, f) => JSON.parse(fs.readFileSync(path.join(tracksDir, id, f), 'utf8'));
const EXPECT = { tech: 14, business: 6, health: 16, hospitality: 5 };

for (const id of TRACK_IDS) {
  test(`${id}: sheets.json parses, has ${EXPECT[id]} programs, and matches the world map`, async () => {
    const t = await loadTrack(id);
    const sheets = readJson(id, 'sheets.json');
    assert.ok(Array.isArray(sheets.sheets));
    assert.equal(sheets.sheets.length, EXPECT[id]);
    assert.doesNotThrow(() => validateWorldMap(t.worlds, sheets.sheets.map((s) => s.id)));
  });

  test(`${id}: careers/quiz/ce/course-descriptions parse`, () => {
    for (const f of ['careers.json', 'quiz.json', 'ce.json', 'course-descriptions.json']) {
      assert.doesNotThrow(() => readJson(id, f), `${id}/${f}`);
    }
  });
}

test('health: admissions.json parses', () => {
  assert.doesNotThrow(() => readJson('health', 'admissions.json'));
});
