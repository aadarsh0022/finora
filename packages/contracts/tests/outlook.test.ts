import { expect, it } from 'vitest';
import { outlookSchema, outlookPreferencesSchema } from '../src/index';
const empty = {
  generatedAt: '2026-10-23T00:00:00Z',
  today: '2026-10-23',
  through: '2026-11-23',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  accounts: [],
  flows: [],
  undatedDebts: 0,
  pendingRecurringCount: 0,
  overdueDebtCount: 0,
  recentTransactions: [],
  moreRecentCount: 0,
};
it('rejects malformed or duplicate forecast snapshots before they reach a calculation', () => {
  expect(outlookSchema.safeParse(empty).success).toBe(true);
  expect(outlookSchema.safeParse({ ...empty, through: '2027-10-23' }).success).toBe(false);
  expect(outlookSchema.safeParse({ ...empty, timezone: 'Invalid/Timezone' }).success).toBe(false);
  const flow = {
    id: 'bill',
    label: 'Bill',
    day: '2026-10-24',
    direction: 'OUT',
    amountMinor: '100',
    accountId: null,
    source: 'RECURRING',
    overdue: false,
  };
  expect(outlookSchema.safeParse({ ...empty, flows: [flow, flow] }).success).toBe(false);
  expect(
    outlookSchema.safeParse({ ...empty, flows: [{ ...flow, day: '2026-10-22' }] }).success,
  ).toBe(false);
});
it('rejects duplicate scenario payment identities and negative reserves', () => {
  const payment = {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'Contract',
    day: '2026-11-01',
    amountMinor: '100',
  };
  expect(
    outlookPreferencesSchema.safeParse({
      through: empty.through,
      expectedPayments: [payment, payment],
    }).success,
  ).toBe(false);
  expect(
    outlookPreferencesSchema.safeParse({ through: empty.through, reserveMinor: '-1' }).success,
  ).toBe(false);
});
