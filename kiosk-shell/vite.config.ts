import { defineConfig, type Plugin, type Connect } from 'vite'
import react from '@vitejs/plugin-react'
import type { ServerResponse } from 'node:http'

/**
 * Dev-only stub of the wifi-agent HTTP API (frozen contract in
 * docs/ARCHITECTURE.md). In production the wifi-agent serves the built
 * kiosk-shell itself on 127.0.0.1:8080, so /api/* is same-origin and this
 * plugin never runs. Drive the stub through the mock query params below or
 * just use it as-is: it starts "offline", and a POST /api/connect
 * transitions it to connecting → online (or → error for ssid "Fail-Net").
 */
function wifiAgentMock(): Plugin {
  const state = {
    phase: 'offline' as 'offline' | 'connecting' | 'online' | 'error',
    ssid: '',
    connectStartedAt: 0,
  }
  const networks = [
    { ssid: 'ChaosOps-HQ', signal: 92, secured: true },
    { ssid: 'Werkstatt', signal: 71, secured: true },
    { ssid: 'Fail-Net', signal: 55, secured: true },
    { ssid: 'Cafe Gast', signal: 38, secured: false },
  ]
  const json = (res: ServerResponse, body: unknown) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) return next()
    // settle a pending connect after 2.5s
    if (state.phase === 'connecting' && Date.now() - state.connectStartedAt > 2500) {
      state.phase = state.ssid === 'Fail-Net' ? 'error' : 'online'
    }
    if (url.startsWith('/api/status')) {
      const online = state.phase === 'online'
      return json(res, {
        online,
        connected: online,
        ssid: online ? state.ssid : null,
        ip: online ? '192.168.178.42' : null,
        deviceCode: 'GRML-7Q2X',
        // non-contract extra so the dev UI can show the failed state;
        // the real agent reports failures by staying offline.
        error: state.phase === 'error' ? 'invalid-psk' : undefined,
      })
    }
    if (url.startsWith('/api/networks')) return json(res, networks)
    if (url.startsWith('/api/onboarding')) {
      return json(res, {
        qrPayload: 'https://app.chaos-ops.de/kiosk-onboarding?code=GRML-7Q2X',
        humanCode: 'GRML-7Q2X',
      })
    }
    if (url.startsWith('/api/config')) {
      return json(res, { displayUrl: 'https://app.chaos-ops.de/register-display' })
    }
    if (req.method === 'POST' && url.startsWith('/api/connect')) {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const { ssid } = JSON.parse(body || '{}')
        state.phase = 'connecting'
        state.ssid = ssid ?? ''
        state.connectStartedAt = Date.now()
        json(res, { ok: true })
      })
      return
    }
    if (req.method === 'POST' && url.startsWith('/api/forget')) {
      state.phase = 'offline'
      state.ssid = ''
      return json(res, { ok: true })
    }
    return next()
  }
  return {
    name: 'wifi-agent-mock',
    configureServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), wifiAgentMock()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
    // .web.js first so packages shipping prebuilt web variants (e.g.
    // react-native-safe-area-context, pulled in via design/primitives)
    // resolve their web entry instead of a native-only module.
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
    // @chaos-ops-de/design is a file: link; resolve its imports from this
    // app's node_modules and keep a single React instance.
    preserveSymlinks: true,
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react-native-web'],
    // the esbuild pre-bundler has its own extension list (see the same
    // setup in the ChaosOps client vite config).
    esbuildOptions: {
      resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
    },
  },
  server: {
    port: 5173,
  },
})
