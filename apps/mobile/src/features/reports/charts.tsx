import { View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { ReportSummary } from '@finora/contracts';
import { AppText } from '../../components/ui';
import { useMoney } from '../finance/shared';
import { useTheme } from '../../theme';
import { chartRatio } from './values';

const palette = [
  '#187A5A',
  '#4579BD',
  '#B27222',
  '#9D5EA3',
  '#238A9B',
  '#C45E46',
  '#7E8043',
  '#6E6AC0',
];
export function ExpenseDonut({ categories }: { categories: ReportSummary['categories'] }) {
  const theme = useTheme();
  const money = useMoney();
  const expenses = categories.filter(
    (category) => category.type === 'EXPENSE' && BigInt(category.amountMinor) > 0n,
  );
  const total = expenses.reduce((sum, category) => sum + BigInt(category.amountMinor), 0n);
  const circumference = 2 * Math.PI * 86;
  let offset = 0;
  return (
    <>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          total
            ? `Spending donut chart with ${expenses.length} expense categories. Total ${money(total.toString())}. Exact amounts and shares are listed below.`
            : 'No expenses in the selected period.'
        }
        style={{ alignItems: 'center' }}
      >
        <Svg width={224} height={224} viewBox="0 0 224 224" accessible={false}>
          <Circle cx={112} cy={112} r={86} fill="none" stroke={theme.border} strokeWidth={28} />
          {expenses.map((category, index) => {
            const length = chartRatio(category.amountMinor, total.toString()) * circumference;
            const start = offset;
            offset += length;
            return (
              <Circle
                key={category.categoryId}
                cx={112}
                cy={112}
                r={86}
                fill="none"
                stroke={palette[index % palette.length]}
                strokeWidth={28}
                strokeDasharray={[length, circumference - length]}
                strokeDashoffset={-start}
                rotation={-90}
                origin="112, 112"
              />
            );
          })}
          <SvgText
            x={112}
            y={118}
            textAnchor="middle"
            fill={theme.text}
            fontSize={18}
            fontFamily="DMSans"
          >
            {total ? 'Expenses' : 'No expenses'}
          </SvgText>
        </Svg>
      </View>
      {!expenses.length && (
        <AppText tone="muted">
          Your spending patterns will appear after you record an expense.
        </AppText>
      )}
      {expenses.map((category, index) => (
        <View
          key={category.categoryId}
          accessible
          accessibilityLabel={`${category.name}: ${money(category.amountMinor)}, ${(category.shareBasisPoints / 100).toFixed(2)} percent of expenses.`}
          style={{ gap: 4 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: palette[index % palette.length],
              }}
            />
            <AppText style={{ flex: 1, fontFamily: 'DMSansBold' }}>{category.name}</AppText>
          </View>
          <AppText tone="muted">
            {money(category.amountMinor)} · {(category.shareBasisPoints / 100).toFixed(2)}%
          </AppText>
        </View>
      ))}
    </>
  );
}

function AmountBar({
  label,
  amount,
  maximum,
  color,
}: {
  label: string;
  amount: string;
  maximum: string;
  color: string;
}) {
  const theme = useTheme();
  const money = useMoney();
  const width = chartRatio(amount, maximum) * 100;
  return (
    <View accessible accessibilityLabel={`${label}: ${money(amount)}`} style={{ gap: 5 }}>
      <AppText tone="muted">
        {label} · {money(amount)}
      </AppText>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ height: 12, backgroundColor: theme.border, borderRadius: 6, overflow: 'hidden' }}
      >
        <View
          style={{ height: '100%', width: `${width}%`, backgroundColor: color, borderRadius: 6 }}
        />
      </View>
    </View>
  );
}
export function MonthlyChart({ trends }: { trends: ReportSummary['trends'] }) {
  const theme = useTheme();
  const money = useMoney();
  const maximum = trends
    .reduce((largest, month) => {
      const income = BigInt(month.incomeMinor);
      const expenses = BigInt(month.expensesMinor);
      return income > largest
        ? income > expenses
          ? income
          : expenses
        : expenses > largest
          ? expenses
          : largest;
    }, 0n)
    .toString();
  return (
    <>
      <AppText tone="muted">
        Each pair shares the same scale across all months. Amounts and labels accompany every bar.
      </AppText>
      {trends.map((month) => (
        <View key={month.month} style={{ gap: 10, paddingVertical: 10 }}>
          <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold' }}>
            {month.month}
          </AppText>
          <AmountBar
            label="Income"
            amount={month.incomeMinor}
            maximum={maximum}
            color={theme.accent}
          />
          <AmountBar
            label="Expenses"
            amount={month.expensesMinor}
            maximum={maximum}
            color={theme.danger}
          />
          <AppText>Net {money(month.netMinor)}</AppText>
        </View>
      ))}
    </>
  );
}
export function AccountDistribution({ accounts }: { accounts: ReportSummary['accounts'] }) {
  const theme = useTheme();
  const money = useMoney();
  const totalPositive = accounts
    .reduce(
      (sum, account) =>
        BigInt(account.closingBalanceMinor) > 0n ? sum + BigInt(account.closingBalanceMinor) : sum,
      0n,
    )
    .toString();
  return (
    <>
      <AppText tone="muted">
        Bars show each positive balance as a share of positive balances at the end of this period.
        Negative balances appear separately.
      </AppText>
      {accounts.map((account) => (
        <View key={account.accountId} style={{ gap: 6 }}>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {account.name}
            {account.archived ? ' · Archived' : ''}
          </AppText>
          {BigInt(account.closingBalanceMinor) >= 0n ? (
            <AmountBar
              label="Closing balance"
              amount={account.closingBalanceMinor}
              maximum={totalPositive}
              color={theme.accent}
            />
          ) : (
            <AppText tone="danger">Closing balance {money(account.closingBalanceMinor)}</AppText>
          )}
          <AppText tone="muted">
            Opening {money(account.openingBalanceMinor)} · Change {money(account.netMinor)}
          </AppText>
          <AppText tone="muted">
            Income {money(account.incomeMinor)} · Expenses {money(account.expensesMinor)}
          </AppText>
          <AppText tone="muted">
            Transfers in {money(account.transferInMinor)} · Out {money(account.transferOutMinor)}
          </AppText>
        </View>
      ))}
      {!accounts.length && (
        <AppText tone="muted">Create an account to see its balance and cash flow here.</AppText>
      )}
    </>
  );
}
