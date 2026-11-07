import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { assistantChangeSchema, userSchema } from '@finora/contracts';
import { ApiClient } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
import { ChangeConversation } from '../../src/features/assistant/change-conversation';
jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const user = userSchema.parse({
  id,
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z',
});
const initial = assistantChangeSchema.parse({
  id,
  input: {
    operation: 'create_goal',
    record: null,
    parent: null,
    values: [{ field: 'name', value: 'Trip' }],
  },
  title: 'Create savings goal',
  impact: 'Creates this goal after confirmation.',
  rows: [{ label: 'Name', value: 'Trip' }],
  questions: [{ key: 'target', label: 'Savings target', options: [] }],
  token: null,
  requiresConfirmation: true,
});
test('asks for missing information inline and writes only after explicit confirmation', async () => {
  const requests: { path: string; body: unknown }[] = [];
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async (url, init) => {
      const path = new URL(url).pathname;
      requests.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json({
        success: true,
        data: path.endsWith('/prepare')
          ? {
              ...initial,
              questions: [],
              token: 'signed-test-review-token',
              rows: [{ label: 'Target', value: 'INR 100.00' }],
            }
          : { id, message: 'Saved.' },
      });
    },
  );
  jest
    .mocked(useApp)
    .mockReturnValue({ api, user, refreshUser: async () => undefined } as ReturnType<
      typeof useApp
    >);
  const client = new QueryClient();
  await render(
    <QueryClientProvider client={client}>
      <ChangeConversation change={initial} register={() => () => undefined} />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  expect(requests).toHaveLength(0);
  await fireEvent.changeText(screen.getByLabelText('Savings target'), '100');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Confirm' });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.path).toContain('/prepare');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByText(/^Added savings goal/)).toBeVisible());
  expect(requests).toHaveLength(2);
  expect(requests[1]?.body).toEqual({ token: 'signed-test-review-token', confirmed: true });
});
test('cancelling an incomplete review makes no requests', async () => {
  const request = jest.fn();
  jest
    .mocked(useApp)
    .mockReturnValue({ api: { request }, user } as unknown as ReturnType<typeof useApp>);
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ChangeConversation change={initial} register={() => () => undefined} />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Okay, nothing was changed.')).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});
