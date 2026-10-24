import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { assistantChatResponseSchema, assistantPolicyVersion } from '@finora/contracts';
import {
  call,
  clearDatabase,
  createUser,
  password,
  setupDatabase,
  teardownDatabase,
} from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { database } from '../src/database/client';
import { selectAssistantTool } from '../src/modules/assistant/provider';

beforeAll(setupDatabase);
beforeEach(async () => {
  await clearDatabase();
  vi.stubEnv('ASSISTANT_ENABLED', 'false');
  vi.stubEnv('OPENAI_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(teardownDatabase);

const input = {
  question: 'What is my current balance?',
  previousQuestions: [],
  acceptedPolicyVersion: assistantPolicyVersion,
};
function enable() {
  vi.stubEnv('ASSISTANT_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-openai-key');
}
const toolOutput = (name = 'get_balance', args: unknown = { accountId: null }) => ({
  status: 'completed',
  output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'test-call' }],
});

it('stays disabled without configuration and requires explicit policy consent before contacting OpenAI', async () => {
  const { accessToken: token } = await createUser();
  const upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
  expect(data(await call('GET', 'assistant/v3/capabilities', undefined, token))).toMatchObject({
    enabled: false,
    readOnly: false,
  });
  expect((await call('POST', 'assistant/v3/chat', input, token)).status).toBe(503);
  enable();
  expect(
    (
      await call(
        'POST',
        'assistant/v3/chat',
        { question: input.question, previousQuestions: [] },
        token,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        'assistant/v3/chat',
        { ...input, previousQuestions: ['a', 'b', 'c', 'd'] },
        token,
      )
    ).status,
  ).toBe(400);
  expect(
    (await call('POST', 'assistant/v3/chat', { ...input, question: 'x'.repeat(1001) }, token))
      .status,
  ).toBe(400);
  expect((await call('POST', 'assistant/v3/chat', input)).status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});

it('uses one Luna request to select a tool and keeps identity and financial results out of OpenAI', async () => {
  const { token, account } = await fixture();
  await call(
    'PATCH',
    `accounts/${account.id}`,
    {
      name: 'Private account',
      type: account.type,
      icon: account.icon,
      color: account.color,
      openingBalanceMinor: '900719925474099301',
      version: account.version,
      archived: false,
    },
    token,
    headers(),
  );
  enable();
  const upstream = vi.fn(async () => Response.json(toolOutput()));
  vi.stubGlobal('fetch', upstream);
  const reply = await call('POST', 'assistant/v3/chat', input, token);
  expect(reply.status).toBe(200);
  const answer = assistantChatResponseSchema.parse(data(reply));
  expect(answer).toMatchObject({
    kind: 'answer',
    result: { name: 'get_balance', data: { totalBalanceMinor: '900719925474099301' } },
  });
  expect(upstream).toHaveBeenCalledTimes(2);
  const request = (upstream.mock.calls as unknown as [string, RequestInit][])[0]!;
  expect(request[0]).toBe('https://api.openai.com/v1/responses');
  const body = JSON.parse(String(request[1].body)) as Record<string, unknown>;
  expect(body).toMatchObject({
    model: 'gpt-6-luna',
    store: false,
    parallel_tool_calls: false,
    tool_choice: 'required',
    max_output_tokens: 512,
  });
  expect(body.input).toEqual([{ role: 'user', content: input.question }]);
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'Private account',
    '900719925474099301',
    account.userId,
    token,
    'function_call_output',
  ])
    expect(serialized).not.toContain(forbidden);
  expect(reply.headers.get('cache-control')).toBe('no-store');
});

it('uses fixed clarification and unsupported answers rather than model-authored financial claims', async () => {
  const { accessToken: token } = await createUser();
  enable();
  const upstream = vi.fn(async () =>
    Response.json(toolOutput('ask_follow_up', { reason: 'unsupported' })),
  );
  vi.stubGlobal('fetch', upstream);
  const answer = assistantChatResponseSchema.parse(
    data(
      await call(
        'POST',
        'assistant/v3/chat',
        { ...input, question: 'Transfer 500 to another account' },
        token,
      ),
    ),
  );
  expect(answer).toMatchObject({ kind: 'unsupported', result: null });
  expect(answer.message).toContain('recorded accounts');
  upstream.mockImplementation(async () =>
    Response.json(toolOutput('ask_follow_up', { reason: 'date_range' })),
  );
  expect(
    data(
      await call(
        'POST',
        'assistant/v3/chat',
        { ...input, question: 'What did I spend then?' },
        token,
      ),
    ),
  ).toMatchObject({ kind: 'clarification', result: null });
});

