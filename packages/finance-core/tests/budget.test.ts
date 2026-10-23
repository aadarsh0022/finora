import { expect, it } from 'vitest';
import { budgetRollover } from '../src/index';
it('carries only unused consecutive-month limits and preserves exact precision', () => {
  const base = { categoryId: 'food', amountMinor: '900719925474099301', rollover: false };
  const result = budgetRollover(
    [
      { ...base, id: 'jan', month: '2026-01' },
      { ...base, id: 'feb', month: '2026-02', rollover: true },
      { ...base, id: 'apr', month: '2026-04', rollover: true },
    ],
    new Map([['2026-01:food', '101']]),
  );
  expect(result[1]).toMatchObject({
    carriedMinor: '900719925474099200',
    effectiveLimitMinor: '1801439850948198501',
  });
  expect(result[2]?.carriedMinor).toBe('0');
  expect(
    budgetRollover(
      [
        { ...base, id: 'jan', month: '2026-01', amountMinor: '1' },
        { ...base, id: 'feb', month: '2026-02', rollover: true },
      ],
      new Map([['2026-01:food', '2']]),
    )[1]?.carriedMinor,
  ).toBe('0');
});
