import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { accountWithBalanceSchema, categorySchema, type Transaction } from '@finora/contracts';
import { calendarDate, formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { z, type ZodType } from 'zod';
import { AppText } from '../../components/ui';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { useApp } from '../../providers/app-provider';
import { canUseOffline } from '../../storage/outbox';

export const accountsSchema = z.array(accountWithBalanceSchema);
export const categoriesSchema = z.array(categorySchema);
export const messageSchema = z.object({ message: z.string() });
export { dateInstant, decimalAmount } from './values';
export function useRead<T>(path: string, schema: ZodType<T>, enabled = true) {
  const { api, user, vault: candidateVault } = useApp();
  const vault = candidateVault?.ownerId === user?.id ? candidateVault : undefined;
  const client = useQueryClient();
  const attempted = useRef('');
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const scope = `${user?.id}:${path}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; savedAt: number; cached: boolean }>();
  useEffect(() => {
    if (!vault || !enabled || attempted.current === scope || path.startsWith('auth/')) return;
    attempted.current = scope;
    let current = true;
    void vault
      .read(`read:${path}`, schemaRef.current)
      .then((cached) => {
        if (
          cached &&
          current &&
          (client.getQueryState([user?.id, path])?.dataUpdatedAt ?? 0) < cached.updated
        ) {
          client.setQueryData([user?.id, path], cached.value, { updatedAt: cached.updated });
          setSnapshot({ scope, savedAt: cached.updated, cached: true });
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [vault, scope, enabled, path, client, user?.id]);
  const query = useQuery({
    queryKey: [user?.id, path],
    enabled: !!user && enabled,
    queryFn: async ({ signal }) => {
      try {
        const value = await api.request(path, schema, { signal });
        if (vault && !path.startsWith('auth/'))
          await vault.write(`read:${path}`, value).catch(() => undefined);
        if (!signal.aborted) setSnapshot({ scope, savedAt: Date.now(), cached: false });
        return value;
      } catch (error) {
        if (vault && canUseOffline(error)) {
          const cached = await vault.read(`read:${path}`, schema);
          if (cached) {
            if (!signal.aborted) setSnapshot({ scope, savedAt: cached.updated, cached: true });
            return cached.value;
          }
        }
        throw error;
      }
    },
  });
  return {
    ...query,
    cachedAt: snapshot?.scope === scope && snapshot.cached ? snapshot.savedAt : undefined,
  };
}
export function SavedDataNotice({ at }: { at?: number }) {
  const { user } = useApp();
  if (!at) return null;
  const time = new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: user?.preferences.timezone ?? 'Asia/Kolkata',
  }).format(new Date(at));
  return (
    <AppText tone="muted" style={{ fontSize: 12 }}>
      Saved on this device · {time}. Refresh when connected for the latest records.
    </AppText>
  );
}
export function useMoney() {
  const { user } = useApp();
  return (amount: string) =>
    formatMoney(
      amount,
      user?.preferences.baseCurrency ?? 'INR',
      user?.preferences.locale ?? 'en-IN',
    );
}
export function TransactionCard({
  item,
  accountName,
  categoryName,
  destinationAccountName,
  showDate = true,
}: {
  item: Transaction;
  accountName?: string;
  categoryName?: string;
  destinationAccountName?: string;
  showDate?: boolean;
}) {
  const money = useMoney();
  const theme = useTheme();
  const { user } = useApp();
  const date = calendarDate(new Date(item.date), user?.preferences.timezone ?? 'Asia/Kolkata');
  const [year, month, day] = date.split('-');
  const format = user?.preferences.preferredDateFormat;
  const displayDate =
    format === 'DD/MM/YYYY'
      ? `${day}/${month}/${year}`
      : format === 'MM/DD/YYYY'
        ? `${month}/${day}/${year}`
        : date;
  const title =
    item.merchant ||
    categoryName ||
    (item.type === 'TRANSFER' ? 'Account transfer' : item.type === 'INCOME' ? 'Income' : 'Expense');
  const typeLabel =
    item.type === 'INCOME' ? 'Income' : item.type === 'EXPENSE' ? 'Expense' : 'Transfer';
  const tone = item.type === 'INCOME' ? 'accent' : item.type === 'EXPENSE' ? 'danger' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View or edit ${title}`}
      accessibilityHint="Opens transaction details"
      onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
      style={({ pressed }) => ({
        padding: 16,
        backgroundColor: theme.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.border,
        opacity: pressed ? 0.75 : 1,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        minHeight: 92,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor:
            item.type === 'EXPENSE'
              ? theme.dangerSoft
              : item.type === 'INCOME'
                ? theme.accentSoft
                : theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
          <Path
            d={
              item.type === 'TRANSFER'
                ? 'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4'
                : item.type === 'INCOME'
                  ? 'M18 6 6 18M6 8v10h10'
                  : 'M6 18 18 6M8 6h10v10'
            }
            stroke={theme[tone]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
          <AppText
            numberOfLines={2}
            style={{ fontFamily: 'DMSansBold', fontSize: 16, flexGrow: 1, flexBasis: '35%' }}
          >
            {title}
          </AppText>
          <AppText
            tone={tone}
            style={{
              fontSize: 18,
              fontFamily: 'DMSansBold',
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.3,
              flexShrink: 1,
              textAlign: 'right',
              marginLeft: 'auto',
            }}
          >
            {item.type === 'EXPENSE' ? '−' : item.type === 'INCOME' ? '+' : ''}
            {money(item.amountMinor)}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <AppText numberOfLines={1} tone="muted" style={{ fontSize: 12, lineHeight: 18, flex: 1 }}>
            {item.type === 'TRANSFER'
              ? `${accountName ?? 'Account'} → ${destinationAccountName ?? 'Account'}`
              : `${accountName ?? 'Account'}${categoryName && categoryName !== title ? ` · ${categoryName}` : ''}`}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 11, lineHeight: 18 }}>
            {typeLabel}
          </AppText>
        </View>
        {showDate && (
          <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
            {displayDate}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}
