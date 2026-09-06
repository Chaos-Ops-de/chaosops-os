#!/usr/bin/env node
// ChaosOps OS wifi-agent — HTTP API + kiosk-shell static server on 127.0.0.1:8080.
// Zero runtime dependencies (node:http only). See README.md for the API contract.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from './nm/index.js';
import { loadIdentity } from './identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const PLACEHOLDER_HTML = `<!doctype html><meta charset="utf-8"><title>ChaosOps kiosk</title>
<style>body{font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#eee}</style>
<p>wifi-agent is running, but no kiosk-shell build was found.<br>
Set <code>CHAOSOPS_STATIC_DIR</code> to the kiosk-shell <code>dist/</code> directory.</p>`;

export function createApp({ backend, identity, env = process.env }) {
  const displayUrl = env.CHAOSOPS_DISPLAY_URL || 'https://app.chaos-ops.de/register-display';
  const staticDir = resolve(
    env.CHAOSOPS_STATIC_DIR || join(__dirname, '..', '..', 'kiosk-shell', 'dist')
  );

  // SSE clients (kiosk-shell subscribes to /api/events for hotkey signals).
  const sseClients = new Set();
  function broadcast(event) {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) res.write(frame);
  }

  function sendJson(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(data);
  }

  function readJsonBody(req) {
    return new Promise((resolvePromise, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 64 * 1024) {
          reject(new Error('body too large'));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          resolvePromise(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error('invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  async function serveStatic(res, urlPath) {
    // Strip query/hash, prevent traversal, SPA-fallback to index.html.
    let pathname = decodeURIComponent(urlPath.split('?')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = normalize(join(staticDir, pathname));
    if (!filePath.startsWith(staticDir)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    let target = filePath;
    try {
      const s = await stat(target);
      if (s.isDirectory()) target = join(target, 'index.html');
      await stat(target);
    } catch {
      target = join(staticDir, 'index.html'); // SPA fallback
    }
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PLACEHOLDER_HTML);
    }
  }

  async function handle(req, res) {
    const { method } = req;
    const path = req.url.split('?')[0];

    try {
      if (method === 'GET' && path === '/api/status') {
        const s = await backend.status();
        return sendJson(res, 200, { ...s, deviceCode: identity.deviceCode });
      }
      if (method === 'GET' && path === '/api/networks') {
        return sendJson(res, 200, await backend.networks());
      }
      if (method === 'POST' && path === '/api/connect') {
        const { ssid, psk } = await readJsonBody(req);
        if (!ssid || typeof ssid !== 'string') {
          return sendJson(res, 400, { error: 'ssid is required' });
        }
        await backend.connect(ssid, typeof psk === 'string' ? psk : undefined);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'POST' && path === '/api/forget') {
        const removed = await backend.forget();
        return sendJson(res, 200, { ok: true, removed });
      }
      if (method === 'GET' && path === '/api/onboarding') {
        // qrPayload is the seam for a future AP/captive-portal flow: today it
        // encodes the device+human code; the UI just renders it as a QR.
        const qrPayload = `chaosops://onboard?device=${encodeURIComponent(identity.deviceCode)}&code=${identity.humanCode}`;
        return sendJson(res, 200, { qrPayload, humanCode: identity.humanCode });
      }
      if (method === 'GET' && path === '/api/config') {
        return sendJson(res, 200, { displayUrl });
      }
      if (method === 'GET' && path === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write(': connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      if (method === 'POST' && path === '/api/hotkey') {
        // Loopback-only by construction (server binds 127.0.0.1). Called by
        // the hotkey daemon (src/hotkeyd.js); kiosk-shell reacts via SSE.
        const { chord } = await readJsonBody(req);
        if (chord === 'wifi') {
          broadcast({ type: 'open-wifi-menu' });
          return sendJson(res, 200, { ok: true });
        }
        if (chord === 'reset') {
          const removed = await backend.forget();
          broadcast({ type: 'reset' });
          return sendJson(res, 200, { ok: true, removed });
        }
        return sendJson(res, 400, { error: 'chord must be "wifi" or "reset"' });
      }
      if (path.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'not found' });
      }
      if (method !== 'GET' && method !== 'HEAD') {
        return sendJson(res, 405, { error: 'method not allowed' });
      }
      return await serveStatic(res, req.url);
    } catch (err) {
      return sendJson(res, 500, { error: String(err.message || err) });
    }
  }

  return { handle, broadcast, staticDir };
}

export async function startServer(env = process.env) {
  const backend = await createBackend(env);
  const identity = loadIdentity(env);
  const app = createApp({ backend, identity, env });
  const host = env.CHAOSOPS_HOST || '127.0.0.1';
  const port = Number.parseInt(env.CHAOSOPS_PORT || '8080', 10);
  const server = http.createServer(app.handle);
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolvePromise);
  });
  return { server, backend, identity, app, port: server.address().port, host };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(({ backend, host, port, app }) => {
    console.log(`wifi-agent listening on http://${host}:${port} (nm backend: ${backend.name}, static: ${app.staticDir})`);
  }).catch((err) => {
    console.error('wifi-agent failed to start:', err.message);
    process.exit(1);
  });
}
