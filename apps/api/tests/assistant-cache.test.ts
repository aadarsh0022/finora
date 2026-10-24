import { afterEach, expect, it, vi } from 'vitest';
import { PrivateCache } from '../src/modules/assistant/cache';
import { narrativeFacts } from '../src/modules/assistant/narrative';
import { assistantBalanceResultSchema } from '@finora/contracts';
afterEach(() => vi.useRealTimers());
it('bounds memory, expires entries and returns isolated copies', () => {
  vi.useFakeTimers();
  const cache = new PrivateCache<{ value: number }>(1);
  cache.put('owner-a', { value: 1 }, 1000);
  const copy = cache.get('owner-a')!;
  copy.value = 9;
  expect(cache.get('owner-a')?.value).toBe(1);
  cache.put('owner-b', { value: 2 }, 1000);
  expect(cache.get('owner-a')).toBeUndefined();
  vi.advanceTimersByTime(1001);
  expect(cache.get('owner-b')).toBeUndefined();
});
it('keeps account identifiers and names out of conversational tool summaries', () => {
  const result = assistantBalanceResultSchema.parse({
    name: 'get_balance',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    retrievedAt: new Date().toISOString(),
    source: 'server-recorded',
    readOnly: true,
    includesLocalPending: false,
    data: {
      totalBalanceMinor: '12345',
      includesArchived: true,
      accounts: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Private name',
          archived: false,
          balanceMinor: '12345',
        },
      ],
    },
  });
  const facts = JSON.stringify(narrativeFacts(result, 'en-IN'));
  expect(facts).not.toContain('Private name');
  expect(facts).not.toContain('11111111');
  expect(facts).toContain('123.45');
});
