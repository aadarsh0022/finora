import { expect, it } from 'vitest';
import { userSchema } from '@finora/contracts';
import { testVault } from './vault-fixture';
import { warmReads, warmSpecs } from '../src/storage/warm';
import type { ApiClient } from '../src/api/client';

const id = crypto.randomUUID();
void userSchema;
const empty = (path: string) =>
  path.startsWith('settings')
    ? { preferences: {}, version: 1 }
    : path.startsWith('budgets/total') || path.startsWith('reports')
      ? undefined
      : [];

it('stores each warmed read it can fetch and keeps going after a failure', async () => {
  const { vault, rows } = testVault(id);
  const seen: string[] = [];
  const api: Pick<ApiClient, 'request'> = {
    request: (async (path: string, schema: { safeParse?: unknown }) => {
      seen.push(path);
      if (path.startsWith('goals')) throw new Error('Offline');
      void schema;
      return empty(path) ?? [];
    }) as ApiClient['request'],
  };
  const stored = await warmReads(vault, api, 'Asia/Kolkata', () => true, true);
  expect(seen).toHaveLength(warmSpecs('Asia/Kolkata').length);
  expect(stored).toBe(seen.length - 1);
  expect(rows.has('read:goals')).toBe(false);
  expect(rows.has('read:recurring')).toBe(true);
});

it('does not repeat within the interval unless forced, and stops when the session changes', async () => {
  const { vault } = testVault(id);
  let calls = 0;
  const api: Pick<ApiClient, 'request'> = {
    request: (async () => {
      calls++;
      return [];
    }) as ApiClient['request'],
  };
  await warmReads(vault, api, 'Asia/Kolkata', () => true);
  const first = calls;
  expect(await warmReads(vault, api, 'Asia/Kolkata', () => true)).toBe(0);
  expect(calls).toBe(first);
  const { vault: other } = testVault(id);
  calls = 0;
  expect(await warmReads(other, api, 'Asia/Kolkata', () => false)).toBe(0);
  expect(calls).toBe(0);
});
