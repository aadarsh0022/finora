import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
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
import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useApp } from '../providers/app-provider';
import { usePendingTransactions } from '../storage/hooks';

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
  onRefresh,
  bottomAction,
  floatingAction,
  includeTopInset = true,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  bottomAction?: ReactNode;
  floatingAction?: ReactNode;
  includeTopInset?: boolean;
}) {
  const theme = useTheme();
  const network = useNetworkState();
  const [refreshing, setRefreshing] = useState(false);
  const { user, vault, storageError } = useApp();
  async function refresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <SafeAreaView
      edges={includeTopInset ? ['top', 'left', 'right'] : ['left', 'right']}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="screen-content"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void refresh();
                }}
                tintColor={theme.accent}
                colors={[theme.accent]}
              />
            ) : undefined
          }
          contentContainerStyle={{
            padding: 20,
            paddingBottom: floatingAction ? 104 : bottomAction ? 24 : 40,
            gap: 20,
            maxWidth: 720,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {network.isConnected === false && (
            <Card>
              <AppText tone="danger">
                {vault
                  ? 'You’re offline. Previously loaded records are available. New transactions can be saved for sync; other changes need a connection.'
                  : 'You’re offline. Cached views may be out of date. Reconnect before saving.'}
              </AppText>
            </Card>
          )}
          {user && storageError ? (
            <AppText tone="danger" style={{ fontSize: 13 }}>
              {storageError}
            </AppText>
          ) : null}
          {user && vault && <PendingStatus />}
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
        {floatingAction && (
          <View style={{ position: 'absolute', right: 20, bottom: 20 }}>{floatingAction}</View>
        )}
        {bottomAction && (
          <SafeAreaView
            edges={['bottom']}
            style={{
              backgroundColor: theme.surface,
              borderTopWidth: 1,
              borderTopColor: theme.border,
            }}
          >
            <View
              style={{ padding: 16, gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}
            >
              {bottomAction}
            </View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function PendingStatus() {
  const pending = usePendingTransactions();
  const theme = useTheme();
  if (pending.error)
    return (
      <AppText tone="danger">
        Pending entries could not be read. Keep this device and contact support.
      </AppText>
    );
  if (!pending.data?.length) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View pending sync"
      onPress={() => router.push('/sync')}
      style={{ padding: 12, backgroundColor: theme.accentSoft, borderRadius: 12 }}
    >
      <AppText style={{ fontSize: 13 }}>
        {pending.data.length} {pending.data.length === 1 ? 'entry' : 'entries'} waiting for sync ·
        View details
      </AppText>
    </Pressable>
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
          borderRadius: 18,
          padding: 18,
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
  hint,
  trailingAction,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string; trailingAction?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>
      <View>
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
              paddingRight: trailingAction ? 54 : 14,
              borderRadius: 12,
              fontSize: 16,
              fontFamily: 'DMSans',
            },
            props.style,
          ]}
        />
        {trailingAction && (
          <View
            style={{ position: 'absolute', right: 5, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            {trailingAction}
          </View>
        )}
      </View>
      {error && (
        <AppText tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      )}
      {!error && hint ? (
        <AppText tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
          {hint}
        </AppText>
      ) : null}
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
export function Loading({ variant = 'list' }: { variant?: 'list' | 'dashboard' | 'form' }) {
  const theme = useTheme();
  const block = { backgroundColor: theme.border, borderRadius: 6 };
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your records"
      accessibilityState={{ busy: true }}
      style={{ width: '100%', gap: 12 }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: 12 }}
      >
        {variant === 'dashboard' && (
          <Card style={{ minHeight: 164, justifyContent: 'center', gap: 18 }}>
            <View style={[block, { width: '38%', height: 14 }]} />
            <View style={[block, { width: '65%', height: 36 }]} />
            <View style={[block, { width: '48%', height: 12 }]} />
          </Card>
        )}
        {Array.from({ length: 3 }, (_, index) => (
          <Card
            key={index}
            style={{
              flexDirection: variant === 'form' ? 'column' : 'row',
              alignItems: variant === 'form' ? 'stretch' : 'center',
              gap: 14,
              minHeight: 92,
            }}
          >
            {variant !== 'form' && (
              <View style={[block, { width: 44, height: 44, borderRadius: 14 }]} />
            )}
            <View style={{ flex: 1, gap: 12 }}>
              <View style={[block, { width: '58%', height: 16 }]} />
              <View style={[block, { width: '38%', height: variant === 'form' ? 32 : 12 }]} />
            </View>
            {variant !== 'form' && <View style={[block, { width: 68, height: 18 }]} />}
          </Card>
        ))}
      </View>
    </View>
  );
}
