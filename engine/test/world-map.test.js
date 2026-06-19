// engine/test/world-map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldForProgram, validateWorldMap } from '../world-map.js';

const worlds = [
  { id: 'a', name: 'A', desc: '', color: '#000', text: '#fff', programIds: ['p1', 'p2'] },
  { id: 'b', name: 'B', desc: '', color: '#111', text: '#fff', programIds: ['p3'] },
];

test('worldForProgram finds the owning world', () => {
  assert.equal(worldForProgram(worlds, 'p3').id, 'b');
  assert.equal(worldForProgram(worlds, 'nope'), undefined);
});

test('validateWorldMap passes when sets match', () => {
  assert.doesNotThrow(() => validateWorldMap(worlds, ['p1', 'p2', 'p3']));
});

test('validateWorldMap throws on missing or extra', () => {
  assert.throws(() => validateWorldMap(worlds, ['p1', 'p2']), /extra: \[p3\]/);
  assert.throws(() => validateWorldMap(worlds, ['p1', 'p2', 'p3', 'p9']), /missing: \[p9\]/);
});