it('rejects unknown, multiple, invented and unstructured model outputs without leaking upstream text', async () => {
  const { accessToken: token } = await createUser();
  enable();
  const upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
  const bad = [
    toolOutput('delete_transaction', {}),
    toolOutput('get_balance', { accountId: null, userId: 'other-owner' }),
    { status: 'completed', output: [...toolOutput().output, ...toolOutput().output] },
    { status: 'completed', output: [{ type: 'message', content: 'Your balance is invented.' }] },
    { status: 'incomplete', output: toolOutput().output },
    toolOutput('get_cashflow', { from: '2026-02-30', to: '2026-03-01' }),
  ];
  for (const output of bad) {
    upstream.mockResolvedValueOnce(Response.json(output));
    const response = await call('POST', 'assistant/v3/chat', input, token);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.json)).not.toContain('invented');
  }
  upstream.mockResolvedValueOnce(new Response('sensitive provider error text', { status: 401 }));
  const response = await call('POST', 'assistant/v3/chat', input, token);
  expect(response.status).toBe(503);
  expect(JSON.stringify(response.json)).not.toContain('sensitive');
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments()).toBe(0);
});

it('rechecks the session after the model call before reading any financial records', async () => {
  const { accessToken: token } = await createUser();
  enable();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      expect((await call('POST', 'auth/logout', {}, token)).status).toBe(200);
      return Response.json(toolOutput());
    }),
  );
  expect((await call('POST', 'assistant/v3/chat', input, token)).status).toBe(401);
});

it('bounds the provider deadline and discards an oversized upstream response', async () => {
  enable();
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ),
  );
  try {
    const selection = selectAssistantTool(input.question, [], {
      timezone: 'Asia/Kolkata',
      baseCurrency: 'INR',
    });
    const assertion = expect(selection).rejects.toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(12001);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('x'.repeat(65537))),
  );
  await expect(
    selectAssistantTool(input.question, [], { timezone: 'Asia/Kolkata', baseCurrency: 'INR' }),
  ).rejects.toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' });
});

it('stores only bounded feedback metadata, expires it and deletes only the owner reports', async () => {
  const first = await createUser();
  const second = await createUser('second@example.com');
  const report = { answerId: '11111111-1111-4111-8111-111111111111', reason: 'incorrect' };
  expect(
    (
      await call(
        'POST',
        'assistant/v3/feedback',
        { ...report, conversation: 'private text' },
        first.accessToken,
      )
    ).status,
  ).toBe(400);
  expect((await call('POST', 'assistant/v3/feedback', report, first.accessToken)).status).toBe(200);
  expect((await call('POST', 'assistant/v3/feedback', report, first.accessToken)).status).toBe(200);
  expect((await call('POST', 'assistant/v3/feedback', report, second.accessToken)).status).toBe(
    200,
  );
  const { db } = await database();
  const firstRecord = await db.collection('assistant_feedback').findOne({ userId: first.user.id });
  expect(Object.keys(firstRecord!).sort()).toEqual([
    '_id',
    'answerId',
    'createdAt',
    'expiresAt',
    'reason',
    'userId',
  ]);
  expect(Number(firstRecord!.expiresAt) - Number(firstRecord!.createdAt)).toBe(30 * 86400000);
  expect(await db.collection('assistant_feedback').countDocuments()).toBe(2);
  expect(
    (await db.collection('assistant_feedback').indexes()).some(
      (index) => index.expireAfterSeconds === 0,
    ),
  ).toBe(true);
  expect(
    (await call('DELETE', 'auth/account', { password, confirmation: 'DELETE' }, first.accessToken))
      .status,
  ).toBe(200);
  expect(await db.collection('assistant_feedback').countDocuments({ userId: first.user.id })).toBe(
    0,
  );
  expect(await db.collection('assistant_feedback').countDocuments({ userId: second.user.id })).toBe(
    1,
  );
});

it('remembers versioned AI consent for the authenticated account only', async () => {
  const first = await createUser();
  const second = await createUser('other@example.com');
  const state = async (token: string) =>
    data(await call('GET', 'assistant/v3/capabilities', undefined, token));
  expect(await state(first.accessToken)).toMatchObject({
    remembersConsent: true,
    consentAccepted: false,
  });
  expect(
    (await call('POST', 'assistant/v3/consent', { policyVersion: assistantPolicyVersion })).status,
  ).toBe(401);
  expect(
    (await call('POST', 'assistant/v3/consent', { policyVersion: 'old' }, first.accessToken))
      .status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        'assistant/v3/consent',
        { policyVersion: assistantPolicyVersion, userId: '99999999-9999-4999-8999-999999999999' },
        first.accessToken,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        'assistant/v3/consent',
        { policyVersion: assistantPolicyVersion },
        first.accessToken,
      )
    ).status,
  ).toBe(200);
  expect(await state(first.accessToken)).toMatchObject({ consentAccepted: true });
  expect(await state(second.accessToken)).toMatchObject({ consentAccepted: false });
});
