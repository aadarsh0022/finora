import { Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import type { Overview } from '@finora/contracts';
import { AppText } from '../../components/ui';
import { Icon } from '../../components/design';
import { useTheme } from '../../theme';
export function HomeSummary({
  data,
  hidden,
  toggle,
  amount,
}: {
  data: Overview;
  hidden: boolean;
  toggle: () => void;
  amount: (value: string) => string;
}) {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 320 || fontScale > 1.4;
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          padding: 18,
          borderRadius: 22,
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
            Total balance
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 7,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <AppText
                style={{
                  color: theme.muted,
                  fontSize: 10,
                  lineHeight: 16,
                  fontFamily: 'DMSansBold',
                }}
              >
                {data.currency}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show total balance' : 'Hide total balance'}
              onPress={toggle}
              hitSlop={8}
              style={{
                minWidth: 36,
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 18,
                backgroundColor: theme.background,
              }}
            >
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} color={theme.muted} />
            </Pressable>
          </View>
        </View>
        <AppText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{
            fontSize: 36,
            lineHeight: 46,
            fontFamily: 'DMSansBold',
            letterSpacing: -1,
            color: theme.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {amount(data.totalBalanceMinor)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Accounts"
          onPress={() => router.push('/accounts')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            minHeight: 38,
          }}
        >
          <AppText style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
            {data.accounts.length} {data.accounts.length === 1 ? 'account' : 'accounts'}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText style={{ color: theme.text, fontSize: 12, fontFamily: 'DMSansBold' }}>
              View accounts
            </AppText>
            <Icon name="arrowRight" color={theme.accent} size={15} />
          </View>
        </Pressable>
      </View>
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 12 }}>
        {(
          [
            ['Income', data.incomeMinor, false],
            ['Spent', data.expensesMinor, true],
          ] as const
        ).map(([label, value, expense]) => (
          <View
            key={label}
            style={{
              flex: 1,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 18,
              padding: 15,
              gap: 9,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: expense ? theme.dangerSoft : theme.accentSoft,
                }}
              >
                <AppText
                  style={{
                    fontSize: 18,
                    lineHeight: 22,
                    color: expense ? theme.danger : theme.accent,
                  }}
                >
                  {expense ? '↗' : '↙'}
                </AppText>
              </View>
              <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
                {label}
              </AppText>
            </View>
            <AppText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              tone={expense ? 'danger' : 'accent'}
              style={{
                fontSize: 20,
                lineHeight: 28,
                fontFamily: 'DMSansBold',
                fontVariant: ['tabular-nums'],
              }}
            >
              {amount(value)}
            </AppText>
            <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
              This month
            </AppText>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View spending reports"
        onPress={() => router.push('/(tabs)/reports')}
        style={{
          minHeight: 48,
          paddingHorizontal: 15,
          borderRadius: 16,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Icon name="activity" size={17} />
        <AppText tone="muted" style={{ flex: 1, fontSize: 12 }}>
          Net cash flow
        </AppText>
        <AppText
          tone={BigInt(data.netMinor) < 0n ? 'danger' : 'accent'}
          style={{ fontFamily: 'DMSansBold', fontSize: 14 }}
        >
          {amount(data.netMinor)}
        </AppText>
        <Icon name="chevron" size={15} />
      </Pressable>
    </View>
  );
}
