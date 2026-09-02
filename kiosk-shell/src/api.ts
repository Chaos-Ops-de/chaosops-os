// Typed client for the frozen wifi-agent HTTP contract (docs/ARCHITECTURE.md).
// Same-origin in production (the agent serves this app); the vite dev mock
// answers the same routes during development.

export interface Status {
  online: boolean
  connected: boolean
  ssid: string | null
  ip: string | null
  deviceCode: string
  /** Dev-mock extra; the real agent reports failure by staying offline. */
  error?: string
}

export interface Network {
  ssid: string
  signal: number
  secured: boolean
}

export interface Onboarding {
  qrPayload: string
  humanCode: string
}

export interface Config {
  displayUrl: string
}

export type AgentEvent = { type: 'open-wifi-menu' } | { type: 'reset' }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export const getStatus = () => get<Status>('/api/status')
export const getNetworks = () => get<Network[]>('/api/networks')
export const getOnboarding = () => get<Onboarding>('/api/onboarding')
export const getConfig = () => get<Config>('/api/config')

export async function connect(ssid: string, psk: string): Promise<void> {
  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid, psk }),
  })
  if (!res.ok) throw new Error(`/api/connect → ${res.status}`)
}

/**
 * Subscribe to the agent's SSE stream (/api/events). Frames are
 * `data: {"type":...}`. Reconnection is handled by EventSource itself.
 * Returns an unsubscribe function.
 */
export function subscribeEvents(onEvent: (e: AgentEvent) => void): () => void {
  const es = new EventSource('/api/events')
  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as AgentEvent
      if (parsed && (parsed.type === 'open-wifi-menu' || parsed.type === 'reset')) {
        onEvent(parsed)
      }
    } catch {
      // ignore malformed frames (e.g. keepalive comments never reach here)
    }
  }
  return () => es.close()
}
