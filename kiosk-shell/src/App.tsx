import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { usePalette } from '@chaos-ops-de/design'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { StatusScreen } from './screens/StatusScreen'
import { connect, getConfig, getStatus, subscribeEvents, type Config, type Status } from './api'

const STATUS_POLL_MS = 3000
// How long to wait for a connect to turn into an online status before we treat
// it as failed (bad password, out of range, …). The agent reports failure by
// staying offline, so we can't rely on an error field in production.
const CONNECT_TIMEOUT_MS = 25000

export function App() {
  const palette = usePalette()
  const [status, setStatus] = useState<Status | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [menuOpen, setMenuOpen] = useState(() => window.location.hash === '#wifi')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const connectStartedAt = useRef(0)

  // One-shot config fetch (served locally by the agent, works offline too).
  useEffect(() => {
    let cancelled = false
    const load = () =>
      getConfig()
        .then((c) => !cancelled && setConfig(c))
        .catch(() => setTimeout(load, 2000))
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Poll device status forever.
  useEffect(() => {
    let cancelled = false
    const tick = () =>
      getStatus()
        .then((s) => !cancelled && setStatus(s))
        .catch(() => {})
    tick()
    const t = setInterval(tick, STATUS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  // Resolve the connecting phase against incoming status.
  useEffect(() => {
    if (!connecting) return
    if (status?.online) {
      setConnecting(null)
      setConnectError(null)
      return
    }
    const failed = status?.error || Date.now() - connectStartedAt.current > CONNECT_TIMEOUT_MS
    if (failed) {
      setConnecting(null)
      setConnectError(connecting)
    }
  }, [status, connecting])

  // Hotkey signals from the agent (WiFi chord / reset chord) + the /#wifi route.
  useEffect(() => {
    const unsub = subscribeEvents((e) => {
      if (e.type === 'open-wifi-menu') {
        setMenuOpen(true)
      } else if (e.type === 'reset') {
        // The agent has already forgotten the WiFi; drop every transient state
        // and let the next status poll surface the onboarding screen.
        setMenuOpen(false)
        setConnecting(null)
        setConnectError(null)
        getStatus().then(setStatus).catch(() => {})
      }
    })
    const onHash = () => setMenuOpen(window.location.hash === '#wifi')
    window.addEventListener('hashchange', onHash)
    return () => {
      unsub()
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  const onConnect = useCallback((ssid: string, psk: string) => {
    setConnectError(null)
    setConnecting(ssid)
    connectStartedAt.current = Date.now()
    connect(ssid, psk).catch(() => {
      setConnecting(null)
      setConnectError(ssid)
    })
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    if (window.location.hash === '#wifi') window.location.hash = ''
  }, [])

  const online = Boolean(status?.online)

  // ---- Render the primary phase ----
  let primary: React.ReactNode
  if (connectError) {
    primary = (
      <StatusScreen
        gremlin="down"
        title="Couldn’t connect"
        subtitle={`We couldn’t join “${connectError}”. Check the password and try again.`}
        action={{ label: 'Try another network', onPress: () => setConnectError(null) }}
      />
    )
  } else if (connecting) {
    primary = <StatusScreen gremlin="loadingbar" title={`Connecting to ${connecting}…`} subtitle="Getting the kiosk online." />
  } else if (!status || !config) {
    primary = <StatusScreen gremlin="loadingbar" title="Starting ChaosOps…" />
  } else if (online) {
    // Online: the ChaosOps display owns the screen, but the kiosk-shell keeps
    // the top frame (via iframe) so the hotkey/SSE channel stays alive.
    primary = (
      <iframe
        title="ChaosOps Display"
        src={config.displayUrl}
        style={{ border: 'none', width: '100%', height: '100%', display: 'block' }}
        allow="fullscreen"
      />
    )
  } else {
    primary = <OnboardingScreen status={status} online={false} onConnect={onConnect} onBackToDisplay={closeMenu} />
  }

  const showMenuOverlay = online && menuOpen && !connecting && !connectError

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {primary}
      {showMenuOverlay ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.bg }}>
          <OnboardingScreen status={status} online onConnect={onConnect} onBackToDisplay={closeMenu} />
        </View>
      ) : null}
    </View>
  )
}
