import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { assistantPolicyVersion, userSchema } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { useNetworkState } from 'expo-network';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AssistantScreen from '../../src/features/assistant/chat';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';

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
  jest
    .mocked(useNetworkState)
    .mockReturnValue({ isConnected: true } as ReturnType<typeof useNetworkState>);
});
async function mount(options: { enabled?: boolean; chat?: HttpTransport } = {}) {
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
      if (path === 'assistant/chat' && options.chat) return options.chat(url, init);
      return Response.json({
        success: true,
        data:
          path === 'assistant/capabilities'
            ? {
                enabled: options.enabled ?? true,
                provider: 'OpenAI',
                model: 'gpt-6-luna',
                readOnly: true,
                policyVersion: assistantPolicyVersion,
              }
            : path === 'assistant/feedback'
              ? { message: 'Report received.' }
              : answer,
      });
    },
  );
  jest.mocked(useApp).mockReturnValue({ api, user } as ReturnType<typeof useApp>);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
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
  await screen.findByText(
    options.enabled === false
      ? 'AI chat is not enabled yet'
      : 'Understand your money. Review every change.',
  );
  return { ...view, content, api };
}
async function allow() {
  await fireEvent.press(screen.getByRole('button', { name: 'Allow AI for this chat' }));
}
async function ask() {
  await fireEvent.changeText(screen.getByLabelText('Your question'), 'What is my current balance?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send question' }));
}

test('does not send questions before consent and honestly shows disabled configuration', async () => {
  await mount({ enabled: false });
  expect(screen.queryByLabelText('Your question')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Allow AI for this chat' })).toBeNull();
  expect(requests).toHaveLength(0);
});

test('consents explicitly, sends only bounded question context and renders exact server money', async () => {
  await mount();
  expect(requests).toHaveLength(0);
  expect(screen.queryByLabelText('Your question')).toBeNull();
  await allow();
  await ask();
  await screen.findByText('Here is your recorded balance.');
  expect(screen.getByText(formatMoney('900719925474099301', 'INR', 'en-IN'))).toBeOnTheScreen();
  expect(requests).toEqual([
    {
      path: 'assistant/chat',
      body: {
        question: 'What is my current balance?',
        previousQuestions: [],
        acceptedPolicyVersion: assistantPolicyVersion,
      },
    },
  ]);
  await fireEvent.press(screen.getByRole('button', { name: 'Clear chat' }));
  expect(screen.queryByText('Here is your recorded balance.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Allow AI for this chat' })).toBeOnTheScreen();
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
  expect(screen.queryByText('Here is your recorded balance.')).toBeNull();
  chat.mockResolvedValue(Response.json({ success: true, data: answer }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Here is your recorded balance.');
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
  expect(screen.queryByText('Here is your recorded balance.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Allow AI for this chat' })).toBeOnTheScreen();
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
  expect(screen.queryByText('Here is your recorded balance.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Send question' })).toBeEnabled();
});

test('reports an answer inside the app without attaching conversation text', async () => {
  await mount();
  await allow();
  await ask();
  await screen.findByText('Here is your recorded balance.');
  await fireEvent.press(screen.getByRole('button', { name: 'Report this answer' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Unsafe or inappropriate' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
  await screen.findByText('Report received. Thank you.');
  expect(requests[1]).toEqual({
    path: 'assistant/feedback',
    body: { answerId: answer.answerId, reason: 'unsafe' },
  });
});

test('a changed signed-in user sees neither the prior chat nor its consent', async () => {
  const view = await mount();
  await allow();
  await ask();
  await screen.findByText('Here is your recorded balance.');
  jest.mocked(useApp).mockReturnValue({
    api: view.api,
    user: { ...user, id: '33333333-3333-4333-8333-333333333333' },
  } as ReturnType<typeof useApp>);
  await view.rerender(view.content());
  await screen.findByRole('button', { name: 'Allow AI for this chat' });
  expect(screen.queryByText('Here is your recorded balance.')).toBeNull();
  expect(screen.queryByLabelText('Your question')).toBeNull();
});

test('offline state disables sending without hiding the recorded snapshot', async () => {
  const view = await mount();
  await allow();
  await ask();
  await screen.findByText('Here is your recorded balance.');
  jest
    .mocked(useNetworkState)
    .mockReturnValue({ isConnected: false } as ReturnType<typeof useNetworkState>);
  await view.rerender(view.content());
  await fireEvent.changeText(screen.getByLabelText('Your question'), 'And my debts?');
  expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
  expect(screen.getByText('Here is your recorded balance.')).toBeOnTheScreen();
  expect(requests).toHaveLength(1);
});
