import { spendingInsightsSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { View } from 'react-native';
import { AppText, Card, Feedback } from '../../components/ui';
import { useRead, useMoney } from '../finance/shared';
import { useApp } from '../../providers/app-provider';
import { percentageFromBasisPoints } from './values';

export function SpendingInsights({ month }: { month: string }) {
  const { user } = useApp();
  const money = useMoney();
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const enabled = month <= today.slice(0, 7) && month > '1000-01';
  const query = useRead(`reports/insights?month=${month}`, spendingInsightsSchema, enabled);
  const data = query.data;
  if (!enabled) return null;
  return (
    <Card>
      <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
        Spending insights
      </AppText>
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {data ? (
        <>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText tone="muted" style={{ fontSize: 13 }}>
                Average per day
              </AppText>
              <AppText style={{ fontSize: 23, fontFamily: 'DMSansBold' }}>
                ≈ {money(data.dailyAverageMinor)}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText tone="muted" style={{ fontSize: 13 }}>
                Spending change
              </AppText>
              <AppText
                tone={BigInt(data.changeMinor) > 0n ? 'danger' : 'accent'}
                style={{ fontSize: 23, fontFamily: 'DMSansBold' }}
              >
                {data.changeBasisPoints === null
                  ? 'No baseline'
                  : percentageFromBasisPoints(data.changeBasisPoints)}
              </AppText>
            </View>
          </View>
          <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
            {data.partial
              ? `Through ${data.through}; compared with ${data.previousFrom}–${data.previousThrough}.`
              : `Compared with the previous full month (${data.previousDays} days).`}
          </AppText>
          {data.categoryChanges.length > 0 && (
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
              Biggest category changes
            </AppText>
          )}
          {data.categoryChanges.map((c) => (
            <View key={c.categoryId} style={{ flexDirection: 'row', gap: 12 }}>
              <AppText style={{ flex: 1, fontSize: 14 }}>{c.name}</AppText>
              <AppText
                tone={BigInt(c.changeMinor) > 0n ? 'danger' : 'accent'}
                style={{ fontSize: 14 }}
              >
                {BigInt(c.changeMinor) > 0n ? '+' : ''}
                {money(c.changeMinor)}
              </AppText>
            </View>
          ))}
          <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
            Based on recorded expenses. Missing entries affect comparisons. Transfers and debt
            principal are excluded.
          </AppText>
        </>
      ) : !query.error ? (
        <AppText tone="muted">Preparing your comparison…</AppText>
      ) : null}
    </Card>
  );
}
