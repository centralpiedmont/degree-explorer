// engine/test/track-config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTrack, TRACK_IDS } from '../track.js';

test('all tracks load and have required fields', async () => {
  assert.deepEqual(TRACK_IDS, ['tech', 'business', 'health', 'hospitality']);
  for (const id of TRACK_IDS) {
    const t = await loadTrack(id);
    assert.equal(t.id, id);
    assert.match(t.pagesBase, new RegExp(`degree-explorer/${id}/sheets$`));
    for (const k of ['title', 'fleet', 'infoSessionUrl']) assert.ok(t[k], `${id} missing ${k}`);
    for (const k of ['worldTilePhotos', 'admissions', 'specializations']) {
      assert.equal(typeof t.features[k], 'boolean', `${id} features.${k}`);
    }
    for (const k of ['topbarLabel', 'attractSub', 'infoButton', 'ceHeading', 'resultEyebrow']) {
      assert.ok(t.copy[k], `${id} copy.${k}`);
    }
    assert.ok(Array.isArray(t.worlds) && t.worlds.length, `${id} worlds`);
    for (const w of t.worlds) {
      for (const k of ['id', 'name', 'desc', 'color', 'text', 'programIds']) assert.ok(k in w);
    }
  }
});

test('health enables admissions + specializations; tech/business do not', async () => {
  assert.equal((await loadTrack('health')).features.admissions, true);
  assert.equal((await loadTrack('tech')).features.admissions, false);
  assert.equal((await loadTrack('business')).features.admissions, false);
});
