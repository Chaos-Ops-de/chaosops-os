// Smoke test: full /api contract against the mock NM backend on an ephemeral port.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../src/server.js';

let ctx;
let base;

before(async () => {
  ctx = await startServer({
    CHAOSOPS_NM_BACKEND: 'mock',
    CHAOSOPS_PORT: '0',
    CHAOSOPS_STATE_DIR: mkdtempSync(join(tmpdir(), 'wifi-agent-test-')),
    CHAOSOPS_STATIC_DIR: mkdtempSync(join(tmpdir(), 'wifi-agent-static-')),
    CHAOSOPS_DISPLAY_URL: 'https://example.test/register-display',
  });
  base = `http://127.0.0.1:${ctx.port}`;
});

after(() => ctx.server.close());

const getJson = async (path) => (await fetch(base + path)).json();
const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

test('GET /api/status — offline shape', async () => {
  const s = await getJson('/api/status');
  assert.equal(s.online, false);
  assert.equal(s.connected, false);
  assert.equal(s.ssid, null);
  assert.equal(s.ip, null);
  assert.match(s.deviceCode, /^CHOS-/);
});

test('GET /api/networks — scan list', async () => {
  const nets = await getJson('/api/networks');
  assert.ok(Array.isArray(nets) && nets.length >= 2);
  for (const n of nets) {
    assert.equal(typeof n.ssid, 'string');
    assert.equal(typeof n.signal, 'number');
    assert.equal(typeof n.secured, 'boolean');
  }
});

test('POST /api/connect — validation and success', async () => {
  assert.equal((await post('/api/connect', {})).status, 400);

  const bad = await post('/api/connect', { ssid: 'ChaosOps-Office', psk: 'wrong' });
  assert.equal(bad.status, 500);

  const ok = await post('/api/connect', { ssid: 'ChaosOps-Office', psk: 'hunter22' });
  assert.equal(ok.status, 200);

  const s = await getJson('/api/status');
  assert.equal(s.connected, true);
  assert.equal(s.online, true);
  assert.equal(s.ssid, 'ChaosOps-Office');
  assert.ok(s.ip);
});

test('POST /api/forget — drops connections', async () => {
  const res = await post('/api/forget');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.ok);
  const s = await getJson('/api/status');
  assert.equal(s.connected, false);
});

test('GET /api/onboarding — qrPayload + humanCode', async () => {
  const o = await getJson('/api/onboarding');
  assert.match(o.qrPayload, /^chaosops:\/\/onboard\?device=/);
  assert.match(o.humanCode, /^[A-Z2-9]{6}$/);
  assert.ok(o.qrPayload.includes(o.humanCode));
});

test('GET /api/config — displayUrl from env', async () => {
  const c = await getJson('/api/config');
  assert.equal(c.displayUrl, 'https://example.test/register-display');
});

test('hotkey → SSE: wifi chord broadcasts open-wifi-menu', async () => {
  const controller = new AbortController();
  const sse = await fetch(base + '/api/events', { signal: controller.signal });
  const reader = sse.body.getReader();
  await reader.read(); // ": connected" preamble

  const eventPromise = reader.read();
  const res = await post('/api/hotkey', { chord: 'wifi' });
  assert.equal(res.status, 200);
  const { value } = await eventPromise;
  const text = new TextDecoder().decode(value);
  assert.ok(text.includes('"open-wifi-menu"'), `unexpected SSE frame: ${text}`);
  controller.abort();
});

test('hotkey reset = forget + reset event', async () => {
  await post('/api/connect', { ssid: 'DUNDER-GUEST' });
  assert.equal((await getJson('/api/status')).connected, true);

  const res = await post('/api/hotkey', { chord: 'reset' });
  assert.equal(res.status, 200);
  assert.equal((await getJson('/api/status')).connected, false);

  assert.equal((await post('/api/hotkey', { chord: 'nope' })).status, 400);
});

test('static: placeholder for empty dist, 404-free SPA behaviour', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('kiosk'));
  assert.equal((await fetch(base + '/some/spa/route')).status, 200);
  assert.equal((await fetch(base + '/api/nope')).status, 404);
});
