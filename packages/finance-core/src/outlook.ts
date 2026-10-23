interface PlannedFlow {
  id: string;
  day: string;
  direction: 'OUT' | 'EXPECTED_IN';
  amountMinor: string | null;
}
export interface OutlookInput {
  today: string;
  through: string;
  balanceMinor: string;
  reserveMinor: string;
  flows: readonly PlannedFlow[];
  includeExpected: boolean;
  purchase?: { day: string; amountMinor: string };
}
function dayNumber(day: string) {
  const value = new Date(`${day}T00:00:00Z`);
  if (
    !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 10) !== day
  )
    throw new Error('Choose a valid calendar date.');
  return value.getTime();
}
function exact(value: string, positive = false) {
  if (!/^(0|-?[1-9]\d*)$/.test(value) || (positive && BigInt(value) <= 0n))
    throw new Error('Invalid minor-unit amount.');
  return BigInt(value);
}

// Forecasts are read-only arithmetic over a dated, owned snapshot. Expected
// receipts never enter the conservative scenario. Same-day debits precede credits.
export function projectOutlook(input: OutlookInput) {
  const start = dayNumber(input.today);
  const end = dayNumber(input.through);
  if (end < start || end - start > 90 * 86400000)
    throw new Error('Choose a horizon within 90 days.');
  const reserve = exact(input.reserveMinor);
  if (reserve < 0n) throw new Error('Reserve cannot be negative.');
  const starting = exact(input.balanceMinor) - reserve;
  let balance = starting;
  let lowest = starting;
  let lowestDay = input.today;
  let knownOutflow = 0n;
  let expectedInflow = 0n;
  let unknownOutflows = 0;
  const included: PlannedFlow[] = [];
  const ids = new Set<string>();
  for (const flow of input.flows) {
    const day = dayNumber(flow.day);
    if (day < start || day > end) continue;
    if (ids.has(flow.id)) throw new Error('Duplicate forecast item.');
    ids.add(flow.id);
    if (flow.amountMinor === null) {
      if (flow.direction === 'OUT') unknownOutflows++;
      continue;
    }
    exact(flow.amountMinor, true);
    if (flow.direction === 'EXPECTED_IN' && !input.includeExpected) continue;
    included.push(flow);
  }
  if (input.purchase) {
    const day = dayNumber(input.purchase.day);
    if (day < start || day > end) throw new Error('Purchase must be within the planning period.');
    exact(input.purchase.amountMinor, true);
    included.push({
      id: 'scenario-purchase',
      day: input.purchase.day,
      direction: 'OUT',
      amountMinor: input.purchase.amountMinor,
    });
  }
  const timeline: { day: string; balanceMinor: string }[] = [];
  for (let time = start; time <= end; time += 86400000) {
    const day = new Date(time).toISOString().slice(0, 10);
    for (const direction of ['OUT', 'EXPECTED_IN'] as const) {
      const total = included
        .filter((flow) => flow.day === day && flow.direction === direction)
        .reduce((sum, flow) => sum + exact(flow.amountMinor!, true), 0n);
      if (direction === 'OUT') {
        balance -= total;
        knownOutflow += total;
      } else {
        balance += total;
        expectedInflow += total;
      }
      if (balance < lowest) {
        lowest = balance;
        lowestDay = day;
      }
    }
    timeline.push({ day, balanceMinor: balance.toString() });
  }
  return {
    availableMinor: unknownOutflows ? null : lowest.toString(),
    lowestMinor: lowest.toString(),
    lowestDay,
    closingMinor: balance.toString(),
    knownOutflowMinor: knownOutflow.toString(),
    expectedInflowMinor: expectedInflow.toString(),
    unknownOutflows,
    timeline,
  };
}
