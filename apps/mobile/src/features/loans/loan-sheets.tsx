import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { z } from 'zod';
import {
  emiIncomePeriodSchema,
  emiExtraPaymentSchema,
  emiLoanSchema,
  emiPaymentSchema,
  type EmiIncomePeriodDto,
  type EmiLoanDto,
} from '@finora/contracts';
import { calendarDate, formatMoney, parseMoney } from '@finora/finance-core';
import {
  getDebtMonthHistory,
  getExtraPaymentsTotal,
  getForecast,
  getPaymentStatus,
  getRemainingPayable,
} from '@finora/finance-core';
import { AppButton, AppText, Card, Choice, Feedback, Field } from '../../components/ui';
import { Icon } from '../../components/design';
import { DateField, FlowSheet, MonthPicker, SelectField } from '../../components/flow';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { accountsSchema, categoriesSchema, useRead } from '../finance/shared';
import { decimalAmount } from '../finance/values';
import { forecastMonths, monthLabel } from './summary';
import { useEmiWrite, useLoans } from './model';

function useMoneyFormat() {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const locale = user?.preferences.locale ?? 'en-IN';
  return {
    currency,
    locale,
    money: (minor: bigint | string) => formatMoney(String(minor), currency, locale),
  };
}

/** The pill used for paid, partial and unpaid months. */
function StatusPill({ label, tone }: { label: string; tone: 'success' | 'accent' }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: tone === 'success' ? theme.successSoft : theme.accentSoft,
      }}
    >
      {tone === 'success' && <Icon name="check" size={13} color={theme.success} />}
      <AppText
        style={{
          fontSize: 12,
          fontFamily: 'DMSansBold',
          color: tone === 'success' ? theme.success : theme.accent,
        }}
      >
        {label}
      </AppText>
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </Pressable>
  );
}

/**
 * Month-by-month ledger for one loan. Mark a month paid in one tap, log a different amount, or
 * undo it. When debt is not kept separate, a payment also records a normal expense from the
 * account and category chosen at the top.
 */
