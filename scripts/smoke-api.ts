import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  accountSchema,
  budgetSchema,
  budgetStatusSchema,
  categorySchema,
  goalProgressSchema,
  goalSchema,
  overviewSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  reportSummarySchema,
  sessionTokensSchema,
  transactionSchema,
} from '../packages/contracts/src/index';
import { calendarDate } from '../packages/finance-core/src/index';

const origin = process.env.API_SMOKE_URL;
if (
  !origin ||
  !['localhost', '127.0.0.1'].includes(new URL(origin).hostname) ||
  process.env.ALLOW_DEV_SMOKE !== '1'
)
  throw new Error('Explicit local development smoke URL and ALLOW_DEV_SMOKE=1 are required.');
const password = randomBytes(32).toString('base64url');
const email = `smoke-${randomUUID()}@example.invalid`;
let accessToken: string | undefined;
async function call(method: string, route: string, body?: unknown, operation = false) {
  const response = await fetch(`${origin}/api/v1/${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(operation ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code: string };
  };
  if (!response.ok || !json.success)
    throw new Error(
      `HTTP smoke failed at ${method} ${route.split('?')[0]}: ${response.status} ${json.error?.code ?? 'INVALID_RESPONSE'}`,
    );
  return json.data;
}
try {
  const registration = sessionTokensSchema.parse(
    await call('POST', 'auth/register', {
      email,
      password,
      name: 'Disposable development smoke test',
    }),
  );
  accessToken = registration.accessToken;
  const cash = accountSchema.parse(
    await call('POST', 'accounts', { name: 'Smoke cash', type: 'CASH' }, true),
  );
  const savings = accountSchema.parse(
    await call('POST', 'accounts', { name: 'Smoke savings', type: 'SAVINGS' }, true),
  );
  const income = categorySchema.parse(
    await call('POST', 'categories', { name: 'Smoke income', type: 'INCOME' }, true),
  );
  const expense = categorySchema.parse(
    await call('POST', 'categories', { name: 'Smoke expense', type: 'EXPENSE' }, true),
  );
  const date = new Date().toISOString();
  transactionSchema.parse(
    await call(
      'POST',
      'transactions',
      { type: 'INCOME', accountId: cash.id, categoryId: income.id, amountMinor: '10000', date },
      true,
    ),
  );
  const recordedExpense = transactionSchema.parse(
    await call(
      'POST',
      'transactions',
      { type: 'EXPENSE', accountId: cash.id, categoryId: expense.id, amountMinor: '2500', date },
      true,
    ),
  );
  transactionSchema.parse(
    await call(
      'POST',
      'transactions',
      {
        type: 'TRANSFER',
        accountId: cash.id,
        destinationAccountId: savings.id,
        amountMinor: '3000',
        date,
      },
      true,
    ),
  );
  const day = calendarDate(new Date(date), registration.user.preferences.timezone);
  const month = day.slice(0, 7);
  const overviewRoute = `reports/overview?month=${month}`;
  const summaryRoute = `reports/summary?range=custom&from=${day}&to=${day}`;
  const budget = budgetSchema.parse(
    await call('POST', 'budgets', { categoryId: expense.id, month, amountMinor: '5000' }, true),
  );
  async function budgetProgress() {
    const budgets = budgetStatusSchema.array().parse(await call('GET', `budgets?month=${month}`));
    const progress = budgets.find((item) => item.id === budget.id);
    assert.ok(progress);
    return progress;
  }
  const report = overviewSchema.parse(await call('GET', overviewRoute));
  assert.equal(report.totalBalanceMinor, '7500');
  assert.equal(report.incomeMinor, '10000');
  assert.equal(report.expensesMinor, '2500');
  assert.equal(report.accounts.find((account) => account.id === savings.id)?.balanceMinor, '3000');
  const firstBudget = await budgetProgress();
  assert.equal(firstBudget.spentMinor, '2500');
  assert.equal(firstBudget.remainingMinor, '2500');
  assert.equal(firstBudget.warningReached, false);
  const firstSummary = reportSummarySchema.parse(await call('GET', summaryRoute));
  assert.equal(firstSummary.cashflow.incomeMinor, '10000');
  assert.equal(firstSummary.cashflow.expensesMinor, '2500');
  assert.equal(firstSummary.cashflow.netMinor, '7500');
  assert.equal(
    firstSummary.categories.find((item) => item.categoryId === expense.id)?.amountMinor,
    '2500',
  );
  assert.equal(
    firstSummary.accounts.find((item) => item.accountId === savings.id)?.transferInMinor,
    '3000',
  );

  const editedExpense = transactionSchema.parse(
    await call(
      'PATCH',
      `transactions/${recordedExpense.id}`,
      {
        type: 'EXPENSE',
        accountId: cash.id,
        categoryId: expense.id,
        amountMinor: '4000',
        date,
        version: recordedExpense.version,
      },
      true,
    ),
  );
  const editedReport = overviewSchema.parse(await call('GET', overviewRoute));
  assert.equal(editedReport.totalBalanceMinor, '6000');
  assert.equal(editedReport.expensesMinor, '4000');
  assert.equal(editedReport.accounts.find((item) => item.id === cash.id)?.balanceMinor, '3000');
  const editedBudget = await budgetProgress();
  assert.equal(editedBudget.spentMinor, '4000');
  assert.equal(editedBudget.remainingMinor, '1000');
  assert.equal(editedBudget.warningReached, true);
  const editedSummary = reportSummarySchema.parse(await call('GET', summaryRoute));
  assert.equal(editedSummary.cashflow.netMinor, '6000');
  assert.equal(
    editedSummary.categories.find((item) => item.categoryId === expense.id)?.amountMinor,
    '4000',
  );

  await call(
    'DELETE',
    `transactions/${editedExpense.id}`,
    { version: editedExpense.version, confirmation: 'DELETE' },
    true,
  );
  const afterDelete = overviewSchema.parse(await call('GET', overviewRoute));
  assert.equal(afterDelete.totalBalanceMinor, '10000');
  assert.equal(afterDelete.expensesMinor, '0');
  assert.equal(afterDelete.accounts.find((item) => item.id === cash.id)?.balanceMinor, '7000');
  const clearedBudget = await budgetProgress();
  assert.equal(clearedBudget.spentMinor, '0');
  assert.equal(clearedBudget.remainingMinor, '5000');
  assert.equal(clearedBudget.warningReached, false);
  const deletedSummary = reportSummarySchema.parse(await call('GET', summaryRoute));
  assert.equal(deletedSummary.cashflow.expensesMinor, '0');
  assert.equal(deletedSummary.cashflow.netMinor, '10000');
  assert.equal(
    deletedSummary.accounts.reduce((total, item) => total + BigInt(item.closingBalanceMinor), 0n),
    10000n,
  );

  const goal = goalSchema.parse(
    await call('POST', 'goals', { name: 'Disposable smoke goal', targetMinor: '10000' }, true),
  );
  await call(
    'POST',
    `goals/${goal.id}/contributions`,
    { amountMinor: '1500', date: day, version: goal.version },
    true,
  );
  const progress = goalProgressSchema.parse(await call('GET', `goals/${goal.id}`));
  assert.equal(progress.savedMinor, '1500');
  assert.equal(progress.remainingMinor, '8500');
  assert.equal(overviewSchema.parse(await call('GET', overviewRoute)).totalBalanceMinor, '10000');

  const rule = recurringRuleSchema.parse(
    await call(
      'POST',
      'recurring',
      {
        name: 'Disposable smoke reminder',
        type: 'EXPENSE',
        accountId: cash.id,
        categoryId: expense.id,
        amountMode: 'FIXED',
        amountMinor: '100',
        postingPolicy: 'CONFIRM_EACH',
        startDate: day,
        endDate: day,
        frequency: 'MONTHLY',
      },
      true,
    ),
  );
  await call('POST', 'recurring/generate', {}, true);
  const pending = recurringOccurrenceSchema
    .array()
    .parse(await call('GET', 'recurring-occurrences?status=PENDING'));
  const occurrence = pending.find((item) => item.ruleId === rule.id);
  assert.ok(occurrence);
  assert.equal(overviewSchema.parse(await call('GET', overviewRoute)).totalBalanceMinor, '10000');
  await call(
    'POST',
    `recurring-occurrences/${occurrence.id}/confirm`,
    { version: occurrence.version, amountMinor: '100', date },
    true,
  );
  assert.equal(overviewSchema.parse(await call('GET', overviewRoute)).totalBalanceMinor, '9900');
  const posted = recurringOccurrenceSchema
    .array()
    .parse(await call('GET', 'recurring-occurrences?status=POSTED'))
    .find((item) => item.id === occurrence.id);
  assert.ok(posted?.transactionId);
  const postedTransaction = transactionSchema.parse(
    await call('GET', `transactions/${posted.transactionId}`),
  );
  await call(
    'DELETE',
    `transactions/${postedTransaction.id}`,
    { version: postedTransaction.version, confirmation: 'DELETE' },
    true,
  );
  const reopened = recurringOccurrenceSchema
    .array()
    .parse(await call('GET', 'recurring-occurrences?status=PENDING'))
    .find((item) => item.id === occurrence.id);
  assert.ok(reopened);
  assert.equal(reopened.transactionId, undefined);
  assert.equal(overviewSchema.parse(await call('GET', overviewRoute)).totalBalanceMinor, '10000');
  assert.equal((await budgetProgress()).spentMinor, '0');

  await call('POST', 'auth/logout');
  accessToken = undefined;
  const login = sessionTokensSchema.parse(await call('POST', 'auth/login', { email, password }));
  accessToken = login.accessToken;
  assert.equal(overviewSchema.parse(await call('GET', overviewRoute)).totalBalanceMinor, '10000');
  assert.equal(goalProgressSchema.parse(await call('GET', `goals/${goal.id}`)).savedMinor, '1500');
  assert.equal((await budgetProgress()).spentMinor, '0');
  assert.equal(
    reportSummarySchema.parse(await call('GET', summaryRoute)).cashflow.netMinor,
    '10000',
  );
  console.info(
    'Live HTTP smoke passed: registration, accounts, transfers, budget spending, expense edit/delete, report recalculation, savings contributions, confirmed recurrence and persistence after relogin.',
  );
} catch {
  console.error('Live HTTP smoke failed. No credentials or financial content were logged.');
  process.exitCode = 1;
} finally {
  if (accessToken) {
    try {
      await call('DELETE', 'auth/account', { password, confirmation: 'DELETE' });
      console.info('Only the smoke-created account and its disposable records were removed.');
    } catch {
      console.error('Smoke cleanup failed; the disposable test account may remain.');
      process.exitCode = 1;
    }
  }
}
