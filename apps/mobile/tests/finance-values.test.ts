import { describe, expect, it } from 'vitest';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { dateInstant, decimalAmount } from '../src/features/finance/values';

describe('finance form boundaries', () => {
  it('round trips large, negative, and fractional amounts without Number precision loss', () => {
    for (const currency of ['INR', 'JPY', 'KWD'] as const) {
      for (const amount of ['0', '-1', '1', '123456789012345678901234567890']) {
        expect(parseMoney(decimalAmount(amount, currency), currency)).toBe(amount);
      }
    }
  });
  it('preserves the selected date across positive, negative and fractional timezone offsets', () => {
    for (const timezone of [
      'Asia/Kolkata',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
      'Pacific/Chatham',
      'UTC',
    ]) {
      for (const date of ['2026-03-08', '2026-11-01', '2028-02-29']) {
        expect(calendarDate(new Date(dateInstant(date, timezone)), timezone)).toBe(date);
      }
    }
  });
  it('rejects invalid or skipped calendar dates', () => {
    expect(() => dateInstant('2026-02-29', 'UTC')).toThrow();
    expect(() => dateInstant('2026-13-01', 'UTC')).toThrow();
    expect(() => dateInstant('2011-12-30', 'Pacific/Apia')).toThrow();
    expect(() => dateInstant('20/10/2026', 'Asia/Kolkata')).toThrow();
  });
});
