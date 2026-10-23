import { randomUUID } from 'node:crypto';
import {
  Decimal128,
  type ClientSession,
  type Db,
  type Filter,
  type Document,
  type Sort,
} from 'mongodb';
import {
  accountSchema,
  categorySchema,
  transactionSchema,
  debtEventSchema,
  type AccountWithBalance,
  type Transaction,
  type TransactionFilters,
  type TransactionInput,
  type transactionUpdateSchema,
} from '@finora/contracts';
import { accountBalance, calendarDate, cashflow, debtLedgerEntries } from '@finora/finance-core';
import type { z } from 'zod';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { enforceLimit, mutate, notFound, requireVersion } from './mutation';

async function validateReferences(
  db: Db,
  session: ClientSession,
  context: AuthContext,
  input: TransactionInput,
  previous?: Transaction,
) {
  for (const id of [input.accountId, input.destinationAccountId].filter(
    (value): value is string => !!value,
  )) {
    const found = await db
      .collection('accounts')
      .findOne({ userId: context.user.id, id }, { session });
    if (!found) throw new ApiError(400, 'INVALID_ACCOUNT', 'Choose an account belonging to you.');
    const account = accountSchema.parse(found);
    const previouslyReferenced =
      previous?.accountId === id || previous?.destinationAccountId === id;
    if (account.archived && !previouslyReferenced)
      throw new ApiError(
        409,
        'ARCHIVED_ACCOUNT',
        'Restore this account before adding new transactions.',
      );
    if (account.currency !== context.user.preferences.baseCurrency)
      throw new ApiError(400, 'CURRENCY_MISMATCH', 'Multi-currency transfers are not supported.');
  }
  if (input.categoryId) {
    const found = await db
      .collection('categories')
      .findOne({ userId: context.user.id, id: input.categoryId }, { session });
    if (!found) throw new ApiError(400, 'INVALID_CATEGORY', 'Choose a category belonging to you.');
    const category = categorySchema.parse(found);
    if (category.type !== input.type)
      throw new ApiError(
        400,
        'CATEGORY_TYPE_MISMATCH',
        'The category must match income or expense.',
      );
    if (category.archived && previous?.categoryId !== category.id)
      throw new ApiError(409, 'ARCHIVED_CATEGORY', 'Restore this category before using it.');
  }
}

export async function createTransaction(
  context: AuthContext,
  request: Request,
  input: TransactionInput,
) {
  return mutate(context, request, input, async (db, session) => {
    await enforceLimit(db, session, 'transactions', context.user.id, 10000);
    await validateReferences(db, session, context, input);
    const now = new Date().toISOString();
    const record = transactionSchema.parse({
      ...input,
      date: new Date(input.date).toISOString(),
      currency: context.user.preferences.baseCurrency,
      id: randomUUID(),
      userId: context.user.id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .collection('transactions')
      .insertOne({ ...record, amountSort: Decimal128.fromString(record.amountMinor) }, { session });
    return record;
  });
}
export async function getTransaction(context: AuthContext, id: string) {
  const { db } = await database();
  const record = await db.collection('transactions').findOne({ userId: context.user.id, id });
  if (!record) throw notFound();
  return transactionSchema.parse(record);
}
export async function updateTransaction(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof transactionUpdateSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const collection = db.collection('transactions');
    const found = await collection.findOne({ userId: context.user.id, id }, { session });
    if (!found) throw notFound();
    const previous = transactionSchema.parse(found);
    requireVersion(previous.version, input.version);
    await validateReferences(db, session, context, input, previous);
    const occurrence = await db
      .collection('recurring_occurrences')
      .findOne({ userId: context.user.id, transactionId: id, status: 'POSTED' }, { session });
    if (occurrence && input.type === 'TRANSFER')
      throw new ApiError(
        409,
        'RECURRING_TRANSACTION',
        'A confirmed recurring entry cannot become a transfer. Delete it and add a separate transfer.',
      );
    // Build from editable fields so switching transfer/type removes obsolete references.
    const record = transactionSchema.parse({
      ...input,
      date: new Date(input.date).toISOString(),
      id,
      userId: context.user.id,
      currency: previous.currency,
      version: previous.version + 1,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await collection.replaceOne(
      { userId: context.user.id, id, version: input.version },
      { ...record, amountSort: Decimal128.fromString(record.amountMinor) },
      { session },
    );
    if (occurrence)
      await db.collection('recurring_occurrences').updateOne(
        { userId: context.user.id, id: occurrence.id },
        {
          $set: {
            type: record.type,
            accountId: record.accountId,
            categoryId: record.categoryId,
            amountMinor: record.amountMinor,
            updatedAt: record.updatedAt,
          },
          $inc: { version: 1 },
        },
        { session },
      );
    return record;
  });
}
export async function deleteTransaction(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const collection = db.collection('transactions');
    const found = await collection.findOne({ userId: context.user.id, id }, { session });
    if (!found) throw notFound();
    requireVersion(transactionSchema.parse(found).version, version);
    await collection.deleteOne({ userId: context.user.id, id, version }, { session });
    await db.collection('recurring_occurrences').updateOne(
      { userId: context.user.id, transactionId: id, status: 'POSTED' },
      {
        $set: { status: 'PENDING', updatedAt: new Date().toISOString() },
        $unset: { transactionId: '' },
        $inc: { version: 1 },
      },
      { session },
    );
    return { id, deleted: true };
  });
}

