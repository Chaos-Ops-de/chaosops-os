import { useEffect, useState } from 'react'
import { Image } from 'react-native'
import { toDataURL } from 'qrcode'
import { usePalette, radii } from '@chaos-ops-de/design'

/** Branded QR code: ink-on-card in the active palette, generous quiet zone. */
export function QrCode({ payload, size }: { payload: string; size: number }) {
  const palette = usePalette()
  const [uri, setUri] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size * 2, // 2x for crisp rendering on the kiosk panel
      color: { dark: palette.ink, light: palette.cardBg },
    }).then((url) => {
      if (!cancelled) setUri(url)
    })
    return () => {
      cancelled = true
    }
  }, [payload, size, palette.ink, palette.cardBg])

  if (!uri) return null
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: radii.md }}
      accessibilityLabel="Onboarding QR code"
    />
  )
}
