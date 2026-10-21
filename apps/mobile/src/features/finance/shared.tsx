import { useQuery } from '@tanstack/react-query';
import { accountWithBalanceSchema, categorySchema, type Transaction } from '@finora/contracts';
import { calendarDate, formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { z, type ZodType } from 'zod';
import { AppText } from '../../components/ui';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme';
import { useApp } from '../../providers/app-provider';

export const accountsSchema = z.array(accountWithBalanceSchema);
export const categoriesSchema = z.array(categorySchema);
export const messageSchema = z.object({ message: z.string() });
export { dateInstant, decimalAmount } from './values';
export function useRead<T>(path: string, schema: ZodType<T>, enabled = true) {
  const { api, user } = useApp();
  return useQuery({
    queryKey: [user?.id, path],
    enabled: !!user && enabled,
    queryFn: ({ signal }) => api.request(path, schema, { signal }),
  });
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View or edit ${title}`}
      accessibilityHint="Opens transaction details"
      onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
      style={({ pressed }) => ({
        padding: 14,
        backgroundColor: theme.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border,
        opacity: pressed ? 0.75 : 1,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        minHeight: 80,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText tone="accent" style={{ fontSize: 22 }}>
          {item.type === 'TRANSFER' ? '⇄' : item.type === 'INCOME' ? '↙' : '↗'}
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText numberOfLines={1} style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>
          {title}
        </AppText>
        <AppText numberOfLines={1} tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
          {item.type === 'TRANSFER'
            ? `${accountName ?? 'Account'} → ${destinationAccountName ?? 'Account'}`
            : `${accountName ?? 'Account'}${categoryName && categoryName !== title ? ` · ${categoryName}` : ''}`}
        </AppText>
        {showDate && (
          <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
            {displayDate}
          </AppText>
        )}
      </View>
      <AppText
        tone={item.type === 'INCOME' ? 'accent' : item.type === 'EXPENSE' ? 'danger' : 'text'}
        style={{ fontSize: 16, fontFamily: 'DMSansBold', flexShrink: 1, textAlign: 'right' }}
      >
        {item.type === 'EXPENSE' ? '−' : item.type === 'INCOME' ? '+' : ''}
        {money(item.amountMinor)}
      </AppText>
    </Pressable>
  );
}
