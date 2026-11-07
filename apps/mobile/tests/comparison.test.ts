import { expect, it } from 'vitest';
import { comparisonPeriod, percentChange } from '../src/features/reports/comparison';

it('compares a completed calendar month with the month before it', () => {
  expect(comparisonPeriod({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-07')).toEqual({
    from: '2026-09-01',
    to: '2026-09-30',
    label: 'last month',
  });
});

it('compares only the elapsed days while the month is still in progress', () => {
  expect(comparisonPeriod({ from: '2026-11-01', to: '2026-11-30' }, '2026-11-07')).toEqual({
    from: '2026-10-01',
    to: '2026-10-07',
    label: 'last month',
  });
});

it('uses the same number of preceding days for custom and multi-month ranges', () => {
  expect(comparisonPeriod({ from: '2026-10-10', to: '2026-10-19' }, '2026-11-07')).toEqual({
    from: '2026-09-30',
    to: '2026-10-09',
    label: 'previous period',
  });
  expect(comparisonPeriod({ from: '2026-08-01', to: '2026-10-31' }, '2026-11-07')).toEqual({
    from: '2026-05-01',
    to: '2026-07-31',
    label: 'previous period',
  });
});

it('has nothing to compare before the period starts', () => {
  expect(comparisonPeriod({ from: '2026-12-01', to: '2026-12-31' }, '2026-11-07')).toBeNull();
});

it('calculates exact percentage changes from integer amounts', () => {
  expect(percentChange('11250', '10000')).toEqual({ kind: 'up', text: '13%' });
  expect(percentChange('10250', '10000')).toEqual({ kind: 'up', text: '2.5%' });
  expect(percentChange('5000', '10000')).toEqual({ kind: 'down', text: '50%' });
  expect(percentChange('10000', '10000')).toEqual({ kind: 'flat' });
  expect(percentChange('0', '0')).toEqual({ kind: 'none' });
  expect(percentChange('500', '0')).toEqual({ kind: 'new' });
  expect(percentChange('9000000000000000000000', '1')).toEqual({ kind: 'up', text: '999%+' });
});

it('measures a swing against the size of a negative earlier amount', () => {
  expect(percentChange('-5000', '-10000')).toEqual({ kind: 'up', text: '50%' });
  expect(percentChange('2000', '-10000')).toEqual({ kind: 'up', text: '120%' });
});
