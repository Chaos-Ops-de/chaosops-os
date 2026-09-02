import { View } from 'react-native'
import { Gremlin, StickerCard, PillButton, Text } from '@chaos-ops-de/design/primitives'
import { usePalette, spacing } from '@chaos-ops-de/design'
import type { GremlinName } from '@chaos-ops-de/design/primitives'
import loadingGremlin from '@chaos-ops-de/design/assets/gremlins/loadingbar.png'
import downGremlin from '@chaos-ops-de/design/assets/gremlins/down.png'

const sources: Partial<Record<GremlinName, string>> = {
  loadingbar: loadingGremlin,
  down: downGremlin,
}

/**
 * Full-screen branded status card used for the connecting and error phases.
 * Kept deliberately calm — an unattended kiosk has nobody to reassure but the
 * room it hangs in.
 */
export function StatusScreen({
  gremlin,
  title,
  subtitle,
  action,
}: {
  gremlin: GremlinName
  title: string
  subtitle?: string
  action?: { label: string; onPress: () => void }
}) {
  const palette = usePalette()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.huge }}>
      <StickerCard style={{ padding: spacing.huge, alignItems: 'center', gap: spacing.lg, maxWidth: 520 }}>
        <Gremlin source={{ uri: sources[gremlin] ?? downGremlin }} name={gremlin} size={140} animation="none" />
        <Text variant="display" size="xxl" style={{ textAlign: 'center' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" muted style={{ textAlign: 'center', color: palette.inkMuted }}>
            {subtitle}
          </Text>
        ) : null}
        {action ? <PillButton label={action.label} onPress={action.onPress} /> : null}
      </StickerCard>
    </View>
  )
}
