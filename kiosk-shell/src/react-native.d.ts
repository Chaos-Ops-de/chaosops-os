/**
 * Minimal ambient types for `react-native`.
 *
 * The kiosk-shell renders on the web via react-native-web (aliased in
 * vite.config.ts). react-native-web ships no type declarations, and pulling in
 * the full `react-native` package just for types would be a huge, version-
 * coupled dependency. Instead we declare the small surface the app and the
 * `@chaos-ops-de/design` primitives actually import. Props are intentionally
 * permissive (index signature + children) so design components — whose own
 * prop types extend these — keep compiling; our real type safety lives in the
 * app's own modules (api.ts, App.tsx).
 */
declare module 'react-native' {
  import type * as React from 'react'

  export type StyleProp<T> = T | T[] | null | undefined | false | Record<string, unknown>
  export interface ViewStyle {
    [key: string]: unknown
  }
  export interface TextStyle extends ViewStyle {}
  export interface ImageStyle extends ViewStyle {}

  export type ImageSourcePropType = number | { uri: string } | Array<{ uri: string }>

  export interface GestureResponderEvent {
    nativeEvent: unknown
    [key: string]: unknown
  }

  interface BaseProps {
    children?: React.ReactNode
    style?: StyleProp<ViewStyle>
    [key: string]: unknown
  }
  export interface ViewProps extends BaseProps {}
  export interface TextProps extends BaseProps {
    style?: StyleProp<TextStyle>
  }
  export interface PressableProps extends BaseProps {
    onPress?: (e?: GestureResponderEvent) => void
    disabled?: boolean
  }
  export interface ImageProps extends BaseProps {
    source?: ImageSourcePropType
    style?: StyleProp<ImageStyle>
  }
  export interface TextInputProps extends BaseProps {
    value?: string
    onChangeText?: (t: string) => void
    onSubmitEditing?: () => void
    placeholder?: string
    placeholderTextColor?: string
    secureTextEntry?: boolean
  }

  export const View: React.FC<ViewProps>
  export const Text: React.FC<TextProps>
  export const Pressable: React.FC<PressableProps>
  export const Image: React.FC<ImageProps>
  export const ScrollView: React.FC<BaseProps>
  export const KeyboardAvoidingView: React.FC<BaseProps & { behavior?: string }>
  export const TextInput: React.FC<TextInputProps>
  export const ActivityIndicator: React.FC<BaseProps & { size?: 'small' | 'large' | number; color?: string }>

  export const Platform: { OS: string; select<T>(spec: Record<string, T>): T | undefined }
  export const StyleSheet: {
    create<T extends Record<string, unknown>>(styles: T): T
    flatten(style?: unknown): Record<string, unknown>
    hairlineWidth: number
    absoluteFill: unknown
  }
}
