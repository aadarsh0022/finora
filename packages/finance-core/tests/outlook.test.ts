import { expect, it } from 'vitest';
import { projectOutlook } from '../src/index';

const base = {
  today: '2026-10-23',
  through: '2026-11-20',
  balanceMinor: '2000000',
  reserveMinor: '300000',
  includeExpected: false,
};
const flows = [
  { id: 'rent', day: '2026-11-01', direction: 'OUT' as const, amountMinor: '800000' },
  { id: 'bill', day: '2026-11-05', direction: 'OUT' as const, amountMinor: '200000' },
  { id: 'income', day: '2026-10-30', direction: 'EXPECTED_IN' as const, amountMinor: '200000' },
];
it('explains the exact conservative example and separates expected income', () => {
  expect(projectOutlook({ ...base, flows })).toMatchObject({
    availableMinor: '700000',
    closingMinor: '700000',
    knownOutflowMinor: '1000000',
    expectedInflowMinor: '0',
  });
  expect(projectOutlook({ ...base, flows, includeExpected: true })).toMatchObject({
    availableMinor: '900000',
    expectedInflowMinor: '200000',
  });
});
it('uses the lowest balance before later income, with same-day debits before receipts', () => {
  const result = projectOutlook({
    ...base,
    balanceMinor: '100',
    reserveMinor: '0',
    includeExpected: true,
    flows: [
      { id: 'bill', day: '2026-10-24', direction: 'OUT', amountMinor: '200' },
      { id: 'income', day: '2026-10-24', direction: 'EXPECTED_IN', amountMinor: '1000' },
    ],
  });
  expect(result).toMatchObject({
    availableMinor: '-100',
    lowestDay: '2026-10-24',
    closingMinor: '900',
  });
});
it('previews a purchase without changing the source and hides incomplete estimates', () => {
  const snapshot = JSON.stringify(flows);
  expect(
    projectOutlook({ ...base, flows, purchase: { day: base.today, amountMinor: '800000' } }),
  ).toMatchObject({ availableMinor: '-100000' });
  expect(JSON.stringify(flows)).toBe(snapshot);
  expect(
    projectOutlook({
      ...base,
      flows: [...flows, { id: 'variable', day: '2026-10-24', direction: 'OUT', amountMinor: null }],
    }),
  ).toMatchObject({ availableMinor: null, unknownOutflows: 1 });
});
it('keeps aggregate amounts exact and rejects invalid dates, duplicates and negative reserves', () => {
  const huge = '9007199254740993000000000000000000000';
  expect(projectOutlook({ ...base, balanceMinor: huge, flows: [] }).availableMinor).toBe(
    (BigInt(huge) - 300000n).toString(),
  );
  expect(() => projectOutlook({ ...base, flows, reserveMinor: '-1' })).toThrow('negative');
  expect(() => projectOutlook({ ...base, flows: [...flows, flows[0]!] })).toThrow('Duplicate');
  expect(() => projectOutlook({ ...base, flows, through: '2027-11-01' })).toThrow('90');
  expect(() =>
    projectOutlook({ ...base, flows, purchase: { day: '2026-02-30', amountMinor: '1' } }),
  ).toThrow('valid');
});
