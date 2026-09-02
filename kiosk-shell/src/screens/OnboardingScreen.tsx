import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native'
import {
  Gremlin,
  PillButton,
  StickerCard,
  DashedDivider,
  Text,
  usePalette,
  spacing,
  radii,
  webFontStack,
} from '@chaos-ops-de/design'
import loginGremlin from '@chaos-ops-de/design/assets/gremlins/login.png'
import { QrCode } from '../QrCode'
import { getNetworks, getOnboarding, type Network, type Onboarding, type Status } from '../api'

interface Props {
  status: Status | null
  /** Shown when the menu was opened while already online. */
  online: boolean
  onConnect: (ssid: string, psk: string) => void
  onBackToDisplay: () => void
}

function signalLabel(signal: number): string {
  if (signal >= 75) return '▂▄▆█'
  if (signal >= 50) return '▂▄▆'
  if (signal >= 25) return '▂▄'
  return '▂'
}

export function OnboardingScreen({ status, online, onConnect, onBackToDisplay }: Props) {
  const palette = usePalette()
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null)
  const [networks, setNetworks] = useState<Network[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState<Network | null>(null)
  const [psk, setPsk] = useState('')

  useEffect(() => {
    getOnboarding().then(setOnboarding).catch(() => setOnboarding(null))
  }, [])

  const scan = useCallback(() => {
    setScanning(true)
    getNetworks()
      .then((list) => setNetworks([...list].sort((a, b) => b.signal - a.signal)))
      .catch(() => setNetworks([]))
      .finally(() => setScanning(false))
  }, [])

  useEffect(() => {
    scan()
    const t = setInterval(scan, 15000)
    return () => clearInterval(t)
  }, [scan])

  const submit = () => {
    if (!selected) return
    if (selected.secured && !psk) return
    onConnect(selected.ssid, selected.secured ? psk : '')
  }

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.huge,
        padding: spacing.huge,
      }}
    >
      {/* Left: QR + human code */}
      <StickerCard style={{ padding: spacing.xxxl, alignItems: 'center', gap: spacing.lg, maxWidth: 460 }}>
        <Gremlin source={{ uri: loginGremlin }} name="login" size={120} animation="float" />
        <Text variant="display" size="xxl" style={{ textAlign: 'center' }}>
          Let’s get this kiosk online
        </Text>
        <Text variant="body" muted style={{ textAlign: 'center' }}>
          Scan the QR code with your phone, or pick a WiFi network on the right.
        </Text>
        {onboarding ? (
          <>
            <QrCode payload={onboarding.qrPayload} size={260} />
            <Text variant="body" muted size="sm">
              Setup code
            </Text>
            <Text
              variant="display"
              style={{ fontSize: 56, letterSpacing: 10, color: palette.amber }}
              accessibilityLabel={`Setup code ${onboarding.humanCode}`}
            >
              {onboarding.humanCode}
            </Text>
          </>
        ) : (
          <ActivityIndicator color={palette.amber} size="large" />
        )}
        {status?.deviceCode ? (
          <Text variant="body" muted size="xs">
            Device {status.deviceCode}
          </Text>
        ) : null}
      </StickerCard>

      {/* Right: network picker + connect form */}
      <StickerCard style={{ padding: spacing.xxxl, gap: spacing.md, width: 480, maxHeight: '86%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="display" size="xl">
            Nearby networks
          </Text>
          <PillButton label={scanning ? 'Scanning…' : 'Rescan'} variant="outline" onPress={scan} disabled={scanning} />
        </View>
        {online && status?.ssid ? (
          <Text variant="bodyMedium" style={{ color: palette.green }}>
            Connected to {status.ssid} ({status.ip})
          </Text>
        ) : null}
        <DashedDivider />
        <View style={{ flexShrink: 1, overflow: 'hidden', gap: spacing.xs }}>
          {networks === null ? (
            <ActivityIndicator color={palette.amber} />
          ) : networks.length === 0 ? (
            <Text variant="body" muted>
              No networks found — try rescanning.
            </Text>
          ) : (
            networks.map((n) => {
              const active = selected?.ssid === n.ssid
              return (
                <Pressable
                  key={n.ssid}
                  onPress={() => {
                    setSelected(n)
                    setPsk('')
                  }}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: spacing.md,
                    borderRadius: radii.md,
                    borderWidth: 2,
                    borderColor: active ? palette.amber : palette.border,
                    backgroundColor: active ? palette.chipInactiveBg : palette.cardBg,
                  }}
                >
                  <Text variant={active ? 'bodyBold' : 'bodyMedium'} size="lg">
                    {n.ssid} {n.secured ? '🔒' : ''}
                  </Text>
                  <Text variant="body" muted size="sm">
                    {signalLabel(n.signal)}
                  </Text>
                </Pressable>
              )
            })
          )}
        </View>
        {selected ? (
          <>
            <DashedDivider />
            {selected.secured ? (
              <TextInput
                value={psk}
                onChangeText={setPsk}
                placeholder={`Password for ${selected.ssid}`}
                placeholderTextColor={palette.inkMuted}
                secureTextEntry
                onSubmitEditing={submit}
                style={{
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                  borderWidth: 2,
                  borderRadius: radii.md,
                  padding: spacing.md,
                  fontSize: 18,
                  fontFamily: fontFamilies.body,
                  color: palette.ink,
                }}
              />
            ) : (
              <Text variant="body" muted>
                {selected.ssid} is an open network.
              </Text>
            )}
            <PillButton
              label={`Connect to ${selected.ssid}`}
              onPress={submit}
              disabled={selected.secured && !psk}
            />
          </>
        ) : null}
        {online ? <PillButton label="Back to display" variant="outline" onPress={onBackToDisplay} /> : null}
        <Text variant="body" muted size="xs" style={{ textAlign: 'center' }}>
          Ctrl+Alt+W opens this menu · Ctrl+Alt+R resets the kiosk
        </Text>
      </StickerCard>
    </View>
  )
}
