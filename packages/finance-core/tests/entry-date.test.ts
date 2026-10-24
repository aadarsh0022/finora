import { expect, it } from 'vitest';
import { entryDate } from '../src';
it('records today at the real instant in the selected timezone and marks older dates as date-only', () => {
  const now = new Date('2026-10-24T20:00:12.345Z');
  expect(entryDate('2026-10-25', 'Asia/Kolkata', now)).toEqual({
    date: now.toISOString(),
    datePrecision: 'INSTANT',
  });
  expect(entryDate('2026-10-24', 'Asia/Kolkata', now)).toEqual({
    date: '2026-10-24T06:30:00.000Z',
    datePrecision: 'DAY',
  });
  expect(() => entryDate('2026-02-30', 'Asia/Kolkata', now)).toThrow();
});