export function LoanHistorySheet({
  loanId,
  onClose,
}: {
  loanId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { user } = useApp();
  const { money, currency, locale } = useMoneyFormat();
  const { loans, rawPayments, rawExtras, extras, debts, payments, month } = useLoans();
  const write = useEmiWrite();
  const separate = user?.preferences.keepDebtSeparate ?? false;
  const loan = loans.find((item) => item.id === loanId);
  const accounts = useRead('accounts', accountsSchema, !!loanId && !separate);
  const categories = useRead('categories', categoriesSchema, !!loanId && !separate);
  const activeAccounts = (accounts.data ?? []).filter((a) => !a.archived);
  const expenseCategories = (categories.data ?? []).filter(
    (c) => !c.archived && c.type === 'EXPENSE',
  );
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [prepayAmount, setPrepayAmount] = useState('');
  const [prepayDate, setPrepayDate] = useState(
    calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata'),
  );
  const [prepayNote, setPrepayNote] = useState('');
  useEffect(() => {
    if (!accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id);
    if (!categoryId && expenseCategories.length) {
      const likely = expenseCategories.find((c) => /emi|loan|debt|bill/i.test(c.name));
      setCategoryId((likely ?? expenseCategories[0]!).id);
    }
  }, [activeAccounts, expenseCategories, accountId, categoryId]);
  const debt = debts.find((item) => item.id === loanId);
  const history = useMemo(
    () => (debt ? getDebtMonthHistory(debt, payments, month) : []),
    [debt, payments, month],
  );
  if (!loan || !debt)
    return (
      <FlowSheet title="Loan" visible={false} onClose={onClose}>
        {null}
      </FlowSheet>
    );
  const paidCount = history.filter(
    (entry) => getPaymentStatus(entry.amountDue, entry.amountPaid) === 'paid',
  ).length;
  const totalPaid = history.reduce((sum, entry) => sum + entry.amountPaid, 0n);
  const totalDue = history.reduce((sum, entry) => sum + entry.amountDue, 0n);
  const remaining = getRemainingPayable(debt, payments, extras, month);
  const prepaid = getExtraPaymentsTotal(extras, debt.id);

  async function mark(monthKey: string, minor: string | null) {
    setBusy(monthKey);
    setError(undefined);
    try {
      await write('POST', `emi/loans/${loan!.id}/payments/${monthKey}`, emiPaymentSchema, {
        amountMinor: minor,
        ...(separate
          ? {}
          : { accountId: accountId || undefined, categoryId: categoryId || undefined }),
      });
      setEditing(null);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }
  async function undo(monthKey: string, version: number) {
    setBusy(monthKey);
    setError(undefined);
    try {
      await write('DELETE', `emi/loans/${loan!.id}/payments/${monthKey}`, z.unknown(), { version });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }
  function saveAmount(monthKey: string) {
    try {
      void mark(monthKey, parseMoney(amount.trim(), currency));
    } catch {
      setError(new Error('Enter an amount greater than zero.'));
    }
  }
  async function addPrepayment() {
    setBusy('prepay');
    setError(undefined);
    try {
      await write('POST', `emi/loans/${loan!.id}/extra-payments`, emiExtraPaymentSchema, {
        amountMinor: parseMoney(prepayAmount.trim(), currency),
        date: prepayDate,
        note: prepayNote.trim(),
        ...(separate
          ? {}
          : { accountId: accountId || undefined, categoryId: categoryId || undefined }),
      });
      setPrepayOpen(false);
      setPrepayAmount('');
      setPrepayNote('');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }
  async function removePrepayment(id: string, version: number) {
    setBusy(id);
    setError(undefined);
    try {
      await write('DELETE', `emi/extra-payments/${id}`, z.unknown(), {
        version,
        confirmation: 'DELETE',
      });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }
  const loanPrepayments = rawExtras
    .filter((e) => e.loanId === loan.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const range = `${monthLabel(loan.startMonth, locale)} to ${loan.endMonth ? monthLabel(loan.endMonth, locale) : 'ongoing'}`;
  return (
    <FlowSheet title={loan.name} visible={!!loanId} onClose={onClose}>
      <View style={{ gap: 4 }}>
        <AppText tone="muted" style={{ fontSize: 13 }}>
          {money(loan.monthlyAmountMinor)}/mo · {range}
        </AppText>
        <AppText tone="muted" style={{ fontSize: 13 }}>
          {paidCount}/{history.length} months paid ({money(totalPaid)} / {money(totalDue)})
        </AppText>
        <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>
          {remaining === null ? 'Ongoing loan' : `Remaining: ${money(remaining)}`}
          {prepaid > 0n ? ` · prepaid ${money(prepaid)}` : ''}
        </AppText>
      </View>
      {!separate && (
        <Card style={{ gap: 10, padding: 12, borderRadius: 14 }}>
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Each payment is also recorded as a normal expense from:
          </AppText>
          <SelectField
            label="Account"
            value={accountId}
            onChange={setAccountId}
            options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <SelectField
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={expenseCategories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Card>
      )}
      <View style={{ gap: 8 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>Prepayments</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={prepayOpen ? 'Cancel prepayment' : 'Add prepayment'}
            onPress={() => setPrepayOpen(!prepayOpen)}
            hitSlop={8}
          >
            <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 13 }}>
              {prepayOpen ? 'Cancel' : '+ Add'}
            </AppText>
          </Pressable>
        </View>
        {prepayOpen && (
          <View style={{ gap: 8 }}>
            <Field
              label="Amount"
              value={prepayAmount}
              onChangeText={setPrepayAmount}
              keyboardType="decimal-pad"
            />
            <DateField label="Date" value={prepayDate} onChange={setPrepayDate} />
            <Field label="Note (optional)" value={prepayNote} onChangeText={setPrepayNote} />
            <AppButton
              title="Save prepayment"
              loading={busy === 'prepay'}
              onPress={() => void addPrepayment()}
            />
          </View>
        )}
        {!loanPrepayments.length && !prepayOpen && (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Lump-sum payments that reduce what is left.
          </AppText>
        )}
        {loanPrepayments.map((extra) => (
          <View key={extra.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
                {money(extra.amountMinor)}
              </AppText>
              <AppText tone="muted" style={{ fontSize: 12 }} numberOfLines={1}>
                {extra.date}
                {extra.note ? ` · ${extra.note}` : ''}
              </AppText>
            </View>
            <RoundButton
              label={`Delete prepayment of ${money(extra.amountMinor)}`}
              disabled={busy === extra.id}
              onPress={() => void removePrepayment(extra.id, extra.version)}
            >
              <Icon name="expense" size={16} color={theme.danger} />
            </RoundButton>
          </View>
        ))}
      </View>
      {!!error && <Feedback error={error} />}
      <ScrollView style={{ maxHeight: 460 }} nestedScrollEnabled>
        {history.map((entry) => {
          const status = getPaymentStatus(entry.amountDue, entry.amountPaid);
          const current = entry.monthKey === month;
          const raw = rawPayments.find(
            (p) => p.loanId === loan.id && p.monthKey === entry.monthKey,
          );
          const working = busy === entry.monthKey;
          return (
            <View
              key={entry.monthKey}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 8,
                gap: 8,
                borderRadius: 12,
                backgroundColor: current ? theme.successSoft : 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>
                    {monthLabel(entry.monthKey, locale)}
                    {current ? '  ' : ''}
                    {current && (
                      <AppText
                        style={{ fontSize: 10, color: theme.success, fontFamily: 'DMSansBold' }}
                      >
                        THIS MONTH
                      </AppText>
                    )}
                  </AppText>
                  <AppText tone="muted" style={{ fontSize: 13 }}>
                    {money(entry.amountDue)}
                    {status === 'partial' ? ` · paid ${money(entry.amountPaid)}` : ''}
                  </AppText>
                </View>
                {status === 'paid' && <StatusPill label="Paid" tone="success" />}
                {status === 'partial' && <StatusPill label="Partial" tone="accent" />}
                {status === 'unpaid' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${monthLabel(entry.monthKey, locale)} paid`}
                    disabled={working}
                    onPress={() => void mark(entry.monthKey, null)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 12,
                      backgroundColor: theme.accent,
                      opacity: working ? 0.5 : 1,
                    }}
                  >
                    <AppText
                      style={{ fontSize: 13, fontFamily: 'DMSansBold', color: theme.onAccent }}
                    >
                      {working ? 'Saving…' : 'Mark Paid'}
                    </AppText>
                  </Pressable>
                )}
                <RoundButton
                  label={`Edit ${monthLabel(entry.monthKey, locale)} amount`}
                  onPress={() => {
                    setEditing(editing === entry.monthKey ? null : entry.monthKey);
                    setAmount(
                      entry.amountPaid > 0n
                        ? decimalAmount(entry.amountPaid.toString(), currency)
                        : decimalAmount(entry.amountDue.toString(), currency),
                    );
                  }}
                >
                  <Icon name="activity" size={16} color={theme.muted} />
                </RoundButton>
                {status !== 'unpaid' && raw && (
                  <RoundButton
                    label={`Mark ${monthLabel(entry.monthKey, locale)} unpaid`}
                    disabled={working}
                    onPress={() => void undo(entry.monthKey, raw.version)}
                  >
                    <Icon name="repeat" size={16} color={theme.muted} />
                  </RoundButton>
                )}
              </View>
              {editing === entry.monthKey && (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Amount paid"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <AppButton
                    title="Save"
                    loading={working}
                    onPress={() => saveAmount(entry.monthKey)}
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </FlowSheet>
  );
}

const blankLoan = {
  name: '',
  amount: '',
  start: '',
  end: '' as string,
  ongoing: false,
  dueDay: '5',
  tag: 'small' as 'small' | 'large',
  rate: '',
  principal: '',
};

/** Add or edit a loan. Only the amount, name and first month are required. */
export function LoanFormSheet({
  loan,
  visible,
  onClose,
  month,
}: {
  loan: EmiLoanDto | null;
  visible: boolean;
  onClose: () => void;
  month: string;
}) {
  const { currency } = useMoneyFormat();
  const write = useEmiWrite();
  const theme = useTheme();
  const [form, setForm] = useState({ ...blankLoan, start: month });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!visible) return;
    setError(undefined);
    setForm(
      loan
        ? {
            name: loan.name,
            amount: decimalAmount(loan.monthlyAmountMinor, currency),
            start: loan.startMonth,
            end: loan.endMonth ?? loan.startMonth,
            ongoing: loan.endMonth === null,
            dueDay: String(loan.dueDay),
            tag: loan.loanTag,
            rate: loan.interestRatePct === null ? '' : String(loan.interestRatePct),
            principal:
              loan.principalRemainingMinor === null
                ? ''
                : decimalAmount(loan.principalRemainingMinor, currency),
          }
        : { ...blankLoan, start: month, end: month },
    );
  }, [visible, loan, month, currency]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const body = {
        name: form.name.trim(),
        monthlyAmountMinor: parseMoney(form.amount.trim(), currency),
        startMonth: form.start,
        endMonth: form.ongoing ? null : form.end,
        dueDay: Number(form.dueDay),
        loanTag: form.tag,
        interestRatePct: form.rate.trim() ? Number(form.rate) : null,
        principalRemainingMinor: form.principal.trim()
          ? parseMoney(form.principal.trim(), currency)
          : null,
      };
      if (loan)
        await write('PATCH', `emi/loans/${loan.id}`, emiLoanSchema, {
          ...body,
          isActive: loan.isActive,
          version: loan.version,
        });
      else await write('POST', 'emi/loans', emiLoanSchema, body);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error && /precision|Invalid|NaN/.test(failure.message)
          ? new Error('Check the amounts and day entered.')
          : failure,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FlowSheet
      title={loan ? 'Edit debt' : 'Add debt'}
      visible={visible}
      onClose={onClose}
      busy={busy}
      footer={
        <AppButton
          title={loan ? 'Save changes' : 'Add debt'}
          loading={busy}
          disabled={!form.name.trim() || !form.amount.trim()}
          onPress={() => void save()}
        />
      }
    >
      <Field
        label="Name"
        value={form.name}
        onChangeText={(v) => set('name', v)}
        placeholder="e.g. SBI Personal Loan"
      />
      <Field
        label={`Monthly EMI (${currency})`}
        value={form.amount}
        onChangeText={(v) => set('amount', v)}
        keyboardType="decimal-pad"
      />
      <Choice
        label="Size"
        value={form.tag}
        onChange={(v) => set('tag', v)}
        options={[
          { value: 'small', label: 'Small' },
          { value: 'large', label: 'Large' },
        ]}
      />
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>Start month</AppText>
      <MonthPicker label="Start month" value={form.start} onChange={(v) => set('start', v)} />
      <Field
        label="Due day of the month"
        value={form.dueDay}
        onChangeText={(v) => set('dueDay', v.replace(/D/g, '').slice(0, 2))}
        keyboardType="number-pad"
      />
      <Field
        label="Interest rate % (optional, for Avalanche ranking)"
        value={form.rate}
        onChangeText={(v) => set('rate', v)}
        keyboardType="decimal-pad"
        placeholder="e.g. 12.5"
      />
      <View style={{ gap: 4 }}>
        <Field
          label={`Remaining principal (${currency}, optional)`}
          value={form.principal}
          onChangeText={(v) => set('principal', v)}
          keyboardType="decimal-pad"
          placeholder="Outstanding amount from the lender's app"
        />
        <AppText tone="muted" style={{ fontSize: 12 }}>
          {loan?.principalAsOf
            ? `Last updated ${loan.principalAsOf}. Change it when your lender shows a new figure.`
            : 'What you still owe on the loan itself, not counting future interest.'}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: form.ongoing }}
        accessibilityLabel="Ongoing (no end date)"
        onPress={() => set('ongoing', !form.ongoing)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: form.ongoing ? theme.accent : theme.border,
            backgroundColor: form.ongoing ? theme.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {form.ongoing && <Icon name="check" size={14} color={theme.onAccent} />}
        </View>
        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>Ongoing (no end date)</AppText>
      </Pressable>
      {!form.ongoing && (
        <>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>End month</AppText>
          <MonthPicker label="End month" value={form.end} onChange={(v) => set('end', v)} />
        </>
      )}
      {!!error && <Feedback error={error} />}
    </FlowSheet>
  );
}

/** Add, edit and remove salary and extra income periods. */
export function IncomeSheet({
  visible,
  onClose,
  periods,
  month,
}: {
  visible: boolean;
  onClose: () => void;
  periods: EmiIncomePeriodDto[];
  month: string;
}) {
  const { currency, locale, money } = useMoneyFormat();
  const write = useEmiWrite();
  const [editing, setEditing] = useState<EmiIncomePeriodDto | 'new' | null>(null);
  const [form, setForm] = useState({
    kind: 'salary' as 'salary' | 'extra',
    amount: '',
    start: month,
    end: month,
    ongoing: true,
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  function open(period: EmiIncomePeriodDto | 'new') {
    setError(undefined);
    setEditing(period);
    setForm(
      period === 'new'
        ? { kind: 'salary', amount: '', start: month, end: month, ongoing: true, note: '' }
        : {
            kind: period.kind,
            amount: decimalAmount(period.amountMinor, currency),
            start: period.startMonth,
            end: period.endMonth ?? period.startMonth,
            ongoing: period.endMonth === null,
            note: period.note,
          },
    );
  }
  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const body = {
        kind: form.kind,
        amountMinor: parseMoney(form.amount.trim(), currency),
        startMonth: form.start,
        endMonth: form.ongoing ? null : form.end,
        note: form.note.trim(),
      };
      if (editing && editing !== 'new')
        await write('PATCH', `emi/income-periods/${editing.id}`, emiIncomePeriodSchema, {
          ...body,
          version: editing.version,
        });
      else await write('POST', 'emi/income-periods', emiIncomePeriodSchema, body);
      setEditing(null);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function remove(period: EmiIncomePeriodDto) {
    setBusy(true);
    try {
      await write('DELETE', `emi/income-periods/${period.id}`, z.unknown(), {
        version: period.version,
      });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FlowSheet title="Your income" visible={visible} onClose={onClose} busy={busy}>
      {editing === null ? (
        <>
          {!periods.length && (
            <AppText tone="muted">
              Add your salary to see how your EMIs compare with what you earn each month.
            </AppText>
          )}
          {periods.map((period) => (
            <Card key={period.id} style={{ gap: 6, padding: 12, borderRadius: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText style={{ fontFamily: 'DMSansBold' }}>
                  {period.kind === 'salary' ? 'Salary' : 'Extra income'}
                </AppText>
                <AppText style={{ fontFamily: 'DMSansBold' }}>{money(period.amountMinor)}</AppText>
              </View>
              <AppText tone="muted" style={{ fontSize: 13 }}>
                {monthLabel(period.startMonth, locale)} to{' '}
                {period.endMonth ? monthLabel(period.endMonth, locale) : 'ongoing'}
                {period.note ? ` · ${period.note}` : ''}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <AppButton title="Edit" variant="secondary" onPress={() => open(period)} />
                <AppButton title="Remove" variant="danger" onPress={() => void remove(period)} />
              </View>
            </Card>
          ))}
          {!!error && <Feedback error={error} />}
          <AppButton title="Add income" onPress={() => open('new')} />
        </>
      ) : (
        <>
          <Choice
            label="Kind"
            value={form.kind}
            onChange={(v) => setForm((c) => ({ ...c, kind: v }))}
            options={[
              { value: 'salary', label: 'Salary' },
              { value: 'extra', label: 'Extra' },
            ]}
          />
          <Field
            label={`Monthly amount (${currency})`}
            value={form.amount}
            onChangeText={(v) => setForm((c) => ({ ...c, amount: v }))}
            keyboardType="decimal-pad"
          />
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>From</AppText>
          <MonthPicker
            label="From"
            value={form.start}
            onChange={(v) => setForm((c) => ({ ...c, start: v }))}
          />
          <Choice
            label="Until"
            value={form.ongoing ? 'ongoing' : 'date'}
            onChange={(v) => setForm((c) => ({ ...c, ongoing: v === 'ongoing' }))}
            options={[
              { value: 'ongoing', label: 'Ongoing' },
              { value: 'date', label: 'A month' },
            ]}
          />
          {!form.ongoing && (
            <MonthPicker
              label="Last month"
              value={form.end}
              onChange={(v) => setForm((c) => ({ ...c, end: v }))}
            />
          )}
          <Field
            label="Note (optional)"
            value={form.note}
            onChangeText={(v) => setForm((c) => ({ ...c, note: v }))}
          />
          {!!error && <Feedback error={error} />}
          <AppButton
            title="Save"
            loading={busy}
            disabled={!form.amount.trim()}
            onPress={() => void save()}
          />
          <AppButton
            title="Back"
            variant="secondary"
            disabled={busy}
            onPress={() => setEditing(null)}
          />
        </>
      )}
    </FlowSheet>
  );
}

/** Income against EMIs for the next twelve months. */
export function ForecastSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const { money, locale } = useMoneyFormat();
  const { debts, payments, incomes, month } = useLoans();
  const rows = useMemo(
    () => getForecast(debts, payments, incomes, forecastMonths(month)[0]!, 12),
    [debts, payments, incomes, month],
  );
  return (
    <FlowSheet title="12-month forecast" visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled>
        {rows.map((row) => (
          <View
            key={row.monthKey}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 }}
          >
            <View style={{ flex: 1 }}>
              <AppText style={{ fontFamily: 'DMSansBold' }}>
                {monthLabel(row.monthKey, locale)}
              </AppText>
              <AppText tone="muted" style={{ fontSize: 12 }}>
                Income {money(row.income)} · EMIs {money(row.emisDue)}
              </AppText>
            </View>
            <AppText
              style={{
                fontFamily: 'DMSansBold',
                color: row.net < 0n ? theme.danger : theme.success,
                fontVariant: ['tabular-nums'],
              }}
            >
              {row.net < 0n ? `-${money(-row.net)}` : money(row.net)}
            </AppText>
          </View>
        ))}
      </ScrollView>
    </FlowSheet>
  );
}
