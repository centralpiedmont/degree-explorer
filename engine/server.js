import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Outbox } from './outbox.js';
import nodemailer from 'nodemailer';
import { drainOutbox } from './mailer.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
};

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let b = '', len = 0;
    req.on('data', (c) => {
      len += c.length;
      if (len > limit) { req.destroy(); reject(new Error('body too large')); return; }
      b += c;
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

export function createApp({ publicDir, outbox }) {
  return http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/email') {
      try {
        const { email, programId, worldId } = JSON.parse(await readBody(req));
        outbox.appendLead({ email, programId, worldId });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
      return;
    }
    // static
    let urlPath;
    try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('Bad request'); return; }
    let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const safeRoot = path.normalize(publicDir);
    const filePath = path.normalize(path.join(publicDir, rel));
    if (filePath !== safeRoot && !filePath.startsWith(safeRoot + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const track = process.env.KIOSK_TRACK || 'tech';
  const publicDir = path.resolve(__dirname, `../dist/${track}`);
  const dataDir = process.env.KIOSK_DATA_DIR || path.join(__dirname, '..', 'data');
  const outbox = new Outbox(dataDir);
  const port = Number(process.env.PORT || 8080);

  const kioskData = JSON.parse(fs.readFileSync(path.join(publicDir, 'kiosk-data.json'), 'utf8'));
  const transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined })
    : { send: async () => { throw new Error('no SMTP configured'); } };
  const mailFrom = process.env.MAIL_FROM || 'no-reply@cpcc.edu';
  const wrapped = { send: (m) => transport.sendMail ? transport.sendMail({ from: mailFrom, ...m }) : transport.send(m) };
  const mailCtx = { programs: kioskData.programs, archetypes: (kioskData.quiz && kioskData.quiz.archetypes) || {}, infoSessionUrl: (kioskData.infoSession && kioskData.infoSession.url) || '' };
  setInterval(() => drainOutbox(outbox, wrapped, mailCtx)
    .then((n) => n && console.log(`drained ${n} emails`)).catch((e) => console.error('drain failed:', e && e.message || e)), 60_000);

  createApp({ publicDir, outbox }).listen(port, () => console.log(`Kiosk [${track}] on :${port}`));
}
