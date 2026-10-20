import { describe, expect, it } from 'vitest';
import type { ReportSummary } from '@finora/contracts';
import { chartRatio, percentageFromBasisPoints, reportCsv } from '../src/features/reports/values';

describe('report display and export boundaries', () => {
  it('scales chart geometry from exact integers beyond Number limits', () => {
    expect(chartRatio('500000000000000000000000000000', '1000000000000000000000000000000')).toBe(
      0.5,
    );
    expect(chartRatio('1', '3')).toBe(0.333333);
    expect(chartRatio('0', '0')).toBe(0);
    expect(chartRatio('20', '10')).toBe(1);
    expect(() => chartRatio('-1', '10')).toThrow();
  });
  it('formats savings rates without converting unbounded financial ratios to Number', () => {
    expect(percentageFromBasisPoints(null)).toBeNull();
    expect(percentageFromBasisPoints('0')).toBe('0.00%');
    expect(percentageFromBasisPoints('1234')).toBe('12.34%');
    expect(percentageFromBasisPoints('-9999999999999999999999999')).toBe(
      '−99999999999999999999999.99%',
    );
  });
  it('exports exact amounts and neutralizes formulas in untrusted record names', () => {
    const report: ReportSummary = {
      period: {
        range: 'custom',
        from: '2026-10-01',
        to: '2026-10-20',
        timezone: 'Asia/Kolkata',
        currency: 'KWD',
      },
      cashflow: {
        incomeMinor: '100000000000000000000000000001',
        expensesMinor: '1',
        netMinor: '100000000000000000000000000000',
        savingsRateBasisPoints: '9999',
      },
      categories: [
        {
          categoryId: '388628ad-82c3-4ed0-8d72-43cef6f7874a',
          name: '=HYPERLINK("bad")',
          type: 'EXPENSE',
          amountMinor: '1',
          shareBasisPoints: 10000,
        },
      ],
      accounts: [
        {
          accountId: 'a12513eb-d6eb-4506-b5b9-dcb7630e31aa',
          name: '\t+formula',
          archived: false,
          openingBalanceMinor: '-1',
          closingBalanceMinor: '0',
          incomeMinor: '1',
          expensesMinor: '0',
          transferInMinor: '0',
          transferOutMinor: '0',
          netMinor: '1',
        },
      ],
      trends: [
        {
          month: '2026-10',
          incomeMinor: '100000000000000000000000000001',
          expensesMinor: '1',
          netMinor: '100000000000000000000000000000',
        },
      ],
    };
    const result = reportCsv(report);
    expect(result).toContain('100000000000000000000000000.001');
    expect(result).toContain('"\'=HYPERLINK(""bad"")"');
    expect(result).toContain('"\'\t+formula"');
    expect(result).toContain('"-0.001"');
    expect(result).not.toContain('e+');
    expect(result.split('\r\n')).toHaveLength(5);
  });
});
