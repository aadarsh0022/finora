import { outlookPreferencesSchema, outlookSchema } from '@finora/contracts';
import { calendarDate, nextOccurrence } from '@finora/finance-core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText } from '../../components/ui';
import { useMoney, useRead } from '../finance/shared';
import { useLocalRecords, usePendingTransactions } from '../../storage/hooks';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { useUi } from '../../stores/ui';
import { outlookValues } from './outlook-values';

export function OutlookSummary() {
  const theme = useTheme();
  const money = useMoney();
  const { vault, user } = useApp();
  const hidden = useUi((s) => s.balancesHidden);
  const query = useRead('planning/outlook', outlookSchema);
  const preferences = useLocalRecords('outlook:preferences', outlookPreferencesSchema);
  const pending = usePendingTransactions();
  const data = query.data;
  const saved = preferences.data?.[0]?.value;
  const current = data
    ? {
        ...(saved ?? { reserveMinor: '0', expectedPayments: [] }),
        through:
          saved && saved.through >= data.today && saved.through <= data.through
            ? saved.through
            : nextOccurrence(data.today, 'DAILY', 30),
      }
    : undefined;
  const result = data && current ? outlookValues(data, current, false) : undefined;
  const ready =
    data &&
    result &&
    !result.incomplete &&
    !query.error &&
    data.today === calendarDate(new Date(), data.timezone) &&
    (!vault ||
      (!preferences.isPending &&
        !preferences.error &&
        !pending.isPending &&
        !pending.error &&
        !pending.data?.length));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Money Ahead"
      onPress={() => router.push('/money-ahead')}
      style={({ pressed }) => ({
        padding: 18,
        borderRadius: 14,
        gap: 10,
        backgroundColor: theme.accentSoft,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <AppText style={{ fontFamily: 'DMSansBold' }}>Money Ahead</AppText>
        {current && (
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Until{' '}
            {new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            }).format(new Date(`${current.through}T12:00:00Z`))}
          </AppText>
        )}
      </View>
      {ready ? (
        <View style={{ gap: 4 }}>
          <AppText
            style={{
              fontSize: 28,
              lineHeight: 38,
              fontFamily: 'DMSansBold',
              fontVariant: ['tabular-nums'],
              maxWidth: '78%',
            }}
          >
            {hidden ? '••••••' : money(result.availableMinor!)}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 12, maxWidth: '76%' }}>
            Estimated available · Expected income excluded
          </AppText>
        </View>
      ) : (
        <AppText tone="muted" style={{ fontSize: 14 }}>
          Review balances and commitments to see your estimate.
        </AppText>
      )}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          right: 17,
          bottom: 38,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 4,
        }}
      >
        {[16, 25, 34, 46, 57].map((height, index) => (
          <View
            key={index}
            style={{
              width: 7,
              height,
              borderRadius: 4,
              backgroundColor: theme.accent,
              opacity: 0.35 + index * 0.12,
            }}
          />
        ))}
      </View>
      <AppText tone="accent" style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>
        Explore your plan →
      </AppText>
    </Pressable>
  );
}
