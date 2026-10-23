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
  headerAction,
  includeTopInset = true,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  bottomAction?: ReactNode;
  floatingAction?: ReactNode;
  headerAction?: ReactNode;
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
            <View
              style={{
                padding: 12,
                backgroundColor: theme.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                Offline · Showing saved records
              </AppText>
              <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
                {vault
                  ? 'New entries wait for sync. Other changes need a connection.'
                  : 'Reconnect before saving. Records may be out of date.'}
              </AppText>
            </View>
          )}
          {user && storageError ? (
            <AppText tone="danger" style={{ fontSize: 13 }}>
              {storageError}
            </AppText>
          ) : null}
          {user && vault && <PendingStatus />}
          {title && (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AppText
                  accessibilityRole="header"
                  style={{
                    fontFamily: 'DMSansBold',
                    fontSize: 30,
                    lineHeight: 38,
                    letterSpacing: -1,
                    flex: 1,
                  }}
                >
                  {title}
                </AppText>
                {headerAction}
              </View>
              {subtitle && (
                <AppText tone="muted" style={{ fontSize: 14, lineHeight: 21 }}>
                  {subtitle}
                </AppText>
              )}
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
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: theme.accentSoft,
        borderRadius: 12,
        minHeight: 48,
        justifyContent: 'center',
      }}
    >
      <AppText style={{ fontSize: 13 }}>
        {pending.data.filter((item) => item.value.state === 'PENDING').length} pending ·{' '}
        {pending.data.filter((item) => item.value.state === 'ATTENTION').length} need review · View
        sync
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
          borderRadius: 14,
          padding: 16,
          gap: 14,
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
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const endAction =
    trailingAction ??
    (props.secureTextEntry ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        onPress={() => setRevealed(!revealed)}
        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText tone="accent" style={{ fontSize: 12 }}>
          {revealed ? 'Hide' : 'Show'}
        </AppText>
      </Pressable>
    ) : undefined);
  return (
    <View style={{ gap: 7 }}>
      <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>
      <View>
        <TextInput
          {...props}
          accessibilityLabel={label}
          secureTextEntry={props.secureTextEntry && !revealed}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          placeholderTextColor={theme.muted}
          style={[
            {
              minHeight: 54,
              color: theme.text,
              backgroundColor: theme.surface,
              borderColor: error ? theme.danger : focused ? theme.accent : theme.border,
              borderWidth: 1,
              padding: 14,
              paddingRight: endAction ? 62 : 14,
              borderRadius: 12,
              fontSize: 16,
              fontFamily: 'DMSans',
            },
            props.style,
          ]}
        />
        {endAction && (
          <View
            style={{ position: 'absolute', right: 5, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            {endAction}
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
  presentation,
}: {
  label: string;
  value: T;
  presentation?: 'segmented' | 'list';
  options: readonly { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  const segmented =
    presentation === 'segmented' ||
    (presentation !== 'list' && options.length <= 4 && options.every((o) => o.label.length <= 20));
  return (
    <View style={{ gap: 10 }}>
      <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>
      <View
        style={
          segmented
            ? {
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 4,
                padding: 4,
                borderRadius: 14,
                backgroundColor: theme.border,
              }
            : { gap: 8 }
        }
      >
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === value }}
            onPress={() => onChange(option.value)}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 10,
              minHeight: 48,
              flexGrow: segmented ? 1 : 0,
              flexBasis: segmented ? 'auto' : undefined,
              borderRadius: 12,
              borderWidth: segmented ? 0 : 1,
              borderColor: option.value === value ? theme.accent : theme.border,
              backgroundColor:
                option.value === value
                  ? theme.accentSoft
                  : segmented
                    ? 'transparent'
                    : theme.surface,
              justifyContent: 'center',
              gap: 3,
            }}
          >
            <AppText
              style={{
                fontSize: 14,
                textAlign: segmented ? 'center' : 'left',
                fontFamily: option.value === value ? 'DMSansBold' : 'DMSans',
              }}
            >
              {option.label}
            </AppText>
            {option.description && (
              <AppText tone="muted" style={{ fontSize: 13, lineHeight: 19 }}>
                {option.description}
              </AppText>
            )}
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
