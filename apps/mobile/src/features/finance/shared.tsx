import { useQuery } from '@tanstack/react-query';
import { accountWithBalanceSchema, categorySchema, type Transaction } from '@finora/contracts';
import { calendarDate, formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { z, type ZodType } from 'zod';
import { AppButton, AppText, Card } from '../../components/ui';
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
}: {
  item: Transaction;
  accountName?: string;
  categoryName?: string;
}) {
  const money = useMoney();
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
  return (
    <Card>
      <AppText style={{ fontFamily: 'DMSansBold' }}>
        {item.merchant ||
          categoryName ||
          (item.type === 'TRANSFER'
            ? 'Account transfer'
            : item.type === 'INCOME'
              ? 'Income'
              : 'Expense')}
      </AppText>
      <AppText tone={item.type === 'EXPENSE' ? 'text' : 'accent'} style={{ fontSize: 23 }}>
        {item.type === 'EXPENSE' ? '−' : item.type === 'INCOME' ? '+' : ''}
        {money(item.amountMinor)}
      </AppText>
      <AppText tone="muted">
        {accountName ?? 'Account'} · {displayDate} · {item.type.toLowerCase()}
      </AppText>
      {item.note ? <AppText>{item.note}</AppText> : null}
      <AppButton
        title="View or edit"
        variant="secondary"
        onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
      />
    </Card>
  );
}
