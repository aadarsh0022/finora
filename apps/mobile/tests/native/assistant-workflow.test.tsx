import * as SecureStore from 'expo-secure-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { assistantPolicyVersion, userSchema, type AssistantToolResult } from '@finora/contracts';
import { answerText } from '../../src/features/assistant/result';
import { formatMoney } from '@finora/finance-core';
import { useNetworkState } from 'expo-network';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AssistantScreen from '../../src/features/assistant/chat';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));
jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('../../src/storage/hooks', () => ({
  usePendingTransactions: () => ({ data: [], isPending: false }),
}));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({ isConnected: true })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const timestamp = '2026-10-23T12:00:00.000Z';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: timestamp,
  updatedAt: timestamp,
});
const balanceReply = `Your recorded balance is ${formatMoney('900719925474099301', 'INR', 'en-IN')} across 0 accounts.`;
const answer = {
  answerId: '22222222-2222-4222-8222-222222222222',
  kind: 'answer',
  message: 'Here is your recorded balance.',
  result: {
    name: 'get_balance',
    source: 'server-recorded',
    readOnly: true,
    includesLocalPending: false,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    retrievedAt: timestamp,
    data: { totalBalanceMinor: '900719925474099301', includesArchived: true, accounts: [] },
  },
};
let requests: { path: string; body: Record<string, unknown> }[];
beforeEach(() => {
  requests = [];
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest
    .mocked(useNetworkState)
    .mockReturnValue({ isConnected: true } as ReturnType<typeof useNetworkState>);
});
async function mount(
  options: { enabled?: boolean; chat?: HttpTransport; remembered?: boolean } = {},
) {
  if (options.remembered)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(assistantPolicyVersion);
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async (url, init) => {
      const path = new URL(url).pathname.replace('/api/v1/', '');
      if (init?.body)
        requests.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      if (path === 'assistant/v3/chat' && options.chat) return options.chat(url, init);
      return Response.json({
        success: true,
        data:
          path === 'assistant/v3/capabilities'
            ? {
                enabled: options.enabled ?? true,
                provider: 'OpenAI',
                model: 'gpt-6-luna',
                readOnly: true,
                policyVersion: assistantPolicyVersion,
              }
            : path === 'assistant/v3/feedback'
              ? { message: 'Report received.' }
              : answer,
      });
    },
  );
  jest.mocked(useApp).mockReturnValue({ api, user } as ReturnType<typeof useApp>);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const content = () => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 800 },
        insets: { top: 24, bottom: 0, left: 0, right: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <AssistantScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
  const view = await render(content());
  if (options.remembered) await screen.findByLabelText('Your question');
  else
    await screen.findByText(
      options.enabled === false
        ? 'AI chat is not enabled yet'
        : 'Understand your money. Review every change.',
    );
  return { ...view, content, api };
}
async function allow() {
  await fireEvent.press(screen.getByRole('button', { name: 'Enable Finora AI' }));
  await screen.findByLabelText('Your question');
}
async function ask() {
  await fireEvent.changeText(screen.getByLabelText('Your question'), 'What is my current balance?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send question' }));
}

