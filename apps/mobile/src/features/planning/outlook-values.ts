import type { Outlook, OutlookPreferences } from '@finora/contracts';
import { projectOutlook } from '@finora/finance-core';

export function outlookValues(
  data: Outlook,
  preferences: OutlookPreferences,
  includeExpected: boolean,
  purchase?: { day: string; amountMinor: string },
) {
  const ids = new Set(preferences.accountIds ?? data.accounts.map((a) => a.id));
  const accounts = data.accounts.filter((a) => ids.has(a.id));
  const flows = data.flows.filter(
    (flow) =>
      (!flow.accountId || ids.has(flow.accountId)) &&
      !(flow.counterAccountId && ids.has(flow.counterAccountId)) &&
      flow.day >= data.today &&
      flow.day <= preferences.through,
  );
  const manual = preferences.expectedPayments
    .filter((p) => p.day >= data.today && p.day <= preferences.through)
    .map((p) => ({ ...p, id: `manual:${p.id}`, direction: 'EXPECTED_IN' as const }));
  const balanceMinor = accounts.reduce((sum, a) => sum + BigInt(a.balanceMinor), 0n).toString();
  const projection = projectOutlook({
    today: data.today,
    through: preferences.through,
    balanceMinor,
    reserveMinor: preferences.reserveMinor,
    flows: [...flows, ...manual],
    includeExpected,
    purchase,
  });
  return {
    ...projection,
    accounts,
    flows,
    balanceMinor,
    signature: accounts
      .map((a) => `${a.id}:${a.balanceMinor}`)
      .sort()
      .join('|'),
    incomplete: !accounts.length || data.undatedDebts > 0 || projection.unknownOutflows > 0,
  };
}
