import { describe, expect, it } from 'vitest';
import { activityQuery, emptyActivityFilters } from '../src/features/finance/filters';
describe('activity filters', () => {
  it('uses inclusive local calendar days across daylight saving', () => {
    const query = new URLSearchParams(
      activityQuery(
        { ...emptyActivityFilters, from: '2026-03-08', to: '2026-03-08' },
        'USD',
        'America/New_York',
      ),
    );
    expect(query.get('from')).toBe('2026-03-08T05:00:00.000Z');
    expect(query.get('to')).toBe('2026-03-09T03:59:59.999Z');
  });
  it('preserves exact large decimal amount bounds and rejects reversed ranges', () => {
    const query = new URLSearchParams(
      activityQuery(
        { ...emptyActivityFilters, min: '9007199254740993.01', max: '9007199254740993.02' },
        'USD',
        'UTC',
      ),
    );
    expect(query.get('minAmount')).toBe('900719925474099301');
    expect(query.get('maxAmount')).toBe('900719925474099302');
    expect(() =>
      activityQuery({ ...emptyActivityFilters, min: '10', max: '1' }, 'USD', 'UTC'),
    ).toThrow();
    expect(() =>
      activityQuery(
        { ...emptyActivityFilters, from: '2026-10-21', to: '2026-10-20' },
        'USD',
        'UTC',
      ),
    ).toThrow();
  });
  it('rejects invalid dates and omits inactive filters', () => {
    expect(activityQuery(emptyActivityFilters, 'INR', 'Asia/Kolkata')).toBe('sort=newest');
    expect(() =>
      activityQuery({ ...emptyActivityFilters, from: '2026-02-30' }, 'INR', 'UTC'),
    ).toThrow();
  });
});
