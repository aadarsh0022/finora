import { Pressable, View } from 'react-native';
import { AppText } from '../../components/ui';
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
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled || busy}
        onPress={onConfirm}
        style={{
          minHeight: 36,
          paddingHorizontal: 13,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: destructive ? theme.danger : theme.accent,
          justifyContent: 'center',
          opacity: disabled || busy ? 0.5 : 1,
        }}
      >
        <AppText style={{ fontSize: 12, fontFamily: 'DMSansBold', color: theme.background }}>
          {busy ? 'Saving…' : 'Confirm'}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        disabled={busy}
        onPress={onCancel}
        style={{
          minHeight: 36,
          paddingHorizontal: 13,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.border,
          justifyContent: 'center',
        }}
      >
        <AppText style={{ fontSize: 12 }}>Cancel</AppText>
      </Pressable>
    </View>
  );
}
