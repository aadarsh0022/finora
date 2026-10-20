import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ApiClient,
  ClientError,
  type StoredTokens,
  type TokenStore,
  type HttpTransport,
} from '../src/api/client';
import { preferencesSchema } from '@finora/contracts';

const initial: StoredTokens = { accessToken: 'a'.repeat(43), refreshToken: 'r'.repeat(43) };
const next: StoredTokens = { accessToken: 'b'.repeat(43), refreshToken: 's'.repeat(43) };
function memoryStore() {
  let value: StoredTokens | null = initial;
  const store: TokenStore = {
    get: async () => value,
    set: async (tokens) => {
      value = tokens;
    },
    clear: async () => {
      value = null;
    },
  };
  return store;
}
const unauthorized = () =>
  Response.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in again.' } },
    { status: 401 },
  );
function refreshed() {
  return Response.json({
    success: true,
    data: {
      ...next,
      expiresIn: 900,
      user: {
        id: '8614a6cf-9001-4890-9547-82c1bd43797c',
        email: 'user@example.com',
        name: 'User',
        preferences: preferencesSchema.parse({}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

describe('mobile API client security', () => {
  it('keeps the session when a sensitive form rejects the current password', async () => {
    const store = memoryStore();
    const expired = vi.fn();
    const transport = vi.fn<HttpTransport>(async () =>
      Response.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Password is incorrect.' },
        },
        { status: 401 },
      ),
    );
    const client = new ApiClient('https://finora.test', store, expired, transport);
    await expect(
      client.request('auth/change-password', z.unknown(), { method: 'POST', body: {} }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
    expect(await store.get()).toEqual(initial);
  });
  it('serializes refresh for concurrent requests and retries only after unauthorized', async () => {
    let refreshCount = 0;
    const transport = vi.fn<HttpTransport>(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCount++;
        return refreshed();
      }
      return new Headers(options?.headers).get('Authorization') === `Bearer ${next.accessToken}`
        ? Response.json({ success: true, data: { value: 42 } })
        : unauthorized();
    });
    const client = new ApiClient('https://finora.test', memoryStore(), () => undefined, transport);
    const values = await Promise.all([
      client.request('auth/me', z.object({ value: z.number() })),
      client.request('auth/me', z.object({ value: z.number() })),
    ]);
    expect(values).toEqual([{ value: 42 }, { value: 42 }]);
    expect(refreshCount).toBe(1);
  });
  it('never automatically retries a mutation on network failure and preserves its operation key', async () => {
    const transport = vi.fn<HttpTransport>(async (_url, options) => {
      expect(new Headers(options?.headers).get('Idempotency-Key')).toBe('stable-operation');
      throw new TypeError('Network unavailable');
    });
    const store = memoryStore();
    const client = new ApiClient('https://finora.test', store, () => undefined, transport);
    await expect(
      client.request('transactions', z.unknown(), {
        method: 'POST',
        operationKey: 'stable-operation',
        body: {},
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await store.get()).toEqual(initial);
  });
  it('clears credentials and signals expiry when refresh is rejected', async () => {
    const store = memoryStore();
    const expired = vi.fn();
    const client = new ApiClient('https://finora.test', store, expired, async () => unauthorized());
    await expect(client.request('auth/me', z.unknown())).rejects.toMatchObject({ status: 401 });
    expect(await store.get()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
  });
  it('prevents an in-flight refresh from restoring credentials after logout', async () => {
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const store = memoryStore();
    const client = new ApiClient(
      'https://finora.test',
      store,
      () => undefined,
      async (url) => {
        if (String(url).endsWith('/auth/refresh')) {
          started();
          await gate;
          return refreshed();
        }
        return unauthorized();
      },
    );
    const pending = client.request('auth/me', z.unknown()).catch((error: unknown) => error);
    await ready;
    await client.clearSession();
    release();
    expect(await pending).toBeInstanceOf(ClientError);
    expect(await store.get()).toBeNull();
  });
  it('maps server validation fields and rejects insecure release origins', async () => {
    expect(() => new ApiClient('http://finora.test', memoryStore(), () => undefined)).toThrow();
    const client = new ApiClient(
      'https://finora.test',
      memoryStore(),
      () => undefined,
      async () =>
        Response.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Check fields',
              details: { amountMinor: ['Must be positive'] },
            },
          },
          { status: 400 },
        ),
    );
    await expect(client.request('transactions', z.unknown())).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { amountMinor: ['Must be positive'] },
    });
  });
});
