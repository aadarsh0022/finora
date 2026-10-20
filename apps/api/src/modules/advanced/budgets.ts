import { budgetSchema, type budgetInputSchema, type budgetUpdateSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { overview } from '../finance/ledger';
import { owned, metadata, category } from './common';
import type { z } from 'zod';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { enforceLimit, mutate, notFound, requireVersion } from '../finance/mutation';

export async function listBudgets(context: AuthContext, month?: string) {
  const period = month ?? calendarDate(new Date(), context.user.preferences.timezone).slice(0, 7);
  const { db } = await database();
  const records = await db
    .collection('budgets')
    .find({ ...owned(context), month: period })
    .limit(1200)
    .toArray();
  const report = await overview(context, period);
  return records.map((record) => {
    const budget = budgetSchema.parse(record);
    const spentMinor = report.categorySpending[budget.categoryId] ?? '0';
    const remaining = BigInt(budget.amountMinor) - BigInt(spentMinor);
    return {
      ...budget,
      spentMinor,
      remainingMinor: remaining.toString(),
      overBudget: remaining < 0n,
      warningReached:
        BigInt(spentMinor) * 10000n >=
        BigInt(budget.amountMinor) * BigInt(budget.warningThresholdBasisPoints),
      timezone: context.user.preferences.timezone,
    };
  });
}
export async function getBudget(context: AuthContext, id: string) {
  const { db } = await database();
  const document = await db.collection('budgets').findOne(owned(context, id));
  if (!document) throw notFound();
  const budget = budgetSchema.parse(document);
  const status = (await listBudgets(context, budget.month)).find((item) => item.id === id);
  if (!status) throw notFound();
  return status;
}
export async function saveBudget(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof budgetInputSchema> | z.infer<typeof budgetUpdateSchema>,
  id?: string,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    await category(db, session, context, input.categoryId, 'EXPENSE');
    const collection = db.collection('budgets');
    const previous = id ? await collection.findOne(owned(context, id), { session }) : null;
    if (id && !previous) throw notFound();
    if (previous && 'version' in input)
      requireVersion(budgetSchema.parse(previous).version, input.version);
    const duplicate = await collection.findOne(
      { ...owned(context), month: input.month, categoryId: input.categoryId },
      { session },
    );
    if (duplicate && duplicate.id !== id)
      throw new ApiError(
        409,
        'DUPLICATE_BUDGET',
        'This category already has a budget for this month.',
      );
    if (!id) await enforceLimit(db, session, 'budgets', context.user.id, 1200);
    const record = budgetSchema.parse({
      ...input,
      ...(previous ?? metadata(context)),
      categoryId: input.categoryId,
      month: input.month,
      amountMinor: input.amountMinor,
      warningThresholdBasisPoints: input.warningThresholdBasisPoints,
      version: previous ? Number(previous.version) + 1 : 1,
      updatedAt: new Date().toISOString(),
    });
    if (previous) await collection.replaceOne(owned(context, id), record, { session });
    else await collection.insertOne(record, { session });
    return record;
  });
}
