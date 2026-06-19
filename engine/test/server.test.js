import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Outbox } from '../outbox.js';
import { createApp } from '../server.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-srv-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Kiosk</title>');
  fs.writeFileSync(path.join(root, 'kiosk-data.json'), JSON.stringify({ programs: {} }));
  const outbox = new Outbox(path.join(root, 'data'));
  const server = createApp({ publicDir: root, outbox });
  return { server, outbox };
}

async function listen(server) {
  await new Promise((r) => server.listen(0, r));
  return server.address().port;
}

test('GET / serves index.html', async () => {
  const { server } = setup();
  const port = await listen(server);
  const res = await fetch(`http://localhost:${port}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Kiosk/);
  server.close();
});

test('POST /email with valid body appends to outbox and returns 200', async () => {
  const { server, outbox } = setup();
  const port = await listen(server);
  const res = await fetch(`http://localhost:${port}/email`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'student@email.cpcc.edu', programId: 'cloud-networking' }),
  });
  assert.equal(res.status, 200);
  assert.equal(outbox.pending().length, 1);
  server.close();
});

test('POST /email with bad email returns 400', async () => {
  const { server, outbox } = setup();
  const port = await listen(server);
  const res = await fetch(`http://localhost:${port}/email`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nope', programId: 'x' }),
  });
  assert.equal(res.status, 400);
  assert.equal(outbox.pending().length, 0);
  server.close();
});

test('path-traversal to a sibling directory is blocked (403/404, no leak)', async () => {
  const { server } = setup();
  const port = await listen(server);
  // attempt to escape publicDir to a sibling like <root>-evil
  const res = await fetch(`http://localhost:${port}/..%2f..%2fetc%2fpasswd`);
  assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  const body = await res.text();
  assert.ok(!/root:.*:0:0:/.test(body), 'must not leak /etc/passwd');
  server.close();
});

test('malformed URL returns 400 and server stays up', async () => {
  const { server } = setup();
  const port = await listen(server);
  // `/%` is an invalid percent-encoded sequence — decodeURIComponent throws URIError
  const bad = await fetch(`http://localhost:${port}/%`);
  assert.equal(bad.status, 400);
  // server must remain usable after the bad request
  const good = await fetch(`http://localhost:${port}/`);
  assert.equal(good.status, 200);
  server.close();
});

test('oversized POST body returns 400 and does not append to outbox', async () => {
  const { server, outbox } = setup();
  const port = await listen(server);
  const bigBody = JSON.stringify({ email: 'a@b.co', note: 'x'.repeat(70 * 1024) });
  let status;
  try {
    const res = await fetch(`http://localhost:${port}/email`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: bigBody,
    });
    status = res.status;
  } catch {
    // fetch may throw if the server destroys the socket; that's also acceptable
    status = 400;
  }
  assert.equal(status, 400);
  assert.equal(outbox.pending().length, 0);
  server.close();
});

test('POST /email stores worldId when provided', async () => {
  const { server, outbox } = setup();
  const port = await listen(server);
  const res = await fetch(`http://localhost:${port}/email`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'student@email.cpcc.edu', programId: 'cybersecurity-blueteam', worldId: 'cyber' }),
  });
  assert.equal(res.status, 200);
  assert.equal(outbox.pending()[0].worldId, 'cyber');
  server.close();
});
