import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetworkState } from 'expo-network';
import { useTheme } from '../theme';
import type { ReactNode } from 'react';

export function AppText({
  tone = 'text',
  style,
  ...props
}: TextProps & { tone?: 'text' | 'muted' | 'danger' | 'accent' }) {
  const theme = useTheme();
  return (
    <Text
      {...props}
      style={[{ color: theme[tone], fontFamily: 'DMSans', fontSize: 16, lineHeight: 24 }, style]}
    />
  );
}
export function Screen({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const network = useNetworkState();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 48,
            gap: 20,
            maxWidth: 720,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {network.isConnected === false && (
            <Card>
              <AppText tone="danger">
                You’re offline. Cached views may be out of date. Reconnect before saving.
              </AppText>
            </Card>
          )}
          {title && (
            <View style={{ gap: 8 }}>
              <AppText
                accessibilityRole="header"
                style={{
                  fontFamily: 'DMSansBold',
                  fontSize: 30,
                  lineHeight: 38,
                  letterSpacing: -1,
                }}
              >
                {title}
              </AppText>
              {subtitle && <AppText tone="muted">{subtitle}</AppText>}
            </View>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 20,
          padding: 20,
          gap: 12,
        },
        style,
      ]}
    />
  );
}
export function AppButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const theme = useTheme();
  const background = variant === 'primary' ? theme.accent : theme.surface;
  const color =
    variant === 'primary' ? theme.onAccent : variant === 'danger' ? theme.danger : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: 14,
        borderWidth: variant === 'primary' ? 0 : 1,
        borderColor: theme.border,
        backgroundColor: background,
        opacity: disabled || loading ? 0.55 : pressed ? 0.75 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
      })}
    >
      {loading && <ActivityIndicator color={color} />}
      <AppText style={{ color, fontFamily: 'DMSansBold', textAlign: 'center' }}>{title}</AppText>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <AppText>{label}</AppText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        style={[
          {
            minHeight: 54,
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
            borderWidth: 1,
            padding: 14,
            borderRadius: 12,
            fontSize: 16,
            fontFamily: 'DMSans',
          },
          props.style,
        ]}
      />
      {error && (
        <AppText tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      )}
    </View>
  );
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <AppText>{label}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === value }}
            onPress={() => onChange(option.value)}
            style={{
              padding: 12,
              minHeight: 48,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: option.value === value ? theme.accent : theme.border,
              backgroundColor: option.value === value ? theme.accentSoft : theme.surface,
            }}
          >
            <AppText style={{ fontFamily: option.value === value ? 'DMSansBold' : 'DMSans' }}>
              {option.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Feedback({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Card>
      <AppText tone="danger" accessibilityRole="alert">
        {error instanceof Error ? error.message : 'Unable to load your records.'}
      </AppText>
      {retry && <AppButton title="Try again" variant="secondary" onPress={retry} />}
    </Card>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator />
      <AppText tone="muted">Loading your records…</AppText>
    </View>
  );
}
