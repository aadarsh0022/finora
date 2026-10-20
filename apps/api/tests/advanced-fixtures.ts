import { randomUUID } from 'node:crypto';
import { accountSchema, categorySchema } from '@finora/contracts';
import { call, createUser } from './setup';
export const headers = () => ({ 'Idempotency-Key': randomUUID() });
export function data<T>(result: {
  json: { success: true; data: T } | { success: false; error?: unknown };
}): T {
  if (!result.json.success)
    throw new Error(`Expected success: ${JSON.stringify(result.json.error)}`);
  return result.json.data;
}
export async function fixture() {
  const user = await createUser();
  const token = user.accessToken;
  const account = accountSchema.parse(
    data(await call('POST', 'accounts', { name: 'Cash', type: 'CASH' }, token, headers())),
  );
  const expense = categorySchema.parse(
    data(await call('POST', 'categories', { name: 'Food', type: 'EXPENSE' }, token, headers())),
  );
  const income = categorySchema.parse(
    data(await call('POST', 'categories', { name: 'Refund', type: 'INCOME' }, token, headers())),
  );
  return { token, account, expense, income };
}
