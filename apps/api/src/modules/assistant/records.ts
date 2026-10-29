import {
  assistantRecordsArgsSchema,
  assistantRecordsResultSchema,
  assistantPeriodArgsSchema,
} from '@finora/contracts';
import { calendarDate, formatMoney } from '@finora/finance-core';
import type { AuthContext } from '../auth/service';
import { ledgerSnapshot } from '../finance/ledger';
import { listCategories } from '../finance/entities';
import { listGoals } from '../advanced/goals';
import { listBudgets, totalLimit } from '../advanced/budgets';
import { listDebts } from '../debts/service';
import { listRules, listOccurrences } from '../advanced/recurring';
import { getInsights } from '../reports/insights';
import { getAssistantUsage } from './usage';
import { ApiError } from '../../utils/http';
const normalize = (v: unknown) =>
  String(v ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
export async function readRecords(context: AuthContext, value: unknown) {
  const input = assistantRecordsArgsSchema.parse(value);
  const { timezone, baseCurrency: currency, locale } = context.user.preferences;
  const money = (v: string) => formatMoney(v, currency, locale);
  const month = input.month ?? calendarDate(new Date(), timezone).slice(0, 7);
  if ((input.from === null) !== (input.to === null))
    throw new ApiError(400, 'DATE_RANGE_REQUIRED', 'Choose both a start and end date.');
  if (input.from && input.to) assistantPeriodArgsSchema.parse({ from: input.from, to: input.to });
  type Item = { id?: string; title: string; detail: string; amountMinor?: string };
  let items: Item[] = [];
  let summary = '';
  switch (input.feature) {
    case 'accounts':
      items = (await ledgerSnapshot(context)).accounts.map((a) => ({
        id: a.id,
        title: a.name,
        detail: `${a.type}${a.archived ? ' · Archived' : ''}`,
        amountMinor: a.balanceMinor,
      }));
      break;
    case 'categories':
      items = (await listCategories(context, true)).map((c) => ({
        id: c.id,
        title: c.name,
        detail: `${c.type}${c.archived ? ' · Archived' : ''}`,
      }));
      break;
    case 'transactions': {
      const snapshot = await ledgerSnapshot(context);
      const rows = snapshot.transactions.filter((t) => {
        const day = calendarDate(new Date(t.date), timezone);
        return (
          (!input.type || t.type === input.type) &&
          (!input.from || day >= input.from) &&
          (!input.to || day <= input.to) &&
          (!input.month || day.startsWith(input.month)) &&
          (!input.query || normalize(`${t.merchant} ${t.note}`).includes(normalize(input.query)))
        );
      });
      items = rows
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((t) => ({
          id: t.id,
          title: t.merchant || t.type,
          detail: `${t.type} · ${calendarDate(new Date(t.date), timezone)} · ${snapshot.accounts.find((a) => a.id === t.accountId)?.name ?? 'Account'}`,
          amountMinor: t.amountMinor,
        }));
      break;
    }
    case 'budgets':
      items = (await listBudgets(context, month)).map((b) => ({
        id: b.id,
        title: b.month,
        detail: `Category ${b.categoryId} · Spent ${money(b.spentMinor)} · Remaining ${money(b.remainingMinor)}`,
        amountMinor: b.amountMinor,
      }));
      break;
    case 'monthly_budget': {
      const budget = await totalLimit(context, month);
      summary = budget.plan
        ? `Your overall budget is ${money(budget.plan.amountMinor)} for ${month}; spending is ${money(budget.spentMinor)}.`
        : `No overall budget is set for ${month}. Spending is ${money(budget.spentMinor)}.`;
      break;
    }
    case 'goals':
      items = (await listGoals(context)).map((g) => ({
        id: g.id,
        title: g.name,
        detail: `Saved ${money(g.savedMinor)} of ${money(g.targetMinor)}${g.targetDate ? ` · Target ${g.targetDate}` : ''}${g.archived ? ' · Archived' : ''}`,
        amountMinor: g.remainingMinor,
      }));
      break;
    case 'debts':
      items = (await listDebts(context)).map((d) => ({
        id: d.id,
        title: d.name,
        detail: `${d.kind} · ${d.direction} · ${d.status}${d.dueDate ? ` · Due ${d.dueDate}` : ''}`,
        amountMinor: d.remainingMinor,
      }));
      break;
    case 'contributions': {
      const goals = await listGoals(context);
      const selected = goals.filter(
        (g) =>
          normalize(g.id) === normalize(input.record) ||
          normalize(g.name) === normalize(input.record),
      );
      if (selected.length !== 1) {
        summary = 'Which savings goal would you like to inspect?';
        items = goals.map((g) => ({ id: g.id, title: g.name, detail: 'Savings goal' }));
      } else {
        const detail = (await listGoals(context, selected[0]!.id))[0]!;
        items = (detail.contributions ?? []).map((c) => ({
          id: c.id,
          title: c.date,
          detail: detail.name,
          amountMinor: c.amountMinor,
        }));
      }
      break;
    }
    case 'repayments': {
      const debts = await listDebts(context);
      const selected = debts.filter(
        (d) =>
          normalize(d.id) === normalize(input.record) ||
          normalize(d.name) === normalize(input.record),
      );
      if (selected.length !== 1) {
        summary = 'Which debt or expected receipt would you like to inspect?';
        items = debts.map((d) => ({ id: d.id, title: d.name, detail: d.direction }));
      } else {
        const detail = (await listDebts(context, selected[0]!.id))[0]!;
        items = (detail.events ?? [])
          .filter((e) => e.kind === 'REPAYMENT')
          .map((e) => ({
            id: e.id,
            title: e.date,
            detail: e.reversedAt ? 'Reversed' : 'Recorded repayment',
            amountMinor: e.amountMinor,
          }));
      }
      break;
    }
    case 'recurring':
      items = (await listRules(context)).map((r) => ({
        id: r.id,
        title: r.name,
        detail: `${r.frequency} · ${r.paused ? 'Paused' : 'Active'} · ${r.amountMode}`,
        amountMinor: r.amountMinor,
      }));
      break;
    case 'occurrences':
      items = (await listOccurrences(context)).map((r) => ({
        id: r.id,
        title: r.dueDate,
        detail: `${r.type} · ${r.status}`,
        amountMinor: r.amountMinor,
      }));
      break;
    case 'preferences':
      items = Object.entries(context.user.preferences).map(([key, entry]) => ({
        title: key,
        detail: String(entry),
      }));
      break;
    case 'insights': {
      const report = await getInsights(context, month);
      summary = `Spending insights for ${month}.`;
      items = Object.entries(report)
        .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
        .map(([key, v]) => ({ title: key, detail: String(v) }));
      break;
    }
    case 'ai_usage': {
      const usage = await getAssistantUsage(context);
      summary = `You have used ${usage.used} AI messages today${usage.limit === null ? ' with no daily cap' : ` out of ${usage.limit}`}. Your allowance resets at 00:00 UTC.`;
      break;
    }
  }
  if (input.record && !['contributions', 'repayments'].includes(input.feature))
    items = items.filter(
      (i) =>
        normalize(i.id) === normalize(input.record) ||
        normalize(i.title) === normalize(input.record),
    );
  if (input.query && input.feature !== 'transactions')
    items = items.filter((i) =>
      normalize(`${i.title} ${i.detail}`).includes(normalize(input.query)),
    );
  const total = items.length;
  const title = input.feature.replaceAll('_', ' ');
  if (!summary)
    summary = total
      ? `I found ${total} matching ${title} ${total > 100 ? '(showing the first 100)' : ''}.`
      : `There are no matching ${title} in your recorded data.`;
  return assistantRecordsResultSchema.parse({
    name: 'read_records',
    currency,
    timezone,
    retrievedAt: new Date().toISOString(),
    source: 'server-recorded',
    includesLocalPending: false,
    readOnly: true,
    data: { title, summary, total, items: items.slice(0, 100) },
  });
}
