import { Decimal128 } from 'mongodb';
import {
  recurringRuleSchema,
  recurringOccurrenceSchema,
  transactionSchema,
  type recurringRuleInputSchema,
  type recurringRuleUpdateSchema,
  type occurrenceConfirmSchema,
} from '@finora/contracts';
import { calendarDate, nextOccurrence } from '@finora/finance-core';
import { owned, metadata, references } from './common';
import type { z } from 'zod';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { enforceLimit, mutate, notFound, requireVersion } from '../finance/mutation';

export async function listRules(context: AuthContext) {
  const { db } = await database();
  return (await db.collection('recurring_rules').find(owned(context)).limit(200).toArray()).map(
    (record) => recurringRuleSchema.parse(record),
  );
}
export async function saveRule(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof recurringRuleInputSchema> | z.infer<typeof recurringRuleUpdateSchema>,
  id?: string,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    await references(db, session, context, input);
    const collection = db.collection('recurring_rules');
    const previous = id ? await collection.findOne(owned(context, id), { session }) : null;
    if (id && !previous) throw notFound();
    if (previous && 'version' in input)
      requireVersion(recurringRuleSchema.parse(previous).version, input.version);
    if (!id) await enforceLimit(db, session, 'recurring_rules', context.user.id, 200);
    const record = recurringRuleSchema.parse({
      ...metadata(context),
      timezone: context.user.preferences.timezone,
      paused: false,
      nextIndex: 0,
      ...previous,
      ...input,
      amountMinor: input.amountMinor,
      version: previous ? Number(previous.version) + 1 : 1,
      updatedAt: new Date().toISOString(),
    });
    if (record.amountMinor === undefined) delete record.amountMinor;
    if (previous) await collection.replaceOne(owned(context, id), record, { session });
    else await collection.insertOne(record, { session });
    return record;
  });
}
export async function pauseRule(
  context: AuthContext,
  request: Request,
  id: string,
  version: number,
  paused: boolean,
) {
  return mutate(context, request, { id, version, paused }, async (db, session) => {
    const previous = await db
      .collection('recurring_rules')
      .findOne(owned(context, id), { session });
    if (!previous) throw notFound();
    requireVersion(recurringRuleSchema.parse(previous).version, version);
    const record = recurringRuleSchema.parse({
      ...previous,
      paused,
      version: version + 1,
      updatedAt: new Date().toISOString(),
    });
    await db
      .collection('recurring_rules')
      .replaceOne({ ...owned(context, id), version }, record, { session });
    return record;
  });
}
export async function generateOccurrences(context: AuthContext, request: Request) {
  return mutate(context, request, {}, async (db, session) => {
    const rules = await db
      .collection('recurring_rules')
      .find({ ...owned(context), paused: false }, { session })
      .limit(200)
      .toArray();
    const occurrences = [];
    let moreDue = false;
    for (const document of rules) {
      const rule = recurringRuleSchema.parse(document);
      const today = calendarDate(new Date(), rule.timezone);
      let index = rule.nextIndex;
      while (true) {
        const dueDate = nextOccurrence(rule.startDate, rule.frequency, index);
        if (dueDate > today || (rule.endDate && dueDate > rule.endDate)) break;
        if (occurrences.length >= 100) {
          moreDue = true;
          break;
        }
        await enforceLimit(db, session, 'recurring_occurrences', context.user.id, 10000);
        const record = recurringOccurrenceSchema.parse({
          ...metadata(context),
          ruleId: rule.id,
          ruleVersion: rule.version,
          dueDate,
          occurrenceIndex: index,
          timezone: rule.timezone,
          type: rule.type,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          amountMode: rule.amountMode,
          amountMinor: rule.amountMinor,
          status: 'PENDING',
        });
        if (record.amountMinor === undefined) delete record.amountMinor;
        await db.collection('recurring_occurrences').insertOne(record, { session });
        occurrences.push(record);
        index++;
      }
      if (index !== rule.nextIndex)
        await db.collection('recurring_rules').updateOne(
          { ...owned(context, rule.id), version: rule.version },
          {
            $set: { nextIndex: index, updatedAt: new Date().toISOString() },
            $inc: { version: 1 },
          },
          { session },
        );
    }
    return { occurrences, moreDue };
  });
}
export async function listOccurrences(context: AuthContext, status?: 'PENDING' | 'POSTED') {
  const { db } = await database();
  return (
    await db
      .collection('recurring_occurrences')
      .find({ ...owned(context), ...(status ? { status } : {}) })
      .sort({ dueDate: -1, id: 1 })
      .limit(100)
      .toArray()
  ).map((record) => recurringOccurrenceSchema.parse(record));
}
export async function confirmOccurrence(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof occurrenceConfirmSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const document = await db
      .collection('recurring_occurrences')
      .findOne(owned(context, id), { session });
    if (!document) throw notFound();
    const occurrence = recurringOccurrenceSchema.parse(document);
    requireVersion(occurrence.version, input.version);
    if (occurrence.status !== 'PENDING')
      throw new ApiError(409, 'ALREADY_POSTED', 'This occurrence already has a transaction.');
    if (occurrence.amountMode === 'FIXED' && occurrence.amountMinor !== input.amountMinor)
      throw new ApiError(400, 'FIXED_AMOUNT', 'Confirm the fixed amount shown on this occurrence.');
    if (calendarDate(new Date(input.date), occurrence.timezone) !== occurrence.dueDate)
      throw new ApiError(
        400,
        'OCCURRENCE_DATE',
        'The timestamp must fall on the occurrence date in its timezone.',
      );
    await references(db, session, context, occurrence);
    await enforceLimit(db, session, 'transactions', context.user.id, 10000);
    const transaction = transactionSchema.parse({
      ...metadata(context),
      type: occurrence.type,
      accountId: occurrence.accountId,
      categoryId: occurrence.categoryId,
      amountMinor: input.amountMinor,
      date: new Date(input.date).toISOString(),
      merchant: '',
      note: '',
      tags: [],
    });
    await db
      .collection('transactions')
      .insertOne(
        { ...transaction, amountSort: Decimal128.fromString(transaction.amountMinor) },
        { session },
      );
    const record = recurringOccurrenceSchema.parse({
      ...occurrence,
      status: 'POSTED',
      transactionId: transaction.id,
      amountMinor: input.amountMinor,
      version: occurrence.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await db
      .collection('recurring_occurrences')
      .replaceOne({ ...owned(context, id), version: input.version }, record, { session });
    return { occurrence: record, transaction };
  });
}
