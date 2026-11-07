import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { Overview } from '@finora/contracts';
import { AppText } from '../../components/ui';
import { Icon } from '../../components/design';
import { glass, useTheme } from '../../theme';
import { SpendingPulse } from './spending-pulse';
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
  return (
    <View>
      <View
        style={{
          backgroundColor: glass(theme),
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
        <SpendingPulse embedded amount={amount} />
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
    </View>
  );
}
