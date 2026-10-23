import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  debtSchema,
  debtEventSchema,
  type debtInputSchema,
  type debtUpdateSchema,
  type repaymentInputSchema,
} from '@finora/contracts';
import { calendarDate, debtProgress } from '@finora/finance-core';
import type { ClientSession, Db } from 'mongodb';
import { database } from '../../database/client';
import type { AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { owned, metadata } from '../advanced/common';
import { enforceLimit, mutate, notFound, requireVersion } from '../finance/mutation';

async function account(db: Db, session: ClientSession, context: AuthContext, accountId?: string) {
  if (!accountId) return;
  if (
    !(await db.collection('accounts').findOne(
      {
        ...owned(context, accountId),
        archived: false,
        currency: context.user.preferences.baseCurrency,
      },
      { session },
    ))
  )
    throw new ApiError(400, 'INVALID_ACCOUNT', 'Choose an active account in your base currency.');
}
function recordedDate(context: AuthContext, date: string) {
  if (date > calendarDate(new Date(), context.user.preferences.timezone))
    throw new ApiError(
      400,
      'FUTURE_DEBT_EVENT',
      'Only record money already borrowed, lent or repaid.',
    );
}
export async function listDebts(context: AuthContext, id?: string) {
  const { client, db } = await database();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const documents = await db
          .collection('debts')
          .find(owned(context, id), { session })
          .sort({ createdAt: -1, id: 1 })
          .limit(201)
          .toArray();
        if (documents.length > 200)
          throw new ApiError(422, 'REPORT_LIMIT', 'Debt record limit exceeded.');
        if (id && !documents.length) throw notFound();
        const events = (
          await db
            .collection('debt_events')
            .find(owned(context), { session })
            .limit(10001)
            .toArray()
        ).map((e) => debtEventSchema.parse(e));
        if (events.length > 10000)
          throw new ApiError(422, 'REPORT_LIMIT', 'Debt history limit exceeded.');
        const today = calendarDate(new Date(), context.user.preferences.timezone);
        return documents.map((document) => {
          const debt = debtSchema.parse(document);
          const history = events
            .filter((e) => e.debtId === debt.id)
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) ||
                b.createdAt.localeCompare(a.createdAt) ||
                a.id.localeCompare(b.id),
            );
          const progress = debt.cancelledAt
            ? { repaidMinor: '0', remainingMinor: '0', complete: true }
            : debtProgress(debt.amountMinor, history);
          return {
            ...debt,
            repaidMinor: progress.repaidMinor,
            remainingMinor: progress.remainingMinor,
            status: progress.complete
              ? ('SETTLED' as const)
              : debt.dueDate && debt.dueDate < today
                ? ('OVERDUE' as const)
                : ('ACTIVE' as const),
            ...(id ? { events: history } : {}),
          };
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}
export async function createDebt(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof debtInputSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    recordedDate(context, input.date);
    await account(db, session, context, input.accountId);
    await enforceLimit(db, session, 'debts', context.user.id, 200);
    await enforceLimit(db, session, 'debt_events', context.user.id, 10000);
    const debt = debtSchema.parse({ ...metadata(context), ...input, archived: false });
    const event = debtEventSchema.parse({
      ...metadata(context),
      ...input,
      id: randomUUID(),
      debtId: debt.id,
      kind: 'PRINCIPAL',
    });
    await db.collection('debts').insertOne({ ...debt }, { session });
    await db.collection('debt_events').insertOne({ ...event }, { session });
    return debt;
  });
}
export async function updateDebt(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof debtUpdateSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const document = await db.collection('debts').findOne(owned(context, id), { session });
    if (!document) throw notFound();
    const debt = debtSchema.parse(document);
    requireVersion(debt.version, input.version);
    if (debt.cancelledAt)
      throw new ApiError(
        409,
        'CANCELLED_DEBT',
        'Cancelled debts retain history and cannot be edited.',
      );
    if (input.dueDate && input.dueDate < debt.date)
      throw new ApiError(400, 'INVALID_DATE', 'Due date must follow the start date.');
    const next = debtSchema.parse({
      ...debt,
      ...input,
      dueDate: input.dueDate,
      version: debt.version + 1,
      updatedAt: new Date().toISOString(),
    });
    // MongoDB encodes undefined fields as null unless explicitly omitted.
    if (!input.dueDate) delete next.dueDate;
    await db
      .collection('debts')
      .replaceOne({ ...owned(context, id), version: input.version }, { ...next }, { session });
    return next;
  });
}
export async function repay(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof repaymentInputSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const document = await db.collection('debts').findOne(owned(context, id), { session });
    if (!document) throw notFound();
    const debt = debtSchema.parse(document);
    requireVersion(debt.version, input.version);
    if (debt.cancelledAt) throw new ApiError(409, 'CANCELLED_DEBT', 'This debt was cancelled.');
    if (debt.archived)
      throw new ApiError(409, 'ARCHIVED_DEBT', 'Restore this debt before recording repayments.');
    recordedDate(context, input.date);
    if (input.date < debt.date)
      throw new ApiError(400, 'INVALID_DATE', 'Repayment cannot precede the debt.');
    await account(db, session, context, input.accountId);
    const events = (
      await db
        .collection('debt_events')
        .find({ ...owned(context), debtId: id }, { session })
        .limit(1002)
        .toArray()
    ).map((e) => debtEventSchema.parse(e));
    if (events.length >= 1001)
      throw new ApiError(
        409,
        'RECORD_LIMIT',
        'A debt supports 1000 repayment events, including corrections.',
      );
    const progress = debtProgress(debt.amountMinor, events);
    if (BigInt(input.amountMinor) > BigInt(progress.remainingMinor))
      throw new ApiError(409, 'OVERPAYMENT', 'Repayment exceeds the remaining balance.');
    await enforceLimit(db, session, 'debt_events', context.user.id, 10000);
    const event = debtEventSchema.parse({
      ...metadata(context),
      ...input,
      debtId: id,
      direction: debt.direction,
      kind: 'REPAYMENT',
    });
    await db.collection('debt_events').insertOne({ ...event }, { session });
    await db
      .collection('debts')
      .updateOne(
        { ...owned(context, id), version: input.version },
        { $inc: { version: 1 }, $set: { updatedAt: event.createdAt } },
        { session },
      );
    return event;
  });
}
export async function reverseRepayment(
  context: AuthContext,
  request: Request,
  id: string,
  eventId: string,
  version: number,
) {
  return mutate(context, request, { id, eventId, version }, async (db, session) => {
    const document = await db.collection('debts').findOne(owned(context, id), { session });
    if (!document) throw notFound();
    requireVersion(debtSchema.parse(document).version, version);
    const event = await db.collection('debt_events').findOne(
      {
        ...owned(context, eventId),
        debtId: id,
        kind: 'REPAYMENT',
        reversedAt: { $exists: false },
      },
      { session },
    );
    if (!event) throw notFound();
    const now = new Date().toISOString();
    await db
      .collection('debt_events')
      .updateOne(owned(context, eventId), { $set: { reversedAt: now } }, { session });
    await db
      .collection('debts')
      .updateOne(
        { ...owned(context, id), version },
        { $inc: { version: 1 }, $set: { updatedAt: now } },
        { session },
      );
    return { id: eventId, reversed: true };
  });
}

export async function cancelDebt(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const document = await db.collection('debts').findOne(owned(context, id), { session });
    if (!document) throw notFound();
    const debt = debtSchema.parse(document);
    requireVersion(debt.version, version);
    if (debt.cancelledAt)
      throw new ApiError(409, 'CANCELLED_DEBT', 'This debt was already cancelled.');
    const now = new Date().toISOString();
    await db
      .collection('debt_events')
      .updateMany(
        { ...owned(context), debtId: id, reversedAt: { $exists: false } },
        { $set: { reversedAt: now } },
        { session },
      );
    await db
      .collection('debts')
      .updateOne(
        { ...owned(context, id), version },
        { $set: { cancelledAt: now, archived: true, updatedAt: now }, $inc: { version: 1 } },
        { session },
      );
    return { id, cancelled: true };
  });
}
