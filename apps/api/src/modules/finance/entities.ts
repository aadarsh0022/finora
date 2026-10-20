import { randomUUID } from 'node:crypto';
import {
  accountSchema,
  categorySchema,
  type accountInputSchema,
  type accountUpdateSchema,
  type categoryInputSchema,
  type categoryUpdateSchema,
} from '@finora/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/service';
import { database } from '../../database/client';
import { enforceLimit, mutate, notFound, requireVersion } from './mutation';
import { ApiError } from '../../utils/http';

const defaults = {
  EXPENSE: [
    'Food',
    'Groceries',
    'Transport',
    'Shopping',
    'Bills',
    'Rent',
    'Entertainment',
    'Health',
    'Education',
    'Travel',
    'Other',
  ],
  INCOME: ['Salary', 'Freelance', 'Business', 'Gifts', 'Refunds', 'Other'],
} as const;

export async function listAccounts(context: AuthContext, includeArchived: boolean) {
  const { db } = await database();
  return (
    await db
      .collection('accounts')
      .find({ userId: context.user.id, ...(includeArchived ? {} : { archived: false }) })
      .sort({ createdAt: 1, id: 1 })
      .limit(200)
      .toArray()
  ).map((record) => accountSchema.parse(record));
}
export async function getAccount(context: AuthContext, id: string) {
  const { db } = await database();
  const record = await db.collection('accounts').findOne({ userId: context.user.id, id });
  if (!record) throw notFound();
  return accountSchema.parse(record);
}
export async function createAccount(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof accountInputSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    await enforceLimit(db, session, 'accounts', context.user.id, 200);
    const now = new Date().toISOString();
    const record = accountSchema.parse({
      ...input,
      id: randomUUID(),
      userId: context.user.id,
      currency: context.user.preferences.baseCurrency,
      archived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('accounts').insertOne({ ...record }, { session });
    return record;
  });
}
export async function updateAccount(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof accountUpdateSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const collection = db.collection('accounts');
    const found = await collection.findOne({ userId: context.user.id, id }, { session });
    if (!found) throw notFound();
    const record = accountSchema.parse(found);
    requireVersion(record.version, input.version);
    const updated = accountSchema.parse({
      ...record,
      ...input,
      version: record.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await collection.replaceOne(
      { userId: context.user.id, id, version: input.version },
      { ...updated },
      { session },
    );
    return updated;
  });
}
export async function archiveAccount(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const collection = db.collection('accounts');
    const found = await collection.findOne({ userId: context.user.id, id }, { session });
    if (!found) throw notFound();
    const record = accountSchema.parse(found);
    requireVersion(record.version, version);
    const updated = accountSchema.parse({
      ...record,
      archived: true,
      version: version + 1,
      updatedAt: new Date().toISOString(),
    });
    await collection.updateOne(
      { userId: context.user.id, id, version },
      { $set: updated },
      { session },
    );
    return updated;
  });
}
export async function listCategories(context: AuthContext, includeArchived: boolean) {
  const { db } = await database();
  return (
    await db
      .collection('categories')
      .find({ userId: context.user.id, ...(includeArchived ? {} : { archived: false }) })
      .sort({ type: 1, name: 1 })
      .limit(300)
      .toArray()
  ).map((record) => categorySchema.parse(record));
}
export async function seedCategories(context: AuthContext, request: Request) {
  return mutate(context, request, {}, async (db, session) => {
    const collection = db.collection('categories');
    const now = new Date().toISOString();
    const existing = await collection
      .find({ userId: context.user.id }, { session })
      .project({ defaultKey: 1 })
      .limit(301)
      .toArray();
    const keys = new Set(existing.map((record) => record.defaultKey));
    const missing = Object.entries(defaults).reduce(
      (count, [type, names]) => count + names.filter((name) => !keys.has(`${type}:${name}`)).length,
      0,
    );
    if (existing.length + missing > 300)
      throw new ApiError(
        409,
        'RECORD_LIMIT',
        'Default categories would exceed the 300-category limit.',
      );
    for (const type of ['EXPENSE', 'INCOME'] as const)
      for (const name of defaults[type]) {
        const record = categorySchema.parse({
          id: randomUUID(),
          userId: context.user.id,
          name,
          type,
          archived: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        await collection.updateOne(
          { userId: context.user.id, defaultKey: `${type}:${name}` },
          { $setOnInsert: { ...record, defaultKey: `${type}:${name}` } },
          { upsert: true, session },
        );
      }
    return { message: 'Default categories ready.' };
  });
}
export async function createCategory(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof categoryInputSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    await enforceLimit(db, session, 'categories', context.user.id, 300);
    const now = new Date().toISOString();
    const record = categorySchema.parse({
      ...input,
      id: randomUUID(),
      userId: context.user.id,
      archived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('categories').insertOne({ ...record }, { session });
    return record;
  });
}
export async function updateCategory(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof categoryUpdateSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const collection = db.collection('categories');
    const found = await collection.findOne({ userId: context.user.id, id }, { session });
    if (!found) throw notFound();
    const record = categorySchema.parse(found);
    requireVersion(record.version, input.version);
    if (record.type !== input.type) {
      for (const name of ['transactions', 'budgets', 'recurring_rules', 'recurring_occurrences']) {
        if (
          await db
            .collection(name)
            .findOne({ userId: context.user.id, categoryId: id }, { session })
        )
          throw new ApiError(
            409,
            'CATEGORY_IN_USE',
            'A category with history or a financial plan cannot change between income and expense.',
          );
      }
    }
    const updated = categorySchema.parse({
      ...record,
      ...input,
      version: record.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await collection.updateOne(
      { userId: context.user.id, id, version: input.version },
      { $set: updated },
      { session },
    );
    return updated;
  });
}
export async function archiveCategory(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const collection = db.collection('categories');
    const found = await collection.findOne({ userId: context.user.id, id }, { session });
    if (!found) throw notFound();
    const record = categorySchema.parse(found);
    requireVersion(record.version, version);
    const updated = categorySchema.parse({
      ...record,
      archived: true,
      version: version + 1,
      updatedAt: new Date().toISOString(),
    });
    await collection.updateOne(
      { userId: context.user.id, id, version },
      { $set: updated },
      { session },
    );
    return updated;
  });
}
