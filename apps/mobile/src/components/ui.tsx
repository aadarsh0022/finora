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
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useContext, useState, type ReactNode } from 'react';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { router } from 'expo-router';
import { useApp } from '../providers/app-provider';
import { usePendingTransactions } from '../storage/hooks';
import Svg, { Path, Circle } from 'react-native-svg';

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
  topContent,
  titleSize = 30,
  contentStyle,
  showPendingStatus = true,
  includeTopInset = true,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  bottomAction?: ReactNode;
  floatingAction?: ReactNode;
  headerAction?: ReactNode;
  topContent?: ReactNode;
  titleSize?: number;
  contentStyle?: ViewStyle;
  showPendingStatus?: boolean;
  includeTopInset?: boolean;
}) {
  const theme = useTheme();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [refreshing, setRefreshing] = useState(false);
  const { user, vault, storageError, syncPending } = useApp();
  async function refresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await syncPending?.().catch(() => undefined);
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
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
            flexGrow: 1,
            padding: 18,
            paddingBottom: floatingAction ? 104 : bottomAction ? 24 : 40,
            gap: 16,
            maxWidth: 720,
            width: '100%',
            alignSelf: 'center',
            ...contentStyle,
          }}
        >
          {user && storageError ? (
            <AppText tone="danger" style={{ fontSize: 13 }}>
              {storageError}
            </AppText>
          ) : null}
          {showPendingStatus && user && vault && <PendingStatus />}
          {topContent}
          {title && (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <AppText
                  accessibilityRole="header"
                  style={{
                    fontFamily: 'DMSansBold',
                    fontSize: titleSize,
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
  const attention = pending.data?.filter((item) => item.value.state === 'ATTENTION') ?? [];
  if (!attention.length) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Review an entry"
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
        {attention.length === 1
          ? 'An entry needs a quick review'
          : `${attention.length} entries need a quick review`}
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
  trailingIcon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  trailingIcon?: ReactNode;
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
      {trailingIcon && <View style={{ position: 'absolute', right: 18 }}>{trailingIcon}</View>}
    </Pressable>
  );
}
export function Field({
  label,
  error,
  hint,
  trailingAction,
  leadingAction,
  hideLabel = false,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  trailingAction?: ReactNode;
  leadingAction?: ReactNode;
  hideLabel?: boolean;
}) {
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
        <Svg width={21} height={21} viewBox="0 0 24 24" accessible={false}>
          <Path
            d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"
            stroke={theme.muted}
            strokeWidth={1.6}
            fill="none"
          />
          <Circle cx={12} cy={12} r={3} stroke={theme.muted} strokeWidth={1.6} fill="none" />
          {revealed && <Path d="m4 3 16 18" stroke={theme.muted} strokeWidth={1.6} />}
        </Svg>
      </Pressable>
    ) : undefined);
  return (
    <View style={{ gap: 7 }}>
      {!hideLabel && <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>}
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
              paddingLeft: leadingAction ? 44 : 14,
              paddingRight: endAction ? 62 : 14,
              borderRadius: 12,
              fontSize: 16,
              fontFamily: 'DMSans',
            },
            props.style,
          ]}
        />
        {leadingAction && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            {leadingAction}
          </View>
        )}
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
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  value: T;
  presentation?: 'segmented' | 'list';
  disabled?: boolean;
  hideLabel?: boolean;
  options: readonly { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  const segmented =
    presentation === 'segmented' ||
    (presentation !== 'list' && options.length <= 4 && options.every((o) => o.label.length <= 20));
  return (
    <View style={{ gap: 10 }}>
      {!hideLabel && <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{label}</AppText>}
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
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            accessibilityState={{ checked: option.value === value, disabled }}
            disabled={disabled}
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
export { Loading } from './skeleton';
