import { describe, expect, it } from 'vitest';
import {
  defaultReminders,
  planReminders,
  reminderContent,
  reminderPrefix,
  type ReminderPlan,
  type ReminderSources,
} from '../src/notifications/planning';
import { reconcileReminders, type ReminderDriver } from '../src/notifications/reconcile';
import { testVault } from './vault-fixture';

const empty: ReminderSources = { rules: [], pending: [], debts: [], budgets: [] };
const now = new Date('2026-01-31T04:00:00Z');
const due = { ...defaultReminders, dueDates: true };
const rule = {
  id: 'rule',
  startDate: '2000-01-31',
  frequency: 'MONTHLY' as const,
  nextIndex: 0,
  paused: false,
  timezone: 'Asia/Kolkata',
};
describe('private local reminder planning', () => {
  it('is off by default and uses anchored month-end dates in the item timezone', () => {
    expect(planReminders(defaultReminders, empty, 'UTC', now)).toEqual([]);
    const plans = planReminders(due, { ...empty, rules: [rule] }, 'UTC', now);
    expect(plans.map((p) => new Date(p.at!).toISOString())).toEqual([
      '2026-01-31T06:30:00.000Z',
      '2026-02-28T06:30:00.000Z',
    ]);
    expect(
      planReminders(due, { ...empty, rules: [{ ...rule, paused: true }] }, 'UTC', now),
    ).toEqual([]);
  });

  it('bounds long-lived daily rules and excludes settled/cancelled/archived debts', () => {
    const plans = planReminders(
      due,
      {
        ...empty,
        rules: Array.from({ length: 3 }, (_, i) => ({
          ...rule,
          id: String(i),
          frequency: 'DAILY',
        })),
        debts: [
          { id: 'settled', remainingMinor: '0', dueDate: '2026-02-01', archived: false },
          {
            id: 'cancelled',
            remainingMinor: '10',
            dueDate: '2026-02-01',
            archived: false,
            cancelledAt: now.toISOString(),
          },
          { id: 'archived', remainingMinor: '10', dueDate: '2026-02-01', archived: true },
        ],
      },
      'UTC',
      now,
    );
    expect(plans).toHaveLength(50);
    expect(plans.every((p) => p.id.includes(':rule:') && p.at! > now.getTime())).toBe(true);
  });

  it('groups overdue items, keeps pending future reminders and avoids duplicate rule dates', () => {
    const plans = planReminders(
      due,
      {
        ...empty,
        rules: [rule],
        pending: [
          { ruleId: 'old', dueDate: '2025-12-01', timezone: 'UTC' },
          { ruleId: 'old2', dueDate: '2025-12-02', timezone: 'UTC' },
          { ruleId: 'rule', dueDate: '2026-02-28', timezone: rule.timezone },
          { ruleId: 'generated', dueDate: '2026-02-01', timezone: 'UTC' },
        ],
      },
      'UTC',
      now,
    );
    expect(plans.filter((p) => p.id.includes(':review:'))).toHaveLength(1);
    expect(plans.filter((p) => p.id.endsWith(':rule:2026-02-28'))).toHaveLength(1);
    expect(plans.some((p) => p.id.includes(':generated:'))).toBe(true);
    expect(
      plans.every((p) => Object.keys(reminderContent(p.kind)).sort().join() === 'body,title'),
    ).toBe(true);
  });
});

describe('reminder reconciliation', () => {
  function fixture() {
    const scheduled = new Map<string, ReminderPlan>();
    const cancelled: string[] = [];
    const delivered: ReminderPlan[] = [];
    const driver: ReminderDriver = {
      list: async () => [...scheduled.keys()],
      cancel: async (id) => {
        scheduled.delete(id);
        cancelled.push(id);
      },
      schedule: async (plan) => {
        scheduled.set(plan.id, plan);
        delivered.push(plan);
      },
    };
    return { driver, scheduled, cancelled, delivered, ...testVault('owner') };
  }
  it('keeps pending notifications and does not re-alert a delivered budget', async () => {
    const state = fixture();
    const plan: ReminderPlan = {
      id: `${reminderPrefix}budget:2026-01:overall`,
      kind: 'budget',
      at: 100,
    };
    await reconcileReminders(state.driver, state.vault, [plan], () => true);
    await reconcileReminders(state.driver, state.vault, [plan], () => true);
    expect(state.delivered).toHaveLength(1);
    expect(state.scheduled.has(plan.id)).toBe(true);
    state.scheduled.clear(); // OS delivered the one-shot notification.
    await reconcileReminders(state.driver, state.vault, [plan], () => true);
    expect(state.delivered).toHaveLength(1);
    await reconcileReminders(
      state.driver,
      state.vault,
      [{ ...plan, id: plan.id.replace('01:', '02:') }],
      () => true,
    );
    expect(state.delivered).toHaveLength(2);
  });

  it('cancels obsolete Finora plans and aborts stale work before scheduling', async () => {
    const state = fixture();
    state.scheduled.set(`${reminderPrefix}debt:old`, { id: 'unused', kind: 'due', at: 10 });
    state.scheduled.set('other', { id: 'other', kind: 'due', at: 20 });
    await reconcileReminders(state.driver, state.vault, [], () => true);
    expect(state.cancelled).toEqual([`${reminderPrefix}debt:old`]);
    await reconcileReminders(
      state.driver,
      state.vault,
      [{ id: `${reminderPrefix}daily:20`, kind: 'daily', hour: 20 }],
      () => false,
    );
    expect(state.delivered).toEqual([]);
    expect(state.scheduled.has('other')).toBe(true);
  });

  it('does not mark a failed budget schedule as delivered', async () => {
    const state = fixture();
    const plan: ReminderPlan = { id: `${reminderPrefix}budget:2026-01:a`, kind: 'budget', at: 100 };
    await expect(
      reconcileReminders(
        {
          ...state.driver,
          schedule: async () => {
            throw new Error('OS failure');
          },
        },
        state.vault,
        [plan],
        () => true,
      ),
    ).rejects.toThrow('OS failure');
    await reconcileReminders(state.driver, state.vault, [plan], () => true);
    expect(state.delivered).toHaveLength(1);
  });
});
