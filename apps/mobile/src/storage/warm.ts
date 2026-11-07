import { z, type ZodType } from 'zod';
import {
  budgetStatusSchema,
  debtListSchema,
  emiOverviewSchema,
  goalProgressSchema,
  monthlyLimitStatusSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  reportSummarySchema,
  settingsSchema,
  spendingInsightsSchema,
} from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import type { ApiClient } from '../api/client';
import type { DeviceVault } from './vault-core';

const interval = 5 * 60 * 1000;
const lastRun = new WeakMap<DeviceVault, number>();

/** Screen reads that are not part of the device ledger. Paths match the ones the screens request. */
export function warmSpecs(timezone: string, now = new Date()): [string, ZodType][] {
  const month = calendarDate(now, timezone).slice(0, 7);
  return [
    ['settings', settingsSchema],
    ['goals', z.array(goalProgressSchema)],
    ['recurring', z.array(recurringRuleSchema)],
    ['recurring-occurrences?status=PENDING', z.array(recurringOccurrenceSchema)],
    ['debts', debtListSchema],
    // Loans & EMIs and Income open offline once they have been loaded or warmed.
    ['emi', emiOverviewSchema],
    [`budgets?month=${month}`, z.array(budgetStatusSchema)],
    [`budgets/total?month=${month}`, monthlyLimitStatusSchema],
    ['reports/summary?range=current-month', reportSummarySchema],
    [`reports/insights?month=${month}`, spendingInsightsSchema],
  ];
}

/**
 * Quietly stores the main screen reads so they open without a connection. Failures are ignored
 * individually; the next sync tries again. Nothing here blocks saving or navigation.
 */
export async function warmReads(
  vault: DeviceVault,
  api: Pick<ApiClient, 'request'>,
  timezone: string,
  isCurrent: () => boolean,
  force = false,
) {
  const previous = lastRun.get(vault) ?? 0;
  if (!force && Date.now() - previous < interval) return 0;
  lastRun.set(vault, Date.now());
  let stored = 0;
  for (const [path, schema] of warmSpecs(timezone)) {
    if (!isCurrent()) break;
    try {
      const value = await api.request(path, schema);
      if (!isCurrent()) break;
      await vault.write(`read:${path}`, value);
      stored++;
    } catch {
      // Offline or a transient server error: keep any earlier saved copy and retry next time.
    }
  }
  return stored;
}
