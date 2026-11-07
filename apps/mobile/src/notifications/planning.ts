import { calendarDate, nextOccurrence } from '@finora/finance-core';
import { z } from 'zod';
import { dateInstant } from '../features/finance/values';

export const reminderPreferencesSchema = z.object({
  daily: z.boolean().default(false),
  dueDates: z.boolean().default(false),
  budgets: z.boolean().default(false),
  hour: z.number().int().min(0).max(23).default(20),
});
export type ReminderPreferences = z.infer<typeof reminderPreferencesSchema>;
export const defaultReminders = reminderPreferencesSchema.parse({});
export const reminderPrefix = 'finora:reminder:';
export interface ReminderPlan {
  id: string;
  kind: 'daily' | 'due' | 'budget';
  at?: number;
  hour?: number;
}
export interface ReminderSources {
  rules: {
    id: string;
    startDate: string;
    endDate?: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    nextIndex: number;
    paused: boolean;
    timezone: string;
  }[];
  pending: { ruleId: string; dueDate: string; timezone: string }[];
  debts: {
    id: string;
    dueDate?: string;
    archived: boolean;
    cancelledAt?: string;
    remainingMinor: string;
  }[];
  budgets: { id: string; month: string; warningReached: boolean }[];
}

// Start near today even for a daily rule created years ago. nextOccurrence keeps
// the original calendar anchor, including month-end and leap-year clamping.
function nearIndex(rule: ReminderSources['rules'][number], today: string) {
  const anchor = new Date(`${rule.startDate}T00:00:00Z`);
  const current = new Date(`${today}T00:00:00Z`);
  const days = Math.floor((current.getTime() - anchor.getTime()) / 86400000);
  const months =
    (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    current.getUTCMonth() -
    anchor.getUTCMonth();
  const estimate =
    rule.frequency === 'DAILY'
      ? days
      : rule.frequency === 'WEEKLY'
        ? Math.floor(days / 7)
        : rule.frequency === 'MONTHLY'
          ? months
          : Math.floor(months / 12);
  return Math.max(rule.nextIndex, estimate - 1, 0);
}

export function planReminders(
  preferences: ReminderPreferences,
  sources: ReminderSources,
  timezone: string,
  now = new Date(),
): ReminderPlan[] {
  const result: ReminderPlan[] = [];
  const today = calendarDate(now, timezone);
  const horizon = now.getTime() + 30 * 86400000;
  function addDue(key: string, day: string, zone: string) {
    const at = new Date(dateInstant(day, zone)).getTime();
    if (at > now.getTime() && at <= horizon)
      result.push({ id: `${reminderPrefix}${key}:${day}`, kind: 'due', at });
  }
  if (preferences.daily)
    result.push({
      id: `${reminderPrefix}daily:${preferences.hour}`,
      kind: 'daily',
      hour: preferences.hour,
    });
  if (preferences.dueDates) {
    for (const rule of sources.rules) {
      if (rule.paused) continue;
      const localToday = calendarDate(now, rule.timezone);
      for (let index = nearIndex(rule, localToday), count = 0; count < 34; index++, count++) {
        const day = nextOccurrence(rule.startDate, rule.frequency, index);
        if (rule.endDate && day > rule.endDate) break;
        if (new Date(dateInstant(day, rule.timezone)).getTime() > horizon) break;
        addDue(`rule:${rule.id}`, day, rule.timezone);
      }
    }
    for (const debt of sources.debts)
      if (debt.dueDate && !debt.archived && !debt.cancelledAt && BigInt(debt.remainingMinor) > 0n)
        addDue(`debt:${debt.id}`, debt.dueDate, timezone);
    for (const item of sources.pending) addDue(`rule:${item.ruleId}`, item.dueDate, item.timezone);
    const overdue =
      sources.pending.some((item) => item.dueDate <= calendarDate(now, item.timezone)) ||
      sources.debts.some(
        (debt) =>
          debt.dueDate &&
          debt.dueDate < today &&
          !debt.archived &&
          !debt.cancelledAt &&
          BigInt(debt.remainingMinor) > 0n,
      );
    if (overdue) {
      const noon = new Date(dateInstant(today, timezone)).getTime();
      addDue('review', noon > now.getTime() ? today : nextOccurrence(today, 'DAILY', 1), timezone);
    }
  }
  if (preferences.budgets)
    for (const budget of sources.budgets)
      if (budget.warningReached && budget.month === today.slice(0, 7))
        result.push({
          id: `${reminderPrefix}budget:${budget.month}:${budget.id}`,
          kind: 'budget',
          at: now.getTime() + 5000,
        });
  return [...new Map(result.map((plan) => [plan.id, plan])).values()]
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 50);
}

// No amounts, names, merchants, notes or account identifiers on the lock screen.
export function reminderContent(kind: ReminderPlan['kind']) {
  return {
    title: 'Walleto AI',
    body:
      kind === 'daily'
        ? 'Take a moment to record today’s activity.'
        : kind === 'budget'
          ? 'Open Walleto AI to review your budget progress.'
          : 'Open Walleto AI to review upcoming or pending items.',
  };
}
