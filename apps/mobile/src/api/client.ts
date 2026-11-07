import { sessionTokensSchema, tokenSchema } from '@finora/contracts';
import { z, type ZodType } from 'zod';

export const storedTokensSchema = z.object({ accessToken: tokenSchema, refreshToken: tokenSchema });
export type StoredTokens = z.infer<typeof storedTokensSchema>;
export interface TokenStore {
  get(): Promise<StoredTokens | null>;
  set(tokens: StoredTokens): Promise<void>;
  clear(): Promise<void>;
}
export class ClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}
const errorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
interface RequestOptions {
  streamEvents?: boolean;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  operationKey?: string;
  signal?: AbortSignal;
}
export type HttpTransport = (url: string, options?: RequestInit) => Promise<Response>;

export class ApiClient {
  private refreshFlight: Promise<void> | null = null;
  private generation = 0;
  private storageQueue: Promise<void> = Promise.resolve();
  private baseUrl: string;
  // Android only runs a few requests per host at once; the rest wait in the transport. The
  // timeout must measure the server, not the queue, so requests start through this gate and
  // their timer begins only when they really go out.
  private active = 0;
  private waiting: (() => void)[] = [];
  private readonly maxActive = 4;
  private restartable = new Set<{ restart: () => void }>();

  private async acquire() {
    if (this.active < this.maxActive) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }
  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
  /** Abort reads that were in flight while the app was in the background; they are retried once. */
  restartReads() {
    for (const entry of [...this.restartable]) entry.restart();
  }
  /** Wake the server on app start so the first real request is not a cold start. Fire and forget. */
  warm() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    void this.transport(`${this.baseUrl}/api/health`, { signal: controller.signal })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  }

  constructor(
    baseUrl: string,
    private store: TokenStore,
    private onExpired: () => void,
    private transport: HttpTransport = fetch,
    allowHttp = false,
  ) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new ClientError(
        'CONFIGURATION',
        'Configure EXPO_PUBLIC_API_URL before starting Walleto.',
      );
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))
    )
      throw new ClientError('CONFIGURATION', 'The API URL must use HTTPS in release builds.');
    this.baseUrl = url.origin;
  }

  private writeStore(action: () => Promise<void>) {
    const operation = this.storageQueue.catch(() => undefined).then(action);
    this.storageQueue = operation;
    return operation;
  }
  async setSession(tokens: StoredTokens) {
    const parsed = storedTokensSchema.parse(tokens);
    const generation = ++this.generation;
    await this.writeStore(async () => {
      if (this.generation === generation) await this.store.set(parsed);
    });
  }
  async clearSession() {
    ++this.generation;
    try {
      await this.writeStore(() => this.store.clear());
    } finally {
      this.onExpired();
    }
  }

  private async send(path: string, options: RequestOptions, accessToken?: string) {
    if (path.startsWith('/') || path.includes('://') || path.includes('..'))
      throw new ClientError('INVALID_PATH', 'Invalid API path.');
    const gated = !options.streamEvents;
    if (gated) await this.acquire();
    const controller = new AbortController();
    let timedOut = false;
    let restarted = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      options.streamEvents ? 60000 : 30000,
    );
    const abort = () => controller.abort();
    const entry = {
      restart: () => {
        restarted = true;
        controller.abort();
      },
    };
    const isRead = (options.method ?? 'GET') === 'GET' && !options.streamEvents;
    if (isRead) this.restartable.add(entry);
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      let transport: HttpTransport = this.transport;
      let streamEvents = options.streamEvents;
      if (options.streamEvents && this.transport === fetch) {
        try {
          transport = (await import('expo/fetch')).fetch;
        } catch {
          streamEvents = false;
        }
      }
      return await transport(`${this.baseUrl}/api/v1/${path}`, {
        method: options.method ?? 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(streamEvents ? { Accept: 'application/x-ndjson' } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(options.operationKey ? { 'Idempotency-Key': options.operationKey } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      if (options.signal?.aborted) throw new ClientError('CANCELLED', 'Request cancelled.');
      if (restarted) throw new ClientError('NETWORK', 'The connection was interrupted.');
      throw new ClientError(
        timedOut ? 'TIMEOUT' : 'NETWORK',
        timedOut
          ? 'The server took too long. Please retry.'
          : 'Cannot reach Walleto. Check your connection and retry.',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      this.restartable.delete(entry);
      if (gated) this.release();
    }
  }
  private async decode<T>(response: Response, schema: ZodType<T>): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ClientError(
        'INVALID_RESPONSE',
        'The server returned an unreadable response. Please retry.',
        response.status,
      );
    }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(body);
      if (parsed.success)
        throw new ClientError(
          parsed.data.error.code,
          parsed.data.error.message,
          response.status,
          parsed.data.error.details,
        );
      throw new ClientError(
        'SERVER_ERROR',
        'The service is unavailable. Please retry.',
        response.status,
      );
    }
    const parsed = z.object({ success: z.literal(true), data: schema }).safeParse(body);
    if (!parsed.success)
      throw new ClientError(
        'INVALID_RESPONSE',
        'The server response could not be validated. Please retry.',
        response.status,
      );
    return parsed.data.data;
  }
  private async rotate(generation: number, failedAccessToken?: string) {
    await this.storageQueue;
    const tokens = await this.store.get();
    if (this.generation !== generation) throw new ClientError('CANCELLED', 'Session changed.');
    if (!tokens) throw new ClientError('UNAUTHORIZED', 'Please sign in again.', 401);
    // Another request may already have refreshed between the failed response and here.
    if (failedAccessToken && tokens.accessToken !== failedAccessToken) return;
    if (!this.refreshFlight) {
      this.refreshFlight = (async () => {
        const response = await this.send('auth/refresh', {
          method: 'POST',
          authenticated: false,
          body: { refreshToken: tokens.refreshToken },
        });
        if (this.generation !== generation) throw new ClientError('CANCELLED', 'Session changed.');
        if (response.status === 401) {
          await this.clearSession();
          throw new ClientError('UNAUTHORIZED', 'Your session expired. Please sign in again.', 401);
        }
        const next = await this.decode(response, sessionTokensSchema);
        await this.writeStore(async () => {
          if (this.generation === generation) await this.store.set(storedTokensSchema.parse(next));
        });
      })().finally(() => {
        this.refreshFlight = null;
      });
    }
    await this.refreshFlight;
  }
  private async authorizedResponse(path: string, options: RequestOptions): Promise<Response> {
    const generation = this.generation;
    const authenticated = options.authenticated !== false;
    await this.storageQueue;
    let tokens = authenticated ? await this.store.get() : null;
    if (authenticated && !tokens) throw new ClientError('UNAUTHORIZED', 'Please sign in.', 401);
    let response = await this.send(path, options, tokens?.accessToken);
    if (this.generation !== generation) throw new ClientError('CANCELLED', 'Session changed.');
    if (response.status === 401 && authenticated && (await this.isExpiredResponse(response))) {
      await this.rotate(generation, tokens?.accessToken);
      tokens = await this.store.get();
      if (this.generation !== generation || !tokens)
        throw new ClientError('CANCELLED', 'Session changed.');
      response = await this.send(path, options, tokens.accessToken);
      if (this.generation !== generation) throw new ClientError('CANCELLED', 'Session changed.');
      if (response.status === 401 && (await this.isExpiredResponse(response)))
        await this.clearSession();
    }
    return response;
  }
  private async isExpiredResponse(response: Response): Promise<boolean> {
    const parsed = errorSchema.safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    return parsed.success && parsed.data.error.code === 'UNAUTHORIZED';
  }
  async request<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
    const generation = this.generation;
    const read = (options.method ?? 'GET') === 'GET';
    const attempt = () => this.authorizedResponse(path, options);
    let response: Response;
    try {
      response = await attempt();
    } catch (failure) {
      // A read that timed out or lost its connection is safe to repeat once, silently.
      if (
        !read ||
        options.signal?.aborted ||
        !(failure instanceof ClientError) ||
        (failure.code !== 'TIMEOUT' && failure.code !== 'NETWORK')
      )
        throw failure;
      response = await attempt();
    }
    const value = await this.decode(response, schema);
    if (this.generation !== generation || options.signal?.aborted)
      throw new ClientError('CANCELLED', 'Session changed or request cancelled.');
    return value;
  }
  async stream<T, E>(
    path: string,
    schema: ZodType<T>,
    eventSchema: ZodType<E>,
    onEvent: (event: E) => T | undefined,
    options: RequestOptions = {},
  ): Promise<T> {
    const generation = this.generation;
    const response = await this.authorizedResponse(path, { ...options, streamEvents: true });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
      const value = await this.decode(response, schema);
      if (this.generation !== generation || options.signal?.aborted)
        throw new ClientError('CANCELLED', 'Request cancelled.');
      return value;
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ClientError('INVALID_RESPONSE', 'Unable to read the chat response.');
    const decoder = new TextDecoder();
    let buffer = '';
    let bytes = 0;
    let answer: T | undefined;
    const check = () => {
      if (this.generation !== generation || options.signal?.aborted)
        throw new ClientError('CANCELLED', 'Request cancelled.');
    };
    const consume = (line: string) => {
      if (!line.trim()) return;
      check();
      const result = onEvent(eventSchema.parse(JSON.parse(line)));
      if (result !== undefined) answer = schema.parse(result);
    };
    const timeout = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
    }, 60000);
    try {
      while (true) {
        check();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 1024 * 1024)
          throw new ClientError('INVALID_RESPONSE', 'Chat response is too large.');
        buffer += decoder.decode(value, { stream: true });
        let next;
        while ((next = buffer.indexOf('\n')) >= 0) {
          consume(buffer.slice(0, next));
          buffer = buffer.slice(next + 1);
        }
      }
      buffer += decoder.decode();
      consume(buffer);
      check();
      if (answer === undefined)
        throw new ClientError('INVALID_RESPONSE', 'The reply was interrupted. Please retry.');
      return answer;
    } finally {
      clearTimeout(timeout);
      await reader.cancel().catch(() => undefined);
    }
  }
  async download(path: string, options: RequestOptions = {}): Promise<string> {
    const generation = this.generation;
    const response = await this.authorizedResponse(path, options);
    if (!response.ok) await this.decode(response, z.never());
    const value = await response.text();
    if (this.generation !== generation || options.signal?.aborted)
      throw new ClientError('CANCELLED', 'Session changed or request cancelled.');
    if (new TextEncoder().encode(value).byteLength > 2 * 1024 * 1024)
      throw new ClientError(
        'EXPORT_LIMIT',
        'This export exceeds the supported 2 MiB limit. Use a smaller date range.',
      );
    return value;
  }
}
