import { randomUUID } from 'node:crypto';
import type { ClientSession, Db } from 'mongodb';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { mutate, notFound, requireVersion } from '../finance/mutation';

export async function ensureAdvancedIndexes() {
  const { db } = await database();
  await db
    .collection('budgets')
    .createIndex({ userId: 1, month: 1, categoryId: 1 }, { unique: true });
  await db
    .collection('recurring_occurrences')
    .createIndex({ userId: 1, ruleId: 1, dueDate: 1 }, { unique: true });
  await db.collection('savings_contributions').createIndex({ userId: 1, id: 1 }, { unique: true });
  await db.collection('savings_contributions').createIndex({ userId: 1, goalId: 1 });
}
export const owned = (context: AuthContext, id?: string) => ({
  userId: context.user.id,
  ...(id ? { id } : {}),
});
export function metadata(context: AuthContext) {
  const now = new Date().toISOString();
  return {
    ...owned(context),
    id: randomUUID(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    currency: context.user.preferences.baseCurrency,
  };
}
export async function category(
  db: Db,
  session: ClientSession,
  context: AuthContext,
  id: string,
  type: string,
) {
  const record = await db
    .collection('categories')
    .findOne({ ...owned(context, id), archived: false, type }, { session });
  if (!record)
    throw new ApiError(400, 'INVALID_CATEGORY', 'Choose an active category of the matching type.');
}
export async function references(
  db: Db,
  session: ClientSession,
  context: AuthContext,
  input: { accountId: string; categoryId: string; type: string },
) {
  await category(db, session, context, input.categoryId, input.type);
  const account = await db.collection('accounts').findOne(
    {
      ...owned(context, input.accountId),
      archived: false,
      currency: context.user.preferences.baseCurrency,
    },
    { session },
  );
  if (!account)
    throw new ApiError(400, 'INVALID_ACCOUNT', 'Choose an active account in your base currency.');
}
export async function deleteOwned(
  context: AuthContext,
  request: Request,
  collection: 'budgets' | 'savings_goals' | 'recurring_rules',
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const record = await db.collection(collection).findOne(owned(context, id), { session });
    if (!record) throw notFound();
    requireVersion(Number(record.version), version);
    if (
      collection === 'recurring_rules' &&
      (await db
        .collection('recurring_occurrences')
        .findOne({ ...owned(context), ruleId: id, status: 'POSTED' }, { session }))
    )
      throw new ApiError(
        409,
        'RULE_HAS_HISTORY',
        'Pause this rule to retain its posted transaction history.',
      );
    await db.collection(collection).deleteOne({ ...owned(context, id), version }, { session });
    if (collection === 'savings_goals')
      await db
        .collection('savings_contributions')
        .deleteMany({ ...owned(context), goalId: id }, { session });
    // Keep posted occurrences as durable links to the ledger; discard only unposted reminders.
    if (collection === 'recurring_rules')
      await db
        .collection('recurring_occurrences')
        .deleteMany({ ...owned(context), ruleId: id, status: 'PENDING' }, { session });
    return { id, deleted: true };
  });
}
