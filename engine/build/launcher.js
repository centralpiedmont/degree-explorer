import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const distDir = path.join(repoRoot, 'dist');
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'public', 'launcher.html'), path.join(distDir, 'index.html'));
console.log('Wrote dist/index.html (launcher).');
