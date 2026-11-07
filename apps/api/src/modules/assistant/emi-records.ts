import type { EmiOverviewDto } from '@finora/contracts';
import {
  addMonthsToKey,
  compareMonthKeys,
  formatMoney,
  getAvalancheOrder,
  getCurrentMonthKey,
  getDebtMonthHistory,
  getExtraPaymentsTotal,
  getForecast,
  getIncomeForMonth,
  getNextUpcomingPayment,
  getPaymentStatus,
  getPrincipalTotals,
  getRemainingPayable,
  getRemainingPayableTotals,
  getSnowballOrder,
  getUpcomingPayments,
  summarizeMonth,
  summarizeRange,
  type EmiDebt,
} from '@finora/finance-core';
import type { AuthContext } from '../auth/service';
import { emiOverview } from '../emi/service';

type Item = { id?: string; title: string; detail: string; amountMinor?: string };
type Read = { summary: string; items: Item[] };
type Input = { feature: string; record: string | null; query: string | null; month: string | null };

const normalize = (v: unknown) =>
  String(v ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();

const toDebt = (loan: EmiOverviewDto['loans'][number]): EmiDebt => ({
  id: loan.id,
  name: loan.name,
  monthlyAmount: BigInt(loan.monthlyAmountMinor),
  startMonth: loan.startMonth,
  endMonth: loan.endMonth,
  dueDay: loan.dueDay,
  isActive: loan.isActive,
  loanTag: loan.loanTag,
  interestRatePct: loan.interestRatePct,
  principalRemaining:
    loan.principalRemainingMinor === null ? null : BigInt(loan.principalRemainingMinor),
  principalAsOf: loan.principalAsOf,
});

/** Read-only loan tracker answers for the assistant, computed with the same engine as the screens. */
export async function readEmi(context: AuthContext, input: Input): Promise<Read> {
  const { timezone, baseCurrency: currency, locale } = context.user.preferences;
  const money = (v: bigint | string) => formatMoney(String(v), currency, locale);
  const data = await emiOverview(context);
  const debts = data.loans.map(toDebt);
  const payments = data.payments.map((p) => ({
    debtId: p.loanId,
    monthKey: p.monthKey,
    amountDue: BigInt(p.amountDueMinor),
    amountPaid: BigInt(p.amountPaidMinor),
    paid: p.paid,
    paidAt: p.paidAt,
  }));
  const extras = data.extraPayments.map((e) => ({
    id: e.id,
    debtId: e.loanId,
    amount: BigInt(e.amountMinor),
    dateIso: e.date,
    note: e.note,
  }));
  const incomes = data.incomePeriods.map((p) => ({
    id: p.id,
    kind: p.kind,
    amount: BigInt(p.amountMinor),
    startMonth: p.startMonth,
    endMonth: p.endMonth,
    note: p.note,
  }));
  const now = getCurrentMonthKey(timezone);
  const month = input.month ?? now;
  const find = () =>
    debts.find(
      (d) =>
        normalize(d.id) === normalize(input.record) ||
        normalize(d.name) === normalize(input.record),
    );
  const needLoan = (): Read => ({
    summary: 'Which loan would you like to look at?',
    items: debts.map((d) => ({ id: d.id, title: d.name, detail: 'Loan or EMI' })),
  });
  const range = (d: EmiDebt) => `${d.startMonth} to ${d.endMonth ?? 'ongoing'}`;

  switch (input.feature) {
    case 'emi_summary': {
      if (!debts.length) return { summary: 'No loans or EMIs are tracked yet.', items: [] };
      const current = summarizeMonth(debts, payments, month);
      const next = getNextUpcomingPayment(debts, payments, now);
      const totals = getRemainingPayableTotals(debts, payments, extras, now);
      const principal = getPrincipalTotals(debts);
      const income = getIncomeForMonth(incomes, month).total;
      const done = current.items.filter(
        (i) => getPaymentStatus(i.amountDue, i.amountPaid) === 'paid',
      ).length;
      const active = debts.filter((d) => d.isActive);
      const ends = active.map((d) => d.endMonth).filter((m): m is string => m !== null);
      const last = ends.reduce<string | null>(
        (l, m) => (l === null || compareMonthKeys(m, l) > 0 ? m : l),
        null,
      );
      const items: Item[] = [
        {
          title: `${month} EMIs`,
          detail: `${money(current.totalPaid)} paid of ${money(current.totalDue)} · ${done}/${current.items.length} EMIs done`,
          amountMinor: (current.remaining > 0n ? current.remaining : 0n).toString(),
        },
        {
          title: 'Left to pay off',
          detail: `All remaining EMIs on fixed-term loans${totals.excludedOngoingCount ? ` (${totals.excludedOngoingCount} ongoing excluded)` : ''}`,
          amountMinor: totals.combined.toString(),
        },
      ];
      if (principal.withPrincipal)
        items.push({
          title: 'Principal outstanding',
          detail: `Entered by you for ${principal.withPrincipal} loan(s)`,
          amountMinor: principal.total.toString(),
        });
      if (next)
        items.push({
          title: `Next: ${next.debt.name}`,
          detail: `${next.overdue ? 'Overdue · ' : ''}Due ${next.dueDateIso.slice(0, 10)}`,
          amountMinor: next.remaining.toString(),
        });
      if (income > 0n)
        items.push({
          title: 'Income this month',
          detail: `EMIs take ${Number((current.totalDue * 100n) / income)}% of income`,
          amountMinor: income.toString(),
        });
      if (last)
        items.push({
          title: 'Debt-free by',
          detail: `${last} (${Math.max(0, compareMonthKeys(last, now))} months to go)`,
        });
      return { summary: `Loan tracker for ${month}.`, items };
    }
    case 'emi_loans':
      return {
        summary: debts.length
          ? `You track ${debts.length} loan(s).`
          : 'No loans or EMIs are tracked yet.',
        items: debts.map((d) => {
          const remaining = getRemainingPayable(d, payments, extras, now);
          return {
            id: d.id,
            title: d.name,
            detail: `${money(d.monthlyAmount)}/mo · ${range(d)} · ${d.loanTag}${d.isActive ? '' : ' · Archived'}${remaining === null ? ' · Ongoing' : ` · ${money(remaining)} left`}${d.principalRemaining !== null ? ` · principal ${money(d.principalRemaining)}` : ''}`,
            amountMinor: (remaining ?? 0n).toString(),
          };
        }),
      };
    case 'emi_history': {
      const debt = find();
      if (!debt) return needLoan();
      const rows = getDebtMonthHistory(debt, payments, now).reverse();
      const paid = rows.filter(
        (r) => getPaymentStatus(r.amountDue, r.amountPaid) === 'paid',
      ).length;
      return {
        summary: `${debt.name}: ${paid} of ${rows.length} months paid; ${money(getExtraPaymentsTotal(extras, debt.id))} prepaid.`,
        items: rows.slice(0, 100).map((r) => ({
          title: r.monthKey,
          detail:
            getPaymentStatus(r.amountDue, r.amountPaid) +
            (r.amountPaid ? ` · paid ${money(r.amountPaid)}` : ''),
          amountMinor: r.amountDue.toString(),
        })),
      };
    }
    case 'emi_upcoming': {
      const rows = getUpcomingPayments(debts, payments, now, 10, 36, 6);
      return {
        summary: rows.length
          ? `Your next ${rows.length} unpaid EMIs.`
          : 'No unpaid EMIs are coming up.',
        items: rows.map((r) => ({
          id: r.debt.id,
          title: `${r.debt.name} · ${r.monthKey}`,
          detail: `${r.overdue ? 'Overdue · ' : ''}Due ${r.dueDateIso.slice(0, 10)}${r.amountPaid ? ` · ${money(r.amountPaid)} already paid` : ''}`,
          amountMinor: r.remaining.toString(),
        })),
      };
    }
    case 'emi_payoff': {
      const avalanche = /aval|rate|interest/i.test(input.query ?? '');
      const order = (avalanche ? getAvalancheOrder : getSnowballOrder)(
        debts,
        payments,
        extras,
        now,
      );
      return {
        summary: `${avalanche ? 'Avalanche (highest interest rate first)' : 'Snowball (smallest balance first)'} payoff order for fixed-term loans.`,
        items: order.map((e, i) => ({
          id: e.debt.id,
          title: `${i + 1}. ${e.debt.name}`,
          detail: avalanche
            ? e.debt.interestRatePct !== null
              ? `${e.debt.interestRatePct}% interest`
              : 'No rate set'
            : range(e.debt),
          amountMinor: e.remaining.toString(),
        })),
      };
    }
    case 'emi_schedule': {
      const debt = input.record ? find() : undefined;
      if (input.record && !debt) return needLoan();
      const last = debt?.endMonth ?? addMonthsToKey(now, 23);
      const horizon =
        compareMonthKeys(last, addMonthsToKey(now, 119)) > 0 ? addMonthsToKey(now, 119) : last;
      const rows = summarizeRange(debt ? [debt] : debts, payments, now, horizon)
        .filter((m) => m.totalDue > 0n)
        .slice(0, 100);
      return {
        summary: debt
          ? `${debt.name} EMI schedule from ${now}.`
          : `Total EMIs due each month from ${now}.`,
        items: rows.map((m) => ({
          title: m.monthKey,
          detail: m.totalPaid > 0n ? `${money(m.totalPaid)} already paid` : 'Unpaid',
          amountMinor: m.totalDue.toString(),
        })),
      };
    }
    case 'emi_forecast': {
      const rows = getForecast(debts, payments, incomes, now, 12);
      return {
        summary: 'Income against EMIs for the next 12 months.',
        items: rows.map((r) => ({
          title: r.monthKey,
          detail: `Income ${money(r.income)} · EMIs ${money(r.emisDue)} · ${r.net < 0n ? 'short' : 'left'} ${money(r.net < 0n ? -r.net : r.net)}`,
          amountMinor: r.net.toString(),
        })),
      };
    }
    case 'emi_income':
      return {
        summary: incomes.length
          ? `You have ${incomes.length} income period(s).`
          : 'No income periods are set.',
        items: data.incomePeriods.map((p) => ({
          id: p.id,
          title: `${p.kind} · ${p.startMonth} to ${p.endMonth ?? 'ongoing'}`,
          detail: p.note || 'Income period',
          amountMinor: p.amountMinor,
        })),
      };
    case 'emi_prepayments': {
      const debt = input.record ? find() : undefined;
      if (input.record && !debt) return needLoan();
      const names = new Map(debts.map((d) => [d.id, d.name]));
      return {
        summary: 'Lump-sum prepayments.',
        items: data.extraPayments
          .filter((e) => !debt || e.loanId === debt.id)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => ({
            id: e.id,
            title: e.date,
            detail: `${names.get(e.loanId) ?? 'Loan'}${e.note ? ` · ${e.note}` : ''}`,
            amountMinor: e.amountMinor,
          })),
      };
    }
    default:
      return { summary: '', items: [] };
  }
}
