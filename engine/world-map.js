// Kiosk "worlds" helpers. The WORLDS data itself lives in each tracks/<id>/track.config.js
// (it is presentation taxonomy, decoupled from the print `family` field in sheets.json).
export function worldForProgram(worlds, id) {
  return worlds.find((w) => w.programIds.includes(id));
}

// Throws if the program list and the world map disagree (extra or missing ids).
export function validateWorldMap(worlds, allIds) {
  const mapped = new Set(worlds.flatMap((w) => w.programIds));
  const missing = allIds.filter((id) => !mapped.has(id));
  const extra = [...mapped].filter((id) => !allIds.includes(id));
  if (missing.length || extra.length) {
    throw new Error(`world-map mismatch — missing: [${missing}] extra: [${extra}]`);
  }
}
