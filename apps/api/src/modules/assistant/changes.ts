import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  currencySchema,
  assistantChangeArgsSchema,
  assistantChangeSchema,
  settingsUpdateSchema,
  type AssistantChange,
} from '@finora/contracts';
import { calendarDate, parseMoney, formatMoney, entryDate } from '@finora/finance-core';
import { database } from '../../database/client';
import { getEnv } from '../../config/env';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { operationCatalog } from './operation-catalog';
import { financeRoute } from '../finance/router';
import { advancedRoute } from '../advanced/router';
import { debtsRoute } from '../debts/router';
import { emiRoute } from '../emi/router';

const signedSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    authVersion: z.number().int(),
    settingsVersion: z.number().int(),
    operation: assistantChangeArgsSchema.shape.operation,
    target: z.uuid().nullable(),
    parent: z.uuid().nullable(),
    body: z.record(z.string(), z.unknown()),
    expires: z.number().int(),
  })
  .strict();
const signature = (payload: string) =>
  createHmac('sha256', getEnv().RATE_LIMIT_SECRET)
    .update(`assistant-confirm-v1|${payload}`)
    .digest('base64url');
const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
const aliases: Record<string, string> = {
  amount: 'amountMinor',
  monthlyAmount: 'monthlyAmountMinor',
  principalRemaining: 'principalRemainingMinor',
  openingBalance: 'openingBalanceMinor',
  target: 'targetMinor',
  account: 'accountId',
  destination: 'destinationAccountId',
  category: 'categoryId',
  warningThresholdPercent: 'warningThresholdBasisPoints',
};
const reverseAliases = Object.fromEntries(Object.entries(aliases).map(([a, b]) => [b, a]));
const labels: Record<string, string> = {
  amountMinor: 'Amount',
  openingBalanceMinor: 'Starting balance',
  targetMinor: 'Savings target',
  accountId: 'Account',
  destinationAccountId: 'Destination account',
  categoryId: 'Category',
  name: 'Name',
  type: 'Type',
  date: 'Date',
  startDate: 'Starts on',
  endDate: 'Ends on',
  targetDate: 'Target date',
  dueDate: 'Due date',
  month: 'Month',
  amountMode: 'Amount type',
  frequency: 'Frequency',
  archived: 'Archived',
  paused: 'Paused',
  direction: 'Borrowed or lent',
  kind: 'Debt or receipt type',
  baseCurrency: 'Currency',
  preferredTheme: 'Appearance',
  accentColor: 'Theme colour',
  keepDebtSeparate: 'Keep debt separate',
  firstDayOfWeek: 'First day of week',
  preferredDateFormat: 'Date format',
  warningThresholdBasisPoints: 'Warning threshold',
  monthlyAmountMinor: 'Monthly EMI',
  principalRemainingMinor: 'Principal outstanding',
  startMonth: 'First month',
  endMonth: 'Last month',
  dueDay: 'Due day',
  loanTag: 'Loan size',
  interestRatePct: 'Interest rate (%)',
  isActive: 'Active',
  postingPolicy: 'Posting policy',
};
const label = (key: string) =>
  labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
type RecordValue = Record<string, unknown> & { id: string };
async function records(
  context: AuthContext,
  collection: string,
  parentField?: string,
  parent?: string,
) {
  const { db } = await database();
  return (await db
    .collection(collection)
    .find(
      {
        userId: context.user.id,
        ...(parentField ? { [parentField]: parent } : {}),
        ...(collection === 'debt_events'
          ? { kind: 'REPAYMENT', reversedAt: { $exists: false } }
          : {}),
      },
      { projection: { _id: 0 } },
    )
    .limit(10001)
    .toArray()) as unknown as RecordValue[];
}
const recordTitle = (r: RecordValue) =>
  String(r.name ?? r.merchant ?? r.month ?? r.monthKey ?? r.date ?? r.dueDate ?? r.kind ?? r.id) ||
  r.id;
