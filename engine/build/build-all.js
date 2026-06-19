import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACK_IDS } from '../track.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const run = (args) => execFileSync('node', args, { cwd: path.join(__dirname, '..', '..'), stdio: 'inherit' });

for (const id of TRACK_IDS) {
  run(['engine/build/generate.js', `--track=${id}`]); // copies front-end + assets + pdfs
  run(['engine/build/gen-qr.js', `--track=${id}`]);    // writes QR pngs into tracks/<id>/assets/qr
  run(['engine/build/generate.js', `--track=${id}`]); // re-copy so QR pngs land in dist
}
run(['engine/build/launcher.js']);
console.log('Built all tracks + launcher into dist/.');
