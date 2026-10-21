export const currencyExponents = {
  USD: 2,
  CAD: 2,
  GBP: 2,
  AUD: 2,
  INR: 2,
  JPY: 0,
  KWD: 3,
} as const;
export type Currency = keyof typeof currencyExponents;

export function parseMoney(value: string, currency: Currency): string {
  const exponent = currencyExponents[currency];
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[3]?.length ?? 0) > exponent) throw new Error('Invalid currency precision');
  const digits = `${match[2]}${(match[3] ?? '').padEnd(exponent, '0')}`;
  const amount = BigInt(`${match[1]}${digits}`);
  if (amount.toString().replace('-', '').length > 30)
    throw new Error('Amount exceeds supported limit');
  return amount.toString();
}

export function formatMoney(minor: string, currency: Currency, locale: string): string {
  const amount = BigInt(minor);
  const exponent = currencyExponents[currency];
  const absolute = amount < 0n ? -amount : amount;
  const scale = 10n ** BigInt(exponent);
  const whole = absolute / scale;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const localizedDigits = new Map(
    Array.from({ length: 10 }, (_, digit) => [
      String(digit),
      digitFormatter
        .formatToParts(digit)
        .filter((part) => part.type === 'integer')
        .map((part) => part.value)
        .join(''),
    ]),
  );
  const localize = (digits: string) =>
    Array.from(digits, (digit) => localizedDigits.get(digit) ?? digit).join('');
  const groupingParts = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).formatToParts(123456789012345);
  const integerGroups = groupingParts.filter((part) => part.type === 'integer');
  const groupSeparator = groupingParts.find((part) => part.type === 'group')?.value;
  const primaryGroupSize = Array.from(integerGroups.at(-1)?.value ?? '').length;
  const secondaryGroupSize = Array.from(
    integerGroups.at(-2)?.value ?? integerGroups.at(-1)?.value ?? '',
  ).length;
  const wholeDigits = whole.toString();
  const groups: string[] = [];
  let remaining = wholeDigits;
  let groupSize = primaryGroupSize;
  while (groupSeparator && groupSize > 0 && remaining.length > groupSize) {
    groups.unshift(remaining.slice(-groupSize));
    remaining = remaining.slice(0, -groupSize);
    groupSize = secondaryGroupSize;
  }
  groups.unshift(remaining);
  const localizedWhole = groups.map(localize).join(groupSeparator ?? '');
  const fraction =
    exponent === 0 ? '' : localize((absolute % scale).toString().padStart(exponent, '0'));

  return formatter
    .formatToParts(amount < 0n ? -1 : 1)
    .map((part) => {
      if (part.type === 'integer') return localizedWhole;
      if (part.type === 'fraction') return fraction;
      return part.value;
    })
    .join('');
}

export interface LedgerEntry {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  accountId: string;
  destinationAccountId?: string;
  amountMinor: string;
  currency: Currency;
}

export function accountBalance(
  opening: string,
  accountId: string,
  currency: Currency,
  entries: readonly LedgerEntry[],
): string {
  let result = BigInt(opening);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error('Duplicate ledger entry');
    seen.add(entry.id);
    const amount = BigInt(entry.amountMinor);
    if (amount <= 0n) throw new Error('Transaction amount must be positive');
    if (entry.currency !== currency) throw new Error('Mixed currencies require exchange rates');
    if (
      entry.type === 'TRANSFER' &&
      (!entry.destinationAccountId || entry.destinationAccountId === entry.accountId)
    )
      throw new Error('Transfer needs two distinct accounts');
    if (entry.accountId === accountId) result += entry.type === 'INCOME' ? amount : -amount;
    if (entry.type === 'TRANSFER' && entry.destinationAccountId === accountId) result += amount;
  }
  return result.toString();
}

export function cashflow(entries: readonly LedgerEntry[]) {
  const currencies = new Set(entries.map((entry) => entry.currency));
  if (currencies.size > 1) throw new Error('Mixed currencies require exchange rates');
  let income = 0n;
  let expenses = 0n;
  for (const entry of entries) {
    if (BigInt(entry.amountMinor) <= 0n) throw new Error('Transaction amount must be positive');
    if (entry.type === 'INCOME') income += BigInt(entry.amountMinor);
    if (entry.type === 'EXPENSE') expenses += BigInt(entry.amountMinor);
  }
  return {
    incomeMinor: income.toString(),
    expensesMinor: expenses.toString(),
    netMinor: (income - expenses).toString(),
    savingsRateBasisPoints: income === 0n ? null : Number(((income - expenses) * 10000n) / income),
  };
}

export function progress(targetMinor: string, savedMinor: string) {
  const target = BigInt(targetMinor);
  const saved = BigInt(savedMinor);
  if (target <= 0n || saved < 0n) throw new Error('Invalid progress amounts');
  return {
    remainingMinor: (target - saved).toString(),
    basisPoints: Number((saved * 10000n) / target),
    complete: saved >= target,
  };
}

export function calendarDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function nextOccurrence(
  anchor: string,
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  index: number,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isSafeInteger(index) || index < 0)
    throw new Error('Invalid recurrence');
  const date = new Date(`${anchor}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== anchor)
    throw new Error('Invalid anchor date');
  if (frequency === 'DAILY' || frequency === 'WEEKLY')
    date.setUTCDate(date.getUTCDate() + index * (frequency === 'WEEKLY' ? 7 : 1));
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    if (frequency === 'MONTHLY') date.setUTCMonth(date.getUTCMonth() + index);
    else date.setUTCFullYear(date.getUTCFullYear() + index);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date.toISOString().slice(0, 10);
}
