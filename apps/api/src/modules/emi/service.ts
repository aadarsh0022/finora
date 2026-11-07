import { randomUUID } from 'node:crypto';
import { Decimal128, type ClientSession, type Db } from 'mongodb';
import type { z } from 'zod';
import {
  emiExtraPaymentSchema,
  emiIncomePeriodSchema,
  emiLoanSchema,
  emiOverviewSchema,
  emiPaymentSchema,
  transactionSchema,
  type emiExtraPaymentInputSchema,
  type emiIncomePeriodInputSchema,
  type emiIncomePeriodUpdateSchema,
  type emiLoanInputSchema,
  type emiLoanUpdateSchema,
  type emiPaymentInputSchema,
} from '@finora/contracts';
import { calendarDate, entryDate } from '@finora/finance-core';
import { database } from '../../database/client';
import type { AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { metadata, owned, references } from '../advanced/common';
import { enforceLimit, mutate, notFound, requireVersion } from '../finance/mutation';

const today = (context: AuthContext) => calendarDate(new Date(), context.user.preferences.timezone);

/** Whole tracker in one consistent read; a personal loan list is small and bounded. */
export async function emiOverview(context: AuthContext) {
  const { client, db } = await database();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const read = async (collection: string, limit: number, sort: Record<string, 1 | -1>) => {
          const rows = await db
            .collection(collection)
            .find(owned(context), { session })
            .sort(sort)
            .limit(limit + 1)
            .toArray();
          if (rows.length > limit)
            throw new ApiError(422, 'REPORT_LIMIT', 'Loan tracker record limit exceeded.');
          return rows;
        };
        return emiOverviewSchema.parse({
          loans: await read('emi_loans', 100, { createdAt: 1, id: 1 }),
          payments: await read('emi_payments', 5000, { monthKey: 1, id: 1 }),
          extraPayments: await read('emi_extra_payments', 2000, { date: 1, id: 1 }),
          incomePeriods: await read('emi_income_periods', 100, { startMonth: 1, id: 1 }),
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}

export async function createLoan(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof emiLoanInputSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    await enforceLimit(db, session, 'emi_loans', context.user.id, 100);
    const loan = emiLoanSchema.parse({
      ...metadata(context),
      ...input,
      isActive: true,
      principalAsOf: input.principalRemainingMinor === null ? null : today(context),
    });
    await db.collection('emi_loans').insertOne({ ...loan }, { session });
    return loan;
  });
}

export async function updateLoan(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof emiLoanUpdateSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const found = await db.collection('emi_loans').findOne(owned(context, id), { session });
    if (!found) throw notFound();
    const loan = emiLoanSchema.parse(found);
    requireVersion(loan.version, input.version);
    // The "as of" day moves only when the figure changes, so re-saving another field does not
    // make an old principal look fresh.
    const principalChanged = input.principalRemainingMinor !== loan.principalRemainingMinor;
    const next = emiLoanSchema.parse({
      ...loan,
      ...input,
      principalAsOf: principalChanged
        ? input.principalRemainingMinor === null
          ? null
          : today(context)
        : loan.principalAsOf,
      version: loan.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await db
      .collection('emi_loans')
      .replaceOne({ ...owned(context, id), version: input.version }, { ...next }, { session });
    return next;
  });
}

/** Removes the loan with its payment history and prepayments. Recorded expenses stay in the ledger. */
export async function deleteLoan(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const found = await db.collection('emi_loans').findOne(owned(context, id), { session });
    if (!found) throw notFound();
    requireVersion(emiLoanSchema.parse(found).version, version);
    await db.collection('emi_loans').deleteOne(owned(context, id), { session });
    await db.collection('emi_payments').deleteMany({ ...owned(context), loanId: id }, { session });
    await db
      .collection('emi_extra_payments')
      .deleteMany({ ...owned(context), loanId: id }, { session });
    return { id };
  });
}

async function loanFor(db: Db, session: ClientSession, context: AuthContext, id: string) {
  const found = await db.collection('emi_loans').findOne(owned(context, id), { session });
  if (!found) throw notFound();
  return emiLoanSchema.parse(found);
}

/**
 * When debt is not kept separate, a payment also records one normal expense from the chosen
 * account, linked to the payment so undoing it removes it. Returns that expense's id.
 */
async function syncExpense(
  db: Db,
  session: ClientSession,
  context: AuthContext,
  input: {
    existingId: string | null;
    amountMinor: string;
    accountId?: string | undefined;
    categoryId?: string | undefined;
    note: string;
  },
) {
  const transactions = db.collection('transactions');
  if (context.user.preferences.keepDebtSeparate) {
    if (input.existingId)
      await transactions.deleteOne({ ...owned(context, input.existingId) }, { session });
    return null;
  }
  if (!input.accountId || !input.categoryId)
    throw new ApiError(
      400,
      'EMI_ACCOUNT_REQUIRED',
      'Choose the account and category this payment was made from.',
    );
  await references(db, session, context, {
    accountId: input.accountId,
    categoryId: input.categoryId,
    type: 'EXPENSE',
  });
  const now = new Date().toISOString();
  const existing = input.existingId
    ? await transactions.findOne(owned(context, input.existingId), { session })
    : null;
  if (existing) {
    await transactions.updateOne(
      owned(context, input.existingId!),
      {
        $set: {
          accountId: input.accountId,
          categoryId: input.categoryId,
          amountMinor: input.amountMinor,
          amountSort: Decimal128.fromString(input.amountMinor),
          updatedAt: now,
        },
        $inc: { version: 1 },
      },
      { session },
    );
    return input.existingId;
  }
  await enforceLimit(db, session, 'transactions', context.user.id, 10000);
  const record = transactionSchema.parse({
    type: 'EXPENSE',
    accountId: input.accountId,
    categoryId: input.categoryId,
    amountMinor: input.amountMinor,
    ...entryDate(today(context), context.user.preferences.timezone),
    merchant: '',
    note: input.note,
    tags: ['emi'],
    id: randomUUID(),
    userId: context.user.id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    currency: context.user.preferences.baseCurrency,
  });
  await transactions.insertOne(
    { ...record, amountSort: Decimal128.fromString(record.amountMinor) },
    { session },
  );
  return record.id;
}

