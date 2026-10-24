import { Pressable, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import type { Overview } from '@finora/contracts';
import { AppText, Card } from '../../components/ui';
import { BalanceArtwork, HeroGradient } from '../../components/brand';
import { Icon } from '../../components/design';
import { useTheme } from '../../theme';
import Svg, { Path, Circle } from 'react-native-svg';

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
  const balance = amount(data.totalBalanceMinor);
  const { width, fontScale } = useWindowDimensions();
  const stackMetrics =
    width < 360 ||
    fontScale > 1.2 ||
    [data.incomeMinor, data.expensesMinor].some((value) => amount(value).length > 11);
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          minHeight: 168,
          padding: 18,
          gap: 6,
          flexShrink: 0,
          backgroundColor: '#087E62',
        }}
      >
        <HeroGradient />
        <View style={{ position: 'absolute', right: 4, top: 6, opacity: 0.35 }}>
          <BalanceArtwork />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AppText style={{ color: '#E5F7ED', fontSize: 13 }}>
            Total balance · {data.currency}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show total balance' : 'Hide total balance'}
            onPress={toggle}
            hitSlop={12}
            style={{ minWidth: 28, minHeight: 28, justifyContent: 'center' }}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
              <Path
                d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"
                fill="none"
                stroke="#E5F7ED"
                strokeWidth={1.6}
              />
              <Circle cx={12} cy={12} r={3} stroke="#E5F7ED" fill="none" strokeWidth={1.6} />
              {hidden && <Path d="m3 3 18 18" stroke="#E5F7ED" strokeWidth={1.6} />}
            </Svg>
          </Pressable>
        </View>
        <AppText
          style={{
            color: '#FFFFFF',
            fontSize: balance.length > 14 ? 25 : balance.length > 11 ? 29 : 36,
            lineHeight: 44,
            fontFamily: 'DMSansBold',
            letterSpacing: -1,
            width: '100%',
            fontVariant: ['tabular-nums'],
          }}
        >
          {balance}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Accounts"
          onPress={() => router.push('/accounts')}
          style={{
            minHeight: 40,
            justifyContent: 'center',
            alignSelf: 'stretch',
            paddingVertical: 4,
          }}
        >
          <AppText style={{ color: '#E4F7EC', fontSize: 12, lineHeight: 20 }}>
            Across {data.accounts.length} {data.accounts.length === 1 ? 'account' : 'accounts'} ·
            Manage →
          </AppText>
        </Pressable>
      </View>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden', borderWidth: 0 }}>
        <View style={{ flexDirection: stackMetrics ? 'column' : 'row' }}>
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
                flexDirection: 'row',
                gap: 10,
                padding: 14,
                borderRightWidth: !stackMetrics && !expense ? 1 : 0,
                borderBottomWidth: stackMetrics && !expense ? 1 : 0,
                borderColor: theme.border,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: expense ? theme.dangerSoft : theme.accentSoft,
                }}
              >
                <AppText style={{ color: expense ? theme.danger : theme.accent, fontSize: 23 }}>
                  {expense ? '↓' : '↑'}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText tone="muted" style={{ fontSize: 12, lineHeight: 17 }}>
                  {label}
                </AppText>
                <AppText tone="muted" style={{ fontSize: 11, lineHeight: 17 }}>
                  This month
                </AppText>
                <AppText
                  tone={expense ? 'danger' : 'accent'}
                  style={{
                    fontFamily: 'DMSansBold',
                    fontSize: 17,
                    lineHeight: 24,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {amount(value)}
                </AppText>
              </View>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View spending reports"
          onPress={() => router.push('/(tabs)/reports')}
          style={{
            borderTopWidth: 1,
            borderColor: theme.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            minHeight: 45,
            paddingHorizontal: 16,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 17 }}>
            {[8, 15, 11, 5].map((height, index) => (
              <View
                key={index}
                style={{
                  width: 3,
                  height,
                  backgroundColor: index < 2 ? theme.accent : theme.muted,
                  opacity: 0.65,
                  borderRadius: 1,
                }}
              />
            ))}
          </View>
          <AppText tone="muted" style={{ fontSize: 12, flex: 1 }}>
            Net cash flow
          </AppText>
          <AppText
            tone={BigInt(data.netMinor) < 0n ? 'danger' : 'accent'}
            style={{ fontSize: 16, fontFamily: 'DMSansBold' }}
          >
            {amount(data.netMinor)}
          </AppText>
          <Icon name="chevron" size={16} />
        </Pressable>
      </Card>
    </View>
  );
}
