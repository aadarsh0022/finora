import { Pressable, View } from 'react-native';
import { AppText } from '../../components/ui';
import { Icon } from '../../components/design';
import { useTheme } from '../../theme';

export function ChatConfirmActions({
  onConfirm,
  onCancel,
  disabled = false,
  busy = false,
  destructive = false,
  label = 'Confirm',
}: {
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled || busy}
        onPress={onConfirm}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 42,
          borderRadius: 12,
          backgroundColor: destructive ? theme.danger : theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <AppText
          style={{
            fontSize: 14,
            lineHeight: 20,
            fontFamily: 'DMSansBold',
            color: destructive ? '#FFFFFF' : theme.onAccent,
          }}
        >
          {busy ? 'Saving…' : label}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        disabled={busy}
        onPress={onCancel}
        style={{ minHeight: 42, paddingHorizontal: 14, justifyContent: 'center' }}
      >
        <AppText tone="muted" style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>
          Cancel
        </AppText>
      </Pressable>
    </View>
  );
}

/** Small tinted badge and label that names what is about to happen, such as Expense or Transfer. */
export function ActionBadge({
  icon,
  label,
  tone = 'accent',
}: {
  icon: 'expense' | 'income' | 'transfer' | 'check' | 'info';
  label: string;
  tone?: 'accent' | 'success' | 'danger';
}) {
  const theme = useTheme();
  const color =
    tone === 'danger' ? theme.danger : tone === 'success' ? theme.success : theme.accent;
  const soft =
    tone === 'danger'
      ? theme.dangerSoft
      : tone === 'success'
        ? theme.successSoft
        : theme.accentSoft;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={15} color={color} />
      </View>
      <AppText tone="muted" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
        {label}
      </AppText>
    </View>
  );
}

/** The one-line reply shown after a record is saved, written like a normal assistant message. */
export function SavedLine({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          marginTop: 2,
          borderRadius: 11,
          backgroundColor: theme.successSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="check" size={13} color={theme.success} />
      </View>
      <AppText style={{ flex: 1, fontSize: 16, lineHeight: 26 }}>{text}</AppText>
    </View>
  );
}
