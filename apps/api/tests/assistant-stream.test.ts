import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { assistantPolicyVersion, assistantStreamEventSchema } from '@finora/contracts';
import { POST } from '../app/api/v1/[...path]/route';
import { clearDatabase, setupDatabase, teardownDatabase } from './setup';
import { fixture } from './advanced-fixtures';
import { database } from '../src/database/client';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const tool = (name: string, args: unknown, id = name) => ({
  type: 'function_call',
  name,
  call_id: id,
  arguments: JSON.stringify(args),
});
async function stream(token: string, question: string) {
  return POST(
    new Request('http://localhost:3000/api/v1/assistant/v3/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({
        question,
        previousQuestions: [],
        acceptedPolicyVersion: assistantPolicyVersion,
      }),
    }),
  );
}
function events(text: string) {
  return text
    .trim()
    .split('\n')
    .map((line) => assistantStreamEventSchema.parse(JSON.parse(line)));
}
it('streams real tool activity through chained reads and reserves one daily message', async () => {
  const { token, account } = await fixture();
  vi.stubEnv('ASSISTANT_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-openai-key');
  let round = 0;
  const upstream = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (!body.tools)
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ reply: 'Here are your balance and spending.' }),
              },
            ],
          },
        ],
      });
    const call =
      round++ === 0
        ? tool('get_balance', { accountId: null })
        : round === 2
          ? tool('get_cashflow', { from: '2026-10-01', to: '2026-10-29' })
          : tool('finish_answer', {});
    return Response.json({ status: 'completed', output: [call] });
  });
  vi.stubGlobal('fetch', upstream);
  const response = await stream(token, 'What is my balance and spending?');
  expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  const output = events(await response.text());
  expect(
    output
      .filter((event) => event.type === 'progress' && event.progress.state === 'checked')
      .map((event) => event.type === 'progress' && event.progress.label),
  ).toEqual(['accounts', 'income and spending']);
  const last = output.at(-1)!;
  expect(last.type).toBe('answer');
  if (last.type === 'answer') {
    expect(last.answer.result?.name).toBe('get_balance');
    expect(last.answer.additionalResults[0]?.name).toBe('get_cashflow');
  }
  const { db } = await database();
  expect((await db.collection('assistant_usage').findOne({ userId: account.userId }))?.count).toBe(
    1,
  );
  expect(await db.collection('transactions').countDocuments()).toBe(0);
  expect(JSON.stringify(upstream.mock.calls)).not.toContain(token);
});
it('prepares multiple transactions without writing any of them', async () => {
  const { token } = await fixture();
  vi.stubEnv('ASSISTANT_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-openai-key');
  const args = {
    type: 'EXPENSE',
    amount: '10',
    currency: null,
    date: null,
    accountName: null,
    destinationAccountName: null,
    categoryName: 'Food',
    merchant: null,
    note: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        status: 'completed',
        output: [
          tool('prepare_transaction', args, 'first'),
          tool('prepare_transaction', { ...args, amount: '20' }, 'second'),
        ],
      }),
    ),
  );
  const output = events(
    await (await stream(token, 'Spent 10 on breakfast and 20 on lunch')).text(),
  );
  const last = output.at(-1)!;
  expect(last.type).toBe('answer');
  if (last.type === 'answer') {
    expect(last.answer.prepared).toHaveLength(2);
    expect(last.answer.prepared.map((entry) => entry.draft?.amountMinor)).toEqual(['1000', '2000']);
  }
  expect(await (await database()).db.collection('transactions').countDocuments()).toBe(0);
});
