import {
  budgetSchema,
  monthlyLimitSchema,
  type monthlyLimitInputSchema,
  type copyBudgetsSchema,
  type budgetInputSchema,
  type budgetUpdateSchema,
} from '@finora/contracts';
import { calendarDate, budgetRollover } from '@finora/finance-core';
import { overview, ledgerSnapshot } from '../finance/ledger';
import { owned, metadata, category } from './common';
import type { z } from 'zod';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { enforceLimit, mutate, notFound, requireVersion } from '../finance/mutation';

export async function listBudgets(context: AuthContext, month?: string) {
  const period = month ?? calendarDate(new Date(), context.user.preferences.timezone).slice(0, 7);
  const { db } = await database();
  const records = await db.collection('budgets').find(owned(context)).limit(1201).toArray();
  if (records.length > 1200)
    throw new ApiError(422, 'REPORT_LIMIT', 'Budget history exceeds the reporting limit.');
  const snapshot = await ledgerSnapshot(context);
  const spending = new Map<string, string>();
  for (const entry of snapshot.transactions)
    if (entry.type === 'EXPENSE' && entry.categoryId) {
      const key = `${calendarDate(new Date(entry.date), context.user.preferences.timezone).slice(0, 7)}:${entry.categoryId}`;
      spending.set(key, (BigInt(spending.get(key) ?? '0') + BigInt(entry.amountMinor)).toString());
    }
  return budgetRollover(
    records.map((r) => budgetSchema.parse(r)),
    spending,
  )
    .filter((budget) => budget.month === period)
    .map((budget) => {
      return {
        ...budget,
        warningReached:
          BigInt(budget.spentMinor) * 10000n >=
          BigInt(budget.effectiveLimitMinor) * BigInt(budget.warningThresholdBasisPoints),
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
      rollover: input.rollover,
      version: previous ? Number(previous.version) + 1 : 1,
      updatedAt: new Date().toISOString(),
    });
    if (previous) await collection.replaceOne(owned(context, id), record, { session });
    else await collection.insertOne(record, { session });
    return record;
  });
}

export async function totalLimit(context: AuthContext, month: string) {
  const { db } = await database();
  const found = await db.collection('monthly_budget_limits').findOne({ ...owned(context), month });
  const plan = found ? monthlyLimitSchema.parse(found) : null;
  const report = await overview(context, month);
  const remaining = plan
    ? (BigInt(plan.amountMinor) - BigInt(report.expensesMinor)).toString()
    : null;
  return {
    month,
    plan,
    spentMinor: report.expensesMinor,
    remainingMinor: remaining,
    warningReached:
      !!plan && BigInt(report.expensesMinor) * 10000n >= BigInt(plan.amountMinor) * 8000n,
  };
}
export async function saveTotalLimit(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof monthlyLimitInputSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    const collection = db.collection('monthly_budget_limits');
    const found = await collection.findOne({ ...owned(context), month: input.month }, { session });
    if (found) requireVersion(monthlyLimitSchema.parse(found).version, input.version ?? 0);
    else {
      if (input.version) throw notFound();
      await enforceLimit(db, session, 'monthly_budget_limits', context.user.id, 1200);
    }
    const record = monthlyLimitSchema.parse({
      ...metadata(context),
      ...(found ?? {}),
      month: input.month,
      amountMinor: input.amountMinor,
      version: found ? Number(found.version) + 1 : 1,
      updatedAt: new Date().toISOString(),
    });
    await collection.replaceOne(
      { ...owned(context), month: input.month },
      { ...record },
      { session, upsert: true },
    );
    return record;
  });
}
export async function removeTotalLimit(
  context: AuthContext,
  request: Request,
  month: string,
  version: number,
) {
  return mutate(context, request, { month, version }, async (db, session) => {
    const record = await db
      .collection('monthly_budget_limits')
      .findOne({ ...owned(context), month }, { session });
    if (!record) throw notFound();
    requireVersion(monthlyLimitSchema.parse(record).version, version);
    await db
      .collection('monthly_budget_limits')
      .deleteOne({ ...owned(context), month, version }, { session });
    return { id: String(record.id), deleted: true };
  });
}
export async function copyBudgets(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof copyBudgetsSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    const budgets = db.collection('budgets');
    const source = (
      await budgets
        .find({ ...owned(context), month: input.fromMonth }, { session })
        .limit(1201)
        .toArray()
    ).map((r) => budgetSchema.parse(r));
    const target = await budgets
      .find({ ...owned(context), month: input.toMonth }, { session })
      .limit(1201)
      .toArray();
    const existing = new Set(target.map((b) => String(b.categoryId)));
    const active = new Set(
      (
        await db
          .collection('categories')
          .find({ ...owned(context), type: 'EXPENSE', archived: false }, { session })
          .limit(301)
          .toArray()
      ).map((c) => String(c.id)),
    );
    const added = source.filter((b) => !existing.has(b.categoryId) && active.has(b.categoryId));
    const count = await budgets.countDocuments(owned(context), { session, limit: 1201 });
    if (count + added.length > 1200)
      throw new ApiError(409, 'RECORD_LIMIT', 'Copied budgets would exceed the 1200-record limit.');
    const records = added.map((b) =>
      budgetSchema.parse({
        ...b,
        ...metadata(context),
        month: input.toMonth,
        rollover: input.copyRollover && b.rollover,
      }),
    );
    if (records.length) await budgets.insertMany(records, { session });
    const limits = db.collection('monthly_budget_limits');
    const from = await limits.findOne({ ...owned(context), month: input.fromMonth }, { session });
    const to = await limits.findOne({ ...owned(context), month: input.toMonth }, { session });
    let totalCopied = false;
    if (from && !to) {
      await enforceLimit(db, session, 'monthly_budget_limits', context.user.id, 1200);
      const plan = monthlyLimitSchema.parse({
        ...monthlyLimitSchema.parse(from),
        ...metadata(context),
        month: input.toMonth,
      });
      await limits.insertOne({ ...plan }, { session });
      totalCopied = true;
    }
    return { created: records.length, skipped: source.length - records.length, totalCopied };
  });
}