export async function listTransactions(context: AuthContext, input: TransactionFilters) {
  const { db } = await database();
  const filter: Filter<Document> = { userId: context.user.id };
  if (input.type) filter.type = input.type;
  if (input.categoryId) filter.categoryId = input.categoryId;
  const and: Filter<Document>[] = [];
  if (input.accountId)
    and.push({ $or: [{ accountId: input.accountId }, { destinationAccountId: input.accountId }] });
  if (input.q) {
    const literal = input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    and.push({
      $or: [
        { merchant: { $regex: literal, $options: 'i' } },
        { note: { $regex: literal, $options: 'i' } },
      ],
    });
  }
  if (and.length) filter.$and = and;
  if (input.from || input.to)
    filter.date = {
      ...(input.from ? { $gte: new Date(input.from).toISOString() } : {}),
      ...(input.to ? { $lte: new Date(input.to).toISOString() } : {}),
    };
  if (input.minAmount || input.maxAmount)
    filter.amountSort = {
      ...(input.minAmount ? { $gte: Decimal128.fromString(input.minAmount) } : {}),
      ...(input.maxAmount ? { $lte: Decimal128.fromString(input.maxAmount) } : {}),
    };
  const sort: Sort =
    input.sort === 'highest' || input.sort === 'lowest'
      ? { amountSort: input.sort === 'highest' ? -1 : 1, id: 1 }
      : { date: input.sort === 'oldest' ? 1 : -1, id: 1 };
  const collection = db.collection('transactions');
  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort(sort)
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .toArray(),
    collection.countDocuments(filter, { limit: 10001 }),
  ]);
  return {
    items: items.map((item) => transactionSchema.parse(item)),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function ledgerSnapshot(context: AuthContext) {
  const { client, db } = await database();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const accountRecords = await db
          .collection('accounts')
          .find({ userId: context.user.id }, { session })
          .limit(201)
          .toArray();
        const transactionRecords = await db
          .collection('transactions')
          .find({ userId: context.user.id }, { session })
          .limit(10001)
          .toArray();
        if (accountRecords.length > 200 || transactionRecords.length > 10000)
          throw new ApiError(
            422,
            'REPORT_LIMIT',
            'This dataset exceeds the current reporting limit. Contact support.',
          );
        const transactions = transactionRecords.map((record) => transactionSchema.parse(record));
        const debtDocuments = await db
          .collection('debt_events')
          .find({ userId: context.user.id }, { session })
          .limit(10001)
          .toArray();
        if (debtDocuments.length > 10000)
          throw new ApiError(422, 'REPORT_LIMIT', 'Debt history exceeds the reporting limit.');
        const debtEntries = debtLedgerEntries(debtDocuments.map((e) => debtEventSchema.parse(e)));
        const accounts = accountRecords.map((record): AccountWithBalance => {
          const account = accountSchema.parse(record);
          return {
            ...account,
            balanceMinor: accountBalance(
              account.openingBalanceMinor,
              account.id,
              account.currency,
              [...transactions, ...debtEntries],
            ),
          };
        });
        return { accounts, transactions };
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}

export async function overview(context: AuthContext, month?: string) {
  const snapshot = await ledgerSnapshot(context);
  const timezone = context.user.preferences.timezone;
  const period = month ?? calendarDate(new Date(), timezone).slice(0, 7);
  const transactions = snapshot.transactions.filter((item) =>
    calendarDate(new Date(item.date), timezone).startsWith(period),
  );
  const spending: Record<string, string> = {};
  for (const entry of transactions)
    if (entry.type === 'EXPENSE' && entry.categoryId)
      spending[entry.categoryId] = (
        BigInt(spending[entry.categoryId] ?? '0') + BigInt(entry.amountMinor)
      ).toString();
  return {
    month: period,
    timezone,
    currency: context.user.preferences.baseCurrency,
    totalBalanceMinor: snapshot.accounts
      .reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n)
      .toString(),
    ...cashflow(transactions),
    accounts: snapshot.accounts,
    categorySpending: spending,
    recentTransactions: [...snapshot.transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .slice(0, 5),
  };
}
