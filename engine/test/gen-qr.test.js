// engine/test/gen-qr.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tracksDir } from '../track.js';
import { execFileSync } from 'node:child_process';

test('gen-qr tech: degree-sheet QR URLs use the monorepo pagesBase', () => {
  execFileSync('node', ['engine/build/gen-qr.js', '--track=tech'], { cwd: path.join(tracksDir, '..') });
  const manifest = JSON.parse(fs.readFileSync(path.join(tracksDir, 'tech', 'assets', 'qr', 'qr-manifest.json'), 'utf8'));
  const sheetEntries = manifest.filter((m) => m.type === 'degree-sheet');
  assert.equal(sheetEntries.length, 14);
  for (const e of sheetEntries) assert.match(e.url, /degree-explorer\/tech\/sheets\/.*\.pdf$/);
  assert.ok(fs.existsSync(path.join(tracksDir, 'tech', 'assets', 'qr', 'info-session.png')));
});