const recordLabel = (r: RecordValue) =>
  [
    recordTitle(r),
    r.date ?? r.dueDate,
    r.amountMinor
      ? formatMoney(String(r.amountMinor), currencySchema.parse(r.currency), 'en-IN')
      : undefined,
    r.id.slice(0, 8),
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 240);
const match = (rows: RecordValue[], selector: string | null) => {
  const matches = selector
    ? rows.filter(
        (r) =>
          normalize(r.id) === normalize(selector) ||
          normalize(recordTitle(r)) === normalize(selector),
      )
    : [];
  return matches.length === 1 ? matches[0] : undefined;
};
export async function prepareChange(
  context: AuthContext,
  value: unknown,
): Promise<AssistantChange> {
  const input = assistantChangeArgsSchema.parse(value);
  const spec = operationCatalog[input.operation];
  const questions: AssistantChange['questions'] = [];
  const id = randomUUID();
  const askRecord = (key: string, rows: RecordValue[], text: string) =>
    questions.push({
      key,
      label: text,
      options: rows.slice(0, 200).map((r) => ({ value: r.id, label: recordLabel(r) })),
    });
  let parent: RecordValue | undefined;
  let target: RecordValue | undefined;
  if (spec.parentCollection) {
    const candidates = await records(context, spec.parentCollection);
    parent = match(candidates, input.parent);
    if (!parent)
      askRecord(
        'parent',
        candidates,
        spec.parentCollection === 'debts'
          ? 'Which debt or expected receipt?'
          : spec.parentCollection === 'emi_loans'
            ? 'Which loan or EMI?'
            : 'Which savings goal?',
      );
  }
  if (spec.collection && (!spec.parentCollection || parent)) {
    const candidates = await records(context, spec.collection, spec.parentField, parent?.id);
    target = match(candidates, input.record);
    if (!target) askRecord('record', candidates, 'Which recorded item should I change?');
  }
  const properties =
    (
      z.toJSONSchema(spec.schema) as {
        properties?: Record<string, { enum?: unknown[]; type?: string; default?: unknown }>;
      }
    ).properties ?? {};
  const source =
    input.operation === 'update_preferences' ? context.user.preferences : (target ?? {});
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(properties))
    if (key in source) body[key] = (source as Record<string, unknown>)[key];
  if (properties.version) body.version = parent?.version ?? target?.version;
  Object.assign(body, spec.preset);
  if (properties.confirmation && !body.confirmation) body.confirmation = 'DELETE';
  const references = new Map<string, string>();
  const { baseCurrency: currency, timezone } = context.user.preferences;
  const questionKeys = new Set<string>();
  const suppliedType = input.values.find((v) => v.field === 'type')?.value;
  if (suppliedType && properties.type) body.type = suppliedType;
  for (const { field, value: text } of input.values) {
    const key = aliases[field] ?? field;
    if (!(key in properties))
      throw new ApiError(
        400,
        'INVALID_DRAFT_FIELD',
        `${label(key)} is not used by this action. Please describe the change again.`,
      );
    if (['accountId', 'destinationAccountId', 'categoryId'].includes(key)) {
      const candidates = (
        await records(context, key === 'categoryId' ? 'categories' : 'accounts')
      ).filter((r) => !r.archived && (key !== 'categoryId' || !body.type || r.type === body.type));
      const reference = match(candidates, text);
      if (reference) {
        body[key] = reference.id;
        references.set(key, recordTitle(reference));
      } else {
        askRecord(field, candidates, `Which ${label(key).toLowerCase()}?`);
        questionKeys.add(key);
      }
      continue;
    }
    if (key === 'principalRemainingMinor' && /^(none|null|clear|)$/i.test(text.trim()))
      body[key] = null;
    else if (key.endsWith('Minor')) {
      try {
        body[key] = parseMoney(text, currency);
      } catch {
        questions.push({
          key: field,
          label: `Enter a valid ${label(key).toLowerCase()} in ${currency}.`,
          options: [],
        });
        questionKeys.add(key);
      }
    } else if (key === 'warningThresholdBasisPoints') {
      try {
        body[key] = Number(parseMoney(text, 'USD'));
      } catch {
        body[key] = null;
      }
    } else if (['rollover', 'copyRollover'].includes(key))
      body[key] =
        text.toLowerCase() === 'true' ? true : text.toLowerCase() === 'false' ? false : text;
    else if (key === 'firstDayOfWeek' || key === 'dueDay') body[key] = Number(text);
    else if (key === 'interestRatePct')
      body[key] = /^(none|null|no|)$/i.test(text.trim()) ? null : Number(text);
    else if (key === 'endMonth')
      body[key] = /^(none|null|ongoing|no end|)$/i.test(text.trim()) ? null : text.trim();
    else if (key === 'tags')
      body[key] = text
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    else body[key] = text;
  }
  // Default dates are visible in the review; no category/account is ever fabricated.
  if (properties.date && !body.date) body.date = calendarDate(new Date(), timezone);
  if (
    (input.operation === 'create_transaction' ||
      input.operation === 'update_transaction' ||
      input.operation === 'confirm_occurrence') &&
    typeof body.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.date)
  )
    try {
      Object.assign(body, entryDate(body.date, timezone));
    } catch {
      /* Schema validation asks for a valid date below. */
    }
  if (body.type === 'TRANSFER') delete body.categoryId;
  if (input.operation === 'confirm_occurrence') delete body.datePrecision;
  if (input.operation === 'set_monthly_budget' && typeof body.month === 'string') {
    const { db } = await database();
    const existing = await db
      .collection('monthly_budget_limits')
      .findOne({ userId: context.user.id, month: body.month });
    if (existing) body.version = existing.version;
  }
  if (
    ['pay_emi', 'add_emi_prepayment'].includes(input.operation) &&
    !context.user.preferences.keepDebtSeparate
  )
    for (const key of ['accountId', 'categoryId'] as const)
      if (!body[key] && !questionKeys.has(key)) {
        const rows = (
          await records(context, key === 'categoryId' ? 'categories' : 'accounts')
        ).filter((r) => !r.archived && (key !== 'categoryId' || r.type === 'EXPENSE'));
        askRecord(
          reverseAliases[key]!,
          rows,
          `Which ${label(key).toLowerCase()} was it paid from?`,
        );
        questionKeys.add(key);
      }
  const parsed = spec.schema.safeParse(body);
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (
        key === 'version' ||
        questionKeys.has(key) ||
        questions.some((q) => q.key === (reverseAliases[key] ?? key))
      )
        continue;
      questionKeys.add(key);
      let options: { value: string; label: string }[] = (properties[key]?.enum ?? []).map((v) => ({
        value: String(v),
        label: String(v),
      }));
      if (key === 'direction')
        options = ['BORROWED', 'LENT'].map((value) => ({
          value,
          label: value === 'BORROWED' ? 'I borrowed' : 'I lent / expect a receipt',
        }));
      if (['accountId', 'destinationAccountId', 'categoryId'].includes(key))
        options = (await records(context, key === 'categoryId' ? 'categories' : 'accounts'))
          .filter(
            (r) => !r.archived && (key !== 'categoryId' || !body.type || r.type === body.type),
          )
          .slice(0, 200)
          .map((r) => ({ value: r.id, label: recordTitle(r) }));
      questions.push({
        key: reverseAliases[key] ?? key,
        label:
          key === 'form' ? issue.message : `What should I use for ${label(key).toLowerCase()}?`,
        options,
      });
    }
  const rows: AssistantChange['rows'] = [];
  if (parent) rows.push({ label: 'For', value: recordLabel(parent) });
  if (target) rows.push({ label: 'Record', value: recordLabel(target) });
  const changed = new Set(input.values.map((v) => aliases[v.field] ?? v.field));
  for (const [key, entry] of Object.entries(
    parsed.success ? (parsed.data as Record<string, unknown>) : body,
  )) {
    if (
      ['version', 'icon', 'color', 'postingPolicy', 'confirmation'].includes(key) ||
      entry === undefined ||
      (target && !changed.has(key) && !(key in (spec.preset ?? {})))
    )
      continue;
    const display =
      key === 'amountMinor' && entry === null
        ? 'Full EMI'
        : entry === null
          ? 'None'
          : key.endsWith('Minor') && typeof entry === 'string'
            ? formatMoney(entry, currency, context.user.preferences.locale)
            : (references.get(key) ?? (Array.isArray(entry) ? entry.join(', ') : String(entry)));
    rows.push({ label: label(key), value: display.slice(0, 1200) });
  }
  let token: string | null = null;
  if (parsed.success && !questions.length) {
    let finalBody = parsed.data as Record<string, unknown>;
    if (input.operation === 'update_preferences')
      finalBody = settingsUpdateSchema.parse({
        preferences: finalBody,
        version: context.user.settingsVersion,
      });
    const payload = Buffer.from(
      JSON.stringify(
        signedSchema.parse({
          id,
          ownerId: context.user.id,
          authVersion: context.user.authVersion,
          settingsVersion: context.user.settingsVersion,
          operation: input.operation,
          target: target?.id ?? null,
          parent: parent?.id ?? null,
          body: finalBody,
          expires: Date.now() + 600000,
        }),
      ),
    ).toString('base64url');
    token = `${payload}.${signature(payload)}`;
  }
  return assistantChangeSchema.parse({
    id,
    input,
    title: spec.title,
    impact: spec.impact,
    rows,
    questions,
    token,
    requiresConfirmation: true,
  });
}
export async function confirmChange(context: AuthContext, request: Request, token: string) {
  const parts = token.split('.');
  const [encoded = '', supplied = ''] = parts;
  const expected = signature(encoded);
  if (
    parts.length !== 2 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    throw new ApiError(400, 'INVALID_CONFIRMATION', 'Review the change again before confirming.');
  let value: z.infer<typeof signedSchema>;
  try {
    value = signedSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError(400, 'INVALID_CONFIRMATION', 'Review the change again before confirming.');
  }
  if (value.ownerId !== context.user.id || value.authVersion !== context.user.authVersion)
    throw new ApiError(403, 'INVALID_CONFIRMATION', 'This review belongs to another session.');
  if (value.expires < Date.now())
    throw new ApiError(409, 'REVIEW_EXPIRED', 'This review expired. Prepare the change again.');
  const { db } = await database();
  if (await db.collection('idempotency_records').findOne({ userId: context.user.id, id: value.id }))
    return { id: value.id, message: 'Saved.' };
  if (context.user.settingsVersion !== value.settingsVersion)
    throw new ApiError(409, 'REVIEW_CHANGED', 'Your preferences changed. Review the action again.');
  const spec = operationCatalog[value.operation];
  const body =
    value.operation === 'update_preferences'
      ? settingsUpdateSchema.parse(value.body)
      : spec.schema.parse(value.body);
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Idempotency-Key', value.id);
  headers.delete('content-length');
  const sent = { ...(body as Record<string, unknown>) };
  for (const key of spec.strip ?? []) delete sent[key];
  const action = new Request(
    new URL(
      `/api/v1/${spec.path(value.target ?? '', value.parent ?? '', body as Record<string, unknown>)}`,
      request.url,
    ),
    {
      method: spec.method,
      headers,
      body:
        spec.method === 'DELETE' && !Object.keys(sent).length ? undefined : JSON.stringify(sent),
      signal: request.signal,
    },
  );
  const response =
    (await financeRoute(action, value.id)) ??
    (await advancedRoute(action, value.id)) ??
    (await debtsRoute(action, value.id)) ??
    (await emiRoute(action, value.id));
  if (!response) throw new ApiError(400, 'INVALID_ACTION', 'This action is not available.');
  if (!response.ok) return response;
  return { id: value.id, message: 'Saved.' };
}
