import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionTokensSchema } from '@finora/contracts';
import type { ReactNode } from 'react';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { AuthForm } from '../../src/features/auth/auth-form';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({ isConnected: true })) }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: ReactNode }) => children }));

const tokens = sessionTokensSchema.parse({
  accessToken: 'a'.repeat(43),
  refreshToken: 'b'.repeat(43),
  expiresIn: 900,
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Tester',
    email: 'tester@example.com',
    preferences: { baseCurrency: 'USD' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
});
const acceptSession = jest.fn(async () => undefined);
let calls: { path: string; body: unknown }[];
let rejectLoginOnce: boolean;

beforeEach(() => {
  calls = [];
  rejectLoginOnce = false;
});

async function mount(mode: 'login' | 'register') {
  const transport: HttpTransport = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: JSON.parse(String(options?.body)) as unknown });
    if (rejectLoginOnce) {
      rejectLoginOnce = false;
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
        },
        { status: 401 },
      );
    }
    return Response.json({ success: true, data: tokens });
  };
  const api = new ApiClient(
    'https://native.test',
    { get: async () => null, set: async () => undefined, clear: async () => undefined },
    () => undefined,
    transport,
  );
  jest.mocked(useApp).mockReturnValue({
    api,
    user: null,
    phase: 'ready',
    error: '',
    acceptSession,
    restore: async () => undefined,
    clearSession: async () => undefined,
    refreshUser: async () => undefined,
  });
  await render(<AuthForm mode={mode} />);
}

test('validates registration before sending and passes the chosen base currency to the real client', async () => {
  await mount('register');
  await fireEvent.changeText(screen.getByLabelText('Your name'), 'Tester');
  await fireEvent.changeText(screen.getByLabelText('Email address'), ' TESTER@EXAMPLE.COM ');
  await fireEvent.changeText(screen.getByLabelText('Password · at least 12 characters'), 'weak');
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Use at least 12 characters');
  expect(calls).toHaveLength(0);
  expect(acceptSession).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText('Password · at least 12 characters'),
    'synthetic-test-password',
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'USD' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(acceptSession).toHaveBeenCalledWith(tokens));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    path: '/api/v1/auth/register',
    body: {
      email: 'tester@example.com',
      name: 'Tester',
      preferences: { baseCurrency: 'USD' },
      deviceName: 'Finora Android',
    },
  });
  expect(calls[0]?.body).not.toHaveProperty('userId');
});

test('shows rejected credentials and allows a successful retry without accepting a failed session', async () => {
  await mount('login');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'tester@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'synthetic-test-password');
  rejectLoginOnce = true;
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  expect(acceptSession).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(acceptSession).toHaveBeenCalledTimes(1));
  expect(calls.map((call) => call.path)).toEqual(['/api/v1/auth/login', '/api/v1/auth/login']);
});
