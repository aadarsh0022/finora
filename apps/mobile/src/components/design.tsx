import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { AppText } from './ui';
import { AppButton } from './ui';
import { FlowSheet } from './flow';
import { useTheme } from '../theme';

const paths = {
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff:
    'M3 3l18 18M9 5.5A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 4M6 6a22 22 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4',
  check: 'M5 12l4 4L19 6',
  profile: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 8 0 0 1 16 0v2',
  wallet: 'M3 6h17v14H3V6Zm0 0V4h14v2M16 11h4v5h-4z',
  activity: 'M5 6h14M5 12h14M5 18h14',
  plan: 'M12 3a9 9 0 1 0 9 9M12 3v9h9',
  goal: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l9-9m-5 0h5v5',
  repeat: 'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4',
  calendar: 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6m0-10h.01',
  plus: 'M12 5v14M5 12h14',
  chart: 'M4 20V11m6 9V4m6 16v-6m5 6H3',
  trendUp: 'm3 17 6-6 4 4 8-8m0 0h-6m6 0v6',
  trendDown: 'm3 7 6 6 4-4 8 8m0 0h-6m6 0v-6',
  income: 'M17 7 7 17m0 0h8m-8 0V9',
  expense: 'M7 17 17 7m0 0H9m8 0v8',
  transfer: 'M7 7h13m-4-4 4 4-4 4M17 17H4m4-4-4 4 4 4',
  send: 'M12 19V5m-6 6 6-6 6 6',
  newChat: 'M13 5H5v15h15v-8M11 13l1-4 7-7 3 3-7 7-4 1Z',
  trash: 'M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5',
  chevron: 'm9 5 7 7-7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  filters: 'M3 7h18M3 17h18M8 4v6m8 4v6',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3',
  arrowRight: 'M4 12h16m-6-6 6 6-6 6',
  thumbsUp: 'M7 10H3v11h4V10Zm0 0 5-8c3 0 2 5 2 7h5a2 2 0 0 1 2 3l-2 7a3 3 0 0 1-3 2H7',
  thumbsDown: 'M7 14H3V3h4v11Zm0 0 5 8c3 0 2-5 2-7h5a2 2 0 0 0 2-3l-2-7a3 3 0 0 0-3-2H7',
  copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
  share: 'M8 15c3-5 6-6 11-6V4l4 7-4 7v-5c-5 0-8 0-11 2ZM4 8H1v14h16v-3',
} as const;
export type IconName = keyof typeof paths;

export function Icon({
  name,
  color,
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[name]}
        stroke={color ?? theme.muted}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function ProfileAction() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      accessibilityHint="Manage your profile, preferences and security"
      onPress={() => router.push('/settings')}
      hitSlop={6}
      style={({ pressed }) => ({
        minWidth: 96,
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: pressed ? theme.border : theme.accentSoft,
        flexDirection: 'row',
        gap: 7,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name="profile" color={theme.accent} size={20} />
      <AppText tone="accent" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
        Profile
      </AppText>
    </Pressable>
  );
}

export interface CreateRegistration {
  label: string;
  run: () => void;
  disabled?: boolean;
}

/** Round add button for the bottom right; the label is its accessible name. */
export function CreateAction({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        elevation: 3,
        boxShadow: '0px 3px 8px #00000022',
      })}
    >
      <Icon name="plus" color={theme.onAccent} size={26} />
    </Pressable>
  );
}

export function AddTransactionAction() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a transaction"
      onPress={() => router.push('/transaction')}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.accent,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.75 : 1,
        elevation: 3,
        boxShadow: '0px 3px 8px #00000022',
      })}
    >
      <Icon name="plus" color={theme.onAccent} size={26} />
    </Pressable>
  );
}

export function SectionHeading({
  title,
  action,
  onPress,
  actionLabel,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <AppText
        accessibilityRole="header"
        style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 20, lineHeight: 28 }}
      >
        {title}
      </AppText>
      {action && onPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel ?? action}
          onPress={onPress}
          style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }}
        >
          <AppText tone="accent" style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>
            {action}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

export function ActionRow({
  title,
  subtitle,
  value,
  icon = 'chevron',
  onPress,
  danger = false,
  last = false,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} color={danger ? theme.danger : theme.muted} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText tone={danger ? 'danger' : 'text'} style={{ fontFamily: 'DMSansBold' }}>
          {title}
        </AppText>
        {subtitle && (
          <AppText tone="muted" style={{ fontSize: 13, lineHeight: 19 }}>
            {subtitle}
          </AppText>
        )}
      </View>
      {value && (
        <AppText tone="muted" style={{ fontSize: 13, flexShrink: 1 }}>
          {value}
        </AppText>
      )}
      <Icon name="chevron" size={18} />
    </Pressable>
  );
}

export function Disclosure({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const theme = useTheme();
  return (
    <View style={{ gap: open ? 12 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Icon name="info" />
        <AppText style={{ flex: 1, fontSize: 14, fontFamily: 'DMSansBold' }}>{title}</AppText>
        <AppText style={{ color: theme.muted, fontSize: 20 }}>{open ? '−' : '+'}</AppText>
      </Pressable>
      {open && children}
    </View>
  );
}

export function ImpactNotice({ title, children }: { title: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ padding: 16, borderRadius: 14, backgroundColor: theme.accentSoft, gap: 6 }}>
      <AppText style={{ fontSize: 14, lineHeight: 21, fontFamily: 'DMSansBold' }}>{title}</AppText>
      {typeof children === 'string' ? (
        <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
          {children}
        </AppText>
      ) : (
        children
      )}
    </View>
  );
}

export function ReviewSheet({
  title,
  visible,
  rows,
  impact,
  onClose,
  onConfirm,
  busy = false,
  error,
  confirmLabel = 'Confirm',
}: {
  title: string;
  visible: boolean;
  rows: readonly { label: string; value: string }[];
  impact: string;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string;
  confirmLabel?: string;
}) {
  const theme = useTheme();
  return (
    <FlowSheet
      title={title}
      visible={visible}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={<AppButton title={confirmLabel} loading={busy} onPress={onConfirm} />}
    >
      {rows.map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: 'row',
            gap: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            paddingVertical: 12,
          }}
        >
          <AppText tone="muted" style={{ fontSize: 14 }}>
            {row.label}
          </AppText>
          <AppText style={{ flex: 1, textAlign: 'right', fontFamily: 'DMSansBold' }}>
            {row.value}
          </AppText>
        </View>
      ))}
      <ImpactNotice title="What will change">{impact}</ImpactNotice>
      {error && (
        <AppText tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      )}
    </FlowSheet>
  );
}

/** Fills the free space on a list screen and centres its message, instead of a card at the top. */
export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message: string;
  action?: { title: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={{
        flex: 1,
        minHeight: 280,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 24,
        paddingBottom: 48,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}
      >
        <Icon name={icon} color={theme.accent} size={32} />
      </View>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 20, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText tone="muted" style={{ textAlign: 'center', lineHeight: 22 }}>
        {message}
      </AppText>
      {action && (
        <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
          <AppButton title={action.title} onPress={action.onPress} />
        </View>
      )}
    </View>
  );
}
