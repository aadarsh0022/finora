import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { transactionPageSchema, type Currency } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { AppText } from '../../components/ui';
import { GrowUp } from '../../components/motion';
import { elevation, useTheme } from '../../theme';
import { useApp } from '../../providers/app-provider';
import { chartRatio } from '../reports/values';
import { activityQuery, emptyActivityFilters } from './filters';
import { useMoney, useRead } from './shared';

type Mode = 'week' | 'month';
const DAY = 86_400_000;
const addDays = (day: string, count: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);

function periodDays(mode: Mode, today: string) {
  if (mode === 'week') return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const first = `${today.slice(0, 7)}-01`;
  const length = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
  ).getUTCDate();
  return Array.from({ length }, (_, index) => addDays(first, index));
}

/** Daily spending for the period, from the same local-first transaction reads as Activity. */
function useDailySpending(days: string[], currency: Currency, timezone: string) {
  const query = activityQuery(
    { ...emptyActivityFilters, type: 'EXPENSE', from: days[0]!, to: days[days.length - 1]! },
    currency,
    timezone,
  );
  const path = (page: number) => `transactions?${query}&page=${page}&pageSize=100`;
  const first = useRead(path(1), transactionPageSchema);
  const second = useRead(path(2), transactionPageSchema, (first.data?.total ?? 0) > 100);
  const third = useRead(path(3), transactionPageSchema, (first.data?.total ?? 0) > 200);
  const totals = new Map<string, bigint>(days.map((day) => [day, 0n]));
  for (const entry of [
    ...(first.data?.items ?? []),
    ...(second.data?.items ?? []),
    ...(third.data?.items ?? []),
  ]) {
    const day = calendarDate(new Date(entry.date), timezone);
    if (totals.has(day)) totals.set(day, totals.get(day)! + BigInt(entry.amountMinor));
  }
  return { totals, ready: first.data !== undefined };
}

/**
 * `embedded` drops the card chrome so it can sit inside another card, such as the balance card.
 * `amount` overrides the money format, so a parent that hides balances also hides these figures.
 */
