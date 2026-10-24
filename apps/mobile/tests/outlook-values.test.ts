import { expect, it } from 'vitest';
import { outlookSchema, outlookPreferencesSchema } from '@finora/contracts';
import { outlookValues } from '../src/features/planning/outlook-values';
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
const snapshot = outlookSchema.parse({
  today: '2026-10-23',
  through: '2027-01-21',
  generatedAt: '2026-10-23T01:00:00Z',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  accounts: [
    { id: a, name: 'Cash', balanceMinor: '1000' },
    { id: b, name: 'Savings', balanceMinor: '1000' },
  ],
  flows: [
    {
      id: 'from',
      label: 'Transfer',
      day: '2026-10-24',
      direction: 'OUT',
      amountMinor: '500',
      accountId: a,
      counterAccountId: b,
      source: 'RECORDED',
      overdue: false,
    },
    {
      id: 'to',
      label: 'Transfer',
      day: '2026-10-24',
      direction: 'EXPECTED_IN',
      amountMinor: '500',
      accountId: b,
      counterAccountId: a,
      source: 'RECORDED',
      overdue: false,
    },
  ],
  undatedDebts: 0,
  pendingRecurringCount: 0,
  overdueDebtCount: 0,
  recentTransactions: [],
  moreRecentCount: 0,
});
it('does not count an internal transfer as spending when both accounts are selected', () => {
  const plan = outlookPreferencesSchema.parse({ through: '2026-11-01', reserveMinor: '200' });
  expect(outlookValues(snapshot, plan, false)).toMatchObject({
    availableMinor: '1800',
    knownOutflowMinor: '0',
  });
  expect(outlookValues(snapshot, { ...plan, accountIds: [a] }, false)).toMatchObject({
    availableMinor: '300',
    knownOutflowMinor: '500',
  });
  expect(outlookValues(snapshot, { ...plan, accountIds: [] }, false).incomplete).toBe(true);
});