test('does not send questions before consent and honestly shows disabled configuration', async () => {
  await mount({ enabled: false });
  expect(screen.queryByLabelText('Your question')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable Finora AI' })).toBeNull();
  expect(requests).toHaveLength(0);
});

test('consents explicitly, sends only bounded question context and renders exact server money', async () => {
  await mount();
  expect(requests).toHaveLength(0);
  expect(screen.queryByLabelText('Your question')).toBeNull();
  await allow();
  await ask();
  await screen.findByText(balanceReply);
  expect(screen.queryByText('Includes archived accounts.')).toBeNull();
  expect(screen.queryByText('View accounts')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Show answer details' }));
  expect(screen.getByText(formatMoney('900719925474099301', 'INR', 'en-IN'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Hide answer details' }));
  expect(screen.queryByText('View accounts')).toBeNull();
  expect(requests).toEqual([
    {
      path: 'assistant/v3/chat',
      body: {
        question: 'What is my current balance?',
        previousQuestions: [],
        acceptedPolicyVersion: assistantPolicyVersion,
      },
    },
  ]);
  await fireEvent.press(screen.getByRole('button', { name: 'Clear chat' }));
  expect(screen.queryByText(balanceReply)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable Finora AI' })).toBeNull();
  expect(screen.getByLabelText('Your question')).toBeOnTheScreen();
});

test('preserves a failed question for manual retry and never queues or retries it automatically', async () => {
  const chat = jest
    .fn<ReturnType<HttpTransport>, Parameters<HttpTransport>>()
    .mockRejectedValue(new Error('Offline'));
  await mount({ chat });
  await allow();
  await ask();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send question' })).toBeEnabled());
  expect(screen.getByLabelText('Your question')).toHaveDisplayValue('What is my current balance?');
  expect(chat).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(balanceReply)).toBeNull();
  chat.mockResolvedValue(Response.json({ success: true, data: answer }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText(balanceReply);
  expect(requests[1]?.body.previousQuestions).toEqual([]);
});

test('clearing a pending request discards its late answer', async () => {
  let resolve!: (value: Response) => void;
  await mount({
    chat: async () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  });
  await allow();
  await ask();
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(screen.getByText('What is my current balance?')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-thinking')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Stop response' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear chat' }));
  await act(async () => {
    resolve(Response.json({ success: true, data: answer }));
  });
  expect(screen.queryByText(balanceReply)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enable Finora AI' })).toBeNull();
  expect(screen.getByLabelText('Your question')).toBeOnTheScreen();
});

test('stopping a response preserves the question and ignores a late reply', async () => {
  let resolve!: (value: Response) => void;
  await mount({
    chat: async () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  });
  await allow();
  await ask();
  await waitFor(() => expect(requests).toHaveLength(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Stop response' }));
  expect(screen.getByLabelText('Your question')).toHaveDisplayValue('What is my current balance?');
  expect(screen.queryByTestId('chat-thinking')).toBeNull();
  await act(async () => {
    resolve(Response.json({ success: true, data: answer }));
  });
  expect(screen.queryByText(balanceReply)).toBeNull();
  expect(screen.getByRole('button', { name: 'Send question' })).toBeEnabled();
});

test('reports an answer inside the app without attaching conversation text', async () => {
  await mount();
  await allow();
  await ask();
  await screen.findByText(balanceReply);
  await fireEvent.press(screen.getByRole('button', { name: 'Report this answer' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Unsafe or inappropriate' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
  await screen.findByText('Report received. Thank you.');
  expect(requests[1]).toEqual({
    path: 'assistant/v3/feedback',
    body: { answerId: answer.answerId, reason: 'unsafe' },
  });
});

test('a changed signed-in user sees neither the prior chat nor its consent', async () => {
  const view = await mount();
  await allow();
  await ask();
  await screen.findByText(balanceReply);
  jest.mocked(useApp).mockReturnValue({
    api: view.api,
    user: { ...user, id: '33333333-3333-4333-8333-333333333333' },
  } as ReturnType<typeof useApp>);
  await view.rerender(view.content());
  await screen.findByRole('button', { name: 'Enable Finora AI' });
  expect(screen.queryByText(balanceReply)).toBeNull();
  expect(screen.queryByLabelText('Your question')).toBeNull();
});

test('offline state disables sending without hiding the recorded snapshot', async () => {
  const view = await mount();
  await allow();
  await ask();
  await screen.findByText(balanceReply);
  jest
    .mocked(useNetworkState)
    .mockReturnValue({ isConnected: false } as ReturnType<typeof useNetworkState>);
  await view.rerender(view.content());
  await fireEvent.changeText(screen.getByLabelText('Your question'), 'And my debts?');
  expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
  expect(screen.getByText(balanceReply)).toBeOnTheScreen();
  expect(requests).toHaveLength(1);
});

test('dated answers work on Hermes without Intl formatRange', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'formatRange');
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'formatRange', {
    value: undefined,
    configurable: true,
  });
  try {
    const metadata = {
      source: 'server-recorded' as const,
      readOnly: true as const,
      includesLocalPending: false as const,
      currency: 'INR' as const,
      timezone: 'Asia/Kolkata',
      retrievedAt: timestamp,
    };
    const cases: AssistantToolResult[] = [
      {
        ...metadata,
        name: 'get_cashflow',
        data: {
          from: '2026-10-01',
          to: '2026-10-24',
          incomeMinor: '100000',
          expensesMinor: '568000',
          netMinor: '-468000',
        },
      },
      {
        ...metadata,
        name: 'get_category_spending',
        data: {
          from: '2026-09-30',
          to: '2026-10-24',
          totalExpensesMinor: '568000',
          categories: [],
        },
      },
    ];
    for (const result of cases) {
      const text = answerText(result);
      expect(text).toContain('24 Oct 2026');
      expect(text).toContain(formatMoney('568000', 'INR', 'en-IN'));
      expect(text).not.toContain('2026-10-24');
    }
  } finally {
    if (descriptor) Object.defineProperty(Intl.DateTimeFormat.prototype, 'formatRange', descriptor);
    else Reflect.deleteProperty(Intl.DateTimeFormat.prototype, 'formatRange');
  }
});

test('remembers accepted privacy notice after reopening without sending a question', async () => {
  await mount({ remembered: true });
  expect(screen.queryByRole('button', { name: 'Enable Finora AI' })).toBeNull();
  expect(screen.getByLabelText('Your question')).toBeOnTheScreen();
  expect(requests).toHaveLength(0);
});