export async function setPayment(
  context: AuthContext,
  request: Request,
  loanId: string,
  monthKey: string,
  input: z.infer<typeof emiPaymentInputSchema>,
) {
  return mutate(context, request, { loanId, monthKey, ...input }, async (db, session) => {
    const loan = await loanFor(db, session, context, loanId);
    if (monthKey < loan.startMonth || (loan.endMonth !== null && monthKey > loan.endMonth))
      throw new ApiError(400, 'MONTH_OUT_OF_RANGE', 'This month is outside the loan’s dates.');
    const key = { ...owned(context), loanId, monthKey };
    const existing = await db.collection('emi_payments').findOne(key, { session });
    const previous = existing ? emiPaymentSchema.parse(existing) : null;
    const amountPaidMinor = input.amountMinor ?? loan.monthlyAmountMinor;
    const now = new Date().toISOString();
    const transactionId = await syncExpense(db, session, context, {
      existingId: previous?.transactionId ?? null,
      amountMinor: amountPaidMinor,
      accountId: input.accountId,
      categoryId: input.categoryId,
      note: `EMI ${monthKey}`,
    });
    const payment = emiPaymentSchema.parse({
      ...metadata(context),
      ...(previous ? { id: previous.id, createdAt: previous.createdAt } : {}),
      loanId,
      monthKey,
      amountDueMinor: previous?.amountDueMinor ?? loan.monthlyAmountMinor,
      amountPaidMinor,
      paid: true,
      paidAt: now,
      transactionId,
      version: previous ? previous.version + 1 : 1,
      updatedAt: now,
    });
    await db.collection('emi_payments').replaceOne(key, { ...payment }, { session, upsert: true });
    return payment;
  });
}

export async function clearPayment(
  context: AuthContext,
  request: Request,
  loanId: string,
  monthKey: string,
) {
  return mutate(context, request, { loanId, monthKey }, async (db, session) => {
    const key = { ...owned(context), loanId, monthKey };
    const found = await db.collection('emi_payments').findOne(key, { session });
    if (!found) throw notFound();
    const payment = emiPaymentSchema.parse(found);
    if (payment.transactionId)
      await db
        .collection('transactions')
        .deleteOne(owned(context, payment.transactionId), { session });
    await db.collection('emi_payments').deleteOne(key, { session });
    return { loanId, monthKey };
  });
}

export async function addExtraPayment(
  context: AuthContext,
  request: Request,
  loanId: string,
  input: z.infer<typeof emiExtraPaymentInputSchema>,
) {
  return mutate(context, request, { loanId, ...input }, async (db, session) => {
    await loanFor(db, session, context, loanId);
    if (input.date > today(context))
      throw new ApiError(400, 'FUTURE_DEBT_EVENT', 'Only record a prepayment already made.');
    await enforceLimit(db, session, 'emi_extra_payments', context.user.id, 2000);
    const transactionId = await syncExpense(db, session, context, {
      existingId: null,
      amountMinor: input.amountMinor,
      accountId: input.accountId,
      categoryId: input.categoryId,
      note: 'EMI prepayment',
    });
    const payment = emiExtraPaymentSchema.parse({
      ...metadata(context),
      amountMinor: input.amountMinor,
      date: input.date,
      note: input.note,
      loanId,
      transactionId,
    });
    await db.collection('emi_extra_payments').insertOne({ ...payment }, { session });
    return payment;
  });
}

export async function deleteExtraPayment(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const found = await db
      .collection('emi_extra_payments')
      .findOne(owned(context, id), { session });
    if (!found) throw notFound();
    const payment = emiExtraPaymentSchema.parse(found);
    requireVersion(payment.version, version);
    if (payment.transactionId)
      await db
        .collection('transactions')
        .deleteOne(owned(context, payment.transactionId), { session });
    await db.collection('emi_extra_payments').deleteOne(owned(context, id), { session });
    return { id };
  });
}

export async function createIncomePeriod(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof emiIncomePeriodInputSchema>,
) {
  return mutate(context, request, input, async (db, session) => {
    await enforceLimit(db, session, 'emi_income_periods', context.user.id, 100);
    const period = emiIncomePeriodSchema.parse({ ...metadata(context), ...input });
    await db.collection('emi_income_periods').insertOne({ ...period }, { session });
    return period;
  });
}

export async function updateIncomePeriod(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof emiIncomePeriodUpdateSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const found = await db.collection('emi_income_periods').findOne(owned(context, id), {
      session,
    });
    if (!found) throw notFound();
    const period = emiIncomePeriodSchema.parse(found);
    requireVersion(period.version, input.version);
    const next = emiIncomePeriodSchema.parse({
      ...period,
      ...input,
      version: period.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await db
      .collection('emi_income_periods')
      .replaceOne({ ...owned(context, id), version: input.version }, { ...next }, { session });
    return next;
  });
}

export async function deleteIncomePeriod(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
) {
  return mutate(context, request, { id, version }, async (db, session) => {
    const found = await db.collection('emi_income_periods').findOne(owned(context, id), {
      session,
    });
    if (!found) throw notFound();
    requireVersion(emiIncomePeriodSchema.parse(found).version, version);
    await db.collection('emi_income_periods').deleteOne(owned(context, id), { session });
    return { id };
  });
}
