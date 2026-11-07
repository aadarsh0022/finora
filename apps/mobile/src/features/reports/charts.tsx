import { Pressable, View } from 'react-native';
import { Chevron } from '../../components/chevron';
import { useState } from 'react';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { ReportSummary } from '@finora/contracts';
import { AppText } from '../../components/ui';
import { useMoney } from '../finance/shared';
import { useTheme } from '../../theme';
import { chartRatio } from './values';
import { useApp } from '../../providers/app-provider';

const palette = [
  '#D9480F',
  '#2F9E73',
  '#B27222',
  '#9D5EA3',
  '#238A9B',
  '#C45E46',
  '#7E8043',
  '#4579BD',
];
export function ExpenseDonut({ categories }: { categories: ReportSummary['categories'] }) {
  const theme = useTheme();
  const money = useMoney();
  const expenses = categories
    .filter((category) => category.type === 'EXPENSE' && BigInt(category.amountMinor) > 0n)
    .sort((left, right) =>
      BigInt(left.amountMinor) === BigInt(right.amountMinor)
        ? 0
        : BigInt(left.amountMinor) > BigInt(right.amountMinor)
          ? -1
          : 1,
    );
  const total = expenses.reduce((sum, category) => sum + BigInt(category.amountMinor), 0n);
  const circumference = 2 * Math.PI * 86;
  let offset = 0;
  return (
    <>
      {expenses.length > 0 && (
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
          <Svg width={180} height={180} viewBox="0 0 224 224" accessible={false}>
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
      )}
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
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: palette[index % palette.length],
            }}
          />
          <AppText style={{ flex: 1, fontSize: 14 }}>{category.name}</AppText>
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            <AppText style={{ fontSize: 15, fontFamily: 'DMSansBold' }}>
              {money(category.amountMinor)}
            </AppText>
            <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
              {(category.shareBasisPoints / 100).toFixed(2)}%
            </AppText>
          </View>
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
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
      >
        <AppText tone="muted" style={{ fontSize: 12 }}>
          {label}
        </AppText>
        <AppText style={{ color, fontSize: 14, fontFamily: 'DMSansBold' }}>{money(amount)}</AppText>
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' }}
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
  const { user } = useApp();
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
    <View style={{ gap: 20 }}>
      {trends.map((month) => (
        <View key={month.month} style={{ gap: 8 }}>
          <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
            {new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${month.month}-01T12:00:00Z`))}
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
          <AppText tone={BigInt(month.netMinor) < 0n ? 'danger' : 'muted'} style={{ fontSize: 12 }}>
            Net {money(month.netMinor)}
          </AppText>
        </View>
      ))}
    </View>
  );
}
export function AccountDistribution({ accounts }: { accounts: ReportSummary['accounts'] }) {
  const totalPositive = accounts
    .reduce(
      (sum, account) =>
        BigInt(account.closingBalanceMinor) > 0n ? sum + BigInt(account.closingBalanceMinor) : sum,
      0n,
    )
    .toString();
  return (
    <View style={{ gap: 12 }}>
      {accounts.map((account) => (
        <AccountRow key={account.accountId} account={account} totalPositive={totalPositive} />
      ))}
      {!accounts.length && (
        <AppText tone="muted">Create an account to see its balance and cash flow here.</AppText>
      )}
    </View>
  );
}

function AccountRow({
  account,
  totalPositive,
}: {
  account: ReportSummary['accounts'][number];
  totalPositive: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const money = useMoney();
  const positive = BigInt(account.closingBalanceMinor) > 0n;
  const rows = [
    ['Opening balance', account.openingBalanceMinor],
    ['Change in balance', account.netMinor],
    ['Income', account.incomeMinor],
    ['Expenses', account.expensesMinor],
    ['Transfers in', account.transferInMinor],
    ['Transfers out', account.transferOutMinor],
    ['Debt money in', account.debtInMinor],
    ['Debt money out', account.debtOutMinor],
  ] as const;
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Account details: ${account.name}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => ({
          gap: 8,
          paddingVertical: 8,
          opacity: pressed ? 0.7 : 1,
          minHeight: 64,
        })}
      >
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>
              {account.name}
              {account.archived ? ' · Archived' : ''}
            </AppText>
            <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
              Closing balance · {expanded ? 'Hide details' : 'View details'}
            </AppText>
          </View>
          <AppText
            tone={BigInt(account.closingBalanceMinor) < 0n ? 'danger' : 'text'}
            style={{ fontFamily: 'DMSansBold', flexShrink: 1, textAlign: 'right' }}
          >
            {money(account.closingBalanceMinor)}
          </AppText>
          <Chevron direction={expanded ? 'up' : 'down'} />
        </View>
        {positive && (
          <View
            accessible
            accessibilityLabel={`${account.name} share of positive closing balances`}
            accessibilityValue={{
              min: 0,
              max: 100,
              now: chartRatio(account.closingBalanceMinor, totalPositive) * 100,
            }}
            style={{
              height: 5,
              borderRadius: 3,
              backgroundColor: theme.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${chartRatio(account.closingBalanceMinor, totalPositive) * 100}%`,
                backgroundColor: theme.accent,
                borderRadius: 3,
              }}
            />
          </View>
        )}
      </Pressable>
      {expanded && (
        <View style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
          {rows.map(([label, value]) => (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <AppText tone="muted" style={{ fontSize: 13 }}>
                {label}
              </AppText>
              <AppText
                tone={
                  label === 'Expenses' || BigInt(value) < 0n
                    ? 'danger'
                    : label === 'Income'
                      ? 'success'
                      : 'text'
                }
                style={{ fontSize: 14 }}
              >
                {money(value)}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
