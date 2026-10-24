import type { ReportSummary } from '@finora/contracts';
import { decimalAmount } from '../finance/values';

// Convert a bounded ratio for display geometry only; money stays in bigint arithmetic.
export function chartRatio(amountMinor: string, maximumMinor: string) {
  const amount = BigInt(amountMinor);
  const maximum = BigInt(maximumMinor);
  if (amount < 0n || maximum < 0n) throw new Error('Chart values must be nonnegative.');
  if (maximum === 0n) return 0;
  return Number(((amount > maximum ? maximum : amount) * 1_000_000n) / maximum) / 1_000_000;
}
export function percentageFromBasisPoints(value: string | null) {
  if (value === null) return null;
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '−' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}%`;
}
export function reportCsv(report: ReportSummary) {
  const money = (value: string) => decimalAmount(value, report.period.currency);
  // Text names are untrusted. Neutralize spreadsheet formulas without changing validated money.
  const text = (value: string) => {
    const first = Array.from(value).find(
      (character) => character.charCodeAt(0) > 31 && character.trim() !== '',
    );
    return (first && '=+@-'.includes(first)) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  };
  const rows: string[][] = [
    [
      'section',
      'name',
      'from',
      'to',
      'currency',
      'income',
      'expenses',
      'net',
      'amount',
      'opening_balance',
      'closing_balance',
      'transfer_in',
      'transfer_out',
      'debt_in',
      'debt_out',
    ],
  ];
  const row = (section: string, name: string, values: string[]) => [
    section,
    text(name),
    report.period.from,
    report.period.to,
    report.period.currency,
    ...values,
    ...Array<string>(Math.max(0, 10 - values.length)).fill(''),
  ];
  rows.push(
    row('cashflow', 'All accounts', [
      money(report.cashflow.incomeMinor),
      money(report.cashflow.expensesMinor),
      money(report.cashflow.netMinor),
      '',
      '',
      '',
      '',
      '',
    ]),
  );
  for (const category of report.categories)
    rows.push(
      row(`category_${category.type.toLowerCase()}`, category.name, [
        '',
        '',
        '',
        money(category.amountMinor),
        '',
        '',
        '',
        '',
      ]),
    );
  for (const account of report.accounts)
    rows.push(
      row('account', account.name, [
        money(account.incomeMinor),
        money(account.expensesMinor),
        money(account.netMinor),
        '',
        money(account.openingBalanceMinor),
        money(account.closingBalanceMinor),
        money(account.transferInMinor),
        money(account.transferOutMinor),
        money(account.debtInMinor),
        money(account.debtOutMinor),
      ]),
    );
  for (const month of report.trends)
    rows.push(
      row('month', month.month, [
        money(month.incomeMinor),
        money(month.expensesMinor),
        money(month.netMinor),
        '',
        '',
        '',
        '',
        '',
      ]),
    );
  return (
    '\uFEFF' +
    rows
      .map((cells) => cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\r\n')
  );
}
