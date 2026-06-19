import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TRACK_IDS = ['tech', 'business', 'health', 'hospitality'];
export const tracksDir = path.join(__dirname, '..', 'tracks');

const REQUIRED = ['id', 'title', 'fleet', 'pagesBase', 'infoSessionUrl', 'theme', 'features', 'copy', 'worlds'];

export async function loadTrack(id) {
  if (!TRACK_IDS.includes(id)) throw new Error(`unknown track: ${id}`);
  const mod = await import(path.join(tracksDir, id, 'track.config.js'));
  const cfg = mod.default;
  for (const k of REQUIRED) if (cfg[k] == null) throw new Error(`track ${id} missing ${k}`);
  if (cfg.id !== id) throw new Error(`track ${id} config.id mismatch: ${cfg.id}`);
  cfg.tileTint ||= {};
  cfg.tileDesc ||= {};
  return cfg;
}
