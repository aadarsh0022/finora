import { useQuery } from '@tanstack/react-query';
import { accountWithBalanceSchema, categorySchema, type Transaction } from '@finora/contracts';
import { calendarDate, formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { z, type ZodType } from 'zod';
import { AppText } from '../../components/ui';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
