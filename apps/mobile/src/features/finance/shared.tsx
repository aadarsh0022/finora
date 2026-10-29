import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { accountWithBalanceSchema, categorySchema, type Transaction } from '@finora/contracts';
import { calendarDate, formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { z, type ZodType } from 'zod';
import { AppText } from '../../components/ui';
import { Pressable, View } from 'react-native';
import { TransactionIcon } from './transaction-icon';
import { useTheme } from '../../theme';
import { useApp } from '../../providers/app-provider';
import { canUseOffline, queuedTransactionSchema } from '../../storage/outbox';
import { projectDeviceLedger, readDeviceLedger } from '../../storage/ledger';
import { readSetup, setupProjection } from '../../storage/setup';
import { useNetworkState } from 'expo-network';
import { ClientError } from '../../api/client';

export const accountsSchema = z.array(accountWithBalanceSchema);
export const categoriesSchema = z.array(categorySchema);
export const messageSchema = z.object({ message: z.string() });
export { dateInstant, decimalAmount } from './values';
export function useRead<T>(path: string, schema: ZodType<T>, enabled = true) {
  const { api, user, vault: candidateVault } = useApp();
  const vault = candidateVault?.ownerId === user?.id ? candidateVault : undefined;
  const client = useQueryClient();
  const network = useNetworkState();
  const [hydrated, setHydrated] = useState('');
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const scope = `${user?.id}:${path}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; savedAt: number; cached: boolean }>();
  useEffect(() => {
    if (!vault || !enabled || path.startsWith('auth/')) return;
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
      .catch(() => undefined)
      .finally(() => {
        if (current) setHydrated(scope);
      });
    return () => {
      current = false;
    };
  }, [vault, scope, enabled, path, client, user?.id]);
  const query = useQuery({
    queryKey: [user?.id, path],
    enabled: !!user && enabled && (!vault || path.startsWith('auth/') || hydrated === scope),
    queryFn: async ({ signal }) => {
      try {
        const ledger = vault ? await readDeviceLedger(vault) : null;
        if (ledger && vault && user) {
          const rows = await vault.list('pending:', queuedTransactionSchema);
          const local = projectDeviceLedger(
            ledger.value,
            rows.map((row) => row.value),
            path,
            user,
          );
          if (local !== undefined) return schema.parse(local);
        }
        const setup = vault ? await readSetup(vault) : undefined;
        const projection = setup ? setupProjection(setup, path) : undefined;
        if (projection !== undefined) return schema.parse(projection);
        if (network.isConnected === false || network.isInternetReachable === false)
          throw new ClientError('NETWORK', 'Connect to load records not yet saved on this device.');
        const value = await api.request(path, schema, { signal });
        if (vault && !path.startsWith('auth/'))
          await vault.write(`read:${path}`, value).catch(() => undefined);
        if (!signal.aborted) setSnapshot({ scope, savedAt: Date.now(), cached: false });
        return value;
      } catch (error) {
        if (
          vault &&
          (canUseOffline(error) ||
            (error instanceof ClientError && (error.status >= 500 || error.status === 429)))
        ) {
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
export function SavedDataNotice(_props: { at?: number }) {
  return null;
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
  const timezone = user?.preferences.timezone ?? 'Asia/Kolkata';
  const locale = user?.preferences.locale ?? 'en-IN';
  const day = calendarDate(new Date(item.date), timezone);
  const today = calendarDate(new Date(), timezone);
  const title =
    item.merchant ||
    categoryName ||
    (item.type === 'TRANSFER' ? 'Account transfer' : item.type === 'INCOME' ? 'Income' : 'Expense');
  const kind =
    item.type === 'TRANSFER' ? 'Transfer' : item.type === 'INCOME' ? 'Income' : 'Expense';
  const dateLabel =
    item.datePrecision === 'DAY'
      ? day === today
        ? 'Today'
        : new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            timeZone: timezone,
          }).format(new Date(item.date))
      : showDate && day !== today
        ? new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            timeZone: timezone,
          }).format(new Date(item.date))
        : new Intl.DateTimeFormat(locale, {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
          }).format(new Date(item.date));
  const detail =
    item.type === 'TRANSFER'
      ? `${accountName ?? 'Account'} → ${destinationAccountName ?? 'Account'}`
      : [accountName, item.merchant ? categoryName : undefined].filter(Boolean).join(' · ') || kind;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View or edit ${title}`}
      accessibilityHint={
        item.type === 'TRANSFER'
          ? `Opens transfer from ${accountName ?? 'Account'} to ${destinationAccountName ?? 'Account'}`
          : 'Opens transaction details'
      }
      onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
      style={({ pressed }) => ({
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.background,
        opacity: pressed ? 0.7 : 1,
        flexDirection: 'row',
        gap: 11,
        alignItems: 'center',
        minHeight: 66,
      })}
    >
      <TransactionIcon type={item.type} merchant={item.merchant} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText
          numberOfLines={1}
          style={{ fontFamily: 'DMSansBold', fontSize: 15, lineHeight: 21 }}
        >
          {title}
        </AppText>
        <AppText numberOfLines={1} tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
          {detail} · {dateLabel}
        </AppText>
      </View>
      <AppText
        accessibilityLabel={`${kind} ${money(item.amountMinor)}`}
        tone={item.type === 'INCOME' ? 'accent' : 'text'}
        style={{
          fontSize: 14,
          lineHeight: 21,
          fontFamily: 'DMSansBold',
          fontVariant: ['tabular-nums'],
          flexShrink: 1,
          textAlign: 'right',
        }}
      >
        {item.type === 'EXPENSE' ? '−' : item.type === 'INCOME' ? '+' : ''}
        {money(item.amountMinor)}
      </AppText>
    </Pressable>
  );
}