export function SpendingPulse({
  embedded = false,
  amount,
}: {
  embedded?: boolean;
  amount?: (value: string) => string;
}) {
  const theme = useTheme();
  const { user } = useApp();
  const defaultMoney = useMoney();
  const money = amount ?? defaultMoney;
  const timezone = user?.preferences.timezone ?? 'Asia/Kolkata';
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const locale = user?.preferences.locale ?? 'en-IN';
  const [mode, setMode] = useState<Mode>('week');
  const [selected, setSelected] = useState<string | null>(null);
  const today = calendarDate(new Date(), timezone);
  const days = periodDays(mode, today);
  const { totals, ready } = useDailySpending(days, currency, timezone);
  const periodTotal = [...totals.values()].reduce((sum, value) => sum + value, 0n);
  const peak = [...totals.values()].reduce((max, value) => (value > max ? value : max), 0n);
  const shown = selected && totals.has(selected) ? totals.get(selected)! : periodTotal;
  const label = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
      new Date(`${day}T12:00:00Z`),
    );
  const compact = (minor: bigint) => {
    const digits =
      new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(Number(minor) / 10 ** digits);
  };
  const chartHeight = embedded ? 100 : 118;
  const caption =
    selected && totals.has(selected)
      ? label(selected, { weekday: 'short', day: 'numeric', month: 'short' })
      : mode === 'week'
        ? 'Spent in the last 7 days'
        : 'Spent this month';
  const activeSelection = selected && totals.has(selected) ? selected : today;
  return (
    <View
      style={
        embedded
          ? { gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border }
          : {
              backgroundColor: theme.isDark ? `${theme.surface}E6` : '#FFFFFFB8',
              borderRadius: 28,
              padding: 18,
              gap: 14,
              borderWidth: 1,
              borderColor: theme.isDark ? theme.border : '#FFFFFFCC',
              ...elevation(theme, 2),
            }
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexShrink: 1 }}>
          <AppText
            tone="muted"
            style={{ fontSize: embedded ? 12 : 13, lineHeight: embedded ? 16 : 20 }}
          >
            {caption}
          </AppText>
          {embedded && (
            <AppText
              numberOfLines={1}
              style={{
                fontSize: 18,
                lineHeight: 26,
                fontFamily: 'DMSansBold',
                fontVariant: ['tabular-nums'],
              }}
            >
              {money(shown.toString())}
            </AppText>
          )}
        </View>
        <View
          accessibilityRole="radiogroup"
          style={{
            flexDirection: 'row',
            padding: 3,
            borderRadius: 16,
            backgroundColor: `${theme.text}0F`,
          }}
        >
          {(['week', 'month'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === value }}
              accessibilityLabel={value === 'week' ? 'Week' : 'Month'}
              onPress={() => {
                setMode(value);
                setSelected(null);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 13,
                backgroundColor: mode === value ? theme.text : 'transparent',
              }}
            >
              <AppText
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  fontFamily: 'DMSansBold',
                  color: mode === value ? theme.surface : theme.muted,
                }}
              >
                {value === 'week' ? 'Week' : 'Month'}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
      {!embedded && (
        <AppText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={{
            fontSize: embedded ? 30 : 40,
            lineHeight: embedded ? 38 : 48,
            fontFamily: 'DMSansBold',
            letterSpacing: -1.2,
            fontVariant: ['tabular-nums'],
          }}
        >
          {money(shown.toString())}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <View
            style={{ height: chartHeight, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}
          >
            {days.map((day) => {
              const value = totals.get(day) ?? 0n;
              const ratio = peak > 0n ? chartRatio(value.toString(), peak.toString()) : 0;
              const isSelected = day === activeSelection;
              const future = day > today;
              const dot = value === 0n;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${label(day, { weekday: 'long', day: 'numeric', month: 'long' })}, ${money(value.toString())}`}
                  disabled={future}
                  onPress={() => setSelected(selected === day ? null : day)}
                  style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}
                >
                  <GrowUp
                    replay={`${mode}:${ready}`}
                    delay={days.indexOf(day) * 18}
                    style={{ alignSelf: 'center' }}
                  >
                    <View
                      style={{
                        height: dot ? 6 : Math.max(10, ratio * (embedded ? 92 : 104)),
                        width: dot ? 6 : mode === 'week' ? 14 : 6,
                        borderRadius: dot ? 3 : mode === 'week' ? 7 : 3,
                        backgroundColor: isSelected
                          ? theme.accent
                          : dot
                            ? `${theme.muted}${future ? '55' : '88'}`
                            : `${theme.text}B8`,
                        opacity: ready ? 1 : 0.5,
                      }}
                    />
                  </GrowUp>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {days.map((day, index) => {
              const show = mode === 'week' || index % 5 === 0 || day === today;
              return (
                <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                  {show && (
                    <AppText
                      numberOfLines={1}
                      style={{
                        fontSize: 10,
                        lineHeight: 14,
                        color: day === activeSelection ? theme.accent : theme.muted,
                        fontFamily: day === activeSelection ? 'DMSansBold' : 'DMSans',
                      }}
                    >
                      {mode === 'week'
                        ? label(day, { weekday: 'narrow' })
                        : Number(day.slice(8, 10))}
                    </AppText>
                  )}
                </View>
              );
            })}
          </View>
        </View>
        {peak > 0n && !embedded && (
          <View
            accessible={false}
            style={{
              width: 40,
              height: chartHeight,
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <AppText tone="muted" style={{ fontSize: 10, lineHeight: 14 }}>
              {compact(peak)}
            </AppText>
            <AppText tone="muted" style={{ fontSize: 10, lineHeight: 14 }}>
              {compact(peak / 2n)}
            </AppText>
            <View />
          </View>
        )}
      </View>
    </View>
  );
}
